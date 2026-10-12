// cs-unmet

import type { GEvent, GGameData, GGameSheet, GPlayer, GRound, GSheetRow } from '../types'

/**
 * The rows of a round's scoresheet: every word of round `round`, in the
 * reveal's order — the Fastest's first, then as the words came in. A star on
 * each row with the round's best total (the word's score and the round's
 * bonus), when anyone scored at all. In coop the round has one row, the
 * team's word, and no star.
 */
export function makeRoundSheet(gd: GGameData, round: GRound): GSheetRow[] {
  const rows = gd.events.filter((e) => e.num === round.num).map((e) => makeRow(e, round))
  const best = Math.max(0, ...rows.map((r) => r.rowTotal))
  return rows.map((r) => ({ ...r, isStar: gd.compete && best > 0 && r.rowTotal === best }))
}

/**
 * The game's scoresheet. Compete: a table per player, the winner's first, then
 * by place, the unranked last in seat order. Coop: the team's one table. In
 * each, the lowest word scores — all but the best `gd.nBestRounds` — are
 * struck, and their rows add only the bonus; a tie for the lowest strikes the
 * later round. `total` is the server's.
 */
export function makeGameSheets(gd: GGameData): GGameSheet[] {
  const roundsByNum = new Map(gd.rounds.map((r) => [r.num, r]))

  function makeSheet(player: GPlayer | null, events: GEvent[], total: number): GGameSheet {
    const rows = events.map((e) => makeRow(e, roundsByNum.get(e.num)!))
    const nStruck = Math.max(0, rows.length - gd.nBestRounds)
    const struckNums = new Set([...rows]
      .sort((a, b) => a.score - b.score || b.num - a.num)
      .slice(0, nStruck)
      .map((r) => r.num))
    return {
      player,
      rows: rows.map((r) => struckNums.has(r.num)
        ? { ...r, isStruck: true, rowTotal: r.rowTotal - r.score }
        : r),
      total,
    }
  }

  if (gd.team !== null) return [makeSheet(null, gd.events, gd.team.total)]

  const placed = [...gd.players].sort((a, b) =>
    (a.finalRanking ?? Infinity) - (b.finalRanking ?? Infinity) || b.total - a.total)
  return placed.map((player) => makeSheet(player, gd.events.filter((e) => e.by === player), player.total))
}

/** One logged word as a row: its bonus in the beat-the-Fastest column or the
 *  Fastest's own — the coop bonus the latter — and, in coop, the card facts. */
function makeRow(event: GEvent, round: GRound): GSheetRow {
  const isFastest = round.fastest === event.by || event.band !== null
  return {
    num: event.num,
    player: event.by,
    word: event.word,
    score: event.score,
    beatBonus: !isFastest && event.bonus > 0 ? event.bonus : null,
    fastestBonus: isFastest && event.bonus > 0 ? event.bonus : null,
    beatClock: event.beatClock,
    band: event.band,
    penalty: event.penalty,
    rowTotal: event.score + event.bonus,
    isStar: false,
    isStruck: false,
  }
}
