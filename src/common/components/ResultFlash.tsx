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
 * Used by both tile/word games that converge on the shared PlayArea:
 *   - **connections** swaps it in for the Clear/Submit commit row;
 *   - **psychicnum** swaps it in for the word-entry + Submit row.
 *
 * It reuses the shared won/lost/near outcome palette, so "Correct!" /
 * "Incorrect" / "One away!" reads identically to the TurnLog outcome bars and
 * the decided-tile fills. The **host reserves the row height** (its input bar's
 * `min-height`) so swapping the bar for this flash never reflows the board above
 * (docs/ui.md → Layout stability). The host also owns the flash's lifetime
 * (a ~1.4s timer, cleared early when the player starts the next move).
 */
export function ResultFlash({ tone, label, className }: Props) {
  return <span className={cls(styles.flash, styles[tone], className)}>{label}</span>
}
