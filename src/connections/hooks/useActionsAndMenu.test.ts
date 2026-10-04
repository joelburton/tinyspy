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
import { ZTest_actionFixture } from '@/common/actions/action.fixture'
import { getActions } from '@/common/actions/actionsStore'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { menuRow, type MenuApi, type MenuSection } from '@/common/menu/menuModel'
import { ZTest_ELIMINATED, ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import type { GGameData } from '../types'
import { useActionsAndMenu } from './useActionsAndMenu'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

/** A coop game in play unless the facts say otherwise. */
function gdWith(facts: ZTest_GameDataFacts = {}): GGameData {
  return makeGameData(ZTest_makeGameDataRaw(facts), 'u1')
}

/** A game that has ended as a Stop. */
const STOPPED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
  outcome: 'neutral',
}

/** Mount the hook with a fake menu, and hand back what it published. */
function setup(gd: GGameData) {
  const setGameSections = vi.fn()
  const menu = {
    setGameSections,
    actHelp: ZTest_actionFixture('act-help'),
    actChat: ZTest_actionFixture('act-open-chat'),
    actBackToClub: ZTest_actionFixture('act-back-to-club'),
  } as unknown as MenuApi
  const { result } = renderHook(() =>
    useActionsAndMenu({
      gd,
      localFeedbackSlot: createFeedbackSlot('local'),
      goToFollowUpGame: vi.fn(),
      menu,
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
    const { result } = setup(gdWith(STOPPED))
    expect(stateOf('act-reveal', 'button').state).toBe('active')
    expect(result.current.solutionShown).toBe(false)
  })

  it('shows the solution unasked to a solver, whose board already carries every band', () => {
    const { result } = setup(gdWith({
      ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' },
      outcome: 'won',
      players: [{ id: 'u1', username: 'me', color: 'red', solvedAt: '2026-06-15T00:05:00Z', outcome: 'won' }],
    }))
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
    setup(gdWith({
      mode: 'compete',
      players: [
        { id: 'u1', username: 'me', color: 'red', ...ZTest_ELIMINATED },
        { id: 'u2', username: 'moth', color: 'blue' },
      ],
    }))
    expect(stateOf('act-hint', 'button').state).toBe('hidden')
    expect(stateOf('act-hint', 'menu').state).toBe('hidden')
  })
})
