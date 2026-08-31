import { useEffect, useState } from 'react'
import {
  type ChapterTitleMode,
  type ExportFormat,
  type ExportGranularity,
  type ExportStyle,
  type PageMarginsCm,
  type PageSize,
  DEFAULT_EXPORT_STYLE,
  pxToPt
} from '@shared/export-types'
import { DEFAULT_PROJECT_SETTINGS } from '@shared/project-types'
import { useProject, useSettings } from '@renderer/store'
import { type TranslationKey } from '@shared/i18n'
import { useT } from '@renderer/lib/i18n'
import { NumberField } from '@renderer/components/common/NumberField'
import { FontSelect } from '@renderer/components/common/FontSelect'
import './export.css'

/** Electron wraps IPC failures — show only the message main actually sent. */
function ipcErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const marker = raw.lastIndexOf('Error: ')
  return marker >= 0 ? raw.slice(marker + 'Error: '.length) : raw
}

const FORMATS: Array<{ value: ExportFormat; label: string; hintKey: TranslationKey }> = [
  { value: 'docx', label: 'Word (.docx)', hintKey: 'export.docxHint' },
  { value: 'fb2', label: 'FB2 (.fb2)', hintKey: 'export.fb2Hint' },
  { value: 'epub', label: 'EPUB (.epub)', hintKey: 'export.epubHint' }
]

const MARGIN_SIDES: Array<{ key: keyof PageMarginsCm; labelKey: TranslationKey }> = [
  { key: 'top', labelKey: 'export.marginTop' },
  { key: 'bottom', labelKey: 'export.marginBottom' },
  { key: 'left', labelKey: 'export.marginLeft' },
  { key: 'right', labelKey: 'export.marginRight' }
]

interface ExportDialogProps {
  onClose: () => void
  /** Nodes picked in the tree — enables (and preselects) the "selection" mode. */
  selectionIds?: string[]
}

