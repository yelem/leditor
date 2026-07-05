import { useEffect, useState } from 'react'
import { useT } from '@renderer/lib/i18n'

/** Custom spelling dictionary management (list/add/remove). */
export function SpellSettingsSection(): JSX.Element {
  const t = useT()
  const [words, setWords] = useState<string[]>([])
  const [input, setInput] = useState('')

  const reload = (): void => {
    window.api.editor.listDictionary().then(setWords).catch(() => undefined)
  }

  useEffect(() => {
    reload()
  }, [])

  const add = async (): Promise<void> => {
    const w = input.trim()
    if (!w) return
    await window.api.editor.addToDictionary(w)
    setInput('')
    reload()
  }

  const remove = async (w: string): Promise<void> => {
    await window.api.editor.removeFromDictionary(w)
    reload()
  }

  const exportWords = async (): Promise<void> => {
    await window.api.editor.exportDictionary().catch(() => undefined)
  }

  const importWords = async (): Promise<void> => {
    const updated = await window.api.editor.importDictionary().catch(() => null)
    if (updated) setWords(updated)
  }

  return (
    <section className="settings__section">
      <h3 className="settings__heading">{t('spell.heading')}</h3>
      <p className="settings__note">{t('spell.note')}</p>

      <div className="settings__field">
        <input
          className="dict-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder={t('spell.addPlaceholder')}
        />
        <button type="button" className="settings__minor-btn" onClick={() => void add()}>
          {t('spell.add')}
        </button>
      </div>

      <div className="settings__path-actions">
        <button type="button" className="settings__minor-btn" onClick={() => void importWords()}>
          {t('spell.import')}
        </button>
        <button
          type="button"
          className="settings__minor-btn"
          disabled={words.length === 0}
          onClick={() => void exportWords()}
        >
          {t('spell.export')}
        </button>
      </div>

      {words.length === 0 ? (
        <p className="dict-empty">{t('spell.empty')}</p>
      ) : (
        <ul className="dict-list">
          {words.map((w) => (
            <li key={w} className="dict-list__item">
              <span className="dict-list__word">{w}</span>
              <button
                type="button"
                className="dict-list__remove"
                title={t('spell.removeWord')}
                onClick={() => void remove(w)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
