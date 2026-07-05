import { useEffect, useState } from 'react'
import type { ExportFormat, ExportGranularity } from '@shared/export-types'
import { useProject } from '@renderer/store'
import { type TranslationKey } from '@shared/i18n'
import { useT } from '@renderer/lib/i18n'
import './export.css'

const FORMATS: Array<{ value: ExportFormat; label: string; hintKey: TranslationKey }> = [
  { value: 'docx', label: 'Word (.docx)', hintKey: 'export.docxHint' },
  { value: 'fb2', label: 'FB2 (.fb2)', hintKey: 'export.fb2Hint' },
  { value: 'epub', label: 'EPUB (.epub)', hintKey: 'export.epubHint' }
]

export function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT()
  const { projectPath, activeDocId } = useProject()
  const [format, setFormat] = useState<ExportFormat>('docx')
  const [granularity, setGranularity] = useState<ExportGranularity>('project')
  const [outputDir, setOutputDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ files: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Subscribe to export progress.
  useEffect(() => window.api.export.onProgress(setProgress), [])

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.dialog.pickDirectory()
    if (dir) setOutputDir(dir)
  }

  const run = async (): Promise<void> => {
    if (!projectPath || !outputDir) return
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress({ done: 0, total: 1 })
    try {
      const res = await window.api.export.run(projectPath, {
        format,
        granularity,
        outputDir,
        currentDocId: activeDocId ?? undefined
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const granularities: Array<{ value: ExportGranularity; label: string; disabled?: boolean }> = [
    { value: 'project', label: t('export.wholeProject') },
    { value: 'perFolder', label: t('export.perFolder') },
    { value: 'perChapter', label: t('export.perChapter') },
    { value: 'current', label: t('export.currentOnly'), disabled: !activeDocId }
  ]

  return (
    <div className="export__backdrop" onMouseDown={onClose}>
      <div className="export" onMouseDown={(e) => e.stopPropagation()}>
        <header className="export__header">
          <h2 className="export__title">{t('export.title')}</h2>
          <button type="button" className="settings__close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>

        <div className="export__body">
          <section className="export__section">
            <h3 className="export__heading">{t('export.format')}</h3>
            <div className="export__formats">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`export__format${format === f.value ? ' is-active' : ''}`}
                  onClick={() => setFormat(f.value)}
                >
                  <span className="export__format-label">{f.label}</span>
                  <span className="export__format-hint">{t(f.hintKey)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="export__section">
            <h3 className="export__heading">{t('export.what')}</h3>
            {granularities.map((g) => (
              <label key={g.value} className={`export__radio${g.disabled ? ' is-disabled' : ''}`}>
                <input
                  type="radio"
                  name="granularity"
                  checked={granularity === g.value}
                  disabled={g.disabled}
                  onChange={() => setGranularity(g.value)}
                />
                <span>{g.label}</span>
              </label>
            ))}
          </section>

          <section className="export__section">
            <h3 className="export__heading">{t('export.destination')}</h3>
            <div className="export__dir">
              <span className="export__dir-path" title={outputDir || undefined}>
                {outputDir || t('export.notChosen')}
              </span>
              <button type="button" className="settings__minor-btn" onClick={() => void pickDir()}>
                {t('export.choose')}
              </button>
            </div>
          </section>

          {busy && progress && (
            <div className="export__progress-wrap">
              <div className="export__progress">
                <div
                  className="export__progress-fill"
                  style={{
                    width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`
                  }}
                />
              </div>
              <span className="export__progress-text">
                {t('export.progress', { done: progress.done, total: progress.total })}
              </span>
            </div>
          )}
          {error && <p className="export__error">{error}</p>}
          {result && (
            <p className="export__ok">
              {t('export.doneN', { n: result.files.length })}{' '}
              <button
                type="button"
                className="export__link"
                onClick={() => void window.api.dialog.openPath(outputDir)}
              >
                {t('export.openFolder')}
              </button>
            </p>
          )}
        </div>

        <footer className="export__footer">
          <button type="button" className="settings__minor-btn" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="export__run"
            disabled={busy || !outputDir || !projectPath}
            onClick={() => void run()}
          >
            {busy ? t('export.running') : t('export.run')}
          </button>
        </footer>
      </div>
    </div>
  )
}
