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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import { KeyList } from '@/common/actions/KeyList'
import { db } from '../db'
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
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
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
  liveBindings().find((b) => b.id === 'act-toggle-card')?.describe().state

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
    for (const binding of liveBindings()) expect(() => binding.describe()).not.toThrow()
  })
})
