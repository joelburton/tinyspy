/**
 * crosswords-import-guardian — Edge Function that fetches TODAY's Guardian
 * crossword (latest in a chosen series) and creates a self-contained game
 * from it in one round-trip (the crosswords-import-nyt / boggle-build-board
 * shape). It does NOT write `crosswords.puzzles` — the fetched puzzle rides
 * inline on the game via create_game's `board` arg.
 *
 * Why edge (not a plain client fetch): the browser can't cross-origin GET
 * theguardian.com, and the puzzle JSON lives inside an HTML page (a
 * `<gu-island name="CrosswordComponent" props="…escaped JSON…">` tag). This
 * function scrapes + un-escapes it; the pure JSON→puzzle conversion lives in
 * the unit-tested `src/crosswords/lib/guardian.ts`. **No auth** — Guardian
 * crosswords are public (unlike the NYT path's subscription cookie), so there
 * is no secret to configure.
 *
 * Flow:
 *   1. Verify inputs + the caller's Authorization header.
 *   2. Fetch the series landing page → first puzzle link → solver page →
 *      extract the gu-island props JSON → convert → {meta, solution}.
 *   3. crosswords.create_game(..., board={meta,solution}) over PostgREST AS
 *      THE CALLER (the RPC is the authority on club membership + validation).
 *   4. Return { id }.
 *
 * Calling shape (FE, via invokeStartGameEdgeFn):
 *   POST { target_club, mode, player_user_ids, setup: { timer, series } }
 *   → { id }  ·  → { error } (400/401/422/502)
 *
 * `series` is one of the slugs below (Quick / Cryptic / …). A Prize or Weekend
 * puzzle fetched before its reveal date has no published answers; the
 * converter throws (→ 422) rather than seed an unsolvable board.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { json, preflight } from '../_shared/http.ts'
import { callerClient } from '../_shared/startGame.ts'
import { convertGuardianPuzzle, GuardianConvertError, type GuardianData } from '../../../src/crosswords/lib/guardian.ts'

class GuardianFetchError extends Error {}

const GUARDIAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0 Safari/537.36'

// The series a game can be created from — slug → landing-page series segment.
// Prize/Weekend are allowed but may 422 (answers withheld until reveal).
const SERIES = new Set([
  'quick',
  'cryptic',
  'quick-cryptic',
  'everyman',
  'speedy',
  'quiptic',
  'prize',
  'weekend-crossword',
])

async function fetchText(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': GUARDIAN_UA, Accept: 'text/html' } })
  } catch (e) {
    throw new GuardianFetchError(`Guardian fetch failed: ${(e as Error).message}`)
  }
  if (!res.ok) throw new GuardianFetchError(`Guardian returned HTTP ${res.status}.`)
  return res.text()
}

/** Decode the HTML-attribute entities the Guardian escapes the props JSON with
 *  (named + numeric). Enough to turn the escaped attribute back into JSON. */
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&') // last: so a literal "&amp;amp;" doesn't over-decode
}

/** Pull the CrosswordComponent island's `data` object out of a solver page. */
function extractGuardianData(html: string): GuardianData {
  // The opening <gu-island …> tag has no literal '>' inside (attribute values
  // are entity-escaped), so match up to the first '>'.
  const tag = html.match(/<gu-island\b[^>]*name="CrosswordComponent"[^>]*>/)?.[0]
  if (!tag) throw new GuardianFetchError('Could not find the crossword on the page.')
  const propsEsc = tag.match(/props="([^"]*)"/)?.[1]
  if (!propsEsc) throw new GuardianFetchError('Could not read the crossword data.')
  let parsed: { data?: GuardianData }
  try {
    parsed = JSON.parse(decodeEntities(propsEsc))
  } catch {
    throw new GuardianFetchError('Guardian crossword data was not valid JSON.')
  }
  if (!parsed.data) throw new GuardianFetchError('Guardian crossword data was empty.')
  return parsed.data
}

async function fetchLatestGuardian(series: string): Promise<GuardianData> {
  const landing = `https://www.theguardian.com/crosswords/series/${series}`
  const listHtml = await fetchText(landing)
  // The first /crosswords/<type>/<id> link on a series index is its latest.
  const link = listHtml.match(/\/crosswords\/[a-z-]+\/\d+/)?.[0]
  if (!link) throw new GuardianFetchError(`No ${series} crossword found.`)
  const solverHtml = await fetchText(`https://www.theguardian.com${link}`)
  return extractGuardianData(solverHtml)
}

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing Authorization header' }, 401)

  let body: {
    target_club?: string
    mode?: string
    player_user_ids?: string[]
    setup?: { timer?: unknown; series?: string }
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { target_club, mode, player_user_ids, setup } = body
  const series = setup?.series
  if (!target_club || !mode || !Array.isArray(player_user_ids)) {
    return json({ error: 'target_club, mode, player_user_ids are required' }, 400)
  }
  if (!series || !SERIES.has(series)) {
    return json({ error: `setup.series must be one of: ${[...SERIES].join(', ')}` }, 400)
  }

  // 1–2. Fetch + convert. NOT stored in crosswords.puzzles (that's the curated
  // CLI library) — passed straight into create_game's inline `board` arg.
  let board: { meta: unknown; solution: unknown }
  try {
    const data = await fetchLatestGuardian(series)
    board = convertGuardianPuzzle(data)
  } catch (e) {
    if (e instanceof GuardianConvertError) return json({ error: e.message }, 422)
    if (e instanceof GuardianFetchError) return json({ error: e.message }, 502)
    return json({ error: `Guardian import failed: ${(e as Error).message}` }, 400)
  }

  // 3. create_game AS THE CALLER (authority on membership + setup), inline board.
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
