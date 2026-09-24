// cs-blessed-codenamesduet

/**
 * Unit test for codenamesduet's terminal message (lib/terminal.ts). Pure — no
 * DOM, no supabase.
 *
 * It walks EVERY way a duet game can finish — the whole input space, since the
 * builder reads nothing but the play state and the reason. The pill and the
 * info-column line are two texts for one outcome, and a table is the only way to
 * see at a glance that no cell says "win" beside a loss, or leaves one of the two
 * texts empty.
 */
import { describe, expect, it } from 'vitest'
import { gameEndedTerminalMessage } from '@/common/terminal/terminalMessage'
import { buildTerminalMessage } from './terminal'

// Every ending the RPCs write, as [play_state, reason].
const ENDINGS: [string, string | undefined][] = [
  ['won', 'solved'],
  ['lost', 'assassin'],
  ['lost', 'turns'],
  ['lost', 'timeout'],
  ['ended', 'manual'],
]

describe('buildTerminalMessage', () => {
  it('reads every way a duet game ends', () => {
    expect(
      ENDINGS.slice(0, 4).map(([playState, reason]) => [reason, buildTerminalMessage({ playState, reason })]),
    ).toEqual([
      ['solved', { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }],
      ['assassin', { pillText: 'Lost: assassin', infoColText: 'Assassin revealed', outcome: 'lost' }],
      ['turns', { pillText: 'Lost: out of turns', infoColText: 'Out of turns', outcome: 'lost' }],
      ['timeout', { pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost' }],
    ])
  })

  it('reads a manual end as the shared neutral ending, never a loss', () => {
    const m = buildTerminalMessage({ playState: 'ended', reason: 'manual' })
    expect(m).toEqual(gameEndedTerminalMessage('coop'))
    expect(m.outcome).toBe('neutral')
  })

  it('reads a loss with a cause it does not know as a plain loss', () => {
    expect(buildTerminalMessage({ playState: 'lost', reason: undefined })).toEqual({
      pillText: 'Lost',
      infoColText: 'Lost',
      outcome: 'lost',
    })
  })

  it('reads an ending it does not know as neutral, naming it — never as a timeout', () => {
    expect(buildTerminalMessage({ playState: 'lost_somehow', reason: 'timeout' })).toEqual({
      pillText: 'Game over: lost_somehow',
      infoColText: 'Game over',
      outcome: 'neutral',
    })
  })

  it('fills both texts in every case, and says "Lost" only beside a loss', () => {
    for (const [playState, reason] of ENDINGS) {
      const m = buildTerminalMessage({ playState, reason })
      expect(m.pillText).not.toBe('')
      expect(m.infoColText).not.toBe('')
      expect(m.pillText.startsWith('Lost')).toBe(m.outcome === 'lost')
    }
  })
})
