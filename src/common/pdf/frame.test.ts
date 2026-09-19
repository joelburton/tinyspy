// cs-audited-pdf

/**
 * Tests for the shared print frame (doc.md) — the primitives every game's
 * printer composes, so a regression here degrades every printout at once.
 * Rather than render real PDFs, we drive the helpers with the folder's fake
 * jsPDF (`fakeJsPdf.ts`), which records its calls and models text width as
 * one point per character; that keeps the assertions on the pure assembly
 * (returned cursors, the filename slug, the fit truncation) the way
 * crosswords/pdf/layout.test.ts pins pure geometry.
 */

import { describe, expect, it } from 'vitest'
import { BLACK, DARK_GRAY, MEDIUM_GRAY, drawSetup, drawSetupBelow, fit, savePrint, setupBlockHeight, setupLineCount } from './frame'
import { fakeDoc, fakePd, type Call } from './fakeJsPdf'

describe('shade palette', () => {
  it('is the three-shade grayscale from doc.md', () => {
    expect([BLACK, DARK_GRAY, MEDIUM_GRAY]).toEqual([0, 70, 180])
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
    expect(drawSetup(pd.doc, items, 40, 100, 'coop', 400)).toBe(100 + 13 + items.length * 13)
  })

  // The event-log body and drawSetupBelow ask this before drawing, to decide
  // whether the block fits; it has to agree with what drawSetup then draws —
  // wrapped lines included.
  it('takes the height setupLineCount + setupBlockHeight promised', () => {
    const { pd } = fakePd()
    const items = [
      { key: 'a', label: 'A', value: '1' },
      { key: 'letters', label: 'Letters', value: 'CATSER AREANT TILESO NESTAR PLANES TRACES' },
      { key: 'c', label: 'C', value: '3' },
    ]
    const lines = setupLineCount(pd.doc, items, 30) // 1 + 1 + 2 (the wrap) + 1
    expect(lines).toBe(5)
    expect(drawSetup(pd.doc, items, 40, 100, 'coop', 30) - 100).toBe(setupBlockHeight(lines))
  })

  // The heading carries the MODE (`Setup: Co-op`) rather than spending a row on
  // it — mode is locked at the gametype level, never a control on the setup
  // form, so it frames the block instead of sitting in it (common/setup-form/doc.md → Setup
  // rows). Both spellings are pinned: a PDF is a standalone artifact with no app
  // chrome, so this heading is the only place the paper says which game it was.
  it('draws the "Setup" sub-heading, qualified by mode', () => {
    const { pd, calls } = fakePd()
    drawSetup(pd.doc, [], 40, 100, 'coop', 400)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup: Co-op')).toBe(true)
  })

  it('says Compete for a race', () => {
    const { pd, calls } = fakePd()
    drawSetup(pd.doc, [], 40, 100, 'compete', 400)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup: Compete')).toBe(true)
  })

  // Wrapping. Worth pinning because the failure it prevents is invisible in
  // review and easy to miss on paper: an over-long value doesn't clip or
  // error, it draws past the right edge and off the sheet. Two rows have no
  // natural length bound — boggle's `Letters` prints a whole 6×6 board, the
  // roster prints every username.
  describe('a value too wide for the space', () => {
    // 41 characters = 41pt under the fake's 1pt/char.
    const LETTERS = [
      { key: 'letters', label: 'Letters', value: 'CATSER AREANT TILESO NESTAR PLANES TRACES' },
    ]
    /** Every `text()` call drawn at the VALUE's x (past the label), in order. */
    const valueLines = (calls: Call[]) =>
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
  })
})

describe('drawSetupBelow', () => {
  const m = {
    brand: '', gameTitle: '', date: '', summary: '', mode: 'coop' as const,
    setup: [{ key: 'a', label: 'A', value: '1' }, { key: 'b', label: 'B', value: '2' }],
  }

  it('draws at y when the block fits', () => {
    const { pd, calls } = fakePd()
    drawSetupBelow(pd, m, 500)
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(0)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup: Co-op' && c.args[2] === 500)).toBe(true)
  })

  it('starts a new page when the block would run off the sheet', () => {
    const { pd, calls } = fakePd()
    drawSetupBelow(pd, m, 764 - 20) // three lines of 13 do not fit in 20pt
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(1)
    expect(calls.some((c) => c.m === 'text' && c.args[0] === 'Setup: Co-op' && c.args[2] === 28)).toBe(true)
  })

  it('draws nothing for a game with no rows', () => {
    const { pd, calls } = fakePd()
    drawSetupBelow(pd, { ...m, setup: [] }, 500)
    expect(calls).toHaveLength(0)
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
