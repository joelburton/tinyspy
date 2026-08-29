// cs-unmet

/**
 * THE RESULT CODES — the three strings a refusal carries that nothing else
 * checks, and each of which fails somewhere nobody looks.
 *
 * Two places write them, from ONE sequence. A SQL raise says
 * `errcode` / `hint` / `column`; an edge function builds the envelope directly
 * and writes `dbcode` / `severity` / `field`. Both are text, typed by hand, in
 * files TypeScript never reads — a `.sql` and a Deno `.ts`:
 *
 *   - **a mistyped errcode** (`PN04`, `PNO44`) does not match `^P[AN][0-9]{3}$`,
 *     so the RPC's own handler RE-RAISES it. The player gets a raw Postgres
 *     fault instead of the sentence the author wrote two lines above.
 *   - **a REUSED code** makes two different refusals indistinguishable to any
 *     call site that branches on `dbcode` — and one already does. Reading both
 *     sources together is what keeps a Deno code from picking a number some
 *     `raise` already took.
 *   - **a mistyped hint** (`validaton`, `Fault`) lands in `severity` verbatim,
 *     so the envelope is well-formed and wrong: the frontend matches none of
 *     its arms and the message wears whatever the default look is.
 *
 * The digits are allocated max+1 and never reused, so a GAP is fine — it means
 * a raise was deleted, and its code stays retired. Only reuse is an error.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL_DIR = resolve(HERE, '../../supabase/sql')
/** The edge functions carry codes too, as literals in the envelopes they
 *  build. They are allocated from the SAME sequence as SQL's, so both have to
 *  be read together or a Deno code and a raise could pick the same number. */
const FN_DIR = resolve(HERE, '../../supabase/functions')

/** The two vocabularies HINT is drawn from, by branch. `PA` codes are results
 *  that read as an outcome; `PN` codes are failures with a severity. Pinned to
 *  the TypeScript unions by the last test in this file. */
const OUTCOMES = new Set(['won', 'lost', 'near', 'warning', 'neutral', 'noted'])
const SEVERITIES = new Set(['fault', 'race', 'form-validation', 'service-error'])

/** `error` is a full member of `Outcome` — a `not-ok`'s default appearance is
 *  that word — but a SUCCESSFUL result never reads as a failure, so a `PA`
 *  raise may not take it. The type can't say that (both arms hold an `Outcome`
 *  and the ok arm's restriction is about meaning, not shape), so this is where
 *  the rule actually lives, checked against the SQL that authors the value. */
const NOT_ON_A_SUCCESS = 'error'

/** The Deno builders in `_shared/envelope.ts`, and the severity each writes.
 *  **Every builder that takes a code belongs here**: one left out is not a
 *  failure but a silence — its codes never reach the uniqueness check, and the
 *  next-number line reports a number already in use. `serviceError` (then
 *  spelled `environmental`) was missing exactly that way, hiding three. */
const FN_BUILDERS: Record<string, string> = {
  fault: 'fault',
  formValidation: 'form-validation',
  serviceError: 'service-error',
}

type Raise = { file: string; code: string; hint: string | null }

/** Every `.ts` under `supabase/functions/`, at any depth. */
function fnFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fnFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  )
}

function raises(): Raise[] {
  const found: Raise[] = []
  // SQL: the code and the hint are separate `using` clauses on one raise.
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const m of sql.matchAll(/errcode\s*=\s*'([^']*)'([\s\S]{0,200})/g)) {
      if (!/^P[AN]/.test(m[1]!)) continue // a real Postgres code, not one of ours
      const hint = m[2]!.match(/hint\s*=\s*'([^']*)'/)
      found.push({ file, code: m[1]!, hint: hint ? hint[1]! : null })
    }
  }
  // Deno, two spellings. `_shared/envelope.ts` builds a refusal through a
  // helper NAMED for its severity, which is where the hint comes from — a
  // `fault(` call cannot be a form-validation, so there is no second string to
  // mistype and no way to omit it. A literal envelope object spells it out
  // instead, as `dbcode` + `severity`.
  //
  // Both are read, because a code allocated either way has to be visible to the
  // reuse check. It is not hypothetical: the first eleven Deno codes were
  // written as helper arguments while this only knew the object form, and the
  // guard cheerfully reported the next number to allocate as one already taken.
  for (const path of fnFiles(FN_DIR)) {
    const ts = readFileSync(path, 'utf8')
    const file = path.slice(path.indexOf('functions/'))
    const builders = new RegExp(`\\b(${Object.keys(FN_BUILDERS).join('|')})\\(\\s*\\n?\\s*'([^']*)'`, 'g')
    for (const m of ts.matchAll(builders)) {
      found.push({ file, code: m[2]!, hint: FN_BUILDERS[m[1]!]! })
    }
    for (const m of ts.matchAll(/dbcode:\s*'([^']*)'([\s\S]{0,200})/g)) {
      const near = m[2]!.match(/(?:severity|outcome):\s*'([^']*)'/)
      const before = ts.slice(Math.max(0, m.index! - 200), m.index!)
      const back = before.match(/(?:severity|outcome):\s*'([^']*)'/)
      found.push({ file, code: m[1]!, hint: near ? near[1]! : back ? back[1]! : null })
    }
  }
  return found
}

