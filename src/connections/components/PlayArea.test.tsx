// cs-unmet

/**
 * Render + concede tests for connections' PlayArea.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the board, strip, turn log, action row — renders
 * for real. These are deliberately shallow: game logic lives in pgTAP (the RPCs)
 * and `evaluate.test.ts` (the guess evaluator); here we prove the component tree
 * mounts and that the concede wiring (compete → connections.concede; coop → End)
 * is correct.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import type { ConnectionsGame, MatchedCategory } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

/**
 * The shape connections' useGame returns — the mock hands one of these back.
 *
 * DERIVED, not restated. Spelling the twelve fields out here made two
 * definitions of one shape with nothing forcing them to match, and the drift is
 * silent in the direction that matters: `vi.mock`'s factory is not type-checked
 * against the real module, so a field added to the hook and forgotten here
 * would leave the fake without it — the component reading `undefined` where the
 * real app reads a value, with every test still green.
 *
 * `typeof import(...)` rather than a top-level import, so asking for the type
 * pulls in no runtime binding from the module this file mocks.
 */
type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** What `submit_guess` answers on an accepted move. `runRpc` reads the ENVELOPE
 *  out of `data` now, so a mock resolving `{ error: null }` alone hands it a
 *  body it can't read and the call site sees a fault.
 *
 *  `data.result` NAMES THE CASE, in the wire words the column stores, and
 *  `outcome` says what it is worth — the split every move RPC uses. These tests
 *  submit a wrong guess the server recorded; an answer that wrote nothing comes
 *  back as a RACE (PN300 / PN301), not as an `ok`. */
const okEnvelope = {
  data: {
    type: 'ok', data: { result: 'wrong' }, outcome: 'lost', severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
}

/** A minimal 4-category / 16-tile board — enough for the FE to render the grid
 *  and the info-column setup disclosure without crashing. */
const board: ConnectionsGame['board'] = {
  categories: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'] },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'] },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'] },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'] },
  ],
  tileOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
}

function game(mode: 'coop' | 'compete'): ConnectionsGame {
  return {
    id: 'g1',
    club_handle: 'club',
    mode,
    board,
    puzzleDate: '2026-06-15',
    created_at: '2026-06-15T00:00:00Z',
  }
}

