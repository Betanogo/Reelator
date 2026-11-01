import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '@shared/model/store'
import { ClipLayout, MIN_CLIP, computeLayout, formatShort } from '@shared/model/timeline'
import { AudioClip } from '@shared/model/types'
import { FILTER_MAP } from '@shared/engine/filters'
import { IconMusic, IconPlus, IconTransition } from './micons'

/**
 * CapCut-style timeline: the playhead stays in the middle and the tracks scroll under it.
 * Scrolling scrubs; pinch zooms; tap selects; white handles trim.
 */
export function MobileTimeline({ onAdd, onAddAudio }: { onAdd(): void; onAddAudio(): void }) {
  const project = useEditor((s) => s.project)
  const zoom = useEditor((s) => s.zoom)
  const selection = useEditor((s) => s.selection)
  const layout = useMemo(() => computeLayout(project), [project])
  const mediaById = useMemo(() => new Map(project.media.map((m) => [m.id, m])), [project.media])
  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLCanvasElement>(null)
  const [half, setHalf] = useState(180)
  const programmatic = useRef(false)
  const st = useEditor.getState()

  useLayoutEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => setHalf(Math.round(el.clientWidth / 2)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const x = (t: number) => half + t * zoom
  const width = half * 2 + layout.total * zoom + 80

  // playhead → scroll position
  useEffect(() => {
    const el = scrollRef.current!
    const apply = (t: number) => {
      const target = Math.round(t * useEditor.getState().zoom)
      if (Math.abs(el.scrollLeft - target) > 0.5) {
        programmatic.current = true
        el.scrollLeft = target
      }
    }
    apply(useEditor.getState().playhead)
    return useEditor.subscribe((s, prev) => {
      if (s.playhead !== prev.playhead || s.zoom !== prev.zoom) apply(s.playhead)
    })
  }, [half])

  // scroll → playhead (user scrubbing)
  const onScroll = () => {
    const el = scrollRef.current!
    drawRuler()
    if (programmatic.current) { programmatic.current = false; return }
    const s = useEditor.getState()
    if (s.playing) s.setPlaying(false)
    s.setPlayhead(el.scrollLeft / s.zoom)
  }

  // pinch to zoom
  useEffect(() => {
    const el = scrollRef.current!
    let d0 = 0, z0 = 0
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    const start = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = dist(e); z0 = useEditor.getState().zoom } }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !d0) return
      e.preventDefault()
      useEditor.getState().setZoom(z0 * (dist(e) / d0))
    }
    const end = (e: TouchEvent) => { if (e.touches.length < 2) d0 = 0 }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
    }
  }, [])

  const drawRuler = () => {
    const c = rulerRef.current, el = scrollRef.current
    if (!c || !el) return
    const dpr = window.devicePixelRatio || 1
    const w = el.clientWidth, h = 24
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; c.style.width = `${w}px`; c.style.height = `${h}px` }
    c.style.left = `${el.scrollLeft}px`
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const z = useEditor.getState().zoom
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    const major = steps.find((s) => s * z >= 70) ?? 300
    const minor = major / 2
    const tFrom = Math.max(0, (el.scrollLeft - half) / z - major)
    const tTo = (el.scrollLeft + w - half) / z + major
    g.font = '10px system-ui, sans-serif'
    g.textBaseline = 'top'
    for (let t = Math.floor(tFrom / minor) * minor; t <= tTo; t += minor) {
      const px = half + t * z - el.scrollLeft
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
      g.fillStyle = isMajor ? '#8d8da3' : '#45455a'
      if (isMajor) {
        const label = t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${t % 1 ? t.toFixed(1) : t}s`
        g.fillText(label, px - 8, 6)
      } else {
        g.beginPath(); g.arc(px, 11, 1.4, 0, Math.PI * 2); g.fill()
      }
    }
  }
  useEffect(drawRuler)

  // ------------------------------------------------------------ trimming
  const trimClip = (e: React.PointerEvent, l: ClipLayout, edge: 'l' | 'r') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const media = mediaById.get(l.clip.mediaId)
    const isImage = media?.kind === 'image'
    const maxOut = isImage ? Infinity : media?.duration ?? l.clip.out
    const orig = { in: l.clip.in, out: l.clip.out }
    const x0 = e.clientX
    st.beginGesture()
    const target = e.currentTarget
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / useEditor.getState().zoom
      st.mutate((p) => {
        const c = p.clips.find((y) => y.id === l.clip.id)
        if (!c) return
        if (edge === 'r') c.out = Math.min(maxOut, Math.max(orig.in + MIN_CLIP, orig.out + d))
        else if (isImage) c.out = Math.max(MIN_CLIP, orig.out - d)
        else c.in = Math.max(0, Math.min(orig.out - MIN_CLIP, orig.in + d))
      })
    }
    const up = () => {
      target.removeEventListener('pointermove', move as EventListener)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      st.endGesture()
    }
    target.addEventListener('pointermove', move as EventListener)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const trimAudio = (e: React.PointerEvent, a: AudioClip, edge: 'l' | 'r' | 'move') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const m = mediaById.get(a.mediaId)
    const orig = { start: a.start, in: a.in, out: a.out }
    const x0 = e.clientX
    st.beginGesture()
    const target = e.currentTarget
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / useEditor.getState().zoom
      st.mutate((p) => {
        const y = p.audio.find((q) => q.id === a.id)
        if (!y) return
        if (edge === 'move') y.start = Math.max(0, orig.start + d)
        else if (edge === 'r') y.out = Math.min(m?.duration ?? orig.out, Math.max(orig.in + MIN_CLIP, orig.out + d))
        else {
          const dd = Math.min(orig.out - MIN_CLIP - orig.in, Math.max(-orig.in, -orig.start, d))
          y.start = orig.start + dd
          y.in = orig.in + dd
        }
      })
    }
    const up = () => {
      target.removeEventListener('pointermove', move as EventListener)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      st.endGesture()
    }
    target.addEventListener('pointermove', move as EventListener)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const items = layout.items
  const audioEnd = project.audio.reduce((e, a) => Math.max(e, a.start + a.out - a.in), 0)

  return (
    <div className="m-timeline">
      <div className="m-tl-scroll" ref={scrollRef} onScroll={onScroll}
        onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('m-tl-inner')) st.select(null) }}>
        <div className="m-tl-inner" style={{ width }}>
          <canvas className="m-ruler" ref={rulerRef} />

          <div className="m-track main" style={{ width }} onClick={(e) => { if (e.target === e.currentTarget) st.select(null) }}>
            {items.map((l) => {
              const m = mediaById.get(l.clip.mediaId)
              const sel = selection?.type === 'clip' && selection.id === l.clip.id
              const filterName = l.clip.filter.preset ? FILTER_MAP.get(l.clip.filter.preset)?.name : null
              return (
                <div key={l.clip.id} className={`m-clip ${sel ? 'sel' : ''}`}
                  style={{ left: x(l.start), width: Math.max(6, l.duration * zoom), zIndex: sel ? 5 : l.index + 1,
                    backgroundImage: m?.thumbnail ? `url("${m.thumbnail}")` : undefined }}
                  onClick={(e) => { e.stopPropagation(); st.select(sel ? null : { type: 'clip', id: l.clip.id }) }}>
                  <div className="lbl">{formatShort(l.duration)}</div>
                  {filterName && <div className="badge">{filterName}</div>}
                  {sel && <>
                    <div className="m-handle l" onPointerDown={(e) => trimClip(e, l, 'l')} onClick={(e) => e.stopPropagation()} />
                    <div className="m-handle r" onPointerDown={(e) => trimClip(e, l, 'r')} onClick={(e) => e.stopPropagation()} />
                  </>}
                </div>
              )
            })}
            {items.slice(0, -1).map((l) => {
              const next = items[l.index + 1]
              const has = !!l.clip.transitionOut
              const sel = selection?.type === 'transition' && selection.id === l.clip.id
              return (
                <div key={`j${l.clip.id}`}>
                  {l.transOut > 0 && <div className="m-trans-span" style={{ left: x(next.start), width: l.transOut * zoom }} />}
                  <button className={`m-junction ${has ? 'has' : ''} ${sel ? 'sel' : ''}`}
                    style={{ left: x(next.start + l.transOut / 2) }}
                    onClick={(e) => { e.stopPropagation(); st.select({ type: 'transition', id: l.clip.id }) }}>
                    {has ? <IconTransition size={14} /> : <span style={{ width: 8, height: 2, background: '#222', display: 'block' }} />}
                  </button>
                </div>
              )
            })}
            <button className="m-add" style={{ left: x(layout.mainEnd) + 14 }} onClick={(e) => { e.stopPropagation(); onAdd() }} aria-label="미디어 추가">
              <IconPlus size={24} />
            </button>
          </div>

          <div className="m-track audio" style={{ width }}>
            {project.audio.map((a) => {
              const m = mediaById.get(a.mediaId)
              const dur = a.out - a.in
              const sel = selection?.type === 'audio' && selection.id === a.id
              return (
                <div key={a.id} className={`m-clip audio-clip ${sel ? 'sel' : ''}`}
                  style={{ left: x(a.start), width: Math.max(6, dur * zoom), touchAction: sel ? 'none' : undefined }}
                  onPointerDown={sel ? (e) => trimAudio(e, a, 'move') : undefined}
                  onClick={(e) => { e.stopPropagation(); if (!sel) st.select({ type: 'audio', id: a.id }) }}>
                  <div className="wave" />
                  {a.fadeIn > 0 && <div className="fade in" style={{ width: a.fadeIn * zoom }} />}
                  {a.fadeOut > 0 && <div className="fade out" style={{ width: a.fadeOut * zoom }} />}
                  <div className="lbl">♪ {m?.name}</div>
                  {sel && <>
                    <div className="m-handle l" onPointerDown={(e) => trimAudio(e, a, 'l')} />
                    <div className="m-handle r" onPointerDown={(e) => trimAudio(e, a, 'r')} />
                  </>}
                </div>
              )
            })}
            <button className="m-add-audio" style={{ left: x(audioEnd) + (project.audio.length ? 14 : 0) }}
              onClick={(e) => { e.stopPropagation(); onAddAudio() }}>
              <IconMusic size={16} /> 음악 추가
            </button>
          </div>
        </div>
      </div>
      <div className="m-playhead" />
    </div>
  )
}
