/**
 * scrabble-suggest-move — Edge Function behind the coop "suggest a move"
 * button (docs/scrabble-ai.md).
 *
 * Why edge (not PL/pgSQL): move generation is a trie-guided search — far
 * cleaner in TypeScript, and it reuses the exact engine the FE plays with
 * (`src/scrabble/lib/`): `generateMoves` for enumeration, `evaluatePlay`
 * (inside `rankMoves`) for scoring, so a hint's score can't disagree with
 * what the game awards. The dictionary ships bundled (see dict.ts).
 *
 * Flow:
 *   1. Verify inputs + the caller's Authorization header.
 *   2. `scrabble.get_suggest_context` as the caller — the SECURITY DEFINER
 *      RPC is the authority (game player, playing, coop) AND the only door
 *      to the grant-hidden dictionary bands. Its atomic snapshot returns
 *      board + rack + bands + version together. A rejection forwards as 403.
 *   3. Await the cached rated trie, then generate + rank SYNCHRONOUSLY —
 *      the boggle lesson: awaits before and after the compute, never inside.
 *   4. Return { moves: RankedMove[] (top 5), version }. Placements ride
 *      along so the FE can stage/preview them; `words` + `score` feed the
 *      text display; `version` lets the FE detect a suggestion that went
 *      stale while in flight (coop has no turns — a teammate may have
 *      played).
 *
 * Calling shape (FE):
 *   POST /functions/v1/scrabble-suggest-move
 *   { game_id }  →  { moves, version }   ·   → { error } (400/401/403/500)
 *
 * Secrets / env: SUPABASE_URL + SUPABASE_ANON_KEY (auto-injected). No
 * service role — the RPC does its own authorization as the caller.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { json, preflight } from '../_shared/http.ts'
import { callerClient } from '../_shared/startGame.ts'
import { walkWord } from '../../../src/common/lib/game/trie.ts'
import type { Cell } from '../../../src/scrabble/lib/board.ts'
import { generateMoves, type Bands } from '../../../src/scrabble/lib/suggest.ts'
import { rankMoves } from '../../../src/scrabble/lib/rank.ts'
import { ratedTrie } from './dict.ts'

type SuggestContext = {
  board: Cell[]
  rack: string[]
  dict_2: number
  dict_3plus: number
  version: number
}

serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const gameId: unknown = body.game_id
    if (!gameId || typeof gameId !== 'string') {
      return json({ error: 'game_id (uuid string) required' }, 400)
    }
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'authorization required' }, 401)

    // ─── The context snapshot, as the caller ───────────────────────────────
    // `.schema('scrabble')` is required — supabase-js defaults to `public`.
    const supabase = callerClient(authHeader)
    const { data, error } = await supabase
      .schema('scrabble')
      .rpc('get_suggest_context', { target_game: gameId })
    if (error) return json({ error: error.message }, 403)
    const ctx = data as SuggestContext

    // ─── Generate + rank (cached trie; the compute itself is synchronous) ──
    const trie = await ratedTrie()
    const bands: Bands = { dict2: ctx.dict_2, dict3plus: ctx.dict_3plus }
    const moves = generateMoves(ctx.board, ctx.rack, trie, bands)
    // Trie lookup for the vocabCap lever; a word missing from the trie (can't
    // happen for generated moves) reads as harder than any cap.
    const wordDifficulty = (word: string) => {
      const node = walkWord(trie, word.toLowerCase())
      return node > 0 ? trie.eow[node] : 7
    }
    // Max strength (all levers at their defaults) — the strength slider is a
    // designed-but-deferred extension (docs/scrabble-ai.md).
    const ranked = rankMoves(ctx.board, moves, ctx.rack, wordDifficulty)

    // KEEP — the full ranked output, inspectable in the functions terminal.
    console.log(
      `[suggest-move] game ${gameId} v${ctx.version}: ` +
        `${moves.length} legal moves, top ${ranked.length}:`,
      JSON.stringify(
        ranked.map((m) => ({
          words: m.words.map((w) => w.word),
          score: m.score,
          leave: m.leave,
          equity: m.equity,
        })),
      ),
    )

    return json({ moves: ranked, version: ctx.version })
  } catch (e) {
    console.error('scrabble-suggest-move threw:', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
