import { useDrag } from './useDrag'

interface ResizerProps {
  onResize: (deltaX: number) => void
  ariaLabel: string
}

/** Вертикальный разделитель-перетаскиватель между панелями. */
export function Resizer({ onResize, ariaLabel }: ResizerProps): JSX.Element {
  const startDrag = useDrag(onResize)

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onMouseDown={startDrag}
    >
      <span className="resizer-grip" />
    </div>
  )
}
