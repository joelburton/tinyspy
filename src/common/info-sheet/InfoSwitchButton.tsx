// cs-blessed-info-sheet

import { PageHeaderButton } from '../page-header/PageHeaderButton'
import { useBoundAction } from '../actions/useBoundAction'
import { actionSurface } from '../actions/actionSurface'
import { IconInfoSheetClose, IconInfoSheetOpen } from '../icons/icons'
import { setInfoSheetOpen } from './infoSheetStore'

type Props = {
  // Is the info page currently showing? Decides both the glyph and the action.
  open: boolean
}

/**
 * The mobile **page switch** — the one control that moves between the board page
 * and the info page, at the far RIGHT of the header on both of them.
 *
 * On a phone the two aren't a board plus a drawer but two full-screen pages (the
 * sheet is full-bleed below `--mobile`), so the affordance is page navigation:
 * one button whose glyph and label flip, in the same place on each page. Why
 * that rather than a control per page, and what the fixed position protects:
 * docs/mobile.md → The two mobile pages.
 *
 * A `<PageHeaderButton>`, like its neighbor the pause button: a mark in the
 * header rather than a control being offered. `GamePage` renders it only on
 * mobile — on desktop the info column is always on screen and there is nothing
 * to switch to. It binds `act-toggle-info-sheet`, so switching pages is a
 * command like any other and the day it earns a key that is a line in the
 * registry, not a listener.
 */
export function InfoSwitchButton({ open }: Props) {
  // The label names the DESTINATION, not the state — it's a navigation control,
  // and "Game info" / "Back to board" are what the tap gets you.
  const actToggleInfoSheet = useBoundAction('act-toggle-info-sheet', {
    describe: () => ({
      state: 'active',
      label: open ? 'Back to board' : 'Game info',
      icon: open ? IconInfoSheetClose : IconInfoSheetOpen,
    }),
    run: () => setInfoSheetOpen(!open),
  })
  const { label, icon, buttonProps } = actionSurface(actToggleInfoSheet)
  return (
    <PageHeaderButton
      icon={icon ?? IconInfoSheetOpen}
      label={label}
      aria-expanded={open}
      {...buttonProps}
    />
  )
}
