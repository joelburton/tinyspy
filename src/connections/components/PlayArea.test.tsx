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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type {
  ConnectionsGame,
  GuessRow,
  MatchedCategory,
} from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// The shape connections' useGame returns — the mock hands one of these back.
type GameHook = {
  game: ConnectionsGame | null
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  mistakeCount: number
  opponentFound: ReadonlyMap<string, number>
  isEliminated: boolean
  selections: ReadonlyMap<string, string[]>
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

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
    setup: { puzzleId: 'p1', timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

beforeEach(() => {
  h.result = loaded()
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('connections PlayArea — concede', () => {
  it('compete shows Concede and calls connections.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded({ game: game('compete') })
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    const user = userEvent.setup()
    h.result = loaded({ game: game('coop') })
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

    await user.click(screen.getByRole('button', { name: 'Reveal categories' }))
    expect(screen.getByText('GREEN')).toBeInTheDocument()
    expect(screen.getByText('PURPLE')).toBeInTheDocument()
    expect(tileNames()).toHaveLength(0)
    // Local state — no peer's board changed.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Hide categories' }))
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
    expect(screen.queryByRole('button', { name: 'Reveal categories' })).not.toBeInTheDocument()
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
 * The feedback vocabulary (docs/tile-feedback.md), as connections wears it.
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
    expect(tile('a').style.getPropertyValue('--peer-color')).toBe('var(--member-red-dot-color)')
    expect(tile('b').className).toMatch(/peerPick/)
    expect(tile('b').style.getPropertyValue('--peer-color')).toBe('var(--member-blue-dot-color)')
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
    let answer: (value: { error: null }) => void = () => {}
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

    answer({ error: null })

    // The answer arrives: the dim lifts and the verdict fills the same four
    // tiles in the tone its pill wears — "Incorrect" is an error in both places.
    await waitFor(() => expect(tile('a').className).toMatch(/verdictFill/))
    expect(tile('a').className).toMatch(/verdictError/)
    expect(tile('a').className).not.toMatch(/dimInFlight/)
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })

  it('fills a refused guess in the tone its pill takes, without asking the server', async () => {
    const user = userEvent.setup()
    h.result = loaded({
      game: game('coop'),
      guesses: [
        {
          id: 'g1',
          user_id: 'u1',
          tiles: ['a', 'b', 'e', 'i'],
          result: 'wrong',
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
          result: 'wrong',
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
   * machine. See docs/tile-feedback.md → "A board mark dies when the board
   * moves" and "Check what a RESTART does to a mark".
   */
  describe('the mark dies when the board moves under it', () => {
    const wrongGuess = (id: string, userId: string) => ({
      id,
      user_id: userId,
      tiles: ['a', 'b', 'e', 'i'],
      result: 'wrong' as const,
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

    it('goes when a teammate guesses', async () => {
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = await guessWrongly(ctx)

      // moth guesses. The board has moved on — their correct guess could even
      // take these four tiles away — so a mark still sitting here would be
      // describing a position that no longer exists.
      h.result = loaded({
        game: game('coop'),
        guesses: [wrongGuess('g2', 'u2')],
        selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
        unionTiles: ['a', 'b', 'e', 'i'],
      })
      rerender(<PlayArea {...ctx} />)

      expect(tile('a').className).not.toMatch(/verdictFill/)
    })

    it('goes on a restart, including a teammate’s', async () => {
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = await guessWrongly(ctx)

      // My guess is recorded first (the realtime round trip) — the mark holds.
      h.result = loaded({
        game: game('coop'),
        guesses: [wrongGuess('g1', 'u1')],
        selections: new Map([['u1', ['a', 'b', 'e', 'i']]]),
        unionTiles: ['a', 'b', 'e', 'i'],
      })
      rerender(<PlayArea {...ctx} />)
      expect(tile('a').className).toMatch(/verdictFill/)

      // Then somebody restarts. `replay_board` deletes every guess, so the log
      // SHRINKS — which is the signal, rather than the local restart handler: a
      // teammate's restart has to clear my board too, and only the log reaches me.
      h.result = loaded({
        game: game('coop'),
        guesses: [],
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

describe('connections PlayArea — attention', () => {
  const correctGuess = (userId: string) => ({
    id: `g-${userId}`,
    user_id: userId,
    tiles: ['a', 'b', 'c', 'd'],
    result: 'correct' as const,
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

  it('stays quiet for my own', () => {
    h.result = loaded({ game: game('coop') })
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayArea {...ctx} />)

    h.result = loaded({
      game: game('coop'),
      guesses: [correctGuess('u1')],
      matchedCategories: [redBand],
    })
    rerender(<PlayArea {...ctx} />)

    // I chose those four tiles and the commit slot already answered me.
    expect(bandFor('RED').className).not.toMatch(/attentionFlash/)
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

    await user.click(screen.getByRole('button', { name: 'Reveal categories' }))

    // Three bands appear at once — which a diff would read as three moves. The
    // guess log is what says otherwise, and it didn't move.
    const grid = container.querySelector('[data-board] > div') as HTMLElement
    expect(within(grid).getByText('PURPLE')).toBeInTheDocument()
    expect(grid.innerHTML).not.toMatch(/attentionFlash/)
  })
})
