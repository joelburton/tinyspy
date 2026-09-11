// cs-unmet

/**
 * Render smoke + wiring tests for crosswords' PlayArea — the one game that
 * lacked a PlayArea test (every sibling has one). Deliberately shallow: the
 * game logic lives in pgTAP (the RPCs) and the lib unit tests (`cursor`,
 * `enumeration`, `useCells`); here we only prove the coordinator mounts and
 * wires the right affordances per mode / play-state.
 *
 * The three live-data hooks (`useGame`, `useCells`, `usePeerCursors`) and `db`
 * are mocked so no client/network is needed; the Grid, ClueLists, Controls,
 * keyboard, and menu wiring all render for real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { KeyList } from '@/common/actions/KeyList'
import { liveBindings } from '@/common/actions/useBoundAction'
import { menuRow, type MenuRow, type MenuSection } from '@/common/menu/menuModel'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { gp } from '@/common/members/gamePlayer.fixture'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { CrosswordsGame } from '../hooks/useGame'
import type { CellsMap, CellState } from '../hooks/useCells'
import type { PuzzleTemplate } from '../lib/types'
import { PlayArea } from './PlayArea'

// Only `runEdgeFn` is stubbed — the AI explainer's transport. `runRpc` stays
// REAL so every RPC path exercises the envelope it actually receives.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))
const edgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

// jsdom doesn't implement scrollIntoView (ClueLists keeps the active clue in
// view). Stub it so the effect is a no-op instead of throwing.
Element.prototype.scrollIntoView = vi.fn()

// A mutable holder each mocked hook reads per render — set before render().
const h = vi.hoisted(() => ({
  game: null as CrosswordsGame | null,
  cells: new Map() as CellsMap,
  setCell: vi.fn(),
  setMark: vi.fn(),
  rpc: vi.fn(),
  broadcastFills: vi.fn(),
  broadcastNote: vi.fn(),
}))

vi.mock('../hooks/useGame', () => ({ useGame: () => ({ game: h.game, loading: false }) }))
vi.mock('../hooks/useCells', () => ({
  // cellKey is imported alongside useCells by PlayArea — keep the real one.
  ...vi.importActual('../hooks/useCells'),
  cellKey: (row: number, col: number) => `${row}:${col}`,
  useCells: () => ({ cells: h.cells, setCell: h.setCell, setMark: h.setMark }),
}))
vi.mock('../hooks/usePeerCursors', () => ({
  usePeerCursors: () => ({
    peers: new Map(),
    recentFills: new Map(),
    broadcastFill: vi.fn(),
    broadcastFills: h.broadcastFills,
    broadcastNote: h.broadcastNote,
  }),
}))
vi.mock('../db', () => ({
  db: {
    rpc: h.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}))

/** A minimal 2×2 all-open template — answers C A / T S, one across + one down
 *  clue each. Enough for the Grid + cursor + keyboard to mount for real. */
function template(): PuzzleTemplate {
  const cell = (number: number | null) => ({ kind: 'cell' as const, number, fill: null })
  return {
    id: 'toy', title: 'Toy', author: 'T', copyright: '', note: '',
    width: 2, height: 2,
    clues: {
      across: [{ number: 1, text: '1 across' }, { number: 3, text: '3 across' }],
      down: [{ number: 1, text: '1 down' }, { number: 2, text: '2 down' }],
    },
    cells: [
      [cell(1), cell(2)],
      [cell(3), cell(null)],
    ],
  }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'CrossPlay',
    title: 'Toy',
    players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { source: 'library', timer: { kind: 'none' } },
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
  }
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the grid's keys are bound actions, and a bare
 *  `render` binds them with nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
}

/** What each RPC answers on the happy path, by name. */
const OK_DATA: Record<string, unknown> = {
  check_cells: { result: 'checked', wrong_count: 0 },
  reveal_cells: { result: 'revealed', solved: false },
  export_solution: { result: 'exported', solution: [] },
  set_cell: { result: 'set', version: 1, solved: false },
  set_mark: { result: 'marked', version: 1 },
}

