// Fast scrubbing: one hardware (WebCodecs) decoder per visible clip, fed with the most
// recent timestamp the finger is on. Moving forward keeps decoding from where it is
// instead of re-seeking like <video> does; only the newest request is ever decoded.

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import type { ScrubFrame, ScrubProvider } from '@shared/engine/preview'
import { mediaFile } from './platform'

const MAX_SIDE = 640 // decode size; the preview is ~540p
const MAX_DECODERS = 3 // phones have few hardware decoder slots

class ClipScrubber {
  latest: ScrubFrame | null = null
  private target: number | null = null
  private wake: (() => void) | null = null
  private closed = false
  private input: Input | null = null

  constructor(private path: string, private onFrame: () => void) {
    this.run().catch((e) => console.warn('scrub decoder stopped', e))
  }

  want(t: number): void {
    if (this.latest && Math.abs(this.latest.ts - t) < 1 / 60 && this.target === null) return
    this.target = t
    this.wake?.()
  }

  close(): void {
    this.closed = true
    this.wake?.()
    this.input?.dispose()
  }

  private async *timestamps(): AsyncGenerator<number> {
    while (!this.closed) {
      if (this.target === null) await new Promise<void>((r) => { this.wake = r })
      this.wake = null
      if (this.closed) return
      if (this.target === null) continue
      const t = this.target
      this.target = null
      yield t
    }
  }

  private async run(): Promise<void> {
    const file = await mediaFile(this.path)
    if (!file || this.closed) return
    this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const track = await this.input.getPrimaryVideoTrack()
    if (!track || this.closed || !(await track.canDecode())) return
    const s = Math.min(1, MAX_SIDE / Math.max(track.displayWidth, track.displayHeight))
    const sink = new CanvasSink(track, {
      width: Math.max(2, Math.round(track.displayWidth * s)),
      height: Math.max(2, Math.round(track.displayHeight * s)),
      fit: 'fill',
      poolSize: 3
    })
    for await (const wc of sink.canvasesAtTimestamps(this.timestamps())) {
      if (this.closed) break
      if (wc) {
        this.latest = { canvas: wc.canvas, ts: wc.timestamp }
        this.onFrame()
      }
    }
  }
}

export class MobileScrubber implements ScrubProvider {
  private clips = new Map<string, ClipScrubber>()
  private listeners: (() => void)[] = []

  private notify = () => { for (const l of this.listeners) l() }

  want(clipId: string, mediaPath: string, t: number): void {
    let c = this.clips.get(clipId)
    if (c) {
      // refresh LRU order
      this.clips.delete(clipId)
    } else {
      c = new ClipScrubber(mediaPath, this.notify)
      while (this.clips.size >= MAX_DECODERS) {
        const [oldId, old] = this.clips.entries().next().value as [string, ClipScrubber]
        old.close()
        this.clips.delete(oldId)
      }
    }
    this.clips.set(clipId, c)
    c.want(t)
  }

  get(clipId: string): ScrubFrame | null {
    return this.clips.get(clipId)?.latest ?? null
  }

  release(keep: Set<string>): void {
    for (const [id, c] of this.clips) {
      if (!keep.has(id)) { c.close(); this.clips.delete(id) }
    }
  }

  onFrame(cb: () => void): void {
    this.listeners = [cb] // one preview at a time
  }
}
