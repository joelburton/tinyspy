import { useCallback, useEffect, useRef, useState } from 'react'
import type { GenericFeedbackMsg } from '../../lib/games'

/** Default auto-clear duration for a `timed` local-feedback message whose own
 *  `dismiss.ms` is unset. Shared so every game's own-move feedback feels the same. */
export const LOCAL_FEEDBACK_DISMISS_MS = 1400

export type LocalFeedbackApi = {
  /** The active local-feedback message, or `null`. Pass it straight to a
   *  `<GenericFeedbackPill>`. */
  localFeedback: GenericFeedbackMsg | null
  /** Show a message. A `timed` message (`dismiss: { kind: 'timed' }`) auto-clears
   *  after `dismiss.ms` (default `LOCAL_FEEDBACK_DISMISS_MS`), re-arming the timer
   *  on each call; a `sticky` / `closeable` message stays until `clearLocalFeedback()`
   *  (or the host swaps it). */
  showLocalFeedback: (msg: GenericFeedbackMsg) => void
  /** Clear the message now — e.g. when the player starts the next move (a
   *  keystroke, a tile click). No-op if nothing's showing, AND a **no-op while
   *  `locked`** (terminal): terminal local feedback is permanent (see below). */
  clearLocalFeedback: () => void
}

export type LocalFeedbackOptions = {
  /**
   * When true, `clearLocalFeedback()` is a no-op — the message is **permanent**.
   * Games pass `locked: isTerminal`, because terminal local feedback (the verdict
   * pill) can't be dismissed by anything: not a keystroke, not a click, not a
   * future exotic entry method. Putting the permanence HERE — in the one function
   * that removes feedback — means no dismissal site has to re-check terminal
   * state; they all just call `clearLocalFeedback()` and it refuses when locked.
   */
  locked?: boolean
}

/**
 * The shared **own-move local-feedback machinery** — the local half of the
 * feedback split (own move → the below-board pill; peer news → the global header,
 * see docs/code-conventions.md → Feedback naming). It holds one
 * `GenericFeedbackMsg | null` and mirrors the global feedback API (`show(msg)` /
 * `clear()` + auto-clear of `timed` messages), so local and global feedback are
 * the same shape — the only difference is WHERE the host renders it.
 *
 * The **dismiss mode rides the message**, not the hook: `sticky` (the v3 default
 * for own-move results — persists until the player's next move, which the host
 * signals via `clearLocalFeedback()`), `timed` (auto-clears; e.g. a rejected-swap
 * flash), or `closeable`. This is the single mechanism every game uses — it
 * replaced a `useLocalFeedback(ms)` variant plus per-game `useState` copies.
 *
 * The host owns the *policy* (WHERE it renders, WHEN a sticky one clears); the
 * hook owns the *mechanics* — the state, the re-armable timer, the unmount cleanup.
 */
export function useLocalFeedback({ locked = false }: LocalFeedbackOptions = {}): LocalFeedbackApi {
  const [localFeedback, setLocalFeedback] = useState<GenericFeedbackMsg | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read `locked` through a ref so the memoized `clearLocalFeedback` (registered
  // once) always sees the latest value without re-creating the callback. Synced in
  // a passive effect — never written during render (react-hooks/refs forbids that);
  // `clearLocalFeedback` only reads it from an event handler, so post-commit is fine.
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  })

  const cancelTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const showLocalFeedback = useCallback((msg: GenericFeedbackMsg) => {
    setLocalFeedback(msg)
    cancelTimer()
    // Only a `timed` message auto-clears; sticky/closeable persist until the host
    // clears it (docs/ui.md → Feedback pill (dismissal modes)).
    if (msg.dismiss.kind === 'timed') {
      const ms = msg.dismiss.ms ?? LOCAL_FEEDBACK_DISMISS_MS
      timerRef.current = setTimeout(() => {
        setLocalFeedback(null)
        timerRef.current = null
      }, ms)
    }
  }, [])

  const clearLocalFeedback = useCallback(() => {
    // Terminal local feedback is permanent — refuse to clear while locked, so no
    // key / click / future entry method can wipe a verdict. See LocalFeedbackOptions.
    if (lockedRef.current) return
    cancelTimer()
    setLocalFeedback(null)
  }, [])

  useEffect(function clearTimerOnUnmount() {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return { localFeedback, showLocalFeedback, clearLocalFeedback }
}
