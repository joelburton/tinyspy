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
 * The game's square SVG logo, used as the leftmost element of
 * the GamePage header. Identity element + (when wrapped by the
 * parent) the back-to-club click affordance.
 *
 * Loads from each game's manifest `logoUrl`, which the per-game
 * `manifest.ts` imports via `import logoUrl from './logo.svg?url'`
 * so Vite hashes the asset and the URL works in build output.
 *
 * **Pure presentational.** The click semantics (suspend-confirm
 * for non-terminal games, direct nav for terminal) live on the
 * `<GamePage>` parent because the branch depends on game state
 * the logo itself doesn't see. The parent wraps this component
 * in a `<Link>` (terminal) or `<a>` (non-terminal with intercept).
 *
 * Future: this is where the "switch to another game in this club"
 * dropdown will land — Joel's design has the logo expand into a
 * menu of other gametypes + an explicit return-to-club row. Not
 * built yet; the click is single-purpose for now.
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
