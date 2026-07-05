/**
 * Последовательное выполнение операций над одним ресурсом (по ключу).
 *
 * Обработчики IPC асинхронны и могут перемежаться на await; операции
 * «прочитал манифест → изменил → записал» без сериализации теряют изменения
 * друг друга. Все мутации проекта и операции бэкапа берут блокировку по
 * пути проекта.
 */

const tails = new Map<string, Promise<void>>()

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = tails.get(key) ?? Promise.resolve()
  const run = tail.then(fn, fn)
  const next = run.then(
    () => undefined,
    () => undefined
  )
  tails.set(key, next)
  // Не даём карте расти бесконечно: если хвост не сменился — очередь пуста.
  void next.then(() => {
    if (tails.get(key) === next) tails.delete(key)
  })
  return run
}
