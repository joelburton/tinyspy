// cs-unmet

import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import type { GEvent, GGameData, GHistoryView } from '../types'

/** How long another player's word flashes: longer than the shared beat, since a
 *  word lands among many tiles and the eye has a board to search. The tiles
 *  carry it to CSS (`Tile`), so the animation and the class end together. */
export const WORD_ATTENTION_FADE_MS = 2000

/**
 * The cells of a word another player just played — a teammate's, a rival's or
 * a bot's — hot for `WORD_ATTENTION_FADE_MS`: the shared attention flash
 * (`useMoveAttention`), held longer.
 * My own word is news to everyone but me, so it is left out; it has its own
 * green ring (`useSubmitMove`'s `playedCellIds`). A swap or a pass places
 * nothing, so it flashes nothing.
 *
 * The move marker is the log's length, which drops on a Restart, so a re-dealt
 * board is not mistaken for a move. Quiet while a past turn is on view: that
 * board is not the one the word landed on.
 */
export function useWordAttention({
  gd,
  historyView,
}: {
  gd: GGameData
  historyView: GHistoryView
}): ReadonlySet<string> {
  return useMoveAttention({
    content: gd.events,
    contentKey: String(gd.events.at(-1)?.id ?? 0),
    moveCount: gd.events.length,
    quiet: historyView.isViewing,
    fadeMs: WORD_ATTENTION_FADE_MS,
    changed: (before: GEvent[], now: GEvent[]) => new Set(
      now.slice(before.length)
        .filter((e) => e.kind === 'word' && e.by.id !== gd.me.id)
        .flatMap((e) => e.placements!.map((t) => t.id)),
    ),
  })
}
