// cs-unmet

/** A game's ending with its links turned into players, winners read off the ranking. */
import { describe, expect, it } from 'vitest'
import { makeEnding } from './makeEnding'
import type { GameEndingRaw } from './gameData'

const ada = { id: 'u1', finalRanking: null as number | null }
const bea = { id: 'u2', finalRanking: null as number | null }

const raw = (over: Partial<GameEndingRaw> = {}): GameEndingRaw => ({
  reason: 'reached_goal',
  detail: 'solved',
  by: 'u1',
  ...over,
})

describe('makeEnding', () => {
  it('is null while the game is played', () => {
    expect(makeEnding(null, [ada, bea])).toBeNull()
  })

  it('turns `by` into the player, and keeps the reason pair', () => {
    const ending = makeEnding(raw(), [ada, bea])!
    expect(ending.by).toBe(ada)
    expect(ending.reason).toBe('reached_goal')
    expect(ending.detail).toBe('solved')
  })

  it('leaves `by` null for a timeout nobody\'s turn covers', () => {
    expect(makeEnding(raw({ reason: 'timeout', by: null }), [ada, bea])!.by).toBeNull()
  })

  it('names the one player ranked first', () => {
    const won = { ...bea, finalRanking: 1 }
    expect(makeEnding(raw(), [ada, won])!.winners).toEqual([won])
  })

  it('names every co-winner, in seat order', () => {
    const first = { ...ada, finalRanking: 1 }
    const second = { ...bea, finalRanking: 1 }
    const ending = makeEnding(raw(), [first, second])!
    expect(ending.winners[0]).toBe(first)
    expect(ending.winners[1]).toBe(second)
  })

  it('names nobody ranked below first, and nobody when nobody won', () => {
    expect(makeEnding(raw(), [{ ...ada, finalRanking: 2 }, bea])!.winners).toEqual([])
  })
})
