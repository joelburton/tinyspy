// cs-met-wordle

/**
 * wordle's play surface, mounted for real: does it render in coop, in compete
 * and at terminal, and does each surface on it do what its docstring says —
 * the action row per mode and state, Reveal and Hide, the celebration, the
 * peer narration, the picker's labels, the board-scope marks, the flip, and
 * the keys.
 *
 * The smoke cases exist because a removed prop that was still referenced once
 * shipped a BLANK PAGE — a runtime `ReferenceError` that no type check
 * surfaces — and a one-line `render()` catches that class of bug instantly.
 * Game logic is not here: the rules live in pgTAP (the RPCs), and what a move
 * reads as in `lib/answer.test.ts`.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the grid, keyboard, lists, dialogs — renders for real.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import type { WordleGame, WordlePlayerState, EventRow } from '../hooks/useGame'
import { db } from '../db'
import { db as commonDb } from '@/common/supabase/db'
import { PlayAreaLoader } from './PlayArea'
import { filterOptions, pickFilter } from '@/common/lists/filterSelectHelpers'

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// The common client is mocked so the reveal tests can assert that NOTHING is
// written when the answer is shown — a wordle-schema spy alone couldn't tell a
// common RPC from no RPC at all.
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const commonRpc = commonDb.rpc as unknown as ReturnType<typeof vi.fn>

const me: WordlePlayerState = { user_id: 'u1', guesses_used: 0, solved: false, solved_at: null }
const moth: WordlePlayerState = { user_id: 'u2', guesses_used: 0, solved: false, solved_at: null }

/** Two club members, for the peer-narration tests (the lookup is by ctx.players). */
const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

/** A loaded game-hook result; override the game header + player states per test. */
function loaded(
  game: WordleGame,
  guesses: EventRow[] = [],
  playerStates: WordlePlayerState[] = [me],
): GameHook {
  return { game, playerStates, guesses, loading: false, failure: null }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'WordNerd',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    // A realistic setup blob — the info-column disclosure reads it (a `{}` here
    // would crash timerLabel, exactly the kind of render bug these tests guard).
    setup: { max_guesses: 6, answer_source: 0, legal_guess: 4, timer: { kind: 'none' } },
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
  }
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: wordle's guess keys are bound actions, and a
 *  bare `render` binds them with nothing feeding them keys. */
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

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What a bound action says about itself right now. */
const stateOf = (id: string) => liveBindings().find((b) => b.id === id)?.describe('button').state

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)!

beforeEach(() => {
  h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  commonRpc.mockReset()
  commonRpc.mockResolvedValue({ error: null })
})

describe('wordle PlayArea — render smoke', () => {
  it('renders the board + an event-log row in coop play', () => {
    // A landed guess exercises the GameEventLog row (squares + who cell), not
    // just the empty state.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxgyx', is_correct: false },
    ])
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  it('renders the board in compete play', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null })
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  /**
   * The wiring from a server code to a class key: SLATE against `xxgyx` is s·l
   * gray, a GREEN, t YELLOW, e gray, and all three judged states must reach the
   * DOM at both scopes — the board tile and the key for the same letter.
   *
   * What it does NOT prove is that those classes EXIST in the stylesheets.
   * `vitest.config.ts` sets `css: false`, so a CSS module is a proxy that
   * fabricates `_<key>_<hash>` for whatever key is asked of it — rename
   * `.wordleYellow` out of the stylesheet and this still passes, which was
   * checked rather than assumed. That half is guarded statically, against the
   * files themselves, in shared/wordle-style/tileColor.test.ts.
   */
  it('routes each judged code to its class key, on the board and the keyboard', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxgyx', is_correct: false },
    ])
    render(<PlayAreaLoader {...makeCtx()} />)
    const painted = [...screen.getByRole('grid', { name: /board/i }).querySelectorAll('*')]
      .map((el) => el.className)
      .join(' ')
    expect(painted).toMatch(/wordleGreen/)
    expect(painted).toMatch(/wordleYellow/)
    expect(painted).toMatch(/wordleGray/)
    // The keyboard reads the same vocabulary — `Exclude<TileColor, 'blank'>`.
    expect(screen.getByRole('button', { name: /^a$/i }).className).toMatch(/wordleGreen/)
    expect(screen.getByRole('button', { name: /^t$/i }).className).toMatch(/wordleYellow/)
  })

  it('renders the terminal state without crashing', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
    // The info-column outcome line, and — since this is a coop WIN — the answer
    // line with it: solving is the one thing that shows the word unasked.
    expect(screen.getByText('Solved it!')).toBeInTheDocument()
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
  })
})

