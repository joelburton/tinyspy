// cs-unmet

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from '../db'
import {
  ZTest_CONCEDED,
  ZTest_makeScrabbleCtx,
  ZTest_word,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

/**
 * scrabble's PLAY SURFACE — the mounted tree, which is the one layer its other
 * suites can't reach. The board's geometry and scoring (`lib/play`), the
 * suggester, the rack order, the staged move, the move's round trip and the
 * endings have their own files, and the pgTAP files own the rules. What none
 * of them see is the WIRING: which control renders in which state, and what a
 * key or a click sends.
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeScrabbleCtx`). Only
 * `db`, the edge functions and the move-preview Broadcast are stubbed.
 */

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))
// The bot's poke is the `scrabble-ai-move` edge function; stubbed so a test can
// see it fire without an edge runtime.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(async () => ({ type: 'ok', data: { result: 'moved', turns: 1 } })),
}))
// The move-preview transport opens a real Broadcast channel; the stub captures
// `onReceive`, so a test can land a teammate's broadcast.
const sm = vi.hoisted(() => ({
  onReceive: null as null | ((p: unknown) => void),
  sendPreview: vi.fn(),
}))
vi.mock('../hooks/useMovePreview', () => ({
  useMovePreview: (opts: { onReceive: (p: unknown) => void }) => {
    sm.onReceive = opts.onReceive
    return { sendPreview: sm.sendPreview }
  },
}))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const edgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }
const BOT: ZTest_PlayerFacts = { id: 'bot', username: 'ada-bot', color: 'brown', aiLevel: 'strong' }

/** A race between me and moth, my turn. */
const RACE: ZTest_GameDataFacts = { mode: 'compete', players: [ME, MOTH] }

/** A coop table that stopped. */
const STOPPED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
  players: [{ ...ME, outcome: 'neutral' }],
}

/** What PlayArea handed `menu.setGameSections`, as the rows the menu draws. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** An `ok` envelope in the shape `runRpc` unwraps. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** What an action says about itself right now. */
const describeOf = (id: string) => getActions().find((b) => b.id === id)?.describe('button')

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
  edgeFn.mockClear()
})

describe('scrabble PlayArea — what it draws', () => {
  it('coop: the 15×15 board, the seven-tile rack, and the team\'s state line twice', () => {
    const { container } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(225)
    expect(container.querySelectorAll('[data-rack-tile]')).toHaveLength(7)
    // The info column's and the mobile status bar's — one is shown at a time,
    // by CSS, which jsdom does not apply.
    expect(screen.getAllByText(/Team score:/)).toHaveLength(2)
    expect(screen.getAllByText(/86 in bag/)).toHaveLength(2)
  })

  it('compete: the score strip and my own rack', () => {
    const { container } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(RACE)} />)
    expect(screen.getByText('Score:')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-rack-tile]')).toHaveLength(7)
  })

  it('compete names the player on the turn, and stops at the end', () => {
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ ...RACE, turnHolderId: 'u2' })} />)
    expect(screen.queryByText(/Your turn/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Turn:/)).toHaveLength(2)
    unmount()

    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({
          ...RACE,
          ending: { reason: 'all_passed', detail: 'blocked', by: 'u2' },
          outcome: 'won',
          players: [{ ...ME, outcome: 'near', finalRanking: 2 }, { ...MOTH, outcome: 'won', finalRanking: 1 }],
        })}
      />,
    )
    expect(screen.queryByText(/Your turn/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Ended · 86 in bag/)).toHaveLength(2)
  })

  it('a coop Stop says it stopped', () => {
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(STOPPED)} />)
    // The pill and the info column's line say the same word.
    expect(screen.getAllByText('Stopped').length).toBeGreaterThan(0)
  })
})

describe('scrabble PlayArea — the bots', () => {
  it('pokes the AI when a bot holds the turn, and not when a person does', () => {
    const facts: ZTest_GameDataFacts = { mode: 'compete', players: [ME, BOT] }
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(facts)} />)
    expect(edgeFn).not.toHaveBeenCalled()
    unmount()

    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ ...facts, turnHolderId: 'bot' })} />)
    expect(edgeFn).toHaveBeenCalledWith('scrabble-ai-move', { game_id: 'g1' })
  })
})

