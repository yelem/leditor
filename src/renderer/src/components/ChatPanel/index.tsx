import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AiChatMessage } from '@shared/ai-types'
import { documentToText } from '@shared/document-text'
import { useProject, useSettings } from '@renderer/store'
import { collectDocuments, findNodeTitle } from '@renderer/lib/tree'
import { useT } from '@renderer/lib/i18n'
import './chat-panel.css'

// Guard against oversized sends (a typical chapter fits entirely).
const MAX_DOC_CONTEXT = 200000
// Cap on the history that is sent: a long chat must not hit the model's
// context limit. Everything is stored; the model gets the tail within budget.
const MAX_HISTORY_MESSAGES = 30
const MAX_HISTORY_CHARS = 120000

/** History tail within the message and character budgets. */
function trimHistory(history: AiChatMessage[]): AiChatMessage[] {
  const tail: AiChatMessage[] = []
  let chars = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    chars += msg.content.length
    if (tail.length >= MAX_HISTORY_MESSAGES || (tail.length > 0 && chars > MAX_HISTORY_CHARS)) {
      break
    }
    tail.unshift(msg)
  }
  return tail
}
// Base assistant role. Generic on purpose: the concrete task is set by the
// user's message; the model answers to the point, in the user's language.
const SYSTEM_PREFIX =
  'You are a writer’s assistant built into a book editor. You help with everything related to the text: plot, characters, world, style, wording, facts, ideas, edits and translations — the specific task is set by the user in their message. Answer to the point and without fluff: only useful content, no needless introductions, repetition or self-description. Reply in the language the user addresses you in. If book context is attached below, rely on it.'

/**
 * One message bubble. Memoized: while a new reply is streaming, completed
 * messages do not re-render — otherwise ReactMarkdown would re-parse the
 * whole history's markup on every streamed frame.
 */
