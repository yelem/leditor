/**
 * Чистая доменная модель проекта.
 *
 * Только работа с деревом и манифестом в памяти — никакого обращения к диску,
 * сети или Electron API. Все функции, изменяющие дерево, иммутабельны
 * (возвращают новые массивы), что упрощает использование в React-состоянии
 * и предсказуемое сохранение.
 */

import { randomUUID } from 'node:crypto'
import {
  type NodeType,
  type ProjectManifest,
  type ProjectSettings,
  type TreeNode,
  type TrashItem,
  DEFAULT_PROJECT_SETTINGS,
  SCHEMA_VERSION
} from '@shared/project-types'

/** Создать новый узел дерева. */
export function createNode(type: NodeType, title: string): TreeNode {
  return { id: randomUUID(), type, title, children: [] }
}

/** Манифест нового проекта со стартовой структурой (часть + первая глава). */
export function createNewManifest(
  title: string,
  settings: ProjectSettings = DEFAULT_PROJECT_SETTINGS,
  names: { chapter: string; part: string } = { chapter: 'Chapter 1', part: 'Part 1' }
): ProjectManifest {
  const now = new Date().toISOString()
  const firstChapter = createNode('document', names.chapter)
  const firstPart = createNode('folder', names.part)
  firstPart.children = [firstChapter]

  return {
    schemaVersion: SCHEMA_VERSION,
    title,
    createdAt: now,
    updatedAt: now,
    tree: [firstPart],
    trash: [],
    settings: { ...settings }
  }
}

/** Найти узел по id (с обходом всего дерева). */
export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Собрать id всех узлов-документов в дереве. */
export function collectDocumentIds(tree: TreeNode[]): string[] {
  const ids: string[] = []
  for (const node of tree) {
    if (node.type === 'document') ids.push(node.id)
    if (node.children.length > 0) ids.push(...collectDocumentIds(node.children))
  }
  return ids
}

/**
 * Вставить узел. parentId === null — в корень. index === undefined — в конец.
 * Вставлять можно только внутрь папки.
 */
export function insertNode(
  tree: TreeNode[],
  node: TreeNode,
  parentId: string | null,
  index?: number
): TreeNode[] {
  if (parentId === null) {
    const next = [...tree]
    next.splice(index ?? next.length, 0, node)
    return next
  }

  return tree.map((current) => {
    if (current.id === parentId) {
      if (current.type !== 'folder') {
        throw new Error('Child nodes can only be added to a folder')
      }
      const children = [...current.children]
      children.splice(index ?? children.length, 0, node)
      return { ...current, children }
    }
    if (current.children.length > 0) {
      return { ...current, children: insertNode(current.children, node, parentId, index) }
    }
    return current
  })
}

/** Удалить узел по id. Возвращает новое дерево и удалённый узел (или null). */
export function removeNode(
  tree: TreeNode[],
  id: string
): { tree: TreeNode[]; removed: TreeNode | null } {
  let removed: TreeNode | null = null

  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = []
    for (const node of nodes) {
      if (node.id === id) {
        removed = node
        continue
      }
      result.push(
        node.children.length > 0 ? { ...node, children: filterTree(node.children) } : node
      )
    }
    return result
  }

  const next = filterTree(tree)
  return { tree: next, removed }
}

/** Переименовать узел. */
export function renameNode(tree: TreeNode[], id: string, title: string): TreeNode[] {
  return tree.map((node) => {
    if (node.id === id) return { ...node, title }
    if (node.children.length > 0) {
      return { ...node, children: renameNode(node.children, id, title) }
    }
    return node
  })
}

/** Является ли `ancestorId` предком (или самим) узла `nodeId`. */
export function isDescendant(tree: TreeNode[], ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(tree, ancestorId)
  if (!ancestor) return false
  if (ancestorId === nodeId) return true
  return findNode(ancestor.children, nodeId) !== null
}

function locate(
  nodes: TreeNode[],
  id: string,
  parentId: string | null
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parentId, index: i }
    const found = locate(nodes[i].children, id, nodes[i].id)
    if (found) return found
  }
  return null
}

/** Найти родителя (null — корень) и индекс узла среди соседей. */
export function locateNode(
  tree: TreeNode[],
  id: string
): { parentId: string | null; index: number } | null {
  return locate(tree, id, null)
}

