// cs-unmet

/**
 * Guard test for codenamesduet's guess dispatch: a second
 * guess while one is already in flight must NOT fire a second `submit_guess`.
 *
 * The board disables the *pending* tile once `setPendingPos` re-renders, but that
 * (a) is async — it misses a same-tick double-tap — and (b) only disables the ONE
 * clicked tile, so clicking a DIFFERENT tile mid-guess still fires. The synchronous
 * `guessInFlight` ref closes both windows; this test exercises the second (click a
 * different tile while the first guess is in flight).
 *
 * `useGame` / `useBoard` / `useClues` / `db` are mocked; the game state is set up
 * as "my turn to guess" (I'm the guesser seat B; peer seat A gave the clue), so the
 * tiles are clickable.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { ACTIONS } from '@/common/actions/registry'
import { liveBindings } from '@/common/actions/useBoundAction'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// Whose turn it is, and whether the clue is in — mutable holders so a test can
// seat me as the GUESSER (the default: peer A gave the clue, I'm B) or as the
// CLUE-GIVER (I'm the giver and no clue is written yet).
const g = vi.hoisted(() => ({
  game: { current_clue_giver: 'A', turn_number: 1 },
  clues: [{ turn_number: 1, word: 'fruit', count: 2 }] as { turn_number: number; word: string; count: number }[],
}))
vi.mock('../hooks/useGame', () => ({
  useGame: () => ({
    game: g.game,
    players: [
      { user_id: 'me', seat: 'B', username: 'me', color: 'red' },
      { user_id: 'peer', seat: 'A', username: 'peer', color: 'blue' },
    ],
  }),
}))
// The third argument is "show me the partner's key card" — the ONE thing the
// terminal reveal does, since useBoard is what turns it into `peerKey`. Recorded
// so the reveal tests can assert on it (the hook itself is mocked out).
const peerKeyArgs = vi.hoisted(() => ({ calls: [] as boolean[] }))
vi.mock('../hooks/useBoard', () => ({
  // A full 5×5 board (PlayArea gates on `words.length >= 25`). Positions 0/1 are
  // the tiles we click; the rest are filler. All unrevealed → all clickable.
  useBoard: (_gameId: string, _userId: string, showPeerKey: boolean) => (
    peerKeyArgs.calls.push(showPeerKey), {
    words: Array.from({ length: 25 }, (_, i) => ({
      position: i,
      word: i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`,
      revealed_as: null,
      neutral_a: false,
      neutral_b: false,
    })),
    guesses: [],
    myKey: Array.from({ length: 25 }, () => 'N'),
    peerKey: null,
    myAgentsDone: false,
    peerAgentsDone: false,
    loading: false,
  }
  ),
}))
vi.mock('../hooks/useClues', () => ({
  useClues: () => ({ clues: g.clues }),
}))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** Seat me as the clue-giver with the clue still to write. */
function asClueGiver() {
  g.game = { current_clue_giver: 'B', turn_number: 1 }
  g.clues = []
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
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
 *  draw, keyed by action id. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'me' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'TinySpy',
    players: [],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { turns: 9, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: {
      setGameSections: vi.fn(),
      actHelp: boundActionFixture('act-help'),
      actChat: boundActionFixture('act-open-chat'),
      actBackToClub: boundActionFixture('act-back-to-club'),
    },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  g.game = { current_clue_giver: 'A', turn_number: 1 }
  g.clues = [{ turn_number: 1, word: 'fruit', count: 2 }]
  rpc.mockReset()
  // Never resolves → the first guess stays "in flight" so we can test the guard.
  rpc.mockReturnValue(new Promise(() => {}))
})

describe('codenamesduet PlayArea — guess in-flight guard', () => {
  it('a second guess while one is in flight does not fire a second submit_guess', () => {
    render(<PlayArea {...makeCtx()} />)
    const apple = screen.getByRole('button', { name: /apple/i })
    const berry = screen.getByRole('button', { name: /berry/i })
    fireEvent.click(apple) // guess in flight (rpc never resolves)
    fireEvent.click(berry) // a DIFFERENT tile — not disabled, but the ref must block it
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', target_position: 0 })
  })
})

/**
 * Input-gating characterization. The board-gate prop (being unified to
 * `readOnly`) controls whether board tiles accept clicks. Pinning the OBSERVABLE
 * effect — tiles clickable during my guess turn, blocked at terminal — so a
 * polarity flip that inverts the gate fails here instead of silently shipping.
 */
describe('codenamesduet PlayArea — input gating', () => {
  it('tiles are clickable during my guess turn', () => {
    render(<PlayArea {...makeCtx()} />) // playing, my turn, clue given → gate open
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })

  it('tiles are blocked at terminal', () => {
    render(<PlayArea {...makeCtx({ playState: 'won', isTerminal: true })} />) // gameOver
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
  })
})

