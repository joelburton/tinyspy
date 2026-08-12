import { useSyncExternalStore, type ReactNode } from 'react'

/**
 * The fault-modal store — the toastStore pattern (a module singleton via
 * `useSyncExternalStore`) holding a FIFO queue of FAULTS for the single
 * `<FaultDialog>` host mounted in App.tsx.
 *
 * A fault is a failure nobody planned for (docs/ui.md → Faults): it renders
 * as a blocking MODAL, not a pill — room to be read, impossible to miss, and
 * "did a box pop up?" is answerable down a phone line. Every sink routes
 * `fault: true` messages here instead of into its slot (useLocalFeedback /
 * the GamePage global slot), so no game wires anything.
 *
 * Queue semantics (Joel's rulings, 2026-08-13 — docs/ui.md → Faults):
 *   - Each fault is its OWN modal; strictly one visible; dismissing shows the
 *     next. No batching, no dedupe — revisit later if storms annoy.
 *   - Capped at QUEUE_CAP. Beyond it, new faults are silently dropped from
 *     the UI — "silently" meaning no modal: the classifier already wrote the
 *     `[db]` console line before routing, so nothing is lost to diagnosis.
 */

export type FaultEntry = {
  /** The player-facing message — the classifier's words (copy or raw key). */
  text: ReactNode
  /** The k=v diagnostics line (serverError.ts faultBits — same content as
   *  the `[db]` log line). Absent only for hand-triggered test faults. */
  diagnostics?: string
}

const QUEUE_CAP = 5

let queue: FaultEntry[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Queue a fault for the modal. Drops it (UI-only — the [db] line already
 *  fired) when the queue is full. */
export function presentFault(fault: FaultEntry): void {
  if (queue.length >= QUEUE_CAP) return
  queue = [...queue, fault]
  emit()
}

/** Dismiss the visible fault; the next queued one (if any) appears. */
export function dismissFault(): void {
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
