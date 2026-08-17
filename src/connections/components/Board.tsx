import { useEffect, useState, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { Category, CategoryRank } from '../lib/board'
import type { GuessRow, MatchedCategory } from '../hooks/useGame'
import { RANK_TOKEN } from '../lib/rankColors'
import { useMoveCausedChange } from '../../common/hooks/game/useMoveCausedChange'
import { ATTENTION_FLASH_MS } from '../../common/lib/game/feedbackTiming'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './PlayArea.module.css'

const COLS = 4

/** Turn-history: a guessed tile's tint class by the viewed turn's outcome. */
const VIEWED_TINT: Record<GuessRow['result'], string> = {
  correct: styles.viewedTile_correct,
  oneAway: styles.viewedTile_oneAway,
  wrong: styles.viewedTile_wrong,
}

/** Empty highlight set — a stable reference so a live render never rings a tile. */
const NO_TILES: ReadonlySet<string> = new Set()

/** Empty flash set — the resting value of the attention state below. */
const NO_RANKS: ReadonlySet<CategoryRank> = new Set()

/** The verdict's tone class, keyed by the tone its PILL wore — one entry per
 *  answer connections' own-guess pill can give: red "Incorrect", gold "One
 *  away!", orange "You already tried that". The mark never picks its own color;
 *  it wears the pill's, because the two are one message (docs/tile-feedback.md).
 *  A CORRECT guess has no entry: those four tiles become a band on the same
 *  render, so there is nothing left to mark. */
const VERDICT_TONE = {
  error: shared.verdictError,
  warning: shared.verdictWarning,
  near: shared.verdictNear,
} as const

/** The answer to my last guess, worn by the tiles it covered. */
export type BoardVerdict = {
  tiles: ReadonlySet<string>
  tone: keyof typeof VERDICT_TONE
  /** Bumped per verdict. The shake is a CSS animation, which only restarts on a
   *  NEW element, so the tiles are keyed on this: submitting the same four tiles
   *  twice has to shake twice. */
  nonce: number
}

type Props = {
  /** Categories resolved by a correct guess — full-width colored bands at the
   *  top, sorted by rank. */
  matched: MatchedCategory[]
  /** Categories revealed at game-end (loss / elimination); `[]` during play. */
  unmatched: Category[]
  /** Remaining tiles, in display order. They stay on a FROZEN board (that's the
   *  record of how far the players got) and step aside only for the reveal,
   *  whose bands take their grid rows. */
  tiles: string[]
  /** May these tiles be clicked? False on a frozen board, which marks them
   *  `disabled` — the shared `.tile` chrome then drops the pointer cursor and
   *  the hover lift, so a record doesn't advertise itself as an input. */
  interactive: boolean
  /** tile → user_id (the inverted selections map). Says which tiles are in the
   *  guess being built, and whose pick each one was. */
  ownerByTile: ReadonlyMap<string, string>
  onToggle: (tile: string) => void
  /** The tiles of a guess that is OUT — sent, waiting on the server. They wear
   *  the shared in-flight dim until the answer lands. */
  inFlightTiles?: ReadonlySet<string>
  /** The verdict on my last guess, ringed in its pill's tone (BoardCol sets it,
   *  and clears it on the next tile click). Null while nothing is being judged. */
  verdict?: BoardVerdict | null
  /** user_id → resolved color var, for the identity ring. */
  colorByUserId: ReadonlyMap<string, string>
  /** Is this board SHARED — a coop game with somebody else in it? Identity is
   *  only information there. Solo, every pick is mine and a colored ring would be
   *  decoration on top of the selection border; in compete nobody sees my picks
   *  but me, so the same applies. When it IS shared, everyone's picks are ringed
   *  INCLUDING MINE: a board where only some picks carry a color reads as missing
   *  data rather than as "the unmarked ones are yours". */
  sharedBoard?: boolean
  /** Turn-order (coop, opt-in): a teammate holds the move, so the whole board
   *  is inactive — the board-scope dim. */
  notMyTurn?: boolean
  /** True for a beat as the turn becomes mine (useTurnStartFlash). */
  myTurnJustStarted?: boolean
  /** The game's outcome once it is over — the board wears the frame in that
   *  tone. `'neutral'` also covers a player who is out of a compete race while
   *  the others play on: their board is inert even though the game isn't. */
  gameOver?: 'won' | 'lost' | 'neutral' | null
  /** ATTENTION, the server's move marker: the guess log's length. A band
   *  arriving is only news when a MOVE put it there — `replay_board` deletes the
   *  guesses, so a restart drops this instead of advancing it and the re-dealt
   *  board says nothing (docs/tile-feedback.md → Read the cause). */
  moveCount?: number
  /** Was the newest guess mine? Then no flash: I picked those four tiles and the
   *  commit slot already told me they were right. The mark is for the teammates
   *  who were reading another corner. (Compete never flashes at all — the log is
   *  RLS-scoped to the caller, so every guess in it is mine.) */
  lastMoveMine?: boolean
  /** Turn-history: render read-only under the shared viewer frame (a past turn's
   *  board). Off during live play. */
  viewing?: boolean
  /** Turn-history: the four tiles the viewed turn guessed — ring them + tint them the
   *  outcome color (`highlightOutcome`). Empty / omitted when live. */
  highlightTiles?: ReadonlySet<string>
  /** Turn-history: the viewed turn's verdict — the tint for `highlightTiles`. */
  highlightOutcome?: GuessRow['result']
  /** A control floated over the board's top-right (the Shuffle button). Rendered
   *  INSIDE the board root — the root is the `position: relative` anchor — so it
   *  hugs the VISUAL board. Anchoring to the column instead would strand it at the
   *  column's top, which the vertically-centered board no longer touches. */
  floatingControl?: ReactNode
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
 * Every mark on it is the SHARED vocabulary (docs/tile-feedback.md), and the
 * element each one lands on is what says how far it reaches. On a TILE: the
 * `.selected` border for a tile in the guess being built — worn whoever picked
 * it, because in coop the four tiles are one shared move — with `.peerRing`
 * naming the picker where that is worth saying; `.dimInFlight` while the guess
 * is with the server; `.verdictFill` in its pill's tone when the answer lands.
 * On a BAND: `.attentionFlash`, for a category that resolved under a teammate's
 * hands. On the BOARD: the not-your-turn dim, the your-turn flash, and the
 * game-over frame. What is left to connections is the bands themselves and the
 * history tints.
 */
export function Board({
  matched,
  unmatched,
  tiles,
  interactive,
  ownerByTile,
  onToggle,
  inFlightTiles = NO_TILES,
  verdict = null,
  colorByUserId,
  sharedBoard = false,
  notMyTurn = false,
  myTurnJustStarted = false,
  gameOver = null,
  moveCount = 0,
  lastMoveMine = false,
  viewing = false,
  highlightTiles = NO_TILES,
  highlightOutcome = 'wrong',
  floatingControl,
}: Props) {
  const sortedMatched = [...matched].sort((a, b) => a.rank - b.rank)

  // ─── ATTENTION: a category resolved while you were reading another corner ───
  //
  // The one change on this board that doesn't announce itself. A correct guess
  // collapses four tiles into a full-width band and reflows everything below it
  // — a substitution in place, and in coop it happens wherever a teammate was
  // working rather than where you are looking.
  //
  // The cause has to come from the LOG, never from the board: `replay_board`
  // re-deals the same sixteen tiles with every band gone, and the terminal
  // reveal swaps four bands in at once. Both differ wildly from the previous
  // render and neither is news. `useMoveCausedChange` only speaks when the
  // content changed AND the server's move marker advanced, which is exactly
  // "a guess did this" (the marker drops on a replay, and the reveal doesn't
  // touch it).
  //
  // The two are guaranteed to agree here for free: `matchedCategories` is
  // PROJECTED from the guess log in useGame, so a band can't arrive a render
  // before the row that produced it.
  const [flashingRanks, setFlashingRanks] = useState<ReadonlySet<CategoryRank>>(NO_RANKS)
  const rankKey = sortedMatched.map((m) => m.rank).join(',')
  const before = useMoveCausedChange(rankKey, rankKey, moveCount)
  // `lastMoveMine` is the audience rule: my own correct guess is answered in the
  // commit slot, on four tiles I chose myself. Quiet while viewing a past turn,
  // too — the ringed tiles there are already the mark, and a live band landing
  // behind the viewer is not something to point at on a board nobody is reading.
  if (before !== null && !viewing && !lastMoveMine) {
    const had = new Set(before.split(',').filter(Boolean).map(Number))
    setFlashingRanks(new Set(sortedMatched.map((m) => m.rank).filter((r) => !had.has(r))))
  }

  // The wash is transient — take it off once it has played. (A timer, so an
  // effect; the diff above is a reaction to new props and stays in render.)
  useEffect(() => {
    if (flashingRanks.size === 0) return
    const timer = setTimeout(() => setFlashingRanks(NO_RANKS), ATTENTION_FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashingRanks])
  // Total rows = one per band + the tile rows. Always 4 for a standard
  // 16-tile / 4×4 board, but computed so the cap math stays correct if a
  // category ever isn't exactly four tiles.
  const rows = sortedMatched.length + unmatched.length + Math.ceil(tiles.length / COLS)

  // `revealed` no longer changes how a band LOOKS — a category you solved and
  // one the game handed you at the end print and render identically, on purpose
  // (2026-08-02). It survives only to namespace the React keys across the two
  // disjoint lists.
  const band = (c: Category | MatchedCategory, revealed: boolean) => (
    <div
      key={`${revealed ? 'u' : 'm'}-${c.rank}`}
      // A band IS a tile — one long one — so it wears the shared `.tileFace`
      // and says what color it is by re-setting that face's tokens, exactly as a
      // state class does. `.band` is then only what makes it long: the column
      // span and the two stacked lines.
      className={cls(
        shared.tileFace,
        styles.band,
        flashingRanks.has(c.rank) && shared.attentionFlash,
      )}
      style={{
        ['--tile-bg' as string]: RANK_TOKEN[c.rank],
        // The rank color stepped ~16% darker, as quiet definition — the same
        // derived edge psychicnum's decided tiles wear. A band is INERT (it can
        // never be selected and nothing can be refused on it), which is what
        // frees the border here: neither claimant on that channel can appear.
        ['--tile-border' as string]: `color-mix(in srgb, ${RANK_TOKEN[c.rank]} 84%, #000)`,
        // --len drives the same auto-fit the tiles use (here for the band name).
        ['--len' as string]: c.name.length,
      }}
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
    // --rows (bands + tile-rows) drives the grid's 1fr row tracks AND the
    // board's max-height (both computed in CSS from the --max-tile-* caps — see
    // PlayArea.module.css). A band is one of these rows spanning all columns.
    <div className={styles.board} style={{ ['--rows' as string]: rows }} data-board>
      {/* Four shared marks ride on the grid box, and all four are about the whole
          surface rather than any piece of it: the blue frame of "you're viewing a
          past turn" (which also makes the board click-through, so a click
          anywhere returns to live — useHistoryViewer's document listener), the
          dim of "a teammate holds the move", the yellow flash of "your turn just
          started", and the gray frame of "this board is finished". */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          viewing && history.frame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns rather than nest: while
          // the viewer is open it owns the outline, being the state you chose and
          // the one you can leave.
          gameOver !== null && !viewing && shared.gameOverFrame,
          gameOver === 'won' && !viewing && shared.gameOverWon,
          gameOver === 'lost' && !viewing && shared.gameOverLost,
        )}
      >
        {sortedMatched.map((mc) => band(mc, false))}
        {unmatched.map((c) => band(c, true))}
        {tiles.map((tile) => {
          const ownerId = ownerByTile.get(tile)
          // WHOSE pick this is, on a board where that is worth saying: everyone's
          // on a shared one (mine included), nobody's otherwise. Undefined also
          // gates the ring class, because the color arrives as an inline
          // `--peer-color` and a ring drawn against an undefined token is an
          // invalid declaration rather than a subtle bug.
          const ownerColor =
            sharedBoard && ownerId !== undefined ? colorByUserId.get(ownerId) : undefined
          const inFlight = inFlightTiles.has(tile)
          const isVerdict = verdict?.tiles.has(tile) ?? false
          // Turn-history: this tile is one of the four the viewed turn guessed —
          // tint it the outcome color + ring it in the history blue.
          const isViewed = highlightTiles.has(tile)
          return (
            <button
              // Keyed on the verdict's nonce while it is wearing one, so that
              // submitting the same four tiles again REMOUNTS them and the ring's
              // shake replays — a CSS animation only restarts on a new element.
              // Just these four: the other twelve keep their identity.
              key={isVerdict && verdict ? `${tile}#${verdict.nonce}` : tile}
              type="button"
              // A stable e2e hook (the class names are hashed, and the floating
              // Shuffle control lives inside the board root, so "a button in
              // the board" isn't specific enough to mean "a tile").
              data-tile={tile}
              disabled={!interactive}
              className={cls(
                shared.tileFace,
                shared.tile,
                // SELECTED, whoever picked it. In coop the four tiles are one
                // shared move — a teammate's pick is part of the guess I am
                // about to submit, not a note about where they are standing — so
                // the border says "in the move" and the ring below says whose.
                ownerId !== undefined && shared.selected,
                ownerColor && shared.peerRing,
                inFlight && shared.dimInFlight,
                // The answer fills the tile, in a PALE tier of its pill's tone.
                // The background is free to take it: a connections tile carries
                // no state colour — a decided one stops being a tile at all and
                // becomes part of a band.
                isVerdict && shared.verdictFill,
                isVerdict && verdict && VERDICT_TONE[verdict.tone],
                isViewed && VIEWED_TINT[highlightOutcome],
                isViewed && styles.viewedTile,
              )}
              style={ownerColor ? { ['--peer-color' as string]: ownerColor } : undefined}
              onClick={() => onToggle(tile)}
              // NOT a focus target, by two means. `tabIndex={-1}` takes the
              // button out of the tab order (16 tiles would bury every real
              // control), and `preventDefault` on mousedown stops a CLICK
              // parking focus on it — the trap the rank squares fell into: the
              // click focuses silently, the next keystroke promotes it to
              // `:focus-visible`, and a stray ring sits on the tile until you
              // click elsewhere. Nothing here needs focus: tiles are clicked,
              // Enter submits from anywhere (the window handler in BoardCol),
              // and Space shuffles.
              //
              // This also retired a per-tile `onKeyDown` that preventDefault'd
              // Enter so a focused tile wouldn't self-activate. Its own comment
              // noted "Space still toggles" — which would now fight the shuffle
              // key. With no focus to land, neither is reachable.
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
            >
              {/* --len drives the shared .tileWord auto-fit. */}
              <span className={shared.tileWord} style={{ ['--len' as string]: tile.length }}>
                {tile}
              </span>
            </button>
          )
        })}
      </div>
      {floatingControl}
    </div>
  )
}
