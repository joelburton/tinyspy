// cs-unmet

/**
 * Render + behavior tests for wordwheel's play surface, built from the blob
 * a test's facts would produce (`lib/gameData.fixture.ts`): the tree mounts in
 * every mode and state, and the wordwheel-specific glue works — the lookup
 * accepts a required, bonus or pangram word (the optimistic pill and the
 * `submit_word` call) and refuses a non-legal one with the right reason, on the
 * board as well as in the pill. The game logic itself is pgTAP's and the lib
 * suites' (the answer table, the ending sentences); here we cover the
 * composition.
 *
 * `db` and the start-game edge function are mocked so no client or network is
 * needed; everything else — the board, RankBar, entry row, word list —
 * renders real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { db } from '../db'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { pickFilter } from '@/common/lists/filterSelectHelpers'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import {
  ZTest_find,
  ZTest_makeWordwheelCtx,
  ZTest_word,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// PlayArea's "New game" calls the start-game edge function directly (the same
// helper the manifest uses); mocked so no edge runtime is needed. Only
// `runEdgeFn` is stubbed — the create-game path. `runRpc` stays REAL so the
// submit path exercises the envelope it actually receives; the `db.rpc` mock
// above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

/** The fixture board (`abcdfghi` around `e`) with three words: the required
 *  `bead` and the pangram `abcdefghi`, and the bonus `bcdfge`. 25 required points. */
const WORDS = [ZTest_word('bead', 1), ZTest_word('abcdefghi', 24, { pangram: true }), ZTest_word('bcdfge', 6, { bonus: true })]

const me = (over: Partial<ZTest_PlayerFacts> = {}): ZTest_PlayerFacts => ({ id: 'u1', username: 'me', color: 'red', ...over })
const moth = (over: Partial<ZTest_PlayerFacts> = {}): ZTest_PlayerFacts => ({ id: 'u2', username: 'moth', color: 'blue', ...over })
const CONCEDED: Partial<ZTest_PlayerFacts> = {
  ending: { at: '2026-01-01T00:02:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** A stopped game: the common ending, every player neutral. */
const STOPPED: Partial<ZTest_GameDataFacts> = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
}

/** The props `<GamePage>` hands the surface, from the game's facts. Coop,
 *  solo, in play, on the fixture board unless said otherwise. */
function makeCtx(
  facts: ZTest_GameDataFacts = {},
  over: Parameters<typeof ZTest_makeWordwheelCtx>[1] = {},
): PlayAreaLoaderProps {
  return ZTest_makeWordwheelCtx({ words: WORDS, ...facts }, over)
}

/** A race to rank 5 (Amazing) between me and moth. */
const race = (facts: ZTest_GameDataFacts = {}): ZTest_GameDataFacts => ({
  mode: 'compete', players: [me(), moth()], targetRankIdx: 5, ...facts,
})

/** A ctx whose global slot is real, with a spy on its one door. */
function narrationCtx(facts: ZTest_GameDataFacts = {}) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  return { ctx: makeCtx(facts, { globalFeedbackSlot }), shown }
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the entry's letters, Backspace and Enter are
 *  actions now, and a bare `render` binds them with nothing feeding them
 *  keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke as the app-root listener sees it: from the body, with nothing
 *  focused. An Option chord matches on `code`, since ⌥ changes the character
 *  (⌥Z arrives as `Ω`). */
const press = (key: KeyboardEventInit) => fireEvent.keyDown(document.body, key)
const PLUS = { key: '+' }
const OPT_BACKSPACE = { key: 'Backspace', code: 'Backspace', altKey: true }
const OPT_Z = { key: 'Ω', code: 'KeyZ', altKey: true }

/** The page's action for an id — the same `run` its key, its menu row and
 *  its button all fire. */
const getAction = (id: ActionId) => getActions().find((action) => action.id === id)!

/** The letter a tile draws, lowercase as the app holds it; `data-tile` is the
 *  tile's id, so a test finds a tile by what it shows. */
const letterOf = (tile: Element) => tile.textContent!.trim().toLowerCase()
/** The tile drawing this letter — on a board with two, the first drawn. */
const tileOf = (letter: string) =>
  [...document.querySelectorAll('[data-tile]')].find((t) => letterOf(t) === letter)!
/** The OUTER tile drawing this letter, where the center draws it too. */
const outerTileOf = (letter: string) =>
  [...document.querySelectorAll('[data-tile]:not([data-center])')].find((t) => letterOf(t) === letter)!

/** Answer the open question with the button that says `name`. The trigger can
 *  share the modal's words ("Stop game" / "Stop game"); the modal's is the one
 *  the host adds, so it is last in the DOM. */
async function answer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const buttons = await screen.findAllByRole('button', { name })
  await user.click(buttons[buttons.length - 1]!)
}

