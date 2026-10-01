// cs-unmet

import { findCarrier, isReadout, listenOnDocument, type TooltipControl } from './tooltipControl'

/** How long a touch must be held before the bubble appears — longer than the
 *  hover beat, since a press starts out looking like a tap. */
const LONG_PRESS_MS = 450
/** A press that wanders further than this is a scroll, not a hold. */
const MOVE_TOLERANCE_PX = 10

/**
 * The touch way of asking about a carrier: press and hold a control, or tap a
 * readout. The next touch anywhere dismisses the bubble, since a finger never
 * "leaves".
 *
 * Lifting after a hold still fires a click, so the click that follows a
 * completed hold is swallowed — holding Restart to learn its name must not
 * restart the game. A canceled touch, and every new one, disarms that, so it
 * can never eat an unrelated tap (tooltips/doc.md).
 *
 * Returns what unbinds them.
 */
export function bindTouchTriggers(control: TooltipControl): () => void {
  let pressTimer: number | undefined
  let pressStart: { x: number; y: number } | null = null
  let isClickSuppressed = false

  function cancelPress() {
    clearTimeout(pressTimer)
    pressStart = null
  }

  function onTouchStart(e: TouchEvent) {
    isClickSuppressed = false
    // This touch dismisses the bubble already up, and opens nothing.
    if (control.activeCarrier) {
      control.hide()
      return
    }
    const touch = e.touches[0]
    const carrier = findCarrier(e.target)
    if (!carrier || !touch) return
    // A readout answers the tap itself, and has no click to swallow.
    if (isReadout(carrier)) {
      control.show(carrier)
      return
    }
    pressStart = { x: touch.clientX, y: touch.clientY }
    clearTimeout(pressTimer)
    pressTimer = window.setTimeout(() => {
      if (control.show(carrier)) isClickSuppressed = true
    }, LONG_PRESS_MS)
  }

  function onTouchMove(e: TouchEvent) {
    const touch = e.touches[0]
    if (!pressStart || !touch) return
    if (Math.abs(touch.clientX - pressStart.x) > MOVE_TOLERANCE_PX ||
        Math.abs(touch.clientY - pressStart.y) > MOVE_TOLERANCE_PX) {
      cancelPress()
    }
  }

  // The system took the gesture (a call, the app switcher): no click follows.
  function onTouchCancel() {
    cancelPress()
    isClickSuppressed = false
  }

  function onClickCapture(e: MouseEvent) {
    if (!isClickSuppressed) return
    isClickSuppressed = false
    e.preventDefault()
    e.stopPropagation()
  }

  // Android's long-press menu would otherwise open over the bubble.
  function onContextMenu(e: Event) {
    if (findCarrier(e.target)) e.preventDefault()
  }

  const unbinds = [
    listenOnDocument('touchstart', onTouchStart, { passive: true }),
    listenOnDocument('touchmove', onTouchMove, { passive: true }),
    listenOnDocument('touchend', cancelPress),
    listenOnDocument('touchcancel', onTouchCancel),
    listenOnDocument('click', onClickCapture, { capture: true }),
    listenOnDocument('contextmenu', onContextMenu),
  ]
  return () => {
    clearTimeout(pressTimer)
    unbinds.forEach((unbind) => unbind())
  }
}
