// cs-unmet

/**
 * Render + behavior tests for wordiply's PlayArea — the composition (the
 * five-row board, the length-only readout, the terminal reveal), which `tsc`
 * can't catch (a blank-page runtime error slips past it; see memory
 * project_typecheck_use_tsc_b). Deep game logic lives in pgTAP + the lib
 * Vitest suites; here we prove the tree mounts and the note-1 rules hold:
 * during play only the per-guess LENGTH shows (no score %, no letter count);
 * at terminal the score bar + longest-word reveal appear.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else renders real.
 */
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { WordiplyGame, GuessRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = { game: WordiplyGame | null; guesses: GuessRow[]; loading: boolean }

const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
// The real hook derives validGuesses from guesses; mirror that here rather than
// hand-listing it per fixture, so a test can't accidentally disagree with itself.
vi.mock('../hooks/useGame', () => ({
  useGame: () => ({ ...h.result, validGuesses: h.result.guesses.filter((g) => g.valid) }),
}))
vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ error: null }) } }))
// Only `runEdgeFn` is stubbed — the create-game path. `runRpc` stays REAL so
// the submit path exercises the envelope it actually receives; the `db.rpc`
// mock above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

/** A loaded game on base 'ar', longest possible 'hangars' (7). */
function loadedGame(over: Partial<WordiplyGame> = {}): WordiplyGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    base: 'ar',
    difficulty: 5,
    max_word_length: 7,
    longestWords: ['hangars'],
    legalWords: ['bar', 'car', 'cart', 'stars', 'hangars'],
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function guess(word: string, i: number, userId = 'u1'): GuessRow {
  return {
    id: i, game_id: 'g1', user_id: userId, word, length: word.length,
    valid: true, reason: null, seq: i,
    guessed_at: `2026-01-01T00:0${i}:00Z`,
  }
}

/** A REJECTED submission — in the turn log, but off the board and off every
 *  score. `seq` is null: rejects occupy no board row. */
