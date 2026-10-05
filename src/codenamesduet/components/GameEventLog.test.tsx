// cs-blessed-codenamesduet

/**
 * Tests for GameEventLog. A presentational component — it reads `gd.events`
 * and renders the shared <EventLog> table. No supabase mocking; `gd` is built
 * from the fixture's facts.
 *
 * Each turn renders as TWO `<tr>`s (codenamesduet's own row markup — a clue row
 * + a guess row, with the shared `<EventLogOutcomeBar>` rowSpanning both): row 1 is
 * `# | clue | clue-giver` columns, row 2 spans the turn's guess line. So N turns
 * => 2N rows in DOM order, clue row then guess row.
 *
 * What matters here:
 *   1. Empty-state: the shared EventLog shows its "No clues yet." placeholder.
 *   2. Per-turn grouping: each turn's clue (row 1) lines up with the guesses made
 *      that turn (row 2), oldest turn first.
 *   3. Guess order: within a turn, guesses show in the order given — the events
 *      arrive `order by id` and the log keeps it.
 *   4. A guess-less turn reads "(clue given)" while it's the current, live turn,
 *      and "(no guesses)" once it's ended (or the game is over).
 *   5. The per-turn outcome verdict — tested on the pure `turnOutcome` helper.
 *   6. Sudden death: each guess past the budget is its own row, "Sudden death:
 *      WORD", filed under its guesser.
 *   7. The history link: a turn's clue id and the `#N` printed, renumbered by a
 *      filter.
 *
 * NOT covered: the color hookup (the key-card color on guessed words, and the
 * outcome bar). Under Vitest a CSS module is a proxy that names any key it is
 * asked for, so asserting a specific variant class proves nothing. The word/clue presence + text is asserted in the DOM;
 * the outcome-bar mapping is verified via `turnOutcome` directly; the colors
 * themselves are a visual contract checked in the browser.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameEventLog } from './GameEventLog'
import { makeGameData } from '../hooks/useGame'
import { cluesOf, guessesOf } from '../lib/events'
import {
  ZTest_clue,
  ZTest_guess,
  ZTest_makeGameDataRaw,
} from '../lib/gameData.fixture'
import type { GEventRaw, GHistoryView, GKey } from '../types'
import { filterOptions, pickFilter } from '@/common/lists/filterSelectHelpers'

// The two players, ada (seat A, the viewer) and bea.
const PLAYERS: [
  { id: string; username: string }, {
    id: string;
    username: string
  }] = [
  { id: 'ada', username: 'ada' },
  { id: 'bea', username: 'bea' },
]
// The words the guesses below turn over, by position.
const WORDS = ['STEEL', 'HAMMER', 'COFFEE', 'FIRST', 'LATER', ...Array.from({ length: 20 },
  (_, i) => `W${i}`)]
const at = (word: string) => WORDS.indexOf(word)

const clue = (id: number, by: string, turnNum: number, word: string, count = 2, fromAi = false) =>
  ZTest_clue(id, by, turnNum, word, count, fromAi)
const guess = (id: number, by: string, turnNum: number, word: string, result: GKey = 'G') =>
  ZTest_guess(id, by, turnNum, at(word), result)

/** A history view with nothing open; `show` is what a `#N` click calls. */
function historyView(show: GHistoryView['show'] = () => {
}): GHistoryView {
  return {
    isViewing: false, viewedEventId: null, show, exit: () => {
    }, tiles: null, litTileIds: new Set(), label: null,
  }
}

/** Each turn is two <tr>s (clue row + guess row); the empty/heading chrome is not
 *  a row, so role 'row' returns exactly the turn items, in DOM order. */
const turnRows = () => screen.getAllByRole('row')

/** Render the log of a game with these events. `turnNum: 99` is a turn no
 *  event uses, so a guess-less turn reads "(no guesses)" unless a test opts
 *  into the live-turn case explicitly. */
function renderLog(o: {
  events: GEventRaw[];
  turnNum?: number;
  ended?: boolean;
  show?: GHistoryView['show']
}) {
  const gd = makeGameData(
    ZTest_makeGameDataRaw({
      players: PLAYERS,
      words: WORDS,
      events: o.events,
      turnNum: o.turnNum ?? 99,
      clueSeat: null,
      ...(o.ended ? {
        ending: {
          reason: 'stopped',
          detail: 'stopped',
          by: 'ada',
          winner: null,
        }, outcome: 'neutral',
      } : {}),
    }),
    'ada',
  )
  return render(
    <GameEventLog
      clues={cluesOf(gd.events)}
      guesses={guessesOf(gd.events, gd.puzzle.tilesById)}
      players={gd.players}
      myId={gd.me.id}
      turnNum={gd.turns.num}
      isGameEnded={gd.ended}
      historyView={historyView(o.show)}
    />,
  )
}

