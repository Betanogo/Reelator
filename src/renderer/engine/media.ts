import { LayerInput } from './compositor'
import { resolveFilter } from './filters'
import { ClipLayout, sourceTime } from '../model/timeline'
import { MediaItem } from '../model/types'

/** Owns the <video>/<img>/<audio> elements used to decode media. */
export class MediaPool {
  private videos = new Map<string, HTMLVideoElement>()
  private images = new Map<string, HTMLImageElement>()
  private audios = new Map<string, HTMLAudioElement>()

  /** `onFrame` is called whenever an element has a new frame to show (load / seek done). */
  constructor(private muted: boolean, private onFrame?: () => void) {}

  video(key: string, path: string): HTMLVideoElement {
    let v = this.videos.get(key)
    if (!v) {
      v = document.createElement('video')
      v.preload = 'auto'
      v.playsInline = true
      v.muted = this.muted
      v.src = window.reelator.toFileUrl(path)
      v.dataset.path = path
      if (this.onFrame) {
        v.addEventListener('seeked', this.onFrame)
        v.addEventListener('loadeddata', this.onFrame)
      }
      this.videos.set(key, v)
    } else if (v.dataset.path !== path) {
      v.src = window.reelator.toFileUrl(path)
      v.dataset.path = path
    }
    return v
  }

  image(path: string): HTMLImageElement {
    let img = this.images.get(path)
    if (!img) {
      img = new Image()
      img.decoding = 'async'
      img.src = window.reelator.toFileUrl(path)
      if (this.onFrame) img.addEventListener('load', this.onFrame)
      this.images.set(path, img)
    }
    return img
  }

  audio(key: string, path: string): HTMLAudioElement {
    let a = this.audios.get(key)
    if (!a) {
      a = new Audio()
      a.preload = 'auto'
      a.src = window.reelator.toFileUrl(path)
      this.audios.set(key, a)
    }
    return a
  }

  allVideos(): IterableIterator<[string, HTMLVideoElement]> { return this.videos.entries() }
  allAudios(): IterableIterator<[string, HTMLAudioElement]> { return this.audios.entries() }

  /** Drop elements whose clip no longer exists; returns removed keys. */
  prune(keep: Set<string>): string[] {
    const removed: string[] = []
    for (const [k, v] of this.videos) if (!keep.has(k)) { v.pause(); v.removeAttribute('src'); v.load(); this.videos.delete(k); removed.push(k) }
    for (const [k, a] of this.audios) if (!keep.has(k)) { a.pause(); a.removeAttribute('src'); a.load(); this.audios.delete(k) }
    return removed
  }

  pauseAll(): void {
    for (const v of this.videos.values()) if (!v.paused) v.pause()
    for (const a of this.audios.values()) if (!a.paused) a.pause()
  }

  dispose(): void {
    this.prune(new Set())
    this.images.clear()
  }
}

/** Builds the compositor input for one clip at timeline time t. */
export function layerFor(l: ClipLayout, media: MediaItem | undefined, pool: MediaPool): LayerInput | null {
  if (!media) return null
  const c = l.clip
  const transform = { fit: c.fit, scale: c.scale, x: c.x, y: c.y, rotation: c.rotation }
  const filter = resolveFilter(c.filter)
  if (media.kind === 'image') {
    const img = pool.image(media.path)
    const ok = img.complete && img.naturalWidth > 0
    return { key: `img:${media.path}`, source: ok ? img : null, srcW: img.naturalWidth || media.width, srcH: img.naturalHeight || media.height, ready: ok, transform, filter }
  }
  const v = pool.video(c.id, media.path)
  const ok = v.readyState >= 2
  return { key: `vid:${c.id}`, source: ok ? v : null, srcW: v.videoWidth || media.width, srcH: v.videoHeight || media.height, ready: ok && !v.seeking, transform, filter }
}

export function desiredSourceTime(l: ClipLayout, t: number): number {
  // Stay a hair inside the clip so the decoder never runs past the out point.
  return Math.min(sourceTime(l, t), l.clip.out - 0.001)
}

export function waitForEvent(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { el.removeEventListener(event, done); el.removeEventListener('error', done); clearTimeout(timer); resolve() }
    const timer = setTimeout(done, timeoutMs)
    el.addEventListener(event, done)
    el.addEventListener('error', done)
  })
}
