// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Cell, PuzzleState } from '../lib/types'
import type { Solution } from './solution'

// Same jsPDF capture harness as generator.test.ts: each method records
// itself and returns `this` for chaining.
type Call = { fn: string; args: unknown[] }
const calls: Call[] = []

function makeMockDoc() {
  const draw = (fn: string) =>
    function (this: unknown, ...args: unknown[]) {
      calls.push({ fn, args })
      return this
    }
  return {
    setFont: draw('setFont'),
    setFontSize: draw('setFontSize'),
    setFillColor: draw('setFillColor'),
    setTextColor: draw('setTextColor'),
    setDrawColor: draw('setDrawColor'),
    setLineWidth: draw('setLineWidth'),
    text: draw('text'),
    rect: draw('rect'),
    line: draw('line'),
    ellipse: draw('ellipse'),
    addPage: draw('addPage'),
    splitTextToSize: (text: string) => [text],
    getTextWidth: () => 10,
    output: (type: string) => {
      calls.push({ fn: 'output', args: [type] })
      return new Blob(['pdf'], { type: 'application/pdf' })
    },
  }
}

vi.mock('jspdf', () => ({
  jsPDF: function MockJsPDF(this: ReturnType<typeof makeMockDoc>) {
    Object.assign(this, makeMockDoc())
  },
}))

/** 2×2 all-open puzzle; one given + one pencil so we can prove the answer
 *  grid overrides both. Blank fills — the answer key comes from `solution`. */
function makePuzzle(): PuzzleState {
  const cells: Cell[][] = [
    [
      { kind: 'cell', number: 1, fill: 'X', given: true },
      { kind: 'cell', number: 2, fill: 'Z', pencil: true },
    ],
    [
      { kind: 'cell', number: 3, fill: null },
      { kind: 'cell', number: null, fill: null },
    ],
  ]
  return {
    meta: {
      id: 'a1', title: 'Answer Key', author: 'T', copyright: '',
      note: 'Wordplay: HEART = anagram of EARTH.',
      width: 2, height: 2,
      clues: { across: [], down: [] },
    },
    snapshot: { version: 0, cells },
  }
}

/** Canonical answers C A / T S (with an alternate on one cell to prove we
 *  take element 0). */
function solution(): Solution {
  return [
    [['C'], ['A', 'O']],
    [['T'], ['S']],
  ]
}

describe('generateSolutionPdf', () => {
  it('returns a Blob and fills every open cell with the canonical answer', async () => {
    calls.length = 0
    const { generateSolutionPdf } = await import('./solution')
    const blob = await generateSolutionPdf(makePuzzle(), solution())
    expect(blob).toBeInstanceOf(Blob)

    // Title drawn.
    const texts = calls.filter((c) => c.fn === 'text').map((c) => c.args[0])
    expect(texts).toContain('Answer Key')

    // Canonical answers rendered (element 0 of each Schrödinger array) —
    // overriding the template's given 'X' and pencil 'Z'.
    expect(texts).toContain('C')
    expect(texts).toContain('A')
    expect(texts).toContain('T')
    expect(texts).toContain('S')
    expect(texts).not.toContain('X')
    expect(texts).not.toContain('Z')

    // The note flows into the clue region.
    expect(texts).toContain('Wordplay: HEART = anagram of EARTH.')

    // Answer letters draw in bold (given/pencil styling stripped) — no italic
    // pencil rendering survives.
    const setFonts = calls.filter((c) => c.fn === 'setFont')
    expect(setFonts.some((c) => c.args[1] === 'italic')).toBe(false)

    expect(calls.find((c) => c.fn === 'output')).toBeTruthy()
  })
})
