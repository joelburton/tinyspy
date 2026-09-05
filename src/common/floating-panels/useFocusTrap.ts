// cs-unmet

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
 * **Who calls it: `<FloatingPanel>`, for the families that DIM.** It used to be
 * opt-in per modal, which is how three dimmed forms ended up letting Tab walk
 * out behind them. The trap now FOLLOWS THE SCRIM, because they are the
 * same claim said twice: a scrim already blocks the pointer on everything below,
 * so an untrapped one hands a keyboard user Tab access to controls they cannot
 * click. Companions and dialogs never dim and never trap — the page behind them
 * is live and you must be able to leave.
 *
 * Chat is unaffected by a modal's trap even while sitting above it: the listener
 * is on the modal's OWN panel subtree, so a Tab pressed inside chat never
 * reaches it. The modal owns the keyboard; chat stays reachable by pointer.
 *
 * Escape and initial focus live elsewhere — `usePanelEscape` and the leaf's
 * `autoFocus` on its primary button. This hook only owns the wrap-around.
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