/** The outer tiles' letters in the order they are drawn — what the shuffle
 *  rearranges; the center never moves. */
const outerOrder = () =>
  [...document.querySelectorAll('[data-tile]:not([data-center])')].map(letterOf)

/** A submit that landed, in the envelope `runRpc` unwraps. `accepted` is
 *  the plain classification; the bonus/pangram ones return the same `null` to
 *  the hook, so one fixture covers every accept. */
const acceptedEnvelope = {
  data: {
    type: 'ok', data: { result: 'accepted', points: 1 }, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue(acceptedEnvelope) // the send lands by default
  // Reset the edge-fn mock too: without this its call COUNT leaks between
  // tests, which silently breaks any toHaveBeenCalledTimes assertion (each
  // New-game test sets its own resolved value, so clearing is safe).
  startEdgeFn.mockReset()
})

describe('wordwheel PlayArea — render smoke', () => {
  it('renders the board + RankBar + Stats in coop play', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(document.querySelector('[data-board]')).toBeInTheDocument()
    // The center tile. Selected by its data hook rather than a role + aria-label:
    // a tile is pointer-only (see Tile.tsx), so dressing it as a button just to
    // give the test a handle would put back the costume that trapped focus.
    expect(document.querySelector('[data-tile][data-center]')).toBeInTheDocument()
    // The WordList rendered (empty during play).
    expect(screen.getByText(/no words yet/i)).toBeInTheDocument()
  })

  it('renders the OpponentStrip (Rank) in compete play', () => {
    render(<PlayAreaLoader {...makeCtx(race())} />)
    expect(screen.getByText('Rank:')).toBeInTheDocument()
  })

  it('holds the missed words one select back at the end, and shows them on ask', async () => {
    // The missed words are in the rows the moment the game ends; the WHO
    // filter's default at the end, Found, is what holds them one select back.
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    // 'bead' was never submitted, so it is a missed word and not on show.
    expect(screen.queryByText(/bead/i)).toBeNull()

    await pickFilter('Missed', 1) // the WHO select; KIND is 0 on a bonus board
    expect(screen.getByText(/bead/i)).toBeInTheDocument()
  })
})

/**
 * The wheel is a MULTISET: a letter may sit on two tiles, so each use of a
 * letter SPENDS one tile (`lib/spend.ts`), and a click says which. `data-spent`
 * is the spent marker (the tiles carry no ARIA role, see Tile.tsx).
 */
