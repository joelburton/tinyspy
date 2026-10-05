// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { makeHistorySnapshot } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/** Nothing ringed: the live board, or a turn that cleared no word. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * Click an event-log `#N` to replay that turn's board. Built on the shared
 * `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key.
 *
 * The board replayed is the row's own author's: in coop the one shared stack,
 * in compete that racer's — mid-race always mine, since a rival's rows are
 * withheld (`useGame`'s seat rule), and at the end anyone's. The replay is
 * `lib/history.ts`'s fold over that author's rows.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const viewedEvent = historyId === null
    ? undefined
    : gd.events.find((e) => e.id === historyId)
  const author = viewedEvent?.by
  // One player's turns at a time in compete: each racer clears their own stack.
  const authorsEvents = gd.compete && author !== undefined
    ? gd.events.filter((e) => e.by === author)
    : gd.events
  const snapshot = viewedEvent === undefined ? null : makeHistorySnapshot(authorsEvents, viewedEvent.id)

  return {
    isViewing: snapshot !== null,
    viewedEventId: snapshot === null ? null : historyId,
    show: showHistory,
    exit: exitHistory,
    offTileIds: snapshot?.offTileIds ?? null,
    litTileIds: snapshot?.litTileIds ?? NO_TILES,
    label: snapshot?.label ?? null,
    actor: gd.compete && author !== gd.me ? author : undefined,
  }
}
