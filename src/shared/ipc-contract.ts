/**
 * Контракт IPC между renderer и main.
 *
 * Здесь объявляются имена каналов и типы публичного API, выставляемого
 * в renderer через preload (`window.api`). И main, и renderer ссылаются
 * на этот файл — единый источник правды для связи процессов.
 */

import type {
  DocumentContent,
  NodeType,
  OpenProjectResult,
  ProjectManifest,
  ProjectStats
} from './project-types'
import type { GlobalSettings } from './settings-types'
import type { BackupInfo, BackupReason } from './backup-types'
import type {
  AiChatMessage,
  AiModelInfo,
  AiProfileDraft,
  AiStreamEvent,
  AiTestResult,
  GrammarEdit
} from './ai-types'
import type { ExportOptions, ExportProgress, ExportResult } from './export-types'

export const IpcChannels = {
  /** Проверка связи renderer → main. Возвращает строку "pong". */
  ping: 'app:ping',

  /** Создать новый проект (диалог выбора расположения). */
  projectCreate: 'project:create',
  /** Открыть существующий проект (диалог выбора папки). */
  projectOpen: 'project:open',
  /** Открыть проект по известному пути (без диалога). */
  projectOpenPath: 'project:openPath',
  /** Сохранить манифест проекта. */
  projectSave: 'project:save',
  /** Статистика слов/символов по всему проекту. */
  projectStats: 'project:stats',

  /** Загрузить содержимое документа. */
  documentLoad: 'document:load',
  /** Сохранить содержимое документа. */
  documentSave: 'document:save',

  /** Создать узел дерева (папку/документ). */
  treeCreate: 'tree:create',
  /** Переименовать узел. */
  treeRename: 'tree:rename',
  /** Удалить узел (с поддеревом). */
  treeRemove: 'tree:remove',
  /** Переместить/переупорядочить узел. */
  treeMove: 'tree:move',
  /** Дублировать узел (с поддеревом и содержимым). */
  treeDuplicate: 'tree:duplicate',

  /** Переместить узлы в корзину (с поддеревьями). */
  trashMove: 'trash:move',
  /** Восстановить узел из корзины. */
  trashRestore: 'trash:restore',
  /** Окончательно удалить элемент корзины (вместе с файлами). */
  trashDelete: 'trash:delete',
  /** Очистить корзину целиком. */
  trashEmpty: 'trash:empty',

  /** Прочитать глобальные настройки. */
  settingsGet: 'settings:get',
  /** Сохранить глобальные настройки. */
  settingsSet: 'settings:set',

  /** Проект открыт (снапшот при открытии + отслеживание текущего). */
  backupProjectOpened: 'backup:projectOpened',
  /** Проект закрывается (снапшот при закрытии). */
  backupProjectClosing: 'backup:projectClosing',
  /** Сделать снапшот (вручную/по интервалу). */
  backupSnapshot: 'backup:snapshot',
  /** Список снапшотов. */
  backupList: 'backup:list',
  /** Восстановить из снапшота. */
  backupRestore: 'backup:restore',
  /** Удалить снапшот. */
  backupDelete: 'backup:delete',

  /** Выбрать папку (нативный диалог). */
  dialogPickDirectory: 'dialog:pickDirectory',
  /** Открыть путь в системе (папку/файл). */
  shellOpenPath: 'shell:openPath',
  /** Экспорт проекта в выбранный формат. */
  exportRun: 'export:run',
  /** Прогресс экспорта (main → renderer). */
  exportProgress: 'export:progress',
  /** Запрос открыть проект по пути (двойной клик/ассоциация/аргумент). */
  appOpenProject: 'app:openProject',
  /** Окно закрывается: renderer должен долить несохранённое (main → renderer). */
  appWillClose: 'app:willClose',
  /** Подтверждение renderer: несохранённое записано, можно закрываться. */
  appCloseReady: 'app:closeReady',

  /** Действие ИИ над выделением, выбранное в контекстном меню (main → renderer). */
  editorAiAction: 'editor:aiAction',
  /** Список слов пользовательского словаря. */
  spellListWords: 'spell:listWords',
  /** Добавить слово в словарь. */
  spellAddWord: 'spell:addWord',
  /** Удалить слово из словаря. */
  spellRemoveWord: 'spell:removeWord',
  /** Экспортировать пользовательский словарь в файл. */
  spellExportWords: 'spell:exportWords',
  /** Импортировать слова из файла в словарь. */
  spellImportWords: 'spell:importWords',

  /** Доступно ли безопасное хранилище ключей. */
  aiStorageAvailable: 'ai:storageAvailable',
  /** Задан ли ключ для профиля. */
  aiKeyStatus: 'ai:keyStatus',
  /** Сохранить ключ профиля (в safeStorage). */
  aiSetKey: 'ai:setKey',
  /** Удалить ключ профиля. */
  aiDeleteKey: 'ai:deleteKey',
  /** Проверить соединение по черновику профиля. */
  aiTest: 'ai:test',
  /** Список моделей провайдера по черновику. */
  aiListModels: 'ai:listModels',
  /** Чат с активным провайдером (стриминг через события). */
  aiChat: 'ai:chat',
  /** Прервать запрос чата. */
  aiAbort: 'ai:abort',
  /** Улучшить текст по инструкции. */
  aiImprove: 'ai:improve',
  /** Проверить грамматику/стиль (список правок). */
  aiGrammar: 'ai:grammar',
  /** Канал событий стриминга чата (main → renderer). */
  aiStream: 'ai:stream',

  /** Загрузить историю чата проекта. */
  chatLoad: 'workspace:chatLoad',
  /** Сохранить историю чата проекта. */
  chatSave: 'workspace:chatSave',
  /** Загрузить кэш кратких содержаний. */
  summariesLoad: 'workspace:summariesLoad',
  /** Сохранить кэш кратких содержаний. */
  summariesSave: 'workspace:summariesSave',
  /** Загрузить заметку главы. */
  noteLoad: 'workspace:noteLoad',
  /** Сохранить заметку главы. */
  noteSave: 'workspace:noteSave'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/** API проекта (создание/открытие/сохранение). */
export interface ProjectApi {
  /** Открывает диалог, создаёт проект. null — пользователь отменил. */
  create: () => Promise<OpenProjectResult | null>
  /** Открывает диалог выбора папки проекта. null — пользователь отменил. */
  open: () => Promise<OpenProjectResult | null>
  /** Открывает проект по пути (восстановление последнего, ассоциация файлов). */
  openPath: (projectPath: string) => Promise<OpenProjectResult>
  /** Сохраняет манифест; возвращает обновлённый манифест (с updatedAt). */
  save: (projectPath: string, manifest: ProjectManifest) => Promise<ProjectManifest>
  /** Слова/символы по всему проекту (сумма по всем документам). */
  stats: (projectPath: string) => Promise<ProjectStats>
}

/** API документов (тексты глав/сцен). */
export interface DocumentApi {
  /** Содержимое документа или null, если файла ещё нет. */
  load: (projectPath: string, nodeId: string) => Promise<DocumentContent | null>
  /** Сохранить содержимое документа. */
  save: (projectPath: string, nodeId: string, content: DocumentContent) => Promise<void>
}

/** Результат мутации, создающей новый узел. */
export interface CreateNodeResult {
  manifest: ProjectManifest
  nodeId: string
}

/** API глобальных настроек приложения. */
export interface SettingsApi {
  get: () => Promise<GlobalSettings>
  set: (settings: GlobalSettings) => Promise<GlobalSettings>
}

/** API резервного копирования. */
export interface BackupApi {
  /** Сообщить, что проект открыт (снапшот при открытии). */
  projectOpened: (projectPath: string) => Promise<void>
  /** Сообщить, что проект закрывается (снапшот при закрытии). */
  projectClosing: (projectPath: string) => Promise<void>
  /** Сделать снапшот вручную/по интервалу. */
  snapshot: (projectPath: string, reason: BackupReason) => Promise<BackupInfo>
  /** Список снапшотов (от новых к старым). */
  list: (projectPath: string) => Promise<BackupInfo[]>
  /** Восстановить из снапшота; возвращает восстановленный манифест. */
  restore: (projectPath: string, id: string) => Promise<ProjectManifest>
  /** Удалить снапшот. */
  delete: (projectPath: string, id: string) => Promise<void>
}

/** Нативные диалоги общего назначения. */
export interface DialogApi {
  /** Выбрать папку. null — отмена. */
  pickDirectory: () => Promise<string | null>
  /** Открыть путь (папку/файл) в системе. */
  openPath: (path: string) => Promise<void>
}

/** API экспорта проекта. */
export interface ExportApi {
  run: (projectPath: string, options: ExportOptions) => Promise<ExportResult>
  /** Подписка на прогресс экспорта. Возвращает функцию отписки. */
  onProgress: (callback: (progress: ExportProgress) => void) => () => void
}

/** Системные события приложения. */
export interface AppEventsApi {
  /** Запрос ОС открыть проект по пути (ассоциация/аргумент/второй экземпляр). */
  onOpenProject: (callback: (projectPath: string) => void) => () => void
  /** Окно закрывается: нужно немедленно записать отложенные автосохранения. */
  onWillClose: (callback: () => void) => () => void
  /** Сообщить main, что несохранённое записано — окно можно закрывать. */
  closeReady: () => Promise<void>
}

/** Связь редактора с нативным контекстным меню и словарём. */
export interface EditorApi {
  /** Подписка на ИИ-действие из контекстного меню. Возвращает функцию отписки. */
  onAiAction: (callback: (kind: 'rewrite' | 'grammar') => void) => () => void
  /** Слова пользовательского словаря. */
  listDictionary: () => Promise<string[]>
  /** Добавить слово в словарь. */
  addToDictionary: (word: string) => Promise<void>
  /** Удалить слово из словаря. */
  removeFromDictionary: (word: string) => Promise<void>
  /** Экспортировать словарь в выбранный файл. true — сохранено, false — отмена. */
  exportDictionary: () => Promise<boolean>
  /** Импортировать слова из выбранного файла. Возвращает обновлённый список. */
  importDictionary: () => Promise<string[]>
}

/** API ИИ-провайдеров. Ключи живут в main; в renderer не передаются. */
export interface AiApi {
  /** Доступно ли системное безопасное хранилище (для ключей). */
  storageAvailable: () => Promise<boolean>
  /** Задан ли сохранённый ключ для профиля. */
  keyStatus: (profileId: string) => Promise<boolean>
  /** Сохранить/обновить ключ профиля. */
  setKey: (profileId: string, key: string) => Promise<void>
  /** Удалить ключ профиля. */
  deleteKey: (profileId: string) => Promise<void>
  /** Проверить соединение по введённым параметрам профиля. */
  test: (draft: AiProfileDraft) => Promise<AiTestResult>
  /** Список моделей провайдера по введённым параметрам. */
  listModels: (draft: AiProfileDraft) => Promise<AiModelInfo[]>
  /** Запрос чата активным провайдером; ответ стримится через onStream. */
  chat: (requestId: string, messages: AiChatMessage[]) => Promise<string>
  /** Прервать запрос чата по requestId. */
  abort: (requestId: string) => Promise<void>
  /** Улучшить текст по инструкции (возвращает новый вариант). Отменяется по requestId. */
  improve: (requestId: string, text: string, instruction: string) => Promise<string>
  /** Проверить грамматику/стиль (возвращает список правок). Отменяется по requestId. */
  grammar: (requestId: string, text: string) => Promise<GrammarEdit[]>
  /** Подписка на события стриминга чата. Возвращает функцию отписки. */
  onStream: (callback: (event: AiStreamEvent) => void) => () => void
}

/** API данных рабочего пространства проекта (история чата, кэш содержаний). */
export interface WorkspaceApi {
  loadChat: (projectPath: string) => Promise<AiChatMessage[]>
  saveChat: (projectPath: string, messages: AiChatMessage[]) => Promise<void>
  loadSummaries: (projectPath: string) => Promise<Record<string, string>>
  saveSummaries: (projectPath: string, summaries: Record<string, string>) => Promise<void>
  loadNote: (projectPath: string, nodeId: string) => Promise<string>
  saveNote: (projectPath: string, nodeId: string, text: string) => Promise<void>
}

/**
 * API структуры проекта (дерево). Каждая мутация применяется в main поверх
 * доменной модели, сохраняется на диск и возвращает обновлённый манифест.
 */
export interface TreeApi {
  /** Создать узел внутри parentId (null — корень). */
  create: (
    projectPath: string,
    parentId: string | null,
    type: NodeType,
    title: string
  ) => Promise<CreateNodeResult>
  /** Переименовать узел. */
  rename: (projectPath: string, nodeId: string, title: string) => Promise<ProjectManifest>
  /** Удалить узел и его поддерево (вместе с файлами содержимого). */
  remove: (projectPath: string, nodeId: string) => Promise<ProjectManifest>
  /** Переместить узел внутрь newParentId (null — корень) на позицию index. */
  move: (
    projectPath: string,
    nodeId: string,
    newParentId: string | null,
    index: number
  ) => Promise<ProjectManifest>
  /** Дублировать узел (с поддеревом и копией содержимого). */
  duplicate: (projectPath: string, nodeId: string) => Promise<CreateNodeResult>
}

/**
 * API корзины проекта. Удаление перемещает узлы в корзину (файлы остаются);
 * окончательное стирание файлов происходит лишь при удалении из корзины.
 */
export interface TrashApi {
  /** Переместить узлы (с поддеревьями) в корзину. */
  move: (projectPath: string, nodeIds: string[]) => Promise<ProjectManifest>
  /** Восстановить узел из корзины на исходное место. */
  restore: (projectPath: string, nodeId: string) => Promise<ProjectManifest>
  /** Окончательно удалить элемент корзины (вместе с файлами содержимого). */
  delete: (projectPath: string, nodeId: string) => Promise<ProjectManifest>
  /** Очистить корзину целиком. */
  empty: (projectPath: string) => Promise<ProjectManifest>
}

/**
 * Поверхность API, доступная в renderer как `window.api`.
 */
export interface AppApi {
  /** Health-check связи с main-процессом. */
  ping: () => Promise<string>
  project: ProjectApi
  document: DocumentApi
  tree: TreeApi
  trash: TrashApi
  settings: SettingsApi
  backup: BackupApi
  dialog: DialogApi
  ai: AiApi
  workspace: WorkspaceApi
  editor: EditorApi
  export: ExportApi
  app: AppEventsApi
}
