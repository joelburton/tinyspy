// cs-unmet

import { cls } from '../utils/cls'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import { groupTiles } from './groupTiles'
import styles from './ManualBoardField.module.css'

type Props = AllFieldProps<string> & {
  onChange: (raw: string) => void
  placeholder: string
  chars: number | 'full'
  uppercase?: boolean
  maxLength?: number
  groups?: number[]
  tiles?: (value: string) => string[]
}

/**
 * TYPE THE BOARD YOURSELF — the shared field for entering a game's starting
 * letters by hand, instead of letting the server roll them.
 *
 * Five games want it: spellingbee and wordwheel (a center letter plus the outer
 * ones), wordiply (the starter word), letterboxed (the four sides), boggle (the
 * whole grid). One field type, named once (plans/areas/forms.md).
 *
 * **It is one `<input type="text">`**, deliberately, even where the value has
 * parts. spellingbee takes `A-CHIROT` in a single box and splits on the hyphen
 * rather than offering a 1-character box beside a 6-character one — the single
 * box is the form the summary prints, so the field accepts exactly what the
 * form shows you. That round-trip is the same principle boggle's board
 * string was built on: read a board you liked off the info column or the
 * printout, paste it into a friend's dialog, get the same puzzle.
 *
 * The name says "board" and wordiply's starter is not one; kept anyway because the alternative names for "the letters you'll be playing
 * with" are worse, and four of the five genuinely are boards.
 */
export function ManualBoardField({
  name,
  value,
  onChange,
  placeholder,
  chars,
  label,
  disabled,
  help,
  entryHelp,
  error,
  uppercase = true,
  maxLength,
  groups,
  tiles = (v) => [...v],
}: Props) {
  // What's shown: the letters regrouped, with the dashes in the right places.
  // Derived rather than stored, so there is one truth — the caller never holds
  // a half-formatted string.
  //
  // THE FIELD OWNS THE SEPARATORS IN BOTH DIRECTIONS, which is why the value is
  // stripped of them before it is tiled. Inserting them without ignoring them
  // means each render re-groups its own output, and the dashes multiply: a
  // caller that stores what it is handed goes B → BIC-A → BIC--AE → BIC---A-EM
  // from the fifth letter on. Stripping is also what lets a board be PASTED in
  // any written form — spaced, dashed or run together — and come out looking
  // like every other one.
  const shown = groups ? groupTiles(tiles(value.replace(/[-\s]/g, '')), groups) : value

  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error} name={name}>
      {(id) => (
        <input
          name={name}
          id={id}
          type="text"
          // A board is not prose: none of the browser's helpfulness applies,
          // and autocapitalize in particular would fight boggle's case rule on
          // a phone.
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={maxLength}
          disabled={disabled}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={cls(styles.input, uppercase && styles.upper)}
          // Sized from what it holds rather than a hand-picked rem: `ch` is
          // the width of a `0` in the current font, and the field is monospace,
          // so `chars` is literally how many characters fit. The tracking adds
          // 0.2em per character, and the dashes are characters too.
          style={
            chars === 'full'
              ? { width: '100%' }
              : { width: `calc(${chars}ch + ${chars} * 0.2em + 1.8rem)` }
          }
        />
      )}
    </Field>
  )
}
