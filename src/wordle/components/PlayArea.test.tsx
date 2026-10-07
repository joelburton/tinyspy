// cs-blessed-wordle

/**
 * wordle's play surface, mounted for real: does it render in coop, in compete
 * and once the game has ended, and does each surface on it do what its
 * docstring says — the action row per mode and state, Reveal and Hide, the
 * celebration, the peer narration, the picker's labels, the board-scope marks,
 * the flip, and the keys.
 *
 * The smoke cases exist because a removed prop that was still referenced once
 * shipped a BLANK PAGE — a runtime `ReferenceError` that no type check
 * surfaces — and a one-line `render()` catches that class of bug instantly.
 * Game logic is not here: the rules live in pgTAP (the RPCs), and what a move
 * reads as in `lib/answer.test.ts`.
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeWordleCtx`) and nothing
 * is mocked but `db`; everything — the grid, keyboard, lists, dialogs — renders
 * for real.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import {
  ZTest_CONCEDED,
  ZTest_SOLVED_WAITING,
  ZTest_SPENT,
  ZTest_guess,
  ZTest_makeWordleCtx,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import type { GSetup } from '../types'
import { db } from '../db'
import { db as commonDb } from '@/common/supabase/db'
import { PlayAreaLoader } from './PlayArea'
import { filterOptions, pickFilter } from '@/common/lists/filterSelectHelpers'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// The common client is mocked so the reveal tests can assert that NOTHING is
// written when the answer is shown — a wordle-schema spy alone couldn't tell a
// common RPC from no RPC at all.
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const commonRpc = commonDb.rpc as unknown as ReturnType<typeof vi.fn>

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }
const CADE: ZTest_PlayerFacts = { id: 'u3', username: 'cade', color: 'green' }

/** Two club members, both playing. */
const twoMembers = [ME, MOTH]

const T = '2026-09-03T00:00:00Z'

/** The same player, ranked first — `won`, as `_end_game` writes it, having
 *  typed the word. */
const won = (p: ZTest_PlayerFacts): ZTest_PlayerFacts => ({ ...p, outcome: 'won', finalRanking: 1, solvedAt: T })
/** The same player, beaten — `lost`, as `_end_game` writes it. */
const lost = (p: ZTest_PlayerFacts): ZTest_PlayerFacts => ({ ...p, outcome: 'lost' })

/** Me, out of a compete game — solved and waiting on the rest. */
const meOut: ZTest_PlayerFacts = { ...ME, ...ZTest_SOLVED_WAITING }

/** A compete player at the end: their outcome, whether they solved, their
 *  count, and whether the clock broke their tie with the winner. */
function finished(
  p: ZTest_PlayerFacts,
  outcome: 'won' | 'near' | 'lost',
  { solved = outcome !== 'lost', guesses = 3, tie = false } = {},
): ZTest_PlayerFacts {
  return {
    ...p,
    outcome,
    finalRanking: outcome === 'won' ? 1 : outcome === 'near' ? 2 : null,
    solvedAt: solved ? T : null,
    used: guesses,
    tieBrokenByClock: tie,
  }
}

/** The endings the tests reach for, each with the game's outcome beside it. */
type Ending = Pick<ZTest_GameDataFacts, 'ending' | 'outcome'>
const COOP_WON: Ending = {
  ending: { reason: 'reached_goal', detail: 'solved', by: 'u1' },
  outcome: 'won',
}
const COOP_LOST: Ending = {
  ending: { reason: 'resource_exhausted', detail: 'exhausted', by: 'u1' },
  outcome: 'lost',
}
/** A race somebody won: the last racer's act was a solve; `winner` names who. */
const raceWonBy = (winner: string, reason: 'reached_goal' | 'timeout' = 'reached_goal'): Ending => ({
  ending: { reason, detail: reason === 'timeout' ? 'timeout' : 'solved', by: reason === 'timeout' ? null : winner },
  outcome: 'won',
})

/** The solo coop game's two endings, with its one player as the server wrote
 *  them: a solver ranked first, a loser lost. */
const SOLO_WON: ZTest_GameDataFacts = { ...COOP_WON, target: 'crane', players: [won(ME)] }
const SOLO_LOST: ZTest_GameDataFacts = { ...COOP_LOST, target: 'crane', players: [lost(ME)] }

/** A realistic setup blob — the info-column disclosure reads it (a `{}` here
 *  would crash timerLabel, exactly the kind of render bug these tests guard). */
