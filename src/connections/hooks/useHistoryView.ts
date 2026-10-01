// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import type { Actor } from '@/common/members/member'
import type { Outcome } from '@/common/outcomes/outcomes'
import { historySnapshot } from '../lib/history'
import type { GameData, MatchedCategory } from './useGame'

/**
 * The turn-history view: which past turn, if any, is open on the board, and
 * that turn's board rebuilt. Every field but the two callbacks is null (or
 * undefined) while the live board is on screen.
 */
export type HistoryView = {
  // A past turn is open on the board (`viewedEventId` is set). Everything that
  // would write to the board answers to it: the commands hide, the picks are
  // not drawn, a teammate's verdict is not marked.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The bands matched strictly before the viewed turn, or null when live.
  matched: MatchedCategory[] | null
  // The tiles on the grid at the viewed turn, or null when live.
  tiles: string[] | null
  // The viewed turn's four tiles, lit in what the turn was; null when live.
  litTiles: Set<string> | null
  litOutcome: Outcome | null
  // The banner's text, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — which only compete can
  // be: coop is one shared board, so a teammate's row replays the board I am
  // already looking at, and there is no "whose" to answer.
  actor: Actor | undefined
}

/**
 * Click an event-log `#N` to replay that turn's board: the bands matched
 * before it, and its four guessed tiles lit in their outcome color. Built on
 * the shared `useHistoryViewer`, whose exits need no wiring: any click that is
 * not another `#N`, and any key, which the viewer consumes.
 *
 * WHOSE board it replays is the row's author's. Mid-game compete that is
 * always me (RLS shows me nothing else), but at the end every racer's rows
 * arrive, and a `#N` on one of theirs replays THEIR grid, so the rows folded
 * are that author's alone. Coop is one shared board, so every row folds. The
 * replay itself is `lib/history.ts`'s.
 */
export function useHistoryView(gd: GameData, myId: string): HistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const viewedRow = historyId === null ? undefined : gd.events.find((g) => g.id === historyId)
  const authorRows =
    gd.isCompete && viewedRow
      ? gd.events.filter((g) => g.user_id === viewedRow.user_id)
      : gd.events
  const snapshot =
    historyId === null ? null : historySnapshot(authorRows, gd.puzzle.board, historyId)
  const isSomeoneElsesBoard =
    gd.isCompete && viewedRow !== undefined && viewedRow.user_id !== myId
  return {
    isViewing: historyId !== null,
    viewedEventId: historyId,
    show: showHistory,
    exit: exitHistory,
    matched: snapshot?.matched ?? null,
    tiles: snapshot?.tiles ?? null,
    litTiles: snapshot?.historyLitTiles ?? null,
    litOutcome: snapshot?.outcome ?? null,
    label: snapshot?.historyLabel ?? null,
    actor: isSomeoneElsesBoard ? gd.playersById[viewedRow.user_id] : undefined,
  }
}
