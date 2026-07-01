import { useCallback, useEffect, useRef, useState } from 'react'

/** The outcome a local-feedback message paints. `good`/`bad` are the universal
 *  correct/wrong pair; `near` is the "one away" partial-credit amber (connections
 *  only). Games map this onto the pill's `GenericFeedbackTone`. Same vocabulary
 *  as the TurnLog outcome bar, minus its `neutral`. */
export type LocalFeedbackTone = 'good' | 'bad' | 'near'

/** How long a local-feedback message stays up before it auto-clears, when the
 *  host opts into a timer (the sticky default passes `ms: null`). Shared so every
 *  game's own-move feedback feels identical. */
export const LOCAL_FEEDBACK_DISMISS_MS = 1400

/** The current local-feedback message, or `null` when nothing's showing. Feed
 *  it to a `<GenericFeedbackPill>` (or any consumer) when set. */
export type LocalFeedbackState = { tone: LocalFeedbackTone; label: string } | null

export type LocalFeedbackApi = {
  flash: LocalFeedbackState
  /** Show a flash; it auto-clears after `ms` (re-arming the timer if one is
   *  already running, so a fresh result resets the countdown). When the hook was
   *  created with `ms: null` there's no timer — the flash is **sticky** until the
   *  host calls `clear()`. */
  show: (tone: LocalFeedbackTone, label: string) => void
  /** Clear the flash now — e.g. when the player starts the next move (a
   *  keystroke, a tile click). No-op if nothing's showing. */
  clear: () => void
}

/**
 * The shared **own-result flash machinery**: a `{ tone, label }` for the local
 * half of the feedback split (see docs/deferred.md → Feedback channels). It
 * drives a game's local own-move feedback (psychicnum's word entry, connections's
 * commit row). The timer is cleaned up on unmount.
 *
 * Pass `ms: null` for a **sticky** flash (no auto-timer) — the v3 default for
 * local feedback, which is important enough that it should persist until the
 * player's next move rather than vanish on a timer (docs/design-decisions.md →
 * Dismissal modes). The host then calls `clear()` on that next move.
 *
 * The host owns the *policy*: WHERE the flash renders (it just reads `flash`)
 * and WHEN it clears (`clear()` on the next keystroke / tile click). This hook
 * owns the *mechanics* — the state, the re-armable timer, the cleanup — which
 * were near-verbatim copies in both games before they landed here.
 */
export function useLocalFeedback(ms: number | null = LOCAL_FEEDBACK_DISMISS_MS): LocalFeedbackApi {
  const [flash, setFlash] = useState<LocalFeedbackState>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (tone: LocalFeedbackTone, label: string) => {
      setFlash({ tone, label })
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      // ms === null → sticky: no auto-clear timer; the host clears it on the
      // player's next move (docs/design-decisions.md → Dismissal modes).
      if (ms !== null) {
        timerRef.current = setTimeout(() => {
          setFlash(null)
          timerRef.current = null
        }, ms)
      }
    },
    [ms],
  )

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setFlash(null)
  }, [])

  useEffect(function clearTimerOnUnmount() {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return { flash, show, clear }
}
