import { ConfirmDialog } from '../panels/ConfirmDialog'

type Props = {
  /** The game's user-facing title, woven into the modal copy
   *  so the confirm prompt names what's being suspended. */
  title: string
  /** Called when the user clicks Suspend. The caller wires
   *  this to broadcast 'suspend' + navigate self; peers
   *  navigate themselves on receipt. */
  onSuspend: () => void
  /** Called when the user dismisses the modal without
   *  suspending (Cancel, Esc, X). */
  onCancel: () => void
}

/**
 * Confirm modal shown when a member clicks Back-to-club on a
 * non-terminal MULTIPLAYER game. Per docs/states.md → "Leaving the
 * game page — terminal vs non-terminal": suspending isn't dangerous
 * by itself, but it drags every viewing peer back to the club page —
 * that surprise is what earns the confirm. GamePage therefore skips
 * this dialog entirely for a SOLO game (nobody to surprise) and for
 * a terminal game (direct navigation, no broadcast).
 *
 * A thin wrapper over the shared `<ConfirmDialog>`, which supplies
 * the modal behavior: a pointer-blocking backdrop (no background
 * board actions), trapped focus, autoFocused confirm (Enter),
 * Esc-to-cancel, and the game key-captures bailing inside
 * `[data-floating-panel]`.
 */
export function SuspendConfirmDialog({ title, onSuspend, onCancel }: Props) {
  return (
    <ConfirmDialog
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
