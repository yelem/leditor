import { app, shell, BrowserWindow, dialog, ipcMain, Menu, MenuItem, session } from 'electron'
import { join } from 'path'
import { statSync, promises as fs } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IpcChannels } from '@shared/ipc-contract'
import { PROJECT_EXTENSION } from '@shared/project-types'
import { tMain } from './i18n'
import { getSettings } from './services/settings'
import { registerProjectIpc } from './ipc/project'
import { registerSettingsIpc } from './ipc/settings'
import { registerBackupIpc, snapshotOnQuitIfNeeded } from './ipc/backup'
import { registerDialogIpc } from './ipc/dialog'
import { registerAiIpc } from './ipc/ai'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerExportIpc } from './ipc/export'

let mainWindow: BrowserWindow | null = null
// Путь проекта, который нужно открыть, как только renderer будет готов.
let pendingProjectPath: string | null = null

// --- Флаш renderer перед закрытием/выходом ---------------------------------
// Автосохранение в renderer отложенное (debounce). Перед закрытием окна и
// перед снапшотом на выходе просим renderer немедленно записать несохранённое
// и ждём подтверждения (appCloseReady) — иначе последние правки теряются.

let rendererFlushed = false
let flushWaiters: Array<() => void> = []

function resolveRendererFlush(): void {
  rendererFlushed = true
  const waiters = flushWaiters
  flushWaiters = []
  for (const resolve of waiters) resolve()
}

/**
 * Попросить renderer долить несохранённое и дождаться подтверждения.
 * Таймаут-страховка: зависший/не отвечающий renderer не блокирует закрытие.
 */
function flushRendererBeforeExit(timeoutMs = 1500): Promise<void> {
  const win = mainWindow
  if (rendererFlushed || !win || win.isDestroyed() || win.webContents.isLoading()) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    flushWaiters.push(resolve)
    win.webContents.send(IpcChannels.appWillClose)
    setTimeout(resolve, timeoutMs)
  })
}

/** Найти в аргументах командной строки путь к папке *.bookproj. */
function extractProjectPath(argv: string[]): string | null {
  for (const arg of argv) {
    if (typeof arg !== 'string' || !arg.toLowerCase().endsWith(PROJECT_EXTENSION)) continue
    try {
      if (statSync(arg).isDirectory()) return arg
    } catch {
      /* несуществующий путь — пропускаем */
    }
  }
  return null
}

