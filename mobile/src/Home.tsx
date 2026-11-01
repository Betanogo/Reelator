import { useEffect, useState } from 'react'
import mark from '@shared/assets/mark.png'
import { useEditor } from '@shared/model/store'
import { formatShort } from '@shared/model/timeline'
import { ProjectSummary, deleteProject, listProjects, loadProject, saveProject, usage } from './storage'
import { thumbFor } from './platform'
import { openProject, startNewProject } from './session'
import { importAndPlace } from './Editor'
import { IconMore, IconPlus } from './micons'

interface Props {
  onOpen(): void
  setBusy(msg: string | null): void
}

type InstallEvent = Event & { prompt(): Promise<void> }
let deferredInstall: InstallEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as InstallEvent })

export function Home({ onOpen, setBusy }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState<ProjectSummary | null>(null)
  const [space, setSpace] = useState('')
  const [canInstall, setCanInstall] = useState(!!deferredInstall)
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  const refresh = async () => {
    const list = await listProjects()
    setProjects(list)
    const t: Record<string, string> = {}
    for (const p of list) if (p.thumbMedia) { const u = await thumbFor(p.thumbMedia); if (u) t[p.id] = u }
    setThumbs(t)
    const u = await usage()
    if (u.quota) setSpace(`저장공간 ${(u.used / 1e9).toFixed(2)}GB 사용 · ${(u.quota / 1e9).toFixed(0)}GB 중`)
  }

  useEffect(() => {
    refresh()
    const onPrompt = () => setCanInstall(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const create = async () => {
    startNewProject()
    onOpen()
    // CapCut-style: go straight to picking media
    await importAndPlace()
  }

  const open = async (id: string) => {
    setBusy('프로젝트 여는 중…')
    try {
      const missing = await openProject(id)
      onOpen()
      if (missing) useEditor.getState().showToast(`파일 ${missing}개를 찾을 수 없어요`)
    } catch (e) {
      useEditor.getState().showToast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const rename = async (p: ProjectSummary) => {
    setMenu(null)
    const name = prompt('프로젝트 이름', p.name)?.trim()
    if (!name) return
    const doc = await loadProject(p.id)
    if (!doc) return
    doc.name = name
    await saveProject(p.id, doc, p.duration)
    refresh()
  }

  const remove = async (p: ProjectSummary) => {
    setMenu(null)
    if (!confirm(`'${p.name}'을(를) 삭제할까요? 되돌릴 수 없어요.`)) return
    setBusy('삭제 중…')
    await deleteProject(p.id)
    setBusy(null)
    refresh()
  }

  return (
    <div className="home">
      <div className="home-head"><img src={mark} alt="" />Reelator</div>
      <div className="home-body">
        <button className="new-card" onClick={create}><IconPlus size={26} /> 새 프로젝트</button>

        {!standalone && (
          <div className="install-hint">
            홈 화면에 추가하면 앱처럼 전체 화면으로 쓸 수 있어요.
            {canInstall && <button onClick={async () => { await deferredInstall?.prompt(); deferredInstall = null; setCanInstall(false) }}>설치</button>}
          </div>
        )}

        <div className="home-section">내 프로젝트 <small>{projects ? `${projects.length}개` : ''}</small></div>
        {projects && projects.length === 0 && (
          <div className="empty-note">아직 프로젝트가 없어요.<br />위의 ‘새 프로젝트’를 눌러 시작하세요.</div>
        )}
        <div className="proj-list">
          {projects?.map((p) => (
            <div key={p.id} className="proj" onClick={() => open(p.id)}>
              <div className="th" style={{ backgroundImage: thumbs[p.id] ? `url("${thumbs[p.id]}")` : undefined }}>
                <span>{formatShort(p.duration)}</span>
              </div>
              <div className="meta">
                <b>{p.name}</b>
                <small>{new Date(p.updated).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
              </div>
              <button className="more" onClick={(e) => { e.stopPropagation(); setMenu(p) }}><IconMore /></button>
            </div>
          ))}
        </div>
        {space && <div className="storage-line">{space}</div>}
      </div>

      {menu && (
        <>
          <div className="sheet-backdrop" onClick={() => setMenu(null)} />
          <div className="sheet">
            <div className="sheet-head">{menu.name}<span /></div>
            <div className="sheet-body">
              <div className="menu-list">
                <button onClick={() => rename(menu)}>이름 바꾸기</button>
                <button className="danger" onClick={() => remove(menu)}>삭제</button>
                <button onClick={() => setMenu(null)}>취소</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
