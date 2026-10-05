// cs-unmet

/**
 * waffle's play surface, mounted for real: does it render in coop, in compete
 * and once the game has ended, and does each surface on it do what its
 * docstring says — the action rows per mode and state, Concede and Stop, New
 * game, Reveal and Hide, the celebration, the turn-history viewer, the swap in
 * flight, the keys and the selection cursor.
 *
 * The smoke cases exist because a removed prop that was still referenced once
 * shipped a BLANK PAGE — a runtime `ReferenceError` that no type check
 * surfaces — and a one-line `render()` catches that class of bug instantly.
 * Game logic is not here: the rules live in pgTAP (the RPCs).
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeWaffleCtx`) and
 * nothing is mocked but `db` and the edge-function transport; everything — the
 * grid, strips, action row, dialogs — renders for real.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { ZTest_clearFaultMessages, ZTest_peekFaultMessages } from '@/common/faults/faultStore'
import { db } from '../db'
import { db as commonDb } from '@/common/supabase/db'
import { edgeFnTransport } from '@/common/supabase/edgeFnTransport'
import {
  ZTest_CONCEDED,
  ZTest_DEALT,
  ZTest_DEALT_COLORS,
  ZTest_SOLVED,
  ZTest_makeWaffleCtx,
  ZTest_swap,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import type { GSetup } from '../types'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// The common client is mocked so the reveal tests can assert that NOTHING is
// written when the answer is shown.
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))
// New game calls the board-building edge function. The TRANSPORT is mocked, not
// the helper above it, so the real `runEdgeFn` reads the envelope and raises
// the fault.
vi.mock('@/common/supabase/edgeFnTransport', () => ({ edgeFnTransport: vi.fn() }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const commonRpc = commonDb.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = edgeFnTransport as unknown as ReturnType<typeof vi.fn>

/** What `waffle.submit_swap` answers on an accepted swap. `runRpc` reads the
 *  ENVELOPE out of `data`, and `data.result` is the case the call site asserts,
 *  so a stub without it is an answer the chain cannot name. */
const okEnvelope = {
  data: {
    type: 'ok', data: { result: 'swapped' }, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
}

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }
const twoMembers = [ME, MOTH]

const T = '2026-09-03T00:00:00Z'

/** The solved board's colors: every filled cell green. */
const ALL_GREEN = ZTest_SOLVED.colors

/** The endings the tests reach for, each with the game's outcome beside it. */
type Ending = Pick<ZTest_GameDataFacts, 'ending' | 'outcome'>
const COOP_WON: Ending = {
  ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: null },
  outcome: 'won',
}
const COOP_LOST: Ending = {
  ending: { reason: 'resource_exhausted', detail: 'exhausted', by: 'u1', winner: null },
  outcome: 'lost',
}
/** A race somebody won: the last racer's act was a solve. */
const raceWonBy = (winner: string): Ending => ({
  ending: { reason: 'reached_goal', detail: 'solved', by: winner, winner },
  outcome: 'won',
})

/** A player who solved and was ranked first — `won`, as `_end_game` writes it. */
const won = (p: ZTest_PlayerFacts, nSwapsUsed?: number): ZTest_PlayerFacts =>
  ({ ...p, outcome: 'won', finalRanking: 1, solvedAt: T, nSwapsUsed })
/** A player beaten or out — `lost`. */
const lost = (p: ZTest_PlayerFacts): ZTest_PlayerFacts => ({ ...p, outcome: 'lost' })

/** The solo coop game's two endings, with its one player as the server wrote
 *  them. A win is the solved board. */
const SOLO_WON: ZTest_GameDataFacts = { ...COOP_WON, board: ZTest_SOLVED, players: [won(ME)] }
const SOLO_LOST: ZTest_GameDataFacts = { ...COOP_LOST, players: [lost(ME)] }

/** A realistic setup blob — the info-column disclosure reads it (a `{}` here
 *  would crash timerLabel, exactly the kind of render bug these tests guard). */
const SETUP: GSetup = { difficulty: 2, extra_swaps: 5, timer: { kind: 'none' } }

/** A play surface's context: a waffle game, solo coop by default, built from
 *  the facts the way the builder would build it. */
function makeCtx(facts: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeWaffleCtx({ setup: SETUP, ...facts })
}

