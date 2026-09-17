import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The renderer loads nothing from the network: no fetch, no workers, no remote
// fonts or images — everything goes through IPC. So the shipped page can afford
// a strict policy, which is the last line of defence if a Chromium bug ever lets
// pasted or AI-returned markup inject a tag.
//
// 'unsafe-inline' for styles only: React style props and ProseMirror decorations
// write style attributes.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
  // No frame-ancestors: it is ignored when delivered in a <meta> element.
].join('; ')

/**
 * Inject the CSP into the built index.html only. In dev the Vite client needs
 * inline scripts and a websocket, and a meta tag cannot be made conditional.
 */
function cspPlugin(): Plugin {
  return {
    name: 'leditor-csp',
    apply: 'build',
    transformIndexHtml(html) {
      // After the charset declaration, which the parser wants to see first.
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), cspPlugin()]
  }
})
