// cs-unmet

/**
 * Guard: **a game RPC asks whether the game still EXISTS before it asks whether
 * you belong to it.**
 *
 * `common.delete_game` is granted to any club member for any game in the club,
 * and it takes three things at once: the `<schema>.games` row, `common.games`,
 * and every `common.game_players` row (both of the others cascade from it). So
 * a player whose game was just deleted has no membership left either — and an
 * RPC that gates on membership first answers `_require_game_player`'s "You are
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
    // Three RPCs × sixteen games, plus every move (docs/envelopes.md → a
    // missing game row is PN485): every player-callable path that reaches for a
    // game's own row and can find it gone. scrabble's `_commit_*` helpers ask
    // it too, behind wrappers that ask it first.
    expect(callers.map((f) => f.name).sort()).toEqual([
      'bananagrams.concede', 'bananagrams.dump', 'bananagrams.peel', 'bananagrams.replay_board',
      'bananagrams.stop_game', 'bananagrams.submit_timeout',
      'boggle.concede', 'boggle.replay_board', 'boggle.stop_game', 'boggle.submit_timeout',
      'boggle.submit_word',
      'codenamesduet._require_clue_giver',
      'codenamesduet.pass_turn', 'codenamesduet.replay_board',
      'codenamesduet.stop_game', 'codenamesduet.submit_clue',
      'codenamesduet.submit_guess', 'codenamesduet.submit_timeout',
      'connections.concede', 'connections.replay_board', 'connections.stop_game', 'connections.submit_guess',
      'connections.submit_timeout',
      'crosswords.check_cells', 'crosswords.concede', 'crosswords.export_solution',
      'crosswords.replay_board', 'crosswords.reveal_cells',
      'crosswords.reveal_solved_word', 'crosswords.stop_game', 'crosswords.submit_timeout',
      'letterboxed._require_chain_move', 'letterboxed.concede',
      'letterboxed.replay_board', 'letterboxed.stop_game', 'letterboxed.submit_timeout',
      'psychicnum.concede', 'psychicnum.replay_board', 'psychicnum.request_hint',
      'psychicnum.request_spoiler', 'psychicnum.stop_game', 'psychicnum.submit_guess',
      'psychicnum.submit_timeout',
      'scrabble._require_bot', 'scrabble._require_move', 'scrabble._require_person',
      'scrabble.concede', 'scrabble.get_ai_context', 'scrabble.get_suggest_context',
      'scrabble.replay_board', 'scrabble.stop_game', 'scrabble.submit_timeout',
      'setgame.concede', 'setgame.record_hint', 'setgame.replay_board', 'setgame.stop_game',
      'setgame.submit_set', 'setgame.submit_timeout',
      'spellingbee.concede', 'spellingbee.replay_board', 'spellingbee.stop_game',
      'spellingbee.submit_timeout', 'spellingbee.submit_word',
      'stackdown.concede', 'stackdown.replay_board', 'stackdown.reveal_next_hint',
      'stackdown.reveal_next_word', 'stackdown.stop_game', 'stackdown.submit_timeout',
      'stackdown.submit_word',
      'strands.concede', 'strands.replay_board', 'strands.spend_hint', 'strands.stop_game',
      'strands.submit_path', 'strands.submit_timeout',
      'waffle.concede', 'waffle.replay_board', 'waffle.stop_game', 'waffle.submit_swap',
      'waffle.submit_timeout',
      'wordiply.concede', 'wordiply.replay_board', 'wordiply.stop_game', 'wordiply.submit_guess',
      'wordiply.submit_timeout',
      'wordle.concede', 'wordle.replay_board', 'wordle.stop_game', 'wordle.submit_guess',
      'wordle.submit_timeout',
      'wordwheel.replay_board', 'wordwheel.stop_game', 'wordwheel.submit_timeout',
      'wordwheel.submit_word',
    ])
  })

  it('asks it BEFORE asking whether the caller is a player', () => {
    const wrong = callers
      .filter((f) => {
        const gate = f.body.indexOf('_require_game_player')
        // No gate at all is fine — nothing can preempt the sentence.
        return gate !== -1 && gate < f.body.indexOf('_raise_game_deleted(')
      })
      .map((f) => `${f.file}: ${f.name} gates on membership before checking the game exists`)
    expect(wrong, 'the membership gate would answer first, and answer wrongly').toEqual([])
  })
})
