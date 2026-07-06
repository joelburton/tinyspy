/**
 * The reusable core of the crosswords import: a `.puz`/`.ipuz` file
 * buffer → the three pieces the `crosswords.puzzles` row needs
 * (`meta` template, shielded `solution`, dedup `content_hash`).
 *
 * Stage 1 stops here — the psql-writing CLI (`crosswords:import`) that
 * wraps this and upserts the row lands in a later stage. Keeping the pure
 * conversion separate means it's testable without a database.
 */

import { basename, extname } from 'node:path'
import type { PuzzleTemplate } from '../../../src/crosswords/lib/types'
import { detectFormat, parsePuzzleBuffer } from '../../../src/crosswords/lib/parse/format'
import { puzzleContentHash } from './contentHash'

export type ConvertedPuzzle = {
  /** Slug derived from the source filename — `meta.id`, and the natural
   *  library id. */
  id: string
  /** The immutable template destined for the `meta` jsonb column. */
  template: PuzzleTemplate
  /** The answer grid destined for the shielded `solution` jsonb column.
   *  Per cell: null for a block, else an array of accepted answers
   *  (length > 1 = Schrödinger). */
  solution: (string[] | null)[][]
  /** SHA-256 dedup key over the solving content (see `contentHash.ts`). */
  contentHash: string
}

/** Lowercase, runs of non-alphanumerics → `-`, trim. Empty input becomes
 *  "puzzle" so we never produce an empty id. Ported from crossplay's
 *  `slugify`. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'puzzle'
  )
}

/** Convert one puzzle file (identified by path, for the slug + format
 *  detection) into its storable pieces. Throws `IpuzUnsupportedError` on
 *  anything outside the supported subset. */
export function convertPuzzleFile(path: string, buffer: Buffer): ConvertedPuzzle {
  const id = slugify(basename(path, extname(path)))
  const format = detectFormat(path, buffer)
  const { state, solution } = parsePuzzleBuffer(id, buffer, format)
  const contentHash = puzzleContentHash(state, solution)
  const template: PuzzleTemplate = { ...state.meta, cells: state.snapshot.cells }
  return { id, template, solution, contentHash }
}
