import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AiChatMessage } from '@shared/ai-types'
import { documentToText } from '@shared/document-text'
import { useProject, useSettings } from '@renderer/store'
import { collectDocuments, findNodeTitle } from '@renderer/lib/tree'
import { useT } from '@renderer/lib/i18n'
import './chat-panel.css'

// Предохранитель от запредельно больших отправок (обычная глава влезает целиком).
const MAX_DOC_CONTEXT = 200000
// Ограничение отправляемой истории: длинный чат не должен упираться в
// контекст модели. Храним всё, а модели шлём хвост в пределах бюджета.
const MAX_HISTORY_MESSAGES = 30
const MAX_HISTORY_CHARS = 120000

/** Хвост истории в пределах бюджета сообщений и символов. */
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
// Базовая роль ассистента. Универсальная: конкретную задачу ставит пользователь
// в сообщении; модель отвечает по сути и на языке обращения.
const SYSTEM_PREFIX =
  'You are a writer’s assistant built into a book editor. You help with everything related to the text: plot, characters, world, style, wording, facts, ideas, edits and translations — the specific task is set by the user in their message. Answer to the point and without fluff: only useful content, no needless introductions, repetition or self-description. Reply in the language the user addresses you in. If book context is attached below, rely on it.'

/**
 * Один пузырь сообщения. Мемоизирован: пока печатается новый ответ, завершённые
 * сообщения не перерисовываются — иначе ReactMarkdown заново разбирал бы
 * разметку всей истории на каждый кадр стрима.
 */
const MessageBubble = memo(function MessageBubble({
  role,
  content,
  streaming
}: {
  role: AiChatMessage['role']
  content: string
  streaming: boolean
}): JSX.Element {
  return (
    <div className={`chat__msg chat__msg--${role}`}>
      <div className="chat__bubble">
        {role === 'assistant' ? (
          streaming ? (
            // Во время стрима — простой текст (без разбора Markdown на каждый кадр).
            content || '…'
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

  const reqRef = useRef<string | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const pathRef = useRef(projectPath)
  pathRef.current = projectPath
  const listRef = useRef<HTMLDivElement>(null)
  // Буфер стриминга: накопленные дельты применяем к состоянию не на каждый
  // токен, а раз в кадр (requestAnimationFrame) — при быстром стриме это
  // удерживает перерисовку растущего ответа в пределах кадра.
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  const activeProfile = settings.ai.profiles.find((p) => p.id === settings.ai.activeProfileId)

  const docTitle = useMemo(
    () => (manifest && activeDocId ? findNodeTitle(manifest.tree, activeDocId) : null),
    [manifest, activeDocId]
  )

  // Загрузка истории и кэша содержаний при открытии проекта.
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

  // Слить накопленные дельты в состояние (вызывается из rAF).
  const flushBuffer = useCallback(() => {
    rafRef.current = null
    const chunk = bufferRef.current
    if (!chunk) return
    bufferRef.current = ''
    setMessages((m) => setLastAssistant(m, (prev) => prev + chunk))
  }, [])

  // Сборка контекста для модели.
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

    // Базовая роль отправляется всегда; контекст книги — если выбран.
    const context = parts.length > 0 ? `\n\n${parts.join('\n\n')}` : ''
    return `${SYSTEM_PREFIX}${context}`
    // docVersion — пересчёт после автосохранения главы.
  }, [projectPath, manifest, activeDocId, docTitle, includeDoc, includeSummaries, summaries, docVersion])

  // Оценка размера контекста (для индикатора «что видит модель»).
  useEffect(() => {
    let cancelled = false
    buildContext().then((s) => {
      if (!cancelled) setCtxChars(s.length)
    })
    return () => {
      cancelled = true
    }
  }, [buildContext])

  // Подписка на стриминг ответа.
  useEffect(() => {
    const cancelRaf = (): void => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    return window.api.ai.onStream((e) => {
      if (e.requestId !== reqRef.current) return
      if (e.type === 'delta') {
        // Копим дельты, экран обновляем раз в кадр.
        bufferRef.current += e.text
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushBuffer)
      } else if (e.type === 'done') {
        cancelRaf()
        const chunk = bufferRef.current
        bufferRef.current = ''
        if (chunk) setMessages((m) => setLastAssistant(m, (prev) => prev + chunk))
        setStreaming(false)
        reqRef.current = null
        // messagesRef обновится к следующему тику — тогда и сохраняем.
        setTimeout(() => saveChat(messagesRef.current), 0)
      } else if (e.type === 'error') {
        cancelRaf()
        bufferRef.current = ''
        setMessages((m) => setLastAssistant(m, () => t('chat.error', { msg: e.error })))
        setStreaming(false)
        reqRef.current = null
        setTimeout(() => saveChat(messagesRef.current), 0)
      }
    })
  }, [saveChat, flushBuffer, t])

  // Отмена незавершённого кадра при размонтировании.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  // Автопрокрутка к низу при новых сообщениях.
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

    const context = await buildContext()
    const recent = trimHistory(history)
    const toSend: AiChatMessage[] = context
      ? [{ role: 'system', content: context }, ...recent]
      : recent

    const requestId = crypto.randomUUID()
    reqRef.current = requestId
    setStreaming(true)
    try {
      await window.api.ai.chat(requestId, toSend)
    } catch {
      // Ошибка уже пришла событием 'error'.
    }
  }

  const stop = (): void => {
    if (reqRef.current) void window.api.ai.abort(reqRef.current)
  }

  const clearChat = (): void => {
    setMessages([])
    saveChat([])
  }

  // Активный запрос генерации содержаний (для остановки).
  const genReqRef = useRef<string | null>(null)

  const generateSummaries = async (): Promise<void> => {
    if (!projectPath || !manifest || genBusy) return
    setGenBusy(true)
    const next = { ...summaries }
    try {
      for (const d of collectDocuments(manifest.tree)) {
        // Пользователь нажал «Стоп» — прекращаем обход глав.
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
          /* пропускаем главу при ошибке; при остановке цикл прервётся выше */
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
      {/* Управление контекстом — что видит модель */}
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
