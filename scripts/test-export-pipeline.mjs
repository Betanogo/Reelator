// Smoke test for the main-process export pipeline (no Electron needed).
// Bundles src/main/ffmpeg.ts with a stub `electron`, pipes synthetic RGBA frames
// plus real audio inputs through FFmpeg and checks the resulting MP4 with ffprobe.
//
//   node scripts/test-export-pipeline.mjs <audio-file> [<audio-file>...]
import { build } from 'esbuild'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createRequire } from 'module'
import { execFileSync } from 'child_process'

const root = resolve(new URL('..', import.meta.url).pathname)
const dir = mkdtempSync(join(tmpdir(), 'reelator-test-'))
const stub = join(dir, 'electron-stub.js')
writeFileSync(stub, `module.exports = { app: { getPath: () => ${JSON.stringify(dir)} } }`)
// keep the bundle inside the project so `ffmpeg-static` resolves from node_modules
const cache = join(root, 'node_modules', '.cache', 'reelator-test')
mkdirSync(cache, { recursive: true })
const outfile = join(cache, 'ffmpeg.cjs')
await build({
  entryPoints: [join(root, 'src/main/ffmpeg.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile,
  alias: { electron: stub },
  external: ['ffmpeg-static', 'ffprobe-static'],
  nodePaths: [join(root, 'node_modules')]
})
const require = createRequire(join(root, 'package.json'))
const { ExportJob, FFPROBE, importMedia } = require(outfile)

const audioFiles = process.argv.slice(2)
const imported = await importMedia(audioFiles)
console.log('probe:', imported.map((m) => `${m.name} ${m.kind} ${m.duration.toFixed(2)}s ${m.width}x${m.height} audio=${m.hasAudio}`))

const W = 640, H = 360, FPS = 30, SECONDS = 4
const out = join(dir, 'out.mp4')
const job = new ExportJob({
  outPath: out, width: W, height: H, fps: FPS, duration: SECONDS, quality: 'medium',
  audio: imported.filter((m) => m.hasAudio).map((m, i) => ({
    path: m.path, sourceIn: 0.5, duration: 2, timelineStart: i * 1.5, volume: 0.8, fadeIn: 0.3, fadeOut: 0.3
  }))
})
const frame = new Uint8Array(W * H * 4)
for (let n = 0; n < FPS * SECONDS; n++) {
  const v = Math.round((n / (FPS * SECONDS)) * 255)
  for (let i = 0; i < frame.length; i += 4) { frame[i] = v; frame[i + 1] = 255 - v; frame[i + 2] = 128; frame[i + 3] = 255 }
  await job.writeFrame(frame)
}
await job.finish()
const info = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out]).toString())
const vs = info.streams.find((s) => s.codec_type === 'video')
const as = info.streams.find((s) => s.codec_type === 'audio')
console.log('output:', out)
console.log(`video ${vs.codec_name} ${vs.width}x${vs.height} frames=${vs.nb_frames}; audio ${as?.codec_name} ${as?.channels}ch; duration ${(+info.format.duration).toFixed(2)}s`)
if (vs.width !== W || vs.height !== H || !as || Math.abs(+info.format.duration - SECONDS) > 0.15) {
  console.error('FAIL'); process.exit(1)
}
console.log('PASS')
