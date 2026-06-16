import { cls } from '../../common/lib/cls'
import { colorForUserId } from '../lib/peerColor'
import styles from './PlayArea.module.css'

type Props = {
  /** The tiles to render — what `useGame` calls
   *  `remainingTiles` (board.tileOrder minus matched-category
   *  tiles). PlayArea derives the list; TileGrid just renders it. */
  tiles: string[]
  /** tile → user_id, the inverted form of `selections`. Used to
   *  pick the per-tile visual treatment (mine vs peer's vs
   *  unowned). PlayArea derives the map; TileGrid just reads it. */
  ownerByTile: ReadonlyMap<string, string>
  /** Current user's user_id. A tile owned by this id renders as
   *  the "selected by me" treatment; other owned tiles render as
   *  "selected by a peer." */
  selfUserId: string
  /** Click handler. Receives the tile string. Wired to the
   *  shared selection broadcaster from useGame. */
  onToggle: (tile: string) => void
}

/**
 * The 4×4 grid of remaining tiles with shared-selection
 * attribution. Three visual treatments per tile:
 *
 *   - **Mine**: strong dark-fill (the NYT "selected" look). No
 *     border — the fill alone reads as "this is yours."
 *   - **Peer's**: regular tile background + a thick inset frame
 *     in the peer's color (from `colorForUserId`).
 *   - **Unowned**: plain tile.
 *
 * Pure render. No state, no async work. The shared-selection
 * machinery (the Broadcast channel, the union-of-selections map)
 * lives in wordknit's `useGame` hook; this component just
 * renders a frame of it.
 *
 * Why this is its own component: it's the busiest piece of
 * PlayArea render and the only place that knows about per-tile
 * peer attribution (`isMine` / `isPeer` / `colorForUserId`).
 * PlayArea reads as "compose the page" once this lives here.
 */
export function TileGrid({
  tiles,
  ownerByTile,
  selfUserId,
  onToggle,
}: Props) {
  return (
    <div className={styles.grid}>
      {tiles.map((tile) => {
        const ownerId = ownerByTile.get(tile)
        const isMine = ownerId === selfUserId
        const isPeer = ownerId !== undefined && !isMine
        return (
          <button
            key={tile}
            type="button"
            className={cls(styles.tile, isMine && styles.tileSelected)}
            style={
              isPeer && ownerId
                ? {
                    boxShadow: `inset 0 0 0 4px ${colorForUserId(ownerId)}`,
                  }
                : undefined
            }
            onClick={() => onToggle(tile)}
          >
            {tile}
          </button>
        )
      })}
    </div>
  )
}
