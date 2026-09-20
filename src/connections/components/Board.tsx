// cs-blessed-connections

import { type ReactNode } from 'react'
import { cls } from '@/common/utils/cls'
import type { Category } from '../lib/board'
import type { MatchedCategory } from '../hooks/useGame'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { RANK_TOKEN } from '../lib/rankColors'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './PlayArea.module.css'

const COLS = 4

/** Empty lit-tile set — a stable reference so a live render never lights a tile. */
const NO_TILES: ReadonlySet<string> = new Set()

/** The answer to my last guess, worn by the tiles it covered. */
export type BoardVerdict = {
  tiles: ReadonlySet<string>
  // ANY outcome, because the mark wears its PILL's outcome — the two are one
  // message — and the pill speaks the full vocabulary.
  outcome: Outcome
  // Bumped per verdict. The shake is a CSS animation, which only restarts on a
  // NEW element, so the tiles are keyed on this: submitting the same four tiles
  // twice has to shake twice.
  nonce: number
}

type Props = {
  // Categories resolved by a correct guess.
  matched: MatchedCategory[]
  // Categories revealed at game-end (loss / elimination); `[]` during play.
  unmatched: Category[]
  // Remaining tiles, in display order. They stay on a FROZEN board (that's the
  // record of how far the players got) and step aside only for the reveal,
  // whose bands take their grid rows.
  tiles: string[]
  // May these tiles be clicked? False on a frozen board, which marks them
  // `disabled` — the shared `.tile` chrome then drops the pointer cursor and
  // the hover lift, so a record doesn't advertise itself as an input.
  interactive: boolean
  // tile → user_id (the inverted selections map). Says which tiles are in the
  // guess being built, and whose pick each one was.
  ownerByTile: ReadonlyMap<string, string>
  onToggle: (tile: string) => void
  // The tiles of a guess that is OUT — sent, waiting on the server. They wear
  // the shared in-flight dim until the answer lands.
  inFlightTiles: ReadonlySet<string>
  // The verdict on my last guess, filling its tiles in its pill's outcome
  // (BoardCol sets it, and clears it on the next tile click). Null while
  // nothing is being judged.
  verdict: BoardVerdict | null
  // Tiles taking the attention flash — the beat that says an answer landed here.
  // Raised for every verdict, my own included.
  attentionTiles: ReadonlySet<string>
  // Tiles taking the head-shake, which starts once the flash has faded and the
  // verdict color underneath is visible.
  shakenTiles: ReadonlySet<string>
  // user_id → resolved color var, for the identity ring.
  colorByUserId: ReadonlyMap<string, string>
  // Is this board SHARED — a coop game with somebody else in it? Only then is
  // a pick ringed in its picker's color, and then every pick is, mine included.
  sharedBoard: boolean
  // Turn-order (coop, opt-in): a teammate holds the move, so the whole board
  // is inactive — the board-scope dim.
  notMyTurn: boolean
  // True for a beat as the turn becomes mine (useTurnStartFlash).
  myTurnJustStarted: boolean
  // The game's outcome once it is over — the board wears the frame in it.
  // `'neutral'` also covers a player who is out of a compete race while
  // the others play on: their board is inert even though the game isn't.
  gameOver: TerminalOutcome | null
  // ATTENTION's cause, the server's move marker: the guess log's length. A band
  // arriving is only news when a MOVE put it there — `replay_board` deletes the
  // guesses, so a restart drops this instead of advancing it and the re-dealt
  // board says nothing (`useMoveAttention`).
  moveCount: number
  // Render read-only under the shared viewer frame (a past turn's board). Off
  // during live play.
  isViewingHistory: boolean
  // The four tiles the viewed turn guessed, tinted by `historyLitOutcome` and
  // under the viewer's outline. Optional, with its twin below: the caller
  // reads both off the open snapshot (`historySnap?.…`), so they arrive
  // undefined whenever no past turn is open.
  historyLitTiles?: ReadonlySet<string>
  // The viewed turn's outcome — the tint for `historyLitTiles`.
  historyLitOutcome?: Outcome
  // A control floated over the board's top-right (the Shuffle button). Rendered
  // INSIDE the board root, the `position: relative` anchor, so it hugs the
  // VISUAL board rather than the column's top.
  floatingControl?: ReactNode
}

