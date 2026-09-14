// cs-blessed-setup-form

import { useState, type ReactNode } from 'react'
import { formatTimerSeconds } from '../timer/useGameTimer'
import { timerLabel } from '../timer/timerLabel'
import { RadioRow } from '../fields/RadioRow'
import type { FormErrors } from '../forms/formState'
import { SetupSection } from './SetupSection'
import type { TimerMode } from '../manifest/gameManifest'
import styles from './SetupTimerSection.module.css'

// Bounds for the count-down picker, kept in lockstep with the server-side range
// check in `common.require_valid_timer` (1..3600): no zero-length games, and an
// hour is plenty for any gametype here.
const MIN_COUNTDOWN_SECONDS = 1
const MAX_COUNTDOWN_SECONDS = 60 * 60

type Props = {
  // What this section is about, under the summary.
  help?: ReactNode
  value: TimerMode
  onChange: (next: TimerMode) => void
  // The form's errors. This section reads the key for the field it draws:
  // `timer`, which is both where its own MM:SS complaint goes and what
  // `common.require_valid_timer` names when it refuses one.
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
 * always sends something the server will accept. Which is why
 * `require_valid_timer` refusing one is a FAULT: getting there
 * means a bug, not a setting typed wrong. It names `timer` all
 * the same, so its words land under this section.
 *
 * Two-digit-only seconds is a deliberate ergonomic choice: it
 * removes the "5:3" ambiguity (5 min 3 sec vs. 5 min 30 sec)
 * without requiring the field to second-guess what the user meant.
 *
 * It draws a `<SetupSection>` and nothing around it, so a setup form places it
 * beside its other sections and this file imposes no layout of its own.
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
  // box right now, while the form's stored one is about whatever was last
  // submitted.
  const timerError = downSelected && !textValid
    ? 'Enter MM:SS between 0:01 and 60:00.'
    : errors.timer

  return (
    // Collapsed by default; the summary carries the current setting (e.g.
    // "Timer: none", "Timer: 2:30 countdown"), so it's readable without opening.
    <SetupSection label={`Timer: ${timerLabel(value)}`} help={help}>
      <RadioRow
        // Named for the SETUP KEY it writes, not for the control. The timer is
        // one field holding one compound value, so `require_valid_timer`'s
        // raises — which say `column = 'timer'` — land here. They are FAULTS,
        // so the modal comes first and this is what is left behind it.
        name="timer"
        error={timerError}
        value={value.kind}
        onChange={setKind}
        options={[
          { value: 'none', label: 'None' },
          { value: 'countup', label: 'Up' },
          {
            value: 'countdown',
            // THE MM:SS BOX LIVES INSIDE THE DOWN OPTION'S LABEL. `label` is a
            // ReactNode and <RadioRow> renders it INSIDE the `<label>`,
            // immediately after the radio, so nesting the input is what the
            // shape already supports — and clicking the box picks Down, which
            // is what we want.
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
 * Private to this file: the section's `onChange` already gives a caller the
 * parsed `seconds` when it is valid.
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