describe('wordwheel PlayArea — the tiles the word is spending', () => {
  /** The tiles the typed word is spending, in draw order. */
  const spentTiles = () =>
    [...document.querySelectorAll('[data-tile][data-spent]')].map(letterOf)
  const tile = tileOf
  /** The twin E tiles of the `bacdfghe` board: the center, and the outer one. */
  const centerE = () => document.querySelector('[data-tile][data-center]')!
  const outerE = () => outerTileOf('e')
  /** A wheel where the center letter `e` is duplicated on an outer tile. */
  const TWIN_E: ZTest_GameDataFacts = { outerLetters: 'bacdfghe' }

  it('marks a wheel tile once its letter is in the word (tile-spend rule)', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // Before typing: neither the 'b' tile nor the center 'e' tile is spent.
    expect(tile('b')).not.toHaveAttribute('data-spent')
    expect(tile('e')).not.toHaveAttribute('data-spent')
    // Type 'be' → both spent; an untyped tile ('c') is not.
    await user.keyboard('be')
    expect(tile('b')).toHaveAttribute('data-spent', 'true')
    expect(tile('e')).toHaveAttribute('data-spent', 'true')
    expect(tile('c')).not.toHaveAttribute('data-spent')
    // Backspace gives the freed tile back.
    await user.keyboard('{Backspace}') // removes 'e'
    expect(tile('e')).not.toHaveAttribute('data-spent')
  })

  it('wears the selected border while spent, and gives it back', async () => {
    // The mark is a border on the FACE, not a fill on the tile: a spent tile
    // reads as "this one is in your word", the way a selected tile does on every
    // other board.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const marked = () =>
      [...document.querySelectorAll('[data-tile]')]
        .filter((t) => (t.getAttribute('class') ?? '').includes('_spent_'))
        .map(letterOf)

    expect(marked()).toEqual([])
    await user.keyboard('be')
    expect(new Set(marked())).toEqual(new Set(['b', 'e']))
    await user.keyboard('{Backspace}')
    expect(marked()).toEqual(['b'])
  })

  it('clears every mark on submit', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bead')
    expect(spentTiles()).toHaveLength(4)
    await user.keyboard('{Enter}')
    expect(spentTiles()).toEqual([])
  })

  it('spends duplicate tiles one per occurrence, the center first', async () => {
    const user = userEvent.setup()
    // Typing one 'e' must spend the center (the mandatory-use tile), leaving
    // its outer twin clickable; a second 'e' spends the twin too.
    render(<WithKeys {...makeCtx(TWIN_E)} />)
    expect(centerE()).not.toHaveAttribute('data-spent')
    expect(outerE()).not.toHaveAttribute('data-spent')
    // First 'e': center spent FIRST, the outer twin still available.
    await user.keyboard('e')
    expect(centerE()).toHaveAttribute('data-spent', 'true')
    expect(outerE()).not.toHaveAttribute('data-spent')
    // Second 'e': both e-tiles spent.
    await user.keyboard('e')
    expect(centerE()).toHaveAttribute('data-spent', 'true')
    expect(outerE()).toHaveAttribute('data-spent', 'true')
    // Backspace frees one occurrence → the outer twin re-enables, the center
    // stays spent (it's first in the spend order).
    await user.keyboard('{Backspace}')
    expect(centerE()).toHaveAttribute('data-spent', 'true')
    expect(outerE()).not.toHaveAttribute('data-spent')
  })

  it('spends the tile you CLICKED, not its twin', async () => {
    // Typing an 'e' spends the center, because nothing says which E was meant.
    // Clicking the outer one does say, and the board has to answer the question
    // that was actually asked.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(TWIN_E)} />)

    await user.click(outerE())
    expect(outerE()).toHaveAttribute('data-spent', 'true')
    expect(centerE()).not.toHaveAttribute('data-spent')

    // A second E, typed this time: the claim holds and the center takes the
    // overflow.
    await user.keyboard('e')
    expect(outerE()).toHaveAttribute('data-spent', 'true')
    expect(centerE()).toHaveAttribute('data-spent', 'true')

    // Backspace forgets the typed one first, then the click.
    await user.keyboard('{Backspace}')
    expect(centerE()).not.toHaveAttribute('data-spent')
    expect(outerE()).toHaveAttribute('data-spent', 'true')
    await user.keyboard('{Backspace}')
    expect(outerE()).not.toHaveAttribute('data-spent')
  })

  it('forgets a click once its word is submitted', async () => {
    // The engine clears the box on a submit without calling the game's
    // onChange, so the claim has to be dropped where the answer lands — or the
    // NEXT word's typed 'e' would spend the outer tile clicked for this one.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(TWIN_E)} />)

    await user.click(outerE())
    await user.keyboard('bad{Enter}')
    await user.keyboard('e')
    expect(centerE()).toHaveAttribute('data-spent', 'true')
    expect(outerE()).not.toHaveAttribute('data-spent')
  })

  it('forgets a click when ArrowUp recalls a different word over it', async () => {
    // The recalled word's letters were never picked off the board, so its E
    // falls to the center, as a typed one does.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(TWIN_E)} />)

    await user.keyboard('bead{Enter}')
    await user.click(outerE())
    await user.keyboard('{ArrowUp}')
    expect(centerE()).toHaveAttribute('data-spent', 'true')
    expect(outerE()).not.toHaveAttribute('data-spent')
  })

  it('a conceded racer types nothing: the entry is closed as the engine is', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(race({ players: [me(CONCEDED), moth()] }))} />)
    // The keys themselves are closed — the marks alone would not show it, since
    // a read-only board draws none whatever the word holds.
    expect(getAction('act-type-letter').describe('key').state).toBe('disabled')
    await user.keyboard('bed')
    expect(spentTiles()).toEqual([])
  })

  /** Tap the tiles for these letters, in order. */
  const tap = async (user: ReturnType<typeof userEvent.setup>, letters: string) => {
    for (const l of letters) await user.click(tileOf(l))
  }
  const inertTiles = () =>
    [...document.querySelectorAll('[data-tile]')].filter((t) =>
      (t.getAttribute('class') ?? '').includes('_inert_'),
    )

  it('a tapped tile adds its letter while I can play', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(inertTiles()).toEqual([])
    await tap(user, 'bed')
    expect(new Set(spentTiles())).toEqual(new Set(['b', 'e', 'd']))
  })

  it("a conceded racer's board is inert: a tap adds nothing", async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(race({ players: [me(CONCEDED), moth()] }))} />)
    expect(inertTiles()).toHaveLength(9)
    await tap(user, 'bed')
    expect(spentTiles()).toEqual([])
  })

  it('a half-typed word loses its marks when the game ends under it', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed')
    expect(new Set(spentTiles())).toEqual(new Set(['b', 'e', 'd']))
    rerender(<WithKeys {...makeCtx(STOPPED)} />)
    expect(spentTiles()).toEqual([])
  })

  it("a finished game's board is inert too", async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(STOPPED)} />)
    expect(inertTiles()).toHaveLength(9)
    await tap(user, 'bed')
    expect(spentTiles()).toEqual([])
  })
})

