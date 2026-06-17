import { useState } from 'react'
import { formatTimerSeconds } from '../hooks/useGameTimer'
import type { TimerMode } from '../lib/games'
import styles from './TimerField.module.css'

/**
 * Bounds for the count-down picker — kept in lockstep with the
 * server-side range check in `common.validate_timer` (1..3600).
 * Minimum 1 second (no zero-length games); max 60 minutes (1 hour
 * is plenty for any cooperative-puzzle gametype).
 */
const MIN_COUNTDOWN_SECONDS = 1
const MAX_COUNTDOWN_SECONDS = 60 * 60

type Props = {
  value: TimerMode
  onChange: (next: TimerMode) => void
}

/**
 * Shared per-game setup field for picking a timer mode.
 *
 * Renders the **None / Up / Down** radio triple plus an MM:SS
 * input that's only editable when "Down" (countdown) is selected.
 * Used by every gametype whose `setup.timer` is server-validated
 * by `common.validate_timer`.
 *
 * The MM:SS text is parsed on every keystroke. When the input is
 * well-formed and in [1s, 60min], the underlying setup value
 * updates to the new seconds count. When it's malformed, the
 * displayed text reflects what the user typed but the setup
 * still carries the most recent *valid* value — so hitting Start
 * always sends something the server will accept. (If the user
 * does manage to send an invalid value, server-side validation
 * rejects with a clear message; the dialog shows it.)
 *
 * Two-digit-only seconds is a deliberate ergonomic choice: it
 * removes the "5:3" ambiguity (5 min 3 sec vs. 5 min 30 sec)
 * without requiring the field to second-guess what the user meant.
 *
 * NOTE: the component is *just the timer fieldset*. Per-game
 * setup forms wrap it in their own `<div>` (alongside other
 * fields) — this file doesn't impose layout outside the fieldset.
 */
export function TimerField({ value, onChange }: Props) {
  // Local text state for the MM:SS input. Initialized from the
  // current setup when countdown, otherwise a sensible default.
  // The text and the setup can diverge briefly while the user
  // types something invalid; the latest *valid* parse goes into
  // the setup.
  const [timerText, setTimerText] = useState(() =>
    value.kind === 'countdown'
      ? formatTimerSeconds(value.seconds)
      : formatTimerSeconds(600),
  )

  function setKind(kind: 'none' | 'countup' | 'countdown') {
    if (kind === 'countdown') {
      // Switching INTO countdown: take the current text input.
      // If it's a valid MM:SS, use it; otherwise fall back to
      // 10:00 so the radio change doesn't fail silently.
      const seconds = parseMmSs(timerText) ?? 600
      onChange({ kind: 'countdown', seconds })
    } else {
      onChange({ kind })
    }
  }

  function setTimerTextAndUpdate(text: string) {
    setTimerText(text)
    if (value.kind === 'countdown') {
      const seconds = parseMmSs(text)
      if (seconds !== null) {
        onChange({ kind: 'countdown', seconds })
      }
    }
  }

  const downSelected = value.kind === 'countdown'
  const textValid = parseMmSs(timerText) !== null

  return (
    <fieldset className={styles.fieldset}>
      <legend>Timer</legend>
      <p className="muted">
        Pick the kind of clock. Count-up is informational (see how
        long you took). Count-down loses the game when the timer
        hits 0.
      </p>
      <div className={styles.timerRow}>
        <label className={styles.radio}>
          <input
            type="radio"
            name="timerKind"
            checked={value.kind === 'none'}
            onChange={() => setKind('none')}
          />
          None
        </label>
        <label className={styles.radio}>
          <input
            type="radio"
            name="timerKind"
            checked={value.kind === 'countup'}
            onChange={() => setKind('countup')}
          />
          Up
        </label>
        <label className={styles.radio}>
          <input
            type="radio"
            name="timerKind"
            checked={downSelected}
            onChange={() => setKind('countdown')}
          />
          Down:
          <input
            type="text"
            className={styles.timerInput}
            value={timerText}
            onChange={(e) => setTimerTextAndUpdate(e.target.value)}
            disabled={!downSelected}
            placeholder="MM:SS"
            inputMode="numeric"
            maxLength={5}
            aria-label="Countdown duration in MM:SS"
            aria-invalid={downSelected && !textValid}
          />
        </label>
      </div>
      {downSelected && !textValid && (
        <p className="error">Enter MM:SS between 0:01 and 60:00.</p>
      )}
    </fieldset>
  )
}

/**
 * Parse a MM:SS string into total seconds. Returns null when the
 * input is malformed or out of range [1, 3600].
 *
 * Accepts 1- or 2-digit minutes (so "5:30" works) and requires
 * exactly 2-digit seconds (so we don't have to disambiguate
 * "5:3" — that's 5 minutes 3 seconds vs. 5 minutes 30 seconds).
 *
 * Exported as a private helper of this component; not for outside
 * use. The TimerField's onChange already gives callers the parsed
 * `seconds` value when it's valid.
 */
function parseMmSs(text: string): number | null {
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const m = Number.parseInt(match[1], 10)
  const s = Number.parseInt(match[2], 10)
  if (s >= 60) return null
  const total = m * 60 + s
  if (total < MIN_COUNTDOWN_SECONDS || total > MAX_COUNTDOWN_SECONDS) {
    return null
  }
  return total
}
