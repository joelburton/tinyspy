// cs-unmet

import { useCallback, useRef, useState } from 'react'

/**
 * Wrap an async action so only ONE run is in flight at a time — a second
 * invocation while the first is still going is dropped, not queued.
 *
 * The problem it solves: a handler that fires a mutation and then navigates
 * has a window between the click and the response where the trigger is still
 * live. "New game" is the sharp case — `common.create_game` vacates the club's
 * current-view pointer and inserts a NEW current game, so two calls really do
 * produce two games, the first orphaned in the club list, and every peer gets
 * two invitation toasts. Nothing self-heals that.
 *
 * **Guard the handler, not the button.** New game has three triggers (the
 * terminal `NewGameButton`, the game-menu item, and the global `+` shortcut),
 * so a `disabled` prop covers a third of the problem. Wrapping the handler
 * covers all of them at once, whatever fires it.
 *
 *     const [newGame, starting] = useSingleFlight(handleNewGame)
 *     // …then feed `starting` to whatever control should show the wait — the
 *     // terminal New game button grays while the create is out, so a slow
 *     // network reads as "working" rather than "nothing happened". No trigger
 *     // NEEDS that: they all route through the guarded handler, which is the
 *     // whole point of guarding there.
 *
 * **The other shape it gets used for**, since New game dominates the story
 * above: a control that stays live across a round trip and changes the board
 * rather than leaving the page (waffle's swap, setgame's hint) — where a second
 * press runs against the state the first press is still changing. Those callers
 * ignore `pending`, which is worth knowing about the drop: nothing else reports
 * it, so where nobody reads `pending` the dropped press leaves no trace at all.
 *
 * A ref does the gating and state does the reporting, deliberately: the ref is
 * readable synchronously by the very next event (a `setState` wouldn't have
 * committed yet, so two clicks in one tick would both pass), while `pending`
 * exists only to re-render the UI. Don't collapse them into one.
 *
 * Cleared in a `finally`, so a failed action stays retryable — a guard that
 * wedges the control after one network blip is worse than the bug.
 *
 * The gate closes on the FIRST call, before the wrapped action's own confirm
 * dialog resolves. That's deliberate: our confirm is the async styled modal
 * (`useConfirmation`), not a thread-blocking `window.confirm`, so a second
 * trigger can absolutely arrive while it's open — and stacking two "start a new
 * game?" modals is its own small bug. Canceling still clears the gate.
 *
 * NOT for idempotent, everyone-fires-it calls (`submit_timeout`) or for actions
 * a state flag already gates (End / Concede stop themselves once `isTerminal` /
 * `myConceded` flips). Use it where a second call does real, unwanted work.
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
          // unhandled rejection, which reports worse and tells us less. (Same
          // log-and-swallow shape as useCommonGame's view-state calls.)
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
