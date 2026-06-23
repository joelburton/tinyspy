import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { GUESS_OPTIONS, type WordleSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * WordNerd's setup form, rendered inside the common SetupGameDialog.
 * One choice plus the timer:
 *
 *   - **Guesses** — the budget (5–8; 6 is classic Wordle). In coop it's
 *     shared by the team; in compete it's each player's own.
 *
 * Plus the shared `TimerField`. Controlled component (state lives in the
 * wrapper); shared by both manifests (mode doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as WordleSetup

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Guesses</legend>
        <p className="muted">How many guesses you get (6 is classic).</p>
        <select
          className={styles.select}
          name="max_guesses"
          value={s.max_guesses}
          onChange={(e) =>
            onChange({ ...s, max_guesses: Number(e.target.value) })
          }
        >
          {GUESS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} guesses
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
