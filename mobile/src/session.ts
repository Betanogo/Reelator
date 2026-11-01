import { useEditor } from '@shared/model/store'
import { computeLayout } from '@shared/model/timeline'
import { Project, newProject, uid } from '@shared/model/types'
import { prepareProject } from './platform'
import { loadProject, saveProject } from './storage'

let currentId: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let lastSaved: Project | null = null

export function currentProjectId(): string | null {
  return currentId
}

async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null }
  const id = currentId
  const p = useEditor.getState().project
  if (!id || p === lastSaved) return
  lastSaved = p
  // don't keep projects that never got any content
  if (p.clips.length === 0 && p.audio.length === 0 && p.media.length === 0) return
  try {
    await saveProject(id, p, computeLayout(p).total)
  } catch (e) {
    console.error('autosave failed', e)
  }
}

useEditor.subscribe((s, prev) => {
  if (!currentId || s.project === prev.project) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, 700)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
})

function defaultName(): string {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 프로젝트`
}

export function startNewProject(): void {
  currentId = uid('p')
  const p = newProject()
  p.name = defaultName()
  lastSaved = p
  useEditor.getState().loadProject(p, null)
  useEditor.setState({ zoom: 40 })
}

export async function openProject(id: string): Promise<number> {
  const p = await loadProject(id)
  if (!p) throw new Error('프로젝트를 열 수 없어요')
  p.audio ??= []
  const missing = await prepareProject(p)
  currentId = id
  lastSaved = p
  useEditor.getState().loadProject(p, null)
  useEditor.setState({ zoom: 40 })
  return missing
}

export async function closeProject(): Promise<void> {
  useEditor.getState().setPlaying(false)
  await flush()
  currentId = null
}
