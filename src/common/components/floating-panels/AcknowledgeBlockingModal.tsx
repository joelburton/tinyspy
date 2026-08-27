// cs-unmet

import { type ReactNode } from 'react'
import { BlockingModal } from './BlockingModal'
import { StandardButton } from '../buttons/StandardButton'

type Props = {
  /** The titlebar headline, e.g. "No more puzzles". */
  title: string
  /** The body copy — what happened, and what the player can do about it. */
  message: ReactNode
  /** The button's label. Defaults to "OK". */
  okLabel?: string
  /** Called on the button, Esc, or the titlebar ✕ — all three are the same
   *  act, because there is only one way out. */
  onAcknowledge: () => void
}

/**
 * The shared acknowledgment — a blocking modal that STATES something rather
 * than asking. One button, one way out, nothing to decide.
 *
 * **Why it is not a confirmation with the Cancel removed**, which is what it
 * was until 2026-08-24 (`<ConfirmationBlockingModal cancelLabel={null}>`):
 * asking a question and stating a fact are two different acts, and the flag
 * let one component do both while the promise it resolved carried a boolean
 * nobody could act on. Splitting them is what makes `confirm` mean confirm.
 *
 * Its callers are the dead ends: connections' and strands' "everyone has
 * already played every puzzle we have". A dead end is worth interrupting for —
 * the player pressed New game and nothing happened, so something has to say
 * why, and it has to be seen rather than glanced at in a corner.
 *
 * For the imperative `await acknowledge(...)` form, see `useAcknowledge`.
 */
export function AcknowledgeBlockingModal({
  title,
  message,
  okLabel = 'OK',
  onAcknowledge,
}: Props) {
  return (
    <BlockingModal
      title={title}
      onClose={onAcknowledge}
      actions={
        <StandardButton name={okLabel} weight="primary" onClick={onAcknowledge} autoFocus />
      }
    >
      <p>{message}</p>
    </BlockingModal>
  )
}
