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
    const evs = [ev('played', 'adg'), ev('played', 'gjb'), ev('played', 'beh')]
    expect(historyChainAt(evs, 0)).toEqual(['adg'])
    expect(historyChainAt(evs, 1)).toEqual(['adg', 'gjb'])
    expect(historyChainAt(evs, 2)).toEqual(['adg', 'gjb', 'beh'])
  })

  it('a retreat SHRINKS the chain — the reason the log records it at all', () => {
    const evs = [ev('played', 'adg'), ev('played', 'gjb'), ev('undone', 'gjb')]
    expect(historyChainAt(evs, 1)).toEqual(['adg', 'gjb'])
    expect(historyChainAt(evs, 2)).toEqual(['adg'])
  })

  it('a clear empties it', () => {
    const evs = [ev('played', 'adg'), ev('played', 'gjb'), ev('cleared', null)]
    expect(historyChainAt(evs, 2)).toEqual([])
  })

  it('help does not move the chain', () => {
    const evs = [ev('played', 'adg'), ev('hint', 'gjb'), ev('spoiler', 'gjb')]
    expect(historyChainAt(evs, 2)).toEqual(['adg'])
  })

  it('clamps past the end rather than throwing', () => {
    expect(historyChainAt([ev('played', 'adg')], 99)).toEqual(['adg'])
    expect(historyChainAt([], 0)).toEqual([])
  })
})

describe('historyLabelAt', () => {
  it('names each kind', () => {
    const evs = [ev('played', 'adg'), ev('undone', 'adg'), ev('cleared', null), ev('spoiler', 'kcfil')]
    expect(historyLabelAt(evs, 0)).toBe('Played ADG')
    expect(historyLabelAt(evs, 1)).toBe('Took back ADG')
    expect(historyLabelAt(evs, 2)).toBe('Started the chain over')
    expect(historyLabelAt(evs, 3)).toBe('Was shown KCFIL')
  })
  it('is null off the end', () => {
    expect(historyLabelAt([], 0)).toBeNull()
  })
})
