// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * COMMON NEVER IMPORTS SHARED. The direction is one way, and this is the only
 * thing that says so.
 *
 * The two folders answer different questions (docs/common-folders.md):
 *
 *   - `src/common/` is the shell every game is MADE OF — chat, the manifest,
 *     the info sheet, the buttons. A game that lacks one of these is an
 *     exception, not a category.
 *   - `src/shared/` is a family — the found-words games' data model, the two
 *     games that drag tiles on a grid, the pair with an on-screen keyboard.
 *     Most games will never import any of it.
 *
 * So a game imports from both, and shared may reach up into common (a family's
 * row builder taking its row type from `word-list` is exactly right). What
 * must never happen is common reaching DOWN: the moment a shell file imports
 * `@/shared/bee-games/…`, every game carries a family's code, and the word
 * "common" stops meaning anything — the reader can no longer tell from the
 * import path whether a module is everyone's or three games'.
 *
 * The failure is silent without a check. Nothing breaks, nothing renders
 * wrong; the tree just quietly stops being two things, one file at a time.
 *
 * Both spellings are caught, because both resolve: the alias form
 * (`@/shared/…`) and a relative path that climbs into `src/shared/`. The
 * second is the one a future refactor produces by accident.
 */

const CWD = process.cwd()
const COMMON = join(CWD, 'src/common')
const SHARED = join(CWD, 'src/shared')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** Every module specifier a file imports, however it spells the import. */
const SPECIFIER =
  /(?:from\s+|import\s*\(\s*|import\s+|vi\.mock\(\s*|vi\.doMock\(\s*)(['"])([^'"\n]+)\1/g

describe('the shell', () => {
  it('never imports a shared family from common/', () => {
    const offenders: string[] = []

    for (const file of walk(COMMON)) {
      const src = readFileSync(file, 'utf8')
      for (const [, , spec] of src.matchAll(SPECIFIER)) {
        const reachesShared = spec!.startsWith('@/shared/')
          ? true
          : spec!.startsWith('.') &&
            !relative(SHARED, resolve(dirname(file), spec!)).startsWith('..')
        if (reachesShared) offenders.push(`${relative(CWD, file)}  →  ${spec}`)
      }
    }

    expect(
      offenders,
      'A file under src/common/ importing from src/shared/. Common is what ' +
        'every game is made of and shared is what a family of games has, so ' +
        'this direction makes the family everyone\'s. Three ways out: move the ' +
        'shared thing into common if it really is everyone\'s; move the common ' +
        'file into the family if it is honestly the family\'s (this is what ' +
        '`pdfTiles` did); or invert the call so the game hands the value ' +
        'down.\n\n' + offenders.join('\n'),
    ).toEqual([])
  })

  // A sanity floor: if the walk silently found nothing, the assertion above
  // would pass while proving nothing — the same hole every allowlist guard in
  // this folder plants against.
  it('actually reads the common tree', () => {
    expect(walk(COMMON).length).toBeGreaterThan(300)
  })
})