/**
 * The terminal partner-key reveal. Duet's post-mortem is two people thinking out
 * loud — "wait, I was about to pick APPLE" — and that conversation only happens
 * while the card is still covered, so nothing opens it automatically, a win
 * included. The ask is LOCAL: opening the card on both screens at once would
 * end the partner's thinking mid-sentence.
 *
 * `useBoard`'s third argument IS the reveal (it's what produces `peerKey`), so
 * that's what these assert on — the hook itself is mocked.
 */
describe('codenamesduet PlayArea — the terminal partner-key reveal', () => {
  const lastPeerKeyArg = () => peerKeyArgs.calls.at(-1)

  beforeEach(() => {
    peerKeyArgs.calls.length = 0
  })

  it('keeps the card covered at a terminal until I ask — a win included', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(lastPeerKeyArg()).toBe(false)
    // By WHICH action it is — the words are the next tests' subject, not this one's.
    expect(control('act-reveal')).toBeEnabled()
  })

  it('Reveal opens it for me alone, and Hide covers it again', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: "Reveal partner's key" }))
    expect(lastPeerKeyArg()).toBe(true)
    // Local state: no RPC, so the partner's own card stays covered.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: "Hide partner's key" }))
    expect(lastPeerKeyArg()).toBe(false)
  })

  it('the menu twin is the same toggle, and inert mid-game', async () => {
    const live = makeCtx()
    const { unmount } = render(<PlayArea {...live} />)
    // Mid-game the partner's card is the whole game — nothing to reveal.
    expect(menuItems(live).get('act-reveal')?.disabled).toBe(true)
    unmount()

    const done = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('act-reveal')?.label).toBe("Reveal partner's key")
    act(() => menuItems(done).get('act-reveal')!.run())
    expect(lastPeerKeyArg()).toBe(true)
    await waitFor(() => expect(menuItems(done).get('act-reveal')?.label).toBe("Hide partner's key"))
  })
})

/**
 * The two role-specific controls. Stopping your guesses is an ordinary
 * every-turn decision in duet, so the guesser's Pass is a plain primary button
 * — `act-end-turn`, whose registry row carries no tone, rather than scrabble's
 * amber `act-pass`. Asking Claude for a clue is the clue-giver's alone.
 */
describe('codenamesduet PlayArea — the guesser’s Pass and the giver’s AI', () => {
  it('the guesser’s Pass is a primary, normal-toned button', () => {
    render(<PlayArea {...makeCtx()} />)
    const pass = control('act-end-turn')!
    expect(pass).toBeEnabled()
    // Weight and tone are the module's class keys — the CSS-module proxy keeps
    // the key's name in the hashed class.
    expect(pass.className).toMatch(/primary/)
    expect(pass.className).toMatch(/normal/)
    expect(pass.className).not.toMatch(/caution/)
    // …and the registry row it draws from names no tone of its own.
    expect(liveBindings().find((b) => b.id === 'act-end-turn')?.spec).toBe(ACTIONS['act-end-turn'])
    expect(ACTIONS['act-end-turn']).not.toHaveProperty('tone')
  })

  it('Suggest a clue is the clue-giver’s and not the guesser’s', () => {
    const { unmount } = render(<PlayArea {...makeCtx()} />)
    expect(control('act-suggest-clue')).toBeNull()
    expect(liveBindings().some((b) => b.id === 'act-suggest-clue')).toBe(false)
    unmount()

    asClueGiver()
    render(<PlayArea {...makeCtx()} />)
    expect(control('act-suggest-clue')).toBeEnabled()
    // The giver has no guesses to stop.
    expect(control('act-end-turn')).toBeNull()
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped. Duet is coop-only, so `⌥⌫` is always End.
 */
describe('codenamesduet PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ at terminal samples the next board with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : new Promise(() => {}),
    )
    const ctx = makeCtx({ isTerminal: true, playState: 'won' })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', expect.objectContaining({ target_club: 'testclub' })),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('codenamesduet', 'next-game-id'))
  })

  it('+ mid-game asks first, and cancel samples nothing', async () => {
    const user = userEvent.setup()
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

  it('⌥⌫ asks End game’s question; yes calls end_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('End this game?')).toBeInTheDocument()
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = screen.getAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('Restart mid-game asks, and goes straight through at terminal', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = makeCtx()
    const { unmount } = render(
      <>
        <PlayArea {...live} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(live).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
    unmount()

    // No host this time: the RPC firing proves no question was asked.
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
    await user.click(control('act-restart')!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })
})
