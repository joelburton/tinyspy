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
  ZTest_guess,
  ZTest_makeStrandsCtx,
  ZTest_rowIds,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

/**
 * strands' PLAY SURFACE — the mounted tree, which is the one layer its other
 * suites can't reach.
 *
 * The rest of strands is unusually well covered *below* this: `lib/board`,
 * `lib/board.oracle` (the solver against the real archive), `lib/trace`,
 * `lib/history`, `lib/hintCopy` and the print model are pure functions with
 * their own files, and the pgTAP files own the rules. What none of them see is
 * the WIRING — which control renders in which state, and what each is handed.
 *
 * So these are deliberately about STATE → CONTROLS, not about game logic:
 * playing vs out of the race vs ended, the reveal's three faces, and the
 * keyboard's selection cursor.
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeStrandsCtx`) and
 * nothing is mocked but `db`; the board, info column and event log all render
 * for real.
 */

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An 8×6 board of letters that mostly appear once, so a typed letter names a
 *  cell: `a` sits at 0,0 and again at 4,2; `w` once, at 3,4, beside `x`. */
const BOARD = ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yzabcd', 'efghij', 'klmnop', 'qrstuv']

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }
const SOLVED = { at: '2026-06-01T00:00:00Z', reason: 'reached_goal', detail: 'solved' } as const

/** A play surface's context: a solo coop game in play on BOARD, built from the
 *  facts the way the builder would build it. */
function makeCtx(facts: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeStrandsCtx({ board: BOARD, ...facts })
}

/** A game that has ended with nobody winning: a Stop. */
const STOPPED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
  players: [{ ...ME, outcome: 'neutral' }],
}

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would draw
 *  — a row is an action now, so its words, glyph and availability come from
 *  the action rather than from the list. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
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

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

/** How many cells the live trace covers — each wears a disc on the board. */
const tracedCells = () => document.querySelectorAll('circle[class*="discTrace"]').length

/** The red rings on the cells an ambiguous letter could have meant. */
const ambiguousRings = () => document.querySelectorAll('circle[class*="ringAmbiguous"]').length

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('strands PlayArea — the three phases', () => {
  it('renders the 48-cell board and the theme prompt while playing', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(document.querySelectorAll('[data-tile]')).toHaveLength(48)
    // The prompt is shown from the first second — never a spoiler. (Twice
    // over: the below-board pill and the info column's own line.)
    expect(screen.getAllByText(/Rows of nonsense/).length).toBeGreaterThan(0)
    // Nothing ended: no Reveal control at all mid-game.
    expect(control('act-reveal')).toBeNull()
  })

  it('an ended game shows the ending row; the menu reveal wakes with it', () => {
    const live = makeCtx()
    const { unmount } = render(<PlayAreaLoader {...live} />)
    // Mid-game the menu row exists but is inert — the solution isn't even in
    // the blob yet.
    expect(menuItems(live).get('act-reveal')?.disabled).toBe(true)
    unmount()

    const done = makeCtx(STOPPED)
    render(<PlayAreaLoader {...done} />)
    expect(menuItems(done).get('act-reveal')?.disabled).toBe(false)
    expect(control('act-reveal')).toBeEnabled()
  })

  it('compete: a solved player waits with the ending LOOK while the race runs', () => {
    // strands deliberately doesn't end on first solve — the winner is whoever
    // solved on the fewest hints — so a solver's own race ends alone.
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [{ ...ME, solvedAt: SOLVED.at, ending: SOLVED, outcome: 'neutral' }, MOTH],
        })}
      />,
    )
    expect(screen.getByText('Solved (waiting on the rest)')).toBeInTheDocument()
    // My solve is no result yet: the board wears the neutral frame.
    expect(document.querySelector('[class*="endingFrame_neutral"]')).not.toBeNull()
    // …and cannot pull the answer while a rival is still tracing.
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
  })

  it('compete: a racer who is out still has the one flag — Stop for all', () => {
    // Conceding is closed to a player already out; stopping the game for all is
    // open to anyone in it, so the row's flag is Stop.
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [{ ...ME, solvedAt: SOLVED.at, ending: SOLVED, outcome: 'neutral' }, MOTH],
        })}
      />,
    )
    expect(control('act-concede')).toBeNull()
    expect(control('act-stop-game')).not.toBeNull()
  })

  it('every phase keeps back-to-club in the action row — out of the race too', () => {
    // One row lists every action once; each says whether it shows. The row
    // that forked by phase dropped back-to-club while a race ran on without you.
    const { unmount } = render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [{ ...ME, solvedAt: SOLVED.at, ending: SOLVED, outcome: 'neutral' }, MOTH],
        })}
      />,
    )
    expect(control('act-back-to-club')).not.toBeNull()
    unmount()
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(control('act-back-to-club')).not.toBeNull()
  })

  it('a rival who has solved reads so in the strip, beside their hints, while the race runs on', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [ME, { ...MOTH, solvedAt: SOLVED.at, ending: SOLVED, outcome: 'neutral' }],
        })}
      />,
    )
    expect(screen.getByText('0 (solved)')).toBeInTheDocument()
  })
})

