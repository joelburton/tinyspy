// cs-unmet

/**
 * Render + behavior tests for boggle's play surface, built from the blob a
 * test's facts would produce (`lib/gameData.fixture.ts`): the tree mounts in
 * every mode and state, and the boggle-specific glue works — the lookup
 * accepts a required or bonus word (the optimistic pill and the `submit_word`
 * call) and refuses a non-legal one with the right reason, on the board as
 * well as in the pill; the trace lights the tiles as a word is typed; the
 * commands and their keys reach their RPCs. The game logic itself is pgTAP's
 * and the lib suites' (the solver, the tracer, the ending sentences); here we
 * cover the composition.
 *
 * `db` and the start-game edge function are mocked so no client or network is
 * needed; everything else — the grid, entry row, word list — renders real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { db } from '../db'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { DEFAULT_BOGGLE_SETUP_COOP } from '../lib/setup'
import {
  ZTest_CONCEDED,
  ZTest_find,
  ZTest_makeBoggleCtx,
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

/** abcd / efgh / ijkl / mnop — sixteen distinct faces. */
const ABCD = [...'abcdefghijklmnop']
/** The required `cat` (membership, not traceability, drives accept) and the
 *  bonus `dog`. */
const WORDS = [ZTest_word('cat', 1), ZTest_word('dog', 2, true)]

const me = (over: Partial<ZTest_PlayerFacts> = {}): ZTest_PlayerFacts => ({ id: 'u1', username: 'me', color: 'red', ...over })
const moth = (over: Partial<ZTest_PlayerFacts> = {}): ZTest_PlayerFacts => ({ id: 'u2', username: 'moth', color: 'blue', ...over })

/** A stopped game: the common ending, every player neutral. */
const STOPPED: Partial<ZTest_GameDataFacts> = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
}

/** The props `<GamePage>` hands the surface, from the game's facts. Coop,
 *  solo, in play, on the abcd board unless said otherwise. */
function makeCtx(
  facts: ZTest_GameDataFacts = {},
  over: Parameters<typeof ZTest_makeBoggleCtx>[1] = {},
): PlayAreaLoaderProps {
  return ZTest_makeBoggleCtx({ letters: ABCD, words: WORDS, ...facts }, over)
}

/** A race between me and moth. */
const race = (facts: ZTest_GameDataFacts = {}): ZTest_GameDataFacts => ({
  mode: 'compete', players: [me(), moth()], ...facts,
})

/** A ctx whose global slot is real, with a spy on its one door. */
function narrationCtx(facts: ZTest_GameDataFacts = {}) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  return { ctx: makeCtx(facts, { globalFeedbackSlot }), shown }
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the entry's letters, Backspace and Enter are
 *  actions, and a bare `render` binds them with nothing feeding them keys. */
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

/** Answer the open question with the button that says `name`. The trigger can
 *  share the modal's words ("Stop game" / "Stop game"); the modal's is the one
 *  the host adds, so it is last in the DOM. */
async function answer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const buttons = await screen.findAllByRole('button', { name })
  await user.click(buttons[buttons.length - 1]!)
}

/** The board's faces in the order they are drawn, row-major. */
const boardFaces = () =>
  [...document.querySelectorAll('[data-tile]')].map((t) => t.textContent)

/** A trusting-commit success, in the envelope `runRpc` unwraps. */
const acceptedEnvelope = {
  data: {
    type: 'ok', data: { result: 'accepted', points: 1 }, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue(acceptedEnvelope) // trusting-commit succeeds by default
  // The edge-fn mock too: its call COUNT would otherwise leak between tests.
  startEdgeFn.mockReset()
})