beforeEach(() => {
  h.game = { mode: 'coop', puzzleId: 'p1', meta: template() }
  h.cells = new Map()
  h.setCell.mockReset().mockResolvedValue({ version: 1, solved: false })
  h.setMark.mockReset().mockResolvedValue({ version: 1 })
  // Every RPC this component calls answers in an ENVELOPE, and `runRpc` reads
  // the SHAPE — a bare `{ error: null }` is not one and would fault. Each call
  // site asserts its OWN `result`, so the reply has to name the right one:
  // answering `checked` to a reveal sends it to the scream, which is the
  // branch chain doing its job.
  h.rpc.mockReset().mockImplementation((name: string) => Promise.resolve({
    data: {
      type: 'ok',
      data: OK_DATA[name] ?? { result: name },
      outcome: null, severity: null, message: null,
      field: null, meta: null, dbcode: null, detail: null,
    },
    error: null,
    status: 200,
  }))
  h.broadcastFills.mockReset()
  h.broadcastNote.mockReset()
  edgeFn.mockReset()
})

/** RPC names db.rpc was called with (the ⌥-shortcut tests assert on these). */
function rpcNames(): string[] {
  return h.rpc.mock.calls.map((c) => c[0] as string)
}

/** A control by WHICH action it is, since its words vary per state. The pen
 *  and pencil caps are one action wearing two names, so that pair keeps a
 *  second discriminator. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

/** What a bound action says about itself right now. */
const stateOf = (id: string) => liveBindings().find((b) => b.id === id)?.describe().state

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

