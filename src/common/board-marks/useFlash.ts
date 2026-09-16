// cs-audited-board-marks

import { useCallback, useEffect, useRef, useState } from 'react'

/** A stable empty set, so clearing twice is one object and not two renders. */
const EMPTY: ReadonlySet<never> = new Set()

/**
 * A transient highlight of a set of ids: `flash(items)` marks them "hot", and
 * they clear themselves after `durationMs`. Returns the current hot set (for
 * `.has()` membership checks) plus the trigger.
 *
 * `durationMs` is required and comes from `feedbackTiming` — a mark's lifetime
 * is part of what the mark MEANS, so a caller says which beat it is raising and
 * never a number of its own.
 *
 * Each call owns its own timer, so two marks on one board don't interfere, and
 * calling `flash` again before it clears restarts the countdown and replaces
 * the contents.
 *
 * `flash` starts a timer, so it's called from an event handler or an effect,
 * never during render. A mark that must land in the same commit as the change
 * it points at holds its own set instead (common/board-marks/doc.md). `clear`
 * only empties the set, so it is safe during render — for the caller whose
 * board changes out from under a mark that is still lit.
 *
 * A SET of ids is the whole of what it holds: a single nullable tagged value —
 * one mark with a reason attached — is the other shape, and that is `useMark`.
 */
export function useFlash<T = number>(
  durationMs: number,
): [ReadonlySet<T>, (items: Iterable<T>) => void, () => void] {
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
  useEffect(function cancelTimerOnUnmount() {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // Take the mark off NOW. It deliberately leaves any pending timer alone, so
  // that this is a plain state update and nothing else: that timer would empty
  // an already-empty set, and a later `flash` cancels it before starting its own.
  const clear = useCallback(() => setFlashed(EMPTY as ReadonlySet<T>), [])

  return [flashed, flash, clear]
}
