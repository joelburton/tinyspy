// cs-unmet

/**
 * Tests for scrabble's move log — specifically the shared "whose moves?" picker
 * (2026-08-02), which scrabble bends in two ways the other games don't:
 *
 *   1. It defaults to the aggregate in BOTH modes. Even compete is one shared
 *      board, so "All" is what you're actually looking at.
 *   2. **A bot is pickable like anyone.** It is an account with a profile and a
 *      `game_players` row, so its plays are its own and it takes its
 *      alphabetical place in the dropdown like anyone else.
 *
 * A pure presentational component — no supabase mocking, just RTL with props
 * built the way `gd` builds them.
 * The definition popover and the `#N` viewer handle are exercised elsewhere.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_leftovers, ZTest_makeGameDataRaw, ZTest_word, type ZTest_PlayerFacts } from '../lib/gameData.fixture'
import type { GEvent, GHistoryView } from '../types'
import { GameEventLog } from './GameEventLog'
import { filterOptions, pickFilter } from '@/common/lists/filterSelectHelpers'

// ada and bea are people, ada-bot is one of the bots. All three are players,
// which is the whole point: a bot is pickable, and nameable, like anyone.
const PLAYERS: ZTest_PlayerFacts[] = [
  { id: 'u1', username: 'ada', color: 'red' },
  { id: 'u2', username: 'bea', color: 'blue' },
  { id: 'bot1', username: 'ada-bot', color: 'brown', aiLevel: 'strong' },
]

const NO_VIEW = { viewedEventId: null, show: () => {} } as unknown as GHistoryView

/** The log's rows and players as `gd` hands them over. */
function makeLog(mode: 'coop' | 'compete', players: ZTest_PlayerFacts[], events = [
  ZTest_word(1, 'u1', ['7,7:a'], ['adaword'], 30),
  ZTest_word(2, 'u2', ['8,7:b'], ['beaword'], 30),
  // A bot's play — its own row, like any other.
  ZTest_word(3, 'bot1', ['9,7:c'], ['botword'], 30),
]) {
  const gd = makeGameData(ZTest_makeGameDataRaw({ mode, players, events: events.filter((e) => players.some((p) => p.id === e.userId)) }), 'u1')
  return { events: gd.events as GEvent[], players: gd.players }
}

function renderLog(mode: 'coop' | 'compete' = 'compete', players: ZTest_PlayerFacts[] = PLAYERS) {
  const log = makeLog(mode, players)
  return render(
    <GameEventLog events={log.events} players={log.players} myId="u1" mode={mode} historyView={NO_VIEW} />,
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

  it('narrows to the BOT’s plays — by its id, like any other player', async () => {
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
    const log = makeLog('compete', PLAYERS, [ZTest_word(1, 'u1', ['7,7:a'], ['adaword'], 30)])
    render(<GameEventLog events={log.events} players={log.players} myId="u1" mode="compete" historyView={NO_VIEW} />)
    await pickFilter('bea')
    expect(screen.getByText('No moves yet.')).toBeInTheDocument()
  })
})

describe('scrabble GameEventLog — the rows an ending writes', () => {
  it('reads a leftovers row as its cost and its tiles', () => {
    const log = makeLog('compete', PLAYERS.slice(0, 2), [ZTest_leftovers(1, 'u1', -7, 3)])
    render(<GameEventLog events={log.events} players={log.players} myId="u1" mode="compete" historyView={NO_VIEW} />)
    expect(screen.getByText('-7 for 3 tiles left')).toBeInTheDocument()
  })
})
