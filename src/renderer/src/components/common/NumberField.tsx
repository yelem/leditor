import { useEffect, useState } from 'react'
import { useT } from '@renderer/lib/i18n'
import './number-field.css'

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}

/**
 * Numeric field with manual input and a ▲▼ stepper.
 * Manual input is applied on Enter/blur and is NOT snapped to the step
 * (the step is for the buttons only). The value is clamped to [min, max];
 * invalid input is rolled back.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix
}: NumberFieldProps): JSX.Element {
  const t = useT()
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const decimals = (String(step).split('.')[1] ?? '').length
  const clamp = (n: number): number => {
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    return Number(n.toFixed(decimals))
  }

  const commit = (): void => {
    const parsed = Number(text.replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setText(String(value))
      return
    }
    const n = clamp(parsed)
    setText(String(n))
    if (n !== value) onCommit(n)
  }

  const stepBy = (dir: number): void => {
    const base = Number.isFinite(value) ? value : 0
    const n = clamp(base + dir * step)
    setText(String(n))
    if (n !== value) onCommit(n)
  }

  return (
    <div className="numfield">
      <div className="numfield__box">
        <input
          type="text"
          inputMode="decimal"
          className="numfield__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit()
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              stepBy(1)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              stepBy(-1)
            }
          }}
        />
        <div className="numfield__steppers">
          <button type="button" tabIndex={-1} onClick={() => stepBy(1)} aria-label={t('common.increase')}>
            ▲
          </button>
          <button type="button" tabIndex={-1} onClick={() => stepBy(-1)} aria-label={t('common.decrease')}>
            ▼
          </button>
        </div>
      </div>
      <span className="numfield__suffix">{suffix ?? ''}</span>
    </div>
  )
}