/** A loaded hook result; override mode + per-player state per test. */
function loaded(over: Partial<GameHook> = {}): GameHook {
  return {
    game: game('compete'),
    guesses: [],
    matchedCategories: [],
    mistakeCount: 0,
    opponentFound: new Map(),
    isEliminated: false,
    selections: new Map(),
    unionTiles: [],
    toggleTile: vi.fn(),
    sendClear: vi.fn(),
    loading: false,
    failure: null,
    ...over,
  }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'WordKnit',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { puzzle_id: 'p1', timer: { kind: 'none' } },
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

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

/** `okEnvelope` carrying a different `data` — for the calls whose ok is not a
 *  recorded guess (the next-puzzle preview, create_game). */
const ok = (data: unknown) => ({ ...okEnvelope, data: { ...okEnvelope.data, data } })

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
const ENTER = { key: 'Enter' }
const BACKSPACE = { key: 'Backspace' }
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

/** The Reveal control, by WHICH command it is: its words move with the toggle
 *  ("Reveal categories" / "Hide categories"), so they are the wrong handle
 *  wherever the words are not the subject. Keeps the role — a menu row would
 *  carry the same id. */
const revealButton = () =>
  screen.queryAllByRole('button').find((b) => b.dataset.action === 'act-reveal')

/** The loose tiles in the order they are drawn — what the shuffle rearranges. */
const tileOrder = () => [...document.querySelectorAll('[data-tile]')].map((b) => b.textContent)

beforeEach(() => {
  h.result = loaded()
  rpc.mockReset()
  rpc.mockResolvedValue(okEnvelope)
})

describe('connections PlayArea — concede', () => {
  it('compete shows Concede and calls connections.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loaded({ game: game('compete') })
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
    h.result = loaded({ game: game('coop') })
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

  it('marks a conceded opponent "out" in the strip', () => {
    h.result = loaded({ game: game('compete') })
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
    h.result = loaded({ game: game('compete') })
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    // The info-column action row shows the bold status; the below-board pill
    // carries the shared "Conceded — race continues" variant.
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

/**
 * The ended board, and the terminal reveal.
 *
 * connections used to be one of the two games that opened its answer unasked —
 * and the way it did it was destructive: the board swaps loose tiles for
 * full-width category bands, so revealing DELETED the tiles the players were
 * still staring at. A lost game showed four bands and nothing else, with no
 * record of how far anyone had got.
 *
 * Now the ended board is what they actually left (their bands plus the tiles
 * they never cracked, frozen), Reveal swaps in the unsolved categories, and
 * Hide swaps back.
 */
describe('connections PlayArea — the ended board + the terminal reveal', () => {
  /** The loose tiles currently on the board (bands are divs; the floating
   *  Shuffle control is a button inside the board root, hence `[data-tile]`). */
  const tileNames = () => [...document.querySelectorAll('[data-tile]')].map((b) => b.textContent)

  it('keeps the unsolved tiles on a lost board — the record of how far you got', () => {
    h.result = loaded({
      game: game('coop'),
      matchedCategories: [{ rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'], matched_at: '2026-06-15T00:00:00Z' }],
      mistakeCount: 4,
    })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    // The one they solved is a band; the other twelve tiles are still there.
    expect(screen.getByText('RED')).toBeInTheDocument()
    expect(tileNames()).toHaveLength(12)
    // And the answer is NOT on screen until asked for.
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
  })

  it('Reveal swaps the tiles for the unsolved categories; Hide swaps back', async () => {
    const user = userEvent.setup()
    h.result = loaded({
      game: game('coop'),
      matchedCategories: [{ rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'], matched_at: '2026-06-15T00:00:00Z' }],
      mistakeCount: 4,
    })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(revealButton()!)
    expect(screen.getByText('GREEN')).toBeInTheDocument()
    expect(screen.getByText('PURPLE')).toBeInTheDocument()
    expect(tileNames()).toHaveLength(0)
    // Local state — no peer's board changed.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(revealButton()!)
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
    expect(tileNames()).toHaveLength(12)
  })

  it('an eliminated compete player sees no answer while the others race', () => {
    h.result = loaded({ game: game('compete'), isEliminated: true, mistakeCount: 4 })
    render(<PlayArea {...makeCtx({ isTerminal: false, playState: 'playing' })} />)

    // Their board freezes and says so, but the puzzle stays unspoiled — sitting
    // out with something left to think about beats being handed the answer.
    expect(screen.getByText('You’re out')).toBeInTheDocument()
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
    expect(tileNames()).toHaveLength(16)
    // No Reveal either: it waits for the game to end for everyone.
    expect(revealButton()).toBeUndefined()
  })

  it('a frozen board ignores tile clicks', async () => {
    const user = userEvent.setup()
    const toggleTile = vi.fn()
    h.result = loaded({ game: game('coop'), mistakeCount: 4, toggleTile })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(document.querySelector('[data-tile="a"]') as HTMLElement)
    // The tiles are a RECORD now, not an input surface.
    expect(toggleTile).not.toHaveBeenCalled()
  })
})

/**
 * The feedback vocabulary (plans/tile-feedback.md), as connections wears it.
 *
 * All of it is shared code — these tests prove the WIRING: that each mark lands
 * on the right element, for the right person, at the right moment. The marks
 * themselves are pinned by class name, which is what the CSS-module hash makes
 * available; the appearance is common's business.
 *
 * The grid is reached through `[data-board] > div` rather than a role, the same
 * way psychicnum's tests do: it carries no ARIA role, and adding one to make
 * testing easier would be extending the app's ARIA surface (CLAUDE.md).
 */
describe('connections PlayArea — the board-scope marks', () => {
  /** The grid element the board-scope marks ride on: the board root's child. */
  const gridIn = (container: HTMLElement) =>
    container.querySelector('[data-board] > div') as HTMLElement

  it('leaves a live board unmarked', () => {
    h.result = loaded({ game: game('coop') })
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(gridIn(container).className).not.toMatch(/gameOver/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  it('bands the finished board in its outcome', () => {
    h.result = loaded({ game: game('coop'), mistakeCount: 4 })
    const { container } = render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    expect(gridIn(container).className).toMatch(/gameOverFrame/)
    expect(gridIn(container).className).toMatch(/gameOverLost/)
    expect(gridIn(container).className).not.toMatch(/gameOverWon/)
  })

  it('frames an out-of-the-race player’s board in the neutral gray', () => {
    // The game is still on for the survivors, so there is no verdict to color
    // the frame with — but this board is inert, which is all the frame claims.
    h.result = loaded({ game: game('compete'), isEliminated: true, mistakeCount: 4 })
    const { container } = render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    expect(gridIn(container).className).toMatch(/gameOverFrame/)
    expect(gridIn(container).className).not.toMatch(/gameOverWon|gameOverLost/)
  })

  it('dims the board while a teammate holds the move, and flashes when it arrives', () => {
    h.result = loaded({ game: game('coop') })
    const { container, rerender } = render(
      <PlayArea {...makeCtx({ currentTurnUserId: 'u2', isMyTurn: false, players: twoMembers })} />,
    )
    expect(gridIn(container).className).toMatch(/dimNotYourTurn/)
    // An EVENT, so never on mount: opening a game on your own turn is not the
    // turn arriving.
    expect(gridIn(container).className).not.toMatch(/yourTurnFlash/)

    rerender(
      <PlayArea {...makeCtx({ currentTurnUserId: 'u1', isMyTurn: true, players: twoMembers })} />,
    )

    expect(gridIn(container).className).toMatch(/yourTurnFlash/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  it('a waiting player’s tiles are inert, not just unresponsive', async () => {
    const user = userEvent.setup()
    const toggleTile = vi.fn()
    h.result = loaded({ game: game('coop'), toggleTile })
    render(
      <PlayArea {...makeCtx({ currentTurnUserId: 'u2', isMyTurn: false, players: twoMembers })} />,
    )

    const tile = document.querySelector('[data-tile="a"]') as HTMLButtonElement
    // Disabled, so it drops the pointer cursor and the hover lift with it — a
    // tile that still advertises itself while swallowing the click is a promise
    // the board can't keep.
    expect(tile).toBeDisabled()
    await user.click(tile)
    expect(toggleTile).not.toHaveBeenCalled()
  })
})

describe('connections PlayArea — selection, identity, and the guess in flight', () => {
  const tile = (name: string) => document.querySelector(`[data-tile="${name}"]`) as HTMLElement

  it('rings every pick on a shared board, in whoever’s color — mine included', () => {
    h.result = loaded({
      game: game('coop'),
      selections: new Map([['u1', ['a']], ['u2', ['b']]]),
      unionTiles: ['a', 'b'],
    })
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    // In coop the four tiles are ONE shared move, so both are "in the guess"…
    expect(tile('a').className).toMatch(/selected/)
    expect(tile('b').className).toMatch(/selected/)
    // …and the ring says who picked which. Everyone gets one, including me: a
    // board where only SOME picks carry a color reads as missing data rather
    // than as "the unmarked ones are yours".
    expect(tile('a').className).toMatch(/peerPick/)
    expect(tile('a').style.getPropertyValue('--peer-color')).toBe('var(--member-red-fill-color)')
    expect(tile('b').className).toMatch(/peerPick/)
    expect(tile('b').style.getPropertyValue('--peer-color')).toBe('var(--member-blue-fill-color)')
  })

  it('rings nothing when the board isn’t shared', () => {
    // Solo: every pick is mine, so a color would be decoration on top of the
    // selection border. Same in compete, where the selection never leaves this
    // client however many are racing.
    const cases: Array<['coop' | 'compete', typeof twoMembers]> = [
      ['coop', [gp('u1', 'me', 'red')]],
      ['compete', twoMembers],
    ]
    for (const [mode, players] of cases) {
      h.result = loaded({
        game: game(mode),
        selections: new Map([['u1', ['a']]]),
        unionTiles: ['a'],
      })
      const { unmount } = render(<PlayArea {...makeCtx({ players })} />)
      expect(tile('a').className).toMatch(/selected/)
      expect(tile('a').className).not.toMatch(/peerPick/)
      unmount()
    }
  })

  it('dims the guess while it is with the server, then fills the verdict', async () => {
    const user = userEvent.setup()
    // A guess the server hasn't answered yet: hold the RPC open.
    let answer: (value: typeof okEnvelope) => void = () => {}
    rpc.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    h.result = loaded({
      game: game('coop'),
      // 2 from RED + 1 GREEN + 1 BLUE — a plain wrong guess.
      selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
      unionTiles: ['a', 'b', 'e', 'i'],
    })
    render(<PlayArea {...makeCtx()} />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    // Sent, waiting — and NOT colored: guessing the answer locally would mean
    // taking it back when the server disagrees.
    for (const t of ['a', 'b', 'e', 'i']) expect(tile(t).className).toMatch(/dimInFlight/)
    expect(tile('c').className).not.toMatch(/dimInFlight/)

    answer(okEnvelope)

    // The answer arrives: the dim lifts and the verdict fills the same four
    // tiles in the outcome its pill wears — "Incorrect" is `lost` in both places.
    await waitFor(() => expect(tile('a').className).toMatch(/verdictFill/))
    expect(tile('a').className).toMatch(/verdictLost/)
    expect(tile('a').className).not.toMatch(/dimInFlight/)
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })

  it('fills a refused guess in the outcome its pill takes, without asking the server', async () => {
    const user = userEvent.setup()
    h.result = loaded({
      game: game('coop'),
      guesses: [
        {
          id: 'g1',
          user_id: 'u1',
          tiles: ['a', 'b', 'e', 'i'],
          outcome: 'lost', result: 'wrong', matched: false,
          matched_category_rank: null,
          guessed_at: '2026-06-15T00:01:00Z',
        },
      ],
      selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
      unionTiles: ['a', 'b', 'e', 'i'],
    })
    render(<PlayArea {...makeCtx()} />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(rpc).not.toHaveBeenCalledWith('submit_guess', expect.anything())
    expect(screen.getByText('You already tried that')).toBeInTheDocument()
    expect(tile('a').className).toMatch(/verdictFill/)
    expect(tile('a').className).toMatch(/verdictWarning/)
  })

  it('takes the fill off with the pill it belongs to', async () => {
    const user = userEvent.setup()
    h.result = loaded({
      game: game('coop'),
      guesses: [
        {
          id: 'g1',
          user_id: 'u1',
          tiles: ['a', 'b', 'e', 'i'],
          outcome: 'lost', result: 'wrong', matched: false,
          matched_category_rank: null,
          guessed_at: '2026-06-15T00:01:00Z',
        },
      ],
      selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
      unionTiles: ['a', 'b', 'e', 'i'],
    })
    render(<PlayArea {...makeCtx()} />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(tile('a').className).toMatch(/verdictFill/)

    // The next action dismisses both halves of the one message.
    await user.click(tile('c'))
    expect(tile('a').className).not.toMatch(/verdictFill/)
  })

  /**
   * The mark's OTHER two endings, both read off the guess log rather than off
   * anything this client did — because both can happen on somebody else's
   * machine. See plans/tile-feedback.md → "A board mark dies when the board
   * moves" and "Check what a RESTART does to a mark".
   */
  describe('the mark dies when the board moves under it', () => {
    const wrongGuess = (id: string, userId: string) => ({
      id,
      user_id: userId,
      tiles: ['a', 'b', 'e', 'i'],
      outcome: 'lost' as const, result: 'wrong' as const, matched: false,
      matched_category_rank: null,
      guessed_at: '2026-06-15T00:01:00Z',
    })
    /** Submit a wrong guess in a two-player coop game and confirm it landed. */
    async function guessWrongly(ctx: GamePageCtx) {
      const user = userEvent.setup()
      h.result = loaded({
        game: game('coop'),
        selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
        unionTiles: ['a', 'b', 'e', 'i'],
      })
      const view = render(<PlayArea {...ctx} />)
      await user.click(screen.getByRole('button', { name: 'Submit' }))
      expect(tile('a').className).toMatch(/verdictFill/)
      return view
    }

    it('survives my own guess arriving back over realtime', async () => {
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = await guessWrongly(ctx)

      // The row I just caused, landing a beat later. It is the tail of the very
      // action being answered — clearing on it would take the answer off before
      // it had been read.
      h.result = loaded({
        game: game('coop'),
        guesses: [wrongGuess('g1', 'u1')],
        selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
        unionTiles: ['a', 'b', 'e', 'i'],
      })
      rerender(<PlayArea {...ctx} />)

      expect(tile('a').className).toMatch(/verdictFill/)
    })

    // A RESTART is not in here any more: the page unmounts this whole surface
    // when the run changes, so there is no mark of this component's to clear.
    // `common/game-page/GamePage.test.tsx` covers that, once, for every game.
    it('hands the mark to a teammate’s wrong guess — their four, not mine', async () => {
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = await guessWrongly(ctx)

      // moth guesses wrongly on four DIFFERENT tiles. The board has moved on, so
      // my mark goes — and theirs takes its place, because "no" is news to the
      // whole table.
      h.result = loaded({
        game: game('coop'),
        guesses: [{ ...wrongGuess('g2', 'u2'), tiles: ['c', 'd', 'f', 'g'] }],
        selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
        unionTiles: ['a', 'b', 'e', 'i'],
      })
      rerender(<PlayArea {...ctx} />)

      expect(tile('a').className).not.toMatch(/verdictFill/)
      expect(tile('c').className).toMatch(/verdictFill/)
    })

    it('goes when a teammate’s guess is RIGHT — the band says it instead', async () => {
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = await guessWrongly(ctx)

      h.result = loaded({
        game: game('coop'),
        guesses: [{ ...wrongGuess('g2', 'u2'), outcome: 'won' as const, result: 'correct' as const, matched: true }],
        selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
        unionTiles: ['a', 'b', 'e', 'i'],
      })
      rerender(<PlayArea {...ctx} />)

      expect(tile('a').className).not.toMatch(/verdictFill/)
    })

  })

  it('draws no selection once the board is finished', () => {
    // The selection is ephemeral broadcast chatter that no server row
    // contradicts, so it outlives the game unless the board refuses to draw it.
    // A frozen board wearing selection borders reads as a move in progress.
    h.result = loaded({
      game: game('coop'),
      selections: new Map([['u1', ['a']], ['u2', ['b']]]),
      unionTiles: ['a', 'b'],
      mistakeCount: 4,
    })
    render(
      <PlayArea
        {...makeCtx({ isTerminal: true, playState: 'lost', players: twoMembers })}
      />,
    )

    expect(tile('a').className).not.toMatch(/selected/)
    expect(tile('b').className).not.toMatch(/peerPick/)
  })
})

describe('connections PlayArea — a failed load is not a missing game', () => {
  it('shows the server\'s own sentence, not "Game not found."', () => {
    // The two used to be one `null`, so an outage told the player their game
    // did not exist. The fault modal has already been dismissed by the time
    // this renders — this IS what they are left looking at.
    // The hook holds the ENVELOPE, exactly as `readRows` built it — no second
    // shape in between. `detail` is where the failed call's name rides.
    h.result = loaded({
      game: null,
      failure: {
        type: 'not-ok', data: null, outcome: null, severity: 'fault',
        message: 'The read failed.', field: null, meta: null, dbcode: '42501',
        detail: 'GET /rest/v1/games_state',
      },
    })
    render(<PlayArea {...makeCtx()} />)

    expect(screen.getByText('The read failed.')).toBeInTheDocument()
    expect(screen.queryByText('Game not found.')).not.toBeInTheDocument()
    // The diagnostics line rides with it, because a player quoting the sentence
    // back is not enough to find the call that failed.
    expect(screen.getByText(/GET \/rest\/v1\/games_state/)).toBeInTheDocument()
  })

  it('still says "Game not found." when the reads WORKED and there is no game', () => {
    h.result = loaded({ game: null, failure: null })
    render(<PlayArea {...makeCtx()} />)

    expect(screen.getByText('Game not found.')).toBeInTheDocument()
  })
})

describe('connections PlayArea — attention', () => {
  const correctGuess = (userId: string) => ({
    id: `g-${userId}`,
    user_id: userId,
    tiles: ['a', 'b', 'c', 'd'],
    outcome: 'won' as const, result: 'correct' as const, matched: true,
    matched_category_rank: 0,
    guessed_at: '2026-06-15T00:01:00Z',
  })
  const redBand: MatchedCategory = {
    rank: 0,
    name: 'RED',
    tiles: ['a', 'b', 'c', 'd'],
    matched_at: '2026-06-15T00:01:00Z',
  }
  /** The band element — the flash rides on it, and its name is inside it. Scoped
   *  to the board, since a category name also appears in the info column's hint
   *  list. */
  const bandFor = (name: string) => {
    const grid = document.querySelector('[data-board] > div') as HTMLElement
    return within(grid).getByText(name).parentElement as HTMLElement
  }

  it('flashes a band a teammate’s guess produced', () => {
    h.result = loaded({ game: game('coop') })
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)

    // moth's correct guess arrives: four tiles collapse into a band and
    // everything below reflows, in whatever corner they were working.
    h.result = loaded({
      game: game('coop'),
      guesses: [correctGuess('u2')],
      matchedCategories: [redBand],
    })
    rerender(<PlayArea {...ctx} />)

    expect(bandFor('RED').className).toMatch(/attentionFlash/)
  })


  it('flashes my own band too — the band lands where I was not looking', () => {
    h.result = loaded({ game: game('coop') })
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)

    h.result = loaded({
      game: game('coop'),
      guesses: [correctGuess('u1')],
      matchedCategories: [redBand],
    })
    rerender(<PlayArea {...ctx} />)

    // I chose the four tiles, but the band arrives at the TOP of the board while
    // I am reading the tiles — so the flash says "your four went here".
    expect(bandFor('RED').className).toMatch(/attentionFlash/)
  })

  it('says nothing when the answer is revealed', async () => {
    const user = userEvent.setup()
    h.result = loaded({
      game: game('coop'),
      guesses: [correctGuess('u2')],
      matchedCategories: [redBand],
      mistakeCount: 4,
    })
    const { container } = render(
      <PlayArea {...makeCtx({ isTerminal: true, playState: 'lost', players: twoMembers })} />,
    )

    await user.click(revealButton()!)

    // Three bands appear at once — which a diff would read as three moves. The
    // guess log is what says otherwise, and it didn't move.
    const grid = container.querySelector('[data-board] > div') as HTMLElement
    expect(within(grid).getByText('PURPLE')).toBeInTheDocument()
    expect(grid.innerHTML).not.toMatch(/attentionFlash/)
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is a bound action's, so
 * what these pin is the wiring: the chord reaches the binding, the binding
 * says when it applies (Enter and ⌫ go HIDDEN rather than inert where the
 * board is not this player's to touch, so they do not swallow a key another
 * binding wanted), it asks the registry's question mid-game and skips it at
 * terminal, and the answer runs the same call the button does.
 */
describe('connections PlayArea — the keys', () => {
  /** A coop game with a full four-tile guess built and unsent. */
  const fourPicked = (over: Partial<GameHook> = {}) =>
    loaded({
      game: game('coop'),
      selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
      unionTiles: ['a', 'b', 'e', 'i'],
      ...over,
    })

  it('Enter submits the four selected tiles', async () => {
    h.result = fourPicked()
    render(<WithKeys {...makeCtx()} />)
    expect(bound('act-submit').describe('button').state).toBe('active')

    press(ENTER)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_guess', expect.anything()))
  })

  it('Enter with fewer than four picked is here but gray — it fires nothing', async () => {
    h.result = loaded({
      game: game('coop'),
      selections: new Map([['u1', ['a', 'b']]]),
      unionTiles: ['a', 'b'],
    })
    render(<WithKeys {...makeCtx()} />)
    expect(bound('act-submit').describe('button').state).toBe('disabled')

    await act(async () => press(ENTER))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌫ clears the selection — and broadcasts it, so a teammate’s board drops it too', async () => {
    const sendClear = vi.fn()
    h.result = loaded({
      game: game('coop'),
      selections: new Map([['u1', ['a', 'b']]]),
      unionTiles: ['a', 'b'],
      sendClear,
    })
    render(<WithKeys {...makeCtx({ players: twoMembers })} />)
    expect(bound('act-clear-selection').describe('button').state).toBe('active')

    await act(async () => press(BACKSPACE))
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it("both leave on a teammate's turn — hidden, not merely inert", () => {
    h.result = fourPicked()
    render(<WithKeys {...makeCtx({ isMyTurn: false, currentTurnUserId: 'u2', players: twoMembers })} />)
    expect(bound('act-submit').describe('button').state).toBe('hidden')
    expect(bound('act-clear-selection').describe('button').state).toBe('hidden')
  })

  it('both leave once the board is finished', () => {
    h.result = fourPicked({ mistakeCount: 4 })
    render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
    expect(bound('act-submit').describe('button').state).toBe('hidden')
    expect(bound('act-clear-selection').describe('button').state).toBe('hidden')
  })

  it('+ at terminal starts the next game with no question', async () => {
    // Two calls, the look-ahead and the create; both answered ok.
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === 'next_puzzle_for_club'
          ? ok({ result: 'found', puzzle_id: 'p2' })
          : ok({ result: 'created', id: 'fresh-game-id' }),
      ),
    )
    h.result = loaded({ game: game('coop'), mistakeCount: 4 })
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
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
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('connections_coop', 'fresh-game-id'))
  })

  it('+ mid-game asks first, and Keep playing starts nothing', async () => {
    const user = userEvent.setup()
    h.result = loaded({ game: game('coop') })
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
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌥⌫ in coop asks to end the game, and yes calls end_game', async () => {
    const user = userEvent.setup()
    h.result = loaded({ game: game('coop') })
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
    h.result = loaded({ game: game('compete') })
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

  describe('⌥Z shuffles the tiles', () => {
    // The shuffle is Fisher–Yates over the CURRENT order on `Math.random`, so a
    // pinned value is a fixed permutation: 0 rotates the list, ~1 leaves it
    // alone. Pinning 0 for the press makes "the same tiles in a different
    // order" a deterministic claim rather than a flake.
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('rearranges the same sixteen tiles mid-game, with no round trip', async () => {
      h.result = loaded({ game: game('coop') })
      render(<WithKeys {...makeCtx()} />)
      const before = tileOrder()
      expect(before).toHaveLength(16)

      vi.spyOn(Math, 'random').mockReturnValue(0)
      await act(async () => press(OPT_Z))
      const after = tileOrder()
      expect(after).not.toEqual(before)
      expect([...after].sort()).toEqual([...before].sort())
      expect(rpc).not.toHaveBeenCalled()
    })

    it('leaves with the board — hidden once the game is over', async () => {
      // The finished board is a RECORD of where the players got to, so it
      // stays put; the key goes hidden rather than inert so it does not
      // swallow a keystroke another binding wanted.
      h.result = loaded({ game: game('coop'), mistakeCount: 4 })
      render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'lost' })} />)
      expect(bound('act-shuffle').describe('button').state).toBe('hidden')
      const before = tileOrder()

      vi.spyOn(Math, 'random').mockReturnValue(0)
      await act(async () => press(OPT_Z))
      expect(tileOrder()).toEqual(before)
    })
  })

  describe('Restart', () => {
    // Keyless, so mid-game it is fired as the menu row would fire it: the bound
    // run, which is where the registry's question is asked.
    it('mid-game asks first, and Keep playing wipes nothing', async () => {
      const user = userEvent.setup()
      h.result = loaded({ game: game('coop') })
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
      expect(rpc).not.toHaveBeenCalled()
    })

    it('mid-game, yes calls replay_board', async () => {
      const user = userEvent.setup()
      h.result = loaded({ game: game('coop') })
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
      h.result = loaded({ game: game('coop'), mistakeCount: 4 })
      render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    })
  })
})
