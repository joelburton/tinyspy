// cs-audited-move-flash

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A transient highlight of a set of ids: `flash(items)` marks them "hot", and
 * they clear themselves after `durationMs`. Returns the current hot set (for
 * `.has()` membership checks) plus the trigger.
 *
 * Each call owns its own timer, so two marks on one board don't interfere, and
 * calling `flash` again before it clears restarts the countdown and replaces
 * the contents.
 *
 * `flash` starts a timer, so it's called from an event handler or an effect,
 * never during render. A mark that must land in the same commit as the change
 * it points at holds its own set instead (common/move-flash/doc.md).
 *
 * A SET of ids is the whole of what it holds: a single nullable tagged value —
 * one mark with a reason attached — is a different shape and keeps its own
 * self-clearing state.
 */
export function useFlash<T = number>(
  durationMs = 1000,
): [ReadonlySet<T>, (items: Iterable<T>) => void] {
  const [flashed, setFlashed] = useState<ReadonlySet<T>>(() => new Set<T>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback(
    (items: Iterable<T>) => {
      setFlashed(new Set(items))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setFlashed(new Set<T>())
        timer.current = null
      }, durationMs)
    },
    [durationMs],
  )

  // Clear a pending timer on unmount so it can't fire a setState afterward.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return [flashed, flash]
}
