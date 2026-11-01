import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { ExportJob, importMedia } from './ffmpeg'
import type { ExportStartOptions } from '../shared/types'

let win: BrowserWindow | null = null
let job: ExportJob | null = null

const MEDIA_FILTERS = [
  { name: '미디어', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'mts', 'gif',
    'png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
  { name: '모든 파일', extensions: ['*'] }
]

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#121218',
    title: 'Reelator',
    icon: join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      // Local media files are loaded straight from disk via file:// URLs.
      webSecurity: false,
      backgroundThrottling: false
    }
  })
  Menu.setApplicationMenu(null)
  win.on('closed', () => { win = null })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  // DevTools with F12 / Ctrl+Shift+I for debugging.
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win?.webContents.toggleDevTools()
    }
  })
}

ipcMain.handle('media:openDialog', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'], filters: MEDIA_FILTERS })
  return r.canceled ? [] : r.filePaths
})

ipcMain.handle('media:import', (_e, paths: string[]) => importMedia(paths))

ipcMain.handle('project:saveDialog', async (_e, name: string) => {
  const r = await dialog.showSaveDialog(win!, {
    defaultPath: `${name}.reelator`,
    filters: [{ name: 'Reelator 프로젝트', extensions: ['reelator'] }]
  })
  return r.canceled ? null : r.filePath ?? null
})

ipcMain.handle('project:openDialog', async () => {
  const r = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Reelator 프로젝트', extensions: ['reelator'] }]
  })
  return r.canceled ? null : r.filePaths[0] ?? null
})

ipcMain.handle('fs:writeText', (_e, path: string, content: string) => writeFile(path, content, 'utf8'))
ipcMain.handle('fs:readText', (_e, path: string) => readFile(path, 'utf8'))

ipcMain.handle('export:saveDialog', async (_e, name: string) => {
  const r = await dialog.showSaveDialog(win!, {
    defaultPath: `${name}.mp4`,
    filters: [{ name: 'MP4 동영상', extensions: ['mp4'] }]
  })
  return r.canceled ? null : r.filePath ?? null
})

ipcMain.handle('export:start', (_e, opts: ExportStartOptions) => {
  job?.cancel()
  job = new ExportJob(opts)
})

ipcMain.handle('export:frame', (_e, frame: Uint8Array) => {
  if (!job) throw new Error('No export in progress')
  return job.writeFrame(frame)
})

ipcMain.handle('export:finish', async () => {
  const j = job
  job = null
  if (j) await j.finish()
})

ipcMain.handle('export:cancel', () => {
  job?.cancel()
  job = null
})

ipcMain.handle('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  job?.cancel()
  if (process.platform !== 'darwin') app.quit()
})
