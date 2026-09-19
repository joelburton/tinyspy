// cs-audited-pdf

/**
 * Tests for the shared event-log PDF body. twoColGeom is
 * pure page geometry — the board renderer and the log both derive their column
 * width from it, so it must stay exact. drawEventLog owns the hand-managed
 * two-column-then-paginate cursor (PDF libs paginate by page, not column); we
 * pin the two behaviors a per-game printer can't see going wrong: the
 * empty-log placeholder and that a long log spills onto new pages.
 */

import { describe, expect, it } from 'vitest'
import { fakePd } from './fakeJsPdf'
import { drawEventLog, twoColGeom, type TurnRow } from './eventLog'

describe('twoColGeom', () => {
  it('splits the content width into two gutter-separated columns', () => {
    const { pd } = fakePd()
    const g = twoColGeom(pd)
    // colW = (612 - 2*28 - 22) / 2 = 267
    expect(g.colW).toBe(267)
    expect(g.leftX).toBe(28)
    expect(g.rightX).toBe(28 + 267 + 22) // leftX + colW + gutter
    expect(g.colTop).toBe(72) // the page's contentTop
  })
})

describe('drawEventLog', () => {
  const rows = (n: number): TurnRow[] =>
    Array.from({ length: n }, (_, i) => ({ seq: i + 1, who: `p${i}`, text: `move ${i}` }))

  it('draws a placeholder row when there are no turns', () => {
    const { pd, calls } = fakePd()
    drawEventLog(pd, { startY: 100, heading: 'Turns', moveLabel: 'Move', rows: [], setup: [], mode: 'coop' as const })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'No turns yet.')).toBe(true)
  })

  it('uses a custom empty message when given one', () => {
    const { pd, calls } = fakePd()
    drawEventLog(pd, { startY: 100, heading: 'Turns', moveLabel: 'Guess', rows: [], setup: [], mode: 'coop' as const, emptyText: 'No guesses.' })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'No guesses.')).toBe(true)
  })

  it('does not paginate a short log', () => {
    const { pd, calls } = fakePd()
    drawEventLog(pd, { startY: 100, heading: 'Turns', moveLabel: 'Move', rows: rows(5), setup: [], mode: 'coop' as const })
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(0)
  })

  it('spills a long log onto further pages (column-then-page flow)', () => {
    const { pd, calls } = fakePd()
    // Far more rows than two columns of one page can hold → at least one addPage.
    drawEventLog(pd, { startY: 100, heading: 'Turns', moveLabel: 'Move', rows: rows(300), setup: [], mode: 'coop' as const })
    expect(calls.filter((c) => c.m === 'addPage').length).toBeGreaterThanOrEqual(1)
  })
})
