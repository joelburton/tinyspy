// cs-unmet

/**
 * The actions connections binds and the menu it publishes from them, without
 * mounting a board: which rows the menu carries and in what order, what the
 * reveal says about itself before and after the end, and the hint list's
 * toggle. What an action DOES when run is the PlayArea tests' (they press the
 * buttons and keys).
 */
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { actionFixture } from '@/common/actions/action.fixture'
import { getActions } from '@/common/actions/actionsStore'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { menuRow, type MenuApi, type MenuSection } from '@/common/menu/menuModel'
import type { GameData } from './useGame'
import { useActionsAndMenu } from './useActionsAndMenu'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

/** A game in play, with where I stand overridable; only what the actions
 *  read. */
function gdWith(
  over: { isGameEnded?: boolean; isStillPlaying?: boolean; hasSolved?: boolean } = {},
): GameData {
  const isGameEnded = over.isGameEnded ?? false
  return {
    gameId: 'g1',
    mode: 'coop',
    isCompete: false,
    title: 'A game',
    setup: { timer: { kind: 'none' } },
    isGameEnded,
    events: [],
    players: [],
    playersById: {},
    puzzle: { board: { categories: [], tileOrder: [] }, remainingTiles: [] },
    matchedCategories: [],
    readout: { maxMistakes: 4, mistakeCount: 0 },
    setupRows: [],
    standing: {
      isLocallyTerminal: false,
      isStillPlaying: over.isStillPlaying ?? !isGameEnded,
      hasSolved: over.hasSolved ?? false,
    },
  } as unknown as GameData
}

/** Mount the hook with a fake menu, and hand back what it published. */
function setup(gd: GameData) {
  const setGameSections = vi.fn()
  const menu = {
    setGameSections,
    actHelp: actionFixture('act-help'),
    actChat: actionFixture('act-open-chat'),
    actBackToClub: actionFixture('act-back-to-club'),
  } as unknown as MenuApi
  const { result } = renderHook(() =>
    useActionsAndMenu({
      gd,
      myId: 'u1',
      localFeedbackSlot: createFeedbackSlot('local'),
      clubHandle: 'club',
      goToFollowUpGame: vi.fn(),
      menu,
      brand: 'WordKnit',
    }),
  )
  const sections = (setGameSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  const ids = sections.map((s) => s.items.map((item) => menuRow(item).id))
  return { result, ids }
}

/** What an action says about itself to the asker, right now. */
function stateOf(id: string, asker: 'button' | 'menu') {
  return getActions().find((b) => b.id === id)!.describe(asker)
}

describe('useActionsAndMenu — the menu', () => {
  it('publishes the rows in the info column\'s order', () => {
    const { ids } = setup(gdWith())
    expect(ids).toEqual([
      ['act-help', 'act-open-chat'],
      ['act-hint'],
      ['act-reveal', 'act-restart', 'act-new-game'],
      ['act-print-board'],
      ['act-concede', 'act-stop-game', 'act-back-to-club'],
    ])
  })

  it('hands back every action for the row, the shell\'s Back to club included', () => {
    const { result } = setup(gdWith())
    expect(Object.keys(result.current.actions)).toEqual([
      'actHint', 'actReveal', 'actRestart', 'actNewGame', 'actConcede', 'actStopGame',
      'actPrintBoard', 'actBackToClub',
    ])
  })
})

describe('useActionsAndMenu — the reveal', () => {
  it('is no button while I can still play, and a grayed menu row', () => {
    setup(gdWith())
    expect(stateOf('act-reveal', 'button').state).toBe('hidden')
    expect(stateOf('act-reveal', 'menu').state).toBe('disabled')
  })

  it('is a live button once the game has ended, with the solution still hidden', () => {
    const { result } = setup(gdWith({ isGameEnded: true }))
    expect(stateOf('act-reveal', 'button').state).toBe('active')
    expect(result.current.solutionShown).toBe(false)
  })

  it('shows the solution unasked to a solver, whose board already carries every band', () => {
    const { result } = setup(gdWith({ isGameEnded: true, hasSolved: true }))
    expect(result.current.solutionShown).toBe(true)
  })
})

describe('useActionsAndMenu — the hints', () => {
  it('toggles the list, and its words move with it', () => {
    const { result } = setup(gdWith())
    expect(result.current.hintsOpen).toBe(false)
    expect(stateOf('act-hint', 'button')).toEqual({ state: 'active', label: 'Hints' })
    act(() => result.current.actions.actHint.run())
    expect(result.current.hintsOpen).toBe(true)
    expect(stateOf('act-hint', 'button')).toEqual({ state: 'active', label: 'Hide hints' })
  })

  it('is gone, row and button, once I can no longer submit', () => {
    setup(gdWith({ isStillPlaying: false }))
    expect(stateOf('act-hint', 'button').state).toBe('hidden')
    expect(stateOf('act-hint', 'menu').state).toBe('hidden')
  })
})
