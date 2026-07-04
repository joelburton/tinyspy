import { useEffect, useState } from 'react'

/**
 * Is `el` a focused text field that owns its own keystrokes? True for an
 * editable element — `<input>` / `<textarea>` / `<select>` / contenteditable.
 *
 * This is the same predicate `useGlobalKeyHandler` uses to decide whether to
 * route a keystroke to the game (it declines while such a field is focused)
 * and that `isNonGameField` (useAppShortcuts) builds on. Kept here as the one
 * shared definition; those two are candidates to consolidate onto it.
 */
export function isEditableField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

/**
 * True while the *game* owns the keyboard — i.e. no text field is focused.
 *
 * The capture-input games (psychicnum, and the word games on
 * `useGlobalKeyHandler`) read keystrokes off the window and show a simulated
 * caret in their entry box. That caret must be honest: it should blink only
 * when typing actually lands in the game. The moment the chat box (or a
 * dialog field) takes focus, keys go *there*, and a caret still blinking on
 * the board reads as two cursors. Gating the caret on this hook ties its
 * blink to the exact condition under which `useGlobalKeyHandler` dispatches —
 * **caret visible ⟺ keystrokes go to the game.**
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
