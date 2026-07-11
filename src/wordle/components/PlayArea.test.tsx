/**
 * Render smoke tests for wordle's PlayArea: does the play surface mount and
 * render without throwing — in coop, in compete, and at terminal?
 *
 * Why this exists: a Phase-2 refactor removed a prop that was still referenced,
 * and the app shipped a BLANK PAGE (a runtime `ReferenceError`, not a type
 * error `tsc --noEmit` would surface — the root tsconfig checks nothing; see
 * memory project_typecheck_use_tsc_b). A one-line `render()` catches that class
 * of bug instantly. These are deliberately shallow: game logic lives in pgTAP
 * (the RPCs) and `colors.test.ts` (the render mapping); here we only prove the
 * component tree mounts.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the grid, keyboard, lists, dialogs — renders for real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { WordleGame, WordlePlayerState, GuessRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// Feedback `text` is now a ReactNode (an <ActorDot> widget + sentence) rather
// than a string — render it and read the plain text to assert on the wording.
const nodeText = (node: ReactNode) => render(<>{node}</>).container.textContent ?? ''

type GameHook = {
  game: WordleGame | null
  players: WordlePlayerState[]
  guesses: GuessRow[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

const me: WordlePlayerState = { user_id: 'u1', guesses_used: 0, solved: false, solved_at: null }
const moth: WordlePlayerState = { user_id: 'u2', guesses_used: 0, solved: false, solved_at: null }

/** Two club members, for the peer-narration tests (the lookup is by ctx.players). */
const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

/** A loaded game-hook result; override the game header + players per test. */
function loaded(
  game: WordleGame,
  guesses: GuessRow[] = [],
  players: WordlePlayerState[] = [me],
): GameHook {
  return { game, players, guesses, loading: false }
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
    // A realistic setup blob — the info-column disclosure reads it (a `{}` here
    // would crash timerLabel, exactly the kind of render bug these tests guard).
    setup: { max_guesses: 6, answer_source: 0, legal_guess: 4, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  }
}

beforeEach(() => {
  h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('wordle PlayArea — render smoke', () => {
  it('renders the board + a turn-log row in coop play', () => {
    // A landed guess exercises the GameTurnLog row (squares + who cell), not
    // just the empty state.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', seq: 0, guess: 'slate', colors: 'xxgyx', is_correct: false },
    ])
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  it('renders the board in compete play', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null })
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  it('renders the terminal state without crashing', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
    // The info-column outcome line + the answer reveal (now shown in both the
    // terminalExtra region and the below-board pill).
    expect(screen.getByText('Solved it!')).toBeInTheDocument()
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
  })
})

/**
 * Terminal flow (the waffle treatment — docs/celebration-ideas.md). Wordle
 * skips the shared GameOverModal; a coop solve pops the CelebrationDialog at
 * the MOMENT of the win (the playState flip), never on mounting an
 * already-won game. And the word stays HIDDEN on a loss — displayed only on
 * a win or an explicit reveal (the menu item, which at terminal is a local
 * "show me" with no RPC).
 */
