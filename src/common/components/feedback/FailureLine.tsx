// cs-unmet

import type { ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './FailureLine.module.css'

type Props = {
  /** What went wrong, in a sentence. */
  children: ReactNode
  /** Where the line sits in its own parent. Placement is the caller's. */
  className?: string
}

/**
 * SOMETHING WENT WRONG ON THIS SURFACE — one red line, in place.
 *
 * The dialog-and-panel counterpart to `<Field>`'s `error`, and the split is
 * worth holding onto: a field's error belongs to one entry and rings the
 * control it names, while this belongs to the SURFACE — the RPC failed, the
 * upload could not be parsed, the setup as a whole is not startable.
 *
 * Not a `<GenericFeedbackPill>` and not the fault modal. Those are the game's
 * two feedback channels (docs/ui.md → Feedback pill); this is what a form or a
 * dialog says about its own last action, next to the thing you pressed.
 *
 * **It renders nothing when there is nothing to say, so it reflows** — a
 * failure appearing pushes what is under it down. A surface that wants the line
 * held open regardless holds it open itself.
 */
export function FailureLine({ children, className }: Props) {
  if (children === null || children === undefined || children === false) return null
  return <p className={cls(styles.failureLine, className)}>{children}</p>
}
