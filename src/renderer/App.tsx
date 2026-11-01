import { useEffect, useState } from 'react'
import { useEditor } from './model/store'
import { openProject, saveProject } from './model/io'
import { computeLayout } from './model/timeline'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { Preview, togglePlay } from './components/Preview'
import { Inspector } from './components/Inspector'
import { Timeline } from './components/Timeline'
import { ExportDialog } from './components/ExportDialog'

export default function App() {
  const [exporting, setExporting] = useState(false)
  const [fileOver, setFileOver] = useState(false)
  const toast = useEditor((s) => s.toast)

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' && !['range', 'color'].includes((el as HTMLInputElement).type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
      if (typing || exporting) return
      const st = useEditor.getState()
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const frame = 1 / st.project.settings.fps

      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo() }
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); st.redo() }
      else if (ctrl && k === 's') { e.preventDefault(); saveProject(e.shiftKey) }
      else if (ctrl && k === 'o') { e.preventDefault(); openProject() }
      else if (ctrl && k === 'e') { e.preventDefault(); setExporting(true) }
      else if (ctrl && k === 'b') { e.preventDefault(); st.splitAtPlayhead() }
      else if (ctrl) return
      else if (k === ' ') { e.preventDefault(); togglePlay() }
      else if (k === 's') { st.splitAtPlayhead() }
      else if (k === 'delete' || k === 'backspace') { e.preventDefault(); st.deleteSelection() }
      else if (k === 'arrowleft') { e.preventDefault(); st.setPlaying(false); st.setPlayhead(st.playhead - (e.shiftKey ? 1 : frame)) }
      else if (k === 'arrowright') { e.preventDefault(); st.setPlaying(false); st.setPlayhead(st.playhead + (e.shiftKey ? 1 : frame)) }
      else if (k === 'home') { st.setPlayhead(0) }
      else if (k === 'end') { st.setPlayhead(computeLayout(st.project).total) }
      else if (k === 'escape') { st.select(null) }
      else if (k === '=' || k === '+') { st.setZoom(st.zoom * 1.25) }
      else if (k === '-') { st.setZoom(st.zoom / 1.25) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exporting])

  // dropping files from Explorer anywhere imports them
  useEffect(() => {
    let depth = 0
    const isFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const enter = (e: DragEvent) => { if (isFiles(e)) { depth++; setFileOver(true) } }
    const leave = (e: DragEvent) => { if (isFiles(e) && --depth <= 0) { depth = 0; setFileOver(false) } }
    const over = (e: DragEvent) => { if (isFiles(e)) e.preventDefault() }
    const drop = async (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      depth = 0
      setFileOver(false)
      const paths = Array.from(e.dataTransfer!.files).map((f) => window.reelator.getPathForFile(f)).filter(Boolean)
      const st = useEditor.getState()
      const added = await st.importFiles(paths)
      // files dropped straight onto the timeline also go onto it
      const onTimeline = (e.target as HTMLElement)?.closest?.('.timeline')
      if (onTimeline) for (const m of added) useEditor.getState().addToTimeline(m.id)
      useEditor.getState().setLeftTab('media')
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  // warn before closing with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty && useEditor.getState().project.clips.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return (
    <div className="app">
      <TopBar onExport={() => setExporting(true)} />
      <div className="workspace">
        <LeftPanel />
        <Preview />
        <Inspector />
      </div>
      <Timeline />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {fileOver && <div className="file-drop">여기에 놓으면 미디어로 가져와요</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
