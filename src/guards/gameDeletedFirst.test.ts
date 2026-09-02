// cs-unmet

/**
 * Guard: **a game RPC asks whether the game still EXISTS before it asks whether
 * you belong to it.**
 *
 * `common.delete_game` is granted to any club member for any game in the club,
 * and it takes three things at once: the `<schema>.games` row, `common.games`,
 * and every `common.game_players` row (both of the others cascade from it). So
 * a player whose game was just deleted has no membership left either — and an
 * RPC that gates on membership first answers `require_game_player`'s "You are
 * not in this game", which is true of the rows and false of the player. They
 * WERE in it. It is gone, and that is the only useful thing to say.
 *
 * All sixteen `replay_board`s had it the wrong way round until 2026-09-01, so
 * the correct sentence — `common._raise_game_deleted`, PN485 — was unreachable
 * in every one of them.
 *
 * Asserted here rather than in pgTAP because the failure is an ORDER, not a
 * behavior: a test would need a deleted game per gametype to see it, sixteen
 * near-identical fixtures for one line of reading. `waffle/replay_test.sql`
 * proves the behavior once; this proves the other fifteen agree.
 *
 * The rule attaches to the CALL, not to the RPC name: any function that reaches
 * for `_raise_game_deleted` has decided a missing game is worth its own
 * sentence, and putting the membership gate above it throws that away.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL_DIR = 'supabase/sql'

/** Every function in `supabase/sql/`, by qualified name. */
function functions(): { name: string; file: string; body: string }[] {
  const out: { name: string; file: string; body: string }[] = []
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const body of sql.split('create or replace function ').slice(1)) {
      out.push({ name: body.slice(0, body.indexOf('(')).trim(), file, body })
    }
  }
  return out
}

describe('a deleted game says so', () => {
  const callers = functions().filter(
    // The helper's own definition raises it; every OTHER mention is a call.
    (f) => f.body.includes('_raise_game_deleted(') && f.name !== 'common._raise_game_deleted',
  )

  it('finds the callers at all', () => {
    // A guard that finds nothing passes just as quietly as one that works.
    // Three RPCs × sixteen games: every player-callable path that reaches for a
    // game's own row and can find it gone.
    expect(callers.map((f) => f.name).sort()).toEqual([
      'bananagrams.end_game', 'bananagrams.replay_board', 'bananagrams.submit_timeout',
      'boggle.end_game', 'boggle.replay_board', 'boggle.submit_timeout',
      'codenamesduet.end_game', 'codenamesduet.replay_board', 'codenamesduet.submit_timeout',
      'connections.end_game', 'connections.replay_board', 'connections.submit_timeout',
      'crosswords.end_game', 'crosswords.replay_board', 'crosswords.submit_timeout',
      'letterboxed.end_game', 'letterboxed.replay_board', 'letterboxed.submit_timeout',
      'psychicnum.end_game', 'psychicnum.replay_board', 'psychicnum.submit_timeout',
      'scrabble.end_game', 'scrabble.replay_board', 'scrabble.submit_timeout',
      'setgame.end_game', 'setgame.replay_board', 'setgame.submit_timeout',
      'spellingbee.end_game', 'spellingbee.replay_board', 'spellingbee.submit_timeout',
      'stackdown.end_game', 'stackdown.replay_board', 'stackdown.submit_timeout',
      'strands.end_game', 'strands.replay_board', 'strands.submit_timeout',
      'waffle.end_game', 'waffle.replay_board', 'waffle.submit_timeout',
      'wordiply.end_game', 'wordiply.replay_board', 'wordiply.submit_timeout',
      'wordle.end_game', 'wordle.replay_board', 'wordle.submit_timeout',
      'wordwheel.end_game', 'wordwheel.replay_board', 'wordwheel.submit_timeout',
    ])
  })

  it('asks it BEFORE asking whether the caller is a player', () => {
    const wrong = callers
      .filter((f) => {
        const gate = f.body.indexOf('require_game_player')
        // No gate at all is fine — nothing can preempt the sentence.
        return gate !== -1 && gate < f.body.indexOf('_raise_game_deleted(')
      })
      .map((f) => `${f.file}: ${f.name} gates on membership before checking the game exists`)
    expect(wrong, 'the membership gate would answer first, and answer wrongly').toEqual([])
  })
})
