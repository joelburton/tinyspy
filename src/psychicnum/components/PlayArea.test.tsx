// cs-unmet

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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { gp } from '@/common/members/gamePlayer.fixture'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import type { PsychicnumGame, PlayerRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

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
  return { game, players, guesses: [], loading: false, failure: null }
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
    menu: {
      setGameSections: vi.fn(),
      actHelp: boundActionFixture('act-help'),
      actChat: boundActionFixture('act-open-chat'),
      actBackToClub: boundActionFixture('act-back-to-club'),
    },
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

/** An `ok` envelope, in the shape `runRpc` unwraps. `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they correctly
 *  scream at rather than accept. */
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

/** The board's words in the order they are drawn. */
const boardOrder = () =>
  [...document.querySelectorAll('[data-board] [data-tile]')].map((t) => t.getAttribute('data-tile'))

beforeEach(() => {
  h.result = loaded(coopGame)
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('psychicnum PlayArea — concede', () => {
  it('compete shows Concede and calls psychicnum.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loaded(competeGame, [me, moth])
    render(
      <>
        <PlayArea {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />
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
    h.result = loaded(coopGame)
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

  it('keeps each action button its own tone — the color IS what it means', () => {
    // A regression this actually had: the tones live on the ACTION now (amber
    // for a help ask, red for the whole solution, red for an exit), and an
    // action that forgot one came out action-blue like everything else.
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('button', { name: 'Hint' }).className).toMatch(/caution/)
    expect(screen.getByRole('button', { name: 'Spoiler' }).className).toMatch(/caution/)
    expect(screen.getByRole('button', { name: 'End game' }).className).toMatch(/destructive/)
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
      failure: null,
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
    // swallows Tab anyway (common/core-css/utilities.css → `.definable`).
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
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
  }

  // The InfoCol's Hint / Spoiler buttons are ICON-ONLY, so the menu row is the
  // only place their lightbulb and bare eye are named (docs/ui.md → the menu is
  // the legend). A row with no icon would teach nothing, hence the icon assert.
  it('offers Hint + Spoiler rows, each carrying its glyph', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.label).toBe('Hint')
    expect(items.get('act-hint')?.icon).toBeTruthy()
    expect(items.get('act-spoiler')?.label).toBe('Spoiler')
    expect(items.get('act-spoiler')?.icon).toBeTruthy()
  })

  it('the rows fire the same RPCs as the buttons, and gray once I have no guesses left', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    menuItems(ctx).get('act-hint')?.run()
    expect(rpc).toHaveBeenCalledWith('request_hint', { target_game: 'g1' })
    menuItems(ctx).get('act-spoiler')?.run()
    expect(rpc).toHaveBeenCalledWith('request_reveal', { target_game: 'g1' })

    // Out of budget: disabled, but STILL THERE — a grayed row still teaches its
    // glyph, which is why the pair is never dropped.
    h.result = loaded(coopGame, [{ ...me, guesses_remaining: 0 }])
    const spent = makeCtx()
    render(<PlayArea {...spent} />)
    const items = menuItems(spent)
    expect(items.get('act-hint')?.disabled).toBe(true)
    expect(items.get('act-spoiler')?.disabled).toBe(true)
  })
})

/**
 * The terminal secrets reveal — the three secret tiles simply go GREEN, the same
 * green a found one wears, and the fact that it's a LOCAL, reversible choice
 * (useSolutionReveal). Nothing reveals them automatically: `replay_board` hunts
 * this same board and these same three secrets again, so a pre-revealed board
 * would leave Restart nothing to find.
 *
 * Green rather than a ring of its own (which is what this used to be) because
 * revealing is a STATE change, not a mark: green means "this word is a secret",
 * and asking to see is what makes me know it. Found-vs-peeked stays readable two
 * ways — toggle the reveal off, or look for the guesser's identity dot, which a
 * revealed tile has no reason to carry.
 *
 * Asserted through the tile's `correct` class — vitest runs with `css: false`, so
 * CSS-module keys come through unscoped (see vitest.config.ts).
 */
describe('psychicnum PlayArea — the terminal secrets reveal', () => {
  /** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
   *  draw — which is what a bound action and a hand-written row have in common. */
  function menuItems(ctx: GamePageCtx) {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
  }

  /** How many board tiles currently read as secrets (green). With no guesses in
   *  these fixtures, that is exactly the revealed ones. */
  const ringed = () =>
    screen.getAllByRole('button').filter((b) => b.className.includes('correct')).length

  /** A finished game whose secrets have reached this client (the server sends
   *  them once the game is terminal). */
  const ended = () => {
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    return makeCtx({ isTerminal: true, playState: 'lost' })
  }

  it('a coop WIN shows them unasked — the team found all three', () => {
    // The coop half of `solvedByMe`, and a case this shipped broken:
    // psychicnum bumps `found_secrets_count` per CALLER, so in a coop game
    // where teammates found 2 and 1 NEITHER row reads three, and a per-player
    // bit would leave the winners pressing Reveal.
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(ringed()).toBe(3)
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('draws the reveal in its own red — this uncovers more than one word', () => {
    render(<PlayArea {...ended()} />)
    expect(screen.getByRole('button', { name: 'Reveal secrets' }).className).toMatch(/destructive/)
  })

  it('leaves the secrets hidden until this viewer asks', () => {
    render(<PlayArea {...ended()} />)
    expect(ringed()).toBe(0)
    expect(screen.getByRole('button', { name: 'Reveal secrets' })).toBeEnabled()
  })

  it('Reveal greens the three for me alone — no RPC', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...ended()} />)
    await user.click(screen.getByRole('button', { name: 'Reveal secrets' }))
    expect(ringed()).toBe(3)
    // Local state: no teammate's board lit up.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides them again, restoring the board as it ended', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...ended()} />)
    await user.click(screen.getByRole('button', { name: 'Reveal secrets' }))
    await user.click(screen.getByRole('button', { name: 'Hide secrets' }))
    expect(ringed()).toBe(0)
  })

  it('the menu twin is the same toggle, and flips its label AND its glyph', async () => {
    // Both faces, because the button beside it is icon-only: there the glyph is
    // the label, and a row that kept the reveal eye while saying "Hide" would
    // teach the wrong glyph (docs/ui.md → the menu is the legend).
    const ctx = ended()
    render(<PlayArea {...ctx} />)
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal secrets')
    const revealFace = menuItems(ctx).get('act-reveal')?.icon
    act(() => menuItems(ctx).get('act-reveal')!.run())
    expect(ringed()).toBe(3)
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide secrets'))
    expect(menuItems(ctx).get('act-reveal')?.icon).not.toBe(revealFace)
  })

  it('the menu twin is inert before the game is over for everyone', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    // Nothing to ring: the secrets don't reach this client until terminal.
    expect(menuItems(ctx).get('act-reveal')?.disabled).toBe(true)
    // Still named, though — an inert row that fell through to the registry's
    // bare "Reveal" would rename itself as the game ended.
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal secrets')
  })
})

/**
 * The board-scope marks (plans/tile-feedback.md). None of this is game logic, and
 * none of it is visible to a type check: a mark that stops being applied looks
 * exactly like a mark nobody asked for. The identity dot is deliberately NOT
 * pinned yet — its audience rule is still being decided (coop-only today, 2+
 * players eventually).
 *
 * The board is reached through `[data-board]` rather than a role: psychicnum's grid
 * carries no ARIA role, and adding one to make testing easier would be extending
 * the app's ARIA surface (CLAUDE.md — screen readers are out of scope).
 */
describe('psychicnum PlayArea — the board-scope marks', () => {
  /** The grid element the marks ride on: the board root's only child. */
  const gridIn = (container: HTMLElement) =>
    container.querySelector('[data-board] > div') as HTMLElement

  it('bands the finished board in its outcome', () => {
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    const { container } = render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)

    expect(gridIn(container).className).toMatch(/gameOverFrame/)
    expect(gridIn(container).className).toMatch(/gameOverWon/)
    expect(gridIn(container).className).not.toMatch(/gameOverLost/)
  })

  it('leaves a live board unmarked', () => {
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(gridIn(container).className).not.toMatch(/gameOver/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  it('dims the board while a teammate holds the move, and flashes when it arrives', () => {
    const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]
    const { container, rerender } = render(
      <PlayArea {...makeCtx({ currentTurnUserId: 'u2', isMyTurn: false, players: two })} />,
    )
    expect(gridIn(container).className).toMatch(/dimNotYourTurn/)
    // An EVENT, so never on mount: opening a game on your own turn is not being
    // handed it.
    expect(gridIn(container).className).not.toMatch(/yourTurnFlash/)

    rerender(<PlayArea {...makeCtx({ currentTurnUserId: 'u1', isMyTurn: true, players: two })} />)

    expect(gridIn(container).className).toMatch(/yourTurnFlash/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  // The attention flash reads the guess log, not the board — so the one board
  // change nobody played into stays silent. Revealing turns three tiles green at
  // once, which a diff would call three simultaneous moves.
  it('says nothing when the answer is revealed', async () => {
    const user = userEvent.setup()
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    const { container } = render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal secrets' }))

    const tiles = within(gridIn(container)).getAllByRole('button')
    // The three secrets went green…
    expect(tiles.filter((t) => t.className.includes('correct'))).toHaveLength(3)
    // …and not one of them flashed.
    expect(tiles.some((t) => /attentionFlash/.test(t.className))).toBe(false)
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is a bound action's, so
 * what these pin is the wiring: the chord reaches the binding, the binding asks
 * the registry's question mid-game and skips it at terminal, and the answer
 * runs the same RPC the button does.
 */
describe('psychicnum PlayArea — the keys', () => {
  const ended = () => {
    h.result = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    return makeCtx({ isTerminal: true, playState: 'lost' })
  }

  it('+ at terminal starts the next game with no question', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'created', id: 'fresh-game-id' }))
    const ctx = ended()
    render(<WithKeys {...ctx} />)

    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    press(PLUS)
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'create_game',
        expect.objectContaining({ target_club: 'testclub', player_user_ids: ['u1'], mode: 'coop' }),
      ),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('psychicnum_coop', 'fresh-game-id'))
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
    expect(rpc).not.toHaveBeenCalledWith('create_game', expect.anything())
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
    h.result = loaded(competeGame, [me, moth])
    render(
      <>
        <WithKeys {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('end_game', expect.anything())
  })

  describe('⌥Z shuffles the board', () => {
    // The shuffle is Fisher–Yates over the ORIGINAL words on `Math.random`, so
    // a pinned value is a fixed permutation: 0 rotates the list, ~1 leaves it
    // alone. Pinning one for the render and the other for the press makes
    // "the same words in a different order" a deterministic claim rather than
    // a 1-in-120 flake.
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })
    const nextShuffleDiffers = () => vi.spyOn(Math, 'random').mockReturnValue(0.999999)

    // Awaited: the bound run is async (single-flight, then the question that
    // isn't asked here), so the re-order lands a tick after the keystroke.
    it('rearranges the same words mid-game, with no round trip', async () => {
      render(<WithKeys {...makeCtx()} />)
      const before = boardOrder()
      expect(before).toHaveLength(WORDS.length)

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      const after = boardOrder()
      expect(after).not.toEqual(before)
      expect([...after].sort()).toEqual([...before].sort())
      expect(rpc).not.toHaveBeenCalled()
    })

    it('still works on a finished board — the fidget is deliberate', async () => {
      render(<WithKeys {...ended()} />)
      expect(bound('act-shuffle').describe().state).toBe('active')
      const before = boardOrder()

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      expect(boardOrder()).not.toEqual(before)
    })
  })

  describe('Restart', () => {
    // Keyless, so it is fired as the menu row would fire it: the bound run, which
    // is where the registry's question is asked.
    it('mid-game asks first, and Keep playing wipes nothing', async () => {
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

    it('mid-game, yes calls replay_board', async () => {
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

    it('at terminal the button goes straight through', async () => {
      const user = userEvent.setup()
      render(<PlayArea {...ended()} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    })
  })
})
