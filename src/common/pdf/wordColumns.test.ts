/**
 * Tests for the shared word-list PDF body (boggle, spellingbee, bananagrams).
 * drawWordColumns owns the balance-then-paginate packing every word-list
 * printer inherits; drawWordListBody is the skeleton that places the board, the
 * Setup to its right, and the words BELOW whichever of the two is taller. We pin
 * the placeholder, the "fits without spilling" case, the overflow spill, and
 * that the body flows words below the board — the parts a per-game printer
 * can't see regress.
 */

import { describe, expect, it, vi } from 'vitest'
import type { jsPDF } from 'jspdf'
import type { PrintDoc, PrintHeader } from './frame'
import { drawWordColumns, type WordRow } from './wordColumns'
import { drawWordListBody } from './wordListBody'

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

const wordRows = (n: number): WordRow[] =>
  Array.from({ length: n }, (_, i) => ({ word: `w${i}`, found: { points: i, who: 'ada' } }))

describe('drawWordColumns', () => {
  it('draws a placeholder when there are no words', () => {
    const { pd, calls } = fakePd()
    drawWordColumns(pd, { startY: 100, cols: 4, rows: [] })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'No words yet.')).toBe(true)
  })

  it('uses a custom empty message when given one', () => {
    const { pd, calls } = fakePd()
    drawWordColumns(pd, { startY: 100, cols: 6, rows: [], emptyText: 'Empty grid.' })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Empty grid.')).toBe(true)
  })

  it('draws the heading and every word without paginating when they fit', () => {
    const { pd, calls } = fakePd()
    drawWordColumns(pd, { startY: 100, cols: 4, rows: wordRows(8), heading: 'Finds' })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Finds')).toBe(true)
    for (let i = 0; i < 8; i++) {
      expect(calls.some((c) => c.m === 'text' && c.args[0] === `w${i}`)).toBe(true)
    }
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(0)
  })

  it('spills onto new pages when the balanced height overflows', () => {
    // A tiny page bottom → one row per column → 4 words per page → 20 words spill.
    const { pd, calls } = fakePd({ pageBottom: 20 })
    drawWordColumns(pd, { startY: 0, cols: 4, rows: wordRows(20) })
    expect(calls.filter((c) => c.m === 'addPage').length).toBeGreaterThanOrEqual(1)
  })
})

describe('drawWordListBody', () => {
  const header: PrintHeader & { words: WordRow[] } = {
    brand: 'MothCubes', gameTitle: 'g', date: '', summary: '',
    setup: [{ label: 'Difficulty', value: 'Hard' }],
    words: wordRows(3),
  }

  it('renders the board at the top-left below the header band', () => {
    const { pd } = fakePd()
    const drawBoard = vi.fn(() => ({ w: 100, h: 80 }))
    drawWordListBody(pd, header, drawBoard)
    // boardTop = margin + 44 = 72; drawn at (margin, boardTop).
    expect(drawBoard).toHaveBeenCalledWith(28, 72)
  })

  it('flows the word list below the board (heading present, board drawn once)', () => {
    const { pd, calls } = fakePd()
    const drawBoard = vi.fn(() => ({ w: 100, h: 80 }))
    drawWordListBody(pd, header, drawBoard, { cols: 6 })
    expect(drawBoard).toHaveBeenCalledTimes(1)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Words')).toBe(true)
  })
})