/**
 * The reveal's three faces, and the state that picks each one. The words line
 * is the half a consumed board can't give you: strands draws PATHS and never
 * spells anything out.
 */
describe('strands PlayArea — the turn arriving', () => {
  it('flashes the board when the move becomes mine, and not on mount', () => {
    const board = () => document.querySelector('[data-board]')!
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH], turnHolderId: 'u2' })} />)
    // An EVENT, so never on mount: opening a game on your own turn is not
    // being handed it.
    expect(board().className).not.toMatch(/yourTurnFlash/)
    rerender(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH], turnHolderId: 'u1' })} />)
    expect(board().className).toMatch(/yourTurnFlash/)
  })
})

describe('strands PlayArea — the ending', () => {
  it('coop: every word found wins, in the won frame', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: [{ ...ME, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 }],
          ending: { reason: 'reached_goal', detail: 'solved', by: 'u1' },
          outcome: 'won',
        })}
      />,
    )
    expect(screen.getAllByText('Won (every word found)').length).toBeGreaterThan(0)
    expect(document.querySelector('[class*="endingFrame_won"]')).not.toBeNull()
  })

  it('compete: 2nd on as many hints says it solved later; the strip shows each place', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [
            { ...ME, solvedAt: SOLVED.at, outcome: 'near', finalRanking: 2 },
            { ...MOTH, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 },
          ],
          ending: { reason: 'reached_goal', detail: 'solved', by: 'u1' },
          outcome: 'won',
        })}
      />,
    )
    expect(screen.getAllByText('2nd (solved later)').length).toBeGreaterThan(0)
    expect(screen.getByText('0 (2nd)')).toBeInTheDocument()
    expect(screen.getByText('0 (won)')).toBeInTheDocument()
  })

  it('compete: a player who never solved reads Lost, bare', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [{ ...ME, outcome: 'lost' }, { ...MOTH, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 }],
          ending: { reason: 'timeout', detail: 'timeout', by: null },
          outcome: 'won',
        })}
      />,
    )
    expect(screen.getAllByText('Lost').length).toBeGreaterThan(0)
    expect(document.querySelector('[class*="endingFrame_lost"]')).not.toBeNull()
  })
})

describe('strands PlayArea — the reveal at the end', () => {
  it('an ending nobody solved keeps the words hidden until asked', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // Spangram FIRST — it's the word that names the theme.
    const line = screen.getByText('Words:').closest('p')!
    expect(line.textContent).toMatch(/Words:\s*ZZQEJK\s*ZZQABC\s*ZZQBDE/)

    // …and the same button takes it back off.
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
  })

  // A coop solve stamps every teammate, so a table that just solved the
  // puzzle sees the words unasked.
  it('a COOP WIN names the words unasked, and the control says it is done', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          ending: { reason: 'reached_goal', detail: 'solved', by: 'u2' },
          outcome: 'won',
          players: [
            { ...ME, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 },
            { ...MOTH, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 },
          ],
        })}
      />,
    )
    expect(screen.getByText('Words:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('compete: the RACE being won is not my solve', () => {
    // SOMEONE won. A player who never solved must still ask.
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ending: { reason: 'conceded', detail: 'conceded', by: 'u1' },
          outcome: 'won',
          players: [
            { ...ME, outcome: 'lost' },
            { ...MOTH, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 },
          ],
        })}
      />,
    )
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('compete: solving but LOSING on hints still counts as my solve', () => {
    // The race doesn't end on first solve, so the player who solved and was
    // out-hinted still consumed their board — they're looking at the answer.
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ending: { reason: 'reached_goal', detail: 'solved', by: 'u2' },
          outcome: 'won',
          players: [
            { ...ME, solvedAt: SOLVED.at, outcome: 'near', finalRanking: 2 },
            { ...MOTH, solvedAt: SOLVED.at, outcome: 'won', finalRanking: 1 },
          ],
        })}
      />,
    )
    expect(screen.getByText('Words:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('the menu twin tracks the button through all three faces', async () => {
    const ctx = makeCtx(STOPPED)
    render(<PlayAreaLoader {...ctx} />)
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')

    act(() => menuItems(ctx).get('act-reveal')!.run())
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide solution'))
  })
})

