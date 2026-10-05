// cs-unmet

/**
 * Component tests for letterboxed's PlayArea — the GAME MENU it publishes, the
 * hint ladder's answers, a refused move, and the keys.
 *
 * Why the menu matters: letterboxed's info column is icon-only (docs/ui.md →
 * Button iconography), and three of its glyphs — the hint lightbulb, the
 * spoiler's bare eye, the boxed eye at the end — are named NOWHERE ELSE on a
 * touch device, because the menu is the legend. That makes the menu's contents
 * a real contract, not chrome: a row silently dropped takes a glyph's only
 * explanation with it. These pin it, plus the one mode rule that goes the other
 * way (compete has no hint ladder at all, so naming it there would teach a lie).
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeLetterboxedCtx`)
 * and nothing is mocked but `db` and the edge function; everything else renders
 * for real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { db } from '../db'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { ZTest_clearFaultMessages, ZTest_peekFaultMessages } from '@/common/faults/faultStore'
import {
  ZTest_CONCEDED,
  ZTest_makeLetterboxedCtx,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))
// "New game" calls the letterboxed-build-board edge function directly; mocked
// so no edge runtime is needed. Only `runEdgeFn` is stubbed — `runRpc` stays
// REAL so the undo tests below exercise the envelope it actually receives; the
// `db.rpc` mock above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }

/**
 * A play surface's context: a solo coop game in play, built from the facts
 * the way the builder would build it. The board accepts two words, both clean,
 * unless a test says otherwise — the two TIERS (docs/word-list.md → Which words
 * a game may use) differ only in the tests about the asymmetry.
 */
function makeCtx(facts: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeLetterboxedCtx({ words: ['bad', 'dig'], uncleanWords: [], ...facts })
}

/** The solo coop game's two endings, with its one player as the server wrote
 *  them. */
const SOLO_LOST: ZTest_GameDataFacts = {
  ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
  outcome: 'lost',
  players: [{ ...ME, outcome: 'lost' }],
}
const SOLO_WON: ZTest_GameDataFacts = {
  ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' },
  outcome: 'won',
  players: [{ ...ME, outcome: 'won', finalRanking: 1, solvedAt: '2026-09-03T00:00:00Z' }],
}

/** Flatten what PlayArea handed `menu.setGameSections` into id → ROW — what the
 *  menu would actually draw, since a row is an action now and its words,
 *  glyph and availability come from the action rather than the list. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke as the app-root listener sees it: from the body, with nothing
 *  focused. An Option chord matches on `code`, since ⌥ changes the character. */
const press = (key: KeyboardEventInit) => fireEvent.keyDown(document.body, key)
const PLUS = { key: '+' }
const OPT_BACKSPACE = { key: 'Backspace', code: 'Backspace', altKey: true }

/** The page's action for an id — the same `run` its key, its menu row and
 *  its button all fire. */
const getAction = (id: ActionId) => getActions().find((action) => action.id === id)!

/** Answer the open question with the button that says `name`. The trigger can
 *  share the modal's words ("Stop game" / "Stop game"); the modal's is the one
 *  the host adds, so it is last in the DOM. */
async function answer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const buttons = await screen.findAllByRole('button', { name })
  await user.click(buttons[buttons.length - 1]!)
}

beforeEach(() => {
  ZTest_clearFaultMessages()
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
  startEdgeFn.mockReset()
})

