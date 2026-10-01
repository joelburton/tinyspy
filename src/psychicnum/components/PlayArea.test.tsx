// cs-blessed-psychicnum

/**
 * Component tests for psychicnum's PlayArea — focused on the per-player
 * CONCEDE flow (compete drop-out) and its coop counterpart (whole-table Stop).
 *
 * psychicnum is an ELIMINATION game: each player has an independent guess
 * budget, so "done for me" (out of budget, or conceded) can happen while the
 * others keep racing. Concede is the deliberate version of that — a real loss
 * that leaves the rest playing (the opposite of coop's stop_game, which stops the
 * game for everyone). These tests pin the wiring: compete offers Concede →
 * psychicnum.concede; coop offers Stop → psychicnum.stop_game; a conceded opponent
 * reads "out" mid-game; and after I concede I get the player-ended look.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the board, Clear/Submit, strip, action row — renders for
 * real. Mirrors wordle's concede tests (the elimination template, commit c1b5df8).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { whereIStand } from '@/common/game-page/whereIStand'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { CONCEDED, gp } from '@/common/members/gamePlayer.fixture'
import type { GamePlayer } from '@/common/members/member'
import type { GameEnding } from '@/common/terminal/gameEnding'
import type { PsychicnumGameStatus, PsychicnumPlayerStatus } from '../lib/statuses'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getBoundActions } from '@/common/actions/boundActionsStore'
import type { ActionId } from '@/common/actions/registry'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import type { EventRow } from '../hooks/useGame'
import { ATTENTION_FADE_MS } from '@/common/board-marks/feedbackTiming'
import { db } from '../db'
import { PlayAreaLoader } from './PlayArea'

/** What psychicnum's own reads bring back: the board, the secrets, the log. */
type Loaded = { words: string[]; secrets: string[] | null; events: EventRow[] }

// A mutable holder the mocked useGame builds `gd` from each render — set per
// test before render(). The rest of `gd` is the context's, built by the real
// `makeGameData` from the real players and setup rows, so a player's counts
// are set on their `player_status` in `makeCtx`, where the page puts them.
// `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so the
// factory can close over it safely.
const h = vi.hoisted(() => ({ loaded: null as unknown as Loaded }))
vi.mock('../hooks/useGame', async (importOriginal) => {
  const real = await importOriginal<typeof import('../hooks/useGame')>()
  const { makeSetupRows } = await import('../lib/setupRows')
  return {
    ...real,
    useGame: (ctx: GamePageCtx) => {
      const playersById = real.makePlayersById(
        ctx.players,
        real.readGameStatus(ctx).required_secrets_count,
      )
      const setupRows = makeSetupRows(real.readSetup(ctx), ctx.mode, ctx.players)
      return {
        gd: real.makeGameData(ctx, h.loaded, playersById, setupRows),
        loading: false,
        failure: null,
      }
    },
  }
})
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** The reads for a board; the log is empty unless a test hands it rows. */
function loaded(board: { words: string[]; secrets: string[] | null }, events: EventRow[] = []): Loaded {
  return { ...board, events }
}

/** A player with the counts their `player_status` carries. */
function counted(id: string, name: string, color: string, found: number, used = 0): GamePlayer {
  return gp(id, name, color, {
    player_status: { found_secrets_count: found, guesses_used: used, player_ended_reason: null },
  })
}

/** A board word list — Board renders a tile per word; needs at least one. */
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo']

/** The two game endings the tests reach for: the set completed, and every
 *  budget spent. */
const GAME_WON: GameEnding = {
  reason: 'reached_goal', reasonDetail: 'solved', outcome: 'won', endedByUserId: 'u1',
}
const GAME_LOST: GameEnding = {
  reason: 'resource_exhausted', reasonDetail: 'exhausted', outcome: 'lost', endedByUserId: 'u1',
}

/** The ending columns of a compete player whose budget ran out, for `gp`'s
 *  `over` — eliminated, so `lost` at once, as `submit_guess` writes it. */
const SPENT = {
  player_ended_at: '2026-09-03T00:00:00Z',
  player_ended_reason: 'resource_exhausted',
  player_ended_reason_detail: 'exhausted',
  outcome: 'lost',
} as const

/** A player's `player_status` as the builder writes it, its reason kept in
 *  step with the player's own column. A fixture player with no status of its
 *  own gets this, so a test sets the ending once. */
function withPlayerStatus(p: GamePlayer): GamePlayer {
  if (Object.keys(p.player_status).length > 0) return p
  const playerStatus: PsychicnumPlayerStatus = {
    found_secrets_count: 0,
    guesses_used: 0,
    player_ended_reason: p.player_ended_reason,
  }
  return { ...p, player_status: playerStatus }
}