describe('scrabble PlayArea — the board viewer', () => {
  it('opens a past turn from the log, and exits on ✕', async () => {
    const user = userEvent.setup()
    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({ events: [ZTest_word(1, 'u1', ['7,7:c', '8,7:a', '9,7:t'], ['cat'], 10)] })}
      />,
    )
    // The number, not the word: a click on the word defines it.
    await user.click(screen.getByText('#1'))
    expect(screen.getByText('#1 me: +10 CAT')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Exit history'))
    expect(screen.queryByText('#1 me: +10 CAT')).not.toBeInTheDocument()
  })

  it("opens a teammate's preview, and exits on ✕", async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ players: [ME, MOTH], version: 3 })} />)
    act(() => sm.onReceive!({
      placements: [{ x: 7, y: 7, letter: 'a', blank: false }, { x: 8, y: 7, letter: 'b', blank: false }],
      byId: 'u2',
      baseVersion: 3,
      words: ['ab'],
      score: 5,
    }))
    expect(screen.getByText(/moth showing: \+5 AB/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Exit history'))
    expect(screen.queryByText(/showing:/)).not.toBeInTheDocument()
  })

  it('ignores a preview my board has moved on from', () => {
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ players: [ME, MOTH], version: 5 })} />)
    act(() => sm.onReceive!({
      placements: [{ x: 7, y: 7, letter: 'a', blank: false }],
      byId: 'u2',
      baseVersion: 2,
      words: [],
      score: 0,
    }))
    expect(screen.queryByText(/showing:/)).not.toBeInTheDocument()
  })
})

describe('scrabble PlayArea — the strip', () => {
  it('marks an opponent who conceded, beside their score (mid-game)', () => {
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ ...RACE, players: [ME, { ...MOTH, ...ZTest_CONCEDED }] })} />)
    expect(screen.getByText('0 (conceded)')).toBeInTheDocument()
  })

  it('tells conceded, lost and won apart at the end', () => {
    const CADE: ZTest_PlayerFacts = { id: 'u3', username: 'cade', color: 'green' }
    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({
          mode: 'compete',
          events: [
            ZTest_word(1, 'u1', ['7,7:a', '8,7:t'], ['at'], 5),
            ZTest_word(2, 'u2', ['9,7:s'], ['ats'], 12),
            ZTest_word(3, 'u3', ['7,8:a'], ['aa'], 40),
          ],
          ending: { reason: 'all_passed', detail: 'blocked', by: 'u3' },
          outcome: 'won',
          players: [
            { ...ME, outcome: 'near', finalRanking: 2 },
            { ...MOTH, ...ZTest_CONCEDED },
            { ...CADE, outcome: 'won', finalRanking: 1 },
          ],
        })}
      />,
    )
    expect(screen.getByText('5 (2nd)')).toBeInTheDocument()
    expect(screen.getByText('12 (conceded)')).toBeInTheDocument()
    expect(screen.getByText('40 (won)')).toBeInTheDocument()
  })
})

describe('scrabble PlayArea — the ending', () => {
  /** A coop table that went out: every tile played. */
  const WENT_OUT: ZTest_GameDataFacts = {
    ending: { reason: 'resource_exhausted', detail: 'complete', by: 'u1' },
    outcome: 'won',
    players: [{ ...ME, outcome: 'won', finalRanking: 1 }],
  }

  it('coop: every tile played wins, in the won frame', () => {
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(WENT_OUT)} />)
    expect(screen.getByText('Won (every tile played)')).toBeInTheDocument()
    expect(document.querySelector('[class*="endingFrame_won"]')).not.toBeNull()
  })

  it('coop: the timer with tiles left over is no result', () => {
    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({
          ending: { reason: 'timeout', detail: 'timeout', by: null },
          outcome: 'neutral',
          players: [{ ...ME, outcome: 'neutral' }],
        })}
      />,
    )
    expect(screen.getByText('Ended (out of time)')).toBeInTheDocument()
    expect(document.querySelector('[class*="endingFrame_neutral"]')).not.toBeNull()
  })

  it('coop: going out celebrates when it happens, not when reopened', () => {
    const { rerender, unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    rerender(<PlayAreaLoader {...ZTest_makeScrabbleCtx(WENT_OUT)} />)
    expect(screen.getByText(/Every tile played!/)).toBeInTheDocument()
    unmount()
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(WENT_OUT)} />)
    expect(screen.queryByText(/Every tile played!/)).toBeNull()
  })

  it('compete: a tie for first names the other winner after the word', () => {
    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({
          ...RACE,
          ending: { reason: 'all_passed', detail: 'blocked', by: 'u2' },
          outcome: 'won',
          players: [{ ...ME, outcome: 'won', finalRanking: 1 }, { ...MOTH, outcome: 'won', finalRanking: 1 }],
        })}
      />,
    )
    expect(screen.getByText('Won (tied with moth)')).toBeInTheDocument()
  })

  it('compete: a player who played no word lost, and says so', () => {
    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({
          ...RACE,
          ending: { reason: 'timeout', detail: 'timeout', by: null },
          outcome: 'lost',
          players: [{ ...ME, outcome: 'lost' }, { ...MOTH, outcome: 'lost' }],
        })}
      />,
    )
    expect(screen.getByText('Lost (no words played)')).toBeInTheDocument()
    expect(document.querySelector('[class*="endingFrame_lost"]')).not.toBeNull()
  })
})

