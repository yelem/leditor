import { useEffect, useState } from 'react'
import { useSettings } from '@renderer/store'
import { useT } from '@renderer/lib/i18n'
import type { UpdateStatus } from '@shared/update-types'

/** Auto-update toggle, manual check, and live status. */
export function UpdateSettingsSection(): JSX.Element {
  const t = useT()
  const { settings, patch } = useSettings()
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.api.update.appVersion().then(setVersion).catch(() => undefined)
    return window.api.update.onStatus(setStatus)
  }, [])

  const statusText = (): string | null => {
    switch (status.state) {
      case 'checking':
        return t('update.checking')
      case 'available':
        return t('update.available', { version: status.version })
      case 'not-available':
        return t('update.notAvailable')
      case 'downloading':
        return t('update.downloading', { percent: status.percent })
      case 'downloaded':
        return t('update.downloaded', { version: status.version })
      case 'error':
        return t('update.error', { message: status.message })
      default:
        return null
    }
  }

  const text = statusText()
  const busy = status.state === 'checking' || status.state === 'downloading'

  return (
    <section className="settings__section">
      <h3 className="settings__heading">{t('settings.tabUpdate')}</h3>

      <div className="settings__field">
        <span className="settings__label">{t('update.currentVersion')}</span>
        <span>{version}</span>
      </div>

      <label className="settings__field settings__field--checkbox">
        <input
          type="checkbox"
          checked={settings.autoUpdate.enabled}
          onChange={(e) => patch({ autoUpdate: { enabled: e.target.checked } })}
        />
        <span>{t('update.autoCheck')}</span>
      </label>

      <div className="settings__path-actions">
        <button
          type="button"
          className="settings__minor-btn"
          disabled={busy}
          onClick={() => void window.api.update.check()}
        >
          {t('update.checkNow')}
        </button>
        {status.state === 'downloaded' && (
          <button
            type="button"
            className="settings__minor-btn"
            onClick={() => void window.api.update.install()}
          >
            {t('update.restartNow')}
          </button>
        )}
      </div>

      {text && <p className="settings__note">{text}</p>}
    </section>
  )
}
