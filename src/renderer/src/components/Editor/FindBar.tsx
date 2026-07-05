import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { searchKey } from './search-extension'
import { useT } from '@renderer/lib/i18n'

interface FindBarProps {
  editor: Editor | null
  onClose: () => void
  /** Вызывается после перехода к совпадению — для центрирования его в окне. */
  onNavigate?: () => void
}

/** Панель поиска и замены (Ctrl+F). */
export function FindBar({ editor, onClose, onNavigate }: FindBarProps): JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const st = editor ? searchKey.getState(editor.state) : undefined
  const total = st?.matches.length ?? 0
  const current = total > 0 ? (st?.current ?? 0) + 1 : 0

  const next = (): void => {
    editor?.chain().searchNext().run()
    onNavigate?.()
  }
  const prev = (): void => {
    editor?.chain().searchPrev().run()
    onNavigate?.()
  }

  const applySearch = (q: string, cs: boolean): void => {
    editor?.chain().setSearch(q, cs).run()
    if (q) onNavigate?.()
  }

  return (
    <div className="find">
      <div className="find__row">
        <input
          ref={inputRef}
          className="find__input"
          placeholder={t('find.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            applySearch(e.target.value, caseSensitive)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) prev()
              else next()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span className="find__count">
          {query ? (total > 0 ? `${current}/${total}` : t('find.none')) : ''}
        </span>
        <button
          type="button"
          className="find__nav"
          title={t('find.prev')}
          disabled={total === 0}
          onClick={prev}
        >
          ▲
        </button>
        <button
          type="button"
          className="find__nav"
          title={t('find.next')}
          disabled={total === 0}
          onClick={next}
        >
          ▼
        </button>
        <label className="find__cs" title={t('find.caseSensitive')}>
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => {
              setCaseSensitive(e.target.checked)
              applySearch(query, e.target.checked)
            }}
          />
          Аа
        </label>
        <button type="button" className="find__close" title={t('find.close')} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="find__row">
        <input
          className="find__input"
          placeholder={t('find.replacePlaceholder')}
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <button
          type="button"
          className="find__btn"
          disabled={total === 0}
          onClick={() => editor?.chain().replaceCurrent(replace).run()}
        >
          {t('find.replace')}
        </button>
        <button
          type="button"
          className="find__btn"
          disabled={total === 0}
          onClick={() => editor?.chain().replaceAll(replace).run()}
        >
          {t('find.replaceAll')}
        </button>
      </div>
    </div>
  )
}