describe('crosswords PlayArea — render smoke + wiring', () => {
  it('coop play shows End, not Concede, and offers Reveal', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(control('act-end-game')).toBeInTheDocument()
    expect(control('act-concede')).toBeNull()
    // Reveal is coop-only.
    expect(control('act-reveal-word')).toBeInTheDocument()
    expect(control('act-check-word')).toBeInTheDocument()
  })

  it('compete play shows Concede, not End, and hides Reveal (Check stays)', () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    render(<PlayArea {...makeCtx()} />)
    expect(control('act-concede')).toBeInTheDocument()
    expect(control('act-end-game')).toBeNull()
    // Revealing your own grid would trivially win a race — no Reveal in compete.
    expect(control('act-reveal-word')).toBeNull()
    expect(control('act-check-word')).toBeInTheDocument()
  })

  it('renders the terminal state without crashing (Back to club, no action row)', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    // Two "Back to club" affordances at terminal: the chrome strip + the modal.
    expect(screen.getAllByRole('button', { name: /back to club/i }).length).toBeGreaterThan(0)
    // The play-time action row is gone at terminal.
    expect(control('act-end-game')).toBeNull()
    expect(control('act-check-word')).toBeNull()
  })

  /**
   * The compete collective losses both land on play_state `lost_compete` and
   * are told apart only by `status.outcome` — the two-places trap's third
   * surface (labelFor asserts the club card; nothing else asserts the in-game
   * verdict). These pin buildOver to the terminals the server actually writes:
   * common.concede → 'lost_compete' + outcome 'conceded',
   * crosswords.submit_timeout → 'lost_compete' + 'timeout' (compete) /
   * 'lost' + 'timeout' (coop).
   */
  describe('terminal loss verdicts', () => {
    const terminalCtx = (playState: string, outcome: string) =>
      makeCtx({ isTerminal: true, playState, status: { outcome } })

    it('compete all-conceded (lost_compete + outcome conceded) says so', () => {
      h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
      render(<PlayArea {...terminalCtx('lost_compete', 'conceded')} />)
      expect(screen.getAllByText('Lost: all conceded').length).toBeGreaterThan(0)
    })

    it('compete timeout (lost_compete + outcome timeout) blames the clock', () => {
      h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
      render(<PlayArea {...terminalCtx('lost_compete', 'timeout')} />)
      expect(screen.getAllByText('Out of time — no winner').length).toBeGreaterThan(0)
    })

    it('coop clock (lost + outcome timeout) is a plain loss', () => {
      render(<PlayArea {...terminalCtx('lost', 'timeout')} />)
      expect(screen.getAllByText('Lost: out of time').length).toBeGreaterThan(0)
    })
  })

  /** A CellState with the given overrides (defaults = empty writable cell). */
  function cellState(over: Partial<CellState> = {}): CellState {
    return {
      fill: null, pencil: false, revealed: false, wrong: false,
      markRight: null, markBottom: null, version: 1, ...over,
    }
  }

  it('flags that Check skips pencil when the checked scope holds a pencil mark', async () => {
    // Cursor starts at 0,0; a penciled fill there is in every scope (letter +
    // whichever word direction), so Check word surfaces the notice.
    h.cells = new Map([['0:0', cellState({ fill: 'C', pencil: true })]])
    render(<PlayArea {...makeCtx()} />)
    fireEvent.click(control('act-check-word')!)
    expect(await screen.findByText('Check skips pencil marks')).toBeInTheDocument()
    expect(rpcNames()).toContain('check_cells')
  })

  it('a clicked tool-bar square does not keep focus — Enter must not check the word again', async () => {
    // The grid's keys are read off the window, and a bare Enter is bound to
    // nothing on purpose. A square left holding focus would answer that Enter
    // itself and re-fire the check; the grid cells and clue rows already refuse
    // focus on mousedown, and the squares must too.
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const square = control('act-check-word')!
    await user.click(square)
    await waitFor(() => expect(rpcNames()).toContain('check_cells'))
    expect(document.activeElement).not.toBe(square)
    await user.keyboard('{Enter}')
    expect(rpcNames().filter((n) => n === 'check_cells')).toHaveLength(1)
  })

  it('does NOT flag pencil when the checked scope has only committed (pen) fills', async () => {
    h.cells = new Map([['0:0', cellState({ fill: 'C', pencil: false })]])
    render(<PlayArea {...makeCtx()} />)
    fireEvent.click(control('act-check-word')!)
    await waitFor(() => expect(rpcNames()).toContain('check_cells'))
    expect(screen.queryByText('Check skips pencil marks')).not.toBeInTheDocument()
  })

  /** Every TOP-LEVEL row the menu would draw, in order — a row is a bound
   *  action now, so its words, glyph, key hint and availability come from the
   *  action rather than from the list. A hidden row is dropped, the way the menu
   *  drops it. A submenu parent appears once, as itself; its children are on
   *  `.children`. */
  function menuRows(ctx: GamePageCtx): MenuRow[] {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    return sections.flatMap((s) => s.items).map(menuRow).filter((r) => !r.hidden)
  }

  const rowsById = (ctx: GamePageCtx) => new Map(menuRows(ctx).map((r) => [r.id, r]))

  /** The children of one submenu parent, by id. */
  function submenuOf(ctx: GamePageCtx, parentId: string): MenuRow[] {
    return rowsById(ctx).get(parentId)?.children ?? []
  }

  it('populates the full crossplay-order menu with shortcut hints (coop)', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    // Check + Reveal are ONE row each — six flat rows collapsed into two
    // submenus (this menu already runs long enough to scroll).
    expect(menuRows(ctx).map((r) => r.id)).toEqual([
      // Help + chat are `buildGameMenu`'s framing pair, above every game's own
      // sections: chat has a header bubble and a `/` shortcut, and this row is
      // the labeled twin that writes that shortcut down (gameMenu.ts).
      'act-help', 'act-open-chat',
      'act-pencil', 'act-rebus', 'act-collapse-rebuses',
      // No Scratchpad row: ⌥S is the header mark's binding, and nothing binds it
      // in a bare PlayArea render.
      'act-show-note', 'act-explain-clue', 'act-print-board', 'act-download-ipuz', 'act-print-solution',
      'check', 'reveal',
      'act-restart', 'act-reveal', 'act-new-game',
      // Concede hides itself in coop, so the exits are End + Back to club.
      'act-end-game', 'act-back-to-club',
    ])
    // The children keep their full names under the parent — the same action is
    // listed in Help with no parent to lend it the verb.
    expect(submenuOf(ctx, 'check').map((r) => r.label)).toEqual(['Check letter', 'Check word', 'Check grid'])
    expect(submenuOf(ctx, 'reveal').map((r) => r.label)).toEqual(['Reveal letter', 'Reveal word', 'Reveal grid'])
    // The hints ride the CHILDREN — a submenu parent isn't a command, so it
    // carries none. ⌥C = check letter, ⌥⇧C = check word.
    const check = new Map(submenuOf(ctx, 'check').map((r) => [r.id, r]))
    expect(check.get('act-check-letter')?.shortcut).toBe('⌥C')
    expect(check.get('act-check-word')?.shortcut).toBe('⌥⇧C')
    const rows = rowsById(ctx)
    expect(rows.get('check')?.shortcut).toBeUndefined()
    expect(rows.get('act-back-to-club')?.shortcut).toBe('<')
    expect(rows.get('act-end-game')?.shortcut).toBe('⌥⌫')
    expect(rows.get('act-pencil')?.shortcut).toBe('⌥P')
    expect(rows.get('act-rebus')?.shortcut).toBe('⇧↵')
    expect(rows.get('act-collapse-rebuses')?.disabled).toBe(false)
    expect(rows.get('act-download-ipuz')?.disabled).toBe(false)
    // Restart (what "Clear board" became) is live mid-game — it's confirmed,
    // not disabled; the solution reveal stays terminal-only.
    expect(rows.get('act-restart')?.disabled).toBe(false)
    expect(rows.get('act-reveal')?.disabled).toBe(true)
    expect(rows.get('act-reveal')?.label).toBe('Reveal solution')
    // Answer-key PDF is always available in coop (even mid-play).
    expect(rows.get('act-print-solution')?.disabled).toBe(false)
  })

  it('names the pencil toggle for where it takes you', async () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    expect(rowsById(ctx).get('act-pencil')?.label).toBe('Switch to pencil')
    act(() => rowsById(ctx).get('act-pencil')!.run())
    await waitFor(() => expect(rowsById(ctx).get('act-pencil')?.label).toBe('Switch to pen'))
  })

  it('omits the coop-only Reveal submenu and shows Concede in compete', () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const ids = menuRows(ctx).map((r) => r.id)
    // All three Reveal children hide themselves, and a submenu with nothing left
    // to show is not a row you can open — so the whole family is gone.
    expect(ids).not.toContain('reveal')
    // Check + pencil still present; compete shows Concede (not End game).
    expect(ids).toContain('check')
    expect(submenuOf(ctx, 'check').map((r) => r.id)).toContain('act-check-letter')
    expect(ids).toContain('act-pencil')
    expect(ids).toContain('act-concede')
    expect(ids).not.toContain('act-end-game')
  })

  it('gates the answer-key PDF in compete: disabled mid-play, enabled at terminal', () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    // Mid-play: an answer key would give away the race, so it's disabled.
    const playing = makeCtx()
    const { unmount } = render(<PlayArea {...playing} />)
    expect(rowsById(playing).get('act-print-solution')?.disabled).toBe(true)
    unmount()

    // Terminal: the game's over, so it's allowed.
    const done = makeCtx({ isTerminal: true, playState: 'won_compete' })
    render(<PlayArea {...done} />)
    expect(rowsById(done).get('act-print-solution')?.disabled).toBe(false)
  })
})

