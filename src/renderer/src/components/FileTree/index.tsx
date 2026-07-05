import { useEffect, useMemo, useRef, useState } from 'react'
import type { NodeType, TreeNode } from '@shared/project-types'
import { useProject } from '@renderer/store'
import { indexTree, isDescendant } from '@renderer/lib/tree'
import { ConfirmDialog } from '@renderer/components/common/ConfirmDialog'
import { useT } from '@renderer/lib/i18n'
import './file-tree.css'

type DropPos = 'before' | 'inside' | 'after'
type PermanentTarget = { type: 'one'; id: string; title: string } | { type: 'all' }

export function FileTree(): JSX.Element {
  const t = useT()
  const {
    manifest,
    activeDocId,
    selectDocument,
    createTreeNode,
    renameTreeNode,
    trashNodes,
    restoreFromTrash,
    deleteFromTrash,
    emptyTrash,
    moveTreeNode,
    duplicateTreeNode,
    showCombined
  } = useProject()

  const tree = manifest?.tree ?? []
  const trash = manifest?.trash ?? []
  const idx = useMemo(() => indexTree(tree), [tree])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPos } | null>(null)
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [confirmPermanent, setConfirmPermanent] = useState<PermanentTarget | null>(null)
  // Мультивыделение: набор выбранных узлов + «якорь» для диапазона Shift-клика.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Плоский порядок видимых (не свёрнутых) узлов — для диапазонного выделения.
  const visibleOrder = useMemo(() => {
    const out: string[] = []
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        out.push(n.id)
        if (n.type === 'folder' && !collapsed.has(n.id) && n.children.length > 0) walk(n.children)
      }
    }
    walk(tree)
    return out
  }, [tree, collapsed])

  // Фокус и выделение текста при входе в режим переименования.
  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingId])

  // Выделение следует за открытым документом (восстановление, переключение).
  useEffect(() => {
    if (activeDocId) {
      setSelectedIds(new Set([activeDocId]))
      setAnchorId(activeDocId)
    }
  }, [activeDocId])

  // Закрытие контекстного меню по клику вне его / Escape.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const toggleCollapse = (id: string): void =>
    setCollapsed((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const expand = (id: string): void =>
    setCollapsed((s) => {
      if (!s.has(id)) return s
      const next = new Set(s)
      next.delete(id)
      return next
    })

  // --- Выделение ---
  const selectOnly = (id: string): void => {
    setSelectedIds(new Set([id]))
    setAnchorId(id)
  }
  const toggleSelect = (id: string): void => {
    setSelectedIds((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setAnchorId(id)
  }
  const selectRange = (id: string): void => {
    if (!anchorId) {
      selectOnly(id)
      return
    }
    const a = visibleOrder.indexOf(anchorId)
    const b = visibleOrder.indexOf(id)
    if (a === -1 || b === -1) {
      selectOnly(id)
      return
    }
    const [lo, hi] = a < b ? [a, b] : [b, a]
    setSelectedIds(new Set(visibleOrder.slice(lo, hi + 1)))
  }

  // --- Переименование ---
  const beginRename = (node: TreeNode): void => {
    setMenu(null)
    setEditingId(node.id)
    setEditValue(node.title)
  }
  const submitRename = (): void => {
    if (editingId) {
      const node = idx.nodeOf.get(editingId)
      const value = editValue.trim()
      if (node && value && value !== node.title) void renameTreeNode(editingId, value)
    }
    setEditingId(null)
  }
  const cancelRename = (): void => setEditingId(null)

  // --- Создание / удаление / дублирование ---
  const handleCreate = async (parentId: string | null, type: NodeType): Promise<void> => {
    setMenu(null)
    if (parentId) expand(parentId)
    const newId = await createTreeNode(parentId, type)
    if (newId) {
      setEditingId(newId)
      setEditValue(type === 'folder' ? t('tree.newFolder') : t('tree.newDocument'))
    }
  }
  // Удаление учитывает мультивыделение: если узел входит в выделение из >1 — удаляем все.
  const requestDelete = (nodeId: string): void => {
    setMenu(null)
    const targets = selectedIds.has(nodeId) && selectedIds.size > 1 ? [...selectedIds] : [nodeId]
    setConfirmIds(targets)
  }
  const handleDuplicate = (node: TreeNode): void => {
    setMenu(null)
    void duplicateTreeNode(node.id)
  }

  const handleRowClick = (node: TreeNode, e: React.MouseEvent): void => {
    bodyRef.current?.focus()
    if (e.shiftKey) {
      selectRange(node.id)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(node.id)
      return
    }
    selectOnly(node.id)
    // Папки сворачиваются только по значку ▸/▾ (см. tree__twisty), не по всей строке.
    if (node.type === 'document') selectDocument(node.id)
  }

  // Горячие клавиши дерева (когда панель в фокусе).
  const onTreeKeyDown = (e: React.KeyboardEvent): void => {
    if (!manifest) return
    const primaryId = anchorId ?? [...selectedIds][0] ?? null
    const sel = primaryId ? idx.nodeOf.get(primaryId) : null

    if (e.key === 'F2' && sel) {
      e.preventDefault()
      beginRename(sel)
    } else if (e.key === 'Delete' && selectedIds.size > 0) {
      e.preventDefault()
      setConfirmIds([...selectedIds])
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') {
      // e.code, а не e.key — независимо от раскладки клавиатуры (рус/eng).
      e.preventDefault()
      const type: NodeType = e.shiftKey ? 'folder' : 'document'
      let parentId: string | null = null
      if (sel) parentId = sel.type === 'folder' ? sel.id : (idx.parentOf.get(sel.id) ?? null)
      void handleCreate(parentId, type)
    }
  }

  // --- Drag & Drop (одиночный узел) ---
  const clearDrag = (): void => {
    setDragId(null)
    setDropTarget(null)
  }
  const onDragStart = (e: React.DragEvent, node: TreeNode): void => {
    if (!selectedIds.has(node.id)) selectOnly(node.id)
    setDragId(node.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
  }
  const onDragOver = (e: React.DragEvent, node: TreeNode): void => {
    if (!dragId || dragId === node.id) return
    if (isDescendant(tree, dragId, node.id)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    let pos: DropPos
    if (node.type === 'folder') {
      pos = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside'
    } else {
      pos = ratio < 0.5 ? 'before' : 'after'
    }
    setDropTarget({ id: node.id, pos })
  }
  const onRowDrop = (e: React.DragEvent, node: TreeNode): void => {
    e.preventDefault()
    e.stopPropagation()
    const dt = dropTarget
    const draggedId = dragId
    clearDrag()
    if (!draggedId || !dt || draggedId === node.id) return
    if (isDescendant(tree, draggedId, node.id)) return

    let parentId: string | null
    let index: number
    if (dt.pos === 'inside') {
      parentId = node.id
      index = node.children.length
      expand(node.id)
    } else {
      parentId = idx.parentOf.get(node.id) ?? null
      const targetIndex = idx.indexOf.get(node.id) ?? 0
      index = dt.pos === 'before' ? targetIndex : targetIndex + 1
    }
    void moveTreeNode(draggedId, parentId, index)
  }
  // Сброс на пустую область панели — в конец корня.
  const onRootDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const draggedId = dragId
    clearDrag()
    if (draggedId) void moveTreeNode(draggedId, null, tree.length)
  }

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const isFolder = node.type === 'folder'
    const isCollapsed = collapsed.has(node.id)
    const isEditing = editingId === node.id
    const isActive = node.id === activeDocId
    const isSelected = selectedIds.has(node.id)
    const drop = dropTarget && dropTarget.id === node.id ? dropTarget.pos : null

    const rowClass = [
      'tree__row',
      `tree__row--${node.type}`,
      isSelected ? 'is-selected' : '',
      isActive && !isSelected ? 'is-open' : '',
      dragId === node.id ? 'is-dragging' : '',
      drop ? `is-drop-${drop}` : ''
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <li className="tree__item" key={node.id}>
        <div
          className={rowClass}
          style={{ paddingLeft: 6 + depth * 15 }}
          draggable={!isEditing}
          onClick={(e) => !isEditing && handleRowClick(node, e)}
          onDoubleClick={() => beginRename(node)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!selectedIds.has(node.id)) selectOnly(node.id)
            setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
          }}
          onDragStart={(e) => onDragStart(e, node)}
          onDragOver={(e) => onDragOver(e, node)}
          onDrop={(e) => onRowDrop(e, node)}
          onDragEnd={clearDrag}
        >
          <span className="tree__twisty" onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id) }}>
            {isFolder ? (isCollapsed ? '▸' : '▾') : ''}
          </span>
          <span className="tree__icon">{isFolder ? '📁' : '📄'}</span>
          {isEditing ? (
            <input
              ref={inputRef}
              className="tree__input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                else if (e.key === 'Escape') cancelRename()
              }}
              onBlur={submitRename}
            />
          ) : (
            <span className="tree__label">{node.title}</span>
          )}
        </div>
        {isFolder && !isCollapsed && node.children.length > 0 && (
          <ul className="tree__children">{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    )
  }

  const menuNode = menu ? idx.nodeOf.get(menu.nodeId) : null
  const deleteCount = menu && selectedIds.has(menu.nodeId) ? selectedIds.size : 1
  const confirmTitle =
    confirmIds && confirmIds.length === 1 ? idx.nodeOf.get(confirmIds[0])?.title ?? '' : ''

  return (
    <div className="tree">
      <div className="panel__header">
        <span className="panel__title">{t('tree.panelTitle')}</span>
        {manifest && (
          <div className="tree__actions">
            <button
              type="button"
              className="panel__action"
              title={t('tree.newDocRoot')}
              onClick={() => handleCreate(null, 'document')}
            >
              <IconFilePlus />
            </button>
            <button
              type="button"
              className="panel__action"
              title={t('tree.newFolderRoot')}
              onClick={() => handleCreate(null, 'folder')}
            >
              <IconFolderPlus />
            </button>
          </div>
        )}
      </div>

      {manifest ? (
        <div
          className="tree__body"
          ref={bodyRef}
          tabIndex={0}
          onKeyDown={onTreeKeyDown}
          onDragOver={(e) => {
            if (dragId) e.preventDefault()
          }}
          onDrop={onRootDrop}
        >
          {tree.length > 0 ? (
            <ul className="tree__root">{tree.map((node) => renderNode(node, 0))}</ul>
          ) : (
            <div className="tree__empty">{t('tree.empty')}</div>
          )}
        </div>
      ) : (
        <div className="tree__empty">{t('tree.notOpen')}</div>
      )}

      {/* Корзина: удалённые узлы, доступные для восстановления. */}
      {manifest && (
        <div className="trash">
          <button
            type="button"
            className="trash__header"
            onClick={() => setTrashOpen((o) => !o)}
          >
            <span className="trash__twisty">{trashOpen ? '▾' : '▸'}</span>
            <span className="trash__icon">🗑</span>
            <span className="trash__title">{t('tree.trash')}</span>
            {trash.length > 0 && <span className="trash__count">{trash.length}</span>}
          </button>
          {trashOpen && (
            <div className="trash__body">
              {trash.length === 0 ? (
                <div className="trash__empty">{t('tree.trashEmpty')}</div>
              ) : (
                <>
                  <ul className="trash__list">
                    {trash.map((item) => (
                      <li className="trash__item" key={item.node.id}>
                        <span className="tree__icon">{item.node.type === 'folder' ? '📁' : '📄'}</span>
                        <span className="trash__label" title={item.node.title}>
                          {item.node.title}
                        </span>
                        <button
                          type="button"
                          className="trash__act"
                          title={t('tree.restore')}
                          onClick={() => void restoreFromTrash(item.node.id)}
                        >
                          ↩
                        </button>
                        <button
                          type="button"
                          className="trash__act trash__act--danger"
                          title={t('tree.deleteForever')}
                          onClick={() =>
                            setConfirmPermanent({ type: 'one', id: item.node.id, title: item.node.title })
                          }
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="trash__clear"
                    onClick={() => setConfirmPermanent({ type: 'all' })}
                  >
                    {t('tree.emptyTrash')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {menu && menuNode && (
        <ul
          className="ctx"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuNode.type === 'folder' && deleteCount === 1 && (
            <>
              <li className="ctx__item" onClick={() => handleCreate(menuNode.id, 'document')}>
                {t('tree.newDocument')}
              </li>
              <li className="ctx__item" onClick={() => handleCreate(menuNode.id, 'folder')}>
                {t('tree.newFolder')}
              </li>
              <li
                className="ctx__item"
                onClick={() => {
                  setMenu(null)
                  showCombined({ type: 'folder', id: menuNode.id })
                }}
              >
                {t('tree.showCombined')}
              </li>
              <li className="ctx__sep" />
            </>
          )}
          {deleteCount === 1 && (
            <>
              <li className="ctx__item" onClick={() => beginRename(menuNode)}>
                {t('tree.rename')}
              </li>
              <li className="ctx__item" onClick={() => handleDuplicate(menuNode)}>
                {t('tree.duplicate')}
              </li>
              <li className="ctx__sep" />
            </>
          )}
          <li className="ctx__item ctx__item--danger" onClick={() => requestDelete(menuNode.id)}>
            {deleteCount > 1 ? t('tree.deleteN', { n: deleteCount }) : t('tree.delete')}
          </li>
        </ul>
      )}

      {confirmIds && (
        <ConfirmDialog
          title={t('tree.deleteTitle')}
          message={
            confirmIds.length === 1
              ? t('tree.moveToTrashOne', { title: confirmTitle })
              : t('tree.moveToTrashMany', { n: confirmIds.length })
          }
          confirmLabel={t('tree.toTrash')}
          danger
          onConfirm={() => {
            void trashNodes(confirmIds)
            setSelectedIds(new Set())
            setAnchorId(null)
            setConfirmIds(null)
          }}
          onCancel={() => setConfirmIds(null)}
        />
      )}

      {confirmPermanent && (
        <ConfirmDialog
          title={t('tree.deleteForever')}
          message={
            confirmPermanent.type === 'all'
              ? t('tree.emptyTrashConfirm')
              : t('tree.deleteForeverConfirm', { title: confirmPermanent.title })
          }
          confirmLabel={t('tree.deleteForever')}
          danger
          onConfirm={() => {
            if (confirmPermanent.type === 'all') void emptyTrash()
            else void deleteFromTrash(confirmPermanent.id)
            setConfirmPermanent(null)
          }}
          onCancel={() => setConfirmPermanent(null)}
        />
      )}
    </div>
  )
}

const iconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

function IconFilePlus(): JSX.Element {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </svg>
  )
}

function IconFolderPlus(): JSX.Element {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  )
}
