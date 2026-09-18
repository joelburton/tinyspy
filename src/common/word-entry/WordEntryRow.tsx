// cs-audited-word-entry

import type { ReactNode } from 'react'
import { cls } from '../utils/cls'
import { ActionButton } from '../actions/ActionButton'
import type { BoundAction } from '../actions/useBoundAction'
import styles from './WordEntryRow.module.css'

type Props = {
  // The entry display this row wraps — a `<WordEntryInput>`, a grid of slots, …
  children: ReactNode
  // Take back the last thing entered (a character, a tile, a traced cell) —
  // the same binding as the `⌫` key, so the two cannot disagree about when
  // there is anything to take back.
  actDelete: BoundAction
  // Commit what's entered — the same binding as `Enter`.
  actSubmit: BoundAction
  // Extra class on the row — e.g. a per-game font-size override.
  className?: string
}

/**
 * The **word-entry row**: `⌫ | whatever you're entering | Submit`, on one centered
 * line. The two icon-only buttons at the ends, the display flex-filling between
 * them.
 *
 * This is the LAYOUT half of word entry, split out from `<WordEntryArea>` so the
 * games that can't use WordEntryArea's *keyboard* half can still be the same control.
 * **Render `<WordEntryArea>` when a keystroke means "append this character", and
 * this row directly when it doesn't** — the caller then brings its own keyboard
 * and its own display of whatever is being entered. The games on each side, and
 * what they enter: doc.md → Intro to area.
 *
 * **The two buttons ARE the two keys.** Each takes the bound action its key
 * fires, so "is there anything to delete?" and "may this submit?" are answered
 * once, by the action, rather than by a `deleteDisabled` prop the caller works
 * out again — which is how a button and its key come to disagree.
 *
 * Anything that varies — what's being entered, what a keystroke means, whether
 * a feedback pill replaces this row or sits below it — stays with the caller.
 */
export function WordEntryRow({ children, actDelete, actSubmit, className }: Props) {
  return (
    <div className={cls(styles.wordEntryRow, className)}>
      <ActionButton action={actDelete} show="icon" />
      {children}
      {/* Filled: committing is the row's main act, and the ⌫ beside it is not. */}
      <ActionButton action={actSubmit} show="icon" weight="primary" />
    </div>
  )
}
