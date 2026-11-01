// Phone implementation of the `window.reelator` bridge the shared editor code uses.
// "Paths" are file names inside the OPFS /media folder.

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import type { ImportedMedia, ProbeResult, ReelatorApi } from '@common/types'
import { Project, uid } from '@shared/model/types'
import { fileIn, writeBlob } from './storage'

const mediaUrls = new Map<string, string>()
const thumbUrls = new Map<string, string>()
const names = new Map<string, string>()

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif', 'heic'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'])

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()

export async function mediaFile(path: string): Promise<File | null> {
  return fileIn('media', path)
}

async function ensureMediaUrl(path: string): Promise<string | null> {
  const have = mediaUrls.get(path)
  if (have) return have
  const f = await mediaFile(path)
  if (!f) return null
  const url = URL.createObjectURL(f)
  mediaUrls.set(path, url)
  return url
}

async function ensureThumbUrl(path: string): Promise<string | null> {
  const have = thumbUrls.get(path)
  if (have) return have
  const f = await fileIn('thumbs', `${path}.jpg`)
  if (!f) return null
  const url = URL.createObjectURL(f)
  thumbUrls.set(path, url)
  return url
}

export function thumbFor(path: string): Promise<string | null> {
  return ensureThumbUrl(path)
}

/** Make every media file of a project loadable; returns how many are missing. */
export async function prepareProject(p: Project): Promise<number> {
  let missing = 0
  for (const m of p.media) {
    if (!(await ensureMediaUrl(m.path))) missing++
    m.thumbnail = await ensureThumbUrl(m.path)
  }
  return missing
}

// ------------------------------------------------------------- importing

let progressCb: ((done: number, total: number) => void) | null = null
export function onImportProgress(cb: typeof progressCb) { progressCb = cb }

export function pickFiles(accept = 'video/*,image/*,audio/*'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    const done = (files: File[]) => { input.remove(); resolve(files) }
    input.addEventListener('change', () => done(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => done([]))
    input.click()
  })
}

async function storeFile(file: File): Promise<string> {
  const ext = extOf(file.name) || (file.type.split('/')[1] ?? 'bin')
  const path = `${uid('m')}.${ext}`
  await writeBlob('media', path, file)
  names.set(path, file.name)
  return path
}

async function canvasToJpeg(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
  return new Promise((r) => (c as HTMLCanvasElement).toBlob(r, 'image/jpeg', 0.8))
}

async function probe(file: File, path: string): Promise<{ info: ProbeResult; thumb: Blob | null }> {
  const ext = extOf(names.get(path) ?? path)
  if (IMAGE_EXT.has(ext) || file.type.startsWith('image/')) {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas')
    c.width = 320
    c.height = Math.max(1, Math.round((320 * bmp.height) / bmp.width))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const info: ProbeResult = { kind: 'image', duration: 0, width: bmp.width, height: bmp.height, fps: 30, hasAudio: false, rotation: 0 }
    bmp.close()
    return { info, thumb: await canvasToJpeg(c) }
  }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const v = await input.getPrimaryVideoTrack()
    const a = await input.getPrimaryAudioTrack()
    if (!v && !a) throw new Error('지원하지 않는 파일')
    const duration = await input.computeDuration()
    if (!v || AUDIO_EXT.has(ext)) {
      return { info: { kind: 'audio', duration, width: 0, height: 0, fps: 30, hasAudio: true, rotation: 0 }, thumb: null }
    }
    const w = v.displayWidth, h = v.displayHeight
    let fps = 30
    try { fps = Math.round((await v.computePacketStats(90)).averagePacketRate) || 30 } catch { /* keep 30 */ }
    let thumb: Blob | null = null
    try {
      const sink = new CanvasSink(v, { width: 320, height: Math.max(1, Math.round((320 * h) / w)), fit: 'fill', poolSize: 1 })
      const wc = await sink.getCanvas(Math.min(1, duration / 3))
      if (wc) thumb = await canvasToJpeg(wc.canvas)
    } catch (e) { console.warn('thumbnail failed', e) }
    return { info: { kind: 'video', duration, width: w, height: h, fps, hasAudio: !!a, rotation: 0 }, thumb }
  } finally {
    input.dispose()
  }
}

async function importMedia(paths: string[]): Promise<ImportedMedia[]> {
  const out: ImportedMedia[] = []
  let i = 0
  for (const path of paths) {
    progressCb?.(++i, paths.length)
    const file = await mediaFile(path)
    if (!file) continue
    try {
      const { info, thumb } = await probe(file, path)
      if (thumb) await writeBlob('thumbs', `${path}.jpg`, thumb)
      await ensureMediaUrl(path)
      out.push({ ...info, path, name: names.get(path) ?? path, thumbnail: await ensureThumbUrl(path) })
    } catch (e) {
      console.error('import failed', path, e)
    }
  }
  progressCb?.(0, 0)
  return out
}

const notOnPhone = async () => { throw new Error('not available on mobile') }

export const mobileApi: ReelatorApi = {
  platform: 'android',
  async openMediaDialog() {
    const files = await pickFiles()
    const paths: string[] = []
    let i = 0
    for (const f of files) {
      progressCb?.(++i, files.length)
      paths.push(await storeFile(f))
    }
    return paths
  },
  importMedia,
  saveProjectDialog: async () => null,
  openProjectDialog: async () => null,
  writeTextFile: notOnPhone,
  readTextFile: notOnPhone,
  exportSaveDialog: async () => null,
  exportStart: notOnPhone,
  exportFrame: notOnPhone,
  exportFinish: notOnPhone,
  exportCancel: async () => {},
  showInFolder: async () => {},
  toFileUrl: (path) => mediaUrls.get(path) ?? '',
  getPathForFile: () => ''
}

/** Import files picked through other means (e.g. Android share sheet). */
export async function storeFiles(files: File[]): Promise<string[]> {
  const out: string[] = []
  for (const f of files) out.push(await storeFile(f))
  return out
}

export function installPlatform() {
  window.reelator = mobileApi
}
