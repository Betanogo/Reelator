import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '@shared/model/store'
import { computeLayout, effectiveTransition, formatShort, MAX_TRANSITION } from '@shared/model/timeline'
import { ASPECTS, Adjustments, AspectId, NO_ADJUST, frameSize } from '@shared/model/types'
import { FILTERS } from '@shared/engine/filters'
import { TRANSITIONS, TRANSITION_MAP } from '@shared/engine/transitions'
import { thumbs } from '@shared/engine/thumbs'
import { Seg, Slider, pct100, secs, signed100 } from '@shared/components/controls'
import { MobileExportProgress, cleanExports, exportOnPhone } from './exportMobile'
import { IconCheck, IconDownload, IconReset, IconShare } from './micons'

/** True while an export is running (blocks closing the sheet). */
export const exportState = { busy: false }

export type SheetKind = 'filters' | 'transitions' | 'adjust' | 'screen' | 'volume' | 'fade' | 'ratio' | 'background' | 'export'

const TITLES: Record<SheetKind, string> = {
  filters: '필터', transitions: '트랜지션', adjust: '조정', screen: '화면', volume: '볼륨', fade: '페이드',
  ratio: '비율', background: '배경', export: '내보내기'
}

export function Sheets({ kind, onClose }: { kind: SheetKind; onClose(): void }) {
  const exporting = useRef(false)
  return (
    <>
      <div className="sheet-backdrop" onClick={() => !exporting.current && onClose()} />
      <div className="sheet">
        <div className="sheet-head">
          {TITLES[kind]}
          <button className="tap" onClick={() => !exporting.current && onClose()} aria-label="완료"><IconCheck /></button>
        </div>
        <div className="sheet-body">
          {kind === 'filters' && <FiltersSheet />}
          {kind === 'transitions' && <TransitionsSheet />}
          {kind === 'adjust' && <AdjustSheet />}
          {kind === 'screen' && <ScreenSheet />}
          {kind === 'volume' && <VolumeSheet />}
          {kind === 'fade' && <FadeSheet />}
          {kind === 'ratio' && <RatioSheet />}
          {kind === 'background' && <BackgroundSheet />}
          {kind === 'export' && <ExportSheet busyRef={exporting} />}
        </div>
      </div>
    </>
  )
}

function useSelectedClip() {
  const sel = useEditor((s) => s.selection)
  return useEditor((s) => (sel && sel.type !== 'audio' ? s.project.clips.find((c) => c.id === sel.id) : undefined))
}

// --------------------------------------------------------------- filters

function FilterThumb({ preset, img }: { preset: string | null; img: HTMLImageElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) thumbs().filter(ref.current, preset, img) }, [preset, img])
  return <canvas ref={ref} width={192} height={108} />
}

