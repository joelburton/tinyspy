import { useEffect, type RefObject } from 'react'

/**
 * Keep Tab / Shift-Tab focus cycling *inside* the floating panel that contains
 * `anchorRef`, so a modal reads as a self-contained keyboard surface (Tab from
 * the last control wraps to the first; Shift-Tab from the first wraps to the
 * last) instead of leaking focus to the page behind it.
 *
 * It operates on the enclosing `[data-floating-panel]` (the shell `<FloatingPanel>`
 * marks) rather than a specific element, so the trap naturally includes the
 * panel's header close (×) alongside the body's own buttons — the whole panel is
 * the boundary. Pass a ref to any element the dialog renders inside that panel;
 * the hook walks up to the panel on mount.
 *
 * Scope note: this is opt-in per modal (call it from the dialog body), NOT baked
 * into every `<FloatingPanel>` — the always-on chat / scratchpad are non-modal and
 * must NOT trap focus (you'd never Tab back out to the game). Only true modals
 * (a suspend confirm, Setup, …) want it.
 *
 * Esc-to-close and initial focus stay where they already live (FloatingPanel's Esc
 * handler; the dialog's `autoFocus` on its primary button) — this hook only owns
 * the wrap-around.
 */
export function useFocusTrap(anchorRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const panel = anchorRef.current?.closest<HTMLElement>('[data-floating-panel]')
    if (!panel) return

    // Tab order = the panel's focusable controls in DOM order. Recomputed on each
    // Tab (cheap, and robust if a control enables/disables), filtering out hidden
    // or disabled ones. `[tabindex="-1"]` is programmatically-focusable-only, so
    // it's excluded from the Tab ring.
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [anchorRef])
}
