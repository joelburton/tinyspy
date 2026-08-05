import { useCallback, useState } from 'react'
import { useIsMobile } from '../ui/useIsMobile'
import { setInfoSheetOpen, useInfoSheetOpen } from '../../lib/game/infoSheetStore'

export type InfoSheetApi = {
  /** Whether the info page is showing instead of the board (mobile). */
  isOpen: boolean
  /** Return to the board. */
  close: () => void
}

/**
 * A game's handle on the mobile **info page** (docs/mobile.md → the psychicnum
 * recipe). Below the breakpoint a game's board fills the screen and its info
 * column becomes a second page you switch to.
 *
 * **The switching affordance is not here.** It used to be: this hook returned a
 * mobile-only "Game info" menu item, which was a placeholder — burying a
 * half-of-the-app navigation two taps deep inside a menu. The shell now renders
 * a **switch button pinned to the header's right edge**, present in the same
 * place on both pages, and the state it drives lives in `infoSheetStore` so the
 * header (in `<GamePage>`) and the sheet (in each game's PlayArea) can both
 * reach it. What's left for a game is what it always needed: the open flag to
 * hand `<InfoSheet>`, and a way to close.
 *
 * Pair it with:
 *   - `<InfoSheet open={sheet.isOpen} onClose={sheet.close}>` around the InfoCol
 *     (the off-canvas markup + CSS), and
 *   - the shared `.mobileFill` layout class (hands the board the full width).
 */
export function useInfoSheet(): InfoSheetApi {
  const isMobile = useIsMobile()
  const isOpen = useInfoSheetOpen()
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
