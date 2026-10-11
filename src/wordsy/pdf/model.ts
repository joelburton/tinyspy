// cs-unmet

import type { PrintHeader } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import type { GGameData } from '../types'

/**
 * What a wordsy printout contains: **the log, and only the log.** A round's
 * table is a shuffle nobody can play again, so a printed one would be a
 * photograph of a moment; what survives the game is what happened — each
 * finished round's table, every word with its score, and the totals.
 */
export type WordsyPrintModel = PrintHeader & {
  // Every player's total so far, highest first; a winner marked.
  totals: { name: string; total: number; won: boolean }[]
  // Each finished round's table: "F+1 B C D L C Q+2 R", in slot order.
  tables: { num: number; cards: string }[]
  // The log, oldest first, numbered by round.
  turns: TurnRow[]
}

export function buildPrintModel({ gd, date }: { gd: GGameData; date: string }): WordsyPrintModel {
  const finished = gd.rounds.filter((r) => r.ended)
  return {
    brand: gd.brand,
    gameTitle: gd.title,
    date,
    summary: gd.ended
      ? `${finished.length} rounds played`
      : `Round ${gd.round.num} of ${gd.nRounds} · ${gd.me.total} pts`,
    setupRows: gd.setupRows,
    mode: gd.mode,
    totals: gd.players
      .map((p) => ({ name: p.username, total: p.own.total, won: p.finalRanking === 1 }))
      .sort((a, b) => b.total - a.total),
    tables: finished.map((r) => ({
      num: r.num,
      cards: r.tiles
        .map((t) => `${t.letter.toUpperCase()}${t.bonus > 0 ? `+${t.bonus}` : ''}`)
        .join(' '),
    })),
    turns: gd.events.map((e) => ({
      seq: e.num,
      who: e.by.username,
      text: e.word === ''
        ? '— no word'
        : `${e.word.toUpperCase()} ${e.score}${e.bonus > 0 ? ` +${e.bonus}` : ''}`,
    })),
  }
}
