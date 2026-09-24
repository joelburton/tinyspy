// cs-blessed-floating-panels

import { useSyncExternalStore } from 'react'
import type { ConfirmAnswer, ConfirmOptions } from './confirmations'

/**
 * Ask a confirmation question from anywhere, with no component in the way:
 *
 *     if ((await askConfirmation(END_GAME_CONFIRM)) !== 'confirm') return
 *
 * **The only way to ask.** Components call it the same way everything else does
 * — scrabble's Pass and the word dialog's Delete are components and just await
 * it — because the question is drawn by `<ConfirmationHost>` at the app root
 * rather than by whoever asked. The shared run behind every action asks here,
 * which is what makes "the game cannot forget to ask" true.
 *
 * One question at a time, app-wide. A second call while one is up supersedes it
 * and the first resolves `null` — it cannot happen from a modal-blocked UI, but
 * it beats a dangling promise.
 *
 * `<ConfirmationHost>` in `App.tsx` is what draws the pending question. Without
 * it mounted nothing appears and every promise resolves `null`, which is the
 * safe direction: an unanswerable question is not consent.
 *
 * The host sits above every route, so a question survives its asker unless the
 * asker takes it back: `withdrawConfirmation`, which the action run calls when
 * the binding that asked unmounts.
 */

// `asked` is the options object as the caller passed it — the spread copies its
// fields for the host, and the original is what a withdrawal is matched against.
type Pending = ConfirmOptions & { asked: ConfirmOptions; resolve: (answer: ConfirmAnswer) => void }

let pending: Pending | null = null
let hosted = false
const listeners = new Set<() => void>()

/** Tell the host the pending question changed. */
function notify(): void {
  for (const listener of listeners) listener()
}

/** The host's subscription, in the shape `useSyncExternalStore` takes. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Ask the question. Resolves to the act the player picked — `'confirm'`, or
 * `'alternative'` where the question offers a second way to say yes — and to
 * `null` on cancel, Escape, a superseding question, or no host mounted.
 */
export function askConfirmation(opts: ConfirmOptions): Promise<ConfirmAnswer> {
  if (!hosted) {
    console.error('askConfirmation: no <ConfirmationHost> is mounted — answering no', opts.title)
    return Promise.resolve(null)
  }
  return new Promise<ConfirmAnswer>((resolve) => {
    pending?.resolve(null) // a superseded question answers "no"
    pending = { ...opts, asked: opts, resolve }
    notify()
  })
}

/** Take back a question whose asker has gone: it answers `null`, as a cancel
 *  does. A no-op when the question on screen is not this one. */
export function withdrawConfirmation(opts: ConfirmOptions): void {
  if (pending?.asked === opts) settleConfirmation(null)
}

/** Answer the pending question. The host's buttons, and `withdrawConfirmation`. */
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
