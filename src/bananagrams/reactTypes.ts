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
  onPeel?: () => Promise<{ illegalCells: number[] } | null>
  // Report a Check-words outcome so the coordinator can show it.
  onCheckResult?: (r: GCheckResult) => void
  // Dump a tile: swap it for DUMP_COUNT from the bunch.
  onDump?: (letter: string) => void | Promise<void>
  // Tiles left in the shared bunch, or undefined before the page knows.
  bunchCount?: number
  // Tiles in the out-of-play bag: a dump tops up from it when the bunch is
  // short, so what a dump can draw is the two together.
  bagCount?: number
  // Kept pointed at the LIVE board string so the outer coordinator can read it
  // on demand (the print menu reads it at click time) without subscribing to
  // every placement.
  reportBoardRef?: RefObject<string>
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
  centerAndFit: () => void
  onCellPointerDown: (x: number, y: number, e: ReactPointerEvent) => void
  // ── Hand ──
  // The hand in its shuffled order, and in the canonical order it derives from.
  displayedHand: string
  derivedHand: string
  // A hand tile is hovering the dump slot.
  dumpHot: boolean
  // "You don't hold that tile": the brief red box around the hand, and the
  // nonce that replays it on a repeated miss.
  errFlash: boolean
  errNonce: number
  onHandPointerDown: (index: number, letter: string, e: ReactPointerEvent) => void
  onShuffle: () => void
  // ── Actions ──
  // A peel is in flight.
  declaring: boolean
  doPeel: () => Promise<void>
  // PEEL, as the action behind both its key and its button — the board cursor
  // binds it (Enter and Space come with the action) and hands it back so the
  // board's action row can place the same one.
  actPeel: Action
  // The hand's ⟲ rotate, and ⌥Z, as one action.
  actShuffle: Action
  // Ask the server whether the board is legal right now and paint what isn't.
  actCheckBoard: Action
  // Re-center the board and fit it to the viewport. A view control, live at
  // every phase.
  actZoomFit: Action
  // The **Check words** button's work. Always offered, whatever
  // `setup.word_check` says — that option governs when the server ENFORCES
  // words, not whether you may ask about your own board.
  doWordCheck: () => Promise<void>
  // A Check-words round trip is in flight (grays its button).
  checking: boolean
}
