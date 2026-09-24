// cs-blessed-wordwheel

/**
 * Render + behavior tests for wordwheel's play surface: the tree mounts in
 * every mode and state, and the wordwheel-specific glue works — the local
 * lookup accepts a required, bonus or pangram word (the optimistic pill and the
 * `submit_word` call), holds back a word the tiles cannot spell, and refuses a
 * non-legal one with the right reason, on the board as well as in the pill.
 * The game logic itself is pgTAP's and the lib suites' (the answer table, the
 * terminal sentences, the tile spend); here we cover the composition.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the wheel, RankBar, entry row, word list — renders
 * real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import type { WordwheelGame, FoundWordRow } from '../hooks/useGame'
import { db } from '../db'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { pickFilter } from '@/common/lists/filterSelectHelpers'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { PlayAreaLoader } from './PlayArea'

/** A ctx whose global slot is real, with a spy on its one door. */
function narrationCtx(over: Partial<GamePageCtx> = {}) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  return { ctx: makeCtx({ globalFeedbackSlot, ...over }), shown }
}

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// PlayArea's "New game" calls the start-game edge function directly (the same
// helper the manifest uses); mocked so no edge runtime is needed.
// Only `runEdgeFn` is stubbed — the create-game path. `runRpc` stays REAL so
// the submit path exercises the envelope it actually receives; the `db.rpc`
// mock above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

/** A loaded coop game: outer `cabdfghi` + center `e`; required `bead` + the
 *  nine-tile pangram `abcdefghi`; one bonus word `bcdfge`. Override the mode per
 *  test. */
function loadedGame(over: Partial<WordwheelGame> = {}): WordwheelGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    outer_letters: 'cabdfghi',
    center_letter: 'e',
    required_words_score: 25,
    required_words_count: 2,
    created_at: '2026-01-01T00:00:00Z',
    requiredWords: [
      { word: 'bead', points: 1, is_pangram: false },
      { word: 'abcdefghi', points: 24, is_pangram: true },
    ],
    bonusWords: [{ word: 'bcdfge', points: 6, is_pangram: false }],
    ...over,
  }
}

function loaded(game: WordwheelGame, foundWords: FoundWordRow[] = []): GameHook {
  // See boggle's note: `rowsLoaded` went missing while `GameHook` was
  // hand-written, and `ready` fell back to its `true` default.
  return { game, foundWords, loading: false, rowsLoaded: true, failure: null }
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
  } as unknown as GamePageCtx
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the entry's letters, Backspace and Enter are
 *  bound actions now, and a bare `render` binds them with nothing feeding them
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

/** The outer tiles' letters in the order they are drawn — what the shuffle
 *  rearranges; the center never moves. */
const outerOrder = () =>
  [...document.querySelectorAll('[data-tile]:not([data-center])')].map((t) => t.getAttribute('data-tile'))

/** A trusting-commit success, in the envelope `runRpc` unwraps. `accepted` is
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
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue(acceptedEnvelope) // trusting-commit succeeds by default
  // The edge-fn mock too: its call COUNT would otherwise leak between tests
  // (each New-game test sets its own resolved value, so clearing is safe).
  startEdgeFn.mockReset()
})

describe('wordwheel PlayArea — render smoke', () => {
  it('renders the wheel + RankBar + Stats in coop play', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(document.querySelector('[data-wheel]')).toBeInTheDocument()
    // The center tile, by its data hook — a tile is pointer-only (Tile.tsx), so
    // it wears no ARIA role for a test to hang off.
    expect(document.querySelector('[data-tile][data-center]')).toBeInTheDocument()
    // The WordList rendered (empty during play).
    expect(screen.getByText(/no words yet/i)).toBeInTheDocument()
  })

  it('renders the OpponentStrip (Rank) in compete play', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers, setup: { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } } })} />)
    expect(screen.getByText('Rank:')).toBeInTheDocument()
  })

  it('holds the missed words one select back at terminal, and shows them on ask', async () => {
    // The missed words are in the rows the moment the game ends; the WHO
    // filter's terminal default, Found, is what holds them one select back.
    render(
      <PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'ended' })} />,
    )
    // 'bead' was never submitted, so it is a missed word and not on show.
    expect(screen.queryByText(/bead/i)).toBeNull()

    await pickFilter('Missed', 1) // the WHO select; KIND is 0 on a bonus board
    expect(screen.getByText(/bead/i)).toBeInTheDocument()
  })
})

/**
 * The compete collective losses both land on play_state `lost_compete` and are
 * told apart only by `status.reason` — the two-places trap's third surface
 * (labelFor and the report fixtures assert the club card; nothing else asserts
 * the in-game verdict). These pin buildTerminalMessage to the terminals the server
 * actually writes: common.concede → 'lost_compete' + reason 'conceded',
 * submit_timeout → 'lost_compete' + reason 'timeout'.
 */
