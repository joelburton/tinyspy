import { detectFormat, parsePuzzleBuffer } from './parse/format'
import type { PuzzleTemplate } from './types'

/** The inline board `crosswords.create_game`'s `board` arg wants — the same
 *  `{meta, solution}` shape the NYT edge function produces, but parsed
 *  entirely client-side from an uploaded file. */
export type ImportedBoard = {
  meta: PuzzleTemplate
  solution: (string[] | null)[][]
}

/** Lowercase, runs of non-alphanumerics → `-`, trim; empty → "puzzle".
 *  Mirrors `convert.ts` slugify so an uploaded file gets the same `meta.id`. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'puzzle'
}

/**
 * Parse an uploaded `.puz` / `.ipuz` `File` into the inline board — the whole
 * conversion runs in the browser (puzjs is a dependency-free Uint8Array
 * reader; the ipuz parser is pure JSON). The result is passed straight into
 * `create_game`'s `board` arg (like the NYT path), so the game is
 * self-contained: no `crosswords.puzzles` row, and the solution stays shielded
 * on the game row after insert.
 *
 * Throws `IpuzUnsupportedError` (or a `SyntaxError` from bad JSON) on anything
 * outside the supported subset; the caller surfaces the message.
 */
export async function importCrosswordFile(file: File): Promise<ImportedBoard> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = slugify(file.name.replace(/\.[^.]*$/, ''))
  const format = detectFormat(file.name, bytes)
  const { state, solution } = parsePuzzleBuffer(id, bytes, format)
  return { meta: { ...state.meta, cells: state.snapshot.cells }, solution }
}
