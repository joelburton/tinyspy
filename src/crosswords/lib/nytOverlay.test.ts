import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import type { Cell } from './types'
import { applyOverlayMarkings, detectOverlayMarkings } from './nytOverlay'

/**
 * Ported from crossplay's `nyt.test.ts` overlay section. The fixtures are the
 * real NYT overlay PNGs — the same ground truth crossplay validated against —
 * so this pins byte-for-byte parity of the connected-component detector. pngjs
 * decodes each PNG into a `{ width, height, data }` shape that
 * `detectOverlayMarkings` consumes directly.
 */

const FIXTURE_DIR = resolve(fileURLToPath(import.meta.url), '..', 'fixtures')
const readPng = (name: string) => PNG.sync.read(readFileSync(resolve(FIXTURE_DIR, name)))

describe('detectOverlayMarkings: circles', () => {
  // The 2026-04-30 daily ("Oscar Bait") carries six circles drawn on top of
  // shaded theme cells in three rows (TROUT, SALMON, CHAR). The v6 cell `type`
  // field can't represent circled+shaded together, so these circles only exist
  // in the raster overlay.
  it('finds the six circles in the 4/30/26 overlay', () => {
    const png = readPng('nyt-overlay-salmon-trout-char.png')
    const m = detectOverlayMarkings(png, 15, 15)
    expect(m.circles).toEqual(new Set(['2,11', '2,13', '4,4', '4,6', '10,11', '10,13']))
    expect(m.barsRight).toEqual(new Set())
    expect(m.barsBottom).toEqual(new Set())
  })
})

describe('detectOverlayMarkings: bars', () => {
  // The 2026-04-02 daily ("a barred Thursday") has eight vertical bars on
  // inter-cell boundaries; the per-cell `type` field can't express bars at all.
  it('finds the eight vertical bars in the 4/2/26 overlay', () => {
    const png = readPng('nyt-overlay-bars-2026-04-02.png')
    const m = detectOverlayMarkings(png, 15, 15)
    expect(m.circles).toEqual(new Set())
    expect(m.barsBottom).toEqual(new Set())
    // "r,c" is the LEFT cell — the bar is on its right edge.
    expect(m.barsRight).toEqual(
      new Set(['2,0', '2,1', '4,2', '4,7', '7,4', '7,7', '10,0', '10,9']),
    )
  })
})

describe('applyOverlayMarkings', () => {
  it('unions detected circles onto an existing cell grid (never onto a block)', () => {
    const cells: Cell[][] = [
      [
        { kind: 'cell', number: null, fill: null, shaded: true },
        { kind: 'block' },
      ],
    ]
    applyOverlayMarkings(cells, {
      circles: new Set(['0,0', '0,1']),
      barsRight: new Set(),
      barsBottom: new Set(),
    })
    // Shaded cell becomes both shaded AND circled.
    expect(cells[0]![0]).toMatchObject({ shaded: true, circled: true })
    // Block at (0,1) is unchanged — we never add `circled` to a block.
    expect(cells[0]![1]).toEqual({ kind: 'block' })
  })

  it("sets markRight/markBottom 'break' on the named cells (never onto a block)", () => {
    const cells: Cell[][] = [
      [
        { kind: 'cell', number: null, fill: null },
        { kind: 'cell', number: null, fill: null },
      ],
      [
        { kind: 'cell', number: null, fill: null },
        { kind: 'block' },
      ],
    ]
    applyOverlayMarkings(cells, {
      circles: new Set(),
      barsRight: new Set(['0,0']),
      barsBottom: new Set(['0,1', '1,1']),
    })
    expect(cells[0]![0]).toMatchObject({ markRight: 'break' })
    expect(cells[0]![1]).toMatchObject({ markBottom: 'break' })
    // Block at (1,1) is unchanged — we never write marks onto a block.
    expect(cells[1]![1]).toEqual({ kind: 'block' })
  })
})
