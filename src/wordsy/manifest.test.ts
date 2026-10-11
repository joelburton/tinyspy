// cs-unmet

/**
 * wordsy's club-page status line, `summaryFor`: the round in play while the
 * game is on; my ending's word once I am out, with the winners and the total
 * they share; the game's own result for a member who did not play.
 */
import { describe, expect, it } from 'vitest'
import type { Member } from '@/common/members/member'
import type { GameEndingRaw } from '@/common/game-page/gameData'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { wordsyCompeteManifest } from './manifest'
import type { GSummaryData } from './types'

const MEMBERS = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'bea', color: 'blue' },
  { id: 'u3', username: 'cade', color: 'green' },
] as Member[]

type PlayerFacts = { id: string; finalRanking?: number | null; outcome?: EndOutcome | null; conceded?: boolean }

/** A summary blob from its facts: live unless an ending is given. */
function summary({
  players,
  ending = null,
  outcome = null,
  nRoundsPlayed = 3,
  winnerTotal = null,
}: {
  players: PlayerFacts[]
  ending?: GameEndingRaw | null
  outcome?: EndOutcome | null
  nRoundsPlayed?: number
  winnerTotal?: number | null
}): GSummaryData {
  const ended = ending !== null
  return {
    id: 'g1', gametype: 'wordsy_compete', title: `Round ${nRoundsPlayed + 1} of 7`,
    statusChangedAt: '2026-01-01T00:00:00Z', ended, outcome, ending,
    players: players.map((p) => ({
      id: p.id,
      finalRanking: p.finalRanking ?? null,
      outcome: p.outcome ?? null,
      conceded: p.conceded ?? false,
      solved: false,
      stillPlaying: !ended && !(p.conceded ?? false),
      ending: p.conceded || ended
        ? { at: '2026-01-01T00:00:00Z', reason: p.conceded ? 'conceded' : 'resource_exhausted', detail: '' }
        : null,
    })),
    team: null, nRoundsPlayed, winnerTotal, nRounds: 7, legalBand: 4, roundStyle: 'timer', oneWord: false,
  }
}

const ROUNDS_PLAYED: GameEndingRaw = { reason: 'resource_exhausted', detail: 'rounds_played', by: null }
const line = (data: GSummaryData, myId = 'u1') => wordsyCompeteManifest.summaryFor(data, MEMBERS, myId)

describe('wordsy summaryFor', () => {
  it('names the round in play while the game is on', () => {
    expect(line(summary({ players: [{ id: 'u1' }, { id: 'u2' }] }))).toBe('Playing · Round 4 of 7')
  })

  it('my win carries the total', () => {
    const data = summary({
      players: [{ id: 'u1', finalRanking: 1, outcome: 'won' }, { id: 'u2', finalRanking: 2, outcome: 'near' }],
      ending: ROUNDS_PLAYED, outcome: 'won', nRoundsPlayed: 7, winnerTotal: 46,
    })
    expect(line(data)).toBe('Won · 46 pts')
  })

  it('a shared win names the other winner in my label, once', () => {
    const data = summary({
      players: [{ id: 'u1', finalRanking: 1, outcome: 'won' }, { id: 'u2', finalRanking: 1, outcome: 'won' }],
      ending: ROUNDS_PLAYED, outcome: 'won', nRoundsPlayed: 7, winnerTotal: 39,
    })
    expect(line(data)).toBe('Won (tied with bea) · 39 pts')
  })

  it('a place below first says who won, and with what', () => {
    const data = summary({
      players: [{ id: 'u1', finalRanking: 2, outcome: 'near' }, { id: 'u2', finalRanking: 1, outcome: 'won' }],
      ending: ROUNDS_PLAYED, outcome: 'won', nRoundsPlayed: 7, winnerTotal: 46,
    })
    expect(line(data)).toBe('2nd · Won by bea · 46 pts')
  })

  it('a player who scored nothing lost with no points', () => {
    const data = summary({
      players: [{ id: 'u1', outcome: 'lost' }, { id: 'u2', outcome: 'lost' }],
      ending: ROUNDS_PLAYED, outcome: 'lost', nRoundsPlayed: 7,
    })
    expect(line(data)).toBe('Lost (no points)')
  })

  it('my concession leads while the others play on', () => {
    const data = summary({ players: [{ id: 'u1', conceded: true, outcome: 'lost' }, { id: 'u2' }] })
    expect(line(data)).toBe('Conceded (game continues)')
  })

  it('a member who did not play reads the game\'s own result', () => {
    const won = summary({
      players: [{ id: 'u1', finalRanking: 1, outcome: 'won' }, { id: 'u2', finalRanking: 2, outcome: 'near' }],
      ending: ROUNDS_PLAYED, outcome: 'won', nRoundsPlayed: 7, winnerTotal: 46,
    })
    expect(line(won, 'u3')).toBe('Won by me · 46 pts')
    const conceded = summary({
      players: [{ id: 'u1', conceded: true, outcome: 'lost' }, { id: 'u2', conceded: true, outcome: 'lost' }],
      ending: { reason: 'conceded', detail: 'conceded', by: 'u2' }, outcome: 'lost',
    })
    expect(line(conceded, 'u3')).toBe('Lost (all conceded)')
    const stopped = summary({
      players: [{ id: 'u1', outcome: 'neutral' }, { id: 'u2', outcome: 'neutral' }],
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1' }, outcome: 'neutral',
    })
    expect(line(stopped, 'u3')).toBe('Stopped')
  })
})