const SETUP: GSetup = { max_guesses: 6, answer_band: 0, legal_band: 4, timer: { kind: 'none' } }

/** A play surface's context: a wordle game, solo coop by default, built from
 *  the facts the way the builder would build it. */
function makeCtx(facts: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeWordleCtx({ setup: SETUP, ...facts })
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: wordle's guess keys are actions, and a
 *  bare `render` binds them with nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What an action says about itself right now. */
const stateOf = (id: string) => getActions().find((action) => action.id === id)?.describe('button').state

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) =>
  document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)!

/** A guess row by me: SLATE against xxgyx is s·l gray, a GREEN, t YELLOW, e
 *  gray. */
const SLATE = ZTest_guess(1, 'u1', 'slate', 'xxgyx')

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  commonRpc.mockReset()
  commonRpc.mockResolvedValue({ error: null })
})

describe('wordle PlayArea — render smoke', () => {
  it('renders the board + an event-log row in coop play', () => {
    // A landed guess exercises the GameEventLog row (squares + who cell), not
    // just the empty state.
    render(<PlayAreaLoader {...makeCtx({ events: [SLATE] })} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  it('renders the board in compete play', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  /**
   * The wiring from a server code to a class key: SLATE against `xxgyx` is s·l
   * gray, a GREEN, t YELLOW, e gray, and all three judged states must reach the
   * DOM at both scopes — the board tile and the key for the same letter.
   *
   * What it does NOT prove is that those classes EXIST in the stylesheets.
   * `vitest.config.ts` sets `css: false`, so a CSS module is a proxy that
   * fabricates `_<key>_<hash>` for whatever key is asked of it — rename
   * `.wordleYellow` out of the stylesheet and this still passes, which was
   * checked rather than assumed. That half is guarded statically, against the
   * files themselves, in shared/wordle-style/tileColor.test.ts.
   */
  it('routes each judged code to its class key, on the board and the keyboard', () => {
    render(<PlayAreaLoader {...makeCtx({ events: [SLATE] })} />)
    const painted = [...screen.getByRole('grid', { name: /board/i }).querySelectorAll('*')]
      .map((el) => el.className)
      .join(' ')
    expect(painted).toMatch(/wordleGreen/)
    expect(painted).toMatch(/wordleYellow/)
    expect(painted).toMatch(/wordleGray/)
    // The keyboard reads the same vocabulary — `Exclude<TileColor, 'blank'>`.
    expect(screen.getByRole('button', { name: /^a$/i }).className).toMatch(/wordleGreen/)
    expect(screen.getByRole('button', { name: /^t$/i }).className).toMatch(/wordleYellow/)
  })

  it('renders an ended game without crashing', () => {
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
    // The info-column outcome line, and — since this is a coop WIN — the answer
    // line with it: solving is the one thing that shows the word unasked.
    expect(screen.getByText('Solved it!')).toBeInTheDocument()
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
  })
})

/**
 * The icon-only action row (labels live in tooltips): ONE row, every action
 * listed once, and which buttons show is each action's own answer — Concede /
 * Stop and Back-to-club (via the shell's suspend-confirm flow, NOT direct
 * navigation) while playing; Reveal, Restart and New game join once the game
 * has ended.
 * New game = a fresh create_game with THIS game's setup/roster/mode (direct RPC
 * — wordle has no edge function), then ctx.goToFollowUpGame.
 */
describe('wordle PlayArea — icon-only action row', () => {
  const getAction = (id: string) => getActions().find((action) => action.id === id)!

  // The row is one list; which buttons are on screen is each action's own
  // answer, and the menu asks the same actions.
  it('Reveal, Restart and New game are menu rows all game, and buttons only at the end', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    for (const id of ['act-reveal', 'act-restart', 'act-new-game'] as const) {
      expect(getAction(id).describe('button').state).toBe('hidden')
      expect(getAction(id).describe('menu').state).not.toBe('hidden')
    }
  })

  it('a racer who is done sees Reveal grayed, Stop, and Back to club', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [meOut, MOTH] })} />)
    expect(screen.getByText('Waiting for others')).toBeInTheDocument()
    // Possible here, not right now: the answer waits for the race to end for
    // everyone, and the tooltip says so.
    expect(getAction('act-reveal').describe('button').state).toBe('disabled')
    expect(control('act-reveal')).toBeDisabled()
    // Out of the race, so conceding is closed and stopping for all is the flag.
    expect(control('act-concede')).not.toBeInTheDocument()
    expect(control('act-stop-game')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to club' })).toBeInTheDocument()
    // Moving on is still a menu thing until the game is over.
    expect(getAction('act-restart').describe('button').state).toBe('hidden')
    expect(getAction('act-new-game').describe('button').state).toBe('hidden')
  })

  it('playing row offers Back-to-club — the shell action, which knows to suspend', async () => {
    // ONE action for both rows: it navigates directly once the game has ended
    // and routes through the suspend-confirm flow mid-game, so the game picks
    // between no callbacks and cannot pick wrong.
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
  })

  it('"Reveal solution" at the end shows the word for ME, with no RPC and no confirm', async () => {
    commonRpc.mockClear()
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // Local state, full stop: the word is on screen immediately, nothing was
    // written, and no peer's board opened. The absent RPCs are the assertion.
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    expect(commonRpc).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides it again, restoring the column as the game ended', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // It wears its other face now — same button, EyeOff glyph, Hide label.
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('SOLVING shows the answer unasked, and the control says it has nothing to do', () => {
    // You can only solve a wordle by typing the answer, so a solver is already
    // looking at it — the info-column line just makes it click-to-define.
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    const reveal = screen.getByRole('button', { name: 'Solution already shown' })
    expect(reveal).toBeDisabled()
  })

  it('a game I did NOT solve still waits to be asked', () => {
    // The predicate is "did I solve it", never "was the game won" — which is
    // the whole difference in compete, where the game's `won` means SOMEONE won
    // and the player three guesses off never produced the word.
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ...raceWonBy('u2'),
          target: 'crane',
          players: [finished(ME, 'lost'), finished(MOTH, 'won')],
        })}
      />,
    )
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('the ending\'s "New game" button starts a fresh game with this setup/roster/mode', async () => {
    // `createNewGame` calls db.rpc('create_game', …), which answers the
    // envelope itself as one jsonb value (no `.single()`) — mocked for this
    // call only.
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve({
            data: { type: 'ok', data: { result: 'created', id: 'next-game-id' } },
            error: null,
          })
        : Promise.resolve({ error: null }),
    )
    const user = userEvent.setup()
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        p_club_handle: 'testclub',
        p_setup: SETUP,
        p_player_user_ids: ['u1'],
        p_mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })
})