describe('scrabble PlayArea — the action row', () => {
  it('a race shows Concede and calls concede', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...ZTest_makeScrabbleCtx(RACE)} />
        <ConfirmationHost />
      </>,
    )
    await user.click(control('act-concede')!)
    await user.click(await screen.findByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('coop shows Stop, not Concede, and calls stop_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...ZTest_makeScrabbleCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(control('act-concede')).toBeNull()
    await user.click(control('act-stop-game')!)
    const confirms = await screen.findAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('after I concede: my concession, with Stop for all in Concede\'s place', () => {
    render(
      <PlayAreaLoader
        {...ZTest_makeScrabbleCtx({ ...RACE, players: [{ ...ME, ...ZTest_CONCEDED }, MOTH], turnHolderId: 'u2' })}
      />,
    )
    // The info column carries the detail; the pill, beside the rack, the word.
    expect(screen.getByText('Conceded (game continues)')).toBeInTheDocument()
    expect(screen.getByText('Conceded')).toBeInTheDocument()
    expect(control('act-concede')).toBeNull()
    expect(control('act-stop-game')).not.toBeNull()
  })

  it('New game is a button only once the game has ended', () => {
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    expect(control('act-new-game')).toBeNull()
    unmount()
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(STOPPED)} />)
    expect(control('act-new-game')).not.toBeNull()
  })

  it('Suggest is coop\'s alone', () => {
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    expect(describeOf('act-suggest-move')?.state).toBe('active')
    unmount()
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(RACE)} />)
    expect(describeOf('act-suggest-move')?.state).toBe('hidden')
    expect(control('act-suggest-move')).toBeNull()
  })

  it('a press on Suggest shows the moves, in capitals by CSS', async () => {
    const user = userEvent.setup()
    edgeFn.mockResolvedValueOnce({
      type: 'ok',
      data: {
        result: 'suggested',
        version: 0,
        moves: [{
          placements: [{ x: 7, y: 7, letter: 'c', blank: false }, { x: 8, y: 7, letter: 'a', blank: false }],
          words: [{ word: 'ca', score: 8, cells: [] }],
          score: 8,
          leave: 1.5,
          equity: 9.5,
        }],
      },
    })
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    await user.click(control('act-suggest-move')!)
    expect(await screen.findByText('ca')).toBeInTheDocument()
    expect(screen.getByText('(9.5)')).toBeInTheDocument()
  })
})

describe('scrabble PlayArea — the rack row', () => {
  it('Show move is coop with a teammate, gray with nothing staged', () => {
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ players: [ME, MOTH] })} />)
    expect(screen.getByLabelText('Show move to team')).toBeDisabled()
    unmount()
    const solo = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    expect(screen.queryByLabelText('Show move to team')).not.toBeInTheDocument()
    solo.unmount()
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx(RACE)} />)
    expect(screen.queryByLabelText('Show move to team')).not.toBeInTheDocument()
  })

  it('Swap with a shallow bag names the bag; with nothing picked, asks for a pick', () => {
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeScrabbleCtx({ nBagTiles: 5 })} />)
    expect(describeOf('act-exchange')).toEqual({ state: 'disabled', label: 'Swap', tooltip: 'Need ≥ 7 tiles in the bag' })
    expect(control('act-exchange')?.dataset.tooltip).toBe('Need ≥ 7 tiles in the bag')
    unmount()
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    expect(describeOf('act-exchange')).toEqual({ state: 'disabled', label: 'Swap', tooltip: 'Pick rack tiles first' })
  })

  it('Recall is gray with nothing staged', () => {
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    expect(control('act-recall-tiles')).toBeDisabled()
  })

  it('a typed letter stages its tile, and Enter plays the word under the RPC\'s names', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'accepted', drawn: ['e', 'r'] }))
    render(<WithKeys {...ZTest_makeScrabbleCtx()} />)
    // The cursor starts on the star, across: c, a, t.
    await press({ key: 'c', code: 'KeyC' })
    await press({ key: 'A', code: 'KeyA', shiftKey: true })
    await press({ key: 't', code: 'KeyT' })
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('play_word', {
      p_game_id: 'g1',
      p_base_version: 0,
      p_placements: [
        { x: 7, y: 7, letter: 'c', blank: false },
        { x: 8, y: 7, letter: 'a', blank: false },
        { x: 9, y: 7, letter: 't', blank: false },
      ],
      p_words: ['cat'],
      p_score: 10,
    }))
    expect(await screen.findByText('CAT +10')).toBeInTheDocument()
  })

  it('a letter I don\'t hold says so, in a capital', async () => {
    render(<WithKeys {...ZTest_makeScrabbleCtx({ teamRack: ['a', 'b'] })} />)
    await press({ key: 'z', code: 'KeyZ' })
    expect(await screen.findByText('No “Z” tile')).toBeInTheDocument()
  })

  it('⌥Z shuffles the rack', async () => {
    render(<WithKeys {...ZTest_makeScrabbleCtx()} />)
    const random = vi.spyOn(Math, 'random')
    await press({ key: 'Ω', code: 'KeyZ', altKey: true })
    expect(random).toHaveBeenCalled()
    random.mockRestore()
  })
})

