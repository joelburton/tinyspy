// cs-blessed-connections

/**
 * connections' PlayArea, mounted for real — the board, the strip, the event
 * log and the action row — with the picks and `db` mocked, so no client or
 * network is needed. `gd` itself is built by the real `makeGameData` from the
 * `game_data` blob a test's facts would produce (`lib/gameData.fixture.ts`),
 * so a player's counts, ending and outcome are set as facts and the matched
 * bands come from the guess log as they do in the app.
 *
 * What is pinned here is the surface's behavior: Concede vs Stop per mode,
 * the ended board and the reveal, the celebration, the board-scope marks,
 * whose pick is ringed, the marks on a guess and the three ways one ends,
 * attention on a band, every key and action-row face per asker, and the
 * keyboard's selection cursor. Game logic is pgTAP's (the RPCs) and
 * `evaluate.test.ts`'s.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { ATTENTION_FADE_MS } from '@/common/board-marks/feedbackTiming'
import {
  ZTest_CONCEDED,
  ZTest_ELIMINATED,
  ZTest_PUZZLE,
  ZTest_guess,
  ZTest_makeConnectionsCtx,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import { unionTiles } from '../lib/picks'
import type { GEventRaw, GPickMap } from '../types'
import { db } from '../db'
import { PlayAreaLoader } from './PlayArea'

// A mutable holder: the log a test's game carries, and the picks standing in
// for the hook's Broadcast state, with the two senders as spies. Set per test
// before render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock`
// factory, so the factory can close over it safely.
const h = vi.hoisted(() => ({
  events: [] as GEventRaw[],
  picks: new Map() as GPickMap,
  toggleTile: vi.fn(),
  sendClear: vi.fn(),
}))
// `gd` is the real one, from the blob; only the picks are the test's.
vi.mock('../hooks/usePicks', () => ({
  usePicks: () => {
    const tileToPickerId = new Map<string, string>()
    for (const [userId, tiles] of h.picks) for (const tile of tiles) tileToPickerId.set(tile, userId)
    const union = unionTiles(h.picks)
    return {
      byUser: h.picks,
      union,
      isComplete: union.length === 4,
      tileToPickerId,
      toggleTile: h.toggleTile,
      sendClear: h.sendClear,
    }
  },
}))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** What `submit_guess` answers on an accepted move. `runRpc` reads the ENVELOPE
 *  out of `data` now, so a mock resolving `{ error: null }` alone hands it a
 *  body it can't read and the call site sees a fault.
 *
 *  `data.result` NAMES THE CASE, in the wire words the column stores, and the
 *  envelope carries no outcome — what a case is worth is `lib/answer.ts`'s.
 *  These tests submit a wrong guess the server recorded; an answer that wrote
 *  nothing comes back as a RACE (PN300 / PN301), not as an `ok`. */
