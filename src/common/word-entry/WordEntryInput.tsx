// cs-blessed-word-entry

import type { ReactNode } from 'react'
import { cls } from '../utils/cls'
import { useGameHasKeyboard } from '../keyboard/useGameHasKeyboard'
import styles from './WordEntryInput.module.css'

type Props = {
  // The text currently entered. Empty string shows the placeholder.
  value: string
  // Faint hint shown when `value` is empty (e.g. "type 1–20").
  placeholder?: ReactNode
  // Custom rendering of the entered value — e.g. per-character styling
  // (spellingbee dims letters not in the puzzle). When omitted, the raw `value`
  // string renders as plain text. The caret still sits after it.
  children?: ReactNode
  // Appended to the base box class for per-game appearance (size, layout).
  className?: string
}

/**
 * The shared **capture-entry display**: large centered text with a blinking
 * caret, and no `<input>` behind it. The capture-entry games read keystrokes
 * off the window and feed the pending value here, so there is no focusable
 * field — clicking a board tile never blurs the entry and stops typing.
 *
 * Pass the pending `value`, a `placeholder` for the empty box, `children` to
 * render the value per-character (spellingbee's `<TypedWord>`), and
 * `className` for per-game size or layout. The rest is the box's own and is
 * identical in every game: the chrome-less look, the caret's two conditions,
 * the placeholder slot.
 *
 * This DISPLAYS; it never changes the value. The keys that do are the
 * caller's — `keyboard/useCaptureKeys` types, deletes and submits, and
 * `./useArrowHistory` adds the ↑/↓ recall. `<WordEntryArea>` is the three of them
 * assembled (doc.md → Intro to area); reach for the box alone only when
 * something other than typing produces the string.
 */
export function WordEntryInput({ value, placeholder, children, className }: Props) {
  const gameHasKeyboard = useGameHasKeyboard()

  const empty = value === ''

  return (
    <div className={cls(styles.box, className)}>
      {/* The value wrapper is UNCONDITIONAL — a game that supplies `children`
          (per-character rendering) gets the same element around them, so the
          box has one stable shape whichever path renders it. `.value` is only
          `color: inherit`, so wrapping costs those games nothing and a child's
          own color still wins. */}
      {!empty && (
        <span className={styles.value} data-testid="entry-value">
          {children ?? value}
        </span>
      )}
      {/* Caret only once something's been typed: an empty field shows just the
          placeholder, which already says "type here". A caret on an empty box
          would blink off in the corner (or, centered, float oddly mid-box) with
          nothing to anchor it — noise, not an affordance. */}
      {gameHasKeyboard && !empty && <span className={styles.caret} aria-hidden />}
      {empty && placeholder !== undefined && (
        <span className={styles.placeholder}>{placeholder}</span>
      )}
    </div>
  )
}
