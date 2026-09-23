// cs-met-codenamesduet

import { describe, expect, it } from 'vitest'
import { seatPlayers } from './seats'

const players = [
  { user_id: 'bea', username: 'bea', color: 'blue' },
  { user_id: 'ada', username: 'ada', color: 'red' },
]

describe('seatPlayers', () => {
  it('seats the row’s A and B ids, A first, whatever order the shell lists them in', () => {
    expect(seatPlayers({ user_a_id: 'ada', user_b_id: 'bea' }, players)).toEqual([
      { user_id: 'ada', username: 'ada', color: 'red', seat: 'A' },
      { user_id: 'bea', username: 'bea', color: 'blue', seat: 'B' },
    ])
  })

  it('is null when a seat’s id is not among the shell’s players', () => {
    expect(seatPlayers({ user_a_id: 'ada', user_b_id: 'dee' }, players)).toBeNull()
    expect(seatPlayers({ user_a_id: 'dee', user_b_id: 'bea' }, players)).toBeNull()
  })
})