/**
 * The icon-only action row (labels live in tooltips): ONE row, every action
 * listed once, and which buttons show is each action's own answer — Concede /
 * End and Back-to-club (via the shell's suspend-confirm flow, NOT direct
 * navigation) while playing; Reveal, Restart and New game join at terminal.
 * New game = a fresh create_game with THIS game's setup/roster/mode (direct RPC
 * — wordle has no edge function), then ctx.goToGame.
 */
describe('wordle PlayArea — icon-only action row', () => {
  const bound = (id: string) => liveBindings().find((b) => b.id === id)!

  // The row is one list; which buttons are on screen is each action's own
  // answer, and the menu asks the same bindings.
  it('Reveal, Restart and New game are menu rows all game, and buttons only at the end', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    render(<PlayAreaLoader {...makeCtx()} />)
    for (const id of ['act-reveal', 'act-restart', 'act-new-game'] as const) {
      expect(bound(id).describe('button').state).toBe('hidden')
      expect(bound(id).describe('menu').state).not.toBe('hidden')
    }
  })

  it('a racer who is done sees Reveal grayed, Concede, and Back to club', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [
      { ...me, solved: true }, moth,
    ])
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByText('Waiting for others')).toBeInTheDocument()
    // Possible here, not right now: the answer waits for the race to end for
    // everyone, and the tooltip says so.
    expect(bound('act-reveal').describe('button').state).toBe('disabled')
    expect(control('act-reveal')).toBeDisabled()
    expect(control('act-concede')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to club' })).toBeInTheDocument()
    // Moving on is still a menu thing until the game is over.
    expect(bound('act-restart').describe('button').state).toBe('hidden')
    expect(bound('act-new-game').describe('button').state).toBe('hidden')
  })

  it('playing row offers Back-to-club — the shell action, which knows to suspend', async () => {
    // ONE binding for both rows: it navigates directly at terminal and routes
    // through the suspend-confirm flow mid-game, so the game picks between no
    // callbacks and cannot pick wrong.
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('terminal "Reveal solution" shows the word for ME, with no RPC and no confirm', async () => {
    commonRpc.mockClear()
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // Local state, full stop: the word is on screen immediately, nothing was
    // written, and no peer's board opened. The absent RPCs are the assertion.
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    expect(commonRpc).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides it again, restoring the column as the game ended', async () => {
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // It wears its other face now — same button, EyeOff glyph, Hide label.
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('SOLVING shows the answer unasked, and the control says it has nothing to do', () => {
    // You can only solve a wordle by typing the answer, so a solver is already
    // looking at it — the info-column line just makes it click-to-define.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' }, [], [
      { ...me, solved: true },
    ])
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    const reveal = screen.getByRole('button', { name: 'Solution already shown' })
    expect(reveal).toBeDisabled()
  })

  it('a terminal I did NOT solve still waits to be asked', () => {
    // The predicate is "did I solve it", never "was the game won" — which is the
    // whole difference in compete, where `won_compete` means SOMEONE won and the
    // racer three guesses off never produced the word.
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      { ...me, solved: false },
    ])
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won_compete' })} />)
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('terminal "New game" button starts a fresh game with this setup/roster/mode', async () => {
    // `createNewGame` calls db.rpc('create_game', …), which answers the envelope
    // itself as one jsonb value (no `.single()`) — mocked for this call only.
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve({
            data: { type: 'ok', data: { result: 'created', id: 'next-game-id' } },
            error: null,
          })
        : Promise.resolve({ error: null }),
    )
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayAreaLoader {...ctx} />)

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        target_club: 'testclub',
        setup: ctx.setup,
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('wordle_coop', 'next-game-id'))
  })
})

/**
 * Terminal flow (the waffle treatment — docs/ui.md → Terminal results). No
 * modal carries the verdict; a win pops the CelebrationBlockingModal at the
 * MOMENT it lands (the playState flip) — the team's in coop, mine in a race —
 * never on mounting an already-won game. And the word stays HIDDEN at a
 * terminal this viewer did not solve until they ask for it — a local,
 * reversible display toggle (useSolutionReveal), no RPC and no peer affected.
 */
