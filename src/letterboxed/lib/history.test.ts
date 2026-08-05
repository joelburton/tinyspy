import { describe, expect, it } from 'vitest'
import { chainAt, describeAt } from './history'
import type { EventRow } from '../hooks/useGame'

let n = 0
const ev = (kind: EventRow['kind'], word: string | null): EventRow => ({
  id: ++n, game_id: 'g', user_id: 'u', kind, word, letters_covered: 0,
  created_at: '2026-08-05T00:00:00Z',
})

describe('chainAt', () => {
  it('replays plays in order, inclusive of the viewed move', () => {
    const evs = [ev('played', 'adg'), ev('played', 'gjb'), ev('played', 'beh')]
    expect(chainAt(evs, 0)).toEqual(['adg'])
    expect(chainAt(evs, 1)).toEqual(['adg', 'gjb'])
    expect(chainAt(evs, 2)).toEqual(['adg', 'gjb', 'beh'])
  })

  it('a retreat SHRINKS the chain — the reason the log records it at all', () => {
    const evs = [ev('played', 'adg'), ev('played', 'gjb'), ev('undone', 'gjb')]
    expect(chainAt(evs, 1)).toEqual(['adg', 'gjb'])
    expect(chainAt(evs, 2)).toEqual(['adg'])
  })

  it('a clear empties it', () => {
    const evs = [ev('played', 'adg'), ev('played', 'gjb'), ev('cleared', null)]
    expect(chainAt(evs, 2)).toEqual([])
  })

  it('help does not move the chain', () => {
    const evs = [ev('played', 'adg'), ev('hint', 'gjb'), ev('spoiler', 'gjb')]
    expect(chainAt(evs, 2)).toEqual(['adg'])
  })

  it('clamps past the end rather than throwing', () => {
    expect(chainAt([ev('played', 'adg')], 99)).toEqual(['adg'])
    expect(chainAt([], 0)).toEqual([])
  })
})

describe('describeAt', () => {
  it('names each kind', () => {
    const evs = [ev('played', 'adg'), ev('undone', 'adg'), ev('cleared', null), ev('spoiler', 'kcfil')]
    expect(describeAt(evs, 0)).toBe('Played ADG')
    expect(describeAt(evs, 1)).toBe('Took back ADG')
    expect(describeAt(evs, 2)).toBe('Started the chain over')
    expect(describeAt(evs, 3)).toBe('Was shown KCFIL')
  })
  it('is null off the end', () => {
    expect(describeAt([], 0)).toBeNull()
  })
})