function FiltersSheet() {
  const clip = useSelectedClip()
  const firstClip = useEditor((s) => s.project.clips[0])
  const target = clip ?? firstClip
  const media = useEditor((s) => (target ? s.project.media.find((m) => m.id === target.mediaId) : undefined))
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const cats = useMemo(() => [...new Set(FILTERS.map((f) => f.category))], [])
  const [cat, setCat] = useState(cats[0])
  const st = useEditor.getState()

  useEffect(() => {
    if (!media?.thumbnail) { setImg(null); return }
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = media.thumbnail
  }, [media?.thumbnail])

  const current = target?.filter.preset ?? null
  const apply = (id: string | null) => {
    if (clip) st.setFilterPreset(clip.id, id)
    else st.mutate((d) => d.clips.forEach((c) => { c.filter.preset = id }))
  }

  return (
    <>
      {!clip && <div className="note">선택한 클립이 없어서 모든 클립에 적용돼요.</div>}
      <div className="chip-row">
        {cats.map((c) => <button key={c} className={`chip ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="hscroll">
        <button className={`fx ${!current ? 'on' : ''}`} onClick={() => apply(null)}>
          <div className="none">없음</div><span>원본</span>
        </button>
        {FILTERS.filter((f) => f.category === cat).map((f) => (
          <button key={f.id} className={`fx ${current === f.id ? 'on' : ''}`} onClick={() => apply(f.id)}>
            <FilterThumb preset={f.id} img={img} /><span>{f.name}</span>
          </button>
        ))}
      </div>
      {target && current && (
        <Slider label="세기" value={target.filter.intensity} min={0} max={1} defaultValue={1} format={pct100}
          onChange={(v) => st.mutate((d) => {
            const list = clip ? d.clips.filter((c) => c.id === clip.id) : d.clips
            list.forEach((c) => { c.filter.intensity = v })
          })} />
      )}
      {clip && project_has_many() && (
        <div className="sheet-actions"><button className="pill" onClick={() => st.filterToAll(clip.id)}>모든 클립에 적용</button></div>
      )}
    </>
  )
}

function project_has_many() {
  return useEditor.getState().project.clips.length > 1
}

// ----------------------------------------------------------- transitions

function TransitionCard({ id, name, on, onClick }: { id: string; name: string; on: boolean; onClick(): void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (!on) { thumbs().transition(c, id, 0.5); return }
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      const cyc = ((now - t0) / 1600) % 1
      thumbs().transition(c, id, cyc < 0.2 ? 0 : cyc > 0.8 ? 1 : (cyc - 0.2) / 0.6)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id, on])
  return (
    <button className={`fx ${on ? 'on' : ''}`} onClick={onClick}>
      <canvas ref={ref} width={192} height={108} /><span>{name}</span>
    </button>
  )
}

function TransitionsSheet() {
  const sel = useEditor((s) => s.selection)
  const clips = useEditor((s) => s.project.clips)
  const st = useEditor.getState()
  const idx = sel && sel.type !== 'audio' ? clips.findIndex((c) => c.id === sel.id) : -1
  const clip = idx >= 0 && idx < clips.length - 1 ? clips[idx] : undefined
  const t = clip?.transitionOut ?? null
  const cats = useMemo(() => [...new Set(TRANSITIONS.map((x) => x.category))], [])
  const [cat, setCat] = useState(t ? TRANSITION_MAP.get(t.type)?.category ?? cats[0] : cats[0])

  if (!clip) return <div className="note">클립 사이의 작은 버튼을 눌러 트랜지션을 넣을 위치를 고르세요.</div>

  const apply = (id: string | null) => {
    const def = id ? TRANSITION_MAP.get(id) : undefined
    st.setTransition(clip.id, def ? { type: def.id, duration: t?.duration ?? def.defaultDuration } : null)
  }
  const eff = effectiveTransition(clip, clips[idx + 1])

  return (
    <>
      <div className="chip-row">
        {cats.map((c) => <button key={c} className={`chip ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="hscroll">
        <button className={`fx ${!t ? 'on' : ''}`} onClick={() => apply(null)}><div className="none">없음</div><span>없음</span></button>
        {TRANSITIONS.filter((x) => x.category === cat).map((x) => (
          <TransitionCard key={x.id} id={x.id} name={x.name} on={t?.type === x.id} onClick={() => apply(x.id)} />
        ))}
      </div>
      {t && (
        <>
          <Slider label="길이" value={t.duration} min={0.1} max={MAX_TRANSITION} step={0.05} defaultValue={0.6} format={secs}
            onChange={(v) => st.mutate((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c?.transitionOut) c.transitionOut.duration = v })} />
          {eff + 0.01 < t.duration && <div className="note">클립이 짧아서 실제로는 {eff.toFixed(2)}초로 적용돼요.</div>}
          <div className="sheet-actions">
            <button className="pill" onClick={() => st.transitionToAll(t)}>모든 클립에 적용</button>
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- adjust

const ADJ: [keyof Adjustments, string, number, number][] = [
  ['brightness', '밝기', -1, 1], ['contrast', '대비', -1, 1], ['saturation', '채도', -1, 1],
  ['temperature', '색온도', -1, 1], ['tint', '색조', -1, 1], ['highlights', '하이라이트', -1, 1],
  ['shadows', '그림자', -1, 1], ['fade', '페이드', 0, 1], ['sharpen', '선명도', 0, 1],
  ['vignette', '비네팅', 0, 1], ['grain', '그레인', 0, 1]
]

function AdjustSheet() {
  const clip = useSelectedClip()
  const [key, setKey] = useState<keyof Adjustments>('brightness')
  const st = useEditor.getState()
  if (!clip) return <div className="note">클립을 먼저 선택하세요.</div>
  const [, label, min, max] = ADJ.find((a) => a[0] === key)!
  const set = (k: keyof Adjustments, v: number) =>
    st.mutate((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c) c.filter.adjust[k] = v })
  return (
    <>
      <div className="chip-row">
        {ADJ.map(([k, l]) => (
          <button key={k} className={`chip ${k === key ? 'on' : ''}`} onClick={() => setKey(k)}>
            {l}{clip.filter.adjust[k] !== 0 ? ' •' : ''}
          </button>
        ))}
      </div>
      <div className="big-slider">
        <Slider label={label} value={clip.filter.adjust[key]} min={min} max={max} defaultValue={0}
          format={min < 0 ? signed100 : pct100} onChange={(v) => set(key, v)} />
      </div>
      <div className="sheet-actions">
        <button className="pill" onClick={() => st.mutate((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c) c.filter.adjust = { ...NO_ADJUST } })}>
          <IconReset size={16} /> 전체 초기화
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- screen

function ScreenSheet() {
  const clip = useSelectedClip()
  const st = useEditor.getState()
  if (!clip) return <div className="note">클립을 먼저 선택하세요.</div>
  const upd = (patch: Partial<typeof clip>) => st.updateClip(clip.id, patch)
  return (
    <>
      <div className="row two">
        <label>맞춤</label>
        <Seg value={clip.fit} options={[['contain', '전체 보기'], ['cover', '꽉 채우기']]} onChange={(v) => upd({ fit: v })} />
      </div>
      <Slider label="크기" value={clip.scale} min={0.1} max={4} defaultValue={1} format={pct100} onChange={(v) => upd({ scale: v })} />
      <Slider label="좌우" value={clip.x} min={-1} max={1} defaultValue={0} format={signed100} onChange={(v) => upd({ x: v })} />
      <Slider label="상하" value={clip.y} min={-1} max={1} defaultValue={0} format={signed100} onChange={(v) => upd({ y: v })} />
      <Slider label="회전" value={clip.rotation} min={-180} max={180} step={1} defaultValue={0} format={(v) => `${Math.round(v)}°`} onChange={(v) => upd({ rotation: v })} />
    </>
  )
}

// ---------------------------------------------------------------- audio

function VolumeSheet() {
  const sel = useEditor((s) => s.selection)
  const clip = useSelectedClip()
  const audio = useEditor((s) => (sel?.type === 'audio' ? s.project.audio.find((a) => a.id === sel.id) : undefined))
  const st = useEditor.getState()
  if (clip) {
    return (
      <>
        <Slider label="볼륨" value={clip.muted ? 0 : clip.volume} min={0} max={1} defaultValue={1} format={pct100}
          onChange={(v) => st.updateClip(clip.id, { volume: v, muted: false })} />
        <div className="sheet-actions">
          <button className="pill" onClick={() => st.updateClip(clip.id, { muted: !clip.muted })}>{clip.muted ? '음소거 해제' : '음소거'}</button>
        </div>
      </>
    )
  }
  if (audio) {
    return <Slider label="볼륨" value={audio.volume} min={0} max={1} defaultValue={1} format={pct100} onChange={(v) => st.updateAudio(audio.id, { volume: v })} />
  }
  return <div className="note">클립을 먼저 선택하세요.</div>
}

function FadeSheet() {
  const sel = useEditor((s) => s.selection)
  const a = useEditor((s) => (sel?.type === 'audio' ? s.project.audio.find((x) => x.id === sel.id) : undefined))
  const st = useEditor.getState()
  if (!a) return <div className="note">오디오를 먼저 선택하세요.</div>
  const max = Math.min(10, (a.out - a.in) / 2)
  return (
    <>
      <Slider label="페이드 인" value={a.fadeIn} min={0} max={max} step={0.1} defaultValue={0} format={secs} onChange={(v) => st.updateAudio(a.id, { fadeIn: v })} />
      <Slider label="페이드 아웃" value={a.fadeOut} min={0} max={max} step={0.1} defaultValue={0} format={secs} onChange={(v) => st.updateAudio(a.id, { fadeOut: v })} />
    </>
  )
}

// ---------------------------------------------------------- ratio & bg

function RatioSheet() {
  const aspect = useEditor((s) => s.project.settings.aspect)
  const st = useEditor.getState()
  return (
    <div className="ratio-grid">
      {(Object.keys(ASPECTS) as AspectId[]).map((a) => {
        const [w, h] = ASPECTS[a]
        const s = 26 / Math.max(w, h)
        return (
          <button key={a} className={`ratio-btn ${a === aspect ? 'on' : ''}`} onClick={() => st.updateSettings({ aspect: a })}>
            <i style={{ width: w * s, height: h * s }} />{a}
          </button>
        )
      })}
    </div>
  )
}

const COLORS = ['#000000', '#ffffff', '#1f1f29', '#7a7a8c', '#ff3c9a', '#ff5c5c', '#ff9f43', '#ffd43b', '#3be38a', '#26c6da', '#3b82f6', '#7b2ff7', '#a0522d', '#f5e6d3']

function BackgroundSheet() {
  const bg = useEditor((s) => s.project.settings.background)
  const st = useEditor.getState()
  return (
    <>
      <div className="note">사진이나 영상 비율이 화면과 다를 때 빈 공간의 색이에요.</div>
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} className={`swatch ${c === bg ? 'on' : ''}`} style={{ background: c }} onClick={() => st.updateSettings({ background: c })} />
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- export

function ExportSheet({ busyRef }: { busyRef: React.MutableRefObject<boolean> }) {
  const project = useEditor((s) => s.project)
  const [shortSide, setShortSide] = useState(1080)
  const [fps, setFps] = useState(30)
  const [quality, setQuality] = useState<'high' | 'medium' | 'small'>('high')
  const [phase, setPhase] = useState<'setup' | 'running' | 'done' | 'error'>('setup')
  const [prog, setProg] = useState<MobileExportProgress | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ file: File; name: string } | null>(null)
  const cancelled = useRef(false)
  const total = computeLayout(project).total
  const [w, h] = frameSize(project.settings.aspect, shortSide)

  const start = async () => {
    useEditor.getState().setPlaying(false)
    cancelled.current = false
    busyRef.current = true
    exportState.busy = true
    setPhase('running')
    setProg(null)
    let lock: { release(): Promise<void> } | null = null
    try { lock = await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* optional */ }
    try {
      await cleanExports(1)
      const r = await exportOnPhone(project, { shortSide, fps, quality }, setProg, () => cancelled.current)
      if (r === 'cancelled') { setPhase('setup'); return }
      setResult(r)
      setPhase('done')
    } catch (e) {
      console.error(e)
      setError((e as Error).message || String(e))
      setPhase('error')
    } finally {
      busyRef.current = false
      exportState.busy = false
      lock?.release().catch(() => {})
    }
  }

  const share = async () => {
    if (!result) return
    const data = { files: [result.file], title: project.name }
    if (navigator.canShare?.(data)) {
      try { await navigator.share(data) } catch { /* user closed share sheet */ }
    } else {
      download()
    }
  }

  const download = () => {
    if (!result) return
    const url = URL.createObjectURL(result.file)
    const a = document.createElement('a')
    a.href = url
    a.download = result.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    useEditor.getState().showToast('다운로드 폴더에 저장했어요')
  }

  if (phase === 'running') {
    const pct = prog ? (prog.frame / prog.total) * 100 : 0
    return (
      <>
        <div className="note">{prog?.stage === 'audio' || !prog ? '오디오 준비 중…' : prog.stage === 'finishing' ? '마무리 중…' : '영상 만드는 중… 화면을 켜 둔 채로 앱을 벗어나지 마세요'}</div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        <div className="export-meta">
          <span>{Math.floor(pct)}%</span>
          <span>{prog && prog.stage === 'video' ? `남은 시간 약 ${formatShort(Math.max(0, prog.eta))}` : ''}</span>
        </div>
        <div className="sheet-actions"><button className="pill" onClick={() => { cancelled.current = true }}>취소</button></div>
      </>
    )
  }

  if (phase === 'done' && result) {
    return (
      <>
        <div className="note">✅ 완성! ({(result.file.size / 1e6).toFixed(1)}MB) 공유를 누르면 갤러리 저장이나 메신저로 바로 보낼 수 있어요.</div>
        <div className="sheet-actions">
          <button className="pill primary" onClick={share}><IconShare size={16} /> 공유 / 저장</button>
          <button className="pill" onClick={download}><IconDownload size={16} /> 다운로드</button>
        </div>
      </>
    )
  }

  return (
    <>
      {phase === 'error' && <div className="error-box">{error}</div>}
      <div className="row two"><label>해상도</label>
        <Seg value={String(shortSide)} options={[['720', '720p'], ['1080', '1080p'], ['1440', '2K']]} onChange={(v) => setShortSide(Number(v))} />
      </div>
      <div className="row two"><label>프레임</label>
        <Seg value={String(fps)} options={[['24', '24'], ['30', '30'], ['60', '60']]} onChange={(v) => setFps(Number(v))} />
      </div>
      <div className="row two"><label>화질</label>
        <Seg value={quality} options={[['high', '높음'], ['medium', '보통'], ['small', '작게']]} onChange={(v) => setQuality(v as typeof quality)} />
      </div>
      <div className="note">{w}×{h} · {formatShort(total)} · MP4</div>
      <div className="sheet-actions"><button className="pill primary" onClick={start}>내보내기 시작</button></div>
    </>
  )
}