describe('boggle PlayArea — render smoke', () => {
  /** A state-line label, stacked on two lines ("Req" over "Words"). It renders
   *  TWICE — the info column and the mobile status block above the board. */
  const label = (a: string, b: string) =>
    screen.queryAllByText((_t, el) => el?.textContent === `${a}${b}`, { selector: 'span' })

  it('renders the 4×4 board + all four state-line cells in coop play', () => {
    const { container } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(container.querySelectorAll('[data-tile]')).toHaveLength(16)
    expect(label('Req', 'Words').length).toBeGreaterThan(0)
    expect(label('Req', 'Score').length).toBeGreaterThan(0)
    expect(label('Bonus', 'Words').length).toBeGreaterThan(0)
    expect(label('Bonus', 'Score').length).toBeGreaterThan(0)
  })

  it('draws the Bonus cells even on a board with no bonus words', () => {
    render(<PlayAreaLoader {...makeCtx({ words: [ZTest_word('cat', 1)] })} />)
    expect(label('Bonus', 'Words').length).toBeGreaterThan(0)
  })

  it('renders the OpponentStrip (Score) in compete play', () => {
    render(<PlayAreaLoader {...makeCtx(race())} />)
    expect(screen.getByText('Score:')).toBeInTheDocument()
  })

  it('renders a stopped coop game as a neutral end', () => {
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    expect(screen.getAllByText(/Game ended/).length).toBeGreaterThan(0)
  })

  it('coop: reaching the score target reads as a win, not a neutral end', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: [me({ outcome: 'won', solvedAt: 't' })],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u1' },
          outcome: 'won',
        })}
      />,
    )
    expect(screen.getAllByText(/Target reached/).length).toBeGreaterThan(0)
  })

  it('compete: the crosser sees "You won"', () => {
    render(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'won', finalRanking: 1, solvedAt: 't' }), moth({ outcome: 'lost' })],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u1' },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.getAllByText(/You won/).length).toBeGreaterThan(0)
  })

  it('compete: a beaten racer sees the winner named', () => {
    render(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'lost' }), moth({ outcome: 'won', finalRanking: 1, solvedAt: 't' })],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u2' },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.getAllByText(/moth won/).length).toBeGreaterThan(0)
  })

  it('compete: a race the friends stopped is neutral, whoever was ahead', () => {
    render(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'neutral' }), moth({ outcome: 'neutral' })],
          foundWords: [ZTest_find('u2', 'dog', 2, { bonus: true })],
          ...STOPPED,
        }))}
      />,
    )
    expect(screen.getAllByText('Stopped — no winner').length).toBeGreaterThan(0)
    expect(screen.queryByText(/won$/)).toBeNull()
  })

  it('shows local feedback (and clears the box) for an off-board word', async () => {
    // The board has no Z, so "zzz" is a non-traceable, off-board word that
    // never reaches the server.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('zzz{Enter}')
    expect(screen.getByText(/not on board/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * The confetti, at the MOMENT the win is mine — my outcome turning `won` —
 * never on mounting a game already won.
 */
describe('boggle PlayArea — the celebration', () => {
  const coopWon: ZTest_GameDataFacts = {
    players: [me({ outcome: 'won', solvedAt: 't' }), moth({ outcome: 'won', solvedAt: 't' })],
    foundWords: [ZTest_find('u1', 'cat', 1)],
    ending: { reason: 'reached_goal', detail: 'target', by: 'u1' },
    outcome: 'won',
  }

  it('pops when the coop team reaches its target mid-session', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ players: [me(), moth()] })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<PlayAreaLoader {...makeCtx(coopWon)} />)
    expect(screen.getByRole('dialog', { name: 'Target reached! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('1 words, 1 points.')).toBeInTheDocument()
  })

  it('does not pop when mounted into a game already won', () => {
    render(<PlayAreaLoader {...makeCtx(coopWon)} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pops for a race I won on score when the timer stopped', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx(race())} />)
    rerender(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'won', finalRanking: 1 }), moth({ outcome: 'lost' })],
          ending: { reason: 'timeout', detail: 'timeout', by: null },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'You win! 🎉' })).toBeInTheDocument()
  })

  it('does not pop for a race somebody else won', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx(race())} />)
    rerender(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [me({ outcome: 'lost' }), moth({ outcome: 'won', finalRanking: 1, solvedAt: 't' })],
          ending: { reason: 'reached_goal', detail: 'target', by: 'u2' },
          outcome: 'won',
        }))}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/**
 * The action row's icon-only buttons (labels live in tooltips): Restart =
 * boggle.replay_board (unconfirmed once the game has ended); New game = the
 * boggle-build-board edge function with THIS game's setup, roster and mode.
 */
