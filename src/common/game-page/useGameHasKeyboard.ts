// cs-audited-game-page

import { useEffect, useState } from 'react'
import { isEditableField } from '../keyboard/editableField'

/**
 * True while the *game* owns the keyboard — i.e. no text field is focused.
 *
 * This is the condition under which a bare keystroke reaches the board at all,
 * which is why the simulated caret an entry box draws blinks only while it is
 * true: **caret visible ⟺ keystrokes go to the game.** A caret on the board
 * while a real one sits in the chat box reads as two cursors.
 *
 * That invariant is why a control which takes focus away has to give it back —
 * `FilterSelect` and bananagrams' board both work at that, and cite this hook
 * for the reason, without calling it.
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
