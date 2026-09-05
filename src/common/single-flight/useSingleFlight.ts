// cs-blessed-single-flight

import { useCallback, useRef, useState } from 'react'

/**
 * Wrap an async action so only ONE run is in flight at a time — a second
 * invocation while the first is still going is dropped, not queued.
 *
 *     const [newGame, starting] = useSingleFlight(handleNewGame)
 *
 * `starting` is for whatever control should show the wait; nothing else reports
 * a dropped press. Guard the HANDLER rather than a control, and every trigger —
 * button, menu row, keyboard shortcut — is covered at once. NOT for an
 * idempotent call every client fires (`submit_timeout`), and not for an action a
 * state flag already gates (End / Concede stop once `isTerminal` / `myConceded`
 * flips). This folder's `doc.md` has the rest: which callers use it, and why the
 * guard sits where it does.
 *
 * Two facts about the timing a caller has to know. The gate closes on the FIRST
 * call, before the wrapped action's own confirm dialog resolves — ours is the
 * async styled modal (`useConfirmation`), so a second trigger can arrive while
 * the question is up. And it clears in a `finally`, so a failed action stays
 * retryable; a guard that wedges the control after one network blip is worse
 * than the bug.
 *
 * A ref does the gating and state does the reporting, deliberately: the ref is
 * readable synchronously by the very next event (a `setState` wouldn't have
 * committed yet, so two clicks in one tick would both pass), while `pending`
 * exists only to re-render the UI. Don't collapse them into one.
 */
export function useSingleFlight<A extends unknown[]>(
  action: (...args: A) => Promise<void> | void,
): [run: (...args: A) => void, pending: boolean] {
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(
    (...args: A) => {
      if (inFlight.current) return
      inFlight.current = true
      setPending(true)
      void (async () => {
        try {
          await action(...args)
        } catch (err) {
          // The wrapped handlers surface their own failures as a feedback pill
          // and resolve normally, so reaching here means an unexpected throw —
          // a bug in the action, not a failed RPC. Log rather than rethrow:
          // rethrowing out of this detached async IIFE only becomes an
          // unhandled rejection, which reports worse and tells us less.
          console.error('useSingleFlight: the wrapped action threw', err)
        } finally {
          inFlight.current = false
          setPending(false)
        }
      })()
    },
    [action],
  )

  return [run, pending]
}