describe('boggle PlayArea — the action row', () => {
  it('offers Back to club — the shell action, which knows to suspend', async () => {
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('Restart, once the game has ended, calls replay_board WITHOUT confirming', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })

  it('New game starts a fresh game with this setup, roster and mode, rolling a new board', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const user = userEvent.setup()
    const ctx = makeCtx({ ...STOPPED, setup: { ...DEFAULT_BOGGLE_SETUP_COOP, custom_board: 'ABCD-EFGH-IJKL-MNOP' } })
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith('boggle-build-board', {
        target_club: 'testclub',
        setup: { ...DEFAULT_BOGGLE_SETUP_COOP, custom_board: undefined },
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('fresh-game-id'))
  })
})

describe('boggle PlayArea — submit behavior (shared useFoundWordSubmit)', () => {
  it('accepts a required word: optimistic pill + submit_word call', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('cat{Enter}')
    expect(screen.getByText(/CAT — \+1/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_word: 'cat', p_points: 1, p_is_bonus: false })
  })

  it('accepts a bonus word with the trailing dot', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('dog{Enter}')
    expect(screen.getByText(/DOG • — \+2/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ p_is_bonus: true }))
  })

  it('rejects a real-but-untraceable word as "not a word"', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('abe{Enter}') // a(0)→b(1)→e(4): adjacent, traceable, not in the lists
    expect(screen.getByText(/not a word/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * Trace as you type: every letter lights the tiles that could carry it — solid
 * where only one tile can, held back where several can, and never taken away
 * again as the word grows.
 */
describe('boggle PlayArea — trace as you type', () => {
  /** View indices of the tiles wearing one of the two pick marks. The CSS
   *  module hashes a class to `_<name>_<hash>`, so the underscores are what keep
   *  `picked` from also matching `maybePicked`. */
  const wearing = (mark: 'picked' | 'maybePicked') =>
    [...document.querySelectorAll('[data-tile]')]
      .flatMap((t, i) => (t.className.includes(`_${mark}_`) ? [i] : []))

  it('lights the tiles a typed word can only mean one way', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(wearing('picked')).toEqual([])

    // a(0) → f(5) → k(10) is the only run that spells it.
    await user.keyboard('afk')
    expect(wearing('picked')).toEqual([0, 5, 10])
    expect(wearing('maybePicked')).toEqual([])
  })

  it('holds both tiles while a letter is open, and settles the rest around it', async () => {
    // heax / zzar — the A is the choice, and it stays one.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ letters: [...'heaxzzarzzzzzzzz'] })} />)

    await user.keyboard('he')
    expect(wearing('picked')).toEqual([0, 1])
    expect(wearing('maybePicked')).toEqual([])

    await user.keyboard('a')
    expect(wearing('picked')).toEqual([0, 1])
    expect(wearing('maybePicked')).toEqual([2, 6])

    await user.keyboard('r')
    expect(wearing('picked')).toEqual([0, 1, 7])
    expect(wearing('maybePicked')).toEqual([2, 6])
  })

  /** The typed word, character by character, with a `·` under each letter the
   *  board cannot follow (the entry box's dim). */
  const typedWord = () => {
    const spans = [...screen.getByTestId('entry-value').children]
    return spans.map((c) => c.textContent).join('') +
      '/' + spans.map((c) => (c.className.includes('_illegal_') ? '·' : ' ')).join('')
  }

  it('replays the head-shake when the same word is refused twice', async () => {
    // A CSS animation runs once per mount, so the tile has to be REMOUNTED or
    // the second refusal moves nothing. ArrowUp + Enter is how a player gets here.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const tileAt = (i: number) => document.querySelectorAll('[data-tile]')[i]!

    await user.keyboard('abe{Enter}') // traceable, not a word: a(0) b(1) e(4)
    const first = tileAt(0)
    expect(first.className).toContain('verdictShake')

    await user.keyboard('{ArrowUp}{Enter}') // the same word again, inside its beat
    const second = tileAt(0)
    expect(second.className).toContain('verdictShake')
    expect(second).not.toBe(first)
  })

  it('keeps the prefix lit and dims the letter the board cannot follow', async () => {
    // a and c are both on the board but not neighbors, so the path stops after a.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('ac')
    expect(wearing('picked')).toEqual([0])
    expect(typedWord()).toBe('ac/ ·')

    await user.keyboard('e')
    expect(wearing('picked')).toEqual([0])
    expect(typedWord()).toBe('ace/ ··')
  })

  it('a finished board takes no tap, and its tiles wear no hover or press', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(STOPPED)} />)
    const tiles = [...document.querySelectorAll('[data-tile]')]
    // The CSS module hashes a class to `_<name>_<hash>`.
    expect(tiles.every((t) => t.className.includes('_inert_'))).toBe(true)
    await user.click(tiles[0]!)
    expect(tiles[0]!.getAttribute('data-step')).toBeNull()
  })

  it('lights nothing when the first letter is off the board', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('zz')
    expect(wearing('picked')).toEqual([])
    expect(wearing('maybePicked')).toEqual([])
    expect(typedWord()).toBe('zz/··')
  })

  it('goes dark again when the word is submitted', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('afk')
    expect(wearing('picked')).toEqual([0, 5, 10])
    await user.keyboard('{Enter}')
    expect(wearing('picked')).toEqual([])
  })
})

