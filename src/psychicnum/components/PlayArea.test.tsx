/**
 * Component tests for psychicnum's PlayArea — focused on the per-player
 * CONCEDE flow (compete drop-out) and its coop counterpart (whole-table End).
 *
 * psychicnum is an ELIMINATION game: each player has an independent guess
 * budget, so "done for me" (out of budget, or conceded) can happen while the
 * others keep racing. Concede is the deliberate version of that — a real loss
 * that leaves the rest playing (the opposite of coop's end_game, which stops the
 * game for everyone). These tests pin the wiring: compete offers Concede →
 * psychicnum.concede; coop offers End → psychicnum.end_game; a conceded opponent
 * reads "out" mid-game; and after I concede I get the locally-terminal look.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the board, entry, strip, action row — renders for
 * real. Mirrors wordle's concede tests (the elimination template, commit c1b5df8).
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { PsychicnumGame, PlayerRow, GuessRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = {
  game: PsychicnumGame | null
  players: PlayerRow[]
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

// Budget rows (psychicnum.players): guesses_remaining > 0 so the viewer can act
// (the "playing" action row with its End/Concede button shows).
const me: PlayerRow = { user_id: 'u1', guesses_remaining: 7, found_secrets_count: 0 }
const moth: PlayerRow = { user_id: 'u2', guesses_remaining: 7, found_secrets_count: 0 }

/** A loaded game-hook result; override the game header + budget rows per test. */
function loaded(game: PsychicnumGame, players: PlayerRow[] = [me]): GameHook {
  return { game, players, guesses: [], loading: false }
}

/** A board word list — Board renders a tile per word; needs at least one. */
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo']

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    // A realistic setup blob — the info column reads `guesses` + `difficulty`.
    setup: { guesses: 7, word_count: 10, difficulty: 3, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

const competeGame: PsychicnumGame = {
  id: 'g1',
  club_handle: 'club',
  mode: 'compete',
  words: WORDS,
  secrets: null,
  created_at: '2026-07-02',
}
const coopGame: PsychicnumGame = { ...competeGame, mode: 'coop' }

beforeEach(() => {
  h.result = loaded(coopGame)
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('psychicnum PlayArea — concede', () => {
  it('compete shows Concede and calls psychicnum.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(competeGame, [me, moth])
    render(<PlayArea {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    const user = userEvent.setup()
    h.result = loaded(coopGame)
    render(<PlayArea {...makeCtx()} />)
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
    h.result = loaded(competeGame, [me, moth])
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
    h.result = loaded(competeGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    // The info-column action row swaps to the terminal LOOK ("You conceded"),
    // and the below-board pill narrates the drop-out ("Conceded — race
    // continues" — the shared `outOfRacePill`).
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(screen.getByText(/Conceded — race continues/)).toBeInTheDocument()
  })
})

describe('psychicnum PlayArea — turn order', () => {
  it('on a teammate’s turn: shows "Waiting for …" and gates the guess prompt', () => {
    h.result = loaded(coopGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isMyTurn: false,
          currentTurnUserId: 'u2',
        })}
      />,
    )
    // The current player is named TWICE while I wait: the info column's
    // TurnStatusLine (desktop) and the below-board waitingTurnPill (the only
    // whose-turn indicator on mobile, where the column is off-canvas). Both
    // render the shared `waitingFor` copy; a regex because the name sits in a
    // text node beside the identity <Dot>. Coop has no OpponentStrip, but the
    // turn log's player picker also lists every player by handle — so exclude
    // its <option> to keep this counting the turn copy alone.
    // Exclude the turn log's player-picker <option>s AND the setup recap's
    // <li>s: the recap now opens with a "Players: …" roster row (docs/pdf.md →
    // Setup rows), which names everyone too. This counts the TURN COPY alone.
    const named = screen
      .getAllByText(/moth/)
      .filter((el) => el.tagName !== 'OPTION' && el.tagName !== 'LI')
    expect(named).toHaveLength(2)
    // The "type a word" prompt is hidden while I'm waiting (the entry is inert).
    // But I'm still a live participant — NOT locally terminal — so I do NOT get
    // the "out of guesses" / "Waiting for others" done-look, and Hint stays live.
    expect(screen.queryByText(/hit submit/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for others')).not.toBeInTheDocument()
    expect(screen.queryByText(/Out of guesses/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hint/i })).toBeInTheDocument()
  })

  it('on my turn: shows "Your turn", the guess prompt, and the play actions', () => {
    h.result = loaded(coopGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isMyTurn: true,
          currentTurnUserId: 'u1',
        })}
      />,
    )
    expect(screen.getByText('Your turn')).toBeInTheDocument()
    expect(screen.getByText(/hit submit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hint/i })).toBeInTheDocument()
  })

  it('free-for-all (no pointer): renders no turn line', () => {
    h.result = loaded(coopGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isMyTurn: true,
          currentTurnUserId: null,
        })}
      />,
    )
    expect(screen.queryByText('Your turn')).not.toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
  })
})

describe('psychicnum PlayArea — click-to-define (turn log)', () => {
  it('makes a guessed word in the log a define affordance (not the hint sentence)', () => {
    h.result = {
      game: coopGame,
      players: [me],
      guesses: [
        { id: 'g-1', user_id: 'u1', word: 'bravo', is_correct: false, kind: 'guess', guessed_at: '2026-07-02' },
        { id: 'h-1', user_id: 'u1', word: 'a paid assassin', is_correct: false, kind: 'hint', guessed_at: '2026-07-02' },
      ],
      loading: false,
    }
    render(<PlayArea {...makeCtx()} />)
    // The guessed word is definable...
    const define = screen.getByTitle('Click to define')
    expect(define).toHaveTextContent('BRAVO')
    // POINTER-ONLY: not a tab stop and not announced as a control. Definitions
    // are a convenience on a word you're already pointing at, and the entry
    // swallows Tab anyway (common/theme.css → `.definable`).
    expect(define).not.toHaveAttribute('role')
    expect(define).not.toHaveAttribute('tabindex')
    // ...but the hint sentence is not (only the one define affordance in the log).
    expect(screen.getAllByTitle('Click to define')).toHaveLength(1)
    expect(screen.getByText(/a paid assassin/)).toBeInTheDocument()
  })
})

