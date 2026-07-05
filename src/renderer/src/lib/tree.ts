import type { TreeNode } from '@shared/project-types'

/**
 * Лёгкие read-only обходы дерева для renderer.
 * Мутации дерева делаются в main (доменный слой) и приходят готовым манифестом.
 */

/** Найти узел по id. */
export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Заголовок узла по id (или null). */
export function findNodeTitle(tree: TreeNode[], id: string): string | null {
  return findNode(tree, id)?.title ?? null
}

export interface TreeIndex {
  /** id родителя (null — корень) для каждого узла. */
  parentOf: Map<string, string | null>
  /** индекс узла среди соседей. */
  indexOf: Map<string, number>
  /** сам узел по id. */
  nodeOf: Map<string, TreeNode>
}

/** Построить индексы дерева для быстрых вычислений при DnD/контекстном меню. */
export function indexTree(tree: TreeNode[]): TreeIndex {
  const parentOf = new Map<string, string | null>()
  const indexOf = new Map<string, number>()
  const nodeOf = new Map<string, TreeNode>()

  const walk = (nodes: TreeNode[], parentId: string | null): void => {
    nodes.forEach((node, i) => {
      parentOf.set(node.id, parentId)
      indexOf.set(node.id, i)
      nodeOf.set(node.id, node)
      walk(node.children, node.id)
    })
  }
  walk(tree, null)

  return { parentOf, indexOf, nodeOf }
}

/** Собрать все документы дерева как {id, title} в порядке обхода. */
export function collectDocuments(tree: TreeNode[]): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = []
  const walk = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'document') out.push({ id: n.id, title: n.title })
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(tree)
  return out
}

/** Является ли `nodeId` потомком (или самим) `ancestorId`. */
export function isDescendant(tree: TreeNode[], ancestorId: string, nodeId: string): boolean {
  if (ancestorId === nodeId) return true
  const ancestor = findNode(tree, ancestorId)
  return ancestor ? findNode(ancestor.children, nodeId) !== null : false
}