/**
 * Переместить узел `id` внутрь `newParentId` (null — корень) на позицию index.
 * Запрещает перемещение узла внутрь самого себя/своего поддерева.
 *
 * Index трактуется как желаемая позиция в целевом списке. При перемещении внутри
 * того же родителя на более позднюю позицию учитывается сдвиг после удаления.
 */
export function moveNode(
  tree: TreeNode[],
  id: string,
  newParentId: string | null,
  index?: number
): TreeNode[] {
  if (newParentId !== null && isDescendant(tree, id, newParentId)) {
    throw new Error('Cannot move a node into itself')
  }

  let target = index
  if (target !== undefined) {
    const loc = locateNode(tree, id)
    if (loc && loc.parentId === newParentId && loc.index < target) {
      target = target - 1
    }
  }

  const { tree: without, removed } = removeNode(tree, id)
  if (!removed) return tree
  return insertNode(without, removed, newParentId, target)
}

/**
 * Пары [idОригинала, idКопии] для узлов-документов двух структурно одинаковых
 * деревьев (оригинал и результат duplicateNode). Нужны для копирования файлов
 * содержимого при дублировании.
 */
export function pairDocumentIds(original: TreeNode, copy: TreeNode): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  if (original.type === 'document') pairs.push([original.id, copy.id])
  for (let i = 0; i < original.children.length; i++) {
    pairs.push(...pairDocumentIds(original.children[i], copy.children[i]))
  }
  return pairs
}

/** Глубокая копия узла с новыми id (для дублирования). */
export function duplicateNode(node: TreeNode): TreeNode {
  return {
    id: randomUUID(),
    type: node.type,
    title: node.title,
    children: node.children.map(duplicateNode)
  }
}

// --- Корзина ---

/**
 * Оставить из набора id только «верхнеуровневые»: убрать те, что являются
 * потомками других выбранных узлов (они и так уедут вместе с предком).
 */
function topLevelIds(tree: TreeNode[], ids: string[]): string[] {
  return ids.filter(
    (id) => !ids.some((other) => other !== id && isDescendant(tree, other, id))
  )
}

/**
 * Переместить узлы (вместе с поддеревьями) в корзину, запомнив их исходное
 * расположение. Файлы содержимого/заметок НЕ трогаются — они нужны для
 * восстановления; удаляются лишь при окончательной очистке корзины.
 */
export function trashNodes(manifest: ProjectManifest, ids: string[]): ProjectManifest {
  const now = new Date().toISOString()
  let tree = manifest.tree
  const trash = [...manifest.trash]

  for (const id of topLevelIds(tree, ids)) {
    const loc = locateNode(tree, id)
    const { tree: next, removed } = removeNode(tree, id)
    if (removed && loc) {
      tree = next
      // Новые элементы — в начало (свежие сверху).
      trash.unshift({ node: removed, parentId: loc.parentId, index: loc.index, deletedAt: now })
    }
  }

  return { ...manifest, tree, trash }
}

/**
 * Восстановить узел из корзины на исходное место. Если исходный родитель уже
 * не существует (например, сам в корзине), узел возвращается в корень.
 */
export function restoreFromTrash(manifest: ProjectManifest, id: string): ProjectManifest {
  const item = manifest.trash.find((t) => t.node.id === id)
  if (!item) return manifest
  const trash = manifest.trash.filter((t) => t.node.id !== id)
  const parentExists = item.parentId !== null && findNode(manifest.tree, item.parentId) !== null
  const parentId = parentExists ? item.parentId : null
  const tree = insertNode(manifest.tree, item.node, parentId, item.index)
  return { ...manifest, tree, trash }
}

/**
 * Окончательно удалить элемент из корзины. Возвращает обновлённый манифест и
 * удалённое поддерево (чтобы вызывающий код стёр файлы его документов).
 */
export function removeFromTrash(
  manifest: ProjectManifest,
  id: string
): { manifest: ProjectManifest; removed: TreeNode | null } {
  const item = manifest.trash.find((t) => t.node.id === id)
  const trash = manifest.trash.filter((t) => t.node.id !== id)
  return { manifest: { ...manifest, trash }, removed: item?.node ?? null }
}

/** Очистить корзину целиком. Возвращает удалённые поддеревья (для стирания файлов). */
export function emptyTrash(manifest: ProjectManifest): {
  manifest: ProjectManifest
  removed: TreeNode[]
} {
  const removed = manifest.trash.map((t) => t.node)
  return { manifest: { ...manifest, trash: [] }, removed }
}

export type { TrashItem }
