// cs-unmet

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
import { edgeInternal, json, preflight } from '../_shared/http.ts'
import { fault, ok } from '../_shared/envelope.ts'
import { runRpc } from '../_shared/dbResult.ts'
import type { Envelope } from '../../../src/common/lib/supabase/envelope.ts'
import { callerClient } from '../_shared/startGame.ts'
import type { Cell } from '../../../src/scrabble/lib/board.ts'
import type { Bands } from '../../../src/scrabble/lib/suggest.ts'
import { choosePlay, LEVELS, type LevelName } from '../../../src/scrabble/lib/policy.ts'
import { mulberry32 } from '../../../src/common/lib/util/mulberry32.ts'
import { ratedTrie } from '../scrabble-suggest-move/dict.ts'

/**
 * What `get_ai_context` answers. TWO `ok`s, and `done` is the common one:
 * every client pokes this function on every version bump, so most calls find
 * no AI seat waiting. `done: true` is kept beside the new `result` — the field
 * this RPC has always returned.
 */
type AiContext =
  | { result: 'done'; done: true }
  | {
      result: 'context'
      seat: number
      board: Cell[]
      rack: string[]
      dict_2: number
      dict_3plus: number
      ai_level: LevelName
      version: number
      bag_count: number
    }

/** What the three `ai_*` move RPCs answer. A board that moved under the bot is
 *  a RACE on the not-ok arm, not a `stale` result. */
type MoveAnswer =
  | { result: 'accepted'; drawn: string[]; version: number; terminal: boolean }
  | { result: 'invalid'; bad_words: string[] }
  | { result: 'exchanged'; drawn: string[]; version: number; terminal: boolean }
  | { result: 'passed'; version: number; terminal: boolean }

// A generous per-invocation cap on AI moves (a chain of AI seats, each playing
// until the bag empties, can't realistically exceed this) — a runaway guard.
const MAX_AI_MOVES = 40

serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return fault('PN333', 'BUG: an ai-move request that was not a POST', `scrabble-ai-move: ${req.method}, not POST`)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const gameId: unknown = body.game_id
    if (!gameId || typeof gameId !== 'string') {
      return fault('PN334', 'BUG: an ai-move request with no game', `scrabble-ai-move: game_id=${JSON.stringify(gameId)}`)
    }
    // No header check of our own: `callerClient` sends whatever arrived, and
    // `get_ai_context`'s own membership gate refuses it in its words.

    const authHeader = req.headers.get('Authorization') ?? ''
    const db = callerClient(authHeader).schema('scrabble')
    const trie = await ratedTrie()

    let played = 0
    const log: unknown[] = []
    // EVERY EXIT FROM THE LOOP LOGS, and that is load-bearing. The success log
    // used to be the only one, sitting after the loop — so a failing RPC
    // returned 500 from inside it and the invocation left NO trace: the
    // container showed "serving the request" and nothing after, which reads as
    // a hang rather than an error. That is how a wrong RPC name (`ai_pass` for
    // `ai_pass_turn`) survived ~30 moves of this game unnoticed; it only fired
    // on the branch the AI had not needed yet.
    //
    // WHICH RPC is what makes that line worth reading, and it comes free now:
    // `runRpc` takes the name and writes it into the message it faults with
    // (`BUG: ai_pass_turn did not run`), so the name is in the sentence rather
    // than buried in a detail.
    for (let i = 0; i < MAX_AI_MOVES; i++) {
      const ctxRes = await runRpc<AiContext>(
        db.rpc('get_ai_context', { target_game: gameId }), 'get_ai_context',
      )
      // Its own refusals relay untouched; `runRpc` folds "it never ran" and "it
      // answered something unreadable" into the same branch.
      if (ctxRes.type === 'not-ok') {
        console.error(`[ai-move] game ${gameId}: get_ai_context refused —`, ctxRes.message)
        return json(ctxRes)
      }
      // `done` is the COMMON answer, not an edge case: every client pokes this
      // on every version bump and only one poke finds an AI seat waiting.
      if (ctxRes.data.result === 'done') break
      const ctx = ctxRes.data

      const knobs = LEVELS[ctx.ai_level] ?? LEVELS.best
      const bands: Bands = { dict2: ctx.dict_2, dict3plus: ctx.dict_3plus }
      // Deterministic per board state (version+seat) — reproducible, and two
      // concurrent drivers compute the same move, so a duplicate is harmless.
      const rng = mulberry32((((ctx.version * 31 + ctx.seat) >>> 0) ^ 0x9e3779b9) >>> 0)
      const choice = choosePlay(ctx.board, ctx.rack, trie, bands, knobs, rng)

      let res: Envelope<MoveAnswer>
      if (choice.kind === 'word') {
        res = await runRpc<MoveAnswer>(db.rpc('ai_play_word', {
          target_game: gameId,
          p_seat: ctx.seat,
          base_version: ctx.version,
          placements: choice.placements,
          words: choice.words.map((w) => w.word),
          score: choice.score,
        }), 'ai_play_word')
        log.push({ seat: ctx.seat, words: choice.words.map((w) => w.word), score: choice.score })
      } else if (ctx.bag_count >= 7) {
        // No playable word but the bag can afford a swap — dump the whole rack.
        res = await runRpc<MoveAnswer>(db.rpc('ai_exchange_tiles', {
          target_game: gameId, p_seat: ctx.seat, base_version: ctx.version, rack_tiles: choice.tiles,
        }), 'ai_exchange_tiles')
        log.push({ seat: ctx.seat, exchange: choice.tiles.length })
      } else {
        res = await runRpc<MoveAnswer>(db.rpc('ai_pass_turn', {
          target_game: gameId, p_seat: ctx.seat, base_version: ctx.version,
        }), 'ai_pass_turn')
        log.push({ seat: ctx.seat, pass: true })
      }

      // ANOTHER DRIVER MOVED FIRST — the board version this move was built on
      // is gone. That used to be an `ok` named `stale`; it is a RACE now, which
      // is what it always was: every client pokes this function, so losing is
      // the ordinary outcome and not a failure of anything. Stop, and let
      // whoever won carry the chain on.
      if (res.type === 'not-ok' && res.severity === 'race') {
        console.log(`[ai-move] game ${gameId}: lost the race after ${played} turn(s) —`, res.message)
        break
      }
      // Anything else refused is the bot genuinely stuck: relay it, with the
      // same tagged line `fail` used to write.
      if (res.type === 'not-ok') {
        console.error(`[ai-move] game ${gameId}: FAILED after ${played} turn(s) —`, res.message)
        return json(res)
      }
      played++
    }

    // KEEP — the AI turns this invocation took, inspectable in the terminal.
    console.log(`[ai-move] game ${gameId}: played ${played} —`, JSON.stringify(log))
    // TURNS, not moves: one loop pass is one seat's turn, however many words it
    // crossed. Consecutive AI seats all move in one invocation, so this is 0..40
    // — and 0 is the COMMON case, since every client pokes and only one wins.
    return ok({ result: 'moved', turns: played })
  } catch (e) {
    console.error('scrabble-ai-move threw:', e)
    return edgeInternal(e)
  }
})
