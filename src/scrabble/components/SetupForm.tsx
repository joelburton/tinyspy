import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { TimerField } from '../../common/components/fields/TimerField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import type { ScrabbleSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

/**
 * scrabble's setup form. Shared by both modes:
 *   - two dictionary bands (all six offered each) — separate ceilings for
 *     2-letter and 3+-letter words (the bananagrams split). Uniquely for
 *     scrabble these ARE the acceptance bar, so a lower band makes a stricter
 *     game (docs/games/scrabble.md §3.3);
 *   - the timer.
 * Controlled component; state lives in the SetupGameDialog wrapper.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as ScrabbleSetup

  // Disclosure summary carries the current bands so the section reads without
  // opening (the boggle/spellingbee pattern — 2-letter band first, then 3+).
  const dictLabel = `Dictionaries: ${difficultyValue(s.dict_2)} / ${difficultyValue(s.dict_3plus)}`

  return (
    <div className={styles.setup}>
      <p className="muted">
        Build words on the board from your rack of tiles. A word is accepted if
        it's in the dictionary at the difficulty you pick for its length.
      </p>
      <SetupSection label={dictLabel}>
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
      </SetupSection>
      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
