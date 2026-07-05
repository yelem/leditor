/**
 * Реестр «флашеров» — функций, немедленно записывающих на диск отложенные
 * (debounce) изменения: текст главы, заметки и т.п.
 *
 * Компоненты с автосохранением регистрируют свой flush; перед закрытием окна
 * (по запросу main) и перед восстановлением из бэкапа вызывается flushAll(),
 * чтобы несохранённые правки не потерялись и не перезаписали восстановленное.
 */

type Flusher = () => Promise<void> | void

const flushers = new Set<Flusher>()

/** Зарегистрировать флашер. Возвращает функцию отмены регистрации. */
export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

/** Выполнить все зарегистрированные флашеры; ошибки не прерывают остальные. */
export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((fn) => Promise.resolve().then(fn)))
}
