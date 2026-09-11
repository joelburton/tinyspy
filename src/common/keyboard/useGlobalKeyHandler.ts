// cs-blessed-keyboard

import { useEffect, useRef } from 'react'
import { isEditableField } from './editableField'

/**
 * Window-level keydown listener with a stable ref-dispatch.
 *
 * The caller's `handler` closes over fresh state every render (the typed
 * word, what's allowed right now, a locked flag, …), but only ONE window
 * listener is registered for the component's lifetime: it calls through a
 * ref an effect keeps pointed at the latest handler.
 *
 * NOT how a key reaches a game — that is the action dispatcher
 * (`common/actions/dispatcher.ts`), and a game gets a key by binding an
 * action. What is left here is Tab, the one key that is nobody's action:
 * `useSwallowTab` and `useCaptureKeys` each swallow it through this. The
 * handler is responsible for its own gating (e.g. an early `return` when
 * input isn't currently accepted).
 *
 * Two gates ARE built in, the same two the dispatcher applies: a keystroke
 * aimed at a focused text field (the chat box, a dialog input, a
 * contenteditable) is never dispatched, and neither is one aimed inside a
 * floating panel. When a field or a panel has focus, it owns the key; the
 * handler only ever sees board-level input.
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
      if (isEditableField(t)) return
      // Likewise, when focus is inside a floating panel / modal (a suspend confirm,
      // Setup, Help…), that panel owns the keyboard: Enter should activate its
      // focused button and Tab should move between its controls. The game's capture
      // otherwise `preventDefault()`s Enter and Tab (see useCaptureKeys), which
      // deadens them inside the modal. `data-floating-panel` marks the panel shell.
      // `closest` is optional-chained: a window/document target (some dispatch
      // paths) has no such method — treat it as "not in a panel".
      if (t?.closest?.('[data-floating-panel]')) return
      ref.current(e)
    }
    window.addEventListener('keydown', dispatch)
    return () => window.removeEventListener('keydown', dispatch)
  }, [])
}
