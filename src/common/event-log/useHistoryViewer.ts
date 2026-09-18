// cs-blessed-event-log

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { setInfoSheetOpen } from '../info-sheet/infoSheetStore'
import { useBoundAction } from '../actions/useBoundAction'

/** The turn-history viewer's coordination state (see `useHistoryViewer`). */
export interface HistoryViewer<Id> {
  // The turn currently open on the board (the events row's own id, or the
  // game-wide ordinal scrabble and codenamesduet key by), or null = live. Wire to
  // each `<EventLogNumber>`'s `isOpenInHistory`.
  historyId: Id | null
  // A ref tracking `historyId`, for stable-closure handlers that must read the
  // current value WITHOUT re-subscribing (e.g. scrabble's board-drag pointerdown,
  // registered once). Most games don't need it.
  historyIdRef: RefObject<Id | null>
  // `historyId !== null` — "am I viewing a past turn?" Gates the board's readOnly /
  // viewing frame and the "click to exit" wiring.
  isViewingHistory: boolean
  // Open a turn in the viewer — wire straight to the log's `onShowHistory`. On a
  // phone this also leaves the info page for the board, since that's where the turn
  // you just asked for is drawn.
  showHistory: (id: Id) => void
  // Return to the live board (a board click, the banner ✕, a new move landing).
  exitHistory: () => void
}

/**
 * The turn-history viewer's coordination — which past turn, if any, is open on the
 * board, plus the affordances that enter and leave it. Call it in the `PlayArea` of
 * a game whose board can replay past turns; `Id` is how that game names a turn
 * (scrabble's game-wide `seq`, stackdown's log position).
 *
 * Wiring per game:
 *   - the board renders `snapshot ?? live` and applies the shared `.historyFrame`
 *     while `isViewingHistory`; computing that snapshot stays the game's (its
 *     `lib/history`), as does the banner that names the turn
 *   - the event log hangs a `<EventLogNumber>` on each turn:
 *     `onShowHistory={() => showHistory(id)}`, `isOpenInHistory={historyId === id}`
 *
 * Two of the three exits need no wiring at all: a keystroke (the hook binds
 * `act-exit-history`, whose any-key wildcard consumes the press while a turn is open)
 * and a click anywhere that isn't another `#N` handle. The third is the banner's ✕:
 * the game places `<HistoryBanner>` and hands it `exitHistory`. doc.md carries the
 * seam.
 */
export function useHistoryViewer<Id = number>(): HistoryViewer<Id> {
  const [historyId, setHistoryId] = useState<Id | null>(null)
  const exitHistory = useCallback(() => setHistoryId(null), [])

  // Keep a ref in sync each render, for handlers registered once that must read the
  // current value (scrabble's board-drag). Cheap; the extra render cost is nil.
  const historyIdRef = useRef<Id | null>(historyId)
  useEffect(() => {
    historyIdRef.current = historyId
  })

  // Click-anywhere-to-exit — INTRINSIC to the viewer (every game gets it, no wiring).
  // While a past turn is open, a click ANYWHERE returns to the live board, EXCEPT a
  // click on a turn-# handle (the shared `<EventLogNumber>`, marked
  // `data-history-handle`), which selects that turn instead — so you can switch turns
  // without leaving the viewer. A document-level listener so it catches clicks
  // outside the board too (the info column, the log, the page chrome); the board is
  // click-through while framed (historyViewer `.historyFrame` sets `pointer-events: none`),
  // so board clicks reach here as well. The opening click is on a `#N` handle (and
  // this only arms once `historyId` is set), so it never self-dismisses.
  useEffect(function exitOnClickAway() {
    if (historyId === null) return
    const onDocClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[data-history-handle]')) return
      setHistoryId(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [historyId])

  // Opening a turn means "show me the board as it was", so opening one LEAVES the
  // info page: below the breakpoint the `#N` handle is on the off-canvas info page
  // and the board it replays is on the other one (docs/playarea.md tells the story).
  //
  // Unconditional, not mobile-gated: the flag is already false on desktop (the info
  // column is inline there, and useInfoSheet clears it when crossing the
  // breakpoint), so setting it false again is a no-op. A `useIsMobile()` check here
  // would only add a way for the two to disagree.
  const showHistory = useCallback((id: Id) => {
    setInfoSheetOpen(false)
    setHistoryId(id)
  }, [])

  // A KEYSTROKE RETURNS TO LIVE, and the press is spent doing it — the same key
  // must not also play a move on a board you have only just got back. An
  // any-key action that CONSUMES is how a surface says it is in a mode, and the
  // dispatcher runs those ahead of every particular key, wherever each is
  // bound — so this wins the press without the board having to stand aside.
  useBoundAction('act-exit-history', {
    describe: () => (historyId === null ? 'hidden' : 'active'),
    run: exitHistory,
  })

  return {
    historyId,
    historyIdRef,
    isViewingHistory: historyId !== null,
    showHistory,
    exitHistory,
  }
}