const okEnvelope = {
  data: {
    type: 'ok', data: { result: 'wrong' }, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
}

/** The fixture puzzle's RED category, rank 0. */
const RED = ZTest_PUZZLE.cats[0]!

/** The log of the game the next `makeCtx` builds; empty unless a test hands it
 *  rows. Resets the picks too, so each test starts from a live, empty board. */
function loaded(events: GEventRaw[] = [], picks: GPickMap = new Map()): void {
  h.events = events
  h.picks = picks
}

/** The RED band, matched by `userId`. */
const matchRed = (userId = 'u1') => ZTest_guess(userId, RED.tiles, 'correct', 0)
/** A plain wrong guess (2 from RED + 1 GREEN + 1 BLUE) by `userId`. */
const wrongGuess = (userId = 'u1') => ZTest_guess(userId, ['a', 'b', 'e', 'i'], 'wrong')
/** Every band, matched by `userId`. */
const allFour = (userId = 'u1') =>
  ZTest_PUZZLE.cats.map((c) => ZTest_guess(userId, c.tiles, 'correct', c.rank))
/** Four picks on the board, one short of nothing: a full guess built and unsent. */
const FOUR_PICKED: GPickMap = new Map([['u1', ['a', 'b', 'e', 'i']]])

/** A player, playing. */
const player = (id: string, username: string, color: string): ZTest_PlayerFacts => ({ id, username, color })
/** A conceder. */
const conceded = (id: string, name: string, color: string): ZTest_PlayerFacts =>
  ({ ...player(id, name, color), ...ZTest_CONCEDED })

/** The endings the tests reach for, each with the game's outcome beside it. */
type Ending = Pick<ZTest_GameDataFacts, 'ending' | 'outcome'>
const COOP_LOST: Ending = {
  ending: { reason: 'resource_exhausted', detail: 'mistakes', by: 'u1', winner: null },
  outcome: 'lost',
}
const SOMEONE_WON: Ending = {
  ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' },
  outcome: 'won',
}
const ALL_CONCEDED: Ending = {
  ending: { reason: 'conceded', detail: 'conceded', by: 'u2', winner: null },
  outcome: 'lost',
}

/** The facts a test sets up: the game's, with its ending as one value. */
type CtxFacts = Omit<ZTest_GameDataFacts, 'events' | 'ending' | 'outcome'> & { gameEnding?: Ending }

/** A play surface's context: a connections game, solo coop by default, on the
 *  log `loaded()` set, with where I stand derived from the facts. */
function makeCtx(over: CtxFacts = {}): PlayAreaLoaderProps {
  const { gameEnding, ...facts } = over
  return ZTest_makeConnectionsCtx({
    events: h.events,
    ...gameEnding,
    ...facts,
  })
}

/** Me, out of the race on my fourth mistake while the others play on. */
const meOut: ZTest_PlayerFacts = { ...player('u1', 'me', 'red'), ...ZTest_ELIMINATED }

const twoMembers = [player('u1', 'me', 'red'), player('u2', 'moth', 'blue')]

/** A coop team that lost on the mistakes: the game ended, every player lost. */
const coopLost = (players: ZTest_PlayerFacts[] = [player('u1', 'me', 'red')]) =>
  makeCtx({
    gameEnding: COOP_LOST,
    players: players.map((p) => ({ ...p, outcome: 'lost' })),
  })

/** `okEnvelope` carrying a different `data` — for the calls whose ok is not a
 *  recorded guess (the next-puzzle preview, create_game). */
const ok = (data: unknown) => ({ ...okEnvelope, data: { ...okEnvelope.data, data } })

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
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

/** The Reveal control, by WHICH command it is: its words move with the toggle
 *  ("Reveal solution" / "Hide solution"), so they are the wrong handle
 *  wherever the words are not the subject. Keeps the role — a menu row would
 *  carry the same id. */
const revealButton = () =>
  screen.queryAllByRole('button').find((b) => b.dataset.action === 'act-reveal')

/** The loose tiles in the order they are drawn — what the shuffle rearranges. */
const tileOrder = () => [...document.querySelectorAll('[data-tile]')].map((b) => b.textContent)

beforeEach(() => {
  loaded()
  h.toggleTile.mockReset()
  h.sendClear.mockReset()
  rpc.mockReset()
  rpc.mockResolvedValue(okEnvelope)
})

describe('connections PlayArea — concede', () => {
  it('compete shows Concede and calls connections.concede on click', async () => {
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
    // button label is the full phrase, since icon-only buttons make the label
    // the accessible name). The confirm is the one the dialog
    // adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    const confirms = await screen.findAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [player('u1', 'me', 'red'), conceded('u2', 'moth', 'blue')],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('marks an opponent out on mistakes "out" in the strip too', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [player('u1', 'me', 'red'), { ...player('u2', 'moth', 'blue'), ...ZTest_ELIMINATED }],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" look after I concede, while the race goes on', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [conceded('u1', 'me', 'red'), player('u2', 'moth', 'blue')],
        })}
      />,
    )
    // The info-column action row shows the bold status; the below-board pill
    // carries "Conceded — race continues".
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(screen.getByText('Conceded — race continues')).toBeInTheDocument()
  })

  it('a race everyone walked away from says so — the server’s word, not the clock', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [conceded('u1', 'me', 'red'), conceded('u2', 'moth', 'blue')],
          gameEnding: ALL_CONCEDED,
        })}
      />,
    )
    // The clock never ran out here, and it is not what decides: `concede` wrote
    // `conceded` as the game's reason and the pill reads that. The sentences
    // themselves are `lib/gameEndingMessage.test.ts`'s; this is the WIRE.
    expect(screen.getByText('All conceded — no winner')).toBeInTheDocument()
  })
})

