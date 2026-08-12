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
        // MODELLED, not recorded: drawSetup wraps with this, and the recording
        // no-op below returns the doc where the caller needs a string[]. Greedy
        // word wrap, like jsPDF's own — and with width = 1pt/char (above), a
        // "line" is just `w` characters, so the expected split is countable by
        // hand in a test.
        if (prop === 'splitTextToSize') {
          return (s: unknown, w: number) => {
            const lines: string[] = []
            for (const word of String(s).split(' ')) {
              const last = lines[lines.length - 1]
              if (last !== undefined && `${last} ${word}`.length <= w) {
                lines[lines.length - 1] = `${last} ${word}`
              } else {
                lines.push(word)
              }
            }
            return lines.length ? lines : ['']
          }
        }
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
      { key: 'difficulty', label: 'Difficulty', value: 'Hard' },
      { key: 'mode', label: 'Mode', value: 'Co-op' },
    ]
    // cy starts at y+13, then +13 per item.
    expect(drawSetup(pd.doc, items, 40, 100, 'coop')).toBe(100 + 13 + items.length * 13)
  })

  // The heading carries the MODE (`Setup: Co-op`) rather than spending a row on
  // it — mode is locked at the gametype level, never a control on the setup
  // form, so it frames the block instead of sitting in it (docs/pdf.md → Setup
  // rows). Both spellings are pinned: a PDF is a standalone artifact with no app
  // chrome, so this heading is the only place the paper says which game it was.
  it('draws the "Setup" sub-heading, qualified by mode', () => {
    const { pd, calls } = fakePd()
    drawSetup(pd.doc, [], 40, 100, 'coop')
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup: Co-op')).toBe(true)
  })

  it('says Compete for a race', () => {
    const { pd, calls } = fakePd()
    drawSetup(pd.doc, [], 40, 100, 'compete')
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup: Compete')).toBe(true)
  })

  // Wrapping (the optional `maxW`). Worth pinning because the failure it
  // prevents is invisible in review and easy to miss on paper: an over-long
  // value doesn't clip or error, it draws past the right edge and off the
  // sheet. Two rows have no natural length bound — MothCubes' `Letters` prints
  // a whole 6×6 board, the roster prints every username.
  describe('a value too wide for the space', () => {
    // 41 characters = 41pt under the fake's 1pt/char.
    const LETTERS = [
      { key: 'letters', label: 'Letters', value: 'CATSER AREANT TILESO NESTAR PLANES TRACES' },
    ]
    /** Every `text()` call drawn at the VALUE's x (past the label), in order. */
    const valueLines = (calls: Array<{ m: string; args: unknown[] }>) =>
      calls.filter((c) => c.m === 'text' && (c.args[1] as number) > 40)

    it('wraps, hanging under the value rather than the label', () => {
      const { pd, calls } = fakePd()
      // 30pt total − 9pt of "Letters: " leaves 21pt, so this splits in two.
      const bottom = drawSetup(pd.doc, LETTERS, 40, 100, 'coop', 30)

      const lines = valueLines(calls)
      expect(lines.map((c) => c.args[0])).toEqual([
        'CATSER AREANT TILESO',
        'NESTAR PLANES TRACES',
      ])
      // One x for every line: continuation hangs under the value, so a two-line
      // row still reads as one fact.
      expect(new Set(lines.map((c) => c.args[1])).size).toBe(1)
      // And the returned cursor counts every line drawn — otherwise a caller
      // flowing content after the block would overlap it.
      expect(bottom).toBe(100 + 13 + lines.length * 13)
    })

    it('is left alone when it fits', () => {
      const { pd, calls } = fakePd()
      drawSetup(pd.doc, LETTERS, 40, 100, 'coop', 400)
      expect(valueLines(calls)).toHaveLength(1)
    })

    it('is left alone when no width is given (the turn-log caller)', () => {
      const { pd, calls } = fakePd()
      drawSetup(pd.doc, LETTERS, 40, 100, 'coop')
      expect(valueLines(calls)).toHaveLength(1)
    })
  })
})

describe('savePrint', () => {
  const header = { brand: '', gameTitle: '', date: '', summary: '', setup: [], mode: 'coop' as const }

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