/**
 * The compete collective losses both come back as a lost game and are told
 * apart only by the ending's reason: common._concede writes `conceded`,
 * submit_timeout writes `timeout`. These pin the ending message to the endings
 * the server actually writes.
 */
describe('wordwheel PlayArea — compete ending verdicts', () => {
  const endedRace = (reason: 'conceded' | 'timeout' | 'stopped', outcome: 'lost' | 'neutral') =>
    makeCtx(race({
      players: [me({ outcome }), moth({ outcome })],
      ending: { reason, detail: reason, by: null },
      outcome,
    }))

  it('all-conceded says so', () => {
    render(<PlayAreaLoader {...endedRace('conceded', 'lost')} />)
    expect(screen.getByText('Lost: all conceded')).toBeInTheDocument()
  })

  it('timeout blames the clock', () => {
    render(<PlayAreaLoader {...endedRace('timeout', 'lost')} />)
    expect(screen.getByText('Lost: ran out of time')).toBeInTheDocument()
  })

  it('a Stop stays neutral', () => {
    render(<PlayAreaLoader {...endedRace('stopped', 'neutral')} />)
    expect(screen.getByText(/game ended/i)).toBeInTheDocument()
  })
})

/**
 * The win's confetti fires at the MOMENT the game is won — my outcome turning
 * `won` — never on mounting a game already won: the team's in coop, and in a
 * race MY win alone. The dialog's handle is its title; the pill and the row's
 * line say the verdict in their own words.
 */
describe('wordwheel PlayArea — the celebration', () => {
  /** My pangram: 24 of the board's 25 points, rank 6. */
  const myPangram = ZTest_find('u1', 'abcdefghi', 24, { pangram: true })
  const coopWon: ZTest_GameDataFacts = {
    players: [me({ outcome: 'won', finalRanking: 1, solvedAt: 't' }), moth({ outcome: 'won', finalRanking: 1, solvedAt: 't' })],
    foundWords: [myPangram],
    ending: { reason: 'reached_goal', detail: 'target', by: 'u1' },
    outcome: 'won',
  }
  const coopTeam: ZTest_GameDataFacts = { players: [me(), moth()], targetRankIdx: 5 }

  it('pops when the coop team crosses its target mid-session', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx(coopTeam)} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<PlayAreaLoader {...makeCtx({ ...coopTeam, ...coopWon })} />)
    expect(screen.getByRole('dialog', { name: 'You win! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('Reached "Genius" — 24/25 points.')).toBeInTheDocument()
  })

  it('does not pop when mounted into a coop game already won', () => {
    render(<PlayAreaLoader {...makeCtx({ ...coopTeam, ...coopWon })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pops for the race I won, at the moment it ends', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx(race())} />)
    rerender(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'won', finalRanking: 1, solvedAt: 't' }), moth({ outcome: 'lost' })],
          foundWords: [myPangram],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u1' },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'You win! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('Reached "Genius" first — 24/25 points.')).toBeInTheDocument()
  })

  it('does not pop for a race somebody else won', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx(race())} />)
    rerender(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'lost' }), moth({ outcome: 'won', finalRanking: 1, solvedAt: 't' })],
          foundWords: [ZTest_find('u2', 'abcdefghi', 24, { pangram: true })],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u2' },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/**
 * The icon-only action row (the waffle arrangement — labels live in tooltips):
 * one row listing every action, each deciding for itself whether it is on
 * screen. Restart = wordwheel.replay_board (unconfirmed at the end); New
 * game = the wordwheel-build-board edge function with THIS game's setup/
 * roster/mode, then ctx.goToFollowUpGame.
 */
