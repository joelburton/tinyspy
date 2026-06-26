import { useEffect, useRef } from 'react'

/**
 * Window-level keydown listener with a stable ref-dispatch.
 *
 * The caller's `handler` closes over fresh state every render (the
 * typed word, what's allowed right now, a locked flag, …), but we only
 * ever register ONE window listener for the component's lifetime. The
 * trick: the listener calls through `ref.current(e)`, and a separate
 * effect keeps `ref.current` pointed at the latest handler each render.
 *
 * Without the indirection there are two bad choices:
 *   - Re-register the listener every render — the closure is fresh, but
 *     every effect re-run goes through add/remove listener (and a deps
 *     array that includes per-keystroke state, like the typed word,
 *     re-registers on every keypress).
 *   - Re-register only when deps change — works for some deps but misses
 *     any read-only closure capture, and the deps array has to enumerate
 *     every variable the handler reads.
 *
 * Used by the word games (spellingbee, wordle) for physical-keyboard input
 * alongside their on-screen keyboards. Game-specific key handling stays
 * in the handler the caller passes; only the listen-once mechanism is
 * shared. The handler is responsible for its own gating (e.g. an early
 * `return` when input isn't currently accepted).
 *
 * One gate IS built in: keystrokes aimed at a focused text field (the
 * chat box, a dialog input, a contenteditable) are never dispatched.
 * A window-level game-key handler would otherwise also fire while the
 * user types into chat — typing "hello" would spell it onto the board
 * too, making chat unusable. When a field has focus, that field owns
 * the key, full stop; the handler only ever sees board-level input.
 */
export function useGlobalKeyHandler(handler: (e: KeyboardEvent) => void): void {
  const ref = useRef(handler)

  // Keep the ref fresh on every render so the listener below always
  // dispatches into the latest closure. Runs after every render (no
  // deps); cheap.
  useEffect(() => {
    ref.current = handler
  })

  // Register the actual window listener once. The dispatch function
  // reads `ref.current` at event time, not at registration time, so
  // closure freshness comes for free.
  useEffect(function attachKeydownListener() {
    function dispatch(e: KeyboardEvent) {
      // Let a focused text field keep its own keystrokes (see above).
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return
      }
      ref.current(e)
    }
    window.addEventListener('keydown', dispatch)
    return () => window.removeEventListener('keydown', dispatch)
  }, [])
}
