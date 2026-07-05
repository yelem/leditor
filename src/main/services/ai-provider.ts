/**
 * Abstraction over the language model. All calls happen in main only.
 *
 * A single AiProvider interface with two implementations:
 *  - AnthropicProvider     — Claude via @anthropic-ai/sdk;
 *  - OpenAICompatProvider  — any OpenAI-compatible endpoint (fetch + SSE).
 *
 * improveText / checkGrammar / testConnection are implemented in the base
 * class on top of chat(), so they are identical for all providers.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  type AiChatMessage,
  type AiModelInfo,
  type AiProviderKind,
  type AiTestResult,
  type GrammarEdit
} from '@shared/ai-types'
import { tMain } from '../i18n'

export interface ChatOptions {
  signal?: AbortSignal
  onDelta?: (text: string) => void
  maxTokens?: number
}

export interface AiProvider {
  chat: (messages: AiChatMessage[], opts?: ChatOptions) => Promise<string>
  improveText: (text: string, instruction: string, opts?: ChatOptions) => Promise<string>
  checkGrammar: (text: string, opts?: ChatOptions) => Promise<GrammarEdit[]>
  testConnection: () => Promise<AiTestResult>
  listModels: () => Promise<AiModelInfo[]>
}

/** Strip noise around JSON: reasoning-model think blocks and ``` fences. */
function stripNoise(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
}

/**
 * Find ALL balanced JSON arrays in the text, correctly skipping brackets
 * inside string literals. All candidates must be tried because reasoning
 * models emit brackets in their deliberations before the real array.
 */
function extractJsonArrays(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '[') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) {
          out.push(text.slice(i, j + 1))
          break
        }
      }
    }
  }
  return out
}

function toEdits(parsed: unknown): GrammarEdit[] {
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (e): e is GrammarEdit =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as GrammarEdit).original === 'string' &&
        typeof (e as GrammarEdit).suggestion === 'string'
    )
    .map((e) => ({
      original: e.original,
      suggestion: e.suggestion,
      reason: typeof e.reason === 'string' ? e.reason : ''
    }))
}

/** Extract the JSON array of edits from the model reply (tolerant of surrounding text). */
function parseGrammar(raw: string): GrammarEdit[] {
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s)
    } catch {
      return undefined
    }
  }
  // Of all balanced arrays, take the one that yields the most valid edits.
  let best: GrammarEdit[] = []
  for (const candidate of extractJsonArrays(stripNoise(raw))) {
    const parsed = tryParse(candidate) ?? tryParse(candidate.replace(/,\s*([\]}])/g, '$1'))
    const edits = toEdits(parsed)
    if (edits.length > best.length) best = edits
  }
  return best
}

abstract class BaseProvider implements AiProvider {
  abstract chat(messages: AiChatMessage[], opts?: ChatOptions): Promise<string>
  abstract listModels(): Promise<AiModelInfo[]>

