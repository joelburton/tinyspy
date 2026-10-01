// cs-unmet

/**
 * The actions wordle binds and the menu it publishes from them, without
 * mounting a board: which rows the menu carries and in what order, and what
 * the reveal says about itself before and after the end. What an action DOES
 * when run is the PlayArea tests' (they press the buttons and keys).
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { getBoundActions } from '@/common/actions/boundActionsStore'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { menuRow, type MenuApi, type MenuSection } from '@/common/menu/menuModel'
import type { GameData } from './useGame'
import { useBindActionsAndPublishMenu } from './useBindActionsAndPublishMenu'

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
    setup: {},
    isGameEnded,
    target: isGameEnded ? 'crane' : null,
    events: [],
    players: [],
    playersById: {},
    readout: { maxGuesses: 6 },
    setupRows: [],
    standing: {
      isPlayerEnded: false,
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
    actHelp: boundActionFixture('act-help'),
    actChat: boundActionFixture('act-open-chat'),
    actBackToClub: boundActionFixture('act-back-to-club'),
  } as unknown as MenuApi
  const { result } = renderHook(() =>
    useBindActionsAndPublishMenu({
      gd,
      selfId: 'u1',
      localFeedbackSlot: createFeedbackSlot('local'),
      clubHandle: 'club',
      goToFollowUpGame: vi.fn(),
      menu,
      brand: 'WordNerd',
    }),
  )
  const sections = (setGameSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  const ids = sections.map((s) => s.items.map((item) => menuRow(item).id))
  return { result, ids }
}

/** What the reveal says about itself to the asker, right now. */
function revealState(asker: 'button' | 'menu') {
  return getBoundActions().find((b) => b.id === 'act-reveal')!.describe(asker).state
}

describe('useBindActionsAndPublishMenu — the menu', () => {
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

describe('useBindActionsAndPublishMenu — the reveal', () => {
  it('is no button while I can still play, and a grayed menu row', () => {
    setup(gdWith())
    expect(revealState('button')).toBe('hidden')
    expect(revealState('menu')).toBe('disabled')
  })

  it('is a live button once the game has ended, with the word still hidden', () => {
    const { result } = setup(gdWith({ isGameEnded: true }))
    expect(revealState('button')).toBe('active')
    expect(result.current.answerShown).toBe(false)
  })

  it('shows the word unasked to a solver, who typed it', () => {
    const { result } = setup(gdWith({ isGameEnded: true, hasSolved: true }))
    expect(result.current.answerShown).toBe(true)
  })
})
