/**
 * Browser download entry point for the crossword print PDF.
 *
 * `generateCrosswordPdf` (a verbatim port of crossplay's jsPDF print
 * module — puzzle-only, deliberately no answer-key generator since the
 * frontend never holds the solution) builds the PDF as a `Blob`; this
 * wrapper turns that blob into a file the browser saves to disk via a
 * temporary object URL + a synthetic `<a download>` click.
 */

import { generateCrosswordPdf } from './generator'
import type { PuzzleState } from '../lib/types'

/**
 * Generate the puzzle PDF for `state` and trigger a browser download
 * of it as `${filename}.pdf`.
 */
export async function printCrosswordsPdf(state: PuzzleState, filename: string): Promise<void> {
  const blob = await generateCrosswordPdf(state)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
