// cs-met-codenamesduet

/**
 * Unit test for codenamesduet's terminal message (lib/terminal.ts). Pure — no
 * DOM, no supabase.
 *
 * It walks EVERY play state a duet game can finish in — the whole input space,
 * since the builder reads nothing else. The pill and the info-column line are
 * two texts for one outcome, and a table is the only way to see at a glance that
 * no cell says "win" beside a loss, or leaves one of the two texts empty.
 */
import { describe, expect, it } from 'vitest'
import { gameEndedTerminalMessage } from '@/common/terminal/terminalMessage'
import { buildTerminalMessage } from './terminal'

describe('buildTerminalMessage', () => {
  it('reads every way a duet game ends', () => {
    expect(
      ['won', 'lost_assassin', 'lost_clock', 'lost_timeout'].map((s) => [s, buildTerminalMessage(s)]),
    ).toEqual([
      ['won', { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }],
      ['lost_assassin', { pillText: 'Lost: assassin', infoColText: 'Assassin revealed', outcome: 'lost' }],
      ['lost_clock', { pillText: 'Lost: out of turns', infoColText: 'Out of turns', outcome: 'lost' }],
      ['lost_timeout', { pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost' }],
    ])
  })

  it('reads a manual end as the shared neutral ending, never a loss', () => {
    expect(buildTerminalMessage('ended')).toEqual(gameEndedTerminalMessage('coop'))
    expect(buildTerminalMessage('ended').outcome).toBe('neutral')
  })

  it('reads an ending it does not know as neutral, naming it — never as a timeout', () => {
    expect(buildTerminalMessage('lost_somehow')).toEqual({
      pillText: 'Game over: lost_somehow',
      infoColText: 'Game over',
      outcome: 'neutral',
    })
  })

  it('fills both texts in every case, and says "Lost" only beside a loss', () => {
    for (const state of ['won', 'lost_assassin', 'lost_clock', 'lost_timeout', 'ended']) {
      const m = buildTerminalMessage(state)
      expect(m.pillText).not.toBe('')
      expect(m.infoColText).not.toBe('')
      expect(m.pillText.startsWith('Lost')).toBe(m.outcome === 'lost')
    }
  })
})