describe('wordle PlayArea — terminal flow', () => {
  /** The game sections most recently pushed to the menu, as the ROWS the menu
   *  would draw — a row is a bound action now, so its words, glyph and
   *  availability come from the action rather than from the list. */
  const menuItems = (ctx: GamePageCtx) => {
    const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
    const sections = (calls.at(-1)![0] ?? []) as MenuSection[]
    return sections.flatMap((s) => s.items).map(menuRow)
  }

  it('hides the word on a coop loss (and pops no modal)', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
    expect(screen.getByText('Out of guesses')).toBeInTheDocument()
    // The target is on the client (post-terminal shield-lift) but NOT displayed.
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.queryByText('Game over')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the menu item is the same toggle, and flips its label with the button', async () => {
    commonRpc.mockClear()
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...ctx} />)

    const reveal = menuItems(ctx).find((i) => i.id === 'act-reveal')!
    expect(reveal.disabled).toBeFalsy() // terminal → offered
    expect(reveal.label).toBe('Reveal solution')
    act(() => reveal.run())
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    // The menu is rebuilt on the state flip, so the item now offers the way back.
    await waitFor(() =>
      expect(menuItems(ctx).find((i) => i.id === 'act-reveal')!.label).toBe('Hide solution'),
    )
    // No RPC: this is local display state, not a game move.
    expect(commonRpc).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the menu item is disabled before the game is over for everyone', () => {
    const ctx = makeCtx({ isTerminal: false, playState: 'playing' })
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null })
    render(<PlayAreaLoader {...ctx} />)
    // Nothing to show yet: wordle._target_for withholds the target until the
    // race is over for everyone, so a player who's done can't peek at a live one.
    expect(menuItems(ctx).find((i) => i.id === 'act-reveal')!.disabled).toBe(true)
  })

  it('a Restart puts the answer away again', async () => {
    const user = userEvent.setup()
    const game = { id: 'g1', mode: 'coop' as const, max_guesses: 6, target: 'crane' }
    h.result = loaded(game)
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    // The same word, hunted again — and the answer is gone from the client with
    // it, since `_target_for` stops sending a target the run has not finished.
    h.result = loaded({ ...game, target: null })
    rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
  })

  it('"Restart" at terminal calls replay_board WITHOUT confirming', async () => {
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...ctx} />)

    act(() => menuItems(ctx).find((i) => i.id === 'act-restart')!.run())
    // No ConfirmationHost is mounted, so a question would have stalled the run —
    // the RPC firing proves the shared run asked nothing at terminal.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })

  it('offers Restart in the terminal row (left of Club), calling replay_board unconfirmed', async () => {
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    const restart = screen.getByRole('button', { name: 'Restart' })
    const club = screen.getByRole('button', { name: /club/i })
    expect(restart.compareDocumentPosition(club) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(restart)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })

  it('pops the celebration when the coop win lands mid-session, not on mount', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The winning guess arrives: playState flips to won via realtime.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    rerender(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('dialog', { name: 'Solved! 🎉' })).toBeInTheDocument()
  })

  it('does not celebrate when mounted into an already-won game', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // The race's winner celebrates too — MY win, read off the server's
  // `status.winner_user_id`, never "someone won". The dialog's handle is its
  // title: the pill and the row's line say the verdict in their own words.
  it('celebrates the race I won, at the moment it ends', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    const base = { players: twoMembers }
    const { rerender } = render(<PlayAreaLoader {...makeCtx(base)} />)

    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      { ...me, solved: true },
      moth,
    ])
    rerender(
      <PlayAreaLoader
        {...makeCtx({ ...base, isTerminal: true, playState: 'won_compete', status: { winner_user_id: 'u1' } })}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Solved! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('You solved it in the fewest guesses.')).toBeInTheDocument()
    expect(screen.getByText('You won!')).toBeInTheDocument()
  })

  it('does not celebrate a race somebody else won', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    const base = { players: twoMembers }
    const { rerender } = render(<PlayAreaLoader {...makeCtx(base)} />)

    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      me,
      { ...moth, solved: true },
    ])
    rerender(
      <PlayAreaLoader
        {...makeCtx({ ...base, isTerminal: true, playState: 'won_compete', status: { winner_user_id: 'u2' } })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Opponent won')).toBeInTheDocument()
  })

  it('does not celebrate when mounted into a race already won', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      { ...me, solved: true },
      moth,
    ])
    render(
      <PlayAreaLoader
        {...makeCtx({ players: twoMembers, isTerminal: true, playState: 'won_compete', status: { winner_user_id: 'u1' } })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // The tie-break, inferred from the rows: two solvers on the same count, and
  // the one the server named winner got there first. The loser's words say the
  // clock decided it; the winner's say the same from their side.
  it('a tie on guesses reads as the clock deciding it, on both sides', () => {
    const tied = (winner: string) =>
      makeCtx({
        players: twoMembers,
        isTerminal: true,
        playState: 'won_compete',
        status: { reason: 'solved', winner_user_id: winner },
      })
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      { ...me, solved: true, guesses_used: 3 },
      { ...moth, solved: true, guesses_used: 3 },
    ])
    const { rerender } = render(<PlayAreaLoader {...tied('u2')} />)
    expect(screen.getByText('Lost: beaten on the clock')).toBeInTheDocument()
    expect(screen.getByText('Opponent won (faster)')).toBeInTheDocument()

    rerender(<PlayAreaLoader {...tied('u1')} />)
    expect(screen.getByText('Won: same guesses, but faster')).toBeInTheDocument()
    expect(screen.getByText('You won (faster)')).toBeInTheDocument()
  })

  // A race the clock ended with a solver: the racer still guessing reads that
  // time ran out, from the server's reason and their own unsolved row — not
  // "beaten on guesses", a count they never finished.
  it('a timed-out race tells the racer still guessing that time ran out', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      me,
      { ...moth, solved: true, guesses_used: 3 },
    ])
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: twoMembers,
          isTerminal: true,
          playState: 'won_compete',
          status: { reason: 'timeout', winner_user_id: 'u2' },
        })}
      />,
    )
    expect(screen.getByText('Lost: time ran out')).toBeInTheDocument()
    expect(screen.getByText('Opponent won')).toBeInTheDocument()
  })

  // THE WIRE, end to end: the verdict names the reason the SERVER wrote, not
  // one the page infers from its own clock. An all-conceded race is the case
  // where the two part company — the clock never ran out, so a clock-reading
  // verdict has nothing to say and falls back to "Nobody solved".
  it('an all-conceded race reads status.reason, with the clock still running', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [me, moth])
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: twoMembers,
          isTerminal: true,
          playState: 'lost_compete',
          status: { reason: 'conceded' },
          timer: { displaySeconds: 30, expired: false },
        })}
      />,
    )
    expect(screen.getByText('All conceded — no winner')).toBeInTheDocument()
    expect(screen.getByText('All conceded')).toBeInTheDocument()
  })
})

