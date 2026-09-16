// cs-met-pause-suspend

import { ConfirmationBlockingModal } from '../floating-panels/ConfirmationBlockingModal'

type Props = {
  // The game's user-facing title, woven into the question's text so it names
  // what's being suspended.
  title: string
  // Called when the user clicks Suspend. The caller wires this to broadcast
  // 'suspend' + navigate self; peers navigate themselves on receipt.
  onSuspend: () => void
  // Called when the user dismisses the modal without suspending — Cancel, or
  // Escape. A card has no ✕.
  onCancel: () => void
}

/**
 * The question asked when a member presses Back-to-club on a MULTIPLAYER game
 * that is still going. Suspending is not dangerous by itself — the game shelves
 * into the club list, resumable — but it drags every viewing peer back to the
 * club page, and that surprise is what earns a confirm. `GamePage` renders it
 * while its own flag is up, and skips it for a solo game (nobody to surprise)
 * and for a finished one (a plain navigation, no broadcast); docs/states.md →
 * "Leaving the game page — terminal vs non-terminal" holds that split.
 *
 * Pass the game's title, which the words name, and the two answers. Everything
 * a modal does — the scrim, the trapped Tab, Enter and Esc — comes from the
 * shared `<ConfirmationBlockingModal>` this renders.
 */
export function SuspendConfirmationBlockingModal({ title, onSuspend, onCancel }: Props) {
  return (
    <ConfirmationBlockingModal
      title="Suspend this game?"
      message={
        <>
          <strong>{title}</strong> will be moved out of the active slot.
          Everyone in this game will return to the club page; you can
          resume from there later.
        </>
      }
      confirmLabel="Suspend"
      cancelLabel="Keep playing"
      onConfirm={onSuspend}
      onCancel={onCancel}
    />
  )
}
