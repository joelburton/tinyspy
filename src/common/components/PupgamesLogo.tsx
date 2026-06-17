import pupgamesLogo from '../pupgames.svg?url'
import styles from './PupgamesLogo.module.css'

/**
 * The generic pupgames logo, used as the leftmost element of the
 * ClubPage header. Parallels `<GameLogo>` on the game page — but
 * gametype-agnostic, since the club page lives above any specific
 * game.
 *
 * Pure presentational. The click semantics (open the club menu)
 * live on the `<Menu>` wrapper at the call site — see ClubPage.
 *
 * Source SVG is at `src/common/pupgames.svg`, imported as `?url`
 * so Vite hashes the asset and the URL works in build output.
 */
export function PupgamesLogo() {
  return (
    <img
      src={pupgamesLogo}
      alt="pupgames"
      className={styles.logo}
      width={32}
      height={32}
    />
  )
}
