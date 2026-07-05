/**
 * IPC-обработчики ИИ. Резолвят активный профиль + ключ, создают
 * провайдера и проксируют вызовы. Стриминг чата идёт через события 'ai:stream'.
 * Ключи берутся из safeStorage и в renderer не передаются.
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import {
  type AiChatMessage,
  type AiModelInfo,
  type AiProfileDraft,
  type AiTestResult,
  type GrammarEdit
} from '@shared/ai-types'
import { getSettings } from '../services/settings'
import { createProvider, type AiProvider } from '../services/ai-provider'
import {
  deleteKey,
  getKey,
  hasKey,
  isKeyStorageAvailable,
  setKey
} from '../services/ai-keys'
import { tMain } from '../i18n'

/** Создать провайдера по активному сохранённому профилю. */
async function activeProvider(): Promise<AiProvider> {
  const { ai } = await getSettings()
  const profile = ai.profiles.find((p) => p.id === ai.activeProfileId)
  if (!profile) {
    throw new Error(tMain('main.errNoActiveProfile'))
  }
  const key = (await getKey(profile.id)) ?? ''
  if (profile.kind === 'anthropic' && !key) {
    throw new Error(tMain('main.errNoKey', { name: profile.name }))
  }
  return createProvider(profile.kind, {
    apiKey: key,
    baseUrl: profile.baseUrl,
    model: profile.model
  })
}

async function draftProvider(draft: AiProfileDraft): Promise<AiProvider> {
  let key = draft.apiKey ?? ''
  if (!key && draft.profileId) key = (await getKey(draft.profileId)) ?? ''
  return createProvider(draft.kind, {
    apiKey: key,
    baseUrl: draft.baseUrl,
    model: draft.model
  })
}

// Предельное время одного запроса к модели: зависший сервер не должен
// оставлять интерфейс в состоянии «обработка…» навсегда. Запас большой —
// локальные модели генерируют медленно; отменить раньше можно вручную.
const REQUEST_TIMEOUT_MS = 600_000

export function registerAiIpc(): void {
  // Активные запросы (для прерывания пользователем).
  const controllers = new Map<string, AbortController>()

  /** Выполнить запрос с поддержкой отмены по requestId и таймаутом. */
  const withAbort = async <T>(
    requestId: string,
    run: (signal: AbortSignal) => Promise<T>
  ): Promise<T> => {
    const controller = new AbortController()
    controllers.set(requestId, controller)
    try {
      return await run(
        AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      )
    } finally {
      controllers.delete(requestId)
    }
  }

  ipcMain.handle(IpcChannels.aiStorageAvailable, (): boolean => isKeyStorageAvailable())

  ipcMain.handle(IpcChannels.aiKeyStatus, (_e, profileId: string): Promise<boolean> =>
    hasKey(profileId)
  )

  ipcMain.handle(IpcChannels.aiSetKey, (_e, profileId: string, key: string): Promise<void> =>
    setKey(profileId, key)
  )

  ipcMain.handle(IpcChannels.aiDeleteKey, (_e, profileId: string): Promise<void> =>
    deleteKey(profileId)
  )

  ipcMain.handle(
    IpcChannels.aiTest,
    async (_e, draft: AiProfileDraft): Promise<AiTestResult> =>
      (await draftProvider(draft)).testConnection()
  )

  ipcMain.handle(
    IpcChannels.aiListModels,
    async (_e, draft: AiProfileDraft): Promise<AiModelInfo[]> =>
      (await draftProvider(draft)).listModels()
  )

  ipcMain.handle(
    IpcChannels.aiChat,
    async (event, requestId: string, messages: AiChatMessage[]): Promise<string> => {
      const provider = await activeProvider()
      const controller = new AbortController()
      controllers.set(requestId, controller)
      try {
        const full = await provider.chat(messages, {
          signal: controller.signal,
          onDelta: (text) =>
            event.sender.send(IpcChannels.aiStream, { type: 'delta', requestId, text })
        })
        event.sender.send(IpcChannels.aiStream, { type: 'done', requestId })
        return full
      } catch (err) {
        // Прерывание пользователем — не ошибка: частичный ответ остаётся.
        if (controller.signal.aborted) {
          event.sender.send(IpcChannels.aiStream, { type: 'done', requestId })
          return ''
        }
        const message = err instanceof Error ? err.message : String(err)
        event.sender.send(IpcChannels.aiStream, { type: 'error', requestId, error: message })
        throw new Error(message)
      } finally {
        controllers.delete(requestId)
      }
    }
  )

  ipcMain.handle(IpcChannels.aiAbort, (_e, requestId: string): void => {
    controllers.get(requestId)?.abort()
  })

  ipcMain.handle(
    IpcChannels.aiImprove,
    async (_e, requestId: string, text: string, instruction: string): Promise<string> => {
      const provider = await activeProvider()
      return withAbort(requestId, (signal) => provider.improveText(text, instruction, { signal }))
    }
  )

  ipcMain.handle(
    IpcChannels.aiGrammar,
    async (_e, requestId: string, text: string): Promise<GrammarEdit[]> => {
      const provider = await activeProvider()
      return withAbort(requestId, (signal) => provider.checkGrammar(text, { signal }))
    }
  )
}
