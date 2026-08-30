// cs-unmet

/**
 * The server-error key INVENTORY — a repo-wide guard over the contract the
 * sixteen SQL files, the edge functions, and `ERROR_COPY` share.
 *
 * Every `raise exception` in `supabase/sql/` emits a machine key
 * (`chain-full|5|`), and every edge-function error return carries one too
 * (`json({ error: 'no-pangram-seeds|3|' })` — docs/supabase.md → Server errors;
 * shape-guarded by edgeFnErrorKeys.test.ts). The frontend decides what, if
 * anything, a player reads (lib/game/serverError.ts). Nothing links the sides
 * at compile time — SQL and Deno are text as far as this app's TypeScript is
 * concerned — so these assertions are the link.
 *
 * ─── Why one is a FAILURE and one is only a REPORT ───────────
 * A key with no copy is a legitimate, common state: it means "no one expected a
 * player to see this", and it renders as a fault. 123 of the 175 keys are
 * deliberately in that bucket, so failing on them would be failing on the
 * design. Hence a printed list, not an assertion.
 *
 * Copy with NO key is the opposite: dead words for a rejection that can no
 * longer happen, which will drift silently out of date and mislead whoever
 * reads it next. That IS a failure.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERROR_COPY } from '../common/lib/game/errorCopy'

const SQL_DIR = 'supabase/sql'
const FN_DIR = 'supabase/functions'

/** Strip block and line comments, so a key NAMED in prose is not read as a key
 *  RAISED in code. Crude on purpose — it will also blank a `//` inside a string
 *  literal, and the only strings this file cares about are `key|detail|`
 *  shapes, which contain neither. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Every .ts file under supabase/functions (skipping tests), recursively. */
function edgeFnFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : edgeFnFiles(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('_test.ts') ? [p] : []
  })
}

/** Every key raised anywhere in supabase/sql/ or returned as an edge-function
 *  error, with the files that emit it. Both sources feed the same ERROR_COPY
 *  table, so the orphan check below must know both. */
function raisedKeys(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (key: string, source: string) => {
    if (!out.has(key)) out.set(key, new Set())
    out.get(key)!.add(source)
  }
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const m of sql.matchAll(/raise exception '([a-z][a-z0-9-]*)\|/g)) {
      add(m[1], file.replace('.sql', ''))
    }
  }
  for (const file of edgeFnFiles(FN_DIR)) {
    // COMMENTS FIRST, and this is load-bearing rather than tidy. A docstring
    // that MENTIONS a key — `no-required-words|band|` in a paragraph explaining
    // what the function used to return — is prose, not a raise, and counting it
    // keeps that key's ERROR_COPY entry alive after the last real raise is
    // gone. That is exactly what happened: spellingbee and wordwheel converted
    // to envelopes, their key died, and the orphan check below stayed green
    // because both files still described the old contract in a comment.
    const src = stripComments(readFileSync(file, 'utf8'))
    // Key-headed string/template literals in error positions — the return
    // values themselves (json({ error: 'x|' })) and helpers that produce them
    // (validateCustomLetters' return 'bad-custom-center|').
    for (const m of src.matchAll(/['"\x60]([a-z][a-z0-9-]*)\|/g)) {
      add(m[1], file.slice(FN_DIR.length + 1))
    }
  }
  return out
}

  /**
 * Every `name="…"` the frontend puts on a field.
 *
 * `Field` requires the prop, and it is the key an error is filed at, so this IS
 * the set of places a server message can land. Read from source rather than
 * listed, because a list would be one more thing to keep in step.
 */
function frontendFieldNames(dir = 'src'): Set<string> {
  const names = new Set<string>()
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      for (const n of frontendFieldNames(full)) names.add(n)
    } else if (/\.tsx?$/.test(entry)) {
      for (const m of readFileSync(full, 'utf8').matchAll(/name="([a-z_]+)"/g)) names.add(m[1]!)
    }
  }
  return names
}