/**
 * The ended board, and the reveal.
 *
 * The ended board is what the players left — their bands plus the tiles they
 * never cracked, frozen — and Reveal swaps in the unsolved categories, Hide
 * swaps back. Nothing autoreveals: the board swaps loose tiles for full-width
 * bands, so an unasked reveal would delete the record of how far anyone got.
 */
describe('connections PlayArea — the ended board + the reveal', () => {
  /** The loose tiles currently on the board (bands are divs; the floating
   *  Shuffle control is a button inside the board root, hence `[data-tile]`). */
  const tileNames = () => [...document.querySelectorAll('[data-tile]')].map((b) => b.textContent)

  it('keeps the unsolved tiles on a lost board — the record of how far you got', () => {
    loaded([matchRed()])
    const { container } = render(<PlayAreaLoader {...coopLost()} />)

    // The one they solved is a band (the log names it too, so look at the
    // board); the other twelve tiles are still there.
    const grid = container.querySelector('[data-board] > div') as HTMLElement
    expect(within(grid).getByText('RED')).toBeInTheDocument()
    expect(tileNames()).toHaveLength(12)
    // And the answer is NOT on screen until asked for.
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
  })

  it('Reveal swaps the tiles for the unsolved categories; Hide swaps back', async () => {
    const user = userEvent.setup()
    loaded([matchRed()])
    render(<PlayAreaLoader {...coopLost()} />)

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
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [meOut, twoMembers[1]!] })} />)

    // Their board freezes and says so, but the puzzle stays unspoiled — sitting
    // out with something left to think about beats being handed the answer.
    expect(screen.getByText('You’re out')).toBeInTheDocument()
    expect(screen.getByText('Lost — race continues')).toBeInTheDocument()
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
    expect(tileNames()).toHaveLength(16)
    // Reveal is offered but gray — possible here, not right now — and its
    // tooltip says why: it waits for the game to end for everyone.
    expect(revealButton()).toBeDisabled()
  })

  it('a frozen board ignores tile clicks', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...coopLost()} />)

    await user.click(document.querySelector('[data-tile="a"]') as HTMLElement)
    // The tiles are a RECORD now, not an input surface.
    expect(h.toggleTile).not.toHaveBeenCalled()
  })
})

/**
 * The celebration — confetti for the win that is MINE, and never on mount.
 * The gate is my own outcome as the server ranked it (`gd.me.outcome`), in
 * both modes; the surface works nothing out from the bands. The reload case is
 * the one `useCelebration`'s first rule exists for.
 */
