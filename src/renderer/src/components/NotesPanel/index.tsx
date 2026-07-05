import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor as TipTapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useProject } from '@renderer/store'
import { findNodeTitle } from '@renderer/lib/tree'
import { registerFlusher } from '@renderer/lib/flush-registry'
import { useT, tGlobal } from '@renderer/lib/i18n'
import { Icon, type IconName } from '../Editor/Icons'
import './notes.css'

const notesExtensions = [
  StarterKit.configure({ heading: { levels: [2, 3] }, horizontalRule: false }),
  Underline,
  Placeholder.configure({ placeholder: () => tGlobal('notes.placeholder') })
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Notes are stored as HTML. A string without an opening tag is treated as
 * plain text (the older format) — each of its lines is wrapped in a paragraph.
 */
function noteToHtml(raw: string): string {
  if (!raw) return ''
  if (raw.trimStart().startsWith('<')) return raw
  return raw
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p></p>'))
    .join('')
}

/** Notes for the current chapter. Autosaved to notes/<id>.json. */
export function NotesPanel(): JSX.Element {
  const t = useT()
  const { projectPath, manifest, activeDocId } = useProject()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctxRef = useRef<{ path: string; id: string } | null>(null)
  const pendingRef = useRef<{ path: string; id: string; html: string } | null>(null)
  const onUpdateRef = useRef<(editor: TipTapEditor) => void>(() => undefined)

  const title = useMemo(
    () => (manifest && activeDocId ? findNodeTitle(manifest.tree, activeDocId) : null),
    [manifest, activeDocId]
  )

  // Write the accumulated (pending) note immediately.
  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const p = pendingRef.current
    pendingRef.current = null
    if (!p) return
    try {
      await window.api.workspace.saveNote(p.path, p.id, p.html)
      setStatus('saved')
    } catch {
      // Put it back in the queue unless something newer arrived during the write.
      if (!pendingRef.current) pendingRef.current = p
      setStatus('idle')
    }
  }, [])

  const editor = useEditor({
    extensions: notesExtensions,
    content: '',
    editorProps: { attributes: { class: 'notes__prose', spellcheck: 'true' } },
    onUpdate: ({ editor }) => onUpdateRef.current(editor)
  })

  // Capture the chapter and HTML at edit time: switching chapters before the
  // timer fires will not write the text into another chapter's note.
  onUpdateRef.current = (ed: TipTapEditor) => {
    const ctx = ctxRef.current
    if (!ctx) return
    pendingRef.current = { path: ctx.path, id: ctx.id, html: ed.getHTML() }
    setStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(), 500)
  }

  // Chapter switch: save what is pending, then load the new chapter's note.
  useEffect(() => {
    if (!editor) return
    void flush()
    if (!projectPath || !activeDocId) {
      ctxRef.current = null
      editor.commands.setContent('', false)
      return
    }
    ctxRef.current = { path: projectPath, id: activeDocId }
    let cancelled = false
    setStatus('idle')
    window.api.workspace.loadNote(projectPath, activeDocId).then((raw) => {
      if (!cancelled) editor.commands.setContent(noteToHtml(raw), false)
    })
    return () => {
      cancelled = true
    }
  }, [editor, projectPath, activeDocId, flush])

  // Save pending changes on unmount.
  useEffect(
    () => () => {
      void flush()
    },
    [flush]
  )

  // Register in the shared registry: flushed before window close and backup restore.
  useEffect(() => registerFlusher(flush), [flush])

  if (!projectPath || !activeDocId) {
    return (
      <div className="notes notes--empty">{t('notes.pickChapter')}</div>
    )
  }

  const tb = (name: IconName, label: string, cmd: () => void, active?: boolean): JSX.Element => (
    <button
      type="button"
      className={`notes__tb-btn${active ? ' is-active' : ''}`}
      title={label}
      disabled={!editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={cmd}
    >
      <Icon name={name} />
    </button>
  )

  const chain = (): ReturnType<TipTapEditor['chain']> | null =>
    editor ? editor.chain().focus() : null

  return (
    <div className="notes">
      <div className="notes__head">
        <span className="notes__title">{t('notes.title', { title: title ?? t('notes.chapter') })}</span>
        <span className="notes__status">
          {status === 'saving' ? t('editor.statusSaving') : status === 'saved' ? t('editor.statusSaved') : ''}
        </span>
      </div>

      <div className="notes__toolbar">
        {tb('bold', t('fmt.bold'), () => chain()?.toggleBold().run(), editor?.isActive('bold'))}
        {tb('italic', t('fmt.italic'), () => chain()?.toggleItalic().run(), editor?.isActive('italic'))}
        {tb('underline', t('fmt.underline'), () => chain()?.toggleUnderline().run(), editor?.isActive('underline'))}
        {tb('strike', t('fmt.strike'), () => chain()?.toggleStrike().run(), editor?.isActive('strike'))}
        <span className="notes__tb-sep" />
        {tb('listBullet', t('fmt.bulletList'), () => chain()?.toggleBulletList().run(), editor?.isActive('bulletList'))}
        {tb('listOrdered', t('fmt.orderedList'), () => chain()?.toggleOrderedList().run(), editor?.isActive('orderedList'))}
        {tb('quote', t('fmt.quote'), () => chain()?.toggleBlockquote().run(), editor?.isActive('blockquote'))}
      </div>

      <div className="notes__editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
