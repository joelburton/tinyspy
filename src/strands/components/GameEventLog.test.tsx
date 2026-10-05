// cs-unmet

/**
 * Tests for strands' GameEventLog — a pure presentational component (props in,
 * the shared `<EventLog>` table out; no supabase mocking).
 *
 * The reason this file exists is the **hint row**. `strands.events` holds two
 * kinds of row, and only one of them is a guess: a spent hint has no word and
 * no verdict. Everything about how it renders is a deliberate choice that this
 * pins — that it appears at all, that it takes an ordinary numbered position in
 * the sequence (which is what the history viewer indexes by), and that it says
 * "Hint used" rather than leaving the word slot blank.
 *
 * NOT covered: the per-outcome colors and the glyph. With CSS Modules the class
 * names are hashed and Vitest runs with `css: false`, so asserting a variant
 * class is meaningless; the bar color and the lightbulb are a visual contract
 * checked in the browser.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameEventLog } from './GameEventLog'
import { makeGameData } from '../hooks/useGame'
import { ZTest_find, ZTest_hint, ZTest_makeGameDataRaw, ZTest_rowIds } from '../lib/gameData.fixture'
import type { GEventRaw, GHistoryView } from '../types'

/** The log's rows and players, as `gd` hands them over. */
function renderLog(rows: GEventRaw[], show = vi.fn()) {
  const gd = makeGameData(ZTest_makeGameDataRaw({ events: rows }), 'u1')
  const historyView = {
    isViewing: false, viewedEventId: null, show, exit: vi.fn(),
    board: null, litTiles: [], label: null, actor: undefined,
  } satisfies GHistoryView
  render(
    <GameEventLog
      events={gd.events}
      players={gd.players}
      myId="u1"
      mode="coop"
      isGameEnded={false}
      historyView={historyView}
    />,
  )
  return { show }
}

describe('GameEventLog — a spent hint', () => {
  it('renders as its own row, saying what happened without naming a word', () => {
    renderLog([ZTest_find(1, 'u1', 0), ZTest_hint(2, 'u1', ZTest_rowIds(2))])
    expect(screen.getByText('Hint used')).toBeInTheDocument()
    // The word slot is the one thing a hint cannot fill — and the row must not
    // borrow a neighboring word to fill it.
    expect(screen.getAllByText(/zzqabc/)).toHaveLength(1)
  })

  it('takes an ordinary numbered position in the sequence', () => {
    // Load-bearing, not cosmetic: a hint that skipped a number (or rendered as
    // an un-numbered interstitial) would misnumber every later turn.
    renderLog([ZTest_find(1, 'u1', 0), ZTest_hint(2, 'u1', ZTest_rowIds(2)), ZTest_find(3, 'u1', 4)])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('#1')).toBeInTheDocument()
    expect(within(rows[1]).getByText('#2')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Hint used')).toBeInTheDocument()
    expect(within(rows[2]).getByText('#3')).toBeInTheDocument()
  })

  it('is a live history handle, like every other turn', () => {
    // A hint turn is worth replaying — that is what its stored tiles are FOR.
    const { show } = renderLog([ZTest_find(1, 'u1', 0), ZTest_hint(7, 'u1', ZTest_rowIds(2))])
    const rows = screen.getAllByRole('row')
    within(rows[1]!).getByText('#2').click()
    // The NUMBER is the row's place in the list on show; the HANDLE is its own
    // id. #2 is the hint, and what it opens is the hint's row — and the number
    // rides along, because the banner shows back what was clicked.
    expect(show).toHaveBeenCalledWith(7, 2)
  })

  it('still counts as a turn for the empty state', () => {
    renderLog([])
    expect(screen.getByText('No turns yet.')).toBeInTheDocument()
  })
})
