// cs-unmet

import { useEffect } from 'react'
import { cls } from '../../lib/util/cls'
import { dismissToast, type Toast as ToastModel } from '../../lib/toast/toastStore'
import styles from './Toast.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CloseButton } from '../buttons/CloseButton'

/** The usual `ms` for a self-clearing toast — long enough to be noticed in the
 *  corner as well as read, where a feedback pill (1400ms) is already under your
 *  eyes. */
export const DEFAULT_TOAST_MS = 4000

/**
 * One announcement card in the bottom-right toast stack (`<ToastHost>`). Dumb +
 * presentational: it renders a message, an optional action button, and the
 * shared `<CloseButton>`, and talks to the store only to remove itself. See
 * `toastStore.ts` for the model + lifecycle.
 *
 * Close semantics:
 *   - **the clock** → with an `ms`, it removes itself, WITHOUT firing `onClose`.
 *   - **✕** → the announcement is dismissed: fire the toast's `onClose` side
 *     effect (e.g. "mark this invite handled"), then remove it.
 *   - **action** → run it; unless `keepOpen`, remove the toast — but WITHOUT
 *     firing `onClose`, because acting on an announcement isn't dismissing it.
 */
export function Toast({ toast }: { toast: ToastModel }) {
  const { id, message, tone = 'info', action, onClose, dismissible = true } = toast

  // Depends on the whole `toast`, not on `id`/`ms`: the store replaces a toast
  // in place when a caller reuses its id, and only the object identity changes
  // then, so this is what re-arms the clock for the new words. Untouched toasts
  // keep their identity, so their timers don't restart.
  //
  // `dismissToast`, not `close` — firing `onClose` here would mark an
  // invitation handled that nobody saw.
  useEffect(function autoDismissAfterMs() {
    if (toast.ms === undefined) return
    const t = setTimeout(() => dismissToast(toast.id), toast.ms)
    return () => clearTimeout(t)
  }, [toast])

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
