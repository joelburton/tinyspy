// cs-unmet

import { findCarrier, isReadout, listenOnDocument, type TooltipControl } from './tooltipControl'

/** The hover and focus beat: long enough not to flicker on a pass-through, far
 *  quicker than the browser's own title bubble. */
const SHOW_DELAY_MS = 400
/** A readout's beat: at once (tooltips/doc.md → Readouts). */
const READOUT_SHOW_DELAY_MS = 0

function getShowDelay(carrier: Element): number {
  return isReadout(carrier) ? READOUT_SHOW_DELAY_MS : SHOW_DELAY_MS
}

/**
 * The mouse and keyboard ways of asking about a carrier. Hovering shows its
 * bubble after a beat, and so does keyboard focus (`:focus-visible` only — a
 * click's focus doesn't count). Leaving, blurring or pressing hides it, and a
 * scroll hides a visible bubble but lets a pending one through
 * (tooltips/doc.md). Hover is off on a device with no hover, where a tap's
 * synthetic hover would strand a bubble.
 *
 * Returns what unbinds them.
 */
export function bindPointerTriggers(control: TooltipControl): () => void {
  // jsdom has no matchMedia and counts as hover-capable. Asked once: a device
  // doesn't gain a mouse mid-session.
  const isHoverable =
    typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover)').matches

  function onMouseOver(e: MouseEvent) {
    if (!isHoverable) return
    const carrier = findCarrier(e.target)
    if (carrier === control.activeCarrier) return
    if (!carrier) {
      control.hide()
      return
    }
    // Moving between two carriers restarts the beat.
    control.hideShown()
    control.activeCarrier = carrier
    control.schedule(carrier, getShowDelay(carrier))
  }

  // Leaving the window entirely fires a mouseout with no relatedTarget.
  function onMouseOut(e: MouseEvent) {
    if (e.relatedTarget === null) control.hide()
  }

  function onFocusIn(e: FocusEvent) {
    const carrier = findCarrier(e.target)
    if (carrier && carrier.matches(':focus-visible')) {
      control.activeCarrier = carrier
      control.schedule(carrier, getShowDelay(carrier))
    }
  }

  // A press may change the control, so a bubble about it would go stale. A
  // readout's text can't, so its bubble stays.
  function onMouseDown(e: MouseEvent) {
    const carrier = findCarrier(e.target)
    if (carrier && isReadout(carrier)) return
    control.hide()
  }

  // Clearing the active carrier too, so the control still under the pointer
  // can show its bubble again on its next mouseover.
  function onScroll() {
    control.hideShown()
  }

  const unbinds = [
    listenOnDocument('mouseover', onMouseOver),
    listenOnDocument('mouseout', onMouseOut),
    listenOnDocument('focusin', onFocusIn),
    listenOnDocument('focusout', () => control.hide()),
    listenOnDocument('mousedown', onMouseDown),
    listenOnDocument('scroll', onScroll, { capture: true, passive: true }),
  ]
  return () => unbinds.forEach((unbind) => unbind())
}
