import { Compositor, LayerInput, hexToRgb } from './compositor'
import { MediaPool, desiredSourceTime, layerFor } from './media'
import { TRANSITION_MAP, ease } from './transitions'
import { useEditor } from '../model/store'
import { Layout, computeLayout, frameAt } from '../model/timeline'
import { MediaItem, Project, frameSize } from '../model/types'

const PREVIEW_SHORT_SIDE = 720
const RESYNC = 0.3 // seconds of drift tolerated while playing

/**
 * Drives the preview canvas: a rAF loop that advances the playhead while playing,
 * keeps every <video>/<audio> element in step with the timeline and renders the frame.
 */
export class PreviewEngine {
  private comp: Compositor
  private pool = new MediaPool(false)
  private raf = 0
  private layout: Layout | null = null
  private layoutFor: Project | null = null
  private mediaById = new Map<string, MediaItem>()
  private clockOrigin = 0
  private clockStart = 0
  private lastPlayhead = -1
  private wasPlaying = false

  constructor(canvas: HTMLCanvasElement) {
    const p = useEditor.getState().project
    const [w, h] = frameSize(p.settings.aspect, PREVIEW_SHORT_SIDE)
    this.comp = new Compositor(canvas, w, h)
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.pool.dispose()
    this.comp.dispose()
  }

  private ensureLayout(p: Project): Layout {
    if (this.layoutFor !== p || !this.layout) {
      this.layout = computeLayout(p)
      this.layoutFor = p
      this.mediaById = new Map(p.media.map((m) => [m.id, m]))
      const [w, h] = frameSize(p.settings.aspect, PREVIEW_SHORT_SIDE)
      this.comp.resize(w, h)
      const keep = new Set<string>([...p.clips.map((c) => c.id), ...p.audio.map((a) => a.id)])
      for (const k of this.pool.prune(keep)) this.comp.release(`vid:${k}`)
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
    }
    this.wasPlaying = st.playing && t < layout.total

    this.syncMedia(layout, p, t, st.playing && t < layout.total)
    this.draw(layout, p, t, now)
  }

  private syncMedia(layout: Layout, p: Project, t: number, playing: boolean): void {
    const frame = frameAt(layout, t)
    const fps = p.settings.fps
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
          if (!v.seeking && Math.abs(v.currentTime - want) > 0.5 / fps) v.currentTime = want
        }
      } else {
        if (!v.paused) v.pause()
        // pre-roll the next clips so they start instantly
        if (t > l.start - 2 && t < l.start && !v.seeking && Math.abs(v.currentTime - l.clip.in) > 0.05) {
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

  private draw(layout: Layout, p: Project, t: number, now: number): void {
    const frame = frameAt(layout, t)
    const bg = hexToRgb(p.settings.background)
    const mk = (l: typeof frame.a): LayerInput | null => (l ? layerFor(l, this.mediaById.get(l.clip.mediaId), this.pool) : null)
    const a = mk(frame.a)
    const b = mk(frame.b)
    const def = frame.b && frame.a?.clip.transitionOut ? TRANSITION_MAP.get(frame.a.clip.transitionOut.type) ?? null : null
    this.comp.render({
      a, b,
      transition: b ? def : null,
      progress: def ? ease(def.ease, frame.progress) : 0,
      background: bg,
      time: now / 1000
    })
  }
}
