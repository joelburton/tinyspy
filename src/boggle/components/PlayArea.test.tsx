// cs-unmet

/**
 * Render smoke tests for boggle's PlayArea: does the play surface mount and
 * render without throwing — in coop, in compete, and at terminal?
 *
 * Why this exists: a v1→v3 conversion rewired the whole component (shared
 * scaffold, capture-key entry, info column). A blank-page runtime error here
 * wouldn't be caught by `tsc` (the root tsconfig checks nothing — see memory
 * project_typecheck_use_tsc_b), so a one-line `render()` per mode is the guard.
 * Deliberately shallow: game logic lives in pgTAP (the RPCs) + the lib Vitest
 * suites (solver / boardTrace / displayRows); here we only prove the tree mounts.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the grid, entry row, word list, modal — renders real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import type { BoggleGame, FoundWordRow } from '../hooks/useGame'
import { db } from '../db'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { PlayArea } from './PlayArea'

/** A ctx whose global slot is real, with a spy on its one door. */
function narrationCtx(over: Partial<GamePageCtx> = {}) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  return { ctx: makeCtx({ globalFeedbackSlot, ...over }), shown }
}

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// PlayArea's "New game" calls the start-game edge function directly (the same
// helper the manifest uses); mocked so no edge runtime is needed.
// Only `runEdgeFn` is stubbed — the create-game path. `runRpc` stays REAL so
// the submit path exercises the envelope it actually receives; the `db.rpc`
// mock above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

/** A loaded 4×4 game header; override the mode + required list per test. */
function loadedGame(over: Partial<BoggleGame> = {}): BoggleGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    board: 'abcdefghijklmnop', // 16 plain faces → a 4×4 board
    n: 4,
    min_word_length: 3,
    required_words: [{ word: 'cat', points: 1 }],
    bonus_words: [],
    required_words_count: 1,
    required_words_score: 1,
    ...over,
  }
}

function loaded(game: BoggleGame, foundWords: FoundWordRow[] = []): GameHook {
  // `rowsLoaded: true` because this helper builds a LOADED state — the rows
  // have arrived. It went missing while `GameHook` was hand-written, and the
  // fake returned no such key: `usePeerFeedback`'s `ready` then fell back to
  // its `true` default, so these tests exercised the SINGLE-fetch narration
  // path while the real hook is two-fetch.
  return { game, foundWords, loading: false, rowsLoaded: true, failure: null }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'MothCubes',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    // A realistic setup blob — the info-column disclosure reads it (a `{}` here
    // would crash timerLabel / the difficulty lookups, exactly what this guards).
    setup: {
      timer: { kind: 'none' },
      dice_set: '4',
      band: 3,
      legal_band: 5,
      min_word_length: 3,
      scoring_ladder: 'basic',
      win_percent: null,
    },
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

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the entry's letters, Backspace and Enter are
 *  bound actions now, and a bare `render` binds them with nothing feeding them
 *  keys. */
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
}

/** A keystroke as the app-root listener sees it: from the body, with nothing
 *  focused. An Option chord matches on `code`, since ⌥ changes the character
 *  (⌥Z arrives as `Ω`). */
const press = (key: KeyboardEventInit) => fireEvent.keyDown(document.body, key)
const PLUS = { key: '+' }
const OPT_BACKSPACE = { key: 'Backspace', code: 'Backspace', altKey: true }
const OPT_Z = { key: 'Ω', code: 'KeyZ', altKey: true }

/** The live binding for an action — the same `run` its key, its menu row and
 *  its button all fire. */
const bound = (id: ActionId) => liveBindings().find((b) => b.id === id)!

/** Answer the open question with the button that says `name`. The trigger can
 *  share the modal's words ("End game" / "End game"); the modal's is the one
 *  the host adds, so it is last in the DOM. */
async function answer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const buttons = await screen.findAllByRole('button', { name })
  await user.click(buttons[buttons.length - 1]!)
}

/** The board's faces in the order they are drawn, row-major. */
const boardFaces = () =>
  [...document.querySelectorAll('[data-boggle-tile]')].map((t) => t.textContent)

/** A trusting-commit success, in the envelope `runRpc` unwraps. `accepted` is
 *  the plain classification; the bonus/pangram ones return the same `null` to
 *  the hook, so one fixture covers every accept. */