/**
 * connections' board: a SINGLE grid holding both the solved-category bands and
 * the remaining tiles. A solved category becomes a full-width band row
 * (`grid-column: 1 / -1`) in place of the tile row it replaced — a band is
 * "one long tile" spanning the row instead of four, the same height, padding
 * and depth as a tile, sharing the one grid gap. Because every category is
 * four tiles, `bands + ceil(remaining / 4)` is always the same row count, so
 * it is one grid that grows to fill its `.board` wrapper.
 *
 * Every mark on it is the SHARED vocabulary (common/board-marks/doc.md), and
 * the element each one lands on is what says how far it reaches. On a TILE: the
 * `.selected` border for a tile in the guess being built — worn whoever picked
 * it, because in coop the four tiles are one shared move — with `.peerPick`
 * naming the picker where that is worth saying; `.dimInFlight` while the guess
 * is with the server; `.verdictFill` in its pill's outcome when the answer lands.
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
  inFlightTiles,
  verdict,
  colorByUserId,
  sharedBoard,
  notMyTurn,
  myTurnJustStarted,
  gameOver,
  moveCount,
  attentionTiles,
  shakenTiles,
  isViewingHistory,
  historyLitTiles = NO_TILES,
  historyLitOutcome = 'lost',
  floatingControl,
}: Props) {
  // ─── The rows ──────────────────────────────────────────
  // What is on the grid: the solved bands in rank order, the revealed ones,
  // and the loose tiles — and how many rows that makes, which is what sizes it.
  const sortedMatched = [...matched].sort((a, b) => a.rank - b.rank)
  // Total rows = one per band + the tile rows. Always 4 for a standard
  // 16-tile / 4×4 board, but computed so the cap math stays correct if a
  // category ever isn't exactly four tiles.
  const rows = sortedMatched.length + unmatched.length + Math.ceil(tiles.length / COLS)

  // ─── Attention ─────────────────────────────────────────
  // ATTENTION — a category resolved while you were reading another corner: a
  // correct guess collapses four tiles into a band and reflows everything
  // below it, in coop wherever a teammate was working.
  //
  // Gated on the CAUSE (the guess log) rather than on the board differing:
  // a restart re-deals with every band gone and the reveal swaps four bands
  // in at once, and neither is a move. `matched` is projected from the log in
  // useGame, so a band cannot arrive a render before its row. See
  // `useMoveAttention`.
  const rankKey = sortedMatched.map((m) => m.rank).join(',')
  const flashingRanks = useMoveAttention({
    content: sortedMatched,
    contentKey: rankKey,
    moveCount,
    // Quiet only while viewing a past turn: the lit tiles there are already
    // the mark. A player's OWN band is marked like anyone else's — it lands at
    // the top of the board while they were reading tiles.
    quiet: isViewingHistory,
    changed: (before, now) => {
      const had = new Set(before.map((m) => m.rank))
      return new Set(now.map((m) => m.rank).filter((r) => !had.has(r)))
    },
  })

  // ─── A band ────────────────────────────────────────────
  // One long tile: a solved or revealed category drawn across the row.
  // A solved band and a revealed one look the same; `revealed` only namespaces
  // the React keys across the two lists.
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
        ['--tile-slot-fill-color' as string]: RANK_TOKEN[c.rank],
        // The edge is the rank color stepped darker. A band is inert — never
        // selected, nothing refused on it — so nothing else ever claims its
        // border.
        ['--tile-slot-edge-color' as string]: `color-mix(in srgb, ${RANK_TOKEN[c.rank]} 84%, #000)`,
        // --len drives the same auto-fit the tiles use (here for the band name).
        ['--len' as string]: c.name.length,
      }}
    >
      <strong>{c.name}</strong>
      <div className={styles.bandMembers}>{c.tiles.join(' · ')}</div>
    </div>
  )

  // ─── Render ────────────────────────────────────────────
  return (
    // --rows (bands + tile-rows) drives the grid's 1fr row tracks AND the
    // board's max-height (both computed in CSS from the --max-tile-* caps — see
    // PlayArea.module.css). A band is one of these rows spanning all columns.
    <div className={cls(shared.boardSeal, styles.board)} style={{ ['--rows' as string]: rows }} data-board>
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
          isViewingHistory && history.historyFrame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns rather than nest: while
          // the viewer is open it owns the outline, being the state you chose and
          // the one you can leave.
          gameOver !== null && !isViewingHistory && shared.gameOverFrame,
          gameOver === 'won' && !isViewingHistory && shared.gameOverWon,
          gameOver === 'lost' && !isViewingHistory && shared.gameOverLost,
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
          // One of the four tiles the viewed turn guessed — tinted the outcome
          // color and outlined in the history blue.
          const isHistoryLit = historyLitTiles.has(tile)
          return (
            <button
              // Keyed on the verdict's nonce while it is wearing one, so that
              // submitting the same four tiles again REMOUNTS them and the verdict's
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
                // SELECTED, whoever picked it: the border says "in the move",
                // the ring below says whose.
                ownerId !== undefined && shared.selected,
                ownerColor && styles.peerPick,
                // The answer landing here — the attention flash first, then the
                // head-shake over the verdict color the flash hands back.
                attentionTiles.has(tile) && shared.attentionFlash,
                shakenTiles.has(tile) && shared.verdictShake,
                inFlight && shared.dimInFlight,
                // The answer fills the tile, in a PALE tier of its pill's outcome.
                isVerdict && shared.verdictFill,
                isVerdict && verdict && VERDICT_TONE[verdict.outcome],
                isHistoryLit && shared.verdictFill,
                isHistoryLit && VERDICT_TONE[historyLitOutcome],
                isHistoryLit && styles.historyTile,
              )}
              style={ownerColor ? { ['--peer-color' as string]: ownerColor } : undefined}
              onClick={() => onToggle(tile)}
              // NOT a focus target: `preventDefault` on mousedown stops a CLICK
              // parking focus here, where the next keystroke would promote it
              // to `:focus-visible` and leave a stray ring. Nothing here needs
              // focus — tiles are clicked, and Submit is bound board-wide.
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
