/// <reference types="vite/client" />
import type { ReelatorApi } from '../shared/types'

declare global {
  interface Window {
    reelator: ReelatorApi
  }
}

export {}
