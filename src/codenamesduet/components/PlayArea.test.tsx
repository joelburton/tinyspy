// cs-met-codenamesduet

/**
 * Render + behavior tests for codenamesduet's play surface, mounted through the
 * loader: the guess in-flight guard, the tiles' input gate, the partner-key
 * reveal, the action row and the menu, the header's lines about the partner,
 * the two role-specific controls, and the commands through the dispatcher.
 *
 * `useGame` / `useBoard` / `db` are mocked; by default the game is "my turn to
 * guess" (I'm the guesser seat B; peer seat A gave the clue), so the tiles are
 * clickable.
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
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { db } from '../db'
import { PlayAreaLoader } from './PlayArea'

// Whose turn it is, and whether the clue is in — mutable holders so a test can
// seat me as the GUESSER (the default: peer A gave the clue, I'm B) or as the
// CLUE-GIVER (I'm the giver and no clue is written yet).
const g = vi.hoisted(() => {
  const PEER_CLUE = {
    kind: 'clue' as const, id: 1, user_id: 'peer', took_turn: false,
    created_at: '2026-01-01T00:00:00Z', turn_number: 1, seat: 'A' as const,
    clue_word: 'fruit', clue_count: 2, clue_from_ai: false,
  }
  return {
    PEER_CLUE,
    game: { current_clue_giver: 'A', turn_number: 1, user_a_id: 'peer', user_b_id: 'me' },
    events: [PEER_CLUE] as unknown[],
    agentsDone: { mine: false, peer: false },
    // Positions turned over as agents — the board a guess has changed.
    agentsAt: [] as number[],
  }
})
// The game row seats peer as A and me as B; the names come from the shell's
// `players` (makeCtx's), as they do on the page.
vi.mock('../hooks/useGame', () => ({
  useGame: () => ({ game: g.game }),
}))
// The third argument is "show me the partner's key card" — the ONE thing the
// terminal reveal does, since useBoard is what turns it into `peerKey`. Recorded
// so the reveal tests can assert on it (the hook itself is mocked out).
const peerKeyArgs = vi.hoisted(() => ({ calls: [] as boolean[] }))
vi.mock('../hooks/useBoard', () => ({
  // A full 5×5 board (the loader gates on `words.length >= 25`). Positions 0/1 are
  // the tiles we click; the rest are filler. All unrevealed → all clickable.
  useBoard: (_gameId: string, _userId: string, showPeerKey: boolean) => (
    peerKeyArgs.calls.push(showPeerKey), {
    words: Array.from({ length: 25 }, (_, i) => ({
      position: i,
      word: i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`,
      revealed_as: g.agentsAt.includes(i) ? 'G' : null,
      neutral_a: false,
      neutral_b: false,
    })),
    events: g.events,
    myKey: Array.from({ length: 25 }, () => 'N'),
    peerKey: null,
    myAgentsDone: g.agentsDone.mine,
    peerAgentsDone: g.agentsDone.peer,
    loading: false,
  }
  ),
}))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// What PlayArea tells the bell, per state; the ring on arrival is
// `useTurnBell`'s own spec.
const turnBell = vi.hoisted(() => vi.fn())
vi.mock('@/common/sounds/useTurnBell', () => ({ useTurnBell: turnBell }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** Seat me as the clue-giver with the clue still to write. */
function asClueGiver() {
  g.game = { current_clue_giver: 'B', turn_number: 1, user_a_id: 'peer', user_b_id: 'me' }
  g.events = []
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
    players: [
      { user_id: 'me', username: 'me', color: 'red' },
      { user_id: 'peer', username: 'peer', color: 'blue' },
    ],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { turns: 9, timer: { kind: 'none' } },
    status: null,
    globalFeedbackSlot: createFeedbackSlot('global'),
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
  g.game = { current_clue_giver: 'A', turn_number: 1, user_a_id: 'peer', user_b_id: 'me' }
  g.events = [g.PEER_CLUE]
  g.agentsDone = { mine: false, peer: false }
  g.agentsAt = []
  rpc.mockReset()
  // Never resolves → the first guess stays "in flight" so we can test the guard.
  rpc.mockReturnValue(new Promise(() => {}))
})

