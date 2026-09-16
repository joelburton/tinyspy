// cs-audited-board-marks

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ONE transient mark, with whatever the board needs to draw it: `show(mark)`
 * puts it up and it takes itself down after `durationMs`. Returns the current
 * mark (or null) plus the trigger and an immediate clear.
 *
 * `useFlash` is the same idea for a SET of ids — "which pieces are hot" — and
 * this is for the other shape the boards actually keep: one mark with a reason
 * attached, where null means the board is saying nothing. A refused word's tiles
 * and the outcome they wear is one fact, not a set of hot ids, and the games
 * that hold it were each writing this hook out by hand.
 *
 * `durationMs` comes from `feedbackTiming`, for the reason it does there: a
 * mark's lifetime is part of what the mark means. A mark whose lifetime is
 * "until the next action" — a verdict — is not this hook's shape at all: it has
 * no clock, and the action that ends it is what clears it (letterboxed's refused
 * word is cleared by the next keystroke).
 *
 * `show` starts a timer, so it is called from an event handler or an effect,
 * never during render. Calling it again before the mark clears restarts the
 * countdown and replaces the mark, which is what a second refusal should do.
 */
export function useMark<T>(
  durationMs: number,
): [T | null, (mark: T) => void, () => void] {
  const [mark, setMark] = useState<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (next: T) => {
      setMark(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setMark(null)
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

  // Take the mark off NOW. It deliberately leaves any pending timer alone, so
  // that this is a plain state update and nothing else: that timer would null an
  // already-null mark, and a later `show` cancels it before starting its own.
  const clear = useCallback(() => setMark(null), [])

  return [mark, show, clear]
}
