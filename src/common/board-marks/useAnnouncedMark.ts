// cs-blessed-board-marks

import { useCallback, useEffect, useRef, useState } from 'react'
import { ATTENTION_FADE_MS, WORD_ANSWER_MS } from './feedbackTiming'

/** A mark part-way through the announce-then-answer sequence: which stage it is
 *  in, and whatever the board needs to draw it. */
export type AnnouncedMark<T> = {
  value: T
  /** `pointing` — the attention flash, "something happened here".
   *  `answering` — the outcome's own color, "and this is what it was". */
  phase: 'pointing' | 'answering'
}

/**
 * ANNOUNCE, THEN ANSWER — one mark in two stages, for news the player was not
 * watching for. The attention flash points at the pieces, and when it has faded
 * they wear the outcome's color; then the mark comes off.
 *
 * The order is the vocabulary's and so are both lifetimes, which is why neither
 * is a parameter. What is worth having in one place is WHEN the stages change
 * over: exactly `ATTENTION_FADE_MS`, the instant the attention flash finishes
 * fading and the piece's own color becomes visible again. Any earlier and the
 * answer's color is painted under a flash that is still on top of it, so the
 * player sees the flash and then a color that arrives unannounced.
 *
 * `announce: false` skips the first stage, for a player who is already looking
 * at the piece — your own move is news to everyone except you. It defaults to
 * true because the sequence is what this hook is for; a mark that never
 * announces is `useMark`.
 *
 * `onEnd` runs when the mark comes off, for state that lives beside it and ends
 * with it (wordiply's held row). It is captured at `show`, so it sees the answer
 * it was raised for and not a later one.
 *
 * `show` starts timers, so it is called from an event handler or an effect,
 * never during render. Calling it again replaces the mark and restarts the
 * sequence from the beginning.
 */
export function useAnnouncedMark<T>(): [
  AnnouncedMark<T> | null,
  (value: T, opts?: { announce?: boolean; onEnd?: () => void }) => void,
  () => void,
] {
  const [mark, setMark] = useState<AnnouncedMark<T> | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const show = useCallback(
    (value: T, { announce = true, onEnd }: { announce?: boolean; onEnd?: () => void } = {}) => {
      stop()
      setMark({ value, phase: announce ? 'pointing' : 'answering' })
      const lead = announce ? ATTENTION_FADE_MS : 0
      if (announce) {
        timers.current.push(
          setTimeout(
            () => setMark((m) => (m ? { ...m, phase: 'answering' } : null)),
            ATTENTION_FADE_MS,
          ),
        )
      }
      timers.current.push(
        setTimeout(() => {
          setMark(null)
          timers.current = []
          onEnd?.()
        }, lead + WORD_ANSWER_MS),
      )
    },
    [stop],
  )

  // Both timers go on unmount, so neither can fire a setState afterward.
  useEffect(() => () => stop(), [stop])

  // Take the mark off NOW, canceling the rest of the sequence. `onEnd` does NOT
  // run: it belongs to a mark that finished, and this one was interrupted by
  // something the caller knows more about than the hook does.
  const clear = useCallback(() => {
    stop()
    setMark(null)
  }, [stop])

  return [mark, show, clear]
}
