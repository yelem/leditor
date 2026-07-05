import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor as TipTapEditor } from '@tiptap/react'
import {
  type DocumentContent,
  type ProjectStats,
  DEFAULT_PROJECT_SETTINGS,
  createEmptyDocument
} from '@shared/project-types'
import { useProject, useSettings, useUi } from '@renderer/store'
import { findNodeTitle } from '@renderer/lib/tree'
import { registerFlusher } from '@renderer/lib/flush-registry'
import { useT } from '@renderer/lib/i18n'
import { editorExtensions } from './extensions'
import { setTypographyConfig } from './typography'
import { FormatToolbar } from './FormatToolbar'
import { AppearancePopover } from './AppearancePopover'
import { FindBar } from './FindBar'
import { SuggestionsReview } from './SuggestionsReview'
import {
  type SuggestionItem,
  acceptSuggestion,
  applyReplaceSuggestion,
  buildCharMap,
  collectSuggestions,
  newSid,
  normalizeChar,
  normalizeFragment,
  rejectSuggestion,
  scrollToSuggestion
} from './suggestions'
import './editor.css'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function Editor(): JSX.Element {
  const t = useT()
  const { projectPath, manifest, activeDocId, updateSettings, bumpDocVersion } = useProject()
  const { focusMode, toggleFocus } = useUi()
  const { settings: globalSettings } = useSettings()
  const autosaveDelay = globalSettings.autosaveDelayMs

  // Apply smart-typography settings to the editor input rules.
  useEffect(() => {
    setTypographyConfig(globalSettings.typography)
  }, [globalSettings.typography])

  const settings = manifest?.settings ?? DEFAULT_PROJECT_SETTINGS
  const docTitle = useMemo(
    () => (manifest && activeDocId ? findNodeTitle(manifest.tree, activeDocId) : null),
    [manifest, activeDocId]
  )

  const [status, setStatus] = useState<SaveStatus>('idle')
  const [docCount, setDocCount] = useState<ProjectStats>({ words: 0, chars: 0 })
  const [projectCount, setProjectCount] = useState<ProjectStats>({ words: 0, chars: 0 })
  const [appearanceOpen, setAppearanceOpen] = useState(false)

  // AI-suggested edits with review.
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const reasonsRef = useRef<Map<string, string>>(new Map())

  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<{ docId: string; json: DocumentContent } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathRef = useRef(projectPath)
  const docIdRef = useRef(activeDocId)
  pathRef.current = projectPath
  docIdRef.current = activeDocId

  const refreshProjectStats = useCallback(() => {
    const path = pathRef.current
    if (!path) return
    window.api.project.stats(path).then(setProjectCount).catch(() => undefined)
  }, [])

  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending || !pathRef.current) return
    try {
      await window.api.document.save(pathRef.current, pending.docId, pending.json)
      setStatus('saved')
      refreshProjectStats()
      bumpDocVersion()
    } catch {
      // The write failed (disk/permissions/antivirus): put the edits back in
      // the queue unless newer ones arrived meanwhile, and retry later.
      if (!pendingRef.current) pendingRef.current = pending
      setStatus('error')
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          void flushSave()
        }, 5000)
      }
    }
  }, [refreshProjectStats, bumpDocVersion])

  const updateDocCount = useCallback((editor: TipTapEditor) => {
    const cc = editor.storage.characterCount as {
      words: () => number
      characters: () => number
    }
    setDocCount({ words: cc.words(), chars: cc.characters() })
  }, [])

  // The update handler lives in a ref so onUpdate always sees fresh logic.
  const onUpdateRef = useRef<(editor: TipTapEditor) => void>(() => undefined)

  const editor = useEditor({
    extensions: editorExtensions,
    content: '',
    autofocus: false,
    editorProps: { attributes: { class: 'editor__prose', spellcheck: 'true' } },
    onUpdate: ({ editor }) => onUpdateRef.current(editor)
  })

  onUpdateRef.current = (ed: TipTapEditor) => {
    updateDocCount(ed)
    const docId = docIdRef.current
    if (!pathRef.current || !docId) return
    pendingRef.current = { docId, json: ed.getJSON() as DocumentContent }
    setStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flushSave()
    }, autosaveDelay)
  }

  // Load contents on document switch; save the previous one on leave.
  useEffect(() => {
    if (!editor) return
    if (!projectPath || !activeDocId) {
      editor.commands.clearContent()
      setDocCount({ words: 0, chars: 0 })
      return
    }
    let cancelled = false
    setStatus('idle')
    window.api.document
      .load(projectPath, activeDocId)
      .then((doc) => {
        if (cancelled) return
        editor.commands.setContent(doc ?? createEmptyDocument(), false)
        updateDocCount(editor)
        // Restore unfinished suggestions from the document.
        setSuggestions(collectSuggestions(editor, reasonsRef.current))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void flushSave()
    }
  }, [editor, projectPath, activeDocId, flushSave, updateDocCount])

  // Whole-project stats when a project opens.
  useEffect(() => {
    if (projectPath) refreshProjectStats()
    else setProjectCount({ words: 0, chars: 0 })
  }, [projectPath, refreshProjectStats])

  // Typewriter mode: keep the caret line centered.
  useEffect(() => {
    if (!editor || !settings.typewriterMode) return
    const center = (): void => {
      const scroll = scrollRef.current
      if (!scroll) return
      const pos = editor.state.selection.head
      const coords = editor.view.coordsAtPos(pos)
      const rect = scroll.getBoundingClientRect()
      const target = coords.top - rect.top - rect.height / 2 + scroll.scrollTop
      scroll.scrollTo({ top: target })
    }
    editor.on('selectionUpdate', center)
    editor.on('update', center)
    return () => {
      editor.off('selectionUpdate', center)
      editor.off('update', center)
    }
  }, [editor, settings.typewriterMode])

  // Flush unsaved changes on unmount.
  useEffect(() => {
    return () => {
      void flushSave()
    }
  }, [flushSave])

  // Register in the shared registry: flushed before window close and backup restore.
  useEffect(() => registerFlusher(flushSave), [flushSave])

  const refreshSuggestions = useCallback(() => {
    if (editor) setSuggestions(collectSuggestions(editor, reasonsRef.current))
  }, [editor])

  // Scroll so the current selection lands roughly at the center.
  // Near the document end the browser clamps scrolling — standard behavior.
  const centerSelection = useCallback(() => {
    const scroll = scrollRef.current
    if (!editor || !scroll) return
    requestAnimationFrame(() => {
      try {
        const coords = editor.view.coordsAtPos(editor.state.selection.from)
        const rect = scroll.getBoundingClientRect()
        const target = coords.top - rect.top - rect.height / 2 + scroll.scrollTop
        scroll.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      } catch {
        /* the position may have disappeared — ignore */
      }
    })
  }, [editor])

  const applyGrammarEdits = useCallback(
    (from: number, to: number, edits: Array<{ original: string; suggestion: string; reason: string }>) => {
      if (!editor) return
      const map = buildCharMap(editor, from, to)
      // Normalized haystack 1:1 with map — tolerates quote/dash/space differences.
      const hay = map.map((m) => normalizeChar(m.ch)).join('')
      const used: Array<[number, number]> = []
      const located: Array<{ from: number; to: number; original: string; suggestion: string; reason: string }> = []

      for (const e of edits) {
        if (!e.original) continue
        const needle = normalizeFragment(e.original)
        if (!needle) continue
        // First occurrence not overlapping already-claimed edits (order irrelevant).
        let at = 0
        let idx = -1
        for (;;) {
          const cand = hay.indexOf(needle, at)
          if (cand === -1) break
          const end = cand + needle.length
          if (!used.some(([s, en]) => cand < en && end > s)) {
            idx = cand
            break
          }
          at = cand + 1
        }
        if (idx === -1) continue
        const end = idx + needle.length
        used.push([idx, end])
        // The deletion part gets the actual document text, not the model's
        // version — so rejecting the edit restores the original characters.
        const realOriginal = map.slice(idx, end).map((m) => m.ch).join('')
        located.push({
          from: map[idx].pos,
          to: map[end - 1].pos + 1,
          original: realOriginal,
          suggestion: e.suggestion,
          reason: e.reason
        })
      }

      // Apply right-to-left so positions do not shift.
      located.sort((a, b) => b.from - a.from)
      for (const l of located) {
        const sid = newSid()
        reasonsRef.current.set(sid, l.reason || t('editor.editReason'))
        applyReplaceSuggestion(editor, l.from, l.to, l.original, l.suggestion, sid)
      }
      refreshSuggestions()
      if (located.length > 0) {
        const first = collectSuggestions(editor, reasonsRef.current)[0]
        if (first) {
          scrollToSuggestion(editor, first.sid)
          centerSelection()
        }
      } else if (edits.length === 0) {
        setAiError(t('editor.noEdits'))
      } else {
        setAiError(t('editor.matchFailed'))
      }
    },
    [editor, refreshSuggestions, centerSelection, t]
  )

  // The editor's current AI request — for user cancellation.
  const aiRequestRef = useRef<string | null>(null)

  const runAction = useCallback(
    async (kind: 'rewrite' | 'grammar') => {
      if (!editor) return
      const { from, to, empty } = editor.state.selection
      if (empty) {
        setAiError(t('editor.selectFragment'))
        return
      }
      const text = editor.state.doc.textBetween(from, to, '\n')
      if (!text.trim()) return
      const requestId = crypto.randomUUID()
      aiRequestRef.current = requestId
      setAiBusy(true)
      setAiError(null)
      try {
        if (kind === 'grammar') {
          const edits = await window.api.ai.grammar(requestId, text)
          applyGrammarEdits(from, to, edits)
        } else {
          const newText = (
            await window.api.ai.improve(
              requestId,
              text,
              'Rewrite the fragment in different words, preserving its meaning and language.'
            )
          ).trim()
          const sid = newSid()
          reasonsRef.current.set(sid, t('editor.rewriteReason'))
          applyReplaceSuggestion(editor, from, to, text, newText, sid)
          refreshSuggestions()
        }
      } catch (err) {
        // A cancelled request is not shown as an error.
        if (aiRequestRef.current === requestId) {
          setAiError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (aiRequestRef.current === requestId) aiRequestRef.current = null
        setAiBusy(false)
      }
    },
    [editor, applyGrammarEdits, refreshSuggestions, t]
  )

  const cancelAction = useCallback(() => {
    const id = aiRequestRef.current
    if (id) {
      aiRequestRef.current = null
      void window.api.ai.abort(id)
    }
  }, [])

  // AI actions from the context menu (right click).
  useEffect(() => {
    return window.api.editor.onAiAction((kind) => {
      void runAction(kind)
    })
  }, [runAction])

  // Ctrl+F — find/replace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // e.code (physical key), not e.key — independent of keyboard layout.
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
        if (!projectPath || !activeDocId) return
        e.preventDefault()
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [projectPath, activeDocId])

  const onAccept = useCallback(
    (sid: string) => {
      if (!editor) return
      acceptSuggestion(editor, sid)
      reasonsRef.current.delete(sid)
      refreshSuggestions()
    },
    [editor, refreshSuggestions]
  )
  const onReject = useCallback(
    (sid: string) => {
      if (!editor) return
      rejectSuggestion(editor, sid)
      reasonsRef.current.delete(sid)
      refreshSuggestions()
    },
    [editor, refreshSuggestions]
  )
  const onAcceptAll = useCallback(() => {
    if (!editor) return
    suggestions.forEach((s) => acceptSuggestion(editor, s.sid))
    reasonsRef.current.clear()
    refreshSuggestions()
  }, [editor, suggestions, refreshSuggestions])
  const onRejectAll = useCallback(() => {
    if (!editor) return
    suggestions.forEach((s) => rejectSuggestion(editor, s.sid))
    reasonsRef.current.clear()
    refreshSuggestions()
  }, [editor, suggestions, refreshSuggestions])

  if (!projectPath) {
    return (
      <div className="editor editor--empty">
        <p>{t('editor.emptyProject')}</p>
      </div>
    )
  }

  const statusLabel =
    status === 'saving'
      ? t('editor.statusSaving')
      : status === 'saved'
        ? t('editor.statusSaved')
        : status === 'error'
          ? t('editor.statusError')
          : t('editor.statusDraft')

  const pageStyle = {
    maxWidth: settings.editorWidth,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight
  }

  return (
    <div className="editor">
      <div className="editor__toolbar-wrap">
        <FormatToolbar
          editor={editor}
          appearanceOpen={appearanceOpen}
          onToggleAppearance={() => setAppearanceOpen((v) => !v)}
        />
        {appearanceOpen && (
          <AppearancePopover
            settings={settings}
            onChange={updateSettings}
            onClose={() => setAppearanceOpen(false)}
          />
        )}
      </div>

      {findOpen && (
        <FindBar
          editor={editor}
          onNavigate={centerSelection}
          onClose={() => {
            setFindOpen(false)
            editor?.commands.clearSearch()
          }}
        />
      )}

      {suggestions.length > 0 && (
        <SuggestionsReview
          items={suggestions}
          onAccept={onAccept}
          onReject={onReject}
          onAcceptAll={onAcceptAll}
          onRejectAll={onRejectAll}
          onGoto={(sid) => {
            if (editor) {
              scrollToSuggestion(editor, sid)
              centerSelection()
            }
          }}
        />
      )}

      {aiError && (
        <div className="editor__ai-error" role="alert">
          <span>{aiError}</span>
          <button type="button" onClick={() => setAiError(null)} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
      )}

      <div
        className={`editor__scroll${settings.typewriterMode ? ' is-typewriter' : ''}`}
        ref={scrollRef}
      >
        {activeDocId ? (
          <div className="editor__page" style={pageStyle}>
            <h1 className="editor__doc-title">{docTitle ?? t('editor.document')}</h1>
            <EditorContent editor={editor} />
          </div>
        ) : (
          <div className="editor__hint">{t('editor.pickDocument')}</div>
        )}
      </div>

      <footer className="editor__status">
        <span>{t('editor.words', { n: docCount.words })}</span>
        <span>{t('editor.chars', { n: docCount.chars })}</span>
        <span className="editor__status-project">{t('editor.projectWords', { n: projectCount.words })}</span>
        <button
          type="button"
          className="editor__focus-btn"
          onClick={toggleFocus}
          title={t('editor.focusTitle')}
        >
          {focusMode ? t('editor.exitFocus') : t('editor.focus')}
        </button>
        <span className="editor__status-hint">{statusLabel}</span>
      </footer>

      {aiBusy && (
        <div className="editor__ai-busy">
          {t('editor.processing')}{' '}
          <button type="button" className="editor__ai-cancel" onClick={cancelAction}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
