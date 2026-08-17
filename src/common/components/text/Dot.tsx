import { borderVarFor, colorVarFor } from '../../lib/color/memberColor'
import { cls } from '../../lib/util/cls'
import styles from './Dot.module.css'

type Props = {
  /** The member's profile-color NAME ('red' … 'pink'). Missing/unknown falls
   *  back to a body-text-colored disc (same contract as `colorVarFor`) — the
   *  neutral disc for a departed member. Ignored when `hollow`. */
  color?: string | null
  /** The "nobody" ring: an empty outline instead of a filled disc — an away
   *  member on the club strip, an unfound word in a reveal list. Ring color
   *  defaults to body text; override with `--dot-ring` on a className. */
  hollow?: boolean
  /** The disc sits on a SATURATED surface — a decided game tile — rather than on
   *  the page. Its ring goes white instead of the member's darker shade.
   *
   *  The ring's job is separating the disc from what is behind it, and which color
   *  does that depends on the background, not on the player: a darker shade
   *  separates a light disc from a white page, and white separates any disc from a
   *  strong fill. Red is the case that forces it — a red member's dark-red ring on
   *  a red tile is three reds in a row, and the disc disappears. */
  onColor?: boolean
  /** Merged onto the root — for per-site sizing (`--dot-size`,
   *  `--dot-border-width`, `--dot-ring`) and margins. */
  className?: string
}

/**
 * The **identity disc** — the app-wide "this color is this player" marker
 * (docs/ui.md → "Player identity = a colored disc"), as one shared element: a
 * CSS circle FILLED with the member color and RINGED with its paired
 * `-border` shade (see theme.css). The ring is what lets light fills (yellow)
 * read against the page background — and why this must be a styled element,
 * never a unicode `●` (glyphs can't wear a border, and their size/baseline
 * drift by font).
 *
 * Presentational and self-resolving: callers pass the color NAME off a
 * `Member` and the component resolves both CSS vars — except on a coloured
 * surface, where the ring turns white (`onColor`). Size rides `--dot-size`
 * (em-relative default, so an inline dot tracks its text).
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
              borderColor: onColor ? '#fff' : borderVarFor(color),
            }
      }
      aria-hidden="true"
    />
  )
}
