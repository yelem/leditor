import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { Icon, type IconName } from './Icons'
import { useT } from '@renderer/lib/i18n'

interface FormatToolbarProps {
  editor: Editor | null
  onToggleAppearance: () => void
  appearanceOpen: boolean
}

export function FormatToolbar({
  editor,
  onToggleAppearance,
  appearanceOpen
}: FormatToolbarProps): JSX.Element {
  const t = useT()
  const disabled = !editor
  const [styleOpen, setStyleOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const styleRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [linkPos, setLinkPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const linkBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!styleOpen) return
    const onDown = (e: MouseEvent): void => {
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setStyleOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [styleOpen])

  const toggleStyleMenu = (): void => {
    if (styleOpen) {
      setStyleOpen(false)
      return
    }
    const rect = toggleRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ left: rect.left, top: rect.bottom + 4 })
    setStyleOpen(true)
  }

  const chain = (): ReturnType<Editor['chain']> | null => (editor ? editor.chain().focus() : null)

  const btn = (
    content: ReactNode,
    title: string,
    onClick: () => void,
    active = false
  ): JSX.Element => (
    <button
      type="button"
      className={`fmt__btn${active ? ' is-active' : ''}`}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {content}
    </button>
  )

  const iconBtn = (
    name: IconName,
    title: string,
    onClick: () => void,
    active = false
  ): JSX.Element => btn(<Icon name={name} />, title, onClick, active)

  const openLink = (): void => {
    if (!editor) return
    const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
    setLinkValue(prev || 'https://')
    const rect = linkBtnRef.current?.getBoundingClientRect()
    if (rect) setLinkPos({ left: rect.left, top: rect.bottom + 4 })
    setLinkOpen(true)
  }

  const applyLink = (): void => {
    if (!editor) {
      setLinkOpen(false)
      return
    }
    const url = linkValue.trim()
    if (url === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    setLinkOpen(false)
  }

  const styleLabel = (): string => {
    if (editor?.isActive('heading', { level: 1 })) return t('fmt.heading1')
    if (editor?.isActive('heading', { level: 2 })) return t('fmt.heading2')
    if (editor?.isActive('heading', { level: 3 })) return t('fmt.heading3')
    return t('fmt.paragraph')
  }

  const styleItem = (label: string, onClick: () => void, active: boolean): JSX.Element => (
    <button
      type="button"
      className={`fmt__menu-item${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onClick()
        setStyleOpen(false)
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="fmt">
      {iconBtn('undo', t('fmt.undo'), () => chain()?.undo().run())}
      {iconBtn('redo', t('fmt.redo'), () => chain()?.redo().run())}

      <span className="fmt__sep" />

      {/* Paragraph style picker */}
      <div className="fmt__dropdown" ref={styleRef}>
        <button
          ref={toggleRef}
          type="button"
          className={`fmt__btn fmt__btn--wide${styleOpen ? ' is-active' : ''}`}
          title={t('fmt.paragraphStyle')}
          disabled={disabled}
          onClick={toggleStyleMenu}
        >
          {styleLabel()} ▾
        </button>
        {styleOpen && editor && (
          <div className="fmt__menu" style={{ left: menuPos.left, top: menuPos.top }}>
            {styleItem(
              t('fmt.paragraph'),
              () => editor.chain().focus().setParagraph().run(),
              editor.isActive('paragraph')
            )}
            {styleItem(
              t('fmt.heading1'),
              () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
              editor.isActive('heading', { level: 1 })
            )}
            {styleItem(
              t('fmt.heading2'),
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              editor.isActive('heading', { level: 2 })
            )}
            {styleItem(
              t('fmt.heading3'),
              () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              editor.isActive('heading', { level: 3 })
            )}
          </div>
        )}
      </div>

      <span className="fmt__sep" />

      {iconBtn('listBullet', t('fmt.bulletList'), () => chain()?.toggleBulletList().run(), editor?.isActive('bulletList'))}
      {iconBtn('listOrdered', t('fmt.orderedList'), () => chain()?.toggleOrderedList().run(), editor?.isActive('orderedList'))}
      {iconBtn('listTask', t('fmt.taskList'), () => chain()?.toggleTaskList().run(), editor?.isActive('taskList'))}
      {iconBtn('quote', t('fmt.quote'), () => chain()?.toggleBlockquote().run(), editor?.isActive('blockquote'))}
      {iconBtn('codeBlock', t('fmt.codeBlock'), () => chain()?.toggleCodeBlock().run(), editor?.isActive('codeBlock'))}

      <span className="fmt__sep" />

      {iconBtn('bold', t('fmt.bold'), () => chain()?.toggleBold().run(), editor?.isActive('bold'))}
      {iconBtn('italic', t('fmt.italic'), () => chain()?.toggleItalic().run(), editor?.isActive('italic'))}
      {iconBtn('underline', t('fmt.underline'), () => chain()?.toggleUnderline().run(), editor?.isActive('underline'))}
      {iconBtn('strike', t('fmt.strike'), () => chain()?.toggleStrike().run(), editor?.isActive('strike'))}
      {iconBtn('code', t('fmt.code'), () => chain()?.toggleCode().run(), editor?.isActive('code'))}
      {iconBtn('highlight', t('fmt.highlight'), () => chain()?.toggleHighlight().run(), editor?.isActive('highlight'))}
      <button
        ref={linkBtnRef}
        type="button"
        className={`fmt__btn${editor?.isActive('link') ? ' is-active' : ''}`}
        title={t('fmt.link')}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openLink}
      >
        <Icon name="link" />
      </button>

      <span className="fmt__sep" />

      {btn(<span>x²</span>, t('fmt.superscript'), () => chain()?.toggleSuperscript().run(), editor?.isActive('superscript'))}
      {btn(<span>x₂</span>, t('fmt.subscript'), () => chain()?.toggleSubscript().run(), editor?.isActive('subscript'))}

      <span className="fmt__sep" />

      {iconBtn('alignLeft', t('fmt.alignLeft'), () => chain()?.setTextAlign('left').run(), editor?.isActive({ textAlign: 'left' }))}
      {iconBtn('alignCenter', t('fmt.alignCenter'), () => chain()?.setTextAlign('center').run(), editor?.isActive({ textAlign: 'center' }))}
      {iconBtn('alignRight', t('fmt.alignRight'), () => chain()?.setTextAlign('right').run(), editor?.isActive({ textAlign: 'right' }))}
      {iconBtn('alignJustify', t('fmt.alignJustify'), () => chain()?.setTextAlign('justify').run(), editor?.isActive({ textAlign: 'justify' }))}

      <span className="fmt__spacer" />

      <button
        type="button"
        className={`fmt__btn fmt__btn--wide${appearanceOpen ? ' is-active' : ''}`}
        title={t('fmt.viewTitle')}
        disabled={disabled}
        onClick={onToggleAppearance}
      >
        {t('fmt.view')} ▾
      </button>

      {linkOpen && (
        <>
          <div className="fmt__link-backdrop" onMouseDown={() => setLinkOpen(false)} />
          <div className="fmt__link" style={{ left: linkPos.left, top: linkPos.top }}>
            <input
              autoFocus
              className="fmt__link-input"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLink()
                else if (e.key === 'Escape') setLinkOpen(false)
              }}
              placeholder="https://…"
            />
            <button type="button" className="fmt__link-apply" onClick={applyLink}>
              {t('common.ok')}
            </button>
            {editor?.isActive('link') && (
              <button
                type="button"
                className="fmt__link-remove"
                onClick={() => {
                  editor.chain().focus().unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                {t('fmt.linkRemove')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
