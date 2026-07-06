import puzpuzpuzLogo from '../../puzpuzpuz.svg?url'
import styles from './PuzpuzpuzLogo.module.css'

/**
 * The generic PuzPuzPuz logo, used as the leftmost element of the
 * ClubPage header. Parallels `<GameLogo>` on the game page — but
 * gametype-agnostic, since the club page lives above any specific
 * game.
 *
 * Pure presentational. The click semantics (open the club menu)
 * live on the `<Menu>` wrapper at the call site — see ClubPage.
 *
 * Source SVG is at `src/common/puzpuzpuz.svg`, imported as `?url`
 * so Vite hashes the asset and the URL works in build output.
 *
 * The colorful "P!" mark sits inside a themed rounded-rect frame (the
 * `.frame` span) — carrying over the rounded-square look of the earlier
 * line-art logo, now as a real border around the image.
 */
export function PuzpuzpuzLogo() {
  return (
    <span className={styles.frame}>
      <img src={puzpuzpuzLogo} alt="PuzPuzPuz" className={styles.mark} />
    </span>
  )
}
