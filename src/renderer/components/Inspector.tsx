import { useEditor } from '../model/store'
import { computeLayout, effectiveTransition, formatShort, MAX_TRANSITION } from '../model/timeline'
import { Adjustments, AudioClip, Clip, NO_ADJUST } from '../model/types'
import { FILTER_MAP } from '../engine/filters'
import { TRANSITIONS, TRANSITION_MAP } from '../engine/transitions'
import { Seg, Slider, pct100, secs, signed100 } from './controls'
import { IconReset, IconTrash } from './icons'

export function Inspector() {
  const sel = useEditor((s) => s.selection)
  const project = useEditor((s) => s.project)

  let content: JSX.Element
  let title = '프로젝트'
  if (sel?.type === 'clip') {
    const c = project.clips.find((x) => x.id === sel.id)
    title = '클립'
    content = c ? <ClipInspector clip={c} /> : <></>
  } else if (sel?.type === 'transition') {
    const i = project.clips.findIndex((x) => x.id === sel.id)
    title = '트랜지션'
    content = i >= 0 ? <TransitionInspector clip={project.clips[i]} next={project.clips[i + 1]} /> : <></>
  } else if (sel?.type === 'audio') {
    const a = project.audio.find((x) => x.id === sel.id)
    title = '오디오'
    content = a ? <AudioInspector clip={a} /> : <></>
  } else {
    content = <ProjectInspector />
  }

  return (
    <aside className="inspector">
      <div className="head">
        {title}
        {sel && (
          <button className="icon-btn" title="삭제 (Delete)" onClick={() => useEditor.getState().deleteSelection()}>
            <IconTrash size={16} />
          </button>
        )}
      </div>
      <div className="body">{content}</div>
    </aside>
  )
}

function ClipInspector({ clip }: { clip: Clip }) {
  const media = useEditor((s) => s.project.media.find((m) => m.id === clip.mediaId))
  const st = useEditor.getState()
  const upd = (patch: Partial<Clip>) => st.updateClip(clip.id, patch)
  const updAdj = (k: keyof Adjustments, v: number) =>
    st.mutate((d) => {
      const c = d.clips.find((x) => x.id === clip.id)
      if (c) c.filter.adjust[k] = v
    })
  const preset = clip.filter.preset ? FILTER_MAP.get(clip.filter.preset) : undefined
  const isVideo = media?.kind === 'video'
  const adj = clip.filter.adjust

  const ADJ: [keyof Adjustments, string, number, number][] = [
    ['brightness', '밝기', -1, 1],
    ['contrast', '대비', -1, 1],
    ['saturation', '채도', -1, 1],
    ['temperature', '색온도', -1, 1],
    ['tint', '색조', -1, 1],
    ['highlights', '하이라이트', -1, 1],
    ['shadows', '그림자', -1, 1],
    ['fade', '페이드', 0, 1],
    ['sharpen', '선명도', 0, 1],
    ['vignette', '비네팅', 0, 1],
    ['grain', '그레인', 0, 1]
  ]

  return (
    <>
      <div className="group">
        <div className="info-list">
          <span>파일</span><span title={media?.name}>{media?.name}</span>
          <span>길이</span><span>{formatShort(clip.out - clip.in)}</span>
          {media && media.width > 0 && <><span>해상도</span><span>{media.width}×{media.height}</span></>}
        </div>
      </div>

      <div className="group">
        <div className="group-title">화면</div>
        <div className="row two">
          <label>맞춤</label>
          <Seg value={clip.fit} options={[['contain', '전체 보기'], ['cover', '꽉 채우기']]} onChange={(v) => upd({ fit: v })} />
        </div>
        <Slider label="크기" value={clip.scale} min={0.1} max={4} defaultValue={1} format={pct100} onChange={(v) => upd({ scale: v })} />
        <Slider label="위치 X" value={clip.x} min={-1} max={1} defaultValue={0} format={signed100} onChange={(v) => upd({ x: v })} />
        <Slider label="위치 Y" value={clip.y} min={-1} max={1} defaultValue={0} format={signed100} onChange={(v) => upd({ y: v })} />
        <Slider label="회전" value={clip.rotation} min={-180} max={180} step={1} defaultValue={0} format={(v) => `${Math.round(v)}°`} onChange={(v) => upd({ rotation: v })} />
      </div>

      {isVideo && (
        <div className="group">
          <div className="group-title">
            오디오
            <button className="btn small" onClick={() => upd({ muted: !clip.muted })}>{clip.muted ? '음소거 해제' : '음소거'}</button>
          </div>
          <Slider label="볼륨" value={clip.muted ? 0 : clip.volume} min={0} max={1} defaultValue={1} format={pct100}
            onChange={(v) => upd({ volume: v, muted: false })} />
        </div>
      )}

      <div className="group">
        <div className="group-title">
          필터: {preset ? preset.name : '없음'}
          {preset && <button className="btn small" onClick={() => st.setFilterPreset(clip.id, null)}>제거</button>}
        </div>
        {preset && (
          <Slider label="세기" value={clip.filter.intensity} min={0} max={1} defaultValue={1} format={pct100}
            onChange={(v) => st.mutate((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c) c.filter.intensity = v })} />
        )}
        {!preset && (
          <button className="btn small" onClick={() => st.setLeftTab('filters')}>필터 고르기</button>
        )}
      </div>

      <div className="group">
        <div className="group-title">
          조정
          <button className="icon-btn" title="조정 초기화"
            onClick={() => st.mutate((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c) c.filter.adjust = { ...NO_ADJUST } })}>
            <IconReset size={15} />
          </button>
        </div>
        {ADJ.map(([k, label, min, max]) => (
          <Slider key={k} label={label} value={adj[k]} min={min} max={max} defaultValue={0}
            format={min < 0 ? signed100 : pct100} onChange={(v) => updAdj(k, v)} />
        ))}
      </div>
    </>
  )
}

