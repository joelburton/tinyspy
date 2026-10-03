// cs-unmet

/**
 * The actions wordle binds and the menu it publishes from them, without
 * mounting a board: which rows the menu carries and in what order, and what
 * the reveal says about itself before and after the end. What an action DOES
 * when run is the PlayArea tests' (they press the buttons and keys).
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ZTest_actionFixture } from '@/common/actions/action.fixture'
import { getActions } from '@/common/actions/actionsStore'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { menuRow, type MenuApi, type MenuSection } from '@/common/menu/menuModel'
import { ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useActionsAndMenu } from './useActionsAndMenu'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

/** A solo coop game in play, or ended as the facts say, viewed by its one
 *  player. */
function gdWith(facts: ZTest_GameDataFacts = {}) {
  return makeGameData(ZTest_makeGameDataRaw(facts), 'u1')
}

/** The coop game lost on its last guess, with me — its one player — lost. */
const LOST: ZTest_GameDataFacts = {
  ending: { reason: 'resource_exhausted', detail: 'exhausted', by: 'u1', winner: null },
  outcome: 'lost',
  target: 'crane',
  players: [{ id: 'u1', username: 'me', outcome: 'lost' }],
}

/** The coop game won, by me typing the word. */
const WON: ZTest_GameDataFacts = {
  ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' },
  outcome: 'won',
  target: 'crane',
  players: [{ id: 'u1', username: 'me', outcome: 'won', finalRanking: 1, solvedAt: '2026-09-03T00:00:00Z' }],
}

/** Mount the hook with a fake menu, and hand back what it published. */
function setup(gd: ReturnType<typeof gdWith>) {
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
      myId: 'u1',
      localFeedbackSlot: createFeedbackSlot('local'),
      goToFollowUpGame: vi.fn(),
      menu,
    }),
  )
  const sections = (setGameSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  const ids = sections.map((s) => s.items.map((item) => menuRow(item).id))
  return { result, ids }
}

/** What the reveal says about itself to the asker, right now. */
function revealState(asker: 'button' | 'menu') {
  return getActions().find((b) => b.id === 'act-reveal')!.describe(asker).state
}

describe('useActionsAndMenu — the menu', () => {
  it('publishes the rows in the info column\'s order', () => {
    const { ids } = setup(gdWith())
    expect(ids).toEqual([
      ['act-help', 'act-open-chat'],
      ['act-reveal', 'act-restart', 'act-new-game'],
      ['act-print-board'],
      ['act-concede', 'act-stop-game', 'act-back-to-club'],
    ])
  })

  it('hands back every action for the row, the shell\'s Back to club included', () => {
    const { result } = setup(gdWith())
    expect(Object.keys(result.current.actions)).toEqual([
      'actReveal', 'actRestart', 'actNewGame', 'actConcede', 'actStopGame',
      'actPrintBoard', 'actBackToClub',
    ])
  })
})

describe('useActionsAndMenu — the reveal', () => {
  it('is no button while I can still play, and a grayed menu row', () => {
    setup(gdWith())
    expect(revealState('button')).toBe('hidden')
    expect(revealState('menu')).toBe('disabled')
  })

  it('is a live button once the game has ended, with the word still hidden', () => {
    const { result } = setup(gdWith(LOST))
    expect(revealState('button')).toBe('active')
    expect(result.current.answerShown).toBe(false)
  })

  it('shows the word unasked to a solver, who typed it', () => {
    const { result } = setup(gdWith(WON))
    expect(result.current.answerShown).toBe(true)
  })
})
