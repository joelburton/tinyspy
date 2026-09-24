// cs-met-wordwheel

/**
 * Unit test for wordwheel's terminal message (lib/terminal.ts). Pure — no
 * DOM, no supabase.
 *
 * It walks EVERY play state a wordwheel game can finish in, in both modes,
 * for every reason the server can write, for a caller who won or was beaten —
 * the whole input space, since the builder reads nothing else. What that buys:
 * the pill and the info-column line are two texts for one outcome, and a table
 * is the only way to see at a glance that no cell says "won" beside an outcome
 * of `lost`, or leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import { buildTerminalMessage } from './terminal'

/** The defaults every case overrides a field or two of: 47 of 50 points is
 *  rank 5 (Amazing), and the target is rank 6 (Genius). */
const base = {
  reason: 'ended',
  winnerId: null as string | null,
  winner: undefined as { username: string; color: string } | undefined,
  targetRankIdx: 6 as number | null,
  foundWordsScore: 47,
  requiredWordsScore: 50,
  selfRankIdx: 5,
  selfId: 'u1',
}

const alice = { username: 'alice', color: 'blue' }

describe('coop', () => {
  it('a win names the rank the team set out for, not the one it reached', () => {
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'won' })).toEqual({
      pillText: 'Won: "Genius" 47/50 points',
      infoColText: 'You won!',
      outcome: 'won',
    })
  })

  it('a loss is the clock beating an unreached target', () => {
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost', reason: 'timeout' })).toEqual({
      pillText: 'Lost: ran out of time',
      infoColText: 'Out of time',
      outcome: 'lost',
    })
  })

  it('an ending is neutral and names the rank reached, whatever it is', () => {
    for (const reason of ['timeout', 'manual', 'ended']) {
      expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'ended', reason, targetRankIdx: null }))
        .toEqual({ pillText: 'Ended: Amazing 47/50 points', infoColText: 'Amazing', outcome: 'neutral' })
    }
  })
})

describe('compete', () => {
  it('my win names the target rank', () => {
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', winnerId: 'u1' }))
      .toEqual({ pillText: 'Won: "Genius" 47/50 points', infoColText: 'You won!', outcome: 'won' })
  })

  it('being beaten names the winner, as the message\'s actor', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', winnerId: 'u2', winner: alice }),
    ).toEqual({ pillText: 'won at "Genius"', infoColText: 'alice won', outcome: 'lost', actor: alice })
    // A winner the roster does not know still reads as a sentence.
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', winnerId: 'u2' }).infoColText,
    ).toBe('a player won')
  })

  it('the two collective losses are told apart by the reason', () => {
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'conceded' }))
      .toEqual({ pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' })
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'timeout' }))
      .toEqual({ pillText: 'Lost: ran out of time', infoColText: 'Out of time', outcome: 'lost' })
  })

  it('a manual end is the shared neutral sentence', () => {
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'ended', reason: 'manual' }))
      .toEqual({ pillText: 'Game ended — no winner', infoColText: 'Game over', outcome: 'neutral' })
  })
})

describe('the whole table', () => {
  it('no cell says won beside a losing outcome, and every text is filled', () => {
    const cells = [
      { mode: 'coop', playState: 'won', reason: 'target' },
      { mode: 'coop', playState: 'lost', reason: 'timeout' },
      { mode: 'coop', playState: 'ended', reason: 'manual' },
      { mode: 'compete', playState: 'won_compete', reason: 'target', winnerId: 'u1' },
      { mode: 'compete', playState: 'won_compete', reason: 'target', winnerId: 'u2', winner: alice },
      { mode: 'compete', playState: 'lost_compete', reason: 'conceded' },
      { mode: 'compete', playState: 'lost_compete', reason: 'timeout' },
      { mode: 'compete', playState: 'ended', reason: 'manual' },
    ] as const
    for (const cell of cells) {
      const m = buildTerminalMessage({ ...base, ...cell })
      expect(m.pillText).not.toBe('')
      expect(m.infoColText).not.toBe('')
      if (m.pillText.startsWith('Won') || m.infoColText === 'You won!') expect(m.outcome).toBe('won')
      if (m.pillText.startsWith('Lost')) expect(m.outcome).toBe('lost')
    }
  })
})