const acceptedEnvelope = {
  data: {
    type: 'ok', data: { result: 'accepted', points: 1 }, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
}

  beforeEach(() => {
    h.result = loaded(loadedGame())
    rpc.mockReset()
    rpc.mockResolvedValue(acceptedEnvelope) // trusting-commit succeeds by default
    // The edge-fn mock too: its call COUNT would otherwise leak between tests
    // (each New-game test sets its own resolved value, so clearing is safe).
    startEdgeFn.mockReset()
  })

describe('boggle PlayArea — render smoke', () => {
  it('renders the 4×4 board + the Stats grid in coop play', () => {
    // Give the game a bonus word so bonusCount > 0 and the 4-cell grid renders.
    h.result = loaded(loadedGame({ bonus_words: [{ word: 'dog', points: 2 }] }))
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(container.querySelectorAll('[data-boggle-tile]')).toHaveLength(16)
    // The 4-cell Stats grid. Labels stack on two lines ("Req" over "Words"), so
    // match the <span> as a whole rather than a single text node — and it now
    // renders TWICE (the info column + the mobile status block above the board),
    // hence getAllByText.
    const label = (a: string, b: string) =>
      screen.getAllByText((_t, el) => el?.textContent === `${a}${b}`, { selector: 'span' })
    expect(label('Req', 'Words').length).toBeGreaterThan(0)
    expect(label('Req', 'Score').length).toBeGreaterThan(0)
    expect(label('Bonus', 'Words').length).toBeGreaterThan(0)
    expect(label('Bonus', 'Score').length).toBeGreaterThan(0)
  })

  it('hides Bonus Words / Bonus Score when legal_band equals band', () => {
    // When both bands are the same, bonus words are only clean-filter rejects —
    // not an intentional wider dictionary. The stat cells should be suppressed.
    render(
      <PlayArea
        {...makeCtx({
          setup: {
            timer: { kind: 'none' },
            dice_set: '4',
            band: 3,
            legal_band: 3, // same as required band → no bonus display
            min_word_length: 3,
            scoring_ladder: 'basic',
            win_percent: null,
          },
        })}
      />,
    )
    const noLabel = (a: string, b: string) =>
      screen.queryAllByText((_t, el) => el?.textContent === `${a}${b}`, { selector: 'span' })
    expect(noLabel('Bonus', 'Words')).toHaveLength(0)
    expect(noLabel('Bonus', 'Score')).toHaveLength(0)
  })

  it('renders the OpponentStrip (Score) in compete play', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByText('Score:')).toBeInTheDocument()
  })

  it('renders the terminal state without crashing', () => {
    h.result = loaded(loadedGame())
    render(<PlayArea {...makeCtx({ isTerminal: true })} />)
    // The neutral coop terminal: "Game ended" in the action row, and the
    // permanent verdict pill below the board.
    expect(screen.getAllByText(/Game ended/).length).toBeGreaterThan(0)
  })

  it('coop: reaching the score target reads as a win, not a neutral end', () => {
    h.result = loaded(loadedGame())
    render(<PlayArea {...makeCtx({ isTerminal: true, status: { mode: 'coop', outcome: 'target' } })} />)
    expect(screen.getAllByText(/Target reached/).length).toBeGreaterThan(0)
  })

  it('compete: the target crosser sees "You won"', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayArea
        {...makeCtx({
          isTerminal: true,
          players: twoMembers,
          // self is 'u1' (session.user.id); the server named u1 the crosser.
          status: { mode: 'compete', outcome: 'target', winner_user_id: 'u1', winner_username: 'me', leaderboard: [] },
        })}
      />,
    )
    expect(screen.getAllByText(/You won/).length).toBeGreaterThan(0)
  })

  it('compete: a non-crosser sees the winner named', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayArea
        {...makeCtx({
          isTerminal: true,
          players: twoMembers,
          // u2 (moth) crossed; self (u1) lost.
          status: { mode: 'compete', outcome: 'target', winner_user_id: 'u2', winner_username: 'moth', leaderboard: [] },
        })}
      />,
    )
    expect(screen.getAllByText(/moth won/).length).toBeGreaterThan(0)
  })

  it('shows local feedback (and clears the box) for an off-board word', async () => {
    // Regression: a too-short/off-board reject set the feedback but didn't clear
    // `word`, and the below-board pill is gated on word === '' — so its own
    // feedback was suppressed. The board is 'abcdefghijklmnop' (no Z), so "zzz"
    // is a non-traceable, off-board word that never reaches the server.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('zzz{Enter}')
    expect(screen.getByText(/not on board/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * The icon-only action rows (the waffle arrangement — labels live in
 * tooltips): PLAYING = End/Concede + Back-to-club (the shell's
 * suspend-confirm flow); TERMINAL = Restart + New game + Back-to-club.
 * Restart = boggle.replay_board (unconfirmed at terminal); New game = the
 * boggle-build-board edge function with THIS game's setup/roster/mode,
 * then ctx.goToGame.
 */
describe('boggle PlayArea — icon-only action rows', () => {
  it('playing row offers Back-to-club — the shell action, which knows to suspend', async () => {
    // ONE binding for both rows: it navigates directly at terminal and routes
    // through the suspend-confirm flow mid-game, so the game no longer picks
    // between two callbacks and no longer can pick wrong.
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('terminal Restart calls replay_board WITHOUT confirming', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })

  it('terminal "New game" starts a fresh game with this setup/roster/mode', async () => {
    // `data.result` is the field the call site filters the `ok` on, so a stub
    // without it is an answer the chain cannot name and correctly screams at.
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const user = userEvent.setup()
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<PlayArea {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'boggle-build-board',
        {
          target_club: 'testclub',
          setup: ctx.setup,
          player_user_ids: ['u1'],
          mode: 'coop',
        },
      ),
    )
    await waitFor(() =>
      expect(ctx.goToGame).toHaveBeenCalledWith('boggle_coop', 'fresh-game-id'),
    )
  })
})

describe('boggle PlayArea — submit behavior (shared useWordSubmit)', () => {
  it('accepts a required word: optimistic pill + submit_word call', async () => {
    // 'cat' is in the required list (membership, not traceability, drives accept),
    // so it commits optimistically with the stored points + is_bonus=false.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('cat{Enter}')
    expect(screen.getByText(/CAT — \+1/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'submit_word',
      expect.objectContaining({ word: 'cat', points: 1, is_bonus: false }),
    )
  })

  it('accepts a bonus word with the trailing dot', async () => {
    h.result = loaded(loadedGame({ bonus_words: [{ word: 'dog', points: 2 }] }))
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('dog{Enter}')
    expect(screen.getByText(/DOG • — \+2/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_bonus: true }))
  })

  it('rejects a real-but-untraceable word as "not a word"', async () => {
    // 'aid' isn't in required ∪ bonus, but it IS traceable on the plain board
    // (a→i→? — actually a,i adjacent? the board is row-major abcd/efgh/ijkl/mnop;
    // pick a word whose letters trace): use a legal-list miss that traces.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('abe{Enter}') // a(0)→b(1)→e(4): adjacent, traceable, not in the lists
    expect(screen.getByText(/not a word/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('boggle PlayArea — coop peer narration (global header)', () => {
  // `usePeerFeedback` seeds the backlog silently on the first loaded render,
  // then shows a header message for each NEW peer row. So each test renders
  // once (empty seed), pushes a peer row into the mocked useGame, and
  // re-renders to trigger it — asserting through a spy on the slot's `show`.

  /** A peer's accepted found_words row (the coop header reads these). */
  function foundRow(over: Partial<FoundWordRow> = {}): FoundWordRow {
    return {
      game_id: 'g1',
      user_id: 'u2', // 'moth' — a teammate, not the caller (u1)
      word: 'dog',
      points: 2,
      is_bonus: false,
      found_at: '2026-01-01T00:00:01Z',
      ...over,
    }
  }

  it("narrates a teammate's find with the word + points, the actor leading", () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'dog', points: 2 })])
    rerender(<PlayArea {...ctx} />)
    const feedbackMsg = shown.mock.calls.at(-1)![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('found DOG +2')
    expect(feedbackMsg.outcome).toBe('won')
  })

  it('flags a long (7+ letter) find with "wow!"', () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'jackpot', points: 9 })])
    rerender(<PlayArea {...ctx} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('wow! JACKPOT +9')
  })

  it('shows the bonus dot after a bonus find', () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'dog', points: 2, is_bonus: true })])
    rerender(<PlayArea {...ctx} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('found DOG • +2')
  })

  it('does not narrate your own find (that goes to the local slot)', () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ user_id: 'u1', word: 'cat', points: 1 })])
    rerender(<PlayArea {...ctx} />)
    expect(shown).not.toHaveBeenCalled()
  })

  it("stays silent in compete (opponents' finds are private)", () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame({ mode: 'compete' }), [foundRow({ word: 'dog', points: 2 })])
    rerender(<PlayArea {...ctx} />)
    expect(shown).not.toHaveBeenCalled()
  })
})

