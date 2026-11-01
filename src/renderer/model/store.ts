import { create } from 'zustand'
import {
  AudioClip, Clip, MediaItem, NO_ADJUST, Project, ProjectSettings, Selection, TransitionRef,
  clipDuration, newProject, uid
} from './types'
import { MIN_CLIP, computeLayout, frameAt } from './timeline'

export type LeftTab = 'media' | 'transitions' | 'filters' | 'text' | 'stickers' | 'effects'

interface EditorState {
  project: Project
  filePath: string | null
  dirty: boolean
  playhead: number
  playing: boolean
  selection: Selection
  zoom: number // px per second
  leftTab: LeftTab
  past: Project[]
  future: Project[]
  gestureBase: Project | null
  importing: boolean
  toast: string | null

  // history
  mutate(fn: (draft: Project) => void, record?: boolean): void
  beginGesture(): void
  endGesture(): void
  undo(): void
  redo(): void

  // ui
  setPlayhead(t: number): void
  setPlaying(p: boolean): void
  select(s: Selection): void
  setZoom(z: number): void
  setLeftTab(t: LeftTab): void
  showToast(msg: string): void

  // project
  loadProject(p: Project, path: string | null): void
  markSaved(path: string): void
  importFiles(paths: string[]): Promise<MediaItem[]>
  addToTimeline(mediaId: string, index?: number, at?: number): void
  removeMedia(mediaId: string): void
  moveClip(from: number, to: number): void
  splitAtPlayhead(): void
  deleteSelection(): void
  updateClip(id: string, patch: Partial<Clip>): void
  updateAudio(id: string, patch: Partial<AudioClip>): void
  setTransition(clipId: string, ref: TransitionRef | null): void
  transitionToAll(ref: TransitionRef): void
  setFilterPreset(clipId: string, preset: string | null): void
  filterToAll(clipId: string): void
  updateSettings(patch: Partial<ProjectSettings>): void
}

const clone = <T,>(v: T): T => structuredClone(v)

