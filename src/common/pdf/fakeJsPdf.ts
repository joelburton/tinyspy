// cs-audited-pdf

import type { jsPDF } from 'jspdf'
import type { PrintDoc } from './frame'

/** One recorded jsPDF call: the method name and its arguments. */
export type Call = { m: string; args: unknown[] }

/**
 * A jsPDF stand-in for the folder's tests: every method is a no-op that
 * records its call and returns the doc (so `.setFont(…).setFontSize(…)`
 * chains), except the few the helpers READ — those are modeled, because a
 * recording no-op returns the doc where the caller needs a number or a
 * `string[]`, and the test then passes while drawing nothing.
 *
 * Text is one point per character, so `fit` and a wrap are countable by hand.
 */
export function fakeDoc(): { doc: jsPDF; calls: Call[] } {
  const calls: Call[] = []
  const doc: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'getTextWidth') return (s: unknown) => (s == null ? 0 : String(s).length)
        if (prop === 'getLineWidth') return () => 1
        if (prop === 'internal') return { pageSize: { getWidth: () => 612, getHeight: () => 792 } }
        // Greedy word wrap, like jsPDF's own — with width = 1pt/char, a "line"
        // is just `w` characters.
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

/** A `PrintDoc` around a fake doc, with the Letter geometry `newPrintDoc`
 *  would cache; `over` narrows it (a short `pageBottom` forces a spill). */
export function fakePd(over: Partial<PrintDoc> = {}): { pd: PrintDoc; calls: Call[] } {
  const { doc, calls } = fakeDoc()
  const pd: PrintDoc = { doc, pageW: 612, pageH: 792, margin: 28, pageBottom: 764, contentTop: 72, ...over }
  return { pd, calls }
}