describe('GameEventLog', () => {
  it('shows the empty placeholder when there are no clues', () => {
    renderLog({ events: [] })
    expect(screen.getByText('No clues yet.')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(0)
  })

  it(
    'groups guesses under the turn whose clue they belong to, oldest turn first',
    () => {
      renderLog({
        events: [
          clue(1, 'ada', 1, 'TOOLS', 2),
          guess(2, 'bea', 1, 'HAMMER'),
          clue(3, 'bea', 2, 'DRINK', 1),
          guess(4, 'ada', 2, 'COFFEE', 'N'),
        ],
      })

      // Two turns => four rows: [t1 clue, t1 guesses, t2 clue, t2 guesses].
      const rows = turnRows()
      expect(rows).toHaveLength(4)

      // Turn 1 (oldest) first: clue row carries #1 / TOOLS / the clue-giver (ada
      // via ActorDot); its guess row carries HAMMER.
      expect(rows[0]).toHaveTextContent('#1')
      expect(rows[0]).toHaveTextContent('TOOLS')
      expect(rows[0]).toHaveTextContent('ada')
      expect(within(rows[1]!).getByText('HAMMER',
        { exact: false })).toBeInTheDocument()

      // Turn 2 next.
      expect(rows[2]).toHaveTextContent('#2')
      expect(rows[2]).toHaveTextContent('DRINK')
      expect(rows[2]).toHaveTextContent('bea')
      expect(within(rows[3]!).getByText('COFFEE',
        { exact: false })).toBeInTheDocument()
    })

  it('shows a turn\'s guesses in the order given', () => {
    renderLog({
      events: [clue(1, 'ada', 1, 'BREAD'), guess(2,
        'bea',
        1,
        'FIRST'), guess(3, 'bea', 1, 'LATER')],
    })

    // Guesses live in the turn's SECOND row.
    const text = turnRows()[1]!.textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('reads "(clue given)" for the current, still-live turn with no guesses yet',
    () => {
      renderLog({ events: [clue(1, 'ada', 3, 'WAIT', 1)], turnNum: 3 })
      expect(screen.getByText('(clue given)')).toBeInTheDocument()
      expect(screen.queryByText('(no guesses)')).not.toBeInTheDocument()
    })

  it('reads "(no guesses)" once a guess-less turn has ended (no longer current)',
    () => {
      renderLog({ events: [clue(1, 'ada', 1, 'PASS', 1)], turnNum: 2 })
      expect(screen.getByText('(no guesses)')).toBeInTheDocument()
      expect(screen.queryByText('(clue given)')).not.toBeInTheDocument()
    })

  it('marks a clue given exactly as the AI suggested it, and no other', () => {
    renderLog({
      events: [clue(1, 'ada', 1, 'BREAD'), clue(2,
        'bea',
        2,
        'BREAD',
        2,
        true)],
    })

    const rows = turnRows()
    expect(rows[0]!.querySelector('[data-tooltip="AI clue"]')).toBeNull()
    expect(rows[2]!.querySelector('[data-tooltip="AI clue"]')).not.toBeNull()
  })

  it('reads "(no guesses)" for a guess-less current turn once the game is over',
    () => {
      renderLog({
        events: [clue(1, 'ada', 4, 'DONE', 1)],
        turnNum: 4,
        ended: true,
      })
      expect(screen.getByText('(no guesses)')).toBeInTheDocument()
    })
})

/**
 * The shared "whose turns?" picker. duet is coop-only, so the list
 * is Team + both players — and a turn is filed under its **clue-giver**, since
 * that's the person the row's actor column names. See the component docstring.
 */
describe('GameEventLog — the clue-giver picker', () => {
  const events = [clue(1, 'ada', 1, 'MINE'), clue(2, 'bea', 2, 'THEIRS')]

  it('lists Team plus both players by handle, and defaults to Team',
    async () => {
      renderLog({ events })
      expect(await filterOptions()).toEqual([
        'Team',
        'ada',
        'bea',
      ])
      // Team is the shared game — both turns on show.
      expect(screen.getByText('MINE')).toBeInTheDocument()
      expect(screen.getByText('THEIRS')).toBeInTheDocument()
    })

  it('narrows to the turns that player CLUED', async () => {
    renderLog({ events })
    await pickFilter('bea')
    expect(screen.queryByText('MINE')).not.toBeInTheDocument()
    expect(screen.getByText('THEIRS')).toBeInTheDocument()
  })

  it('says the log is empty (not hidden) when a player has clued nothing',
    async () => {
      renderLog({ events: [events[0]!] })
      await pickFilter('bea')
      // Coop hides nothing, so the honest line is the plain empty one.
      expect(screen.getByText('No clues yet.')).toBeInTheDocument()
    })
})

/**
 * Sudden death: every guess past the budget (9 here) is a turn of its own, made
 * by either player, with no clue.
 */
describe('GameEventLog — sudden death', () => {
  const events = [
    clue(1, 'ada', 9, 'LAST'),
    guess(2, 'ada', 10, 'STEEL'),
    guess(3, 'bea', 11, 'COFFEE', 'N'),
  ]

  it(
    'draws each guess as one row — "Sudden death: WORD", the guesser in the actor column',
    () => {
      renderLog({ events })
      const rows = turnRows()
      // The clue's two rows, then one row per sudden-death guess.
      expect(rows).toHaveLength(4)
      expect(rows[2]).toHaveTextContent('Sudden death: STEEL')
      expect(rows[2]).toHaveTextContent('ada')
      expect(rows[3]).toHaveTextContent('Sudden death: COFFEE')
      expect(rows[3]).toHaveTextContent('bea')
    })

  it('files each sudden-death row under its guesser', async () => {
    renderLog({ events })
    await pickFilter('bea')
    expect(screen.queryByText('STEEL')).not.toBeInTheDocument()
    expect(screen.getByText('COFFEE')).toBeInTheDocument()
  })
})

/**
 * The history link: a turn is LINKED by an event id — its clue's, or a
 * sudden-death guess's — and the `#N` it prints is its place in what is shown.
 */
describe('GameEventLog — the history link', () => {
  it('hands up the clue\'s id and the number printed, which a filter renumbers',
    async () => {
      const show = vi.fn()
      renderLog({
        events: [clue(7, 'ada', 1, 'MINE'), clue(12,
          'bea',
          2,
          'THEIRS')], show,
      })
      await pickFilter('bea')
      fireEvent.click(screen.getByText('#1'))
      expect(show).toHaveBeenCalledWith(12, 1)
    })
})