/** What PlayArea handed `setGameSections`, as the ROWS the menu would draw. */
const menuItems = (ctx: PlayAreaLoaderProps) => {
  const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
  const sections = (calls.at(-1)![0] ?? []) as MenuSection[]
  return sections.flatMap((s) => s.items).map(menuRow)
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke as the app-root listener sees it: from the body, with nothing
 *  focused. An Option chord matches on `code`, since ⌥ changes the character. */
const press = (key: KeyboardEventInit) => fireEvent.keyDown(document.body, key)
const PLUS = { key: '+' }
const OPT_BACKSPACE = { key: 'Backspace', code: 'Backspace', altKey: true }

/** The page's action for an id — the same `run` its key, its menu row and
 *  its button all fire. */
const getAction = (id: ActionId) => getActions().find((action) => action.id === id)!

/** Answer the open question with the button that says `name`. The trigger can
 *  share the modal's words; the modal's is the one the host adds, so it is last
 *  in the DOM. */
async function answer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const buttons = await screen.findAllByRole('button', { name })
  await user.click(buttons[buttons.length - 1]!)
}

/** The board's tiles, in position order (holes are not tiles). */
const boardTiles = () => within(screen.getByRole('grid')).getAllByRole('button')

beforeEach(() => {
  ZTest_clearFaultMessages()
  rpc.mockReset()
  rpc.mockResolvedValue(okEnvelope)
  commonRpc.mockReset()
  commonRpc.mockResolvedValue({ error: null })
  startEdgeFn.mockReset()
})

describe('waffle PlayArea — render smoke', () => {
  it('renders the board + a log row in coop play', () => {
    render(<PlayAreaLoader {...makeCtx({
      events: [ZTest_swap(1, 'u1', [2, 3], ZTest_DEALT, ZTest_DEALT_COLORS)],
    })} />)
    expect(screen.getByRole('grid', { name: /waffle board/i })).toBeInTheDocument()
  })

  it('renders the board in compete play', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    expect(screen.getByRole('grid', { name: /waffle board/i })).toBeInTheDocument()
  })

  it('renders the coop win with the par verdict, in the pill and the info column', () => {
    // 11 swaps against par 9 → "Won: par +2".
    render(<PlayAreaLoader {...makeCtx({ ...SOLO_WON, parSwaps: 9, maxSwaps: 14, players: [won(ME, 11)] })} />)
    expect(screen.getAllByText('Won: par +2')).toHaveLength(2)
  })

  it('renders an even-par coop win as "Won: par!"', () => {
    render(<PlayAreaLoader {...makeCtx({ ...SOLO_WON, parSwaps: 9, maxSwaps: 14, players: [won(ME, 9)] })} />)
    expect(screen.getAllByText('Won: par!')).toHaveLength(2)
  })
})

describe('waffle PlayArea — concede', () => {
  it('compete shows Concede and calls waffle.concede on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await user.click(screen.getByRole('button', { name: /concede/i }))
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('coop shows Stop (not Concede) and calls stop_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    await answer(user, 'Stop game')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('marks a conceded rival "out" in the strip', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [ME, { ...MOTH, ...ZTest_CONCEDED }] })} />)
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows my ending after I concede, in the action row and the pill, as a loss', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />)
    // The server wrote `lost` for a concede, and the line wears it.
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(screen.getByText('Conceded — race continues')).toBeInTheDocument()
  })

  it('bands my board with my outcome once I am out, while the others race on', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    expect(screen.getByRole('grid').className).not.toMatch(/endingFrame/)
    rerender(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />)
    expect(screen.getByRole('grid').className).toMatch(/endingFrame_lost/)
  })
})

/**
 * "New game" (menu): a FRESH game — new id, same setup/roster/mode — via the
 * same waffle-build-board edge function the manifest's start uses, then a jump
 * into it. The pinned request body is the feature's contract.
 */
