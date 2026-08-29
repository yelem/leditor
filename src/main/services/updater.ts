/**
 * Auto-update via electron-updater (GitHub Releases, configured in
 * electron-builder.yml). Disabled outside packaged builds — electron-updater
 * needs a real app-update.yml produced by electron-builder at build time.
 */

import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IpcChannels } from '@shared/ipc-contract'
import type { UpdateStatus } from '@shared/update-types'
import { tMain } from '../i18n'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

let getWindow: () => BrowserWindow | null = () => null
let checking = false
// Interactive checks (button click) show "no update"/error dialogs;
// silent startup checks only surface something when there IS an update.
let interactive = false

function broadcast(status: UpdateStatus): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.updateStatus, status)
}

function promptInstall(version: string): void {
  const win = getWindow()
  const options = {
    type: 'info' as const,
    buttons: [tMain('update.restartNow'), tMain('update.later')],
    defaultId: 0,
    cancelId: 1,
    title: tMain('update.readyTitle'),
    message: tMain('update.readyMessage', { version })
  }
  const promise = win
    ? dialog.showMessageBox(win, options)
    : dialog.showMessageBox(options)
  void promise.then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  })
}

/** Wire autoUpdater events once. Call before the first check. */
export function initUpdater(getMainWindow: () => BrowserWindow | null): void {
  getWindow = getMainWindow

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    broadcast({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast({ state: 'not-available' })
    checking = false
    if (interactive) {
      const win = getWindow()
      const options = {
        type: 'info' as const,
        title: tMain('update.upToDateTitle'),
        message: tMain('update.upToDateMessage')
      }
      void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    checking = false
    broadcast({ state: 'downloaded', version: info.version })
    promptInstall(info.version)
  })

  autoUpdater.on('error', (err) => {
    checking = false
    broadcast({ state: 'error', message: err.message })
    if (interactive) {
      const win = getWindow()
      const options = {
        type: 'error' as const,
        title: tMain('update.errorTitle'),
        message: err.message
      }
      void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
    }
  })
}

/**
 * Trigger a check. `isInteractive` — the user pressed "Check now": report
 * "up to date" / errors via a dialog. A silent startup check stays quiet
 * unless an update is actually found.
 */
export function checkForUpdates(isInteractive: boolean): void {
  if (!app.isPackaged || checking) return
  checking = true
  interactive = isInteractive
  autoUpdater.checkForUpdates().catch(() => {
    checking = false
  })
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
