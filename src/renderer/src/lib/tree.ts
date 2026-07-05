import type { TreeNode } from '@shared/project-types'

/**
 * Lightweight read-only tree traversals for the renderer.
 * Tree mutations happen in main (domain layer) and arrive as a ready manifest.
 */

/** Find a node by id. */
export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Node title by id (or null). */
export function findNodeTitle(tree: TreeNode[], id: string): string | null {
  return findNode(tree, id)?.title ?? null
}

export interface TreeIndex {
  /** Parent id (null — root) for every node. */
  parentOf: Map<string, string | null>
  /** Node index among its siblings. */
  indexOf: Map<string, number>
  /** The node itself by id. */
  nodeOf: Map<string, TreeNode>
}

/** Build tree indexes for fast lookups during DnD/context menus. */
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

/** Collect all tree documents as {id, title} in traversal order. */
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

/** Whether `nodeId` is a descendant of (or the same as) `ancestorId`. */
export function isDescendant(tree: TreeNode[], ancestorId: string, nodeId: string): boolean {
  if (ancestorId === nodeId) return true
  const ancestor = findNode(tree, ancestorId)
  return ancestor ? findNode(ancestor.children, nodeId) !== null : false
}
