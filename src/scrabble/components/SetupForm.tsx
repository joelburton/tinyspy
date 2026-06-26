import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { ScrabbleSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * RackAttack's setup form. Two knobs, shared by both modes:
 *   - the dictionary band (all six offered) — uniquely for RackAttack this
 *     IS the acceptance bar, so a lower band makes a stricter game
 *     (docs/games/scrabble.md §3.3);
 *   - the timer.
 * Controlled component; state lives in the SetupGameDialog wrapper.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as ScrabbleSetup
  return (
    <div className={styles.setup}>
      <p className="muted">
        Build words on the board from your rack of tiles. Words must be in the
        dictionary at the difficulty you pick below.
      </p>
      <DifficultyField
        label="Word difficulty (acceptance bar)"
        length={null}
        minDifficulty={1}
        maxDifficulty={6}
        value={s.difficulty}
        onChange={(difficulty) => onChange({ ...s, difficulty })}
      />
      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