/**
 * A second guess while one is in flight fires no second `submit_guess`. A
 * tile's `disabled` follows `pendingPos` a render late, and covers only the tile
 * clicked; `useSingleFlight` closes both. This clicks a DIFFERENT tile.
 */
describe('codenamesduet PlayArea — guess in-flight guard', () => {
  it('a second guess while one is in flight does not fire a second submit_guess', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    const apple = screen.getByRole('button', { name: /apple/i })
    const berry = screen.getByRole('button', { name: /berry/i })
    fireEvent.click(apple) // guess in flight (rpc never resolves)
    fireEvent.click(berry) // a DIFFERENT tile — not disabled, but the ref must block it
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', target_position: 0 })
  })
})

/**
 * A refused guess is said where I am looking: the server's own sentence in the
 * local slot under the board.
 */
describe('codenamesduet PlayArea — a refused guess', () => {
  it('shows the server’s sentence in the local slot', async () => {
    rpc.mockReturnValue(Promise.resolve({
      data: {
        type: 'not-ok', data: null, outcome: 'warning', severity: 'race',
        message: 'That word is already revealed', field: null, meta: null,
        dbcode: 'PN382', detail: null,
      },
      error: null,
    }))
    render(<PlayAreaLoader {...makeCtx()} />)
    fireEvent.click(screen.getByRole('button', { name: /apple/i }))
    expect(await screen.findByText('That word is already revealed')).toBeInTheDocument()
  })
})

/**
 * The tiles' input gate, by its observable effect — clickable during my guess
 * turn, blocked at terminal — so a flip that inverts the gate fails here.
 */
describe('codenamesduet PlayArea — input gating', () => {
  it('tiles are clickable during my guess turn', () => {
    render(<PlayAreaLoader {...makeCtx()} />) // playing, my turn, clue given → gate open
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })

  it('tiles are blocked at terminal', () => {
    render(<PlayAreaLoader {...makeCtx({ playState: 'won', isTerminal: true })} />) // gameOver
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
  })

  it('tiles are blocked while a past turn is open on the board', () => {
    render(<PlayAreaLoader {...makeCtx()} />) // my guess turn: the gate is open
    fireEvent.click(screen.getByText('#1'))
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
  })

  it('in sudden death, tiles are open to either seat — the one holding the clue too', () => {
    asClueGiver()
    render(<PlayAreaLoader {...makeCtx({ playState: 'sudden_death' })} />)
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })
})

/**
 * The bell: it is my turn when there is something for me to do — a clue to
 * give, or one to guess from — and never in sudden death or once it is over.
 */
describe('codenamesduet PlayArea — the turn bell', () => {
  const lastTurn = () => turnBell.mock.calls.at(-1)?.[0]

  it('is my turn as the guesser once the clue is in', () => {
    render(<PlayAreaLoader {...makeCtx()} />) // peer A clued; I guess
    expect(lastTurn()).toBe(true)
  })

  it('is my turn as the clue-giver before my clue, and not after it', () => {
    asClueGiver()
    const view = render(<PlayAreaLoader {...makeCtx()} />)
    expect(lastTurn()).toBe(true)
    g.events = [{ ...g.PEER_CLUE, user_id: 'me', seat: 'B' }]
    view.rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(lastTurn()).toBe(false)
  })

  it('is not my turn while my partner writes the clue', () => {
    g.events = []
    render(<PlayAreaLoader {...makeCtx()} />) // peer A holds the clue seat
    expect(lastTurn()).toBe(false)
  })

  it('is nobody’s turn in sudden death, or once the game is over', () => {
    const view = render(<PlayAreaLoader {...makeCtx({ playState: 'sudden_death' })} />)
    expect(lastTurn()).toBe(false)
    view.rerender(<PlayAreaLoader {...makeCtx({ playState: 'won', isTerminal: true })} />)
    expect(lastTurn()).toBe(false)
  })
})

/**
 * The board's turn dim and game-over frame, as PlayArea decides them: dimmed
 * only while my partner holds the move — not while I write the clue, since the
 * clue is written from the board — and never in sudden death or at the end.
 */
