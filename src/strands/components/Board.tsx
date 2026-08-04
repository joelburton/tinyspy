import { COLS, ROWS, coordKey, letterAt, type Board as BoardLetters, type Coord } from '../lib/board'
import { cls } from '../../common/lib/util/cls'
import styles from './Board.module.css'

/** A found word, as the board needs it: where it runs, and which colour. */
export type FoundPath = { path: Coord[]; isSpangram: boolean }

type Props = {
  board: BoardLetters
  /** Found theme words + the spangram. These PERSIST — discs and lines both. */
  found: FoundPath[]
  /** The trace being built right now, in click order. */
  trace: readonly Coord[]
  /** A spent hint's cells: ringed, and deliberately NOT connected — the player
   *  still has to work out the order. Null when no hint is showing. */
  hintCoords: Coord[] | null
  /** Tile click. The reducer decides what it means; the board just reports it. */
  onTileClick: (at: Coord) => void
  /** Frozen at terminal (and while a peer's turn is pending in a turn game). */
  disabled?: boolean
}

/**
 * strands' 8×6 board.
 *
 * **Bare letters, no tiles.** A deliberate departure from the tile-and-warm-ramp
 * vocabulary the other grid games share (ui.md → Interactive tile states):
 * waffle, wordle and boggle all draw boxes, and strands draws none. A disc only
 * exists once a cell is selected or found, so the resting board is a field of
 * letters. "Tile" remains the word for a cell (naming.md — "any selectable thing
 * on a board"); it just declines the border.
 *
 * **The paths are one SVG under the letters.** Diagonals rule out any
 * border/box-shadow trick, and found words persist — by endgame the board
 * carries every theme word's polyline plus the live trace — so this is a real
 * drawing layer, not a decoration. Discs are drawn in the same SVG as the lines
 * rather than as DOM elements, which is what guarantees a line always passes
 * UNDER its discs and both stay centred on the cell at any board size.
 *
 * The SVG works in **cell units** (`viewBox="0 0 6 8"`), so a cell centre is
 * exactly `(col + 0.5, row + 0.5)` and every radius/width below is a fraction of
 * a cell. No pixel maths, no resize observer: the board scales with its box and
 * the geometry follows for free.
 */
export function Board({ board, found, trace, hintCoords, onTileClick, disabled }: Props) {
  const traceKeys = new Set(trace.map(coordKey))
  const lastKey = trace.length ? coordKey(trace[trace.length - 1]) : null
  const hintKeys = new Set((hintCoords ?? []).map(coordKey))

  const foundKind = new Map<string, 'theme' | 'spangram'>()
  for (const f of found) {
    for (const c of f.path) foundKind.set(coordKey(c), f.isSpangram ? 'spangram' : 'theme')
  }

  /** Cell centre in viewBox units. */
  const cx = (c: number) => c + 0.5
  const cy = (r: number) => r + 0.5
  const points = (path: readonly Coord[]) =>
    path.map(([r, c]) => `${cx(c)},${cy(r)}`).join(' ')

  return (
    <div className={styles.board} data-board>
      {/* The drawing layer: lines first, then discs, so a disc always covers the
          line ends. aria-hidden — it carries no information the letters don't. */}
      <svg
        className={styles.paths}
        viewBox={`0 0 ${COLS} ${ROWS}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {found.map((f) => (
          <polyline
            key={coordKey(f.path[0])}
            className={cls(styles.line, f.isSpangram ? styles.lineSpangram : styles.lineTheme)}
            points={points(f.path)}
          />
        ))}
        {trace.length > 1 && (
          <polyline className={cls(styles.line, styles.lineTrace)} points={points(trace)} />
        )}

        {found.map((f) =>
          f.path.map((c) => (
            <circle
              key={`f${coordKey(c)}`}
              className={f.isSpangram ? styles.discSpangram : styles.discTheme}
              cx={cx(c[1])}
              cy={cy(c[0])}
              r={0.38}
            />
          )),
        )}
        {trace.map((c) => (
          <circle
            key={`t${coordKey(c)}`}
            className={styles.discTrace}
            cx={cx(c[1])}
            cy={cy(c[0])}
            r={0.38}
          />
        ))}

        {/* The most recent tile wears a second ring: re-clicking it is how a word
            is submitted, and without a marker that affordance is invisible. */}
        {trace.length > 0 && (
          <circle
            className={styles.discLastRing}
            cx={cx(trace[trace.length - 1][1])}
            cy={cy(trace[trace.length - 1][0])}
            r={0.47}
          />
        )}

        {/* A hint rings its cells and draws NO line — the reveal says where the
            word is, never what order it runs in. */}
        {(hintCoords ?? []).map((c) => (
          <circle
            key={`h${coordKey(c)}`}
            className={styles.discHint}
            cx={cx(c[1])}
            cy={cy(c[0])}
            r={0.42}
          />
        ))}
      </svg>

      {/* The letters, on top and click-bearing. */}
      <div className={styles.grid}>
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => {
            const key = coordKey([r, c])
            const kind = foundKind.get(key)
            return (
              <button
                key={key}
                type="button"
                className={cls(
                  styles.tile,
                  kind === 'spangram' && styles.tileSpangram,
                  kind === 'theme' && styles.tileTheme,
                  traceKeys.has(key) && styles.tileTrace,
                  key === lastKey && styles.tileLast,
                  hintKeys.has(key) && styles.tileHinted,
                )}
                onClick={() => onTileClick([r, c])}
                disabled={disabled}
                // NOT a tab stop. 48 tiles would bury every real control
                // behind 48 presses — the same reasoning the shared WordList
                // records for its clickable words. The board is driven by
                // pointer plus the Backspace/Enter keys PlayArea captures.
                tabIndex={-1}
                data-cell={key}
                aria-label={letterAt(board, [r, c])}
              >
                {letterAt(board, [r, c])}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
