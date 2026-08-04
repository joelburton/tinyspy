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
 * The mark is a self-contained tile — a white "P" on its own rounded
 * indigo square — so it needs no chrome around it, and this renders
 * as a bare 32×32 image exactly like `<GameLogo>`. That keeps the two
 * trigger shapes interchangeable inside the `<Menu>` wrapping button.
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