  async improveText(text: string, instruction: string, opts?: ChatOptions): Promise<string> {
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content:
          'You are an attentive literary editor. Rewrite the provided text according to the user’s instruction, preserving the author’s meaning and the language of the text. Return ONLY the reworked text, without comments, explanations or surrounding quotes.'
      },
      { role: 'user', content: `Instruction: ${instruction}\n\nText:\n${text}` }
    ]
    const result = await this.chat(messages, { ...opts, maxTokens: opts?.maxTokens ?? 8192 })
    return result.trim()
  }

  async checkGrammar(text: string, opts?: ChatOptions): Promise<GrammarEdit[]> {
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content:
          'Do not think out loud and do not write introductions — output a JSON array right away. ' +
          'You are a proofreader. Detect the language of the text and fix only OBVIOUS errors in that language: ' +
          'spelling, punctuation, grammar, agreement, typos. ' +
          'Do NOT touch style or authorial phrasing: no rewrites for elegance, no synonyms, ' +
          'no word-order changes, no acceptable-punctuation changes. When in doubt — skip. ' +
          'Do not include correct fragments. For each real error return an object ' +
          '{"original":"<exact fragment as in the text>","suggestion":"<corrected fragment>","reason":"<brief, in the language of the text>"}. ' +
          'Copy the original field from the text character for character. ' +
          'Respond with ONLY a JSON array of such objects, no explanations, no Markdown, no ``` . ' +
          'If there are no obvious errors, return []. ' +
          'Example: [{"original":"teh word","suggestion":"the word","reason":"typo"},' +
          '{"original":"some one","suggestion":"someone","reason":"missing joining"}]'
      },
      { role: 'user', content: `Check the text and return a JSON array of edits:\n\n${text}` }
    ]
    const raw = await this.chat(messages, { ...opts, maxTokens: opts?.maxTokens ?? 4096 })
    return parseGrammar(raw)
  }

  async testConnection(): Promise<AiTestResult> {
    try {
      const reply = await this.chat([{ role: 'user', content: 'Reply with a single word: hello.' }], {
        maxTokens: 64
      })
      return { ok: true, reply: reply.trim().slice(0, 200) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/** Claude provider on top of the official SDK. */
class AnthropicProvider extends BaseProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {
    super()
  }

  async chat(messages: AiChatMessage[], opts?: ChatOptions): Promise<string> {
    const client = new Anthropic({ apiKey: this.apiKey })
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const conversation = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const stream = client.messages.stream(
      {
        model: this.model,
        max_tokens: opts?.maxTokens ?? 8192,
        system: system || undefined,
        messages: conversation
      },
      { signal: opts?.signal }
    )

    let full = ''
    stream.on('text', (delta) => {
      full += delta
      opts?.onDelta?.(delta)
    })
    await stream.finalMessage()
    return full
  }

  async listModels(): Promise<AiModelInfo[]> {
    const client = new Anthropic({ apiKey: this.apiKey })
    const list = await client.models.list()
    return list.data.map((m) => ({ id: m.id }))
  }
}

/** Provider for any OpenAI-compatible API (LM Studio, Ollama, OpenAI, …). */
class OpenAICompatProvider extends BaseProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {
    super()
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`
    return h
  }

  private post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    return fetch(this.url('/chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal
    })
  }

  async chat(messages: AiChatMessage[], opts?: ChatOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true
    }
    // Send max_tokens only when set explicitly (improve/grammar);
    // chat is unlimited — the server decides based on the model context.
    if (opts?.maxTokens != null) body.max_tokens = opts.maxTokens

    let res = await this.post(body, opts?.signal)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      // Newer OpenAI models (gpt-5.x, o-series) reject max_tokens and require
      // max_completion_tokens. Local servers (LM Studio, Ollama) only understand
      // max_tokens, so it is sent first and the request is retried with the new
      // parameter name on refusal.
      const wantsNewParam =
        res.status === 400 &&
        body.max_tokens != null &&
        /max_completion_tokens/.test(errText)
      if (!wantsNewParam) {
        throw new Error(
          tMain('main.errServer', { status: res.status }) +
            (errText ? `: ${errText.slice(0, 300)}` : '')
        )
      }
      body.max_completion_tokens = body.max_tokens
      delete body.max_tokens
      res = await this.post(body, opts?.signal)
    }

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '')
      throw new Error(
        tMain('main.errServer', { status: res.status }) +
          (errText ? `: ${errText.slice(0, 300)}` : '')
      )
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            full += delta
            opts?.onDelta?.(delta)
          }
        } catch {
          /* skip non-JSON lines (SSE comments) */
        }
      }
    }
    return full
  }

  async listModels(): Promise<AiModelInfo[]> {
    const res = await fetch(this.url('/models'), { headers: this.headers() })
    if (!res.ok) throw new Error(tMain('main.errServerModels', { status: res.status }))
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    return (json.data ?? [])
      .filter((m): m is { id: string } => typeof m.id === 'string')
      .map((m) => ({ id: m.id }))
  }
}

/** Create a provider from its kind and parameters. */
export function createProvider(
  kind: AiProviderKind,
  params: { apiKey: string; baseUrl: string; model: string }
): AiProvider {
  if (kind === 'anthropic') {
    return new AnthropicProvider(params.apiKey, params.model || 'claude-opus-4-8')
  }
  return new OpenAICompatProvider(params.baseUrl, params.apiKey, params.model)
}