/** Передать renderer запрос открыть проект (или отложить до готовности окна). */
function requestOpenProject(projectPath: string): void {
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send(IpcChannels.appOpenProject, projectPath)
  } else {
    pendingProjectPath = projectPath
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Leditor',
    // На Windows используем многоразмерный .ico (16/24/32/48…) — он чётко
    // рисуется в заголовке окна; одиночный большой PNG ОС ужимает в пятно.
    icon: join(
      __dirname,
      '../../resources',
      process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Архитектурный принцип: renderer изолирован от Node и сети.
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  rendererFlushed = false

  // Перед закрытием окна — флаш несохранённого в renderer, потом закрываем.
  let flushedBeforeClose = false
  win.on('close', (event) => {
    if (flushedBeforeClose) return
    event.preventDefault()
    void flushRendererBeforeExit().then(() => {
      flushedBeforeClose = true
      // destroy() закрывает окно, не порождая повторного события close.
      if (!win.isDestroyed()) win.destroy()
    })
  })

  // Проверка орфографии (русский + английский, если доступны).
  try {
    const available = win.webContents.session.availableSpellCheckerLanguages
    const wanted = ['ru', 'en-US'].filter((l) => available.includes(l))
    if (wanted.length > 0) win.webContents.session.setSpellCheckerLanguages(wanted)
  } catch {
    /* спелл-чекер недоступен — не критично */
  }

  // Контекстное меню в редактируемых полях: ИИ-действия (в редакторе),
  // подсказки орфографии, добавление слова в словарь, правка.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const menu = new Menu()

    // ИИ-действия — в прозовом редакторе (contenteditable), не в textarea/input.
    const formControl = (params as { formControlType?: string }).formControlType ?? ''
    const isFormField =
      formControl === 'text-area' ||
      formControl.startsWith('input') ||
      formControl.startsWith('select')
    if (!isFormField && params.selectionText.trim().length > 0) {
      menu.append(
        new MenuItem({
          label: tMain('main.menuCheckErrors'),
          click: () => win.webContents.send(IpcChannels.editorAiAction, 'grammar')
        })
      )
      menu.append(
        new MenuItem({
          label: tMain('main.menuRewrite'),
          click: () => win.webContents.send(IpcChannels.editorAiAction, 'rewrite')
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => win.webContents.replaceMisspelling(suggestion)
          })
        )
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }))
      }
      menu.append(
        new MenuItem({
          label: tMain('main.menuAddToDict'),
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }

    menu.append(new MenuItem({ role: 'cut', label: tMain('main.menuCut') }))
    menu.append(new MenuItem({ role: 'copy', label: tMain('main.menuCopy') }))
    menu.append(new MenuItem({ role: 'paste', label: tMain('main.menuPaste') }))
    menu.append(new MenuItem({ role: 'selectAll', label: tMain('main.menuSelectAll') }))
    menu.popup()
  })

  win.on('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.on('closed', () => {
    mainWindow = null
  })

  // Когда renderer готов — отправляем отложенный запрос на открытие проекта.
  win.webContents.on('did-finish-load', () => {
    if (pendingProjectPath) {
      win.webContents.send(IpcChannels.appOpenProject, pendingProjectPath)
      pendingProjectPath = null
    }
  })

  // Внешние ссылки открываем в системном браузере, а не внутри окна.
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Регистрация всех IPC-обработчиков main-процесса. */
function registerIpcHandlers(): void {
  // Health-check связи renderer → main.
  ipcMain.handle(IpcChannels.ping, () => 'pong')

  // Renderer записал несохранённое — можно продолжать закрытие/выход.
  ipcMain.handle(IpcChannels.appCloseReady, () => {
    resolveRendererFlush()
  })

  // Пользовательский словарь орфографии.
  ipcMain.handle(IpcChannels.spellListWords, () =>
    session.defaultSession.listWordsInSpellCheckerDictionary()
  )
  ipcMain.handle(IpcChannels.spellAddWord, (_e, word: string) => {
    session.defaultSession.addWordToSpellCheckerDictionary(word)
  })
  ipcMain.handle(IpcChannels.spellRemoveWord, (_e, word: string) => {
    session.defaultSession.removeWordFromSpellCheckerDictionary(word)
  })
  ipcMain.handle(IpcChannels.spellExportWords, async (): Promise<boolean> => {
    const words = await session.defaultSession.listWordsInSpellCheckerDictionary()
    const options = {
      title: tMain('main.dlgExportDict'),
      defaultPath: join(app.getPath('documents'), tMain('main.dictFileName')),
      filters: [{ name: tMain('main.dlgTextFile'), extensions: ['txt'] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, words.join('\n') + (words.length ? '\n' : ''), 'utf8')
    return true
  })
  ipcMain.handle(IpcChannels.spellImportWords, async (): Promise<string[]> => {
    const options = {
      title: tMain('main.dlgImportDict'),
      properties: ['openFile' as const],
      filters: [{ name: tMain('main.dlgTextFiles'), extensions: ['txt', 'dic'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return session.defaultSession.listWordsInSpellCheckerDictionary()
    }
    const raw = await fs.readFile(result.filePaths[0], 'utf8')
    const words = raw
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter(Boolean)
    for (const word of words) {
      session.defaultSession.addWordToSpellCheckerDictionary(word)
    }
    return session.defaultSession.listWordsInSpellCheckerDictionary()
  })

  // Проект и документы.
  registerProjectIpc(() => mainWindow)

  // Глобальные настройки.
  registerSettingsIpc()

  // Резервное копирование.
  registerBackupIpc()

  // Нативные диалоги (выбор папки и т.п.).
  registerDialogIpc(() => mainWindow)

  // ИИ-провайдеры.
  registerAiIpc()

  // Данные рабочего пространства: чат, краткие содержания.
  registerWorkspaceIpc()

  // Экспорт проекта (Word/FB2/EPUB).
  registerExportIpc()
}

// Один экземпляр приложения: второй запуск (в т.ч. двойной клик по .bookproj)
// пробрасывает путь в уже открытое окно, а сам закрывается.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', (_event, argv) => {
  const projectPath = extractProjectPath(argv)
  if (projectPath) requestOpenProject(projectPath)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// macOS: открытие файла/папки проекта через Finder.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (filePath.toLowerCase().endsWith(PROJECT_EXTENSION)) requestOpenProject(filePath)
})

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return

  electronApp.setAppUserModelId('com.leditor.app')

  // Прогрев кэша языка для main-строк (меню, диалоги, ошибки).
  void getSettings().catch(() => undefined)

  if (process.platform === 'darwin') {
    // macOS: строка меню обязательна — без неё пропадают стандартные
    // шорткаты (Cmd+C/V/X/A, Cmd+Q). Системные роли ОС локализует сама.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'windowMenu' }
      ])
    )
  } else {
    // Windows/Linux: убираем стандартное меню Electron (по Alt) — у нас своя навигация.
    Menu.setApplicationMenu(null)
  }

  // Разрешаем доступ к системным шрифтам (Local Font Access API).
  const allowedPermissions = new Set<string>(['local-fonts', 'clipboard-read'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  // Проект, переданный в аргументах запуска (ассоциация/командная строка).
  const startupProject = extractProjectPath(process.argv.slice(1))
  if (startupProject) pendingProjectPath = startupProject

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Снапшот текущего проекта перед выходом (если включено в настройках).
let quitHandled = false
app.on('before-quit', (event) => {
  if (quitHandled) return
  event.preventDefault()
  quitHandled = true
  // Сразу отдаём single-instance lock: иначе пока пишется снапшот при закрытии,
  // повторный запуск утыкается в занятый лок и молча закрывается («не запустилось,
  // со второй попытки — норм»). После релиза новый экземпляр стартует штатно.
  app.releaseSingleInstanceLock()
  // Сначала флаш несохранённого в renderer, потом снапшот — иначе снапшот
  // при выходе фотографирует устаревшее (недосохранённое) состояние.
  void flushRendererBeforeExit()
    .then(() => snapshotOnQuitIfNeeded())
    .finally(() => app.quit())
})
