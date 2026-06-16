import { useEffect, useRef } from 'react'
import styles from './SuspendConfirmDialog.module.css'

type Props = {
  /** The game's user-facing title, woven into the modal copy
   *  so the confirm prompt names what's being suspended. */
  title: string
  /** Called when the user clicks Suspend. The caller wires
   *  this to broadcast 'suspend' + navigate self; peers
   *  navigate themselves on receipt. */
  onSuspend: () => void
  /** Called when the user dismisses the modal without
   *  suspending (Cancel, Esc, backdrop click). */
  onCancel: () => void
}

/**
 * Confirm modal shown when a member clicks Back-to-club on a
 * non-terminal game. Per docs/states.md → "Leaving the game
 * page — terminal vs non-terminal": a higher UI bar for non-
 * terminal nav-away, because suspending the game drags every
 * viewing peer back to the club page too.
 *
 * Built on the native `<dialog>` element, same pattern as
 * SetupGameDialog: ref + showModal() for the backdrop, Esc
 * close fires onClose, and a click on the dialog itself
 * (vs a descendant) is treated as a backdrop click.
 *
 * The component is mount-driven — render it iff the modal
 * should be open. GamePage owns the open/closed state.
 */
export function SuspendConfirmDialog({ title, onSuspend, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel()
      }}
    >
      <div className={styles.content}>
        <h2>Suspend this game?</h2>
        <p>
          <strong>{title}</strong> will be moved out of the active slot.
          Everyone in this game will return to the club page; you can
          resume from there later.
        </p>
        <div className={styles.actions}>
          <button type="button" className="secondary" onClick={onCancel}>
            Keep playing
          </button>
          <button type="button" onClick={onSuspend} autoFocus>
            Suspend
          </button>
        </div>
      </div>
    </dialog>
  )
}
