// cs-audited-buttons

import type { ReactNode } from 'react'
import { cls } from '../utils/cls'
import styles from './Segmented.module.css'

type Props = {
  /** What the group as a whole is for — "Filter games by mode", "Puzzle
   *  source". Required, because a row of segments whose only labels are the
   *  segments themselves never says what the choice is ABOUT. */
  label: string
  /** The segments: one `<button>` per option, each carrying `aria-pressed` to
   *  say whether it is the chosen one. */
  children: ReactNode
  /** Extra class for the caller's own layout — where the group sits, whether
   *  its segments stretch. Never its paint. */
  className?: string
}

/**
 * A SEGMENTED CHOICE — a few options in one joined frame, exactly one chosen.
 *
 * Reach for this when the options change what you are LOOKING at rather than
 * recording an answer: a filter over a list, a tab bar, a picker for which
 * source a puzzle comes from. A control whose value the game reads later is
 * `<RadioRow>`; a choice with too many options to show at once collapses into
 * `<FilterSelect>`'s menu, which is why the club page's mode filter is
 * segmented and its gametype filter is not.
 *
 * **Pass ordinary `<button>`s as children and give each one `aria-pressed`.**
 * That attribute is the whole state contract: it is what a caller's own logic
 * sets, and it is what the chosen segment's fill is keyed off, so the styling
 * and the semantics cannot drift apart. A segment missing it is simply never
 * drawn as chosen.
 *
 * The segments are NOT standard buttons, and that is the point of the frame
 * owning the border: giving each segment its own border and radius doesn't
 * restyle a segmented control, it dismantles it. The same division a
 * `SelectionList` makes with its rows — the frame owns the edge, the children
 * own their fill.
 *
 * What it deliberately does NOT do: hold the value, map an options array, or
 * wire the clicks. Its three call sites want three different things from a
 * press — one sets a filter, one switches a view, one opens a picker — and a
 * component that owned the value would make two of them lie about what
 * pressing a segment does.
 */
export function Segmented({ label, children, className }: Props) {
  return (
    <div className={cls(styles.segmented, className)} role="group" aria-label={label}>
      {children}
    </div>
  )
}