/** A play surface's context. Where I stand is DERIVED from the fixture — the
 *  players' endings, `isTerminal`, `isTurnBased` and `turnHolderId` — exactly
 *  as the page derives it (`whereIStand`), so a test sets up the facts and
 *  never hand-writes an answer the page could not give. */
function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  const facts = {
    authSession: { user: { id: 'u1' } } as unknown as GamePageCtx['authSession'],
    isTerminal: false,
    isTurnBased: false,
    turnHolderId: null,
    ...over,
    players: (over.players ?? [gp('u1', 'me', 'red')]).map(withPlayerStatus),
  }
  const gameStatus: PsychicnumGameStatus = { required_secrets_count: 3, max_guesses: 7 }
  return {
    gameId: 'g1',
    mode: 'coop',
    gameEnding: null,
    timer: { displaySeconds: 0, expired: false },
    // A realistic setup blob — the setup rows read `max_guesses` + `band`.
    setup: { max_guesses: 7, word_count: 10, band: 3, timer: { kind: 'none' } },
    gameStatus,
    commonGameUpdatedAt: '2026-09-01T00:00:00Z',
    resubscribeCount: 0,
    globalFeedbackSlot: createFeedbackSlot('global'),
    clubHandle: 'testclub',
    goToFollowUpGame: vi.fn(),
    menu: {
      setGameSections: vi.fn(),
      actHelp: boundActionFixture('act-help'),
      actChat: boundActionFixture('act-open-chat'),
      actBackToClub: boundActionFixture('act-back-to-club'),
    },
    ...facts,
    ...whereIStand({
      players: facts.players,
      myId: facts.authSession.user.id,
      isGameEnded: facts.isTerminal,
      isTurnBased: facts.isTurnBased,
      turnHolderId: facts.turnHolderId,
      draftsOffTurn: false,
    }),
  } as unknown as GamePageCtx
}

// The same board in either mode — the mode is the context's (`makeCtx`), and
// the two names only say which one a test is about.
const coopGame = { words: WORDS, secrets: null as string[] | null }
const competeGame = coopGame

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
const OPT_BACKSPACE = { key: 'Backspace', code: 'Backspace', altKey: true }
const OPT_Z = { key: 'Ω', code: 'KeyZ', altKey: true }

/** The live binding for an action — the same `run` its key, its menu row and
 *  its button all fire. */
const bound = (id: ActionId) => getBoundActions().find((b) => b.id === id)!

/** Answer the open question with the button that says `name`. The trigger can
 *  share the modal's words ("Stop game" / "Stop game"); the modal's is the one
 *  the host adds, so it is last in the DOM. */
async function answer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const buttons = await screen.findAllByRole('button', { name })
  await user.click(buttons[buttons.length - 1]!)
}

/** The board's words in the order they are drawn. */
const boardOrder = () =>
  [...document.querySelectorAll('[data-board] [data-tile]')].map((t) => t.getAttribute('data-tile'))

