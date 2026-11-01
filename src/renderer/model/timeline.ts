import { Clip, Project, clipDuration } from './types'

export interface ClipLayout {
  clip: Clip
  index: number
  start: number // timeline seconds
  duration: number
  end: number
  /** effective (clamped) duration of the transition into the next clip */
  transOut: number
  /** effective duration of the transition coming from the previous clip */
  transIn: number
}

export interface Layout {
  items: ClipLayout[]
  mainEnd: number
  total: number
}

export const MIN_CLIP = 0.1
export const MAX_TRANSITION = 3

/** Effective transition length: never more than half of either neighbouring clip. */
export function effectiveTransition(a: Clip, b: Clip | undefined): number {
  if (!a.transitionOut || !b) return 0
  const d = Math.min(a.transitionOut.duration, clipDuration(a) / 2, clipDuration(b) / 2, MAX_TRANSITION)
  return Math.max(0, d)
}

export function computeLayout(p: Project): Layout {
  const items: ClipLayout[] = []
  let t = 0
  let prevOut = 0
  p.clips.forEach((clip, index) => {
    const duration = clipDuration(clip)
    const transOut = effectiveTransition(clip, p.clips[index + 1])
    const start = t
    items.push({ clip, index, start, duration, end: start + duration, transOut, transIn: prevOut })
    t = start + duration - transOut
    prevOut = transOut
  })
  const mainEnd = items.length ? items[items.length - 1].end : 0
  const audioEnd = p.audio.reduce((m, a) => Math.max(m, a.start + clipDuration(a)), 0)
  return { items, mainEnd, total: Math.max(mainEnd, audioEnd) }
}

export interface FrameState {
  /** clip shown fully, or the outgoing clip during a transition */
  a: ClipLayout | null
  /** incoming clip during a transition */
  b: ClipLayout | null
  progress: number // 0..1 within the transition
}

export function frameAt(layout: Layout, t: number): FrameState {
  const items = layout.items
  // binary search is overkill for typical clip counts
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (t < it.start) break
    if (t < it.end || (i === items.length - 1 && t <= it.end)) {
      const next = items[i + 1]
      if (next && it.transOut > 0 && t >= next.start) {
        return { a: it, b: next, progress: Math.min(1, Math.max(0, (t - next.start) / it.transOut)) }
      }
      return { a: it, b: null, progress: 0 }
    }
  }
  return { a: null, b: null, progress: 0 }
}

/** Source time inside a clip for a timeline time. */
export function sourceTime(l: ClipLayout, t: number): number {
  return l.clip.in + Math.min(Math.max(0, t - l.start), l.duration)
}

export function formatTime(t: number, fps = 30): string {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const f = Math.floor((t % 1) * fps)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

export function formatShort(t: number): string {
  if (t < 60) return `${t.toFixed(1)}s`
  const m = Math.floor(t / 60)
  return `${m}:${String(Math.floor(t % 60)).padStart(2, '0')}`
}
