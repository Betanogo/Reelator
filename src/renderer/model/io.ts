import { useEditor } from './store'
import { Project } from './types'

export async function saveProject(saveAs = false): Promise<boolean> {
  const st = useEditor.getState()
  let path = st.filePath
  if (!path || saveAs) {
    path = await window.reelator.saveProjectDialog(st.project.name || 'Reelator')
    if (!path) return false
  }
  await window.reelator.writeTextFile(path, JSON.stringify(st.project, null, 1))
  useEditor.getState().markSaved(path)
  useEditor.getState().showToast('저장했어요')
  return true
}

export async function openProject(): Promise<void> {
  const st = useEditor.getState()
  if (st.dirty && !confirm('저장하지 않은 변경 사항이 있어요. 그래도 열까요?')) return
  const path = await window.reelator.openProjectDialog()
  if (!path) return
  try {
    const p = JSON.parse(await window.reelator.readTextFile(path)) as Project
    if (p.version !== 1 || !Array.isArray(p.clips)) throw new Error('지원하지 않는 프로젝트 파일이에요')
    p.audio ??= []
    useEditor.getState().loadProject(p, path)
  } catch (e) {
    alert(`프로젝트를 열 수 없어요: ${(e as Error).message}`)
  }
}
