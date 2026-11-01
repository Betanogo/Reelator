// Types shared by the main process, preload bridge and renderer.

export type MediaKind = 'video' | 'image' | 'audio'

export interface ProbeResult {
  kind: MediaKind
  duration: number // seconds (images: 0)
  width: number
  height: number
  fps: number
  hasAudio: boolean
  rotation: number
}

export interface ImportedMedia extends ProbeResult {
  path: string
  name: string
  thumbnail: string | null // reel:// url of a jpg
}

export interface ExportAudioInput {
  path: string
  sourceIn: number // seconds into source
  duration: number // seconds of source used
  timelineStart: number // seconds on output timeline
  volume: number // 0..2
  fadeIn: number
  fadeOut: number
}

export interface ExportStartOptions {
  outPath: string
  width: number
  height: number
  fps: number
  duration: number
  quality: 'high' | 'medium' | 'small'
  audio: ExportAudioInput[]
}

export interface ReelatorApi {
  platform: string
  openMediaDialog(): Promise<string[]>
  importMedia(paths: string[]): Promise<ImportedMedia[]>
  saveProjectDialog(defaultName: string): Promise<string | null>
  openProjectDialog(): Promise<string | null>
  writeTextFile(path: string, content: string): Promise<void>
  readTextFile(path: string): Promise<string>
  exportSaveDialog(defaultName: string): Promise<string | null>
  exportStart(opts: ExportStartOptions): Promise<void>
  exportFrame(frame: Uint8Array): Promise<void>
  exportFinish(): Promise<void>
  exportCancel(): Promise<void>
  showInFolder(path: string): Promise<void>
  /** reel:// URL the renderer can load a local file from (supports seeking). */
  toFileUrl(path: string): string
  /** Absolute path of a File dropped from the OS (empty string if unknown). */
  getPathForFile(file: File): string
}
