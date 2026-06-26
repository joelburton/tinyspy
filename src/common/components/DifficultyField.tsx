import { DIFFICULTY_LABELS, sampleWordsFor, type WordLength } from '../lib/difficulty'
import styles from './DifficultyField.module.css'

type Props = {
  /** Optional field label, e.g. "Required words" — rendered above the select.
   *  Omit it when the surrounding form already supplies one (a fieldset legend);
   *  pass it for the inline two-dropdown layouts. */
  label?: string
  /** Which sample-word set to show — the word length this dictionary cares
   *  about (so the examples match the game). */
  length: WordLength
  /** Selectable band range. Bands outside `[minDifficulty, maxDifficulty]` are
   *  still LISTED but disabled, so a constraint (e.g. "legal ≥ required") is
   *  visible rather than hidden. */
  minDifficulty: number
  maxDifficulty: number
  value: number
  onChange: (band: number) => void
  /** Disable the whole control (e.g. stackdown is locked to band 1). */
  disabled?: boolean
  /** An always-enabled option rendered ABOVE band 1 — for a source that sits
   *  outside the 1..6 difficulty scale. wordle uses `{ value: 0, label:
   *  'Wordle' }` for the curated NYT answer list. */
  extraLowOption?: { value: number; label: string }
}

/**
 * Shared vocabulary-difficulty dropdown for game setup. Always lists all six
 * bands as `"2: Common: AX EX OW BI YO"` — number, label, and a few sample
 * words (from `length`, so a 2-letter dictionary shows 2-letter examples).
 * Bands outside the allowed range render disabled.
 *
 * The band is a `common.words.difficulty` value; each game's RPC does the
 * actual word filtering. See [difficulty.ts](../lib/difficulty.ts) for the
 * bands + samples.
 */
export function DifficultyField({
  label,
  length,
  minDifficulty,
  maxDifficulty,
  value,
  onChange,
  disabled,
  extraLowOption,
}: Props) {
  const samples = sampleWordsFor(length)
  const select = (
    <select
      className={styles.select}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {extraLowOption && (
        <option value={extraLowOption.value}>
          {extraLowOption.value}: {extraLowOption.label}
        </option>
      )}
      {DIFFICULTY_LABELS.map((bandLabel, i) => {
        const band = i + 1
        const examples = samples[i].map((w) => w.toUpperCase()).join(' ')
        return (
          <option
            key={band}
            value={band}
            disabled={band < minDifficulty || band > maxDifficulty}
          >
            {band}: {bandLabel}: {examples}
          </option>
        )
      })}
    </select>
  )

  if (!label) return select
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {select}
    </label>
  )
}
