import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { StackdownSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * StackDown's setup form, rendered inside the common SetupGameDialog.
 * The board is claimed at random from the pre-generated library, so
 * there's nothing to pick about the puzzle itself yet — the only knob is
 * the shared `TimerField`. Controlled component (state lives in the
 * wrapper); shared by both manifests (mode doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as StackdownSetup

  return (
    <div className={styles.setup}>
      <p className="muted">
        A random tile-stack is dealt when the game starts. Clear it by
        spelling words off the exposed tiles.
      </p>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
