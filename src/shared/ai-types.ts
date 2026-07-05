/**
 * Типы ИИ-слоя.
 *
 * Поддерживаются два вида провайдера за единым интерфейсом:
 *  - 'anthropic'  — Claude через официальный @anthropic-ai/sdk;
 *  - 'openai'     — любой OpenAI-совместимый эндпоинт (LM Studio, Ollama,
 *                   OpenAI, DeepSeek, Gemini-OpenAI и т.д.) по baseUrl.
 *
 * Профили хранятся в глобальных настройках (без ключей). Ключи лежат отдельно,
 * зашифрованные через Electron safeStorage, и в renderer не попадают.
 */

export type AiProviderKind = 'anthropic' | 'openai'

/** Сохранённый профиль подключения (без ключа). */
export interface AiProfile {
  id: string
  name: string
  kind: AiProviderKind
  /** База OpenAI-совместимого API (для kind='openai'). Для anthropic игнорируется. */
  baseUrl: string
  /** Идентификатор модели. */
  model: string
}

/** Набор профилей и активный. */
export interface AiSettings {
  activeProfileId: string | null
  profiles: AiProfile[]
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  activeProfileId: null,
  profiles: []
}

/** Роль сообщения в диалоге. */
export type AiRole = 'system' | 'user' | 'assistant'

export interface AiChatMessage {
  role: AiRole
  content: string
}

/** Одна правка грамматики/стиля (под Google-Docs-подобный обзор на этапе 8). */
export interface GrammarEdit {
  original: string
  suggestion: string
  reason: string
}

/** Результат проверки соединения с провайдером. */
export interface AiTestResult {
  ok: boolean
  /** Короткий ответ модели при успехе. */
  reply?: string
  /** Сообщение об ошибке при неудаче. */
  error?: string
}

/** Событие стриминга чата (main → renderer). */
export type AiStreamEvent =
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; error: string }

/** Модель API по данным провайдера (для выбора из списка). */
export interface AiModelInfo {
  id: string
}

/** Черновик профиля для проверки/получения моделей до сохранения ключа. */
export interface AiProfileDraft {
  kind: AiProviderKind
  baseUrl: string
  model: string
  /** Ключ передаётся напрямую (если введён в форме). */
  apiKey?: string
  /** Если ключ не введён — взять сохранённый ключ этого профиля. */
  profileId?: string
}