describe('wordwheel PlayArea — compete terminal verdicts', () => {
  const competeCtx = (playState: string, reason: string) =>
    makeCtx({
      players: twoMembers,
      isTerminal: true,
      playState,
      status: { reason },
      setup: { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } },
    })

  beforeEach(() => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
  })

  it('all-conceded (lost_compete + reason conceded) says so', () => {
    render(<PlayAreaLoader {...competeCtx('lost_compete', 'conceded')} />)
    expect(screen.getByText('Lost: all conceded')).toBeInTheDocument()
  })

  it('timeout (lost_compete + reason timeout) blames the clock', () => {
    render(<PlayAreaLoader {...competeCtx('lost_compete', 'timeout')} />)
    expect(screen.getByText('Lost: ran out of time')).toBeInTheDocument()
  })

  it('manual end (ended + reason manual) stays neutral', () => {
    render(<PlayAreaLoader {...competeCtx('ended', 'manual')} />)
    expect(screen.getByText(/game ended/i)).toBeInTheDocument()
  })
})

/**
 * The win's confetti fires at the MOMENT the game is won — the playState flip —
 * never on mounting a game already won: the team's in coop, and in a race MY
 * win, read off the server's `status.winner_user_id`. The dialog's handle is
 * its title; the pill and the row's line say the verdict in their own words.
 */
