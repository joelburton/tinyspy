// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { replayTurn } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/** A stable empty set, so a live board never rings a tile. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * Click an event-log `#N` to replay that turn's board (the table as it stood
 * after the turn, with the turn's own tiles ringed history-blue). Built on the
 * shared `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key, which the viewer consumes so it does not also play
 * on the board — a keystroke aimed at the clue field excepted. The replay is
 * `lib/history.ts`'s, and a later guess only grows later turns, so a viewed
 * turn never shifts under you.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, historyN, showHistory, exitHistory } = useHistoryViewer<number>()
  const replayed =
    historyId === null ? null : replayTurn(gd.events, gd.puzzle.tiles, historyId, historyN)
  return {
    isViewing: historyId !== null,
    viewedEventId: historyId,
    show: showHistory,
    exit: exitHistory,
    tiles: replayed?.tiles ?? null,
    litTileIds: replayed?.litTileIds ?? NO_TILES,
    label: replayed?.label ?? null,
  }
}
