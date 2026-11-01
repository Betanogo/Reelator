import mark from '../assets/mark.png'
import { useEditor } from '../model/store'
import { openProject, saveProject } from '../model/io'
import { IconExport, IconFolder, IconSave } from './icons'

export function TopBar({ onExport }: { onExport(): void }) {
  const name = useEditor((s) => s.project.name)
  const dirty = useEditor((s) => s.dirty)
  const empty = useEditor((s) => s.project.clips.length === 0 && s.project.audio.length === 0)

  return (
    <header className="topbar">
      <div className="brand">
        <img src={mark} alt="" />
        Reelator
      </div>
      <input
        className="project-name"
        value={name}
        spellCheck={false}
        onChange={(e) => useEditor.getState().mutate((d) => { d.name = e.target.value }, false)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      {dirty && <span className="dirty-dot" title="저장하지 않은 변경 사항" />}
      <div className="spacer" />
      <button className="btn ghost" onClick={() => openProject()} title="프로젝트 열기 (Ctrl+O)">
        <IconFolder size={16} /> 열기
      </button>
      <button className="btn ghost" onClick={() => saveProject()} title="저장 (Ctrl+S)">
        <IconSave size={16} /> 저장
      </button>
      <button className="btn primary" onClick={onExport} disabled={empty} title="내보내기 (Ctrl+E)">
        <IconExport size={16} /> 내보내기
      </button>
    </header>
  )
}
