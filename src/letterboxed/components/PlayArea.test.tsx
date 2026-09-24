// cs-unmet

/**
 * Component tests for letterboxed's PlayArea — the GAME MENU it publishes.
 *
 * Why this file exists: letterboxed's info column is icon-only (docs/ui.md →
 * Button iconography), and three of its glyphs — the hint lightbulb, the
 * spoiler's bare eye, the terminal boxed eye — are named NOWHERE ELSE on a
 * touch device, because the menu is the legend. That makes the menu's contents
 * a real contract, not chrome: a row silently dropped takes a glyph's only
 * explanation with it. These pin it, plus the one mode rule that goes the other
 * way (compete has no hint ladder at all, so naming it there would teach a lie).
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else renders for real.
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
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import type { LetterboxedGame, PlayerRow } from '../hooks/useGame'
import { db } from '../db'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { PlayArea } from './PlayArea'
import { clearFaultsForTest, peekFaultsForTest } from '@/common/faults/faultStore'

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))
// PlayArea's "New game" calls the letterboxed-build-board edge function
// directly; mocked so no edge runtime is needed. Only `runEdgeFn` is stubbed —
// `runRpc` stays REAL so the undo tests below exercise the envelope it
// actually receives; the `db.rpc` mock above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

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
 * (docs/word-list.md → Which words a game may use): `playableWords` is what a
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
  return {
    game, playerRows: [myRow], myRow, events: [], loading: false, rowsLoaded: true,
    failure: null,
  }
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
    globalFeedbackSlot: createFeedbackSlot('global'),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: {
      setGameSections: vi.fn(),
      actHelp: boundActionFixture('act-help'),
      actChat: boundActionFixture('act-open-chat'),
      actBackToClub: boundActionFixture('act-back-to-club'),
    },
    brand: 'SnakeBox',
    title: 'New game',
    ...over,
  } as unknown as GamePageCtx
}

/** Flatten what PlayArea handed `menu.setGameSections` into id → ROW — what the
 *  menu would actually draw, since a row is a bound action now and its words,
 *  glyph and availability come from the action rather than the list. */
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

/** A keystroke as the app-root listener sees it: from the body, with nothing
 *  focused. An Option chord matches on `code`, since ⌥ changes the character. */
const press = (key: KeyboardEventInit) => fireEvent.keyDown(document.body, key)
const PLUS = { key: '+' }
const OPT_BACKSPACE = { key: 'Backspace', code: 'Backspace', altKey: true }

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

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

beforeEach(() => {
  clearFaultsForTest()
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
  startEdgeFn.mockReset()
})