describe('strands PlayArea — the Hint button says where the economy stands', () => {
  // The words never move — the bar's one control must not resize as points
  // come in — so the state of the economy rides in the bubble.
  const hintButton = () => screen.getByRole('button', { name: 'Hint' })

  it('unearned: live, and the bubble counts the words still to find', () => {
    render(<PlayAreaLoader {...makeCtx({ hintPoints: 1 })} />)
    expect(hintButton().hasAttribute('disabled')).toBe(false)
    expect(hintButton().dataset.tooltip).toBe('Find 2 more valid words')
  })

  it('earned: the bubble says what cashing it does', () => {
    render(<PlayAreaLoader {...makeCtx({ hintPoints: 3 })} />)
    expect(hintButton().dataset.tooltip).toBe('Reveal the tiles of one theme word')
  })

  it('a hint already on the board: gray, and the bubble says so', () => {
    render(<PlayAreaLoader {...makeCtx({ hintTileIds: ZTest_rowIds(1) })} />)
    expect(hintButton().hasAttribute('disabled')).toBe(true)
    expect(hintButton().dataset.tooltip).toBe('A hint is already showing')
  })
})

/**
 * The board's letter key, through the dispatcher. A typed letter extends the
 * trace when exactly one cell that could come next bears it — and the key
 * stands down while a past turn is open, because that press is the viewer's.
 */
describe('strands PlayArea — a letter extends the trace', () => {
  it('a letter that names one cell extends the trace; its neighbor extends it again', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(tracedCells()).toBe(0)
    await press({ key: 'w' })
    expect(tracedCells()).toBe(1)
    // X is its right-hand neighbor and appears nowhere else.
    await press({ key: 'x' })
    expect(tracedCells()).toBe(2)
    // ⌫ takes the last one back.
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(tracedCells()).toBe(1)
  })

  // The board's answer to "several cells bear that letter": red rings on the
  // candidates, and no pill — the rings ARE the message.
  it('rings every candidate when a letter is ambiguous, and drops them on the next resolving key', async () => {
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'a' })
    expect(ambiguousRings()).toBe(2)
    expect(tracedCells()).toBe(0) // …and nothing was traced

    await press({ key: 'w' })
    expect(ambiguousRings()).toBe(0)
    expect(tracedCells()).toBe(1)
  })

  it('is gray while a past turn is open — the press belongs to the viewer', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ events: [ZTest_guess(1, 'u1', ['1,0', '1,1'], 'theme', BOARD)] })} />)
    expect(stateOf('act-extend-trace')).toBe('active')

    // The "#N" handle, by its text rather than a tooltip's wording.
    await user.click(screen.getByText(/^#\d+$/))
    expect(stateOf('act-extend-trace')).toBe('disabled')
    await press({ key: 'w' })
    expect(tracedCells()).toBe(0)
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('strands PlayArea — + and ⌥⌫ through the dispatcher', () => {
  /** New game is the NEXT puzzle: a preview read, then the create. */
  const nextPuzzleThenCreate = () =>
    rpc.mockImplementation((name: string) => {
      if (name === 'next_puzzle_for_club') return Promise.resolve(okEnvelope({ result: 'found', puzzle: { id: 'p2' } }))
      if (name === 'create_game') return Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
      return Promise.resolve({ error: null })
    })

  it('+ at the end starts the next puzzle with no question', async () => {
    nextPuzzleThenCreate()
    const ctx = makeCtx(STOPPED)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked. `puzzle_id` is deliberately
    // absent: the server picks.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        p_club_handle: 'testclub',
        p_setup: { band: 5, hint_cost: 3, min_word_length: 4, timer: { kind: 'none' }, coop_style: 'free-for-all' },
        p_player_user_ids: ['u1'],
        p_mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and cancel starts nothing', async () => {
    const user = userEvent.setup()
    nextPuzzleThenCreate()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: '+' })
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    await waitFor(() => expect(screen.queryByText('Start a new game?')).not.toBeInTheDocument())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌥⌫ in coop asks Stop game’s question; yes calls stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = screen.getAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: [ME, MOTH] })} />
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
    const live = makeCtx()
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
    const done = makeCtx(STOPPED)
    render(<PlayAreaLoader {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })
})

/**
 * The keyboard's selection cursor. Cells are `row,col`; the board's rows are
 * `abcdef`, `ghijkl`, … so `a` sits at 0,0 and again at 4,2. Arrows move the
 * ring, Space is a CLICK on the ringed letter, and a typed letter or a
 * submitted word moves the cursor to the trace's end and hides it.
 */