describe('connections PlayArea — the celebration', () => {
  // The card by its heading: coop's verdict PILL says "You win!" too, so the
  // words alone match twice — the <h2> is the modal's alone.
  const confetti = () => screen.queryByRole('heading', { name: /You win!/ })
  /** The same player, ranked first — `won`, as `_end_game` writes it. */
  const won = (p: ZTest_PlayerFacts): ZTest_PlayerFacts => ({ ...p, outcome: 'won', finalRanking: 1 })
  /** The same player, beaten — `lost`, as `_end_game` writes it. */
  const lost = (p: ZTest_PlayerFacts): ZTest_PlayerFacts => ({ ...p, outcome: 'lost' })
  const [me, moth] = twoMembers as [ZTest_PlayerFacts, ZTest_PlayerFacts]

  it('pops for the racer the server ranked first', () => {
    loaded([matchRed()])
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    expect(confetti()).toBeNull()

    loaded(allFour())
    rerender(
      <PlayAreaLoader
        {...makeCtx({ mode: 'compete', players: [won(me), lost(moth)], gameEnding: SOMEONE_WON })}
      />,
    )
    expect(confetti()).toBeInTheDocument()
    expect(screen.getByText('You found all four first.')).toBeInTheDocument()
  })

  it('stays quiet for the racer who was beaten', () => {
    loaded([matchRed()])
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: twoMembers })} />)
    rerender(
      <PlayAreaLoader
        {...makeCtx({ mode: 'compete', players: [lost(me), won(moth)], gameEnding: SOMEONE_WON })}
      />,
    )
    expect(confetti()).toBeNull()
  })

  it('stays quiet on opening a race already won — reviewing is not winning', () => {
    loaded(allFour())
    render(
      <PlayAreaLoader
        {...makeCtx({ mode: 'compete', players: [won(me), lost(moth)], gameEnding: SOMEONE_WON })}
      />,
    )
    expect(confetti()).toBeNull()
  })

  it('pops for the coop team on the fourth category, whoever guessed it', () => {
    loaded([matchRed()])
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)
    loaded(allFour('u2'))
    // A coop win ranks the whole team first.
    rerender(
      <PlayAreaLoader {...makeCtx({ players: twoMembers.map(won), gameEnding: SOMEONE_WON })} />,
    )
    expect(confetti()).toBeInTheDocument()
    expect(screen.getByText('All four categories found.')).toBeInTheDocument()
  })
})

