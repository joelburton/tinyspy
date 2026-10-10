// cs-unmet

/**
 * **The elimination games must lock their own row before conceding.**
 *
 * An elimination game decides "is anyone still racing?" from TWO tables at once —
 * the game's own progress rows and `common.game_players`' endings. Two paths
 * ask that question: a final move, and a concede. If they take different locks
 * nothing serializes them, so under READ COMMITTED each reads a snapshot from
 * before the other's uncommitted write, both see somebody still racing, and BOTH
 * decline to end the game. It wedges with nobody left in it.
 *
 * The fix is an ordering: take `<game>.games FOR UPDATE` before the concession
 * is written, on every path. The move paths all do it already, because they
 * need that row anyway.
 *
 * **This exists because the rule was a comment.** It lived in three files and
 * was silently absent from waffle and wordle, which is exactly what a rule
 * enforced by remembering does at the fifth call site (found 2026-09-01,
 * converting `concede`). It cannot be moved into shared code: `common` cannot
 * lock `<game>.games` without dynamic SQL, and the elimination check itself runs
 * AFTER `common.games` is held, so taking the lock there would invert the order
 * and turn a wedge into a deadlock. The ordering constraint is what keeps the
 * lock at the call site — so the rule is asserted here instead.
 *
 * **Keyed off calling `common._concede`**, which every game's concede does, so
 * every one is checked — including the games whose concede asks only `common`
 * tables, so that every concede has one shape (docs/common-schema.md →
 * Concede). Keying off `_maybe_finish_compete`
 * instead was the first version of this guard and it skipped psychicnum, whose
 * identical check was written inline (2026-09-01): a guard keyed on how the
 * code is SHAPED misses a game that does the same thing differently, where one
 * keyed on what it CALLS cannot.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL_DIR = 'supabase/sql'

/** The shared helper that records a concession. */
const CONCEDES = /\bcommon\._concede\s*\(/

/** One function's body, from its `create or replace` to the closing `$$;`. */
function body(sql: string, name: string): string | null {
  const start = sql.indexOf(`create or replace function ${name}(`)
  if (start === -1) return null
  const end = sql.indexOf('\n$$;', start)
  return sql.slice(start, end === -1 ? undefined : end)
}

describe('the concede lock', () => {
  const games = readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql') && f !== 'common.sql')
    .map((f) => ({ game: f.replace('.sql', ''), sql: readFileSync(join(SQL_DIR, f), 'utf8') }))
    .filter(({ game, sql }) => CONCEDES.test(body(sql, `${game}.concede`) ?? ''))

  it('finds every game with a concede', () => {
    // A guard that finds nothing passes just as quietly as one that works.
    // codenamesduet is coop-only, so it has no concede.
    expect(games.map((g) => g.game).sort())
      .toEqual(['bananagrams', 'boggle', 'connections', 'crosswords', 'letterboxed', 'psychicnum', 'scrabble', 'setgame', 'spellingbee', 'stackdown', 'strands', 'waffle', 'wordiply', 'wordle', 'wordleone', 'wordsy', 'wordwheel'])
  })

  it('every such concede locks its own row before recording the concession', () => {
    const offenders: string[] = []
    for (const { game, sql } of games) {
      const concede = body(sql, `${game}.concede`)!
      const lock = concede.search(
        new RegExp(`from ${game}\\.games where game_id = p_game_id for update`))
      const conceding = concede.search(CONCEDES)
      if (lock === -1) {
        offenders.push(`${game}.concede: no \`for update\` on ${game}.games`)
      } else if (lock > conceding) {
        offenders.push(`${game}.concede: locks ${game}.games AFTER recording the concession — the order is what prevents the deadlock`)
      }
    }
    expect(
      offenders,
      'a concede that can wedge its game in `playing` with nobody racing',
    ).toEqual([])
  })
})
