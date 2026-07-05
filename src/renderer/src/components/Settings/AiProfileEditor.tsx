import { useEffect, useState } from 'react'
import type { AiProfile, AiProviderKind, AiTestResult } from '@shared/ai-types'
import { AI_PRESETS, presetLabel } from '@renderer/lib/ai-presets'
import { useT } from '@renderer/lib/i18n'

interface AiProfileEditorProps {
  profile: AiProfile
  /** Save the profile; key=null — keep the key, '' — clear it, otherwise — the new key. */
  onSave: (profile: AiProfile, key: string | null) => void
  onCancel: () => void
}

export function AiProfileEditor({ profile, onSave, onCancel }: AiProfileEditorProps): JSX.Element {
  const t = useT()
  const [name, setName] = useState(profile.name)
  const [kind, setKind] = useState<AiProviderKind>(profile.kind)
  const [baseUrl, setBaseUrl] = useState(profile.baseUrl)
  const [model, setModel] = useState(profile.model)
  const [apiKey, setApiKey] = useState('')
  const [hasStoredKey, setHasStoredKey] = useState(false)

  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState<'test' | 'models' | null>(null)
  const [test, setTest] = useState<AiTestResult | null>(null)

  useEffect(() => {
    window.api.ai.keyStatus(profile.id).then(setHasStoredKey).catch(() => undefined)
  }, [profile.id])

  const applyPreset = (presetId: string): void => {
    const preset = AI_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setKind(preset.kind)
    setBaseUrl(preset.baseUrl)
    if (preset.model) setModel(preset.model)
  }

  const draft = (): Parameters<typeof window.api.ai.test>[0] => ({
    kind,
    baseUrl,
    model,
    apiKey: apiKey || undefined,
    profileId: profile.id
  })

  const handleTest = async (): Promise<void> => {
    setBusy('test')
    setTest(null)
    try {
      setTest(await window.api.ai.test(draft()))
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  const handleLoadModels = async (): Promise<void> => {
    setBusy('models')
    try {
      const list = await window.api.ai.listModels(draft())
      setModels(list.map((m) => m.id))
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  const handleSave = (): void => {
    const updated: AiProfile = { id: profile.id, name: name.trim() || t('ai.profileFallbackName'), kind, baseUrl, model }
    onSave(updated, apiKey ? apiKey : null)
  }

  return (
    <div className="ai-editor__backdrop" onMouseDown={onCancel}>
      <div className="ai-editor" onMouseDown={(e) => e.stopPropagation()}>
        <header className="ai-editor__header">
          <h3>{t('ai.profileTitle')}</h3>
          <button type="button" className="settings__close" onClick={onCancel} aria-label={t('common.close')}>
            ✕
          </button>
        </header>

        <div className="ai-editor__body">
          <label className="ai-editor__field">
            <span>{t('ai.name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ai.namePlaceholder')} />
          </label>

          <label className="ai-editor__field">
            <span>{t('ai.preset')}</span>
            <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="" disabled>
                {t('ai.choosePreset')}
              </option>
              {AI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {presetLabel(p, t)}
                </option>
              ))}
            </select>
          </label>

          <label className="ai-editor__field">
            <span>{t('ai.type')}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as AiProviderKind)}>
              <option value="anthropic">{t('ai.kindAnthropic')}</option>
              <option value="openai">{t('ai.kindOpenai')}</option>
            </select>
          </label>

          {kind === 'openai' && (
            <label className="ai-editor__field">
              <span>Base URL</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:1234/v1"
              />
            </label>
          )}

          <label className="ai-editor__field">
            <span>{t('ai.model')}</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list="ai-models"
              placeholder={kind === 'anthropic' ? 'claude-opus-4-8' : t('ai.modelPlaceholder')}
            />
            <datalist id="ai-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label className="ai-editor__field">
            <span>{t('ai.apiKey')} {hasStoredKey && <em className="ai-editor__saved">{t('ai.keySaved')}</em>}</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasStoredKey ? t('ai.keyPlaceholderStored') : t('ai.keyPlaceholder')}
              autoComplete="off"
            />
          </label>

          <div className="ai-editor__actions">
            <button type="button" className="settings__minor-btn" onClick={handleTest} disabled={busy !== null}>
              {busy === 'test' ? t('ai.testing') : t('ai.test')}
            </button>
            <button type="button" className="settings__minor-btn" onClick={handleLoadModels} disabled={busy !== null}>
              {busy === 'models' ? t('ai.loading') : t('ai.loadModels')}
            </button>
          </div>

          {test && (
            <p className={`ai-editor__result ${test.ok ? 'is-ok' : 'is-err'}`}>
              {test.ok ? t('ai.testOk', { reply: test.reply ?? '' }) : `✕ ${test.error}`}
            </p>
          )}
        </div>

        <footer className="ai-editor__footer">
          <button type="button" className="settings__minor-btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="settings__done" onClick={handleSave}>
            {t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}
