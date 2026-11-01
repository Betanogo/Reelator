import { Compositor, LayerInput, hexToRgb } from './compositor'
import { MediaPool, desiredSourceTime, layerFor, waitForEvent } from './media'
import { TRANSITION_MAP, ease } from './transitions'
import { computeLayout, frameAt, ClipLayout } from '../model/timeline'
import { Project, frameSize } from '../model/types'
import type { ExportAudioInput } from '../../shared/types'

export interface ExportSettings {
  outPath: string
  shortSide: number
  fps: number
  quality: 'high' | 'medium' | 'small'
}

export interface ExportProgress {
  frame: number
  total: number
  fps: number // render speed
  eta: number // seconds
}

export function buildAudioInputs(p: Project): ExportAudioInput[] {
  const layout = computeLayout(p)
  const byId = new Map(p.media.map((m) => [m.id, m]))
  const out: ExportAudioInput[] = []
  for (const l of layout.items) {
    const m = byId.get(l.clip.mediaId)
    if (!m || m.kind !== 'video' || !m.hasAudio || l.clip.muted || l.clip.volume <= 0) continue
    out.push({ path: m.path, sourceIn: l.clip.in, duration: l.duration, timelineStart: l.start,
      volume: l.clip.volume, fadeIn: l.transIn, fadeOut: l.transOut })
  }
  for (const a of p.audio) {
    const m = byId.get(a.mediaId)
    if (!m || a.volume <= 0) continue
    out.push({ path: m.path, sourceIn: a.in, duration: a.out - a.in, timelineStart: a.start,
      volume: a.volume, fadeIn: a.fadeIn, fadeOut: a.fadeOut })
  }
  return out
}

async function seekExact(v: HTMLVideoElement, time: number): Promise<void> {
  if (v.readyState < 2) await waitForEvent(v, 'loadeddata', 15000)
  if (Math.abs(v.currentTime - time) < 0.0005 && !v.seeking) return
  const p = waitForEvent(v, 'seeked', 8000)
  v.currentTime = time
  await p
}

export async function exportProject(
  project: Project,
  s: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  isCancelled: () => boolean
): Promise<'done' | 'cancelled'> {
  const layout = computeLayout(project)
  const total = layout.total
  if (total <= 0) throw new Error('타임라인이 비어 있어요')
  const [w, h] = frameSize(project.settings.aspect, s.shortSide)
  const fps = s.fps
  const frames = Math.max(1, Math.round(total * fps))

  const canvas = document.createElement('canvas')
  const comp = new Compositor(canvas, w, h)
  const pool = new MediaPool(true)
  const byId = new Map(project.media.map((m) => [m.id, m]))
  const bg = hexToRgb(project.settings.background)
  const buf = new Uint8Array(w * h * 4)

  await window.reelator.exportStart({
    outPath: s.outPath, width: w, height: h, fps, duration: frames / fps,
    quality: s.quality, audio: buildAudioInputs(project)
  })

  const started = performance.now()
  try {
    for (let n = 0; n < frames; n++) {
      if (isCancelled()) {
        await window.reelator.exportCancel()
        return 'cancelled'
      }
      const t = Math.min(n / fps, total - 1e-4)
      const f = frameAt(layout, t)
      const prep = async (l: ClipLayout | null): Promise<LayerInput | null> => {
        if (!l) return null
        const m = byId.get(l.clip.mediaId)
        if (!m) return null
        if (m.kind === 'video') await seekExact(pool.video(l.clip.id, m.path), desiredSourceTime(l, t))
        else {
          const img = pool.image(m.path)
          if (!img.complete) await img.decode().catch(() => {})
        }
        const layer = layerFor(l, m, pool)
        if (layer) layer.ready = true
        return layer
      }
      const a = await prep(f.a)
      const b = await prep(f.b)
      const def = f.b && f.a?.clip.transitionOut ? TRANSITION_MAP.get(f.a.clip.transitionOut.type) ?? null : null
      comp.render({ a, b, transition: b ? def : null, progress: def ? ease(def.ease, f.progress) : 0, background: bg, time: t })
      comp.readPixels(buf)
      await window.reelator.exportFrame(buf)

      if (n % 3 === 0 || n === frames - 1) {
        const elapsed = (performance.now() - started) / 1000
        const speed = (n + 1) / Math.max(elapsed, 1e-3)
        onProgress({ frame: n + 1, total: frames, fps: speed, eta: (frames - n - 1) / speed })
      }
    }
    await window.reelator.exportFinish()
    return 'done'
  } catch (e) {
    await window.reelator.exportCancel().catch(() => {})
    throw e
  } finally {
    pool.dispose()
    comp.dispose()
  }
}
