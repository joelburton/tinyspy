import puzpuzpuzLogo from '../puzpuzpuz.svg?url'
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
 */
export function PuzpuzpuzLogo() {
  return (
    <img
      src={puzpuzpuzLogo}
      alt="PuzPuzPuz"
      className={styles.logo}
      width={32}
      height={32}
    />
  )
}
