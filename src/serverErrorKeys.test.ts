/**
 * The server-error key INVENTORY — a repo-wide guard over the contract the
 * sixteen SQL files, the edge functions, and `ERROR_COPY` share.
 *
 * Every `raise exception` in `supabase/sql/` emits a machine key
 * (`chain-full|5|`), and every edge-function error return carries one too
 * (`json({ error: 'no-pangram-seeds|3|' })` — docs/edge-fn-error-keys-plan.md;
 * shape-guarded by edgeFnErrorKeys.test.ts). The frontend decides what, if
 * anything, a player reads (lib/game/serverError.ts). Nothing links the sides
 * at compile time — SQL and Deno are text as far as this app's TypeScript is
 * concerned — so these assertions are the link.
 *
 * ─── Why one is a FAILURE and one is only a REPORT ───────────
 * A key with no copy is a legitimate, common state: it means "no one expected a
 * player to see this", and it renders as a fault. 123 of the 175 keys are
 * deliberately in that bucket, so failing on them would be failing on the
 * design. Hence a printed list, not an assertion.
 *
 * Copy with NO key is the opposite: dead words for a rejection that can no
 * longer happen, which will drift silently out of date and mislead whoever
 * reads it next. That IS a failure.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERROR_COPY } from './common/lib/game/errorCopy'

const SQL_DIR = 'supabase/sql'
const FN_DIR = 'supabase/functions'

/** Every .ts file under supabase/functions (skipping tests), recursively. */
function edgeFnFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : edgeFnFiles(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('_test.ts') ? [p] : []
  })
}

/** Every key raised anywhere in supabase/sql/ or returned as an edge-function
 *  error, with the files that emit it. Both sources feed the same ERROR_COPY
 *  table, so the orphan check below must know both. */
function raisedKeys(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (key: string, source: string) => {
    if (!out.has(key)) out.set(key, new Set())
    out.get(key)!.add(source)
  }
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const m of sql.matchAll(/raise exception '([a-z][a-z0-9-]*)\|/g)) {
      add(m[1], file.replace('.sql', ''))
    }
  }
  for (const file of edgeFnFiles(FN_DIR)) {
    const src = readFileSync(file, 'utf8')
    // Key-headed string/template literals in error positions — the return
    // values themselves (json({ error: 'x|' })) and helpers that produce them
    // (validateCustomLetters' return 'bad-custom-center|').
    for (const m of src.matchAll(/['"\x60]([a-z][a-z0-9-]*)\|/g)) {
      add(m[1], file.slice(FN_DIR.length + 1))
    }
  }
  return out
}

describe('server-error keys', () => {
  it('every raise is key-shaped — no prose survives in any SQL file', () => {
    // The migration's completion condition, kept as a guard: a new `raise
    // exception 'something went wrong'` would put a developer's sentence in
    // front of a player again.
    const prose: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      for (const m of sql.matchAll(/raise exception\s+'((?:[^']|'')*)'/g)) {
        if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*\|/.test(m[1])) prose.push(`${file}: ${m[1]}`)
      }
    }
    expect(prose, 'a raise whose message is not a `key|detail|`').toEqual([])
  })

  it('every ERROR_COPY entry answers a key some file actually raises', () => {
    // Dead copy is worse than no copy: it reads as a considered decision and
    // nothing ever proves it wrong.
    const raised = raisedKeys()
    const orphans = Object.keys(ERROR_COPY).filter((k) => !raised.has(k))
    expect(orphans, 'copy for a key nothing raises — delete it or fix the key').toEqual([])
  })

  it('reports which keys have no copy (a list, not a failure)', () => {
    const raised = raisedKeys()
    const uncovered = [...raised.keys()].filter((k) => !(k in ERROR_COPY)).sort()
    const covered = [...raised.keys()].filter((k) => k in ERROR_COPY)
    // Printed so the split is visible when the suite runs — the number moving is
    // meaningful (a game got more player-facing, or a key got promoted), while
    // its absolute value is not something to hold to a threshold.
    console.log(
      `[keys] ${raised.size} distinct: ${covered.length} with copy (a pill), ` +
        `${uncovered.length} without (a fault)`,
    )
    expect(raised.size).toBeGreaterThan(0)
  })
})
