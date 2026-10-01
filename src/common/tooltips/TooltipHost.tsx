// cs-blessed-common-hosts

import { TooltipBubble } from './TooltipBubble'
import { useShownTooltip } from './useShownTooltip'

/**
 * The styled-tooltip renderer — the single host behind every `data-tooltip`
 * attribute, mounted once in App.tsx like `<ToastHost>`. Which controls carry
 * one, and what it says, is docs/ui.md → Button iconography → Conventions.
 *
 * Asking about a carrier is the triggers' (`useShownTooltip`); drawing the
 * answer is `TooltipBubble`'s. tooltips/doc.md has the contract: hover and
 * keyboard focus after a beat, a long press on touch, readouts at once, and a
 * disabled button's bubble shown like any other.
 */
export function TooltipHost() {
  const shown = useShownTooltip()
  if (!shown) return null
  return <TooltipBubble shown={shown} />
}
