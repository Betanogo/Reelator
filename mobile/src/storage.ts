// Phone storage: imported media, thumbnails, projects and exports live in the
// Origin Private File System (OPFS), so projects survive closing the app.
//
//   /media/<id>.<ext>       copy of every imported file
//   /thumbs/<id>.jpg        thumbnail per media file
//   /projects/<pid>.json    project documents
//   /exports/<name>.mp4     finished videos (until shared/downloaded)

import { Project } from '@shared/model/types'

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null
const root = () => (rootPromise ??= navigator.storage.getDirectory())

export async function dir(name: string): Promise<FileSystemDirectoryHandle> {
  return (await root()).getDirectoryHandle(name, { create: true })
}

export async function fileIn(d: string, name: string): Promise<File | null> {
  try {
    return await (await (await dir(d)).getFileHandle(name)).getFile()
  } catch {
    return null
  }
}

export async function writeBlob(d: string, name: string, blob: Blob): Promise<void> {
  const h = await (await dir(d)).getFileHandle(name, { create: true })
  const w = await h.createWritable()
  await blob.stream().pipeTo(w)
}

export async function removeIn(d: string, name: string): Promise<void> {
  try { await (await dir(d)).removeEntry(name) } catch { /* already gone */ }
}

export async function listNames(d: string): Promise<string[]> {
  const out: string[] = []
  const h = await dir(d) as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }
  for await (const k of h.keys()) out.push(k)
  return out
}

export async function requestPersistence(): Promise<void> {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist() } catch { /* ignore */ }
}

export async function usage(): Promise<{ used: number; quota: number }> {
  try {
    const e = await navigator.storage.estimate()
    return { used: e.usage ?? 0, quota: e.quota ?? 0 }
  } catch {
    return { used: 0, quota: 0 }
  }
}

// --------------------------------------------------------------- projects

export interface ProjectSummary {
  id: string
  name: string
  updated: number
  duration: number
  thumbMedia: string | null // media path of the first clip
}

interface StoredProject {
  id: string
  updated: number
  duration: number
  project: Project
}

export async function saveProject(id: string, project: Project, duration: number): Promise<void> {
  // thumbnails are runtime object URLs; they are rebuilt on load
  const clean: Project = { ...project, media: project.media.map((m) => ({ ...m, thumbnail: null })) }
  const doc: StoredProject = { id, updated: Date.now(), duration, project: clean }
  await writeBlob('projects', `${id}.json`, new Blob([JSON.stringify(doc)], { type: 'application/json' }))
}

export async function loadProject(id: string): Promise<Project | null> {
  const f = await fileIn('projects', `${id}.json`)
  if (!f) return null
  try { return (JSON.parse(await f.text()) as StoredProject).project } catch { return null }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const names = (await listNames('projects')).filter((n) => n.endsWith('.json'))
  const out: ProjectSummary[] = []
  for (const n of names) {
    const f = await fileIn('projects', n)
    if (!f) continue
    try {
      const d = JSON.parse(await f.text()) as StoredProject
      const first = d.project.clips[0]
      const m = first ? d.project.media.find((x) => x.id === first.mediaId) : undefined
      out.push({ id: d.id, name: d.project.name, updated: d.updated, duration: d.duration, thumbMedia: m?.path ?? null })
    } catch { /* skip broken file */ }
  }
  return out.sort((a, b) => b.updated - a.updated)
}

/** Delete a project and any media no other project uses. */
export async function deleteProject(id: string): Promise<void> {
  const p = await loadProject(id)
  await removeIn('projects', `${id}.json`)
  if (!p) return
  const stillUsed = new Set<string>()
  for (const s of await listProjects()) {
    const other = await loadProject(s.id)
    other?.media.forEach((m) => stillUsed.add(m.path))
  }
  for (const m of p.media) {
    if (stillUsed.has(m.path)) continue
    await removeIn('media', m.path)
    await removeIn('thumbs', `${m.path}.jpg`)
  }
}