const MessageBubble = memo(function MessageBubble({
  role,
  content,
  streaming,
  placeholder
}: {
  role: AiChatMessage['role']
  content: string
  streaming: boolean
  /** Shown instead of an empty reply while it is still being generated. */
  placeholder: string
}): JSX.Element {
  return (
    <div className={`chat__msg chat__msg--${role}`}>
      <div className="chat__bubble">
        {role === 'assistant' ? (
          streaming ? (
            // While streaming — plain text (no Markdown parsing every frame).
            content || <span className="chat__pending">{placeholder}</span>
          ) : content ? (
            <div className="chat__md">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : (
            ''
          )
        ) : (
          content
        )}
      </div>
    </div>
  )
})

function setLastAssistant(messages: AiChatMessage[], updater: (prev: string) => string): AiChatMessage[] {
  if (messages.length === 0) return messages
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant') return messages
  return [...messages.slice(0, -1), { ...last, content: updater(last.content) }]
}

export function ChatPanel(): JSX.Element {
  const t = useT()
  const { projectPath, manifest, activeDocId, docVersion } = useProject()
  const { settings } = useSettings()

  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [includeDoc, setIncludeDoc] = useState(true)
  const [includeSummaries, setIncludeSummaries] = useState(false)
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [genBusy, setGenBusy] = useState(false)
  const [ctxChars, setCtxChars] = useState(0)
  // When a reasoning model started deliberating (null — it is not, or the
  // answer has already begun). Only a sign of life: the reasoning text itself
  // is never streamed or stored.
  const [thinkingSince, setThinkingSince] = useState<number | null>(null)
  const [thinkingSec, setThinkingSec] = useState(0)

  const reqRef = useRef<string | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const pathRef = useRef(projectPath)
  pathRef.current = projectPath
  const listRef = useRef<HTMLDivElement>(null)
  // Streaming buffer: accumulated deltas are applied to state once per frame
  // (requestAnimationFrame), not per token — with a fast stream this keeps
  // re-rendering of the growing reply within the frame budget.
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  const activeProfile = settings.ai.profiles.find((p) => p.id === settings.ai.activeProfileId)

  const docTitle = useMemo(
    () => (manifest && activeDocId ? findNodeTitle(manifest.tree, activeDocId) : null),
    [manifest, activeDocId]
  )

  // Load history and the summaries cache when a project opens.
  useEffect(() => {
    if (!projectPath) {
      setMessages([])
      setSummaries({})
      return
    }
    let cancelled = false
    window.api.workspace.loadChat(projectPath).then((m) => {
      if (!cancelled) setMessages(m)
    })
    window.api.workspace.loadSummaries(projectPath).then((s) => {
      if (!cancelled) setSummaries(s)
    })
    return () => {
      cancelled = true
    }
  }, [projectPath])

  const saveChat = useCallback((msgs: AiChatMessage[]) => {
    if (pathRef.current) void window.api.workspace.saveChat(pathRef.current, msgs).catch(() => undefined)
  }, [])

  // Merge accumulated deltas into state (called from rAF).
  const flushBuffer = useCallback(() => {
    rafRef.current = null
    const chunk = bufferRef.current
    if (!chunk) return
    bufferRef.current = ''
    setMessages((m) => setLastAssistant(m, (prev) => prev + chunk))
  }, [])

  // End the current request: flush (or discard) the stream buffer, release the
  // UI and save the history. `errorText` replaces the reply when the request
  // failed. Every exit path goes through here — a request that ends without it
  // would leave the panel stuck in the streaming state.
  const finishRequest = useCallback(
    (errorText: string | null) => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const chunk = bufferRef.current
      bufferRef.current = ''
      if (errorText != null) setMessages((m) => setLastAssistant(m, () => errorText))
      else if (chunk) setMessages((m) => setLastAssistant(m, (prev) => prev + chunk))
      setStreaming(false)
      setThinkingSince(null)
      reqRef.current = null
      // messagesRef updates by the next tick — save then.
      setTimeout(() => saveChat(messagesRef.current), 0)
    },
    [saveChat]
  )

  // Build the context for the model.
  const buildContext = useCallback(async (): Promise<string> => {
    if (!projectPath || !manifest) return ''
    const parts: string[] = []

    if (includeDoc && activeDocId) {
      const doc = await window.api.document.load(projectPath, activeDocId)
      if (doc) {
        let text = documentToText(doc)
        if (text.length > MAX_DOC_CONTEXT) text = text.slice(0, MAX_DOC_CONTEXT) + '…'
        if (text) parts.push(`[Current chapter: ${docTitle ?? 'untitled'}]\n${text}`)
      }
    }

    if (includeSummaries) {
      const others = collectDocuments(manifest.tree)
        .filter((d) => d.id !== activeDocId && summaries[d.id])
        .map((d) => `- ${d.title}: ${summaries[d.id]}`)
      if (others.length > 0) parts.push(`[Short summaries of other chapters]\n${others.join('\n')}`)
    }

    // The base role is always sent; book context only when selected.
    const context = parts.length > 0 ? `\n\n${parts.join('\n\n')}` : ''
    return `${SYSTEM_PREFIX}${context}`
    // docVersion — recompute after a chapter autosave.
  }, [projectPath, manifest, activeDocId, docTitle, includeDoc, includeSummaries, summaries, docVersion])

  // Estimate the context size (for the what-the-model-sees indicator).
  useEffect(() => {
    let cancelled = false
    buildContext().then((s) => {
      if (!cancelled) setCtxChars(s.length)
    })
    return () => {
      cancelled = true
    }
  }, [buildContext])

  // Subscribe to reply streaming.
  useEffect(() => {
    return window.api.ai.onStream((e) => {
      if (e.requestId !== reqRef.current) return
      if (e.type === 'delta') {
        // Accumulate deltas; refresh the screen once per frame.
        bufferRef.current += e.text
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushBuffer)
        // The answer has started — the deliberation is over.
        setThinkingSince((since) => (since == null ? since : null))
      } else if (e.type === 'thinking') {
        // Arrives per reasoning token; the timestamp is set once, so the
        // counter measures the whole deliberation and state is not churned.
        setThinkingSince((since) => since ?? Date.now())
      } else if (e.type === 'done') {
        finishRequest(null)
      } else if (e.type === 'error') {
        finishRequest(t('chat.error', { msg: e.error }))
      }
    })
  }, [finishRequest, flushBuffer, t])

  // Tick the deliberation counter once a second while it runs.
  useEffect(() => {
    if (thinkingSince == null) {
      setThinkingSec(0)
      return
    }
    const tick = (): void => setThinkingSec(Math.round((Date.now() - thinkingSince) / 1000))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [thinkingSince])

  // Cancel a pending frame on unmount.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  // Auto-scroll to the bottom on new messages.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || streaming || !projectPath) return
    const userMsg: AiChatMessage = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    saveChat(history)

    const requestId = crypto.randomUUID()
    reqRef.current = requestId
    setStreaming(true)
    try {
      const context = await buildContext()
      const recent = trimHistory(history)
      const toSend: AiChatMessage[] = context
        ? [{ role: 'system', content: context }, ...recent]
        : recent
      await window.api.ai.chat(requestId, toSend)
    } catch (err) {
      // Normally the failure already arrived as an 'error' event, which cleared
      // reqRef. If it did not (the request never reached the model — no profile,
      // no key, a failure while building the context), finish the request here:
      // otherwise the panel would stay in the streaming state and silently
      // swallow every further send.
      if (reqRef.current === requestId) {
        finishRequest(t('chat.error', { msg: err instanceof Error ? err.message : String(err) }))
      }
    }
  }

  const stop = (): void => {
    const id = reqRef.current
    if (!id) return
    void window.api.ai.abort(id)
    // The abort is answered by a 'done' event; if the request is already gone in
    // main (nothing to abort), release the UI here so the panel stays usable.
    window.setTimeout(() => {
      if (reqRef.current === id) finishRequest(null)
    }, 1000)
  }

  const clearChat = (): void => {
    setMessages([])
    saveChat([])
  }

  // Active summary-generation request (for stopping).
  const genReqRef = useRef<string | null>(null)

  const generateSummaries = async (): Promise<void> => {
    if (!projectPath || !manifest || genBusy) return
    setGenBusy(true)
    const next = { ...summaries }
    try {
      for (const d of collectDocuments(manifest.tree)) {
        // The user pressed Stop — stop iterating chapters.
        if (genReqRef.current === 'stopped') break
        const doc = await window.api.document.load(projectPath, d.id)
        if (!doc) continue
        let text = documentToText(doc)
        if (text.trim().length < 20) continue
        if (text.length > MAX_DOC_CONTEXT) text = text.slice(0, MAX_DOC_CONTEXT) + '…'
        const requestId = crypto.randomUUID()
        genReqRef.current = requestId
        try {
          next[d.id] = (
            await window.api.ai.improve(
              requestId,
              text,
              'Write a very short summary of this fragment in 1–2 sentences, in the language of the fragment.'
            )
          ).trim()
          setSummaries({ ...next })
          await window.api.workspace.saveSummaries(projectPath, next)
        } catch {
          /* skip the chapter on error; on stop the loop breaks above */
        }
      }
    } finally {
      genReqRef.current = null
      setGenBusy(false)
    }
  }

  const stopSummaries = (): void => {
    const id = genReqRef.current
    genReqRef.current = 'stopped'
    if (id && id !== 'stopped') void window.api.ai.abort(id)
  }

  return (
    <div className="chat">
      {/* Context controls — what the model sees */}
      <div className="chat__context">
        <div className="chat__context-head">
          <span className="chat__context-title">{t('chat.contextTitle')}</span>
          <span className="chat__ctx-size" title={t('chat.ctxSizeTitle')}>
            {t('chat.ctxChars', { n: ctxChars.toLocaleString() })}
          </span>
        </div>
        <div className="chat__context-row">
          <label className={`chat__chip${includeDoc ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={includeDoc}
              onChange={(e) => setIncludeDoc(e.target.checked)}
            />
            <span>{t('chat.currentChapter')}</span>
          </label>
          <label className={`chat__chip${includeSummaries ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={includeSummaries}
              onChange={(e) => setIncludeSummaries(e.target.checked)}
            />
            <span>{t('chat.otherChapters')}</span>
          </label>
          <button
            type="button"
            className="chat__gen"
            onClick={() => (genBusy ? stopSummaries() : void generateSummaries())}
            disabled={!projectPath}
            title={t('chat.genTitle')}
          >
            {genBusy ? t('chat.stopGen') : t('chat.generate')}
          </button>
        </div>
      </div>

      <div className="chat__messages" ref={listRef}>
        {!projectPath ? (
          <div className="chat__empty">{t('chat.openProject')}</div>
        ) : !activeProfile ? (
          <div className="chat__empty">
            {t('chat.noProfile')}
          </div>
        ) : messages.length === 0 ? (
          <div className="chat__empty">
            {t('chat.emptyHint')}
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              streaming={streaming && i === messages.length - 1}
              placeholder={
                thinkingSince != null && i === messages.length - 1
                  ? t('chat.thinking', { s: thinkingSec })
                  : '…'
              }
            />
          ))
        )}
      </div>

      <div className="chat__composer">
        <textarea
          className="chat__input"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={
            activeProfile ? t('chat.inputPlaceholder') : t('chat.configureFirst')
          }
          disabled={!projectPath || !activeProfile}
        />
        <div className="chat__composer-row">
          <button
            type="button"
            className="chat__clear"
            onClick={clearChat}
            disabled={messages.length === 0}
          >
            {t('chat.clear')}
          </button>
          {streaming ? (
            <button type="button" className="chat__send" onClick={stop}>
              {t('chat.stop')}
            </button>
          ) : (
            <button
              type="button"
              className="chat__send"
              onClick={() => void send()}
              disabled={!input.trim() || !projectPath || !activeProfile}
            >
              {t('chat.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