describe('boggle PlayArea — concede', () => {
  // Concede = a per-player "I quit, the game continues for the others" action for
  // COMPETE (boggle is non-elimination, so it's the only way to a locally-done
  // state). Coop keeps the neutral whole-table End. Mirrors spellingbee's block.

  it('compete shows Concede and calls boggle.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <>
        <PlayArea {...makeCtx({ players: twoMembers })} />
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
    render(
      <>
        <PlayArea {...makeCtx()} />
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

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })

  it('distinguishes Quit / Lost / Won at terminal in the strip', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayArea
        {...makeCtx({
          isTerminal: true,
          playState: 'ended',
          players: [
            gp('u1', 'me', 'red', { result: { won: false } }), // self → Lost
            gp('u2', 'moth', 'blue', { conceded: true, result: { won: false } }), // → Quit
            gp('u3', 'cade', 'green', { result: { won: true } }), // → Won
          ],
          status: {
            leaderboard: [
              { user_id: 'u2', found_words_count: 4, found_words_score: 12 },
              { user_id: 'u3', found_words_count: 6, found_words_score: 40 },
            ],
          },
        })}
      />,
    )
    expect(screen.getByText(/Quit at/)).toBeInTheDocument()
    expect(screen.getByText(/Won at/)).toBeInTheDocument()
    expect(screen.getByText(/Lost at/)).toBeInTheDocument()
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is a bound action's, so
 * what these pin is the wiring: the chord reaches the binding, the binding asks
 * the registry's question mid-game and skips it at terminal, and the answer
 * runs the same call the button does.
 */
describe('boggle PlayArea — the keys', () => {
  it('+ at terminal starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<WithKeys {...ctx} />)

    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the call firing proves none was asked.
    press(PLUS)
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'boggle-build-board',
        expect.objectContaining({ target_club: 'testclub', player_user_ids: ['u1'], mode: 'coop' }),
      ),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('boggle_coop', 'fresh-game-id'))
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

  it('⌥⌫ in coop asks to end the game, and yes calls end_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('End this game?')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    await answer(user, 'End game')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('⌥⌫ in compete asks to concede, and yes calls concede', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <>
        <WithKeys {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('end_game', expect.anything())
  })

  describe('⌥Z rotates the board', () => {
    // A quarter turn of the SAME sixteen faces — the top-left corner takes a
    // different face, and four turns bring the first one back. Awaited: the
    // bound run is async, so the turn lands a tick after the keystroke.
    it('turns the view a quarter, with no round trip', async () => {
      render(<WithKeys {...makeCtx()} />)
      const before = boardFaces()
      expect(before).toHaveLength(16)

      await act(async () => press(OPT_Z))
      const after = boardFaces()
      expect(after).not.toEqual(before)
      expect([...after].sort()).toEqual([...before].sort())
      expect(rpc).not.toHaveBeenCalled()

      for (let turn = 0; turn < 3; turn++) await act(async () => press(OPT_Z))
      expect(boardFaces()).toEqual(before)
    })

    it('still works on a finished board — the fidget is deliberate', async () => {
      render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
      expect(bound('act-rotate').describe('button').state).toBe('active')
      const before = boardFaces()

      await act(async () => press(OPT_Z))
      expect(boardFaces()).not.toEqual(before)
    })
  })

  describe('Restart mid-game', () => {
    // Keyless, so it is fired as the menu row would fire it: the bound run,
    // which is where the registry's question is asked. (The terminal case,
    // where it goes straight through, is under "icon-only action rows".)
    it('asks first, and Keep playing wipes nothing', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayArea {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => bound('act-restart').run())
      expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep playing' }))
      await waitFor(() => expect(screen.queryByText('Restart this game?')).not.toBeInTheDocument())
      expect(rpc).not.toHaveBeenCalledWith('replay_board', expect.anything())
    })

    it('yes calls replay_board', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayArea {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => bound('act-restart').run())
      await answer(user, 'Restart')
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    })
  })
})
