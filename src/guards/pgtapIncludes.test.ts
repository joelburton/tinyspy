// cs-unmet

/**
 * Guard: **a pgTAP file that uses a shared helper `\ir`s the file defining it.**
 *
 * This one exists because of HOW it fails. `pg_temp.envelope_is` without its
 * include is not a failing assertion — psql aborts the whole file:
 *
 *     ERROR: function pg_temp.envelope_is(jsonb, jsonb, unknown) does not exist
 *
 * …and every assertion in it silently leaves the run. The suite then reports
 * FEWER failures than before, because the file's other tests are gone too. It
 * bit twice in one afternoon (wordle's `compete_test`, setgame's
 * `gameplay_test`) and both times the only tell was the total sliding — 2409 to
 * 2395 — while the failure count went DOWN. Nothing about that reads as "you
 * broke something", which is exactly why it needs a guard rather than care.
 *
 * The shape generalizes: any `pg_temp.` helper defined in `_shared/` belongs
 * here. It carries one entry today because `envelope_is` is the one the
 * envelope conversion adds to files that never needed it before — every other
 * shared helper has been in every file since it was written.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TESTS = 'supabase/tests'

/** helper name → the `_shared/` file that defines it. */
const HELPERS: Record<string, string> = {
  envelope_is: '_shared/envelope.psql',
}

function sqlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sqlFiles(full)
    return /\.(sql|psql)$/.test(entry) ? [full] : []
  })
}

/** Comment lines are prose ABOUT a helper — `_shared/envelope.psql` documents
 *  its own usage in a `--` block — and counting those would make the guard
 *  demand that a file include itself. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
}

describe('pgTAP shared-helper includes', () => {
  it('every file using a shared helper includes the file that defines it', () => {
    const offenders: string[] = []
    for (const file of sqlFiles(TESTS)) {
      const src = code(readFileSync(file, 'utf8'))
      for (const [helper, defines] of Object.entries(HELPERS)) {
        if (file.endsWith(defines)) continue // the definition itself
        if (!new RegExp(`\\bpg_temp\\.${helper}\\b`).test(src)) continue
        // Either spelling reaches it: most files sit one level down, so the
        // relative path is the same everywhere, but match on the basename so a
        // deeper directory would not silently pass.
        if (!src.includes(defines.split('/').pop()!)) {
          offenders.push(`${file}: uses pg_temp.${helper} without \\ir ${defines}`)
        }
      }
    }
    expect(
      offenders,
      'psql ABORTS the file — its assertions vanish from the run and the failure count goes DOWN',
    ).toEqual([])
  })

  it('the helper list names files that exist', () => {
    // A typo here would make the guard pass by checking nothing.
    for (const defines of Object.values(HELPERS)) {
      expect(() => statSync(join(TESTS, defines)), `${defines} is missing`).not.toThrow()
    }
  })
})