/**
 * The feedback vocabulary (docs/ui.md → Interactive tile states), as connections wears it.
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
    const { container } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(gridIn(container).className).not.toMatch(/endingFrame/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  it('bands the finished board in its outcome', () => {
    const { container } = render(<PlayAreaLoader {...coopLost()} />)

    expect(gridIn(container).className).toMatch(/endingFrame/)
    expect(gridIn(container).className).toMatch(/endingFrame_lost/)
    expect(gridIn(container).className).not.toMatch(/endingFrame_won/)
  })

  it('frames an out-of-the-race player’s board in their own outcome', () => {
    // The game is still on for the survivors, but this board is inert, and the
    // server wrote `lost` for the racer the moment they were out.
    const { container } = render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [meOut, twoMembers[1]!] })} />,
    )

    expect(gridIn(container).className).toMatch(/endingFrame/)
    expect(gridIn(container).className).toMatch(/endingFrame_lost/)
  })

  it('dims the board while a teammate holds the move, and flashes when it arrives', () => {
    const { container, rerender } = render(
      <PlayAreaLoader {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />,
    )
    expect(gridIn(container).className).toMatch(/dimNotYourTurn/)
    // An EVENT, so never on mount: opening a game on your own turn is not the
    // turn arriving.
    expect(gridIn(container).className).not.toMatch(/yourTurnFlash/)

    rerender(
      <PlayAreaLoader {...makeCtx({ turnHolderId: 'u1', players: twoMembers })} />,
    )

    expect(gridIn(container).className).toMatch(/yourTurnFlash/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  it('a waiting player’s tiles are inert, not just unresponsive', async () => {
    const user = userEvent.setup()
    render(
      <PlayAreaLoader {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />,
    )

    const tile = document.querySelector('[data-tile="a"]') as HTMLButtonElement
    // Disabled, so it drops the pointer cursor and the hover lift with it — a
    // tile that still advertises itself while swallowing the click is a promise
    // the board can't keep.
    expect(tile).toBeDisabled()
    await user.click(tile)
    expect(h.toggleTile).not.toHaveBeenCalled()
  })
})

describe('connections PlayArea — picks, identity, and the guess in flight', () => {
  const tile = (name: string) => document.querySelector(`[data-tile="${name}"]`) as HTMLElement

  it('rings every pick on a shared board, in whoever’s color — mine included', () => {
    loaded([], new Map([['u1', ['a']], ['u2', ['b']]]))
    render(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)

    // In coop the four tiles are ONE shared move, so both are "in the guess"…
    expect(tile('a').className).toMatch(/picked/)
    expect(tile('b').className).toMatch(/picked/)
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
    // picked border. Same in compete, where the picks never leave this
    // client however many are racing.
    const cases: Array<['coop' | 'compete', typeof twoMembers]> = [
      ['coop', [player('u1', 'me', 'red')]],
      ['compete', twoMembers],
    ]
    for (const [mode, players] of cases) {
      loaded([], new Map([['u1', ['a']]]))
      const { unmount } = render(<PlayAreaLoader {...makeCtx({ mode, players })} />)
      expect(tile('a').className).toMatch(/picked/)
      expect(tile('a').className).not.toMatch(/peerPick/)
      unmount()
    }
  })

  it('dims the guess while it is with the server, then fills the verdict', async () => {
    const user = userEvent.setup()
    // A guess the server hasn't answered yet: hold the RPC open.
    let answer: (value: typeof okEnvelope) => void = () => {}
    rpc.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    loaded([], FOUR_PICKED)
    render(<PlayAreaLoader {...makeCtx()} />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    // Sent, waiting — and NOT colored: guessing the answer locally would mean
    // taking it back when the server disagrees.
    for (const t of ['a', 'b', 'e', 'i']) expect(tile(t).className).toMatch(/dimInFlight/)
    expect(tile('c').className).not.toMatch(/dimInFlight/)

    answer(okEnvelope)

    // The answer arrives: the dim lifts and the verdict fills the same four
    // tiles in the outcome its pill wears — "Wrong" is `lost` in both places.
    await waitFor(() => expect(tile('a').className).toMatch(/verdictFill/))
    expect(tile('a').className).toMatch(/verdictLost/)
    expect(tile('a').className).not.toMatch(/dimInFlight/)
    expect(screen.getByText('Wrong')).toBeInTheDocument()
  })

  it('fills a refused guess in the outcome its pill takes, without asking the server', async () => {
    const user = userEvent.setup()
    loaded([wrongGuess()], FOUR_PICKED)
    render(<PlayAreaLoader {...makeCtx()} />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(rpc).not.toHaveBeenCalledWith('submit_guess', expect.anything())
    expect(screen.getByText('You already tried that')).toBeInTheDocument()
    expect(tile('a').className).toMatch(/verdictFill/)
    expect(tile('a').className).toMatch(/verdictWarning/)
  })

  // The two beats a verdict gets, in order. They are ONE mark: the attention
  // flash points at where the answer landed, and only once it has faded — and
  // the fill underneath it is visible — does the head-shake say the answer was
  // no. A shake under a flash still on top of it would be a remark about a
  // color nobody can see yet.
  it('points at the answered tiles first, and shakes them once the flash has faded', () => {
    vi.useFakeTimers()
    try {
      // A repeat guess: refused locally, so the mark goes up in the same tick
      // with no round trip to wait on.
      loaded([wrongGuess()], FOUR_PICKED)
      render(<PlayAreaLoader {...makeCtx()} />)
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
      })

      // Beat one: the flash, on the four the answer is about — and no shake yet.
      expect(tile('a').className).toMatch(/attentionFlash/)
      expect(tile('a').className).not.toMatch(/verdictShake/)
      expect(tile('c').className).not.toMatch(/attentionFlash/)

      // Beat two: the flash has handed the fill back, so now the board says no.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
      expect(tile('a').className).toMatch(/verdictShake/)
      expect(tile('a').className).not.toMatch(/attentionFlash/)
      // …and the fill is on through both beats: it is what the flash is
      // pointing at and what the shake is remarking on.
      expect(tile('a').className).toMatch(/verdictFill/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes the fill off with the pill it belongs to', async () => {
    const user = userEvent.setup()
    loaded([wrongGuess()], FOUR_PICKED)
    render(<PlayAreaLoader {...makeCtx()} />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(tile('a').className).toMatch(/verdictFill/)

    // The next action dismisses both halves of the one message.
    await user.click(tile('c'))
    expect(tile('a').className).not.toMatch(/verdictFill/)
  })

  /**
   * The mark's OTHER two endings, both read off the guess log rather than off
   * anything this client did — because both can happen on somebody else's
   * machine: a teammate's guess can take those tiles off the board, and a
   * restart re-deals under it.
   */
  describe('the mark dies when the board moves under it', () => {
    /** Submit a wrong guess in a two-player coop game and confirm it landed. */
    async function guessWrongly(ctx: PlayAreaLoaderProps) {
      const user = userEvent.setup()
      loaded([], FOUR_PICKED)
      const view = render(<PlayAreaLoader {...ctx} />)
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
      loaded([wrongGuess('u1')], FOUR_PICKED)
      rerender(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)

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
      loaded([ZTest_guess('u2', ['c', 'd', 'f', 'g'], 'wrong')], FOUR_PICKED)
      rerender(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)

      expect(tile('a').className).not.toMatch(/verdictFill/)
      expect(tile('c').className).toMatch(/verdictFill/)
    })

    it('goes when a teammate’s guess is RIGHT — the band says it instead', async () => {
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = await guessWrongly(ctx)

      loaded([matchRed('u2')], FOUR_PICKED)
      rerender(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)

      expect(tile('e').className).not.toMatch(/verdictFill/)
    })
  })

  it('draws no picks once the board is finished', () => {
    // The picks are ephemeral broadcast chatter that no server row
    // contradicts, so they outlive the game unless the board refuses to draw them.
    // A frozen board wearing picked borders reads as a move in progress.
    loaded([], new Map([['u1', ['a']], ['u2', ['b']]]))
    render(<PlayAreaLoader {...coopLost(twoMembers)} />)

    expect(tile('a').className).not.toMatch(/picked/)
    expect(tile('b').className).not.toMatch(/peerPick/)
  })
})

