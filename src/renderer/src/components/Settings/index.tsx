import { useEffect, useState } from 'react'
import { useSettings } from '@renderer/store'
import { LANGUAGE_LABELS, type TranslationKey } from '@shared/i18n'
import { UI_LANGUAGES } from '@shared/settings-types'
import { useT } from '@renderer/lib/i18n'
import { NumberField } from '@renderer/components/common/NumberField'
import { FontSelect } from '@renderer/components/common/FontSelect'
import { AiSettingsSection } from './AiSettings'
import { SpellSettingsSection } from './SpellSettings'
import './settings.css'

type TabId = 'appearance' | 'typography' | 'saving' | 'ai' | 'spell'

const TABS: Array<{ id: TabId; labelKey: TranslationKey }> = [
  { id: 'appearance', labelKey: 'settings.tabAppearance' },
  { id: 'typography', labelKey: 'settings.tabTypography' },
  { id: 'saving', labelKey: 'settings.tabSaving' },
  { id: 'ai', labelKey: 'settings.tabAi' },
  { id: 'spell', labelKey: 'settings.tabSpell' }
]

/** Экран глобальных настроек приложения (хранятся в userData). */
export function SettingsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT()
  const { settings, patch } = useSettings()
  const { defaults, backup, typography } = settings
  const [tab, setTab] = useState<TabId>('appearance')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="settings__backdrop" onMouseDown={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings__header">
          <h2 className="settings__title">{t('settings.title')}</h2>
          <button type="button" className="settings__close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>

        <div className="settings__main">
          <nav className="settings__nav">
            {TABS.map((tabDef) => (
              <button
                key={tabDef.id}
                type="button"
                className={tab === tabDef.id ? 'settings__nav-item is-active' : 'settings__nav-item'}
                onClick={() => setTab(tabDef.id)}
              >
                {t(tabDef.labelKey)}
              </button>
            ))}
          </nav>

          <div className="settings__body">
            {tab === 'appearance' && (
              <>
                <section className="settings__section">
                  <h3 className="settings__heading">{t('settings.language')}</h3>
                  <div className="settings__segmented">
                    {UI_LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        className={settings.language === lang ? 'is-active' : ''}
                        onClick={() => patch({ language: lang })}
                      >
                        {LANGUAGE_LABELS[lang]}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings__section">
                  <h3 className="settings__heading">{t('settings.theme')}</h3>
                  <div className="settings__segmented">
                    <button
                      type="button"
                      className={settings.theme === 'light' ? 'is-active' : ''}
                      onClick={() => patch({ theme: 'light' })}
                    >
                      <IconSun />
                      {t('settings.light')}
                    </button>
                    <button
                      type="button"
                      className={settings.theme === 'dark' ? 'is-active' : ''}
                      onClick={() => patch({ theme: 'dark' })}
                    >
                      <IconMoon />
                      {t('settings.dark')}
                    </button>
                  </div>
                </section>

                <section className="settings__section">
                  <h3 className="settings__heading">{t('settings.defaultsHeading')}</h3>
                  <p className="settings__note">{t('settings.defaultsNote')}</p>

                  <div className="settings__field settings__field--stack">
                    <span className="settings__label">{t('settings.font')}</span>
                    <FontSelect
                      className="settings__select"
                      value={defaults.fontFamily}
                      onChange={(v) => patch({ defaults: { ...defaults, fontFamily: v } })}
                    />
                  </div>

                  <div className="settings__field">
                    <span className="settings__label">{t('settings.fontSize')}</span>
                    <NumberField
                      value={defaults.fontSize}
                      min={8}
                      max={120}
                      suffix="px"
                      onCommit={(v) => patch({ defaults: { ...defaults, fontSize: v } })}
                    />
                  </div>

                  <div className="settings__field">
                    <span className="settings__label">{t('settings.lineHeight')}</span>
                    <NumberField
                      value={defaults.lineHeight}
                      min={1}
                      max={4}
                      step={0.1}
                      onCommit={(v) => patch({ defaults: { ...defaults, lineHeight: v } })}
                    />
                  </div>

                  <div className="settings__field">
                    <span className="settings__label">{t('settings.width')}</span>
                    <NumberField
                      value={defaults.editorWidth}
                      min={300}
                      max={2000}
                      step={10}
                      suffix="px"
                      onCommit={(v) => patch({ defaults: { ...defaults, editorWidth: v } })}
                    />
                  </div>
                </section>
              </>
            )}

            {tab === 'typography' && (
              <section className="settings__section">
                <h3 className="settings__heading">{t('settings.smartTypography')}</h3>
                <p className="settings__note">{t('settings.smartTypographyNote')}</p>

                <div className="settings__field settings__field--stack">
                  <span className="settings__label">{t('settings.quotes')}</span>
                  <div className="settings__segmented">
                    <button
                      type="button"
                      className={typography.quotes === 'guillemets' ? 'is-active' : ''}
                      onClick={() => patch({ typography: { ...typography, quotes: 'guillemets' } })}
                    >
                      {t('settings.quotesGuillemets')}
                    </button>
                    <button
                      type="button"
                      className={typography.quotes === 'german' ? 'is-active' : ''}
                      onClick={() => patch({ typography: { ...typography, quotes: 'german' } })}
                    >
                      {t('settings.quotesGerman')}
                    </button>
                    <button
                      type="button"
                      className={typography.quotes === 'off' ? 'is-active' : ''}
                      onClick={() => patch({ typography: { ...typography, quotes: 'off' } })}
                    >
                      {t('settings.quotesStraight')}
                    </button>
                  </div>
                </div>

                <label className="settings__field settings__field--checkbox">
                  <input
                    type="checkbox"
                    checked={typography.dashes}
                    onChange={(e) =>
                      patch({ typography: { ...typography, dashes: e.target.checked } })
                    }
                  />
                  <span>{t('settings.dashes')}</span>
                </label>

                <label className="settings__field settings__field--checkbox">
                  <input
                    type="checkbox"
                    checked={typography.ellipsis}
                    onChange={(e) =>
                      patch({ typography: { ...typography, ellipsis: e.target.checked } })
                    }
                  />
                  <span>{t('settings.ellipsis')}</span>
                </label>
              </section>
            )}

            {tab === 'saving' && (
              <>
                <section className="settings__section">
                  <h3 className="settings__heading">{t('settings.autosave')}</h3>
                  <div className="settings__field">
                    <span className="settings__label">{t('settings.autosaveDelay')}</span>
                    <NumberField
                      value={settings.autosaveDelayMs / 1000}
                      min={0.2}
                      max={60}
                      step={0.5}
                      suffix={t('settings.sec')}
                      onCommit={(v) => patch({ autosaveDelayMs: Math.round(v * 1000) })}
                    />
                  </div>
                </section>

                <section className="settings__section">
                  <h3 className="settings__heading">{t('settings.backup')}</h3>
                  <p className="settings__note">{t('settings.backupNote')}</p>

                  <div className="settings__field settings__field--stack">
                    <span className="settings__label">{t('settings.backupFolder')}</span>
                    <div className="settings__path">
                      <span
                        className="settings__path-value"
                        title={backup.customLocation || undefined}
                      >
                        {backup.customLocation || t('settings.backupDefaultLocation')}
                      </span>
                    </div>
                    <div className="settings__path-actions">
                      <button
                        type="button"
                        className="settings__minor-btn"
                        onClick={async () => {
                          const dir = await window.api.dialog.pickDirectory()
                          if (dir) patch({ backup: { ...backup, customLocation: dir } })
                        }}
                      >
                        {t('settings.chooseFolder')}
                      </button>
                      <button
                        type="button"
                        className="settings__minor-btn"
                        disabled={!backup.customLocation}
                        onClick={() => patch({ backup: { ...backup, customLocation: '' } })}
                      >
                        {t('settings.byDefault')}
                      </button>
                    </div>
                  </div>

                  <div className="settings__field">
                    <span className="settings__label">
                      {t('settings.snapshotInterval')}
                      <span className="settings__hint">{t('settings.zeroOff')}</span>
                    </span>
                    <NumberField
                      value={backup.intervalMinutes}
                      min={0}
                      max={1440}
                      suffix={t('settings.min')}
                      onCommit={(v) => patch({ backup: { ...backup, intervalMinutes: v } })}
                    />
                  </div>

                  <div className="settings__field">
                    <span className="settings__label">{t('settings.keepCopies')}</span>
                    <NumberField
                      value={backup.maxBackups}
                      min={1}
                      max={1000}
                      suffix={t('settings.pcs')}
                      onCommit={(v) => patch({ backup: { ...backup, maxBackups: v } })}
                    />
                  </div>

                  <label className="settings__field settings__field--checkbox">
                    <input
                      type="checkbox"
                      checked={backup.onOpen}
                      onChange={(e) => patch({ backup: { ...backup, onOpen: e.target.checked } })}
                    />
                    <span>{t('settings.snapshotOnOpen')}</span>
                  </label>

                  <label className="settings__field settings__field--checkbox">
                    <input
                      type="checkbox"
                      checked={backup.onClose}
                      onChange={(e) => patch({ backup: { ...backup, onClose: e.target.checked } })}
                    />
                    <span>{t('settings.snapshotOnClose')}</span>
                  </label>
                </section>
              </>
            )}

            {tab === 'ai' && <AiSettingsSection />}
            {tab === 'spell' && <SpellSettingsSection />}
          </div>
        </div>

        <footer className="settings__footer">
          <span className="settings__saved">{t('settings.autoSaved')}</span>
          <button type="button" className="settings__done" onClick={onClose}>
            {t('settings.done')}
          </button>
        </footer>
      </div>
    </div>
  )
}

const themeIconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

function IconSun(): JSX.Element {
  return (
    <svg {...themeIconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function IconMoon(): JSX.Element {
  return (
    <svg {...themeIconProps}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}
