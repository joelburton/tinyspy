import { cls } from '../../common/lib/cls'
import shared from '../../common/components/PlayArea.module.css'
import history from '../../common/components/historyViewer.module.css'
import styles from './WordBoard.module.css'

type Props = {
  /** The board words (5..20), shown as clickable tiles. Lowercase; displayed
   *  uppercased via CSS. Three of them are the hidden secrets. */
  words: string[]
  /** Guessed words → was-it-a-secret. A guessed tile colors **permanently**
   *  green (true) / red (false) and can't be re-picked. In compete RLS scopes
   *  this to the viewer's own guesses; in coop it's the shared board. While
   *  viewing history this is the snapshot's results (guesses up to that turn). */
  results: ReadonlyMap<string, boolean>
  /** The currently-picked word (highlighted), or null. Kept in sync with the
   *  word entry by the parent. */
  selected: string | null
  /** Pick a word tile. Omitted when the board is non-interactive (terminal, the
   *  viewer is out of guesses, or viewing history) — tiles render inert then. */
  onPick?: (word: string) => void
  /** Turn-history: render read-only under the yellow viewer frame (a past turn's
   *  board). Off during live play. */
  viewing?: boolean
  /** Turn-history: the word the viewed turn's guess decided — ring its tile
   *  history-yellow (over its green/red outcome color). Null / omitted when live. */
  highlightWord?: string | null
}

/**
 * psychicnum's "board": a grid of clickable word tiles. The board FILLS the
 * available space (see WordBoard.module.css + PlayArea.module.css + docs/ui.md
 * → the board grows to available space); the words lay out in a roughly-square
 * grid (`cols ≈ √N`), and both the column and row tracks are `1fr`, so the tiles
 * grow with the board.
 *
 * Clicking a tile sets the pending guess (mirrored by the word entry below the
 * board); once guessed, a word's tile colors **permanently** — green if it was
 * a secret, red if not — so the board doubles as an at-a-glance record of what's
 * been found and ruled out. In compete mode RLS scopes `results` to the caller,
 * so it reflects only the viewer's own attempts.
 */
export function WordBoard({
  words,
  results,
  selected,
  onPick,
  viewing = false,
  highlightWord = null,
}: Props) {
  const cols = Math.ceil(Math.sqrt(words.length))
  const rows = Math.ceil(words.length / cols)
  return (
    <div
      className={styles.board}
      // data-board: a stable handle for e2e board-measurement (the height must not
      // change as the below-board slot swaps / the history banner overlays it) —
      // matching the other games' boards.
      data-board
      // The column/row counts drive the board's hug WIDTH + max-HEIGHT, both
      // computed in CSS from the --max-tile-* caps. See WordBoard.module.css.
      style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}
    >
      {/* While viewing a past turn the shared yellow `.frame` rings the board AND
          makes it click-through (pointer-events: none) so a click anywhere returns
          to the live board (useHistoryViewer's document listener). */}
      <div
        className={cls(shared.hugRectWidth, styles.grid, viewing && history.frame)}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {words.map((word) => {
          const guessed = results.has(word)
          const correct = results.get(word)
          return (
            <button
              key={word}
              type="button"
              className={cls(
                shared.tile,
                guessed && (correct ? styles.correct : styles.incorrect),
                selected === word && shared.selected,
                // Turn-history: this tile is the guess the viewed turn decided.
                highlightWord === word && styles.viewed,
              )}
              disabled={guessed || !onPick}
              aria-pressed={selected === word || undefined}
              onClick={onPick ? () => onPick(word) : undefined}
            >
              {/* --len drives the shared .tileWord auto-fit font heuristic. */}
              <span className={shared.tileWord} style={{ ['--len' as string]: word.length }}>
                {word}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
