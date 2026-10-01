// cs-unmet

/** The bubble on screen: the element it names, and what it says. */
export type ShownTooltip = { carrier: Element; text: string }

/**
 * What the pointer and touch triggers share: which carrier is being asked
 * about, the one pending show, and the bubble on screen. A carrier is any
 * element wearing `data-tooltip`.
 */
export type TooltipControl = {
  // The carrier the bubble is up for, or is about to be; null when none is.
  activeCarrier: Element | null
  // Show the carrier's bubble now. False when it has nothing to say.
  show: (carrier: Element) => boolean
  // Show the carrier's bubble after `delayMs`, replacing any show still pending.
  schedule: (carrier: Element, delayMs: number) => void
  // Take the bubble down and cancel a pending show.
  hide: () => void
  // Take the bubble down, but let a pending show still happen.
  hideShown: () => void
}

/** The control over `setShown`, the host's state for the bubble on screen. */
export function makeTooltipControl(
  setShown: (shown: ShownTooltip | null) => void,
): TooltipControl {
  let pending: number | undefined

  const control: TooltipControl = {
    activeCarrier: null,
    show(carrier) {
      const text = carrier.getAttribute('data-tooltip')
      if (!text) return false
      control.activeCarrier = carrier
      setShown({ carrier, text })
      return true
    },
    schedule(carrier, delayMs) {
      clearTimeout(pending)
      pending = window.setTimeout(() => control.show(carrier), delayMs)
    },
    hide() {
      clearTimeout(pending)
      control.hideShown()
    },
    hideShown() {
      control.activeCarrier = null
      setShown(null)
    },
  }
  return control
}

/** The carrier an event happened inside, or null when it was outside one. */
export function findCarrier(target: EventTarget | null): Element | null {
  return (target as Element | null)?.closest?.('[data-tooltip]') ?? null
}

/** Whether a carrier is a readout rather than a control
 *  (`data-tooltip-on="readout"`; tooltips/doc.md → Readouts). */
export function isReadout(carrier: Element): boolean {
  return carrier.getAttribute('data-tooltip-on') === 'readout'
}

/** Add a document listener, and return what removes it. */
export function listenOnDocument<K extends keyof DocumentEventMap>(
  type: K,
  handler: (e: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  document.addEventListener(type, handler, options)
  return () => document.removeEventListener(type, handler, options)
}
