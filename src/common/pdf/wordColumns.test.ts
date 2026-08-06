/**
 * Tests for the shared word-list PDF body (boggle, spellingbee, wordwheel).
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
import { buildWordSections, type WordSection } from './wordSections'

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
  const header: PrintHeader & { sections: WordSection[] } = {
    brand: 'MothCubes', gameTitle: 'g', date: '', summary: '',
    mode: 'coop' as const,
    setup: [{ key: 'x', label: 'Difficulty', value: 'Hard' }],
    // Coop's single unattributed section — the shape buildWordSections returns.
    sections: [{ who: null, tally: null, words: wordRows(3) }],
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

describe('buildWordSections', () => {
  const roster = [
    { user_id: 'u1', username: 'joel' },
    { user_id: 'u2', username: 'moth' },
    { user_id: 'u3', username: 'leah' },
  ]
  const words = [
    { word: 'CAT', found: { points: 1, who: 'joel' } },
    { word: 'DOGS', found: { points: 2, who: 'moth' } },
    { word: 'EMU', found: { points: 1, who: 'joel' } },
    { word: 'FOX', found: null }, // nobody found it — the terminal reveal
  ]

  it('coop is ONE unattributed section, rows untouched', () => {
    // Coop's list keeps its per-row finder: one shared hunt, and who got what
    // is worth seeing. Its totals are already in the page header.
    const s = buildWordSections(words, 'coop', roster, 'u1')
    expect(s).toEqual([{ who: null, tally: null, words }])
  })

  it('compete splits by player, in roster order, with each score', () => {
    const s = buildWordSections(words, 'compete', roster, 'u1')
    expect(s.map((x) => x.who)).toEqual(['joel (you)', 'moth', 'leah', 'Not found'])
    expect(s[0].tally).toBe('2 words · 2 pts')
    expect(s[1].tally).toBe('1 word · 2 pts')
    expect(s[0].words.map((w) => w.word)).toEqual(['CAT', 'EMU'])
  })

  it('keeps a player who found NOTHING — that is a result, not an omission', () => {
    const s = buildWordSections(words, 'compete', roster, 'u1')
    expect(s[2]).toMatchObject({ who: 'leah', tally: '0 words · 0 pts', words: [] })
  })

  it('drops the per-row finder inside a player section — the heading says it', () => {
    const s = buildWordSections(words, 'compete', roster, 'u1')
    expect(s[0].words.every((w) => w.found === null)).toBe(true)
  })

  it('files unfound words under their own section, credited to nobody', () => {
    // Putting a miss under a player would say they found it.
    const s = buildWordSections(words, 'compete', roster, 'u1')
    expect(s[3]).toEqual({ who: 'Not found', tally: null, words: [{ word: 'FOX', found: null }] })
  })

  it('omits the "Not found" section when everything was found', () => {
    const s = buildWordSections(words.slice(0, 3), 'compete', roster, 'u1')
    expect(s.map((x) => x.who)).toEqual(['joel (you)', 'moth', 'leah'])
  })
})
