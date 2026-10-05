// cs-unmet

import { COLS, ROWS } from '../lib/board'
import { cls } from '@/common/utils/cls'
import type { Cell } from '@/common/board-cursor/stepCell'
import type { GBoard, GTile, GWord } from '../types'
import { Tile } from './Tile'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './Board.module.css'

/** What the board marks that its words don't say, by tile id. */
type BoardMarks = {
  // The tiles a viewed past turn traced, ringed — so a rejected word's route
  // is visible even though it changed nothing. Empty while live.
  litTileIds: ReadonlySet<string>
  // The tiles a typed letter matched when it matched MORE THAN ONE — ringed
  // red for a beat, meaning "several of these; click the one you meant".
  ambiguousTileIds: ReadonlySet<string>
}

/** A tile's center in the drawing layer's cell units. */
const cx = (t: GTile) => t.col + 0.5
const cy = (t: GTile) => t.row + 0.5

/** A path as an SVG `points` list, through each tile's center. */
function makePoints(tiles: readonly GTile[]): string {
  return tiles.map((t) => `${cx(t)},${cy(t)}`).join(' ')
}

/**
 * strands' 8×6 board.
 *
 * **Bare letters, no tiles.** A deliberate departure from the tile-and-warm-ramp
 * vocabulary the other grid games share (ui.md → Interactive tile states):
 * waffle, wordle and boggle all draw boxes, and strands draws none. A disc only
 * exists once a tile is traced or found, so the resting board is a field of
 * letters. "Tile" remains the word for a cell (naming.md — "any selectable thing
 * on a board"); it just declines the border.
 *
 * **The paths are one SVG under the letters.** Diagonals rule out any
 * border/box-shadow trick, and found words persist — by endgame the board
 * carries every puzzle word's polyline plus the live trace — so this is a real
 * drawing layer, not a decoration. Discs are drawn in the same SVG as the lines
 * rather than as DOM elements, which is what guarantees a line always passes
 * UNDER its discs and both stay centered on the tile at any board size.
 *
 * The SVG works in **cell units** (`viewBox="0 0 6 8"`), so a tile's center is
 * exactly `(col + 0.5, row + 0.5)` and every radius/width below is a fraction of
 * a cell. No pixel maths, no resize observer: the board scales with its box and
 * the geometry follows for free.
 *
 * Board decides which marks each letter wears; the letter itself is a `<Tile>`.
 */
