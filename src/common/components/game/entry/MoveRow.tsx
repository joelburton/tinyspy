import type { ReactNode } from 'react'
import { cls } from '../../../lib/util/cls'
import { DeleteButton } from '../../buttons/DeleteButton'
import { SubmitButton } from '../../buttons/SubmitButton'
import styles from './MoveRow.module.css'

type Props = {
  /** The entry display this row wraps — an `<EntryBox>`, a grid of slots, … */
  children: ReactNode
  /** Take back the last thing entered (a character, a tile, a traced cell). */
  onDelete: () => void
  /** Commit what's entered. */
  onSubmit: () => void
  /** Nothing to take back (an empty entry), or entry is frozen. */
  deleteDisabled?: boolean
  /** Nothing to submit, entry is frozen, a submit is in flight, or the value
   *  itself is vetoed (wordwheel's un-spellable word). */
  submitDisabled?: boolean
  /** Extra class on the row — e.g. a per-game font-size override. */
  className?: string
}

/**
 * The **move row**: `⌫ | whatever you're entering | Submit`, on one centered
 * line. The two icon-only buttons at the ends, the display flex-filling between
 * them.
 *
 * This is the LAYOUT half of word entry, split out from `<EntryRow>` so the
 * games that can't use EntryRow's *keyboard* half can still be the same control.
 * Three games render it and they are entering genuinely different things:
 *
 *   - **EntryRow** (every typing game) — an `<EntryBox>` over a text buffer,
 *     with `useCaptureKeys` + the history arrows layered on.
 *   - **stackdown** — five slots holding picked-up TILES. There's no text
 *     buffer at all: a letter names a tile, and a word is exactly five of them.
 *   - **strands** — an `<EntryBox>`, but its string is *derived from the traced
 *     path*, never typed into. A keystroke there resolves to a CELL (which one
 *     of the three `A`s?), so the string is an output, and EntryRow's
 *     string-in/string-out contract runs backwards.
 *
 * Extracted rather than copied because the copies had already started: the row
 * is three files' worth of "which button on which side, what gap, when is each
 * disabled", and that is exactly the kind of agreement that drifts silently
 * (see the setup-recap sweep in docs/pdf.md for the same lesson). Anything that
 * varies — what's being entered, what a keystroke means, whether a feedback pill
 * replaces this row or sits below it — stays with the caller.
 */
export function MoveRow({
  children,
  onDelete,
  onSubmit,
  deleteDisabled = false,
  submitDisabled = false,
  className,
}: Props) {
  return (
    <div className={cls(styles.moveRow, className)}>
      <DeleteButton iconOnly onClick={onDelete} disabled={deleteDisabled} />
      {children}
      <SubmitButton iconOnly onClick={onSubmit} disabled={submitDisabled} />
    </div>
  )
}
