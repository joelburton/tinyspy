// cs-unmet

/**
 * setgame's PlayArea, from the keyboard down.
 *
 * The letters ARE this game's input — a claim is three cards, and typing their
 * addresses is the primary way to pick them (`docs/games/setgame.md` → The
 * keyboard). That path had no test until the keys became bound actions, so this
 * file starts where the risk is: a letter reaches the card sitting in that slot,
 * ⌫ drops the selection, and neither happens in the states where the board is
 * not the player's to touch.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; the board, the info column and the action row render for real. The
 * card ALGEBRA is not retested here — `lib/cards.test.ts` owns that, and
 * `lib/letters.test.ts` owns the slot↔letter map; what this file proves is the
 * wiring between them.
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
import { KeyList } from '@/common/actions/KeyList'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { db } from '../db'
import { ARRIVE_MS, DEPART_MS } from '../lib/flash'
import { PlayArea } from './PlayArea'

/**
 * The shape setgame's useGame returns — DERIVED rather than restated, so a
 * field added to the hook and forgotten here is a type error instead of a fake
 * that silently hands the component `undefined`.
 */
type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope, in the shape `runRpc` unwraps. `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they correctly
 *  scream at rather than accept. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/**
 * Twelve cards whose FIRST THREE are a set and whose next three are not.
 *
 * A card is four base-3 digits (`lib/cards.ts`); 0/1/2 vary one attribute and
 * hold the rest, which is a set, while 0/1/3 do not. Slots are what the
 * keyboard addresses, and the letters run DOWN each column of a fixed 3 × 7
 * grid — so slot 0 is `A`, slot 1 is `H`, slot 2 is `O`, slot 3 is `B`
 * (`lib/letters.ts`).
 */
const BOARD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function loaded(over: Partial<GameHook> = {}): GameHook {
  return {
    game: {
      id: 'g1',
      club_handle: 'club',
      mode: 'coop',
      deck_kind: 'full',
      board: BOARD,
      deck_left: 69,
    },
    players: [{ game_id: 'g1', user_id: 'u1', sets_found: 0, hints_used: 0 }],
    me: { game_id: 'g1', user_id: 'u1', sets_found: 0, hints_used: 0 },
    events: [],
    claims: [],
    lastClaim: null,
    teamFound: 0,
    loading: false,
    failure: null,
    ...over,
  }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'HareTrigger',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { deck: 'full', palette: 'traditional', timer: { kind: 'none' } },
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
 *  Every test here TYPES, and the letters are bound actions: a bare `render`
 *  binds them with nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
}

/** The cards currently drawn as selected. Class names are hashed by the CSS
 *  module, so this asks the way the other games' board tests do. */
const selectedCards = () =>
  Array.from(document.querySelectorAll('button[class*="selected"]'))

/** What a bound action says about itself right now. The board's two keys must
 *  go HIDDEN rather than merely inert where they don't apply: a live-but-doing-
 *  nothing action still swallows the keystroke, which is how it would take the
 *  history viewer's any-key exit away from it. */
const cardKeyState = () =>
  liveBindings().find((b) => b.id === 'act-toggle-card')?.describe('button').state

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
  h.result = loaded()
  rpc.mockReset()
  rpc.mockResolvedValue(okEnvelope({ result: 'claimed', terminal: false }))
})

describe('setgame PlayArea — the letters are the input', () => {
  it('a letter selects the card in that slot; typing it again drops it', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    expect(selectedCards()).toHaveLength(0)

    // `A` is slot 0 and `H` is slot 1 — the letters run down each column, which
    // is the whole reason a letter keeps meaning the same card all game.
    await user.keyboard('a')
    expect(selectedCards()).toHaveLength(1)
    await user.keyboard('h')
    expect(selectedCards()).toHaveLength(2)
    await user.keyboard('h')
    expect(selectedCards()).toHaveLength(1)
  })

  it('the third letter claims — no click needed anywhere', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // Slots 0/1/2 hold cards 0/1/2, which vary one attribute and hold the rest.
    await user.keyboard('aho')
    expect(rpc).toHaveBeenCalledWith('submit_set', expect.objectContaining({ cards: [0, 1, 2] }))
  })

  it('a third card that is not a set is refused here, with no round trip', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // Slots 0/1/3 hold cards 0/1/3 — two attributes moving at once.
    await user.keyboard('ahb')
    expect(screen.getByText('Not a set')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌫ clears the whole selection', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.keyboard('ah')
    expect(selectedCards()).toHaveLength(2)
    await user.keyboard('{Backspace}')
    expect(selectedCards()).toHaveLength(0)
  })

  it('a letter with no card at that slot does nothing', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    // `G` is slot 18 — past the twelve dealt, so there is no card to toggle.
    await user.keyboard('g')
    expect(selectedCards()).toHaveLength(0)
  })
})

/**
 * A claim substitutes cards in place, so the board simply DIFFERS a moment
 * later. The choreography is what tells you: the departing three are held on
 * screen for a beat, and when they finally go the replacements land LIT — and
 * the lit mark is the whole reason a teammate's claim is noticeable at all.
 */
describe('setgame PlayArea — the arrivals are lit when the hold ends', () => {
  /** The cards drawn as freshly arrived. */
  const arrivingCards = () => document.querySelectorAll('button[class*="arriving"]').length
  /** The departing three, held on screen before the swap. */
  const leavingCards = () => document.querySelectorAll('button[class*="leaving"]').length

  it('holds the departing three, then lights the three that replace them', () => {
    vi.useFakeTimers()
    try {
      const ctx = makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })
      h.result = loaded()
      const { rerender } = render(<PlayArea {...ctx} />)
      expect(arrivingCards()).toBe(0)

      // moth claims the first three: the server's board swaps 0,1,2 for 12,13,14
      // and the claim row is what says a MOVE did it.
      const after = [12, 13, 14, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      const claim = {
        id: 1, game_id: 'g1', user_id: 'u2', kind: 'claim' as const,
        cards: [0, 1, 2], board_after: after, created_at: '2026-01-01T00:00:01Z',
      }
      h.result = loaded({ game: { ...loaded().game!, board: after }, lastClaim: claim, claims: [claim] })
      act(() => rerender(<PlayArea {...ctx} />))

      // Beat one: the old three are still there, lit as leaving. Nothing has
      // arrived yet — the point is to see what left.
      expect(leavingCards()).toBe(3)
      expect(arrivingCards()).toBe(0)

      // Beat two: the hold ends, the swap happens, and the replacements are lit.
      act(() => vi.advanceTimersByTime(DEPART_MS))
      expect(arrivingCards()).toBe(3)

      // …and the lit mark takes itself off, leaving a plain board.
      act(() => vi.advanceTimersByTime(ARRIVE_MS))
      expect(arrivingCards()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('setgame PlayArea — when the board is not yours to touch', () => {
  it('a finished board takes no letters, and does not swallow them either', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    await user.keyboard('a')
    expect(selectedCards()).toHaveLength(0)
    expect(cardKeyState()).toBe('hidden')
  })

  it("a teammate's turn takes no letters, and does not swallow them either", async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx({ isMyTurn: false, currentTurnUserId: 'u2' })} />)
    await user.keyboard('a')
    expect(selectedCards()).toHaveLength(0)
    expect(cardKeyState()).toBe('hidden')
  })

  it('an open past turn takes the letters back — the viewer gets the key', async () => {
    // The one that MUST be hidden rather than inert: the viewer's any-key exit
    // is bound outside this board, so a live card key would beat it and toggle
    // a card on a board the player has only just got back.
    const user = userEvent.setup()
    h.result = loaded({
      events: [{
        id: 1, game_id: 'g1', user_id: 'u1', kind: 'claim',
        cards: [0, 1, 2], board_after: BOARD, created_at: '2026-06-15T00:00:00Z',
      }],
      claims: [{
        id: 1, game_id: 'g1', user_id: 'u1', kind: 'claim',
        cards: [0, 1, 2], board_after: BOARD, created_at: '2026-06-15T00:00:00Z',
      }],
      teamFound: 1,
    })
    render(<WithKeys {...makeCtx()} />)
    expect(cardKeyState()).toBe('active')

    await user.click(screen.getByText('#1', { exact: true, selector: 'span' }))
    expect(cardKeyState()).toBe('hidden')
  })
})

describe('setgame PlayArea — before the game has loaded', () => {
  // A binding joins the stack on the FIRST render, before the loading guard
  // has anything to show, and its `describe` can be read right then: the key
  // list asks every live binding when Help opens. So nothing a `describe`
  // names may be derived below the guards — Hint's `isCompete` once was, and
  // opening Help on a loading page threw.
  it('every binding can describe itself while the page is still loading', () => {
    h.result = loaded({ loading: true, game: null, me: null })
    render(
      <>
        <PlayArea {...makeCtx()} />
        <KeyList />
      </>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    for (const binding of liveBindings()) expect(() => binding.describe('button')).not.toThrow()
  })
})

/**
 * The command keys, through the same dispatcher as the letters. Each key is a
 * bound action's, so what these pin is the wiring: the chord reaches the
 * binding, the binding asks the registry's question mid-game and skips it at
 * terminal, and the answer runs the same call the button does.
 */
describe('setgame PlayArea — the command keys', () => {
  const ended = () => makeCtx({ isTerminal: true, playState: 'ended' })

  it('+ at terminal starts the next game with no question', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'created', id: 'fresh-game-id' }))
    const ctx = ended()
    render(<WithKeys {...ctx} />)

    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    press(PLUS)
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'create_game',
        expect.objectContaining({ target_club: 'testclub', player_user_ids: ['u1'], mode: 'coop' }),
      ),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('setgame_coop', 'fresh-game-id'))
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
    h.result = loaded({
      game: { ...loaded().game!, mode: 'compete' },
      players: [
        { game_id: 'g1', user_id: 'u1', sets_found: 0, hints_used: 0 },
        { game_id: 'g1', user_id: 'u2', sets_found: 0, hints_used: 0 },
      ],
    })
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
      expect(rpc).not.toHaveBeenCalled()
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
      render(<PlayArea {...ended()} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    })
  })
})
