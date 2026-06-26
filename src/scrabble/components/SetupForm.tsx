import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { ScrabbleSetup } from '../lib/setup'
import styles from '../../common/components/setupForm.module.css'

/**
 * scrabble's setup form. Shared by both modes:
 *   - two dictionary bands (all six offered each) — separate ceilings for
 *     2-letter and 3+-letter words (the MonkeyGram split). Uniquely for
 *     scrabble these ARE the acceptance bar, so a lower band makes a stricter
 *     game (docs/games/scrabble.md §3.3);
 *   - the timer.
 * Controlled component; state lives in the SetupGameDialog wrapper.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as ScrabbleSetup
  return (
    <div className={styles.setup}>
      <p className="muted">
        Build words on the board from your rack of tiles. A word is accepted if
        it's in the dictionary at the difficulty you pick for its length.
      </p>
      <DifficultyField
        label="2-letter words"
        length={2}
        minDifficulty={1}
        maxDifficulty={6}
        value={s.dict_2}
        onChange={(dict_2) => onChange({ ...s, dict_2 })}
      />
      <DifficultyField
        label="Longer words (3+)"
        length="3+"
        minDifficulty={1}
        maxDifficulty={6}
        value={s.dict_3plus}
        onChange={(dict_3plus) => onChange({ ...s, dict_3plus })}
      />
      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
