import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A transient highlight of a set of ids: `flash(items)` marks them "hot", and
 * they clear themselves after `durationMs`. Returns the current hot set (for
 * `.has()` membership checks) plus the trigger.
 *
 * Replaces the copy-pasted "set a `Set<number>`, clear it after ~1s" flash that
 * scrabble had three of (green / yellow / red placement flashes) and stackdown
 * had one of (the ambiguous-tile flash). Each call owns its own timer, so
 * scrabble's three independent flashes don't interfere. Calling `flash` again
 * before it clears restarts the countdown.
 *
 * (Not a fit for stackdown's `WordFlash` — that's a single nullable tagged
 * value, not a set of ids; it keeps its own self-clearing state.)
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
