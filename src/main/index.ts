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
// Project path to open as soon as the renderer is ready.
let pendingProjectPath: string | null = null

// --- Flushing the renderer before close/quit --------------------------------
// Autosave in the renderer is debounced. Before closing the window and before
// the on-quit snapshot we ask the renderer to write unsaved changes immediately
// and wait for confirmation (appCloseReady) — otherwise the last edits are lost.

let rendererFlushed = false
let flushWaiters: Array<() => void> = []

function resolveRendererFlush(): void {
  rendererFlushed = true
  const waiters = flushWaiters
  flushWaiters = []
  for (const resolve of waiters) resolve()
}

/**
 * Ask the renderer to flush unsaved changes and wait for confirmation.
 * Timeout safety net: a hung/unresponsive renderer must not block closing.
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

/** Find a *.bookproj folder path among command-line arguments. */
function extractProjectPath(argv: string[]): string | null {
  for (const arg of argv) {
    if (typeof arg !== 'string' || !arg.toLowerCase().endsWith(PROJECT_EXTENSION)) continue
    try {
      if (statSync(arg).isDirectory()) return arg
    } catch {
      /* nonexistent path — skip */
    }
  }
  return null
}

/** Pass an open-project request to the renderer (or defer until the window is ready). */
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
    // Windows needs a multi-size .ico (16/24/32/48…): the title-bar icon
    // is taken from the matching size without scaling.
    icon: join(
      __dirname,
      '../../resources',
      process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    ),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Architectural principle: the renderer is isolated from Node and the network.
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  rendererFlushed = false

  // Before the window closes — flush unsaved changes in the renderer, then close.
  let flushedBeforeClose = false
  win.on('close', (event) => {
    if (flushedBeforeClose) return
    event.preventDefault()
    void flushRendererBeforeExit().then(() => {
      flushedBeforeClose = true
      // destroy() closes the window without emitting another close event.
      if (!win.isDestroyed()) win.destroy()
    })
  })

  // Spell checking (Russian + English when available).
  try {
    const available = win.webContents.session.availableSpellCheckerLanguages
    const wanted = ['ru', 'en-US'].filter((l) => available.includes(l))
    if (wanted.length > 0) win.webContents.session.setSpellCheckerLanguages(wanted)
  } catch {
    /* spell checker unavailable — not critical */
  }

  // Context menu in editable fields: AI actions (in the editor),
  // spelling suggestions, add-to-dictionary, clipboard editing.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const menu = new Menu()

    // AI actions apply to the prose editor (contenteditable), not textarea/input.
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

  // Once the renderer is ready — send the deferred open-project request.
  win.webContents.on('did-finish-load', () => {
    if (pendingProjectPath) {
      win.webContents.send(IpcChannels.appOpenProject, pendingProjectPath)
      pendingProjectPath = null
    }
  })

  // External links open in the system browser, not inside the window.
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

/** Register all main-process IPC handlers. */
function registerIpcHandlers(): void {
  // Renderer → main health check.
  ipcMain.handle(IpcChannels.ping, () => 'pong')

  // The renderer wrote its unsaved changes — closing/quitting may continue.
  ipcMain.handle(IpcChannels.appCloseReady, () => {
    resolveRendererFlush()
  })

  // Custom spelling dictionary.
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

  // Project and documents.
  registerProjectIpc(() => mainWindow)

  // Global settings.
  registerSettingsIpc()

  // Backups.
  registerBackupIpc()

  // Native dialogs (folder picker, etc.).
  registerDialogIpc(() => mainWindow)

  // AI providers.
  registerAiIpc()

  // Workspace data: chat, chapter summaries.
  registerWorkspaceIpc()

  // Project export (Word/FB2/EPUB).
  registerExportIpc()
}

// Single application instance: a second launch (incl. double-clicking a
// .bookproj) forwards its path to the existing window and exits.
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

// macOS: opening a project file/folder from Finder.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (filePath.toLowerCase().endsWith(PROJECT_EXTENSION)) requestOpenProject(filePath)
})

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return

  electronApp.setAppUserModelId('com.leditor.app')

  // Warm up the language cache for main-process strings (menus, dialogs, errors).
  void getSettings().catch(() => undefined)

  if (process.platform === 'darwin') {
    // macOS: the menu bar is mandatory — without it the standard shortcuts
    // (Cmd+C/V/X/A, Cmd+Q) stop working. The OS localizes system roles itself.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'windowMenu' }
      ])
    )
  } else {
    // Windows/Linux: remove the default Electron menu (Alt) — the app has its own navigation.
    Menu.setApplicationMenu(null)
  }

  // Allow access to system fonts (Local Font Access API).
  const allowedPermissions = new Set<string>(['local-fonts', 'clipboard-read'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  // Project passed via launch arguments (association/command line).
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

// Snapshot of the current project before quitting (if enabled in settings).
let quitHandled = false
app.on('before-quit', (event) => {
  if (quitHandled) return
  event.preventDefault()
  quitHandled = true
  // Release the single-instance lock right away: while the on-close snapshot
  // is being written, a relaunch must not hit the held lock and silently exit.
  app.releaseSingleInstanceLock()
  // First flush unsaved changes in the renderer, then snapshot — otherwise
  // the on-quit snapshot captures stale (not-yet-saved) state.
  void flushRendererBeforeExit()
    .then(() => snapshotOnQuitIfNeeded())
    .finally(() => app.quit())
})
