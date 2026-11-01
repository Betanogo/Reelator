import { Compositor, LayerInput } from './compositor'
import { FILTER_MAP, IDENTITY, resolveFilter } from './filters'
import { TRANSITION_MAP, ease } from './transitions'
import { NO_ADJUST } from '../model/types'

/** One shared WebGL context renders all the little preview cards. */
class ThumbRenderer {
  private comp: Compositor | null = null
  private canvas = document.createElement('canvas')
  readonly sampleA: HTMLCanvasElement
  readonly sampleB: HTMLCanvasElement

  constructor() {
    this.sampleA = makeSample(['#3a1c71', '#d76d77', '#ffaf7b'], 'A')
    this.sampleB = makeSample(['#0f2027', '#2c5364', '#38ef7d'], 'B')
  }

  private get c(): Compositor {
    if (!this.comp) this.comp = new Compositor(this.canvas, 192, 108)
    return this.comp
  }

  private layer(key: string, src: TexImageSource, w: number, h: number, filter = IDENTITY): LayerInput {
    return { key, source: src, srcW: w, srcH: h, ready: true, filter, transform: { fit: 'cover', scale: 1, x: 0, y: 0, rotation: 0 } }
  }

  transition(target: HTMLCanvasElement, id: string, progress: number): void {
    const def = TRANSITION_MAP.get(id) ?? null
    const c = this.c
    c.render({
      a: this.layer('sampleA', this.sampleA, 192, 108),
      b: this.layer('sampleB', this.sampleB, 192, 108),
      transition: def,
      progress: def ? ease(def.ease, progress) : 0,
      background: [0, 0, 0],
      time: 0
    })
    blit(this.canvas, target)
  }

  filter(target: HTMLCanvasElement, presetId: string | null, src: HTMLImageElement | null): void {
    const c = this.c
    const params = presetId && FILTER_MAP.has(presetId)
      ? resolveFilter({ preset: presetId, intensity: 1, adjust: NO_ADJUST })
      : IDENTITY
    const source: TexImageSource = src && src.complete && src.naturalWidth ? src : this.sampleA
    const key = src && source === src ? `thumb:${src.src}` : 'sampleA'
    const w = src && source === src ? src.naturalWidth : 192
    const h = src && source === src ? src.naturalHeight : 108
    c.render({ a: this.layer(key, source, w, h, params), b: null, transition: null, progress: 0, background: [0, 0, 0], time: 0 })
    blit(this.canvas, target)
  }
}

function blit(from: HTMLCanvasElement, to: HTMLCanvasElement) {
  if (to.width !== from.width) { to.width = from.width; to.height = from.height }
  const ctx = to.getContext('2d')
  ctx?.drawImage(from, 0, 0)
}

function makeSample(colors: string[], label: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 192
  c.height = 108
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 192, 108)
  colors.forEach((col, i) => grad.addColorStop(i / (colors.length - 1), col))
  g.fillStyle = grad
  g.fillRect(0, 0, 192, 108)
  // a little "scene": sun + hills so filters and motion are readable
  g.fillStyle = 'rgba(255,240,200,0.85)'
  g.beginPath(); g.arc(140, 36, 16, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.beginPath(); g.moveTo(0, 108); g.quadraticCurveTo(60, 50, 120, 90); g.quadraticCurveTo(160, 70, 192, 84); g.lineTo(192, 108); g.fill()
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.font = 'bold 34px Segoe UI, sans-serif'
  g.fillText(label, 18, 46)
  return c
}

let instance: ThumbRenderer | null = null
export function thumbs(): ThumbRenderer {
  if (!instance) instance = new ThumbRenderer()
  return instance
}
