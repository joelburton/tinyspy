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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { BoggleGame, FoundWordRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// Feedback `text` is now a ReactNode (an <ActorDot> widget + sentence) rather
// than a string — render it and read the plain text to assert on the wording.
const nodeText = (node: ReactNode) => render(<>{node}</>).container.textContent ?? ''

type GameHook = {
  game: BoggleGame | null
  foundWords: FoundWordRow[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

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
  return { game, foundWords, loading: false }
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
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null }) // trusting-commit succeeds by default
})

describe('boggle PlayArea — render smoke', () => {
  it('renders the 4×4 board + the Stats grid in coop play', () => {
    // Give the game a bonus word so bonusCount > 0 and the 4-cell grid renders.
    h.result = loaded(loadedGame({ bonus_words: [{ word: 'dog', points: 2 }] }))
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(container.querySelectorAll('[data-boggle-tile]')).toHaveLength(16)
    // The info-column 4-cell Stats grid (all labels are unique to Stats).
    expect(screen.getByText('Req Words')).toBeInTheDocument()
    expect(screen.getByText('Req Score')).toBeInTheDocument()
    expect(screen.getByText('Bonus Words')).toBeInTheDocument()
    expect(screen.getByText('Bonus Score')).toBeInTheDocument()
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
    expect(screen.queryByText('Bonus Words')).not.toBeInTheDocument()
    expect(screen.queryByText('Bonus Score')).not.toBeInTheDocument()
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
          status: { mode: 'compete', outcome: 'target', winner_id: 'u1', winner_username: 'me', leaderboard: [] },
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
          status: { mode: 'compete', outcome: 'target', winner_id: 'u2', winner_username: 'moth', leaderboard: [] },
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
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('zzz{Enter}')
    expect(screen.getByText(/not on board/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('boggle PlayArea — submit behavior (shared useWordSubmit)', () => {
  it('accepts a required word: optimistic pill + submit_word call', async () => {
    // 'cat' is in the required list (membership, not traceability, drives accept),
    // so it commits optimistically with the stored points + is_bonus=false.
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
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
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('dog{Enter}')
    expect(screen.getByText(/DOG • — \+2/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_bonus: true }))
  })

  it('rejects a real-but-untraceable word as "not a word"', async () => {
    // 'aid' isn't in required ∪ bonus, but it IS traceable on the plain board
    // (a→i→? — actually a,i adjacent? the board is row-major abcd/efgh/ijkl/mnop;
    // pick a word whose letters trace): use a legal-list miss that traces.
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('abe{Enter}') // a(0)→b(1)→e(4): adjacent, traceable, not in the lists
    expect(screen.getByText(/not a word/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('boggle PlayArea — coop peer narration (global header)', () => {
  // `useGlobalFeedback` seeds the backlog silently on the first loaded render,
  // then fires a header pill for each NEW peer row. So each test renders once
  // (empty seed), pushes a peer row into the mocked useGame, and re-renders to
  // trigger the fire — asserting on the same ctx's stable `globalFeedback.show`.

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

  it("narrates a teammate's find with the word + points", () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'dog', points: 2 })])
    rerender(<PlayArea {...ctx} />)
    const msg = vi.mocked(ctx.globalFeedback.show).mock.calls.at(-1)![0]
    expect(nodeText(msg.text)).toBe('moth found DOG +2')
    expect(msg.tone).toBe('success')
  })

  it('flags a long (7+ letter) find with "wow!"', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'jackpot', points: 9 })])
    rerender(<PlayArea {...ctx} />)
    expect(nodeText(vi.mocked(ctx.globalFeedback.show).mock.calls.at(-1)![0].text)).toBe(
      'moth found JACKPOT +9 — wow!',
    )
  })

  it('shows the bonus dot after a bonus find', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'dog', points: 2, is_bonus: true })])
    rerender(<PlayArea {...ctx} />)
    expect(nodeText(vi.mocked(ctx.globalFeedback.show).mock.calls.at(-1)![0].text)).toBe(
      'moth found DOG • +2',
    )
  })

  it('does not narrate your own find (that goes to the local pill)', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ user_id: 'u1', word: 'cat', points: 1 })])
    rerender(<PlayArea {...ctx} />)
    expect(ctx.globalFeedback.show).not.toHaveBeenCalled()
  })

  it("stays silent in compete (opponents' finds are private)", () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame({ mode: 'compete' }), [foundRow({ word: 'dog', points: 2 })])
    rerender(<PlayArea {...ctx} />)
    expect(ctx.globalFeedback.show).not.toHaveBeenCalled()
  })
})

describe('boggle PlayArea — concede', () => {
  // Concede = a per-player "I quit, the game continues for the others" action for
  // COMPETE (boggle is non-elimination, so it's the only way to a locally-done
  // state). Coop keeps the neutral whole-table End. Mirrors spellingbee's block.

  it('compete shows Concede and calls boggle.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
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
              { user_id: 'u2', count: 4, score: 12 },
              { user_id: 'u3', count: 6, score: 40 },
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
