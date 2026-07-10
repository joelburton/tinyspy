import { useCallback, useMemo, useState } from 'react'
import { useIsMobile } from '../ui/useIsMobile'
import type { MenuSection } from '../../lib/games'

export type InfoSheetApi = {
  /** Whether the sheet is currently slid in (mobile). */
  isOpen: boolean
  open: () => void
  close: () => void
  /** The mobile-only "Game info" menu section that opens the sheet, ready to
   *  spread into `buildGameMenu`'s `extra`. Empty on desktop (the info column is
   *  always visible there, so there's nothing to open). Stable identity — it
   *  only changes when the breakpoint is crossed — so it's safe in an effect's
   *  dependency array (the game-menu effect calls a setState). */
  menuSections: MenuSection[]
}

/**
 * State + menu wiring for the mobile **info-column sheet** (docs/mobile.md → the
 * psychicnum recipe). Below the breakpoint a game's board fills the screen and
 * its info column moves off-canvas into a sheet reached from a "Game info" menu
 * item; this hook owns the `useIsMobile` gate, the open/close state, and that
 * menu section. It's the JS half of the recipe — pair it with:
 *   - `<InfoSheet open={sheet.isOpen} onClose={sheet.close}>` around the InfoCol
 *     (the off-canvas markup + CSS), and
 *   - the shared `.mobileFill` layout class (hands the board the full width once
 *     the info column is off-canvas).
 */
export function useInfoSheet(): InfoSheetApi {
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const menuSections = useMemo<MenuSection[]>(
    () =>
      isMobile
        ? [{ items: [{ id: 'game-info', label: 'Game info', onClick: open }] }]
        : [],
    [isMobile, open],
  )
  return { isOpen, open, close, menuSections }
}