describe('wordwheel PlayArea — the celebration', () => {
  const target = { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } }
  /** My pangram: 24 of the board's 25 points. */
  const myPangram: FoundWordRow = {
    game_id: 'g1', user_id: 'u1', word: 'abcdefghi', points: 24,
    is_pangram: true, is_bonus: false, found_at: '2026-01-01T00:00:01Z',
  }

  it('pops when the coop team crosses its target mid-session', () => {
    const base = { players: twoMembers, setup: target }
    const { rerender } = render(<PlayAreaLoader {...makeCtx(base)} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    h.result = loaded(loadedGame(), [myPangram])
    rerender(<PlayAreaLoader {...makeCtx({ ...base, isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('dialog', { name: 'You win! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('Reached "Amazing" — 24/25 points.')).toBeInTheDocument()
  })

  it('does not pop when mounted into a coop game already won', () => {
    h.result = loaded(loadedGame(), [myPangram])
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers, setup: target, isTerminal: true, playState: 'won' })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pops for the race I won, at the moment it ends', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const base = { players: twoMembers, setup: target }
    const { rerender } = render(<PlayAreaLoader {...makeCtx(base)} />)

    h.result = loaded(loadedGame({ mode: 'compete' }), [myPangram])
    rerender(
      <PlayAreaLoader
        {...makeCtx({ ...base, isTerminal: true, playState: 'won_compete', status: { reason: 'target', winner_user_id: 'u1' } })}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'You win! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('Reached "Amazing" first — 24/25 points.')).toBeInTheDocument()
  })

  it('does not pop for a race somebody else won', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const base = { players: twoMembers, setup: target }
    const { rerender } = render(<PlayAreaLoader {...makeCtx(base)} />)

    rerender(
      <PlayAreaLoader
        {...makeCtx({ ...base, isTerminal: true, playState: 'won_compete', status: { reason: 'target', winner_user_id: 'u2' } })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not pop when mounted into a race I already won', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }), [myPangram])
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: twoMembers, setup: target, isTerminal: true, playState: 'won_compete',
          status: { reason: 'target', winner_user_id: 'u1' },
        })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/**
 * The icon-only action row (the waffle arrangement — labels live in tooltips):
 * one row listing every action, each deciding for itself whether it is on
 * screen. Restart = wordwheel.replay_board (unconfirmed at terminal); New
 * game = the wordwheel-build-board edge function with THIS game's setup/
 * roster/mode, then ctx.goToGame.
 */
describe('wordwheel PlayArea — icon-only action rows', () => {
  it('Restart and New game are menu rows all game, and buttons only at the end', () => {
    const { unmount } = render(<PlayAreaLoader {...makeCtx()} />)
    for (const id of ['act-restart', 'act-new-game'] as const) {
      expect(bound(id).describe('button').state).toBe('hidden')
      expect(bound(id).describe('menu').state).not.toBe('hidden')
    }
    unmount()
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    for (const id of ['act-restart', 'act-new-game'] as const) {
      expect(bound(id).describe('button').state).toBe('active')
    }
  })

  it('playing row offers Back-to-club — the shell action, which knows to suspend', async () => {
    // ONE binding for both rows: it navigates directly at terminal and routes
    // through the suspend-confirm flow mid-game, so the game picks nothing
    // and cannot pick wrong.
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('terminal Restart calls replay_board WITHOUT confirming', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })

  it('terminal "New game" starts a fresh game with this setup/roster/mode', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const user = userEvent.setup()
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<PlayAreaLoader {...ctx} />)
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
      ),
    )
    await waitFor(() =>
      expect(ctx.goToGame).toHaveBeenCalledWith('wordwheel_coop', 'fresh-game-id'),
    )
  })

  it('"New game" after a hand-picked board asks for a random one', async () => {
    // Custom letters are a one-off: the follow-up keeps every other setting and
    // drops the two letter keys, so the edge function takes the random path.
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const user = userEvent.setup()
    const setup = { required: 4, legal: 5, timer: { kind: 'none' }, custom_center: 'e', custom_letters: 'abcdfghi' }
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, playState: 'ended', setup })} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(startEdgeFn).toHaveBeenCalled())
    const sent = startEdgeFn.mock.calls[0]![1].setup
    expect(sent.custom_center).toBeUndefined()
    expect(sent.custom_letters).toBeUndefined()
    expect(sent.required).toBe(4)
  })
})

describe('wordwheel PlayArea — submit behavior (shared useFoundWordSubmit)', () => {
  it('accepts a required word: optimistic pill + submit_word call', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bead{Enter}')
    expect(screen.getByText(/BEAD — \+1/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'submit_word',
      expect.objectContaining({ word: 'bead', points: 1, is_bonus: false, is_pangram: false }),
    )
  })

  it('shows the bonus dot for a bonus word', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bcdfge{Enter}')
    expect(screen.getByText(/BCDFGE • — \+6/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_bonus: true }))
  })

  it('shows the pangram flourish for a pangram', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('abcdefghi{Enter}')
    expect(screen.getByText(/pangram \+24/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_pangram: true }))
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

  it('names the missing center letter (a fitting word still submits + rejects)', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bcdf{Enter}') // valid tiles, but no center 'e' — fits the wheel, so it submits
    // The letter itself, quoted — not the rule ("missing center letter").
    expect(screen.getByText(/missing "E"/)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("shakes the refused word's own tiles, not the wheel, and holds still on an accept", async () => {
    // The shared head-shake, on each face the word used and no other.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const shakingTiles = () =>
      [...document.querySelectorAll('[data-tile]')]
        .filter((t) => (t.firstElementChild?.getAttribute('class') ?? '').includes('verdictShake'))
        .map((t) => t.getAttribute('data-tile'))
    const wheelShakes = () =>
      (document.querySelector('[data-wheel]')?.getAttribute('class') ?? '').includes('verdictShake')

    await user.keyboard('bead{Enter}') // a required word
    expect(shakingTiles()).toEqual([])

    await user.keyboard('bcdf{Enter}') // fits the wheel, but has no center E
    expect(new Set(shakingTiles())).toEqual(new Set(['B', 'C', 'D', 'F']))
    expect(wheelShakes()).toBe(false)
  })

  it('shakes the same tiles again when the same word is refused twice', async () => {
    // A CSS animation plays once per mount, so the word's tiles are keyed on
    // the mark's nonce: a second refusal is a new element, and a new shake.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const tileB = () => document.querySelector('[data-tile="B"]')

    await user.keyboard('bcdf{Enter}')
    const first = tileB()
    await user.keyboard('bcdf{Enter}')
    expect(tileB()).not.toBe(first)
    expect(tileB()?.firstElementChild?.getAttribute('class')).toMatch(/verdictShake/)
  })

  /** The tiles wearing a refused word's answer. */
  const answeredTiles = () =>
    [...document.querySelectorAll('[data-tile]')].filter((t) =>
      (t.getAttribute('class') ?? '').includes('_answered_'),
    )

  // A TOO-SHORT word, deliberately: it is `warning` (lib/answer.ts), and a mark
  // with a default of its own would land on `lost` — the amber is what proves
  // the tiles read the answer.
  it("fills the refused word's tiles in its own outcome, and no others", async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed{Enter}')

    const marked = answeredTiles()
    expect(new Set(marked.map((t) => t.getAttribute('data-tile')))).toEqual(new Set(['B', 'E', 'D']))
    for (const tile of marked) {
      expect(tile.getAttribute('class')).toMatch(/verdictWarning/)
      expect(tile.getAttribute('class')).not.toMatch(/verdictLost/)
    }
  })

  it('fills one tile per use of a letter, never both twins', async () => {
    // Two E tiles (the center and an outer one); the word uses E once, so one
    // tile takes the color — the one a typed E spends, the center.
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed{Enter}')

    const es = answeredTiles().filter((t) => t.getAttribute('data-tile') === 'E')
    expect(es).toHaveLength(1)
    expect(es[0]?.hasAttribute('data-center')).toBe(true)
  })

  it('answers on the twin that was CLICKED, not its sibling', async () => {
    // The refusal is the same question the click answered a beat earlier, so
    // the outer E the player clicked is the E that shakes.
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.click(document.querySelector('[data-tile="E"]:not([data-center])')!)
    await user.keyboard('bd{Enter}')

    const es = answeredTiles().filter((t) => t.getAttribute('data-tile') === 'E')
    expect(es).toHaveLength(1)
    expect(es[0]?.hasAttribute('data-center')).toBe(false)
  })

  it("takes the fill off after the word-answer beat", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed{Enter}')
    expect(answeredTiles()).toHaveLength(3)

    await act(async () => void vi.advanceTimersByTime(WORD_ANSWER_MS + 1))

    expect(answeredTiles()).toEqual([])
    vi.useRealTimers()
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

  it('marks a wheel tile once its letter is in the word (tile-spend rule)', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // `data-spent` is the spent marker (the tiles carry no ARIA role, see
    // Tile.tsx).
    const tile = (letter: string) => document.querySelector(`[data-tile="${letter}"]`)!
    // Before typing: neither the 'B' tile nor the center 'E' tile is spent.
    expect(tile('B')).not.toHaveAttribute('data-spent')
    expect(tile('E')).not.toHaveAttribute('data-spent')
    // Type 'be' → both spent; an untyped tile ('C') is not.
    await user.keyboard('be')
    expect(tile('B')).toHaveAttribute('data-spent', 'true')
    expect(tile('E')).toHaveAttribute('data-spent', 'true')
    expect(tile('C')).not.toHaveAttribute('data-spent')
    // Backspace gives the freed tile back.
    await user.keyboard('{Backspace}') // removes 'e'
    expect(tile('E')).not.toHaveAttribute('data-spent')
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
        .map((t) => t.getAttribute('data-tile'))

    expect(marked()).toEqual([])
    await user.keyboard('be')
    expect(new Set(marked())).toEqual(new Set(['B', 'E']))
    await user.keyboard('{Backspace}')
    expect(marked()).toEqual(['B'])
  })

  it('spends the tile you CLICKED, not its twin', async () => {
    // Typing an 'e' spends the center, because nothing says which E was meant.
    // Clicking the outer one does say, and the board has to answer the question
    // that was actually asked.
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    render(<WithKeys {...makeCtx()} />)
    const centerE = () => document.querySelector('[data-tile="E"][data-center]')!
    const outerE = () => document.querySelector('[data-tile="E"]:not([data-center])')!

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
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    render(<WithKeys {...makeCtx()} />)
    const centerE = () => document.querySelector('[data-tile="E"][data-center]')!
    const outerE = () => document.querySelector('[data-tile="E"]:not([data-center])')!

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
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    render(<WithKeys {...makeCtx()} />)
    const centerE = () => document.querySelector('[data-tile="E"][data-center]')!
    const outerE = () => document.querySelector('[data-tile="E"]:not([data-center])')!

    await user.keyboard('bead{Enter}')
    await user.click(outerE())
    await user.keyboard('{ArrowUp}')
    expect(centerE()).toHaveAttribute('data-spent', 'true')
    expect(outerE()).not.toHaveAttribute('data-spent')
  })

  it('spends duplicate tiles one per occurrence, the center first', async () => {
    const user = userEvent.setup()
    // A wheel where the CENTER letter 'e' is duplicated on an outer tile:
    // typing one 'e' must spend the center (the mandatory-use tile), leaving
    // its outer twin clickable; a second 'e' spends the twin too.
    h.result = loaded(loadedGame({ outer_letters: 'bacdfghe' }))
    render(<WithKeys {...makeCtx()} />)
    // Two tiles share the letter, so the center is told apart by `data-center`.
    const centerE = () => document.querySelector('[data-tile="E"][data-center]')!
    const outerE = () => document.querySelector('[data-tile="E"]:not([data-center])')!
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
})

describe('wordwheel PlayArea — the board goes inert when I can add nothing', () => {
  const conceded = () =>
    makeCtx({
      players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
      setup: { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } },
    })
  /** The tiles the typed word is spending — `data-spent`, see Tile.tsx. */
  const spentTiles = () =>
    [...document.querySelectorAll('[data-tile][data-spent]')].map((t) => t.getAttribute('data-tile'))
  const inertTiles = () =>
    [...document.querySelectorAll('[data-tile]')].filter((t) =>
      (t.getAttribute('class') ?? '').includes('_inert_'),
    )
  /** Tap the tiles for these letters, in order. */
  const tap = async (user: ReturnType<typeof userEvent.setup>, letters: string) => {
    for (const l of letters) await user.click(document.querySelector(`[data-tile="${l}"]`)!)
  }

  it('a conceded racer types nothing: the entry is closed as the engine is', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<WithKeys {...conceded()} />)
    // The keys themselves are closed — the marks alone would not show it, since
    // a read-only board draws none whatever the word holds.
    expect(bound('act-type-letter').describe('key').state).toBe('disabled')
    await user.keyboard('bed')
    expect(spentTiles()).toEqual([])
  })

  it('a tapped tile adds its letter while I can play', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(inertTiles()).toEqual([])
    await tap(user, 'BED')
    expect(new Set(spentTiles())).toEqual(new Set(['B', 'E', 'D']))
  })

  it('a conceded racer\'s wheel is inert: a tap adds nothing', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<WithKeys {...conceded()} />)
    expect(inertTiles()).toHaveLength(9)
    await tap(user, 'BED')
    expect(spentTiles()).toEqual([])
  })

  it('a half-typed word loses its marks when the game ends under it', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<WithKeys {...makeCtx()} />)
    await user.keyboard('bed')
    expect(new Set(spentTiles())).toEqual(new Set(['B', 'E', 'D']))
    rerender(<WithKeys {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    expect(spentTiles()).toEqual([])
  })

  it('a finished game\'s wheel is inert too', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    expect(inertTiles()).toHaveLength(9)
    await tap(user, 'BED')
    expect(spentTiles()).toEqual([])
  })
})

