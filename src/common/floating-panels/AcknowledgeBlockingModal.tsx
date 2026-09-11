// cs-blessed-floating-panels

import { type ReactNode } from 'react'
import { BlockingModal } from './BlockingModal'
import { StandardButton } from '../buttons/StandardButton'

type Props = {
  // The headline, e.g. "No more puzzles".
  title: string
  // The body — what happened, and what the player can do about it.
  message: ReactNode
  // The button's label. Defaults to "OK".
  okLabel?: string
  // The button, or Escape — the same act either way, because there is only one
  // way out. A card has no ✕.
  onAcknowledge: () => void
}

/**
 * A blocking modal that STATES something rather than asking: one button, one
 * way out, nothing to decide.
 *
 * Reach for it at a dead end — connections' and strands' "everyone has already
 * played every puzzle we have". A dead end is worth interrupting for: the
 * player pressed New game and nothing happened, so something has to say why,
 * where it will be seen rather than glanced at in a corner.
 *
 * Not a confirmation with the Cancel taken off. Asking a question and stating
 * a fact are different acts, and a box with one way out cannot report which
 * way you left it — which is why this resolves nothing and `confirm` means
 * confirm.
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
        <StandardButton show="label" label={okLabel} weight="primary" onClick={onAcknowledge} autoFocus />
      }
    >
      <p>{message}</p>
    </BlockingModal>
  )
}
