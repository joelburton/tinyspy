// cs-audited-game-lib

import { describe, it, expect, vi } from 'vitest'
import { buildGameMenu, END_OR_CONCEDE_IDS } from './gameMenu'
import type { MenuItem } from '../menu/menu'

/**
 * What the shared menu framing puts on screen, and in what order.
 *
 * **Order is behavior here, not presentation.** The shell's ⌥⌫ takes the FIRST
 * item whose id is in `END_OR_CONCEDE_IDS` (`GamePage.tsx:491-493`), so which
 * exit the shortcut fires is decided by array position — Concede is written
 * before End, and that is the whole implementation of "the shortcut follows the
 * mode's primary exit". A careless reorder would move the shortcut to the wrong
 * act and break nothing else, which is why the compete-with-both case asserts
 * position and not just membership.
 *
 * That case is also the one nothing else covers. `buildGameMenu`'s output is
 * asserted through the games — ten PlayArea tests name End/Concede, and
 * crosswords pins its whole id order — but `offerEndInCompete` has exactly one
 * caller (bananagrams), whose own test hands `setGameSections` a `vi.fn()` it
 * never reads.
 */

const menu = { openHelp: vi.fn(), requestBackToClub: vi.fn() }

/** Every row the menu renders, flattened — the shape the shell's shortcut
 *  dispatchers walk. */
function idsOf(sections: { items: MenuItem[] }[]): string[] {
  return sections.flatMap((s) => s.items).map((i) => i.id)
}

function itemOf(sections: { items: MenuItem[] }[], id: string): MenuItem | undefined {
  return sections.flatMap((s) => s.items).find((i) => i.id === id)
}

describe('buildGameMenu', () => {
  it('frames a coop menu with Help + chat above and End + Back below', () => {
    const sections = buildGameMenu({ menu, mode: 'coop', isTerminal: false })
    expect(idsOf(sections)).toEqual(['help', 'chat', 'end-game', 'back'])
    // Coop has one exit, so it carries the shortcut.
    expect(itemOf(sections, 'end-game')?.shortcut).toBe('⌥⌫')
    expect(itemOf(sections, 'back')?.shortcut).toBe('⇧<')
  })

  it('offers Concede instead of End in compete', () => {
    const sections = buildGameMenu({ menu, mode: 'compete', isTerminal: false })
    expect(idsOf(sections)).toEqual(['help', 'chat', 'concede', 'back'])
    expect(itemOf(sections, 'concede')?.shortcut).toBe('⌥⌫')
  })

  it('puts Concede FIRST when a compete game offers both exits, so ⌥⌫ finds it', () => {
    const sections = buildGameMenu({
      menu,
      mode: 'compete',
      isTerminal: false,
      offerEndInCompete: true,
    })
    // Position, not just membership: End sits BENEATH Concede.
    expect(idsOf(sections)).toEqual(['help', 'chat', 'concede', 'end-game', 'back'])
    // The shortcut rides the mode's primary exit, and the second exit carries
    // none — two items advertising ⌥⌫ would be a lie about what it fires.
    expect(itemOf(sections, 'concede')?.shortcut).toBe('⌥⌫')
    expect(itemOf(sections, 'end-game')?.shortcut).toBeUndefined()

    // The shell's own dispatch, reproduced: first match wins.
    const fired = sections
      .flatMap((s) => s.items)
      .find((i) => END_OR_CONCEDE_IDS.includes(i.id as (typeof END_OR_CONCEDE_IDS)[number]))
    expect(fired?.id).toBe('concede')
  })

  it('leaves End enabled for a player who has conceded', () => {
    // A decision, not an oversight (Joel, 2026-09-04): ending is the group
    // agreeing there is no result, and choosing it is freely open — a conceder
    // is still in the conversation. Concede is what `conceded` disables.
    const sections = buildGameMenu({
      menu,
      mode: 'compete',
      isTerminal: false,
      conceded: true,
      offerEndInCompete: true,
    })
    expect(itemOf(sections, 'concede')?.disabled).toBe(true)
    expect(itemOf(sections, 'end-game')?.disabled).toBe(false)
  })

  it('disables both exits once the game is terminal', () => {
    const sections = buildGameMenu({
      menu,
      mode: 'compete',
      isTerminal: true,
      offerEndInCompete: true,
    })
    expect(itemOf(sections, 'concede')?.disabled).toBe(true)
    expect(itemOf(sections, 'end-game')?.disabled).toBe(true)
  })

  it('drops the game its own sections between the two framing halves', () => {
    const sections = buildGameMenu({
      menu,
      mode: 'coop',
      isTerminal: false,
      extra: [{ items: [{ id: 'print', label: 'Print board (PDF)', onClick: vi.fn() }] }],
    })
    expect(idsOf(sections)).toEqual(['help', 'chat', 'print', 'end-game', 'back'])
  })

  it('pins a header-only section above everything when a header is given', () => {
    const sections = buildGameMenu({
      menu,
      mode: 'coop',
      isTerminal: false,
      header: { title: 'Sunday Crossword', lines: ['by A. Setter'] },
    })
    // It carries no items of its own — the renderer keeps a section that has a
    // header and nothing else (Menu.tsx), which is what makes this shape legal.
    expect(sections[0]?.header?.title).toBe('Sunday Crossword')
    expect(sections[0]?.items).toEqual([])
    expect(idsOf(sections)).toEqual(['help', 'chat', 'end-game', 'back'])
  })
})
