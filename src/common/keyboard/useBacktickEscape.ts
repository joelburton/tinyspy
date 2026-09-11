// cs-blessed-keyboard

import { useEffect } from 'react'

/**
 * Global accessibility affordance: let the backtick key `` ` `` stand in
 * for Escape, for keyboards that lack a physical Esc key (an iPad with an
 * external keyboard is the motivating case).
 *
 * The mechanism is deliberately dumb: on a bare `` ` `` we re-dispatch a
 * synthetic Escape `keydown` on the focused element, so every existing Esc
 * handler in the app (dialogs, popovers, the chat panel, menus) keeps
 * working unchanged — we don't have to teach any of them about backtick.
 *
 * The cost is that `` ` `` can never be typed into ANY focused field — chat,
 * the scratchpad, a clue word, every setup and profile form, the rebus box.
 * A literal backtick is rare enough in all of them to be a fair trade for an
 * Escape key on a keyboard that has none, and the blanket is what makes the
 * feature work where it matters most: closing chat from inside its own box.
 *
 * Capture-phase + `preventDefault`/`stopPropagation` so we beat any
 * element-level handler and the key never lands as a character.
 *
 * Mount once at the app root (it's a `window` listener). Harmless on the
 * auth / loading screens — there's just nothing for the synthetic Escape
 * to close there.
 */
export function useBacktickEscape(): void {
  useEffect(function attachBacktickEscape() {
    function onKey(e: KeyboardEvent) {
      backtickToEscape(e)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

/**
 * The pure core, factored out so it's unit-testable: jsdom can't mint a
 * `isTrusted: true` event via `dispatchEvent`, so the test calls this
 * directly with a mock. Returns whether it acted (translated a backtick).
 *
 * Guards, in order:
 *  - `!isTrusted` — ignore synthetic events, including (defensively) any
 *    re-dispatch of our own. The Escape we emit has `key === 'Escape'`, so
 *    the key check below would already skip it; this is belt-and-braces.
 *  - not a bare `` ` `` — any modifier (so `` ⌥` `` / `` ⌘` `` shortcuts and
 *    IME-composing backticks pass through untouched).
 */
export function backtickToEscape(e: KeyboardEvent): boolean {
  if (!e.isTrusted) return false
  if (e.key !== '`') return false
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false
  if (e.isComposing) return false
  e.preventDefault()
  e.stopPropagation()
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  )
  return true
}