describe('connections PlayArea — attention', () => {
  /** The band element — the flash rides on it, and its name is inside it. Scoped
   *  to the board, since a category name also appears in the info column's hint
   *  list. */
  const bandFor = (name: string) => {
    const grid = document.querySelector('[data-board] > div') as HTMLElement
    return within(grid).getByText(name).parentElement as HTMLElement
  }

  it('flashes a band a teammate’s guess produced', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)

    // moth's correct guess arrives: four tiles collapse into a band and
    // everything below reflows, in whatever corner they were working.
    loaded([matchRed('u2')])
    rerender(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)

    expect(bandFor('RED').className).toMatch(/attentionFlash/)
  })

  it('flashes my own band too — the band lands where I was not looking', () => {
    const ctx = makeCtx({ players: twoMembers })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)

    loaded([matchRed('u1')])
    rerender(<PlayAreaLoader {...makeCtx({ players: twoMembers })} />)

    // I chose the four tiles, but the band arrives at the TOP of the board while
    // I am reading the tiles — so the flash says "your four went here".
    expect(bandFor('RED').className).toMatch(/attentionFlash/)
  })

  it('says nothing when the answer is revealed', async () => {
    const user = userEvent.setup()
    loaded([matchRed('u2')])
    const { container } = render(<PlayAreaLoader {...coopLost(twoMembers)} />)

    await user.click(revealButton()!)

    // Three bands appear at once — which a diff would read as three moves. The
    // guess log is what says otherwise, and it didn't move.
    const grid = container.querySelector('[data-board] > div') as HTMLElement
    expect(within(grid).getByText('PURPLE')).toBeInTheDocument()
    expect(grid.innerHTML).not.toMatch(/attentionFlash/)
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is an action's, so
 * what these pin is the wiring: the chord reaches the action, the action
 * says when it applies (Enter and ⌫ go HIDDEN rather than inert where the
 * board is not this player's to touch, so they do not swallow a key another
 * binding wanted), it asks the registry's question mid-game and skips it once
 * the game has ended, and the answer runs the same call the button does.
 */
describe('connections PlayArea — the keys', () => {
  it('Enter submits the four picked tiles', async () => {
    loaded([], FOUR_PICKED)
    render(<WithKeys {...makeCtx()} />)
    expect(getAction('act-submit').describe('button').state).toBe('active')

    press(ENTER)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_guess', expect.anything()))
  })

  it('Enter with fewer than four picked is here but gray — it fires nothing', async () => {
    loaded([], new Map([['u1', ['a', 'b']]]))
    render(<WithKeys {...makeCtx()} />)
    expect(getAction('act-submit').describe('button').state).toBe('disabled')

    await act(async () => press(ENTER))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌫ clears the picks — and broadcasts it, so a teammate’s board drops them too', async () => {
    loaded([], new Map([['u1', ['a', 'b']]]))
    render(<WithKeys {...makeCtx({ players: twoMembers })} />)
    expect(getAction('act-clear-picks').describe('button').state).toBe('active')

    await act(async () => press(BACKSPACE))
    expect(h.sendClear).toHaveBeenCalledTimes(1)
  })

  it("both leave on a teammate's turn — hidden, not merely inert", () => {
    loaded([], FOUR_PICKED)
    render(<WithKeys {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />)
    expect(getAction('act-submit').describe('button').state).toBe('hidden')
    expect(getAction('act-clear-picks').describe('button').state).toBe('hidden')
  })

  it('both leave once the board is finished', () => {
    loaded([], FOUR_PICKED)
    render(<WithKeys {...coopLost()} />)
    expect(getAction('act-submit').describe('button').state).toBe('hidden')
    expect(getAction('act-clear-picks').describe('button').state).toBe('hidden')
  })

  // The row is one list, every action listed once; which buttons are on screen
  // is each action's own answer, and the menu asks the same actions.
  describe('the action row answers per asker', () => {
    it('Restart, New game and Reveal are menu rows all game, and buttons only at the end', () => {
      render(<WithKeys {...makeCtx()} />)
      for (const id of ['act-restart', 'act-new-game', 'act-reveal'] as const) {
        expect(getAction(id).describe('button').state).toBe('hidden')
        expect(getAction(id).describe('menu').state).not.toBe('hidden')
      }
    })

    it('Hints is gone, row and button, once I can no longer submit', () => {
      render(<WithKeys {...makeCtx({ mode: 'compete', players: [meOut, twoMembers[1]!] })} />)
      expect(getAction('act-hint').describe('button').state).toBe('hidden')
      expect(getAction('act-hint').describe('menu').state).toBe('hidden')
      // …and the Reveal button appears in its place, grayed until everyone is done.
      expect(getAction('act-reveal').describe('button').state).toBe('disabled')
    })
  })

  it('+ once the game has ended starts the next game with no question', async () => {
    // Two calls, the look-ahead and the create; both answered ok.
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === 'next_puzzle_for_club'
          ? ok({ result: 'found', puzzle_id: 'p2' })
          : ok({ result: 'created', id: 'fresh-game-id' }),
      ),
    )
    const ctx = coopLost()
    render(<WithKeys {...ctx} />)

    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    press(PLUS)
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'create_game',
        expect.objectContaining({ p_club_handle: 'testclub', p_player_user_ids: ['u1'], p_mode: 'coop' }),
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
    expect(rpc).not.toHaveBeenCalled()
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
        <WithKeys {...makeCtx({ mode: 'compete', players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('stop_game', expect.anything())
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
      // swallow a keystroke another action wanted.
      render(<WithKeys {...coopLost()} />)
      expect(getAction('act-shuffle').describe('button').state).toBe('hidden')
      const before = tileOrder()

      vi.spyOn(Math, 'random').mockReturnValue(0)
      await act(async () => press(OPT_Z))
      expect(tileOrder()).toEqual(before)
    })
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
      expect(rpc).not.toHaveBeenCalled()
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

    it('once the game has ended the button goes straight through', async () => {
      const user = userEvent.setup()
      render(<PlayAreaLoader {...coopLost()} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    })
  })
})

describe('connections PlayArea — the selection cursor', () => {
  // The board's tile order, four across:
  //   a b c d
  //   e f g h
  //   i j k l
  //   m n o p
  // Space is a click on the tile under the ring, so what it DOES — the union
  // rule, four across the table, a teammate's pick coming out — is
  // `eventForClick`'s (picks.test.ts); here it is enough that Space hands
  // `toggleTile` the ringed tile.
  const tileFor = (tile: string) => document.querySelector(`[data-tile="${tile}"]`) as HTMLElement
  const ringed = () =>
    [...document.querySelectorAll('[data-tile]')]
      .filter((t) => /selectionCursor/.test(t.className))
      .map((t) => t.getAttribute('data-tile'))
  // Awaited: an action's run settles a microtask after the keystroke.
  const key = (k: string) => act(async () => press({ key: k }))

  it('is hidden until an arrow; the first arrow rings the first tile, the next moves it', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(ringed()).toEqual([])

    await key('ArrowRight')
    expect(ringed()).toEqual(['a'])
    await key('ArrowRight')
    expect(ringed()).toEqual(['b'])
    await key('ArrowDown')
    expect(ringed()).toEqual(['f'])
  })

  it('Space does nothing while the ring is hidden, then toggles the ringed tile', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key(' ')
    expect(h.toggleTile).not.toHaveBeenCalled()
    expect(ringed()).toEqual([])

    await key('ArrowDown')
    await key('ArrowDown')
    await key(' ')
    expect(h.toggleTile).toHaveBeenCalledWith('e')
  })

  it('a click toggles the tile and hides the ring; the next arrow rings the clicked tile', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await user.click(tileFor('g'))
    expect(h.toggleTile).toHaveBeenCalledWith('g')
    expect(ringed()).toEqual([])

    await key('ArrowLeft')
    expect(ringed()).toEqual(['g'])
  })

  // A solved band takes a row of loose tiles away; the ring stands on the
  // nearest tile left and Space acts there.
  it('stands on the nearest tile when a band takes a row away', async () => {
    const ctx = makeCtx()
    const { rerender } = render(<WithKeys {...ctx} />)
    await key('ArrowRight')
    await key('ArrowRight')
    for (let i = 0; i < 3; i++) await key('ArrowDown')
    expect(ringed()).toEqual(['n'])

    loaded([matchRed()])
    rerender(<WithKeys {...makeCtx()} />)
    // e..p now fill three rows, and row 3 is gone: the ring is on row 2,
    // same column.
    expect(ringed()).toEqual(['n'])
    await key(' ')
    expect(h.toggleTile).toHaveBeenCalledWith('n')
    await key('ArrowUp')
    expect(ringed()).toEqual(['j'])
  })

  it('a board I cannot play takes no ring and no keys', async () => {
    // A teammate holds the move.
    render(<WithKeys {...makeCtx({ turnHolderId: 'u2', players: twoMembers })} />)
    await key('ArrowRight')
    await key(' ')
    expect(ringed()).toEqual([])
    expect(h.toggleTile).not.toHaveBeenCalled()
  })
})