beforeEach(() => {
  h.loaded = loaded(coopGame)
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('psychicnum PlayArea — concede', () => {
  it('compete shows Concede and calls psychicnum.concede on click', async () => {
    const user = userEvent.setup()
    h.loaded = loaded(competeGame)
    render(
      <>
        <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />
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
    h.loaded = loaded(coopGame)
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

  it('keeps each action button its own tone — the color IS what it means', () => {
    // A regression this actually had: the tones live on the ACTION now (amber
    // for a hint, red for the whole solution, red for an exit), and an
    // action that forgot one came out action-blue like everything else.
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.getByRole('button', { name: 'Hint' }).className).toMatch(/caution/)
    expect(screen.getByRole('button', { name: 'Spoiler' }).className).toMatch(/caution/)
    expect(screen.getByRole('button', { name: 'Stop game' }).className).toMatch(/destructive/)
  })

  it('marks a conceded opponent "out" in the strip', () => {
    h.loaded = loaded(competeGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', CONCEDED)],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('marks an opponent out of guesses "out" too', () => {
    h.loaded = loaded(competeGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', SPENT)],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" player-ended look after I concede', () => {
    h.loaded = loaded(competeGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [gp('u1', 'me', 'red', CONCEDED), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    // The info-column action row swaps to the player-ended LOOK ("You conceded"),
    // and the below-board slot narrates the drop-out ("Conceded — race
    // continues", `buildPlayerEndingMessage`'s pill).
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(screen.getByText(/Conceded — race continues/)).toBeInTheDocument()
  })
})

/**
 * The state readout: the found count and the budget come from each player's
 * counts and the game's budget and secret count, all read off the statuses.
 */
describe('psychicnum PlayArea — the readout', () => {
  // The info column and the mobile strip draw the same line, so read the first.
  const readout = () => screen.getAllByText(/found ·/)[0]!.textContent

  it('sums the coop team\'s finds and guesses across every player, against game_status', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: [counted('u1', 'me', 'red', 1, 3), counted('u2', 'moth', 'blue', 1, 2)],
          gameStatus: { required_secrets_count: 3, max_guesses: 9 },
        })}
      />,
    )
    expect(readout()).toBe('2/3 found · 5/9 guesses used')
  })

  it('counts only my own finds and budget in a race', () => {
    h.loaded = loaded(competeGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [counted('u1', 'me', 'red', 1, 2), counted('u2', 'moth', 'blue', 2, 5)],
        })}
      />,
    )
    expect(readout()).toBe('1/3 found · 2/7 guesses used')
  })
})

/**
 * The celebration — confetti for the win that is MINE, and never on mount.
 * Coop's gate is the ending; compete's adds my own budget row, which is safe
 * only because the loader hands this surface both at once. The reload case is
 * the one `useCelebration`'s first rule exists for.
 */
describe('psychicnum PlayArea — the celebration', () => {
  // Me and moth, with the secrets each has found.
  const two = (mine: number, moths: number) =>
    [counted('u1', 'me', 'red', mine), counted('u2', 'moth', 'blue', moths)]
  const confetti = () => screen.queryByText(/You win!/)

  it('pops for the player who completed the set, even when my count lands a render late', () => {
    h.loaded = loaded(competeGame)
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: two(2, 0) })} />)
    expect(confetti()).toBeNull()

    // The winning guess can reach the client as the ending first and my count
    // after it. Either order is a false→true flip during the session, so the
    // modal pops once.
    rerender(<PlayAreaLoader {...makeCtx({ players: two(2, 0), mode: 'compete', gameEnding: GAME_WON, isTerminal: true })} />)
    expect(confetti()).toBeNull()
    rerender(<PlayAreaLoader {...makeCtx({ players: two(3, 0), mode: 'compete', gameEnding: GAME_WON, isTerminal: true })} />)
    expect(confetti()).toBeInTheDocument()
    expect(screen.getByText('You found all three first.')).toBeInTheDocument()
  })

  it('stays quiet for the player who was beaten', () => {
    h.loaded = loaded(competeGame)
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: two(1, 0) })} />)
    rerender(<PlayAreaLoader {...makeCtx({ players: two(1, 3), mode: 'compete', gameEnding: GAME_WON, isTerminal: true })} />)
    expect(confetti()).toBeNull()
  })

  it('stays quiet on opening a race already won — reviewing is not winning', () => {
    h.loaded = loaded(competeGame)
    render(<PlayAreaLoader {...makeCtx({ players: two(3, 0), mode: 'compete', gameEnding: GAME_WON, isTerminal: true })} />)
    expect(confetti()).toBeNull()
  })

  it('pops for the coop team on the third secret, whoever guessed it', () => {
    h.loaded = loaded(coopGame)
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ players: two(1, 2) })} />)
    rerender(<PlayAreaLoader {...makeCtx({ players: two(1, 2), gameEnding: GAME_WON, isTerminal: true })} />)
    expect(confetti()).toBeInTheDocument()
    expect(screen.getByText('All three secret words found.')).toBeInTheDocument()
  })
})

/**
 * The two beats a guess gets on the board, in order. The attention flash says
 * WHERE the guess landed, and only once it has faded — and the tile's own red
 * is visible under it — does the head-shake say the guess was wrong. A correct
 * guess never shakes: side to side means "not a winning move".
 */
