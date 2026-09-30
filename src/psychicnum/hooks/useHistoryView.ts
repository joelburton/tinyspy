// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import type { Actor } from '@/common/members/member'
import { replayTurn } from '../lib/history'
import type { TileResults } from '../lib/tileResults'
import type { GameData } from './useGame'

/**
 * The turn-history view: which past turn, if any, is open on the board, and
 * that turn replayed. Every field but the two callbacks is null (or undefined)
 * while the live board is on screen.
 */
export type HistoryView = {
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The viewed turn's board, or null when live.
  tileResults: TileResults | null
  // The tile the viewed turn decided — ring it; null for a hint or a spoiler.
  litWord: string | null
  // The banner's text, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — which only compete can
  // be: coop is one shared board, so a teammate's row replays the board I am
  // already looking at, and there is no "whose" to answer.
  actor: Actor | undefined
}

/**
 * Click an event-log `#N` to replay that turn's board (the tiles decided up to
 * that turn, with that turn's guessed tile ringed history-blue). Built on the
 * shared `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key, which the viewer consumes so it does not also play
 * on the board. The replay is `lib/history.ts`'s.
 */
export function useHistoryView(gd: GameData, selfId: string): HistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const replayed = historyId === null ? null : replayTurn(gd.events, historyId, gd.isCompete)
  const authorId = replayed?.authorId ?? null
  const isSomeoneElsesBoard = gd.isCompete && authorId !== null && authorId !== selfId
  return {
    viewedEventId: historyId,
    show: showHistory,
    exit: exitHistory,
    tileResults: replayed?.tileResults ?? null,
    litWord: replayed?.litWord ?? null,
    label: replayed?.label ?? null,
    actor: isSomeoneElsesBoard ? gd.players[authorId] : undefined,
  }
}
