import { FilterParams, IDENTITY } from './filters'
import { TRANSITION_MAP, TransitionDef } from './transitions'

export interface LayerTransform {
  fit: 'contain' | 'cover'
  scale: number
  x: number
  y: number
  rotation: number
}

export interface LayerInput {
  key: string // texture cache key (stable per source element)
  source: TexImageSource | null
  srcW: number
  srcH: number
  ready: boolean // false → keep the last uploaded frame
  transform: LayerTransform
  filter: FilterParams
}

export interface RenderFrame {
  a: LayerInput | null
  b: LayerInput | null
  transition: TransitionDef | null
  progress: number // eased
  background: [number, number, number]
  time: number
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`

const CLIP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDst;      // output size px
uniform vec2 uRect;     // displayed size px
uniform vec2 uCenter;   // centre px (y up)
uniform float uRot;     // radians
uniform vec2 uTexel;
uniform vec3 uBg;
uniform float uTime;
uniform float uBrightness, uContrast, uSaturation, uTemp, uTint, uHighlights, uShadows;
uniform float uFade, uVignette, uGrain, uSharpen, uMono, uSepia;
uniform vec3 uShadowTint, uHighTint;

float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main(){
  vec2 p = vUv * uDst - uCenter;
  float c = cos(-uRot), s = sin(-uRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 uv = p / uRect + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { outColor = vec4(uBg, 1.0); return; }

  vec3 col = texture(uTex, uv).rgb;
  if (uSharpen > 0.001) {
    vec3 n = texture(uTex, uv + vec2(uTexel.x, 0.0)).rgb + texture(uTex, uv - vec2(uTexel.x, 0.0)).rgb
           + texture(uTex, uv + vec2(0.0, uTexel.y)).rgb + texture(uTex, uv - vec2(0.0, uTexel.y)).rgb;
    col += (col * 4.0 - n) * uSharpen * 0.6;
  }

  col = col * (1.0 + uBrightness * 0.55) + uBrightness * 0.04;
  col.r += uTemp * 0.08; col.b -= uTemp * 0.08;
  col.g -= uTint * 0.06; col.r += uTint * 0.02; col.b += uTint * 0.02;

  float l = dot(clamp(col, 0.0, 1.0), LUMA);
  col += uShadows * 0.25 * (1.0 - smoothstep(0.0, 0.55, l));
  col += uHighlights * 0.25 * smoothstep(0.45, 1.0, l);
  col = (col - 0.5) * (1.0 + uContrast) + 0.5;

  l = dot(clamp(col, 0.0, 1.0), LUMA);
  col += uShadowTint * (1.0 - l) * 1.5 + uHighTint * l * 1.5;

  float g = dot(col, LUMA);
  col = mix(vec3(g), col, 1.0 + uSaturation);
  col = mix(col, vec3(g), clamp(uMono, 0.0, 1.0));
  vec3 sep = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
  col = mix(col, sep, clamp(uSepia, 0.0, 1.0));
  col = mix(col, col * 0.82 + 0.12, clamp(uFade, 0.0, 1.0));

  vec2 vd = (vUv - 0.5) * vec2(uDst.x / uDst.y, 1.0);
  float v = smoothstep(0.35, 1.05, length(vd) * 1.25);
  col *= 1.0 - v * uVignette * 0.85;

  if (uGrain > 0.001) col += (rand(vUv * uDst + fract(uTime) * 97.0) - 0.5) * uGrain * 0.18;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

const TRANS_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform float uRatio;
uniform vec3 uBg;
const float PI = 3.141592653589793;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
bool inside(vec2 uv){ return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }
vec4 getFrom(vec2 uv){ return inside(uv) ? texture(uFrom, uv) : vec4(uBg, 1.0); }
vec4 getTo(vec2 uv){ return inside(uv) ? texture(uTo, uv) : vec4(uBg, 1.0); }
`
const TRANS_FOOTER = `
void main(){ vec4 c = transition(vUv); outColor = vec4(c.rgb, 1.0); }`

const COPY_BODY = `vec4 transition(vec2 uv){ return getFrom(uv); }`

interface Program {
  prog: WebGLProgram
  loc: Map<string, WebGLUniformLocation | null>
}

interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
}

export class Compositor {
  readonly gl: WebGL2RenderingContext
  width = 0
  height = 0
  private quad: WebGLBuffer
  private vao: WebGLVertexArrayObject
  private clipProg: Program
  private transProgs = new Map<string, Program>()
  private sourceTex = new Map<string, WebGLTexture>()
  private targets: [Target, Target] | null = null
  private blackTex: WebGLTexture

