import type { SuggestionItem } from './suggestions'
import { useT } from '@renderer/lib/i18n'

interface SuggestionsReviewProps {
  items: SuggestionItem[]
  onAccept: (sid: string) => void
  onReject: (sid: string) => void
  onAcceptAll: () => void
  onRejectAll: () => void
  onGoto: (sid: string) => void
}

/** Review panel for suggested edits (accept/reject one by one or all at once). */
export function SuggestionsReview({
  items,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onGoto
}: SuggestionsReviewProps): JSX.Element {
  const t = useT()
  return (
    <div className="sg-review">
      <div className="sg-review__head">
        <span className="sg-review__count">{t('sg.count', { n: items.length })}</span>
        <div className="sg-review__bulk">
          <button type="button" className="sg-review__accept-all" onClick={onAcceptAll}>
            {t('sg.acceptAll')}
          </button>
          <button type="button" className="sg-review__reject-all" onClick={onRejectAll}>
            {t('sg.rejectAll')}
          </button>
        </div>
      </div>

      <ul className="sg-review__list">
        {items.map((it) => (
          <li key={it.sid} className="sg-review__item">
            <div
              className="sg-review__texts"
              onClick={() => onGoto(it.sid)}
              title={t('sg.goto')}
            >
              {it.original && <span className="sg-review__old">{it.original}</span>}
              {it.original && it.suggestion && <span className="sg-review__arrow">→</span>}
              {it.suggestion && <span className="sg-review__new">{it.suggestion}</span>}
              {it.reason && <span className="sg-review__reason">{it.reason}</span>}
            </div>
            <div className="sg-review__buttons">
              <button
                type="button"
                className="sg-review__accept"
                title={t('sg.accept')}
                onClick={() => onAccept(it.sid)}
              >
                ✓
              </button>
              <button
                type="button"
                className="sg-review__reject"
                title={t('sg.reject')}
                onClick={() => onReject(it.sid)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
