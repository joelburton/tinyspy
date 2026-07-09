/**
 * Browser download entry points for the crossword print PDFs.
 *
 * `generateCrosswordPdf` (a verbatim port of crossplay's jsPDF print
 * module) builds the **puzzle** PDF as a `Blob` from the template the FE
 * already holds; `generateSolutionPdf` builds the **answer-key** PDF from a
 * solution grid the caller fetches via the `solution_for` RPC (the FE never
 * holds the shielded solution otherwise). These wrappers turn either blob
 * into a file the browser saves to disk via a temporary object URL + a
 * synthetic `<a download>` click.
 */

import { generateCrosswordPdf } from './generator'
import { generateSolutionPdf, type Solution } from './solution'
import type { PuzzleState } from '../lib/types'

/** Save `blob` to disk as `${filename}.pdf`. */
function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generate the puzzle PDF for `state` and trigger a browser download
 * of it as `${filename}.pdf`.
 */
export async function printCrosswordsPdf(state: PuzzleState, filename: string): Promise<void> {
  downloadPdf(await generateCrosswordPdf(state), filename)
}

/**
 * Generate the answer-key PDF for `state` + `solution` and download it as
 * `${filename}.pdf`.
 */
export async function printCrosswordsSolutionPdf(
  state: PuzzleState,
  solution: Solution,
  filename: string,
): Promise<void> {
  downloadPdf(await generateSolutionPdf(state, solution), filename)
}
