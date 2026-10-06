// cs-unmet

/**
 * crosswords' PlayArea, mounted on the blob the page would hand it
 * (`ZTest_makeCrosswordsCtx`): the coordinator wires the right affordances per
 * mode and per ending, the grid's keys reach the right RPCs, and the menu
 * lists crossplay's rows. The game logic lives in pgTAP (the RPCs) and the
 * lib and hook tests (`cursor`, `enumeration`, `makeGameData`, the pending
 * writes, the teammate flash).
 *
 * Only the teammates' Realtime room (`usePeerCursors`), the RPC transport and
 * the explainer's edge function are stubbed; the grid, the clue lists, the
 * strip, the keyboard and the menu render for real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { KeyList } from '@/common/actions/KeyList'
import { getActions } from '@/common/actions/actionsStore'
import { menuRow, type MenuRow, type MenuSection } from '@/common/menu/menuModel'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  ZTest_CONCEDED,
  ZTest_makeCrosswordsCtx,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

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

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  broadcastNote: vi.fn(),
}))

vi.mock('../hooks/usePeerCursors', () => ({
  usePeerCursors: () => ({ peers: new Map(), broadcastNote: h.broadcastNote }),
}))
vi.mock('../db', () => ({ db: { rpc: h.rpc } }))

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** The page's props for a two-player game, from the game's facts. */
const makeCtx = (facts: ZTest_GameDataFacts = {}) => ZTest_makeCrosswordsCtx({ players: TWO, ...facts })

/** A two-player race. */
const competeFacts = (facts: ZTest_GameDataFacts = {}): ZTest_GameDataFacts => ({ mode: 'compete', ...facts })

