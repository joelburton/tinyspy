// cs-unmet

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
 *   → { id }  ·  → { error: fe-error-key, code?: SQLSTATE } (400/401/422/502)
 *
 * Errors are fe-error-keys (docs/supabase.md → Server errors; guarded by
 * src/guards/edgeFnErrorKeys.test.ts). Player-reachable, with ERROR_COPY:
 * guardian-fetch| (the Guardian down or answering garbage). The rest —
 * bad-request, guardian-convert|, create_game's no-row — are copyless
 * faults; a create_game raise relays verbatim with its SQLSTATE.
 *
 * `series` is one of the slugs below (Quick / Cryptic / …). A Prize or Weekend
 * puzzle fetched before its reveal date has no published answers; the
 * converter throws (→ 422) rather than seed an unsolvable board.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { json, preflight } from '../_shared/http.ts'
import { crash, fault, serviceError } from '../_shared/envelope.ts'
import { callerClient } from '../_shared/startGame.ts'
import type { Json } from '../../../src/types/db.ts'
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
  // The first /crosswords/<series>/<id> link on the index is its latest. Anchor
  // to the REQUESTED series slug (the URL's type segment IS the series) — a bare
  // /crosswords/<any>/<id> match could grab a crossword-blog, nav, or other-
  // series link that appears earlier on the page, fetching the wrong puzzle.
  const esc = series.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const link = listHtml.match(new RegExp(`/crosswords/${esc}/\\d+`))?.[0]
  if (!link) throw new GuardianFetchError(`No ${series} crossword found.`)
  const solverHtml = await fetchText(`https://www.theguardian.com${link}`)
  return extractGuardianData(solverHtml)
}

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fault('PN235', 'You are not signed in.', 'crosswords-import-guardian: no Authorization header')

  let body: {
    target_club?: string
    mode?: string
    player_user_ids?: string[]
    setup?: { timer?: Json; series?: string }
  }
  // All three gates are FAULTS on the form as a whole: the picker offers a
  // closed list of series and the dialog composes the rest, so anything wrong
  // here means the frontend is broken rather than a choice to correct.
  try {
    body = await req.json()
  } catch {
    return fault('PN236', 'BUG: request body that could not be read',
      'crosswords-import-guardian: unparseable body')
  }
  const { target_club, mode, player_user_ids, setup } = body
  const series = setup?.series
  if (!target_club || !mode || !Array.isArray(player_user_ids)) {
    return fault('PN237', 'BUG: game with no club or players',
      'crosswords-import-guardian: target_club / mode / player_user_ids')
  }
  if (!series || !SERIES.has(series)) {
    return fault('PN238', `BUG: Guardian series of '${String(series)}'`,
      'crosswords-import-guardian: series is not in the allowlist')
  }

  // 1–2. Fetch + convert. NOT stored in crosswords.puzzles (that's the curated
  // CLI library) — passed straight into create_game's inline `board` arg.
// `Json`, not `unknown`: both values arrive as parsed JSON (the request body /
// the fetched puzzle) and are handed straight to a jsonb RPC parameter, so
// `Json` is the honest type rather than a cast to quiet the checker. They were
// `unknown` only because the shared client used to be untyped and nothing
// forced the question — the same gap that let `scrabble-ai-move` call two RPCs
// by names that don't exist (see _shared/startGame.ts).
  let board: { meta: Json; solution: Json }
  try {
    const data = await fetchLatestGuardian(series)
    board = convertGuardianPuzzle(data)
  } catch (e) {
    // The specific cause stays in the serve log. Unreachable is nobody's fault
    // in either direction and reads as "try later" — Joel's words, approved
    // 2026-08-12. A puzzle we fetched but could not convert is OURS: the
    // Guardian answered and our converter did not cope.
    console.log(`crosswords-import-guardian failed: ${(e as Error).message}`)
    if (e instanceof GuardianConvertError) {
      return fault('PN239', 'BUG: Guardian puzzle our converter could not read',
        'crosswords-import-guardian: GuardianConvertError')
    }
    if (e instanceof GuardianFetchError) {
      return serviceError('PN240', "The Guardian couldn't be reached — try again later",
        'crosswords-import-guardian: GuardianFetchError')
    }
    return crash('crosswords-import-guardian', e)
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
  // Relayed untouched, so a raise written in SQL reaches the player with its own
  // words and its own field. `error` then means only that the RPC never ran.
  if (error) {
    return fault('PN241', 'BUG: create_game did not run',
      `crosswords-import-guardian: create_game did not run: ${error.message} (${error.code})`)
  }
  if (!data || typeof data !== 'object' || !('type' in data)) {
    return fault('PN242', 'BUG: create_game returned no envelope',
      `crosswords-import-guardian: create_game returned ${JSON.stringify(data)}`)
  }
  return json(data)
})
