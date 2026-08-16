/**
 * Component tests for letterboxed's PlayArea — the GAME MENU it publishes.
 *
 * Why this file exists: letterboxed's info column is icon-only (docs/ui.md →
 * Button iconography), and three of its glyphs — the hint lightbulb, the
 * spoiler's bare eye, the terminal boxed eye — are named NOWHERE ELSE on a
 * touch device, because the menu is the legend. That makes the menu's contents
 * a real contract, not chrome: a row silently dropped takes a glyph's only
 * explanation with it. These pin it, plus the one mode rule that goes the other
 * way (compete has no help ladder at all, so naming it there would teach a lie).
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else renders for real.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { EventRow, LetterboxedGame, PlayerRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'
import { clearFaultsForTest, peekFaultsForTest } from '../../common/lib/fault/faultStore'

type GameHook = {
  game: LetterboxedGame | null
  playerRows: PlayerRow[]
  myRow: PlayerRow | null
  events: EventRow[]
  loading: boolean
  rowsLoaded: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('../../common/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** Twelve letters, three to a side (lib/board.ts's side order). */
const SIDES = 'abcdefghijkl'

const myRow: PlayerRow = {
  game_id: 'g1',
  user_id: 'u1',
  chain: [],
  word_count: 0,
  letters_covered: 0,
  hints_used: 0,
  solved: false,
  solved_at: null,
}

/**
 * A loaded board header. The two word lists are the two TIERS
 * (docs/common.md → the word list's filter rule): `playableWords` is what a
 * player may TYPE (band only), `cleanWords` is what the hint may SUGGEST.
 * They're equal unless a test says otherwise, so only the tests about the
 * asymmetry have to think about it.
 */
function loadedGame(over: Partial<LetterboxedGame> = {}): LetterboxedGame {
  const playableWords = over.playableWords ?? ['bad', 'dig']
  return {
    id: 'g1',
    club_handle: 'testclub',
    mode: 'coop',
    sides: SIDES,
    playableWords,
    cleanWords: playableWords,
    solution: ['bad', 'dig'],
    max_words: 5,
    ...over,
  } as LetterboxedGame
}

function loaded(game: LetterboxedGame): GameHook {
  return { game, playerRows: [myRow], myRow, events: [], loading: false, rowsLoaded: true }
}

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
    setup: { extra_words: 3, difficulty: 3, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    brand: 'SnakeBox',
    title: 'New game',
    ...over,
  } as unknown as GamePageCtx
}

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

beforeEach(() => {
  clearFaultsForTest()
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('letterboxed PlayArea — the game menu is the icon legend', () => {
  it('coop names both rungs of the help ladder, each with its glyph', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('hint')?.label).toBe('Hint')
    expect(items.get('hint')?.icon).toBeTruthy()
    expect(items.get('spoiler')?.label).toBe('Show the word')
    expect(items.get('spoiler')?.icon).toBeTruthy()
  })

  it('compete omits the ladder entirely — the buttons never render there either', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.has('hint')).toBe(false)
    expect(items.has('spoiler')).toBe(false)
  })

  it('names the terminal Reveal solution — greyed while the game is live', () => {
    const live = makeCtx()
    render(<PlayArea {...live} />)
    const reveal = menuItems(live).get('reveal')
    expect(reveal?.label).toBe('Reveal solution')
    expect(reveal?.icon).toBeTruthy()
    // Present-but-disabled, not absent: a greyed row still teaches its glyph.
    // Terminal-only, so a player who dropped out can't spoil a live race.
    expect(reveal?.disabled).toBe(true)

    const done = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('reveal')?.disabled).toBe(false)
  })

  it('the Reveal row is a local toggle — no RPC, and its label flips', async () => {
    const commonDb = (await import('../../common/db')).db as unknown as { rpc: ReturnType<typeof vi.fn> }
    commonDb.rpc.mockClear()
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...ctx} />)

    act(() => menuItems(ctx).get('reveal')!.onClick())
    // The seeded pair is on screen for ME. No RPC: no peer's board opened.
    expect(screen.getByText('Solvable in two')).toBeInTheDocument()
    expect(commonDb.rpc).not.toHaveBeenCalled()
    await waitFor(() => expect(menuItems(ctx).get('reveal')?.label).toBe('Hide solution'))

    // ...and the same row puts it away again.
    act(() => menuItems(ctx).get('reveal')!.onClick())
    expect(screen.queryByText('Solvable in two')).not.toBeInTheDocument()
  })

  it('never reveals on its own — a WIN leaves the pair closed', () => {
    // The reason letterboxed had a whole _end_game wrapper: a win here is
    // covering the twelve letters with SOME chain, not producing the seeded
    // pair, so winning must not hand it over.
    const ctx = makeCtx({ isTerminal: true, playState: 'won' })
    render(<PlayArea {...ctx} />)
    expect(screen.queryByText('Solvable in two')).not.toBeInTheDocument()
    expect(menuItems(ctx).get('reveal')?.label).toBe('Reveal solution')
  })
})

