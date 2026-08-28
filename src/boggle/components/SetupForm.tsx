// cs-unmet

import { DictBandField } from '../../common/components/fields/DictBandField'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SelectField } from '../../common/components/fields/SelectField'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import type { BoardConstraints } from '../lib/generate'
import { WIN_PERCENT_OPTIONS, type BoggleValues } from '../lib/setup'
import { capBoard, cleanCustomBoard, readTiles, twoLetterList } from '../lib/customBoard'
import type { LadderName } from '../lib/solver'
import { DICE_SETS, DICE_BY_NAME } from '../lib/dice'
import styles from './SetupForm.module.css'
import { ManualBoardField } from '../../common/components/fields/ManualBoardField'
import { groupTiles } from '../../common/components/fields/groupTiles'

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
 * Picks: dice set, required-word difficulty (form DictBandField), scoring
 * ladder, minimum word length, optional Board constraints (a collapsible min/max
 * grid like wsboggle's), and the form SetupTimerSection. Controlled component —
 * state lives in SetupGameModal; `create_game` re-validates server-side.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue,
}: SetupBodyProps) {
  const s = values as BoggleValues
  const set = setValue as SetupSetter<BoggleValues>
  const c: BoardConstraints = s.constraints ?? {}

  function setConstraint(key: NumKey, raw: string) {
    const next: BoardConstraints = { ...c }
    const trimmed = raw.trim()
    if (trimmed === '') delete next[key]
    else next[key] = Math.max(0, Math.floor(Number(trimmed)))
    set('constraints', Object.keys(next).length ? next : undefined)
  }

  // Disclosure summaries carry the current value so each section reads without
  // opening (the spellingbee pattern — see its SetupForm).
  const diceLabel = `Dice set: ${DICE_SETS.find((d) => d.name === s.dice_set)?.desc ?? s.dice_set}`
  // The chosen dice set fixes the board's side length, which is the whole
  // relationship between it and a custom board: n² tiles, or the Start gate
  // says so (lib/setup.ts → customBoardError).
  const diceSet = DICE_BY_NAME[s.dice_set]
  const customBoard = s.custom_board ?? ''
  // The rows the chosen dice set implies — the field groups by these, and so
  // does the summary, from the same function. A summary that did its own
  // arithmetic could disagree with the box right under it.
  const boardRows = diceSet ? Array.from({ length: diceSet.n }, () => diceSet.n) : []
  const customBoardLabel = customBoard
    ? `Custom board: ${groupTiles(readTiles(customBoard), boardRows)}`
    : 'Custom board (optional)'
  const dictLabel = `Dictionaries: ${difficultyValue(s.band)} / ${difficultyValue(s.legal_band)}`
  const ladderLabel =
    SCORING_LADDERS.find((l) => l.name === s.scoring_ladder)?.label ?? s.scoring_ladder
  const scoringLabel = `Scoring: ${ladderLabel} / Min length: ${s.min_word_length}`
  const winLabel = `Win at: ${s.win_percent === null ? 'None' : `${s.win_percent}%`}`

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />

      {/* "Dice set" — the summary names the chosen set (e.g. "Dice set: 4×4
          Revised"); expand to change it. */}
      <SetupSection label={diceLabel}>
        <SelectField
          name="dice_set"
          label="Dice set"
          value={s.dice_set}
          // CHANGING THE DICE SET CLEARS THE CUSTOM BOARD. The set fixes the
          // side length, so a board typed for one is the wrong SIZE for another
          // — 16 tiles against a 5×5's 25 — and the Start gate would refuse it
          // with a count error about a board the player didn't just type.
          // Dropping it puts them back on the normal path (roll one) instead of
          // handing them a puzzle to solve. It also can't lose much: a set
          // change is a decision about what kind of board you want, and a
          // custom board is the answer to that question.
          onChange={(dice_set) => { set('dice_set', dice_set); set('custom_board', undefined) }}
        >
          {DICE_SETS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.desc}
            </option>
          ))}
        </SelectField>
      </SetupSection>

      {/* Optional custom board, behind a disclosure whose summary shows the typed
          tiles (e.g. "Custom board: ABCD-EFGH-IJKL-MNOP") or "(optional)" when
          blank. Blank → a rolled board (the normal path); fill it to play exactly
          these tiles — which is how you hand a friend a board you liked, read
          straight off its info column or its printout.

          Sits under "Dice set" because that's what it depends on: the chosen set
          fixes the side length, so it fixes the tile count. Start is gated on
          `customBoardError` (via the manifest's validate), so a miscounted or
          unreadable board blocks it with an inline reason. Cleared input stores
          `undefined` so the edge function sees it as absent → roll. */}
      <SetupSection label={customBoardLabel}>
        <ManualBoardField
          help={<>Leave blank to roll a random board, or type one: every tile, rows top to bottom{diceSet ? ` (${diceSet.n * diceSet.n} of them for a ${diceSet.desc})` : ''}. Write a two-letter tile the way it prints — {twoLetterList()} — and{' '} <strong>?</strong> for a blank.</>}
          name="custom_board"
          value={customBoard}
          onChange={(raw) =>
            // Capped in TILES, not characters — a `Qu` is one tile and two
            // characters, so `maxLength` could not say "a full board".
            set(
              'custom_board',
              (diceSet
                ? capBoard(cleanCustomBoard(raw), diceSet.n)
                : cleanCustomBoard(raw)) || undefined,
            )
          }
          placeholder={diceSet ? exampleBoard(diceSet.n) : ''}
          chars="full"
          // THE ONE GAME THAT KEEPS ITS CASE. `Qu` is one tile and `QU` is a Q
          // beside a U — both are real boards — so uppercasing the display would
          // show a different board than the field holds, and contradict the
          // recap and the printout, which both write `Qu`.
          uppercase={false}
          // Dashes between ROWS, counted in TILES — so `Qu` is one and the dash
          // lands where the row really ends. Type `ABQU` into a 4-wide board and
          // the dash arrives a tile early, which is the miscount made visible.
          groups={diceSet ? boardRows : undefined}
          tiles={readTiles}
        />
      </SetupSection>

      {/* "Dictionaries" — the required/legal word bands, the summary showing the
          current bands (e.g. "Dictionaries: 3 (Familiar) / 5 (Obscure)"), matching
          spellingbee's section of the same name. */}
      <SetupSection label={dictLabel}>
        <DictBandField
          name="band"
          label="Required words"
          help="What the board is built around, and what the end-of-game reveal lists."
          length={null}
          minBand={1}
          maxBand={6}
          value={s.band}
          // The legal band can never sit below the required band (every required
          // word is also legal) — pull it up with the required band when needed.
          onChange={(band) => { set('band', band); set('legal_band', Math.max(band, s.legal_band)) }}
        />
        <DictBandField
          name="legal_band"
          label="Legal (bonus) words"
          help="How obscure a non-required word can be and still score as a bonus. These filter on difficulty only (any spelling or dialect counts), so a higher band rewards digging up rarer finds."
          length={null}
          minBand={s.band}
          maxBand={6}
          value={s.legal_band}
          onChange={(legal_band) => set('legal_band', legal_band)}
        />
      </SetupSection>

      {/* "Scoring" — the summary shows both picks (e.g. "Ladder: Basic: 1–11 /
          Min length: 3"). */}
      <SetupSection label={scoringLabel}>
        <SelectField
          name="scoring_ladder"
          label="Ladder"
          value={s.scoring_ladder}
          onChange={(ladder) => set('scoring_ladder', ladder as LadderName)}
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
            onChange={(min_word_length) => set('min_word_length', min_word_length)}
          />
        </div>
      </SetupSection>

      {/* "Winning" — the summary shows the current target (e.g. "Win at: 70%"). */}
      <SetupSection label={winLabel}>
        <SelectField
          name="win_percent"
          help={<>Win by reaching this share of the required-words score {mode === 'compete' ? ' (first player there wins)' : ' (the team wins together)'} , or <strong>None</strong> to play until you End (or the timer runs out).</>}
          label="Win at"
          value={s.win_percent === null ? 'none' : String(s.win_percent)}
          onChange={(v) => set('win_percent', v === 'none' ? null : Number(v))}
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

      <SetupTimerSection value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}

/**
 * The custom-board field's placeholder: n rows of n letters, so the shape the
 * field wants is visible before anything is typed. Alphabetical and wrapped at
 * Z — a shape, deliberately not a board anyone would play.
 */
function exampleBoard(n: number): string {
  const rows: string[] = []
  for (let y = 0; y < n; y++) {
    let row = ''
    for (let x = 0; x < n; x++) row += String.fromCharCode(65 + ((y * n + x) % 26))
    rows.push(row)
  }
  // Dashed, because the field dashes: a placeholder is an EXAMPLE of what you
  // are about to type, and one written differently teaches the wrong shape.
  return rows.join('-')
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
