// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeEndingMessage } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './endingLabel'

/** A player who has ended, by how; still playing unless the case says. */
function player(over: Partial<Parameters<typeof makeEndingLabel>[0]>) {
  return { outcome: null, conceded: false, finalRanking: null, solved: false, stillPlaying: false, ...over }
}

const ENDED = { ended: true, reason: 'resource_exhausted' } as const

/** The pill and the info column's words, as a player would read them. */
function words(...args: Parameters<typeof makeEndingLabel>) {
  const label = makeEndingLabel(...args)
  if (label === null) return null
  const m = makeEndingMessage(label, 'compete')
  return { pill: m.pillText, infoCol: m.infoColText, outcome: m.outcome }
}

/**
 * Every ending a wordsy player meets: seven rounds played (won, tied, placed,
 * scoreless), a Stop, a concession while the game goes on and once it has
 * ended.
 */
describe('makeEndingLabel', () => {
  it('is null while the player still plays', () => {
    expect(makeEndingLabel(player({ stillPlaying: true }), { ended: false, reason: null }, [])).toBeNull()
  })

  it('a win alone', () => {
    expect(words(player({ outcome: 'won', finalRanking: 1 }), ENDED, []))
      .toEqual({ pill: 'Won', infoCol: 'Won', outcome: 'won' })
  })

  it('a shared win names the others', () => {
    expect(words(player({ outcome: 'won', finalRanking: 1 }), ENDED, ['bea']))
      .toEqual({ pill: 'Won: tied with bea', infoCol: 'Won (tied with bea)', outcome: 'won' })
  })

  it('a place below first', () => {
    expect(words(player({ outcome: 'near', finalRanking: 2 }), ENDED, []))
      .toEqual({ pill: '2nd', infoCol: '2nd', outcome: 'near' })
  })

  it('a shared place names the others', () => {
    expect(words(player({ outcome: 'near', finalRanking: 2 }), ENDED, ['bea', 'cade']))
      .toEqual({ pill: '2nd: tied with bea & cade', infoCol: '2nd (tied with bea & cade)', outcome: 'near' })
  })

  it('a player who scored nothing has no place', () => {
    expect(words(player({ outcome: 'lost' }), ENDED, []))
      .toEqual({ pill: 'Lost: no points', infoCol: 'Lost (no points)', outcome: 'lost' })
  })

  it('a concession while the game goes on, and once it has ended', () => {
    expect(words(player({ outcome: 'lost', conceded: true }), { ended: false, reason: null }, []))
      .toEqual({ pill: 'Conceded: game continues', infoCol: 'Conceded (game continues)', outcome: 'lost' })
    expect(words(player({ outcome: 'lost', conceded: true }), ENDED, []))
      .toEqual({ pill: 'Conceded', infoCol: 'Conceded', outcome: 'lost' })
  })

  it('a Stop is no result', () => {
    const label = makeEndingLabel(player({ outcome: 'neutral' }), { ended: true, reason: 'stopped' }, [])
    expect(label?.labelType).toBe('stopped')
    expect(label?.outcome).toBe('neutral')
  })
})
