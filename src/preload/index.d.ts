import type { ElectronAPI } from '@electron-toolkit/preload'
import type { AppApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

export {}
