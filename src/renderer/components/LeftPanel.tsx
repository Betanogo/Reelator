import { useEffect, useMemo, useRef, useState } from 'react'
import { LeftTab, useEditor } from '../model/store'
import { formatShort } from '../model/timeline'
import { MediaItem } from '../model/types'
import { FILTERS } from '../engine/filters'
import { TRANSITIONS } from '../engine/transitions'
import { thumbs } from '../engine/thumbs'
import {
  IconEffect, IconFilter, IconImage, IconMedia, IconMusic, IconPlus, IconSticker, IconText, IconTransition
} from './icons'

const TABS: { id: LeftTab; label: string; icon: JSX.Element }[] = [
  { id: 'media', label: '미디어', icon: <IconMedia size={20} /> },
  { id: 'transitions', label: '트랜지션', icon: <IconTransition size={20} /> },
  { id: 'filters', label: '필터', icon: <IconFilter size={20} /> },
  { id: 'text', label: '텍스트', icon: <IconText size={20} /> },
  { id: 'stickers', label: '스티커', icon: <IconSticker size={20} /> },
  { id: 'effects', label: '효과', icon: <IconEffect size={20} /> }
]

export function LeftPanel() {
  const tab = useEditor((s) => s.leftTab)
  return (
    <aside className="left">
      <nav className="rail">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => useEditor.getState().setLeftTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === 'media' && <MediaPanel />}
        {tab === 'transitions' && <TransitionsPanel />}
        {tab === 'filters' && <FiltersPanel />}
        {tab === 'text' && <Coming icon={<IconText size={36} />} what="텍스트와 자막" />}
        {tab === 'stickers' && <Coming icon={<IconSticker size={36} />} what="스티커와 GIF 스티커" />}
        {tab === 'effects' && <Coming icon={<IconEffect size={36} />} what="영상 효과" />}
      </div>
    </aside>
  )
}

function Coming({ icon, what }: { icon: JSX.Element; what: string }) {
  return (
    <div className="coming">
      {icon}
      <div><strong style={{ color: 'var(--text)' }}>{what}</strong><br />다음 단계에서 추가될 예정이에요.</div>
    </div>
  )
}

// ------------------------------------------------------------------ media

export async function pickAndImport() {
  const paths = await window.reelator.openMediaDialog()
  if (paths.length) await useEditor.getState().importFiles(paths)
}

function MediaPanel() {
  const media = useEditor((s) => s.project.media)
  const clips = useEditor((s) => s.project.clips)
  const audio = useEditor((s) => s.project.audio)
  const importing = useEditor((s) => s.importing)
  const used = useMemo(() => new Set([...clips.map((c) => c.mediaId), ...audio.map((a) => a.mediaId)]), [clips, audio])

  return (
    <>
      <div className="panel-title">
        미디어
        {importing && <span className="busy" />}
      </div>
      <div className="import-zone" onClick={pickAndImport}>
        <strong>＋ 가져오기</strong>
        영상, 사진, 음악 파일을 선택하거나<br />창으로 끌어다 놓으세요
      </div>
      {media.length > 0 && (
        <div className="media-grid">
          {media.map((m) => <MediaCard key={m.id} m={m} used={used.has(m.id)} />)}
        </div>
      )}
    </>
  )
}

function MediaCard({ m, used }: { m: MediaItem; used: boolean }) {
  return (
    <div
      className="media-card"
      draggable
      title={m.name}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-reelator-media', m.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDoubleClick={() => useEditor.getState().addToTimeline(m.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        if (confirm(`'${m.name}'을(를) 프로젝트에서 제거할까요? 타임라인에서 사용 중인 클립도 함께 지워져요.`)) {
          useEditor.getState().removeMedia(m.id)
        }
      }}
    >
      {m.thumbnail ? <img src={m.thumbnail} alt="" /> : <div className="ph"><IconMusic size={26} /></div>}
      <div className="name">{m.name}</div>
      <span className="dur">
        {m.kind === 'image' && m.duration <= 0.2 ? <IconImage size={11} /> : formatShort(m.duration)}
      </span>
      {used && <span className="used" title="타임라인에서 사용 중" />}
      <button className="add" title="타임라인에 추가" onClick={(e) => { e.stopPropagation(); useEditor.getState().addToTimeline(m.id) }}>
        <IconPlus size={14} />
      </button>
    </div>
  )
}

// ------------------------------------------------------------ transitions

