import { createPortal } from 'react-dom'
import { useToasts } from '../lib/toastStore'
import { Toast } from './Toast'
import styles from './ToastHost.module.css'

/**
 * The one shared toast stack — mounted ONCE (App.tsx) and portaled to
 * `document.body`, so it sits above every other layer including the chat panel
 * (z-index 10000). Renders every toast in the store, newest nearest the corner.
 *
 * Every source funnels through the store (`showToast`/`dismissToast`), so
 * announcements from different places share this one column and stack together
 * rather than fighting over the corner.
 *
 * Layout invariant: the host is content-sized but capped to the viewport and
 * scrolls INTERNALLY past that, so even a flood of toasts never makes the whole
 * PAGE scroll (see docs/ui.md → "The page never scrolls").
 */
export function ToastHost() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return createPortal(
    <div className={styles.host} role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  )
}
