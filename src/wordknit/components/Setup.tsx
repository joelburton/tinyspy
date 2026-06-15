import { useState } from 'react'
import type { SetupBodyProps } from '../../common/lib/games'
import { formatTimerSeconds } from '../../common/hooks/useGameTimer'
import {
  MAX_COUNTDOWN_SECONDS,
  MIN_COUNTDOWN_SECONDS,
  type WordknitConfig,
} from '../lib/config'
import styles from './Setup.module.css'

/**
 * Wordknit's per-game setup form.
 *
 * Today's one choice: **timer mode** — None / Up (count up
 * from 0; informational) / Down (count down from MM:SS;
 * countdown expiry loses the game). The MM:SS input is only
 * editable when "Down" is selected.
 *
 * The MM:SS text input is parsed on every change. When the
 * input is well-formed and in range, the underlying config
 * updates to the new seconds value. When it's malformed, the
 * displayed text reflects what the user typed but the config
 * carries the most recent *valid* value — so hitting Start
 * always sends something the server will accept. If the user
 * does manage to hit Start with an invalid value, the server-
 * side validation rejects with a clear message; the dialog
 * shows it.
 *
 * Bounds (matching the server-side check): 1 second to 60
 * minutes. Sub-second precision isn't useful for these games,
 * and games over an hour would be a different product entirely.
 *
 * Future setup fields (puzzle date picker, etc.) land
 * alongside the timer fieldset.
 */
export function WordknitSetup({ value, onChange }: SetupBodyProps) {
  const cfg = value as WordknitConfig
  // Local text state for the MM:SS input. Initialized from the
  // current config when countdown, otherwise a sensible default.
  // The text and the config can diverge briefly while the user
  // types something invalid; the latest *valid* parse goes into
  // the config.
  const [timerText, setTimerText] = useState(() =>
    cfg.timer.kind === 'countdown'
      ? formatTimerSeconds(cfg.timer.seconds)
      : formatTimerSeconds(600),
  )

  function setKind(kind: 'none' | 'countup' | 'countdown') {
    if (kind === 'countdown') {
      // Switching INTO countdown: take the current text input.
      // If it's a valid MM:SS, use it; otherwise fall back to
      // 10:00 so the radio change doesn't fail silently.
      const seconds = parseMmSs(timerText) ?? 600
      onChange({ ...cfg, timer: { kind: 'countdown', seconds } })
    } else {
      onChange({ ...cfg, timer: { kind } })
    }
  }

  function setTimerTextAndUpdate(text: string) {
    setTimerText(text)
    if (cfg.timer.kind === 'countdown') {
      const seconds = parseMmSs(text)
      if (seconds !== null) {
        onChange({ ...cfg, timer: { kind: 'countdown', seconds } })
      }
    }
  }

  const downSelected = cfg.timer.kind === 'countdown'
  const textValid = parseMmSs(timerText) !== null

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Timer</legend>
        <p className="muted">
          Pick the kind of clock. Count-up is informational
          (see how long you took). Count-down loses the game
          when the timer hits 0.
        </p>
        <div className={styles.timerRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="timerKind"
              checked={cfg.timer.kind === 'none'}
              onChange={() => setKind('none')}
            />
            None
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="timerKind"
              checked={cfg.timer.kind === 'countup'}
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
          <p className="error">
            Enter MM:SS between 0:01 and 60:00.
          </p>
        )}
      </fieldset>
    </div>
  )
}

/**
 * Parse a MM:SS string into total seconds. Returns null when
 * the input is malformed or out of range [1, 3600].
 *
 * Accepts 1 or 2 digit minutes (so "5:30" works) and requires
 * exactly 2 digit seconds (so we don't have to disambiguate
 * "5:3" — that's 5 minutes 3 seconds vs. 5 minutes 30 seconds).
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