describe('codenamesduet PlayArea — the board marks', () => {
  const grid = () => document.querySelector('[data-board] > div') as HTMLElement

  it('dims the board while my partner writes the clue, not while I guess', () => {
    g.events = []
    const view = render(<PlayAreaLoader {...makeCtx()} />) // peer A holds the clue seat
    expect(grid().className).toMatch(/dimNotYourTurn/)
    g.events = [g.PEER_CLUE]
    view.rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
  })

  it('flashes the frame as the clue arrives for me to guess from', () => {
    g.events = []
    const view = render(<PlayAreaLoader {...makeCtx()} />)
    expect(grid().className).not.toMatch(/yourTurnFlash/)
    g.events = [g.PEER_CLUE]
    view.rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(grid().className).toMatch(/yourTurnFlash/)
  })

  it('flashes the tile a guess turned over, reading the guess log', () => {
    const view = render(<PlayAreaLoader {...makeCtx()} />)
    g.agentsAt = [1]
    g.events = [
      g.PEER_CLUE,
      { kind: 'guess', id: 2, user_id: 'me', took_turn: false, created_at: '2026-01-01T00:00:01Z',
        turn_number: 1, seat: 'B', guess_position: 1, guess_result: 'G' },
    ]
    view.rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByRole('button', { name: /berry/i }).className).toMatch(/attentionFlash/)
    expect(screen.getByRole('button', { name: /apple/i }).className).not.toMatch(/attentionFlash/)
  })

  it('does not dim the board while I write the clue', () => {
    asClueGiver()
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
  })

  it('dims nothing in sudden death, and frames the finished board in its outcome', () => {
    g.events = []
    const view = render(<PlayAreaLoader {...makeCtx({ playState: 'sudden_death' })} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
    view.rerender(<PlayAreaLoader {...makeCtx({ playState: 'lost_assassin', isTerminal: true })} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
    expect(grid().className).toMatch(/gameOverLost/)
  })
})

/**
 * The finished-player banner: each player told, in the info column, when one
 * of them has found all their agents — and only while clues are still given.
 */
describe('codenamesduet PlayArea — the finished-player banner', () => {
  it('tells me my partner now gives every clue, when my agents are all found', () => {
    g.agentsDone = { mine: true, peer: false }
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByText(/gives every remaining\s+clue — your agents are all found/)).toBeInTheDocument()
    expect(screen.queryByText(/has no agents left/)).not.toBeInTheDocument()
  })

  it('tells me I now give every clue, when my partner’s are', () => {
    g.agentsDone = { mine: false, peer: true }
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByText(/has no agents left — you\s+give every remaining clue/)).toBeInTheDocument()
    expect(screen.queryByText(/your agents are all found/)).not.toBeInTheDocument()
  })

  it('says nothing in sudden death, where nobody clues', () => {
    g.agentsDone = { mine: true, peer: true }
    render(<PlayAreaLoader {...makeCtx({ playState: 'sudden_death' })} />)
    expect(screen.queryByText(/your agents are all found/)).not.toBeInTheDocument()
    expect(screen.queryByText(/has no agents left/)).not.toBeInTheDocument()
  })
})

/**
 * The terminal partner-key reveal: nothing opens the card automatically, a win
 * included, and the ask is LOCAL — it opens only on my screen.
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
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(lastPeerKeyArg()).toBe(false)
    // By WHICH action it is — the words are the next tests' subject, not this one's.
    expect(control('act-reveal')).toBeEnabled()
  })

  it('Reveal opens it for me alone, and Hide covers it again', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: "Reveal key cards" }))
    expect(lastPeerKeyArg()).toBe(true)
    // Local state: no RPC, so the partner's own card stays covered.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: "Hide key cards" }))
    expect(lastPeerKeyArg()).toBe(false)
  })

  it('the menu twin is the same toggle, and inert mid-game', async () => {
    const live = makeCtx()
    const { unmount } = render(<PlayAreaLoader {...live} />)
    // Mid-game the partner's card is the whole game — nothing to reveal.
    expect(menuItems(live).get('act-reveal')?.disabled).toBe(true)
    unmount()

    const done = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayAreaLoader {...done} />)
    expect(menuItems(done).get('act-reveal')?.label).toBe("Reveal key cards")
    act(() => menuItems(done).get('act-reveal')!.run())
    expect(lastPeerKeyArg()).toBe(true)
    await waitFor(() => expect(menuItems(done).get('act-reveal')?.label).toBe("Hide key cards"))
  })
})

/**
 * The info column's ONE action row: every action placed once, each deciding
 * for itself whether its button shows. While the game runs: End and Back to
 * club. At the end: Reveal, Restart, New game and Back to club. Restart, New
 * game and Reveal stay menu rows all game — "not in the menu" would be
 * `?.hidden === true`, and these are not hidden there.
 */
