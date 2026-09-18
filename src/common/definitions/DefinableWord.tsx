// cs-blessed-definitions

import type { CSSProperties, ReactNode } from 'react'
import { cls } from '../utils/cls'
import { defineWord } from './definitionStore'

type Props = {
  // Lowercased for the lookup and for `data-word`, whatever case it arrives in.
  word: string
  // Composed onto `.definable`, for a surface that styles its own words.
  className?: string
  // For a style CSS can't know — the word list's recent-flash underline takes
  // the finder's color.
  style?: CSSProperties
  // What to show. Defaults to the word in caps, which is how every surface
  // showing a plain word shows it; wordle passes its five letter-squares.
  children?: ReactNode
}

/**
 * A word you can click to see its definition.
 *
 * Use it wherever a real dictionary word is on screen and looking it up would
 * be welcome — a event log's entry, a found-words list, a revealed answer. There
 * is nothing to wire per surface: the card it opens is mounted once at the root
 * (`<DefinitionHost>`), and this writes the word into the store it reads.
 *
 * Pointer-only, deliberately: a span, not a button, so no tab stop and no focus
 * state. `core-css/utilities.css` → `.definable` says why, and carries the
 * hover underline every definable word wears.
 */
export function DefinableWord({ word, className, style, children }: Props) {
  const lookup = word.toLowerCase()
  return (
    <span
      className={cls('definable', className)}
      style={style}
      // The native title rather than `data-tooltip`: definable words come in
      // bulk — a found-words list holds a hundred — and the styled bubble opens
      // fast enough that reading down such a list would trail popups. The
      // native one waits, and only for the word you settle on.
      title="Click to define"
      // The e2e handle (the repo's `[data-board]` / `[data-cell]` convention).
      // Lowercase = as stored, not as displayed.
      data-word={lookup}
      onClick={(e) => defineWord(lookup, e.currentTarget)}
    >
      {children ?? word.toUpperCase()}
    </span>
  )
}
