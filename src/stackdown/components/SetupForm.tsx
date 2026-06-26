import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { StackdownSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * StackDown's setup form, rendered inside the common SetupGameDialog.
 * The board is claimed at random from the pre-generated library, so the
 * only real knob is the shared `TimerField`. We also show a (disabled)
 * word-difficulty field so players can see StackDown is fixed to the most
 * common 5-letter words — its boards are pre-generated at band 1.
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
        maxDifficulty={1}
        value={1}
        onChange={() => {}}
        disabled
      />
      <p className="muted">
        StackDown is fixed to the most common 5-letter words.
      </p>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
