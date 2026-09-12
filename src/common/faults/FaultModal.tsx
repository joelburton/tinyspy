// cs-audited-common-hosts

import { BlockingModal } from '../floating-panels/BlockingModal'
import { dismissFaultModal, showFaultModal, useCurrentFault } from './faultStore'
import styles from './FaultModal.module.css'
import { StandardButton } from '../buttons/StandardButton'

/**
 * The FAULT modal — the one host for every fault in the app, mounted once in
 * App.tsx (the ToastHost pattern). A fault is a failure nobody planned for;
 * it interrupts on purpose (docs/ui.md → Faults):
 *
 *   1. "Error", red — the shape test: a box popped up, the app broke.
 *   2. The message — the envelope's own `message`, whoever authored it: the
 *      raise's sentence, or the transport line when nothing answered. Never
 *      edited here.
 *   3. Small muted diagnostics, WHEN THERE ARE ANY — everything we know (the
 *      call, severity, outcome, dbcode, HTTP status, ms, field, detail,
 *      timestamp), the SAME string the `[db]` console line carries (one
 *      builder — `diagnosticsLine` in `dbLog.ts`). A fault routed through
 *      `reportDbFault` always has one; one raised by hand from words the
 *      server already wrote has nothing to put there, and the modal is two
 *      lines.
 *
 * **A `<BlockingModal>`**, so it inherits the whole category: the world stops,
 * nothing underneath is live, Tab stays inside it, and it cannot be dragged aside.
 * Backdrop click deliberately does NOT dismiss: a fault is see-and-acknowledge,
 * so it takes a deliberate Close or Esc and never a stray click.
 *
 * Its family is `modal-fault`, which is why it outranks a blocking modal;
 * `FloatingPanel`'s family table says what that resolves to.
 *
 * One fault at a time; dismissing reveals the next queued one (cap 5,
 * overflow silently dropped from the UI — faultStore.ts).
 */
export function FaultModal() {
  const fault = useCurrentFault()

  if (!fault) return null

  return (
    <BlockingModal
      family="modal-fault"
      onClose={dismissFaultModal}
      actions={
        <StandardButton show="label" label="Close" weight="primary" onClick={dismissFaultModal} autoFocus />
      }
    >
      <div className={styles.report}>
        <h3 className={styles.heading}>Error</h3>
        <p className={styles.message}>{fault.text}</p>
        {fault.diagnostics && <p className={styles.diagnostics}>{fault.diagnostics}</p>}
      </div>
    </BlockingModal>
  )
}

/**
 * Hand trigger: pop a realistic fault from the browser console —
 * `pupfault()` for a canned one, `pupfault('text', 'diagnostics')` to
 * shape your own. Real faults are bugs or dead networks, so there's no
 * honest UI path to one on demand; this is how the modal's look gets
 * checked.
 */
declare global {
  interface Window {
    pupfault?: (text?: string, diagnostics?: string) => void
  }
}
// Installed in production too, not only in dev: a fault is rare and
// unplannable, so the deployed site is the only place the modal's look can be
// checked where it matters, and a console helper nobody is looking for costs
// nothing to carry.
window.pupfault = (text?: string, diagnostics?: string) =>
  showFaultModal({
    text: text ?? 'word|unplayable-board|EXAMPLE|',
    diagnostics:
      diagnostics ??
      'word — key=unplayable-board code=P0001 detail="a hand-triggered test fault (window.pupfault)" — 00:00:00',
  })
