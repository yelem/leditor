import { useCallback, useRef } from 'react'

/**
 * Хук горизонтального перетаскивания для разделителей панелей.
 * Возвращает обработчик onMouseDown; на каждое движение вызывает onDelta(dx),
 * где dx — смещение курсора по X с предыдущего события.
 */
export function useDrag(onDelta: (deltaX: number) => void): (e: React.MouseEvent) => void {
  const onDeltaRef = useRef(onDelta)
  onDeltaRef.current = onDelta
  const lastX = useRef(0)

  const handleMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - lastX.current
    lastX.current = e.clientX
    onDeltaRef.current(dx)
  }, [])

  const handleUp = useCallback(() => {
    document.body.classList.remove('is-resizing')
    window.removeEventListener('mousemove', handleMove)
    window.removeEventListener('mouseup', handleUp)
  }, [handleMove])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      lastX.current = e.clientX
      document.body.classList.add('is-resizing')
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [handleMove, handleUp]
  )

  return startDrag
}
