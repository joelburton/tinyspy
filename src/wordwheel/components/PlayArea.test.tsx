/**
 * Render + behavior tests for wordwheel's PlayArea.
 *
 * Why this exists: the trusting-commit refactor rewired the whole submit path
 * (the shared `useWordSubmit` hook, the un-gated word lists, the client-side
 * reveal), and wordwheel's PlayArea (the largest FE file in that change) had NO
 * component coverage — a blank-page runtime error wouldn't be caught by `tsc`
 * (the root tsconfig checks nothing — see memory project_typecheck_use_tsc_b).
 * These prove the tree mounts in every mode AND that the wordwheel-specific
 * glue works: the local lookup accepts a required/bonus/pangram word (optimistic
 * pill + `submit_word` call) and rejects a non-legal one with the right reason.
 * Deep game logic still lives in pgTAP + the lib Vitest suites (ranks /
 * letterMask / displayRows); here we cover the composition.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the wheel, RankBar, entry row, word list — renders
 * real.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { WordwheelGame, FoundWordRow } from '../hooks/useGame'
import { db } from '../db'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { PlayArea } from './PlayArea'

// Feedback `text` is now a ReactNode (an <ActorDot> widget + sentence) rather
// than a string — render it and read the plain text to assert on the wording.
const nodeText = (node: ReactNode) => render(<>{node}</>).container.textContent ?? ''

type GameHook = {
  game: WordwheelGame | null
  foundWords: FoundWordRow[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// PlayArea's "New game" calls the start-game edge function directly (the same
// helper the manifest uses); mocked so no edge runtime is needed.
vi.mock('../../common/lib/game/manifestRpcs', () => ({ invokeStartGameEdgeFn: vi.fn() }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = invokeStartGameEdgeFn as unknown as ReturnType<typeof vi.fn>

/** A loaded coop game: outer `cabdfg` + center `e`; required `bead` + the pangram
 *  `abcdefg`; one bonus word `bcdfge`. Override the mode per test. */
function loadedGame(over: Partial<WordwheelGame> = {}): WordwheelGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    outer_letters: 'cabdfghi',
    center_letter: 'e',
    required_words_score: 18,
    required_words_count: 2,
    created_at: '2026-01-01T00:00:00Z',
    requiredWords: [
      { word: 'bead', points: 1, is_pangram: false },
      { word: 'abcdefg', points: 17, is_pangram: true },
    ],
    bonusWords: [{ word: 'bcdfge', points: 6, is_pangram: false }],
    ...over,
  }
}

function loaded(game: WordwheelGame, foundWords: FoundWordRow[] = []): GameHook {
  return { game, foundWords, loading: false }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'MooseWheel',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    // A realistic setup blob — the info-column disclosure + rank target read it.
    setup: { required: 3, legal: 5, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null }) // trusting-commit succeeds by default
})

describe('wordwheel PlayArea — render smoke', () => {
  it('renders the wheel + RankBar + Stats in coop play', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('group', { name: /wheel/i })).toBeInTheDocument()
    // The center letter is a labelled tile button.
    expect(screen.getByRole('button', { name: /center letter/i })).toBeInTheDocument()
    // The WordList rendered (empty during play).
    expect(screen.getByText(/no words yet/i)).toBeInTheDocument()
  })

  it('renders the OpponentStrip (Rank) in compete play', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<PlayArea {...makeCtx({ players: twoMembers, setup: { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } } })} />)
    expect(screen.getByText('Rank:')).toBeInTheDocument()
  })

  it('renders the terminal state and reveals unfound required words', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    // At terminal the WordList reveals required words nobody found — 'bead' was
    // never submitted, so it appears in the list.
    expect(screen.getByText(/bead/i)).toBeInTheDocument()
  })
})

/**
 * The icon-only action rows (the waffle arrangement — labels live in
 * tooltips): PLAYING = End/Concede + Back-to-club (the shell's
 * suspend-confirm flow); TERMINAL = Restart + New game + Back-to-club.
 * Restart = wordwheel.replay_board (unconfirmed at terminal); New game =
 * the wordwheel-build-board edge function with THIS game's setup/roster/
 * mode, then ctx.goToGame.
 */