describe('codenamesduet PlayArea — the action row', () => {
  const ROW = ['act-reveal', 'act-restart', 'act-new-game', 'act-concede', 'act-end-game', 'act-back-to-club']
  const buttons = () => ROW.filter((id) => control(id) !== null)

  it('while the game runs: End and Back to club — the rest are the menu\u2019s', () => {
    const live = makeCtx()
    render(<PlayAreaLoader {...live} />)
    expect(buttons()).toEqual(['act-end-game', 'act-back-to-club'])
    for (const id of ['act-reveal', 'act-restart', 'act-new-game']) {
      expect(menuItems(live).get(id)?.hidden).not.toBe(true)
    }
  })

  it('at the end: Reveal, Restart, New game and Back to club — End is gone', () => {
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
    expect(buttons()).toEqual(['act-reveal', 'act-restart', 'act-new-game', 'act-back-to-club'])
  })

  it('the menu lists them in the row\u2019s order', () => {
    const live = makeCtx()
    render(<PlayAreaLoader {...live} />)
    const ids = [...menuItems(live).keys()]
    const order = ['act-reveal', 'act-restart', 'act-new-game'].map((id) => ids.indexOf(id))
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })
})

/**
 * The header's lines about the partner: where the turn stands, held for as long
 * as it holds, and — once, as it lands — the partner asking the AI for a clue.
 */
describe('codenamesduet PlayArea — the partner, in the header', () => {
  const texts = (ctx: GamePageCtx) =>
    ctx.globalFeedbackSlot.peek().map((entry) => entry.message.text)

  it('says what the partner is doing now', () => {
    const ctx = makeCtx() // peer A gave the clue; I guess
    render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).toContain('waiting for you')
  })

  it('says nothing about the turn once the game is over', () => {
    const ctx = makeCtx({ playState: 'lost_clock', isTerminal: true })
    render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).not.toContain('waiting for you')
  })

  it('narrates a partner’s hint as it lands, and not the ones already there on load', () => {
    const ctx = makeCtx()
    const hint = (id: number) => ({
      kind: 'hint' as const, id, user_id: 'peer', took_turn: false,
      created_at: '2026-01-01T00:00:00Z', turn_number: 1, seat: 'A' as const,
    })
    g.events = [g.PEER_CLUE, hint(2)]
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).not.toContain('got hint')

    g.events = [g.PEER_CLUE, hint(2), hint(3)]
    rerender(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).toContain('got hint')
    g.events = [g.PEER_CLUE]
  })

  it('does not narrate a hint of MINE, however it lands', () => {
    const ctx = makeCtx()
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    g.events = [g.PEER_CLUE, {
      kind: 'hint' as const, id: 2, user_id: 'me', took_turn: false,
      created_at: '2026-01-01T00:00:00Z', turn_number: 1, seat: 'B' as const,
    }]
    rerender(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).not.toContain('got hint')
    g.events = [g.PEER_CLUE]
  })
})

/**
 * The two role-specific controls: the guesser's Pass is a plain primary button
 * (`act-end-turn`, whose registry row carries no tone), and asking Claude for a
 * clue is the clue-giver's alone.
 */
describe('codenamesduet PlayArea — the guesser’s Pass and the giver’s AI', () => {
  it('the guesser’s Pass is a primary, normal-toned button', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
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
    const { unmount } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(control('act-suggest-clue')).toBeNull()
    expect(liveBindings().some((b) => b.id === 'act-suggest-clue')).toBe(false)
    unmount()

    asClueGiver()
    render(<PlayAreaLoader {...makeCtx()} />)
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
    // The next board is for this game's two players, on this game's setup.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', expect.objectContaining({
        target_club: 'testclub',
        player_user_ids: ['me', 'peer'],
        setup: expect.objectContaining({ turns: 9 }),
      })),
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
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
    await user.click(control('act-restart')!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })
})