describe('crosswords PlayArea — the grid keys, through the one dispatcher', () => {
  it('a letter typed on the board fills the cursor cell', () => {
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { key: 'A' })
    // The cursor seeds at the first fillable cell (0,0); a letter writes it.
    expect(h.setCell).toHaveBeenCalledWith(0, 0, 'A', false)
  })

  it('a letter typed inside a text input (e.g. chat) is ignored', () => {
    render(<WithKeys {...makeCtx()} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'A' })
    expect(h.setCell).not.toHaveBeenCalled()
    input.remove()
  })
})

describe('crosswords PlayArea — ⌥ shortcuts (keyed on e.code, dead-key safe)', () => {
  it('⌥C checks the letter; ⌥⇧C checks the word', () => {
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'ç', altKey: true })
    expect(rpcNames()).toContain('check_cells')
    // ⌥C = letter scope = just the cursor cell (1); ⌥⇧C = word scope (2 here).
    const letterCall = h.rpc.mock.calls.find((c) => c[0] === 'check_cells')
    expect((letterCall?.[1] as { p_cells: unknown[] }).p_cells.length).toBe(1)

    h.rpc.mockClear()
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'Ç', altKey: true, shiftKey: true })
    const wordCall = h.rpc.mock.calls.find((c) => c[0] === 'check_cells')
    expect((wordCall?.[1] as { p_cells: unknown[] }).p_cells.length).toBe(2)
  })

  it('⌥R reveals in coop', () => {
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(rpcNames()).toContain('reveal_cells')
  })

  /** Fire the whole-grid reveal from the game menu's Reveal ▸ Grid row. */
  const revealGrid = async (ctx: GamePageCtx) => {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    const row = sections
      .flatMap((sec) => sec.items)
      .map(menuRow)
      .find((r) => r.id === 'reveal')!
      .children!.find((r) => r.id === 'act-reveal-puzzle')!
    await act(async () => { row.run() })
  }

  it('revealing the whole GRID asks first — and canceling writes nothing', async () => {
    const ctx = makeCtx()
    render(<><PlayArea {...ctx} /><ConfirmationHost /></>)
    h.rpc.mockClear()

    await revealGrid(ctx)

    // The modal, not the RPC: filling every answer ends the puzzle for the
    // whole table, and the row sits one mis-click below "Word". The question is
    // the registry's, asked by the shared run.
    expect(await screen.findByText('Reveal the whole grid?')).toBeInTheDocument()
    expect(rpcNames()).not.toContain('reveal_cells')

    await userEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpcNames()).not.toContain('reveal_cells')
  })

  it('…and confirming it goes through', async () => {
    const ctx = makeCtx()
    render(<><PlayArea {...ctx} /><ConfirmationHost /></>)
    h.rpc.mockClear()
    await revealGrid(ctx)
    await screen.findByText('Reveal the whole grid?')
    // The tool bar's own "Reveal grid" square shares the name — which is the
    // point, they are the same action. The square says which action it is and
    // the modal's confirm does not, so that is what tells them apart.
    const confirm = screen
      .getAllByRole('button', { name: 'Reveal grid' })
      .find((b) => b.dataset.action === undefined)!
    await userEvent.click(confirm)
    await waitFor(() => expect(rpcNames()).toContain('reveal_cells'))
  })

  it('a single-letter reveal is NOT confirmed — it is the ordinary help ladder', () => {
    render(<><WithKeys {...makeCtx()} /><ConfirmationHost /></>)
    h.rpc.mockClear()
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(screen.queryByText('Reveal the whole grid?')).not.toBeInTheDocument()
    expect(rpcNames()).toContain('reveal_cells')
  })

  it('⌥R does NOT reveal in compete (reveal is coop-only)', () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(rpcNames()).not.toContain('reveal_cells')
  })

  it('⌥N opens the note dialog when the puzzle has a setter note', () => {
    h.game = { mode: 'coop', puzzleId: 'p1', meta: { ...template(), note: 'Theme: fruit' } }
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: '˜', altKey: true })
    expect(screen.getByText('Theme: fruit')).toBeInTheDocument()
  })

  it('⌥ shortcuts are inert at terminal (read-only board)', () => {
    render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'ç', altKey: true })
    expect(rpcNames()).not.toContain('check_cells')
  })
})

