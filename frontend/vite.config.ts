import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * pdf.js worker must load with a JavaScript MIME type. Vite's default `?url` bundle ends up as
 * `/assets/*.mjs`, which many static servers (nginx without .mjs) serve as octet-stream; browsers
 * then reject the worker. Copy the worker to `public/*.js` so `mime.types` maps it correctly.
 * `buildStart` runs for both `vite dev` and `vite build`.
 */
function copyPdfWorker(): Plugin {
  return {
    name: 'copy-pdf-worker',
    buildStart() {
      const src = path.resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
      const dest = path.resolve(__dirname, 'public/pdf.worker.min.js')
      if (!fs.existsSync(src)) {
        this.warn(`copy-pdf-worker: missing ${src} (run npm install in frontend)`)
        return
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    },
  }
}

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    copyPdfWorker(),
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  server: {
    proxy: {
      '/auth': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/items': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/folders': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/notes': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/ai': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
})
