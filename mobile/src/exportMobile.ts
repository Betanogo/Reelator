// On-device export: WebGL compositor → WebCodecs encoder (via Mediabunny) → MP4 in OPFS.
// Video frames are decoded sequentially per clip (no seeking), so it's fast on phones.

import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, CanvasSink, CanvasSource, Input, Mp4OutputFormat,
  Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, StreamTarget, WrappedCanvas,
  getFirstEncodableAudioCodec, getFirstEncodableVideoCodec
} from 'mediabunny'
import { Compositor, LayerInput, hexToRgb } from '@shared/engine/compositor'
import { resolveFilter } from '@shared/engine/filters'
import { TRANSITION_MAP, ease } from '@shared/engine/transitions'
import { ClipLayout, computeLayout, frameAt } from '@shared/model/timeline'
import { MediaItem, Project, frameSize } from '@shared/model/types'
import { mediaFile } from './platform'
import { dir, removeIn } from './storage'

export interface MobileExportSettings {
  shortSide: number
  fps: number
  quality: 'high' | 'medium' | 'small'
}

export interface MobileExportProgress {
  stage: 'audio' | 'video' | 'finishing'
  frame: number
  total: number
  eta: number
}

export interface MobileExportResult {
  file: File
  name: string
}

const SR = 48000

/** Walks one clip's frames forward in time; keeps the frame shown at time t. */
class FrameCursor {
  private iter: AsyncGenerator<WrappedCanvas, void, unknown> | null = null
  private cur: WrappedCanvas | null = null
  private peek: WrappedCanvas | null = null
  private ended = false

  constructor(private sink: CanvasSink, private from: number, private to: number) {}

  private async advance(): Promise<WrappedCanvas | null> {
    if (this.ended || !this.iter) return null
    const r = await this.iter.next()
    if (r.done) { this.ended = true; return null }
    return r.value
  }

  async at(t: number): Promise<WrappedCanvas | null> {
    if (!this.iter) {
      this.iter = this.sink.canvases(Math.max(0, this.from), this.to + 0.5)
      this.peek = await this.advance()
    }
    while (this.peek && this.peek.timestamp <= t + 0.0005) {
      this.cur = this.peek
      this.peek = await this.advance()
    }
    return this.cur ?? this.peek
  }

  async close() {
    try { await this.iter?.return(undefined) } catch { /* ignore */ }
  }
}

function fitWithin(w: number, h: number, maxW: number, maxH: number): [number, number] {
  const s = Math.min(1, maxW / w, maxH / h)
  return [Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s))]
}

async function mixAudio(p: Project, total: number, isCancelled: () => boolean): Promise<AudioBuffer | null> {
  const layout = computeLayout(p)
  const byId = new Map(p.media.map((m) => [m.id, m]))
  type Seg = { m: MediaItem; from: number; dur: number; start: number; vol: number; fadeIn: number; fadeOut: number }
  const segs: Seg[] = []
  for (const l of layout.items) {
    const m = byId.get(l.clip.mediaId)
    if (!m || m.kind !== 'video' || !m.hasAudio || l.clip.muted || l.clip.volume <= 0) continue
    segs.push({ m, from: l.clip.in, dur: l.duration, start: l.start, vol: l.clip.volume, fadeIn: l.transIn, fadeOut: l.transOut })
  }
  for (const a of p.audio) {
    const m = byId.get(a.mediaId)
    if (!m || a.volume <= 0) continue
    segs.push({ m, from: a.in, dur: a.out - a.in, start: a.start, vol: a.volume, fadeIn: a.fadeIn, fadeOut: a.fadeOut })
  }
  if (!segs.length) return null

  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * SR)), SR)
  for (const s of segs) {
    if (isCancelled()) return null
    const file = await mediaFile(s.m.path)
    if (!file) continue
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    try {
      const track = await input.getPrimaryAudioTrack()
      if (!track || !(await track.canDecode())) continue
      const sink = new AudioBufferSink(track)
      const chunks: { buf: AudioBuffer; ts: number }[] = []
      for await (const w of sink.buffers(s.from, s.from + s.dur)) chunks.push({ buf: w.buffer, ts: w.timestamp })
      if (!chunks.length) continue
      const rate = chunks[0].buf.sampleRate
      const ch = Math.min(2, chunks[0].buf.numberOfChannels)
      const len = Math.max(1, Math.round(s.dur * rate))
      const joined = ctx.createBuffer(Math.max(1, ch), len, rate)
      for (const c of chunks) {
        const offset = Math.round((c.ts - s.from) * rate)
        for (let k = 0; k < joined.numberOfChannels; k++) {
          const src = c.buf.getChannelData(Math.min(k, c.buf.numberOfChannels - 1))
          const dst = joined.getChannelData(k)
          const startSrc = offset < 0 ? -offset : 0
          const startDst = Math.max(0, offset)
          const n = Math.min(src.length - startSrc, dst.length - startDst)
          if (n > 0) dst.set(src.subarray(startSrc, startSrc + n), startDst)
        }
      }
      const node = ctx.createBufferSource()
      node.buffer = joined
      const gain = ctx.createGain()
      const g = gain.gain
      const t0 = s.start, t1 = s.start + s.dur
      g.setValueAtTime(s.fadeIn > 0 ? 0 : s.vol, t0)
      if (s.fadeIn > 0) g.linearRampToValueAtTime(s.vol, t0 + s.fadeIn)
      if (s.fadeOut > 0) { g.setValueAtTime(s.vol, Math.max(t0, t1 - s.fadeOut)); g.linearRampToValueAtTime(0, t1) }
      node.connect(gain).connect(ctx.destination)
      node.start(t0)
    } finally {
      input.dispose()
    }
  }
  return ctx.startRendering()
}

