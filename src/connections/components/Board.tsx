import { cls } from '../../common/lib/cls'
import type { Category } from '../lib/board'
import type { MatchedCategory } from '../hooks/useGame'
import { RANK_TOKEN } from '../lib/rankColors'
import shared from '../../common/components/playArea.module.css'
import styles from './PlayArea.module.css'

const COLS = 4

type Props = {
  /** Categories resolved by a correct guess — full-width colored bands at the
   *  top, sorted by rank. */
  matched: MatchedCategory[]
  /** Categories revealed at game-end (loss / elimination); `[]` during play. */
  unmatched: Category[]
  /** Remaining tiles, in display order; `[]` when input is frozen (terminal /
   *  eliminated), so only bands show. */
  tiles: string[]
  /** tile → user_id (the inverted selections map). Drives the per-tile
   *  mine/peer treatment. */
  ownerByTile: ReadonlyMap<string, string>
  selfUserId: string
  onToggle: (tile: string) => void
  /** Tiles playing the wrong-guess shake (set transiently by PlayArea). */
  shakingTiles?: ReadonlySet<string>
  /** user_id → resolved color var, for a peer's selection frame. */
  colorByUserId: ReadonlyMap<string, string>
}

/**
 * connections's board: a SINGLE grid holding both the solved-category bands and
 * the remaining tiles. A solved category becomes a full-width band row
 * (`grid-column: 1 / -1`) in place of the tile row it replaced — a band is just
 * "one long tile" spanning the row instead of four, so it's the same height,
 * padding, and depth as a tile and shares the one grid gap. Because every
 * category is four tiles, `bands + ceil(remaining / 4)` is always the same row
 * count, so it's one grid that grows to fill its `.board` wrapper (which fills
 * the column) — the same layout psychicnum's WordBoard uses (psychicnum caps
 * tile height; connections doesn't yet). The `.board` wrapper is a shared shape
 * across games (no border/background today; the slot for a future framed board).
 *
 * Tiles carry the shared `.tile` chrome; a player's own pick is the shared
 * `.selected` dark fill, a peer's is an inline color frame, a rejected guess
 * gets the local `.tileShaking`. Bands + the reveal styling stay connections's.
 */
export function Board({
  matched,
  unmatched,
  tiles,
  ownerByTile,
  selfUserId,
  onToggle,
  shakingTiles,
  colorByUserId,
}: Props) {
  const sortedMatched = [...matched].sort((a, b) => a.rank - b.rank)
  // Total rows = one per band + the tile rows. Always 4 for a standard
  // 16-tile / 4×4 board, but computed so the cap math stays correct if a
  // category ever isn't exactly four tiles.
  const rows = sortedMatched.length + unmatched.length + Math.ceil(tiles.length / COLS)

  const band = (c: Category | MatchedCategory, revealed: boolean) => (
    <div
      key={`${revealed ? 'u' : 'm'}-${c.rank}`}
      className={cls(styles.band, revealed && styles.bandRevealed)}
      // --len drives the same auto-fit the tiles use (here for the band name).
      style={{ background: RANK_TOKEN[c.rank], ['--len' as string]: c.name.length }}
    >
      <strong>{c.name}</strong>
      <div className={styles.bandMembers}>{c.tiles.join(' · ')}</div>
    </div>
  )

  return (
    // The .board wrapper carries NO border/background today — the inter-tile
    // gaps show the column behind, matching psychicnum. The wrapper + class
    // exist in both games so a future game frames its board (border / fill /
    // padding) in one place. See WordBoard's .board for the twin.
    <div className={styles.board}>
      <div
        className={styles.grid}
        // `rows` 1fr tracks, so the grid grows to fill the .board (no per-row
        // cap yet — unlike psychicnum's WordBoard, which caps tile height; one
        // may be added here later). A band is one of these rows spanning all 4
        // columns.
        style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {sortedMatched.map((mc) => band(mc, false))}
        {unmatched.map((c) => band(c, true))}
        {tiles.map((tile) => {
          const ownerId = ownerByTile.get(tile)
          const isMine = ownerId === selfUserId
          const isPeer = ownerId !== undefined && !isMine
          const isShaking = shakingTiles?.has(tile) ?? false
          return (
            <button
              key={tile}
              type="button"
              className={cls(
                shared.tile,
                isMine && shared.selected,
                isShaking && styles.tileShaking,
              )}
              style={
                isPeer && ownerId
                  ? {
                      boxShadow: `inset 0 0 0 4px ${
                        colorByUserId.get(ownerId) ?? 'transparent'
                      }`,
                    }
                  : undefined
              }
              onClick={() => onToggle(tile)}
            >
              {/* --len drives the shared .tileWord auto-fit. */}
              <span className={shared.tileWord} style={{ ['--len' as string]: tile.length }}>
                {tile}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
