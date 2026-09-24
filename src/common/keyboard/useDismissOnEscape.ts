// cs-blessed-floating-panels

import { useEffect } from 'react'
import { matches } from '../actions/chord'
import { ESCAPE } from './componentKeys'

/**
 * Escape dismisses this transient overlay, and nothing else acts on the press.
 *
 * For the things that hover over the page WITHOUT being floating panels — a
 * definition popover, a filter's dropdown, the phone info sheet. They have no
 * rect and no titlebar, so they are not the shell's business and do not join
 * `usePanelEscape`'s registry; but Escape still means "close this", and if the
 * registry ALSO hears the press it closes the panel underneath at the same
 * time. One press, two dismissals (the anagram finder: define a word, press
 * Escape, lose the definition and the finder).
 *
 * **Bound to `document`, not `window`, and that is the whole mechanism.** The
 * panel registry listens on `window`, so a `window` listener here would be a
 * sibling on the same target — `stopPropagation` does not stop those, and the
 * registry, registered first, would have run already. `document` sits one step
 * earlier in the bubble, so stopping there is what keeps the press from ever
 * reaching the registry.
 *
 * For an overlay that HOLDS FOCUS, prefer an `onKeyDown` on the element itself
 * and stop propagation there — the menu does that, which is why it needs none
 * of this. These three take no focus by design, so a global listener is the
 * only place they can hear the key at all.
 *
 * `src/guards/escapeListeners.test.ts` fails a hand-rolled Escape listener
 * anywhere else, because getting the target wrong fails silently and looks
 * exactly like working code.
 */
export function useDismissOnEscape(active: boolean, onDismiss: () => void): void {
  useEffect(
    function dismissOnEscape() {
      if (!active) return
      function onKey(e: KeyboardEvent) {
        if (!matches(ESCAPE, e)) return
        e.preventDefault()
        e.stopPropagation()
        onDismiss()
      }
      document.addEventListener('keydown', onKey)
      return function unbind() {
        document.removeEventListener('keydown', onKey)
      }
    },
    [active, onDismiss],
  )
}
