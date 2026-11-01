import { spawn, ChildProcessWithoutNullStreams, execFile } from 'child_process'
import { app } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { basename, extname, join } from 'path'
import { mediaUrl } from './protocol'
import type { ExportStartOptions, ImportedMedia, MediaKind, ProbeResult } from '../shared/types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegStatic: string = require('ffmpeg-static')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic: { path: string } = require('ffprobe-static')

// Inside a packaged app the binaries live in app.asar.unpacked.
const unpacked = (p: string) => p.replace('app.asar', 'app.asar.unpacked')
export const FFMPEG = unpacked(ffmpegStatic)
export const FFPROBE = unpacked(ffprobeStatic.path)

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.heic', '.avif'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma'])

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${basename(bin)} failed: ${stderr || err.message}`))
      else resolve(stdout)
    })
  })
}

function parseRate(r?: string): number {
  if (!r) return 30
  const [n, d] = r.split('/').map(Number)
  if (!d) return n || 30
  const v = n / d
  return isFinite(v) && v > 0 && v < 1000 ? v : 30
}

export async function probe(path: string): Promise<ProbeResult> {
  const ext = extname(path).toLowerCase()
  const out = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
  const info = JSON.parse(out)
  const streams: any[] = info.streams || []
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition?.attached_pic))
  const a = streams.find((s) => s.codec_type === 'audio')
  const duration = parseFloat(info.format?.duration ?? v?.duration ?? a?.duration ?? '0') || 0

  let kind: MediaKind
  // GIFs are shown as (animated) images; their duration is kept as the default clip length.
  if (IMAGE_EXT.has(ext)) kind = 'image'
  else if (v && duration > 0) kind = 'video'
  else if (v && !a) kind = 'image'
  else if (a || AUDIO_EXT.has(ext)) kind = 'audio'
  else kind = 'video'

  let rotation = 0
  if (v) {
    const sd = (v.side_data_list || []).find((d: any) => d.rotation !== undefined)
    rotation = Number(sd?.rotation ?? v.tags?.rotate ?? 0) || 0
  }
  let width = v?.width || 0
  let height = v?.height || 0
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width]

  return {
    kind,
    duration: kind === 'image' ? (ext === '.gif' ? duration : 0) : duration,
    width,
    height,
    fps: parseRate(v?.avg_frame_rate || v?.r_frame_rate),
    hasAudio: !!a,
    rotation
  }
}

function thumbDir(): string {
  const dir = join(app.getPath('userData'), 'thumbs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

async function makeThumbnail(path: string, p: ProbeResult): Promise<string | null> {
  if (p.kind === 'audio') return null
  const id = createHash('sha1').update(path).digest('hex').slice(0, 16)
  const out = join(thumbDir(), `${id}.jpg`)
  if (!existsSync(out)) {
    const at = p.kind === 'video' ? Math.min(1, p.duration / 3) : 0
    try {
      await run(FFMPEG, ['-y', '-v', 'error', '-ss', at.toFixed(3), '-i', path, '-frames:v', '1',
        '-vf', 'scale=320:-2', '-q:v', '4', out])
    } catch {
      return null
    }
  }
  return mediaUrl(out)
}

export async function importMedia(paths: string[]): Promise<ImportedMedia[]> {
  const results: ImportedMedia[] = []
  for (const path of paths) {
    try {
      const p = await probe(path)
      const thumbnail = await makeThumbnail(path, p)
      results.push({ ...p, path, name: basename(path), thumbnail })
    } catch (e) {
      console.error('import failed', path, e)
    }
  }
  return results
}

// ---------------------------------------------------------------- export

export function buildExportArgs(o: ExportStartOptions): string[] {
  const crf = o.quality === 'high' ? 18 : o.quality === 'medium' ? 22 : 27
  const args = ['-y', '-v', 'error', '-stats',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-r', String(o.fps), '-i', 'pipe:0']

  const filters: string[] = ['[0:v]vflip,format=yuv420p[vout]']
  const labels: string[] = []
  o.audio.forEach((a, i) => {
    args.push('-i', a.path)
    const idx = i + 1
    const d = Math.max(0.01, a.duration)
    const parts = [
      `atrim=start=${a.sourceIn.toFixed(4)}:duration=${d.toFixed(4)}`,
      'asetpts=PTS-STARTPTS',
      'aformat=sample_rates=48000:channel_layouts=stereo',
      `volume=${a.volume.toFixed(3)}`
    ]
    if (a.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${a.fadeIn.toFixed(3)}`)
    if (a.fadeOut > 0) parts.push(`afade=t=out:st=${Math.max(0, d - a.fadeOut).toFixed(3)}:d=${a.fadeOut.toFixed(3)}`)
    const ms = Math.max(0, Math.round(a.timelineStart * 1000))
    parts.push(`adelay=delays=${ms}:all=1`)
    filters.push(`[${idx}:a]${parts.join(',')}[a${i}]`)
    labels.push(`[a${i}]`)
  })

  if (labels.length > 0) {
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad[aout]`)
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo')
    filters.push(`[1:a]anull[aout]`)
  }

  args.push('-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    '-c:a', 'aac', '-b:a', '192k',
    '-t', o.duration.toFixed(4),
    '-movflags', '+faststart',
    o.outPath)
  return args
}

export class ExportJob {
  private proc: ChildProcessWithoutNullStreams
  private stderr = ''
  private exited: Promise<number>

  constructor(opts: ExportStartOptions) {
    this.proc = spawn(FFMPEG, buildExportArgs(opts), { windowsHide: true })
    this.proc.stderr.on('data', (d) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000)
    })
    this.proc.stdin.on('error', () => { /* surfaced on finish */ })
    this.exited = new Promise((resolve) => this.proc.on('close', (code) => resolve(code ?? -1)))
  }

  writeFrame(frame: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.proc.exitCode !== null) {
        reject(new Error('FFmpeg stopped: ' + this.stderr.trim().split('\n').slice(-3).join(' ')))
        return
      }
      const ok = this.proc.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength))
      if (ok) resolve()
      else this.proc.stdin.once('drain', () => resolve())
    })
  }

  async finish(): Promise<void> {
    this.proc.stdin.end()
    const code = await this.exited
    if (code !== 0) throw new Error('FFmpeg failed: ' + this.stderr.trim().split('\n').slice(-4).join(' '))
  }

  cancel(): void {
    try { this.proc.stdin.destroy() } catch { /* ignore */ }
    this.proc.kill('SIGKILL')
  }
}
