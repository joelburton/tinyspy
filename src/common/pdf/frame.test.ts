/**
 * Tests for the shared print frame (docs/pdf.md) — the à-la-carte primitives EVERY
 * game's printer composes, so a regression here degrades all five print outputs at
 * once. Rather than render real PDFs, we drive the helpers with a fake jsPDF that
 * records its calls and models text width as one point per character; that keeps the
 * assertions on the pure assembly (returned cursors, the filename slug, the fit
 * truncation) the way crosswords/pdf/layout.test.ts pins pure geometry.
 */

import { describe, expect, it } from 'vitest'
import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, MEDIUM_GREY, drawSetup, fit, savePrint, type PrintDoc } from './frame'

/** A chainable jsPDF stand-in: every method is a no-op that records its call and
 *  returns the doc (for `.setFont(...).setFontSize(...)` chaining); getTextWidth is
 *  a deterministic 1pt/char so `fit` is exactly predictable. */
function fakeDoc() {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const doc: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'getTextWidth') return (s: unknown) => (s == null ? 0 : String(s).length)
        if (prop === 'internal') return { pageSize: { getWidth: () => 612, getHeight: () => 792 } }
        return (...args: unknown[]) => {
          calls.push({ m: prop, args })
          return doc
        }
      },
    },
  )
  return { doc: doc as jsPDF, calls }
}

/** A PrintDoc around a fake doc, with the Letter geometry the helpers expect. */
function fakePd(over: Partial<PrintDoc> = {}) {
  const { doc, calls } = fakeDoc()
  const pd: PrintDoc = { doc, pageW: 612, pageH: 792, margin: 28, pageBottom: 764, ...over }
  return { pd, calls }
}

describe('shade palette', () => {
  it('is the three-shade greyscale from docs/pdf.md', () => {
    expect([BLACK, DARK_GREY, MEDIUM_GREY]).toEqual([0, 70, 180])
  })
})

describe('fit', () => {
  const { doc } = fakeDoc() // width = character count

  it('returns the text unchanged when it already fits', () => {
    expect(fit(doc, 'hello', 10)).toBe('hello')
    expect(fit(doc, 'hello', 5)).toBe('hello') // exactly at the limit
  })

  it('returns empty/falsy text untouched', () => {
    expect(fit(doc, '', 3)).toBe('')
  })

  it('truncates with an ellipsis to fit the width', () => {
    // 'hello world' is 11 wide; with the ellipsis counting as one, the longest
    // prefix p with (p + '…') ≤ 5 is 'hell'.
    expect(fit(doc, 'hello world', 5)).toBe('hell…')
  })

  it('keeps at least one character before the ellipsis', () => {
    expect(fit(doc, 'abcdef', 0)).toBe('a…')
  })
})

describe('drawSetup', () => {
  it('returns the y just below the block (heading + 13 per line)', () => {
    const { pd } = fakePd()
    const items = [
      { label: 'Difficulty', value: 'Hard' },
      { label: 'Mode', value: 'Co-op' },
    ]
    // cy starts at y+13, then +13 per item.
    expect(drawSetup(pd.doc, items, 40, 100)).toBe(100 + 13 + items.length * 13)
  })

  it('draws the "Setup" sub-heading', () => {
    const { pd, calls } = fakePd()
    drawSetup(pd.doc, [], 40, 100)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup')).toBe(true)
  })
})

describe('savePrint', () => {
  const header = { brand: '', gameTitle: '', date: '', summary: '', setup: [] }

  it('slugifies brand + title into a lowercase filename', () => {
    const { pd, calls } = fakePd()
    savePrint(pd, { ...header, brand: 'MothCubes', gameTitle: 'Fun Game!' }, 'board')
    expect(calls.find((c) => c.m === 'save')?.args[0]).toBe('mothcubes-fun-game.pdf')
  })

  it('falls back when the slug is empty', () => {
    const { pd, calls } = fakePd()
    savePrint(pd, { ...header, brand: '!!!', gameTitle: '###' }, 'board')
    expect(calls.find((c) => c.m === 'save')?.args[0]).toBe('board.pdf')
  })
})
