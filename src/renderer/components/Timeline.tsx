import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../model/store'
import { ClipLayout, Layout, MIN_CLIP, computeLayout, formatShort } from '../model/timeline'
import { AudioClip, MediaItem } from '../model/types'
import { TRANSITION_MAP } from '../engine/transitions'
import { FILTER_MAP } from '../engine/filters'
import { IconFit, IconMinus, IconPlus, IconRedo, IconSplit, IconTrash, IconTransition, IconUndo } from './icons'

const PAD = 16 // px before t=0
const MEDIA_MIME = 'application/x-reelator-media'

const xOf = (t: number, zoom: number) => PAD + t * zoom
const tOf = (x: number, zoom: number) => Math.max(0, (x - PAD) / zoom)

/** Window-level drag helper: calls move(dx) until the pointer is released. */
function drag(e: React.PointerEvent, move: (dx: number, ev: PointerEvent) => void, up?: (dx: number, moved: boolean) => void) {
  const x0 = e.clientX
  let moved = false
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0
    if (Math.abs(dx) > 3) moved = true
    move(dx, ev)
  }
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    up?.(ev.clientX - x0, moved)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

export function Timeline() {
  const project = useEditor((s) => s.project)
  const zoom = useEditor((s) => s.zoom)
  const selection = useEditor((s) => s.selection)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const layout = useMemo(() => computeLayout(project), [project])
  const mediaById = useMemo(() => new Map(project.media.map((m) => [m.id, m])), [project.media])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(800)

  useLayoutEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const contentW = Math.max(viewW, xOf(layout.total, zoom) + 400)

  const fit = useCallback(() => {
    const total = computeLayout(useEditor.getState().project).total
    if (total > 0) useEditor.getState().setZoom((viewW - PAD - 60) / total)
    scrollRef.current?.scrollTo({ left: 0 })
  }, [viewW])

  // Ctrl + wheel zooms around the pointer
  useEffect(() => {
    const el = scrollRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const st = useEditor.getState()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const tAt = tOf(px + el.scrollLeft, st.zoom)
      const z = st.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)
      st.setZoom(z)
      const nz = useEditor.getState().zoom
      requestAnimationFrame(() => { el.scrollLeft = xOf(tAt, nz) - px })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const seekFromEvent = (clientX: number) => {
    const el = scrollRef.current!
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft
    useEditor.getState().setPlayhead(tOf(x, useEditor.getState().zoom))
  }

  const st = useEditor.getState()

  return (
    <section className="timeline">
      <div className="tl-toolbar">
        <button className="icon-btn" title="실행 취소 (Ctrl+Z)" disabled={!canUndo} onClick={() => st.undo()}><IconUndo size={17} /></button>
        <button className="icon-btn" title="다시 실행 (Ctrl+Y)" disabled={!canRedo} onClick={() => st.redo()}><IconRedo size={17} /></button>
        <span className="sep" />
        <button className="icon-btn" title="분할 (S / Ctrl+B)" onClick={() => st.splitAtPlayhead()}><IconSplit size={17} /></button>
        <button className="icon-btn" title="삭제 (Delete)" disabled={!selection} onClick={() => st.deleteSelection()}><IconTrash size={17} /></button>
        <div className="spacer" />
        <button className="icon-btn" title="축소" onClick={() => st.setZoom(st.zoom / 1.3)}><IconMinus size={16} /></button>
        <input type="range" min={0} max={1} step={0.001}
          value={Math.log(zoom / 4) / Math.log(150)}
          style={{ ['--pct' as string]: `${(Math.log(zoom / 4) / Math.log(150)) * 100}%` }}
          onChange={(e) => st.setZoom(4 * Math.pow(150, parseFloat(e.target.value)))} />
        <button className="icon-btn" title="확대" onClick={() => st.setZoom(st.zoom * 1.3)}><IconPlus size={16} /></button>
        <button className="icon-btn" title="전체 보기" onClick={fit}><IconFit size={16} /></button>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" style={{ width: contentW }}>
          <Ruler zoom={zoom} width={contentW} scrollRef={scrollRef} viewW={viewW}
            onSeek={(e) => {
              seekFromEvent(e.clientX)
              drag(e, (_dx, ev) => seekFromEvent(ev.clientX))
            }} />
          <div
            className="tracks"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                st.select(null)
                seekFromEvent(e.clientX)
              }
            }}
          >
            <MainTrack layout={layout} zoom={zoom} mediaById={mediaById} scrollRef={scrollRef} seek={seekFromEvent} />
            <AudioTrack audio={project.audio} zoom={zoom} mediaById={mediaById} scrollRef={scrollRef} seek={seekFromEvent} />
          </div>
          <Playhead zoom={zoom} scrollRef={scrollRef} onDrag={(e) => drag(e, (_dx, ev) => seekFromEvent(ev.clientX))} />
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ ruler

