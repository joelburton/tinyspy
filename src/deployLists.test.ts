import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { games } from './games'

/**
 * The hand-maintained lists that have to name every game — checked against the
 * registry, statically.
 *
 * **Why this exists.** Adding a game means editing several enumerations that no
 * type system connects to `games.ts`, and each one fails in a different place
 * and at a different time:
 *
 * | list | where | what a missing entry costs |
 * |---|---|---|
 * | `[api] schemas` | `supabase/config.toml` | every local request → `PGRST106` |
 * | `EXPOSED_SCHEMAS` | `supabase/deploy/env.sh` | every PROD request → `PGRST106` |
 * | `BACKUP_SCHEMAS` | `Makefile` | `db-backup` silently omits the game's data |
 *
 * [`schemaExposure.e2e.test.ts`](./schemaExposure.e2e.test.ts) already probes
 * the running stack, which is the strongest possible check — but it can only
 * see LOCAL. A game can be green all the way through the suite and still fail
 * every request the moment it reaches production, because the prod list lives
 * in a shell script nothing reads. setgame shipped exactly that way and it was
 * caught by hand.
 *
 * The backup one is quieter and worse: nothing fails at all, and you find out
 * when you restore a dump and a game's tables are empty.
 *
 * These are string lists in files of three different formats, so this parses
 * rather than imports. Deliberately: the alternative is a generated file, and a
 * generator is one more thing to remember to run.
 */

// Resolved from the repo root — vitest runs there, and these three files are
// all outside `src/`.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

/** Every schema the app talks to — one per game, plus `common`. */
const schemas = [...new Set([...games.map((g) => g.schema), 'common'])].sort()

/** `schemas = ["public", …]` in the `[api]` block. */
function configTomlSchemas(): string[] {
  const line = read('supabase/config.toml').match(/^schemas\s*=\s*\[(.*)\]$/m)
  if (!line) throw new Error('supabase/config.toml: no `schemas = [...]` line found')
  return [...line[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

/** `EXPOSED_SCHEMAS="public,…"` — the hosted PostgREST config. */
function exposedSchemas(): string[] {
  const line = read('supabase/deploy/env.sh').match(/^EXPOSED_SCHEMAS="([^"]*)"/m)
  if (!line) throw new Error('supabase/deploy/env.sh: no EXPOSED_SCHEMAS="…" line found')
  return line[1].split(',').map((s) => s.trim())
}

/** `BACKUP_SCHEMAS := auth|common|…` — a psql-style anchored alternation. */
function backupSchemas(): string[] {
  const line = read('Makefile').match(/^BACKUP_SCHEMAS\s*:=\s*(.+)$/m)
  if (!line) throw new Error('Makefile: no BACKUP_SCHEMAS := … line found')
  return line[1].trim().split('|').map((s) => s.trim())
}

describe('deploy lists name every game', () => {
  it.each(schemas)('config.toml [api] schemas includes "%s"', (schema) => {
    expect(
      configTomlSchemas(),
      `add "${schema}" to supabase/config.toml [api] schemas, then restart the ` +
        `stack (a db reset does NOT re-read it)`,
    ).toContain(schema)
  })

  it.each(schemas)('deploy/env.sh EXPOSED_SCHEMAS includes "%s"', (schema) => {
    expect(
      exposedSchemas(),
      `add "${schema}" to EXPOSED_SCHEMAS in supabase/deploy/env.sh, or every ` +
        `request to it in PRODUCTION fails with PGRST106. Re-run ` +
        `\`gmake project-config-api ENV=prod\` after changing it.`,
    ).toContain(schema)
  })

  it.each(schemas)('Makefile BACKUP_SCHEMAS includes "%s"', (schema) => {
    expect(
      backupSchemas(),
      `add "${schema}" to BACKUP_SCHEMAS in the Makefile, or \`gmake db-backup\` ` +
        `dumps everything EXCEPT this game and says nothing about it`,
    ).toContain(schema)
  })

  // The two PostgREST lists configure the same thing in two places (local vs
  // hosted), so a difference between them is always a mistake in one of them.
  it('the local and hosted PostgREST schema lists agree', () => {
    expect([...exposedSchemas()].sort()).toEqual([...configTomlSchemas()].sort())
  })
})