describe('wordle PlayArea — terminal flow', () => {
  /** The game sections most recently pushed to the menu, flattened to items. */
  const menuItems = (ctx: GamePageCtx) => {
    const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
    const sections = calls.at(-1)![0] as { items: { id: string; label: string; disabled?: boolean; onClick: () => void }[] }[]
    return sections.flatMap((s) => s.items)
  }

  it('hides the word on a coop loss (no GameOverModal either)', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
    expect(screen.getByText('Out of guesses')).toBeInTheDocument()
    // The target is on the client (post-terminal shield-lift) but NOT displayed.
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.queryByText('Game over')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Reveal answer" at a lost terminal shows the word locally, with no RPC and no confirm', () => {
    const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false)
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...ctx} />)

    const reveal = menuItems(ctx).find((i) => i.id === 'reveal')!
    expect(reveal.disabled).toBeFalsy() // word hidden → reveal is offered
    act(() => reveal.onClick())
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    expect(confirm).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('"Reveal answer" is disabled once the word is showing (a win)', () => {
    const ctx = makeCtx({ isTerminal: true, playState: 'won' })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...ctx} />)
    expect(menuItems(ctx).find((i) => i.id === 'reveal')!.disabled).toBe(true)
  })

  it('"Replay board" at terminal calls replay_board WITHOUT confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false)
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...ctx} />)

    act(() => menuItems(ctx).find((i) => i.id === 'replay')!.onClick())
    // confirm returned false — the RPC firing anyway proves it was skipped.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('offers Restart in the terminal row (left of Club), calling replay_board unconfirmed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false)
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    const restart = screen.getByRole('button', { name: 'Restart' })
    const club = screen.getByRole('button', { name: /club/i })
    expect(restart.compareDocumentPosition(club) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(restart)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('replay resets the board fully — no stale pending row from the finished run', async () => {
    // The bug: BoardCol's `pending` (the submitted word held on the board through
    // the RPC round-trip) lingered after its row landed; when replay reset `rows`
    // to empty, the stale word resurrected as an uncolored top row AND held
    // `canGuess` false. Rows shrinking must clear it.
    rpc.mockResolvedValue({ data: { result: 'incorrect' }, error: null })
    const game = { id: 'g1', mode: 'coop' as const, max_guesses: 6, target: null }
    h.result = loaded(game)
    const { rerender } = render(<PlayArea {...makeCtx()} />)

    // Submit "crane" — BoardCol holds it as the pending row...
    for (const key of ['c', 'r', 'a', 'n', 'e']) fireEvent.keyDown(window, { key })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    // ...its colored server row lands...
    h.result = loaded(game, [
      { user_id: 'u1', seq: 1, guess: 'crane', colors: 'xxxxx', is_correct: false },
    ])
    rerender(<PlayArea {...makeCtx()} />)
    // ...then replay wipes the guesses (rows shrink to empty).
    h.result = loaded(game, [])
    rerender(<PlayArea {...makeCtx()} />)

    // Entirely blank board, and input is live again.
    const grid = screen.getByRole('grid', { name: /board/i })
    expect(grid.textContent?.trim()).toBe('')
    expect(screen.getByRole('button', { name: /^a$/i })).toBeEnabled()
  })

  it('pops the celebration when the coop win lands mid-session, not on mount', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    const { rerender } = render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The winning guess arrives: playState flips to won via realtime.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    rerender(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('dialog', { name: 'Solved! 🎉' })).toBeInTheDocument()
  })

  it('does not celebrate when mounted into an already-won game', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not celebrate a compete win', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    const base = { players: twoMembers }
    const { rerender } = render(<PlayArea {...makeCtx(base)} />)

    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: 'crane' }, [], [
      { ...me, solved: true },
      moth,
    ])
    rerender(
      <PlayArea
        {...makeCtx({ ...base, isTerminal: true, playState: 'won_compete', status: { winner: 'u1' } })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('You won!')).toBeInTheDocument()
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
    render(<PlayArea {...makeCtx()} />) // playing, self is a player → gate open
    expect(keyboardKey()).toBeEnabled()
  })

  it('the on-screen keyboard is blocked at terminal', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />) // gate closed
    expect(keyboardKey()).toBeDisabled()
  })
})

describe('wordle PlayArea — peer narration (global header)', () => {
  it("announces a teammate's accepted guess in coop", () => {
    const feedback = { show: vi.fn(), clear: vi.fn() }
    const ctx = makeCtx({ globalFeedback: feedback, players: twoMembers })
    // First render seeds the seen-set with my own guess (no announcement).
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', seq: 0, guess: 'slate', colors: 'xxxxx', is_correct: false },
    ])
    const { rerender } = render(<PlayArea {...ctx} />)
    feedback.show.mockClear()
    // A teammate's guess lands → narrated in the header.
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', seq: 0, guess: 'slate', colors: 'xxxxx', is_correct: false },
      { user_id: 'u2', seq: 0, guess: 'crane', colors: 'ggggg', is_correct: true },
    ])
    rerender(<PlayArea {...ctx} />)
    expect(feedback.show).toHaveBeenCalledTimes(1)
    expect(nodeText(feedback.show.mock.calls[0][0].text)).toBe('moth guessed CRANE')
  })

  it('does not narrate my own guess', () => {
    const feedback = { show: vi.fn(), clear: vi.fn() }
    const ctx = makeCtx({ globalFeedback: feedback, players: twoMembers })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [])
    const { rerender } = render(<PlayArea {...ctx} />)
    feedback.show.mockClear()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', seq: 0, guess: 'slate', colors: 'xxxxx', is_correct: false },
    ])
    rerender(<PlayArea {...ctx} />)
    expect(feedback.show).not.toHaveBeenCalled()
  })

  it('announces an opponent solving in compete', () => {
    const feedback = { show: vi.fn(), clear: vi.fn() }
    const ctx = makeCtx({ globalFeedback: feedback, players: twoMembers })
    // First render seeds: nobody solved yet.
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    const { rerender } = render(<PlayArea {...ctx} />)
    feedback.show.mockClear()
    // moth solves → narrated (the only peer event compete can surface).
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [
      me,
      { ...moth, solved: true },
    ])
    rerender(<PlayArea {...ctx} />)
    expect(feedback.show).toHaveBeenCalledTimes(1)
    expect(nodeText(feedback.show.mock.calls[0][0].text)).toBe('moth solved it')
    // Green — a solve is a solve regardless of whose (tone follows the event).
    expect(feedback.show.mock.calls[0][0].tone).toBe('success')
  })
})