/**
 * The ending (the waffle treatment — docs/ui.md → Endings). No
 * modal carries the verdict; a win pops the CelebrationBlockingModal at the
 * MOMENT it lands (the ending arriving) — the team's in coop, mine in compete —
 * never on mounting an already-won game. And the word stays HIDDEN in a
 * game this viewer did not solve until they ask for it — a local,
 * reversible display toggle (useSolutionReveal), no RPC and no peer affected.
 */
describe('wordle PlayArea — the ending', () => {
  /** The game sections most recently pushed to the menu, as the ROWS the menu
   *  would draw — a row is an action now, so its words, glyph and
   *  availability come from the action rather than from the list. */
  const menuItems = (ctx: PlayAreaLoaderProps) => {
    const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
    const sections = (calls.at(-1)![0] ?? []) as MenuSection[]
    return sections.flatMap((s) => s.items).map(menuRow)
  }

  it('hides the word on a coop loss (and pops no modal)', () => {
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)
    expect(screen.getByText('Out of guesses')).toBeInTheDocument()
    // The target is on the client (the blob carries it once the game ends)
    // but NOT displayed.
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
    expect(screen.queryByText('Game over')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the menu item is the same toggle, and flips its label with the button', async () => {
    commonRpc.mockClear()
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)

    const reveal = menuItems(ctx).find((i) => i.id === 'act-reveal')!
    expect(reveal.disabled).toBeFalsy() // ended → offered
    expect(reveal.label).toBe('Reveal solution')
    act(() => reveal.run())
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)
    // The menu is rebuilt on the state flip, so the item now offers the way
    // back.
    await waitFor(() =>
      expect(menuItems(ctx).find((i) => i.id === 'act-reveal')!.label).toBe('Hide solution'),
    )
    // No RPC: this is local display state, not a game move.
    expect(commonRpc).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the menu item is disabled before the game is over for everyone', () => {
    const ctx = makeCtx({ mode: 'compete', players: twoMembers })
    render(<PlayAreaLoader {...ctx} />)
    // Nothing to show yet: the builder withholds the target until the race is
    // over for everyone, so a player who's done can't peek at a live one.
    expect(menuItems(ctx).find((i) => i.id === 'act-reveal')!.disabled).toBe(true)
  })

  it('a Restart puts the answer away again', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(screen.getAllByText(/CRANE/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    // The same word, hunted again — and the answer is gone from the client with
    // it, since the builder stops writing a target the run has not finished.
    rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.queryByText(/CRANE/)).not.toBeInTheDocument()
  })

  it('"Restart" once the game has ended calls replay_board WITHOUT confirming', async () => {
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)

    act(() => menuItems(ctx).find((i) => i.id === 'act-restart')!.run())
    // No ConfirmationHost is mounted, so a question would have stalled the run
    // — the RPC firing proves the shared run asked nothing once the game had
    // ended.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })

  it('offers Restart in the ending\'s row (left of Club), calling replay_board unconfirmed', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    const restart = screen.getByRole('button', { name: 'Restart' })
    const club = screen.getByRole('button', { name: /club/i })
    expect(restart.compareDocumentPosition(club) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(restart)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })

  it('pops the celebration when the coop win lands mid-session, not on mount', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The winning guess arrives: the game's ending lands in the blob, and every
    // player of the team comes out `won`.
    rerender(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    expect(screen.getByRole('dialog', { name: 'Solved! 🎉' })).toBeInTheDocument()
  })

  it('does not celebrate when mounted into an already-won game', () => {
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // The winner celebrates too — MY win, read off my own outcome, never
  // "someone won". The dialog's handle is its title: the pill and the row's
  // line say the verdict in their own words.
  it('celebrates the compete game I won, at the moment it ends', () => {
    const { rerender } = render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />,
    )

    rerender(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ...raceWonBy('u1'),
          target: 'crane',
          players: [finished(ME, 'won'), finished(MOTH, 'lost')],
        })}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Solved! 🎉' })).toBeInTheDocument()
    expect(screen.getByText('You solved it in the fewest guesses.')).toBeInTheDocument()
    expect(screen.getByText('You won!')).toBeInTheDocument()
  })

  it('does not celebrate a compete game somebody else won', () => {
    const { rerender } = render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />,
    )

    rerender(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ...raceWonBy('u2'),
          target: 'crane',
          players: [finished(ME, 'lost'), finished(MOTH, 'won')],
        })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Opponent won')).toBeInTheDocument()
  })

  it('does not celebrate when mounted into a compete game already won', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ...raceWonBy('u1'),
          target: 'crane',
          players: [finished(ME, 'won'), finished(MOTH, 'lost')],
        })}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Two solvers on the same count, the earlier solve the winner: the server
  // marks both players' `tieBrokenByClock`, and each reads it from their own
  // side.
  it('a tie on guesses reads as the clock deciding it, on both sides', () => {
    const tied = (myOutcome: 'won' | 'near') =>
      makeCtx({
        mode: 'compete',
        ...raceWonBy(myOutcome === 'won' ? 'u1' : 'u2'),
        target: 'crane',
        players: [
          finished(ME, myOutcome, { tie: true }),
          finished(MOTH, myOutcome === 'won' ? 'near' : 'won', { tie: true }),
        ],
      })
    const { rerender } = render(<PlayAreaLoader {...tied('near')} />)
    expect(screen.getByText('Lost: beaten on the clock')).toBeInTheDocument()
    expect(screen.getByText('Opponent won (faster)')).toBeInTheDocument()

    rerender(<PlayAreaLoader {...tied('won')} />)
    expect(screen.getByText('Won: same guesses, but faster')).toBeInTheDocument()
    expect(screen.getByText('You won (faster)')).toBeInTheDocument()
  })

  // A game the clock ended with a solver: the player still guessing reads that
  // time ran out, from the server's reason and their own unsolved row — not
  // "beaten on guesses", a count they never finished.
  it('a timed-out game tells the player still guessing that time ran out', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ...raceWonBy('u2', 'timeout'),
          target: 'crane',
          players: [finished(ME, 'lost'), finished(MOTH, 'won')],
        })}
      />,
    )
    expect(screen.getByText('Lost: time ran out')).toBeInTheDocument()
    expect(screen.getByText('Opponent won')).toBeInTheDocument()
  })

  // THE WIRE, end to end: the verdict names the reason the SERVER wrote, not
  // one the page infers from its own clock. An all-conceded game is the case
  // where the two part company — the clock never ran out, so a clock-reading
  // verdict has nothing to say and falls back to "Nobody solved".
  it('an all-conceded game reads the ending\'s reason, with the clock still running', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          ending: { reason: 'conceded', detail: 'conceded', by: 'u2' },
          outcome: 'lost',
          target: 'crane',
          players: [{ ...ME, ...ZTest_CONCEDED }, { ...MOTH, ...ZTest_CONCEDED }],
        })}
      />,
    )
    expect(screen.getByText('All conceded — no winner')).toBeInTheDocument()
    expect(screen.getByText('All conceded')).toBeInTheDocument()
  })
})