describe('server-error keys', () => {
  it('every raise is key-shaped — no prose survives in any SQL file', () => {
    // Guards the raises this system still owns: a new `raise exception
    // 'something went wrong'` would put a developer's sentence in front of a
    // player with no copy table to catch it.
    //
    // A raise carrying a PA/PN errcode is EXEMPT, because prose is exactly what
    // it is supposed to hold — the author writes the player's sentence at the
    // raise (plans/error-system.md). This assertion therefore shrinks as
    // conversion proceeds, and its job is done when it has nothing left to
    // check.
    const prose: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      for (const m of sql.matchAll(/raise exception\s+'((?:[^']|'')*)'/g)) {
        if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*\|/.test(m[1])) continue
        // The errcode sits a line or two below the message, so look ahead a
        // little rather than at the matched line alone.
        const after = sql.slice(m.index ?? 0, (m.index ?? 0) + 220)
        if (/errcode\s*=\s*'P[AN][0-9]{3}'/.test(after)) continue
        prose.push(`${file}: ${m[1]}`)
      }
    }
    expect(prose, 'a raise whose message is not a `key|detail|`').toEqual([])
  })

  // ── The converted raises (plans/error-system.md) ──────────
  //
  // These grow as the key-shaped population above shrinks. They exist because a
  // raise's ERRCODE, HINT and COLUMN are three unchecked strings in SQL, and
  // getting one wrong fails where nobody looks: a typo'd errcode isn't caught
  // by the handler and bubbles as a RAW fault wearing a plausible Postgres
  // code, and a missing COLUMN gives a validation nowhere to land.
  it('every validation says which field it is about', () => {
    // '_' means "deliberately not one field". A MISSING column is what this
    // catches, and it has to be caught at the SOURCE: `get stacked diagnostics`
    // returns '' for an absent COLUMN, so at runtime "the author said no field"
    // and "the author forgot" are the same value.
    const offenders: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      for (const m of sql.matchAll(/raise exception\s+'((?:[^']|'')*)'((?:[^;']|'[^']*')*);/g)) {
        if (!/hint\s*=\s*'validation'/.test(m[2])) continue
        if (!/column\s*=\s*'[^']*'/.test(m[2])) offenders.push(`${file}: ${m[1]}`)
      }
    }
    expect(
      offenders,
      "a validation with no `column =` — name the field, or '_' for none",
    ).toEqual([])
  })

  it('a validation names something the function is actually given', () => {
    // The convention that makes the frontend half free: COLUMN names the RPC's
    // own parameter, which the frontend already knows because it passes it. A
    // column naming anything else would address an input that doesn't exist,
    // and the message would vanish.
    //
    // OR A KEY IT READS OUT OF A JSONB PARAMETER. `create_game` takes the whole
    // form as one `setup` argument, so `guesses` is not a parameter — but the
    // function reads `setup->>'guesses'`, the form has a field of that name,
    // and the message belongs under it. Requiring the read is what keeps this
    // honest: a column naming a key nothing looks at is still caught.
    //
    // OR A FIELD THE FRONTEND DECLARES, which is the LOADER case and is
    // ordinary rather than exceptional: a setup form asks a question mid-edit
    // (`next_puzzle_for_club(seen_by)`, `puzzle_for_date(target_date)`,
    // `next_nyt_date_for_club`), so the function's parameters are the QUESTION
    // and the field its answer belongs to is one it is never passed. Five such
    // call sites across three games today.
    //
    // The two arms are one invariant said two ways — THE MESSAGE MUST LAND
    // SOMEWHERE. Naming a parameter is the strict proof of that where the form
    // submits its own values; naming a declared field is the direct proof where
    // it does not.
    const feFields = frontendFieldNames()
    const offenders: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      // Split on function headers so each raise is judged against ITS OWN
      // signature rather than the file's whole vocabulary.
      for (const fn of sql.split(/(?=create or replace function\s)/i)) {
        const header = fn.match(/create or replace function\s+([a-z_]+\.[a-z_0-9]+)\s*\(([^)]*)\)/i)
        if (!header) continue
        const params = new Set(
          header[2].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean),
        )
        // Keys pulled out of one of those parameters: `setup->>'guesses'`.
        const named = new Set(params)
        for (const r of fn.matchAll(/\b([a-z_]+)\s*->>?\s*'([^']+)'/g)) {
          if (params.has(r[1]!)) named.add(r[2]!)
        }
        for (const m of fn.matchAll(/column\s*=\s*'([^']*)'/g)) {
          if (m[1] === '_' || named.has(m[1]!) || feFields.has(m[1]!)) continue
          offenders.push(
            `${file}: ${header[1]} raises column='${m[1]}' — not a parameter, ` +
              `and not a key it reads out of one (${[...named].join(', ')})`,
          )
        }
      }
    }
    expect(offenders, 'a column naming an input the function never sees').toEqual([])
  })

  it('every ERROR_COPY entry answers a key some file actually raises', () => {
    // Dead copy is worse than no copy: it reads as a considered decision and
    // nothing ever proves it wrong.
    const raised = raisedKeys()
    const orphans = Object.keys(ERROR_COPY).filter((k) => !raised.has(k))
    expect(orphans, 'copy for a key nothing raises — delete it or fix the key').toEqual([])
  })

  it('reports which keys have no copy (a list, not a failure)', () => {
    const raised = raisedKeys()
    const uncovered = [...raised.keys()].filter((k) => !(k in ERROR_COPY)).sort()
    const covered = [...raised.keys()].filter((k) => k in ERROR_COPY)
    // Printed so the split is visible when the suite runs — the number moving is
    // meaningful (a game got more player-facing, or a key got promoted), while
    // its absolute value is not something to hold to a threshold.
    console.log(
      `[keys] ${raised.size} distinct: ${covered.length} with copy (a pill), ` +
        `${uncovered.length} without (a fault)`,
    )
    expect(raised.size).toBeGreaterThan(0)
  })
})
