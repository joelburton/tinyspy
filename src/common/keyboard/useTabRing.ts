// cs-blessed-keyboard

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * A surface's Tab stops, in the order Tab visits them. A ref rather than an
 * element so a stop can be declared before it renders, and so a list that comes
 * and goes (the club page's second column, on mobile) can simply be absent.
 */
export type TabStop = RefObject<HTMLElement | null>

/**
 * What a surface hands `useTabRing` — the stops themselves, or the element they
 * live inside.
 *
 * **A page lists them.** Its DOM holds chrome the ring must keep out (the header
 * menu, a hover-revealed delete ×), so "should this be reachable?" is a list you
 * edit rather than an argument about what counts as focusable.
 *
 * **A floating panel says `within`.** A panel is a closed subtree and everything
 * focusable in it is the panel's own — its ✕, its fields, its buttons — so the
 * only list anyone would ever write is "all of them, in order", and it would
 * drift the first time a field was added. Its stops are read at keypress, in DOM
 * order, which is also what keeps a form whose fields come and go honest.
 */
export type Ring = TabStop[] | { within: RefObject<HTMLElement | null> }

/**
 * THE LIVE RINGS, and which one is innermost: the one that RENDERED last.
 *
 * Each ring takes a number from `renderSeq` on its first render. React renders a
 * parent before its children, so a ring nested inside another always has the
 * higher number — even when both mount in the same commit, where mount order
 * would get it backwards (a child's effect runs before its parent's). And a
 * surface opened later renders later: a dialog opened over a page outranks it
 * until it unmounts, and of two overlays the newer wins.
 *
 * Module-level rather than a context because the thing that has to make the
 * decision is a window listener, and a window listener sits in no subtree — so
 * context nesting, which is the obvious way to express "innermost", cannot
 * reach it. Render order carries the same information here.
 */
const rings: Array<{ ring: RefObject<Ring>; order: number }> = []
let renderSeq = 0

/** The live ring that rendered last. */
function innermost(): (typeof rings)[number] | undefined {
  return rings.reduce<(typeof rings)[number] | undefined>(
    (best, r) => (best === undefined || r.order > best.order ? r : best),
    undefined,
  )
}

/** A stop that is not currently on screen is not a stop. The club page renders
 *  one column at a time on mobile, and Tab must not park the keyboard on the
 *  list that isn't showing. Asked in rects rather than `offsetParent`, which a
 *  `position: fixed` element has none of however plainly it is showing. */
function onScreen(el: HTMLElement | null): el is HTMLElement {
  return el !== null && el.isConnected && el.getClientRects().length > 0
}

// What a `within` ring counts as a stop: the things a browser would put in the
// tab order anyway, minus the disabled ones.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

/** `tabindex="-1"` means "focusable by code, not by Tab" everywhere else on the
 *  web, so a panel that marks a scroll region with it means the same thing here.
 *  Filtered rather than selected against: the clauses above would match such an
 *  element anyway, since most of them name a tag. */
function programmaticOnly(el: HTMLElement): boolean {
  return el.getAttribute('tabindex') === '-1'
}

/** The ring's stops as they stand at this keypress — refs resolved, or the
 *  container's focusable descendants in DOM order; either way, only the ones
 *  actually on screen. */
function liveStops(ring: Ring): HTMLElement[] {
  if (Array.isArray(ring)) return ring.map((stop) => stop.current).filter(onScreen)
  const within = ring.within.current
  if (within === null) return []
  return Array.from(within.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !programmaticOnly(el) && onScreen(el),
  )
}

/**
 * **Tab moves within this surface's ring of stops, and never leaves it.**
 * Shift+Tab is the same ring backwards. The browser's own chrome — the URL bar
 * above all — is never a stop.
 *
 * **A page's ring is declared; a floating panel's is everything inside it.**
 * The homepage's header menu and "+ New club" are unreachable without anyone
 * marking them `tabIndex={-1}` — they were simply not put in the list — while a
 * panel passes `{ within: shellRef }` and its ✕, fields and buttons are the ring
 * by being in it. `Ring` above says why the two differ.
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
export function useTabRing(ring: Ring): void {
  // The argument's identity changes every render (callers write it inline), so
  // the listener reads through a ref and never needs re-registering. Refreshed
  // in an effect rather than during render, which is right for a value only a
  // listener reads (`useBoundAction` records the other half of that rule).
  const ringRef = useRef(ring)
  useEffect(() => {
    ringRef.current = ring
  })
  // Taken once, on the first render — see `rings` for why render order and not
  // mount order.
  const [order] = useState(() => ++renderSeq)

  useEffect(function joinTheRings() {
    const me = { ring: ringRef, order }
    rings.push(me)

    function onKeyDown(e: KeyboardEvent) {
      // Modified chords belong to the browser and the OS — Ctrl-Tab still
      // switches browser tabs.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'Tab') return
      // Every live ring hears this; only the innermost answers.
      if (innermost() !== me) return

      // Something closer to the key has already answered it, and the ring does
      // not overrule that: this is how a panel's text field STEPS OUT of its
      // ring, by consuming Tab and blurring itself (`handOffKeyboardOnTab`).
      // The key is caught either way, which is all the ring guarantees.
      if (e.defaultPrevented) return

      // Consume it BEFORE deciding anything else. Everything below picks where
      // to go; nothing below gets to decide whether the browser receives the
      // key, because it never does — which is what makes an empty ring inert
      // rather than leaky.
      e.preventDefault()

      const live = liveStops(ringRef.current)
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
  }, [order])
}