export function Board({
  tiles,
  board,
  missedWords,
  traceTiles,
  marks,
  cursor,
  isDisabled,
  isViewingHistory,
  onPick,
}: {
  // All 48, row by row.
  tiles: GTile[]
  // The board to show: its found words — which PERSIST, discs and lines both —
  // and its ringed hint, drawn as rings and deliberately NOT connected: the
  // player still has to work out the order.
  board: GBoard
  // Words NOBODY found, drawn only while the solution is shown: gray, so the
  // ended board shows what was missed without competing with what was found.
  missedWords: GWord[]
  // The trace being built right now, in pick order.
  traceTiles: GTile[]
  marks: BoardMarks
  // The keyboard's selection cursor — the cell to ring in the cursor blue — or
  // null when it is not drawn (see `useBoardSelectionCursor`).
  cursor: Cell | null
  // The letters take no clicks.
  isDisabled: boolean
  // Replaying a past turn: the board wears the shared history frame.
  isViewingHistory: boolean
  onPick: (tile: GTile) => void
}) {
  const lastTile = traceTiles[traceTiles.length - 1]
  const tracedIds = new Set(traceTiles.map((t) => t.id))
  const hintIds = new Set((board.hintTiles ?? []).map((t) => t.id))
  const missedIds = new Set(missedWords.flatMap((w) => w.tiles.map((t) => t.id)))
  const foundKinds = new Map<string, 'theme' | 'spangram'>()
  for (const w of board.words) {
    for (const t of w.tiles) foundKinds.set(t.id, w.spangram ? 'spangram' : 'theme')
  }

  return (
    <div className={cls(shared.boardSeal, styles.board, isViewingHistory && history.historyFrame)} data-board>
      {/* The drawing layer: lines first, then discs, so a disc always covers the
          line ends. aria-hidden — it carries no information the letters don't. */}
      <svg
        className={styles.paths}
        viewBox={`0 0 ${COLS} ${ROWS}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Missed words first, so a found path always draws over them. */}
        {missedWords.map((w) => (
          <polyline
            key={`m${w.tiles[0]!.id}`}
            className={cls(styles.line, styles.lineMissed)}
            points={makePoints(w.tiles)}
          />
        ))}
        {board.words.map((w) => (
          <polyline
            key={w.tiles[0]!.id}
            className={cls(styles.line, w.spangram ? styles.lineSpangram : styles.lineTheme)}
            points={makePoints(w.tiles)}
          />
        ))}
        {traceTiles.length > 1 && (
          <polyline className={cls(styles.line, styles.lineTrace)} points={makePoints(traceTiles)} />
        )}

        {missedWords.flatMap((w) => w.tiles).map((t) => (
          <circle key={`md${t.id}`} className={styles.discMissed} cx={cx(t)} cy={cy(t)} r={0.38} />
        ))}
        {board.words.map((w) =>
          w.tiles.map((t) => (
            <circle
              key={`f${t.id}`}
              className={w.spangram ? styles.discSpangram : styles.discTheme}
              cx={cx(t)}
              cy={cy(t)}
              r={0.38}
            />
          )),
        )}
        {traceTiles.map((t) => (
          <circle key={`t${t.id}`} className={styles.discTrace} cx={cx(t)} cy={cy(t)} r={0.38} />
        ))}

        {/* The most recent tile wears a second ring: it marks where the trace
            currently ENDS, which is what tells you which neighbors are live and
            what Backspace will take. "You are here" is all it says: re-clicking
            it takes the letter back, like any other traced tile. */}
        {lastTile && (
          <circle className={styles.ringLast} cx={cx(lastTile)} cy={cy(lastTile)} r={0.47} />
        )}

        {/* The viewed turn's route. Same ring vocabulary as a hint — "these
            tiles, no claim about order" — in the history blue. */}
        {tiles.filter((t) => marks.litTileIds.has(t.id)).map((t) => (
          <circle key={`v${t.id}`} className={styles.ringHistory} cx={cx(t)} cy={cy(t)} r={0.44} />
        ))}

        {/* A hint rings its tiles and draws NO line — the reveal says where the
            word is, never what order it runs in. */}
        {(board.hintTiles ?? []).map((t) => (
          <circle key={`h${t.id}`} className={styles.ringHint} cx={cx(t)} cy={cy(t)} r={0.42} />
        ))}

        {/* A typed letter that matched SEVERAL tiles: ring them all, red, for a
            beat. A ring rather than a box because this board has no boxes, and
            rings are already its vocabulary for "this tile, no claim about
            order". Red because it's the one thing on this board that means
            "your input didn't land". Drawn LAST so it sits over a hint ring on
            the same tile. */}
        {tiles.filter((t) => marks.ambiguousTileIds.has(t.id)).map((t) => (
          <circle key={`a${t.id}`} className={styles.ringAmbiguous} cx={cx(t)} cy={cy(t)} r={0.44} />
        ))}

        {/* The keyboard's selection cursor: where the arrows are pointing. The
            app's cursor blue, drawn as a ring because this board's marks are
            rings, and at the cell's edge — outside every other ring — so it and
            the trace's end both show on the same letter. */}
        {cursor !== null && (
          <circle className={styles.ringCursor} cx={cursor.x + 0.5} cy={cursor.y + 0.5} r={0.52} />
        )}
      </svg>

      {/* The letters, on top and click-bearing. */}
      <div className={styles.grid}>
        {tiles.map((t) => (
          <Tile
            key={t.id}
            tile={t}
            marks={{
              found: foundKinds.get(t.id) ?? null,
              isTraced: tracedIds.has(t.id),
              isLast: t.id === lastTile?.id,
              isMissed: missedIds.has(t.id),
              isHinted: hintIds.has(t.id),
            }}
            isDisabled={isDisabled}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  )
}
