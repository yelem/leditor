import { useCallback, useEffect, useState } from 'react'
import type { BackupInfo, BackupReason } from '@shared/backup-types'
import { useProject, useSettings } from '@renderer/store'
import { ConfirmDialog } from '@renderer/components/common/ConfirmDialog'
import { LANGUAGE_LOCALES, type TranslationKey } from '@shared/i18n'
import { useT } from '@renderer/lib/i18n'
import './backups.css'

const REASON_KEYS: Record<BackupReason, TranslationKey> = {
  open: 'backups.reasonOpen',
  close: 'backups.reasonClose',
  interval: 'backups.reasonInterval',
  manual: 'backups.reasonManual',
  'pre-restore': 'backups.reasonPreRestore'
}

function formatDate(iso: string, locale: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function BackupsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT()
  const { settings } = useSettings()
  const locale = LANGUAGE_LOCALES[settings.language]
  const { projectPath, restoreBackup } = useProject()
  const [list, setList] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<BackupInfo | null>(null)

  const reload = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    try {
      setList(await window.api.backup.list(projectPath))
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    void reload()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reload, onClose])

  const handleSnapshot = async (): Promise<void> => {
    if (!projectPath) return
    setBusy(true)
    try {
      await window.api.backup.snapshot(projectPath, 'manual')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!projectPath) return
    setBusy(true)
    try {
      await window.api.backup.delete(projectPath, id)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async (id: string): Promise<void> => {
    setConfirmRestore(null)
    setBusy(true)
    try {
      await restoreBackup(id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backups__backdrop" onMouseDown={onClose}>
      <div
        className="backups"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="backups__header">
          <h2 className="backups__title">{t('backups.title')}</h2>
          <button type="button" className="backups__close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>

        <div className="backups__body">
          {loading ? (
            <p className="backups__empty">{t('backups.loading')}</p>
          ) : list.length === 0 ? (
            <p className="backups__empty">{t('backups.empty')}</p>
          ) : (
            <ul className="backups__list">
              {list.map((b) => (
                <li key={b.id} className="backups__item">
                  <div className="backups__info">
                    <span className="backups__date">{formatDate(b.createdAt, locale)}</span>
                    <span className="backups__meta">
                      {t(REASON_KEYS[b.reason])} · {t('backups.docs', { n: b.documentCount })}
                    </span>
                  </div>
                  <div className="backups__actions">
                    <button
                      type="button"
                      className="backups__btn"
                      disabled={busy}
                      onClick={() => setConfirmRestore(b)}
                    >
                      {t('backups.restore')}
                    </button>
                    <button
                      type="button"
                      className="backups__btn backups__btn--danger"
                      disabled={busy}
                      onClick={() => void handleDelete(b.id)}
                      title={t('backups.deleteTitle')}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="backups__footer">
          <span className="backups__hint">
            {t('backups.hint')}
          </span>
          <button
            type="button"
            className="backups__snapshot"
            disabled={busy || !projectPath}
            onClick={() => void handleSnapshot()}
          >
            {t('backups.create')}
          </button>
        </footer>
      </div>

      {confirmRestore && (
        <ConfirmDialog
          title={t('backups.restoreTitle')}
          message={t('backups.restoreConfirm', { date: formatDate(confirmRestore.createdAt, locale) })}
          confirmLabel={t('backups.restore')}
          onConfirm={() => void doRestore(confirmRestore.id)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </div>
  )
}
