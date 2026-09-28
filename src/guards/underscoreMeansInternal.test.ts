// cs-unmet

/**
 * **A function without a leading `_` is one something outside SQL calls.**
 *
 * The underscore is how a reader of `supabase/sql/` tells a helper — called
 * only by other SQL, a security rule or a view — from a function the frontend
 * or an edge function calls (docs/code-conventions.md → RPC functions).
 * Without it the two look the same, and the only way to tell is to go
 * looking for callers.
 *
 * **The rule, as checked:** every function defined in `supabase/sql/` whose
 * name does not start with `_` is granted execute to `authenticated` (the
 * frontend) or `service_role` (an edge function). Only a grant makes a
 * function callable from outside SQL, so a public name without one is a
 * helper wearing the wrong name.
 *
 * **What it cannot tell:** the other direction. A helper that a security rule
 * or a `security_invoker` view calls runs as the player, so it must be
 * granted too (`common._is_club_member`, each game's `_solution_for`) — a
 * grant on an `_` function is therefore allowed, and a public-looking name
 * the frontend never actually calls would pass as long as it is granted.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL_DIR = 'supabase/sql'

type Fn = { file: string; name: string }

const defined: Fn[] = []
const granted = new Set<string>()
for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(SQL_DIR, file), 'utf8')
  for (const m of sql.matchAll(/^create or replace function ([a-z_]+\.[a-z0-9_]+)\(/gm)) {
    defined.push({ file, name: m[1]! })
  }
  for (const m of sql.matchAll(
    /^grant execute on function ([a-z_]+\.[a-z0-9_]+)\([^)]*\) to (authenticated|service_role);/gm,
  )) {
    granted.add(m[1]!)
  }
}

describe('a leading underscore means only SQL calls it', () => {
  it('finds the functions', () => {
    // A guard that finds nothing passes just as quietly as one that works.
    expect(defined.length).toBeGreaterThan(200)
  })

  it('every function without one is granted to a caller outside SQL', () => {
    const offenders = defined
      .filter(({ name }) => !name.split('.')[1]!.startsWith('_') && !granted.has(name))
      .map(({ file, name }) => `${file}: ${name}`)
    expect(
      offenders,
      'a helper nothing outside SQL can call — give it a leading _',
    ).toEqual([])
  })
})