describe('boggle PlayArea — coop peer narration (global header)', () => {
  // `useShowPeerFeedback` seeds the backlog silently on the first render, then
  // shows a header message for each NEW find. So each test renders once, adds
  // a find to the blob, and re-renders, asserting through a spy on `show`.

  it("narrates a teammate's find with the word + points, the actor leading", () => {
    const { ctx, shown } = narrationCtx({ players: [me(), moth()] })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = narrationCtx({ players: [me(), moth()], foundWords: [ZTest_find('u2', 'dog', 2)] })
    rerender(<PlayAreaLoader {...next.ctx} globalFeedbackSlot={ctx.globalFeedbackSlot} />)
    const feedbackMsg = shown.mock.calls.at(-1)![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('found DOG +2')
    expect(feedbackMsg.outcome).toBe('won')
  })

  it('flags a long (7+ letter) find with "wow!"', () => {
    const { ctx, shown } = narrationCtx({ players: [me(), moth()] })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = narrationCtx({ players: [me(), moth()], foundWords: [ZTest_find('u2', 'jackpot', 9)] })
    rerender(<PlayAreaLoader {...next.ctx} globalFeedbackSlot={ctx.globalFeedbackSlot} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('wow! JACKPOT +9')
  })

  it('shows the bonus dot after a bonus find', () => {
    const { ctx, shown } = narrationCtx({ players: [me(), moth()] })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = narrationCtx({ players: [me(), moth()], foundWords: [ZTest_find('u2', 'dog', 2, { bonus: true })] })
    rerender(<PlayAreaLoader {...next.ctx} globalFeedbackSlot={ctx.globalFeedbackSlot} />)
    expect(shown.mock.calls.at(-1)![0].text).toBe('found DOG • +2')
  })

  it('does not narrate your own find (that goes to the local slot)', () => {
    const { ctx, shown } = narrationCtx({ players: [me(), moth()] })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = narrationCtx({ players: [me(), moth()], foundWords: [ZTest_find('u1', 'cat', 1)] })
    rerender(<PlayAreaLoader {...next.ctx} globalFeedbackSlot={ctx.globalFeedbackSlot} />)
    expect(shown).not.toHaveBeenCalled()
  })

  it("stays silent in compete (a rival's finds are private)", () => {
    const { ctx, shown } = narrationCtx(race())
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = narrationCtx(race({ foundWords: [ZTest_find('u2', 'dog', 2)] }))
    rerender(<PlayAreaLoader {...next.ctx} globalFeedbackSlot={ctx.globalFeedbackSlot} />)
    expect(shown).not.toHaveBeenCalled()
  })
})

describe('boggle PlayArea — concede', () => {
  it('compete shows Concede and calls boggle.concede on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx(race())} />
        <ConfirmationHost />
      </>,
    )
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
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    const confirms = await screen.findAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('marks a conceded rival "out" in the strip (mid-game)', () => {
    render(<PlayAreaLoader {...makeCtx(race({ players: [me(), moth(ZTest_CONCEDED)] }))} />)
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows "You conceded" once I concede, and Stop takes Concede\'s place', () => {
    render(<PlayAreaLoader {...makeCtx(race({ players: [me(ZTest_CONCEDED), moth()] }))} />)
    expect(screen.getAllByText('You conceded').length).toBeGreaterThan(0)
    expect(document.querySelector('button[data-action="act-concede"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
  })

  it('distinguishes Conceded / Lost / Won at the end in the strip', () => {
    render(
      <PlayAreaLoader
        {...makeCtx(race({
          players: [
            me({ outcome: 'lost' }),
            moth({ ...ZTest_CONCEDED }),
            { id: 'u3', username: 'cade', color: 'green', outcome: 'won', finalRanking: 1 },
          ],
          foundWords: [ZTest_find('u2', 'dog', 2), ZTest_find('u3', 'cat', 1)],
          ending: { reason: 'timeout', detail: 'timeout', by: null },
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
 * the registry's question mid-game and skips it once the game has ended, and
 * the answer runs the same call the button does.
 */
describe('boggle PlayArea — the keys', () => {
  it('+ once the game has ended starts the next game with no question', async () => {
    startEdgeFn.mockResolvedValue({ type: 'ok', data: { result: 'created', id: 'fresh-game-id' } })
    const ctx = makeCtx(STOPPED)
    render(<WithKeys {...ctx} />)
    press(PLUS)
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'boggle-build-board',
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

  describe('⌥Z rotates the board', () => {
    // A quarter turn of the SAME sixteen faces — the top-left corner takes a
    // different face, and four turns bring the first one back. Awaited: the
    // action's run is async, so the turn lands a tick after the keystroke.
    it('turns the view a quarter, with no round trip', async () => {
      render(<WithKeys {...makeCtx()} />)
      const before = boardFaces()
      expect(before).toHaveLength(16)

      await act(async () => press(OPT_Z))
      const after = boardFaces()
      expect(after).not.toEqual(before)
      expect([...after].sort()).toEqual([...before].sort())
      expect(rpc).not.toHaveBeenCalled()

      for (let turn = 0; turn < 3; turn++) await act(async () => press(OPT_Z))
      expect(boardFaces()).toEqual(before)
    })

    it('keeps a half-tapped word through a turn, on the tiles that spell it', async () => {
      const user = userEvent.setup()
      render(<WithKeys {...makeCtx()} />)
      const tileShowing = (face: string) =>
        [...document.querySelectorAll('[data-tile]')].find((t) => t.textContent === face)!
      await user.click(tileShowing('a'))
      await user.click(tileShowing('f'))

      await act(async () => press(OPT_Z))
      expect(tileShowing('a').getAttribute('data-step')).toBe('1')
      expect(tileShowing('f').getAttribute('data-step')).toBe('2')
      expect(screen.getByTestId('entry-value').textContent).toBe('af')
    })

    it('still works on a finished board — the fidget is deliberate', async () => {
      render(<WithKeys {...makeCtx(STOPPED)} />)
      expect(getAction('act-rotate').describe('button').state).toBe('active')
      const before = boardFaces()

      await act(async () => press(OPT_Z))
      expect(boardFaces()).not.toEqual(before)
    })
  })

  describe('Restart mid-game', () => {
    // Keyless, so it is fired as the menu row would fire it: the action's run,
    // which is where the registry's question is asked.
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