describe('psychicnum PlayArea — a wrong guess is pointed at, then shaken', () => {
  /** The board tile for a word, whatever marks it is wearing. */
  const tileFor = (word: string) =>
    document.querySelector(`[data-tile="${word}"]`) as HTMLElement

  function guessRow(word: string, isCorrect: boolean): EventRow {
    return {
      id: 1, user_id: 'u1', word, is_correct: isCorrect,
      kind: 'guess', created_at: '2026-01-01T00:00:01Z',
    }
  }

  it('flashes the tile, then shakes it once the flash has handed the red back', () => {
    vi.useFakeTimers()
    try {
      h.loaded = loaded(coopGame)
      const ctx = makeCtx()
      const { rerender } = render(<PlayAreaLoader {...ctx} />)

      // The guess lands — a move, so the board points at where it went.
      h.loaded = loaded(coopGame, [guessRow('bravo', false)])
      act(() => rerender(<PlayAreaLoader {...ctx} />))
      expect(tileFor('bravo').className).toMatch(/attentionFlash/)
      expect(tileFor('bravo').className).not.toMatch(/verdictShake/)

      // …and the shake waits for the flash, because it is a remark about the
      // red underneath it.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
      expect(tileFor('bravo').className).toMatch(/verdictShake/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never shakes a correct guess', () => {
    vi.useFakeTimers()
    try {
      h.loaded = loaded(coopGame)
      const ctx = makeCtx()
      const { rerender } = render(<PlayAreaLoader {...ctx} />)
      h.loaded = loaded(coopGame, [guessRow('bravo', true)])
      act(() => rerender(<PlayAreaLoader {...ctx} />))

      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
      expect(tileFor('bravo').className).not.toMatch(/verdictShake/)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('psychicnum PlayArea — turn order', () => {
  it('on a teammate’s turn: shows "Waiting for …" and gates the guess prompt', () => {
    h.loaded = loaded(coopGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isTurnBased: true,
          turnHolderId: 'u2',
        })}
      />,
    )
    // The current player is named TWICE while I wait: the info column's
    // TurnStatusLine (desktop) and the below-board `waiting()` note (the only
    // whose-turn indicator on mobile, where the column is off-canvas). Both
    // render the shared `waitingForText`; a regex because the name sits in a
    // text node beside the identity <Dot>. Coop has no OpponentStrip, but the
    // event log's player picker also lists every player by handle — so exclude
    // its <option> to keep this counting the turn text alone.
    // Exclude the event log's player-picker <option>s AND the Setup options
    // list's <li>s: the list now opens with a "Players: …" roster row (common/setup-form/doc.md →
    // Setup rows), which names everyone too. This counts the TURN TEXT alone.
    const named = screen
      .getAllByText(/moth/)
      .filter((el) => el.tagName !== 'OPTION' && el.tagName !== 'LI')
    expect(named).toHaveLength(2)
    // The "type a word" prompt is hidden while I'm waiting (the entry is inert).
    // But I'm still a live participant — I have NOT ended — so I do NOT get
    // the "Out of guesses" player-ended look, and Hint stays live.
    expect(screen.queryByText(/hit submit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Out of guesses/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hint/i })).toBeInTheDocument()
  })

  it('on my turn: shows "Your turn", the guess prompt, and the play actions', () => {
    h.loaded = loaded(coopGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isTurnBased: true,
          turnHolderId: 'u1',
        })}
      />,
    )
    expect(screen.getByText('Your turn')).toBeInTheDocument()
    expect(screen.getByText(/hit submit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hint/i })).toBeInTheDocument()
  })

  it('free-for-all (no turn order): renders no turn line', () => {
    h.loaded = loaded(coopGame)
    render(
      <PlayAreaLoader
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isTurnBased: false,
          turnHolderId: null,
        })}
      />,
    )
    expect(screen.queryByText('Your turn')).not.toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
  })
})

describe('psychicnum PlayArea — click-to-define (event log)', () => {
  it('makes a guessed word in the log a define affordance (not the hint sentence)', () => {
    h.loaded = loaded(coopGame, [
      { id: 1, user_id: 'u1', word: 'bravo', is_correct: false, kind: 'guess', created_at: '2026-07-02' },
      { id: 2, user_id: 'u1', word: 'a paid assassin', is_correct: false, kind: 'hint', created_at: '2026-07-02' },
    ])
    render(<PlayAreaLoader {...makeCtx()} />)
    // The guessed word is definable...
    const define = screen.getByTitle('Click to define')
    expect(define).toHaveTextContent('BRAVO')
    // POINTER-ONLY: not a tab stop and not announced as a control. Definitions
    // are a convenience on a word you're already pointing at, and the page's
    // tab ring is empty anyway (common/core-css/utilities.css → `.definable`).
    expect(define).not.toHaveAttribute('role')
    expect(define).not.toHaveAttribute('tabindex')
    // ...but the hint sentence is not (only the one define affordance in the log).
    expect(screen.getAllByTitle('Click to define')).toHaveLength(1)
    expect(screen.getByText(/a paid assassin/)).toBeInTheDocument()
  })
})

