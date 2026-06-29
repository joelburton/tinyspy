import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResultTone } from '../components/ResultFlash'

/** How long a result flash stays up before it auto-clears. Shared so every
 *  game's own-result feedback feels identical. */
export const RESULT_FLASH_MS = 1400

/** The current flash, or `null` when nothing's showing. Feed it to a
 *  `<ResultFlash>` (or any consumer) when set. */
export type ResultFlashState = { tone: ResultTone; label: string } | null

export type ResultFlashApi = {
  flash: ResultFlashState
  /** Show a flash; it auto-clears after `ms` (re-arming the timer if one is
   *  already running, so a fresh result resets the countdown). When the hook was
   *  created with `ms: null` there's no timer — the flash is **sticky** until the
   *  host calls `clear()`. */
  show: (tone: ResultTone, label: string) => void
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
export function useResultFlash(ms: number | null = RESULT_FLASH_MS): ResultFlashApi {
  const [flash, setFlash] = useState<ResultFlashState>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (tone: ResultTone, label: string) => {
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
