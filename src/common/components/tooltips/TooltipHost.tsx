import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './TooltipHost.module.css'

/** The show-side beat — long enough not to flicker on a pass-through, far
 *  quicker than the native title bubble (which some browsers delay past the
 *  point anyone notices — the reason this system exists). */
const SHOW_DELAY_MS = 400
/** How long a touch must be held before the label appears. Longer than the
 *  hover beat: a hover is already an expression of interest, whereas a press
 *  starts out indistinguishable from a tap, so the hold has to clear the
 *  ordinary-tap duration before it can mean something else. */
const LONG_PRESS_MS = 450
/** A press that wanders further than this is a scroll, not a hold. */
const MOVE_TOLERANCE_PX = 10
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

    // ── Touch: LONG-PRESS reveals the label ──────────────────────────────
    //
    // Icon-only buttons carry their names in these bubbles, and a touch device
    // has no hover to ask with — so on touch the same bubble opens on a press
    // and hold. Nothing is lost by claiming the gesture: a button has no text
    // to select, and long-press costs nothing to anyone who already knows the
    // glyph (unlike a tap-to-reveal, which would tax every future tap).
    //
    // The bubble is dismissed by the next touch anywhere. That end matters: a
    // touch bubble has no pointer-leave to close it, and a stuck bubble is the
    // exact failure the old blanket touch gate existed to avoid.
    let pressTimer: number | undefined
    let pressStart: { x: number; y: number } | null = null
    let suppressClick = false

    const cancelPress = () => {
      clearTimeout(pressTimer)
      pressStart = null
    }
    const onTouchStart = (e: TouchEvent) => {
      // A visible bubble means the previous press is being dismissed by this
      // touch; don't immediately open another.
      if (current) {
        hide()
        return
      }
      const t = e.touches[0]
      const el = (e.target as Element | null)?.closest?.('[data-tooltip]') ?? null
      if (!el || !t) return
      pressStart = { x: t.clientX, y: t.clientY }
      clearTimeout(pressTimer)
      pressTimer = window.setTimeout(() => {
        const text = el.getAttribute('data-tooltip')
        if (!text) return
        current = el
        setAnchor({ el, text })
        // THE load-bearing line. Lifting after a long press still fires a
        // click, so without this, holding a button to learn that it says
        // "Restart" would restart the game. Swallow exactly the next click.
        suppressClick = true
      }, LONG_PRESS_MS)
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!pressStart || !t) return
      // A drag is a scroll, not a press.
      if (Math.abs(t.clientX - pressStart.x) > MOVE_TOLERANCE_PX ||
          Math.abs(t.clientY - pressStart.y) > MOVE_TOLERANCE_PX) {
        cancelPress()
      }
    }
    const onTouchEnd = () => cancelPress()
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      e.preventDefault()
      e.stopPropagation()
    }
    // Android's long-press menu would otherwise open over the bubble.
    const onContextMenu = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-tooltip]')) e.preventDefault()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    document.addEventListener('click', onClickCapture, { capture: true })
    document.addEventListener('contextmenu', onContextMenu)

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      clearTimeout(timer)
      clearTimeout(pressTimer)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      document.removeEventListener('click', onClickCapture, { capture: true })
      document.removeEventListener('contextmenu', onContextMenu)
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
