import { Compositor, LayerInput, hexToRgb } from './compositor'
import { MediaPool, desiredSourceTime, layerFor } from './media'
import { TRANSITION_MAP, ease } from './transitions'
import { useEditor } from '../model/store'
import { ClipLayout, Layout, computeLayout, frameAt } from '../model/timeline'
import { MediaItem, Project, frameSize } from '../model/types'

const RESYNC = 0.3 // seconds of drift tolerated while playing
const SCRUB_IDLE_MS = 180 // playhead untouched this long → scrubbing has stopped

export interface ScrubFrame {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ts: number // source timestamp of the frame
}

/**
 * Optional fast frame source used while the user drags the timeline. <video> seeking is
 * slow on phones (long keyframe intervals), so a platform can decode frames with WebCodecs
 * instead and hand back the latest one.
 */
export interface ScrubProvider {
  /** Ask for the frame of `clipId` at source time `t` (only the latest request matters). */
  want(clipId: string, mediaPath: string, t: number): void
  /** Latest decoded frame for the clip, if any. */
  get(clipId: string): ScrubFrame | null
  /** Free decoders of clips not in `keep`. */
  release(keep: Set<string>): void
  /** Called with a callback to run whenever a new frame is ready. */
  onFrame(cb: () => void): void
}

/**
 * Drives the preview canvas: a rAF loop that advances the playhead while playing,
 * keeps every <video>/<audio> element in step with the timeline and renders the frame.
 */
export class PreviewEngine {
  /** Short side of the preview render target (mobile uses less). */
  static shortSide = 720
  /** Platform scrub decoder (set by the phone app). */
  static scrub: ScrubProvider | null = null

  private comp: Compositor
  private pool: MediaPool
  private raf = 0
  private layout: Layout | null = null
  private layoutFor: Project | null = null
  private mediaById = new Map<string, MediaItem>()
  private clockOrigin = 0
  private clockStart = 0
  private lastPlayhead = -1
  private wasPlaying = false
  private dirty = true
  private lastDrawnT = -1
  private lastScrubAt = -1e9

  constructor(canvas: HTMLCanvasElement) {
    const p = useEditor.getState().project
    const [w, h] = frameSize(p.settings.aspect, PreviewEngine.shortSide)
    this.comp = new Compositor(canvas, w, h)
    this.pool = new MediaPool(false, () => { this.dirty = true })
    PreviewEngine.scrub?.onFrame(() => { this.dirty = true })
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.pool.dispose()
    PreviewEngine.scrub?.release(new Set())
    this.comp.dispose()
  }

  private ensureLayout(p: Project): Layout {
    if (this.layoutFor !== p || !this.layout) {
      this.layout = computeLayout(p)
      this.layoutFor = p
      this.mediaById = new Map(p.media.map((m) => [m.id, m]))
      const [w, h] = frameSize(p.settings.aspect, PreviewEngine.shortSide)
      this.comp.resize(w, h)
      const keep = new Set<string>([...p.clips.map((c) => c.id), ...p.audio.map((a) => a.id)])
      for (const k of this.pool.prune(keep)) this.comp.release(`vid:${k}`)
      PreviewEngine.scrub?.release(keep)
      this.dirty = true
    }
    return this.layout
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const st = useEditor.getState()
    const p = st.project
    const layout = this.ensureLayout(p)

    let t = st.playhead
    if (st.playing) {
      if (!this.wasPlaying || Math.abs(st.playhead - this.lastPlayhead) > 1e-6) {
        // started, or the user moved the playhead while playing → re-anchor the clock
        if (st.playhead >= layout.total - 0.01) t = 0
        this.clockOrigin = now
        this.clockStart = t
      }
      t = this.clockStart + (now - this.clockOrigin) / 1000
      if (t >= layout.total) {
        t = layout.total
        useEditor.setState({ playing: false })
      }
      this.lastPlayhead = t
      useEditor.setState({ playhead: t })
    } else if (t !== this.lastDrawnT) {
      this.lastScrubAt = now
    }
    const playing = st.playing && t < layout.total
    this.wasPlaying = playing
    const scrubbing = !playing && now - this.lastScrubAt < SCRUB_IDLE_MS

    this.syncMedia(layout, p, t, playing, scrubbing)

    // While paused, only redraw when something changed (saves battery and GPU time).
    const pending = !playing && this.anyVideoSeeking(layout, t)
    if (playing || this.dirty || t !== this.lastDrawnT || pending) {
      this.dirty = false
      this.lastDrawnT = t
      this.draw(layout, p, t, now, playing)
    }
  }