describe('wordwheel PlayArea — icon-only action rows', () => {
  it('playing row offers Back-to-club through the suspend-confirm flow', async () => {
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.requestBackToClub).toHaveBeenCalled()
    expect(ctx.goToClub).not.toHaveBeenCalled() // mid-game never direct-navigates
  })

  it('terminal Restart calls replay_board WITHOUT confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false)
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // confirm returned false — the RPC firing anyway proves it was skipped.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('terminal "New game" starts a fresh game with this setup/roster/mode', async () => {
    startEdgeFn.mockResolvedValue({ id: 'fresh-game-id' })
    const user = userEvent.setup()
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<PlayArea {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'wordwheel-build-board',
        {
          target_club: 'testclub',
          setup: ctx.setup,
          player_user_ids: ['u1'],
          mode: 'coop',
        },
        'MooseWheel',
      ),
    )
    await waitFor(() =>
      expect(ctx.goToGame).toHaveBeenCalledWith('wordwheel_coop', 'fresh-game-id'),
    )
  })
})

describe('wordwheel PlayArea — submit behavior (shared useWordSubmit)', () => {
  it('accepts a required word: optimistic pill + submit_word call', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('bead{Enter}')
    expect(screen.getByText(/BEAD — \+1/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'submit_word',
      expect.objectContaining({ word: 'bead', points: 1, is_bonus: false, is_pangram: false }),
    )
  })

  it('shows the bonus dot for a bonus word', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('bcdfge{Enter}')
    expect(screen.getByText(/BCDFGE • — \+6/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_bonus: true }))
  })

  it('shows the pangram flourish for a pangram', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('abcdefg{Enter}')
    expect(screen.getByText(/pangram \+17/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_pangram: true }))
  })

  it('blocks submitting a word with an off-wheel letter (inert, not a reject)', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('zzzz{Enter}') // z isn't a puzzle letter — the wheel can't spell it
    // The submit is vetoed, not rejected: no RPC, and crucially NO misleading
    // "not a word" pill (which read as "ZZZZ isn't in the dictionary").
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.queryByText(/not a word|bad letters/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('names the missing center letter (a fitting word still submits + rejects)', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('bcdf{Enter}') // valid tiles, but no center 'e' — fits the wheel, so it submits
    expect(screen.getByText(/missing center letter/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('blocks submitting a word that over-uses a tile (two e, one e-tile)', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('beed{Enter}') // two e's, but the wheel has one e-tile
    // Over-count = can't be spelled from the tiles, so submit is inert (no pill).
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.queryByText(/not a word|not enough tiles/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('dims a wheel tile once its letter is in the word (tile-spend rule)', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    // Before typing: the 'B' tile + the centre 'E' tile are enabled.
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('button', { name: /E \(center letter\)/ })).not.toHaveAttribute(
      'aria-disabled',
    )
    // Type 'be' → both spent → both tiles disabled; an untyped tile ('C') stays enabled.
    await user.keyboard('be')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: /E \(center letter\)/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'C' })).not.toHaveAttribute('aria-disabled')
    // Backspace re-enables the freed tile.
    await user.keyboard('{Backspace}') // removes 'e'
    expect(screen.getByRole('button', { name: /E \(center letter\)/ })).not.toHaveAttribute(
      'aria-disabled',
    )
  })

  it('spends duplicate tiles one per occurrence, the centre first', async () => {
    const user = userEvent.setup()
    // A wheel where the CENTER letter 'e' is duplicated on an outer tile:
    // typing one 'e' must spend the centre (the mandatory-use tile), leaving
    // its outer twin clickable; a second 'e' spends the twin too.
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    render(<PlayArea {...makeCtx()} />)
    const centerE = () => screen.getByRole('button', { name: /E \(center letter\)/ })
    const outerE = () => screen.getByRole('button', { name: 'E' })
    expect(centerE()).not.toHaveAttribute('aria-disabled')
    expect(outerE()).not.toHaveAttribute('aria-disabled')
    // First 'e': centre spent FIRST, the outer twin still available.
    await user.keyboard('e')
    expect(centerE()).toHaveAttribute('aria-disabled', 'true')
    expect(outerE()).not.toHaveAttribute('aria-disabled')
    // Second 'e': both e-tiles spent.
    await user.keyboard('e')
    expect(centerE()).toHaveAttribute('aria-disabled', 'true')
    expect(outerE()).toHaveAttribute('aria-disabled', 'true')
    // Backspace frees one occurrence → the outer twin re-enables, the centre
    // stays spent (it's first in the spend order).
    await user.keyboard('{Backspace}')
    expect(centerE()).toHaveAttribute('aria-disabled', 'true')
    expect(outerE()).not.toHaveAttribute('aria-disabled')
  })
})

