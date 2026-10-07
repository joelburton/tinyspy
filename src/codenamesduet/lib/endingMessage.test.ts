// cs-unmet

/**
 * Unit test for codenamesduet's ending message (lib/endingMessage.ts). Pure —
 * no DOM, no supabase.
 *
 * It walks EVERY way a duet game can finish — the whole input space, since the
 * builder reads nothing but the outcome and its detail. The pill and the
 * info-column line are two texts for one outcome, and a table is the only way
 * to see at a glance that no cell says "win" beside a loss, or leaves one of
 * the two texts empty.
 */
import { describe, expect, it } from 'vitest'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { buildGameEndedMessageNeutral } from '@/common/ending/endingMessage'
import { buildGameEndingMessage } from './endingMessage'

// Every ending the RPCs write, as [outcome, detail].
const ENDINGS: [EndOutcome, string][] = [
  ['won', 'solved'],
  ['lost', 'assassin'],
  ['lost', 'neutral'],
  ['lost', 'timeout'],
  ['neutral', 'stopped'],
]

describe('buildGameEndingMessage', () => {
  it('reads every way a duet game ends', () => {
    expect(
      ENDINGS.slice(0, 4).map(([outcome, detail]) => [detail, buildGameEndingMessage({ outcome, detail })]),
    ).toEqual([
      ['solved', { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }],
      ['assassin', { pillText: 'Lost: assassin', infoColText: 'Assassin revealed', outcome: 'lost' }],
      ['neutral', { pillText: 'Lost: out of turns', infoColText: 'Out of turns', outcome: 'lost' }],
      ['timeout', { pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost' }],
    ])
  })

  it('reads a Stop as the shared neutral ending, never a loss', () => {
    const m = buildGameEndingMessage({ outcome: 'neutral', detail: 'stopped' })
    expect(m).toEqual(buildGameEndedMessageNeutral('coop'))
    expect(m.outcome).toBe('neutral')
  })

  it('reads a loss with a cause it does not know as a plain loss', () => {
    expect(buildGameEndingMessage({ outcome: 'lost', detail: 'mystery' })).toEqual({
      pillText: 'Lost',
      infoColText: 'Lost',
      outcome: 'lost',
    })
  })

  it('reads an outcome it does not know as neutral, naming it', () => {
    expect(buildGameEndingMessage({ outcome: 'near', detail: 'timeout' })).toEqual({
      pillText: 'Game over: near',
      infoColText: 'Game over',
      outcome: 'neutral',
    })
  })

  it('fills both texts in every case, and says "Lost" only beside a loss', () => {
    for (const [outcome, detail] of ENDINGS) {
      const m = buildGameEndingMessage({ outcome, detail })
      expect(m.pillText).not.toBe('')
      expect(m.infoColText).not.toBe('')
      expect(m.pillText.startsWith('Lost')).toBe(m.outcome === 'lost')
    }
  })
})
