import { FloatingPanel } from '../panels/FloatingPanel'
import actionRow from '../panels/modalActions.module.css'

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
 * non-terminal game. Per docs/states.md → "Leaving the game
 * page — terminal vs non-terminal": a higher UI bar for non-
 * terminal nav-away, because suspending the game drags every
 * viewing peer back to the club page too.
 *
 * Uses the shared `<FloatingPanel>` shell. Different from the
 * other modals in that it's NOT draggable — this is a one-second
 * decision, and a draggable header would add weight without
 * payoff. Stays centered, narrow, no resize. Header still shows
 * the title + close X for consistency with the rest of the
 * floating-panel family.
 */
export function SuspendConfirmDialog({ title, onSuspend, onCancel }: Props) {
  return (
    <FloatingPanel
      title="Suspend this game?"
      onClose={onCancel}
      draggable={false}
      resizable={false}
      defaultSize={{ width: 420, height: 240 }}
      minWidth={320}
      minHeight={200}
    >
      <p>
        <strong>{title}</strong> will be moved out of the active slot.
        Everyone in this game will return to the club page; you can
        resume from there later.
      </p>
      <div className={actionRow.modalActions}>
        <button type="button" className="secondary" onClick={onCancel}>
          Keep playing
        </button>
        <button type="button" onClick={onSuspend} autoFocus>
          Suspend
        </button>
      </div>
    </FloatingPanel>
  )
}
