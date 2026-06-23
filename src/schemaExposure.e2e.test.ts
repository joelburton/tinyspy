import { beforeAll, describe, expect, it } from 'vitest'
import { games } from './games'

/**
 * Every registered game reaches its tables / RPCs through PostgREST via
 * `supabase.schema('<game>')`. For PostgREST to accept those requests,
 * the schema must be listed in `supabase/config.toml`'s `[api] schemas`
 * AND that config must be applied to the running stack (changing it
 * needs `supabase stop && supabase start` — a `db reset` does NOT
 * re-read it). If it isn't, EVERY request to that schema fails with
 * PostgREST code `PGRST106` "Invalid schema: <game>" — which surfaces
 * in the app as a "start" button that returns `Invalid schema: wordle`.
 *
 * The pgTAP suite runs SQL directly against Postgres and never goes
 * through PostgREST, so it cannot catch a missing / un-applied schema
 * exposure. This e2e test hits the real HTTP layer for every game's
 * schema (derived from the registry, so a new game is covered
 * automatically) and asserts the schema is reachable.
 *
 * Probe trick: request a table that doesn't exist. An EXPOSED schema
 * answers `PGRST205` (table not in cache); an UNEXPOSED schema answers
 * `PGRST106` (invalid schema). We only assert it's not `PGRST106`.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// One probe per unique schema the app talks to (every game + common).
const schemas = [...new Set([...games.map((g) => g.schema), 'common'])]

async function probe(schema: string): Promise<{ code?: string; message?: string }> {
  const res = await fetch(`${url}/rest/v1/__exposure_probe__?select=x`, {
    headers: { apikey: key!, 'Accept-Profile': schema },
  })
  return (await res.json()) as { code?: string; message?: string }
}

describe('PostgREST schema exposure (e2e)', () => {
  let stackUp = false

  // Skip gracefully if the local stack isn't running (e.g. CI without
  // Supabase) — but if it IS up, a missing schema is a hard failure.
  beforeAll(async () => {
    if (!url || !key) return
    try {
      await fetch(`${url}/rest/v1/`, { headers: { apikey: key } })
      stackUp = true
    } catch {
      stackUp = false
    }
  })

  it.each(schemas)('schema "%s" is exposed to PostgREST', async (schema) => {
    if (!stackUp) {
      // No reachable stack — nothing to assert against. (Locally the
      // stack is always up; this only no-ops in a stack-less CI run.)
      return
    }
    const body = await probe(schema)
    expect(
      body.code,
      `schema "${schema}" is NOT exposed by PostgREST — add it to ` +
        `supabase/config.toml [api] schemas and restart the stack ` +
        `(supabase stop && supabase start). Server said: ${body.message ?? ''}`,
    ).not.toBe('PGRST106')
  })
})
