// cs-unmet

/**
 * **A function that can end a game must write one of the game's own rows.**
 *
 * A game's board re-reads (`useGame`) only when a row in the game's OWN tables
 * changes. `common.end_game` and `common.concede` write `common.games` alone,
 * which wakes the shared page — the verdict shows — but not the board. So
 * whatever the game's own read releases at the end never arrives: wordle's
 * answer (Reveal had nothing to show), a race's rivals' guesses. The page is
 * right after a reload and wrong until then (docs/common-schema.md → Manual end,
 * step 5; → Concede).
 *
 * **This exists because the rule was a step in a doc.** End followed it
 * everywhere; three concede and timeout paths did not (found 2026-09-24).
 * vitest cannot see it — it stubs the server — and e2e passes because a live
 * page re-renders for other reasons. Only reading the SQL finds it, so this
 * reads the SQL.
 *
 * **The rule, as checked:** every function in a game's `supabase/sql/<game>.sql`
 * that ends the game — calls `common.end_game` or `common.concede`, or calls a
 * function of its own game that does — must write the game's schema (`update`,
 * `insert into` or `delete from` a `<game>.` table), itself or through a
 * function of its own game that it calls. The same transaction is enough: the
 * write's event goes out at commit, when the game is already over.
 *
 * **What it cannot tell:** whether the write is on the branch that ends the game
 * (a function that writes on one branch and ends on another passes), or whether
 * the table written is one the board subscribes to. A net, not a proof — a new
 * ending still wants its own pgTAP check that the game row moved (`ctid`).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL_DIR = 'supabase/sql'

/** The common functions that end a game, writing only `common.*`. */
const ENDS = /\bcommon\.(end_game|concede)\s*\(/

/** Every function in one game's SQL, by name: its text after the header (so it
 *  never reads as calling itself), comments stripped. */
function functionsOf(game: string, sql: string): Map<string, string> {
  const fns = new Map<string, string>()
  const head = new RegExp(`create or replace function ${game}\\.(\\w+)\\(`, 'g')
  for (const m of sql.matchAll(head)) {
    const end = sql.indexOf('\n$$;', m.index)
    const text = sql.slice(m.index + m[0].length, end === -1 ? undefined : end)
    fns.set(m[1]!, text.replace(/--.*$/gm, ''))
  }
  return fns
}

/** The names of this game's own functions that `body` calls. */
function callees(game: string, body: string, names: Set<string>): string[] {
  const calls = [...body.matchAll(new RegExp(`\\b${game}\\.(\\w+)\\s*\\(`, 'g'))].map((m) => m[1]!)
  return calls.filter((n) => names.has(n))
}

/** Does `name`, or anything of its own game it calls, satisfy `test`? */
function reaches(
  name: string,
  fns: Map<string, string>,
  game: string,
  test: (body: string) => boolean,
  seen = new Set<string>(),
): boolean {
  if (seen.has(name)) return false
  seen.add(name)
  const body = fns.get(name)!
  if (test(body)) return true
  return callees(game, body, new Set(fns.keys())).some((c) => reaches(c, fns, game, test, seen))
}

const games = readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql') && f !== 'common.sql')
  .map((f) => f.replace('.sql', ''))
  .map((game) => ({ game, fns: functionsOf(game, readFileSync(join(SQL_DIR, `${game}.sql`), 'utf8')) }))

describe('an ending wakes the board', () => {
  it('finds the endings', () => {
    // A guard that finds nothing passes just as quietly as one that works.
    const endingGames = games.filter(({ fns }) => [...fns.values()].some((b) => ENDS.test(b)))
    expect(endingGames.length).toBeGreaterThanOrEqual(16)
  })

  it('every entry point that can end a game writes one of its rows', () => {
    const offenders: string[] = []
    for (const { game, fns } of games) {
      const writes = (b: string) => new RegExp(`\\b(update|insert into|delete from)\\s+${game}\\.`).test(b)
      // The transaction is the unit: a helper need not write if its caller
      // does. So only the entry points — functions nothing of this game calls —
      // are asked, each following its calls.
      const called = new Set([...fns.values()].flatMap((b) => callees(game, b, new Set(fns.keys()))))
      for (const name of fns.keys()) {
        if (called.has(name)) continue
        if (!reaches(name, fns, game, (b) => ENDS.test(b))) continue
        if (!reaches(name, fns, game, writes)) offenders.push(`${game}.${name}`)
      }
    }
    expect(
      offenders,
      'ends the game without writing a row of its own — the board never re-reads',
    ).toEqual([])
  })
})
