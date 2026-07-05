import { useState } from 'react'
import { useSettings } from '@renderer/store'
import { ChatPanel } from '@renderer/components/ChatPanel'
import { NotesPanel } from '@renderer/components/NotesPanel'
import { useT } from '@renderer/lib/i18n'
import './right-panel.css'

type Tab = 'chat' | 'notes'

const TAB_KEY = 'book-editor.rightTab'

/** Right-hand block with tabs: Assistant and Notes (per chapter). */
export function RightPanel(): JSX.Element {
  const t = useT()
  // The tab is kept in localStorage: the panel unmounts when hidden, and the
  // choice must not reset to Assistant when shown again.
  const [tab, setTabState] = useState<Tab>(() =>
    localStorage.getItem(TAB_KEY) === 'notes' ? 'notes' : 'chat'
  )
  const setTab = (next: Tab): void => {
    localStorage.setItem(TAB_KEY, next)
    setTabState(next)
  }
  const { settings } = useSettings()
  const activeProfile = settings.ai.profiles.find((p) => p.id === settings.ai.activeProfileId)

  return (
    <div className="rpanel">
      <div className="rpanel__tabs">
        <button
          type="button"
          className={`rpanel__tab${tab === 'chat' ? ' is-active' : ''}`}
          onClick={() => setTab('chat')}
        >
          {t('rpanel.assistant')}
        </button>
        <button
          type="button"
          className={`rpanel__tab${tab === 'notes' ? ' is-active' : ''}`}
          onClick={() => setTab('notes')}
        >
          {t('rpanel.notes')}
        </button>
        {tab === 'chat' && (
          <span className="rpanel__model" title={t('rpanel.activeProfile')}>
            {activeProfile ? activeProfile.name : t('rpanel.aiNotConfigured')}
          </span>
        )}
      </div>
      <div className="rpanel__body">{tab === 'chat' ? <ChatPanel /> : <NotesPanel />}</div>
    </div>
  )
}
