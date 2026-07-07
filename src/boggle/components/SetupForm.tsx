import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import type { BoardConstraints } from '../lib/generate'
import { WIN_PERCENT_OPTIONS, type BoggleSetup } from '../lib/setup'
import type { LadderName } from '../lib/solver'
import { DICE_SETS } from '../lib/dice'
import shared from '../../common/components/fields/setupForm.module.css'
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

  function setConstraint(key: NumKey, raw: string) {
    const next: BoardConstraints = { ...c }
    const trimmed = raw.trim()
    if (trimmed === '') delete next[key]
    else next[key] = Math.max(0, Math.floor(Number(trimmed)))
    onChange({ ...s, constraints: Object.keys(next).length ? next : undefined })
  }

  // Disclosure summaries carry the current value so each section reads without
  // opening (the spellingbee pattern — see its SetupForm).
  const diceLabel = `Dice set: ${DICE_SETS.find((d) => d.name === s.dice_set)?.desc ?? s.dice_set}`
  const dictLabel = `Dictionaries: ${difficultyValue(s.band)} / ${difficultyValue(s.legal_band)}`
  const ladderLabel =
    SCORING_LADDERS.find((l) => l.name === s.scoring_ladder)?.label ?? s.scoring_ladder
  const scoringLabel = `Scoring: ${ladderLabel} / Min length: ${s.min_word_length}`
  const winLabel = `Win at: ${s.win_percent === null ? 'None' : `${s.win_percent}%`}`

  return (
    <div className={shared.setup}>
      <p className="muted">
        {mode === 'compete'
          ? 'Everyone races the same board independently — most points wins. You see each other’s word counts, not the words themselves, until the game ends.'
          : 'Everyone hunts the same board together and the team’s finds pile up into one score.'}
      </p>

      {/* "Dice set" — the summary names the chosen set (e.g. "Dice set: 4×4
          Revised"); expand to change it. */}
      <SetupSection label={diceLabel}>
        <SelectField
          label="Dice set"
          value={s.dice_set}
          onChange={(dice_set) => onChange({ ...s, dice_set })}
        >
          {DICE_SETS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.desc}
            </option>
          ))}
        </SelectField>
      </SetupSection>

      {/* "Dictionaries" — the required/legal word bands, the summary showing the
          current bands (e.g. "Dictionaries: 3 (Familiar) / 5 (Obscure)"), matching
          spellingbee's section of the same name. */}
      <SetupSection label={dictLabel}>
        <p className="muted">
          <strong>Required words</strong> are what the board is built around and
          what the end-of-game reveal lists. <strong>Legal words</strong> set how
          obscure a non-required word can be and still score as a bonus — these
          filter on difficulty only (any spelling/dialect counts), so a higher
          band rewards digging up rarer finds.
        </p>
        <DifficultyField
          label="Required words"
          length={null}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.band}
          // The legal band can never sit below the required band (every required
          // word is also legal) — pull it up with the required band when needed.
          onChange={(band) => onChange({ ...s, band, legal_band: Math.max(band, s.legal_band) })}
        />
        <DifficultyField
          label="Legal (bonus) words"
          length={null}
          minDifficulty={s.band}
          maxDifficulty={6}
          value={s.legal_band}
          onChange={(legal_band) => onChange({ ...s, legal_band })}
        />
      </SetupSection>

      {/* "Scoring" — the summary shows both picks (e.g. "Ladder: Basic: 1–11 /
          Min length: 3"). */}
      <SetupSection label={scoringLabel}>
        <SelectField
          label="Ladder"
          value={s.scoring_ladder}
          onChange={(ladder) => onChange({ ...s, scoring_ladder: ladder as LadderName })}
        >
          {SCORING_LADDERS.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label}
            </option>
          ))}
        </SelectField>
        {/* Breathing room between the ladder dropdown and the min-length row. */}
        <div className={styles.scoringRowGap}>
          <RadioRow
            name="min_word_length"
            prefix="Minimum word length:"
            options={MIN_WORD_LENGTHS.map((len) => ({ value: len, label: len }))}
            value={s.min_word_length}
            onChange={(min_word_length) => onChange({ ...s, min_word_length })}
          />
        </div>
      </SetupSection>

      {/* "Winning" — the summary shows the current target (e.g. "Win at: 70%"). */}
      <SetupSection label={winLabel}>
        <p className="muted">
          Win by reaching this share of the required-words score
          {mode === 'compete' ? ' (first player there wins)' : ' (the team wins together)'}
          , or <strong>None</strong> to play until you End (or the timer runs out).
        </p>
        <SelectField
          label="Win at"
          value={s.win_percent === null ? 'none' : String(s.win_percent)}
          onChange={(v) => onChange({ ...s, win_percent: v === 'none' ? null : Number(v) })}
        >
          {WIN_PERCENT_OPTIONS.map((p) => (
            <option key={p ?? 'none'} value={p === null ? 'none' : String(p)}>
              {p === null ? 'None' : `${p}%`}
            </option>
          ))}
        </SelectField>
      </SetupSection>

      {/* "Board constraints" — the optional min/max grid, in the same disclosure
          chrome as the sections above. Closed by default like every section. */}
      <SetupSection label="Board constraints">
        <div className={styles.grid}>
          <span />
          <span className={styles.colHead}>min</span>
          <span className={styles.colHead}>max</span>
          {CONSTRAINT_ROWS.map((row) => (
            <Row key={row.label} row={row} c={c} onSet={setConstraint} />
          ))}
        </div>
      </SetupSection>

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
