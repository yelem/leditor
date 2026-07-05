import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export const searchKey = new PluginKey('book-search')

interface Match {
  from: number
  to: number
}

interface SearchState {
  query: string
  caseSensitive: boolean
  matches: Match[]
  current: number
  deco: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookSearch: {
      setSearch: (query: string, caseSensitive: boolean) => ReturnType
      searchNext: () => ReturnType
      searchPrev: () => ReturnType
      clearSearch: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

function computeMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return []
  const chars: Array<{ pos: number; ch: string }> = []
  doc.descendants((node, pos) => {
    if (node.isText && typeof node.text === 'string') {
      for (let i = 0; i < node.text.length; i++) chars.push({ pos: pos + i, ch: node.text[i] })
    }
  })
  const hay = caseSensitive ? chars.map((c) => c.ch).join('') : chars.map((c) => c.ch).join('').toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: Match[] = []
  let idx = hay.indexOf(needle)
  while (idx !== -1) {
    matches.push({ from: chars[idx].pos, to: chars[idx + needle.length - 1].pos + 1 })
    idx = hay.indexOf(needle, idx + needle.length)
  }
  return matches
}

function buildDeco(doc: PMNode, matches: Match[], current: number): DecorationSet {
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === current ? 'pm-search pm-search--current' : 'pm-search'
    })
  )
  return DecorationSet.create(doc, decos)
}

export const SearchHighlight = Extension.create({
  name: 'bookSearch',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init() {
            return {
              query: '',
              caseSensitive: false,
              matches: [],
              current: 0,
              deco: DecorationSet.empty
            }
          },
          apply(tr, value) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined
            if (meta) {
              const query = meta.query !== undefined ? meta.query : value.query
              const caseSensitive =
                meta.caseSensitive !== undefined ? meta.caseSensitive : value.caseSensitive
              const matches = computeMatches(tr.doc, query, caseSensitive)
              let current = meta.current !== undefined ? meta.current : value.current
              if (matches.length === 0) current = 0
              else current = ((current % matches.length) + matches.length) % matches.length
              return { query, caseSensitive, matches, current, deco: buildDeco(tr.doc, matches, current) }
            }
            if (tr.docChanged && value.query) {
              const matches = computeMatches(tr.doc, value.query, value.caseSensitive)
              const current = matches.length === 0 ? 0 : Math.min(value.current, matches.length - 1)
              return { ...value, matches, current, deco: buildDeco(tr.doc, matches, current) }
            }
            return value
          }
        },
        props: {
          decorations(state) {
            return searchKey.getState(state)?.deco ?? DecorationSet.empty
          }
        }
      })
    ]
  },

  addCommands() {
    const selectCurrent = (tr: import('@tiptap/pm/state').Transaction, st: SearchState): void => {
      const m = st.matches[st.current]
      if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to))
    }

    return {
      setSearch:
        (query, caseSensitive) =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            tr.setMeta(searchKey, { query, caseSensitive, current: 0 })
            const next = computeMatches(state.doc, query, caseSensitive)
            if (next.length > 0) {
              tr.setSelection(TextSelection.create(tr.doc, next[0].from, next[0].to))
            }
            dispatch(tr)
          }
          return true
        },
      searchNext:
        () =>
        ({ tr, dispatch, state }) => {
          const st = searchKey.getState(state)
          if (!st || st.matches.length === 0) return false
          if (dispatch) {
            const current = (st.current + 1) % st.matches.length
            tr.setMeta(searchKey, { current })
            selectCurrent(tr, { ...st, current })
            dispatch(tr)
          }
          return true
        },
      searchPrev:
        () =>
        ({ tr, dispatch, state }) => {
          const st = searchKey.getState(state)
          if (!st || st.matches.length === 0) return false
          if (dispatch) {
            const current = (st.current - 1 + st.matches.length) % st.matches.length
            tr.setMeta(searchKey, { current })
            selectCurrent(tr, { ...st, current })
            dispatch(tr)
          }
          return true
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchKey, { query: '', current: 0 })
            dispatch(tr)
          }
          return true
        },
      replaceCurrent:
        (replacement) =>
        ({ tr, dispatch, state }) => {
          const st = searchKey.getState(state)
          const m = st?.matches[st.current]
          if (!st || !m) return false
          if (dispatch) {
            tr.insertText(replacement, m.from, m.to)
            tr.setMeta(searchKey, { query: st.query, caseSensitive: st.caseSensitive, current: st.current })
            dispatch(tr)
          }
          return true
        },
      replaceAll:
        (replacement) =>
        ({ tr, dispatch, state }) => {
          const st = searchKey.getState(state)
          if (!st || st.matches.length === 0) return false
          if (dispatch) {
            for (const m of [...st.matches].sort((a, b) => b.from - a.from)) {
              tr.insertText(replacement, m.from, m.to)
            }
            tr.setMeta(searchKey, { query: st.query, caseSensitive: st.caseSensitive, current: 0 })
            dispatch(tr)
          }
          return true
        }
    }
  }
})
