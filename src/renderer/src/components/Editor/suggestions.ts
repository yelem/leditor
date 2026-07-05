import type { Editor } from '@tiptap/react'

/** Одна предложенная правка (для панели обзора). */
export interface SuggestionItem {
  sid: string
  original: string
  suggestion: string
  reason: string
}

let counter = 0
export function newSid(): string {
  counter += 1
  return `sg-${Date.now()}-${counter}`
}

interface Range {
  from: number
  to: number
}

/**
 * Привести один символ к каноничному виду для нечёткого сопоставления правок:
 * типографские кавычки/тире/пробелы — к простым. Преобразование 1:1 (длина не
 * меняется), поэтому позиции в нормализованной строке совпадают с исходными.
 */
export function normalizeChar(ch: string): string {
  if ('«»„“”‹›"˝'.includes(ch)) return '"'
  if ("‘’‚'´`".includes(ch)) return "'"
  if ('—–−‑-'.includes(ch)) return '-'
  if (/\s/.test(ch)) return ' '
  return ch
}

/**
 * Нормализовать фрагмент-«иголку» от модели: сначала схлопнуть «...» в «…»
 * (в тексте многоточие — один символ из-за типографики), затем посимвольно.
 */
export function normalizeFragment(s: string): string {
  return Array.from(s.replace(/\.{3}/g, '…')).map(normalizeChar).join('')
}

/** Карта «позиция в документе → символ» для текстовых узлов диапазона [from,to]. */
export function buildCharMap(editor: Editor, from: number, to: number): Array<{ pos: number; ch: string }> {
  const map: Array<{ pos: number; ch: string }> = []
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && typeof node.text === 'string') {
      const start = Math.max(pos, from)
      const end = Math.min(pos + node.nodeSize, to)
      for (let p = start; p < end; p++) {
        const ch = node.text[p - pos]
        if (ch !== undefined) map.push({ pos: p, ch })
      }
    }
  })
  return map
}

/**
 * Заменить диапазон [from,to] предложенной правкой: исходный текст помечается
 * как удаление, новый текст — как вставка. Обе части несут sid.
 */
export function applyReplaceSuggestion(
  editor: Editor,
  from: number,
  to: number,
  original: string,
  suggestion: string,
  sid: string
): void {
  editor
    .chain()
    .command(({ tr, state }) => {
      const del = state.schema.marks.deletion.create({ sid })
      const ins = state.schema.marks.insertion.create({ sid })
      tr.delete(from, to)
      let pos = from
      if (original.length > 0) {
        tr.insertText(original, pos)
        tr.addMark(pos, pos + original.length, del)
        pos += original.length
      }
      if (suggestion.length > 0) {
        tr.insertText(suggestion, pos)
        tr.addMark(pos, pos + suggestion.length, ins)
        pos += suggestion.length
      }
      return true
    })
    .run()
}

function findMarkRanges(editor: Editor, markName: string, sid: string): Range[] {
  const ranges: Range[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const has = node.marks.some((m) => m.type.name === markName && m.attrs.sid === sid)
    if (has) ranges.push({ from: pos, to: pos + node.nodeSize })
  })
  return ranges
}

/** Прокрутить редактор к правке и выделить её. */
export function scrollToSuggestion(editor: Editor, sid: string): void {
  const ranges = [...findMarkRanges(editor, 'deletion', sid), ...findMarkRanges(editor, 'insertion', sid)]
  if (ranges.length === 0) return
  const from = Math.min(...ranges.map((r) => r.from))
  const to = Math.max(...ranges.map((r) => r.to))
  editor.chain().setTextSelection({ from, to }).run()
}

/** Принять правку: удалить «удаления», снять метку со «вставок» (оставить текст). */
export function acceptSuggestion(editor: Editor, sid: string): void {
  editor
    .chain()
    .command(({ tr, state }) => {
      for (const r of findMarkRanges(editor, 'insertion', sid)) {
        tr.removeMark(r.from, r.to, state.schema.marks.insertion)
      }
      const dels = findMarkRanges(editor, 'deletion', sid).sort((a, b) => b.from - a.from)
      for (const r of dels) tr.delete(r.from, r.to)
      return true
    })
    .run()
}

/** Собрать список предложенных правок из документа (по маркам). */
export function collectSuggestions(editor: Editor, reasons: Map<string, string>): SuggestionItem[] {
  const del = new Map<string, string>()
  const ins = new Map<string, string>()
  const order: string[] = []
  const seen = new Set<string>()

  editor.state.doc.descendants((node) => {
    if (!node.isText || typeof node.text !== 'string') return
    for (const m of node.marks) {
      const sid = m.attrs.sid as string | null
      if (!sid) continue
      if (!seen.has(sid)) {
        seen.add(sid)
        order.push(sid)
      }
      if (m.type.name === 'deletion') del.set(sid, (del.get(sid) ?? '') + node.text)
      if (m.type.name === 'insertion') ins.set(sid, (ins.get(sid) ?? '') + node.text)
    }
  })

  return order.map((sid) => ({
    sid,
    original: del.get(sid) ?? '',
    suggestion: ins.get(sid) ?? '',
    reason: reasons.get(sid) ?? ''
  }))
}

/** Отклонить правку: удалить «вставки», снять метку с «удалений» (восстановить). */
export function rejectSuggestion(editor: Editor, sid: string): void {
  editor
    .chain()
    .command(({ tr, state }) => {
      for (const r of findMarkRanges(editor, 'deletion', sid)) {
        tr.removeMark(r.from, r.to, state.schema.marks.deletion)
      }
      const ins = findMarkRanges(editor, 'insertion', sid).sort((a, b) => b.from - a.from)
      for (const r of ins) tr.delete(r.from, r.to)
      return true
    })
    .run()
}
