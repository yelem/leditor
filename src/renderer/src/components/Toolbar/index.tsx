import { useEffect, useRef, useState } from 'react'
import { useUi, useProject } from '@renderer/store'
import { useT } from '@renderer/lib/i18n'
import { SettingsDialog } from '@renderer/components/Settings'
import { BackupsDialog } from '@renderer/components/Backups/BackupsDialog'
import { ExportDialog } from '@renderer/components/Export/ExportDialog'
import './toolbar.css'

export function Toolbar(): JSX.Element {
  const t = useT()
  const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight } = useUi()
  const { manifest, busy, createProject, openProject, closeProject, showCombined } = useProject()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const openMenu = (): void => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ left: rect.left, top: rect.bottom + 4 })
    setMenuOpen(true)
  }

  const run = (fn: () => void): void => {
    setMenuOpen(false)
    fn()
  }

  return (
    <>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {backupsOpen && <BackupsDialog onClose={() => setBackupsOpen(false)} />}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      <header className="toolbar">
        <div className="toolbar__group">
          <button
            type="button"
            className={`toolbar__icon-toggle${leftCollapsed ? '' : ' is-active'}`}
            onClick={toggleLeft}
            title={leftCollapsed ? t('toolbar.showLeft') : t('toolbar.hideLeft')}
            aria-pressed={!leftCollapsed}
          >
            ▌
          </button>

          <div className="toolbar__dropdown" ref={menuRef}>
          <button
            ref={menuBtnRef}
            type="button"
            className={`toolbar__btn${menuOpen ? ' is-active' : ''}`}
            onClick={openMenu}
            disabled={busy}
          >
            {t('toolbar.project')} ▾
          </button>

          {menuOpen && (
            <ul className="toolbar__menu" style={{ left: menuPos.left, top: menuPos.top }}>
              <li className="toolbar__menu-item" onClick={() => run(createProject)}>
                {t('toolbar.create')}
              </li>
              <li className="toolbar__menu-item" onClick={() => run(openProject)}>
                {t('toolbar.open')}
              </li>
              {manifest && (
                <li className="toolbar__menu-item" onClick={() => run(closeProject)}>
                  {t('toolbar.closeProject')}
                </li>
              )}
              {manifest && (
                <>
                  <li className="toolbar__menu-sep" />
                  <li
                    className="toolbar__menu-item"
                    onClick={() => run(() => showCombined({ type: 'all' }))}
                  >
                    {t('toolbar.combineAll')}
                  </li>
                  <li className="toolbar__menu-item" onClick={() => run(() => setExportOpen(true))}>
                    {t('toolbar.export')}
                  </li>
                  <li className="toolbar__menu-item" onClick={() => run(() => setBackupsOpen(true))}>
                    {t('toolbar.backups')}
                  </li>
                </>
              )}
            </ul>
          )}
          </div>
        </div>

        <div className="toolbar__title">
          <span className="toolbar__project-name">{manifest?.title ?? t('toolbar.noProject')}</span>
          {!manifest && <span className="toolbar__badge">{t('toolbar.badgeNoProject')}</span>}
        </div>

        <div className="toolbar__group toolbar__group--right">
          <button
            type="button"
            className="toolbar__icon-toggle"
            title={t('toolbar.settings')}
            onClick={() => setSettingsOpen(true)}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            type="button"
            className={`toolbar__icon-toggle${rightCollapsed ? '' : ' is-active'}`}
            onClick={toggleRight}
            title={rightCollapsed ? t('toolbar.showRight') : t('toolbar.hideRight')}
            aria-pressed={!rightCollapsed}
          >
            ▐
          </button>
        </div>
      </header>
    </>
  )
}
