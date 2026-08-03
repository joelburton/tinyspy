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
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Member } from '../../common/lib/games'
import type { PlayRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'

const PLAYERS: Member[] = [
  { user_id: 'u1', username: 'ada', color: 'red' },
  { user_id: 'u2', username: 'bea', color: 'blue' },
]
const AI: Member[] = [{ user_id: 'ai:2', username: 'AI 1', color: 'green' }]

const play = (o: Partial<PlayRow>): PlayRow => ({
  user_id: 'u1',
  seat: 0,
  seq: 1,
  kind: 'word',
  placements: null,
  words: ['QUARTZ'],
  score: 30,
  tile_count: null,
  played_at: '2026-08-02T18:00:00Z',
  ...o,
})

const PLAYS: PlayRow[] = [
  play({ seq: 1, user_id: 'u1', seat: 0, words: ['ADAWORD'] }),
  play({ seq: 2, user_id: 'u2', seat: 1, words: ['BEAWORD'] }),
  // A bot's play — no user_id at all, attributed by seat.
  play({ seq: 3, user_id: null, seat: 2, words: ['BOTWORD'] }),
]

function renderLog(mode: 'coop' | 'compete' = 'compete') {
  return render(
    <GameTurnLog
      plays={PLAYS}
      players={PLAYERS}
      aiMembers={mode === 'compete' ? AI : []}
      aiMemberOfSeat={(seat) => (seat === 2 ? AI[0] : undefined)}
      selfId="u1"
      mode={mode}
      viewingSeq={null}
      onSelectTurn={() => {}}
    />,
  )
}

const options = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('scrabble GameTurnLog — the whose-moves picker', () => {
  it('lists the bot alongside the humans, viewer first', () => {
    renderLog()
    // Viewer first, then everyone else by handle — the bot takes its alphabetical
    // place rather than being segregated, because it plays like anyone else.
    expect(options()).toEqual(['All', 'ada', 'AI 1', 'bea'])
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
    const user = userEvent.setup()
    renderLog()
    await user.selectOptions(screen.getByRole('combobox'), 'u2')
    expect(screen.getByText('BEAWORD')).toBeInTheDocument()
    expect(screen.queryByText('ADAWORD')).not.toBeInTheDocument()
    expect(screen.queryByText('BOTWORD')).not.toBeInTheDocument()
  })

  it('narrows to the BOT’s plays — the `ai:<seat>` key, since user_id is null', async () => {
    const user = userEvent.setup()
    renderLog()
    await user.selectOptions(screen.getByRole('combobox'), 'ai:2')
    expect(screen.getByText('BOTWORD')).toBeInTheDocument()
    expect(screen.queryByText('ADAWORD')).not.toBeInTheDocument()
  })

  it('coop lists Team and no bot — the AI opponent is compete-only', () => {
    renderLog('coop')
    expect(options()).toEqual(['Team', 'ada', 'bea'])
  })

  it('never says a filtered-empty log is "hidden" — every play is public here', async () => {
    const user = userEvent.setup()
    render(
      <GameTurnLog
        plays={[PLAYS[0]]}
        players={PLAYERS}
        aiMembers={AI}
        aiMemberOfSeat={() => AI[0]}
        selfId="u1"
        mode="compete"
        viewingSeq={null}
        onSelectTurn={() => {}}
      />,
    )
    await user.selectOptions(screen.getByRole('combobox'), 'u2')
    expect(screen.getByText('No moves yet.')).toBeInTheDocument()
  })
})
