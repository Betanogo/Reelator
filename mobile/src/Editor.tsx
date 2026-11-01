import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '@shared/model/store'
import { computeLayout, formatTime } from '@shared/model/timeline'
import { ASPECTS, uid } from '@shared/model/types'
import { PreviewEngine } from '@shared/engine/preview'
import { MobileTimeline } from './MobileTimeline'
import { SheetKind, Sheets, exportState } from './Sheets'
import { pickFiles, storeFiles } from './platform'
import { pushLayer, back } from './nav'
import {
  IconAdjust, IconBack, IconCopy, IconEffect, IconFade, IconFilter, IconLeft, IconMusic, IconPalette, IconPause, IconPlay,
  IconPlus, IconRatio, IconRedo, IconRight, IconScreen, IconSplit, IconSticker, IconText, IconTransition, IconTrash, IconUndo, IconVolume
} from './micons'

PreviewEngine.shortSide = 540

/** Pick files and put them on the timeline (videos/photos on the main track, music on the audio track). */
export async function importAndPlace(accept?: string): Promise<void> {
  const files = await pickFiles(accept)
  if (!files.length) return
  const st = useEditor.getState()
  st.setPlaying(false)
  useEditor.setState({ importing: true })
  try {
    const paths = await storeFiles(files)
    const items = await useEditor.getState().importFiles(paths)
    for (const m of items) {
      if (m.kind === 'audio') {
        const p = useEditor.getState().project
        const end = p.audio.reduce((e, a) => Math.max(e, a.start + a.out - a.in), 0)
        useEditor.getState().addToTimeline(m.id, undefined, p.audio.length ? end : 0)
      } else {
        useEditor.getState().addToTimeline(m.id)
      }
    }
    useEditor.getState().select(null)
  } catch (e) {
    useEditor.getState().showToast(`가져오지 못했어요: ${(e as Error).message}`)
  } finally {
    useEditor.setState({ importing: false })
  }
}

