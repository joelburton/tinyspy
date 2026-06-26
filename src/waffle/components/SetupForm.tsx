import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { EXTRA_SWAP_OPTIONS, type WaffleSetup } from '../lib/setup'
import styles from '../../common/components/setupForm.module.css'

/**
 * waffle's setup form, rendered inside the common SetupGameDialog.
 * Two choices plus the timer:
 *
 *   - **Word difficulty** — which vocabulary band (1..6) the six 5-letter
 *     words are drawn from (sets `difficulty`), via the shared DifficultyField.
 *   - **Swap budget** — how many *extra* swaps beyond the puzzle's
 *     par you get. Fewer = harder. `max_swaps = par + extra_swaps`.
 *
 * Plus the shared `TimerField`.
 *
 * Controlled component (state lives in the wrapper); the single
 * `value as WaffleSetup` cast is the boundary between the manifest's
 * `unknown` setup and waffle's shape. Shared by both manifests (mode
 * doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as WaffleSetup

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Word difficulty</legend>
        <p className="muted">Which vocabulary the puzzle's words come from.</p>
        <DifficultyField
          length={5}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.difficulty}
          onChange={(difficulty) => onChange({ ...s, difficulty })}
        />
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend>Swap budget</legend>
        <p className="muted">
          Extra swaps beyond the puzzle's minimum — fewer is harder.
        </p>
        <div className={styles.radioRow}>
          {EXTRA_SWAP_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.radio}>
              <input
                type="radio"
                name="extra_swaps"
                checked={s.extra_swaps === opt.value}
                onChange={() => onChange({ ...s, extra_swaps: opt.value })}
              />
              {opt.label} <span className="muted">(+{opt.value})</span>
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