describe('letterboxed PlayArea — the game menu is the icon legend', () => {
  it('coop names both rungs of the hint ladder, each with its glyph', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.label).toBe('Hint')
    expect(items.get('act-hint')?.icon).toBeTruthy()
    expect(items.get('act-spoiler')?.label).toBe('Show the word')
    expect(items.get('act-spoiler')?.icon).toBeTruthy()
  })

  it('compete omits the ladder entirely — the buttons never render there either', () => {
    // The rows are still HANDED to the menu; each says it is hidden, and the
    // menu drops a hidden row when it draws. That is the same answer the info
    // column's buttons read, which is what keeps the two from disagreeing.
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.hidden).toBe(true)
    expect(items.get('act-spoiler')?.hidden).toBe(true)
  })

  it('names the terminal Reveal solution — grayed while the game is live', () => {
    const live = makeCtx()
    render(<PlayArea {...live} />)
    const reveal = menuItems(live).get('act-reveal')
    expect(reveal?.label).toBe('Reveal solution')
    expect(reveal?.icon).toBeTruthy()
    // Present-but-disabled, not absent: a grayed row still teaches its glyph.
    // Terminal-only, so a player who dropped out can't spoil a live race.
    expect(reveal?.disabled).toBe(true)

    const done = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('act-reveal')?.disabled).toBe(false)
  })

  it('the Reveal row is a local toggle — no RPC, and its label flips', async () => {
    const commonDb = (await import('@/common/supabase/db')).db as unknown as { rpc: ReturnType<typeof vi.fn> }
    commonDb.rpc.mockClear()
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...ctx} />)

    act(() => menuItems(ctx).get('act-reveal')!.run())
    // The seeded pair is on screen for ME. No RPC: no peer's board opened.
    expect(screen.getByText('Solvable in two')).toBeInTheDocument()
    expect(commonDb.rpc).not.toHaveBeenCalled()
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide solution'))

    // ...and the same row puts it away again.
    act(() => menuItems(ctx).get('act-reveal')!.run())
    expect(screen.queryByText('Solvable in two')).not.toBeInTheDocument()
  })

  it('never reveals on its own — a WIN leaves the pair closed', () => {
    // The reason letterboxed had a whole _end_game wrapper: a win here is
    // covering the twelve letters with SOME chain, not producing the seeded
    // pair, so winning must not hand it over.
    const ctx = makeCtx({ isTerminal: true, playState: 'won' })
    render(<PlayArea {...ctx} />)
    expect(screen.queryByText('Solvable in two')).not.toBeInTheDocument()
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')
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
    act(() => menuItems(ctx).get('act-hint')?.run())
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
 * typing one" (docs/word-list.md → Which words a game may use).
 */
describe('letterboxed PlayArea — the accept list is wider than the hint list', () => {
  function askHint(ctx: GamePageCtx) {
    act(() => menuItems(ctx).get('act-hint')?.run())
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
    act(() => menuItems(ctx).get('act-spoiler')?.run())
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
 * The refusal path, end to end: a raise leaves SQL as an envelope and arrives on
 * screen wearing the words its author wrote at the raise.
 *
 * Driven through UNDO: one RPC, reachable mid-game from the chain strip's ×.
 * The submit path runs the same wrapper, but reaching it means getting a word
 * past `rejectReason` first — a different test's job.
 */
describe('letterboxed PlayArea — a refused undo, and who wrote the words', () => {
  /** Take back the last word and have the server refuse it. Undo is used
   *  rather than Reveal because it's reachable MID-GAME, where nothing else
   *  is in the slot beside what we're asserting. */
  async function undoAnswering(reply: unknown) {
    rpc.mockResolvedValue(reply)
    h.result = loaded(loadedGame())
    h.result.myRow = { ...myRow, chain: ['bad'] }
    h.result.playerRows = [h.result.myRow]
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.click(screen.getByRole('button', { name: 'Take back BAD' }))
  }

  /** A refusal as it actually arrives: an HTTP 200 carrying an envelope. */
  function refusal(over: Record<string, unknown>) {
    return {
      data: {
        type: 'not-ok', data: null, outcome: null, severity: 'race',
        message: 'Game over', field: null, meta: null,
        dbcode: 'PN405', detail: null, ...over,
      },
      error: null,
      status: 200,
    }
  }

  it('shows the sentence the SERVER wrote', async () => {
    // The whole inversion this system made: the words come from the raise, at
    // the site that knows the condition, and the frontend renders them without
    // a lookup table in between.
    await undoAnswering(refusal({}))
    expect(screen.getByText('Game over')).toBeInTheDocument()
  })

  it('a race reads as a normal pill, not as something broken', async () => {
    await undoAnswering(refusal({}))
    expect(screen.getByText('Game over').closest('[class*="fault"]')).toBeNull()
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  it('a fault raises the modal AND leaves its sentence behind', async () => {
    // The escalation rule (docs/envelopes.md): the modal is dismissable, so the
    // surface still has to say what happened once it is gone.
    await undoAnswering(refusal({
      severity: 'fault', dbcode: 'PN253', message: 'You are not in this game',
    }))
    await waitFor(() =>
      expect(peekFaultsForTest().map((f) => f.text)).toContain('You are not in this game'))
    expect(screen.getByText('You are not in this game')).toBeInTheDocument()
  })

  it('a transport failure never shows the browser wording', async () => {
    // A rejected fetch arrives with no SQLSTATE; postgrest-js puts the
    // browser's opaque phrasing in `message`, which is worthless to a player.
    // `status: 0` is how it says nothing answered at all.
    await undoAnswering({
      data: null, error: { message: 'TypeError: Load failed', code: '' }, status: 0,
    })
    expect(screen.queryByText(/TypeError/)).toBeNull()
    await waitFor(() =>
      expect(peekFaultsForTest().map((f) => f.text).join(' ')).toMatch(/refresh and try again/))
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
    act(() => menuItems(ctx).get('act-hint')?.run())
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
    act(() => menuItems(ctx).get('act-hint')?.run())
    // Tail is D. 'dig' is in the accept list and NOT in the clean list, so a
    // fallback would have SUGGESTED it. Instead we get the unreachable line —
    // which proves both mechanisms at once: the search ran on the clean list
    // (no suggestion), and the stuck test still consulted the ACCEPT list, so
    // it refused to claim "No word starts with D" while `dig` sits there
    // playable.
    expect(screen.getByText('No winning path from here')).toBeInTheDocument()
  })
})

/**
 * The board's answer to a word it refuses: the letters that word used shake.
 * It has NO clock — nothing arrives to take it down, and the thing that ends
 * it is the player's next edit, which is the lifetime `NO_TIMER` names. Two
 * things make it awkward and both are pinned here: refusing the same word
 * twice has to shake twice, and the mark is about the word AS SUBMITTED, so
 * typing on is what ends it.
 */
describe('letterboxed PlayArea — a refused word shakes its letters', () => {
  /** The board letters currently shaking. */
  const shaking = () =>
    [...document.querySelectorAll('div[class*="verdictShake"]')].map((n) => n.textContent)
  /** One board letter's element, so a REMOUNT can be told from a re-render. */
  const nodeFor = (letter: string) =>
    [...document.querySelectorAll('div[class*="node"]')].find((n) => n.textContent === letter)

  /** One keystroke, AWAITED — an action's run is single-flight, so two keys
   *  fired in one tick would land one. The file's bare `press` is for the
   *  single presses elsewhere. */
  const key = (init: KeyboardEventInit) =>
    act(async () => {
      fireEvent.keyDown(document.body, init)
    })

  /** Type ADG — three letters on three different sides, so the board's own
   *  rules pass and only the word list refuses it. */
  const typeADG = async () => {
    await key({ key: 'a' })
    await key({ key: 'd' })
    await key({ key: 'g' })
  }

  it('shakes the letters it used, and shakes AGAIN when the same word is refused twice', async () => {
    render(<WithKeys {...makeCtx()} />)
    await typeADG()
    await key({ key: 'Enter', code: 'Enter' })

    // Refused by the word list alone — nothing left this client.
    expect(screen.getByText('Not a word')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith('submit_word', expect.anything())
    expect(shaking().sort()).toEqual(['A', 'D', 'G'])

    // The same word again. A CSS animation runs once per mount, so the proof
    // that it shakes a second time is that the letter is a NEW element.
    const before = nodeFor('A')
    await key({ key: 'Enter', code: 'Enter' })
    expect(shaking().sort()).toEqual(['A', 'D', 'G'])
    expect(nodeFor('A')).not.toBe(before)
  })

  it('does not come back when the draft passes through the refused word again', async () => {
    // The lesson recorded in the mark's own docstring, and the reason the mark
    // is ENDED by the edit rather than merely hidden by a text comparison: a
    // refused ADG shook again on the way back from ADGJ, because typing past a
    // refused word and back makes the text match a second time. The mark is
    // about the word AS SUBMITTED, so the first edit is what kills it.
    render(<WithKeys {...makeCtx()} />)
    await typeADG()
    await key({ key: 'Enter', code: 'Enter' })
    expect(shaking().sort()).toEqual(['A', 'D', 'G'])

    // Type on: a different word, so nothing is being refused now.
    await key({ key: 'j' })
    expect(shaking()).toEqual([])

    // …and back to exactly the refused text. The board must stay still: that
    // answer was about a submission, and this is a draft being edited.
    await key({ key: 'Backspace', code: 'Backspace' })
    expect(shaking()).toEqual([])
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is a bound action's, so
 * what these pin is the wiring: the chord reaches the binding, the binding asks
 * the registry's question mid-game and skips it at terminal, and the answer
 * runs the same call the button does.
 */
describe('letterboxed PlayArea — the keys', () => {
  // `hidden`, not `disabled`: Help's key list draws a disabled key exactly like
  // a live one, so a listed ↑ here would read as a recall this game doesn't
  // have. Both arrows go, since ↓ could only clear back to the locked seed.
  it('neither history arrow is offered — a word joins the chain, not a history', () => {
    render(<WithKeys {...makeCtx()} />)

    expect(bound('act-recall-last').describe('help').state).toBe('hidden')
    expect(bound('act-clear-entry').describe('help').state).toBe('hidden')
  })

  it('+ at terminal starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<WithKeys {...ctx} />)

    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the call firing proves none was asked.
    press(PLUS)
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'letterboxed-build-board',
        expect.objectContaining({ target_club: 'testclub', player_user_ids: ['u1'], mode: 'coop' }),
      ),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('letterboxed_coop', 'fresh-game-id'))
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
    expect(await screen.findByText('Concede, or end the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('end_game', expect.anything())
  })

  describe('Restart', () => {
    // Keyless, so mid-game it is fired as the menu row would fire it: the bound
    // run, which is where the registry's question is asked.
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
      render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    })
  })
})
