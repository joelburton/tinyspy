// cs-unmet

import { DIFFICULTY_LABELS, sampleWordsFor, type WordLength } from '../setup-form/difficulty'
import { SelectField } from './SelectField'
import type { AllFieldProps } from './fieldProps'

type Props = AllFieldProps<number> & {
  onChange: (band: number) => void
  length: WordLength
  minBand: number
  maxBand: number
  extraLowOption?: { value: number; label: string }
}

/**
 * WHICH DICTIONARY — the shared band picker for game setup. Lists all six bands
 * as `"2: Common: AX EX OW BI YO"` (number, name, and a few sample words drawn
 * from `length`, so a 2-letter dictionary shows 2-letter examples), with bands
 * outside the allowed range LISTED but disabled — a constraint you can see
 * beats one that silently hides its options.
 *
 * **`DictBandField`, not `DifficultyField`**: what a player
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
  name,
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
      name={name}
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