/**
 * Input-gating characterization. The board-gate prop (`readOnly`) controls
 * whether the on-screen keyboard accepts input. Pinning the OBSERVABLE effect —
 * keyboard enabled during play, disabled once the game has ended — so a
 * polarity flip that inverts the gate fails here instead of silently shipping
 * (the unit suite otherwise barely exercises gating).
 */
describe('wordle PlayArea — input gating', () => {
  // The on-screen keyboard's 'A' key (letter buttons carry aria-label={ch};
  // board tiles aren't buttons, so this is unambiguous).
  const keyboardKey = () => screen.getByRole('button', { name: /^a$/i })

  it('the on-screen keyboard accepts input during play', () => {
    render(<PlayAreaLoader {...makeCtx()} />) // playing, self is a player → gate open
    expect(keyboardKey()).toBeEnabled()
  })

  it('the on-screen keyboard is blocked once the game has ended', () => {
    render(<PlayAreaLoader {...makeCtx(SOLO_WON)} />) // gate closed
    expect(keyboardKey()).toBeDisabled()
  })
})

describe('wordle PlayArea — peer narration (global header)', () => {
  /** A real global slot with a spy on its one door, handed to the ctx. */
  function narrationCtx(facts: ZTest_GameDataFacts = {}) {
    const globalFeedbackSlot = createFeedbackSlot('global')
    const shown = vi.spyOn(globalFeedbackSlot, 'show')
    const ctx = (more: ZTest_GameDataFacts = {}) =>
      ZTest_makeWordleCtx({ setup: SETUP, players: twoMembers, ...facts, ...more }, { globalFeedbackSlot })
    return { ctx, shown }
  }

  it("announces a teammate's accepted guess in coop", () => {
    const { ctx, shown } = narrationCtx()
    // First render seeds the seen-set with my own guess (no announcement).
    const mine = ZTest_guess(1, 'u1', 'slate', 'xxxxx')
    const { rerender } = render(<PlayAreaLoader {...ctx({ events: [mine] })} />)
    shown.mockClear()
    // A teammate's guess lands → narrated in the header, the actor leading.
    rerender(<PlayAreaLoader {...ctx({ events: [mine, ZTest_guess(2, 'u2', 'crane', 'ggggg')] })} />)
    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('guessed CRANE')
  })

  it('does not narrate my own guess', () => {
    const { ctx, shown } = narrationCtx()
    const { rerender } = render(<PlayAreaLoader {...ctx()} />)
    shown.mockClear()
    rerender(<PlayAreaLoader {...ctx({ events: [ZTest_guess(1, 'u1', 'slate', 'xxxxx')] })} />)
    expect(shown).not.toHaveBeenCalled()
  })

  it('announces an opponent solving in compete', () => {
    const { ctx, shown } = narrationCtx({ mode: 'compete' })
    // First render seeds: nobody solved yet.
    const { rerender } = render(<PlayAreaLoader {...ctx()} />)
    shown.mockClear()
    // moth solves → narrated (the only peer event compete can surface).
    rerender(<PlayAreaLoader {...ctx({ players: [ME, { ...MOTH, ...ZTest_SOLVED_WAITING }] })} />)
    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.actor?.username).toBe('moth')
    expect(feedbackMsg.text).toBe('solved it')
    // Green — a solve is a solve regardless of whose (the outcome follows the
    // event).
    expect(feedbackMsg.outcome).toBe('won')
    // A solve is where the peer STANDS, not a move of theirs, so it outranks
    // the guess narration above and a chat line.
    expect(feedbackMsg.kind).toBe('peerMilestone')
  })
})

