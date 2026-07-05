/**
 * AI layer types.
 *
 * Two provider kinds behind a single interface:
 *  - 'anthropic'  — Claude via the official @anthropic-ai/sdk;
 *  - 'openai'     — any OpenAI-compatible endpoint (LM Studio, Ollama,
 *                   OpenAI, DeepSeek, Gemini-OpenAI, etc.) by baseUrl.
 *
 * Profiles are stored in global settings (without keys). Keys live separately,
 * encrypted via Electron safeStorage, and never reach the renderer.
 */

export type AiProviderKind = 'anthropic' | 'openai'

/** Saved connection profile (without the key). */
export interface AiProfile {
  id: string
  name: string
  kind: AiProviderKind
  /** OpenAI-compatible API base (for kind='openai'). Ignored for anthropic. */
  baseUrl: string
  /** Model identifier. */
  model: string
}

/** The set of profiles and the active one. */
export interface AiSettings {
  activeProfileId: string | null
  profiles: AiProfile[]
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  activeProfileId: null,
  profiles: []
}

/** Message role in the conversation. */
export type AiRole = 'system' | 'user' | 'assistant'

export interface AiChatMessage {
  role: AiRole
  content: string
}

/** One grammar/style edit (rendered as a reviewable tracked suggestion). */
export interface GrammarEdit {
  original: string
  suggestion: string
  reason: string
}

/** Result of testing the provider connection. */
export interface AiTestResult {
  ok: boolean
  /** Short model reply on success. */
  reply?: string
  /** Error message on failure. */
  error?: string
}

/** Chat streaming event (main → renderer). */
export type AiStreamEvent =
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; error: string }

/** API model as reported by the provider (for list selection). */
export interface AiModelInfo {
  id: string
}

/** Profile draft for testing/listing models before the key is saved. */
export interface AiProfileDraft {
  kind: AiProviderKind
  baseUrl: string
  model: string
  /** Key passed directly (if entered in the form). */
  apiKey?: string
  /** If no key entered — use the stored key of this profile. */
  profileId?: string
}