describe('wordwheel PlayArea — coop peer narration (global header)', () => {
  // `usePeerFeedback` seeds the backlog silently on the first loaded render,
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

  it("narrates a teammate's find with the word + points, the actor leading", () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'bead', points: 1 })])
    rerender(<PlayAreaLoader {...ctx} />)
    const feedbackMsg = shown.mock.calls.at(-1)![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('found BEAD +1')
    expect(feedbackMsg.outcome).toBe('won')
  })

  it('adds the pangram flourish for a peer pangram', () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'duplicate', points: 24, is_pangram: true })])
    rerender(<PlayAreaLoader {...ctx} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('pangram 🦌 DUPLICATE +24')
  })

  it('shows the bonus dot after a peer bonus find', () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ word: 'bcdfge', points: 6, is_bonus: true })])
    rerender(<PlayAreaLoader {...ctx} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('found BCDFGE • +6')
  })

  it('does not narrate your own find (that goes to the local slot)', () => {
    const { ctx, shown } = narrationCtx({ players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    h.result = loaded(loadedGame(), [foundRow({ user_id: 'u1', word: 'bead', points: 1 })])
    rerender(<PlayAreaLoader {...ctx} />)
    expect(shown).not.toHaveBeenCalled()
  })
})

describe('wordwheel PlayArea — compete opponent rank climb', () => {
  // The compete channel is a hand-rolled rank-delta detector over
  // `status.leaderboard` (opponents' words are private, so it reads the aggregate
  // rank). It seeds each opponent's rank on the first render, then shows a
  // `peerMilestone` when a rank INCREASES.
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

  it('narrates an opponent reaching a higher rank', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const globalFeedbackSlot = createFeedbackSlot('global')
    const shown = vi.spyOn(globalFeedbackSlot, 'show')
    const props = competeCtx(1, { globalFeedbackSlot })
    const { rerender } = render(<PlayAreaLoader {...props} />)
    // Same slot + players, new leaderboard with u2 climbing 1 → 2.
    rerender(<PlayAreaLoader {...props} status={{ leaderboard: [entry(2)] }} />)
    const feedbackMsg = shown.mock.calls.at(-1)![0]
    expect(feedbackMsg.kind).toBe('peerMilestone')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toMatch(/^reached /)
  })
})

