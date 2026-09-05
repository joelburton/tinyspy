// cs-unmet

/**
 * WHO IS PLAYING (see PlayersSection.tsx) — the picker as a setup section, and
 * the two things it decides on the caller's behalf.
 *
 * It counts, and it disappears. Both are the kind of rule that looks fine
 * either way on screen: a club of one shows a picker with a single locked row,
 * and a count complaint that never fires looks exactly like a form with nothing
 * wrong.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlayersSection } from './PlayersSection'
import { errorUnder } from '../fields/errorUnder'
import type { Member } from '../members/member'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
  { user_id: 'leah', username: 'leah', color: 'green' },
] as Member[]

function draw(
  value: Set<string>,
  numberOfPlayers: [number, number] = [2, 4],
  extra: { members?: Member[]; error?: string } = {},
) {
  return render(
    <PlayersSection
      members={extra.members ?? MEMBERS}
      selfId="self"
      value={value}
      onChange={() => {}}
      numberOfPlayers={numberOfPlayers}
      error={extra.error}
    />,
  )
}

describe('PlayersSection — the count', () => {
  it('says nothing when the count fits', () => {
    draw(new Set(['self', 'moth']))
    expect(errorUnder('player_user_ids')).toBeNull()
  })

  it('complains when there are too few, naming the minimum', () => {
    draw(new Set(['self']), [3, 4])
    expect(errorUnder('player_user_ids')).toContain('3')
  })

  it('complains when there are too many, naming the maximum', () => {
    draw(new Set(['self', 'moth', 'leah']), [1, 2])
    expect(errorUnder('player_user_ids')).toContain('2')
  })

  it('says "player", not "players", when exactly one is wanted', () => {
    // A count message that gets its own grammar wrong is the sort of thing
    // nobody reports and everybody notices.
    draw(new Set([]), [1, 4])
    expect(errorUnder('player_user_ids')).toBe('Pick at least 1 player.')
  })
})

describe('PlayersSection — whose message wins', () => {
  it('shows the server’s over its own count complaint', () => {
    // The server saw the real roster; this component only counted. When both
    // have something to say, the one that knows more says it.
    draw(new Set(['self']), [3, 4], { error: 'moth is not in this club.' })
    expect(errorUnder('player_user_ids')).toBe('moth is not in this club.')
  })
})

describe('PlayersSection — a solo club', () => {
  it('draws nothing at all, rather than a picker with one locked row', () => {
    const { container } = draw(new Set(['self']), [1, 4], { members: [MEMBERS[0]!] })
    expect(container).toBeEmptyDOMElement()
  })

  it('still draws for two, where there is something to choose', () => {
    draw(new Set(['self', 'moth']), [1, 4], { members: MEMBERS.slice(0, 2) })
    expect(screen.getByText(/Players:/)).toBeInTheDocument()
  })
})
