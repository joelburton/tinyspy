// cs-unmet

/**
 * THE RAISE CODES — the three strings a converted raise carries that nothing
 * else checks, and each of which fails somewhere nobody looks.
 *
 * A raise is the only place in this app where SQL hands the frontend a
 * structured value with no type between them. `errcode`, `hint` and the digits
 * are text, typed by hand, in a file TypeScript never reads:
 *
 *   - **a mistyped errcode** (`PN04`, `PNO44`) does not match `^P[AN][0-9]{3}$`,
 *     so the RPC's own handler RE-RAISES it. The player gets a raw Postgres
 *     fault instead of the sentence the author wrote two lines above.
 *   - **a REUSED code** makes two different refusals indistinguishable to any
 *     call site that branches on `dbcode` — and one already does.
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

const SQL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/sql')

/** The two vocabularies HINT is drawn from, by branch. `PA` codes are results
 *  that read as an outcome; `PN` codes are refusals with a severity. Kept in
 *  step with `Outcome` and `Severity` in dbResult.ts / outcomes.ts. */
const OUTCOMES = new Set(['won', 'lost', 'near', 'warning', 'neutral', 'noted'])
const SEVERITIES = new Set(['fault', 'validation', 'error'])

type Raise = { file: string; code: string; hint: string | null }

function raises(): Raise[] {
  const found: Raise[] = []
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const m of sql.matchAll(/errcode\s*=\s*'([^']*)'([\s\S]{0,200})/g)) {
      if (!/^P[AN]/.test(m[1]!)) continue // a real Postgres code, not one of ours
      const hint = m[2]!.match(/hint\s*=\s*'([^']*)'/)
      found.push({ file, code: m[1]!, hint: hint ? hint[1]! : null })
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
