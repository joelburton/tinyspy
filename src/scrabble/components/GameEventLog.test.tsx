// cs-unmet

/**
 * Tests for scrabble's move log — specifically the shared "whose moves?" picker
 * (2026-08-02), which scrabble bends in two ways the other games don't:
 *
 *   1. It defaults to the aggregate in BOTH modes. Even compete is one shared
 *      board, so "All" is what you're actually looking at.
 *   2. **AI seats are pickable people.** A bot's play carries `user_id: null`,
 *      so rows are keyed by a synthetic `ai:<seat>` id.
 *
 * A pure presentational component — no supabase mocking, just RTL with props.
 * The definition popover and the `#N` viewer handle are exercised elsewhere.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Member } from '@/common/members/member'
import type { EventRow } from '../hooks/useGame'
import { GameEventLog } from './GameEventLog'
import { filterOptions, pickFilter } from '@/common/lists/filterSelectHelpers'

// ada and bea are people, ada-bot is one of the three AI opponents. All three
// are on the common roster, which is the whole point: a bot is pickable, and
// nameable, like anyone.
const PLAYERS: Member[] = [
  { user_id: 'u1', username: 'ada', color: 'red' },
  { user_id: 'u2', username: 'bea', color: 'blue' },
  { user_id: 'bot1', username: 'ada-bot', color: 'brown' },
]

const play = (o: Partial<EventRow>): EventRow => ({
  user_id: 'u1',
  seat: 0,
  id: 1,
  kind: 'word',
  placements: null,
  words: ['QUARTZ'],
  score: 30,
  tile_count: null,
  created_at: '2026-08-02T18:00:00Z',
  ...o,
})

const PLAYS: EventRow[] = [
  play({ id: 1, user_id: 'u1', seat: 0, words: ['ADAWORD'] }),
  play({ id: 2, user_id: 'u2', seat: 1, words: ['BEAWORD'] }),
  // A bot's play — attributed to its account, like any other row.
  play({ id: 3, user_id: 'bot1', seat: 2, words: ['BOTWORD'] }),
]

function renderLog(mode: 'coop' | 'compete' = 'compete', players: Member[] = PLAYERS) {
  return render(
    <GameEventLog
      plays={PLAYS}
      players={players}
      selfId="u1"
      mode={mode}
      historyId={null}
      onShowHistory={() => {}}
    />,
  )
}

const options = filterOptions

describe('scrabble GameEventLog — the whose-moves picker', () => {
  it('lists the bot alongside the humans, viewer first', async () => {
    renderLog()
    // Viewer first, then everyone else by handle — the bot takes its alphabetical
    // place rather than being segregated, because it plays like anyone else.
    expect(await options()).toEqual(['All', 'ada', 'ada-bot', 'bea'])
  })

  it('defaults to All even in compete — the board is shared', () => {
    // Every other compete game defaults to your own log, because there each
    // player has their OWN board. scrabble's race is on one board.
    renderLog()
    expect(screen.getByText('ADAWORD')).toBeInTheDocument()
    expect(screen.getByText('BEAWORD')).toBeInTheDocument()
    expect(screen.getByText('BOTWORD')).toBeInTheDocument()
  })

  it('narrows to one human’s plays', async () => {
    renderLog()
    await pickFilter('bea')
    expect(screen.getByText('BEAWORD')).toBeInTheDocument()
    expect(screen.queryByText('ADAWORD')).not.toBeInTheDocument()
    expect(screen.queryByText('BOTWORD')).not.toBeInTheDocument()
  })

  it('narrows to the BOT’s plays — the `ai:<seat>` key, since user_id is null', async () => {
    renderLog()
    await pickFilter('ada-bot')
    expect(screen.getByText('BOTWORD')).toBeInTheDocument()
    expect(screen.queryByText('ADAWORD')).not.toBeInTheDocument()
  })

  it('coop says Team where compete says All', async () => {
    // A coop roster has no bot in it — AI opponents seat only in compete, and
    // create_game refuses them anywhere else (PN081). So the coop case is the
    // humans, and what changes is the aggregate's LABEL.
    renderLog('coop', PLAYERS.slice(0, 2))
    expect(await options()).toEqual(['Team', 'ada', 'bea'])
  })

  it('never says a filtered-empty log is "hidden" — every play is public here', async () => {
    render(
      <GameEventLog
        plays={[PLAYS[0]]}
        players={PLAYERS}
        selfId="u1"
        mode="compete"
        historyId={null}
        onShowHistory={() => {}}
      />,
    )
    await pickFilter('bea')
    expect(screen.getByText('No moves yet.')).toBeInTheDocument()
  })
})
