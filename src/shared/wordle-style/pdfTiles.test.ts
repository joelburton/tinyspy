// cs-audited-pdf

/**
 * Tests for the printed Wordle tile: the four states as border and fill
 * weight, `outlineBlank`, and the letter's color. The encoding is the whole
 * reason wordle and waffle print at all, so its table is pinned here rather
 * than read off four branches.
 */

import { describe, expect, it } from 'vitest'
import { fakeDoc, type Call } from '@/common/pdf/fakeJsPdf'
import { drawTile, drawTileLegend } from './pdfTiles'
import type { TileColor } from './tileColor'

/** The style argument of every `rect` drawn — 'S' a border, 'FD' a fill + border. */
const rectStyles = (calls: Call[]) => calls.filter((c) => c.m === 'rect').map((c) => c.args[4])

/** What `setTextColor` was last set to before the letter was drawn. */
const letterColor = (calls: Call[]) => calls.filter((c) => c.m === 'setTextColor').at(-1)?.args

describe('drawTile', () => {
  it.each<[TileColor, string[]]>([
    ['blank', []],
    ['wordleGray', ['S']],
    ['wordleYellow', ['FD']],
    ['wordleGreen', ['FD']],
  ])('%s → %j', (state, styles) => {
    const { doc, calls } = fakeDoc()
    drawTile(doc, { x: 0, y: 0, size: 20, letter: 'a', state })
    expect(rectStyles(calls)).toEqual(styles)
  })

  it('fills yellow lighter than green', () => {
    const fillOf = (state: TileColor) => {
      const { doc, calls } = fakeDoc()
      drawTile(doc, { x: 0, y: 0, size: 20, letter: '', state })
      return calls.find((c) => c.m === 'setFillColor')?.args[0] as number
    }
    expect(fillOf('wordleYellow')).toBeGreaterThan(fillOf('wordleGreen'))
  })

  it('outlines a blank only when asked, in the lighter gray', () => {
    const { doc, calls } = fakeDoc()
    drawTile(doc, { x: 0, y: 0, size: 20, letter: '', state: 'blank', outlineBlank: true })
    expect(rectStyles(calls)).toEqual(['S'])
    const border = calls.find((c) => c.m === 'setDrawColor')?.args[0] as number
    const { doc: doc2, calls: calls2 } = fakeDoc()
    drawTile(doc2, { x: 0, y: 0, size: 20, letter: 'a', state: 'wordleGray' })
    expect(border).toBeGreaterThan(calls2.find((c) => c.m === 'setDrawColor')?.args[0] as number)
  })

  it('draws the letter white on green and black elsewhere, uppercased', () => {
    const { doc, calls } = fakeDoc()
    drawTile(doc, { x: 0, y: 0, size: 20, letter: 'q', state: 'wordleGreen' })
    expect(letterColor(calls)).toEqual([255, 255, 255])
    expect(calls.find((c) => c.m === 'text')?.args[0]).toBe('Q')

    const { doc: doc2, calls: calls2 } = fakeDoc()
    drawTile(doc2, { x: 0, y: 0, size: 20, letter: 'q', state: 'wordleYellow' })
    expect(letterColor(calls2)).toEqual([0])
  })

  it('draws no letter for an empty slot', () => {
    const { doc, calls } = fakeDoc()
    drawTile(doc, { x: 0, y: 0, size: 20, letter: ' ', state: 'blank', outlineBlank: true })
    expect(calls.filter((c) => c.m === 'text')).toHaveLength(0)
  })
})

describe('drawTileLegend', () => {
  it('draws one swatch and label per non-blank state, left to right, and returns the y below', () => {
    const { doc, calls } = fakeDoc()
    const y = drawTileLegend(doc, 10, 100)
    expect(rectStyles(calls)).toEqual(['S', 'FD', 'FD'])
    const labels = calls.filter((c) => c.m === 'text').map((c) => c.args[0])
    expect(labels).toEqual(['not in word', 'wrong place', 'right place'])
    const xs = calls.filter((c) => c.m === 'text').map((c) => c.args[1] as number)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    expect(y).toBe(104)
  })
})
