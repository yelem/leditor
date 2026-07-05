/**
 * IPC-обработчики операций с проектом и документами.
 *
 * Слой приёма команд: валидирует ввод, вызывает диалоги и сервис хранения,
 * применяет доменную модель. Бизнес-логика и доступ к диску — в services/domain.
 */

import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { basename } from 'node:path'
import {
  type DocumentContent,
  type NodeType,
  type OpenProjectResult,
  type ProjectManifest,
  type ProjectStats,
  type TreeNode,
  PROJECT_EXTENSION,
  createEmptyDocument
} from '@shared/project-types'
import { countDocument } from '@shared/document-text'
import { getSettings } from '../services/settings'
import { IpcChannels, type CreateNodeResult } from '@shared/ipc-contract'
import {
  collectDocumentIds,
  createNewManifest,
  createNode,
  duplicateNode,
  emptyTrash,
  findNode,
  insertNode,
  locateNode,
  moveNode,
  pairDocumentIds,
  removeFromTrash,
  removeNode,
  renameNode,
  restoreFromTrash,
  trashNodes
} from '../domain/project-model'
import {
  createProject,
  deleteDocument,
  deleteNote,
  readDocument,
  readManifest,
  writeDocument,
  writeManifest
} from '../services/storage'
import { withLock } from '../services/lock'
import { tMain } from '../i18n'

/** Гарантирует расширение .bookproj у пути и выводит заголовок проекта. */
function normalizeProjectPath(rawPath: string): { projectPath: string; title: string } {
  const projectPath = rawPath.endsWith(PROJECT_EXTENSION)
    ? rawPath
    : `${rawPath}${PROJECT_EXTENSION}`
  const title = basename(projectPath, PROJECT_EXTENSION)
  return { projectPath, title }
}

