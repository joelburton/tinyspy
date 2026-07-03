import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** The turn-history viewer's coordination state (see `useHistoryViewer`). */
export interface HistoryViewer<Id> {
  /** The turn currently open on the board (a game-wide `seq`, or a log index),
   *  or null = live. Wire to the turn log's highlight. */
  viewingId: Id | null
  /** A ref tracking `viewingId`, for stable-closure handlers that must read the
   *  current value WITHOUT re-subscribing (e.g. scrabble's board-drag pointerdown,
   *  registered once). Most games don't need it. */
  viewingIdRef: RefObject<Id | null>
  /** `viewingId !== null` — "am I viewing a past turn?" Gates the board's readOnly /
   *  viewing frame and the "click to exit" wiring. */
  viewing: boolean
  /** Open a turn in the viewer — wire straight to the log's `onSelectTurn`. */
  select: (id: Id) => void
  /** Return to the live board (a board click, the banner ✕, a new move landing). */
  exitViewing: () => void
  /** For a `useGlobalKeyHandler` game: if viewing and the key is unmodified, return
   *  to live and report the key CONSUMED (true) so it doesn't also play a move. Call
   *  it first in the game's key handler and bail on true — or pass it straight to
   *  `useGlobalKeyHandler` in a game with no keyboard play (waffle). Games whose key
   *  path has no event (scrabble's `onAnyKey`) use `viewing` + `exitViewing` instead. */
  exitOnKey: (e: KeyboardEvent) => boolean
}

/**
 * The turn-history viewer's coordination — the one cross-column state the feature
 * adds (which past turn, if any, is open on the board) plus the affordances to
 * enter/leave it. Shared by every game whose board can replay past turns (scrabble,
 * stackdown, waffle, …); extracted once turn-history reached three games (the rule
 * of three — see docs/playarea-decomposition-plan.md).
 *
 * What stays per-game (deliberately NOT here): how a snapshot is COMPUTED from the
 * viewed id (each game's `lib/history` — the board shape differs per game, and it's
 * derived after the loading guard where the log/plays live), and how a turn is
 * IDENTIFIED (scrabble keys by a game-wide `seq`; stackdown/waffle by log position —
 * hence the `Id` generic). The game keeps its one-liner
 * `const snap = viewing ? gameSnapshot(viewingId) : null`.
 *
 * Wiring per game:
 *   - board renders `snapshot ?? live`; the board column exits on click:
 *     `onClick={viewing ? exitViewing : undefined}`
 *   - the turn log is clickable + highlights the row: `onSelectTurn={select}`,
 *     `viewingId`
 *   - a bare keystroke returns to live: `exitOnKey` (event-carrying key handlers) or
 *     `viewing` + `exitViewing` (event-less ones)
 */
export function useHistoryViewer<Id = number>(): HistoryViewer<Id> {
  const [viewingId, setViewingId] = useState<Id | null>(null)
  const exitViewing = useCallback(() => setViewingId(null), [])

  // Keep a ref in sync each render, for handlers registered once that must read the
  // current value (scrabble's board-drag). Cheap; the extra render cost is nil.
  const viewingIdRef = useRef<Id | null>(viewingId)
  useEffect(() => {
    viewingIdRef.current = viewingId
  })

  const exitOnKey = useCallback(
    (e: KeyboardEvent): boolean => {
      if (viewingId === null || e.metaKey || e.ctrlKey || e.altKey) return false
      exitViewing()
      return true
    },
    [viewingId, exitViewing],
  )

  return {
    viewingId,
    viewingIdRef,
    viewing: viewingId !== null,
    select: setViewingId,
    exitViewing,
    exitOnKey,
  }
}
