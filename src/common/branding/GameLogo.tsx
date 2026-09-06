// cs-audited-branding

import type { GameManifest } from '../manifest/gameManifest'
import styles from './GameLogo.module.css'

type Props = {
  /** The game whose logo to draw. Every caller already holds the manifest —
   *  taking the gametype string instead would mean looking it up a second
   *  time, and carrying a not-found branch none of them can reach. */
  manifest: GameManifest
}

/**
 * A game's square logo, 32×32. It says WHICH game you are looking at, and it
 * appears in the two places a game is named: first in the header of a game's
 * page, and first in each of the club's game rows.
 *
 * The image is the manifest's `logoUrl` — each per-game `manifest.ts` imports
 * `./logo.svg?url` so Vite hashes the asset and the URL survives the build.
 *
 * **Nothing here is clickable, and the two wrappers want different clicks.**
 * In a game header `<PageHeaderMenu>` makes this the menu's trigger (leaving
 * the game is a "Back to club" row inside that menu, not a click on the mark);
 * in a club list the row's own `<Link>` opens the game. So it stays a bare
 * `<img>` — the same bare 32×32 `<PuzpuzpuzLogo>` renders, which is what lets
 * the two menu triggers look interchangeable.
 */
export function GameLogo({ manifest }: Props) {
  return (
    <img
      src={manifest.logoUrl}
      alt={manifest.name}
      className={styles.logo}
      width={32}
      height={32}
    />
  )
}
