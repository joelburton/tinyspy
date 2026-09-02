// cs-unmet

/**
 * **The elimination games must lock their own row before conceding.**
 *
 * Five compete games decide "is anyone still racing?" from TWO tables at once —
 * the game's own progress rows and `common.game_players.conceded`. Two paths ask
 * that question: a final move, and a concede. If they take different locks
 * nothing serializes them, so under READ COMMITTED each reads a snapshot from
 * before the other's uncommitted write, both see somebody still racing, and BOTH
 * decline to end the game. It wedges in `playing` with nobody left in it.
 *
 * The fix is an ordering: take `<game>.games FOR UPDATE` before `common.games`
 * (which `common._set_conceded` locks), on every path. The move paths all do it
 * already, because they need that row anyway.
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
 * **Keyed off calling `common._set_conceded`**, which is the property that
 * creates the hazard: a game either hands the whole decision to
 * `common.concede` — whose active set is asked of `common` tables alone, where
 * both paths already serialize — or marks itself out with `_set_conceded` and
 * then decides from its OWN rows, which is the two-table case. Keying off
 * `_maybe_finish_compete` instead was the first version of this guard and it
 * skipped psychicnum, whose identical check was written inline (2026-09-01):
 * a guard keyed on how the code is SHAPED misses a game that does the same
 * thing differently, where one keyed on what it CALLS cannot.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL_DIR = 'supabase/sql'

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
    .filter(({ game, sql }) => (body(sql, `${game}.concede`) ?? '').includes('common._set_conceded'))

  it('finds the games that decide for themselves', () => {
    // A guard that finds nothing passes just as quietly as one that works. The
    // list is also the answer to "which games are these?" — the other nine hand
    // the decision to common.concede and are not exposed.
    expect(games.map((g) => g.game).sort())
      .toEqual(['connections', 'psychicnum', 'scrabble', 'strands', 'waffle', 'wordle'])
  })

  it('every elimination game locks its own row before common.games', () => {
    const offenders: string[] = []
    for (const { game, sql } of games) {
      const concede = body(sql, `${game}.concede`)!
      const lock = concede.search(new RegExp(`from ${game}\\.games where id = target_game for update`))
      const setConceded = concede.indexOf('common._set_conceded')
      if (lock === -1) {
        offenders.push(`${game}.concede: no \`for update\` on ${game}.games`)
      } else if (setConceded !== -1 && lock > setConceded) {
        offenders.push(`${game}.concede: locks ${game}.games AFTER common._set_conceded — the order is what prevents the deadlock`)
      }
    }
    expect(
      offenders,
      'a concede that can wedge its game in `playing` with nobody racing',
    ).toEqual([])
  })
})
