// cs-blessed-info-sheet

import { useCallback, useState } from 'react'
import { useIsMobile } from '../mobile/useIsMobile'
import { setInfoSheetOpen, useIsInfoSheetOpen } from './infoSheetStore'

/** What a game gets from `useInfoSheet`: the flag to hand `<InfoSheet>`, and a
 *  way back to the board. */
export type InfoSheetApi = {
  // Whether the info page is showing instead of the board (mobile).
  isOpen: boolean
  // Return to the board.
  close: () => void
}

/**
 * A game's handle on the mobile **info page** (doc.md → Details).
 * Below the breakpoint a game's board fills the screen and its info
 * column becomes a second page you switch to.
 *
 * **The switching affordance is not here.** The shell's header renders the
 * switch button, and the flag it drives lives in `infoSheetStore` so the header
 * (in `<GamePage>`) and the sheet (in each game's PlayArea) can both reach it —
 * doc.md → Details. What a game gets is what a game needs: the open flag
 * to hand `<InfoSheet>`, and a way to close.
 *
 * Pair it with:
 *   - `<InfoSheet open={sheet.isOpen} onClose={sheet.close}>` around the InfoCol
 *     (the off-canvas markup + CSS), and
 *   - the shared `.mobileFill` layout class (hands the board the full width).
 */
export function useInfoSheet(): InfoSheetApi {
  const isMobile = useIsMobile()
  const isOpen = useIsInfoSheetOpen()
  const close = useCallback(() => setInfoSheetOpen(false), [])

  // Close when the viewport crosses from mobile up to desktop. Without this the
  // flag is sticky: switch to the info page on mobile, widen to desktop (where
  // the CSS ignores it and shows the info column inline), then narrow back — and
  // you're on the info page again, a stale surprise. Adjusted DURING RENDER
  // (React's sanctioned "reset state when a value changes" pattern, tracking the
  // previous `isMobile`), not in an effect: the repo lints against
  // setState-in-effect, and an effect would flash the stale page for one frame.
  const [wasMobile, setWasMobile] = useState(isMobile)
  if (wasMobile !== isMobile) {
    setWasMobile(isMobile)
    if (!isMobile && isOpen) setInfoSheetOpen(false)
  }

  return { isOpen, close }
}
