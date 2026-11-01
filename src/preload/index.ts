import { contextBridge, ipcRenderer } from 'electron'
import { pathToFileURL } from 'url'
import type { ReelatorApi } from '../shared/types'

const api: ReelatorApi = {
  platform: process.platform,
  openMediaDialog: () => ipcRenderer.invoke('media:openDialog'),
  importMedia: (paths) => ipcRenderer.invoke('media:import', paths),
  saveProjectDialog: (name) => ipcRenderer.invoke('project:saveDialog', name),
  openProjectDialog: () => ipcRenderer.invoke('project:openDialog'),
  writeTextFile: (path, content) => ipcRenderer.invoke('fs:writeText', path, content),
  readTextFile: (path) => ipcRenderer.invoke('fs:readText', path),
  exportSaveDialog: (name) => ipcRenderer.invoke('export:saveDialog', name),
  exportStart: (opts) => ipcRenderer.invoke('export:start', opts),
  exportFrame: (frame) => ipcRenderer.invoke('export:frame', frame),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  showInFolder: (path) => ipcRenderer.invoke('shell:showInFolder', path),
  toFileUrl: (path) => pathToFileURL(path).href
}

contextBridge.exposeInMainWorld('reelator', api)