describe('wordwheel PlayArea — icon-only action rows', () => {
  it('Restart and New game are menu rows all game, and buttons only at the end', () => {
    const { unmount } = render(<PlayAreaLoader {...makeCtx()} />)
    for (const id of ['act-restart', 'act-new-game'] as const) {
      expect(getAction(id).describe('button').state).toBe('hidden')
      expect(getAction(id).describe('menu').state).not.toBe('hidden')
    }
    unmount()
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    for (const id of ['act-restart', 'act-new-game'] as const) {
      expect(getAction(id).describe('button').state).toBe('active')
    }
  })

  it('playing row offers Back-to-club — the shell action, which knows to suspend', async () => {
    // ONE action for both rows: it navigates directly at the end and routes
    // through the suspend-confirm flow mid-game, so the game picks nothing
    // and cannot pick wrong.
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('Restart at the end calls replay_board WITHOUT confirming', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })

  it('"New game" at the end starts a fresh game with this setup/roster/mode', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const user = userEvent.setup()
    const ctx = makeCtx(STOPPED)
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'wordwheel-build-board',
        expect.objectContaining({ target_club: 'testclub', player_user_ids: ['u1'], mode: 'coop' }),
      ),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('fresh-game-id'))
  })

  it('"New game" after a hand-picked board asks for a random one', async () => {
    // Custom letters are a one-off: the follow-up keeps every other setting and
    // drops the two letter keys, so the edge function takes the random path.
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const user = userEvent.setup()
    const setup = { required_band: 4, legal_band: 5, timer: { kind: 'none' as const }, custom_center: 'e', custom_letters: 'abcdfg' }
    render(<PlayAreaLoader {...makeCtx({ ...STOPPED, setup })} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(startEdgeFn).toHaveBeenCalled())
    const sent = startEdgeFn.mock.calls[0]![1].setup
    expect(sent.custom_center).toBeUndefined()
    expect(sent.custom_letters).toBeUndefined()
    expect(sent.required_band).toBe(4)
  })

  /**
   * The single-flight guard, checked once end-to-end through a real game rather
   * than only on the hook (`common/single-flight/useSingleFlight.test.ts`). It matters
   * here because `create_game` is NOT idempotent: a second call shelves the game
   * the first one just made, orphaning it in the club list and toasting every
   * peer a second time. The end is the case to test — that's where New game
   * lives and where the handler skips its confirm, so nothing else slows a
   * double-click down.
   */
  it('drops a second "New game" click while the first is still in flight', async () => {
    let release!: (v: unknown) => void
    startEdgeFn.mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const user = userEvent.setup()
    const ctx = makeCtx(STOPPED)
    render(<PlayAreaLoader {...ctx} />)

    const button = screen.getByRole('button', { name: 'New game' })
    await user.click(button)
    await waitFor(() => expect(button).toBeDisabled()) // the in-flight run reached the button
    await user.click(button)
    await user.click(button)

    expect(startEdgeFn).toHaveBeenCalledTimes(1)
    await act(async () => release({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } }))
    expect(ctx.goToFollowUpGame).toHaveBeenCalledTimes(1)
  })
})

