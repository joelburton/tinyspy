import { useEffect, useRef } from 'react'

/**
 * Window-level keydown listener with a stable ref-dispatch.
 *
 * The caller's `handler` closes over fresh state every render
 * (typed-word, allowed-letters, locked flag), but we only ever
 * register ONE window listener for the component's lifetime.
 * The trick: the listener calls through `ref.current(e)`, and
 * a separate effect keeps `ref.current` updated each render.
 *
 * Without the indirection we'd have two bad choices:
 *   - Re-register the listener every render (the closure is
 *     fresh but every effect re-run goes through add/remove
 *     listener, which leaks during dispatch if multiple
 *     keydowns fire in the same tick).
 *   - Re-register only when deps change (works for some deps
 *     but misses any read-only closure capture, and the deps
 *     array would have to enumerate every variable the
 *     handler reads).
 *
 * Ported as-is from `~/freebee-ws/src/components/useGlobalKeyHandler.js`
 * — same pattern, with types.
 */
export function useGlobalKeyHandler(handler: (e: KeyboardEvent) => void): void {
  const ref = useRef(handler)

  // Keep the ref fresh on every render so the listener below
  // always dispatches into the latest closure. Runs after every
  // render (no deps); cheap.
  useEffect(() => {
    ref.current = handler
  })

  // Register the actual window listener once. The dispatch
  // function reads `ref.current` at event time, not at
  // registration time, so closure freshness comes for free.
  useEffect(function attachKeydownListener() {
    function dispatch(e: KeyboardEvent) {
      ref.current(e)
    }
    window.addEventListener('keydown', dispatch)
    return () => window.removeEventListener('keydown', dispatch)
  }, [])
}
