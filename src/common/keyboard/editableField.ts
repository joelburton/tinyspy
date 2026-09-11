// cs-blessed-keyboard

/**
 * Who owns a keystroke: the thing with focus, or the page?
 *
 * The app's games read keys off `window`, so every listener needs the same
 * answer to "is this key already spoken for" — and before this was one file it
 * was written out four times, one of them missing `<select>`. Reach for these
 * two rather than testing tag names yourself.
 */

/** Is this a focused text field, which owns its own keystrokes outright?
 *  `<input>` / `<textarea>` / `<select>` / anything contenteditable. */
export function isEditableField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    // `=== true` because jsdom leaves this undefined, and a predicate that can
    // answer `undefined` is one a caller has to remember to coerce.
    el.isContentEditable === true
  )
}

/**
 * Is this a text field that is NOT the game's own — chat, a setup form, the
 * scratchpad?
 *
 * The shell's shortcuts use this instead of `isEditableField` so that `/` still
 * reaches chat while you are typing a clue: a game's input opts in by carrying
 * `data-game-input`, and everything else keeps its characters literal.
 */
export function isNonGameField(el: EventTarget | null): boolean {
  if (!isEditableField(el)) return false
  return (el as HTMLElement).dataset.gameInput === undefined
}