function sliceBuffer(buf: AudioBuffer, from: number, to: number): AudioBuffer | null {
  const a = Math.max(0, Math.floor(from * buf.sampleRate))
  const b = Math.min(buf.length, Math.floor(to * buf.sampleRate))
  if (b <= a) return null
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: b - a, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c)
  return out
}

export async function exportOnPhone(
  project: Project,
  s: MobileExportSettings,
  onProgress: (p: MobileExportProgress) => void,
  isCancelled: () => boolean
): Promise<MobileExportResult | 'cancelled'> {
  const layout = computeLayout(project)
  const total = layout.total
  if (total <= 0) throw new Error('타임라인이 비어 있어요')
  const [w, h] = frameSize(project.settings.aspect, s.shortSide)
  const fps = s.fps
  const frames = Math.max(1, Math.round(total * fps))
  const byId = new Map(project.media.map((m) => [m.id, m]))

  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: w, height: h })
  if (!videoCodec) throw new Error(`이 기기에서는 ${w}×${h} 영상을 인코딩할 수 없어요. 해상도를 낮춰 보세요.`)
  const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SR })

  onProgress({ stage: 'audio', frame: 0, total: frames, eta: 0 })
  const mixed = audioCodec ? await mixAudio(project, frames / fps, isCancelled) : null
  if (isCancelled()) return 'cancelled'

  const safeName = (project.name || 'Reelator').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  const name = `${safeName}_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.mp4`
  const exportsDir = await dir('exports')
  const handle = await exportsDir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()

  const canvas = document.createElement('canvas')
  const comp = new Compositor(canvas, w, h, { preserveDrawingBuffer: true })
  const quality = s.quality === 'high' ? QUALITY_HIGH : s.quality === 'medium' ? QUALITY_MEDIUM : QUALITY_LOW
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(writable) })
  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: quality, keyFrameInterval: 2 })
  output.addVideoTrack(videoSource, { frameRate: fps })
  let audioSource: AudioBufferSource | null = null
  if (audioCodec && mixed) {
    audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: quality })
    output.addAudioTrack(audioSource)
  }

  // per-clip decoders
  const inputs = new Map<string, Input>()
  const cursors = new Map<string, FrameCursor>()
  const images = new Map<string, ImageBitmap>()
  const bg = hexToRgb(project.settings.background)

  const layerFor = async (l: ClipLayout, t: number): Promise<LayerInput | null> => {
    const m = byId.get(l.clip.mediaId)
    if (!m) return null
    const c = l.clip
    const base = { transform: { fit: c.fit, scale: c.scale, x: c.x, y: c.y, rotation: c.rotation }, filter: resolveFilter(c.filter), ready: true }
    if (m.kind === 'image') {
      let bmp = images.get(m.path)
      if (!bmp) {
        const f = await mediaFile(m.path)
        if (!f) return null
        bmp = await createImageBitmap(f)
        images.set(m.path, bmp)
      }
      return { ...base, key: `img:${m.path}`, source: bmp, srcW: bmp.width, srcH: bmp.height }
    }
    let cur = cursors.get(c.id)
    if (!cur) {
      let input = inputs.get(m.path)
      if (!input) {
        const f = await mediaFile(m.path)
        if (!f) return null
        input = new Input({ source: new BlobSource(f), formats: ALL_FORMATS })
        inputs.set(m.path, input)
      }
      const track = await input.getPrimaryVideoTrack()
      if (!track) return null
      const [dw, dh] = fitWithin(track.displayWidth, track.displayHeight, Math.max(w, h), Math.max(w, h))
      const sink = new CanvasSink(track, { width: dw, height: dh, fit: 'fill', poolSize: 3 })
      cur = new FrameCursor(sink, c.in, c.out)
      cursors.set(c.id, cur)
    }
    const wc = await cur.at(Math.min(c.in + (t - l.start), c.out - 0.001))
    if (!wc) return null
    return { ...base, key: `vid:${c.id}`, source: wc.canvas as TexImageSource, srcW: wc.canvas.width, srcH: wc.canvas.height }
  }

  let finished = false
  try {
    await output.start()
    const started = performance.now()
    let audioDoneUntil = 0
    for (let n = 0; n < frames; n++) {
      if (isCancelled()) { await output.cancel(); return 'cancelled' }
      const t = Math.min(n / fps, total - 1e-4)
      const f = frameAt(layout, t)
      const a = f.a ? await layerFor(f.a, t) : null
      const b = f.b ? await layerFor(f.b, t) : null
      const def = f.b && f.a?.clip.transitionOut ? TRANSITION_MAP.get(f.a.clip.transitionOut.type) ?? null : null
      comp.render({ a, b, transition: b ? def : null, progress: def ? ease(def.ease, f.progress) : 0, background: bg, time: t })
      await videoSource.add(n / fps, 1 / fps)

      // feed audio in 1-second steps alongside the video so the file stays interleaved
      const want = Math.min(frames / fps, Math.floor((n + 1) / fps) + 1)
      while (audioSource && mixed && audioDoneUntil < want) {
        const next = Math.min(want, audioDoneUntil + 1)
        const slice = sliceBuffer(mixed, audioDoneUntil, next)
        if (slice) await audioSource.add(slice)
        audioDoneUntil = next
      }

      // release decoders of clips that are finished
      for (const [id, cur] of cursors) {
        const l = layout.items.find((x) => x.clip.id === id)
        if (!l || t > l.end + 0.05) { await cur.close(); cursors.delete(id); comp.release(`vid:${id}`) }
      }

      if (n % 5 === 0 || n === frames - 1) {
        const el = (performance.now() - started) / 1000
        const speed = (n + 1) / Math.max(el, 1e-3)
        onProgress({ stage: 'video', frame: n + 1, total: frames, eta: (frames - n - 1) / speed })
      }
    }
    onProgress({ stage: 'finishing', frame: frames, total: frames, eta: 0 })
    await output.finalize()
    finished = true
    return { file: await handle.getFile(), name }
  } catch (e) {
    try { await output.cancel() } catch { /* ignore */ }
    throw e
  } finally {
    for (const c of cursors.values()) await c.close()
    for (const i of inputs.values()) i.dispose()
    for (const b of images.values()) b.close()
    comp.dispose()
    if (!finished) {
      try { await writable.close() } catch { /* ignore */ }
      await removeIn('exports', name)
    }
  }
}

/** Delete old exports to free space (keep the newest few). */
export async function cleanExports(keep = 2): Promise<void> {
  const d = await dir('exports') as FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> }
  const files: { name: string; t: number }[] = []
  for await (const [name, h] of d.entries()) {
    if (h.kind === 'file') files.push({ name, t: (await (h as FileSystemFileHandle).getFile()).lastModified })
  }
  files.sort((a, b) => b.t - a.t)
  for (const f of files.slice(keep)) await removeIn('exports', f.name)
}