/**
 * Input-gating characterization. The board-gate prop (`readOnly`) controls
 * whether the on-screen keyboard accepts input. Pinning the OBSERVABLE effect —
 * keyboard enabled during play, disabled
 * at terminal — so a polarity flip that inverts the gate fails here instead of
 * silently shipping (the unit suite otherwise barely exercises gating).
 */
describe('wordle PlayArea — input gating', () => {
  // The on-screen keyboard's 'A' key (letter buttons carry aria-label={ch};
  // board tiles aren't buttons, so this is unambiguous).
  const keyboardKey = () => screen.getByRole('button', { name: /^a$/i })

  it('the on-screen keyboard accepts input during play', () => {
    render(<PlayAreaLoader {...makeCtx()} />) // playing, self is a player → gate open
    expect(keyboardKey()).toBeEnabled()
  })

  it('the on-screen keyboard is blocked at terminal', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />) // gate closed
    expect(keyboardKey()).toBeDisabled()
  })
})

describe('wordle PlayArea — peer narration (global header)', () => {
  /** A real global slot with a spy on its one door, handed to the ctx. */
  function narrationCtx() {
    const globalFeedbackSlot = createFeedbackSlot('global')
    const shown = vi.spyOn(globalFeedbackSlot, 'show')
    return { ctx: makeCtx({ globalFeedbackSlot, players: twoMembers }), shown }
  }

  it("announces a teammate's accepted guess in coop", () => {
    const { ctx, shown } = narrationCtx()
    // First render seeds the seen-set with my own guess (no announcement).
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxxxx', is_correct: false },
    ])
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    shown.mockClear()
    // A teammate's guess lands → narrated in the header, the actor leading.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxxxx', is_correct: false },
      { user_id: 'u2', id: 2, guess: 'crane', colors: 'ggggg', is_correct: true },
    ])
    rerender(<PlayAreaLoader {...ctx} />)
    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('guessed CRANE')
  })

  it('does not narrate my own guess', () => {
    const { ctx, shown } = narrationCtx()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [])
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    shown.mockClear()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxxxx', is_correct: false },
    ])
    rerender(<PlayAreaLoader {...ctx} />)
    expect(shown).not.toHaveBeenCalled()
  })

  it('announces an opponent solving in compete', () => {
    const { ctx, shown } = narrationCtx()
    // First render seeds: nobody solved yet.
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    shown.mockClear()
    // moth solves → narrated (the only peer event compete can surface).
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [
      me,
      { ...moth, solved: true },
    ])
    rerender(<PlayAreaLoader {...ctx} />)
    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('solved it')
    // Green — a solve is a solve regardless of whose (the outcome follows the event).
    expect(feedbackMsg.outcome).toBe('won')
    // A solve is where the peer STANDS, not a move of theirs, so it outranks
    // the guess narration above and a chat line.
    expect(feedbackMsg.kind).toBe('peerMilestone')
  })
})

