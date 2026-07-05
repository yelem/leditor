import { useEffect, useRef } from 'react'
import { useT } from '@renderer/lib/i18n'
import './modal.css'

interface ConfirmDialogProps {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Модальное окно подтверждения в стиле приложения (замена window.confirm). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  const t = useT()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div className="modal__backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal__title">{title ?? t('common.confirmTitle')}</h2>
        <p className="modal__message">{message}</p>
        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`modal__btn modal__btn--primary${danger ? ' modal__btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