describe('psychicnum PlayArea — the game menu names the help glyphs', () => {
  /** Flatten what PlayArea handed `menu.setGameSections` into id → item. */
  function menuItems(ctx: GamePageCtx) {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
  }

  // The InfoCol's Hint / Spoiler buttons are ICON-ONLY, so the menu row is the
  // only place their lightbulb and bare eye are named (docs/ui.md → the menu is
  // the legend). A row with no icon would teach nothing, hence the icon assert.
  it('offers Hint + Spoiler rows, each carrying its glyph', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.label).toBe('Hint')
    expect(items.get('act-hint')?.icon).toBeTruthy()
    expect(items.get('act-spoiler')?.label).toBe('Spoiler')
    expect(items.get('act-spoiler')?.icon).toBeTruthy()
  })

  it('the rows fire the same RPCs as the buttons, and gray once I have no guesses left', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    menuItems(ctx).get('act-hint')?.run()
    expect(rpc).toHaveBeenCalledWith('request_hint', { p_game_id: 'g1' })
    menuItems(ctx).get('act-spoiler')?.run()
    expect(rpc).toHaveBeenCalledWith('request_spoiler', { p_game_id: 'g1' })

    // Out of budget in a race that goes on — the server marks me as a player
    // who has ended: disabled, but STILL THERE — a grayed row still teaches its
    // glyph, which is why the pair is never dropped.
    h.loaded = loaded(competeGame)
    const spent = makeCtx({
      mode: 'compete',
      players: [
        gp('u1', 'me', 'red', {
          ...SPENT,
          player_status: { found_secrets_count: 0, guesses_used: 7, player_ended_reason: 'resource_exhausted' },
        }),
        gp('u2', 'moth', 'blue'),
      ],
    })
    render(<PlayAreaLoader {...spent} />)
    const items = menuItems(spent)
    expect(items.get('act-hint')?.disabled).toBe(true)
    expect(items.get('act-spoiler')?.disabled).toBe(true)
  })
})

/**
 * The secrets reveal once the game has ended — the three secret tiles simply go
 * GREEN, the same green a found one wears, and the fact that it's a LOCAL,
 * reversible choice (useSolutionReveal). Nothing reveals them automatically: `replay_board` hunts
 * this same board and these same three secrets again, so a pre-revealed board
 * would leave Restart nothing to find.
 *
 * Green rather than a mark of its own, because revealing is a STATE change:
 * green means "this word is a secret", and asking to see is what makes me know
 * it. Found-vs-peeked stays readable two ways — toggle the reveal off, or look
 * for the guesser's identity dot, which a revealed tile has no reason to
 * carry.
 *
 * Asserted through the tile's `decided_won` class — vitest runs with `css: false`, so
 * CSS-module keys come through unscoped (see vitest.config.ts).
 */
