// cs-unmet

/** The gap between the carrier and the bubble. */
const GAP_PX = 8
/** The margin kept from the viewport's edges. */
const EDGE_MARGIN_PX = 4

type Rect = { left: number; top: number; bottom: number; width: number; height: number }
type Size = { width: number; height: number }

/**
 * Where the bubble goes, in viewport pixels: centered over the carrier, above
 * it unless there's no room on top, and kept inside the side edges. Null when
 * the carrier has left the page between scheduling and drawing (it measures
 * zero), so there is nothing to point at.
 */
export function computeBubblePosition(
  carrierRect: Rect,
  bubbleSize: Size,
  viewportWidth: number,
): { x: number; y: number } | null {
  if (carrierRect.width === 0 && carrierRect.height === 0) return null

  const centeredX = carrierRect.left + carrierRect.width / 2 - bubbleSize.width / 2
  const x = Math.min(
    Math.max(centeredX, EDGE_MARGIN_PX),
    viewportWidth - bubbleSize.width - EDGE_MARGIN_PX,
  )
  const aboveY = carrierRect.top - bubbleSize.height - GAP_PX
  const y = aboveY >= EDGE_MARGIN_PX ? aboveY : carrierRect.bottom + GAP_PX
  return { x, y }
}