describe('crosswords PlayArea — peer broadcasts (note + reveal flash)', () => {
  it('Show note broadcasts so teammates open it too (coop)', () => {
    h.game = { mode: 'coop', puzzleId: 'p1', meta: { ...template(), note: 'Theme: fruit' } }
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: '˜', altKey: true })
    expect(h.broadcastNote).toHaveBeenCalled()
  })

  it('a coop reveal flashes the revealed cells on teammates’ grids', async () => {
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    // handleReveal awaits the RPC, then broadcasts the revealed coords.
    await waitFor(() => expect(h.broadcastFills).toHaveBeenCalled())
    expect(h.broadcastFills.mock.calls[0]?.[0]).toHaveLength(1) // ⌥R = reveal letter (cursor cell)
  })

  it('a failed reveal does not broadcast a flash', async () => {
    h.rpc.mockResolvedValue({ error: { message: 'nope' } })
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    await waitFor(() => expect(rpcNames()).toContain('reveal_cells'))
    expect(h.broadcastFills).not.toHaveBeenCalled()
  })
})

/**
 * The page's own chords, through the dispatcher: the pencil toggle, the AI
 * explainer, the two overlays the grid keys open, and New game — which here
 * opens the club's setup dialog rather than creating a game, since a crossword
 * names a puzzle and "the same again" would re-serve the grid just solved.
 */