describe('psychicnum PlayArea — the secrets reveal once the game has ended', () => {
  /** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
   *  draw — which is what a bound action and a hand-written row have in common. */
  function menuItems(ctx: GamePageCtx) {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
  }

  /** How many board tiles currently read as secrets (green). With no guesses in
   *  these fixtures, that is exactly the revealed ones. */
  const greenTiles = () =>
    screen.getAllByRole('button').filter((b) => b.className.includes('decided_won')).length

  /** A finished game whose secrets have reached this client (the server sends
   *  them once the game has ended). */
  const ended = () => {
    h.loaded = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    return makeCtx({ isTerminal: true, gameEnding: GAME_LOST })
  }

  it('a coop WIN shows them unasked — the team found all three', () => {
    // The coop half of `solvedByMe`, and a case a per-player bit gets wrong:
    // psychicnum bumps `found_secrets_count` per CALLER, so in a coop game
    // where teammates found 2 and 1 NEITHER row reads three, and a per-player
    // bit would leave the winners pressing Reveal.
    h.loaded = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    render(<PlayAreaLoader {...makeCtx({ isTerminal: true, gameEnding: GAME_WON })} />)
    expect(greenTiles()).toBe(3)
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('draws the reveal in its own red — this uncovers more than one word', () => {
    render(<PlayAreaLoader {...ended()} />)
    expect(screen.getByRole('button', { name: 'Reveal solution' }).className).toMatch(/destructive/)
  })

  it('leaves the secrets hidden until this viewer asks', () => {
    render(<PlayAreaLoader {...ended()} />)
    expect(greenTiles()).toBe(0)
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('Reveal greens the three for me alone — no RPC', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ended()} />)
    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(greenTiles()).toBe(3)
    // Local state: no teammate's board lit up.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides them again, restoring the board as it ended', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ended()} />)
    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(greenTiles()).toBe(0)
  })

  it('the menu twin is the same toggle, and flips its label AND its glyph', async () => {
    // Both faces, because the button beside it is icon-only: there the glyph is
    // the label, and a row that kept the reveal eye while saying "Hide" would
    // teach the wrong glyph (docs/ui.md → the menu is the legend).
    const ctx = ended()
    render(<PlayAreaLoader {...ctx} />)
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')
    const revealFace = menuItems(ctx).get('act-reveal')?.icon
    act(() => menuItems(ctx).get('act-reveal')!.run())
    expect(greenTiles()).toBe(3)
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide solution'))
    expect(menuItems(ctx).get('act-reveal')?.icon).not.toBe(revealFace)
  })

  it('keeps a gray menu row while the board is still yours to hunt, and no button', () => {
    // Revealing is not a question you can ask mid-hunt, so the row is GRAY —
    // but it is there, because the menu is what names the glyph (docs/ui.md →
    // the menu is the legend), exactly as act-hint and act-spoiler are beside
    // it. What the hunt costs it is the BUTTON: the action row's few slots
    // belong to playing.
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    // `menuItems` reads the rows the game PUSHED; `hidden` is what the menu
    // drops when it draws, so that is the flag to assert.
    const row = menuItems(ctx).get('act-reveal')
    expect(row?.hidden).toBe(false)
    expect(row?.disabled).toBe(true)
    expect(row?.label).toBe('Reveal solution')
    expect(screen.queryByRole('button', { name: 'Reveal solution' })).toBeNull()
  })

  it('is named in the menu once it appears', () => {
    // An inert row that fell through to the registry's bare "Reveal" would
    // rename itself as the game ended, which is why both branches name it.
    const ctx = makeCtx({ isTerminal: true, gameEnding: GAME_LOST })
    render(<PlayAreaLoader {...ctx} />)
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')
  })
})

/**
 * The board-scope marks (plans/tile-feedback.md). None of this is game logic, and
 * none of it is visible to a type check: a mark that stops being applied looks
 * exactly like a mark nobody asked for. The identity dot is not pinned here:
 * its rule (a shared board with more than one player on it) is the PlayArea's
 * `decidedBy` condition, read rather than asserted.
 *
 * The board is reached through `[data-board]` rather than a role: psychicnum's grid
 * carries no ARIA role, and adding one to make testing easier would be extending
 * the app's ARIA surface (CLAUDE.md — screen readers are out of scope).
 */
describe('psychicnum PlayArea — the board-scope marks', () => {
  /** The grid element the marks ride on: the board root's only child. */
  const gridIn = (container: HTMLElement) =>
    container.querySelector('[data-board] > div') as HTMLElement

  it('bands the finished board in its outcome', () => {
    h.loaded = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    const { container } = render(<PlayAreaLoader {...makeCtx({ isTerminal: true, gameEnding: GAME_WON })} />)

    expect(gridIn(container).className).toMatch(/endingFrame/)
    expect(gridIn(container).className).toMatch(/endingFrame_won/)
    expect(gridIn(container).className).not.toMatch(/endingFrame_lost/)
  })

  it('frames my board in my own outcome once I have ended, while the race runs on', () => {
    h.loaded = loaded(competeGame)
    const { container } = render(
      <PlayAreaLoader
        {...makeCtx({
          mode: 'compete',
          players: [gp('u1', 'me', 'red', CONCEDED), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    expect(gridIn(container).className).toMatch(/endingFrame_lost/)
  })

  it('leaves a live board unmarked', () => {
    const { container } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(gridIn(container).className).not.toMatch(/endingFrame/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  it('dims the board while a teammate holds the move, and flashes when it arrives', () => {
    const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]
    const { container, rerender } = render(
      <PlayAreaLoader {...makeCtx({ isTurnBased: true, turnHolderId: 'u2', players: two })} />,
    )
    expect(gridIn(container).className).toMatch(/dimNotYourTurn/)
    // An EVENT, so never on mount: opening a game on your own turn is not being
    // handed it.
    expect(gridIn(container).className).not.toMatch(/yourTurnFlash/)

    rerender(<PlayAreaLoader {...makeCtx({ isTurnBased: true, turnHolderId: 'u1', players: two })} />)

    expect(gridIn(container).className).toMatch(/yourTurnFlash/)
    expect(gridIn(container).className).not.toMatch(/dimNotYourTurn/)
  })

  // A selection is "the move I am building". A finished board is a record and
  // a player out of the race builds nothing, so a tile picked just before either
  // moment must not keep the selection border (plans/tile-feedback.md → what a
  // game over does to a mark).
  it('drops a pending selection once the game ends, and once I am out of the race', async () => {
    const user = userEvent.setup()
    const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]
    h.loaded = loaded(competeGame)
    const { container, rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: two })} />)
    const tile = () => within(gridIn(container)).getByRole('button', { name: 'alpha' })

    await user.click(tile())
    expect(tile().className).toMatch(/picked/)

    // A rival's guess ends the race while my pick is still pending.
    h.loaded = loaded({ ...competeGame, secrets: ['alpha', 'charlie', 'echo'] })
    const rivalWon = [gp('u1', 'me', 'red'), counted('u2', 'moth', 'blue', 3)]
    rerender(<PlayAreaLoader {...makeCtx({ players: rivalWon, mode: 'compete', gameEnding: GAME_WON, isTerminal: true })} />)
    expect(tile().className).not.toMatch(/picked/)
  })

  it('drops a pending selection when I concede', async () => {
    const user = userEvent.setup()
    const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]
    h.loaded = loaded(competeGame)
    const { container, rerender } = render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: two })} />)
    const tile = () => within(gridIn(container)).getByRole('button', { name: 'alpha' })

    await user.click(tile())
    expect(tile().className).toMatch(/picked/)

    rerender(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [gp('u1', 'me', 'red', CONCEDED), two[1]] })} />)
    expect(tile().className).not.toMatch(/picked/)
  })

  // The attention flash reads the event log, not the board — so the one board
  // change nobody played into stays silent. Revealing turns three tiles green at
  // once, which a diff would call three simultaneous moves.
  it('says nothing when the answer is revealed', async () => {
    const user = userEvent.setup()
    h.loaded = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    const { container } = render(<PlayAreaLoader {...makeCtx({ isTerminal: true, gameEnding: GAME_LOST })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))

    const tiles = within(gridIn(container)).getAllByRole('button')
    // The three secrets went green…
    expect(tiles.filter((t) => t.className.includes('decided_won'))).toHaveLength(3)
    // …and not one of them flashed.
    expect(tiles.some((t) => /attentionFlash/.test(t.className))).toBe(false)
  })
})