describe('scrabble PlayArea — tap a rack tile, then a cell', () => {
  /** A tap: a press and a release with no travel between. */
  function tap(el: Element) {
    fireEvent.pointerDown(el, { button: 0, clientX: 1, clientY: 1 })
    fireEvent.pointerUp(window, { button: 0, clientX: 1, clientY: 1 })
  }
  const rackTile = (i: number) => document.querySelectorAll('[data-rack-tile]')[i]!
  const cell = (x: number, y: number) => document.querySelector(`[data-x="${x}"][data-y="${y}"]`)!

  it('one picked tile goes onto the empty cell tapped', () => {
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    act(() => tap(rackTile(0)))
    act(() => tap(cell(7, 7)))
    expect(cell(7, 7).querySelector('[data-tile="7,7"]')!.textContent).toBe('c3')
  })

  it('with two picked, a tap on a cell does nothing — not even the cursor moves — and Swap still swaps them', () => {
    const hasCursor = (x: number, y: number) => cell(x, y).querySelector('[class*="_cursor_"]') !== null
    render(<PlayAreaLoader {...ZTest_makeScrabbleCtx()} />)
    act(() => tap(rackTile(0)))
    act(() => tap(rackTile(1)))
    // The cursor starts on the star.
    act(() => tap(cell(3, 3)))
    expect(cell(3, 3).querySelector('[data-tile]')).toBeNull()
    expect(hasCursor(3, 3)).toBe(false)
    expect(hasCursor(7, 7)).toBe(true)
    expect(describeOf('act-exchange')).toEqual({ state: 'active', label: 'Swap 2 picked tiles' })
  })
})

describe('scrabble PlayArea — pass', () => {
  it('asks first, and Keep playing passes nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...ZTest_makeScrabbleCtx(RACE)} />
        <ConfirmationHost />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Pass' }))
    expect(await screen.findByText('Pass your turn?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalledWith('pass_turn', expect.anything())
  })

  it('yes passes', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...ZTest_makeScrabbleCtx(RACE)} />
        <ConfirmationHost />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Pass' }))
    const confirms = await screen.findAllByRole('button', { name: 'Pass' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('pass_turn', { p_game_id: 'g1', p_base_version: 0 }))
  })
})

describe('scrabble PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ at the end deals a new game with no question, people only', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'created', id: 'next-game-id' }))
    const ctx = ZTest_makeScrabbleCtx(STOPPED)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        p_club_handle: 'testclub',
        p_setup: { dict_2: 3, dict_3plus: 3, timer: { kind: 'none' }, ai_count: 0, ai_level: 'strong', coop_style: 'free-for-all' },
        p_player_user_ids: ['u1'],
        p_mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and Keep playing deals nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...ZTest_makeScrabbleCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: '+' })
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌥⌫ in coop asks to stop the game; yes calls stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...ZTest_makeScrabbleCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    const confirms = screen.getAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('Restart mid-game asks, and goes straight through at the end', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = ZTest_makeScrabbleCtx()
    const { unmount } = render(
      <>
        <PlayAreaLoader {...live} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(live).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
    unmount()

    const done = ZTest_makeScrabbleCtx(STOPPED)
    render(<PlayAreaLoader {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })
})