export function registerProjectIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IpcChannels.projectCreate, async (): Promise<OpenProjectResult | null> => {
    const win = getWindow()
    const options = {
      title: tMain('main.dlgCreateProject'),
      buttonLabel: tMain('main.dlgCreate'),
      defaultPath: `${app.getPath('documents')}/${tMain('main.dlgDefaultProjectName')}${PROJECT_EXTENSION}`,
      filters: [{ name: tMain('main.dlgProjectFilter'), extensions: ['bookproj'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null

    const { projectPath, title } = normalizeProjectPath(result.filePath)
    const settings = await getSettings()
    const manifest = createNewManifest(title, settings.defaults, {
      chapter: tMain('main.chapter1'),
      part: tMain('main.part1')
    })
    await createProject(projectPath, manifest)
    return { projectPath, manifest }
  })

  ipcMain.handle(IpcChannels.projectOpen, async (): Promise<OpenProjectResult | null> => {
    const win = getWindow()
    const options = {
      title: tMain('main.dlgOpenProject'),
      buttonLabel: tMain('main.dlgOpen'),
      properties: ['openDirectory' as const],
      defaultPath: app.getPath('documents')
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const projectPath = result.filePaths[0]
    const manifest = await readManifest(projectPath)
    return { projectPath, manifest }
  })

  ipcMain.handle(
    IpcChannels.projectOpenPath,
    async (_event, projectPath: string): Promise<OpenProjectResult> => {
      const manifest = await readManifest(projectPath)
      return { projectPath, manifest }
    }
  )

  ipcMain.handle(
    IpcChannels.projectSave,
    async (_event, projectPath: string, manifest: ProjectManifest): Promise<ProjectManifest> => {
      return withLock(projectPath, () => writeManifest(projectPath, manifest))
    }
  )

  ipcMain.handle(
    IpcChannels.projectStats,
    async (_event, projectPath: string): Promise<ProjectStats> => {
      const manifest = await readManifest(projectPath)
      let words = 0
      let chars = 0
      for (const docId of collectDocumentIds(manifest.tree)) {
        const content = await readDocument(projectPath, docId)
        if (!content) continue
        const c = countDocument(content)
        words += c.words
        chars += c.chars
      }
      return { words, chars }
    }
  )

  ipcMain.handle(
    IpcChannels.documentLoad,
    async (_event, projectPath: string, nodeId: string): Promise<DocumentContent | null> => {
      return readDocument(projectPath, nodeId)
    }
  )

  ipcMain.handle(
    IpcChannels.documentSave,
    async (
      _event,
      projectPath: string,
      nodeId: string,
      content: DocumentContent
    ): Promise<void> => {
      await writeDocument(projectPath, nodeId, content)
    }
  )

  // --- Мутации дерева: читаем манифест с диска, применяем доменную функцию,
  // сохраняем, синхронизируем файлы содержимого, возвращаем новый манифест. ---

  ipcMain.handle(
    IpcChannels.treeCreate,
    async (
      _event,
      projectPath: string,
      parentId: string | null,
      type: NodeType,
      title: string
    ): Promise<CreateNodeResult> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const node = createNode(type, title)
        const tree = insertNode(manifest.tree, node, parentId)
        const saved = await writeManifest(projectPath, { ...manifest, tree })
        if (type === 'document') {
          await writeDocument(projectPath, node.id, createEmptyDocument())
        }
        return { manifest: saved, nodeId: node.id }
      })
  )

  ipcMain.handle(
    IpcChannels.treeRename,
    async (_event, projectPath: string, nodeId: string, title: string): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const tree = renameNode(manifest.tree, nodeId, title)
        return writeManifest(projectPath, { ...manifest, tree })
      })
  )

  ipcMain.handle(
    IpcChannels.treeRemove,
    async (_event, projectPath: string, nodeId: string): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const { tree, removed } = removeNode(manifest.tree, nodeId)
        const saved = await writeManifest(projectPath, { ...manifest, tree })
        if (removed) {
          // Удаляем содержимое и заметки всех документов удалённого поддерева.
          for (const docId of collectDocumentIds([removed])) {
            await deleteDocument(projectPath, docId)
            await deleteNote(projectPath, docId)
          }
        }
        return saved
      })
  )

  ipcMain.handle(
    IpcChannels.treeMove,
    async (
      _event,
      projectPath: string,
      nodeId: string,
      newParentId: string | null,
      index: number
    ): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const tree = moveNode(manifest.tree, nodeId, newParentId, index)
        return writeManifest(projectPath, { ...manifest, tree })
      })
  )

  ipcMain.handle(
    IpcChannels.treeDuplicate,
    async (_event, projectPath: string, nodeId: string): Promise<CreateNodeResult> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const original = findNode(manifest.tree, nodeId)
        if (!original) {
          throw new Error(tMain('main.errNodeNotFound'))
        }
        const copy = duplicateNode(original)
        const loc =
          locateNode(manifest.tree, nodeId) ?? { parentId: null, index: manifest.tree.length - 1 }
        const tree = insertNode(manifest.tree, copy, loc.parentId, loc.index + 1)
        const saved = await writeManifest(projectPath, { ...manifest, tree })

        // Копируем содержимое каждого документа из оригинала в копию.
        for (const [fromId, toId] of pairDocumentIds(original, copy)) {
          const content = (await readDocument(projectPath, fromId)) ?? createEmptyDocument()
          await writeDocument(projectPath, toId, content)
        }
        return { manifest: saved, nodeId: copy.id }
      })
  )

  // --- Корзина ---

  // Удалить файлы содержимого и заметок всех документов поддеревьев.
  const eraseSubtrees = async (projectPath: string, roots: TreeNode[]): Promise<void> => {
    for (const docId of collectDocumentIds(roots)) {
      await deleteDocument(projectPath, docId)
      await deleteNote(projectPath, docId)
    }
  }

  ipcMain.handle(
    IpcChannels.trashMove,
    async (_event, projectPath: string, nodeIds: string[]): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        // Файлы НЕ трогаем — они нужны для восстановления.
        return writeManifest(projectPath, trashNodes(manifest, nodeIds))
      })
  )

  ipcMain.handle(
    IpcChannels.trashRestore,
    async (_event, projectPath: string, nodeId: string): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        return writeManifest(projectPath, restoreFromTrash(manifest, nodeId))
      })
  )

  ipcMain.handle(
    IpcChannels.trashDelete,
    async (_event, projectPath: string, nodeId: string): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const { manifest: next, removed } = removeFromTrash(manifest, nodeId)
        const saved = await writeManifest(projectPath, next)
        if (removed) await eraseSubtrees(projectPath, [removed])
        return saved
      })
  )

  ipcMain.handle(
    IpcChannels.trashEmpty,
    async (_event, projectPath: string): Promise<ProjectManifest> =>
      withLock(projectPath, async () => {
        const manifest = await readManifest(projectPath)
        const { manifest: next, removed } = emptyTrash(manifest)
        const saved = await writeManifest(projectPath, next)
        await eraseSubtrees(projectPath, removed)
        return saved
      })
  )
}