describe('wordwheel PlayArea — coop peer narration (global header)', () => {
  // `useGlobalFeedback` seeds the backlog silently on the first loaded render,
  // then fires a header pill for each NEW peer row. Each test renders once (empty
  // seed), pushes a peer row into the mocked useGame, and re-renders to fire.

  /** A peer's accepted found_words row (the coop header reads these). */
  function foundRow(over: Partial<FoundWordRow> = {}): FoundWordRow {
    return {
      game_id: 'g1',
      user_id: 'u2', // 'moth' — a teammate, not the caller (u1)
      word: 'bead',
      points: 1,
      is_pangram: false,
      is_bonus: false,
      found_at: '2026-01-01T00:00:01Z',
      ...over,
    }
  }

  it("narrates a teammate's find with the word + points", () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'bead', points: 1 })])
    rerender(<PlayArea {...ctx} />)
    const msg = vi.mocked(ctx.globalFeedback.show).mock.calls.at(-1)![0]
    expect(nodeText(msg.text)).toBe('moth found BEAD +1')
    expect(msg.tone).toBe('success')
  })

  it('adds the pangram flourish for a peer pangram', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'duplicate', points: 24, is_pangram: true })])
    rerender(<PlayArea {...ctx} />)
    expect(nodeText(vi.mocked(ctx.globalFeedback.show).mock.calls.at(-1)![0].text)).toBe(
      'moth found DUPLICATE +24 — pangram! 🦌',
    )
  })

  it('shows the bonus dot after a peer bonus find', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'bcdfge', points: 6, is_bonus: true })])
    rerender(<PlayArea {...ctx} />)
    expect(nodeText(vi.mocked(ctx.globalFeedback.show).mock.calls.at(-1)![0].text)).toBe(
      'moth found BCDFGE • +6',
    )
  })

  it('does not narrate your own find (that goes to the local pill)', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ user_id: 'u1', word: 'bead', points: 1 })])
    rerender(<PlayArea {...ctx} />)
    expect(ctx.globalFeedback.show).not.toHaveBeenCalled()
  })
})

describe('wordwheel PlayArea — compete opponent rank climb', () => {
  // The compete channel is a hand-rolled rank-delta detector over
  // `status.leaderboard` (opponents' words are private, so it reads the aggregate
  // rank). It seeds each opponent's rank on the first render, then fires a
  // **sticky** pill when a rank INCREASES.
  const entry = (rank_idx: number) => ({
    user_id: 'u2',
    rank_idx,
    found_words_score: 10 * rank_idx,
    found_words_count: rank_idx,
  })
  const competeCtx = (rank_idx: number, over: Partial<GamePageCtx> = {}) =>
    makeCtx({
      players: twoMembers,
      setup: { required: 3, legal: 5, target_rank: 6, timer: { kind: 'none' } },
      status: { leaderboard: [entry(rank_idx)] },
      ...over,
    })

  it('fires a sticky pill when an opponent reaches a higher rank', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const gf = { show: vi.fn(), clear: vi.fn() }
    const props = competeCtx(1, { globalFeedback: gf as unknown as GamePageCtx['globalFeedback'] })
    const { rerender } = render(<PlayArea {...props} />)
    // Same globalFeedback + players, new leaderboard with u2 climbing 1 → 2.
    rerender(<PlayArea {...props} status={{ leaderboard: [entry(2)] }} />)
    const rankMsg = vi.mocked(gf.show).mock.calls.at(-1)![0]
    expect(nodeText(rankMsg.text)).toMatch(/^moth reached /)
    expect(rankMsg.dismiss).toEqual({ kind: 'sticky' })
  })
})

describe('wordwheel PlayArea — concede', () => {
  const competeSetup = { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } }

  it('compete shows Concede and calls wordwheel.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<PlayArea {...makeCtx({ players: twoMembers, setup: competeSetup })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    await user.click(await screen.findByRole('button', { name: 'End game' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })],
          setup: competeSetup,
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
          setup: competeSetup,
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
          setup: competeSetup,
          status: {
            winner: 'u3',
            leaderboard: [
              { user_id: 'u2', rank_idx: 4, found_words_score: 40, found_words_count: 4 },
              { user_id: 'u3', rank_idx: 5, found_words_score: 60, found_words_count: 6 },
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
