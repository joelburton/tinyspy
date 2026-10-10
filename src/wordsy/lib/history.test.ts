// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_makeGameDataRaw } from './gameData.fixture'
import { makeHistorySnapshot } from './history'

describe('makeHistorySnapshot', () => {
  const gd = makeGameData(
    ZTest_makeGameDataRaw({ rounds: [{ num: 1, ended: true }, { num: 2, ended: true }, { num: 3 }] }),
    'u1',
  )

  it('is the round itself, named by its number', () => {
    const snapshot = makeHistorySnapshot(gd.rounds, 2)
    expect(snapshot?.round).toBe(gd.rounds[1])
    expect(snapshot?.label).toBe('Round 2 of 7')
  })

  it('is null for a round that was never dealt', () => {
    expect(makeHistorySnapshot(gd.rounds, 5)).toBeNull()
  })
})
