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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { CrosswordsGame } from '../hooks/useGame'
import type { CellsMap } from '../hooks/useCells'
import type { PuzzleTemplate } from '../lib/types'
import { PlayArea } from './PlayArea'

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
    setup: { source: 'library', timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  }
}

beforeEach(() => {
  h.game = { mode: 'coop', puzzleId: 'p1', meta: template() }
  h.cells = new Map()
  h.setCell.mockReset().mockResolvedValue({ version: 1, solved: false })
  h.setMark.mockReset().mockResolvedValue({ version: 1 })
  h.rpc.mockReset().mockResolvedValue({ error: null })
  h.broadcastFills.mockReset()
  h.broadcastNote.mockReset()
})

/** RPC names db.rpc was called with (the ⌥-shortcut tests assert on these). */
function rpcNames(): string[] {
  return h.rpc.mock.calls.map((c) => c[0] as string)
}

describe('crosswords PlayArea — render smoke + wiring', () => {
  it('coop play shows End, not Concede, and offers Reveal', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('button', { name: /^end$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    // Reveal is coop-only.
    expect(screen.getByRole('button', { name: /reveal word/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /check word/i })).toBeInTheDocument()
  })

  it('compete play shows Concede, not End, and hides Reveal (Check stays)', () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('button', { name: /concede/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^end$/i })).not.toBeInTheDocument()
    // Revealing your own grid would trivially win a race — no Reveal in compete.
    expect(screen.queryByRole('button', { name: /reveal word/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /check word/i })).toBeInTheDocument()
  })

  it('renders the terminal state without crashing (Back to club, no action row)', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    // Two "Back to club" affordances at terminal: the chrome strip + the modal.
    expect(screen.getAllByRole('button', { name: /back to club/i }).length).toBeGreaterThan(0)
    // The play-time action row is gone at terminal.
    expect(screen.queryByRole('button', { name: /^end$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /check word/i })).not.toBeInTheDocument()
  })

  it('populates the game menu (Show note / Explain / Clear / Reveal board / Print)', () => {
    const setGameItems = vi.fn()
    render(<PlayArea {...makeCtx({ menu: { setGameItems } })} />)
    const items = setGameItems.mock.calls.at(-1)?.[0] as Array<{ id: string; disabled?: boolean }>
    expect(items.map((i) => i.id)).toEqual(['note', 'explain', 'clear-board', 'reveal-board', 'print'])
    // Clear is enabled during coop play; Reveal-board is terminal-only.
    expect(items.find((i) => i.id === 'clear-board')?.disabled).toBe(false)
    expect(items.find((i) => i.id === 'reveal-board')?.disabled).toBe(true)
  })
})

describe('crosswords PlayArea — keyboard hook wiring (isNonGameField)', () => {
  it('a letter typed on the board fills the cursor cell', () => {
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { key: 'A' })
    // The cursor seeds at the first fillable cell (0,0); a letter writes it.
    expect(h.setCell).toHaveBeenCalledWith(0, 0, 'A', false)
  })

  it('a letter typed inside a text input (e.g. chat) is ignored', () => {
    render(<PlayArea {...makeCtx()} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'A' })
    expect(h.setCell).not.toHaveBeenCalled()
    input.remove()
  })
})

describe('crosswords PlayArea — ⌥ shortcuts (keyed on e.code, dead-key safe)', () => {
  it('⌥C checks the word; ⌥⇧C checks the whole grid', () => {
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'ç', altKey: true })
    expect(rpcNames()).toContain('check_cells')
    // Word scope = just the cursor's word (2 cells here); grid scope = all 4.
    const wordCall = h.rpc.mock.calls.find((c) => c[0] === 'check_cells')
    expect((wordCall?.[1] as { p_cells: unknown[] }).p_cells.length).toBe(2)

    h.rpc.mockClear()
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'Ç', altKey: true, shiftKey: true })
    const gridCall = h.rpc.mock.calls.find((c) => c[0] === 'check_cells')
    expect((gridCall?.[1] as { p_cells: unknown[] }).p_cells.length).toBe(4)
  })

  it('⌥R reveals in coop', () => {
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(rpcNames()).toContain('reveal_cells')
  })

  it('⌥R does NOT reveal in compete (reveal is coop-only)', () => {
    h.game = { mode: 'compete', puzzleId: 'p1', meta: template() }
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(rpcNames()).not.toContain('reveal_cells')
  })

  it('⌥N opens the note dialog when the puzzle has a setter note', () => {
    h.game = { mode: 'coop', puzzleId: 'p1', meta: { ...template(), note: 'Theme: fruit' } }
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: '˜', altKey: true })
    expect(screen.getByText('Theme: fruit')).toBeInTheDocument()
  })

  it('⌥ shortcuts are inert at terminal (read-only board)', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'ç', altKey: true })
    expect(rpcNames()).not.toContain('check_cells')
  })
})

describe('crosswords PlayArea — peer broadcasts (note + reveal flash)', () => {
  it('Show note broadcasts so teammates open it too (coop)', () => {
    h.game = { mode: 'coop', puzzleId: 'p1', meta: { ...template(), note: 'Theme: fruit' } }
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: '˜', altKey: true })
    expect(h.broadcastNote).toHaveBeenCalled()
  })

  it('a coop reveal flashes the revealed cells on teammates’ grids', async () => {
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    // handleReveal awaits the RPC, then broadcasts the revealed coords.
    await waitFor(() => expect(h.broadcastFills).toHaveBeenCalled())
    expect(h.broadcastFills.mock.calls[0]?.[0]).toHaveLength(2) // the cursor's word
  })

  it('a failed reveal does not broadcast a flash', async () => {
    h.rpc.mockResolvedValue({ error: { message: 'nope' } })
    render(<PlayArea {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    await waitFor(() => expect(rpcNames()).toContain('reveal_cells'))
    expect(h.broadcastFills).not.toHaveBeenCalled()
  })
})
