// cs-unmet

/**
 * The actions psychicnum binds and the menu it publishes from them, without
 * mounting a board: which rows the menu carries and in what order, and what
 * each action says about itself in each kind of game. What an action DOES when
 * run is the PlayArea tests' (they press the buttons and keys).
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { menuRow, type MenuApi, type MenuSection } from '@/common/menu/menuModel'
import type { GameData } from './useGame'
import { useBindActionsAndPublishMenu } from './useBindActionsAndPublishMenu'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

/** A game in play, with where I stand overridable; only what the actions read. */
function gdWith(over: { isGameEnded?: boolean; isStillPlaying?: boolean; isCompete?: boolean } = {}): GameData {
  const isGameEnded = over.isGameEnded ?? false
  return {
    gameId: 'g1',
    mode: over.isCompete ? 'compete' : 'coop',
    isCompete: over.isCompete ?? false,
    title: 'A game',
    setup: {},
    isGameEnded,
    board: { words: [] },
    events: [],
    players: [],
    playersById: {},
    readout: { requiredSecretsCount: 3 },
    standing: {
      isPlayerEnded: false,
      isStillPlaying: over.isStillPlaying ?? !isGameEnded,
      hasSolved: false,
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
      brand: 'PsychicNum',
    }),
  )
  const sections = (setGameSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  const ids = sections.map((s) => s.items.map((item) => menuRow(item).id))
  const rows = new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
  return { result, ids, rows }
}

describe('useBindActionsAndPublishMenu — the menu', () => {
  it('publishes the rows in the info column\'s order, divider for divider', () => {
    const { ids } = setup(gdWith())
    expect(ids).toEqual([
      ['act-help', 'act-open-chat'],
      ['act-hint', 'act-spoiler'],
      ['act-reveal', 'act-restart', 'act-new-game'],
      ['act-print-board'],
      ['act-concede', 'act-stop-game', 'act-back-to-club'],
    ])
  })

  it('hands back every action for the row, the shell\'s Back to club included', () => {
    const { result } = setup(gdWith())
    expect(Object.keys(result.current.actions)).toEqual([
      'actHint', 'actSpoiler', 'actReveal', 'actRestart', 'actNewGame',
      'actConcede', 'actStopGame', 'actPrintBoard', 'actBackToClub',
    ])
  })
})

describe('useBindActionsAndPublishMenu — the hint and the spoiler', () => {
  it('are live while I can still play', () => {
    const { rows } = setup(gdWith())
    expect(rows.get('act-hint')?.disabled).toBe(false)
    expect(rows.get('act-spoiler')?.disabled).toBe(false)
  })

  it('gray while the game runs on without me', () => {
    const { rows } = setup(gdWith({ isCompete: true, isStillPlaying: false }))
    expect(rows.get('act-hint')?.disabled).toBe(true)
    expect(rows.get('act-spoiler')?.disabled).toBe(true)
  })

  it('go once the game has ended', () => {
    // Still in the published sections: a hidden row drops out when the menu
    // draws, not before.
    const { rows } = setup(gdWith({ isGameEnded: true }))
    expect(rows.get('act-hint')?.hidden).toBe(true)
    expect(rows.get('act-spoiler')?.hidden).toBe(true)
  })
})

describe('useBindActionsAndPublishMenu — the reveal', () => {
  it('starts with the secrets hidden', () => {
    const { result } = setup(gdWith({ isGameEnded: true }))
    expect(result.current.secretsShown).toBe(false)
  })
})
