import { useSyncExternalStore, type ReactNode } from 'react'

/**
 * The toast store — a tiny module-level singleton (via `useSyncExternalStore`)
 * that any code can push an announcement into, from a hook or otherwise, so
 * every source funnels into the ONE shared bottom-right stack (`<ToastHost>`).
 *
 * Toasts are for **announcements**, and are deliberately NOT floating panels
 * (see docs/ui.md): they can't be dragged, they live above everything (chat
 * included), they carry an X and an optional single action, and multiple ones
 * stack. See `Toast.tsx` (the card) + `ToastHost.tsx` (the fixed stack).
 *
 * Lifecycle: a toast persists until the user closes it (X) or acts on it — no
 * auto-timeout, because an announcement worth surfacing is worth keeping until
 * it's dealt with (the game invitation is the motivating case). A reactive
 * source (e.g. the invitation watcher) keeps a toast in sync by calling
 * `showToast` with a STABLE `id` (idempotent replace) and `dismissToast` when
 * the underlying thing goes away.
 */

export type ToastTone = 'info' | 'success' | 'error'

/** A toast's single optional action button. */
export type ToastAction = {
  label: string
  onClick: () => void
  /** Keep the toast open after the action runs. Default: the action closes it
   *  (acting is "handled", so the announcement retires). */
  keepOpen?: boolean
}

/** What a caller passes to `showToast`. */
export type ToastSpec = {
  /** Stable id → replaces an existing toast in place (a reactive source keeps
   *  one toast per thing this way). Auto-generated when omitted (one-off). */
  id?: string
  /** The announcement body. A node so callers can bold names etc. */
  message: ReactNode
  /** Accent-stripe color; purely cosmetic. Default `info`. */
  tone?: ToastTone
  /** An optional single action button (e.g. Join). */
  action?: ToastAction
  /** Side effect when the user CLOSES the toast (the X). Not fired by the
   *  action button — acting isn't dismissing. */
  onClose?: () => void
  /** Whether to render the X. Default true. */
  dismissible?: boolean
}

/** A live toast (a spec with its id resolved). */
export type Toast = Omit<ToastSpec, 'id'> & { id: string }

// ── The store: a plain array + listener set, swapped by reference on change ──
let toasts: Toast[] = []
const listeners = new Set<() => void>()
let seq = 0

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// getSnapshot MUST return a stable reference when nothing changed (we only
// reassign `toasts` on a real mutation), so `useSyncExternalStore` doesn't loop.
function getSnapshot(): Toast[] {
  return toasts
}

/**
 * Show a toast — or, when `spec.id` matches an existing one, replace it in
 * place (keeping its position in the stack). Newest toasts sort to the END of
 * the list, which `<ToastHost>` renders nearest the corner. Returns the id.
 */
export function showToast(spec: ToastSpec): string {
  const id = spec.id ?? `toast-${++seq}`
  const toast: Toast = { ...spec, id }
  const at = toasts.findIndex((t) => t.id === id)
  toasts = at >= 0 ? toasts.map((t, i) => (i === at ? toast : t)) : [...toasts, toast]
  emit()
  return id
}

/** Remove a toast by id. Programmatic — does NOT fire the toast's `onClose`
 *  (that's reserved for a user-initiated close via the X). No-op if unknown. */
export function dismissToast(id: string): void {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Subscribe a component to the live toast list (the host uses this). */
export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
