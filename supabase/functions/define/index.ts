/**
 * define — Edge Function behind the click-to-define popover and the
 * "look up any word" shortcut. Read-through cache over the shared
 * `common.words` master list (the `definition` / `definition_source`
 * columns):
 *
 *   1. Verify the caller's JWT (any signed-in user; definitions are
 *      not game-specific, so no membership check).
 *   2. Look the word up in common.words (as the caller; authenticated
 *      gets SELECT).
 *        - NO ROW → the word isn't a playable word at all → return
 *          { unknown: true }. We never look up or store definitions
 *          for words outside the list (the list is the universe).
 *        - definition present → return it (the seeded custom-format
 *          gloss or a previously-cached Wiktionary entry). No network.
 *        - definition NULL, source 'w' → negative-cache tombstone
 *          ("looked up, Wiktionary had nothing") → return not-found.
 *        - definition NULL, source NULL → never looked up → fall
 *          through to the API.
 *   3. Fetch Wiktionary (freedictionaryapi.com, CC BY-SA). Format a
 *      compact def string, or null if it has no entry.
 *   4. Cache the result back via common.cache_definition (as
 *      service_role — the only write path; an UPDATE of the existing
 *      row). A null result writes a tombstone so repeats don't re-hit
 *      the API. A *transient* API failure does NOT tombstone — only a
 *      definitive empty answer does.
 *
 * Response: { word, def: string | null, source: 's'|'e'|'w'|'m'|null,
 * cached: boolean, unknown?: boolean, meta? }. `source` is the one-char
 * provenance code: seeded glosses ('s'/'e'/'m') are the custom
 * symbology (parseDefinition handles it); 'w' is plain Wiktionary
 * prose (rendered verbatim + CC BY-SA attribution). `def === null`
 * means "looked up, no definition"; `unknown` means "not a word in
 * the list." `meta` (present for any IN-LIST word) carries the word's
 * categorization — { difficulty, american, british, canadian,
 * australian, slur, crude, slang, wordle } — for the small tag line the FE
 * shows under the definition.
 *
 * Secrets (all auto-injected by the Edge Runtime):
 *   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { json, preflight } from '../_shared/http.ts'

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
  const pre = preflight(req)
  if (pre) return pre

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

    // Step 1: cache read against the master word list. Also pull the
    // categorization columns so the FE can show the word's band / dialects /
    // flags / wordle-membership below the definition (`meta`).
    const { data: row } = await userClient
      .schema('common')
      .from('words')
      .select(
        'definition, definition_source, difficulty, american, british, canadian, australian, slur, crude, slang, wordle',
      )
      .eq('word', word)
      .maybeSingle()

    // No row → not a playable word. We never look these up or store
    // them (the list is the universe of definable words).
    if (!row) {
      return json({ word, def: null, source: null, unknown: true, cached: true })
    }

    // The word's categorization (every in-list response carries it).
    const meta = {
      difficulty: row.difficulty,
      american: row.american,
      british: row.british,
      canadian: row.canadian,
      australian: row.australian,
      slur: row.slur,
      crude: row.crude,
      slang: row.slang,
      wordle: row.wordle,
    }

    if (row.definition !== null) {
      // Seeded gloss or a previously-cached Wiktionary entry.
      return json({
        word,
        def: row.definition,
        source: row.definition_source,
        cached: true,
        meta,
      })
    }
    if (row.definition_source === 'w') {
      // Negative-cache tombstone — looked up, Wiktionary had nothing.
      // Permanent (no staleness): "don't refetch."
      return json({ word, def: null, source: 'w', cached: true, meta })
    }
    // else: definition_source is NULL — never looked up; fall through.

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
        p_source: 'w',
      })
    if (cacheErr) console.error('cache_definition failed', cacheErr.message)

    return json({ word, def, source: 'w', cached: false, meta })
  } catch (e) {
    console.error('define failed', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
