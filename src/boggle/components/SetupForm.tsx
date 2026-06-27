import { useState } from 'react'
import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { BoardConstraints } from '../lib/generate'
import type { BoggleSetup } from '../lib/setup'
import type { LadderName } from '../lib/solver'
import { DICE_SETS } from '../lib/dice'
import shared from '../../common/components/setupForm.module.css'
import styles from './SetupForm.module.css'

// Ladder labels + order ported verbatim from wsboggle (NewSoloGamePage.tsx).
const SCORING_LADDERS: ReadonlyArray<{ name: LadderName; label: string }> = [
  { name: 'basic', label: 'Basic: 1–11' },
  { name: 'flat', label: 'Flat: 1' },
  { name: 'fib', label: 'Fibonacci: 1–377' },
  { name: 'big', label: 'Prefer big: 1–50' },
]

const MIN_WORD_LENGTHS = [3, 4, 5] as const

// The numeric board-constraint keys (BoardConstraints also has non-numeric
// minWordLength/ladder, which the grid doesn't touch).
type NumKey = 'minWords' | 'maxWords' | 'minScore' | 'maxScore' | 'minLongest' | 'maxLongest'

// min/max pairs, mirroring wsboggle's GameConstraints rows.
const CONSTRAINT_ROWS: ReadonlyArray<{ label: string; min: NumKey; max: NumKey }> = [
  { label: 'Words', min: 'minWords', max: 'maxWords' },
  { label: 'Score', min: 'minScore', max: 'maxScore' },
  { label: 'Longest', min: 'minLongest', max: 'maxLongest' },
]

function constraintsActive(c: BoardConstraints): boolean {
  return CONSTRAINT_ROWS.some((r) => c[r.min] !== undefined || c[r.max] !== undefined)
}

/**
 * boggle's per-game setup form. Mode is locked at the gametype level (which
 * Start button you clicked), so there's no mode radio — just mode-flavored copy.
 * Picks: dice set, required-word difficulty (shared DifficultyField), scoring
 * ladder, minimum word length, optional Board constraints (a collapsible min/max
 * grid like wsboggle's), and the shared TimerField. Controlled component —
 * state lives in SetupGameDialog; `create_game` re-validates server-side.
 */
export function SetupForm({ mode, value, onChange }: SetupBodyProps) {
  const s = value as BoggleSetup
  const c: BoardConstraints = s.constraints ?? {}
  const [constraintsOpen, setConstraintsOpen] = useState(constraintsActive(c))

  function setConstraint(key: NumKey, raw: string) {
    const next: BoardConstraints = { ...c }
    const trimmed = raw.trim()
    if (trimmed === '') delete next[key]
    else next[key] = Math.max(0, Math.floor(Number(trimmed)))
    onChange({ ...s, constraints: Object.keys(next).length ? next : undefined })
  }

  return (
    <div className={shared.setup}>
      <p className="muted">
        {mode === 'compete'
          ? 'Everyone races the same board independently — most points wins. You see each other’s word counts, not the words themselves, until the game ends.'
          : 'Everyone hunts the same board together and the team’s finds pile up into one score.'}
      </p>

      <fieldset className={shared.fieldset}>
        <legend>Board</legend>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Dice set</span>
          <select
            className={styles.select}
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

      <fieldset className={shared.fieldset}>
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

      <fieldset className={shared.fieldset}>
        <legend>Scoring</legend>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Ladder</span>
          <select
            className={styles.select}
            value={s.scoring_ladder}
            onChange={(e) => onChange({ ...s, scoring_ladder: e.target.value as LadderName })}
          >
            {SCORING_LADDERS.map((l) => (
              <option key={l.name} value={l.name}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className={shared.radioRow}>
          <span>Minimum word length:</span>
          {MIN_WORD_LENGTHS.map((len) => (
            <label key={len} className={shared.radio}>
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

      <fieldset className={shared.fieldset}>
        <legend>
          <button
            type="button"
            className={styles.discHeader}
            onClick={() => setConstraintsOpen((o) => !o)}
            aria-expanded={constraintsOpen}
          >
            <span className={styles.disclosure}>{constraintsOpen ? '▾' : '▸'}</span>
            Board constraints
            {!constraintsOpen && constraintsActive(c) && <span className={styles.active}>active</span>}
          </button>
        </legend>
        {constraintsOpen && (
          <div className={styles.grid}>
            <span />
            <span className={styles.colHead}>min</span>
            <span className={styles.colHead}>max</span>
            {CONSTRAINT_ROWS.map((row) => (
              <Row key={row.label} row={row} c={c} onSet={setConstraint} />
            ))}
          </div>
        )}
      </fieldset>

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}

function Row({
  row,
  c,
  onSet,
}: {
  row: { label: string; min: NumKey; max: NumKey }
  c: BoardConstraints
  onSet: (key: NumKey, raw: string) => void
}) {
  return (
    <>
      <span className={styles.rowLabel}>{row.label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={styles.numInput}
        placeholder="—"
        value={c[row.min] ?? ''}
        onChange={(e) => onSet(row.min, e.target.value)}
      />
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className={styles.numInput}
        placeholder="—"
        value={c[row.max] ?? ''}
        onChange={(e) => onSet(row.max, e.target.value)}
      />
    </>
  )
}
