/**
 * crosswords-import-nyt — Edge Function that fetches an NYT daily crossword by
 * date, imports it into `crosswords.puzzles`, and creates the game in one
 * round-trip (the boggle-build-board shape).
 *
 * Why edge (not the library create_game RPC): the NYT fetch needs cookies +
 * a browser User-Agent + CORS the browser can't send. The pure NYT→puzzle
 * conversion is ported into `src/crosswords/lib/nyt.ts` (unit-tested); only
 * the fetch lives here.
 *
 * The fetched puzzle is NOT stored in crosswords.puzzles — that table is the
 * curated, CLI-imported library only. An NYT import creates a SELF-CONTAINED
 * game (puzzle_id null) by passing the data straight into create_game's inline
 * `board` arg (like boggle). No service role, no library write.
 *
 * Flow:
 *   1. Verify inputs + the caller's Authorization header.
 *   2. Fetch NYT (list-by-date → first "Normal" puzzle → v6 JSON), using the
 *      shared cookie jar (NYT_COOKIE_JAR secret), then convert → {meta,solution}.
 *   3. crosswords.create_game(..., board={meta,solution}) over PostgREST AS
 *      THE CALLER (the RPC is the authority on club membership + validation).
 *   4. Return { id }.
 *
 * Calling shape (FE, via invokeStartGameEdgeFn):
 *   POST { target_club, mode, player_user_ids, setup: { timer, date } }
 *   → { id }  ·  → { error } (400/401/422/500/502)
 *
 * Secrets: NYT_COOKIE_JAR (Joel's subscription cookie — raw JSON `{name:value}`
 * OR base64-of-JSON; refreshed with crossplay's dump-nyt-cookies tool).
 * SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected.
 *
 * NOT ported (deferred): the overlay-PNG analysis (circles-on-shaded + bars on
 * a minority of themed puzzles). Normal daily puzzles convert fully.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { json, preflight } from '../_shared/http.ts'
import { callerClient } from '../_shared/startGame.ts'
import { convertNytPuzzle, type NytPuzzleResponse } from '../../../src/crosswords/lib/nyt.ts'

// ── NYT fetch (Deno-native; the pure conversion lives in the shared lib) ──
class NytAuthError extends Error {}
class NytFetchError extends Error {}
class NytNoPuzzleError extends Error {}

const NYT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0 Safari/537.36'

/** The cookie jar secret is raw JSON `{name:value}` or base64-of-that. */
function cookieHeaderFromEnv(): string {
  const raw = (Deno.env.get('NYT_COOKIE_JAR') ?? '').trim()
  if (!raw) throw new NytAuthError('NYT_COOKIE_JAR secret is not set.')
  let jsonStr = raw
  if (!raw.startsWith('{')) {
    try {
      jsonStr = atob(raw)
    } catch {
      throw new NytFetchError('NYT_COOKIE_JAR is neither JSON nor base64.')
    }
  }
  let jar: Record<string, unknown>
  try {
    jar = JSON.parse(jsonStr)
  } catch {
    throw new NytFetchError('NYT_COOKIE_JAR is not valid JSON.')
  }
  const pairs = Object.entries(jar).filter(([, v]) => typeof v === 'string')
  if (pairs.length === 0) throw new NytFetchError('NYT_COOKIE_JAR has no cookies.')
  return pairs.map(([k, v]) => `${k}=${v}`).join('; ')
}

async function nytGetJson(url: string, cookie: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Cookie: cookie,
        'User-Agent': NYT_UA,
        Referer: 'https://www.nytimes.com/crosswords',
        Accept: 'application/json',
      },
    })
  } catch (e) {
    throw new NytFetchError(`NYT fetch failed: ${(e as Error).message}`)
  }
  if (res.status === 401 || res.status === 403) {
    throw new NytAuthError('NYT rejected the cookie (401/403) — it may be expired.')
  }
  if (!res.ok) throw new NytFetchError(`NYT returned HTTP ${res.status}.`)
  const body = (await res.text()).trim()
  // A valid UA + cookie returns JSON; a bot challenge returns HTML.
  if (!body.startsWith('{') && !body.startsWith('[')) {
    throw new NytAuthError('NYT returned a bot challenge (bad cookie / User-Agent).')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new NytFetchError('NYT response was not valid JSON.')
  }
}

async function fetchNytPuzzleForDate(cookie: string, date: string): Promise<NytPuzzleResponse> {
  const listUrl =
    'https://www.nytimes.com/svc/crosswords/v3/puzzles.json' +
    `?publish_type=daily&sort_order=asc&sort_by=print_date&date_start=${date}&date_end=${date}`
  const list = (await nytGetJson(listUrl, cookie)) as {
    results?: { puzzle_id: number; format_type: string }[]
  }
  const entry = (list.results ?? []).find((r) => r.format_type === 'Normal')
  if (!entry) throw new NytNoPuzzleError(`No NYT crossword published for ${date}.`)
  return (await nytGetJson(
    `https://www.nytimes.com/svc/crosswords/v6/puzzle/${entry.puzzle_id}.json`,
    cookie,
  )) as NytPuzzleResponse
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing Authorization header' }, 401)

  let body: {
    target_club?: string
    mode?: string
    player_user_ids?: string[]
    setup?: { timer?: unknown; date?: string }
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { target_club, mode, player_user_ids, setup } = body
  const date = setup?.date
  if (!target_club || !mode || !Array.isArray(player_user_ids)) {
    return json({ error: 'target_club, mode, player_user_ids are required' }, 400)
  }
  if (!date || !DATE_RE.test(date)) {
    return json({ error: 'setup.date must be YYYY-MM-DD' }, 400)
  }

  // 1–2. Fetch + convert. The puzzle data is NOT stored in crosswords.puzzles
  // (that table is the curated CLI library only) — it's passed straight into
  // create_game's inline `board` arg, which builds a self-contained game.
  let board: { meta: unknown; solution: unknown }
  try {
    const cookie = cookieHeaderFromEnv()
    const resp = await fetchNytPuzzleForDate(cookie, date)
    const { meta, solution } = convertNytPuzzle(resp)
    board = { meta, solution }
  } catch (e) {
    if (e instanceof NytAuthError) return json({ error: e.message }, 401)
    if (e instanceof NytNoPuzzleError) return json({ error: e.message }, 422)
    if (e instanceof NytFetchError) return json({ error: e.message }, 502)
    return json({ error: `NYT import failed: ${(e as Error).message}` }, 400)
  }

  // 3. create_game AS THE CALLER (authority on membership + setup), with the
  // puzzle data inline.
  const caller = callerClient(authHeader)
  const { data, error } = await caller.schema('crosswords').rpc('create_game', {
    target_club,
    setup: { timer: setup?.timer ?? { kind: 'none' } },
    player_user_ids,
    mode,
    board,
  })
  if (error) return json({ error: error.message }, 400)
  const rows = (data as Array<{ id: string }> | null) ?? []
  if (rows.length === 0) return json({ error: 'create_game returned no row' }, 500)
  return json({ id: rows[0].id })
})
