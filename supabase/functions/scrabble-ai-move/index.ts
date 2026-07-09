/**
 * scrabble-ai-move — the autonomous AI opponent's move driver (compete;
 * docs/scrabble-ai-strength.md).
 *
 * Client-invoked: whenever a move hands the turn to an AI seat (or on game load
 * if it's already an AI's turn), a connected human's client POSTs here and this
 * function plays the AI seat(s) forward until a human's turn or the game ends.
 * Any game member may drive it (trust model); the RPCs it calls do their own
 * seat + version authorization, so concurrent/duplicate pokes are safe no-ops.
 *
 * Loop: `get_ai_context` (seat-less — returns the CURRENT seat's AI context or
 * `{done}`) → `choosePlay` (the exact policy brain the harness uses, at the
 * seat's ai_level) → `ai_play_word` / `ai_exchange` / `ai_pass`. It walks a
 * chain of consecutive AI seats in one invocation. A `stale` result means
 * another driver moved first — we stop and let that one continue.
 *
 * Why edge (not PL/pgSQL): move generation is a trie search, far cleaner in TS,
 * and it reuses the exact engine the game plays with (src/scrabble/lib) so a
 * bot's score can't disagree with what play_word awards. Dictionary bundled
 * (the suggester's asset — see ../scrabble-suggest-move/dict.ts).
 *
 * Calling shape (FE):  POST { game_id }  →  { ok, moves }  ·  { error } (4xx/5xx)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { json, preflight } from '../_shared/http.ts'
import { callerClient } from '../_shared/startGame.ts'
import type { Cell } from '../../../src/scrabble/lib/board.ts'
import type { Bands } from '../../../src/scrabble/lib/suggest.ts'
import { choosePlay, LEVELS, type LevelName } from '../../../src/scrabble/lib/policy.ts'
import { mulberry32 } from '../../../src/common/lib/util/mulberry32.ts'
import { ratedTrie } from '../scrabble-suggest-move/dict.ts'

type AiContext = {
  done?: boolean
  seat: number
  board: Cell[]
  rack: string[]
  dict_2: number
  dict_3plus: number
  ai_level: LevelName
  version: number
  bag_count: number
}

// A generous per-invocation cap on AI moves (a chain of AI seats, each playing
// until the bag empties, can't realistically exceed this) — a runaway guard.
const MAX_AI_MOVES = 40

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

    const db = callerClient(authHeader).schema('scrabble')
    const trie = await ratedTrie()

    let played = 0
    const log: unknown[] = []
    for (let i = 0; i < MAX_AI_MOVES; i++) {
      const { data, error } = await db.rpc('get_ai_context', { target_game: gameId })
      if (error) return json({ error: error.message }, 403)
      const ctx = data as AiContext
      if (ctx.done) break

      const knobs = LEVELS[ctx.ai_level] ?? LEVELS.best
      const bands: Bands = { dict2: ctx.dict_2, dict3plus: ctx.dict_3plus }
      // Deterministic per board state (version+seat) — reproducible, and two
      // concurrent drivers compute the same move, so a duplicate is harmless.
      const rng = mulberry32((((ctx.version * 31 + ctx.seat) >>> 0) ^ 0x9e3779b9) >>> 0)
      const choice = choosePlay(ctx.board, ctx.rack, trie, bands, knobs, rng)

      let res: { result?: string } | null = null
      if (choice.kind === 'word') {
        const r = await db.rpc('ai_play_word', {
          target_game: gameId,
          p_seat: ctx.seat,
          base_version: ctx.version,
          placements: choice.placements,
          words: choice.words.map((w) => w.word),
          score: choice.score,
        })
        if (r.error) return json({ error: r.error.message }, 500)
        res = r.data as { result?: string }
        log.push({ seat: ctx.seat, words: choice.words.map((w) => w.word), score: choice.score })
      } else if (ctx.bag_count >= 7) {
        // No playable word but the bag can afford a swap — dump the whole rack.
        const r = await db.rpc('ai_exchange', {
          target_game: gameId, p_seat: ctx.seat, base_version: ctx.version, rack_tiles: choice.tiles,
        })
        if (r.error) return json({ error: r.error.message }, 500)
        res = r.data as { result?: string }
        log.push({ seat: ctx.seat, exchange: choice.tiles.length })
      } else {
        const r = await db.rpc('ai_pass', {
          target_game: gameId, p_seat: ctx.seat, base_version: ctx.version,
        })
        if (r.error) return json({ error: r.error.message }, 500)
        res = r.data as { result?: string }
        log.push({ seat: ctx.seat, pass: true })
      }

      // Another driver moved first (or the board changed under us) — stop and
      // let whoever won continue the chain.
      if (res?.result === 'stale') break
      played++
    }

    // KEEP — the AI moves this invocation made, inspectable in the terminal.
    console.log(`[ai-move] game ${gameId}: played ${played} —`, JSON.stringify(log))
    return json({ ok: true, moves: played })
  } catch (e) {
    console.error('scrabble-ai-move threw:', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
