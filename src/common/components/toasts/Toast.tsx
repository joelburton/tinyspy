import { cls } from '../../lib/util/cls'
import { dismissToast, type Toast as ToastModel } from '../../lib/toast/toastStore'
import styles from './Toast.module.css'

/**
 * One announcement card in the bottom-right toast stack (`<ToastHost>`). Dumb +
 * presentational: it renders a message, an optional action button, and an X,
 * and talks to the store only to remove itself. See `toastStore.ts` for the
 * model + lifecycle.
 *
 * Close semantics:
 *   - **X** → the announcement is dismissed: fire the toast's `onClose` side
 *     effect (e.g. "mark this invite handled"), then remove it.
 *   - **action** → run it; unless `keepOpen`, remove the toast — but WITHOUT
 *     firing `onClose`, because acting on an announcement isn't dismissing it.
 */
export function Toast({ toast }: { toast: ToastModel }) {
  const { id, message, tone = 'info', action, onClose, dismissible = true } = toast

  const close = () => {
    onClose?.()
    dismissToast(id)
  }
  const act = () => {
    action?.onClick()
    if (!action?.keepOpen) dismissToast(id)
  }

  return (
    <div className={cls(styles.toast, styles[tone])} role="alertdialog" aria-label="Announcement">
      {dismissible && (
        <button type="button" className={styles.close} aria-label="Dismiss" title="Dismiss" onClick={close}>
          ×
        </button>
      )}
      <div className={styles.message}>{message}</div>
      {action && (
        <button type="button" className={styles.action} onClick={act}>
          {action.label}
        </button>
      )}
    </div>
  )
}