describe('waffle PlayArea — new game (menu)', () => {
  it('starts a fresh game with this game\'s setup + roster + mode, then navigates', async () => {
    const user = userEvent.setup()
    startEdgeFn.mockResolvedValue({ error: null, data: { type: 'ok', data: { result: 'created', id: 'fresh-game-id' } } })
    const ctx = makeCtx({ players: twoMembers })
    render(
      <>
        <PlayAreaLoader {...ctx} />
        <ConfirmationHost />
      </>,
    )

    act(() => menuItems(ctx).find((r) => r.id === 'act-new-game')!.run())
    // Mid-game, New game CONFIRMS first — an accidental `+` shouldn't shelve a
    // game in progress. Nothing is created until we say yes.
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    expect(startEdgeFn).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Start new game' }))
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith('waffle-build-board', {
        target_club: 'testclub',
        setup: SETUP,
        player_user_ids: ['u1', 'u2'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('fresh-game-id'))
  })

  it('shows a refusal in the server\'s own words, wearing the fault look, and does not navigate', async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    startEdgeFn.mockResolvedValue({
      error: null,
      data: {
        type: 'not-ok',
        severity: 'fault',
        message: 'No board could be built at that difficulty.',
        dbcode: 'PN121',
      },
    })
    const ctx = makeCtx({ players: twoMembers })
    render(
      <>
        <PlayAreaLoader {...ctx} />
        <ConfirmationHost />
      </>,
    )

    act(() => menuItems(ctx).find((r) => r.id === 'act-new-game')!.run())
    await user.click(await screen.findByRole('button', { name: 'Start new game' }))

    // Faults route to the MODAL queue, never a slot (docs/ui.md → Faults), in
    // the server's words.
    await waitFor(() =>
      expect(ZTest_peekFaultMessages().map((f) => f.text)).toContain(
        'No board could be built at that difficulty.',
      ),
    )
    expect(ctx.goToFollowUpGame).not.toHaveBeenCalled()
    // A fault leaves a [db] trail; an expected pill doesn't. This one must.
    expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('FAULT'))).toBe(true)
    consoleSpy.mockRestore()
  })
})

/**
 * The icon-only action rows (waffle's experiment — labels live in tooltips):
 * PLAYING = Stop/Concede + Back-to-club; ENDED = Restart + Reveal solution +
 * New game + Back-to-club. Reveal is local: it writes nothing.
 */