describe('wordwheel PlayArea — concede', () => {
  const competeSetup = { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } }

  it('compete shows Concede and calls wordwheel.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <>
        <PlayAreaLoader {...makeCtx({ players: twoMembers, setup: competeSetup })} />
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
    render(
      <>
        <PlayAreaLoader {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    // The trigger and the modal's confirm share the name "End game" (an
    // icon-only button's label is its accessible name). The confirm is the one
    // the dialog adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'End game' }))
    const confirms = await screen.findAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayAreaLoader
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
      <PlayAreaLoader
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
          setup: competeSetup,
        })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    // Possible here, not right now: the button stays and says why.
    expect(bound('act-concede').describe('button').state).toBe('disabled')
    // The one row always keeps the way out.
    expect(screen.getByRole('button', { name: 'Back to club' })).toBeInTheDocument()
    // Moving on is still a menu thing until the game is over.
    expect(bound('act-restart').describe('button').state).toBe('hidden')
    expect(bound('act-new-game').describe('button').state).toBe('hidden')
  })

  it('distinguishes Quit / Lost / Won at terminal in the strip', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(
      <PlayAreaLoader
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
            winner_user_id: 'u3',
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

/**
 * The keys, through the app-root dispatcher. Each key is a bound action's, so
 * what these pin is the wiring: the chord reaches the binding, the binding asks
 * the registry's question mid-game and skips it at terminal, and the answer
 * runs the same call the button does.
 */
describe('wordwheel PlayArea — the keys', () => {
  const competeSetup = { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } }

  it('+ at terminal starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
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
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('wordwheel_coop', 'fresh-game-id'))
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
        <WithKeys {...makeCtx({ players: twoMembers, setup: competeSetup })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('end_game', expect.anything())
  })

  describe('⌥Z shuffles the outer tiles', () => {
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

    // Awaited: the bound run is async, so the re-order lands a tick after the
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
      render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
      expect(bound('act-shuffle').describe('button').state).toBe('active')
      const before = outerOrder()

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      expect(outerOrder()).not.toEqual(before)
    })
  })

  describe('Restart mid-game', () => {
    // Keyless, so it is fired as the menu row would fire it: the bound run,
    // which is where the registry's question is asked. (The terminal case,
    // where it goes straight through, is under "icon-only action rows".)
    it('asks first, and Keep playing wipes nothing', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayAreaLoader {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => bound('act-restart').run())
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

      act(() => bound('act-restart').run())
      await answer(user, 'Restart')
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    })
  })
})
