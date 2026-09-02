// cs-unmet

import { BlockingModal } from '../floating-panels/BlockingModal'
import { dismissFaultModal, showFaultModal, useCurrentFault } from '../../lib/fault/faultStore'
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
 *   3. Small muted diagnostics — everything we know (the call, severity,
 *      outcome, dbcode, HTTP status, ms, field, detail, timestamp), the SAME
 *      string the `[db]` console line carries (one builder — `diagnosticsLine`
 *      in `dbLog.ts`).
 *
 * **A `<BlockingModal>`**, so it inherits the whole category: the world stops,
 * nothing underneath is live, focus is trapped, and it cannot be dragged aside.
 * Backdrop click deliberately does NOT dismiss — see-and-acknowledge, the same
 * contract as the manual pill mode this replaces. Close + Esc only.
 *
 * It is a `modal-fault`, one tier ABOVE a blocking modal, because an error must
 * be readable mid-question (§20). That rank is not yet expressed: it rides the
 * shared default today, which is the reason an open chat can cover it. The tier
 * moves when the ladder does, rung by rung, not here.
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
        <StandardButton name="Close" weight="primary" onClick={dismissFaultModal} autoFocus />
      }
    >
      <div className={styles.report}>
        <p className={styles.heading}>Error</p>
        <p className={styles.message}>{fault.text}</p>
        {fault.diagnostics && <p className={styles.diagnostics}>{fault.diagnostics}</p>}
      </div>
    </BlockingModal>
  )
}

/**
 * Dev/test trigger: pop a realistic fault from the browser console —
 * `pupfault()` for a canned one, `pupfault('text', 'diagnostics')` to
 * shape your own. Real faults are bugs or dead networks, so there's no
 * honest UI path to one on demand; this is how the modal's look gets
 * checked. Harmless to ship for a friends-only alpha.
 */
declare global {
  interface Window {
    pupfault?: (text?: string, diagnostics?: string) => void
  }
}
if (typeof window !== 'undefined') {
  window.pupfault = (text?: string, diagnostics?: string) =>
    showFaultModal({
      text: text ?? 'word|unplayable-board|EXAMPLE|',
      diagnostics:
        diagnostics ??
        'word — key=unplayable-board code=P0001 detail="a hand-triggered test fault (window.pupfault)" — 00:00:00',
    })
}
