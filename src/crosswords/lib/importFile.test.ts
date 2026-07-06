import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importCrosswordFile } from './importFile'

// The .puz/.ipuz sample fixtures the parser tests also use.
const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/scripts/crosswords/fixtures',
)

/** Wrap a fixture file's bytes in a browser `File`, as the upload input would. */
function fileOf(name: string): File {
  return new File([readFileSync(resolve(FIXTURES, name))], name)
}

describe('importCrosswordFile', () => {
  it('parses a .puz upload into an inline board', async () => {
    const board = await importCrosswordFile(fileOf('sunday-sample.puz'))
    expect(board.meta.width).toBeGreaterThan(0)
    expect(board.meta.height).toBeGreaterThan(0)
    // meta.cells is the grid; solution is one row array per grid row.
    expect(board.meta.cells.length).toBe(board.meta.height)
    expect(board.solution.length).toBe(board.meta.height)
    expect(board.solution[0]?.length).toBe(board.meta.width)
  })

  it('parses an .ipuz upload into an inline board', async () => {
    const board = await importCrosswordFile(fileOf('sunday-sample.ipuz'))
    expect(board.meta.width).toBeGreaterThan(0)
    expect(board.solution.length).toBe(board.meta.height)
  })
})
