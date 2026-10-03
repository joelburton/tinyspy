// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { replayTurn } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to replay that turn's board: the bands matched
 * before it, and its four guessed tiles lit in their outcome color. Built on
 * the shared `useHistoryViewer`, whose exits need no wiring: any click that is
 * not another `#N`, and any key, which the viewer consumes.
 *
 * WHOSE board it replays is the row's author's. Mid-game compete that is
 * always me (the seat rule leaves me nothing else), but at the end every
 * racer's rows arrive, and a `#N` on one of theirs replays THEIR grid, so the
 * rows folded are that author's alone. Coop is one shared board, so every row
 * folds. The replay itself is `lib/history.ts`'s.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const viewedRow = historyId === null ? undefined : gd.events.find((e) => e.id === historyId)
  const authorRows =
    gd.compete && viewedRow
      ? gd.events.filter((e) => e.by === viewedRow.by)
      : gd.events
  const replayed =
    historyId === null ? null : replayTurn(authorRows, gd.puzzle, historyId)
  const isSomeoneElsesBoard =
    gd.compete && viewedRow !== undefined && viewedRow.by !== gd.me
  return {
    isViewing: historyId !== null,
    viewedEventId: historyId,
    show: showHistory,
    exit: exitHistory,
    board: replayed?.board ?? null,
    litTileIds: replayed?.litTileIds ?? null,
    litOutcome: replayed?.outcome ?? null,
    label: replayed?.label ?? null,
    actor: isSomeoneElsesBoard ? viewedRow.by : undefined,
  }
}
