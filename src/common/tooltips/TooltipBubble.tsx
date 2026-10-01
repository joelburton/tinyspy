// cs-unmet

import { createPortal } from 'react-dom'
import { computeBubblePosition } from './bubblePosition'
import type { ShownTooltip } from './tooltipControl'
import styles from './TooltipBubble.module.css'

/**
 * The bubble itself, portaled to `<body>` so no `overflow: hidden` ancestor can
 * clip it, and placed by measuring (`computeBubblePosition`).
 *
 * `aria-hidden`: it repeats the carrier's own accessible name.
 */
export function TooltipBubble({ shown }: { shown: ShownTooltip }) {
  // Placed in the ref callback, once the bubble exists to be measured: style
  // writes, no second render.
  function place(node: HTMLDivElement | null) {
    if (!node) return
    const position = computeBubblePosition(
      shown.carrier.getBoundingClientRect(),
      { width: node.offsetWidth, height: node.offsetHeight },
      window.innerWidth,
    )
    if (!position) {
      node.style.display = 'none'
      return
    }
    node.style.left = `${position.x}px`
    node.style.top = `${position.y}px`
  }

  return createPortal(
    <div ref={place} className={styles.bubble} aria-hidden="true">
      {shown.text}
    </div>,
    document.body,
  )
}
