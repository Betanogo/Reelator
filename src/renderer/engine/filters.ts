import { Adjustments, ClipFilter } from '../model/types'

export type Vec3 = [number, number, number]

/** Full parameter set the clip shader understands. */
export interface FilterParams extends Adjustments {
  shadowTint: Vec3
  highTint: Vec3
  mono: number
  sepia: number
}

export interface FilterPreset {
  id: string
  name: string
  category: '인물' | '풍경' | '필름' | '무비' | '흑백' | '감성'
  params: Partial<FilterParams>
}

export const IDENTITY: FilterParams = {
  brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0,
  fade: 0, vignette: 0, grain: 0, sharpen: 0,
  shadowTint: [0, 0, 0], highTint: [0, 0, 0], mono: 0, sepia: 0
}

export const FILTERS: FilterPreset[] = [
  { id: 'vivid', name: '선명', category: '인물', params: { saturation: 0.3, contrast: 0.15, sharpen: 0.2 } },
  { id: 'clear', name: '맑음', category: '인물', params: { brightness: 0.1, highlights: -0.1, shadows: 0.15, saturation: 0.1 } },
  { id: 'bright', name: '화사', category: '인물', params: { brightness: 0.14, fade: 0.15, temperature: 0.12, saturation: -0.05 } },
  { id: 'peach', name: '복숭아', category: '인물', params: { temperature: 0.2, tint: 0.15, brightness: 0.06, fade: 0.1, highTint: [0.03, 0.0, 0.0] } },
  { id: 'warm', name: '따뜻함', category: '풍경', params: { temperature: 0.45, saturation: 0.05 } },
  { id: 'cool', name: '시원함', category: '풍경', params: { temperature: -0.4, saturation: 0.05 } },
  { id: 'fresh', name: '청량', category: '풍경', params: { temperature: -0.2, brightness: 0.1, saturation: 0.15, shadows: 0.1 } },
  { id: 'sunset', name: '노을', category: '풍경', params: { temperature: 0.55, tint: 0.15, highTint: [0.06, 0.01, 0.0], contrast: 0.1 } },
  { id: 'forest', name: '숲', category: '풍경', params: { tint: -0.2, saturation: 0.15, shadowTint: [0.0, 0.03, 0.0], contrast: 0.1 } },
  { id: 'food', name: '맛있게', category: '풍경', params: { temperature: 0.2, saturation: 0.3, highlights: -0.05, shadows: 0.1 } },
  { id: 'film-warm', name: '필름 웜', category: '필름', params: { temperature: 0.2, contrast: 0.1, fade: 0.25, shadowTint: [0.0, 0.02, 0.04], highTint: [0.04, 0.02, 0.0], grain: 0.25 } },
  { id: 'film-cool', name: '필름 쿨', category: '필름', params: { temperature: -0.15, fade: 0.3, shadowTint: [0.0, 0.03, 0.05], grain: 0.3, saturation: -0.1 } },
  { id: 'film-faded', name: '필름 바랜', category: '필름', params: { fade: 0.45, saturation: -0.2, contrast: -0.1, grain: 0.2, highTint: [0.03, 0.02, 0.0] } },
  { id: 'vintage', name: '빈티지', category: '필름', params: { sepia: 0.35, fade: 0.3, vignette: 0.35, grain: 0.3, contrast: -0.05 } },
  { id: 'cinematic', name: '시네마틱', category: '무비', params: { contrast: 0.2, saturation: -0.05, shadowTint: [-0.02, 0.03, 0.06], highTint: [0.07, 0.03, -0.03], vignette: 0.3 } },
  { id: 'moody', name: '무디', category: '무비', params: { brightness: -0.1, contrast: 0.25, saturation: -0.2, vignette: 0.45, shadowTint: [0.0, 0.02, 0.04] } },
  { id: 'neon-night', name: '네온 나이트', category: '무비', params: { temperature: -0.3, tint: 0.25, contrast: 0.2, saturation: 0.25 } },
  { id: 'bleach', name: '블리치', category: '무비', params: { saturation: -0.45, contrast: 0.35, highlights: 0.1 } },
  { id: 'bw', name: '흑백', category: '흑백', params: { mono: 1, contrast: 0.15 } },
  { id: 'bw-hard', name: '하이콘 흑백', category: '흑백', params: { mono: 1, contrast: 0.45, vignette: 0.25 } },
  { id: 'bw-fade', name: '페이드 흑백', category: '흑백', params: { mono: 1, fade: 0.4, grain: 0.15 } },
  { id: 'sepia', name: '세피아', category: '흑백', params: { sepia: 1, contrast: 0.05 } },
  { id: 'pastel', name: '파스텔', category: '감성', params: { saturation: -0.25, fade: 0.3, brightness: 0.1 } },
  { id: 'dreamy', name: '몽환', category: '감성', params: { brightness: 0.12, fade: 0.25, tint: 0.12, highTint: [0.03, 0.0, 0.04], vignette: 0.2 } },
  { id: 'retro', name: '레트로', category: '감성', params: { temperature: 0.1, saturation: 0.15, fade: 0.2, tint: 0.1, grain: 0.3, vignette: 0.25 } },
  { id: 'calm', name: '차분', category: '감성', params: { saturation: -0.15, temperature: -0.08, contrast: -0.05, fade: 0.15 } }
]

export const FILTER_MAP = new Map(FILTERS.map((f) => [f.id, f]))

const SCALAR_KEYS: (keyof Adjustments)[] = [
  'brightness', 'contrast', 'saturation', 'temperature', 'tint', 'highlights', 'shadows',
  'fade', 'vignette', 'grain', 'sharpen'
]

/** Preset (scaled by intensity) + manual adjustments → shader parameters. */
export function resolveFilter(f: ClipFilter | null | undefined): FilterParams {
  const out: FilterParams = { ...IDENTITY, shadowTint: [0, 0, 0], highTint: [0, 0, 0] }
  if (!f) return out
  const preset = f.preset ? FILTER_MAP.get(f.preset) : undefined
  const k = preset ? f.intensity : 0
  for (const key of SCALAR_KEYS) {
    out[key] = (preset?.params[key] ?? 0) * k + (f.adjust[key] ?? 0)
  }
  if (preset) {
    const st = preset.params.shadowTint ?? [0, 0, 0]
    const ht = preset.params.highTint ?? [0, 0, 0]
    out.shadowTint = [st[0] * k, st[1] * k, st[2] * k]
    out.highTint = [ht[0] * k, ht[1] * k, ht[2] * k]
    out.mono = (preset.params.mono ?? 0) * k
    out.sepia = (preset.params.sepia ?? 0) * k
  }
  return out
}
