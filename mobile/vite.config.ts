import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phone (Android PWA) build, published to GitHub Pages at /Reelator/
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../src/renderer'),
      '@common': resolve(__dirname, '../src/shared')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022'
  },
  server: { host: true }
})
