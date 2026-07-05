import type { AiProviderKind } from '@shared/ai-types'
import type { Translator } from '@shared/i18n'

/** Provider presets — pre-fill baseUrl/model/kind. */
export interface AiPreset {
  id: string
  label: string
  kind: AiProviderKind
  baseUrl: string
  model: string
  needsKey: boolean
}

export const AI_PRESETS: AiPreset[] = [
  { id: 'claude', label: 'Claude (Anthropic)', kind: 'anthropic', baseUrl: '', model: 'claude-opus-4-8', needsKey: true },
  { id: 'openai', label: 'ChatGPT (OpenAI)', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.1', needsKey: true },
  { id: 'deepseek', label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', needsKey: true },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    needsKey: true
  },
  { id: 'lmstudio', label: 'LM Studio', kind: 'openai', baseUrl: 'http://localhost:1234/v1', model: '', needsKey: false },
  { id: 'ollama', label: 'Ollama', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: '', needsKey: false },
  { id: 'custom', label: '', kind: 'openai', baseUrl: '', model: '', needsKey: false }
]

/** Preset label for the list (local and custom ones are localized). */
export function presetLabel(p: AiPreset, t: Translator): string {
  if (p.id === 'custom') return t('ai.presetCustom')
  if (!p.needsKey) return `${p.label} (${t('ai.presetLocal')})`
  return p.label
}
