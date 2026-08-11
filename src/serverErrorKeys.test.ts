/**
 * The server-error key INVENTORY — a repo-wide guard over the contract the
 * sixteen SQL files and `ERROR_COPY` share.
 *
 * Every `raise exception` in `supabase/sql/` emits a machine key
 * (`chain-full|5|`) and the frontend decides what, if anything, a player reads
 * (lib/game/serverError.ts). Nothing links the two sides at compile time — SQL
 * is text as far as TypeScript is concerned — so these assertions are the link.
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

/** Every key raised anywhere in supabase/sql/, with the files that raise it. */
function raisedKeys(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const m of sql.matchAll(/raise exception '([a-z][a-z0-9-]*)\|/g)) {
      const key = m[1]
      if (!out.has(key)) out.set(key, new Set())
      out.get(key)!.add(file.replace('.sql', ''))
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
