// cs-unmet

import { useState, type ReactNode } from 'react'
import { formatTimerSeconds } from '../../hooks/game/useGameTimer'
import { timerLabel } from '../../lib/game/timerLabel'
import { RadioRow } from '../fields/RadioRow'
import type { FormErrors } from '../fields/formState'
import { SetupSection } from './SetupSection'
import type { TimerMode } from '../../lib/gameManifest'
import styles from './SetupTimerSection.module.css'

/**
 * Bounds for the count-down picker — kept in lockstep with the
 * server-side range check in `common.require_valid_timer` (1..3600).
 * Minimum 1 second (no zero-length games); max 60 minutes (1 hour
 * is plenty for any cooperative-puzzle gametype).
 */
const MIN_COUNTDOWN_SECONDS = 1
const MAX_COUNTDOWN_SECONDS = 60 * 60

type Props = {
  /** What this section is about, under the summary. */
  help?: ReactNode
  value: TimerMode
  onChange: (next: TimerMode) => void
  /** The form's errors. This section reads the key for the field it draws —
   *  `timer`, which is what `common.require_valid_timer` names when it
   *  refuses one. */
  errors: FormErrors
}

/**
 * Shared per-game setup field for picking a timer mode.
 *
 * Renders the **None / Up / Down** radio triple plus an MM:SS
 * input that's only editable when "Down" (countdown) is selected.
 * Used by every gametype whose `setup.timer` is server-validated
 * by `common.require_valid_timer`.
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
export function SetupTimerSection({ value, onChange, help, errors }: Props) {
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

  // The typed MM:SS is checked HERE rather than by the manifest's `validate`,
  // because the box holds text the setup never sees: an unparseable value
  // simply doesn't call `onChange`, so `setup.timer` still carries the last
  // good one and a cross-field guard reading it would find nothing wrong.
  //
  // It goes in the field's own error slot all the same. It is a message about
  // the timer, and putting it anywhere else would make this the one setting
  // whose complaint arrives somewhere different from every other setting's.
  // It wins over `errors.timer` on the way past: this reflects what is in the
  // box right now, while the form's copy is about whatever was last submitted.
  const timerError = downSelected && !textValid
    ? 'Enter MM:SS between 0:01 and 60:00.'
    : errors.timer

  return (
    // Collapsed by default; the summary carries the current setting (e.g.
    // "Timer: none", "Timer: 2:30 countdown"), so it's readable without opening.
    <SetupSection label={`Timer: ${timerLabel(value)}`} help={help}>
      <RadioRow
        // Named for the SETUP KEY it writes, not for the control. The timer is
        // one field holding one compound value, so a raise saying
        // `column = 'timer'` lands here.
        name="timer"
        error={timerError}
        value={value.kind}
        onChange={setKind}
        options={[
          { value: 'none', label: 'None' },
          { value: 'countup', label: 'Up' },
          {
            value: 'countdown',
            // THE MM:SS BOX LIVES INSIDE THE DOWN OPTION'S LABEL, which is why
            // this was the app's last hand-written radio group — and why it
            // needn't have been. `label` is a ReactNode and <RadioRow> renders
            // it INSIDE the `<label>`, immediately after the radio, so nesting
            // the input is what the shape already supports. Clicking the box
            // therefore picks Down, which is the behavior we had and wanted.
            label: (
              <>
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
                  name="timer.seconds"
                  aria-invalid={downSelected && !textValid}
                />
              </>
            ),
          },
        ]}
      />
    </SetupSection>
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
 * use. The SetupTimerSection's onChange already gives callers the parsed
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
