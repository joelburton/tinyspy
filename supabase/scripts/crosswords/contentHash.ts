/**
 * Stable content hash for dedup of the puzzle library. The dedup key MUST
 * match crossplay's `puzzleContentHash` (and the NYT edge function's hash),
 * so the payload construction lives in one shared pure module
 * (`src/crosswords/lib/contentHash.ts`); this just applies node:crypto's
 * SHA-256 over it.
 */

import { createHash } from 'node:crypto'
import type { PuzzleState } from '../../../src/crosswords/lib/types'
import { contentHashPayload } from '../../../src/crosswords/lib/contentHash'

export function puzzleContentHash(
  state: PuzzleState,
  solution: (string[] | null)[][],
): string {
  const payload = contentHashPayload(state.snapshot.cells, state.meta.clues, solution)
  return createHash('sha256').update(payload).digest('hex')
}
