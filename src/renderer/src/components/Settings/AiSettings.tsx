import { useEffect, useState } from 'react'
import type { AiProfile } from '@shared/ai-types'
import { useSettings } from '@renderer/store'
import { AiProfileEditor } from './AiProfileEditor'
import { useT } from '@renderer/lib/i18n'

function kindLabel(p: AiProfile, fallback: string): string {
  if (p.kind === 'anthropic') return 'Claude'
  try {
    return new URL(p.baseUrl).host
  } catch {
    return fallback
  }
}

export function AiSettingsSection(): JSX.Element {
  const t = useT()
  const { settings, patch } = useSettings()
  const ai = settings.ai
  const [editing, setEditing] = useState<AiProfile | null>(null)
  const [storageOk, setStorageOk] = useState(true)

  useEffect(() => {
    window.api.ai.storageAvailable().then(setStorageOk).catch(() => undefined)
  }, [])

  const addProfile = (): void => {
    setEditing({
      id: crypto.randomUUID(),
      name: t('ai.newProfileName'),
      kind: 'openai',
      baseUrl: 'http://localhost:1234/v1',
      model: ''
    })
  }

  const saveProfile = (profile: AiProfile, key: string | null): void => {
    const exists = ai.profiles.some((p) => p.id === profile.id)
    const profiles = exists
      ? ai.profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...ai.profiles, profile]
    // The first added profile automatically becomes active.
    const activeProfileId = ai.activeProfileId ?? profile.id
    patch({ ai: { activeProfileId, profiles } })
    if (key !== null) void window.api.ai.setKey(profile.id, key).catch(() => undefined)
    setEditing(null)
  }

  const deleteProfile = (id: string): void => {
    void window.api.ai.deleteKey(id).catch(() => undefined)
    const profiles = ai.profiles.filter((p) => p.id !== id)
    const activeProfileId = ai.activeProfileId === id ? (profiles[0]?.id ?? null) : ai.activeProfileId
    patch({ ai: { activeProfileId, profiles } })
  }

  return (
    <section className="settings__section">
      <h3 className="settings__heading">{t('ai.heading')}</h3>
      <p className="settings__note">{t('ai.note')}</p>

      {!storageOk && (
        <p className="settings__note" style={{ color: '#d0814a' }}>{t('ai.storageUnavailable')}</p>
      )}

      {ai.profiles.length === 0 ? (
        <p className="settings__note">{t('ai.noProfiles')}</p>
      ) : (
        <ul className="ai-list">
          {ai.profiles.map((p) => (
            <li key={p.id} className="ai-list__item">
              <label className="ai-list__active">
                <input
                  type="radio"
                  name="ai-active"
                  checked={ai.activeProfileId === p.id}
                  onChange={() => patch({ ai: { ...ai, activeProfileId: p.id } })}
                />
              </label>
              <div className="ai-list__info">
                <span className="ai-list__name">{p.name}</span>
                <span className="ai-list__meta">
                  {kindLabel(p, t('ai.openaiCompat'))} · {p.model || t('ai.modelNotSet')}
                </span>
              </div>
              <div className="ai-list__actions">
                <button type="button" className="settings__minor-btn" onClick={() => setEditing(p)}>
                  {t('ai.edit')}
                </button>
                <button
                  type="button"
                  className="settings__minor-btn"
                  onClick={() => deleteProfile(p.id)}
                >
                  {t('common.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="settings__minor-btn" onClick={addProfile}>
        {t('ai.addProfile')}
      </button>

      {editing && (
        <AiProfileEditor profile={editing} onSave={saveProfile} onCancel={() => setEditing(null)} />
      )}
    </section>
  )
}