/**
 * The keys, through the app-root dispatcher. Each key is a bound action's, so
 * what these pin is the wiring: the chord reaches the binding, the binding asks
 * the registry's question mid-game and skips it once the game has ended, and
 * the answer runs the same RPC the button does.
 */
describe('psychicnum PlayArea — the keys', () => {
  const ended = () => {
    h.loaded = loaded({ ...coopGame, secrets: ['alpha', 'charlie', 'echo'] })
    return makeCtx({ isTerminal: true, gameEnding: GAME_LOST })
  }

  it('+ once the game has ended starts the next game with no question', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'created', id: 'fresh-game-id' }))
    const ctx = ended()
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
    expect(rpc).not.toHaveBeenCalledWith('create_game', expect.anything())
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
    h.loaded = loaded(competeGame)
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />
        <ConfirmationHost />
      </>,
    )

    press(OPT_BACKSPACE)
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await answer(user, 'Concede')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('stop_game', expect.anything())
  })

  describe('⌥Z shuffles the board', () => {
    // The shuffle is Fisher–Yates over the ORIGINAL words on `Math.random`, so
    // a pinned value is a fixed permutation: 0 rotates the list, ~1 leaves it
    // alone. Pinning one for the render and the other for the press makes
    // "the same words in a different order" a deterministic claim rather than
    // a 1-in-120 flake.
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })
    const nextShuffleDiffers = () => vi.spyOn(Math, 'random').mockReturnValue(0.999999)

    // Awaited: the bound run is async (single-flight, then the question that
    // isn't asked here), so the re-order lands a tick after the keystroke.
    it('rearranges the same words mid-game, with no round trip', async () => {
      render(<WithKeys {...makeCtx()} />)
      const before = boardOrder()
      expect(before).toHaveLength(WORDS.length)

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      const after = boardOrder()
      expect(after).not.toEqual(before)
      expect([...after].sort()).toEqual([...before].sort())
      expect(rpc).not.toHaveBeenCalled()
    })

    it('still works on a finished board — the fidget is deliberate', async () => {
      render(<WithKeys {...ended()} />)
      expect(bound('act-shuffle').describe('button').state).toBe('active')
      const before = boardOrder()

      nextShuffleDiffers()
      await act(async () => press(OPT_Z))
      expect(boardOrder()).not.toEqual(before)
    })
  })

  describe('Restart', () => {
    // Keyless, so it is fired as the menu row would fire it: the bound run, which
    // is where the registry's question is asked.
    it('mid-game asks first, and Keep playing wipes nothing', async () => {
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

    it('mid-game, yes calls replay_board', async () => {
      const user = userEvent.setup()
      render(
        <>
          <PlayAreaLoader {...makeCtx()} />
          <ConfirmationHost />
        </>,
      )

      act(() => bound('act-restart').run())
      await answer(user, 'Restart')
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    })

    it('once the game has ended the button goes straight through', async () => {
      const user = userEvent.setup()
      render(<PlayAreaLoader {...ended()} />)

      await user.click(screen.getByRole('button', { name: 'Restart' }))
      // No <ConfirmationHost/> is mounted, so a question would have been
      // answered "no" — the RPC firing proves none was asked.
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    })
  })
})

