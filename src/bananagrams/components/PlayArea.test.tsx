// cs-unmet

/**
 * Render tests for bananagrams' PlayArea: does the surface mount from the blob
 * — in solo play, a race, at the end, and out of the race after conceding —
 * and do its commands reach the server through the dispatcher?
 *
 * `db` is mocked, and jsdom gets a `ResizeObserver` stub (the board editor
 * observes the arena to compute the min zoom). Everything else — the arena, the
 * hand, the dump zone, Peel, the info column — renders for real from
 * `ZTest_makeBananagramsCtx`'s blob.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { db } from '../db'
import {
  ZTest_CONCEDED,
  ZTest_makeBananagramsCtx,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } }))

// jsdom has no ResizeObserver; the board editor constructs one to size the zoom.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)

const ME = { id: 'u1', username: 'me', color: 'red' }
const MOTH = { id: 'u2', username: 'moth', color: 'blue' }

/** The game won by me going out. */
const WON_BY_ME: Pick<ZTest_GameDataFacts, 'ending' | 'outcome' | 'players'> = {
  players: [{ ...ME, outcome: 'won', finalRanking: 1 }, { ...MOTH, outcome: 'lost' }],
  ending: { reason: 'reached_goal', detail: 'complete', by: 'u1', winner: 'u1' },
  outcome: 'won',
}

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
 *  draw, keyed by action id. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** The surface under the app-root key dispatcher, which App.tsx mounts for
 *  real. Only the tests whose subject is a keystroke need it. */
function WithKeys(props: PlayAreaLoaderProps) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** What an action says about itself right now. */
const stateOf = (id: string) => getActions().find((b) => b.id === id)?.describe('button').state

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('bananagrams PlayArea — render', () => {
  it('renders the arena, the hand and Concede in a solo game', () => {
    render(<PlayAreaLoader {...ZTest_makeBananagramsCtx()} />)
    expect(screen.getByText('Hand')).toBeInTheDocument()
    // Peel always reads "Peel"; disabled while the hand isn't empty.
    expect(screen.getByRole('button', { name: 'Peel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /concede/i })).toBeInTheDocument()
  })

  it('renders the rivals strip in a race, with each rival\'s unplaced count', () => {
    render(<PlayAreaLoader {...ZTest_makeBananagramsCtx({
      players: [ME, { ...MOTH, tiles: 'abc' }],
    })} />)
    expect(screen.getByText('moth')).toBeInTheDocument()
    expect(document.querySelector('[data-peer="u2"] [data-count]')?.textContent).toBe('3')
  })

  it('shows the state line off the blob', () => {
    render(<PlayAreaLoader {...ZTest_makeBananagramsCtx({ nBunchTiles: 60, nBagTiles: 3 })} />)
    expect(screen.getByText('Tiles:').parentElement?.textContent).toBe('Tiles: You: 15 · Bunch: 60 · Bag: 3')
  })

  it('renders the ending I won: the outcome line and the verdict pill', () => {
    render(<PlayAreaLoader {...ZTest_makeBananagramsCtx(WON_BY_ME)} />)
    // No modal carries the verdict — a WIN pops the celebration instead, and
    // `useCelebration` fires on the flip, not on mount.
    expect(screen.getByText('You won!')).toBeInTheDocument()
    expect(screen.getAllByText(/Bananas! You went out first/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders out of the race after conceding: frozen, the others racing', () => {
    render(<PlayAreaLoader {...ZTest_makeBananagramsCtx({
      players: [{ ...ME, ...ZTest_CONCEDED }, MOTH],
    })} />)
    expect(screen.getAllByText(/you conceded/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Peel' })).not.toBeInTheDocument()
  })

  it('the setup disclosure shows the shared rows, the same ones the PDF prints', () => {
    render(<PlayAreaLoader {...ZTest_makeBananagramsCtx({
      setup: {
        hand_size: 21, bunch_size: 144, word_check: 'strict', dict_2: 4, dict_3plus: 4,
        dump_to_bag: true, timer: { kind: 'none' },
      },
    })} />)
    const setupOptions = screen.getByText('Setup options').parentElement as HTMLElement
    expect(setupOptions.textContent).toContain('Players: me')
    expect(setupOptions.textContent).toContain('Dumped tiles: to the bag (out of play)')
    expect(setupOptions.textContent).toContain('Word check: Every peel')
    expect(setupOptions.textContent).toContain('Timer: none')
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('bananagrams PlayArea — the commands', () => {
  const RACE = { players: [ME, MOTH] }

  it('+ at the end deals the next game with no question, with the p_ names', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ data: null, error: null }),
    )
    const ctx = ZTest_makeBananagramsCtx(WON_BY_ME)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        p_club_handle: 'testclub',
        p_setup: expect.objectContaining({ hand_size: 15 }),
        p_player_user_ids: ['u1', 'u2'],
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and cancel deals nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...ZTest_makeBananagramsCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: '+' })
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    await waitFor(() => expect(screen.queryByText('Start a new game?')).not.toBeInTheDocument())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌥⌫ asks the two-answer question; "Stop for all" calls stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...ZTest_makeBananagramsCtx(RACE)} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop for all' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('concede', expect.anything())
  })

  it('⌥⌫ then "Concede" calls concede, not stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...ZTest_makeBananagramsCtx(RACE)} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('stop_game', expect.anything())
  })

  it('Stop game hides behind Concede while racing, and comes out once I have conceded', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeBananagramsCtx(RACE)} />)
    expect(stateOf('act-stop-game')).toBe('hidden')
    expect(stateOf('act-concede')).toBe('active')
    // The button follows the action: only Concede draws.
    expect(document.querySelector('button[data-action="act-stop-game"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-concede"]')).not.toBeNull()

    // My Concede is spent, so it goes; stopping the table is still open to me.
    rerender(<PlayAreaLoader {...ZTest_makeBananagramsCtx({
      players: [{ ...ME, ...ZTest_CONCEDED }, MOTH],
    })} />)
    expect(stateOf('act-stop-game')).toBe('active')
    expect(stateOf('act-concede')).toBe('hidden')
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
    expect(document.querySelector('button[data-action="act-concede"]')).toBeNull()
  })

  it('Restart mid-game asks, and goes straight through at the end', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = ZTest_makeBananagramsCtx()
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

    // No host this time: the RPC firing proves no question was asked.
    const done = ZTest_makeBananagramsCtx(WON_BY_ME)
    render(<PlayAreaLoader {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })

  it('the menu lists Restart and New game before Print', () => {
    const ctx = ZTest_makeBananagramsCtx()
    render(<PlayAreaLoader {...ctx} />)
    const ids = [...menuItems(ctx).keys()]
    expect(ids.indexOf('act-restart')).toBeLessThan(ids.indexOf('act-print-board'))
    expect(ids.indexOf('act-new-game')).toBeLessThan(ids.indexOf('act-print-board'))
  })
})