describe('strands PlayArea — the selection cursor', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue(okEnvelope({ result: 'invalid', hint_points: 0 }))
  })

  /** Where the ring is DRAWN, as `row,col`, or null when it isn't — read off
   *  the circle's center, which sits at (col + 0.5, row + 0.5) in cell units. */
  const ringAt = () => {
    const ring = document.querySelector('circle[class*="ringCursor"]')
    if (!ring) return null
    return `${Number(ring.getAttribute('cy')) - 0.5},${Number(ring.getAttribute('cx')) - 0.5}`
  }
  /** The traced cells, in board order. */
  const traced = () =>
    [...document.querySelectorAll('[data-tile]')]
      .filter((b) => /tileTrace/.test(b.className))
      .map((b) => b.getAttribute('data-tile'))
  /** Where the trace ends. */
  const traceEnd = () =>
    [...document.querySelectorAll('[data-tile]')].find((b) => /tileLast/.test(b.className))?.getAttribute('data-tile') ?? null
  const key = (k: string) => press({ key: k })
  const keys = async (...ks: string[]) => {
    for (const k of ks) await key(k)
  }

  it('is hidden until an arrow; the first arrow rings the first letter, the next moves it', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(ringAt()).toBeNull()

    await key('ArrowRight')
    expect(ringAt()).toBe('0,0')
    await key('ArrowRight')
    expect(ringAt()).toBe('0,1')
    await key('ArrowDown')
    expect(ringAt()).toBe('1,1')
  })

  // Space is exactly a click: extend a neighbor, back up to before a letter
  // already traced, start over from a far one.
  it('Space does nothing while hidden, then does what a click does', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key(' ')
    expect(traced()).toEqual([])

    await keys('ArrowRight', ' ', 'ArrowRight', ' ')
    expect(traced()).toEqual(['0,0', '0,1'])

    // The last letter again: back up to just before it.
    await key(' ')
    expect(traced()).toEqual(['0,0'])

    // A far letter: start over there.
    await keys('ArrowDown', 'ArrowDown', 'ArrowDown', ' ')
    expect(traced()).toEqual(['3,1'])
  })

  it('arrowing moves the ring and never the trace’s end', async () => {
    render(<WithKeys {...makeCtx()} />)
    await keys('ArrowRight', ' ', 'ArrowRight', ' ')
    expect(traceEnd()).toBe('0,1')
    await keys('ArrowDown', 'ArrowRight', 'ArrowDown')
    expect(ringAt()).toBe('2,2')
    expect(traceEnd()).toBe('0,1')
  })

  it('a typed letter moves the cursor onto it and hides it; the next arrow shows it there', async () => {
    render(<WithKeys {...makeCtx()} />)
    await keys('ArrowRight', ' ')
    // From a at 0,0 the only neighboring h is 1,1.
    await key('h')
    expect(traced()).toEqual(['0,0', '1,1'])
    expect(ringAt()).toBeNull()

    await key('ArrowRight')
    expect(ringAt()).toBe('1,1')
  })

  // A typed letter that several cells could be rings them red and waits; the
  // arrows reach one and Space takes it, with no mouse.
  it('arrows reach a red-ringed candidate and Space takes it', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('a')
    expect(traced()).toEqual([])

    await keys('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight')
    expect(ringAt()).toBe('4,2')
    await key(' ')
    expect(traced()).toEqual(['4,2'])
  })

  it('a click moves the cursor onto the letter and hides it', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await user.click(document.querySelector('[data-tile="2,3"]')!)
    expect(traced()).toEqual(['2,3'])
    expect(ringAt()).toBeNull()

    await key('ArrowLeft')
    expect(ringAt()).toBe('2,3')
  })

  it('a submitted word moves the cursor to its last letter and hides it', async () => {
    render(<WithKeys {...makeCtx()} />)
    await keys('ArrowRight', ' ', 'ArrowRight', ' ', 'ArrowDown', 'ArrowDown')
    expect(ringAt()).toBe('2,1')

    await key('Enter')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_path', { p_game_id: 'g1', p_path: [[0, 0], [0, 1]] }))
    expect(ringAt()).toBeNull()

    await key('ArrowRight')
    expect(ringAt()).toBe('0,1')
  })

  it('a board I cannot play takes no ring and no keys', async () => {
    // A teammate holds the move.
    render(<WithKeys {...makeCtx({ players: [ME, MOTH], turnHolderId: 'u2' })} />)
    await keys('ArrowRight', ' ')
    expect(ringAt()).toBeNull()
    expect(traced()).toEqual([])
  })
})

describe('strands PlayArea — a move\'s answer', () => {
  it('says the word in the shared format, its capitals put on', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'hint_word', hint_points: 3 }))
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'w' })
    await press({ key: 'x' })
    await press({ key: 'Enter' })
    // The bar is full at 3 of 3, so the word earned a hint.
    expect(await screen.findByText('WX — hint earned')).toBeInTheDocument()
  })
})