/**
 * The three REFUSALS the hint search can answer with (lib/solve.ts's
 * NoSuggestion). Each names a different wall, and the pill is the only place
 * that distinction reaches the player — so these pin both the branch and the
 * copy. Short copy is load-bearing here, not taste: the pill is `nowrap` +
 * ellipsis in a reserved-height slot, so a long sentence truncates mid-word.
 *
 * Fired through the game menu's Hint row rather than the button, which also
 * proves the row is wired to the same handler.
 */
describe('letterboxed PlayArea — why there is no hint', () => {
  /** Take the hint via the menu row and read back the pill it wrote. `act` so
   *  the feedback state lands before the assertion — the row's onClick is a
   *  plain handler call, not a React-dispatched event. */
  function askHint(ctx: GamePageCtx) {
    act(() => menuItems(ctx).get('hint')?.onClick())
  }

  it('stuck: names the letter nothing follows', () => {
    // Tail is D; the board has no D-word at all, so there is no legal move.
    h.result = loaded(loadedGame({ playableWords: ['bad', 'cab'], max_words: 5 }))
    h.result.myRow = { ...myRow, chain: ['bad'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    askHint(ctx)
    expect(screen.getByText('No word starts with D')).toBeInTheDocument()
  })

  it('stuck on a letter I already spent: says "no OTHER word"', () => {
    // DAB → BAD leaves the tail back on D, and DAB was the board's only D-word.
    // The player can see a D-word in their own chain, so the bare "No word
    // starts with D" would read as a bug rather than as a rule.
    h.result = loaded(loadedGame({ playableWords: ['dab', 'bad'], max_words: 5 }))
    h.result.myRow = { ...myRow, chain: ['dab', 'bad'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    askHint(ctx)
    expect(screen.getByText('No other word starts with D')).toBeInTheDocument()
  })

  it('off par: a finish exists, but it is longer than the room left', () => {
    // ABC played, cap 2 ⇒ one word left; the shortest finish is two
    // (CDEFGH then HIJKL), so pointing at CDEFGH would walk into the cap.
    h.result = loaded(loadedGame({ playableWords: ['abc', 'cdefgh', 'hijkl'], max_words: 2 }))
    h.result.myRow = { ...myRow, chain: ['abc'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    askHint(ctx)
    expect(screen.getByText('Best solution needs 2 words')).toBeInTheDocument()
  })

  it('unreachable: words follow, but no route ever covers the board', () => {
    // CBA follows ABC and then dead-ends back at a played word — the frontier
    // empties with every letter past C still uncovered. The cap is irrelevant.
    h.result = loaded(loadedGame({ playableWords: ['abc', 'cba'], max_words: 9 }))
    h.result.myRow = { ...myRow, chain: ['abc'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    askHint(ctx)
    expect(screen.getByText('No winning path from here')).toBeInTheDocument()
  })
})

/**
 * The two TIERS, which BITCH found the hard way: it's a band-1 word
 * (`slur = 1`), so the old single-list board refused it from a player's own
 * keyboard. Now the accept list is band-gated only and the hint search reads a
 * clean subset — "we don't put a slur in front of you, and we don't stop you
 * typing one" (docs/common.md → the word list's filter rule).
 */
describe('letterboxed PlayArea — the accept list is wider than the hint list', () => {
  function askHint(ctx: GamePageCtx) {
    act(() => menuItems(ctx).get('hint')?.onClick())
  }

  it('a word only the ACCEPT list has is never handed over by the SPOILER', () => {
    // Asserted through the spoiler, not the hint: a hint prints a prefix, so it
    // would hide a leak behind "6 letters starting with CDE". The spoiler prints
    // the word — the surface where handing over a slur would actually show.
    // CDEFGHIJKL is a ONE-WORD FINISH from here — the search's ideal answer,
    // and the only one. It's in the accept list and not the clean list, so the
    // spoiler must refuse rather than hand it over.
    h.result = loaded(loadedGame({
      playableWords: ['abc', 'cdefghijkl'],
      cleanWords: ['abc'],
      max_words: 5,
    }))
    h.result.myRow = { ...myRow, chain: ['abc'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    act(() => menuItems(ctx).get('spoiler')?.onClick())
    expect(screen.queryByText('CDEFGHIJKL'), 'the spoiler handed over an unclean word').toBeNull()
    // ...and says so, rather than silently doing nothing.
    expect(screen.getByText('No winning path from here')).toBeInTheDocument()
  })

  it('"no word starts with C" is judged on the ACCEPT list, so it cannot lie', () => {
    // The clean search sees nothing after C and would say "stuck" — but CDEFGH
    // is right there, playable. Claiming no C-word exists would be false about
    // the RULES, so the honest answer is that there's no route to offer.
    h.result = loaded(loadedGame({
      playableWords: ['abc', 'cdefgh'],
      cleanWords: ['abc'],
      max_words: 5,
    }))
    h.result.myRow = { ...myRow, chain: ['abc'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    askHint(ctx)
    expect(screen.queryByText('No word starts with C')).toBeNull()
    expect(screen.getByText('No winning path from here')).toBeInTheDocument()
  })
})

/**
 * The server-key path, end to end: a rejection leaves SQL as a machine key and
 * arrives on screen as words written in TypeScript.
 *
 * Driven through UNDO: one RPC, reachable mid-game from the chain strip's ×.
 * The submit path runs the same `callRpc`, but reaching it means getting a word
 * past `rejectReason` first — a different test's job.
 */
describe('letterboxed PlayArea — server keys become player copy', () => {
  /** Take back the last word and have the server refuse it. Undo is used
   *  rather than Reveal because it's reachable MID-GAME: at terminal the
   *  verdict pill owns the slot by priority (localPills.ts) and would hide
   *  whatever we're asserting. */
  async function undoWith(error: { message: string; code: string }) {
    rpc.mockResolvedValue({ error })
    h.result = loaded(loadedGame())
    h.result.myRow = { ...myRow, chain: ['bad'] }
    h.result.playerRows = [h.result.myRow]
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.click(screen.getByRole('button', { name: 'Take back BAD' }))
  }

  it('a key WITH copy shows the TypeScript words, never the key', async () => {
    await undoWith({ message: 'already-ended|', code: 'P0001' })
    expect(screen.getByText('Game over')).toBeInTheDocument()
    expect(screen.queryByText(/already-ended/)).toBeNull()
  })

  it('...and as a normal pill, because it was anticipated', async () => {
    await undoWith({ message: 'already-ended|', code: 'P0001' })
    expect(screen.getByText('Game over').closest('[class*="fault"]')).toBeNull()
  })

  it('a key with NO copy routes to the fault MODAL, raw — nobody wrote words for it', async () => {
    // `game-not-found` is unreachable in normal play, so it has no entry. The
    // action name comes from the FE, which is the only side that knows it.
    // Faults never enter the slot any more — the sink sends them to the fault
    // modal's queue (docs/ui.md → Faults).
    await undoWith({ message: 'game-not-found|', code: 'P0002' })
    expect(screen.queryByText('undo|game-not-found|')).toBeNull()
    expect(peekFaultsForTest().map((f) => f.text)).toContain('undo|game-not-found|')
  })

  it('a transport failure never shows the browser wording', async () => {
    // A rejected fetch arrives with no SQLSTATE; postgrest-js puts the
    // browser's opaque phrasing in `message`, which is worthless to a player.
    await undoWith({ message: 'TypeError: Load failed', code: '' })
    expect(screen.queryByText(/TypeError/)).toBeNull()
    expect(peekFaultsForTest().map((f) => f.text)).toContain('undo: Server; try refresh')
  })
})

/**
 * The empty-clean-list fallback, added after a real e2e failure.
 *
 * `clean_words` is DERIVED — games_state joins the board's words against
 * common.words — so it empties wholesale whenever those words aren't in the
 * dictionary: a synthetic test board, or a database whose word import never
 * ran. The hint then had nothing to search and told the player "No words to
 * play" about a board full of words.
 */
describe('letterboxed PlayArea — the hint corpus when clean_words is empty', () => {
  it('falls back to the accept list rather than claiming the board is empty', () => {
    h.result = loaded(loadedGame({
      playableWords: ['bad', 'dig', 'gab'],
      cleanWords: [],            // the broken derivation
      max_words: 5,
    }))
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    act(() => menuItems(ctx).get('hint')?.onClick())
    // Something is offered — the exact word doesn't matter, only that the
    // search ran against a non-empty corpus.
    expect(screen.queryByText('No words to play')).toBeNull()
  })

  it('still prefers the clean list when it has anything in it', () => {
    // The purity guarantee is untouched in every normal case: only a WHOLLY
    // empty clean list triggers the fallback, never a merely smaller one.
    h.result = loaded(loadedGame({
      playableWords: ['bad', 'dig', 'gab'],
      cleanWords: ['bad'],
      max_words: 5,
    }))
    h.result.myRow = { ...myRow, chain: ['bad'] }
    h.result.playerRows = [h.result.myRow]
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    act(() => menuItems(ctx).get('hint')?.onClick())
    // Tail is D. 'dig' is in the accept list and NOT in the clean list, so a
    // fallback would have SUGGESTED it. Instead we get the unreachable line —
    // which proves both mechanisms at once: the search ran on the clean list
    // (no suggestion), and the stuck test still consulted the ACCEPT list, so
    // it refused to claim "No word starts with D" while `dig` sits there
    // playable.
    expect(screen.getByText('No winning path from here')).toBeInTheDocument()
  })
})
