// cs-unmet

import { describe, it, expect, vi } from 'vitest'
import { buildGameMenu } from './gameMenu'
import { menuRow, type MenuItem, type MenuRow } from './menuModel'
import { boundActionFixture } from '../actions/boundAction.fixture'
import type { BoundAction } from '../actions/useBoundAction'
import type { ActionId } from '../actions/registry'

/**
 * What the shared menu framing puts on screen, and in what order.
 *
 * **Order is behavior here, not presentation.** A player reaches for the first
 * exit on the list, so a race writes Concede before End; and the exits sit
 * above Back to club, which is the last thing in every game's menu. Nothing
 * else about a row is decided here — which exit a mode offers, whether one
 * applies, what key it answers to are the actions' own, and the rows this
 * builds are references to them.
 *
 * A hidden action leaving the menu is `menuRow`'s doing, exercised through it
 * here because that is how `<Menu>` sees a row.
 */

/** A bound action, as a menu sees one. Hand-made rather than bound through the
 *  hook: what this file tests is arrangement, and a real binding would drag a
 *  React tree and a key dispatcher in with it. */
function action(id: string, over: Partial<BoundAction> = {}): BoundAction {
  return {
    id: id as ActionId,
    spec: { label: id },
    run: vi.fn(),
    describe: () => ({ state: 'active' }),
    pending: false,
    ...over,
  }
}

const actHelp = action('act-help')
const actChat = action('act-open-chat')
const actBackToClub = action('act-back-to-club')
const actEndGame = action('act-end-game')
const actConcede = action('act-concede')

const menu = { actHelp, actChat, actBackToClub }

/** Every row the menu draws, flattened and in order. */
function idsOf(sections: { items: MenuItem[] }[]): string[] {
  return sections
    .flatMap((s) => s.items)
    .map(menuRow)
    .filter((r: MenuRow) => !r.hidden)
    .map((r) => r.id)
}

describe('buildGameMenu', () => {
  it('frames a coop menu with Help + chat above and the exit + Back below', () => {
    const sections = buildGameMenu({ menu, exits: [actEndGame] })
    expect(idsOf(sections)).toEqual(['act-help', 'act-open-chat', 'act-end-game', 'act-back-to-club'])
  })

  it('drops the chat row on a page with no chat panel', () => {
    const sections = buildGameMenu({ menu: { ...menu, actChat: null }, exits: [actEndGame] })
    expect(idsOf(sections)).toEqual(['act-help', 'act-end-game', 'act-back-to-club'])
  })

  it('keeps the exits in the order the game gave them', () => {
    // Position, not just membership: a race offering both puts Concede first,
    // because that is the exit it means.
    const sections = buildGameMenu({ menu, exits: [actConcede, actEndGame] })
    expect(idsOf(sections)).toEqual([
      'act-help', 'act-open-chat', 'act-concede', 'act-end-game', 'act-back-to-club',
    ])
  })

  it('leaves out an exit the action says is hidden — how a mode picks one', () => {
    const hidden = action('act-end-game', { describe: () => ({ state: 'hidden' }) })
    const sections = buildGameMenu({ menu, exits: [actConcede, hidden] })
    expect(idsOf(sections)).toEqual([
      'act-help', 'act-open-chat', 'act-concede', 'act-back-to-club',
    ])
  })

  it('drops the game its own sections between the two framing halves', () => {
    const sections = buildGameMenu({
      menu,
      exits: [actEndGame],
      extra: [{ items: [boundActionFixture('act-print-board')] }],
    })
    expect(idsOf(sections)).toEqual([
      'act-help', 'act-open-chat', 'act-print-board', 'act-end-game', 'act-back-to-club',
    ])
  })

  it('pins a header-only section above everything when a header is given', () => {
    const sections = buildGameMenu({
      menu,
      exits: [actEndGame],
      header: { title: 'Sunday Crossword', lines: ['by A. Setter'] },
    })
    // It carries no items of its own — the renderer keeps a section that has a
    // header and nothing else (Menu.tsx), which is what makes this shape legal.
    expect(sections[0]?.header?.title).toBe('Sunday Crossword')
    expect(sections[0]?.items).toEqual([])
  })
})