describe('wordle PlayArea — opponent picker (compete)', () => {
  it('shows "hidden until game ends" when an opponent is picked during play', async () => {
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    // Defaults to my own (empty) board.
    expect(screen.getByText('No guesses yet.')).toBeInTheDocument()
    // Pick the opponent → their guesses are RLS-hidden until the game ends.
    await user.selectOptions(screen.getByLabelText('Whose guesses to show'), 'u2')
    expect(screen.getByText('Hidden until game ends.')).toBeInTheDocument()
  })
})

describe('wordle PlayArea — turn-log picker label', () => {
  it('labels the player "You" in a solo game the player is viewing', () => {
    // makeCtx defaults to viewer u1 as the only player.
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('option', { name: 'You' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Team' })).not.toBeInTheDocument()
  })

  it("names the player (not the viewer) when a club member spectates a solo game", () => {
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
    render(<PlayArea {...ctx} />)
    expect(screen.getByRole('option', { name: 'joel' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'You' })).not.toBeInTheDocument()
  })

  it('shows "Team" in a multi-player coop game', () => {
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByRole('option', { name: 'Team' })).toBeInTheDocument()
  })
})

describe('wordle PlayArea — concede', () => {
  it('compete shows Concede and calls wordle.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
  })

  it('marks a conceded opponent "out" in the strip', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(
      <PlayArea
        {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })] })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null }, [], [me, moth])
    render(
      <PlayArea
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
    render(<PlayArea {...makeCtx()} />)
    // The capture core reads keydowns off the window (no focused input).
    for (const key of ['c', 'r', 'a', 'n', 'e']) fireEvent.keyDown(window, { key })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', guess: 'crane' }),
    )
  })

  it('ignores keystrokes aimed at a focused text field (chat isolation)', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    render(<PlayArea {...makeCtx()} />)
    const input = document.createElement('input')
    document.body.append(input)
    for (const key of ['c', 'r', 'a', 'n', 'e', 'Enter']) fireEvent.keyDown(input, { key })
    expect(rpc).not.toHaveBeenCalled() // typing in an input never reaches the board
    input.remove()
  })

  it('has NO ArrowUp-recall / ArrowDown-clear (wordle is not an EntryBox)', async () => {
    rpc.mockResolvedValue({ data: { result: 'incorrect' }, error: null })
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
    render(<PlayArea {...makeCtx()} />)
    for (const key of ['c', 'r', 'a', 'n', 'e']) fireEvent.keyDown(window, { key })
    // In an EntryBox game ArrowDown would clear the entry; here it must do nothing,
    // so Enter still submits the intact "crane".
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', guess: 'crane' }),
    )
  })
})

describe('wordle PlayArea — click-to-define (turn log)', () => {
  it('makes each logged guess a define affordance on the WORD (not the cell)', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null }, [
      { user_id: 'u1', seq: 0, guess: 'slate', colors: 'xxxxx', is_correct: false },
    ])
    render(<PlayArea {...makeCtx()} />)
    // The turn-log guess carries the click-to-define affordance, and it rides the
    // whole five-letter word (one define per guess), not an individual cell.
    const define = screen.getByTitle('Click to define')
    expect(define).toHaveAttribute('role', 'button')
    expect(define).toHaveTextContent('SLATE')
  })
})