describe('wordle PlayArea — opponent picker (compete)', () => {
  it('shows "hidden until game ends" when an opponent is picked during play', async () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    // Defaults to my own (empty) board.
    expect(screen.getByText('No guesses yet.')).toBeInTheDocument()
    // Pick the opponent → their guesses are RLS-hidden until the game ends.
    await pickFilter('moth')
    expect(screen.getByText('Hidden until game ends.')).toBeInTheDocument()
  })
})

describe('wordle PlayArea — event-log picker label', () => {
  it('names the player by HANDLE in a solo game, even when it’s you', async () => {
    // makeCtx defaults to viewer u1 as the only player. The shared vocabulary
    // names everyone the same way — "You" made your own row read as a different
    // KIND of thing from everyone else's (useEventLogPlayerPicker).
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(await filterOptions()).toContain('me')
    expect(await filterOptions()).not.toContain('You')
    // No aggregate in a solo game — "Team" of one is the same list twice.
    expect(await filterOptions()).not.toContain('Team')
  })

  it("names the player (not the viewer) when a club member spectates a solo game", async () => {
    // u2 (a club member, not in the game) is watching u1's solo game.
    const ctx = makeCtx({
      session: { user: { id: 'u2' } } as unknown as GamePageCtx['session'],
      players: [gp('u1', 'joel', 'red')],
    })
    h.result = loaded(
      { id: 'g1', mode: 'coop', max_guesses: 6, target: null },
      [],
      [{ user_id: 'u1', guesses_used: 0, solved: false, solved_at: null }],
    )
    render(<PlayAreaLoader {...ctx} />)
    expect(await filterOptions()).toContain('joel')
    expect(await filterOptions()).not.toContain('You')
  })

  it('shows "Team" AND each player in a multi-player coop game', async () => {
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    expect(await filterOptions()).toContain('Team')
    // Per-player entries pull one thread out of the shared log.
    expect(await filterOptions()).toContain('moth')
  })
})

