import { useEffect, useRef } from 'react'
import type { ProjectSettings } from '@shared/project-types'
import { NumberField } from '@renderer/components/common/NumberField'
import { FontSelect } from '@renderer/components/common/FontSelect'
import { useT } from '@renderer/lib/i18n'

interface AppearancePopoverProps {
  settings: ProjectSettings
  onChange: (partial: Partial<ProjectSettings>) => void
  onClose: () => void
}

/** Поповер настроек поля письма (применяется к текущему проекту). */
export function AppearancePopover({
  settings,
  onChange,
  onClose
}: AppearancePopoverProps): JSX.Element {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="appearance" ref={ref}>
      <div className="appearance__row appearance__row--stack">
        <span>{t('appearance.font')}</span>
        <FontSelect value={settings.fontFamily} onChange={(v) => onChange({ fontFamily: v })} />
      </div>

      <div className="appearance__row">
        <span>{t('appearance.fontSize')}</span>
        <NumberField
          value={settings.fontSize}
          min={8}
          max={120}
          suffix="px"
          onCommit={(v) => onChange({ fontSize: v })}
        />
      </div>

      <div className="appearance__row">
        <span>{t('appearance.lineHeight')}</span>
        <NumberField
          value={settings.lineHeight}
          min={1}
          max={4}
          step={0.1}
          onCommit={(v) => onChange({ lineHeight: v })}
        />
      </div>

      <div className="appearance__row">
        <span>{t('appearance.width')}</span>
        <NumberField
          value={settings.editorWidth}
          min={300}
          max={2000}
          step={10}
          suffix="px"
          onCommit={(v) => onChange({ editorWidth: v })}
        />
      </div>

      <label className="appearance__row appearance__row--checkbox">
        <input
          type="checkbox"
          checked={settings.typewriterMode}
          onChange={(e) => onChange({ typewriterMode: e.target.checked })}
        />
        <span>{t('appearance.typewriter')}</span>
      </label>
    </div>
  )
}