describe('the raise codes', () => {
  it('finds them at all', () => {
    // A regex that matched nothing would let every assertion below pass while
    // proving nothing — the failure mode a guard must not have.
    expect(raises().length).toBeGreaterThan(40)
  })

  it('is shaped so the handler recognizes it as ours', () => {
    const malformed = raises()
      .filter((r) => !/^P[AN][0-9]{3}$/.test(r.code))
      .map((r) => `${r.file}: ${r.code}`)
    expect(malformed, 'a code the catch block will re-raise as a raw fault').toEqual([])
  })

  it('never reuses a number', () => {
    const seen = new Map<string, string[]>()
    for (const r of raises()) seen.set(r.code, [...(seen.get(r.code) ?? []), r.file])
    const reused = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([code, files]) => `${code} raised in ${files.join(', ')}`)
    expect(reused, 'two refusals sharing a code are indistinguishable to a caller').toEqual([])
  })

  it('says which kind of thing it is', () => {
    const hintless = raises()
      .filter((r) => r.hint === null)
      .map((r) => `${r.file}: ${r.code}`)
    expect(hintless, 'a raise with no HINT — the envelope would carry no severity').toEqual([])
  })

  it('draws its hint from the vocabulary its branch uses', () => {
    const wrong = raises()
      .filter((r) => {
        const allowed = r.code.startsWith('PA') ? OUTCOMES : SEVERITIES
        return r.hint !== null && !allowed.has(r.hint)
      })
      .map((r) => `${r.file}: ${r.code} says hint='${r.hint}'`)
    expect(wrong, 'a hint outside the vocabulary lands in the envelope verbatim').toEqual([])
  })

  // A `not-ok` says how bad it is in HINT and how it READS in CONSTRAINT, and
  // the second is easy to write and lose: `get stacked diagnostics` only gives
  // you the fields you ask for, so a handler that doesn't request
  // `constraint_name` drops the override on the floor. Nothing fails, nothing
  // logs — the pill just wears the severity's default and looks fine.
  it('reads back every outcome override a raise writes', () => {
    const missing: string[] = []
    const badWord: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      // Split on function boundaries so "does the handler read it" is asked of
      // the SAME function that raised it, not of the file.
      for (const body of sql.split(/create or replace function /)) {
        const fn = body.slice(0, body.indexOf('(')).trim()
        for (const m of body.matchAll(/constraint = '([^']*)'/g)) {
          if (!OUTCOMES.has(m[1]!) && m[1] !== NOT_ON_A_SUCCESS) {
            badWord.push(`${file}: ${fn} says constraint='${m[1]}'`)
          }
          if (!body.includes('constraint_name')) {
            missing.push(`${file}: ${fn} writes constraint='${m[1]}' but its handler never reads constraint_name`)
          }
        }
      }
    }
    expect(missing, 'an outcome override nothing reads back').toEqual([])
    expect(badWord, 'an override outside the outcome vocabulary').toEqual([])
  })

  // The SQL↔TypeScript link, and the assertion most likely to rot unwatched:
  // the sets above are hand-written strings in a test, while the truth is a
  // union in `src/common/lib/`. Nothing but this notices when someone adds a
  // severity and every SQL raise carrying it starts failing the vocabulary
  // check for a reason the message wouldn't explain.
  it('keeps its vocabularies equal to the TypeScript unions', () => {
    const union = (file: string, name: string): Set<string> => {
      const src = readFileSync(resolve(HERE, '../common/lib', file), 'utf8')
      // Up to the next blank line, or the end of the file — a union is often
      // the last thing in its module, and requiring a trailing blank line would
      // make this fail for a reason that has nothing to do with vocabulary.
      const decl = src.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?)(?:\\n\\s*\\n|$)`))
      expect(decl, `couldn't find \`export type ${name}\` in ${file}`).toBeTruthy()
      return new Set([...decl![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!))
    }

    const outcomes = union('outcomes.ts', 'Outcome')
    expect(outcomes.has(NOT_ON_A_SUCCESS), '`error` belongs to the outcome vocabulary').toBe(true)
    expect(
      [...OUTCOMES].sort(),
      "a PA raise's vocabulary is every outcome but `error`",
    ).toEqual([...outcomes].filter((o) => o !== NOT_ON_A_SUCCESS).sort())

    expect([...SEVERITIES].sort(), 'the severities, exactly').toEqual(
      [...union('supabase/envelope.ts', 'Severity')].sort(),
    )
  })

  it('reports the next number to allocate (a line, not a failure)', () => {
    const nums = raises()
      .filter((r) => r.code.startsWith('PN'))
      .map((r) => Number(r.code.slice(2)))
    console.log(`[codes] ${new Set(nums).size} allocated; next PN is ${String(Math.max(...nums) + 1).padStart(3, '0')}`)
    expect(nums.length).toBeGreaterThan(0)
  })
})
