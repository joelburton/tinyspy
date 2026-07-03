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
 *   - board renders `snapshot ?? live` and applies the shared `.frame` while
 *     `viewing` (which also makes it click-through — see below)
 *   - the turn log hangs a `<TurnLogNumber>` on each turn: `onSelect={() =>
 *     select(id)}`, `viewing={viewingId === id}`
 *   - a bare keystroke returns to live: `exitOnKey` (event-carrying key handlers) or
 *     `viewing` + `exitViewing` (event-less ones)
 *
 * Exit-on-CLICK is NOT wired per game — it's built in here: a click anywhere returns
 * to live (skipping the `#N` handles). Games needn't add a board-click handler.
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

  // Click-anywhere-to-exit — INTRINSIC to the viewer (every game gets it, no wiring).
  // While a past turn is open, a click ANYWHERE returns to the live board, EXCEPT a
  // click on a turn-# handle (the shared `<TurnLogNumber>`, marked
  // `data-turn-number`), which selects that turn instead — so you can switch turns
  // without leaving the viewer. A document-level listener so it catches clicks
  // outside the board too (the info column, the log, the page chrome); the board is
  // click-through while framed (historyViewer `.frame` sets `pointer-events: none`),
  // so board clicks reach here as well. The opening click is on a `#N` handle (and
  // this only arms once `viewingId` is set), so it never self-dismisses. (Keystroke
  // exit stays game-wired via `exitOnKey` — it must cooperate with each game's own
  // key handler.)
  useEffect(() => {
    if (viewingId === null) return
    const onDocClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[data-turn-number]')) return
      setViewingId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [viewingId])

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
