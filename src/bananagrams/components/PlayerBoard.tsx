import type { ReactNode, RefObject } from 'react'
import { PeelButton } from '../../common/components/buttons/PeelButton'
import { cls } from '../../common/lib/util/cls'
import { usePlayerBoard, LETTER_SCALE } from '../hooks/usePlayerBoard'
import { BoardArena } from './BoardArena'
import { HandCard } from './HandCard'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayerBoard.module.css'

/**
 * bananagrams' play surface — the thin coordinator of the two columns. It calls the
 * `usePlayerBoard` engine (all the cross-column state + behaviour: the FIXED 25×25
 * arena, the drag gesture, the keyboard cursor, zoom/scroll, autosave, the derived
 * hand, Peel) and lays out its two VIEWS side by side:
 *
 *   - `<BoardArena>` (board column) — the zoom/scroll arena.
 *   - `<HandCard>` (info column) — the hand card (dump zone + rotate + tiles).
 *
 * **Why not the roster's `BoardCol` + `InfoCol`.** bananagrams is the documented
 * exception where the board and the hand are NOT independently-owned columns: the hand
 * tiles are drag sources into the board, the dump zone is a drop target during a board
 * drag, the derived hand is a function of board state, and the keyboard cursor spans
 * both. So the input engine can't be split by column — it lives in ONE hook
 * (`usePlayerBoard`) and the two columns are thin VIEWS over it. See
 * docs/games/bananagrams.md + docs/playarea-decomposition-plan.md.
 *
 * This owns the two-column layout; the OUTER coordinator (`PlayArea`) owns the game
 * data, the peel/dump/concede RPCs, the local-feedback channel, and the terminal
 * verdict, passing the info-column chrome down as the `infoTop` / `infoActions` /
 * `localPill` slots. bananagrams' info column is the documented exception to the
 * canonical order: readouts (infoTop) → the HAND card → Peel → the bottom action row
 * (Concede / Dump) — its hand + peel live in the info column, so the actions sit below
 * them, not in the shared `.actionSlot`.
 */
type Props = {
  gameId: string
  /** The FE-owned placement grid at load — seeds the engine's board state ONCE. */
  initialBoard: string
  /** Server-owned holdings. LIVE: a peel/dump changes it upstream and the derived hand
   *  follows. */
  tiles: string
  /** The info-column readout stack (state / opponents / help / setup), built by
   *  PlayArea and rendered in the shared `.actionSlot` above the hand card. */
  infoTop: ReactNode
  /** The bottom action row (Concede / Dump, or the terminal / locally-terminal line),
   *  rendered BELOW the hand card (bananagrams' documented order exception). */
  infoActions: ReactNode
  /** The below-board local feedback pill (a draw announcement, an RPC error, or the
   *  terminal / locally-terminal message), or null. In the fixed-height slot under the
   *  board so the arena never reflows. */
  localPill?: ReactNode
  /** True once the game is over — disables Peel (the race is run). */
  isTerminal?: boolean
  /** True once THIS player has conceded (game still live for the others): freezes the
   *  board + disables peel/dump — they're out of the race. */
  isConceded?: boolean
  /** Peel: draws a tile for everyone, or wins if the bunch can't refill the table.
   *  Resolves to `{ illegalCells }` when a winning peel was BLOCKED (those cells paint
   *  red); `null` otherwise. */
  onPeel?: () => Promise<{ illegalCells: number[] } | null>
  /** Dump a tile: swap it for DUMP_COUNT from the bunch. */
  onDump?: (letter: string) => void | Promise<void>
  /** Tiles left in the shared bunch (status.pool_remaining), or undefined pre-load.
   *  Shown next to Peel so players sense the endgame. */
  bunchCount?: number
  /** Tiles in the out-of-play box (status.box_remaining) — only nonzero in dump-to-box
   *  games; counts toward what a dump can draw. */
  boxCount?: number
  /** Out-param kept pointed at the live board, so PlayArea's print menu can snapshot
   *  it at click time (the board lives in the engine, but the menu lives in PlayArea). */
  reportBoardRef?: RefObject<string>
}

export function PlayerBoard({
  gameId,
  initialBoard,
  tiles,
  infoTop,
  infoActions,
  localPill,
  isTerminal,
  isConceded,
  onPeel,
  onDump,
  bunchCount,
  boxCount,
  reportBoardRef,
}: Props) {
  const arena = usePlayerBoard({
    gameId,
    initialBoard,
    tiles,
    isTerminal,
    isConceded,
    onPeel,
    onDump,
    bunchCount,
    boxCount,
    reportBoardRef,
  })

  return (
    <div className={cls(shared.layout, styles.layout)}>
      {/* The board column is game-specific (a FILL scroll arena, not the shared hug
          board), so it does NOT compose shared.boardCol — styles.boardCol is
          self-sufficient, avoiding a flex hug-vs-fill override fight. */}
      <div className={styles.boardCol}>
        <BoardArena
          scrollRef={arena.scrollRef}
          cell={arena.cell}
          minCell={arena.minCell}
          onZoom={arena.onZoom}
          onCenterFit={arena.centerAndFit}
          board={arena.board}
          cursor={arena.cursor}
          hover={arena.hover}
          drag={arena.drag}
          invalidCells={arena.invalidCells}
          onCellPointerDown={arena.onCellPointerDown}
        />
        {/* The below-board region (universal). bananagrams is NON-SWAP and has NO
            below-board move controls — you make moves by dragging tiles on the arena
            itself — so `.moveArea` is intentionally empty. The feedback area (shared
            `.localFeedback`) reserves its own height so the arena never reflows when the
            pill appears/clears. */}
        <div className={styles.belowBoard}>
          <div className={styles.moveArea} />
          <div className={shared.localFeedback}>{localPill}</div>
        </div>
      </div>

      {/* Info column — bananagrams' documented exception to the canonical order:
          readouts (infoTop) → the HAND card → Peel → the bottom action row (Concede /
          Dump). The hand + peel live here, not in the board column, so the actions sit
          below them. */}
      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>{infoTop}</div>

        <HandCard
          displayedHand={arena.displayedHand}
          drag={arena.drag}
          dumpHot={arena.dumpHot}
          errFlash={arena.errFlash}
          errNonce={arena.errNonce}
          onHandPointerDown={arena.onHandPointerDown}
          onShuffle={arena.onShuffle}
          hasDump={!!onDump}
          isTerminal={!!isTerminal}
          isConceded={!!isConceded}
          bunchCount={bunchCount}
          boxCount={boxCount}
        />

        {/* The bottom action row — natural-width action buttons side by side. While
            playing: [Concede] [Peel] (Peel, the primary move, on the right). The shared
            PeelButton (primary) is enabled only once the hand is empty (it FLUSHES the
            board first so peel's "placed == tiles" check is current; the terminal modal
            is driven from realtime, not this click). At terminal / locally-terminal the
            row becomes the outcome line + back-to-club (no Peel). */}
        <div className={cls(shared.infoActions, (isTerminal || isConceded) && shared.terminalActions)}>
          {infoActions}
          {onPeel && !isTerminal && !isConceded && (
            <PeelButton
              className={shared.helperButton}
              disabled={arena.derivedHand.length !== 0 || arena.declaring}
              onClick={() => void arena.doPeel()}
            />
          )}
        </div>
      </div>

      {arena.drag && (
        <div
          className={styles.ghost}
          style={{
            left: arena.drag.x,
            top: arena.drag.y,
            width: arena.cell,
            height: arena.cell,
            fontSize: arena.cell * LETTER_SCALE,
          }}
        >
          {arena.drag.letter}
        </div>
      )}
    </div>
  )
}
