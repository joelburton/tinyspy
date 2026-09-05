// cs-unmet

import { PageHeaderButton } from '../page-header/PageHeaderButton'
import { IconInfoPanelClose, IconInfoPanelOpen } from '../icons/icons'
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
 * header rather than an action being offered. GamePage renders it only on
 * mobile — on desktop the info column is always on screen and there is nothing
 * to switch to.
 */
export function InfoSwitchButton({ open }: Props) {
  return (
    <PageHeaderButton
      icon={open ? IconInfoPanelClose : IconInfoPanelOpen}
      // The label names the DESTINATION, not the state — it's a navigation
      // control, and "Game info" / "Back to board" are what the tap gets you.
      label={open ? 'Back to board' : 'Game info'}
      aria-expanded={open}
      onClick={() => setInfoSheetOpen(!open)}
    />
  )
}
