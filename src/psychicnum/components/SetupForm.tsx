import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  GUESS_OPTIONS,
  MAX_NUMBER_OPTIONS,
  type PsychicnumSetup,
} from '../lib/setup'
import styles from '../../common/components/setupForm.module.css'

/**
 * psychicnum's per-game setup form, rendered inside the common
 * `SetupGameDialog`. One choice for the players:
 *
 *   - **Guesses** — total guess budget shared across all members,
 *     one of {3, 5, 7, 9}. 7 is the historical default; 3 is the
 *     hard mode, 5 medium, 9 the easy warm-up.
 *
 * No member-aware UI (every guess is interchangeable; no seats),
 * no auto-seeding logic — the manifest's defaults already cover
 * a usable initial state.
 *
 * Controlled component pattern, same as the codenamesduet form: state
 * lives in the wrapper; we render from `value` and signal via
 * `onChange`. The single `value as PsychicnumSetup` cast at
 * the top is the boundary between the manifest's `unknown` setup
 * type and psychicnum's narrow shape.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `PsychicnumSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`psychicnum/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as PsychicnumSetup

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Guesses per player</legend>
        {/* Copy is mode-neutral on purpose — the same SetupForm
            backs both psychicnum_coop and psychicnum_compete
            manifests. In coop this is the shared pool (per-player
            value equals shared value because everyone decrements
            in lock-step); in compete each player gets this many
            independently. The number-on-the-radio carries the
            same meaning either way. */}
        <p className="muted">
          How many guesses each player starts with.
        </p>
        <div className={styles.radioRow}>
          {GUESS_OPTIONS.map((n) => (
            <label key={n} className={styles.radio}>
              <input
                type="radio"
                name="guesses"
                checked={s.guesses === n}
                onChange={() => onChange({ ...s, guesses: n })}
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend>Highest number</legend>
        {/* The board shows 1..max_number; a bigger range means more number
            tiles and a harder guess. Same meaning in both modes. */}
        <p className="muted">
          The board runs 1–{s.max_number}; the secret is somewhere in that range.
        </p>
        <select
          value={s.max_number}
          onChange={(e) => onChange({ ...s, max_number: Number(e.target.value) })}
        >
          {MAX_NUMBER_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </fieldset>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
