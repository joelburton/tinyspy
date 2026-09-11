// cs-audited-floating-panels

import { type ReactNode } from 'react'
import { BlockingModal } from './BlockingModal'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'

type Props = {
  // The question, e.g. "End this game?".
  title: string
  // The body — what happens if they confirm.
  message: ReactNode
  // The confirm button's label ("End game", "Suspend"). Never a bare "OK": the
  // button names the act.
  confirmLabel: string
  // The SECOND way to say yes, drawn between Cancel and the confirm. Pass it
  // with `onAlternative` or neither; see `ConfirmOptions.alternativeLabel`.
  alternativeLabel?: string
  // The dismiss button's label. Defaults to "Cancel".
  cancelLabel?: string
  onConfirm: () => void
  // The second positive answer was picked.
  onAlternative?: () => void
  // Cancel, or Escape — a card has no ✕.
  onCancel: () => void
  // Which button is PRIMARY — filled, AND the one Enter fires. One decision,
  // never two: a filled button Enter doesn't press, or an Enter target that
  // doesn't look like one, is a trap. Defaults to `'confirm'`, which is right
  // when confirming is what you came to do; `'cancel'` is for a question whose
  // safe answer should be the reflex one.
  primaryButton?: 'confirm' | 'cancel'
}

/**
 * The styled replacement for `window.confirm` on an in-game decision — ending a
 * game, suspending it, restarting it.
 *
 * **To ask a question, await `askConfirmation`.** That is the form every caller
 * uses; `<ConfirmationHost>` renders this with the words you passed, and these
 * props are what it forwards. The suspend question is the one still rendered
 * by hand (`SuspendConfirmationBlockingModal`).
 *
 * The shape is baked and takes no footer slot, unlike the `<BlockingModal>` it
 * renders into: a confirmation is always a question, a body, and the answers in
 * a row, and a caller free to arrange its own would be one more thing to
 * disagree about order, weight and wording.
 *
 * Two answers, or three where a question has two ways to say YES — conceding a
 * race and ending it are both acts, and they differ in what they do. Explaining
 * that difference is what a question can do and two buttons on a board cannot.
 * It stops at three: past two positive answers this is a menu, not a question.
 *
 * If there is nothing to ANSWER — one button, one way out — that is an
 * `<AcknowledgeBlockingModal>`, not a confirmation with the Cancel taken off.
 */
export function ConfirmationBlockingModal({
  title,
  message,
  confirmLabel,
  alternativeLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onAlternative,
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
            show="label"
            label={cancelLabel}
            weight={confirmIsPrimary ? 'secondary' : 'primary'}
            onClick={onCancel}
            autoFocus={!confirmIsPrimary}
          />
          {alternativeLabel && onAlternative && (
            // Secondary in both arrangements: it is a way to say yes, but not
            // the one the action is named for, and never the Enter target.
            <StandardButton
              show="label"
              label={alternativeLabel}
              weight="secondary"
              tone="destructive"
              onClick={onAlternative}
            />
          )}
          <StandardButton
            show="label"
            label={confirmLabel}
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