describe('wordle PlayArea — concede', () => {
  it('compete shows Concede and calls wordle.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(
      <>
        <PlayAreaLoader {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    // The trigger and the modal's confirm share the name "Concede"; the confirm
    // is the one the dialog adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: /concede/i }))
    const confirms = await screen.findAllByRole('button', { name: /concede/i })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    render(
      <>
        <PlayAreaLoader {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    // The trigger and the modal's confirm now share the name "End game" (the
    // button label went from "End" to the full phrase, since icon-only buttons
    // make the label the accessible name). The confirm is the one the dialog
    // adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'End game' }))
    const confirms = await screen.findAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(
      <PlayAreaLoader
        {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })] })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(
      <PlayAreaLoader
        {...makeCtx({ players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')] })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

describe('wordle PlayArea — physical keyboard (shared useCaptureKeys)', () => {
  it('builds a guess from window keydowns and submits it on Enter', async () => {
    rpc.mockResolvedValue({ data: { result: 'incorrect' }, error: null })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // Typed with nothing focused, so the keys go to the window — which is where
    // the one dispatcher listens. (`userEvent`, not `fireEvent`: each letter is
    // an action's run, and the entry has to re-render between them.)
    await user.keyboard('crane{Enter}')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', guess: 'crane' }),
    )
  })

  it('ignores keystrokes aimed at a focused text field (chat isolation)', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    render(<WithKeys {...makeCtx()} />)
    const input = document.createElement('input')
    document.body.append(input)
    for (const key of ['c', 'r', 'a', 'n', 'e', 'Enter']) fireEvent.keyDown(input, { key })
    expect(rpc).not.toHaveBeenCalled() // typing in an input never reaches the board
    input.remove()
  })

  it('has NO ArrowUp-recall / ArrowDown-clear (wordle wires no arrows)', async () => {
    rpc.mockResolvedValue({ data: { result: 'incorrect' }, error: null })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('crane')
    // Where the arrows are wired, ArrowDown would clear the entry; here it must do nothing,
    // so Enter still submits the intact "crane".
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', guess: 'crane' }),
    )
  })
})

describe('wordle PlayArea — click-to-define (event log)', () => {
  it('makes each logged guess a define affordance on the WORD (not the cell)', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxxxx', is_correct: false },
    ])
    render(<PlayAreaLoader {...makeCtx()} />)
    // The event-log guess carries the click-to-define affordance, and it rides the
    // whole five-letter word (one define per guess), not an individual cell.
    const define = screen.getByTitle('Click to define')
    expect(define).toHaveTextContent('SLATE')
    // POINTER-ONLY: not a tab stop and not announced as a control. Definitions
    // are a convenience on a word you're already pointing at, and the page's
    // tab ring is empty anyway (common/core-css/utilities.css → `.definable`).
    expect(define).not.toHaveAttribute('role')
    expect(define).not.toHaveAttribute('tabindex')
  })
})

describe('wordle PlayArea — the board-scope marks', () => {
  const board = () => screen.getByRole('grid', { name: /board/i })
  const keyboard = () => screen.getByLabelText('Keyboard')

  // What these pin is the board-scope marks (common/board-marks/doc.md). None
  // of it is game logic, and all of it is invisible to a type check: a mark
  // that stops being applied looks exactly like a mark that was never asked for.
  it('bands the finished board in its outcome and disables the keyboard', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' }, [
      { user_id: 'u1', id: 1, guess: 'crane', colors: 'ggggg', is_correct: true },
    ])
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'won' })} />)

    expect(board().className).toMatch(/gameOverFrame/)
    expect(board().className).toMatch(/gameOverWon/)

    // The keyboard STAYS, disabled: its caps hold the color every letter
    // earned, which is the record of the game just played. Both halves are
    // pinned, since a keyboard that is present but still typable would pass the
    // first assertion alone.
    expect(keyboard()).toBeInTheDocument()
    for (const cap of within(keyboard()).getAllByRole('button')) {
      expect(cap).toBeDisabled()
    }
  })

  it('bands a lost board in the losing tone', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 1, target: 'crane' }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxgyx', is_correct: false },
    ])
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    expect(board().className).toMatch(/gameOverLost/)
    expect(board().className).not.toMatch(/gameOverWon/)
  })

  it('leaves a live board unmarked, with a usable keyboard', () => {
    render(<PlayAreaLoader {...makeCtx()} />)

    expect(board().className).not.toMatch(/gameOver/)
    expect(within(keyboard()).getByRole('button', { name: /^a$/i })).toBeEnabled()
  })

  it('dims the board while a teammate holds the move', () => {
    render(<PlayAreaLoader {...makeCtx({ currentTurnUserId: 'u2', isMyTurn: false, players: twoMembers })} />)

    expect(board().className).toMatch(/dimNotYourTurn/)
    // The turn arriving is an EVENT, so it must not fire on mount — a player
    // opening a game on their own turn hasn't just been handed it.
    expect(board().className).not.toMatch(/yourTurnFlash/)
  })

  it('flashes the frame at the moment the turn becomes mine', async () => {
    const ctx = makeCtx({ currentTurnUserId: 'u2', isMyTurn: false, players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    expect(board().className).not.toMatch(/yourTurnFlash/)

    rerender(<PlayAreaLoader {...makeCtx({ currentTurnUserId: 'u1', isMyTurn: true, players: twoMembers })} />)

    expect(board().className).toMatch(/yourTurnFlash/)
    expect(board().className).not.toMatch(/dimNotYourTurn/)
  })
})

