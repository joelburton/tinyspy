// cs-unmet

import { describe, expect, it } from 'vitest'
import { historyChainAt, historyLabelAt } from './history'
import type { EventRow } from '../hooks/useGame'

let n = 0
const ev = (kind: EventRow['kind'], word: string | null): EventRow => ({
  id: ++n, game_id: 'g', user_id: 'u', kind, word, letters_covered: 0,
  created_at: '2026-08-05T00:00:00Z',
})

describe('historyChainAt', () => {
  it('replays plays in order, inclusive of the viewed move', () => {
    const evs = [ev('word', 'adg'), ev('word', 'gjb'), ev('word', 'beh')]
    expect(historyChainAt(evs, evs[0].id)).toEqual(['adg'])
    expect(historyChainAt(evs, evs[1].id)).toEqual(['adg', 'gjb'])
    expect(historyChainAt(evs, evs[2].id)).toEqual(['adg', 'gjb', 'beh'])
  })

  it('a retreat SHRINKS the chain — the reason the log records it at all', () => {
    const evs = [ev('word', 'adg'), ev('word', 'gjb'), ev('undo', 'gjb')]
    expect(historyChainAt(evs, evs[1].id)).toEqual(['adg', 'gjb'])
    expect(historyChainAt(evs, evs[2].id)).toEqual(['adg'])
  })

  it('a clear empties it', () => {
    const evs = [ev('word', 'adg'), ev('word', 'gjb'), ev('clear', null)]
    expect(historyChainAt(evs, evs[2].id)).toEqual([])
  })

  it('a hint or spoiler does not move the chain', () => {
    const evs = [ev('word', 'adg'), ev('hint', 'gjb'), ev('spoiler', 'gjb')]
    expect(historyChainAt(evs, evs[2].id)).toEqual(['adg'])
  })

  it('an id this list does not hold replays nothing', () => {
    // The compete case: a row of somebody else's chain is not a row of yours.
    expect(historyChainAt([ev('word', 'adg')], 9999)).toEqual([])
    expect(historyChainAt([], 1)).toEqual([])
  })
})

describe('historyLabelAt', () => {
  it('names each kind', () => {
    const evs = [ev('word', 'adg'), ev('undo', 'adg'), ev('clear', null), ev('spoiler', 'kcfil')]
    expect(historyLabelAt(evs, evs[0].id)).toBe('Played ADG')
    expect(historyLabelAt(evs, evs[1].id)).toBe('Took back ADG')
    expect(historyLabelAt(evs, evs[2].id)).toBe('Started the chain over')
    expect(historyLabelAt(evs, evs[3].id)).toBe('Was shown KCFIL')
  })
  it('is null off the end', () => {
    expect(historyLabelAt([], 0)).toBeNull()
  })
})
