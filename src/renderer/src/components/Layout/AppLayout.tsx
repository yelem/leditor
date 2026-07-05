import { useEffect } from 'react'
import { useUi, useProject, useSettings } from '@renderer/store'
import { Toolbar } from '@renderer/components/Toolbar'
import { FileTree } from '@renderer/components/FileTree'
import { Editor } from '@renderer/components/Editor'
import { CombinedView } from '@renderer/components/Combined/CombinedView'
import { RightPanel } from '@renderer/components/RightPanel'
import { Resizer } from './Resizer'
import { useT } from '@renderer/lib/i18n'
import './layout.css'

/** Каркас приложения: тулбар сверху + три рабочие панели. */
export function AppLayout(): JSX.Element {
  const t = useT()
  const {
    leftWidth,
    rightWidth,
    leftCollapsed,
    rightCollapsed,
    focusMode,
    resizeLeft,
    resizeRight,
    setFocus
  } = useUi()
  const { error, clearError, projectPath, combinedScope, openProjectByPath } = useProject()
  const { settings } = useSettings()
  const backupInterval = settings.backup.intervalMinutes

  // Выход из фокус-режима по Escape.
  useEffect(() => {
    if (!focusMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFocus(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusMode, setFocus])

  // Перетаскивание папки *.bookproj в окно — открыть проект.
  useEffect(() => {
    const onDragOver = (e: DragEvent): void => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      const path = (file as File & { path?: string }).path
      if (path && path.toLowerCase().endsWith('.bookproj')) {
        e.preventDefault()
        void openProjectByPath(path)
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openProjectByPath])

  // Автоснапшот по интервалу, пока проект открыт.
  useEffect(() => {
    if (!projectPath || backupInterval <= 0) return
    const id = setInterval(
      () => {
        void window.api.backup.snapshot(projectPath, 'interval').catch(() => undefined)
      },
      backupInterval * 60 * 1000
    )
    return () => clearInterval(id)
  }, [projectPath, backupInterval])

  const showLeft = !focusMode && !leftCollapsed
  const showRight = !focusMode && !rightCollapsed

  return (
    <div className={`app${focusMode ? ' app--focus' : ''}`}>
      {!focusMode && <Toolbar />}

      {error && (
        <div className="app__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
      )}

      <div className="workspace">
        {showLeft && (
          <>
            <aside className="panel panel--left" style={{ width: leftWidth }}>
              <FileTree />
            </aside>
            <Resizer onResize={resizeLeft} ariaLabel={t('app.resizeLeft')} />
          </>
        )}

        <main className="panel panel--center">
          {combinedScope ? <CombinedView /> : <Editor />}
        </main>

        {showRight && (
          <>
            <Resizer onResize={resizeRight} ariaLabel={t('app.resizeRight')} />
            <aside className="panel panel--right" style={{ width: rightWidth }}>
              <RightPanel />
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