function reject(
  word: string,
  i: number,
  reason: NonNullable<GuessRow['reason']> = 'not_a_word',
  userId = 'u1',
): GuessRow {
  return {
    id: i, game_id: 'g1', user_id: userId, word, length: word.length,
    valid: false, reason, seq: null,
    guessed_at: `2026-01-01T00:0${i}:00Z`,
  }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'WordWire',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { difficulty: 5, timer: { kind: 'none' } },
    status: null,
    globalFeedbackSlot: createFeedbackSlot('global'),
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

/** The board is the first <ol> in the DOM (BoardCol renders before InfoCol). */
function boardRowCount(container: HTMLElement): number {
  const board = container.querySelector('ol')
  return board ? board.querySelectorAll(':scope > li').length : 0
}

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const edgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what every
 *  call site branches on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
 *  draw, keyed by action id. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped, so two keys fired in one tick would land one. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** The running length badge on the active row — the one readout of what has
 *  been typed so far, since the letters themselves are fragmented across spans. */
const typedLength = () =>
  document.querySelector('ol li[class*="active"] span[aria-label$="letters"]')?.textContent ?? ''

/** What a bound action says about itself right now. */
const stateOf = (id: string) => liveBindings().find((b) => b.id === id)?.describe().state

beforeEach(() => {
  h.result = { game: loadedGame(), guesses: [], loading: false }
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  edgeFn.mockReset()
})

describe('wordiply PlayArea — layout stability', () => {
  it('always renders exactly 5 guess rows (empty board)', () => {
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(boardRowCount(container)).toBe(5)
    // The base is shown plainly (no "Starter" label).
    expect(screen.getByText('AR', { exact: true })).toBeInTheDocument()
  })

  it('still renders 5 rows with some guesses landed, and a length badge per guess', () => {
    h.result = { game: loadedGame(), guesses: [guess('bar', 1), guess('stars', 2)], loading: false }
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(boardRowCount(container)).toBe(5)
    // The one live readout — each guess's length badge. Queried by its aria
    // label, not bare text: the turn log now shows the same lengths in its own
    // column, so plain getByText('3') matches twice.
    expect(screen.getByLabelText('3 letters')).toBeInTheDocument() // bar
    expect(screen.getByLabelText('5 letters')).toBeInTheDocument() // stars
  })
})

describe('wordiply PlayArea — length-only during play', () => {
  it('shows guesses n/5 but NO score % or letter count mid-game', () => {
    h.result = { game: loadedGame(), guesses: [guess('bar', 1)], loading: false }
    render(<PlayArea {...makeCtx()} />)
    // getAllBy: the turn log's heading is "Guesses" too.
    expect(screen.getAllByText(/guesses/i).length).toBeGreaterThan(0)
    // The score bar's anchor ("best N / possible M") + the reveal are absent.
    expect(screen.queryByText(/possible/i)).toBeNull()
    expect(screen.queryByText(/letters across/i)).toBeNull()
  })

  it('compete OpponentStrip shows Guesses (not a score) mid-game', () => {
    h.result = { game: loadedGame({ mode: 'compete' }), guesses: [], loading: false }
    render(
      <PlayArea
        {...makeCtx({
          players: twoMembers,
          status: { leaderboard: [{ user_id: 'u1', guesses_used: 1 }, { user_id: 'u2', guesses_used: 3 }] },
        })}
      />,
    )
    expect(screen.getByText('Guesses:')).toBeInTheDocument()
  })
})

describe('wordiply PlayArea — terminal reveal', () => {
  /** A finished coop game with both readouts in its status blob. */
  const ended = () => {
    h.result = {
      game: loadedGame(),
      guesses: [guess('bar', 1), guess('stars', 2)],
      loading: false,
    }
    return makeCtx({
      isTerminal: true,
      playState: 'ended',
      status: { outcome: 'complete', length_score: 71, letter_count: 8 },
    })
  }

  it('scores the game WITHOUT naming the best word', () => {
    // The point of the change: the two readouts say how well you did, and the
    // word itself waits to be asked for, so a table can keep guessing at it.
    render(<PlayArea {...ended()} />)
    // Score bar (longest 'stars'=5 of 7 → 71%) + its anchor are visible…
    expect(screen.getByText('71%')).toBeInTheDocument()
    expect(screen.getByText(/possible 7/)).toBeInTheDocument()
    // …and the word is not.
    expect(screen.queryByText(/Best possible word/)).not.toBeInTheDocument()
    expect(screen.queryByText('HANGARS')).not.toBeInTheDocument()
  })

  it('Reveal names the longest possible word, click-to-define, with no RPC', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...ended()} />)

    await user.click(screen.getByRole('button', { name: 'Reveal best word' }))
    // The reveal names the longest possible word (label carries the length)…
    expect(screen.getByText(/Best possible word/)).toBeInTheDocument()
    // …and it's click-to-define: a bare BUTTON carrying the shared affordance.
    // The turn log's accepted words are definable too (as spans), so narrow to
    // the button — that's what distinguishes the reveal from a log row.
    const defineBtn = screen
      .getAllByTitle('Click to define')
      .find((el) => el.tagName === 'BUTTON')
    expect(defineBtn).toHaveTextContent('HANGARS')
    // Local state: no peer's board opened.
    expect(db.rpc as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('the same button hides it again', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...ended()} />)

    await user.click(screen.getByRole('button', { name: 'Reveal best word' }))
    await user.click(screen.getByRole('button', { name: 'Hide best word' }))
    expect(screen.queryByText(/Best possible word/)).not.toBeInTheDocument()
  })

  it('compete terminal reveals opponents’ words but keeps my board to my own', () => {
    // I (u1) played 'bar'; my opponent moth (u2) played 'stars' + 'cart'. At
    // terminal the RLS opens moth's rows, so they arrive in `guesses`.
    h.result = {
      game: loadedGame({ mode: 'compete' }),
      guesses: [guess('bar', 1, 'u1'), guess('stars', 1, 'u2'), guess('cart', 2, 'u2')],
      loading: false,
    }
    render(
      <PlayArea
        {...makeCtx({
          players: twoMembers,
          isTerminal: true,
          playState: 'won_compete',
          status: {
            winner_user_id: 'u2',
            leaderboard: [
              { user_id: 'u2', won: true, length_score: 71 },
              { user_id: 'u1', won: false, length_score: 43 },
            ],
          },
        })}
      />,
    )
    // The opponent reveal section: moth + their two words (DimmedBaseWord
    // fragments each word across spans, so read the section's textContent).
    const section = screen.getByRole('heading', { name: /Opponents’ words/i }).closest('section')!
    expect(section.textContent).toContain('moth')
    expect(section.textContent).toContain('STARS')
    expect(section.textContent).toContain('CART')
    // Self is excluded from the reveal — my own word never appears there (it's
    // on my board instead).
    expect(section.textContent).not.toContain('BAR')
  })
})

