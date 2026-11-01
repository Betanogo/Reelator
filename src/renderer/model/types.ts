import type { MediaKind } from '../../shared/types'

export interface MediaItem {
  id: string
  path: string
  name: string
  kind: MediaKind
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  thumbnail: string | null
}

export interface Adjustments {
  brightness: number // -1..1
  contrast: number // -1..1
  saturation: number // -1..1
  temperature: number // -1..1 (warm +)
  tint: number // -1..1 (magenta +)
  highlights: number // -1..1
  shadows: number // -1..1
  fade: number // 0..1
  vignette: number // 0..1
  grain: number // 0..1
  sharpen: number // 0..1
}

export const NO_ADJUST: Adjustments = {
  brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0, sharpen: 0
}

export interface ClipFilter {
  preset: string | null // filter id from engine/filters
  intensity: number // 0..1
  adjust: Adjustments
}

export interface TransitionRef {
  type: string // transition id from engine/transitions
  duration: number // seconds (requested; clamped by layout)
}

export type FitMode = 'contain' | 'cover'

export interface Clip {
  id: string
  mediaId: string
  in: number // source seconds
  out: number // source seconds (images: in=0, out=display duration)
  volume: number // 0..1
  muted: boolean
  fit: FitMode
  scale: number // 1 = fitted size
  x: number // -1..1 offset as fraction of canvas
  y: number
  rotation: number // degrees
  filter: ClipFilter
  transitionOut: TransitionRef | null // transition into the next clip on the main track
}

export interface AudioClip {
  id: string
  mediaId: string
  start: number // timeline seconds
  in: number
  out: number
  volume: number
  fadeIn: number
  fadeOut: number
}

export type AspectId = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'

export interface ProjectSettings {
  aspect: AspectId
  fps: number
  background: string // css hex
}

export interface Project {
  version: 1
  name: string
  settings: ProjectSettings
  media: MediaItem[]
  clips: Clip[] // main (magnetic) track, in order
  audio: AudioClip[]
}

export type Selection =
  | { type: 'clip'; id: string }
  | { type: 'transition'; id: string } // id of the clip whose transitionOut it is
  | { type: 'audio'; id: string }
  | null

export const ASPECTS: Record<AspectId, [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:3': [4, 3],
  '3:4': [3, 4],
  '21:9': [21, 9]
}

/** Output size whose short side equals `shortSide` (rounded to even numbers). */
export function frameSize(aspect: AspectId, shortSide: number): [number, number] {
  const [a, b] = ASPECTS[aspect]
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  if (a >= b) return [even((shortSide * a) / b), even(shortSide)]
  return [even(shortSide), even((shortSide * b) / a)]
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

export function newProject(): Project {
  return {
    version: 1,
    name: '새 프로젝트',
    settings: { aspect: '16:9', fps: 30, background: '#000000' },
    media: [],
    clips: [],
    audio: []
  }
}

export function clipDuration(c: { in: number; out: number }): number {
  return Math.max(0, c.out - c.in)
}
