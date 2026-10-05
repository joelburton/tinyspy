// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { makeHistorySnapshot } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to replay that turn's board. Built on the shared
 * `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key.
 *
 * The board replayed is the row's own author's: in coop the one shared board,
 * in compete that racer's — mid-race always mine, since a rival's rows are
 * withheld (`useGame`'s seat rule), and at the end anyone's. The replay is
 * `lib/history.ts`'s filter over that author's rows.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, historyN, showHistory, exitHistory } = useHistoryViewer<number>()
  const viewedEvent = historyId === null
    ? undefined
    : gd.events.find((e) => e.id === historyId)
  const author = viewedEvent?.by
  // One player's turns at a time in compete: each racer finds on their own board.
  const authorsEvents = gd.compete && author !== undefined
    ? gd.events.filter((e) => e.by === author)
    : gd.events
  const snapshot = viewedEvent === undefined
    ? null
    : makeHistorySnapshot(authorsEvents, viewedEvent.id, historyN)

  return {
    isViewing: snapshot !== null,
    viewedEventId: snapshot === null ? null : historyId,
    show: showHistory,
    exit: exitHistory,
    board: snapshot?.board ?? null,
    litTiles: snapshot?.litTiles ?? [],
    label: snapshot?.label ?? null,
    actor: gd.compete && author !== gd.me ? author : undefined,
  }
}
