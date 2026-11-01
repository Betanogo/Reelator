import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { extname } from 'path'
import { Readable } from 'stream'

/**
 * reel://file/<encodeURIComponent(absolute path)>
 * Serves local media to the renderer with HTTP range support, so <video> can seek
 * the same way in development (http://localhost) and in the packaged app (file://).
 */
export const SCHEME = 'reel'

export function mediaUrl(path: string): string {
  return `${SCHEME}://file/${encodeURIComponent(path)}`
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.mts': 'video/mp2t',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.bmp': 'image/bmp', '.avif': 'image/avif'
}

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true }
  }])
}

export function handleScheme(): void {
  protocol.handle(SCHEME, async (req) => {
    let path: string
    try {
      path = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
    } catch {
      return new Response('bad url', { status: 400 })
    }
    let size: number
    try {
      size = (await stat(path)).size
    } catch {
      return new Response('not found', { status: 404 })
    }
    const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const range = req.headers.get('range')
    const common = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      let start = m && m[1] ? parseInt(m[1], 10) : 0
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1
      if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1 }
      if (start >= size || end < start) {
        return new Response(null, { status: 416, headers: { ...common, 'Content-Range': `bytes */${size}` } })
      }
      end = Math.min(end, size - 1)
      const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream
      return new Response(body, {
        status: 206,
        headers: { ...common, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` }
      })
    }
    const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream
    return new Response(body, { status: 200, headers: { ...common, 'Content-Length': String(size) } })
  })
}