describe('wordle PlayArea — opponent picker (compete)', () => {
  it('shows "hidden until game ends" when an opponent is picked during play', async () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    // Defaults to my own (empty) board.
    expect(screen.getByText('No guesses yet.')).toBeInTheDocument()
    // Pick the opponent → their guesses are withheld until the game ends.
    await pickFilter('moth')
    expect(screen.getByText('Hidden until game ends.')).toBeInTheDocument()
  })
})

describe('wordle PlayArea — event-log picker label', () => {
  it('names the player by HANDLE in a solo game, even when it’s you', async () => {
    // makeCtx defaults to viewer u1 as the only player. The shared vocabulary
    // names everyone the same way — "You" made your own row read as a different
    // KIND of thing from everyone else's (useEventLogPlayerPicker).
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(await filterOptions()).toContain('me')
    expect(await filterOptions()).not.toContain('You')
    // No aggregate in a solo game — "Team" of one is the same list twice.
    expect(await filterOptions()).not.toContain('Team')
  })

  it('shows "Team" AND each player in a multi-player coop game', async () => {
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    expect(await filterOptions()).toContain('Team')
    // Per-player entries pull one thread out of the shared log.
    expect(await filterOptions()).toContain('moth')
  })
})

describe('wordle PlayArea — concede', () => {
  it('compete shows Concede and calls wordle.concede on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />
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
    // The trigger and the modal's confirm share the name "Stop game" (the
    // button's label is the full phrase, since icon-only buttons make the label
    // the accessible name). The confirm is the one the dialog
    // adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    const confirms = await screen.findAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip', () => {
    render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [ME, { ...MOTH, ...ZTest_CONCEDED }] })} />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('marks an opponent out of guesses "out", and shows a waiting solver\'s count', () => {
    const outOfGuesses: ZTest_PlayerFacts = { ...MOTH, ...ZTest_SPENT, used: 6 }
    const solvedWaiting: ZTest_PlayerFacts = { ...CADE, ...ZTest_SOLVED_WAITING, used: 3 }
    render(
      <PlayAreaLoader
        {...makeCtx({ mode: 'compete', players: [ME, outOfGuesses, solvedWaiting] })}
      />,
    )
    // One "out": the player who ran out. The solver may yet win, so shows 3.
    expect(screen.getAllByText('out')).toHaveLength(1)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows the "You conceded" line after I concede', () => {
    render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

describe('wordle PlayArea — physical keyboard (shared useCaptureKeys)', () => {
  it('builds a guess from window keydowns and submits it on Enter', async () => {
    rpc.mockResolvedValue({ data: { result: 'incorrect' }, error: null })
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // Typed with nothing focused, so the keys go to the window — which is where
    // the one dispatcher listens. (`userEvent`, not `fireEvent`: each letter is
    // an action's run, and the entry has to re-render between them.)
    await user.keyboard('crane{Enter}')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: 'crane' }),
    )
  })

  it('sends nothing on a second Enter while the first guess is still out', async () => {
    // The answer never comes, so the guess stays out for the rest of the test.
    rpc.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('crane{Enter}')
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    await user.keyboard('{Enter}')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('ignores keystrokes aimed at a focused text field (chat isolation)', () => {
    render(<WithKeys {...makeCtx()} />)
    const input = document.createElement('input')
    document.body.append(input)
    for (const key of ['c', 'r', 'a', 'n', 'e', 'Enter']) fireEvent.keyDown(input, { key })
    expect(rpc).not.toHaveBeenCalled() // typing in an input never reaches the board
    input.remove()
  })

  it('has NO ArrowUp-recall / ArrowDown-clear (wordle wires no arrows)', async () => {
    rpc.mockResolvedValue({ data: { result: 'incorrect' }, error: null })
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('crane')
    // Where the arrows are wired, ArrowDown would clear the entry; here it must
    // do nothing, so Enter still submits the intact "crane".
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: 'crane' }),
    )
  })
})

