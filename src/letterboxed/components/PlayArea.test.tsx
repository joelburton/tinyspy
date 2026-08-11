/**
 * Component tests for letterboxed's PlayArea — the GAME MENU it publishes.
 *
 * Why this file exists: letterboxed's info column is icon-only (docs/ui.md →
 * Button iconography), and three of its glyphs — the hint lightbulb, the
 * spoiler's bare eye, the terminal boxed eye — are named NOWHERE ELSE on a
 * touch device, because the menu is the legend. That makes the menu's contents
 * a real contract, not chrome: a row silently dropped takes a glyph's only
 * explanation with it. These pin it, plus the one mode rule that goes the other
 * way (compete has no help ladder at all, so naming it there would teach a lie).
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else renders for real.
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { EventRow, LetterboxedGame, PlayerRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = {
  game: LetterboxedGame | null
  playerRows: PlayerRow[]
  myRow: PlayerRow | null
  events: EventRow[]
  loading: boolean
  rowsLoaded: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('../../common/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** Twelve letters, three to a side (lib/board.ts's side order). */
const SIDES = 'abcdefghijkl'

const myRow: PlayerRow = {
  game_id: 'g1',
  user_id: 'u1',
  chain: [],
  word_count: 0,
  letters_covered: 0,
  hints_used: 0,
  solved: false,
  solved_at: null,
}

function loadedGame(over: Partial<LetterboxedGame> = {}): LetterboxedGame {
  return {
    id: 'g1',
    club_handle: 'testclub',
    mode: 'coop',
    sides: SIDES,
    playableWords: ['bad', 'dig'],
    solution: ['bad', 'dig'],
    max_words: 5,
    ...over,
  } as LetterboxedGame
}

function loaded(game: LetterboxedGame): GameHook {
  return { game, playerRows: [myRow], myRow, events: [], loading: false, rowsLoaded: true }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    solutionRevealed: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { extra_words: 3, difficulty: 3, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    brand: 'SnakeBox',
    title: 'New game',
    ...over,
  } as unknown as GamePageCtx
}

/** Flatten what PlayArea handed `menu.setGameSections` into id → item. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = setSections.mock.calls.at(-1)?.[0] ?? []
  return new Map(
    (sections as { items: { id: string; label: string; icon?: unknown; disabled?: boolean; onClick: () => void }[] }[])
      .flatMap((s) => s.items)
      .map((i) => [i.id, i]),
  )
}

beforeEach(() => {
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('letterboxed PlayArea — the game menu is the icon legend', () => {
  it('coop names both rungs of the help ladder, each with its glyph', () => {
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('hint')?.label).toBe('Hint')
    expect(items.get('hint')?.icon).toBeTruthy()
    expect(items.get('spoiler')?.label).toBe('Show the word')
    expect(items.get('spoiler')?.icon).toBeTruthy()
  })

  it('compete omits the ladder entirely — the buttons never render there either', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    const items = menuItems(ctx)
    expect(items.has('hint')).toBe(false)
    expect(items.has('spoiler')).toBe(false)
  })

  it('names the terminal Reveal solution — greyed while the game is live', () => {
    const live = makeCtx()
    render(<PlayArea {...live} />)
    const reveal = menuItems(live).get('reveal')
    expect(reveal?.label).toBe('Reveal solution')
    expect(reveal?.icon).toBeTruthy()
    // Present-but-disabled, not absent: a greyed row still teaches its glyph,
    // and common.reveal_solution is the real gate.
    expect(reveal?.disabled).toBe(true)

    const done = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('reveal')?.disabled).toBe(false)
  })

  it('the Reveal row fires the shared reveal_solution RPC', async () => {
    const commonDb = (await import('../../common/db')).db as unknown as { rpc: ReturnType<typeof vi.fn> }
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    commonDb.rpc.mockResolvedValue({ error: null })
    render(<PlayArea {...ctx} />)
    menuItems(ctx).get('reveal')?.onClick()
    expect(commonDb.rpc).toHaveBeenCalledWith('reveal_solution', { target_game: 'g1' })
  })
})
