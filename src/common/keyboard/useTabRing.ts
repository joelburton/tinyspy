// cs-unmet

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * A surface's Tab stops, in the order Tab visits them. A ref rather than an
 * element so a stop can be declared before it renders, and so a list that comes
 * and goes (the club page's second column, on mobile) can simply be absent.
 */
export type TabStop = RefObject<HTMLElement | null>

/**
 * THE STACK OF LIVE RINGS, innermost last.
 *
 * Ordered by mount, which is the ordering we actually want and which React
 * maintains for us: a page mounts, then a dialog opens over it, so the dialog is
 * last and wins until it unmounts. Two overlays open at once and the newer one
 * wins, which is also right.
 *
 * Module-level rather than a context because the thing that has to make the
 * decision is a window listener, and a window listener sits in no subtree — so
 * context nesting, which is the obvious way to express "innermost", cannot
 * reach it. Mount order carries the same information here.
 */
const rings: Array<{ stops: RefObject<TabStop[]> }> = []

/** A stop that is not currently on screen is not a stop. The club page renders
 *  one column at a time on mobile, and Tab must not park the keyboard on the
 *  list that isn't showing. */
function onScreen(el: HTMLElement | null): el is HTMLElement {
  return el !== null && el.offsetParent !== null
}

/**
 * **Tab moves within this surface's ring of stops, and never leaves it.**
 * Shift+Tab is the same ring backwards. The browser's own chrome — the URL bar
 * above all — is never a stop (plans/tab-rings.md).
 *
 * **The ring is declared, never discovered.** Its members are the elements this
 * surface decided Tab should reach, which is why the homepage's header menu and
 * "+ New club" are unreachable without anyone marking them `tabIndex={-1}`:
 * they were simply not put in. Reachability is a list you edit, not a
 * suppression you maintain.
 *
 * **An empty ring is a ring.** `useTabRing([])` means Tab and Shift+Tab are
 * inert — *caught and consumed*, not ignored. That distinction is the whole
 * point: an unhandled Tab escapes to the URL bar and a consumed one cannot.
 *
 * **Innermost wins.** A dialog's ring beats the page's while the dialog is
 * open, and the page gets it back when it closes. Every ring listens, but only
 * the innermost acts.
 *
 * **Why not native Tab.** It cannot express any of this. Even a page with
 * exactly one tab stop still hands Tab to the browser chrome — the browser
 * always includes itself in the cycle and no page attribute takes it out. So
 * containment is the part that has to be built.
 *
 * Not for crosswords, which spends Tab on jumping between clues and so has none
 * left for navigation. That is the one genuine exception, and it costs nothing:
 * it already consumes the key, so it leaks nothing either.
 */
export function useTabRing(stops: TabStop[]): void {
  // The array identity changes every render (callers write it inline), so the
  // listener reads through a ref and never needs re-registering. Refreshed in
  // an effect rather than during render — the same indirection, and for the
  // same reason, as `useGlobalKeyHandler`.
  const stopsRef = useRef(stops)
  useEffect(() => {
    stopsRef.current = stops
  })

  useEffect(function joinTheRingStack() {
    const me = { stops: stopsRef }
    rings.push(me)

    function onKeyDown(e: KeyboardEvent) {
      // Modified chords belong to the browser and the OS — Ctrl-Tab still
      // switches browser tabs.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'Tab') return
      // Every live ring hears this; only the innermost answers.
      if (rings[rings.length - 1] !== me) return

      // TRANSITIONAL. An overlay that has not declared a ring yet still needs
      // its own native Tab, or a focused setup dialog would throw the keyboard
      // back to the page behind it. This guard is what the innermost-wins rule
      // replaces — it goes when the panels and dialogs declare rings of their
      // own (plans/tab-rings.md → The leaks).
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[data-floating-panel], [role="menu"], [role="dialog"]')) return

      // Consume it FIRST, and unconditionally. Everything below decides where
      // to go; nothing below decides whether the browser gets the key, because
      // it never does.
      e.preventDefault()

      const live = stopsRef.current.map((r) => r.current).filter(onScreen)
      if (live.length === 0) return

      const at = live.indexOf(document.activeElement as HTMLElement)
      const step = e.shiftKey ? -1 : 1
      // Focus is somewhere that isn't a stop — most often <body>, after a click
      // on blank page. Enter the ring at the end Tab would naturally reach, so
      // a stray click costs exactly one press to undo.
      const next = at === -1 ? (e.shiftKey ? live.length - 1 : 0) : (at + step + live.length) % live.length
      live[next]!.focus()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      rings.splice(rings.indexOf(me), 1)
    }
  }, [])
}
