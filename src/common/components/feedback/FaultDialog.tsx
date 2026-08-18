import { useRef } from 'react'
import { FloatingPanel } from '../panels/FloatingPanel'
import { useFocusTrap } from '../../hooks/ui/useFocusTrap'
import { dismissFault, presentFault, useCurrentFault } from '../../lib/fault/faultStore'
import actionRow from '../panels/modalActions.module.css'
import styles from './FaultDialog.module.css'

/**
 * The FAULT modal — the one host for every fault in the app, mounted once in
 * App.tsx (the ToastHost pattern). A fault is a failure nobody planned for;
 * it interrupts on purpose (docs/ui.md → Faults):
 *
 *   1. "Error", red — the shape test: a box popped up, the app broke.
 *   2. The message — the classifier's words: ERROR_COPY's sentence when the
 *      key has copy, the raw `action|key|detail|` otherwise, the transport
 *      line when nothing answered. Never edited here.
 *   3. Small muted diagnostics — everything we know (action, fe-error-key,
 *      SQLSTATE, HTTP status, DETAIL, raw text, timestamp), the SAME string
 *      the `[db]` console line carries (one builder — serverError.ts).
 *
 * A true modal on the ConfirmDialog machinery: `backdrop` dims and blocks
 * every pointer action underneath, focus is trapped, the game key-capture
 * hooks bail inside `[data-floating-panel]`, and FloatingPanel owns Esc.
 * Backdrop click deliberately does NOT dismiss — see-and-acknowledge, the
 * same contract as the manual pill mode this replaces. Close + Esc only.
 *
 * One fault at a time; dismissing reveals the next queued one (cap 5,
 * overflow silently dropped from the UI — faultStore.ts).
 */
export function FaultDialog() {
  const fault = useCurrentFault()
  const anchorRef = useRef<HTMLDivElement>(null)
  useFocusTrap(anchorRef)

  if (!fault) return null

  return (
    <FloatingPanel
      title="Error"
      onClose={dismissFault}
      draggable={false}
      resizable={false}
      backdrop
      defaultSize={{ width: 460, height: 280 }}
      minWidth={320}
      minHeight={200}
    >
      <div ref={anchorRef} className={styles.body}>
        <p className={styles.heading}>Error</p>
        <p className={styles.message}>{fault.text}</p>
        {fault.diagnostics && <p className={styles.diagnostics}>{fault.diagnostics}</p>}
        <div className={actionRow.modalActions}>
          <button type="button" className="button primary" onClick={dismissFault} autoFocus>
            Close
          </button>
        </div>
      </div>
    </FloatingPanel>
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
    presentFault({
      text: text ?? 'word|unplayable-board|EXAMPLE|',
      diagnostics:
        diagnostics ??
        'word — key=unplayable-board code=P0001 detail="a hand-triggered test fault (window.pupfault)" — 00:00:00',
    })
}
