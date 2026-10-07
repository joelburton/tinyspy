// cs-unmet

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { getActions } from '@/common/actions/actionsStore'
import { db } from '../db'
import {
  ZTest_CONCEDED,
  ZTest_claim,
  ZTest_makeSetgameCtx,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

/**
 * setgame's PLAY SURFACE — the mounted tree, which is the one layer its other
 * suites can't reach. The algebra (`lib/tiles`), the hint ladder, the picks, the
 * history, the endings and the claim's marks have their own files, and the
 * pgTAP files own the rules. What none of them see is the WIRING: which control
 * renders in which state, and what a key or a click sends.
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeSetgameCtx`) and
 * nothing is mocked but `db`.
 *
 * The fixture's table is `ZTest_BOARD_IDS`: slots 0, 1 and 2 — letters A, H
 * and O, the first column — are the set 1111 / 1112 / 1113; slot 3, letter B,
 * is 1121, which completes nothing with the first two.
 */

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }

/** A game that has ended with nobody winning: a Stop. */
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
const type = (key: string) => press({ key, code: `Key${key.toUpperCase()}` })

/** What an action says about itself right now. */
const stateOf = (id: string) => getActions().find((b) => b.id === id)?.describe('button').state

/** The tile with this id, on the board. */
const tile = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-tile="${id}"]`)!
const isPicked = (id: string) => tile(id).className.includes('picked')

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('setgame PlayArea — the letters are the input', () => {
  it('a letter picks the tile in that slot; typing it again drops it', async () => {
    render(<WithKeys {...ZTest_makeSetgameCtx()} />)
    await type('a')
    expect(isPicked('1111')).toBe(true)
    await type('a')
    expect(isPicked('1111')).toBe(false)
  })

  it('the third letter of a set claims it, with the tiles as numbers', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'claimed' }))
    render(<WithKeys {...ZTest_makeSetgameCtx()} />)
    await type('a')
    await type('h')
    await type('o')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_set', { p_game_id: 'g1', p_tiles: [1111, 1112, 1113] }))
  })

  it('a third tile that is not a set is refused here, with no round trip', async () => {
    render(<WithKeys {...ZTest_makeSetgameCtx()} />)
    await type('a')
    await type('h')
    await type('b')
    expect(await screen.findByText('Not a set')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    expect(isPicked('1111')).toBe(false)
  })

  it('a click picks too, and ⌫ clears the picks', async () => {
    render(<WithKeys {...ZTest_makeSetgameCtx()} />)
    fireEvent.click(tile('1111'))
    await type('h')
    expect(isPicked('1111') && isPicked('1112')).toBe(true)
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(isPicked('1111') || isPicked('1112')).toBe(false)
  })

  it('a letter with no tile at that slot does nothing', async () => {
    render(<WithKeys {...ZTest_makeSetgameCtx()} />)
    // E is the fifth column; a twelve-tile table has four.
    await type('e')
    expect(document.querySelectorAll('button[data-tile][class*="picked"]')).toHaveLength(0)
  })
})

describe('setgame PlayArea — when the board is not mine to touch', () => {
  it('an ended game takes no letters', () => {
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx(STOPPED)} />)
    expect(stateOf('act-pick-by-letter')).toBe('hidden')
  })

  it("a teammate's turn takes no letters", () => {
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx({ players: [ME, MOTH], turnHolderId: 'u2' })} />)
    expect(stateOf('act-pick-by-letter')).toBe('hidden')
  })
})

describe('setgame PlayArea — the Hint', () => {
  it('is gray in a race, and says why', () => {
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx({ mode: 'compete', players: [ME, MOTH] })} />)
    const hint = getActions().find((a) => a.id === 'act-hint')!.describe('button')
    expect(hint).toMatchObject({ state: 'disabled', label: 'No hints when competing' })
  })

  it('in coop, a press rings one tile of a set and records the hint', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'recorded', n_hints_used: 1 }))
    render(<WithKeys {...ZTest_makeSetgameCtx()} />)
    await press({ key: 'h', code: 'KeyH', altKey: true })
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('record_hint', { p_game_id: 'g1', p_tiles: [1111] }))
    expect(tile('1111').className).toContain('ringed')
  })
})

describe('setgame PlayArea — a conceder keeps the one flag', () => {
  it('shows my concession with Stop for all, not Concede', () => {
    render(
      <PlayAreaLoader {...ZTest_makeSetgameCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />,
    )
    expect(screen.getAllByText('Conceded (game continues)').length).toBeGreaterThan(0)
    expect(stateOf('act-concede')).toBe('hidden')
    expect(stateOf('act-stop-game')).toBe('active')
  })
})

describe('setgame PlayArea — the ending', () => {
  /** The strip's text, label and cells. */
  const stripText = () => screen.getByText('Sets:').parentElement!.textContent

  /** A compete game the deck ran out on, with each player's sets in the log. */
  const raceEnded = (players: ZTest_PlayerFacts[], nSets: Record<string, number>): ZTest_GameDataFacts => ({
    mode: 'compete',
    players,
    events: Object.entries(nSets).flatMap(([userId, n], i) =>
      Array.from({ length: n }, (_, k) => ZTest_claim(i * 10 + k + 1, userId, ['1111', '1112', '1113']))),
    ending: { reason: 'resource_exhausted', detail: 'cleared', by: 'u1' },
    outcome: 'won',
  })

  it('a Stop says it stopped, in the pill and the info column alike', () => {
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx(STOPPED)} />)
    expect(screen.getAllByText('Stopped').length).toBeGreaterThan(0)
  })

  /** A coop game the last claim cleared: no tile left, or tiles left over. */
  const PERFECT_CLEAR: ZTest_GameDataFacts = {
    boardIds: [],
    nTilesInDeck: 0,
    players: [{ ...ME, outcome: 'won', finalRanking: 1 }],
    ending: { reason: 'reached_goal', detail: 'cleared', by: 'u1' },
    outcome: 'won',
  }
  const EMPTIED_DECK: ZTest_GameDataFacts = {
    nTilesInDeck: 0,
    players: [{ ...ME, outcome: 'neutral' }],
    ending: { reason: 'resource_exhausted', detail: 'cleared', by: 'u1' },
    outcome: 'neutral',
  }

  it('coop: a perfect clear wins; an emptied deck with tiles left over is no result', () => {
    const { unmount } = render(<PlayAreaLoader {...ZTest_makeSetgameCtx(PERFECT_CLEAR)} />)
    expect(screen.getAllByText('Won (perfect clear)').length).toBeGreaterThan(0)
    expect(document.querySelector('[class*="endingFrame_won"]')).not.toBeNull()
    unmount()
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx(EMPTIED_DECK)} />)
    expect(screen.getAllByText('Ended (emptied deck)').length).toBeGreaterThan(0)
    expect(document.querySelector('[class*="endingFrame_neutral"]')).not.toBeNull()
  })

  it('coop: a perfect clear celebrates when it happens, not when reopened', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeSetgameCtx()} />)
    rerender(<PlayAreaLoader {...ZTest_makeSetgameCtx(PERFECT_CLEAR)} />)
    expect(screen.getByText(/Perfect clear!/)).toBeInTheDocument()
  })

  it('coop: an emptied deck does not celebrate, and a reopened win stays quiet', () => {
    const { rerender, unmount } = render(<PlayAreaLoader {...ZTest_makeSetgameCtx()} />)
    rerender(<PlayAreaLoader {...ZTest_makeSetgameCtx(EMPTIED_DECK)} />)
    expect(screen.queryByText(/Perfect clear!/)).toBeNull()
    unmount()
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx(PERFECT_CLEAR)} />)
    expect(screen.queryByText(/Perfect clear!/)).toBeNull()
  })

  it('compete: a tie for first names the other winner after the word', () => {
    render(
      <PlayAreaLoader
        {...ZTest_makeSetgameCtx(raceEnded(
          [{ ...ME, outcome: 'won', finalRanking: 1 }, { ...MOTH, outcome: 'won', finalRanking: 1 }],
          { u1: 2, u2: 2 },
        ))}
      />,
    )
    expect(screen.getAllByText('Won (tied with moth)').length).toBeGreaterThan(0)
    expect(stripText()).toMatch(/You:\s*2 \(won\)/)
    expect(stripText()).toMatch(/moth:\s*2 \(won\)/)
  })

  it('compete: the strip reads each player\'s sets, then how they came out', () => {
    render(
      <PlayAreaLoader
        {...ZTest_makeSetgameCtx(raceEnded(
          [{ ...ME, outcome: 'near', finalRanking: 2 }, { ...MOTH, outcome: 'won', finalRanking: 1 }],
          { u1: 1, u2: 3 },
        ))}
      />,
    )
    expect(screen.getAllByText('2nd').length).toBeGreaterThan(0)
    expect(stripText()).toMatch(/You:\s*1 \(2nd\)/)
    expect(stripText()).toMatch(/moth:\s*3 \(won\)/)
  })

  it('marks a conceded rival conceded in the strip, beside their sets (mid-game)', () => {
    render(
      <PlayAreaLoader {...ZTest_makeSetgameCtx({ mode: 'compete', players: [ME, { ...MOTH, ...ZTest_CONCEDED }] })} />,
    )
    expect(stripText()).toMatch(/moth:\s*0 \(conceded\)/)
  })

  it('frames the board in my outcome once I am out of play, mid-game too', () => {
    const { unmount } = render(
      <PlayAreaLoader {...ZTest_makeSetgameCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />,
    )
    expect(document.querySelector('[class*="endingFrame_lost"]')).not.toBeNull()
    unmount()
    render(<PlayAreaLoader {...ZTest_makeSetgameCtx({ mode: 'compete', players: [ME, MOTH] })} />)
    expect(document.querySelector('[class*="endingFrame"]')).toBeNull()
  })
})

describe('setgame PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ at the end deals a new game with no question', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'created', id: 'next-game-id' }))
    const ctx = ZTest_makeSetgameCtx(STOPPED)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        p_club_handle: 'testclub',
        p_setup: { timer: { kind: 'none' }, deck: 'full', palette: 'traditional', coop_style: 'free-for-all' },
        p_player_user_ids: ['u1'],
        p_mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and Keep playing starts nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...ZTest_makeSetgameCtx()} />
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
        <WithKeys {...ZTest_makeSetgameCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    const confirms = screen.getAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks to concede; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...ZTest_makeSetgameCtx({ mode: 'compete', players: [ME, MOTH] })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('Restart mid-game asks, and goes straight through at the end', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = ZTest_makeSetgameCtx()
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

    const done = ZTest_makeSetgameCtx(STOPPED)
    render(<PlayAreaLoader {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })
})