describe('wordle Board — the reveal flip', () => {
  const tiles = () => screen.getAllByRole('gridcell')

  // A row already on the board when it mounted arrived before anyone was
  // watching, so it draws settled; a row that lands during the session flips.
  // No restart case here on purpose: a Restart remounts the whole surface, so
  // the replayed game's first row is a landing on a fresh board like any other.
  it('flips a row that lands while watching, not the rows present at mount', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxgyx', is_correct: false },
    ])
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(tiles()[0].className).not.toMatch(/reveal/)

    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', id: 1, guess: 'slate', colors: 'xxgyx', is_correct: false },
      { user_id: 'u1', id: 2, guess: 'moths', colors: 'xxyxg', is_correct: false },
    ])
    rerender(<PlayAreaLoader {...makeCtx()} />)

    expect(tiles()[0].className).not.toMatch(/reveal/)
    expect(tiles()[5].className).toMatch(/reveal/)
  })
})

/**
 * Concede's one wordle-specific gate. A racer who has SOLVED the word and is
 * waiting for the others has a win banked, and the winner query excludes
 * conceded players — so "I'm done waiting" would throw the result away. The
 * binding says `disabled` (`selfSolved`), and the button reads it.
 */
describe('wordle PlayArea — a solved racer cannot concede', () => {
  const compete = { id: 'g1', mode: 'compete' as const, max_guesses: 6, target: null }

  it('solved and waiting: Concede is gray', () => {
    h.result = loaded(compete, [], [{ ...me, solved: true }, moth])
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByText('Waiting for others')).toBeInTheDocument()
    expect(stateOf('act-concede')).toBe('disabled')
    expect(control('act-concede')).toBeDisabled()
  })

  it('still racing: Concede is live', () => {
    h.result = loaded(compete, [], [me, moth])
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    expect(stateOf('act-concede')).toBe('active')
    expect(control('act-concede')).toBeEnabled()
  })
})

/**
 * The commands through the dispatcher: `+`, `⌥⌫` and Restart, with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('wordle PlayArea — + and ⌥⌫ through the dispatcher', () => {
  const coop = { id: 'g1', mode: 'coop' as const, max_guesses: 6, target: null }
  const compete = { id: 'g1', mode: 'compete' as const, max_guesses: 6, target: null }

  it('+ at terminal starts the follow-up game with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ error: null }),
    )
    h.result = loaded({ ...coop, target: 'crane' })
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', expect.objectContaining({ mode: 'coop' })),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('wordle_coop', 'next-game-id'))
  })

  it('+ mid-game asks first, and cancel starts nothing', async () => {
    const user = userEvent.setup()
    h.result = loaded(coop)
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
    expect(rpc).not.toHaveBeenCalledWith('create_game', expect.anything())
  })

  it('⌥⌫ in coop asks End game’s question; yes calls end_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    h.result = loaded(coop)
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

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    h.result = loaded(compete, [], [me, moth])
    render(
      <>
        <WithKeys {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
  })

  it('Restart mid-game asks before wiping the board', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    h.result = loaded(coop)
    const ctx = makeCtx()
    render(
      <>
        <PlayAreaLoader {...ctx} />
        <ConfirmationHost />
      </>,
    )
    const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
    const sections = (calls.at(-1)![0] ?? []) as MenuSection[]
    const restart = sections.flatMap((s) => s.items).map(menuRow).find((r) => r.id === 'act-restart')!
    act(() => restart.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * The two on-screen caps that ARE actions. ⌫ and Enter take what they do from
 * the same two bindings the physical keys fire, so a cap and its key cannot
 * disagree about whether the move is available — on an empty guess, both gray.
 */
describe('wordle PlayArea — the ⌫ and Enter caps follow the entry', () => {
  it('gray with nothing typed, live once letters land', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(control('act-delete-last')).toBeDisabled()
    expect(control('act-submit-entry')).toBeDisabled()

    await user.keyboard('cr')
    expect(control('act-delete-last')).toBeEnabled()
    expect(control('act-submit-entry')).toBeEnabled()
  })
})