describe('wordle PlayArea — click-to-define (event log)', () => {
  it('makes each logged guess a define affordance on the WORD (not the cell)', () => {
    render(<PlayAreaLoader {...makeCtx({ events: [ZTest_guess(1, 'u1', 'slate', 'xxxxx')] })} />)
    // The event-log guess carries the click-to-define affordance, and it rides
    // the whole five-letter word (one define per guess), not an individual
    // cell.
    const define = screen.getByTitle('Click to define')
    expect(define).toHaveTextContent('SLATE')
    // POINTER-ONLY: not a tab stop and not announced as a control. Definitions
    // are a convenience on a word you're already pointing at, and the page's
    // tab ring is empty anyway (common/core-css/utilities.css → `.definable`).
    expect(define).not.toHaveAttribute('role')
    expect(define).not.toHaveAttribute('tabindex')
  })
})

describe('wordle PlayArea — the board-scope marks', () => {
  const board = () => screen.getByRole('grid', { name: /board/i })
  const keyboard = () => screen.getByLabelText('Keyboard')

  // What these pin is the board-scope marks (common/board-marks/doc.md). None
  // of it is game logic, and all of it is invisible to a type check: a mark
  // that stops being applied looks exactly like a mark that was never asked
  // for.
  it('bands the finished board in its outcome and disables the keyboard', () => {
    render(<PlayAreaLoader {...makeCtx({ ...SOLO_WON, events: [ZTest_guess(1, 'u1', 'crane', 'ggggg')] })} />)

    expect(board().className).toMatch(/endingFrame/)
    expect(board().className).toMatch(/endingFrame_won/)

    // The keyboard STAYS, disabled: its caps hold the color every letter
    // earned, which is the record of the game just played. Both halves are
    // pinned, since a keyboard that is present but still typable would pass the
    // first assertion alone.
    expect(keyboard()).toBeInTheDocument()
    for (const cap of within(keyboard()).getAllByRole('button')) {
      expect(cap).toBeDisabled()
    }
  })

  it('bands a lost board in the losing tone', () => {
    render(<PlayAreaLoader {...makeCtx({ ...SOLO_LOST, events: [SLATE] })} />)

    expect(board().className).toMatch(/endingFrame_lost/)
    expect(board().className).not.toMatch(/endingFrame_won/)
  })

  it('leaves a live board unmarked, with a usable keyboard', () => {
    render(<PlayAreaLoader {...makeCtx()} />)

    expect(board().className).not.toMatch(/endingFrame/)
    expect(within(keyboard()).getByRole('button', { name: /^a$/i })).toBeEnabled()
  })

  it('shows the typing help only on my move', () => {
    const help = () => screen.queryByText('Type a 5-letter word, then Enter.')
    const { rerender } = render(
      <PlayAreaLoader {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />,
    )
    expect(help()).not.toBeInTheDocument()
    rerender(<PlayAreaLoader {...makeCtx({ turnHolderId: 'u1', players: twoMembers })} />)
    expect(help()).toBeInTheDocument()
  })

  it('dims the board while a teammate holds the move', () => {
    render(<PlayAreaLoader {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />)

    expect(board().className).toMatch(/dimNotYourTurn/)
    // The turn arriving is an EVENT, so it must not fire on mount — a player
    // opening a game on their own turn hasn't just been handed it.
    expect(board().className).not.toMatch(/yourTurnFlash/)
  })

  it('flashes the frame at the moment the turn becomes mine', async () => {
    const { rerender } = render(
      <PlayAreaLoader {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />,
    )
    expect(board().className).not.toMatch(/yourTurnFlash/)

    rerender(<PlayAreaLoader {...makeCtx({ turnHolderId: 'u1', players: twoMembers })} />)

    expect(board().className).toMatch(/yourTurnFlash/)
    expect(board().className).not.toMatch(/dimNotYourTurn/)
  })
})

describe('wordle Board — the reveal flip', () => {
  const tiles = () => screen.getAllByRole('gridcell')
  const slate = SLATE
  const moths = ZTest_guess(2, 'u1', 'moths', 'xxyxg')
  const crane = ZTest_guess(3, 'u1', 'crane', 'xxxxg')

  // A row already on the board when it mounted arrived before anyone was
  // watching, so it draws settled; a row that lands during the session flips.
  // No restart case here on purpose: a Restart remounts the whole surface, so
  // the replayed game's first row is a landing on a fresh board like any other.
  it('flips a row that lands while watching, not the rows present at mount', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ events: [slate] })} />)
    expect(tiles()[0].className).not.toMatch(/reveal/)

    rerender(<PlayAreaLoader {...makeCtx({ events: [slate, moths] })} />)

    expect(tiles()[0].className).not.toMatch(/reveal/)
    expect(tiles()[5].className).toMatch(/reveal/)
  })

  // Opening a past turn draws its snapshot in place of the live rows, so coming
  // back mounts them fresh. A row that already flipped must not flip again; one
  // that landed while the player was away still does.
  it('does not flip a row again on the way back from a past turn', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)
    rerender(<PlayAreaLoader {...makeCtx({ events: [slate, moths] })} />)
    expect(tiles()[0].className).toMatch(/reveal/) // both landed while watching

    fireEvent.click(screen.getByText('#1'))
    rerender(<PlayAreaLoader {...makeCtx({ events: [slate, moths, crane] })} />) // lands while I'm away
    fireEvent.click(screen.getByRole('button', { name: 'Exit history' }))

    expect(tiles()[0].className).not.toMatch(/reveal/)
    expect(tiles()[5].className).not.toMatch(/reveal/)
    expect(tiles()[10].className).toMatch(/reveal/)
  })
})

