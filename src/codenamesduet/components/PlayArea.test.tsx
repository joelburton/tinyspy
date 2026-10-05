// cs-blessed-codenamesduet

/**
 * Render + behavior tests for codenamesduet's play surface, built from the blob
 * a test's facts would produce (`lib/gameData.fixture.ts`): the guess in-flight
 * guard, a refused guess in the local slot, the tiles' input gate, what the
 * bell is told, the board's turn dim and flash and a guess's flash through the
 * log, the finished-player banners, the partner-key reveal, the action row and
 * the menu, the header's lines about the partner, the two role-specific
 * controls, the commands through the dispatcher, and the keyboard's selection
 * cursor.
 *
 * Only `db` is mocked. By default my partner (seat A) gave the clue and I (seat
 * B) am guessing, so the tiles are clickable.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { ACTIONS } from '@/common/actions/registry'
import { getActions } from '@/common/actions/actionsStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import shared from '@/common/game-page/playArea.module.css'
import { db } from '../db'
import {
  ZTest_clue,
  ZTest_guess,
  ZTest_makeCodenamesduetCtx,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import type { GEventRaw, GKey } from '../types'
import boardStyles from './Board.module.css'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// Watched so a test can say this surface rings no bell of its own: the page
// rings on the shared pointer.
const turnBell = vi.hoisted(() => vi.fn())
vi.mock('@/common/sounds/useTurnBell', () => ({ useTurnBell: turnBell }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** My partner sits at A and opens; I (`u1`, the viewer) sit at B. */
const PLAYERS: ZTest_GameDataFacts['players'] = [
  { id: 'u2', username: 'peer', color: 'blue' },
  { id: 'u1', username: 'me', color: 'red' },
]
const WORDS = Array.from({ length: 25 }, (_, i) => (i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`))
// One agent each, so a test can find all of a player's agents with one guess:
// my partner's at 23, mine at 24. Everything else is a bystander on both keys.
const KEY_PEER: GKey[] = Array.from({ length: 25 }, (_, i) => (i === 23 ? 'G' : 'N'))
const KEY_ME: GKey[] = Array.from({ length: 25 }, (_, i) => (i === 24 ? 'G' : 'N'))
/** My partner's clue for turn 1. */
const PEER_CLUE = ZTest_clue(1, 'u2', 1, 'fruit', 2)

/** A hint event, as the blob carries it. */
const hint = (id: number, userId: string): GEventRaw => ({
  ...ZTest_clue(id, userId, 1, 'x', 0),
  kind: 'hint',
  clueWord: null,
  clueCount: null,
  clueFromAi: null,
})

/** The game's facts; my partner's clue is in and I guess, unless said otherwise. */
const facts = (over: ZTest_GameDataFacts = {}): ZTest_GameDataFacts => ({
  players: PLAYERS,
  words: WORDS,
  keyA: KEY_PEER,
  keyB: KEY_ME,
  turnNum: 1,
  clueSeat: 'A',
  events: [PEER_CLUE],
  ...over,
})

/** I hold the clue seat, with the clue still to write. */
const AS_CLUE_GIVER: ZTest_GameDataFacts = { clueSeat: 'B', events: [] }
/** The budget spent: nobody clues, and either of us may guess. */
const SUDDEN_DEATH: ZTest_GameDataFacts = { turnNum: 10, clueSeat: null, events: [] }
/** The assassin ended the game. */
const LOST: ZTest_GameDataFacts = {
  ending: { reason: 'fatal_move', detail: 'assassin', by: 'u2', winner: null },
  outcome: 'lost',
  clueSeat: null,
}
/** The pair found every agent. */
const WON: ZTest_GameDataFacts = {
  ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: null },
  outcome: 'won',
  clueSeat: null,
}

/** The props `<GamePage>` hands the surface, from the game's facts. */
function makeCtx(over: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeCodenamesduetCtx(facts(over))
}

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
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

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
 *  draw, keyed by action id. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

beforeEach(() => {
  rpc.mockReset()
  // Never resolves → the first guess stays "in flight" so we can test the guard.
  rpc.mockReturnValue(new Promise(() => {}))
})

/**
 * A second guess while one is in flight fires no second `submit_guess`. A
 * tile's `disabled` follows `inFlightPos` a render late, and covers only the tile
 * clicked; `useSingleFlight` closes both. This clicks a DIFFERENT tile.
 */
describe('codenamesduet PlayArea — guess in-flight guard', () => {
  it('a second guess while one is in flight does not fire a second submit_guess', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    const apple = screen.getByRole('button', { name: /apple/i })
    const berry = screen.getByRole('button', { name: /berry/i })
    fireEvent.click(apple) // guess in flight (rpc never resolves)
    fireEvent.click(berry) // a DIFFERENT tile — not disabled, but the ref must block it
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess_position: 0 })
  })

  // The reply and the reveal are two events: the reveal comes in the next blob,
  // a beat after `submit_guess` answers. Until it lands the guess is still out.
  it('holds the guess in flight after the reply, until its reveal lands', async () => {
    rpc.mockReturnValue(Promise.resolve(okEnvelope({ result: 'agent' })))
    const { rerender } = render(<PlayAreaLoader {...makeCtx()} />)
    const apple = () => screen.getByRole('button', { name: /apple/i })
    await act(async () => {
      fireEvent.click(apple())
    })
    // Replied, not yet revealed: still dimmed, and no second guess goes out.
    expect(apple()).toHaveClass(shared.dimInFlight)
    fireEvent.click(screen.getByRole('button', { name: /berry/i }))
    expect(rpc).toHaveBeenCalledTimes(1)

    // The reveal lands.
    rerender(<PlayAreaLoader {...makeCtx({ events: [PEER_CLUE, ZTest_guess(2, 'u1', 1, 0, 'G')] })} />)
    expect(apple()).not.toHaveClass(shared.dimInFlight)
  })
})

/**
 * A refused guess is said where I am looking: the server's own sentence in the
 * local slot under the board.
 */
describe('codenamesduet PlayArea — a refused guess', () => {
  it('shows the server’s sentence in the local slot', async () => {
    rpc.mockReturnValue(Promise.resolve({
      data: {
        type: 'not-ok', data: null, outcome: 'warning', severity: 'race',
        message: 'That word is already revealed', field: null, meta: null,
        dbcode: 'PN382', detail: null,
      },
      error: null,
    }))
    render(<PlayAreaLoader {...makeCtx()} />)
    fireEvent.click(screen.getByRole('button', { name: /apple/i }))
    expect(await screen.findByText('That word is already revealed')).toBeInTheDocument()
  })
})

/**
 * The tiles' input gate, by its observable effect — clickable during my guess
 * turn, blocked at the end — so a flip that inverts the gate fails here.
 */
describe('codenamesduet PlayArea — input gating', () => {
  it('tiles are clickable during my guess turn', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })

  it('tiles are blocked once the game is over', () => {
    render(<PlayAreaLoader {...makeCtx(WON)} />)
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
  })

  it('tiles are blocked while a past turn is open on the board', () => {
    render(<PlayAreaLoader {...makeCtx()} />) // my guess turn: the gate is open
    fireEvent.click(screen.getByText('#1'))
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
  })

  it('in sudden death, tiles are open to either player — the last clue-giver too', () => {
    render(<PlayAreaLoader {...makeCtx({ ...SUDDEN_DEATH, ...AS_CLUE_GIVER, clueSeat: null })} />)
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })
})

/**
 * The turn is the shared pointer's: the server points it at whoever must act
 * now, so the page rings the bell for this game as for every other, and this
 * surface rings none of its own.
 */
describe('codenamesduet PlayArea — the turn', () => {
  it('rings no bell of its own — the page rings on the shared pointer', () => {
    render(<PlayAreaLoader {...makeCtx(AS_CLUE_GIVER)} />)
    expect(turnBell).not.toHaveBeenCalled()
  })

  it('in sudden death, the player with no words left has an inert, dimmed board', () => {
    // My partner's agents are all found: a guess reads their key, so I have
    // nothing to guess, and the pointer names my partner.
    render(<PlayAreaLoader {...makeCtx({ ...SUDDEN_DEATH, events: [ZTest_guess(1, 'u1', 9, 23, 'G')] })} />)
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
    const grid = document.querySelector('[data-board] > div') as HTMLElement
    expect(grid.className).toMatch(/dimNotYourTurn/)
  })
})

/**
 * The board's turn dim and game-over frame: dimmed only while my partner holds
 * the move — not while I write the clue, since the clue is written from the
 * board — and never in sudden death or at the end.
 */
describe('codenamesduet PlayArea — the board marks', () => {
  const grid = () => document.querySelector('[data-board] > div') as HTMLElement

  it('dims the board while my partner writes the clue, not while I guess', () => {
    const view = render(<PlayAreaLoader {...makeCtx({ events: [] })} />)
    expect(grid().className).toMatch(/dimNotYourTurn/)
    view.rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
  })

  it('flashes the frame as the clue arrives for me to guess from', () => {
    const view = render(<PlayAreaLoader {...makeCtx({ events: [] })} />)
    expect(grid().className).not.toMatch(/yourTurnFlash/)
    view.rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(grid().className).toMatch(/yourTurnFlash/)
  })

  it('flashes the tile a guess turned over, reading the guess log', () => {
    const view = render(<PlayAreaLoader {...makeCtx()} />)
    view.rerender(<PlayAreaLoader {...makeCtx({ events: [PEER_CLUE, ZTest_guess(2, 'u1', 1, 1, 'G')] })} />)
    expect(screen.getByRole('button', { name: /berry/i }).className).toMatch(/attentionFlash/)
    expect(screen.getByRole('button', { name: /apple/i }).className).not.toMatch(/attentionFlash/)
  })

  it('does not dim the board while I write the clue', () => {
    render(<PlayAreaLoader {...makeCtx(AS_CLUE_GIVER)} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
  })

  it('dims nothing in sudden death, and frames the finished board in its outcome', () => {
    const view = render(<PlayAreaLoader {...makeCtx(SUDDEN_DEATH)} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
    view.rerender(<PlayAreaLoader {...makeCtx(LOST)} />)
    expect(grid().className).not.toMatch(/dimNotYourTurn/)
    expect(grid().className).toMatch(/endingFrame_lost/)
  })
})

/**
 * The finished-player banner: each player told, in the info column, when one
 * of them has found all their agents — and only while clues are still given.
 */
describe('codenamesduet PlayArea — the finished-player banner', () => {
  it('tells me my partner now gives every clue, when my agents are all found', () => {
    render(<PlayAreaLoader {...makeCtx({ events: [PEER_CLUE, ZTest_guess(2, 'u2', 1, 24, 'G')] })} />)
    expect(screen.getByText(/gives every remaining\s+clue — your agents are all found/)).toBeInTheDocument()
    expect(screen.queryByText(/has no agents left/)).not.toBeInTheDocument()
  })

  it('tells me I now give every clue, when my partner’s are', () => {
    render(<PlayAreaLoader {...makeCtx({ events: [PEER_CLUE, ZTest_guess(2, 'u1', 1, 23, 'G')] })} />)
    expect(screen.getByText(/has no agents left — you\s+give every remaining clue/)).toBeInTheDocument()
    expect(screen.queryByText(/your agents are all found/)).not.toBeInTheDocument()
  })

  it('says nothing in sudden death, where nobody clues', () => {
    render(<PlayAreaLoader {...makeCtx({ ...SUDDEN_DEATH, events: [ZTest_guess(1, 'u1', 9, 23, 'G'), ZTest_guess(2, 'u2', 9, 24, 'G')] })} />)
    expect(screen.queryByText(/your agents are all found/)).not.toBeInTheDocument()
    expect(screen.queryByText(/has no agents left/)).not.toBeInTheDocument()
  })
})

/**
 * The partner-key reveal: nothing opens the card automatically, a win
 * included, and the ask is LOCAL — it opens only on my screen.
 */
describe('codenamesduet PlayArea — the partner-key reveal', () => {
  const partnerSquares = () => document.querySelectorAll(`.${boardStyles.keyPeer}`).length

  it('keeps the card covered once the game is over until I ask — a win included', () => {
    render(<PlayAreaLoader {...makeCtx(WON)} />)
    expect(partnerSquares()).toBe(0)
    // By WHICH action it is — the words are the next tests' subject, not this one's.
    expect(control('act-reveal')).toBeEnabled()
  })

  it('Reveal opens it for me alone, and Hide covers it again', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(LOST)} />)

    await user.click(screen.getByRole('button', { name: "Reveal key cards" }))
    expect(partnerSquares()).toBe(25)
    // Local state: no RPC, so the partner's own card stays covered.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: "Hide key cards" }))
    expect(partnerSquares()).toBe(0)
  })

  it('the menu twin is the same toggle, and inert mid-game', async () => {
    const live = makeCtx()
    const { unmount } = render(<PlayAreaLoader {...live} />)
    // Mid-game the partner's card is the whole game — nothing to reveal.
    expect(menuItems(live).get('act-reveal')?.disabled).toBe(true)
    unmount()

    const done = makeCtx(LOST)
    render(<PlayAreaLoader {...done} />)
    expect(menuItems(done).get('act-reveal')?.label).toBe("Reveal key cards")
    act(() => menuItems(done).get('act-reveal')!.run())
    expect(partnerSquares()).toBe(25)
    await waitFor(() => expect(menuItems(done).get('act-reveal')?.label).toBe("Hide key cards"))
  })
})

/**
 * The info column's ONE action row: every action placed once, each deciding
 * for itself whether its button shows. While the game runs: Stop and Back to
 * club. At the end: Reveal, Restart, New game and Back to club. Restart, New
 * game and Reveal stay menu rows all game — "not in the menu" would be
 * `?.hidden === true`, and these are not hidden there.
 */
describe('codenamesduet PlayArea — the action row', () => {
  const ROW = ['act-reveal', 'act-restart', 'act-new-game', 'act-concede', 'act-stop-game', 'act-back-to-club']
  const buttons = () => ROW.filter((id) => control(id) !== null)

  it('while the game runs: Stop and Back to club — the rest are the menu’s', () => {
    const live = makeCtx()
    render(<PlayAreaLoader {...live} />)
    expect(buttons()).toEqual(['act-stop-game', 'act-back-to-club'])
    for (const id of ['act-reveal', 'act-restart', 'act-new-game']) {
      expect(menuItems(live).get(id)?.hidden).not.toBe(true)
    }
  })

  it('at the end: Reveal, Restart, New game and Back to club — Stop is gone', () => {
    render(<PlayAreaLoader {...makeCtx(LOST)} />)
    expect(buttons()).toEqual(['act-reveal', 'act-restart', 'act-new-game', 'act-back-to-club'])
  })

  it('the menu lists them in the row’s order', () => {
    const live = makeCtx()
    render(<PlayAreaLoader {...live} />)
    const ids = [...menuItems(live).keys()]
    const order = ['act-reveal', 'act-restart', 'act-new-game'].map((id) => ids.indexOf(id))
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })
})

/**
 * The header's lines about the partner: where the turn stands, held for as long
 * as it holds, and — once, as it lands — the partner asking the AI for a clue.
 */
describe('codenamesduet PlayArea — the partner, in the header', () => {
  const texts = (ctx: PlayAreaLoaderProps) =>
    ctx.globalFeedbackSlot.peek().map((entry) => entry.message.text)

  it('says what the partner is doing now', () => {
    const ctx = makeCtx() // my partner gave the clue; I guess
    render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).toContain('waiting for you')
  })

  it('takes the line down when it stops being true', () => {
    const ctx = makeCtx()
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).toContain('waiting for you')

    const over = { ...makeCtx(LOST), globalFeedbackSlot: ctx.globalFeedbackSlot }
    rerender(<PlayAreaLoader {...over} />)
    expect(texts(over)).not.toContain('waiting for you')
  })

  it('says nothing about the turn once the game is over', () => {
    const ctx = makeCtx(LOST)
    render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).not.toContain('waiting for you')
  })

  it('narrates a partner’s hint as it lands, and not the ones already there on load', () => {
    const ctx = makeCtx({ events: [PEER_CLUE, hint(2, 'u2')] })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    expect(texts(ctx)).not.toContain('got hint')

    const next = { ...makeCtx({ events: [PEER_CLUE, hint(2, 'u2'), hint(3, 'u2')] }), globalFeedbackSlot: ctx.globalFeedbackSlot }
    rerender(<PlayAreaLoader {...next} />)
    expect(texts(ctx)).toContain('got hint')
  })

  it('does not narrate a hint of MINE, however it lands', () => {
    const ctx = makeCtx()
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = { ...makeCtx({ events: [PEER_CLUE, hint(2, 'u1')] }), globalFeedbackSlot: ctx.globalFeedbackSlot }
    rerender(<PlayAreaLoader {...next} />)
    expect(texts(ctx)).not.toContain('got hint')
  })
})

/**
 * The two role-specific controls: the guesser's Pass is a plain primary button
 * (`act-end-turn`, whose registry row carries no tone), and asking Claude for a
 * clue is the clue-giver's alone.
 */
describe('codenamesduet PlayArea — the guesser’s Pass and the giver’s AI', () => {
  it('the guesser’s Pass is a primary, normal-toned button', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    const pass = control('act-end-turn')!
    expect(pass).toBeEnabled()
    // Weight and tone are the module's class keys — the CSS-module proxy keeps
    // the key's name in the hashed class.
    expect(pass.className).toMatch(/primary/)
    expect(pass.className).toMatch(/normal/)
    expect(pass.className).not.toMatch(/caution/)
    // …and the registry row it draws from names no tone of its own.
    const endTurn = getActions().find((b) => b.id === 'act-end-turn')
    expect(endTurn?.defn).toBe(ACTIONS['act-end-turn'])
    expect(ACTIONS['act-end-turn']).not.toHaveProperty('tone')
  })

  it('Suggest a clue is the clue-giver’s and not the guesser’s', () => {
    const { unmount } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(control('act-suggest-clue')).toBeNull()
    expect(getActions().some((b) => b.id === 'act-suggest-clue')).toBe(false)
    unmount()

    render(<PlayAreaLoader {...makeCtx(AS_CLUE_GIVER)} />)
    expect(control('act-suggest-clue')).toBeEnabled()
    // The giver has no guesses to stop.
    expect(control('act-end-turn')).toBeNull()
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped. Duet is coop-only, so `⌥⌫` is always Stop.
 */
describe('codenamesduet PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ once the game is over samples the next board with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : new Promise(() => {}),
    )
    const ctx = makeCtx(WON)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    // The next board is for this game's two players, on this game's setup.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', expect.objectContaining({
        p_club_handle: 'testclub',
        p_player_user_ids: ['u2', 'u1'],
        p_setup: expect.objectContaining({ turns: 9 }),
      })),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and cancel samples nothing', async () => {
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
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌥⌫ asks Stop game’s question; yes calls stop_game', async () => {
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

  it('Restart mid-game asks, and goes straight through once the game is over', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = makeCtx()
    const { unmount } = render(
      <>
        <PlayAreaLoader {...live} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(live).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
    unmount()

    // No host this time: the RPC firing proves no question was asked.
    render(<PlayAreaLoader {...makeCtx(LOST)} />)
    await user.click(control('act-restart')!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })
})

/**
 * The keyboard's selection cursor. The board is five across, positions row by
 * row: `apple` is 0, `berry` 1, and the rest `word<N>`. Arrows move the ring,
 * Space PICKS the word under it, and Enter guesses the pick — where a click
 * guesses at once. I am the guesser unless a test says otherwise.
 */
describe('codenamesduet PlayArea — the selection cursor', () => {
  const wordAt = (p: number) => (p === 0 ? 'apple' : p === 1 ? 'berry' : `word${p}`)
  const tile = (p: number) => screen.getByRole('button', { name: wordAt(p) })
  const boardTiles = () => Array.from({ length: 25 }, (_, p) => tile(p))
  /** The words wearing the cursor ring — at most one. */
  const ringed = () => boardTiles().filter((t) => /selectionCursor/.test(t.className)).map((t) => t.textContent)
  /** The words the keyboard has picked — at most one. */
  const picked = () => boardTiles().filter((t) => /picked/.test(t.className)).map((t) => t.textContent)
  const key = (k: string) => press({ key: k })
  const guessed = (p: number) =>
    expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess_position: p })

  it('is hidden until an arrow; the first arrow rings the first word, the next moves it', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(ringed()).toEqual([])

    await key('ArrowRight')
    expect(ringed()).toEqual(['apple'])
    await key('ArrowRight')
    expect(ringed()).toEqual(['berry'])
    await key('ArrowDown')
    expect(ringed()).toEqual(['word6'])
  })

  it('Space does nothing while the ring is hidden, then picks and un-picks the ringed word', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key(' ')
    expect(picked()).toEqual([])
    expect(ringed()).toEqual([])

    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual(['apple'])
    expect(rpc).not.toHaveBeenCalled()
    await key(' ')
    expect(picked()).toEqual([])
  })

  it('Enter guesses the pick, and the pick goes', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key('ArrowRight')
    await key(' ')
    await key('Enter')
    guessed(1)
    expect(picked()).toEqual([])
  })

  it('names Enter "Guess" for the key list', () => {
    render(<WithKeys {...makeCtx()} />)
    const guess = getActions().find((b) => b.id === 'act-submit')!
    expect(guess.describe('help').label).toBe('Guess')
  })

  it('⌫ un-picks', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key(' ')
    await key('Backspace')
    expect(picked()).toEqual([])
  })

  // A contacted word, and a bystander I hit, can't be guessed — by a click or
  // by Space. A bystander only my partner hit may be my agent, so it can.
  it('Space passes over what a click could not guess', async () => {
    render(
      <WithKeys
        {...makeCtx({
          events: [
            PEER_CLUE,
            ZTest_guess(2, 'u2', 1, 0, 'G'),
            ZTest_guess(3, 'u1', 1, 1, 'N'),
            ZTest_guess(4, 'u2', 1, 2, 'N'),
          ],
        })}
      />,
    )
    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual([])
    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual([])
    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual(['word2'])
  })

  it('a click guesses at once, clears the pick, and hides the ring', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key('ArrowRight')
    await key(' ')
    await user.click(tile(0))
    guessed(0)
    expect(picked()).toEqual([])
    expect(ringed()).toEqual([])

    await key('ArrowDown')
    expect(ringed()).toEqual(['apple'])
  })

  it('the pick goes when its word is turned over', async () => {
    const ctx = makeCtx()
    const { rerender } = render(<WithKeys {...ctx} />)
    await key('ArrowRight')
    await key(' ')
    expect(picked()).toEqual(['apple'])

    // My partner's guess turns it over (sudden death lets both of us guess).
    rerender(<WithKeys {...{ ...makeCtx({ events: [PEER_CLUE, ZTest_guess(2, 'u2', 1, 0, 'G')] }), menu: ctx.menu }} />)
    expect(picked()).toEqual([])
  })

  it('the clue-giver gets no ring and no keys, and no Guess in the key list', async () => {
    render(<WithKeys {...makeCtx(AS_CLUE_GIVER)} />)
    await key('ArrowRight')
    await key(' ')
    await key('Enter')
    expect(ringed()).toEqual([])
    expect(picked()).toEqual([])
    expect(rpc).not.toHaveBeenCalledWith('submit_guess', expect.anything())
    expect(getActions().find((b) => b.id === 'act-submit')?.describe('help').state).toBe('hidden')
  })
})