/** The facts of a game that has ended, everyone's outcome as the server wrote it. */
function endedFacts(
  mode: 'coop' | 'compete',
  ending: NonNullable<ZTest_GameDataFacts['ending']>,
  outcome: 'won' | 'lost' | 'neutral',
): ZTest_GameDataFacts {
  return {
    mode,
    ending,
    outcome,
    players: TWO.map((p) => ({ ...p, outcome })),
  }
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the grid's keys are actions, and a bare
 *  `render` binds them with nothing feeding them keys. */
function WithKeys(props: PlayAreaLoaderProps) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** What each RPC answers on the happy path, by name. */
const OK_DATA: Record<string, unknown> = {
  check_cells: { result: 'checked' },
  reveal_cells: { result: 'revealed' },
  export_solution: { result: 'exported', solution: [] },
  set_cell: { result: 'set', revision: 2 },
  set_mark: { result: 'marked', revision: 2 },
}

/** An envelope as `runRpc` reads it. */
function envelope(data: unknown) {
  return {
    data: {
      type: 'ok', data, outcome: null, severity: null, message: null,
      field: null, meta: null, dbcode: null, detail: null,
    },
    error: null,
    status: 200,
  }
}

beforeEach(() => {
  // Every RPC this surface calls answers in an ENVELOPE, and each call site
  // asserts its OWN `result`, so the reply names the right one.
  h.rpc.mockReset().mockImplementation((name: string) => Promise.resolve(envelope(OK_DATA[name] ?? { result: name })))
  h.broadcastNote.mockReset()
  edgeFn.mockReset()
})

/** RPC names db.rpc was called with. */
function rpcNames(): string[] {
  return h.rpc.mock.calls.map((c) => c[0] as string)
}

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

/** What an action says about itself right now. */
const stateOf = (id: string) => getActions().find((b) => b.id === id)?.describe('button').state

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

describe('crosswords PlayArea — render smoke + wiring', () => {
  it('coop play shows Stop, not Concede, and offers Reveal', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(control('act-stop-game')).toBeInTheDocument()
    expect(control('act-concede')).toBeNull()
    expect(control('act-reveal-word')).toBeInTheDocument()
    expect(control('act-check-word')).toBeInTheDocument()
  })

  it('compete play shows Concede, not Stop, and hides Reveal (Check stays)', () => {
    render(<PlayAreaLoader {...makeCtx(competeFacts())} />)
    expect(control('act-concede')).toBeInTheDocument()
    expect(control('act-stop-game')).toBeNull()
    // Revealing your own grid would trivially win a race — no Reveal in compete.
    expect(control('act-reveal-word')).toBeNull()
    expect(control('act-check-word')).toBeInTheDocument()
  })

  it('once the game has ended the tools go and Back to club is there', () => {
    render(<PlayAreaLoader {...makeCtx(endedFacts('coop', { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' }, 'won'))} />)
    expect(screen.getAllByRole('button', { name: /back to club/i }).length).toBeGreaterThan(0)
    expect(control('act-stop-game')).toBeNull()
    expect(control('act-check-word')).toBeNull()
  })

  describe('the verdicts, read off the ending the server wrote', () => {
    it('coop solved', () => {
      render(<PlayAreaLoader {...makeCtx(endedFacts('coop', { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' }, 'won'))} />)
      expect(screen.getAllByText('Won: grid complete').length).toBeGreaterThan(0)
    })

    it('a race lost to a rival names them', () => {
      const facts = endedFacts('compete', { reason: 'reached_goal', detail: 'solved', by: 'u2', winner: 'u2' }, 'won')
      facts.players = [{ ...TWO[0]!, outcome: 'lost' }, { ...TWO[1]!, outcome: 'won' }]
      render(<PlayAreaLoader {...makeCtx(facts)} />)
      expect(screen.getAllByText('solved it first').length).toBeGreaterThan(0)
      expect(screen.getAllByText('moth').length).toBeGreaterThan(0)
    })

    it('compete all-conceded says so', () => {
      render(<PlayAreaLoader {...makeCtx(endedFacts('compete', { reason: 'conceded', detail: 'conceded', by: 'u2', winner: null }, 'lost'))} />)
      expect(screen.getAllByText('Lost: all conceded').length).toBeGreaterThan(0)
    })

    it('compete timeout blames the clock', () => {
      render(<PlayAreaLoader {...makeCtx(endedFacts('compete', { reason: 'timeout', detail: 'timeout', by: null, winner: null }, 'lost'))} />)
      expect(screen.getAllByText('Out of time — no winner').length).toBeGreaterThan(0)
    })

    it('coop clock is a plain loss', () => {
      render(<PlayAreaLoader {...makeCtx(endedFacts('coop', { reason: 'timeout', detail: 'timeout', by: null, winner: null }, 'lost'))} />)
      expect(screen.getAllByText('Lost: out of time').length).toBeGreaterThan(0)
    })
  })

  it('flags that Check skips pencil when the checked scope holds a pencil mark', async () => {
    // The cursor starts at (0,0); a penciled fill there is in every scope.
    render(<PlayAreaLoader {...makeCtx({ cells: [{ row: 0, col: 0, fill: 'C', pencil: true }] })} />)
    fireEvent.click(control('act-check-word')!)
    expect(await screen.findByText('Check skips pencil marks')).toBeInTheDocument()
    expect(rpcNames()).toContain('check_cells')
  })

  it('does NOT flag pencil when the checked scope has only letters in pen', async () => {
    render(<PlayAreaLoader {...makeCtx({ cells: [{ row: 0, col: 0, fill: 'C' }] })} />)
    fireEvent.click(control('act-check-word')!)
    await waitFor(() => expect(rpcNames()).toContain('check_cells'))
    expect(screen.queryByText('Check skips pencil marks')).not.toBeInTheDocument()
  })

  it('a clicked tool-bar square does not keep focus — Enter must not check the word again', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    const square = control('act-check-word')!
    await user.click(square)
    await waitFor(() => expect(rpcNames()).toContain('check_cells'))
    expect(document.activeElement).not.toBe(square)
    await user.keyboard('{Enter}')
    expect(rpcNames().filter((n) => n === 'check_cells')).toHaveLength(1)
  })

  /** Every TOP-LEVEL row the menu would draw, in order. A hidden row is
   *  dropped, the way the menu drops it; a submenu parent appears once. */
  function menuRows(ctx: PlayAreaLoaderProps): MenuRow[] {
    const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
    const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
    return sections.flatMap((s) => s.items).map(menuRow).filter((r) => !r.hidden)
  }

  const rowsById = (ctx: PlayAreaLoaderProps) => new Map(menuRows(ctx).map((r) => [r.id, r]))

  /** The children of one submenu parent, by id. */
  function submenuOf(ctx: PlayAreaLoaderProps, parentId: string): MenuRow[] {
    return rowsById(ctx).get(parentId)?.children ?? []
  }

  it('populates the full crossplay-order menu with shortcut hints (coop)', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    expect(menuRows(ctx).map((r) => r.id)).toEqual([
      'act-help', 'act-open-chat',
      'act-pencil', 'act-rebus', 'act-collapse-rebuses',
      // No Scratchpad row: ⌥S is the header mark's action, and nothing binds it
      // in a bare PlayArea render.
      'act-show-note', 'act-explain-clue', 'act-print-board', 'act-download-ipuz', 'act-print-solution',
      'check', 'reveal',
      'act-restart', 'act-reveal', 'act-new-game',
      // Concede hides itself in coop, so the exits are Stop + Back to club.
      'act-stop-game', 'act-back-to-club',
    ])
    expect(submenuOf(ctx, 'check').map((r) => r.label)).toEqual(['Check letter', 'Check word', 'Check grid'])
    expect(submenuOf(ctx, 'reveal').map((r) => r.label)).toEqual(['Reveal letter', 'Reveal word', 'Reveal grid'])
    const check = new Map(submenuOf(ctx, 'check').map((r) => [r.id, r]))
    expect(check.get('act-check-letter')?.shortcut).toBe('⌥C')
    expect(check.get('act-check-word')?.shortcut).toBe('⌥⇧C')
    const rows = rowsById(ctx)
    expect(rows.get('check')?.shortcut).toBeUndefined()
    expect(rows.get('act-back-to-club')?.shortcut).toBe('<')
    expect(rows.get('act-stop-game')?.shortcut).toBe('⌥⌫')
    expect(rows.get('act-pencil')?.shortcut).toBe('⌥P')
    expect(rows.get('act-rebus')?.shortcut).toBe('⇧↵')
    expect(rows.get('act-collapse-rebuses')?.disabled).toBe(false)
    expect(rows.get('act-download-ipuz')?.disabled).toBe(false)
    expect(rows.get('act-restart')?.disabled).toBe(false)
    expect(rows.get('act-reveal')?.disabled).toBe(true)
    expect(rows.get('act-reveal')?.label).toBe('Reveal solution')
    // Answer-key PDF is always available in coop (even mid-play).
    expect(rows.get('act-print-solution')?.disabled).toBe(false)
  })

  it('names the pencil toggle for where it takes you', async () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    expect(rowsById(ctx).get('act-pencil')?.label).toBe('Switch to pencil')
    act(() => rowsById(ctx).get('act-pencil')!.run())
    await waitFor(() => expect(rowsById(ctx).get('act-pencil')?.label).toBe('Switch to pen'))
  })

  it('omits the coop-only Reveal submenu and shows Concede in compete', () => {
    const ctx = makeCtx(competeFacts())
    render(<PlayAreaLoader {...ctx} />)
    const ids = menuRows(ctx).map((r) => r.id)
    expect(ids).not.toContain('reveal')
    expect(ids).toContain('check')
    expect(submenuOf(ctx, 'check').map((r) => r.id)).toContain('act-check-letter')
    expect(ids).toContain('act-pencil')
    expect(ids).toContain('act-concede')
    expect(ids).not.toContain('act-stop-game')
  })

  it('gates the answer-key PDF in compete: disabled mid-play, enabled once ended', () => {
    const playing = makeCtx(competeFacts())
    const { unmount } = render(<PlayAreaLoader {...playing} />)
    expect(rowsById(playing).get('act-print-solution')?.disabled).toBe(true)
    unmount()

    const facts = endedFacts('compete', { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' }, 'won')
    const done = makeCtx(facts)
    render(<PlayAreaLoader {...done} />)
    expect(rowsById(done).get('act-print-solution')?.disabled).toBe(false)
  })
})

describe('crosswords PlayArea — the grid keys, through the one dispatcher', () => {
  it('a letter typed on the board goes to set_cell for the cursor cell, and shows at once', async () => {
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'A' })
    // The cursor seeds at the first fillable cell (0,0).
    expect(h.rpc).toHaveBeenCalledWith('set_cell', {
      p_game_id: 'g1', p_row: 0, p_col: 0, p_fill: 'A', p_pencil: false,
    })
    // The letter is drawn before any blob carries it.
    expect(document.querySelector('[data-row="0"][data-col="0"]')).toHaveAttribute('data-fill', 'A')
  })

  it('a refused letter leaves the grid and says why', async () => {
    h.rpc.mockImplementation(() => Promise.resolve({
      data: {
        type: 'not-ok', data: null, outcome: 'lost', severity: 'race', message: 'Game over',
        field: null, meta: null, dbcode: 'PN486', detail: null,
      },
      error: null,
      status: 200,
    }))
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'A' })
    expect(await screen.findByText('Game over')).toBeInTheDocument()
    expect(document.querySelector('[data-row="0"][data-col="0"]')).toHaveAttribute('data-fill', '')
  })

  it('a letter typed inside a text input (e.g. chat) is ignored', () => {
    render(<WithKeys {...makeCtx()} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'A' })
    expect(rpcNames()).not.toContain('set_cell')
    input.remove()
  })
})

describe('crosswords PlayArea — ⌥ shortcuts (keyed on e.code, dead-key safe)', () => {
  it('⌥C checks the letter; ⌥⇧C checks the word', () => {
    render(<WithKeys {...makeCtx()} />)
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'ç', altKey: true })
    expect(rpcNames()).toContain('check_cells')
    // ⌥C = letter scope = just the cursor cell; ⌥⇧C = word scope, the two open
    // cells of row 0 before its block.
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
  const revealGrid = async (ctx: PlayAreaLoaderProps) => {
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
    render(<><PlayAreaLoader {...ctx} /><ConfirmationHost /></>)
    h.rpc.mockClear()

    await revealGrid(ctx)

    expect(await screen.findByText('Reveal the whole grid?')).toBeInTheDocument()
    expect(rpcNames()).not.toContain('reveal_cells')

    await userEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpcNames()).not.toContain('reveal_cells')
  })

  it('…and confirming it goes through', async () => {
    const ctx = makeCtx()
    render(<><PlayAreaLoader {...ctx} /><ConfirmationHost /></>)
    h.rpc.mockClear()
    await revealGrid(ctx)
    await screen.findByText('Reveal the whole grid?')
    // The tool bar's own "Reveal grid" square shares the name — they are the
    // same action. The square says which action it is and the modal's confirm
    // does not, so that is what tells them apart.
    const confirm = screen
      .getAllByRole('button', { name: 'Reveal grid' })
      .find((b) => b.dataset.action === undefined)!
    await userEvent.click(confirm)
    await waitFor(() => expect(rpcNames()).toContain('reveal_cells'))
  })

  it('a single-letter reveal is NOT confirmed — it is the ordinary hint ladder', () => {
    render(<><WithKeys {...makeCtx()} /><ConfirmationHost /></>)
    h.rpc.mockClear()
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(screen.queryByText('Reveal the whole grid?')).not.toBeInTheDocument()
    expect(rpcNames()).toContain('reveal_cells')
  })

  it('⌥R does NOT reveal in compete (reveal is coop-only)', () => {
    render(<WithKeys {...makeCtx(competeFacts())} />)
    fireEvent.keyDown(document.body, { code: 'KeyR', key: '®', altKey: true })
    expect(rpcNames()).not.toContain('reveal_cells')
  })

  it('⌥N opens the note and asks teammates to open it too, when the puzzle has one', () => {
    const ctx = makeCtx()
    ;(ctx.staticGameData as { puzzle: { note: string } }).puzzle.note = 'Theme: fruit'
    render(<WithKeys {...ctx} />)
    fireEvent.keyDown(document.body, { code: 'KeyN', key: '˜', altKey: true })
    expect(screen.getByText('Theme: fruit')).toBeInTheDocument()
    expect(h.broadcastNote).toHaveBeenCalled()
  })

  it('⌥ shortcuts are inert once the game has ended (read-only board)', () => {
    render(<WithKeys {...makeCtx(endedFacts('coop', { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' }, 'won'))} />)
    fireEvent.keyDown(document.body, { code: 'KeyC', key: 'ç', altKey: true })
    expect(rpcNames()).not.toContain('check_cells')
  })
})

/**
 * The page's own chords, through the dispatcher: the pencil toggle, the AI
 * explainer, the two overlays the grid keys open, and New game — which here
 * opens the club's setup dialog rather than creating a game.
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
    const ctx = makeCtx()
    ;(ctx.staticGameData as { puzzle: { note: string } }).puzzle.note = 'Cryptic'
    render(<WithKeys {...ctx} />)
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

  it('+ once the game has ended goes to the club’s setup dialog with no question', async () => {
    window.history.replaceState(null, '', '/')
    render(<WithKeys {...makeCtx(endedFacts('coop', { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' }, 'won'))} />)
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

  /** A race in which I have conceded and moth races on. */
  const concededFacts = () => competeFacts({ players: [{ ...TWO[0]!, ...ZTest_CONCEDED }, TWO[1]!] })

  it('a conceded racer’s grid keys are inert', async () => {
    render(<WithKeys {...makeCtx(concededFacts())} />)
    expect(stateOf('act-fill-cell')).toBe('disabled')
    expect(stateOf('act-move-cursor')).toBe('disabled')
    await press({ key: 'A' })
    expect(rpcNames()).not.toContain('set_cell')
  })

  it('a conceded racer keeps the one flag — Stop for all, not a hidden Concede', () => {
    render(<WithKeys {...makeCtx(concededFacts())} />)
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(document.querySelector('button[data-action="act-concede"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
  })
})

/**
 * The help list, generated from the same actions the dispatcher fires. What
 * it shows is each key's label and what the action is CALLED at that moment.
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
        <PlayAreaLoader {...makeCtx()} />
        <KeyList />
      </>,
    )
    const rows = keyRows()
    expect(rows).toContainEqual(['⌥P', 'Switch to pencil'])
    expect(rows).toContainEqual(['⇧↵', 'Enter rebus'])
    expect(rows).toContainEqual(['A–Z', 'Fill the cell'])
    expect(rows).toContainEqual(['⌥⌫', 'Stop game'])
    expect(rows).toContainEqual(['⌥C', 'Check letter'])
    expect(rows).toContainEqual(['⌥⇧C', 'Check word'])
    expect(rows).toContainEqual(['⌥R', 'Reveal letter'])
    expect(rows).toContainEqual(['⌥⇧R', 'Reveal word'])
  })
})
