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
 *  that read as an outcome; `PN` codes are refusals with a severity. Kept in
 *  step with `Outcome` and `Severity` in dbResult.ts / outcomes.ts. */
const OUTCOMES = new Set(['won', 'lost', 'near', 'warning', 'neutral', 'noted'])
const SEVERITIES = new Set(['fault', 'validation', 'error'])

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
  // Deno: the code is `dbcode` and the hint is `severity` / `outcome`, because
  // an edge function writes the envelope directly rather than raising into one.
  for (const path of fnFiles(FN_DIR)) {
    const ts = readFileSync(path, 'utf8')
    for (const m of ts.matchAll(/dbcode:\s*'([^']*)'([\s\S]{0,200})/g)) {
      const near = m[2]!.match(/(?:severity|outcome):\s*'([^']*)'/)
      const before = ts.slice(Math.max(0, m.index! - 200), m.index!)
      const back = before.match(/(?:severity|outcome):\s*'([^']*)'/)
      found.push({
        file: path.slice(path.indexOf('functions/')),
        code: m[1]!,
        hint: near ? near[1]! : back ? back[1]! : null,
      })
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

  it('is shaped so the handler recognises it as ours', () => {
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

  it('reports the next number to allocate (a line, not a failure)', () => {
    const nums = raises()
      .filter((r) => r.code.startsWith('PN'))
      .map((r) => Number(r.code.slice(2)))
    console.log(`[codes] ${new Set(nums).size} allocated; next PN is ${String(Math.max(...nums) + 1).padStart(3, '0')}`)
    expect(nums.length).toBeGreaterThan(0)
  })
})