/**
 * A player who has SOLVED the word and is waiting for the others has ended,
 * with a win maybe banked: conceding could only throw
 * it away. Their one flag is Stop for all.
 */
describe('wordle PlayArea — a solved player cannot concede', () => {
  it('solved and waiting: the flag is Stop, not Concede', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [meOut, MOTH] })} />)
    expect(screen.getByText('Waiting for others')).toBeInTheDocument()
    expect(stateOf('act-concede')).toBe('hidden')
    expect(stateOf('act-stop-game')).toBe('active')
  })

  it('still racing: Concede is live', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    expect(stateOf('act-concede')).toBe('active')
    expect(control('act-concede')).toBeEnabled()
  })
})

/**
 * The commands through the dispatcher: `+`, `⌥⌫` and Restart, with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('wordle PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ once the game has ended starts the follow-up game with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ error: null }),
    )
    const ctx = makeCtx(SOLO_LOST)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', expect.objectContaining({ p_mode: 'coop' })),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and cancel starts nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: '+' })
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    await waitFor(() => expect(screen.queryByText('Start a new game?')).not.toBeInTheDocument())
    expect(rpc).not.toHaveBeenCalledWith('create_game', expect.anything())
  })

  it('⌥⌫ in coop asks Stop game’s question; yes calls stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = screen.getAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('Restart mid-game asks before wiping the board', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const ctx = makeCtx()
    render(
      <>
        <PlayAreaLoader {...ctx} />
        <ConfirmationHost />
      </>,
    )
    const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
    const sections = (calls.at(-1)![0] ?? []) as MenuSection[]
    const restart =
      sections.flatMap((s) => s.items).map(menuRow).find((r) => r.id === 'act-restart')!
    act(() => restart.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * The two on-screen caps that ARE actions. ⌫ and Enter take what they do from
 * the same two actions the physical keys fire, so a cap and its key cannot
 * disagree about whether the move is available — on an empty guess, both gray.
 */
