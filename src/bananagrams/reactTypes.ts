// cs-unmet

/**
 * bananagrams' types that reach React — the exported types `types.ts` cannot
 * hold, since a type built on a React-dependent piece (an `Action`, a ref, a
 * drag) does not belong beside the data (docs/code-conventions.md → A game's
 * types). Every other exported type is in `types.ts`.
 */

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Action } from '@/common/actions/useBindAction'
import type { GridCursor } from '@/common/board-cursor/gridCursor'
import type { DragState } from '@/shared/grid-and-drag/useDragGesture'
import type { GCell, GCheckResult, GDragSource } from './types'

/**
 * Every command the info column places, bound once: the action row places
 * them, the menu lists them, and their keys fire them — all reading the same
 * action, so the surfaces cannot drift. Peel, Check words, Shuffle and the
 * zoom-to-fit are the board editor's, bound in `usePlayerBoard`.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-restart` → `actRestart`), so
  // a grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Deal this game again: every board emptied, the same hands back.
  actRestart: Action
  // A fresh game, with this game's setup and players.
  actNewGame: Action
  // Drop out of the race while the others play on.
  actConcede: Action
  // The whole table stops, with no result.
  actStopGame: Action
  // Print every board, a column per player.
  actPrintBoard: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}

/** What the board editor needs from PlayArea, the outer coordinator. */
export type GBoardEditorInput = {
  gameId: string
  // My board as the server last saved it. Seeds the editor's board ONCE; the
  // editor owns it after, and a later blob never re-seeds it.
  initialBoard: string
  // Every letter I hold, hand and board together: the server's, grown by a
  // peel and swapped by a dump. The hand is derived from it and the board.
  tiles: string
  // The board responds to me (the page's `isBoardInteractive`). False once the
  // game is over or I have conceded: freezes the board (no placing, dragging
  // or typing) and disables peel, check and dump.
  isBoardInteractive: boolean
  // Peel: draws a tile for everyone, or wins if the bunch can't refill the
  // table. Resolves to `{ illegalCells }` when a winning peel was BLOCKED by
  // the legal-board check (those cells get painted red); `null` otherwise.
  onPeel: () => Promise<{ illegalCells: number[] } | null>
  // Report a Check-words outcome so the coordinator can show it.
  onCheckResult: (r: GCheckResult) => void
  // Dump a tile: swap it for DUMP_COUNT from the bunch.
  onDump: (letter: string) => void | Promise<void>
  // Tiles left in the shared bunch.
  nBunchTiles: number
  // Tiles in the out-of-play bag: a dump tops up from it when the bunch is
  // short, so what a dump can draw is the two together.
  nBagTiles: number
  // Kept pointed at the LIVE board string so the outer coordinator can read it
  // on demand (the print reads it at click time) without subscribing to every
  // placement.
  reportBoardRef: RefObject<string>
}

/**
 * The **board editor**, what `usePlayerBoard` returns: my board as it is on
 * screen right now, the hand derived from it, the cursor, the drag, the zoom
 * and the actions that act on them — everything the two views and the layout
 * need to render. One editor spans both columns, since the hand's tiles drop
 * onto the board and the dump slot takes a tile dragged off it.
 */
export type GBoardEditor = {
  // ── Board arena ──
  scrollRef: RefObject<HTMLDivElement | null>
  // The live board: the 625-character grid as it is on screen.
  board: string
  // The zoom, in px per cell, and the smallest zoom that still fits the grid.
  cell: number
  minCell: number
  cursor: GridCursor
  hover: GCell | null
  drag: DragState<GDragSource> | null
  // The cells a blocked peel or a Check words painted red; they clear
  // themselves on the next edit.
  invalidCells: ReadonlySet<number>
  onZoom: (next: number) => void
  onCellPointerDown: (x: number, y: number, e: ReactPointerEvent) => void
  // ── Hand ──
  // The hand in its shuffled order, and in the canonical order it derives from.
  displayedHand: string
  derivedHand: string
  // A dragged tile is over the dump slot.
  dumpHot: boolean
  // The bunch and the bag together can cover a dump's draw.
  canDump: boolean
  // "You don't hold that tile": the brief red box around the hand, and the
  // nonce that replays it on a repeated miss.
  errFlash: boolean
  errNonce: number
  onHandPointerDown: (index: number, letter: string, e: ReactPointerEvent) => void
  // ── Actions ──
  // PEEL, as the action behind both its key and its button — the board cursor
  // binds it (Enter and Space come with the action) and hands it back so the
  // action row can place the same one. Hidden to a button once the board is
  // inert; disabled while a tile is still in hand.
  actPeel: Action
  // The hand's ⟲ rotate, and ⌥Z, as one action. Live at every phase.
  actShuffle: Action
  // Ask the server whether the board is legal right now and paint what isn't.
  // Hidden to a button once the board is inert.
  actCheckBoard: Action
  // Re-center the board and fit it to the viewport. A view control, live at
  // every phase.
  actZoomFit: Action
}