function useTargetJunction(): string | null {
  // The junction a transition gets applied to: selected transition, or the selected clip's outgoing junction.
  const sel = useEditor((s) => s.selection)
  const clips = useEditor((s) => s.project.clips)
  if (!sel || sel.type === 'audio') return null
  const i = clips.findIndex((c) => c.id === sel.id)
  if (i < 0 || i >= clips.length - 1) return null
  return clips[i].id
}

function TransitionsPanel() {
  const target = useTargetJunction()
  const current = useEditor((s) => (target ? s.project.clips.find((c) => c.id === target)?.transitionOut?.type ?? null : null))
  const categories = useMemo(() => [...new Set(TRANSITIONS.map((t) => t.category))], [])

  const apply = (id: string | null) => {
    if (!target) return
    const def = TRANSITIONS.find((t) => t.id === id)
    const prev = useEditor.getState().project.clips.find((c) => c.id === target)?.transitionOut
    useEditor.getState().setTransition(target, def ? { type: def.id, duration: prev?.duration ?? def.defaultDuration } : null)
  }

  return (
    <>
      <div className="panel-title">트랜지션</div>
      {!target && (
        <div className="hint">타임라인에서 클립 사이의 ◇ 버튼이나 클립을 선택한 뒤, 적용할 트랜지션을 누르세요. 마우스를 올리면 미리보기가 재생돼요.</div>
      )}
      <div className="card-grid">
        <button className={`fx-card ${target && !current ? 'active' : ''}`} onClick={() => apply(null)} disabled={!target}>
          <div className="none">없음</div>
          <span>없음</span>
        </button>
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="section-label">{cat}</div>
          <div className="card-grid">
            {TRANSITIONS.filter((t) => t.category === cat).map((t) => (
              <TransitionCard key={t.id} id={t.id} name={t.name} active={current === t.id} onClick={() => apply(t.id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function TransitionCard({ id, name, active, onClick }: { id: string; name: string; active: boolean; onClick(): void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (!hover) { thumbs().transition(c, id, 0.5); return }
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      const cycle = ((now - t0) / 1600) % 1
      // hold A, transition, hold B
      const p = cycle < 0.2 ? 0 : cycle > 0.8 ? 1 : (cycle - 0.2) / 0.6
      thumbs().transition(c, id, p)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [hover, id])
  return (
    <button className={`fx-card ${active ? 'active' : ''}`} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <canvas ref={ref} width={192} height={108} />
      <span>{name}</span>
    </button>
  )
}

// ---------------------------------------------------------------- filters

function FiltersPanel() {
  const sel = useEditor((s) => s.selection)
  const clip = useEditor((s) => (sel?.type === 'clip' ? s.project.clips.find((c) => c.id === sel.id) : undefined))
  const media = useEditor((s) => (clip ? s.project.media.find((m) => m.id === clip.mediaId) : undefined))
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!media?.thumbnail) { setImg(null); return }
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = media.thumbnail
  }, [media?.thumbnail])

  const categories = useMemo(() => [...new Set(FILTERS.map((f) => f.category))], [])
  const current = clip?.filter.preset ?? null
  const apply = (id: string | null) => { if (clip) useEditor.getState().setFilterPreset(clip.id, id) }

  return (
    <>
      <div className="panel-title">
        필터
        {clip && <button className="btn small" onClick={() => useEditor.getState().filterToAll(clip.id)}>모든 클립에 적용</button>}
      </div>
      {!clip && <div className="hint">타임라인에서 클립을 선택하면 그 클립에 필터를 적용할 수 있어요. 세기와 세부 조정은 오른쪽 패널에서 바꿀 수 있어요.</div>}
      <div className="card-grid">
        <button className={`fx-card ${clip && !current ? 'active' : ''}`} onClick={() => apply(null)}>
          <FilterThumb preset={null} img={img} />
          <span>원본</span>
        </button>
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="section-label">{cat}</div>
          <div className="card-grid">
            {FILTERS.filter((f) => f.category === cat).map((f) => (
              <button key={f.id} className={`fx-card ${current === f.id ? 'active' : ''}`} onClick={() => apply(f.id)}>
                <FilterThumb preset={f.id} img={img} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function FilterThumb({ preset, img }: { preset: string | null; img: HTMLImageElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) thumbs().filter(ref.current, preset, img)
  }, [preset, img])
  return <canvas ref={ref} width={192} height={108} />
}
