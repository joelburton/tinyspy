import { useRef, type ReactNode } from 'react'
import { FloatingPanel } from './FloatingPanel'
import { useFocusTrap } from '../../hooks/ui/useFocusTrap'
import actionRow from './modalActions.module.css'

type Props = {
  /** The panel-header question, e.g. "End this game?". */
  title: string
  /** The body copy — what happens if they confirm. */
  message: ReactNode
  /** The confirm button's label ("End game", "Suspend"). Deliberately never
   *  a bare "OK" — the button should name the act. */
  confirmLabel: string
  /** The dismiss button's label. Defaults to "Cancel". */
  cancelLabel?: string
  onConfirm: () => void
  /** Called on Cancel, Esc, or the header ✕. */
  onCancel: () => void
}

/**
 * The shared small confirm MODAL — the styled replacement for
 * `window.confirm` on in-game decisions (ending a game, suspending it).
 *
 * A true modal, not a floating dialog: `backdrop` blocks every pointer
 * action on the board underneath (click-through was the native-confirm
 * era's bug), and the keyboard is owned outright — focus is trapped in the
 * panel, the confirm button `autoFocus`es so Enter confirms, FloatingPanel
 * owns Esc (cancel), and the game key-capture hooks already bail inside
 * `[data-floating-panel]`. Not draggable/resizable — a one-second decision,
 * same posture as SuspendConfirmDialog (which is now a wrapper over this).
 *
 * For the imperative `await confirm(...)` form games use in their action
 * handlers, see `useConfirmDialog`.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  // Cycle Tab within the panel (the anchor lets the hook find the enclosing
  // panel shell).
  const anchorRef = useRef<HTMLDivElement>(null)
  useFocusTrap(anchorRef)

  return (
    <FloatingPanel
      title={title}
      onClose={onCancel}
      draggable={false}
      resizable={false}
      backdrop
      defaultSize={{ width: 420, height: 240 }}
      minWidth={320}
      minHeight={200}
    >
      <div ref={anchorRef}>
        <p>{message}</p>
        <div className={actionRow.modalActions}>
          <button type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </FloatingPanel>
  )
}
