import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { TimerField } from '../../common/components/fields/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { WordiplySetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

/**
 * wordiply's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button the player clicked), so this
 * body never renders a mode radio.
 *
 * It's deliberately minimal: a mode paragraph, one dictionary-difficulty
 * band (the base is a letter-combination, not a word, so there's no base
 * difficulty; and wordiply isn't a race-to-rank, so no target-rank picker),
 * and the shared `<TimerField>`.
 *
 * Controlled component: state lives in the wrapping `SetupGameDialog`; this
 * body renders `value` and signals via `onChange`.
 */
export function SetupForm({ mode, value, onChange }: SetupBodyProps) {
  const s = value as WordiplySetup

  return (
    <div className={styles.setup}>
      {mode === 'coop' ? (
        <p className="muted">
          Everyone in the club shares five guesses. Each guess must contain
          the starter and be longer than it; together you're hunting the
          longest word.
        </p>
      ) : (
        <p className="muted">
          Each player gets their own five guesses off the same starter. The
          longest word wins; until the end you only see how many guesses each
          other has spent, not the words.
        </p>
      )}

      <DifficultyField
        label="Dictionary"
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
