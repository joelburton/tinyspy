// cs-unmet

/**
 * The actions psychicnum binds and the menu it publishes from them, without
 * mounting a board: which rows the menu carries and in what order, and what
 * each action says about itself in each kind of game. What an action DOES when
 * run is the PlayArea tests' (they press the buttons and keys).
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ZTest_actionFixture } from '@/common/actions/action.fixture'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { menuRow, type MenuApi, type MenuSection } from '@/common/menu/menuModel'
import { ZTest_CONCEDED, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useActionsAndMenu } from './useActionsAndMenu'
import type { GGameData } from '../types'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const ME = { id: 'u1', username: 'me', color: 'red' }
const MOTH = { id: 'u2', username: 'moth', color: 'blue' }
const STOPPED = { reason: 'stopped' as const, detail: 'stopped', by: 'u1', winner: null }

/** A game in play, with the facts the actions read overridable. */
function gdWith(over: { ended?: boolean; outOfTheRace?: boolean } = {}): GGameData {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode: over.outOfTheRace ? 'compete' : 'coop',
      players: over.outOfTheRace ? [{ ...ME, ...ZTest_CONCEDED }, MOTH] : [ME],
      ending: over.ended ? STOPPED : null,
      outcome: over.ended ? 'neutral' : null,
    }),
    'u1',
  )
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
  const rows = new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
  return { result, ids, rows }
}

describe('useActionsAndMenu — the menu', () => {
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

describe('useActionsAndMenu — the hint and the spoiler', () => {
  it('are live while I can still play', () => {
    const { rows } = setup(gdWith())
    expect(rows.get('act-hint')?.disabled).toBe(false)
    expect(rows.get('act-spoiler')?.disabled).toBe(false)
  })

  it('gray while the game runs on without me', () => {
    const { rows } = setup(gdWith({ outOfTheRace: true }))
    expect(rows.get('act-hint')?.disabled).toBe(true)
    expect(rows.get('act-spoiler')?.disabled).toBe(true)
  })

  it('go once the game has ended', () => {
    // Still in the published sections: a hidden row drops out when the menu
    // draws, not before.
    const { rows } = setup(gdWith({ ended: true }))
    expect(rows.get('act-hint')?.hidden).toBe(true)
    expect(rows.get('act-spoiler')?.hidden).toBe(true)
  })
})

describe('useActionsAndMenu — the reveal', () => {
  it('starts with the secrets hidden', () => {
    const { result } = setup(gdWith({ ended: true }))
    expect(result.current.secretsShown).toBe(false)
  })
})
