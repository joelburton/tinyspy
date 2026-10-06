// cs-unmet

import { describe, expect, it } from 'vitest'
import { livePicks, toggleTile } from './picks'
import { paletteOf } from './setup'
import type { GTile } from '../types'

const tile = (id: string): GTile => ({ id })
const byId = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, tile(id)]))

describe('toggleTile', () => {
  it('adds a tile that is not picked', () => {
    expect(toggleTile([], tile('1111'))).toEqual(['1111'])
    expect(toggleTile(['1111'], tile('2222'))).toEqual(['1111', '2222'])
  })

  it('removes a tile that is already picked', () => {
    expect(toggleTile(['1111', '2222'], tile('1111'))).toEqual(['2222'])
    expect(toggleTile(['1111'], tile('1111'))).toEqual([])
  })

  it('refuses a fourth tile', () => {
    expect(toggleTile(['1111', '1112', '1113'], tile('1121'))).toEqual(['1111', '1112', '1113'])
  })

  it('still un-picks when three are held', () => {
    // Otherwise a mis-click on the third tile would be unrecoverable except by
    // clearing all the picks.
    expect(toggleTile(['1111', '1112', '1113'], tile('1112'))).toEqual(['1111', '1113'])
  })
})

describe('livePicks', () => {
  it('hands back the board\'s own tiles for the picks still on it', () => {
    const board = byId('1111', '1112', '1113', '1121')
    const live = livePicks(['1112', '1113'], board)
    expect(live).toEqual([board['1112'], board['1113']])
    expect(live[0]).toBe(board['1112'])
  })

  it('drops a tile a rival claimed out from under the picks', () => {
    // The contention case. The tile is gone from the board, so it is gone from
    // the picks — no stale highlight, and no claim fired at a tile that
    // isn't there.
    expect(livePicks(['1112', '1113'], byId('1111', '1113', '1121')).map((t) => t.id)).toEqual(['1113'])
  })

  it('empties when every pick is taken', () => {
    expect(livePicks(['1112', '1113'], byId('3333'))).toEqual([])
  })

  it('leaves no picks alone', () => {
    expect(livePicks([], byId('1111'))).toEqual([])
  })
})

describe('paletteOf', () => {
  it('defaults a game with no palette to traditional', () => {
    // `setup` is frozen at create time, so every game started before the knob
    // existed has no key — and indexing a lookup table by `undefined` is what
    // crashed the printer the first time it drew a tile.
    expect(paletteOf(undefined)).toBe('traditional')
    expect(paletteOf({})).toBe('traditional')
    expect(paletteOf({ palette: 'traditional' })).toBe('traditional')
    expect(paletteOf({ palette: 'colorblind' })).toBe('colorblind')
  })
})
