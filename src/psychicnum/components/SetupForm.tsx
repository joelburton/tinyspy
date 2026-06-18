import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  GUESS_OPTIONS,
  type PsychicNumSetup,
} from '../lib/setup'
import styles from './SetupForm.module.css'

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
 * Controlled component pattern, same as the tinyspy form: state
 * lives in the wrapper; we render from `value` and signal via
 * `onChange`. The single `value as PsychicNumSetup` cast at
 * the top is the boundary between the manifest's `unknown` setup
 * type and psychicnum's narrow shape.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `PsychicNumSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`psychicnum/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as PsychicNumSetup

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
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
