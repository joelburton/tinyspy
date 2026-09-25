// cs-unmet

/**
 * **End and the timeout lock the game's own row before ending it.**
 *
 * `common.end_game` updates `common.games` unconditionally. So an End (or a
 * timeout) that reads the play state WITHOUT holding the game's own row can
 * race the winning move: it reads `playing` from before the move committed,
 * then waits on `common.games` and overwrites the win with a neutral `ended`,
 * rewriting every player's result to `{ won: false }`. Holding
 * `<game>.games FOR UPDATE` first — the lock every move takes — makes it wait
 * for the move instead, read `won`, and answer the game-over race
 * (docs/common-schema.md → Manual end, step 1).
 *
 * **This exists because the rule was a step in a doc.** 26 of 32 of these
 * functions took the lock; six only checked the row existed (found
 * 2026-09-24). pgTAP runs a test in one transaction, so it cannot stage the
 * race; the SQL can still be read.
 *
 * **The rule, as checked:** every `<game>.end_game` and `<game>.submit_timeout`
 * reads `<game>.games … for update` before it calls `common.end_game` or any
 * function of its own game (which is how a helper ends it).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL_DIR = 'supabase/sql'

/** One function's text after its header, comments stripped, on one line. */
function body(sql: string, name: string): string | null {
  const head = `create or replace function ${name}(`
  const start = sql.indexOf(head)
  if (start === -1) return null
  const end = sql.indexOf('\n$$;', start)
  return sql
    .slice(start + head.length, end === -1 ? undefined : end)
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
}

const endings = readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql') && f !== 'common.sql')
  .flatMap((f) => {
    const game = f.replace('.sql', '')
    const sql = readFileSync(join(SQL_DIR, f), 'utf8')
    return ['end_game', 'submit_timeout']
      .map((fn) => ({ game, name: `${game}.${fn}`, text: body(sql, `${game}.${fn}`) }))
      .filter((e): e is { game: string; name: string; text: string } => e.text !== null)
  })

describe('the end lock', () => {
  it('finds every end_game and submit_timeout', () => {
    // A guard that finds nothing passes just as quietly as one that works.
    expect(endings.length).toBeGreaterThanOrEqual(32)
  })

  it('each locks its own games row before ending the game', () => {
    const offenders: string[] = []
    for (const { game, name, text } of endings) {
      const lock = text.search(new RegExp(`from ${game}\\.games [^;]*for update`))
      const ends = text.search(new RegExp(`common\\.end_game\\(|\\b${game}\\.\\w+\\(`))
      if (lock === -1) offenders.push(`${name}: no \`for update\` on ${game}.games`)
      else if (ends !== -1 && lock > ends) offenders.push(`${name}: locks ${game}.games only AFTER ending the game`)
    }
    expect(offenders, 'an ending that can overwrite a win it raced').toEqual([])
  })
})
