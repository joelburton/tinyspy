// cs-unmet

import { useEffect, useState } from 'react'
import { isEditableField } from '../keyboard/editableField'

/**
 * True while the *game* owns the keyboard — i.e. no text field is focused.
 *
 * The capture-input games read keystrokes off the window (the entry actions
 * `useCaptureKeys` binds) and show a simulated
 * caret in their entry box. That caret must be honest: it should blink only
 * when typing actually lands in the game. The moment the chat box (or a
 * dialog field) takes focus, keys go *there*, and a caret still blinking on
 * the board reads as two cursors. Gating the caret on this hook ties its
 * blink to the exact condition under which the action dispatcher fires an
 * entry key — **caret visible ⟺ keystrokes go to the game.**
 *
 * Tracked by focus, not by "is chat open": chat can sit open beside the board
 * while you click back to type, and there the game owns the keyboard.
 */
export function useGameHasKeyboard(): boolean {
  const [hasKeyboard, setHasKeyboard] = useState(
    () => !isEditableField(document.activeElement),
  )

  useEffect(function trackFocusOwner() {
    // focusin: something gained focus — is it a field?
    function onFocusIn(e: FocusEvent) {
      setHasKeyboard(!isEditableField(e.target))
    }
    // focusout: something lost focus. `relatedTarget` is what gains it — null
    // when focus falls back to <body> (clicking the board or empty space),
    // which means the game owns the keyboard again.
    function onFocusOut(e: FocusEvent) {
      if (e.relatedTarget === null) setHasKeyboard(true)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return hasKeyboard
}
