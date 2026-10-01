// cs-blessed-keyboard

import type { KeyboardEvent } from 'react'
import { pressed } from './componentKeyGroups'
import { isEditableField } from './editableField'

/**
 * Tab inside a floating panel's text field STEPS OUT of that panel's ring, into
 * the page's — which for a game page means the game gets the keyboard back.
 *
 * **Why this needs code at all.** "Focus the board" isn't something you can do:
 * every game reads its keys off `window`, and the action dispatcher
 * (`common/actions/useActionDispatcher.ts`) deliberately declines
 * while *any* text field is focused — otherwise typing "hello" into chat would
 * also spell it onto the board. So stepping out means having NO field focused,
 * and blurring is the whole move. It's the same one `blurActiveField`, below,
 * makes for a board whose tiles can't take focus.
 *
 * The field's own handler runs before the ring's window listener, so the blur
 * lands and focus falls to `<body>` — which is exactly where a game page's empty
 * ring wants it.
 *
 * **Shift+Tab is left to the ring**, which is the panel's own: it walks back to
 * the panel's other controls, its close ✕ among them.
 *
 * For a floating panel's text field, one you type into while a game is
 * running. Coming back the other way is `act-open-chat` (bound in
 * `AppActionsHost`) — `/` focuses the chat entry from anywhere.
 *
 * @example
 *   <textarea onKeyDown={handOffKeyboardOnTab} … />
 */
export function handOffKeyboardOnTab(e: KeyboardEvent<HTMLElement>): void {
  if (!pressed('keys-leave-field', e)) return
  e.preventDefault()
  e.currentTarget.blur()
}

/**
 * Hand the keyboard back to the game by blurring whatever text field has focus.
 * For a board whose tiles are plain `<div>`s rather than buttons, so clicking
 * one doesn't move focus off a focused chat box: wire it to the board's
 * pointer-down. A no-op when no editable field is focused.
 *
 * @example
 *   <div onPointerDown={blurActiveField}>…</div>
 */
export function blurActiveField(): void {
  const active = document.activeElement
  if (isEditableField(active)) (active as HTMLElement).blur()
}