describe('crosswords PlayArea — the page chords', () => {
  const pencilCap = () =>
    document.querySelector<HTMLButtonElement>('button[data-action="act-pencil"][aria-label="Pencil"]')!

  it('⌥P toggles pencil, and the pair of caps follows', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(pencilCap()).toHaveAttribute('aria-pressed', 'false')
    await press({ key: 'π', code: 'KeyP', altKey: true })
    expect(pencilCap()).toHaveAttribute('aria-pressed', 'true')
    await press({ key: 'π', code: 'KeyP', altKey: true })
    expect(pencilCap()).toHaveAttribute('aria-pressed', 'false')
  })

  it('⌥X asks the explainer when the puzzle has a note', async () => {
    edgeFn.mockResolvedValue({ type: 'ok', data: { result: 'unsolved' } })
    h.game = { mode: 'coop', puzzleId: 'p1', meta: { ...template(), note: 'Cryptic' } }
    render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-explain-clue')).toBe('active')
    await press({ key: '≈', code: 'KeyX', altKey: true })
    await waitFor(() =>
      expect(edgeFn).toHaveBeenCalledWith('crosswords-explain-clue', expect.objectContaining({ gameId: 'g1' })),
    )
  })

  it('⌥X is gray without a note — the note is the cryptic proxy', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-explain-clue')).toBe('disabled')
    await press({ key: '≈', code: 'KeyX', altKey: true })
    expect(edgeFn).not.toHaveBeenCalled()
  })

  it('⇧↵ opens the rebus box over the cursor cell', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(screen.queryByLabelText('Rebus entry')).not.toBeInTheDocument()
    await press({ key: 'Enter', code: 'Enter', shiftKey: true })
    expect(screen.getByLabelText('Rebus entry')).toBeInTheDocument()
    // While the box has the keyboard, every grid key stands down.
    expect(stateOf('act-fill-cell')).toBe('disabled')
  })

  it('# opens the number jump', async () => {
    render(<WithKeys {...makeCtx()} />)
    await press({ key: '#' })
    expect(screen.getByRole('dialog', { name: 'Jump to clue number' })).toBeInTheDocument()
  })

  it('+ at terminal goes to the club’s setup dialog with no question', async () => {
    window.history.replaceState(null, '', '/')
    render(<WithKeys {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the navigation proves none was asked.
    expect(window.location.search).toBe('?new=crosswords_coop')
    window.history.replaceState(null, '', '/')
  })

  it('+ mid-game asks first, and cancel goes nowhere', async () => {
    window.history.replaceState(null, '', '/')
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
    expect(window.location.search).toBe('')
  })

  it('a conceded racer’s grid keys are inert', async () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    render(
      <WithKeys
        {...makeCtx({ players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')] })}
      />,
    )
    expect(stateOf('act-fill-cell')).toBe('disabled')
    expect(stateOf('act-move-cursor')).toBe('disabled')
    await press({ key: 'A' })
    expect(h.setCell).not.toHaveBeenCalled()
  })
})

/**
 * The help list, generated from the same bindings the dispatcher fires. What
 * it shows is each key's label and what the action is CALLED at that moment —
 * which for the check/reveal ladder is the registry's scope word alone.
 */
describe('crosswords PlayArea — the key list', () => {
  /** The rows as [key, words] pairs. */
  const keyRows = () =>
    Array.from(document.querySelectorAll('dl > div')).map((row) => [
      row.querySelector('dt')?.textContent ?? '',
      row.querySelector('dd')?.textContent ?? '',
    ])

  it('lists the page chords and the four check/reveal rows by scope word', () => {
    render(
      <>
        <PlayArea {...makeCtx()} />
        <KeyList />
      </>,
    )
    const rows = keyRows()
    expect(rows).toContainEqual(['⌥P', 'Switch to pencil'])
    expect(rows).toContainEqual(['⇧↵', 'Enter rebus'])
    expect(rows).toContainEqual(['A–Z', 'Fill the cell'])
    expect(rows).toContainEqual(['⌥⌫', 'End game'])
    // The ladder: with no submenu parent to lend the verb, a check and a reveal
    // of the same scope must still read apart.
    expect(rows).toContainEqual(['⌥C', 'Check letter'])
    expect(rows).toContainEqual(['⌥⇧C', 'Check word'])
    expect(rows).toContainEqual(['⌥R', 'Reveal letter'])
    expect(rows).toContainEqual(['⌥⇧R', 'Reveal word'])
  })
})
