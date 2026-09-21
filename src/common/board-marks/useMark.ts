// cs-blessed-board-marks

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ATTENTION_FADE_MS } from './feedbackTiming'

/** A mark the board is wearing: what it was raised with, which stage it is in,
 *  and which raise it belongs to. Null, from the hook, is the board saying
 *  nothing. */
export type Mark<T> = {
  value: T
  /** `attention` — the flash pointing at the pieces, "something happened here".
   *  `answer` — the outcome's own color, "and this is what it was". A mark that
   *  did not ask to announce itself is in `answer` from its first render, which
   *  is why most callers never read this. */
  phase: 'attention' | 'answer'
  /** Counts the raises. A CSS animation runs once per mount, so a board that
   *  keys its marked pieces on this replays the animation when the same mark is
   *  raised twice. Monotonic: a clear does not reset it. */
  nonce: number
}

/** One raise, as the hook holds it — the caller's value plus the decisions that
 *  raise made. A NEW object per `show`, which is what the beats' effect keys on:
 *  the phase changing must not restart the clock. */
type Raise<T> = {
  value: T
  nonce: number
  attention: boolean
  onEnd?: () => void
}

/**
 * ONE transient mark, with whatever the board needs to draw it: `show(value)`
 * puts it up and it takes itself off when its beat is spent. Returns the mark
 * (or null) plus the trigger and an immediate clear.
 *
 * Every mark a board raises for its own reasons is this hook. What differs
 * between them is three decisions, and each is an argument rather than a
 * different import:
 *
 * - **What it carries.** `T` is opaque — the hook never reads it. A mark on
 *   board pieces carries its own noun for them (`{cells}`, `{letters}`,
 *   `{ids}`), a mark that is only "these are hot" carries the set, and a mark
 *   about a typed word carries no pieces at all.
 * - **Whether it announces itself.** `show(v, { attention: true })` runs the
 *   attention flash before the answer, for news the player was not watching
 *   for. The changeover is `ATTENTION_FADE_MS` and is not a parameter: that is
 *   the instant the flash finishes fading and the piece's own color becomes
 *   visible again. Any earlier paints the answer under a flash still on top of
 *   it, so the player sees the flash and then a color that arrives unannounced.
 * - **When it ends.** `ms` is the ANSWER's beat, so an announced mark is up for
 *   `ATTENTION_FADE_MS + ms`. It comes from `feedbackTiming` for the reason it
 *   lives there — a mark's lifetime is part of what the mark MEANS, so a caller
 *   says which beat it is raising and never a number of its own. `null` is a
 *   mark with no clock at all, standing until `clear`: the "until the next
 *   action" lifetime the vocabulary names, where the action that ends it is
 *   what clears it.
 *
 * `onEnd` runs when the CLOCK ends the mark, for state that lives beside it and
 * ends with it. It is captured at `show`, so it sees the answer it was raised
 * for and not a later one. A mark that was CLEARED does not run it: that mark
 * was interrupted, and the caller knows more about what comes next than the
 * hook does.
 *
 * `show` and `clear` are plain state updates, so both are safe to call DURING
 * RENDER. A mark that must land in the same commit as the change it points at
 * needs that — connections detects a teammate's guess by comparing renders, and
 * a mark raised a commit later would arrive as a second, unexplained event.
 *
 * Calling `show` again replaces the mark and restarts the sequence from the
 * beginning, which is what a second refusal should do.
 */
export function useMark<T>(
  ms: number | null,
): [
  Mark<T> | null,
  (value: T, opts?: { attention?: boolean; onEnd?: () => void }) => void,
  () => void,
] {
  // The raise and the count of raises travel together, so that `show` can read
  // the last nonce and bump it in one update.
  const [{ raise }, setRaised] = useState<{ raise: Raise<T> | null; lastNonce: number }>({
    raise: null,
    lastNonce: 0,
  })
  // The phase is held APART from the raise deliberately: the changeover has to
  // re-render without replacing the raise, because the raise is what the beats
  // below are keyed on and the answer's clock started when the mark went up.
  const [phase, setPhase] = useState<'attention' | 'answer'>('answer')

  const show = useCallback(
    (
      value: T,
      { attention = false, onEnd }: { attention?: boolean; onEnd?: () => void } = {},
    ) => {
      setRaised((r) => ({
        raise: { value, nonce: r.lastNonce + 1, attention, onEnd },
        lastNonce: r.lastNonce + 1,
      }))
      setPhase(attention ? 'attention' : 'answer')
    },
    [],
  )

  // Take the mark off NOW, canceling the rest of its beats — the effect below
  // cleans up as the raise goes. The count survives, so a clear and a raise in
  // one handler still bump the nonce and still remount whatever keys on it. An
  // already-empty board returns the same state rather than rendering again.
  const clear = useCallback(() => {
    setRaised((r) => (r.raise === null ? r : { raise: null, lastNonce: r.lastNonce }))
  }, [])

  // The beats, as timers. Keyed on the RAISE — a new object per `show`, null on
  // a clear — so the changeover never restarts the clock, and this cleanup is
  // what cancels a mark the caller ended early or a component that went away.
  useEffect(
    function runTheMarksBeats() {
      if (raise === null) return
      const { attention, onEnd } = raise
      const timers: ReturnType<typeof setTimeout>[] = []
      if (attention) {
        timers.push(setTimeout(() => setPhase('answer'), ATTENTION_FADE_MS))
      }
      if (ms !== null) {
        timers.push(
          setTimeout(
            () => {
              setRaised((r) => ({ raise: null, lastNonce: r.lastNonce }))
              onEnd?.()
            },
            (attention ? ATTENTION_FADE_MS : 0) + ms,
          ),
        )
      }
      return () => timers.forEach(clearTimeout)
    },
    [raise, ms],
  )

  // One object while nothing about the mark changes: callers derive from it —
  // a hot set, a memoized answer — and a fresh object every render would re-run
  // all of that on renders the mark had no part in.
  return [
    useMemo(
      () => (raise === null ? null : { value: raise.value, phase, nonce: raise.nonce }),
      [raise, phase],
    ),
    show,
    clear,
  ]
}
