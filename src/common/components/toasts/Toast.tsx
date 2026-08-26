// cs-unmet

import { cls } from '../../lib/util/cls'
import { dismissToast, type Toast as ToastModel } from '../../lib/toast/toastStore'
import styles from './Toast.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CloseButton } from '../buttons/CloseButton'

/**
 * One announcement card in the bottom-right toast stack (`<ToastHost>`). Dumb +
 * presentational: it renders a message, an optional action button, and the
 * shared `<CloseButton>`, and talks to the store only to remove itself. See
 * `toastStore.ts` for the model + lifecycle.
 *
 * Close semantics:
 *   - **✕** → the announcement is dismissed: fire the toast's `onClose` side
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
      {dismissible && <CloseButton name="Dismiss" className={styles.close} onClick={close} />}
      <div className={styles.message}>{message}</div>
      {action && (
        <StandardButton
          name={action.label}
          weight="primary"
          className={styles.action}
          onClick={act}
        />
      )}
    </div>
  )
}