describe('waffle PlayArea — icon-only action rows', () => {
  it('playing row offers Back-to-club — the shell action, which knows to suspend', async () => {
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('the menu row is named "Reveal solution" mid-game too, inert but not renamed', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    const reveal = menuItems(ctx).find((r) => r.id === 'act-reveal')
    expect(reveal?.label).toBe('Reveal solution')
    expect(reveal?.disabled).toBe(true)
  })

  it('an ended game\'s "Reveal solution" swaps in the solution for me alone — no RPC', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    // The loss keeps the answer hidden (em dashes)…
    expect(screen.queryByText('ABCDE')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // …and the click draws it, board and words, here and nowhere else.
    expect(screen.getByText('ABCDE')).toBeInTheDocument()
    expect(screen.getByText('QRSTU')).toBeInTheDocument()
    expect(boardTiles()[0]).toHaveTextContent('a')
    expect(commonRpc).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('Hide brings back the board the players actually finished with', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText('ABCDE')).not.toBeInTheDocument()
    expect(boardTiles()[0]).toHaveTextContent('b')
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('SOLVING it leaves the control with nothing to do', () => {
    // A waffle win IS the solved grid, so the answer is already on screen.
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('an ended race I did NOT solve still waits to be asked', () => {
    // "Did I solve it", never "was the game won".
    render(<PlayAreaLoader {...makeCtx({
      mode: 'compete',
      ...raceWonBy('u2'),
      players: [lost(ME), won(MOTH)],
    })} />)
    expect(screen.queryByText('ABCDE')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('an ended game\'s "New game" button starts the follow-up game', async () => {
    startEdgeFn.mockResolvedValue({ error: null, data: { type: 'ok', data: { result: 'created', id: 'next-game-id' } } })
    const user = userEvent.setup()
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })
})

/**
 * The end. No modal carries the verdict: it's in-page, the action row gains a
 * Restart button (unconfirmed once the game has ended), and MY win pops the
 * celebration — but only at the moment it happens, never when mounting an
 * already-won game.
 */
describe('waffle PlayArea — the end', () => {
  it('shows Restart (left of Club) and no modal', () => {
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)

    const restart = screen.getByRole('button', { name: 'Restart' })
    const club = screen.getByRole('button', { name: /club/i })
    expect(restart.compareDocumentPosition(club) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Mounting an already-won game is review, not a win.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Restart calls replay_board WITHOUT confirming', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' })
  })

  it('pops the celebration when the coop win lands mid-session', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    expect(screen.getByRole('dialog', { name: 'Solved it! 🧇' })).toBeInTheDocument()
  })

  it('celebrates the race I won, at the moment it ends', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    rerender(<PlayAreaLoader {...makeCtx({
      mode: 'compete',
      ...raceWonBy('u1'),
      players: [won(ME), lost(MOTH)],
    })} />)
    expect(screen.getByRole('dialog', { name: 'Solved it! 🧇' })).toBeInTheDocument()
    expect(screen.getByText('You won!')).toBeInTheDocument()
  })

  it('does not celebrate the race I lost', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    rerender(<PlayAreaLoader {...makeCtx({
      mode: 'compete',
      ...raceWonBy('u2'),
      players: [lost(ME), won(MOTH)],
    })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Opponent won')).toBeInTheDocument()
  })

  it('names an all-conceded race for what it was', () => {
    render(<PlayAreaLoader {...makeCtx({
      mode: 'compete',
      ending: { reason: 'conceded', detail: 'conceded', by: 'u2', winner: null },
      outcome: 'lost',
      players: [{ ...ME, ...ZTest_CONCEDED }, { ...MOTH, ...ZTest_CONCEDED }],
    })} />)
    expect(screen.getByText('All conceded')).toBeInTheDocument()
  })
})

/**
 * The turn-history viewer (coop). Clicking a swap-log row replays that swap's
 * board; a keystroke or the ✕ returns to live. The replay itself is unit-tested
 * in lib/history.test.ts; this proves the wiring. Cell 0's letter tells live
 * from a past board.
 */
describe('waffle PlayArea — turn-history viewer (coop)', () => {
  // From the deal ('bacdef…'): moth swaps 2↔3, I swap 0↔1, moth swaps 2↔3
  // back — the live board is the solution, cell 0 'a'.
  const BADCEF = 'badcef.g.hijklmn.o.pqrstu'
  const ABDCEF = 'abdcef.g.hijklmn.o.pqrstu'
  const HISTORY: ZTest_GameDataFacts = {
    players: twoMembers,
    board: ZTest_SOLVED,
    events: [
      ZTest_swap(1, 'u2', [2, 3], ZTest_DEALT, ZTest_DEALT_COLORS),
      ZTest_swap(2, 'u1', [0, 1], BADCEF, ZTest_DEALT_COLORS),
      ZTest_swap(3, 'u2', [2, 3], ABDCEF, ALL_GREEN),
    ],
  }

  it('clicking a swap row replays that swap; the ✕ returns to live', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(HISTORY)} />)
    expect(boardTiles()[0]).toHaveTextContent('a')

    // Swap #1: the board after only moth's 2↔3 — cell 0 still 'b'.
    await user.click(screen.getByText('#1', { exact: true, selector: 'span' }))
    expect(screen.getByText('#1: C (C1) ↔ D (D1)')).toBeInTheDocument()
    expect(boardTiles()[0]).toHaveTextContent('b')

    await user.click(screen.getByLabelText('Exit history'))
    expect(boardTiles()[0]).toHaveTextContent('a')
    expect(screen.queryByText('#1: C (C1) ↔ D (D1)')).not.toBeInTheDocument()
  })

  it('a keystroke returns to live', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(HISTORY)} />)

    await user.click(screen.getByText('#2', { exact: true, selector: 'span' }))
    expect(screen.getByLabelText('Exit history')).toBeInTheDocument()

    await user.keyboard('x')
    expect(screen.queryByLabelText('Exit history')).not.toBeInTheDocument()
  })
})

