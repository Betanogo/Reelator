// Every transition is one GLSL function `vec4 transition(vec2 uv)`.
// Available helpers: getFrom(uv), getTo(uv) (black outside 0..1), uProgress (eased 0..1),
// uRatio (width / height), rand(vec2), PI.
// To add a transition, append an entry to TRANSITIONS — nothing else needs to change.

export type Ease = 'linear' | 'inOut' | 'out' | 'in'

export interface TransitionDef {
  id: string
  name: string
  category: '기본' | '슬라이드' | '카메라' | '특수'
  ease: Ease
  defaultDuration: number
  glsl: string
}

export const TRANSITIONS: TransitionDef[] = [
  {
    id: 'dissolve', name: '디졸브', category: '기본', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){ return mix(getFrom(uv), getTo(uv), uProgress); }`
  },
  {
    id: 'fade-black', name: '블랙 페이드', category: '기본', ease: 'linear', defaultDuration: 0.8,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec4 k = vec4(0.0, 0.0, 0.0, 1.0);
      return p < 0.5 ? mix(getFrom(uv), k, smoothstep(0.0, 0.5, p))
                     : mix(k, getTo(uv), smoothstep(0.5, 1.0, p));
    }`
  },
  {
    id: 'flash', name: '화이트 플래시', category: '기본', ease: 'linear', defaultDuration: 0.5,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      float w = 1.0 - abs(p - 0.5) * 2.0;
      w = pow(w, 1.6);
      vec4 base = mix(getFrom(uv), getTo(uv), smoothstep(0.35, 0.65, p));
      return vec4(mix(base.rgb, vec3(1.0), w), 1.0);
    }`
  },
  {
    id: 'wipe-right', name: '와이프', category: '기본', ease: 'inOut', defaultDuration: 0.7,
    glsl: `vec4 transition(vec2 uv){
      float soft = 0.08;
      float edge = mix(-soft, 1.0 + soft, uProgress);
      float m = smoothstep(edge - soft, edge + soft, uv.x + (uv.y - 0.5) * 0.15);
      return mix(getTo(uv), getFrom(uv), m);
    }`
  },
  {
    id: 'circle-open', name: '원형 열기', category: '기본', ease: 'inOut', defaultDuration: 0.8,
    glsl: `vec4 transition(vec2 uv){
      vec2 d = (uv - 0.5) * vec2(uRatio, 1.0);
      float maxR = length(vec2(uRatio, 1.0)) * 0.5;
      float r = uProgress * (maxR + 0.05);
      float m = smoothstep(r - 0.02, r + 0.02, length(d));
      return mix(getTo(uv), getFrom(uv), m);
    }`
  },
  {
    id: 'slide-left', name: '슬라이드 왼쪽', category: '슬라이드', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      return uv.x > 1.0 - p ? getTo(vec2(uv.x - (1.0 - p), uv.y)) : getFrom(uv);
    }`
  },
  {
    id: 'slide-right', name: '슬라이드 오른쪽', category: '슬라이드', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      return uv.x < p ? getTo(vec2(uv.x + (1.0 - p), uv.y)) : getFrom(uv);
    }`
  },
  {
    id: 'slide-up', name: '슬라이드 위', category: '슬라이드', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      return uv.y < p ? getTo(vec2(uv.x, uv.y + (1.0 - p))) : getFrom(uv);
    }`
  },
  {
    id: 'push-left', name: '밀어내기', category: '슬라이드', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec2 f = uv + vec2(p, 0.0);
      vec2 t = uv - vec2(1.0 - p, 0.0);
      return f.x < 1.0 ? getFrom(f) : getTo(t);
    }`
  },
  {
    id: 'push-up', name: '위로 밀기', category: '슬라이드', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec2 f = uv - vec2(0.0, p);
      vec2 t = uv + vec2(0.0, 1.0 - p);
      return f.y > 0.0 ? getFrom(f) : getTo(t);
    }`
  },
  {
    id: 'whip-pan', name: '휙 패닝', category: '카메라', ease: 'inOut', defaultDuration: 0.45,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      float speed = sin(p * PI);
      vec4 acc = vec4(0.0);
      for (int i = 0; i < 16; i++) {
        float o = (float(i) / 15.0 - 0.5) * 0.18 * speed;
        vec2 q = vec2(uv.x + p + o, uv.y);
        acc += q.x < 1.0 ? getFrom(vec2(q.x, q.y)) : getTo(vec2(q.x - 1.0, q.y));
      }
      return acc / 16.0;
    }`
  },
  {
    id: 'zoom-in', name: '줌 인', category: '카메라', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec2 c = uv - 0.5;
      vec4 acc = vec4(0.0);
      float blur = sin(p * PI) * 0.12;
      for (int i = 0; i < 12; i++) {
        float k = float(i) / 11.0;
        float s1 = 1.0 + p * 1.5 + blur * k;
        float s2 = 2.0 - p + blur * k;
        vec4 a = getFrom(0.5 + c / s1);
        vec4 b = getTo(0.5 + c / max(s2, 1.0));
        acc += mix(a, b, smoothstep(0.4, 0.6, p));
      }
      return acc / 12.0;
    }`
  },
  {
    id: 'zoom-out', name: '줌 아웃', category: '카메라', ease: 'inOut', defaultDuration: 0.6,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec2 c = uv - 0.5;
      float s1 = 1.0 / (1.0 + p * 0.6);
      float s2 = 1.6 - 0.6 * p;
      vec4 a = getFrom(0.5 + c / s1);
      vec4 b = getTo(0.5 + c / s2);
      return mix(a, b, smoothstep(0.3, 0.7, p));
    }`
  },
  {
    id: 'spin', name: '회전', category: '카메라', ease: 'inOut', defaultDuration: 0.7,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec2 c = (uv - 0.5) * vec2(uRatio, 1.0);
      float ang = p * PI * 2.0;
      float s = 1.0 + sin(p * PI) * 1.2;
      mat2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      vec2 q = (r * c) * s / vec2(uRatio, 1.0) + 0.5;
      return p < 0.5 ? getFrom(q) : getTo(q);
    }`
  },
  {
    id: 'blur', name: '블러', category: '특수', ease: 'inOut', defaultDuration: 0.7,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      float r = sin(p * PI) * 0.025;
      vec4 a = vec4(0.0); vec4 b = vec4(0.0);
      for (int i = 0; i < 24; i++) {
        float t = float(i);
        float rr = r * sqrt((t + 0.5) / 24.0);
        vec2 o = vec2(cos(t * 2.39996), sin(t * 2.39996)) * rr * vec2(1.0 / uRatio, 1.0);
        a += getFrom(uv + o);
        b += getTo(uv + o);
      }
      return mix(a, b, smoothstep(0.3, 0.7, p)) / 24.0;
    }`
  },
  {
    id: 'pixelate', name: '픽셀화', category: '특수', ease: 'linear', defaultDuration: 0.7,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      float k = 1.0 - abs(p - 0.5) * 2.0;
      float cells = mix(400.0, 12.0, pow(k, 0.7));
      vec2 grid = vec2(cells * uRatio, cells);
      vec2 q = k > 0.02 ? (floor(uv * grid) + 0.5) / grid : uv;
      return mix(getFrom(q), getTo(q), step(0.5, p));
    }`
  },
  {
    id: 'glitch', name: '글리치', category: '특수', ease: 'linear', defaultDuration: 0.5,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      float k = 1.0 - abs(p - 0.5) * 2.0;
      float t = floor(p * 18.0);
      float row = floor(uv.y * 24.0);
      float n = rand(vec2(row, t));
      vec2 q = uv;
      if (n > 1.0 - k * 0.6) q.x += (rand(vec2(t, row)) - 0.5) * 0.25 * k;
      float split = 0.02 * k;
      bool useTo = p > 0.5;
      vec4 r = useTo ? getTo(q + vec2(split, 0.0)) : getFrom(q + vec2(split, 0.0));
      vec4 g = useTo ? getTo(q) : getFrom(q);
      vec4 b = useTo ? getTo(q - vec2(split, 0.0)) : getFrom(q - vec2(split, 0.0));
      return vec4(r.r, g.g, b.b, 1.0);
    }`
  },
  {
    id: 'ripple', name: '물결', category: '특수', ease: 'inOut', defaultDuration: 0.8,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      vec2 d = (uv - 0.5) * vec2(uRatio, 1.0);
      float dist = length(d);
      float amp = sin(p * PI) * 0.03;
      vec2 off = normalize(d + 1e-5) * sin(dist * 40.0 - p * 30.0) * amp / vec2(uRatio, 1.0);
      return mix(getFrom(uv + off), getTo(uv + off), smoothstep(0.2, 0.8, p));
    }`
  },
  {
    id: 'split-open', name: '스플릿', category: '특수', ease: 'inOut', defaultDuration: 0.7,
    glsl: `vec4 transition(vec2 uv){
      float p = uProgress;
      float half_ = p * 0.5;
      if (abs(uv.x - 0.5) < half_) return getTo(uv);
      vec2 q = uv.x < 0.5 ? vec2(uv.x + half_, uv.y) : vec2(uv.x - half_, uv.y);
      return getFrom(q);
    }`
  },
  {
    id: 'heart', name: '하트', category: '특수', ease: 'inOut', defaultDuration: 0.9,
    glsl: `vec4 transition(vec2 uv){
      // uv.y points up in GL, so the lobes of the implicit heart curve sit on top
      vec2 o = (uv - vec2(0.5, 0.5)) * vec2(uRatio, 1.0) / max(uProgress * 1.9, 1e-4);
      float x = o.x * 1.1, y = o.y * 1.1 + 0.1;
      float h = pow(x * x + y * y - 0.3, 3.0) - x * x * y * y * y;
      return h < 0.0 ? getTo(uv) : getFrom(uv);
    }`
  }
]

export const TRANSITION_MAP = new Map(TRANSITIONS.map((t) => [t.id, t]))

export function ease(kind: Ease, x: number): number {
  x = Math.min(1, Math.max(0, x))
  switch (kind) {
    case 'in': return x * x * x
    case 'out': return 1 - Math.pow(1 - x, 3)
    case 'inOut': return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
    default: return x
  }
}
