// cs-unmet

/**
 * Render + behavior tests for stackdown's PlayArea, focused on the per-player
 * **concede** flow (the compete drop-out that replaced the whole-table End).
 *
 * Why this exists: concede branches the action row, the OpponentStrip metric,
 * and the "locally terminal" look by mode + per-player flag — glue a `tsc` pass
 * wouldn't catch (the root tsconfig checks nothing — see memory
 * project_typecheck_use_tsc_b). These prove the tree mounts in each mode AND
 * that the concede wiring is right: compete shows Concede and calls
 * `stackdown.concede`, coop shows End and calls `end_game`, a conceded opponent
 * reads "out" in the strip, and my own concede flips to the "You conceded" look.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; the board, entry row, opponent strip, and log all render real.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import type { StackdownGame, PlayerRow, SubmissionRow } from '../hooks/useGame'
import type { Tile } from '../lib/board'
import { ATTENTION_FADE_MS, WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// The mocked useGame's full return shape — a mutable holder set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** A tiny 3-tile board — enough for the tree to render; the concede tests don't
 *  interact with the tiles. */
const tiles: Tile[] = [
  { id: 1, x: 0, y: 0, z: 0, letter: 'C' },
  { id: 2, x: 1, y: 0, z: 0, letter: 'A' },
  { id: 3, x: 2, y: 0, z: 0, letter: 'T' },
]

/** A loaded game; override the mode per test. */
function loadedGame(over: Partial<StackdownGame> = {}): StackdownGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    tiles,
    created_at: '2026-01-01T00:00:00Z',
    solution: null,
    ...over,
  }
}

/** The full useGame hook return, with `players` (the public per-player tally) and
 *  the local-word actions stubbed. */
function loaded(game: StackdownGame, players: PlayerRow[] = []): GameHook {
  return {
    game,
    players,
    submissions: [],
    removedTileIds: new Set<number>(),
    currentWord: [],
    appendTile: vi.fn(() => null),
    retractTo: vi.fn(),
    clearWord: vi.fn(),
    commitWord: vi.fn(),
    loading: false,
    failure: null,
  }
}

/** The public per-player tally row (stackdown.players). */
function playerRow(user_id: string, over: Partial<PlayerRow> = {}): PlayerRow {
  return { user_id, found_count: 0, solved: false, solved_at: null, ...over }
}

/** The "#N" handle in the log row holding `cell` — by its marker, never by its
 *  wording (the shared `<TurnLogNumber>` sets `data-history-handle`). */
