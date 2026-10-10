// cs-unmet

import type { GRound } from '../types'

/** A past round, as the board draws it. */
type HistorySnapshot = {
  // The round, its table as it was dealt.
  round: GRound
  // The banner line.
  label: string
}

/**
 * wordsy's turn-history view: a past round's table. A lookup, not a
 * reconstruction — a round's table is fixed once dealt and kept on its row —
 * so the snapshot is the round itself.
 *
 * The log's `#N` is the round number on every row of that round, so `n` (what
 * the clicked row printed) says nothing the number doesn't, and the banner
 * names the round.
 */
export function makeHistorySnapshot(
  rounds: readonly GRound[],
  num: number,
): HistorySnapshot | null {
  const round = rounds.find((r) => r.num === num)
  if (round === undefined) return null
  return { round, label: `Round ${num} of 7` }
}