describe('waffle PlayArea — a swap in flight', () => {
  // A slow submit_swap with no feedback invites re-tapping the same two tiles,
  // which queues the REVERSE swap. What this pins is the whole sequence in
  // plans/tile-feedback.md — the MOVE shows at once, its VERDICT does not, and
  // the marks last until the swap's row arrives in the blob rather than until
  // the RPC promise resolves.
  it('shows the move at once, unjudged and dimmed, until the swap\'s row lands', async () => {
    const user = userEvent.setup()
    let settle!: (v: typeof okEnvelope) => void
    rpc.mockImplementation((fn: string) =>
      fn === 'submit_swap'
        ? new Promise((resolve) => {
            settle = resolve
          })
        : Promise.resolve({ error: null }),
    )
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)

    // The deal: 'b' then 'a', both yellow; cell 2 'c' green.
    const tiles = boardTiles()
    await user.click(tiles[0]!)
    await user.click(tiles[1]!)
    expect(rpc).toHaveBeenCalledWith('submit_swap', { p_game_id: 'g1', p_pos_a: 0, p_pos_b: 1 })

    // The MOVE, immediately: the two letters have traded places.
    expect(tiles[0]).toHaveTextContent('a')
    expect(tiles[1]).toHaveTextContent('b')
    // …but NOT its verdict: both cells drop their stale color for the unjudged
    // fill, and dim to say they're with the server.
    expect(tiles[0]!.className).toMatch(/inFlight/)
    expect(tiles[0]!.className).toMatch(/dimInFlight/)
    expect(tiles[1]!.className).toMatch(/dimInFlight/)
    // A tile nobody touched keeps its color.
    expect(tiles[2]!.className).toMatch(/wordleGreen/)

    // The did-I-misclick re-tap (the reverse swap) is dropped.
    await user.click(tiles[0]!)
    await user.click(tiles[1]!)
    expect(rpc).toHaveBeenCalledTimes(1)

    // The RPC resolving is NOT the end of it — the colors haven't arrived yet.
    await act(async () => settle(okEnvelope))
    expect(tiles[0]!.className).toMatch(/dimInFlight/)

    // The blob carrying the swap's row is what ends it: the dim lifts, the
    // letters stay put, and the answered cells take the attention flash.
    rerender(<PlayAreaLoader {...makeCtx({
      board: ZTest_SOLVED,
      events: [ZTest_swap(1, 'u1', [0, 1], ZTest_DEALT, ALL_GREEN)],
    })} />)
    expect(tiles[0]!.className).not.toMatch(/dimInFlight/)
    expect(tiles[0]).toHaveTextContent('a')
    expect(tiles[0]!.className).toMatch(/attentionFlash/)
    expect(tiles[2]!.className).not.toMatch(/attentionFlash/)

    // …and input is open again.
    await user.click(tiles[0]!)
    await user.click(tiles[2]!)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  // A Restart re-deals every cell, so a board DIFF sees changes at the one
  // moment nothing has been played. The flash reads the CAUSE instead — the
  // swap count, which a Restart zeroes (common/board-marks/useChangeCause).
  it('says nothing when the board is re-dealt rather than played', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({
      board: ZTest_SOLVED,
      events: [ZTest_swap(1, 'u1', [0, 1], ZTest_DEALT, ALL_GREEN)],
    })} />)
    rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(boardTiles().some((t) => /attentionFlash/.test(t.className))).toBe(false)
  })

  it('takes the letters back when the swap is refused', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue({
      error: null,
      data: {
        type: 'not-ok', data: null, outcome: null, severity: 'race',
        message: 'Game over', field: '_', meta: null, dbcode: 'PN486', detail: null,
      },
    })
    render(<PlayAreaLoader {...makeCtx()} />)

    const tiles = boardTiles()
    await user.click(tiles[0]!)
    await user.click(tiles[1]!)

    // Optimism is about ACCEPTANCE, so a refusal is the price: the letters go
    // back where they were.
    await waitFor(() => expect(tiles[0]).toHaveTextContent('b'))
    expect(tiles[1]).toHaveTextContent('a')
    expect(tiles[0]!.className).not.toMatch(/dimInFlight/)
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is an action's, so
 * what these pin is the wiring: the chord reaches the action, the action asks
 * the registry's question mid-game and skips it once the game has ended, and
 * the answer runs the same call the button does.
 */
describe('waffle PlayArea — the keys', () => {
  it('+ once the game has ended starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ error: null, data: { type: 'ok', data: { result: 'created', id: 'next-game-id' } } })
    const ctx = makeCtx(SOLO_LOST)
    render(<WithKeys {...ctx} />)

    press(PLUS)
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'waffle-build-board',
        expect.objectContaining({ target_club: 'testclub', player_user_ids: ['u1'], mode: 'coop' }),
      ),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and Keep playing starts nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )

    press(PLUS)
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    await waitFor(() => expect(screen.queryByText('Start a new game?')).not.toBeInTheDocument())
    expect(startEdgeFn).not.toHaveBeenCalled()
  })

  it('⌥⌫ in coop asks to stop the game, and yes calls stop_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    await answer(user, 'Stop game')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks to concede, and yes calls concede', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('stop_game', expect.anything())
  })

  describe('Restart mid-game', () => {
    // Keyless, so it is fired as the menu row would fire it: the action's run,
    // which is where the registry's question is asked.
    it('asks first, and Keep playing wipes nothing', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayAreaLoader {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => getAction('act-restart').run())
      expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep playing' }))
      await waitFor(() => expect(screen.queryByText('Restart this game?')).not.toBeInTheDocument())
      expect(rpc).not.toHaveBeenCalledWith('replay_board', expect.anything())
    })

    it('yes calls replay_board', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayAreaLoader {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => getAction('act-restart').run())
      await answer(user, 'Restart')
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    })
  })
})

