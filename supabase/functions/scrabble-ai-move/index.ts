// cs-unmet

/**
 * scrabble-ai-move — the bots' move driver (compete; docs/games/scrabble.md →
 * The AI opponent).
 *
 * Client-invoked: while a bot holds the turn, every client at the table POSTs
 * here (`useDriveAiTurns`), and this function plays the bots forward until a
 * person's turn or the end. Any game member may drive it (trust model); the
 * RPCs it calls check the turn and the version, so a duplicate poke loses the
 * race and stops.
 *
 * Loop: `get_ai_context` (the context of the bot holding the turn, or `{result:
 * 'done'}`) → `choosePlay` (the policy the tuning harness uses, at the bot's
 * `ai_level`) → `ai_play_word` / `ai_exchange_tiles` / `ai_pass_turn`, walking
 * a chain of bots in one invocation.
 *
 * Why edge (not PL/pgSQL): move generation is a trie search, far cleaner in TS,
 * and it reuses the exact engine the game plays with (src/scrabble/lib) so a
 * bot's score can't disagree with what play_word awards. Dictionary bundled
 * (the suggester's asset — see ../scrabble-suggest-move/dict.ts).
 *
 * Calling shape (FE):  POST { game_id }  →  an envelope: `{ result: 'moved',
 * turns }`, or a not-ok relayed as it came.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { json, preflight } from '../_shared/http.ts'
import { crash, fault, ok } from '../_shared/envelope.ts'
import { runRpc } from '../_shared/dbResult.ts'
import type { Envelope } from '../../../src/common/supabase/envelope.ts'
import { callerClient } from '../_shared/startGame.ts'
import type { GAiLevel, GBands } from '../../../src/scrabble/types.ts'
import { decodeBoard } from '../../../src/scrabble/lib/board.ts'
import { choosePlay, LEVELS } from '../../../src/scrabble/lib/policy.ts'
import { mulberry32 } from '../../../src/common/utils/mulberry32.ts'
import { ratedTrie } from '../scrabble-suggest-move/dict.ts'

/**
 * What `get_ai_context` answers. TWO `ok`s, and `done` is the common one:
 * every client pokes this function on every version bump, so most calls find
 * no AI seat waiting.
 */
type AiContext =
  | { result: 'done' }
  | {
      result: 'context'
      user_id: string
      // The board as the page gets it: one string, decoded by lib/board.ts.
      board: { letters: string }
      rack: string[]
      dict_2: number
      dict_3plus: number
      ai_level: GAiLevel
      version: number
      n_bag_tiles: number
    }

/** What the three `ai_*` move RPCs answer. A board that moved under the bot is
 *  a RACE on the not-ok arm, not a `stale` result. */
type MoveAnswer =
  | { result: 'accepted'; drawn: string[] }
  | { result: 'invalid'; bad_words: string[] }
  | { result: 'exchanged'; drawn: string[] }
  | { result: 'passed' }

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
    // EVERY EXIT FROM THE LOOP LOGS, and that is load-bearing: an exit that
    // left no line reads in the container as a hang rather than an error. The
    // RPC's name is in each line — `runRpc` writes it into the message it
    // faults with (`BUG: ai_pass_turn did not run`).
    for (let i = 0; i < MAX_AI_MOVES; i++) {
      const ctxRes = await runRpc<AiContext>(
        db.rpc('get_ai_context', { p_game_id: gameId }), 'get_ai_context',
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
      const bands: GBands = { dict2: ctx.dict_2, dict3plus: ctx.dict_3plus }
      // Deterministic per board state — one player moves at each version — so
      // it is reproducible, and two concurrent drivers compute the same move,
      // which makes a duplicate harmless.
      const rng = mulberry32(((ctx.version >>> 0) ^ 0x9e3779b9) >>> 0)
      const choice = choosePlay(decodeBoard(ctx.board.letters), ctx.rack, trie, bands, knobs, rng)

      let res: Envelope<MoveAnswer>
      if (choice.kind === 'word') {
        res = await runRpc<MoveAnswer>(db.rpc('ai_play_word', {
          p_game_id: gameId,
          p_user_id: ctx.user_id,
          p_base_version: ctx.version,
          p_placements: choice.placements,
          p_words: choice.words.map((w) => w.word),
          p_score: choice.score,
        }), 'ai_play_word')
        log.push({ userId: ctx.user_id, words: choice.words.map((w) => w.word), score: choice.score })
      } else if (ctx.n_bag_tiles >= 7) {
        // No playable word but the bag can afford a swap — dump the whole rack.
        res = await runRpc<MoveAnswer>(db.rpc('ai_exchange_tiles', {
          p_game_id: gameId, p_user_id: ctx.user_id, p_base_version: ctx.version, p_rack_tiles: choice.tiles,
        }), 'ai_exchange_tiles')
        log.push({ userId: ctx.user_id, exchange: choice.tiles.length })
      } else {
        res = await runRpc<MoveAnswer>(db.rpc('ai_pass_turn', {
          p_game_id: gameId, p_user_id: ctx.user_id, p_base_version: ctx.version,
        }), 'ai_pass_turn')
        log.push({ userId: ctx.user_id, pass: true })
      }

      // ANOTHER DRIVER MOVED FIRST — the board version this move was built on
      // is gone, a RACE: every client pokes this function, so losing is the
      // ordinary outcome and not a failure of anything. Stop, and let whoever
      // won carry the chain on.
      if (res.type === 'not-ok' && res.severity === 'race') {
        console.log(`[ai-move] game ${gameId}: lost the race after ${played} turn(s) —`, res.message)
        break
      }
      // Anything else refused is the bot genuinely stuck: relay it, with a
      // tagged line.
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
    return crash('scrabble-ai-move', e)
  }
})