/**
 * The compete collective losses all land on play_state `lost_compete` and are
 * told apart only by `status.outcome` — the two-places trap's third surface
 * (labelFor and the report fixtures assert the club card; nothing else asserts
 * the in-game verdict). These pin buildOver to the terminals the server
 * actually writes: common.concede → 'lost_compete' + outcome 'conceded',
 * wordiply._finish_compete's best_score=0 path → 'lost_compete' + 'timeout'
 * (the clock) or 'complete' (all guesses spent, nobody scored).
 */
describe('wordiply PlayArea — compete terminal verdicts', () => {
  const competeCtx = (outcome: string) =>
    makeCtx({
      players: twoMembers,
      isTerminal: true,
      playState: 'lost_compete',
      status: { outcome, leaderboard: [] },
    })

  beforeEach(() => {
    h.result = { game: loadedGame({ mode: 'compete' }), guesses: [], loading: false }
  })

  it('all-conceded (outcome conceded) says so', () => {
    render(<PlayArea {...competeCtx('conceded')} />)
    expect(screen.getByText('Lost: all conceded')).toBeInTheDocument()
  })

  it('nobody-scored timeout (outcome timeout) blames the clock', () => {
    render(<PlayArea {...competeCtx('timeout')} />)
    expect(screen.getByText('Lost: out of time, nobody scored')).toBeInTheDocument()
  })

  it('nobody-scored guess exhaustion (outcome complete) blames the guesses', () => {
    render(<PlayArea {...competeCtx('complete')} />)
    expect(screen.getByText('Lost: out of guesses, nobody scored')).toBeInTheDocument()
  })

  it('manual end (ended + outcome manual) stays neutral', () => {
    h.result = { game: loadedGame({ mode: 'compete' }), guesses: [], loading: false }
    render(
      <PlayArea
        {...makeCtx({
          players: twoMembers,
          isTerminal: true,
          playState: 'ended',
          status: { outcome: 'manual', leaderboard: [] },
        })}
      />,
    )
    expect(screen.getByText(/game ended/i)).toBeInTheDocument()
  })
})

/**
 * The turn log — wordiply's answer to "who guessed what?", and the surface that
 * makes recording rejects worth doing. What matters is the SPLIT: rejects belong
 * in the log and nowhere else, so a rejected word must never reach the board,
 * the guesses-used count, or any score.
 */
describe('wordiply PlayArea — turn log', () => {
  it('shows accepted and rejected guesses together, with the reason', () => {
    h.result = {
      game: loadedGame(),
      guesses: [guess('cart', 1), reject('arqqq', 2), reject('zzzz', 3, 'missing_base')],
      loading: false,
    }
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByText('CART')).toBeInTheDocument()
    expect(screen.getByText('ARQQQ')).toBeInTheDocument()
    expect(screen.getByText('not a word')).toBeInTheDocument()
    expect(screen.getByText('no base')).toBeInTheDocument()
  })

  it('keeps rejected guesses OUT of the guesses-used count', () => {
    h.result = {
      game: loadedGame(),
      guesses: [guess('cart', 1), reject('arqqq', 2), reject('arwww', 3)],
      loading: false,
    }
    render(<PlayArea {...makeCtx()} />)
    // One accepted guess of five — the two rejects cost no budget.
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/\/ 5 guesses/)).toBeInTheDocument()
  })

  it('offers the whose-guesses picker, defaulting to me', () => {
    h.result = { game: loadedGame(), guesses: [guess('cart', 1)], loading: false }
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    // Two players in COMPETE would list them; a coop pair is one shared "Team".
    expect(screen.getByRole('button', { name: /whose guesses/i })).toBeInTheDocument()
  })
})

/**
 * The entry, from the keyboard down. wordiply has no <input>: letters land in
 * the active row through the capture-entry actions (`useCaptureKeys`), and the
 * two history arrows come from `useArrowHistory`. Every press here goes through
 * the app-root dispatcher, so what is asserted is the wiring the key list
 * advertises rather than a handler called by hand.
 */
