// cs-blessed-pdf

/**
 * Tests for the shared word-list PDF body. drawWordColumns owns the
 * balance-then-paginate packing every word-list printer inherits;
 * drawWordListBody is the skeleton that places the board, the Setup to its
 * right, and the words BELOW whichever of the two is taller. What is pinned
 * is what a per-game printer can't see regress: the placeholder, the spill,
 * a section that has to open a new page, and where the body puts the board,
 * the Setup and the words.
 */

import { describe, expect, it, vi } from 'vitest'
import type { PrintHeader } from './frame'
import { fakePd } from './fakeJsPdf'
import { drawWordColumns, type WordRow } from './wordColumns'
import { drawWordListBody } from './wordListBody'
import { buildWordSections, type WordSection } from './wordSections'

const wordRows = (n: number): WordRow[] =>
  Array.from({ length: n }, (_, i) => ({ word: `w${i}`, found: { points: i, who: 'ada' } }))

describe('drawWordColumns', () => {
  it('draws a placeholder when there are no words', () => {
    const { pd, calls } = fakePd()
    drawWordColumns(pd, { startY: 100, cols: 4, rows: [] })
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'No words yet.')).toBe(true)
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
    // A short page → three rows per column → 12 words per page → 20 words spill.
    const { pd, calls } = fakePd({ pageBottom: 60 })
    drawWordColumns(pd, { startY: 0, cols: 4, rows: wordRows(20) })
    expect(calls.filter((c) => c.m === 'addPage').length).toBeGreaterThanOrEqual(1)
  })

  // A stacked section (compete's one per player) can arrive with no room left:
  // without the check, its heading lands at the bottom and one row per column
  // is drawn BELOW the sheet before the page break.
  it('starts a new page when the heading and a row will not fit', () => {
    const { pd, calls } = fakePd()
    drawWordColumns(pd, { startY: 760, cols: 4, rows: wordRows(8), heading: 'moth' })
    const texts = calls.filter((c) => c.m === 'text')
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(1)
    // The heading is the first thing drawn on the new page, at the margin.
    expect(texts[0]).toMatchObject({ args: ['moth', 28, 28] })
    // And nothing is drawn below the page's bottom.
    expect(texts.every((c) => (c.args[2] as number) <= pd.pageBottom)).toBe(true)
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
    // boardTop = contentTop = 72; drawn at (margin, contentTop).
    expect(drawBoard).toHaveBeenCalledWith(28, 72)
  })

  it('flows the word list below the board (heading present, board drawn once)', () => {
    const { pd, calls } = fakePd()
    const drawBoard = vi.fn(() => ({ w: 100, h: 80 }))
    drawWordListBody(pd, header, drawBoard, { cols: 6 })
    expect(drawBoard).toHaveBeenCalledTimes(1)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Words')).toBe(true)
  })

  // Pinned because a thinner fake once let this pass with the value never
  // drawn: drawSetup wraps through splitTextToSize, and a fake that returned
  // the doc there made the row's lines vanish silently.
  it('draws the Setup to the board\'s right', () => {
    const { pd, calls } = fakePd()
    drawWordListBody(pd, header, () => ({ w: 100, h: 80 }))
    // setupX = margin + w + 26 = 154; the value hangs past its label.
    const value = calls.find((c) => c.m === 'text' && c.args[0] === 'Hard')
    expect(value).toBeDefined()
    expect(value!.args[1] as number).toBeGreaterThan(154)
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
