import { useCallback, useEffect, useRef, useState } from 'react'
import type { GenericFeedbackTone } from '../lib/games'

/** How long a local-feedback message stays up before it auto-clears, when the
 *  host opts into a timer (the sticky default passes `ms: null`). Shared so every
 *  game's own-move feedback feels identical. */
export const LOCAL_FEEDBACK_DISMISS_MS = 1400

/** The current local-feedback message, or `null` when nothing's showing. Feed
 *  it to a `<GenericFeedbackPill>` when set. Tones are the SAME `GenericFeedbackTone`
 *  the global pill uses — local and global feedback speak one tone vocabulary
 *  (docs/code-conventions.md → Feedback naming). */
export type LocalFeedbackState = { tone: GenericFeedbackTone; label: string } | null

export type LocalFeedbackApi = {
  /** The active local-feedback message, or `null`. */
  localFeedback: LocalFeedbackState
  /** Show a message; it auto-clears after `ms` (re-arming the timer if one is
   *  already running, so a fresh result resets the countdown). When the hook was
   *  created with `ms: null` there's no timer — the message is **sticky** until
   *  the host calls `clearLocalFeedback()`. */
  showLocalFeedback: (tone: GenericFeedbackTone, label: string) => void
  /** Clear the message now — e.g. when the player starts the next move (a
   *  keystroke, a tile click). No-op if nothing's showing. */
  clearLocalFeedback: () => void
}

/**
 * The shared **own-move local-feedback machinery**: a `{ tone, label }` for the
 * local half of the feedback split (own move → local below-board pill; peer news
 * → the global header, see docs/code-conventions.md → Feedback naming). It drives
 * a game's local own-move feedback (psychicnum's word entry, connections's commit
 * row). The timer is cleaned up on unmount.
 *
 * Pass `ms: null` for a **sticky** message (no auto-timer) — the v3 default for
 * local feedback, which is important enough that it should persist until the
 * player's next move rather than vanish on a timer (docs/design-decisions.md →
 * Dismissal modes). The host then calls `clearLocalFeedback()` on that next move.
 *
 * The host owns the *policy*: WHERE the message renders (it just reads
 * `localFeedback`) and WHEN it clears (`clearLocalFeedback()` on the next
 * keystroke / tile click). This hook owns the *mechanics* — the state, the
 * re-armable timer, the cleanup — which were near-verbatim copies in both games
 * before they landed here.
 */
export function useLocalFeedback(ms: number | null = LOCAL_FEEDBACK_DISMISS_MS): LocalFeedbackApi {
  const [localFeedback, setLocalFeedback] = useState<LocalFeedbackState>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showLocalFeedback = useCallback(
    (tone: GenericFeedbackTone, label: string) => {
      setLocalFeedback({ tone, label })
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      // ms === null → sticky: no auto-clear timer; the host clears it on the
      // player's next move (docs/design-decisions.md → Dismissal modes).
      if (ms !== null) {
        timerRef.current = setTimeout(() => {
          setLocalFeedback(null)
          timerRef.current = null
        }, ms)
      }
    },
    [ms],
  )

  const clearLocalFeedback = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setLocalFeedback(null)
  }, [])

  useEffect(function clearTimerOnUnmount() {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return { localFeedback, showLocalFeedback, clearLocalFeedback }
}