describe('wordiply PlayArea — the entry keys', () => {
  it('letters type into the active row and ⌫ takes the last one back', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(typedLength()).toBe('')

    await press({ key: 'b' })
    await press({ key: 'a' })
    await press({ key: 'r' })
    expect(typedLength()).toBe('3')

    await press({ key: 'Backspace', code: 'Backspace' })
    expect(typedLength()).toBe('2')
  })

  it('Enter submits a legal guess through submit_guess', async () => {
    rpc.mockResolvedValue(
      okEnvelope({ result: 'accepted', length: 3, guesses_used: 1, is_terminal: false }),
    )
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'b' })
    await press({ key: 'a' })
    await press({ key: 'r' })
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', word: 'bar' }),
    )
    // The entry is consumed by the submit, so the row is empty again.
    expect(typedLength()).toBe('')
  })

  it('Enter with nothing typed is disabled, and ⌫ too', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-submit-entry')).toBe('disabled')
    expect(stateOf('act-delete-last')).toBe('disabled')
    await press({ key: 'Enter', code: 'Enter' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('↑ recalls the last entry and ↓ clears it', async () => {
    rpc.mockResolvedValue(
      okEnvelope({ result: 'accepted', length: 3, guesses_used: 1, is_terminal: false }),
    )
    render(<WithKeys {...makeCtx()} />)
    // Nothing submitted yet: recall has nothing to bring back, and says so.
    expect(stateOf('act-recall-last')).toBe('disabled')

    await press({ key: 'b' })
    await press({ key: 'a' })
    await press({ key: 'r' })
    await press({ key: 'Enter', code: 'Enter' })
    expect(typedLength()).toBe('')

    await press({ key: 'ArrowUp', code: 'ArrowUp' })
    expect(typedLength()).toBe('3')
    await press({ key: 'ArrowDown', code: 'ArrowDown' })
    expect(typedLength()).toBe('')
  })

  it('a finished game takes no letters', async () => {
    render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'ended', status: { outcome: 'complete' } })} />)
    expect(stateOf('act-type-letter')).toBe('hidden')
    await press({ key: 'b' })
    expect(typedLength()).toBe('')
  })
})

/**
 * The commands — `+`, `⌥⌫` and Restart — through the dispatcher, with the real
 * confirmation host mounted where a question is expected. A question that
 * appears with no host is answered no, so the host is what lets these prove the
 * question was asked rather than skipped.
 */
describe('wordiply PlayArea — new game, end, concede and restart', () => {
  const created = { type: 'ok', data: { result: 'created', id: 'fresh-game-id' } }

  it('+ at terminal starts the follow-up game with no question', async () => {
    edgeFn.mockResolvedValue(created)
    const ctx = makeCtx({ isTerminal: true, playState: 'ended', status: { outcome: 'complete' } })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the edge function firing proves none was asked.
    await waitFor(() =>
      expect(edgeFn).toHaveBeenCalledWith('wordiply-build-board', {
        target_club: 'testclub',
        setup: ctx.setup,
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('wordiply_coop', 'fresh-game-id'))
  })

  it('+ mid-game asks first, and cancel starts nothing', async () => {
    const user = userEvent.setup()
    edgeFn.mockResolvedValue(created)
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
    expect(edgeFn).not.toHaveBeenCalled()
  })

  it('⌥⌫ in coop asks End game’s question; yes calls end_game', async () => {
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

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    h.result = { game: loadedGame({ mode: 'compete' }), guesses: [], loading: false }
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

    const done = makeCtx({ isTerminal: true, playState: 'ended', status: { outcome: 'complete' } })
    render(<PlayArea {...done} />)
    // No host this time: the RPC firing proves no question was asked.
    await user.click(document.querySelector('button[data-action="act-restart"]')!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })
})

describe('wordiply PlayArea — the menu', () => {
  it('lists Help, Reveal, New game, the exit and Back to club', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const rows = menuItems(ctx)
    for (const id of ['act-help', 'act-reveal', 'act-new-game', 'act-restart', 'act-end-game', 'act-back-to-club']) {
      expect(rows.get(id), id).toBeDefined()
      expect(rows.get(id)!.hidden, id).toBe(false)
    }
    // Both exits are placed; a coop game's Concede hides itself.
    expect(rows.get('act-concede')?.hidden).toBe(true)
    // Reveal is inert mid-game, and keeps its words rather than falling back to
    // the registry's bare "Reveal".
    expect(rows.get('act-reveal')?.disabled).toBe(true)
    expect(rows.get('act-reveal')?.label).toBe('Reveal best word')
  })

  it('a race lists Concede as the exit, not End game', () => {
    h.result = { game: loadedGame({ mode: 'compete' }), guesses: [], loading: false }
    const ctx = makeCtx({ players: twoMembers })
    render(<PlayArea {...ctx} />)
    expect(menuItems(ctx).get('act-concede')?.hidden).toBe(false)
    expect(menuItems(ctx).get('act-end-game')?.hidden).toBe(true)
  })
})