describe('psychicnum PlayArea — the selection cursor', () => {
  // A shuffle on ~1 leaves the words in dealt order, so five words lay out
  //   alpha   bravo  charlie
  //   delta   echo
  // and a cell names a known word.
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    rpc.mockResolvedValue(okEnvelope({ result: 'hit', found_all: false }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const tileFor = (word: string) => document.querySelector(`[data-tile="${word}"]`) as HTMLElement
  /** The words wearing the cursor ring — at most one. */
  const ringed = () => WORDS.filter((w) => /selectionCursor/.test(tileFor(w).className))
  const isPicked = (word: string) => /picked/.test(tileFor(word).className)
  // Awaited: a bound action's run settles a microtask after the keystroke.
  const key = (k: string) => act(async () => press({ key: k }))
  const guessed = (word: string) =>
    waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: word }))

  it('is hidden until an arrow; the first arrow rings the first tile, the next moves it', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(ringed()).toEqual([])

    await key('ArrowRight')
    expect(ringed()).toEqual(['alpha'])
    await key('ArrowRight')
    expect(ringed()).toEqual(['bravo'])
    await key('ArrowDown')
    expect(ringed()).toEqual(['echo'])
  })

  // The short last row is a wall, not a way round.
  it('stays put where the last row is short', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key('ArrowRight')
    await key('ArrowRight')
    expect(ringed()).toEqual(['charlie'])
    await key('ArrowDown')
    expect(ringed()).toEqual(['charlie'])
  })

  it('Space does nothing while the ring is hidden, then picks and un-picks the ringed word', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key(' ')
    expect(WORDS.filter(isPicked)).toEqual([])
    expect(ringed()).toEqual([])

    await key('ArrowDown')
    await key('ArrowDown')
    await key(' ')
    expect(WORDS.filter(isPicked)).toEqual(['delta'])
    await key(' ')
    expect(WORDS.filter(isPicked)).toEqual([])
  })

  it('Enter guesses the picked word', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await key('ArrowRight')
    await key(' ')
    await key('Enter')
    await guessed('bravo')
  })

  // The pick is always drawn, so Enter sends it with the ring hidden.
  it('a click picks the tile and hides the ring; Enter then guesses it', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await user.click(tileFor('charlie'))
    expect(ringed()).toEqual([])
    expect(isPicked('charlie')).toBe(true)

    await key('Enter')
    await guessed('charlie')
  })

  it('the next arrow after a click rings the clicked tile', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.click(tileFor('echo'))
    await key('ArrowLeft')
    expect(ringed()).toEqual(['echo'])
  })

  it('⌫ and Clear picks un-pick; Submit guesses', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await user.click(tileFor('alpha'))
    await key('Backspace')
    expect(isPicked('alpha')).toBe(false)

    await user.click(tileFor('alpha'))
    await user.click(screen.getByRole('button', { name: 'Clear picks' }))
    expect(isPicked('alpha')).toBe(false)

    await user.click(tileFor('alpha'))
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await guessed('alpha')
  })

  // The guard against sending twice: a second word picked while the first
  // guess is still out with the server cannot be sent until the answer is in.
  it('Submit stays disabled while a guess is out with the server', async () => {
    let answerFirstGuess: (value: unknown) => void = () => {}
    rpc.mockImplementationOnce(() => new Promise((resolve) => { answerFirstGuess = resolve }))
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)

    await user.click(tileFor('alpha'))
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await user.click(tileFor('bravo'))
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    await key('Enter')
    expect(rpc).toHaveBeenCalledTimes(1)

    // Once the answer is in (its pill takes the button's place), Enter sends
    // the second word.
    await act(async () => answerFirstGuess(okEnvelope({ result: 'miss', found_all: false })))
    await key('Enter')
    await guessed('bravo')
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('Space passes over a decided tile', async () => {
    h.loaded = loaded(coopGame, [
      { id: 1, user_id: 'u1', word: 'alpha', is_correct: false, kind: 'guess', created_at: '2026-01-01T00:00:01Z' },
    ])
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    expect(ringed()).toEqual(['alpha'])
    await key(' ')
    expect(isPicked('alpha')).toBe(false)
  })

  it('a board I cannot play takes no ring and no keys', async () => {
    // A teammate holds the move.
    render(
      <WithKeys
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isTurnBased: true,
          turnHolderId: 'u2',
        })}
      />,
    )
    await key('ArrowRight')
    await key(' ')
    await key('Enter')
    expect(ringed()).toEqual([])
    expect(WORDS.filter(isPicked)).toEqual([])
    expect(rpc).not.toHaveBeenCalledWith('submit_guess', expect.anything())
  })
})