  constructor(readonly canvas: HTMLCanvasElement, width: number, height: number, opts: { preserveDrawingBuffer?: boolean } = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserveDrawingBuffer, powerPreference: 'high-performance'
    })
    if (!gl) throw new Error('WebGL2를 사용할 수 없어요')
    this.gl = gl
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)

    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.vao = gl.createVertexArray()!

    this.clipProg = this.compile(CLIP_FRAG)
    this.blackTex = this.makeTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.blackTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    this.resize(width, height)
  }

  resize(w: number, h: number): void {
    w = Math.max(2, Math.round(w))
    h = Math.max(2, Math.round(h))
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h
    this.canvas.width = w
    this.canvas.height = h
    const gl = this.gl
    if (this.targets) for (const t of this.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo) }
    const mk = (): Target => {
      const tex = this.makeTexture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return { tex, fbo }
    }
    this.targets = [mk(), mk()]
  }

  /** Draw one frame to the canvas. */
  render(f: RenderFrame): void {
    const gl = this.gl
    const [ta, tb] = this.targets!
    gl.viewport(0, 0, this.width, this.height)
    gl.bindVertexArray(this.vao)

    this.drawLayer(f.a, ta, f)
    if (f.b && f.transition) this.drawLayer(f.b, tb, f)

    const prog = f.b && f.transition ? this.transitionProgram(f.transition.id) : this.transitionProgram('__copy')
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(prog.prog)
    this.bindQuad(prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, ta.tex)
    gl.uniform1i(prog.loc.get('uFrom')!, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, f.b && f.transition ? tb.tex : ta.tex)
    gl.uniform1i(prog.loc.get('uTo')!, 1)
    gl.uniform1f(prog.loc.get('uProgress')!, f.progress)
    gl.uniform1f(prog.loc.get('uRatio')!, this.width / this.height)
    gl.uniform3fv(prog.loc.get('uBg')!, f.background)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** RGBA rows, bottom row first. */
  readPixels(into?: Uint8Array): Uint8Array {
    const gl = this.gl
    const buf = into && into.length === this.width * this.height * 4 ? into : new Uint8Array(this.width * this.height * 4)
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, buf)
    return buf
  }

  /** Forget the texture of a source that no longer exists. */
  release(key: string): void {
    const t = this.sourceTex.get(key)
    if (t) { this.gl.deleteTexture(t); this.sourceTex.delete(key) }
  }

  dispose(): void {
    const gl = this.gl
    for (const t of this.sourceTex.values()) gl.deleteTexture(t)
    this.sourceTex.clear()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  // ------------------------------------------------------------ internals

  private drawLayer(layer: LayerInput | null, target: Target, f: RenderFrame): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    if (!layer) {
      gl.clearColor(f.background[0], f.background[1], f.background[2], 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }
    const tex = this.textureFor(layer)
    const p = this.clipProg
    gl.useProgram(p.prog)
    this.bindQuad(p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(p.loc.get('uTex')!, 0)

    const W = this.width, H = this.height
    const sw = layer.srcW || W, sh = layer.srcH || H
    const t = layer.transform
    const fit = t.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)
    const s = fit * (t.scale || 1)
    gl.uniform2f(p.loc.get('uDst')!, W, H)
    gl.uniform2f(p.loc.get('uRect')!, sw * s, sh * s)
    gl.uniform2f(p.loc.get('uCenter')!, W / 2 + (t.x * W) / 2, H / 2 - (t.y * H) / 2)
    gl.uniform1f(p.loc.get('uRot')!, ((t.rotation || 0) * Math.PI) / 180)
    gl.uniform2f(p.loc.get('uTexel')!, 1 / sw, 1 / sh)
    gl.uniform3fv(p.loc.get('uBg')!, f.background)
    gl.uniform1f(p.loc.get('uTime')!, f.time)

    const fp = layer.filter ?? IDENTITY
    gl.uniform1f(p.loc.get('uBrightness')!, fp.brightness)
    gl.uniform1f(p.loc.get('uContrast')!, fp.contrast)
    gl.uniform1f(p.loc.get('uSaturation')!, fp.saturation)
    gl.uniform1f(p.loc.get('uTemp')!, fp.temperature)
    gl.uniform1f(p.loc.get('uTint')!, fp.tint)
    gl.uniform1f(p.loc.get('uHighlights')!, fp.highlights)
    gl.uniform1f(p.loc.get('uShadows')!, fp.shadows)
    gl.uniform1f(p.loc.get('uFade')!, fp.fade)
    gl.uniform1f(p.loc.get('uVignette')!, fp.vignette)
    gl.uniform1f(p.loc.get('uGrain')!, fp.grain)
    gl.uniform1f(p.loc.get('uSharpen')!, fp.sharpen)
    gl.uniform1f(p.loc.get('uMono')!, fp.mono)
    gl.uniform1f(p.loc.get('uSepia')!, fp.sepia)
    gl.uniform3fv(p.loc.get('uShadowTint')!, fp.shadowTint)
    gl.uniform3fv(p.loc.get('uHighTint')!, fp.highTint)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private textureFor(layer: LayerInput): WebGLTexture {
    const gl = this.gl
    let tex = this.sourceTex.get(layer.key)
    const isNew = !tex
    if (!tex) {
      tex = this.makeTexture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
      this.sourceTex.set(layer.key, tex)
    }
    gl.bindTexture(gl.TEXTURE_2D, tex)
    if (layer.source && (layer.ready || isNew)) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.source)
      } catch {
        /* source not decodable yet; keep previous frame */
      }
    }
    return tex
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private bindQuad(p: Program): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const loc = gl.getAttribLocation(p.prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  }

  private transitionProgram(id: string): Program {
    let p = this.transProgs.get(id)
    if (p) return p
    const def = TRANSITION_MAP.get(id)
    const body = id === '__copy' || !def ? COPY_BODY : def.glsl
    try {
      p = this.compile(TRANS_HEADER + body + TRANS_FOOTER)
    } catch (e) {
      console.error(`transition ${id} failed to compile`, e)
      p = this.compile(TRANS_HEADER + COPY_BODY + TRANS_FOOTER)
    }
    this.transProgs.set(id, p)
    return p
  }

  private compile(frag: string): Program {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error')
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error')
    const loc = new Map<string, WebGLUniformLocation | null>()
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)!
      loc.set(info.name, gl.getUniformLocation(prog, info.name))
    }
    // Uniforms the compiler optimised away must still be settable without errors.
    const proxy = new Map(loc)
    const get = proxy.get.bind(proxy)
    proxy.get = (k: string) => get(k) ?? null
    return { prog, loc: proxy }
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
