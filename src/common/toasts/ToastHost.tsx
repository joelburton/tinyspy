// cs-blessed-common-hosts

import { createPortal } from 'react-dom'
import { useToasts } from './toastStore'
import { Toast } from './Toast'
import styles from './ToastHost.module.css'

/**
 * The one shared toast stack — mounted ONCE (App.tsx) and portaled to
 * `document.body`, so no ancestor's stacking context can trap it and its
 * `--z-toast` rung means what base.css says it means. Renders every toast in
 * the store, newest nearest the corner.
 *
 * Every source funnels through the store (`showToast`/`dismissToast`), so
 * announcements from different places share this one column and stack together
 * rather than fighting over the corner.
 *
 * Layout invariant: the host is content-sized but capped to the viewport and
 * scrolls INTERNALLY past that, so even a flood of toasts never makes the whole
 * PAGE scroll (see docs/ui.md → Page-height fits the viewport).
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
