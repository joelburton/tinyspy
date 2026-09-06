// cs-audited-branding

import puzpuzpuzLogo from './puzpuzpuz.svg?url'
import styles from './PuzpuzpuzLogo.module.css'

/**
 * The app's own mark — a white "P" on an indigo tile, 32×32. It stands where a
 * game's logo stands on a game page: first in the header, as the trigger of
 * the page menu, on home ("Main menu") and on a club page ("Club menu").
 *
 * Not clickable itself. `<PageHeaderMenu>` at both call sites wraps it in the
 * menu's trigger button and supplies the chevron, and this renders the same
 * bare 32×32 image `<GameLogo>` does — which is what lets the two triggers
 * look interchangeable.
 *
 * The mark brings its own tile, so it needs no chrome here. But that tile is
 * NOT a rounded square: the artwork is a plain square of indigo whose corners
 * are painted over in the page background (#FAFAFC), so it reads as rounded
 * against a white page and shows four pale corners against anything else.
 * `scripts/generate-icons.sh` strips that one path to render the home-screen
 * icons full-bleed.
 *
 * Imported from `./puzpuzpuz.svg` as `?url` so Vite hashes the asset and the
 * URL works in build output.
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
