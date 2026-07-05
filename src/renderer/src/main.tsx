import React from 'react'
import ReactDOM from 'react-dom/client'
import { ProjectProvider, SettingsProvider, UiProvider } from '@renderer/store'
import { flushAll } from '@renderer/lib/flush-registry'
import App from './App'
import './styles/index.css'

// The window is closing: immediately write pending autosaves (chapter text,
// notes) and confirm to main that closing may proceed.
window.api.app.onWillClose(() => {
  void flushAll().finally(() => {
    void window.api.app.closeReady()
  })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <UiProvider>
        <ProjectProvider>
          <App />
        </ProjectProvider>
      </UiProvider>
    </SettingsProvider>
  </React.StrictMode>
)
