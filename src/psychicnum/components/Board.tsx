import { useEffect, useState, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { Member } from '../../common/lib/games'
import { Dot } from '../../common/components/text/Dot'
import { ATTENTION_FLASH_MS } from '../../common/lib/game/feedbackTiming'
import { useMoveCausedChange } from '../../common/hooks/game/useMoveCausedChange'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './Board.module.css'

/** A stable empty set, so "nothing is flashing" is one object per render. */
const NO_WORDS: ReadonlySet<string> = new Set()

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
  /** WHO decided each tile — its guesser's identity dot, in the bottom-right
   *  corner. Null outside coop: in compete you only ever see your own guesses, so
   *  a dot would be decoration.
   *
   *  A REVEALED secret is deliberately absent from this map (nobody guessed it),
   *  which is what keeps found-vs-peeked readable without toggling the reveal off:
   *  a green tile with a dot was found, a green tile without one was shown. */
  decidedBy?: ReadonlyMap<string, Pick<Member, 'username' | 'color'> | undefined> | null
  /** The word currently with the server — its tile takes the in-flight dim. */
  inFlightWord?: string | null
  /** The game is finished, and how it ended — the board takes a band in that
   *  outcome's gray (neutral for a game merely ended). Null while it's live. */
  gameOver?: 'won' | 'lost' | 'neutral' | null
  /** A teammate holds the move (turn-order coop): dim the whole board. */
  notMyTurn?: boolean
  /** True for a beat at the moment the turn becomes mine — flash the frame. */
  myTurnJustStarted?: boolean
  /** Guesses the server has recorded. The CAUSE the attention flash reads: a
   *  board that changed while this stood still was revealed or re-dealt, not
   *  played into. */
  moveCount?: number
  /** A control floated over the board's top-right (the Shuffle button). Rendered
   *  INSIDE the board root — the root is the `position: relative` anchor — so it
   *  hugs the VISUAL board. Anchoring to the column instead would strand it at the
   *  column's top, which the vertically-centered board no longer touches. */
  floatingControl?: ReactNode
}

/**
 * psychicnum's "board": a grid of clickable word tiles. The board FILLS the
 * available space (see Board.module.css + PlayArea.module.css + docs/ui.md
 * → the board grows to available space); the words lay out in a roughly-square
 * grid (`cols ≈ √N`), and both the column and row tracks are `1fr`, so the tiles
 * grow with the board.
 *
 * Clicking a tile sets the pending guess (mirrored by the word entry below the
 * board); once guessed, a word's tile colors **permanently** — green if it was
 * a secret, red if not — so the board doubles as an at-a-glance record of what's
 * been found and ruled out. In compete mode RLS scopes `results` to the caller,
 * so it reflects only the viewer's own attempts.
 *
 * At TERMINAL the board doubles as the answer key: `secretWords` arrives (the
 * server reveals the secrets once the game is over) and every secret's tile is
 * ringed bright green — over its existing background, so a found secret still
 * reads as found and a missed one as missed. That reveal used to be a text list
 * in the below-board pill ("The words were APPLE, RIVER, STONE"), which had no
 * room on a phone and made the player map words back to tiles by eye.
 */
export function Board({
  words,
  results,
  selected,
  onPick,
  viewing = false,
  highlightWord = null,
  decidedBy = null,
  inFlightWord = null,
  gameOver = null,
  notMyTurn = false,
  myTurnJustStarted = false,
  moveCount = 0,
  floatingControl,
}: Props) {
  // ATTENTION — the tiles that just got decided. psychicnum's coop board is
  // SHARED, so a teammate's guess colours a tile anywhere on it while you are
  // reading somewhere else: change in place, announcing nothing.
  //
  // Gated on the CAUSE (the guess log) rather than on the board differing, because
  // the board also changes when nothing was played — asking to see the answer
  // turns every unfound secret green at once, and a restart clears the lot. Both
  // would light up the board at the moment nothing happened. See
  // `useMoveCausedChange`, and the same rule in waffle.
  const decided = [...results.keys()].sort().join(',')
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(NO_WORDS)
  const before = useMoveCausedChange(results, decided, moveCount)
  if (before && !viewing) {
    const fresh = new Set([...results.keys()].filter((w) => !before.has(w)))
    if (fresh.size > 0) setFlashing(fresh)
  }
  useEffect(() => {
    if (flashing.size === 0) return
    const timer = setTimeout(() => setFlashing(NO_WORDS), ATTENTION_FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashing])

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
      // computed in CSS from the --max-tile-* caps. See Board.module.css.
      style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}
    >
      {/* While viewing a past turn the shared yellow `.frame` rings the board AND
          makes it click-through (pointer-events: none) so a click anywhere returns
          to the live board (useHistoryViewer's document listener). */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          viewing && history.frame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns: the viewer owns it while
          // open, being the state you chose and the one you can leave.
          gameOver !== null && !viewing && shared.gameOverFrame,
          gameOver === 'won' && !viewing && shared.gameOverWon,
          gameOver === 'lost' && !viewing && shared.gameOverLost,
        )}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {words.map((word) => {
          const guessed = results.has(word)
          const correct = results.get(word)
          // `undefined` = draw no dot: either this game shows none (compete), or
          // nobody decided this tile (unguessed, or a revealed secret). A dot
          // whose member has left resolves to the neutral disc, not to nothing.
          const actor = decidedBy?.has(word) ? decidedBy.get(word) : undefined
          return (
            <button
              key={word}
              type="button"
              // A stable e2e hook: class names are hashed, and the floating
              // Shuffle control lives inside the board root, so "a button in the
              // board" would also match it (connections has the same hook, for
              // the same reason).
              data-tile={word}
              className={cls(
                shared.tileFace,
                shared.tile,
                styles.tile,
                guessed && (correct ? styles.correct : styles.incorrect),
                selected === word && shared.selected,
                word === inFlightWord && shared.dimInFlight,
                flashing.has(word) && shared.attentionFlash,
                // Turn-history: this tile is the guess the viewed turn decided.
                highlightWord === word && styles.viewed,
              )}
              disabled={guessed || !onPick}
              aria-pressed={selected === word || undefined}
              onClick={onPick ? () => onPick(word) : undefined}
              // NOT a focus target: out of the tab order (25 tiles would bury
              // every real control) and `preventDefault` on mousedown so a
              // CLICK can't park focus either. Otherwise the next keystroke
              // promotes the clicked tile to `:focus-visible` and leaves a ring
              // on it — see connections' Board for the same note. A tile is
              // clicked or typed; it is never a keyboard target.
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
            >
              {/* --len drives the shared .tileWord auto-fit font heuristic. */}
              <span className={shared.tileWord} style={{ ['--len' as string]: word.length }}>
                {word}
              </span>
              {/* WHO decided this tile. The shared identity disc, so a player's
                  colour means the same thing here as in the turn log and the
                  opponent strip — and it brings its paired border shade with it,
                  which is what lets a light colour read on a green fill. */}
              {actor !== undefined && (
                // `onColor`: a decided tile is always a saturated green or red, so
                // the ring goes white — the member's own darker shade vanishes into
                // a fill of the same hue (three reds in a row, in the worst case).
                <Dot color={actor?.color} onColor className={styles.actorDot} />
              )}
            </button>
          )
        })}
      </div>
      {floatingControl}
    </div>
  )
}