describe('wordwheel PlayArea — submit behavior (shared useFoundWordSubmit)', () => {
  /** The tiles wearing a refused word's answer, with their class strings. */
  const answeredTiles = () =>
    [...document.querySelectorAll('[data-tile]')].filter((t) =>
      (t.getAttribute('class') ?? '').includes('_answered_'),
    )

  it('accepts a required word: optimistic pill + submit_word call', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bead{Enter}')
    expect(screen.getByText(/BEAD — \+1/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'submit_word',
      { p_game_id: 'g1', p_word: 'bead', p_points: 1, p_is_bonus: false, p_is_pangram: false },
    )
  })

  it('shows the bonus dot for a bonus word', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bcdfge{Enter}')
    expect(screen.getByText(/BCDFGE • — \+6/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ p_is_bonus: true }))
  })

  it('shows the pangram flourish for a pangram', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('abcdefghi{Enter}')
    expect(screen.getByText(/pangram \+24/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ p_is_pangram: true }))
  })

  it('blocks submitting a word with an off-wheel letter (inert, not a reject)', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('zzzz{Enter}') // z isn't a puzzle letter — the wheel can't spell it
    // The submit is vetoed, not rejected: no RPC, and crucially NO misleading
    // "not a word" pill (which read as "ZZZZ isn't in the dictionary").
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.queryByText(/not a word|bad letters/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('blocks submitting a word that over-uses a tile (two e, one e-tile)', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('beed{Enter}') // two e's, but the wheel has one e-tile
    // Over-count = can't be spelled from the tiles, so submit is inert (no pill).
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.queryByText(/not a word|not enough tiles/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('refuses a word a teammate already found, without a call', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ players: [me(), moth()], foundWords: [ZTest_find('u2', 'bead', 1)] })} />)
    await user.keyboard('bead{Enter}')
    expect(screen.getByText(/already found/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("answers a refusal on the board: the word's own tiles shake and go red, the board holds still", async () => {
    // The head-shake for a move that wasn't a winning one, on each FACE the word
    // used and no other, and the outcome's own fill on the tile — one table
    // (lib/answer.ts) decides which color, and the pill reads the same one.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const shakingTiles = () =>
      [...document.querySelectorAll('[data-tile]')]
        .filter((t) => (t.firstElementChild?.getAttribute('class') ?? '').includes('verdictShake'))
        .map(letterOf)
    const boardShakes = () =>
      (document.querySelector('[data-board]')?.getAttribute('class') ?? '').includes('verdictShake')

    await user.keyboard('bead{Enter}') // a required word: nothing is refused
    expect(shakingTiles()).toEqual([])
    expect(answeredTiles()).toEqual([])

    await user.keyboard('bcdf{Enter}') // fits the wheel, but has no center E
    expect(new Set(shakingTiles())).toEqual(new Set(['b', 'c', 'd', 'f']))
    expect(new Set(answeredTiles().map(letterOf))).toEqual(new Set(['b', 'c', 'd', 'f']))
    expect(boardShakes()).toBe(false)
  })

  it('shakes the same tiles again when the same word is refused twice', async () => {
    // A CSS animation plays once per mount, so the word's tiles are keyed on
    // the mark's nonce: a second refusal is a new element, and a new shake.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const tileB = () => tileOf('b')

    await user.keyboard('bcdf{Enter}')
    const first = tileB()
    await user.keyboard('bcdf{Enter}')
    expect(tileB()).not.toBe(first)
    expect(tileB()?.firstElementChild?.getAttribute('class')).toMatch(/verdictShake/)
  })

  it('fills one tile per use of a letter, never both twins', async () => {
    // Two E tiles (the center and an outer one); the word uses E once, so one
    // tile takes the color — the one a typed E spends, the center.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ outerLetters: 'bacdfghe' })} />)
    await user.keyboard('bed{Enter}')

    const es = answeredTiles().filter((t) => letterOf(t) === 'e')
    expect(es).toHaveLength(1)
    expect(es[0]?.hasAttribute('data-center')).toBe(true)
  })

  it('answers on the twin that was CLICKED, not its sibling', async () => {
    // The refusal is the same question the click answered a beat earlier, so
    // the outer E the player clicked is the E that shakes.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ outerLetters: 'bacdfghe' })} />)
    await user.click(outerTileOf('e'))
    await user.keyboard('bd{Enter}')

    const es = answeredTiles().filter((t) => letterOf(t) === 'e')
    expect(es).toHaveLength(1)
    expect(es[0]?.hasAttribute('data-center')).toBe(false)
  })

  // A TOO-SHORT word, deliberately: it is `warning` (lib/answer.ts), where the
  // missing-center case above is `lost` — and `lost` is what a mark with a
  // default of its own would land on. The amber is what proves the letters
  // read the answer.
  it("wears the refusal's own outcome on its tiles, not a default", async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed{Enter}')

    const marked = answeredTiles()
    expect(new Set(marked.map(letterOf))).toEqual(new Set(['b', 'e', 'd']))
    for (const tile of marked) {
      expect(tile.getAttribute('class')).toMatch(/verdictWarning/)
      expect(tile.getAttribute('class')).not.toMatch(/verdictLost/)
    }
  })

  it('takes the mark off its letters after the word-answer beat', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed{Enter}')
    expect(answeredTiles()).toHaveLength(3)

    await act(async () => void vi.advanceTimersByTime(WORD_ANSWER_MS + 1))

    expect(answeredTiles()).toEqual([])
    vi.useRealTimers()
  })

  it('names the missing center letter (a fitting word still submits + rejects)', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bcdf{Enter}') // valid tiles, but no center 'e' — fits the wheel, so it submits
    // The letter itself, quoted — not the rule ("missing center letter").
    expect(screen.getByText(/missing "E"/)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('wordwheel PlayArea — coop peer narration (global header)', () => {
  // `useShowPeerFeedback` seeds the backlog silently on the first render, then
  // fires a header pill for each NEW peer find. Each test renders once (empty
  // seed), then re-renders with a teammate's find in the blob to fire.
  const team = { players: [me(), moth()] }

  it("narrates a teammate's find with the word + points, the actor leading", () => {
    const { ctx, shown } = narrationCtx(team)
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    rerender(<PlayAreaLoader {...makeCtx({ ...team, foundWords: [ZTest_find('u2', 'bead', 1)] }, { globalFeedbackSlot: ctx.globalFeedbackSlot })} />)
    const feedbackMsg = shown.mock.calls.at(-1)![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('found BEAD +1')
    expect(feedbackMsg.outcome).toBe('won')
  })

  it('adds the pangram flourish for a peer pangram', () => {
    const { ctx, shown } = narrationCtx(team)
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    rerender(<PlayAreaLoader {...makeCtx({ ...team, foundWords: [ZTest_find('u2', 'abcdefghi', 24, { pangram: true })] }, { globalFeedbackSlot: ctx.globalFeedbackSlot })} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('pangram 🦌 ABCDEFGHI +24')
  })

  it('shows the bonus dot after a peer bonus find', () => {
    const { ctx, shown } = narrationCtx(team)
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    rerender(<PlayAreaLoader {...makeCtx({ ...team, foundWords: [ZTest_find('u2', 'bcdfge', 6, { bonus: true })] }, { globalFeedbackSlot: ctx.globalFeedbackSlot })} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('found BCDFGE • +6')
  })

  it('does not narrate your own find (that goes to the local slot)', () => {
    const { ctx, shown } = narrationCtx(team)
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    rerender(<PlayAreaLoader {...makeCtx({ ...team, foundWords: [ZTest_find('u1', 'bead', 1)] }, { globalFeedbackSlot: ctx.globalFeedbackSlot })} />)
    expect(shown).not.toHaveBeenCalled()
  })
})

describe('wordwheel PlayArea — compete opponent rank climb', () => {
  // A rival's finds are withheld mid-race, so what this mode narrates is
  // their rank on the player going up: seeded on the first render, announced
  // on a rise.
  it('narrates an opponent reaching a higher rank', () => {
    const globalFeedbackSlot = createFeedbackSlot('global')
    const shown = vi.spyOn(globalFeedbackSlot, 'show')
    const { rerender } = render(<PlayAreaLoader {...makeCtx(race(), { globalFeedbackSlot })} />)
    // moth's pangram lifts her from Start to Genius; her words stay unseen.
    rerender(
      <PlayAreaLoader
        {...makeCtx(race({ foundWords: [ZTest_find('u2', 'abcdefghi', 24, { pangram: true })] }), { globalFeedbackSlot })}
      />,
    )
    const feedbackMsg = shown.mock.calls.at(-1)![0]
    expect(feedbackMsg.kind).toBe('peerMilestone')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('reached Genius')
    expect(screen.queryByText(/abcdefghi/i)).toBeNull()
  })
})

describe('wordwheel PlayArea — concede', () => {
  it('compete shows Concede and calls wordwheel.concede on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx(race())} />
        <ConfirmationHost />
      </>,
    )
    // The trigger and the modal's confirm share the name "Concede"; the confirm
    // is the one the dialog adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: /concede/i }))
    const confirms = await screen.findAllByRole('button', { name: /concede/i })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('coop shows Stop (not Concede) and calls stop_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    // The trigger and the modal's confirm share the name "Stop game" (an
    // icon-only button's label is its accessible name). The confirm is the one
    // the dialog adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    const confirms = await screen.findAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    render(<PlayAreaLoader {...makeCtx(race({ players: [me(), moth(CONCEDED)] }))} />)
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" look after I concede, while the race goes on', () => {
    render(<PlayAreaLoader {...makeCtx(race({ players: [me(CONCEDED), moth()] }))} />)
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    // A spent Concede goes, and Stop takes its place: one flag, not two.
    expect(getAction('act-concede').describe('button').state).toBe('hidden')
    expect(getAction('act-stop-game').describe('button').state).toBe('active')
    // The one row always keeps the way out.
    expect(screen.getByRole('button', { name: 'Back to club' })).toBeInTheDocument()
    // Moving on is still a menu thing until the game is over.
    expect(getAction('act-restart').describe('button').state).toBe('hidden')
    expect(getAction('act-new-game').describe('button').state).toBe('hidden')
  })

  it('distinguishes Conceded / Lost / Won at the end in the strip', () => {
    render(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [
            me({ outcome: 'lost' }),
            moth({ ...CONCEDED }),
            { id: 'u3', username: 'cade', color: 'green', outcome: 'won', finalRanking: 1, solvedAt: 't' },
          ],
          foundWords: [ZTest_find('u3', 'abcdefghi', 24, { pangram: true })],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u3' },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.getByText(/Conceded at/)).toBeInTheDocument()
    expect(screen.getByText(/Won at/)).toBeInTheDocument()
    expect(screen.getByText(/Lost at/)).toBeInTheDocument()
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is an action's, so
 * what these pin is the wiring: the chord reaches the action, the action asks
 * the registry's question mid-game and skips it at the end, and the answer
 * runs the same call the button does.
 */
describe('wordwheel PlayArea — the keys', () => {
  it('+ at the end starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const ctx = makeCtx(STOPPED)
    render(<WithKeys {...ctx} />)

    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the call firing proves none was asked.
    press(PLUS)
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'wordwheel-build-board',
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
        <WithKeys {...makeCtx(race())} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('stop_game', expect.anything())
  })

  describe('⌥Z shuffles the outer letters', () => {
    // The shuffle is Fisher–Yates over the ORIGINAL letters on `Math.random`,
    // so a pinned value is a fixed permutation: 0 rotates the list, ~1 leaves
    // it alone. Pinning one for the render and the other for the press makes
    // "the same letters in a different order" a deterministic claim rather
    // than a 1-in-40320 flake.
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })
    const nextShuffleDiffers = () => vi.spyOn(Math, 'random').mockReturnValue(0.999999)

    // Awaited: the action's run is async, so the re-order lands a tick after the
    // keystroke.
    it('rearranges the same letters mid-game, with no round trip', async () => {
      render(<WithKeys {...makeCtx()} />)
      const before = outerOrder()
      expect(before).toHaveLength(8)

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      const after = outerOrder()
      expect(after).not.toEqual(before)
      expect([...after].sort()).toEqual([...before].sort())
      expect(rpc).not.toHaveBeenCalled()
    })

    it('still works on a finished board — the fidget is deliberate', async () => {
      render(<WithKeys {...makeCtx(STOPPED)} />)
      expect(getAction('act-shuffle').describe('button').state).toBe('active')
      const before = outerOrder()

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      expect(outerOrder()).not.toEqual(before)
    })
  })

  describe('Restart mid-game', () => {
    // Keyless, so it is fired as the menu row would fire it: the action's run,
    // which is where the registry's question is asked. (The ended case, where
    // it goes straight through, is under "icon-only action rows".)
    it('asks first, and Keep playing wipes nothing', async () => {
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

    it('yes calls replay_board', async () => {
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
  })
})
