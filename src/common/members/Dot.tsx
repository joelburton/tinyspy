// cs-blessed-members

import { borderVarFor, colorVarFor } from './memberColor'
import { cls } from '../utils/cls'
import styles from './Dot.module.css'

type Props = {
  // The member's profile-color NAME ('red' … 'pink'). Missing/unknown falls
  // back to a body-text-colored disc (same contract as `colorVarFor`) — the
  // neutral disc for a departed member. Ignored when `hollow`.
  color?: string | null
  // The "nobody" ring: an empty outline instead of a filled disc — an away
  // member on the club strip, an unfound word in a reveal list. Ring color
  // defaults to body text; override with `--dot-ring` on a className.
  hollow?: boolean
  // The disc sits on a SATURATED surface — a decided game tile — rather than
  // on the page, so its ring switches to the shade that separates it from one.
  // Pass it whenever the background behind the disc is a strong fill.
  onColor?: boolean
  // Merged onto the root — for per-site sizing (`--dot-size`,
  // `--dot-border-width`, `--dot-ring`) and margins.
  className?: string
}

/**
 * The **identity disc** — the app-wide "this color is this player" marker
 * (docs/ui.md → "Player identity = a colored disc"), as one shared element: a
 * CSS circle FILLED with the member color and RINGED with its paired EDGE
 * shade (`--member-NAME-edge-color`, defined beside each fill in
 * `core-css/fixed.css`). The ring is what lets light fills (yellow)
 * read against the page background — and why this must be a styled element,
 * never a unicode `●` (glyphs can't wear a border, and their size/baseline
 * drift by font).
 *
 * Presentational and self-resolving: callers pass the color NAME off a
 * `Member` and the component resolves both CSS vars — except on a colored
 * surface, where the ring takes the on-dark ink instead (`onColor`). Size
 * rides `--dot-size` (em-relative default, so an inline dot tracks its text).
 */
export function Dot({ color, hollow = false, onColor = false, className }: Props) {
  return (
    <span
      className={cls(styles.dot, hollow && styles.hollow, className)}
      style={
        hollow
          ? undefined
          : {
              background: colorVarFor(color),
              // The ring separates the disc from what is behind it, and which
              // color does that depends on the background, not on the player: a
              // darker shade separates a light disc from a white page, and white
              // separates any disc from a strong fill. Red forces the case — a
              // red member's dark-red ring on a red tile is three reds in a row
              // and the disc vanishes.
              //
              // `--ink-onDark-color` rather than a literal white, and rather
              // than the page background: it is named for the GROUND it sits
              // on, so a dark theme leaves it alone. The page background would
              // have flipped and taken the ring with it, dark-on-dark, exactly
              // where the contrast is needed.
              borderColor: onColor ? 'var(--ink-onDark-color)' : borderVarFor(color),
            }
      }
      aria-hidden="true"
    />
  )
}