function TransitionInspector({ clip, next }: { clip: Clip; next?: Clip }) {
  const st = useEditor.getState()
  const t = clip.transitionOut
  if (!t) return <div className="hint">이 두 클립 사이에는 아직 트랜지션이 없어요. 왼쪽 목록에서 원하는 트랜지션을 누르면 바로 적용돼요.</div>
  const def = TRANSITION_MAP.get(t.type)
  const eff = effectiveTransition(clip, next)
  return (
    <>
      <div className="group">
        <div className="row two">
          <label>종류</label>
          <select className="select" value={t.type} onChange={(e) => st.setTransition(clip.id, { ...t, type: e.target.value })}>
            {TRANSITIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <Slider label="길이" value={t.duration} min={0.1} max={MAX_TRANSITION} step={0.05} defaultValue={def?.defaultDuration ?? 0.6}
          format={secs} onChange={(v) => st.mutate((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c?.transitionOut) c.transitionOut.duration = v })} />
        {eff + 0.01 < t.duration && (
          <div className="hint">클립이 짧아서 실제로는 {eff.toFixed(2)}초로 적용돼요.</div>
        )}
      </div>
      <div className="group" style={{ display: 'flex', gap: 8 }}>
        <button className="btn small" onClick={() => st.transitionToAll(t)}>모든 클립 사이에 적용</button>
        <button className="btn small danger" onClick={() => st.setTransition(clip.id, null)}>제거</button>
      </div>
    </>
  )
}

function AudioInspector({ clip }: { clip: AudioClip }) {
  const media = useEditor((s) => s.project.media.find((m) => m.id === clip.mediaId))
  const st = useEditor.getState()
  const upd = (patch: Partial<AudioClip>) => st.updateAudio(clip.id, patch)
  const dur = clip.out - clip.in
  return (
    <>
      <div className="group">
        <div className="info-list">
          <span>파일</span><span title={media?.name}>{media?.name}</span>
          <span>길이</span><span>{formatShort(dur)}</span>
        </div>
      </div>
      <div className="group">
        <Slider label="볼륨" value={clip.volume} min={0} max={1} defaultValue={1} format={pct100} onChange={(v) => upd({ volume: v })} />
        <Slider label="페이드 인" value={clip.fadeIn} min={0} max={Math.min(10, dur / 2)} step={0.1} defaultValue={0} format={secs} onChange={(v) => upd({ fadeIn: v })} />
        <Slider label="페이드 아웃" value={clip.fadeOut} min={0} max={Math.min(10, dur / 2)} step={0.1} defaultValue={0} format={secs} onChange={(v) => upd({ fadeOut: v })} />
      </div>
    </>
  )
}

function ProjectInspector() {
  const s = useEditor((x) => x.project.settings)
  const project = useEditor((x) => x.project)
  const st = useEditor.getState()
  const layout = computeLayout(project)
  return (
    <>
      <div className="group">
        <div className="info-list">
          <span>전체 길이</span><span>{formatShort(layout.total)}</span>
          <span>클립</span><span>{project.clips.length}개</span>
          <span>오디오</span><span>{project.audio.length}개</span>
        </div>
      </div>
      <div className="group">
        <div className="row two">
          <label>프레임</label>
          <select className="select" value={s.fps} onChange={(e) => st.updateSettings({ fps: Number(e.target.value) })}>
            {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </div>
        <div className="row two">
          <label>배경색</label>
          <input type="color" className="color-input" value={s.background}
            onChange={(e) => st.updateSettings({ background: e.target.value })} />
        </div>
      </div>
      <div className="hint">클립이나 클립 사이의 ◇ 버튼을 선택하면 여기서 세부 설정을 바꿀 수 있어요.</div>
    </>
  )
}
