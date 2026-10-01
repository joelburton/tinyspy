// cs-unmet

import { useEffect, useState } from 'react'
import { bindPointerTriggers } from './pointerTriggers'
import { bindTouchTriggers } from './touchTriggers'
import { makeTooltipControl, type ShownTooltip } from './tooltipControl'

/**
 * The bubble to show, or null. Listens on the whole document, through the
 * pointer triggers and the touch triggers, for as long as the caller is
 * mounted.
 */
export function useShownTooltip(): ShownTooltip | null {
  const [shown, setShown] = useState<ShownTooltip | null>(null)

  useEffect(function bindTooltipTriggers() {
    const control = makeTooltipControl(setShown)
    const unbindTouch = bindTouchTriggers(control)
    const unbindPointer = bindPointerTriggers(control)
    return function unbindTooltipTriggers() {
      unbindTouch()
      unbindPointer()
      control.hide()
    }
  }, [])

  return shown
}