export function Editor({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project)
  const playing = useEditor((s) => s.playing)
  const selection = useEditor((s) => s.selection)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const total = useMemo(() => computeLayout(project).total, [project])
  const empty = project.clips.length === 0 && project.audio.length === 0
  const st = useEditor.getState()

  useEffect(() => {
    let engine: PreviewEngine | null = null
    try { engine = new PreviewEngine(canvasRef.current!) } catch (e) {
      console.error(e)
      useEditor.getState().showToast('미리보기를 시작하지 못했어요 (WebGL2)')
    }
    return () => engine?.dispose()
  }, [])

  // opening a transition junction opens its sheet
  useEffect(() => {
    if (selection?.type === 'transition' && sheet !== 'transitions') openSheet('transitions')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const openSheet = (k: SheetKind) => {
    st.setPlaying(false)
    setSheet(k)
    const onBack = () => {
      if (exportState.busy) {
        // keep the export sheet open; re-arm the back button
        useEditor.getState().showToast('내보내는 중에는 닫을 수 없어요')
        pushLayer(onBack)
        return
      }
      setSheet(null)
    }
    pushLayer(onBack)
  }
  const closeSheet = () => back()

  const soon = () => st.showToast('다음 업데이트에서 추가될 예정이에요')

  const clipIdx = selection?.type === 'clip' ? project.clips.findIndex((c) => c.id === selection.id) : -1
  const clip = clipIdx >= 0 ? project.clips[clipIdx] : undefined
  const clipMedia = clip ? project.media.find((m) => m.id === clip.mediaId) : undefined

  const duplicate = () => {
    if (!clip) return
    const copy = { ...structuredClone(clip), id: uid('clip') }
    st.mutate((d) => { d.clips.splice(clipIdx + 1, 0, copy) })
    st.select({ type: 'clip', id: copy.id })
  }

  type Tool = { key: string; label: string; icon: JSX.Element; on(): void; disabled?: boolean; tone?: 'danger' | 'soon' }
  let tools: Tool[]
  if (clip) {
    tools = [
      { key: 'split', label: '분할', icon: <IconSplit />, on: () => st.splitAtPlayhead() },
      ...(clipMedia?.kind === 'video' ? [{ key: 'vol', label: '볼륨', icon: <IconVolume />, on: () => openSheet('volume') }] : []),
      { key: 'filter', label: '필터', icon: <IconFilter />, on: () => openSheet('filters') },
      { key: 'adjust', label: '조정', icon: <IconAdjust />, on: () => openSheet('adjust') },
      { key: 'screen', label: '화면', icon: <IconScreen />, on: () => openSheet('screen') },
      { key: 'trans', label: '트랜지션', icon: <IconTransition />, disabled: clipIdx >= project.clips.length - 1,
        on: () => { st.select({ type: 'transition', id: clip.id }) } },
      { key: 'dup', label: '복제', icon: <IconCopy />, on: duplicate },
      { key: 'left', label: '앞으로', icon: <IconLeft />, disabled: clipIdx <= 0, on: () => st.moveClip(clipIdx, clipIdx - 1) },
      { key: 'right', label: '뒤로', icon: <IconRight />, disabled: clipIdx >= project.clips.length - 1, on: () => st.moveClip(clipIdx, clipIdx + 2) },
      { key: 'del', label: '삭제', icon: <IconTrash />, tone: 'danger', on: () => st.deleteSelection() }
    ]
  } else if (selection?.type === 'audio') {
    tools = [
      { key: 'split', label: '분할', icon: <IconSplit />, on: () => st.splitAtPlayhead() },
      { key: 'vol', label: '볼륨', icon: <IconVolume />, on: () => openSheet('volume') },
      { key: 'fade', label: '페이드', icon: <IconFade />, on: () => openSheet('fade') },
      { key: 'del', label: '삭제', icon: <IconTrash />, tone: 'danger', on: () => st.deleteSelection() }
    ]
  } else if (selection?.type === 'transition') {
    tools = [
      { key: 'trans', label: '트랜지션', icon: <IconTransition />, on: () => openSheet('transitions') },
      { key: 'del', label: '제거', icon: <IconTrash />, tone: 'danger', on: () => st.setTransition(selection.id, null) }
    ]
  } else {
    tools = [
      { key: 'add', label: '미디어', icon: <IconPlus />, on: () => importAndPlace() },
      { key: 'audio', label: '오디오', icon: <IconMusic />, on: () => importAndPlace('audio/*') },
      { key: 'text', label: '텍스트', icon: <IconText />, tone: 'soon', on: soon },
      { key: 'sticker', label: '스티커', icon: <IconSticker />, tone: 'soon', on: soon },
      { key: 'effect', label: '효과', icon: <IconEffect />, tone: 'soon', on: soon },
      { key: 'filter', label: '필터', icon: <IconFilter />, disabled: project.clips.length === 0, on: () => openSheet('filters') },
      { key: 'ratio', label: '비율', icon: <IconRatio />, on: () => openSheet('ratio') },
      { key: 'bg', label: '배경', icon: <IconPalette />, on: () => openSheet('background') }
    ]
  }

  return (
    <div className="editor">
      <div className="m-top">
        <button className="tap" onClick={onClose} aria-label="닫기"><IconBack /></button>
        <div className="title">{project.name}</div>
        <button className="export-btn" disabled={empty} onClick={() => openSheet('export')}>내보내기</button>
      </div>

      <div className="m-preview" onClick={() => !empty && st.setPlaying(!st.playing)}>
        <canvas ref={canvasRef} style={{ aspectRatio: `${ASPECTS[project.settings.aspect][0]} / ${ASPECTS[project.settings.aspect][1]}` }} />
        {empty && <div className="hint">아래 ＋ 버튼으로 영상이나 사진을 추가하세요</div>}
      </div>

      <div className="m-transport">
        <div className="time"><Clock /> / {formatTime(total, project.settings.fps).slice(0, 5)}</div>
        <button className="m-play" disabled={empty} onClick={() => st.setPlaying(!playing)}>
          {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
        </button>
        <div className="right">
          <button className="tap" disabled={!canUndo} onClick={() => st.undo()}><IconUndo size={20} /></button>
          <button className="tap" disabled={!canRedo} onClick={() => st.redo()}><IconRedo size={20} /></button>
        </div>
      </div>

      <MobileTimeline onAdd={() => importAndPlace()} onAddAudio={() => importAndPlace('audio/*')} />

      <div className="m-bar">
        {selection && (
          <button className="back" onClick={() => st.select(null)} aria-label="선택 해제"><IconBack /></button>
        )}
        <div className="items">
          {tools.map((t) => (
            <button key={t.key} className={`m-tool ${t.tone ?? ''}`} disabled={t.disabled} onClick={t.on}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {sheet && <Sheets kind={sheet} onClose={closeSheet} />}
    </div>
  )
}

function Clock() {
  const t = useEditor((s) => s.playhead)
  return <b>{formatTime(t).slice(0, 5)}</b>
}
