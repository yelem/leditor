/**
 * Pure project domain model.
 *
 * Works only with the tree and manifest in memory — no disk, network or
 * Electron API access. All tree-mutating functions are immutable (return new
 * arrays), which simplifies use in React state and makes persistence predictable.
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

/** Create a new tree node. */
export function createNode(type: NodeType, title: string): TreeNode {
  return { id: randomUUID(), type, title, children: [] }
}

/** Manifest of a new project with the starter structure (part + first chapter). */
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

/** Find a node by id (searching the whole tree). */
export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Collect ids of all document nodes in the tree. */
export function collectDocumentIds(tree: TreeNode[]): string[] {
  const ids: string[] = []
  for (const node of tree) {
    if (node.type === 'document') ids.push(node.id)
    if (node.children.length > 0) ids.push(...collectDocumentIds(node.children))
  }
  return ids
}

/**
 * Insert a node. parentId === null — into the root. index === undefined — at the end.
 * Only folders can receive children.
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

/** Remove a node by id. Returns the new tree and the removed node (or null). */
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

/** Rename a node. */
export function renameNode(tree: TreeNode[], id: string, title: string): TreeNode[] {
  return tree.map((node) => {
    if (node.id === id) return { ...node, title }
    if (node.children.length > 0) {
      return { ...node, children: renameNode(node.children, id, title) }
    }
    return node
  })
}

/** Whether `ancestorId` is an ancestor of (or the same as) `nodeId`. */
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

/** Find the parent (null — root) and the node's index among siblings. */
export function locateNode(
  tree: TreeNode[],
  id: string
): { parentId: string | null; index: number } | null {
  return locate(tree, id, null)
}

/**
 * Move node `id` into `newParentId` (null — root) at position index.
 * Moving a node into itself/its own subtree is forbidden.
 *
 * Index is the desired position in the target list. When moving within the
 * same parent to a later position, the shift after removal is accounted for.
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
 * [originalId, copyId] pairs for document nodes of two structurally identical
 * trees (the original and the duplicateNode result). Used to copy content
 * files when duplicating.
 */
export function pairDocumentIds(original: TreeNode, copy: TreeNode): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  if (original.type === 'document') pairs.push([original.id, copy.id])
  for (let i = 0; i < original.children.length; i++) {
    pairs.push(...pairDocumentIds(original.children[i], copy.children[i]))
  }
  return pairs
}

/** Deep copy of a node with new ids (for duplication). */
export function duplicateNode(node: TreeNode): TreeNode {
  return {
    id: randomUUID(),
    type: node.type,
    title: node.title,
    children: node.children.map(duplicateNode)
  }
}

// --- Trash ---

/**
 * Keep only the top-level ids in the set: drop those that are descendants of
 * other selected nodes (they travel with their ancestor anyway).
 */
function topLevelIds(tree: TreeNode[], ids: string[]): string[] {
  return ids.filter(
    (id) => !ids.some((other) => other !== id && isDescendant(tree, other, id))
  )
}

/**
 * Move nodes (with their subtrees) to trash, remembering their original
 * location. Content/note files are NOT touched — they are needed for
 * restoration and are deleted only when the trash is emptied for good.
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
      // New items go first (newest on top).
      trash.unshift({ node: removed, parentId: loc.parentId, index: loc.index, deletedAt: now })
    }
  }

  return { ...manifest, tree, trash }
}

/**
 * Restore a node from trash to its original place. If the original parent no
 * longer exists (e.g. it is in the trash itself), the node goes to the root.
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
 * Permanently delete a trash item. Returns the updated manifest and the
 * removed subtree (so the caller can erase its document files).
 */
export function removeFromTrash(
  manifest: ProjectManifest,
  id: string
): { manifest: ProjectManifest; removed: TreeNode | null } {
  const item = manifest.trash.find((t) => t.node.id === id)
  const trash = manifest.trash.filter((t) => t.node.id !== id)
  return { manifest: { ...manifest, trash }, removed: item?.node ?? null }
}

/** Empty the whole trash. Returns the removed subtrees (for file erasure). */
export function emptyTrash(manifest: ProjectManifest): {
  manifest: ProjectManifest
  removed: TreeNode[]
} {
  const removed = manifest.trash.map((t) => t.node)
  return { manifest: { ...manifest, trash: [] }, removed }
}

export type { TrashItem }