describe('psychicnum PlayArea — the game menu names the help glyphs', () => {
  /** Flatten what PlayArea handed `menu.setGameSections` into id → item. */
  function menuItems(ctx: GamePageCtx) {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = setSections.mock.calls.at(-1)?.[0] ?? []
    return new Map(
      (sections as { items: { id: string; label: string; icon?: unknown; disabled?: boolean; onClick: () => void }[] }[])
        .flatMap((s) => s.items)
        .map((i) => [i.id, i]),
    )
  }

  // The InfoCol's Hint / Spoiler buttons are ICON-ONLY, so the menu row is the
  // only place their lightbulb and bare eye are named (docs/ui.md → the menu is
  // the legend). A row with no icon would teach nothing, hence the icon assert.
  it('offers Hint + Spoiler rows, each carrying its glyph', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('hint')?.label).toBe('Hint')
    expect(items.get('hint')?.icon).toBeTruthy()
    expect(items.get('spoiler')?.label).toBe('Spoiler')
    expect(items.get('spoiler')?.icon).toBeTruthy()
  })

  it('the rows fire the same RPCs as the buttons, and grey once I have no guesses left', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    menuItems(ctx).get('hint')?.onClick()
    expect(rpc).toHaveBeenCalledWith('request_hint', { target_game: 'g1' })
    menuItems(ctx).get('spoiler')?.onClick()
    expect(rpc).toHaveBeenCalledWith('request_reveal', { target_game: 'g1' })

    // Out of budget: disabled, but STILL THERE — a greyed row still teaches its
    // glyph, which is why the pair is never dropped.
    h.result = loaded(coopGame, [{ ...me, guesses_remaining: 0 }])
    const spent = makeCtx()
    render(<PlayArea {...spent} />)
    const items = menuItems(spent)
    expect(items.get('hint')?.disabled).toBe(true)
    expect(items.get('spoiler')?.disabled).toBe(true)
  })
})

/**
 * The terminal secrets reveal — rings the three secret tiles on the board, and
 * the fact that it's a LOCAL, reversible choice (useSolutionReveal). Nothing
 * rings them automatically: `replay_board` hunts this same board and these same
 * three secrets again, so a ringed board would leave Restart nothing to find.
 *
 * Asserted through the tile's `secret` class — vitest runs with `css: false`,
 * so CSS-module keys come through unscoped (see vitest.config.ts).
 */
describe('psychicnum PlayArea — the terminal secrets reveal', () => {
  /** Flatten what PlayArea handed `menu.setGameSections` into id → item. */
  function menuItems(ctx: GamePageCtx) {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = setSections.mock.calls.at(-1)?.[0] ?? []
    return new Map(
      (sections as { items: { id: string; label: string; disabled?: boolean; onClick: () => void }[] }[])
        .flatMap((s) => s.items)
        .map((i) => [i.id, i]),
    )
  }

  /** How many board tiles are currently ringed as secrets. */
  const ringed = () =>
    screen.getAllByRole('button').filter((b) => b.className.includes('secret')).length

  /** A finished game whose secrets have reached this client (the server sends
   *  them once the game is terminal). */
  const ended = () => {
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    return makeCtx({ isTerminal: true, playState: 'lost' })
  }

  it('a coop WIN rings them unasked — the team found all three', () => {
    // The coop half of `solvedByMe`, and a case this shipped broken:
    // psychicnum bumps `found_secrets_count` per CALLER, so in a coop game
    // where teammates found 2 and 1 NEITHER row reads three, and a per-player
    // bit would leave the winners pressing Reveal.
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(ringed()).toBe(3)
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('leaves the board un-ringed until this viewer asks', () => {
    render(<PlayArea {...ended()} />)
    expect(ringed()).toBe(0)
    expect(screen.getByRole('button', { name: 'Reveal secrets' })).toBeEnabled()
  })

  it('Reveal rings the three for me alone — no RPC', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...ended()} />)
    await user.click(screen.getByRole('button', { name: 'Reveal secrets' }))
    expect(ringed()).toBe(3)
    // Local state: no teammate's board lit up.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button un-rings them, restoring the board as it ended', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...ended()} />)
    await user.click(screen.getByRole('button', { name: 'Reveal secrets' }))
    await user.click(screen.getByRole('button', { name: 'Hide secrets' }))
    expect(ringed()).toBe(0)
  })

  it('the menu twin is the same toggle, and flips its label with it', async () => {
    const ctx = ended()
    render(<PlayArea {...ctx} />)
    expect(menuItems(ctx).get('reveal')?.label).toBe('Reveal secrets')
    act(() => menuItems(ctx).get('reveal')!.onClick())
    expect(ringed()).toBe(3)
    await waitFor(() => expect(menuItems(ctx).get('reveal')?.label).toBe('Hide secrets'))
  })

  it('the menu twin is inert before the game is over for everyone', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    // Nothing to ring: the secrets don't reach this client until terminal.
    expect(menuItems(ctx).get('reveal')?.disabled).toBe(true)
  })
})