const handleIn = (cell: HTMLElement) =>
  within(cell.closest('tr')!).getByText(/^#\d+$/)

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]
const twoRows = [playerRow('u1'), playerRow('u2')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'StackDown',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { timer: { kind: 'none' } },
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

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would draw
 *  — a row is a bound action now, so its words, glyph and availability come from
 *  the action rather than from the list. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the board's tile keys are bound actions, and a
 *  bare `render` binds them with nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
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

/** What a bound action says about itself right now. */
const stateOf = (id: string) => liveBindings().find((b) => b.id === id)?.describe('button').state

/** The five word slots, as the letters they hold. */
const wordSlots = () => screen.getByLabelText('Current word').textContent ?? ''

beforeEach(() => {
  h.result = loaded(loadedGame(), [playerRow('u1')])
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('stackdown PlayArea — concede', () => {
  it('compete shows Concede and calls stackdown.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
    render(
      <>
        <PlayArea {...makeCtx({ players: twoMembers })} />
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
        <PlayArea {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    // The trigger and the modal's confirm now share the name "End game" (the
    // button label went from "End" to the full phrase, since icon-only buttons
    // make the label the accessible name). The confirm is the one the dialog
    // adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'End game' }))
    const confirms = await screen.findAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

/** An envelope carrying a hint. `runRpc` reads the envelope out of `data`, so a
 *  mock resolving the bare hint string hands it a body it can't read and the
 *  call site sees a fault. */
function hintEnvelope(hint: string) {
  return {
    data: {
      type: 'ok', data: { result: 'hint', hint }, outcome: 'warning', severity: null,
      message: null, field: null, meta: null, dbcode: null, detail: null,
    },
    error: null,
  }
}

describe('stackdown PlayArea — hint', () => {
  it('surfaces the clue when the next word has a hint', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    rpc.mockResolvedValueOnce(hintEnvelope('a fruit'))
    await user.click(screen.getByRole('button', { name: 'Hint for next word' }))
    expect(rpc).toHaveBeenCalledWith('reveal_next_hint', { target_game: 'g1' })
    expect(await screen.findByText('Hint: a fruit')).toBeInTheDocument()
  })

  it("a not-ok answer shows the server's sentence, not a hint line", async () => {
    // The hint button's refusal path. There is no "no hint for this word"
    // answer any more — a hintless word is a fault the server shouts about —
    // so what a player can actually meet here is the game ending mid-request.
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    rpc.mockResolvedValueOnce({
      data: {
        type: 'not-ok', data: null, outcome: null, severity: 'race',
        message: 'Game over', field: null, meta: null, dbcode: 'PN296', detail: null,
      },
      error: null,
    })
    await user.click(screen.getByRole('button', { name: 'Hint for next word' }))
    expect(await screen.findByText('Game over')).toBeInTheDocument()
    expect(screen.queryByText(/^Hint:/)).not.toBeInTheDocument()
  })
})

/**
 * Turn-history viewer (docs/playarea.md). Clicking a
 * log row replays that turn's board; a keystroke / click returns to live. These
 * prove the cross-column seam is wired right — the snapshot logic itself is
 * unit-tested in lib/history.test.ts. Eight uniquely-lettered tiles so we can
 * probe a single cleared tile by its letter (L is in the cleared word CLEAR, not
 * in the remaining M/O/T).
 */
describe('stackdown PlayArea — turn-history viewer', () => {
  const historyTiles: Tile[] = [
    { id: 1, x: 0, y: 0, z: 0, letter: 'C' },
    { id: 2, x: 1, y: 0, z: 0, letter: 'L' },
    { id: 3, x: 2, y: 0, z: 0, letter: 'E' },
    { id: 4, x: 3, y: 0, z: 0, letter: 'A' },
    { id: 5, x: 4, y: 0, z: 0, letter: 'R' },
    { id: 6, x: 5, y: 0, z: 0, letter: 'M' },
    { id: 7, x: 6, y: 0, z: 0, letter: 'O' },
    { id: 8, x: 7, y: 0, z: 0, letter: 'T' },
  ]
  // A valid word cleared tiles 1..5 (CLEAR), then a hint was requested. Coop, so
  // the log shows both, in submitted_at order (index 0 = the word, 1 = the hint).
  const submissions: SubmissionRow[] = [
    { user_id: 'u2', id: 1, kind: 'word', word: 'clear', tile_ids: [1, 2, 3, 4, 5], valid: true, created_at: '2026-01-01T00:00:01Z' },
    { user_id: 'u1', id: 1, kind: 'hint', word: 'a fruit', tile_ids: null, valid: null, created_at: '2026-01-01T00:00:02Z' },
  ]

  /** A loaded coop hook whose board is the 8-tile fixture with CLEAR's tiles
   *  already off the live board. */
  function historyHook(): GameHook {
    return {
      ...loaded(loadedGame({ mode: 'coop', tiles: historyTiles }), twoRows),
      submissions,
      removedTileIds: new Set([1, 2, 3, 4, 5]),
    }
  }

  // The keystroke half needs the dispatcher: exiting the viewer is the hook's own
  // bound action now, and the board's tile keys go DISABLED while a turn is open
  // so the press falls through to it.
  it('clicking a word row replays that turn; a keystroke returns to live', async () => {
    const user = userEvent.setup()
    h.result = historyHook()
    render(<WithKeys {...makeCtx({ players: twoMembers })} />)

    // Live: CLEAR's tiles are off the board (L is one of them).
    expect(screen.queryByText('L')).not.toBeInTheDocument()

    // Open the viewer via the turn's "#N" handle (the click target is the number,
    // not the row). Found by its marker rather than its words: the row also holds
    // a definable word, and matching on wording breaks when the wording changes.
    await user.click(handleIn(screen.getByText('CLEAR')))

    // Viewing turn 0: the viewer banner shows the description, and CLEAR's
    // tiles are back on the historical board (nothing was cleared before it).
    expect(screen.getByText('Cleared CLEAR')).toBeInTheDocument()
    expect(screen.getByText('L')).toBeInTheDocument()

    // Any key returns to live — the banner clears and the tiles leave again.
    await user.keyboard('x')
    expect(screen.queryByText('Cleared CLEAR')).not.toBeInTheDocument()
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })

  it('viewing a later (hint) turn shows the board AS OF that turn — earlier word already cleared', async () => {
    const user = userEvent.setup()
    h.result = historyHook()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    await user.click(handleIn(screen.getByText('Hint: a fruit')))

    // The hint's description now also appears in the banner (2 = log row + banner).
    expect(screen.getAllByText('Hint: a fruit')).toHaveLength(2)
    // A hint cleared nothing, and CLEAR (before it) had — so the historical board
    // still has CLEAR's tiles OFF (strictly-before boundary).
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })
})

describe('stackdown PlayArea — the game menu names the cheat glyphs', () => {
  // Both cheats are ICON-ONLY buttons in the info column, so the menu row is the
  // only place their lightbulb and bare eye get named (docs/ui.md → the menu is
  // the legend) — a row without its glyph would teach nothing.
  it('offers Hint + Spoiler rows carrying their glyphs, wired to the same RPCs', async () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.label).toBe('Hint for next word')
    expect(items.get('act-hint')?.icon).toBeTruthy()
    expect(items.get('act-spoiler')?.label).toBe('Cheat for next word')
    expect(items.get('act-spoiler')?.icon).toBeTruthy()

    items.get('act-hint')?.run()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reveal_next_hint', { target_game: 'g1' }))
    items.get('act-spoiler')?.run()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reveal_next_word', { target_game: 'g1' }))
  })

  it('grays the pair at terminal — disabled, never dropped, so the glyph still reads', () => {
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.disabled).toBe(true)
    expect(items.get('act-spoiler')?.disabled).toBe(true)
  })
})

/**
 * The terminal solution reveal — the six words, and the fact that seeing them
 * is a LOCAL, reversible choice (useSolutionReveal). Nothing autoreveals, a win
 * included: `replay_board` runs this very stack back with the same solution, so
 * an answer left on screen would make Restart theater.
 */
describe('stackdown PlayArea — the terminal solution reveal', () => {
  /** A finished game whose six words have reached this client (the server
   *  unshields `solution` at is_terminal — stackdown._solution_for). */
  const solved = () =>
    loaded(loadedGame({ solution: ['clamp', 'trick', 'shove', 'plaid', 'gruff', 'wince'] }), [
      playerRow('u1'),
    ])

  it('hides the words at a terminal NOBODY solved', () => {
    h.result = solved()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    expect(screen.queryByText(/CLAMP/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('a coop WIN shows them unasked — the stack was cleared, so you saw all six', () => {
    // The coop half of `solvedByMe`, and the case this shipped broken:
    // stackdown writes `players.solved` only in COMPETE, so a per-player bit
    // would read false here and leave the solver pressing Reveal for words
    // they'd just played.
    h.result = solved()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByText(/CLAMP/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('Reveal shows them for me alone — no RPC, nothing written', async () => {
    const user = userEvent.setup()
    h.result = solved()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(screen.getByText(/CLAMP/)).toBeInTheDocument()
    // The absent RPC is the assertion: no peer's board opened.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides them again, restoring the column as the game ended', async () => {
    const user = userEvent.setup()
    h.result = solved()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText(/CLAMP/)).not.toBeInTheDocument()
  })

  it('the menu twin is the same toggle and flips its label along with it', async () => {
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    h.result = solved()
    render(<PlayArea {...ctx} />)

    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')
    act(() => menuItems(ctx).get('act-reveal')!.run())
    expect(screen.getByText(/CLAMP/)).toBeInTheDocument()
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide solution'))
  })

  it('the menu twin is inert before the game is over for everyone', () => {
    const ctx = makeCtx({ isTerminal: false, playState: 'playing' })
    render(<PlayArea {...ctx} />)
    // Nothing to show: the words don't reach this client until is_terminal, so
    // a player who dropped out can't spoil a race still running.
    expect(menuItems(ctx).get('act-reveal')?.disabled).toBe(true)
  })

  it('a Restart puts the words away again', async () => {
    const user = userEvent.setup()
    h.result = solved()
    const { rerender } = render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(screen.getByText(/CLAMP/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
    // The same stack and the same six words — and nothing on the server
    // remembers the reveal now, so the re-hide is local and explicit.
    h.result = loaded(loadedGame(), [playerRow('u1')])
    rerender(<PlayArea {...makeCtx()} />)
    expect(screen.queryByText(/CLAMP/)).not.toBeInTheDocument()
  })
})

/**
 * The board's three keys, through the dispatcher. The word itself lives in
 * `useGame` (mocked), so what a key DOES is asserted on the hook's stubs —
 * `appendTile` / `retractTo` — and the word growing is shown by handing the
 * hook's answer back on a rerender, the way the realtime refetch would.
 */
describe('stackdown PlayArea — the board keys', () => {
  /** Five exposed, uniquely-lettered tiles, so a letter names exactly one. */
  const five: Tile[] = [
    { id: 1, x: 0, y: 0, z: 0, letter: 'C' },
    { id: 2, x: 1, y: 0, z: 0, letter: 'L' },
    { id: 3, x: 2, y: 0, z: 0, letter: 'E' },
    { id: 4, x: 3, y: 0, z: 0, letter: 'A' },
    { id: 5, x: 4, y: 0, z: 0, letter: 'R' },
  ]

  it('a letter picks the exposed tile bearing it, and the word grows', async () => {
    h.result = loaded(loadedGame({ tiles: five }), [playerRow('u1')])
    const { rerender } = render(<WithKeys {...makeCtx()} />)
    expect(wordSlots()).toBe('')

    await press({ key: 'a' })
    expect(h.result.appendTile).toHaveBeenCalledWith(4)

    // The hook answers with the tile in the word; the slot draws it.
    h.result = { ...h.result, currentWord: [4] }
    rerender(<WithKeys {...makeCtx()} />)
    expect(wordSlots()).toBe('A')
  })

  it('a letter no exposed tile bears is refused in the pill', async () => {
    h.result = loaded(loadedGame({ tiles: five }), [playerRow('u1')])
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'z' })
    expect(h.result.appendTile).not.toHaveBeenCalled()
    expect(screen.getByText('No “Z” tile is on top')).toBeInTheDocument()
  })

  it('⌫ returns the last tile, and is gray with nothing picked up', async () => {
    h.result = loaded(loadedGame({ tiles: five }), [playerRow('u1')])
    const { rerender } = render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-delete-last')).toBe('disabled')
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(h.result.retractTo).not.toHaveBeenCalled()

    h.result = { ...h.result, currentWord: [1, 2] }
    rerender(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-delete-last')).toBe('active')
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(h.result.retractTo).toHaveBeenCalledWith(1)
  })

  it('Enter submits five tiles, and is gray with fewer', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'accepted', word: 'clear' }))
    h.result = { ...loaded(loadedGame({ tiles: five }), [playerRow('u1')]), currentWord: [1, 2] }
    const { rerender } = render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-submit')).toBe('disabled')
    await press({ key: 'Enter', code: 'Enter' })
    expect(rpc).not.toHaveBeenCalled()

    h.result = { ...h.result, currentWord: [1, 2, 3, 4, 5] }
    rerender(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-submit')).toBe('active')
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_word', { target_game: 'g1', tile_ids: [1, 2, 3, 4, 5] }),
    )
  })

  it('a refused word answers in the slots, holds its tiles off the board, then sends them home flashing', async () => {
    vi.useFakeTimers()
    try {
      // NOT A WORD: an `ok` whose data says `invalid`, with the outcome and the
      // sentence on the envelope — no tile moved, so nothing was cleared.
      rpc.mockResolvedValue({
        data: {
          type: 'ok', data: { result: 'invalid' }, outcome: 'lost', severity: null,
          message: 'CLEAR is not a word', field: null, meta: null, dbcode: null, detail: null,
        },
        error: null,
      })
      h.result = { ...loaded(loadedGame({ tiles: five }), [playerRow('u1')]), currentWord: [1, 2, 3, 4, 5] }
      const ctx = makeCtx()
      const { rerender } = render(<WithKeys {...ctx} />)
      await press({ key: 'Enter', code: 'Enter' })
      // Let the answer arrive: the mock resolves in microtasks, not on a timer.
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      // The answer, where the eye already is: the slots wear the refusal and
      // shake. The word is still in them — its tiles are NOT back on the board.
      const slotC = screen.getByText('C')
      expect(slotC.className).toMatch(/verdictLost/)
      expect(slotC.className).toMatch(/verdictShake/)
      expect(h.result.clearWord).not.toHaveBeenCalled()

      // Held for the whole answer beat, and not a moment less.
      act(() => vi.advanceTimersByTime(WORD_ANSWER_MS - 1))
      expect(h.result.clearWord).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(h.result.clearWord).toHaveBeenCalledTimes(1)

      // The word is cleared (the hook's answer, handed back as a refetch would),
      // and the tiles land back on the board wearing the attention flash — the
      // eye follows them home — with the slots' verdict gone.
      h.result = { ...h.result, currentWord: [] }
      act(() => rerender(<WithKeys {...ctx} />))
      const tileC = screen.getByText('C').parentElement as HTMLElement
      expect(tileC.className).toMatch(/attentionFlash/)
      expect(screen.getByLabelText('Current word').innerHTML).not.toMatch(/verdictLost/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the result clears on any key, even one nothing binds', async () => {
    h.result = loaded(loadedGame({ tiles: five }), [playerRow('u1')])
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'z' })
    expect(screen.getByText('No “Z” tile is on top')).toBeInTheDocument()

    // F9 is nobody's key. The dismiss watcher still runs on it — it claims
    // nothing, so it is consulted on every keystroke there is.
    await press({ key: 'F9', code: 'F9' })
    expect(screen.queryByText('No “Z” tile is on top')).not.toBeInTheDocument()
  })
})

/**
 * The commands through the dispatcher — `+` and `⌥⌫` — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('stackdown PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ at terminal claims the next board with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ error: null, data: null }),
    )
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        target_club: 'testclub',
        setup: ctx.setup,
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('stackdown_coop', 'next-game-id'))
  })

  it('+ mid-game asks first, and cancel claims nothing', async () => {
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

  it('⌥⌫ in coop asks End game’s question; yes calls end_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('End this game?')).toBeInTheDocument()
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = screen.getAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
    render(
      <>
        <WithKeys {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
  })

  it('Restart mid-game asks before wiping the stack', async () => {
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(
      <>
        <PlayArea {...ctx} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(ctx).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * A teammate's accepted word, end to end on the board: their tiles take the
 * attention flash, then the answer's color, and only then do they go.
 *
 * Fake timers, because the whole sequence is three beats on two clocks.
 */
describe('stackdown PlayArea — a teammate’s word on the board', () => {
  /** Five tiles in a row on the upper layer, with one buried under the first of
   *  them: clearing the five is what makes the sixth reachable. */
  const stacked: Tile[] = [
    { id: 1, x: 0, y: 0, z: 1, letter: 'C' },
    { id: 2, x: 2, y: 0, z: 1, letter: 'L' },
    { id: 3, x: 4, y: 0, z: 1, letter: 'E' },
    { id: 4, x: 6, y: 0, z: 1, letter: 'A' },
    { id: 5, x: 8, y: 0, z: 1, letter: 'R' },
    { id: 6, x: 0, y: 0, z: 0, letter: 'Z' },
  ]
  const peerWord: SubmissionRow = {
    user_id: 'u2',
    id: 1,
    kind: 'word',
    word: 'clear',
    tile_ids: [1, 2, 3, 4, 5],
    valid: true,
    created_at: '2026-01-01T00:00:01Z',
  }
  const tileFor = (letter: string) => screen.getByText(letter).parentElement as HTMLElement

  it('marks their tiles, holds them while the answer shows, then lets them go', () => {
    vi.useFakeTimers()
    try {
      h.result = loaded(loadedGame({ mode: 'coop', tiles: stacked }), twoRows)
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = render(<PlayArea {...ctx} />)
      // Z is buried under C, so it is not even drawn as reachable yet.
      expect(tileFor('C').className).not.toMatch(/attentionFlash/)

      // moth's word lands: the row arrives and its tiles are gone server-side.
      h.result = {
        ...loaded(loadedGame({ mode: 'coop', tiles: stacked }), twoRows),
        submissions: [peerWord],
        removedTileIds: new Set([1, 2, 3, 4, 5]),
      }
      act(() => rerender(<PlayArea {...ctx} />))

      // Beat one: the tiles are still on the board, wearing the attention flash.
      expect(tileFor('C').className).toMatch(/attentionFlash/)

      // Beat three: the hold ends and the five leave.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + WORD_ANSWER_MS + 10))
      expect(screen.queryByText('C')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('stackdown PlayArea — a teammate’s refused word', () => {
  const row: Tile[] = [
    { id: 1, x: 0, y: 0, z: 1, letter: 'C' },
    { id: 2, x: 2, y: 0, z: 1, letter: 'L' },
    { id: 3, x: 4, y: 0, z: 1, letter: 'E' },
    { id: 4, x: 6, y: 0, z: 1, letter: 'A' },
    { id: 5, x: 8, y: 0, z: 1, letter: 'R' },
  ]

  it('marks their tiles on the board: attention first, then the answer', () => {
    vi.useFakeTimers()
    try {
      h.result = loaded(loadedGame({ mode: 'coop', tiles: row }), twoRows)
      const ctx = makeCtx({ players: twoMembers })
      const { rerender } = render(<PlayArea {...ctx} />)

      // moth tried a word and was refused: the row lands, nothing was cleared.
      h.result = {
        ...loaded(loadedGame({ mode: 'coop', tiles: row }), twoRows),
        submissions: [{
          user_id: 'u2', id: 1, kind: 'word', word: 'clear',
          tile_ids: [1, 2, 3, 4, 5], valid: false,
          created_at: '2026-01-01T00:00:01Z',
        }],
      }
      act(() => rerender(<PlayArea {...ctx} />))
      expect((screen.getByText('C').parentElement as HTMLElement).className).toMatch(
        /attentionFlash/,
      )

      // Once the flash has faded, the answer: the tiles keep their place (nothing
      // was cleared) and wear the refusal — which shakes.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + 10))
      const tile = screen.getByText('C').parentElement as HTMLElement
      expect(tile.className).toMatch(/verdictShake/)
      expect(tile.getAttribute('style')).toMatch(/outcomes-lost-fill-color/)
    } finally {
      vi.useRealTimers()
    }
  })
})
