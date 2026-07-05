import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { TimerField } from '../../common/components/fields/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { StackdownSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

/**
 * stackdown's setup form, rendered inside the common SetupGameDialog.
 * A random board is dealt from the pre-generated library, filtered to the
 * chosen word-difficulty `band`. Two knobs: the `DifficultyField` (bands
 * 1..2 — that's what the board library holds) and the shared `TimerField`.
 * Controlled component (state lives in the wrapper); shared by both
 * manifests (mode doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as StackdownSetup

  return (
    <div className={styles.setup}>
      <p className="muted">
        A random tile-stack is dealt when the game starts. Clear it by
        spelling words off the exposed tiles.
      </p>
      <DifficultyField
        label="Word difficulty"
        length={5}
        minDifficulty={1}
        maxDifficulty={2}
        value={s.band}
        onChange={(band) => onChange({ ...s, band })}
      />
      <p className="muted">
        Band 1 is the common everyday words; band 2 uses the next tier
        of less-common ones.
      </p>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
