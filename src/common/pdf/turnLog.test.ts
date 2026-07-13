/**
 * Tests for the shared turn-log PDF body (scrabble, psychicnum). twoColGeom is
 * pure page geometry — the board renderer and the log both derive their column
 * width from it, so it must stay exact. drawTurnLog owns the hand-managed
 * two-column-then-paginate cursor (PDF libs paginate by page, not column); we
 * pin the two behaviours a per-game printer can't see going wrong: the
 * empty-log placeholder and that a long log spills onto new pages.
 */

import { describe, expect, it } from 'vitest'
import type { jsPDF } from 'jspdf'
import type { PrintDoc } from './frame'
import { drawTurnLog, twoColGeom, type TurnRow } from './turnLog'

function fakeDoc() {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const doc: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'getTextWidth') return (s: unknown) => (s == null ? 0 : String(s).length)
        return (...args: unknown[]) => {
          calls.push({ m: prop, args })
          return doc
        }
      },
    },
  )
  return { doc: doc as jsPDF, calls }
}

function fakePd(over: Partial<PrintDoc> = {}) {
  const { doc, calls } = fakeDoc()
  const pd: PrintDoc = { doc, pageW: 612, pageH: 792, margin: 28, pageBottom: 764, ...over }
  return { pd, calls }
}

describe('twoColGeom', () => {
  it('splits the content width into two gutter-separated columns', () => {
    const { pd } = fakePd()
    const g = twoColGeom(pd)
    // colW = (612 - 2*28 - 22) / 2 = 267
    expect(g.colW).toBe(267)
    expect(g.leftX).toBe(28)
    expect(g.rightX).toBe(28 + 267 + 22) // leftX + colW + gutter
    expect(g.colTop).toBe(28 + 44)
  })
})

describe('drawTurnLog', () => {
  const rows = (n: number): TurnRow[] =>
    Array.from({ length: n }, (_, i) => ({ seq: i + 1, who: `p${i}`, text: `move ${i}` }))

  it('draws a placeholder row when there are no turns', () => {
    const { pd, calls } = fakePd()
    drawTurnLog(pd, { startY: 100, moveLabel: 'Move', rows: [], setup: [] })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'No turns yet.')).toBe(true)
  })

  it('uses a custom empty message when given one', () => {
    const { pd, calls } = fakePd()
    drawTurnLog(pd, { startY: 100, moveLabel: 'Guess', rows: [], setup: [], emptyText: 'No guesses.' })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'No guesses.')).toBe(true)
  })

  it('does not paginate a short log', () => {
    const { pd, calls } = fakePd()
    drawTurnLog(pd, { startY: 100, moveLabel: 'Move', rows: rows(5), setup: [] })
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(0)
  })

  it('spills a long log onto further pages (column-then-page flow)', () => {
    const { pd, calls } = fakePd()
    // Far more rows than two columns of one page can hold → at least one addPage.
    drawTurnLog(pd, { startY: 100, moveLabel: 'Move', rows: rows(300), setup: [] })
    expect(calls.filter((c) => c.m === 'addPage').length).toBeGreaterThanOrEqual(1)
  })
})
