import { useState } from 'react'
import { FONT_OPTIONS } from '@renderer/lib/fonts'
import { getCachedFonts, loadSystemFonts } from '@renderer/lib/system-fonts'
import { useT } from '@renderer/lib/i18n'

interface FontSelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Font picker: recommended + system fonts (loaded on first click). */
export function FontSelect({ value, onChange, className }: FontSelectProps): JSX.Element {
  const t = useT()
  const [system, setSystem] = useState<string[]>(getCachedFonts())

  const ensureFonts = (): void => {
    if (system.length === 0) void loadSystemFonts().then(setSystem)
  }

  const knownValues = new Set<string>([
    ...FONT_OPTIONS.map((o) => o.value),
    ...system.map((f) => `"${f}"`)
  ])

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={ensureFonts}
      onFocus={ensureFonts}
    >
      {/* Current value when not in the lists yet (system fonts not loaded). */}
      {!knownValues.has(value) && <option value={value}>{value.replace(/"/g, '')}</option>}
      <optgroup label={t('fonts.recommended')}>
        {FONT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </optgroup>
      {system.length > 0 && (
        <optgroup label={t('fonts.system')}>
          {system.map((f) => (
            <option key={f} value={`"${f}"`}>
              {f}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
