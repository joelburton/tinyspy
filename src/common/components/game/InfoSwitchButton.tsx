import { IconInfoPanelClose, IconInfoPanelOpen } from '../icons'
import { setInfoSheetOpen } from '../../lib/game/infoSheetStore'
import styles from './InfoSwitchButton.module.css'

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
 * arrangement was (a "Game info" menu item to leave, a ✕ in the sheet's corner
 * to come back), and why moving between them felt fussy: two different targets,
 * neither where you last used the other.
 *
 * It is **pinned to the header's right edge on both pages**. That's the whole
 * point and the one thing not to break: the two headers hold different things
 * (the board page carries chat + feedback; the info page carries the timer +
 * pause), so if this rode along inside either group it would shift between
 * pages and lose the muscle memory that justified consolidating it.
 *
 * Rendered only below the mobile breakpoint — on desktop the info column is
 * always on screen and there is nothing to switch to.
 */
export function InfoSwitchButton({ open }: Props) {
  return (
    <button
      type="button"
      className={styles.button}
      // The label names the DESTINATION, not the state — it's a navigation
      // control, and "Game info" / "Back to board" are what the tap gets you.
      aria-label={open ? 'Back to board' : 'Game info'}
      title={open ? 'Back to board' : 'Game info'}
      aria-expanded={open}
      onClick={() => setInfoSheetOpen(!open)}
    >
      {/* The panel pair rather than a bare chevron: a lone `‹` collided with the
          info column's own icon-only "Back to club" button a few rows below it,
          and said nothing about WHAT it moved. These draw the right-hand panel
          opening and closing, which is literally the gesture. */}
      {open ? <IconInfoPanelClose size={18} /> : <IconInfoPanelOpen size={18} />}
    </button>
  )
}
