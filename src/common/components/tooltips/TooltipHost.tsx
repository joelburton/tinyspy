import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './TooltipHost.module.css'

/** The show-side beat — long enough not to flicker on a pass-through, far
 *  quicker than the native title bubble (which some browsers delay past the
 *  point anyone notices — the reason this system exists). */
const SHOW_DELAY_MS = 400
/** Gap between the anchor and the bubble; margin kept from the viewport edge. */
const GAP_PX = 8
const EDGE_MARGIN_PX = 4

type Anchor = { el: Element; text: string }

/**
 * The styled-tooltip renderer — the single host behind every `data-tooltip`
 * attribute (ActionButton wires `tooltip ?? label`; ShuffleButton /
 * BackToClubButton / PauseButton carry theirs directly). Mounted once in
 * App.tsx, like `<ToastHost>`.
 *
 * Why JS-positioned (vs the earlier pure-CSS `::after` bubble): a CSS bubble
 * can't see the viewport, so it overflowed off-screen near edges — the header
 * PauseButton needed a hand-placed `data-tooltip-below` variant, and a bubble
 * near a side edge just clipped. Here the bubble is measured and **clamped to
 * the viewport**: above the anchor by default, flipped below when there's no
 * room on top, x pinned inside the edges. Bonus: `position: fixed` in a body
 * portal escapes `overflow: hidden` ancestors, which clipped the CSS version.
 *
 * Interaction contract (matches the CSS version it replaces): shows after a
 * short beat on hover or keyboard focus (`:focus-visible` only — a mouse
 * click's focus doesn't count); hides instantly on leave/blur/scroll/press.
 * Delegated listeners on the document, so it costs one host regardless of how
 * many buttons carry the attribute. The bubble itself is `aria-hidden` — it
 * visually duplicates the control's accessible name (or enriches it; the name
 * itself comes from the button's text / aria-label).
 *
 * One accepted regression vs CSS: DISABLED buttons don't fire mouse events,
 * so their tooltips no longer show (the CSS :hover did). Minor — the disabled
 * state itself is the message there.
 */
export function TooltipHost() {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  useEffect(() => {
    let timer: number | undefined
    let current: Element | null = null

    const hide = () => {
      clearTimeout(timer)
      current = null
      setAnchor(null)
    }
    const schedule = (el: Element) => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const text = el.getAttribute('data-tooltip')
        if (text) setAnchor({ el, text })
      }, SHOW_DELAY_MS)
    }

    // Hover (delegated): entering anything inside a [data-tooltip] schedules
    // its bubble; moving to a target outside one hides. Gated off entirely on
    // touch devices — a tap's synthetic hover would leave a stuck bubble.
    // jsdom (the vitest env) has no matchMedia — treat as hover-capable, like
    // useIsMobile treats it as desktop; real browsers always have it.
    const hoverable =
      typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover)').matches
    const onMouseOver = (e: MouseEvent) => {
      if (!hoverable) return
      const el = (e.target as Element | null)?.closest?.('[data-tooltip]') ?? null
      if (el === current) return
      if (!el) {
        hide()
        return
      }
      current = el
      clearTimeout(timer)
      setAnchor(null) // moving between two buttons: restart the beat
      schedule(el)
    }
    // Leaving the window entirely fires mouseout with no relatedTarget.
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget === null) hide()
    }
    // Keyboard focus — but only :focus-visible (tabbing), not click-focus.
    const onFocusIn = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tooltip]') ?? null
      if (el && el.matches(':focus-visible')) {
        current = el
        schedule(el)
      }
    }
    const onFocusOut = () => hide()
    // A press means the user is acting (and may change the button's state —
    // a stale bubble would lie): cancel everything. Scroll only dismisses a
    // VISIBLE bubble (its measured position is now stale) — a pending timer
    // survives, because position is measured fresh at show time and inner
    // containers scroll programmatically right after state transitions (which
    // would otherwise eat a tooltip scheduled in that window).
    const onMouseDown = () => hide()
    const onScroll = () => setAnchor(null)

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [])

  if (!anchor) return null

  // Position in the ref callback (after the bubble exists, so it can be
  // measured) — imperative style writes, no second render pass.
  const place = (node: HTMLDivElement | null) => {
    if (!node) return
    const r = anchor.el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) {
      // The anchor left the DOM between schedule and render (a state swap
      // mid-hover) — nothing sane to point at.
      node.style.display = 'none'
      return
    }
    const w = node.offsetWidth
    const h = node.offsetHeight
    const x = Math.min(
      Math.max(r.left + r.width / 2 - w / 2, EDGE_MARGIN_PX),
      window.innerWidth - w - EDGE_MARGIN_PX,
    )
    // Above by default; below when the top edge is too close (the old
    // PauseButton special case, now automatic for any anchor).
    const above = r.top - h - GAP_PX
    const y = above >= EDGE_MARGIN_PX ? above : r.bottom + GAP_PX
    node.style.left = `${x}px`
    node.style.top = `${y}px`
  }

  return createPortal(
    <div ref={place} className={styles.bubble} aria-hidden="true">
      {anchor.text}
    </div>,
    document.body,
  )
}
