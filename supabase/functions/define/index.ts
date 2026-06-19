/**
 * define — Edge Function behind the click-to-define popover and the
 * "look up any word" shortcut. Read-through cache over the shared
 * `common.definitions` table:
 *
 *   1. Verify the caller's JWT (any signed-in user; definitions are
 *      not game-specific, so no membership check).
 *   2. Look the word up in common.definitions (as the caller; RLS
 *      grants authenticated SELECT).
 *        - non-null def  → return it (the seeded Scrabble gloss or a
 *          previously-cached Wiktionary entry). Done, no network.
 *        - NULL tombstone, still fresh → return "not found", cached.
 *        - absent, or stale tombstone → fall through to the API.
 *   3. Fetch Wiktionary (freedictionaryapi.com, CC BY-SA). Format a
 *      compact def string, or null if it has no entry.
 *   4. Cache the result back via common.cache_definition (as
 *      service_role — the only write path). A null result writes a
 *      tombstone so repeat lookups of an unknown word (the free-form
 *      box invites typos) don't re-hit the API. A *transient* API
 *      failure does NOT write a tombstone — we only cache a
 *      definitive empty answer.
 *
 * Response: { word, def: string | null, source: 'scrabble' |
 * 'wiktionary', cached: boolean }. def === null means "looked up,
 * no definition."
 *
 * Secrets (all auto-injected by the Edge Runtime):
 *   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/** Tombstone (NULL-def) rows older than this get a re-fetch — a word
 *  Wiktionary lacked last month may exist now. Real defs never expire. */
const TOMBSTONE_STALE_DAYS = 30

/** Permissive but bounded normalization for the free-form lookup box.
 *  Lowercase, trim, collapse internal whitespace. Returns null if the
 *  result is empty, too long, or not a plausible dictionary headword. */
function normalizeWord(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const w = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (w.length === 0 || w.length > 50) return null
  // letters, plus the hyphen/apostrophe/space that real headwords use
  if (!/^[a-z][a-z '-]*$/.test(w)) return null
  return w
}

type WiktSense = { definition?: string }
type WiktEntry = { partOfSpeech?: string; senses?: WiktSense[] }
type WiktResponse = { word?: string; entries?: WiktEntry[] }

/** Flatten the Wiktionary entry into one compact popover string, or
 *  null if there's nothing. One line per part-of-speech, up to two
 *  senses each, capped so the popover stays small. */
function formatWiktionary(data: WiktResponse): string | null {
  const lines: string[] = []
  for (const entry of data.entries ?? []) {
    const senses = (entry.senses ?? [])
      .map((s) => s.definition?.trim())
      .filter((d): d is string => !!d)
      .slice(0, 2)
    if (senses.length === 0) continue
    const pos = entry.partOfSpeech ? `${entry.partOfSpeech}: ` : ''
    lines.push(pos + senses.join('; '))
    if (lines.length >= 3) break
  }
  return lines.length > 0 ? lines.join('\n') : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'authorization required' }, 401)

    const body = await req.json().catch(() => ({}))
    const word = normalizeWord(body.word)
    if (!word) return json({ error: 'a word (string) is required' }, 400)

    // Caller-scoped client: validates the JWT and does the read under
    // the authenticated SELECT grant.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: auth } = await userClient.auth.getUser()
    if (!auth?.user) return json({ error: 'invalid or expired session' }, 401)

    // Step 1: cache read.
    const { data: row } = await userClient
      .schema('common')
      .from('definitions')
      .select('def, source, fetched_at')
      .eq('word', word)
      .maybeSingle()

    if (row) {
      if (row.def !== null) {
        return json({ word, def: row.def, source: row.source, cached: true })
      }
      // NULL tombstone — honor it unless stale.
      const ageMs = Date.now() - new Date(row.fetched_at).getTime()
      if (ageMs < TOMBSTONE_STALE_DAYS * 86_400_000) {
        return json({ word, def: null, source: row.source, cached: true })
      }
      // else: stale tombstone, fall through to re-fetch.
    }

    // Step 2: Wiktionary fetch (the cache miss path).
    let def: string | null = null
    try {
      const res = await fetch(
        `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`,
        { signal: AbortSignal.timeout(8000) },
      )
      // 200 with empty entries = a real "not found" (the API returns
      // 200 even for non-words). Any non-200 is a transient failure:
      // surface it WITHOUT caching a tombstone.
      if (!res.ok) {
        return json(
          { error: `dictionary source returned ${res.status}`, word },
          502,
        )
      }
      def = formatWiktionary((await res.json()) as WiktResponse)
    } catch (e) {
      return json(
        { error: `dictionary lookup failed: ${String(e)}`, word },
        502,
      )
    }

    // Step 3: cache the definitive answer (def or tombstone) via the
    // service_role-only write path. Fire it but don't fail the
    // response if the cache write hiccups — the user still gets a def.
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { error: cacheErr } = await serviceClient
      .schema('common')
      .rpc('cache_definition', {
        p_word: word,
        p_def: def,
        p_source: 'wiktionary',
      })
    if (cacheErr) console.error('cache_definition failed', cacheErr.message)

    return json({ word, def, source: 'wiktionary', cached: false })
  } catch (e) {
    console.error('define failed', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