describe('letterboxed PlayArea — a conceder keeps the one flag', () => {
  it('shows "You conceded" with Stop for all, not a hidden Concede', () => {
    // Conceding is spent; stopping the game for all is open to anyone in it, so
    // Stop takes Concede's place in the row.
    render(
      <PlayAreaLoader
        {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(document.querySelector('button[data-action="act-concede"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
  })
})

describe('letterboxed PlayArea — the game menu is the icon legend', () => {
  it('coop names both rungs of the hint ladder, each with its glyph', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
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
    const ctx = makeCtx({ mode: 'compete', players: [ME, MOTH] })
    render(<PlayAreaLoader {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.hidden).toBe(true)
    expect(items.get('act-spoiler')?.hidden).toBe(true)
  })

  it('names the Reveal solution — grayed while the game is live', () => {
    const live = makeCtx()
    render(<PlayAreaLoader {...live} />)
    const reveal = menuItems(live).get('act-reveal')
    expect(reveal?.label).toBe('Reveal solution')
    expect(reveal?.icon).toBeTruthy()
    // Present-but-disabled, not absent: a grayed row still teaches its glyph.
    // End-only, so a player who dropped out can't spoil a live race.
    expect(reveal?.disabled).toBe(true)

    const done = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...done} />)
    expect(menuItems(done).get('act-reveal')?.disabled).toBe(false)
  })

  it('the Reveal row is a local toggle — no RPC, and its label flips', async () => {
    const commonDb = (await import('@/common/supabase/db')).db as unknown as { rpc: ReturnType<typeof vi.fn> }
    commonDb.rpc.mockClear()
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)

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
    // A win here is covering the twelve letters with SOME chain, not producing
    // the seeded pair, so winning must not hand it over.
    const ctx = makeCtx(SOLO_WON)
    render(<PlayAreaLoader {...ctx} />)
    expect(screen.queryByText('Solvable in two')).not.toBeInTheDocument()
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')
  })
})

/**
 * The three REFUSALS the hint search can answer with (lib/solve.ts). Each names
 * a different wall, and the pill is the only place that distinction reaches the
 * player — so these pin both the branch and the copy. Short copy is
 * load-bearing here, not taste: the pill is `nowrap` + ellipsis in a
 * reserved-height slot, so a long sentence truncates mid-word.
 *
 * Fired through the game menu's Hint row rather than the button, which also
 * proves the row is wired to the same handler.
 */
describe('letterboxed PlayArea — why there is no hint', () => {
  /** Take the hint via the menu row and read back the pill it wrote. */
  async function askHint(ctx: PlayAreaLoaderProps) {
    await act(async () => menuItems(ctx).get('act-hint')?.run())
  }

  it('stuck: names the letter nothing follows', async () => {
    // Tail is D; the board has no D-word at all, so there is no legal move.
    const ctx = makeCtx({ words: ['bad', 'cab'], chain: ['bad'] })
    render(<PlayAreaLoader {...ctx} />)
    await askHint(ctx)
    expect(screen.getByText('No word starts with D')).toBeInTheDocument()
  })

  it('stuck on a letter I already spent: says "no OTHER word"', async () => {
    // DAB → BAD leaves the tail back on D, and DAB was the board's only D-word.
    // The player can see a D-word in their own chain, so the bare "No word
    // starts with D" would read as a bug rather than as a rule.
    const ctx = makeCtx({ words: ['dab', 'bad'], chain: ['dab', 'bad'] })
    render(<PlayAreaLoader {...ctx} />)
    await askHint(ctx)
    expect(screen.getByText('No other word starts with D')).toBeInTheDocument()
  })

  it('off par: a finish exists, but it is longer than the room left', async () => {
    // ABC played, cap 2 ⇒ one word left; the shortest finish is two
    // (CDEFGH then HIJKL), so pointing at CDEFGH would walk into the cap.
    const ctx = makeCtx({ words: ['abc', 'cdefgh', 'hijkl'], maxWords: 2, chain: ['abc'] })
    render(<PlayAreaLoader {...ctx} />)
    await askHint(ctx)
    expect(screen.getByText('Best solution needs 2 words')).toBeInTheDocument()
  })

  it('unreachable: words follow, but no route ever covers the board', async () => {
    // CBA follows ABC and then dead-ends back at a played word — the frontier
    // empties with every letter past C still uncovered. The cap is irrelevant.
    const ctx = makeCtx({ words: ['abc', 'cba'], maxWords: 9, chain: ['abc'] })
    render(<PlayAreaLoader {...ctx} />)
    await askHint(ctx)
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
  it('a word only the ACCEPT list has is never handed over by the SPOILER', async () => {
    // Asserted through the spoiler, not the hint: a hint prints a prefix, so it
    // would hide a leak behind "6 letters starting with CDE". The spoiler prints
    // the word — the surface where handing over a slur would actually show.
    // CDEFGHIJKL is a ONE-WORD FINISH from here — the search's ideal answer,
    // and the only one. It's accepted but not clean, so the spoiler must refuse
    // rather than hand it over.
    const ctx = makeCtx({
      words: ['abc', 'cdefghijkl'],
      uncleanWords: ['cdefghijkl'],
      chain: ['abc'],
    })
    render(<PlayAreaLoader {...ctx} />)
    await act(async () => menuItems(ctx).get('act-spoiler')?.run())
    expect(screen.queryByText('CDEFGHIJKL'), 'the spoiler handed over an unclean word').toBeNull()
    // ...and says so, rather than silently doing nothing.
    expect(screen.getByText('No winning path from here')).toBeInTheDocument()
  })

  it('"no word starts with C" is judged on the ACCEPT list, so it cannot lie', async () => {
    // The clean search sees nothing after C and would say "stuck" — but CDEFGH
    // is right there, playable. Claiming no C-word exists would be false about
    // the RULES, so the honest answer is that there's no route to offer.
    const ctx = makeCtx({ words: ['abc', 'cdefgh'], uncleanWords: ['cdefgh'], chain: ['abc'] })
    render(<PlayAreaLoader {...ctx} />)
    await act(async () => menuItems(ctx).get('act-hint')?.run())
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
  /** Take back the last word and have the server refuse it. */
  async function undoAnswering(reply: unknown) {
    rpc.mockResolvedValue(reply)
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx({ chain: ['bad'] })} />)
    await user.click(screen.getByRole('button', { name: 'Take back BAD' }))
  }

  /** A refusal as it actually arrives: an HTTP 200 carrying an envelope. */
  function refusal(over: Record<string, unknown>) {
    return {
      data: {
        type: 'not-ok', data: null, outcome: null, severity: 'race',
        message: 'Game over', field: null, meta: null,
        dbcode: 'PN486', detail: null, ...over,
      },
      error: null,
      status: 200,
    }
  }

  it('sends the undo with the RPC\'s own argument name', async () => {
    await undoAnswering(refusal({}))
    expect(rpc).toHaveBeenCalledWith('undo_word', { p_game_id: 'g1' })
  })

  it('shows the sentence the SERVER wrote', async () => {
    // The words come from the raise, at the site that knows the condition, and
    // the frontend renders them without a lookup table in between.
    await undoAnswering(refusal({}))
    expect(screen.getByText('Game over')).toBeInTheDocument()
  })

  it('a race reads as a normal pill, not as something broken', async () => {
    await undoAnswering(refusal({}))
    expect(screen.getByText('Game over').closest('[class*="fault"]')).toBeNull()
    expect(ZTest_peekFaultMessages()).toHaveLength(0)
  })

  it('a fault raises the modal AND leaves its sentence behind', async () => {
    // The escalation rule (docs/envelopes.md): the modal is dismissable, so the
    // surface still has to say what happened once it is gone.
    await undoAnswering(refusal({
      severity: 'fault', dbcode: 'PN253', message: 'You are not in this game',
    }))
    await waitFor(() =>
      expect(ZTest_peekFaultMessages().map((f) => f.text)).toContain('You are not in this game'))
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
      expect(ZTest_peekFaultMessages().map((f) => f.text).join(' '))
        .toMatch(/refresh and try again/))
  })
})

/**
 * The no-clean-word fallback, added after a real e2e failure.
 *
 * Whether a word is clean is DERIVED — the builder joins the board's words
 * against common.words — so every word comes back unclean whenever those words
 * aren't in the dictionary: a synthetic test board, or a database whose word
 * import never ran. The hint then had nothing to search and told the player
 * "No words to play" about a board full of words.
 */
describe('letterboxed PlayArea — the hint corpus when no word is clean', () => {
  it('falls back to every word rather than claiming the board is empty', async () => {
    const ctx = makeCtx({ words: ['bad', 'dig', 'gab'], uncleanWords: ['bad', 'dig', 'gab'] })
    render(<PlayAreaLoader {...ctx} />)
    await act(async () => menuItems(ctx).get('act-hint')?.run())
    // Something is offered — the exact word doesn't matter, only that the
    // search ran against a non-empty corpus.
    expect(screen.queryByText('No words to play')).toBeNull()
  })

  it('still prefers the clean words when there are any', async () => {
    // The purity guarantee is untouched in every normal case: only NO clean
    // word at all triggers the fallback, never merely fewer.
    const ctx = makeCtx({
      words: ['bad', 'dig', 'gab'],
      uncleanWords: ['dig', 'gab'],
      chain: ['bad'],
    })
    render(<PlayAreaLoader {...ctx} />)
    await act(async () => menuItems(ctx).get('act-hint')?.run())
    // Tail is D. 'dig' is accepted and NOT clean, so a fallback would have
    // SUGGESTED it. Instead we get the unreachable line — which proves both
    // mechanisms at once: the search ran on the clean words (no suggestion),
    // and the stuck test still consulted every word, so it refused to claim
    // "No word starts with D" while `dig` sits there playable.
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
   *  fired in one tick would land one. */
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
    // The mark is ENDED by the edit rather than merely hidden by a text
    // comparison: a refused ADG would otherwise shake again on the way back
    // from ADGJ, because typing past a refused word and back makes the text
    // match a second time.
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

  it('a letter on the same side as the one before it never enters the word', async () => {
    // A and B share the top side, so B cannot follow A; D, on the next side,
    // can. The board lights the word's letters, which is what is read back.
    const inWord = () =>
      [...document.querySelectorAll('div[class*="inWord"]')].map((n) => n.textContent).sort()
    render(<WithKeys {...makeCtx()} />)
    await key({ key: 'a' })
    await key({ key: 'b' })
    expect(inWord()).toEqual(['A'])
    await key({ key: 'd' })
    expect(inWord()).toEqual(['A', 'D'])
  })

  it('a word the board accepts goes to the server under the RPC\'s own names', async () => {
    rpc.mockResolvedValue({
      data: {
        type: 'ok', data: { result: 'accepted', accepted: true, letters_covered: 3, solved: false },
        outcome: 'won', severity: null, message: null, field: null, meta: null,
        dbcode: null, detail: null,
      },
      error: null,
    })
    render(<WithKeys {...makeCtx({ words: ['adg'] })} />)
    await typeADG()
    await key({ key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_word: 'adg' }))
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is an action's, so
 * what these pin is the wiring: the chord reaches the action, the action asks
 * the registry's question mid-game and skips it at the end, and the answer
 * runs the same call the button does.
 */
describe('letterboxed PlayArea — the keys', () => {
  // `hidden`, not `disabled`: Help's key list draws a disabled key exactly like
  // a live one, so a listed ↑ here would read as a recall this game doesn't
  // have. Both arrows go, since ↓ could only clear back to the locked seed.
  it('neither history arrow is offered — a word joins the chain, not a history', () => {
    render(<WithKeys {...makeCtx()} />)

    expect(getAction('act-recall-last').describe('help').state).toBe('hidden')
    expect(getAction('act-clear-entry').describe('help').state).toBe('hidden')
  })

  it('+ at the end starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const ctx = makeCtx(SOLO_LOST)
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
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('fresh-game-id'))
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

  it('⌥⌫ in coop asks to stop the game, and yes calls stop_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    await answer(user, 'Stop game')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks to concede, and yes calls concede', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: [ME, MOTH] })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('stop_game', expect.anything())
  })

  describe('Restart', () => {
    // Keyless, so mid-game it is fired as the menu row would fire it: the action's
    // run, which is where the registry's question is asked.
    it('mid-game asks first, and Keep playing wipes nothing', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayAreaLoader {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => getAction('act-restart').run())
      expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Keep playing' }))
      await waitFor(() => expect(screen.queryByText('Restart this game?')).not.toBeInTheDocument())
      expect(rpc).not.toHaveBeenCalledWith('replay_board', expect.anything())
    })

    it('mid-game, yes calls replay_board', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayAreaLoader {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => getAction('act-restart').run())
      await answer(user, 'Restart')
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    })

    it('at the end the button goes straight through', async () => {
      const user = userEvent.setup()
      render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    })
  })
})
