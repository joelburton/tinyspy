// cs-audited-floating-panels

import { useSyncExternalStore } from 'react'
import type { ConfirmAnswer, ConfirmOptions } from './useConfirmation'

/**
 * Ask a confirmation question from anywhere, with no component in the way:
 *
 *     if ((await askConfirmation(END_GAME_CONFIRM)) !== 'confirm') return
 *
 * Reach for this where the code that asks is not a component and cannot render
 * a modal — the shared run behind every action asks here, which is what makes
 * "the game cannot forget to ask" true. Code that IS a component can still use
 * `useConfirmation` and render its own; the two draw the identical modal.
 *
 * One question at a time, app-wide. A second call while one is up supersedes it
 * and the first resolves `null`, the same rule `useConfirmation` follows — it
 * cannot happen from a modal-blocked UI, but it beats a dangling promise.
 *
 * `<ConfirmationHost>` in `App.tsx` is what draws the pending question. Without
 * it mounted nothing appears and every promise resolves `null`, which is the
 * safe direction: an unanswerable question is not consent.
 */

type Pending = ConfirmOptions & { resolve: (answer: ConfirmAnswer) => void }

let pending: Pending | null = null
let hosted = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Ask the question. Resolves to the act the player picked — `'confirm'`, or
 * `'alternative'` where the question offers a second way to say yes — and to
 * `null` on cancel, Escape, the ✕, a superseding question, or no host mounted.
 */
export function askConfirmation(opts: ConfirmOptions): Promise<ConfirmAnswer> {
  if (!hosted) {
    console.error('askConfirmation: no <ConfirmationHost> is mounted — answering no', opts.title)
    return Promise.resolve(null)
  }
  return new Promise<ConfirmAnswer>((resolve) => {
    pending?.resolve(null) // a superseded question answers "no"
    pending = { ...opts, resolve }
    notify()
  })
}

/** Answer the pending question. The host's buttons, and nothing else. */
export function settleConfirmation(answer: ConfirmAnswer): void {
  pending?.resolve(answer)
  pending = null
  notify()
}

/** The question on screen, or null. The host subscribes; nobody else needs to. */
export function usePendingConfirmation(): Pending | null {
  return useSyncExternalStore(subscribe, () => pending)
}

/** Claim the host slot, and return the release — for `<ConfirmationHost>`'s own
 *  mount effect. A question asked with no host up is refused rather than
 *  silently lost, which is why the slot is tracked at all. */
export function registerConfirmationHost(): () => void {
  hosted = true
  return () => {
    hosted = false
  }
}
