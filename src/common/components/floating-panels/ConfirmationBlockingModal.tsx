// cs-audited

import { type ReactNode } from 'react'
import { BlockingModal } from './BlockingModal'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'

type Props = {
  /** The titlebar question, e.g. "End this game?". */
  title: string
  /** The body copy — what happens if they confirm. */
  message: ReactNode
  /** The confirm button's label ("End game", "Suspend"). Deliberately never
   *  a bare "OK" — the button should name the act. */
  confirmLabel: string
  /** The dismiss button's label. Defaults to "Cancel". */
  cancelLabel?: string
  onConfirm: () => void
  /** Called on Cancel, Esc, or the titlebar ✕. */
  onCancel: () => void
  /**
   * Which button is PRIMARY — filled, and the one Enter fires. The two are one
   * decision, never two (Joel, 2026-08-24): a filled button that Enter doesn't
   * press, or an Enter target that doesn't look like one, is a trap.
   *
   * Defaults to `'confirm'`, which is right when confirming is the thing you
   * came to do. `'cancel'` is for a question where the safe answer should be
   * the reflex one.
   */
  primaryButton?: 'confirm' | 'cancel'
}

/**
 * The shared confirmation — the styled replacement for `window.confirm` on
 * in-game decisions (ending a game, suspending it, restarting it).
 *
 * **The shape is baked and there is no slot**, unlike the `<BlockingModal>` it
 * renders into: a confirmation is always a question, a body, and exactly two
 * buttons in a row. Every caller passing its own footer would be sixteen
 * chances for the pair to disagree about order, weight or wording.
 *
 * A **question**, which is the whole of what separates it from its sibling: if
 * there is nothing to answer — one button, one way out — that is an
 * `<AcknowledgeBlockingModal>`, not a confirmation with the Cancel removed.
 * (It used to be exactly that: `cancelLabel: null`, a second act smuggled
 * through a flag.)
 *
 * For the imperative `await confirm(...)` form games use in their action
 * handlers, see `useConfirmation`.
 */
export function ConfirmationBlockingModal({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  primaryButton = 'confirm',
}: Props) {
  const confirmIsPrimary = primaryButton === 'confirm'

  return (
    <BlockingModal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <CancelButton
            name={cancelLabel}
            weight={confirmIsPrimary ? 'secondary' : 'primary'}
            onClick={onCancel}
            autoFocus={!confirmIsPrimary}
          />
          <StandardButton
            name={confirmLabel}
            weight={confirmIsPrimary ? 'primary' : 'secondary'}
            onClick={onConfirm}
            autoFocus={confirmIsPrimary}
          />
        </>
      }
    >
      <p>{message}</p>
    </BlockingModal>
  )
}
