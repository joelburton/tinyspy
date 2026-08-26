// cs-audited

import { DIFFICULTY_LABELS, sampleWordsFor, type WordLength } from '../../lib/game/difficulty'
import type { ReactNode } from 'react'
import { SelectField } from './SelectField'

type Props = {
  /** Optional field label, e.g. "Required words" — rendered above the select.
   *  Omit it when the surrounding form already supplies one (a fieldset legend);
   *  pass it for the inline two-dropdown layouts. */
  label?: string
  /** Which sample-word set to show — the word length this dictionary cares
   *  about (so the examples match the game). */
  length: WordLength
  /** Selectable band range. Bands outside `[minBand, maxBand]` are still
   *  LISTED but disabled, so a constraint (e.g. "legal ≥ required") is visible
   *  rather than hidden. */
  minBand: number
  maxBand: number
  value: number
  onChange: (band: number) => void
  /** Disable the whole control (e.g. stackdown is locked to band 1). */
  disabled?: boolean
  /** What the setting is about, between the caption and the control. */
  help?: ReactNode
  /** How to type it, under the control. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. */
  error?: string | null
  /** An always-enabled option rendered ABOVE band 1 — for a source that sits
   *  outside the 1..6 band scale. wordle uses `{ value: 0, label: 'Wordle' }`
   *  for the curated NYT answer list. */
  extraLowOption?: { value: number; label: string }
}

/**
 * WHICH DICTIONARY — the shared band picker for game setup. Lists all six bands
 * as `"2: Common: AX EX OW BI YO"` (number, name, and a few sample words drawn
 * from `length`, so a 2-letter dictionary shows 2-letter examples), with bands
 * outside the allowed range LISTED but disabled — a constraint you can see
 * beats one that silently hides its options.
 *
 * **`DictBandField`, not `DifficultyField`** (Joel, 2026-08-26): what a player
 * picks here is which slice of the word list the game draws from, and "band" is
 * the word every summary already uses — `Dictionary: 3 (Familiar)`. "Difficulty"
 * named the CONSEQUENCE, and named it ambiguously, since several of these games
 * have a separate difficulty knob that has nothing to do with vocabulary.
 *
 * The band is a `common.words.difficulty` value and the column keeps that name —
 * it is the DB's word, and each game's RPC does the actual filtering. See
 * `lib/game/difficulty.ts` for the bands and their samples.
 */
export function DictBandField({
  label,
  length,
  minBand,
  maxBand,
  value,
  onChange,
  disabled,
  extraLowOption,
  help,
  entryHelp,
  error,
}: Props) {
  const samples = sampleWordsFor(length)
  return (
    <SelectField
      label={label}
      help={help}
      entryHelp={entryHelp}
      error={error}
      value={value}
      disabled={disabled}
      onChange={(v) => onChange(Number(v))}
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
            disabled={band < minBand || band > maxBand}
          >
            {band}: {bandLabel}: {examples}
          </option>
        )
      })}
    </SelectField>
  )
}
