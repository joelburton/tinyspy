// cs-unmet

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import { useClaimMarks } from '../hooks/useClaimMarks'
import { letterForSlot } from '../lib/letters'
import { Tile } from './Tile'
import { TileDefs } from './TileDefs'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Board.module.css'
import type { GTile } from '../types'

/** What the board wears on and around its tiles, from the board column. */
type BoardMarks = {
  // The tiles of the claim I am building.
  pickedTileIds: ReadonlySet<string>
  // A live coop hint's ring, or a viewed past turn's own tiles.
  ringTileIds: ReadonlySet<string>
  // A claim's tiles on their way to the server.
  inFlightTileIds: ReadonlySet<string>
  // A teammate holds the move: the board fades. Its own mark, not `canPick`:
  // the board also takes no pick at every ending and while a past turn is
  // open, and neither fades (both are states people sit and study).
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine (useTurnStartFlash).
  myTurnJustStarted: boolean
}

/**
 * The table: three rows of tiles, growing rightwards.
 *
 * **Three rows, always.** Columns are what change — four at twelve tiles, up to
 * seven at the twenty-one-tile ceiling — because the deal adds three tiles,
 * which is exactly one column. A board that grew downwards would reflow the
 * whole page instead.
 *
 * **Left-aligned, not centered**, which is the one layout decision here worth
 * arguing. A centered board shifts every tile leftwards when a column arrives —
 * a full-table reflow at the exact moment everyone is mid-scan. Left-aligned, a
 * deal only ever adds tiles on the right, and nothing already on the table
 * moves.
 *
 * **A claim marks the table** (`useClaimMarks`): the found set held in a won
 * ring, then the tiles it dealt in the attention flash. While the found set is
 * held, the table drawn is the one from before the claim; a tile on it that the
 * live table no longer has takes no click.
 *
 * Board decides which marks each `<Tile>` wears; the tile draws them.
 */
export function Board({
  tiles,
  marks,
  canPick,
  isViewingHistory,
  endingOutcome,
  lastClaim,
  onPick,
}: {
  // The table to draw, in slot order: the live one, or a past turn's — the
  // board column picks.
  tiles: GTile[]
  marks: BoardMarks
  // The board takes a pick right now.
  canPick: boolean
  // A past turn is open: no claim is marked on it.
  isViewingHistory: boolean
  // How I came out, for the ended board's frame; null while I still play.
  endingOutcome: EndOutcome | null
  // The newest claim in the log — what a change to the table is measured by.
  lastClaim: { id: number; tiles: GTile[] } | null
  onPick: (tile: GTile) => void
}) {
  const claimMarks = useClaimMarks({
    liveTiles: tiles,
    lastClaim,
    quiet: isViewingHistory,
  })
  const shownTiles = claimMarks.tiles
  const liveTileIds = new Set(tiles.map((t) => t.id))

  const cols = Math.ceil(shownTiles.length / 3)

  // The column count drives the grid AND the tile size (Board.module.css), so
  // it goes down as a custom property rather than as a class per width.
  //
  // Sizing uses a HIGH-WATER mark rather than the live count: tiles may shrink
  // when a deal adds a column, and then never grow back. Growing back would
  // mean the endgame — where the board comes down as the deck empties — resized
  // every tile a second time, which is the same disruption twice for no gain.
  // On a normal window the per-tile cap binds anyway, so most games never
  // resize at all; this only bites on a narrow window or at the very rare
  // twenty-one-tile board.
  const [widest, setWidest] = useState(cols)
  if (cols > widest) setWidest(cols)

  return (
    <div
      className={cls(shared.boardSeal,
        styles.board,
        marks.isWaitingForTurn && !canPick && styles.waiting,
        marks.myTurnJustStarted && shared.yourTurnFlash,
        makeEndingFrameClasses(endingOutcome, isViewingHistory))}
      style={{ '--cols': widest } as React.CSSProperties}
    >
      <TileDefs/>
      {shownTiles.map((tile, slot) => (
        <div key={slot} className={styles.cell}>
          <Tile
            tile={tile}
            marks={{
              isPicked: marks.pickedTileIds.has(tile.id),
              isRinged: marks.ringTileIds.has(tile.id),
              isInFlight: marks.inFlightTileIds.has(tile.id),
              isFound: claimMarks.foundTileIds.has(tile.id),
              isNew: claimMarks.newTileIds.has(tile.id),
            }}
            // A claim's tiles on their way, and a held tile the live table no
            // longer has, are spent: a click could only build a claim the
            // server has already decided.
            isDisabled={!canPick || marks.inFlightTileIds.has(tile.id) ||
              !liveTileIds.has(tile.id)}
            onClick={() => onPick(tile)}
          />
          {/* The letter is the tile's keyboard address, and it is bound to the
              SLOT rather than to the tile — so `B` stays in the same place all
              game even as the tile sitting there changes. That stability is
              what makes typing usable at all; a letter that wandered would be
              worse than no letters. */}
          <span className={styles.letter}>{letterForSlot(slot)}</span>
        </div>
      ))}
    </div>
  )
}
