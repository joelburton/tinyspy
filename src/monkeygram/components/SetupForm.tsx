import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { HAND_SIZE_OPTIONS, type MonkeyGramSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * MonkeyGram's per-game setup form, rendered inside the common
 * `SetupGameDialog`. Two choices:
 *
 *   - **Starter tiles** — how many tiles each player is dealt, one
 *     of {15, 21}. 21 is the Bananagrams default; 15 is a quicker
 *     game.
 *   - **Timer** — the shared `TimerField` (none / count-up / countdown
 *     MM:SS). A countdown that runs out ends the race as a loss for
 *     everyone (`monkeygram.submit_timeout`).
 *
 * Controlled component: state lives in the wrapper; we render `value`
 * and signal via `onChange`. The single cast at the top is the boundary
 * between the manifest's `unknown` setup and our narrow shape.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as MonkeyGramSetup

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Starter tiles per player</legend>
        <p className="muted">
          How many tiles each player is dealt. First to place them all wins.
        </p>
        <div className={styles.radioRow}>
          {HAND_SIZE_OPTIONS.map((n) => (
            <label key={n} className={styles.radio}>
              <input
                type="radio"
                name="hand_size"
                checked={s.hand_size === n}
                onChange={() => onChange({ ...s, hand_size: n })}
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
