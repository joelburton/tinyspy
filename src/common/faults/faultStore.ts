// cs-unmet

import { useSyncExternalStore, type ReactNode } from 'react'

/**
 * The fault-modal store — the toastStore pattern (a module singleton via
 * `useSyncExternalStore`) holding a FIFO queue of FAULTS for the single
 * `<FaultModal>` host mounted in App.tsx.
 *
 * A fault is a failure nobody planned for (docs/ui.md → Faults): it renders
 * as a blocking MODAL, not a pill — room to be read, impossible to miss, and
 * "did a box pop up?" is answerable down a phone line.
 *
 * Nothing decides here. `reportDbFault` (lib/supabase/dbEnvelope.ts) picks the
 * words and writes the `[db]` line, then calls `showFaultModal` — including for
 * every call site's `else` scream, which reaches it through `reportUnhandled`.
 *
 * Four callers reach past it, each with a reason: `HomePage` and the
 * `window.pupfault` trigger build their own diagnostics, and `useGameTimer` and
 * `useWordSubmit` show a fault whose words are already chosen.
 *
 * Queue semantics (Joel's rulings, 2026-08-13 — docs/ui.md → Faults):
 *   - Each fault is its OWN modal; strictly one visible; dismissing shows the
 *     next. No batching, no dedupe — revisit later if storms annoy.
 *   - Capped at QUEUE_CAP. Beyond it, new faults are silently dropped from
 *     the UI — "silently" meaning no modal: whoever routed the fault already
 *     wrote its `[db]` console line, so nothing is lost to diagnosis.
 */

export type FaultEntry = {
  /** The player-facing message. For a fault we declared, the sentence its
   *  author wrote at the raise; for a raw one, Postgres's own text; for an
   *  environmental failure, the frontend's sentence. */
  text: ReactNode
  /** The k=v diagnostics line — `diagnosticsLine` in `dbLog.ts`, the same
   *  content as the `[db]` log line.
   *
   *  Optional, and `<FaultModal>` renders it only when present — so a fault
   *  built by hand rather than routed through `reportDbFault` shows a sentence
   *  and nothing under it. Two do that on purpose (`useGameTimer`, which is
   *  showing a fault the server worded). */
  diagnostics?: string
}

const QUEUE_CAP = 5

let queue: FaultEntry[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Put a fault on screen: queue it for the modal, and nothing else. It decides
 *  nothing and logs nothing — a caller that needs the words chosen and the
 *  `[db]` line written wants `reportDbFault` (lib/supabase/dbEnvelope.ts), which
 *  does both and then calls this. Drops the fault (UI-only — the `[db]` line
 *  already fired) when the queue is full. */
export function showFaultModal(fault: FaultEntry): void {
  if (queue.length >= QUEUE_CAP) return
  queue = [...queue, fault]
  emit()
}

/** Dismiss the visible fault; the next queued one (if any) appears. */
export function dismissFaultModal(): void {
  queue = queue.slice(1)
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** The fault currently owed a modal, or null. Reference-stable per change. */
export function useCurrentFault(): FaultEntry | null {
  return useSyncExternalStore(subscribe, () => queue[0] ?? null)
}

/** Test seam: reset the queue between unit tests. */
export function clearFaultsForTest(): void {
  queue = []
  emit()
}

/** Test seam: the queue as-is, for component tests asserting that a fault
 *  was routed to the modal rather than a slot. */
export function peekFaultsForTest(): readonly FaultEntry[] {
  return queue
}