  private anyVideoSeeking(layout: Layout, t: number): boolean {
    const f = frameAt(layout, t)
    for (const l of [f.a, f.b]) {
      if (!l) continue
      const m = this.mediaById.get(l.clip.mediaId)
      if (m?.kind === 'video' && this.pool.video(l.clip.id, m.path).seeking) return true
    }
    return false
  }

  private syncMedia(layout: Layout, p: Project, t: number, playing: boolean, scrubbing: boolean): void {
    const frame = frameAt(layout, t)
    const fps = p.settings.fps
    const scrub = PreviewEngine.scrub
    for (const l of layout.items) {
      const m = this.mediaById.get(l.clip.mediaId)
      if (!m || m.kind !== 'video') continue
      const v = this.pool.video(l.clip.id, m.path)
      const active = frame.a === l || frame.b === l
      if (active) {
        const want = desiredSourceTime(l, t)
        // crossfade audio through transitions
        let gain = l.clip.muted ? 0 : l.clip.volume
        if (l.transIn > 0 && t < l.start + l.transIn) gain *= (t - l.start) / l.transIn
        if (l.transOut > 0 && t > l.end - l.transOut) gain *= (l.end - t) / l.transOut
        v.volume = Math.max(0, Math.min(1, gain))
        if (playing) {
          if (v.paused) {
            if (Math.abs(v.currentTime - want) > 0.05) v.currentTime = want
            v.play().catch(() => {})
          } else if (Math.abs(v.currentTime - want) > RESYNC) {
            v.currentTime = want
          }
        } else {
          if (!v.paused) v.pause()
          const elementBehind = v.seeking || v.readyState < 2 || Math.abs(v.currentTime - want) > 1 / fps
          if (scrub && (scrubbing || elementBehind)) scrub.want(l.clip.id, m.path, want)
          // While the finger is moving, leave the hardware decoder to the scrub source;
          // once it stops, seek the element to the exact frame.
          const elementSeeks = !scrub || !scrubbing
          if (elementSeeks && !v.seeking && Math.abs(v.currentTime - want) > 0.5 / fps) v.currentTime = want
        }
      } else {
        if (!v.paused) v.pause()
        // pre-roll the next clips so they start instantly
        if (!scrubbing && t > l.start - 2 && t < l.start && !v.seeking && Math.abs(v.currentTime - l.clip.in) > 0.05) {
          v.currentTime = l.clip.in
        }
      }
    }

    for (const a of p.audio) {
      const m = this.mediaById.get(a.mediaId)
      if (!m) continue
      const el = this.pool.audio(a.id, m.path)
      const dur = a.out - a.in
      const local = t - a.start
      if (local >= 0 && local < dur) {
        const want = a.in + local
        let gain = a.volume
        if (a.fadeIn > 0 && local < a.fadeIn) gain *= local / a.fadeIn
        if (a.fadeOut > 0 && local > dur - a.fadeOut) gain *= (dur - local) / a.fadeOut
        el.volume = Math.max(0, Math.min(1, gain))
        if (playing) {
          if (el.paused) { el.currentTime = want; el.play().catch(() => {}) }
          else if (Math.abs(el.currentTime - want) > RESYNC) el.currentTime = want
        } else if (!el.paused) el.pause()
      } else if (!el.paused) el.pause()
    }
  }

  /** Element frame if it's on the wanted time, otherwise the latest scrub frame. */
  private layer(l: ClipLayout | null, t: number, playing: boolean, fps: number): LayerInput | null {
    if (!l) return null
    const m = this.mediaById.get(l.clip.mediaId)
    const base = layerFor(l, m, this.pool)
    const scrub = PreviewEngine.scrub
    if (!base || playing || !scrub || m?.kind !== 'video') return base
    const v = this.pool.video(l.clip.id, m.path)
    const want = desiredSourceTime(l, t)
    const elementOk = v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - want) <= 1 / fps
    if (elementOk) return base
    const f = scrub.get(l.clip.id)
    if (!f) return base
    return { ...base, key: `scrub:${l.clip.id}`, source: f.canvas as TexImageSource, srcW: f.canvas.width, srcH: f.canvas.height, ready: true }
  }

  private draw(layout: Layout, p: Project, t: number, now: number, playing: boolean): void {
    const frame = frameAt(layout, t)
    const bg = hexToRgb(p.settings.background)
    const fps = p.settings.fps
    const a = this.layer(frame.a, t, playing, fps)
    const b = this.layer(frame.b, t, playing, fps)
    const def = frame.b && frame.a?.clip.transitionOut ? TRANSITION_MAP.get(frame.a.clip.transitionOut.type) ?? null : null
    this.comp.render({
      a, b,
      transition: b ? def : null,
      progress: def ? ease(def.ease, frame.progress) : 0,
      background: bg,
      time: playing ? now / 1000 : 0
    })
  }
}
