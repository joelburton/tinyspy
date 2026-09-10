// cs-unmet

import { PageHeaderButton } from '../page-header/PageHeaderButton'
import { useBoundAction } from '../actions/useBoundAction'
import { actionSurface } from '../actions/actionSurface'
import { IconInfoSheetClose, IconInfoSheetOpen } from '../icons/icons'
import { setInfoSheetOpen } from './infoSheetStore'

type Props = {
  /** Is the info page currently showing? Decides both the glyph and the action. */
  open: boolean
}

/**
 * The mobile **page switch** — the single control that moves between the board
 * and the info column.
 *
 * On a phone the two aren't a board plus a drawer, they're two full-screen
 * pages: `<InfoSheet>` is `min(24rem, 100%)` wide, which is 384px against an
 * iPhone's 390. So the affordance is page navigation, and it's ONE button whose
 * glyph flips rather than two controls in two places — which is what the old
 * "Game info" menu item and the sheet's own ✕ used to be.
 *
 * It lives at the far RIGHT of the header on both pages. That's the fixed
 * point and the one thing not to break: the two headers hold different things
 * (the board page carries chat + feedback; the info page carries the timer +
 * pause), so if this rode along inside either group it would shift between
 * pages and lose the muscle memory that justified consolidating it.
 *
 * A `<PageHeaderButton>`, like its neighbor the pause button: a mark in the
 * header rather than a control being offered. GamePage renders it only on
 * mobile — on desktop the info column is always on screen and there is nothing
 * to switch to.
 *
 * **It binds `act-toggle-info-sheet`** and keeps its own look. Switching pages
 * is a command like any other, so it belongs in the one table of them — and the
 * day it earns a key, that is a line in the registry rather than a listener.
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
