import { useEffect, useRef } from 'react'
import { setChatOpen } from '../lib/chatOpenStore'

/**
 * App-level keyboard shortcuts available on any page that has the chat
 * companion + the logo menu (ClubPage and GamePage):
 *
 *   - `/` opens chat (and focuses its input). Already-open stays open.
 *   - `?` opens the logo menu (via the `openMenu` the caller wires to
 *     its `<Menu ref>`).
 *
 * These fire when nothing is focused (the common case mid-game, where
 * word games read keys off `window`) AND when a *game* input is focused
 * (tinyspy's clue field, psychicnum's guess field) — so you can hit `/`
 * to chat without first clicking away. They DON'T fire when a non-game
 * field has focus (a setup form, the chat box itself, a future
 * scratchpad), so `/` and `?` type literally there. Game inputs opt in
 * with `data-game-input`; see isNonGameField.
 *
 * Escape is deliberately NOT handled here — it stays "close the topmost
 * open modal", which the dialogs already own.
 */
export function useChatMenuShortcuts(openMenu: () => void): void {
  // Keep the latest openMenu in a ref so the listener registers once.
  const openMenuRef = useRef(openMenu)
  useEffect(() => {
    openMenuRef.current = openMenu
  })

  useEffect(function attachShortcuts() {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' && e.key !== '?') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isNonGameField(e.target)) return
      // We're taking this key — don't also type it into a focused game
      // input (tinyspy/psychicnum) or trigger find-in-page.
      e.preventDefault()
      if (e.key === '/') {
        setChatOpen(true)
        // Focus the chat box so you can type immediately — also covers
        // the already-open case, where ChatBody's mount-focus won't fire
        // (no remount). rAF waits for the panel to commit to the DOM.
        requestAnimationFrame(() => {
          const input = document.querySelector('[data-chat-input]')
          if (input instanceof HTMLElement) input.focus()
        })
      } else {
        openMenuRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/**
 * Is the event aimed at a text field that should keep `/` and `?` as
 * literal characters? True for an editable element (input / textarea /
 * select / contenteditable) that is NOT marked `data-game-input`.
 *
 * Game input fields opt in via `data-game-input` so the shortcuts still
 * work while you're typing a clue/guess; everything else (setup forms,
 * the chat box, a scratchpad) is a non-game field that owns its keys.
 */
export function isNonGameField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const editable =
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable === true
  return editable && target.dataset.gameInput === undefined
}