describe('wordle PlayArea — the ⌫ and Enter caps follow the entry', () => {
  it('gray with nothing typed, live once letters land', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(control('act-delete-last')).toBeDisabled()
    expect(control('act-submit')).toBeDisabled()

    await user.keyboard('cr')
    expect(control('act-delete-last')).toBeEnabled()
    expect(control('act-submit')).toBeEnabled()
  })
})

describe('wordle Board — the refusal mark', () => {
  const rows = () => screen.getAllByRole('row')
  /** The active typing row: the one after every submitted guess. */
  const activeRow = (submitted: number) => rows()[submitted]

  /** A soft reject from `submit_guess` — the rules ran and burned no guess. */
  const softReject = (result: 'duplicate' | 'notAWord') =>
    rpc.mockResolvedValue({
      data: { data: { n_guesses_used: 0, result, solved: false, game_ended: false }, type: 'ok' },
      error: null,
    })

  // A DUPLICATE, deliberately: `not_a_word` is `lost` and `duplicate` is
  // `warning` (lib/answer.ts), and `lost` is what a mark with a default of its
  // own would land on. Asserting the amber is what proves the ring reads the
  // answer rather than a seed — a case pinned with the red passes either way.
  it("rings the active row in the refusal's own outcome, not a default", async () => {
    softReject('duplicate')
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(activeRow(0).className).not.toMatch(/verdictRing/)

    await user.keyboard('crane{Enter}')

    await waitFor(() => expect(activeRow(0).className).toMatch(/verdictRing/))
    expect(activeRow(0).className).toMatch(/verdictWarning/)
    expect(activeRow(0).className).not.toMatch(/verdictLost/)
  })

  it('takes itself off after the word-answer beat', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    softReject('duplicate')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WithKeys {...makeCtx()} />)

    await user.keyboard('crane{Enter}')
    await waitFor(() => expect(activeRow(0).className).toMatch(/verdictWarning/))

    await act(async () => void vi.advanceTimersByTime(WORD_ANSWER_MS + 1))

    expect(activeRow(0).className).not.toMatch(/verdictRing/)
    vi.useRealTimers()
  })
})
