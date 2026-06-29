import type { ReactNode } from 'react'
import { cls } from '../lib/cls'
import styles from './ResultFlash.module.css'

/** The outcome a flash paints. `good`/`bad` are the universal correct/wrong
 *  pair; `near` is the "one away" partial-credit amber (connections only —
 *  psychicnum has no near-miss state). Same vocabulary as the TurnLog outcome
 *  bar, minus its `neutral`. */
export type ResultTone = 'good' | 'bad' | 'near'

type Props = {
  tone: ResultTone
  /** The short message ("Correct!", "Incorrect", "One away!", an error). Held
   *  to one line — a label too long for the bar truncates rather than wrapping,
   *  so the row height never changes. */
  label: ReactNode
  /** Drop into a vertical (column) below-board slot rather than replacing a
   *  horizontal input row. The default `flex: 1` would stretch the bar to the
   *  slot's full height there; `compact` pins it to its content height. Set by
   *  the board-input games (waffle, codenamesduet) whose move is made on the
   *  board, so they have no horizontal controls row for the flash to stand in
   *  for. See the `.compact` note in ResultFlash.module.css. */
  compact?: boolean
  /** Merged onto the root for per-host layout (e.g. flex behavior in its row). */
  className?: string
}

/**
 * The shared **own-result flash**: a full-width, outcome-tinted bar that
 * **replaces a game's input bar** for a beat after the player's own move
 * resolves — the local half of the local-vs-group feedback split (a peer's
 * result goes to the GamePage header pill instead; see docs/deferred.md →
 * Feedback channels).
 *
 * Used by the games that converge on the shared PlayArea, two ways:
 *   - **connections / psychicnum** swap it in for a horizontal controls row
 *     (Clear/Submit, or the word-entry + Submit) — the default full-width bar;
 *   - **waffle / codenamesduet** are board-input games (the move is made on the
 *     board), so it sits in a vertical below-board slot via `compact` instead.
 *
 * It reuses the shared won/lost/near outcome palette, so "Correct!" /
 * "Incorrect" / "One away!" reads identically to the TurnLog outcome bars and
 * the decided-tile fills. The **host reserves the row height** (its input bar's
 * `min-height`) so swapping the bar for this flash never reflows the board above
 * (docs/ui.md → Layout stability). The host also owns the flash's lifetime
 * (a ~1.4s timer, cleared early when the player starts the next move).
 */
export function ResultFlash({ tone, label, compact, className }: Props) {
  return (
    <span className={cls(styles.flash, styles[tone], compact && styles.compact, className)}>
      {label}
    </span>
  )
}
