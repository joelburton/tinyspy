import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { BoardConstraints } from '../lib/generate'
import type { BoggleSetup } from '../lib/setup'
import type { LadderName } from '../lib/solver'
import { DICE_SETS } from '../lib/dice'
import styles from '../../common/components/setupForm.module.css'

const LADDER_LABELS: Record<LadderName, string> = {
  basic: 'Standard (3–4:1, 5:2, 6:3, 7:5, 8+:11)',
  flat: 'Flat (1 point per word)',
  fib: 'Fibonacci (longer words climb fast)',
  big: 'Big (steep length bonus)',
}

const MIN_WORD_LENGTHS = [3, 4, 5] as const
type ConstraintKey = 'minWords' | 'minScore' | 'minLongest'

/**
 * boggle's per-game setup form. Mode is locked at the gametype level (which
 * Start button you clicked), so there's no mode radio — just mode-flavored copy.
 * Picks: dice set, required-word difficulty (shared DifficultyField), scoring
 * ladder, minimum word length, optional "board must have…" constraints, and the
 * shared TimerField. Controlled component — state lives in SetupGameDialog;
 * `create_game` re-validates everything server-side.
 */
export function SetupForm({ mode, value, onChange }: SetupBodyProps) {
  const s = value as BoggleSetup
  const c: BoardConstraints = s.constraints ?? {}

  function setConstraint(key: ConstraintKey, raw: string) {
    const next: BoardConstraints = { ...c }
    const n = raw === '' ? NaN : Math.max(0, Math.floor(Number(raw)))
    if (Number.isNaN(n)) delete next[key]
    else next[key] = n
    onChange({ ...s, constraints: Object.keys(next).length ? next : undefined })
  }

  return (
    <div className={styles.setup}>
      <p className="muted">
        {mode === 'compete'
          ? 'Everyone races the same board independently — most points wins. You see each other’s word counts, not the words themselves, until the game ends.'
          : 'Everyone hunts the same board together and the team’s finds pile up into one score.'}
      </p>

      <fieldset className={styles.fieldset}>
        <legend>Board</legend>
        <label>
          Dice set{' '}
          <select
            value={s.dice_set}
            onChange={(e) => onChange({ ...s, dice_set: e.target.value })}
          >
            {DICE_SETS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.desc}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Difficulty</legend>
        <p className="muted">
          The required words — what the board is built around and what the
          end-of-game reveal lists. Rarer real words you find still score as
          bonuses.
        </p>
        <DifficultyField
          label="Required words"
          length={null}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.band}
          onChange={(band) => onChange({ ...s, band })}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Scoring</legend>
        <label>
          Ladder{' '}
          <select
            value={s.scoring_ladder}
            onChange={(e) => onChange({ ...s, scoring_ladder: e.target.value as LadderName })}
          >
            {(Object.keys(LADDER_LABELS) as LadderName[]).map((k) => (
              <option key={k} value={k}>
                {LADDER_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.radioRow}>
          <span>Minimum word length:</span>
          {MIN_WORD_LENGTHS.map((len) => (
            <label key={len} className={styles.radio}>
              <input
                type="radio"
                name="min_word_length"
                checked={s.min_word_length === len}
                onChange={() => onChange({ ...s, min_word_length: len })}
              />
              {len}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Board must have… (optional)</legend>
        <p className="muted">Leave blank for no requirement.</p>
        <label>
          At least{' '}
          <input
            type="number"
            min={0}
            value={c.minWords ?? ''}
            onChange={(e) => setConstraint('minWords', e.target.value)}
            style={{ width: '4em' }}
          />{' '}
          required words
        </label>
        <label>
          A word at least{' '}
          <input
            type="number"
            min={0}
            value={c.minLongest ?? ''}
            onChange={(e) => setConstraint('minLongest', e.target.value)}
            style={{ width: '4em' }}
          />{' '}
          letters long
        </label>
        <label>
          At least{' '}
          <input
            type="number"
            min={0}
            value={c.minScore ?? ''}
            onChange={(e) => setConstraint('minScore', e.target.value)}
            style={{ width: '4em' }}
          />{' '}
          total points
        </label>
      </fieldset>

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