function Ruler({ zoom, width, scrollRef, viewW, onSeek }: {
  zoom: number; width: number; viewW: number
  scrollRef: React.RefObject<HTMLDivElement>
  onSeek(e: React.PointerEvent): void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = scrollRef.current!
    const draw = () => {
      const c = ref.current
      if (!c) return
      const dpr = window.devicePixelRatio || 1
      const w = viewW, h = 26
      c.width = w * dpr
      c.height = h * dpr
      c.style.width = `${w}px`
      c.style.height = `${h}px`
      c.style.left = `${el.scrollLeft}px`
      const g = c.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
      const major = steps.find((s) => s * zoom >= 80) ?? 600
      const minor = major / (major >= 1 && [2, 10, 30, 60, 120, 600].includes(major) ? 4 : 5)
      const t0 = Math.max(0, tOf(el.scrollLeft, zoom) - major)
      const t1 = tOf(el.scrollLeft + w, zoom) + major
      g.font = '10.5px Segoe UI, sans-serif'
      g.textBaseline = 'top'
      for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
        const x = xOf(t, zoom) - el.scrollLeft
        const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
        g.fillStyle = isMajor ? '#6a6a80' : '#3c3c4e'
        g.fillRect(Math.round(x), isMajor ? 14 : 19, 1, isMajor ? 12 : 7)
        if (isMajor) {
          g.fillStyle = '#8d8da3'
          const label = major < 1 ? `${t.toFixed(1)}s` : t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${Math.round(t)}s`
          g.fillText(label, x + 3, 2)
        }
      }
    }
    draw()
    el.addEventListener('scroll', draw)
    return () => el.removeEventListener('scroll', draw)
  }, [zoom, viewW, width, scrollRef])

  return (
    <div className="ruler" style={{ width }} onPointerDown={onSeek}>
      <canvas ref={ref} />
    </div>
  )
}

// --------------------------------------------------------------- playhead

function Playhead({ zoom, scrollRef, onDrag }: { zoom: number; scrollRef: React.RefObject<HTMLDivElement>; onDrag(e: React.PointerEvent): void }) {
  const t = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const x = xOf(t, zoom)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = x - 80
  }, [x, playing, scrollRef])
  return (
    <div className="playhead" style={{ left: x }}>
      <div className="knob" onPointerDown={(e) => { e.stopPropagation(); onDrag(e) }} />
    </div>
  )
}

// ------------------------------------------------------------- main track

interface TrackProps {
  zoom: number
  mediaById: Map<string, MediaItem>
  scrollRef: React.RefObject<HTMLDivElement>
  seek(clientX: number): void
}

function insertIndexAt(layout: Layout, t: number, exclude = -1): number {
  const items = layout.items.filter((l) => l.index !== exclude)
  let idx = items.length
  for (let i = 0; i < items.length; i++) {
    if (t < items[i].start + items[i].duration / 2) { idx = i; break }
  }
  // map back to indices of the full list
  if (exclude >= 0 && idx >= exclude) idx += 1
  return idx
}

function boundaryX(layout: Layout, index: number, zoom: number): number {
  if (index <= 0) return xOf(0, zoom)
  const prev = layout.items[index - 1]
  return xOf(prev ? prev.end : layout.mainEnd, zoom)
}

function MainTrack({ layout, zoom, mediaById, scrollRef, seek }: TrackProps & { layout: Layout }) {
  const selection = useEditor((s) => s.selection)
  const [dropAt, setDropAt] = useState<number | null>(null) // insertion index while dragging media/clips
  const [dragging, setDragging] = useState<{ id: string; dx: number } | null>(null)
  const st = useEditor.getState()

  const xToT = (clientX: number) => {
    const el = scrollRef.current!
    return tOf(clientX - el.getBoundingClientRect().left + el.scrollLeft, zoom)
  }

  const onClipDown = (e: React.PointerEvent, l: ClipLayout) => {
    if (e.button !== 0) return
    e.stopPropagation()
    st.select({ type: 'clip', id: l.clip.id })
    let target: number | null = null
    drag(e, (dx, ev) => {
      if (Math.abs(dx) < 4) return
      target = insertIndexAt(layout, xToT(ev.clientX), l.index)
      setDragging({ id: l.clip.id, dx })
      setDropAt(target)
    }, (_dx, moved) => {
      setDragging(null)
      setDropAt(null)
      if (moved && target !== null && target !== l.index && target !== l.index + 1) st.moveClip(l.index, target)
    })
  }

  const onTrim = (e: React.PointerEvent, l: ClipLayout, edge: 'l' | 'r') => {
    e.stopPropagation()
    const media = mediaById.get(l.clip.mediaId)
    const isImage = media?.kind === 'image'
    const maxOut = isImage ? Infinity : media?.duration ?? l.clip.out
    const orig = { in: l.clip.in, out: l.clip.out }
    st.select({ type: 'clip', id: l.clip.id })
    st.beginGesture()
    drag(e, (dx) => {
      const d = dx / zoom
      st.mutate((p) => {
        const c = p.clips.find((x) => x.id === l.clip.id)
        if (!c) return
        if (edge === 'r') {
          c.out = Math.min(maxOut, Math.max(orig.in + MIN_CLIP, orig.out + d))
        } else if (isImage) {
          c.out = Math.max(MIN_CLIP, orig.out - d)
        } else {
          c.in = Math.max(0, Math.min(orig.out - MIN_CLIP, orig.in + d))
        }
      })
    }, () => st.endGesture())
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(MEDIA_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropAt(insertIndexAt(layout, xToT(e.clientX)))
  }

  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(MEDIA_MIME)
    setDropAt(null)
    if (!id) return
    e.preventDefault()
    const m = mediaById.get(id)
    if (m?.kind === 'audio') st.addToTimeline(id, undefined, xToT(e.clientX))
    else st.addToTimeline(id, insertIndexAt(layout, xToT(e.clientX)))
  }

  const items = layout.items
  return (
    <div className={`track main ${dropAt !== null && !dragging ? 'over' : ''}`}
      onDragOver={onDragOver} onDragLeave={() => setDropAt(null)} onDrop={onDrop}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { st.select(null); seek(e.clientX) } }}>
      {items.length === 0 && <div className="track-empty">영상이나 사진을 여기로 끌어다 놓으세요</div>}

      {items.map((l) => {
        const m = mediaById.get(l.clip.mediaId)
        const sel = selection?.type === 'clip' && selection.id === l.clip.id
        const isDrag = dragging?.id === l.clip.id
        const filterName = l.clip.filter.preset ? FILTER_MAP.get(l.clip.filter.preset)?.name : null
        return (
          <div key={l.clip.id}
            className={`clip ${sel ? 'selected' : ''} ${isDrag ? 'dragging' : ''}`}
            style={{
              left: xOf(l.start, zoom),
              width: Math.max(4, l.duration * zoom),
              backgroundImage: m?.thumbnail ? `url("${m.thumbnail}")` : undefined,
              transform: isDrag ? `translateX(${dragging!.dx}px)` : undefined,
              zIndex: sel || isDrag ? undefined : l.index + 1
            }}
            onPointerDown={(e) => onClipDown(e, l)}
          >
            <div className="label">{m?.name ?? '(없는 파일)'}<em>{formatShort(l.duration)}</em></div>
            {filterName && <div className="badge">{filterName}</div>}
            <div className="handle l" onPointerDown={(e) => onTrim(e, l, 'l')} />
            <div className="handle r" onPointerDown={(e) => onTrim(e, l, 'r')} />
          </div>
        )
      })}

      {items.slice(0, -1).map((l) => {
        const next = items[l.index + 1]
        const has = !!l.clip.transitionOut
        const sel = selection?.type === 'transition' && selection.id === l.clip.id
        const x = xOf(next.start + l.transOut / 2, zoom)
        const def = has ? TRANSITION_MAP.get(l.clip.transitionOut!.type) : undefined
        return (
          <div key={`j_${l.clip.id}`}>
            {l.transOut > 0 && (
              <div className="trans-span" style={{ left: xOf(next.start, zoom), width: l.transOut * zoom }} />
            )}
            <button
              className={`junction ${has ? 'has' : ''} ${sel ? 'selected' : ''}`}
              style={{ left: x }}
              title={def ? `${def.name} (${l.transOut.toFixed(1)}초)` : '트랜지션 추가'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                st.select({ type: 'transition', id: l.clip.id })
                st.setLeftTab('transitions')
              }}
            >
              {has ? <IconTransition size={13} /> : <IconPlus size={13} />}
            </button>
          </div>
        )
      })}

      {dropAt !== null && <div className="drop-marker" style={{ left: boundaryX(layout, dropAt, zoom) }} />}
    </div>
  )
}

// ------------------------------------------------------------ audio track

function AudioTrack({ audio, zoom, mediaById, scrollRef, seek }: TrackProps & { audio: AudioClip[] }) {
  const selection = useEditor((s) => s.selection)
  const [over, setOver] = useState(false)
  const st = useEditor.getState()

  const xToT = (clientX: number) => {
    const el = scrollRef.current!
    return tOf(clientX - el.getBoundingClientRect().left + el.scrollLeft, zoom)
  }

  const onDown = (e: React.PointerEvent, a: AudioClip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    st.select({ type: 'audio', id: a.id })
    const start0 = a.start
    st.beginGesture()
    drag(e, (dx) => {
      st.mutate((p) => { const x = p.audio.find((y) => y.id === a.id); if (x) x.start = Math.max(0, start0 + dx / zoom) })
    }, () => st.endGesture())
  }

  const onTrim = (e: React.PointerEvent, a: AudioClip, edge: 'l' | 'r') => {
    e.stopPropagation()
    const m = mediaById.get(a.mediaId)
    const orig = { start: a.start, in: a.in, out: a.out }
    st.select({ type: 'audio', id: a.id })
    st.beginGesture()
    drag(e, (dx) => {
      const d = dx / zoom
      st.mutate((p) => {
        const x = p.audio.find((y) => y.id === a.id)
        if (!x) return
        if (edge === 'r') {
          x.out = Math.min(m?.duration ?? orig.out, Math.max(orig.in + MIN_CLIP, orig.out + d))
        } else {
          const dd = Math.min(orig.out - MIN_CLIP - orig.in, Math.max(-orig.in, -orig.start, d))
          x.start = orig.start + dd
          x.in = orig.in + dd
        }
      })
    }, () => st.endGesture())
  }

  return (
    <div className={`track audio ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MEDIA_MIME)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData(MEDIA_MIME)
        if (!id) return
        e.preventDefault()
        const m = mediaById.get(id)
        if (m?.kind === 'audio') st.addToTimeline(id, undefined, xToT(e.clientX))
        else st.addToTimeline(id)
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { st.select(null); seek(e.clientX) } }}>
      {audio.length === 0 && <div className="track-empty">♪ 음악이나 효과음을 여기로 끌어다 놓으세요</div>}
      {audio.map((a) => {
        const m = mediaById.get(a.mediaId)
        const dur = a.out - a.in
        const sel = selection?.type === 'audio' && selection.id === a.id
        return (
          <div key={a.id} className={`clip audio-clip ${sel ? 'selected' : ''}`}
            style={{ left: xOf(a.start, zoom), width: Math.max(4, dur * zoom) }}
            onPointerDown={(e) => onDown(e, a)}>
            <div className="wave" />
            {a.fadeIn > 0 && <div className="fade in" style={{ width: a.fadeIn * zoom }} />}
            {a.fadeOut > 0 && <div className="fade out" style={{ width: a.fadeOut * zoom }} />}
            <div className="label">♪ {m?.name}<em>{formatShort(dur)}</em></div>
            <div className="handle l" onPointerDown={(e) => onTrim(e, a, 'l')} />
            <div className="handle r" onPointerDown={(e) => onTrim(e, a, 'r')} />
          </div>
        )
      })}
    </div>
  )
}