/**
 * The keyboard's selection cursor. Positions run row by row, five across, and
 * 6, 8, 16 and 18 are holes, which have no tile. Arrows move the ring, Space
 * picks up to two tiles, and Enter swaps them — the second pick waits, where
 * the second tap is the swap.
 */
describe('waffle PlayArea — the selection cursor', () => {
  const HOLES = [6, 8, 16, 18]
  /** The tile at a board position (holes are not tiles). */
  const tileAt = (pos: number) => boardTiles()[pos - HOLES.filter((h) => h < pos).length]!
  const positions = Array.from({ length: 25 }, (_, p) => p).filter((p) => !HOLES.includes(p))
  const ringed = () => positions.filter((p) => /selectionCursor/.test(tileAt(p).className))
  const picked = () => positions.filter((p) => /picked/.test(tileAt(p).className))
  // Awaited: an action's run settles a microtask after the keystroke.
  const key = (k: string) => act(async () => press({ key: k }))
  const swapsSent = () => rpc.mock.calls.filter(([fn]) => fn === 'submit_swap')

  it('is hidden until an arrow; the first arrow rings the first tile, and an arrow jumps a hole', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(ringed()).toEqual([])

    await key('ArrowRight')
    expect(ringed()).toEqual([0])
    await key('ArrowRight')
    expect(ringed()).toEqual([1])
    // Down from 1 is the hole at 6; the ring lands on 11 beyond it.
    await key('ArrowDown')
    expect(ringed()).toEqual([11])
  })

  it('two picks wait, and Enter swaps them', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key(' ')
    expect(picked()).toEqual([])

    await key('ArrowRight')
    await key(' ')
    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual([0, 1])
    expect(swapsSent()).toEqual([])

    await key('Enter')
    expect(rpc).toHaveBeenCalledWith('submit_swap', expect.objectContaining({ p_pos_a: 0, p_pos_b: 1 }))
    expect(picked()).toEqual([])
  })

  it('names Enter "Swap" for the key list', () => {
    render(<WithKeys {...makeCtx()} />)
    expect(getAction('act-submit').describe('help').label).toBe('Swap')
  })

  it('a third pick is refused; Space on a picked tile un-picks it', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key(' ')
    await key('ArrowRight')
    await key(' ')
    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual([0, 1])

    await key('ArrowLeft')
    await key(' ')
    expect(picked()).toEqual([0])
  })

  it('⌫ drops the picks', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key(' ')
    await key('Backspace')
    expect(picked()).toEqual([])
  })

  it('a tap on one keyboard pick swaps the two, as a second tap does', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key(' ')
    await user.click(tileAt(2))
    expect(rpc).toHaveBeenCalledWith('submit_swap', expect.objectContaining({ p_pos_a: 0, p_pos_b: 2 }))
  })

  it('a tap with two keyboard picks starts over from the tapped tile, and hides the ring', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key(' ')
    await key('ArrowRight')
    await key(' ')
    await user.click(tileAt(3))
    expect(picked()).toEqual([3])
    expect(swapsSent()).toEqual([])
    expect(ringed()).toEqual([])

    await key('ArrowLeft')
    expect(ringed()).toEqual([3])
  })

  // The swap stays in flight until its row arrives, which it never does here —
  // so every way of making another swap is quiet.
  it('Space and Enter do nothing while a swap is in flight', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key(' ')
    await key('ArrowRight')
    await key(' ')
    await key('Enter')
    expect(swapsSent()).toHaveLength(1)

    await key(' ')
    await key('ArrowLeft')
    await key(' ')
    expect(picked()).toEqual([])
    await key('Enter')
    expect(swapsSent()).toHaveLength(1)
  })

  it('a board I cannot play takes no ring and no keys', async () => {
    // A teammate holds the move.
    render(<WithKeys {...makeCtx({ players: twoMembers, turnHolderId: 'u2' })} />)
    await key('ArrowRight')
    await key(' ')
    expect(ringed()).toEqual([])
    expect(picked()).toEqual([])
    expect(getAction('act-submit').describe('help').state).toBe('hidden')
  })
})