export function ExportDialog({ onClose, selectionIds }: ExportDialogProps): JSX.Element {
  const t = useT()
  const { projectPath, activeDocId, manifest } = useProject()
  const { settings, patch } = useSettings()
  const presets = settings.exportPresets
  const hasSelection = (selectionIds?.length ?? 0) > 0
  const projectSettings = manifest?.settings ?? DEFAULT_PROJECT_SETTINGS
  // Typography of the output: prefilled from the editor's writing area.
  const editorStyle = (): ExportStyle => ({
    ...DEFAULT_EXPORT_STYLE,
    fontFamily: projectSettings.fontFamily,
    fontSizePt: pxToPt(projectSettings.fontSize),
    lineHeight: projectSettings.lineHeight
  })
  // Last export's typography wins over the editor's, so repeat exports match.
  const [style, setStyle] = useState<ExportStyle>(() => settings.exportStyle ?? editorStyle())
  const [presetId, setPresetId] = useState('')
  const [naming, setNaming] = useState(false)
  const [presetName, setPresetName] = useState('')

  // Any manual edit detaches the form from the selected preset.
  const changeStyle = (partial: Partial<ExportStyle>): void => {
    setStyle((s) => ({ ...s, ...partial }))
    setPresetId('')
  }

  const applyPreset = (id: string): void => {
    setPresetId(id)
    const preset = presets.find((p) => p.id === id)
    if (preset) setStyle(preset.style)
    else setStyle(editorStyle())
  }

  const savePreset = (): void => {
    const name = presetName.trim()
    if (!name) return
    const preset = { id: crypto.randomUUID(), name, style }
    patch({ exportPresets: [...presets, preset] })
    setPresetId(preset.id)
    setNaming(false)
    setPresetName('')
  }

  const deletePreset = (): void => {
    if (!presetId) return
    patch({ exportPresets: presets.filter((p) => p.id !== presetId) })
    setPresetId('')
  }
  const [format, setFormat] = useState<ExportFormat>('docx')
  const [granularity, setGranularity] = useState<ExportGranularity>(
    hasSelection ? 'selection' : 'project'
  )
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
        currentDocId: activeDocId ?? undefined,
        nodeIds: selectionIds,
        style
      })
      setResult(res)
      patch({ exportStyle: style })
    } catch (err) {
      setError(ipcErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  const granularities: Array<{ value: ExportGranularity; label: string; disabled?: boolean }> = [
    ...(hasSelection
      ? [
          {
            value: 'selection' as const,
            label: t('export.selectionN', { n: selectionIds?.length ?? 0 })
          }
        ]
      : []),
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

          {format !== 'fb2' && (
            <section className="export__section">
              <h3 className="export__heading">{t('export.styleHeading')}</h3>
              <p className="settings__note">{t('export.styleNote')}</p>

              <div className="settings__field settings__field--stack">
                <span className="settings__label">{t('export.preset')}</span>
                <select
                  className="settings__select"
                  value={presetId}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  <option value="">{t('export.presetNone')}</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="settings__path-actions">
                  {naming ? (
                    <>
                      <input
                        className="settings__select"
                        autoFocus
                        value={presetName}
                        placeholder={t('export.presetNamePlaceholder')}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') savePreset()
                          else if (e.key === 'Escape') setNaming(false)
                        }}
                      />
                      <button type="button" className="settings__minor-btn" onClick={savePreset}>
                        {t('export.presetSaveConfirm')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="settings__minor-btn"
                        onClick={() => setNaming(true)}
                      >
                        {t('export.presetSave')}
                      </button>
                      <button
                        type="button"
                        className="settings__minor-btn"
                        disabled={!presetId}
                        onClick={deletePreset}
                      >
                        {t('export.presetDelete')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="settings__field settings__field--stack">
                <span className="settings__label">{t('settings.font')}</span>
                <FontSelect
                  className="settings__select"
                  value={style.fontFamily}
                  onChange={(v) => changeStyle({ fontFamily: v })}
                />
              </div>

              <div className="settings__field">
                <span className="settings__label">{t('export.fontSizePt')}</span>
                <NumberField
                  value={style.fontSizePt}
                  min={6}
                  max={72}
                  step={0.5}
                  suffix={t('export.pt')}
                  onCommit={(v) => changeStyle({ fontSizePt: v })}
                />
              </div>

              <div className="settings__field settings__field--stack">
                <span className="settings__label">{t('export.paragraphSpacing')}</span>
                <div className="export__margins">
                  <label className="export__margin">
                    <span>{t('export.spaceBefore')}</span>
                    <NumberField
                      value={style.spaceBeforePt}
                      min={0}
                      max={72}
                      step={1}
                      suffix={t('export.pt')}
                      onCommit={(v) => changeStyle({ spaceBeforePt: v })}
                    />
                  </label>
                  <label className="export__margin">
                    <span>{t('export.spaceAfter')}</span>
                    <NumberField
                      value={style.spaceAfterPt}
                      min={0}
                      max={72}
                      step={1}
                      suffix={t('export.pt')}
                      onCommit={(v) => changeStyle({ spaceAfterPt: v })}
                    />
                  </label>
                </div>
              </div>

              <div className="settings__field">
                <span className="settings__label">{t('settings.lineHeight')}</span>
                <NumberField
                  value={style.lineHeight}
                  min={1}
                  max={4}
                  step={0.1}
                  onCommit={(v) => changeStyle({ lineHeight: v })}
                />
              </div>

              <label className="settings__field settings__field--checkbox">
                <input
                  type="checkbox"
                  checked={style.justify}
                  onChange={(e) => changeStyle({ justify: e.target.checked })}
                />
                <span>{t('export.justify')}</span>
              </label>

              <label className="settings__field settings__field--checkbox">
                <input
                  type="checkbox"
                  checked={style.hyphenation}
                  onChange={(e) => changeStyle({ hyphenation: e.target.checked })}
                />
                <span>{t('export.hyphenation')}</span>
              </label>

              <div className="settings__field settings__field--stack">
                <span className="settings__label">{t('export.chapterTitle')}</span>
                <select
                  className="settings__select"
                  value={style.chapterTitle}
                  onChange={(e) => changeStyle({ chapterTitle: e.target.value as ChapterTitleMode })}
                >
                  <option value="heading">{t('export.titleHeading')}</option>
                  <option value="centered">{t('export.titleCentered')}</option>
                  <option value="none">{t('export.titleNone')}</option>
                </select>
              </div>

              {format === 'docx' && (
                <>
                  <div className="settings__field">
                    <span className="settings__label">{t('export.pageSize')}</span>
                    <select
                      className="settings__select"
                      value={style.pageSize}
                      onChange={(e) => changeStyle({ pageSize: e.target.value as PageSize })}
                    >
                      <option value="a4">A4</option>
                      <option value="a5">A5</option>
                      <option value="letter">Letter</option>
                    </select>
                  </div>

                  <div className="settings__field settings__field--stack">
                    <span className="settings__label">{t('export.margins')}</span>
                    <div className="export__margins">
                      {MARGIN_SIDES.map(({ key, labelKey }) => (
                        <label key={key} className="export__margin">
                          <span>{t(labelKey)}</span>
                          <NumberField
                            value={style.margins[key]}
                            min={0}
                            max={10}
                            step={0.5}
                            suffix={t('export.cm')}
                            onCommit={(v) => changeStyle({ margins: { ...style.margins, [key]: v } })}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                className="settings__minor-btn"
                onClick={() => {
                  setStyle(editorStyle())
                  setPresetId('')
                }}
              >
                {t('export.styleReset')}
              </button>
            </section>
          )}

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