function defaultClip(m: MediaItem): Clip {
  const len = m.kind === 'image' ? (m.duration > 0.2 ? m.duration : 3) : m.duration
  return {
    id: uid('clip'),
    mediaId: m.id,
    in: 0,
    out: Math.max(MIN_CLIP, len),
    volume: 1,
    muted: false,
    fit: 'contain',
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    filter: { preset: null, intensity: 1, adjust: { ...NO_ADJUST } },
    transitionOut: null
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  project: newProject(),
  filePath: null,
  dirty: false,
  playhead: 0,
  playing: false,
  selection: null,
  zoom: 60,
  leftTab: 'media',
  past: [],
  future: [],
  gestureBase: null,
  importing: false,
  toast: null,

  mutate(fn, record = true) {
    const { project, past, gestureBase } = get()
    const draft = clone(project)
    fn(draft)
    if (record && !gestureBase) {
      set({ project: draft, past: [...past.slice(-99), project], future: [], dirty: true })
    } else {
      set({ project: draft, dirty: true })
    }
  },

  beginGesture() {
    set({ gestureBase: get().project })
  },

  endGesture() {
    const { gestureBase, project, past } = get()
    if (!gestureBase) return
    if (gestureBase !== project) {
      set({ gestureBase: null, past: [...past.slice(-99), gestureBase], future: [] })
    } else {
      set({ gestureBase: null })
    }
  },

  undo() {
    const { past, project, future } = get()
    if (!past.length) return
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true })
    fixSelection()
  },

  redo() {
    const { past, project, future } = get()
    if (!future.length) return
    set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true })
    fixSelection()
  },

  setPlayhead(t) {
    const total = computeLayout(get().project).total
    set({ playhead: Math.max(0, Math.min(t, total)) })
  },
  setPlaying(p) { set({ playing: p }) },
  select(s) { set({ selection: s }) },
  setZoom(z) { set({ zoom: Math.max(4, Math.min(600, z)) }) },
  setLeftTab(t) { set({ leftTab: t }) },
  showToast(msg) {
    set({ toast: msg })
    setTimeout(() => { if (get().toast === msg) set({ toast: null }) }, 2600)
  },

  loadProject(p, path) {
    set({ project: p, filePath: path, dirty: false, past: [], future: [], selection: null, playhead: 0, playing: false })
  },
  markSaved(path) { set({ filePath: path, dirty: false }) },

  async importFiles(paths) {
    if (!paths.length) return []
    set({ importing: true })
    try {
      const existing = new Set(get().project.media.map((m) => m.path))
      const fresh = paths.filter((p) => !existing.has(p))
      const imported = await window.reelator.importMedia(fresh)
      const items: MediaItem[] = imported.map((m) => ({
        id: uid('media'), path: m.path, name: m.name, kind: m.kind, duration: m.duration,
        width: m.width, height: m.height, fps: m.fps, hasAudio: m.hasAudio, thumbnail: m.thumbnail
      }))
      if (items.length) get().mutate((d) => { d.media.push(...items) })
      if (imported.length < fresh.length) get().showToast(`${fresh.length - imported.length}개 파일을 불러오지 못했어요`)
      return items
    } finally {
      set({ importing: false })
    }
  },

  addToTimeline(mediaId, index, at) {
    const m = get().project.media.find((x) => x.id === mediaId)
    if (!m) return
    if (m.kind === 'audio') {
      const a: AudioClip = {
        id: uid('aud'), mediaId, start: at ?? get().playhead, in: 0, out: m.duration,
        volume: 1, fadeIn: 0, fadeOut: 0
      }
      get().mutate((d) => { d.audio.push(a) })
      set({ selection: { type: 'audio', id: a.id } })
      return
    }
    const c = defaultClip(m)
    get().mutate((d) => {
      const i = index === undefined ? d.clips.length : Math.max(0, Math.min(index, d.clips.length))
      d.clips.splice(i, 0, c)
      // First visual clip decides the canvas ratio, like CapCut's "original" ratio.
      if (d.clips.length === 1 && m.width && m.height) {
        const r = m.width / m.height
        d.settings.aspect = r > 1.9 ? '21:9' : r > 1.5 ? '16:9' : r > 1.15 ? '4:3' : r > 0.87 ? '1:1' : r > 0.66 ? '3:4' : '9:16'
      }
    })
    set({ selection: { type: 'clip', id: c.id } })
  },

  removeMedia(mediaId) {
    get().mutate((d) => {
      d.media = d.media.filter((m) => m.id !== mediaId)
      d.clips = d.clips.filter((c) => c.mediaId !== mediaId)
      d.audio = d.audio.filter((a) => a.mediaId !== mediaId)
    })
    fixSelection()
  },

  moveClip(from, to) {
    if (from === to) return
    get().mutate((d) => {
      const [c] = d.clips.splice(from, 1)
      d.clips.splice(to > from ? to - 1 : to, 0, c)
    })
  },

  splitAtPlayhead() {
    const { project, playhead, selection } = get()
    const layout = computeLayout(project)

    if (selection?.type === 'audio') {
      const a = project.audio.find((x) => x.id === selection.id)
      if (a) {
        const s = a.in + (playhead - a.start)
        if (s > a.in + MIN_CLIP && s < a.out - MIN_CLIP) {
          const b: AudioClip = { ...clone(a), id: uid('aud'), start: playhead, in: s, fadeIn: 0 }
          get().mutate((d) => {
            const x = d.audio.find((y) => y.id === a.id)!
            x.out = s
            x.fadeOut = 0
            d.audio.push(b)
          })
          return
        }
      }
    }

    // Prefer the selected clip if the playhead is over it; otherwise the clip under the playhead.
    let target = layout.items.find((l) => selection?.type === 'clip' && l.clip.id === selection.id &&
      playhead > l.start && playhead < l.end)
    if (!target) {
      const f = frameAt(layout, playhead)
      target = f.b ?? f.a ?? undefined
    }
    if (!target) return
    const s = target.clip.in + (playhead - target.start)
    if (s <= target.clip.in + MIN_CLIP || s >= target.clip.out - MIN_CLIP) {
      get().showToast('클립 끝부분과 너무 가까워요')
      return
    }
    const idx = target.index
    const second: Clip = { ...clone(target.clip), id: uid('clip'), in: s }
    get().mutate((d) => {
      const first = d.clips[idx]
      second.transitionOut = first.transitionOut
      first.out = s
      first.transitionOut = null
      d.clips.splice(idx + 1, 0, second)
    })
    set({ selection: { type: 'clip', id: second.id } })
  },

  deleteSelection() {
    const sel = get().selection
    if (!sel) return
    if (sel.type === 'clip') {
      get().mutate((d) => {
        const i = d.clips.findIndex((c) => c.id === sel.id)
        if (i < 0) return
        d.clips.splice(i, 1)
        // the previous clip's transition now points at a different clip; keep it
        if (i === d.clips.length && i > 0) d.clips[i - 1].transitionOut = null
      })
    } else if (sel.type === 'transition') {
      get().mutate((d) => {
        const c = d.clips.find((x) => x.id === sel.id)
        if (c) c.transitionOut = null
      })
    } else if (sel.type === 'audio') {
      get().mutate((d) => { d.audio = d.audio.filter((a) => a.id !== sel.id) })
    }
    set({ selection: null })
  },

  updateClip(id, patch) {
    get().mutate((d) => {
      const c = d.clips.find((x) => x.id === id)
      if (c) Object.assign(c, patch)
    })
  },

  updateAudio(id, patch) {
    get().mutate((d) => {
      const a = d.audio.find((x) => x.id === id)
      if (a) Object.assign(a, patch)
    })
  },

  setTransition(clipId, ref) {
    get().mutate((d) => {
      const c = d.clips.find((x) => x.id === clipId)
      if (c) c.transitionOut = ref
    })
    set({ selection: ref ? { type: 'transition', id: clipId } : { type: 'clip', id: clipId } })
  },

  transitionToAll(ref) {
    get().mutate((d) => {
      d.clips.forEach((c, i) => { if (i < d.clips.length - 1) c.transitionOut = { ...ref } })
    })
    get().showToast('모든 클립 사이에 적용했어요')
  },

  setFilterPreset(clipId, preset) {
    get().mutate((d) => {
      const c = d.clips.find((x) => x.id === clipId)
      if (c) c.filter.preset = preset
    })
  },

  filterToAll(clipId) {
    const src = get().project.clips.find((c) => c.id === clipId)
    if (!src) return
    get().mutate((d) => { d.clips.forEach((c) => { c.filter = clone(src.filter) }) })
    get().showToast('모든 클립에 필터를 적용했어요')
  },

  updateSettings(patch) {
    get().mutate((d) => { Object.assign(d.settings, patch) })
  }
}))

function fixSelection() {
  const { selection, project } = useEditor.getState()
  if (!selection) return
  const ok =
    (selection.type === 'clip' && project.clips.some((c) => c.id === selection.id)) ||
    (selection.type === 'transition' && project.clips.some((c) => c.id === selection.id && c.transitionOut)) ||
    (selection.type === 'audio' && project.audio.some((a) => a.id === selection.id))
  if (!ok) useEditor.setState({ selection: null })
}

export function selectedClip(): Clip | undefined {
  const { selection, project } = useEditor.getState()
  if (!selection || selection.type === 'audio') return undefined
  return project.clips.find((c) => c.id === selection.id)
}

export { clipDuration }
