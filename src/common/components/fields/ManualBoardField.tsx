// cs-fixed

import type { ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import { Field } from './Field'
import { groupTiles } from './groupTiles'
import styles from './ManualBoardField.module.css'

type Props = {
  /** The text as typed. Controlled — the caller owns it, and stores whatever
   *  shape its own setup blob wants. */
  value: string
  /** Fired with the RAW keystroke result. The caller cleans it (each game's
   *  rules differ: spellingbee lowercases and truncates, boggle keeps case and
   *  spaces) and decides what reaches its setup. */
  onChange: (raw: string) => void
  /** An EXAMPLE, in the same shape as real input — `A-CHIROT`, `MOTH`,
   *  `ABC-DEF-GHI-JKL`. It teaches the format, which is the whole reason this
   *  field can be a single box with no sub-labels. */
  placeholder: string
  /** How wide, in characters of the expected content. Replaces the five
   *  hand-picked rem widths these fields used to carry; `full` is boggle, whose
   *  content is a whole grid. */
  chars: number | 'full'
  /** The caption above the box. Every field can have one; today's five callers
   *  don't pass it, because each sits in a `<SetupSection>` whose summary is
   *  already the caption ("Custom letters: A-CHIROT"). The prop exists so the
   *  next one doesn't have to reinvent the row. */
  label?: ReactNode
  /** The name, for when there is no caption — which is all five callers today. */
  ariaLabel?: string
  /**
   * Draw the entry uppercase. Default true.
   *
   * **boggle passes false, and it is the only one.** A display transform does
   * not change the value, which is harmless where case carries no meaning — but
   * boggle's two-letter tiles are recognized BY their case (`Qu` is one tile,
   * `QU` is a Q beside a U), so a field showing `QU` while holding `Qu` would
   * contradict the board it is describing, and contradict the recap and the
   * printout, which both say `Qu`.
   */
  uppercase?: boolean
  /** Cap the keystrokes. Omit where length is checked by the validator instead
   *  (boggle counts tiles, not characters). */
  maxLength?: number
  /** What the setting is about, between the caption and the box. */
  help?: ReactNode
  /** How to type it, under the box. */
  entryHelp?: ReactNode
  /** What's wrong with what's there. Rings the box and says why. */
  error?: string | null
  /**
   * Where the dashes fall — the sizes of each group of TILES, in order.
   * `[1, 6]` is freebee's centre-plus-six, `[3, 3, 3, 3]` is letterboxed's four
   * sides, boggle passes its n rows of n. Omit for no grouping (wordiply's
   * starter is one word).
   *
   * **The field owns the dashes**, so callers store and hand over the letters
   * alone and get them back the same way. Typing a dash yourself is harmless —
   * it is stripped and re-inserted where it belongs.
   *
   * This is why the echo went (Joel, 2026-08-26). The dashes show the reading
   * directly: type `ABQU` into a 4-wide boggle board and the dash lands a tile
   * early, because `QU` was read as two tiles and `Qu` would have been one.
   */
  groups?: number[]
  /**
   * How the value splits into TILES. One per character by default.
   *
   * boggle passes `readTiles`, because `Qu` is one tile and grouping must not
   * cut it in half — the whole point of showing the dashes is that they fall on
   * tile boundaries.
   */
  tiles?: (value: string) => string[]
}

/**
 * TYPE THE BOARD YOURSELF — the shared field for entering a game's starting
 * letters by hand, instead of letting the server roll them.
 *
 * Five games have this and every one of them hand-rolled it: spellingbee and
 * wordwheel (a centre letter plus the outer ones), wordiply (the starter word),
 * letterboxed (the four sides), boggle (the whole grid). Four of the five
 * declared the identical four CSS rules under four different class names, two
 * had copied each other's placeholder rule outright, and one pair's stylesheets
 * differed only in two comment words. It was the one field type in a setup form
 * that never got named (plans/areas/forms.md → F31, F33).
 *
 * **It is one `<input type="text">`**, deliberately, even where the value has
 * parts. spellingbee used to show a 1-character box beside a 6-character one;
 * it now takes `A-CHIROT` in a single field and splits on the hyphen, which is
 * the form its own summary has always printed — so the field accepts exactly
 * what the form shows you. That round-trip is the same principle boggle's board
 * string was built on: read a board you liked off the info column or the
 * printout, paste it into a friend's dialog, get the same puzzle.
 *
 * The name says "board" and wordiply's starter is not one; kept anyway (Joel,
 * 2026-08-26) because the alternative names for "the letters you'll be playing
 * with" are worse, and four of the five genuinely are boards.
 */
export function ManualBoardField({
  value,
  onChange,
  placeholder,
  chars,
  label,
  ariaLabel,
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
  // a half-formatted string, and a pasted board with its own separators comes
  // out looking like every other one.
  const shown = groups ? groupTiles(tiles(value), groups) : value

  return (
    <Field label={label} help={help} entryHelp={entryHelp} error={error}>
      {(id) => (
        <input
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
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label === undefined ? ariaLabel : undefined}
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
