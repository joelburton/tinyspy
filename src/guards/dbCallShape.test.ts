// cs-unmet

/**
 * Guard: **`runRpc` takes an RPC, `readRows` takes a query.**
 *
 * The two wrappers look interchangeable at a call site and are not. `runRpc`
 * receives an envelope a SQL author wrote and checks that it is one; `readRows`
 * BUILDS an envelope around rows nobody authored (docs/envelopes.md →
 * Consumers). Crossing them silently produces the wrong shape:
 *
 *     runRpc(db.from('clubs').select('handle'))    // rows, read as an envelope
 *     readRows(db.rpc('delete_game', { … }))       // an envelope, read as rows
 *
 * **TypeScript catches only one of the two.** `readRows` demands
 * `QueryLike<Row[]>`, and an RPC resolves to `data: T | null`, so the second
 * line fails to compile today. The first does not: `runRpc`'s parameter is
 * `data: unknown`, which every builder satisfies.
 *
 * And the compiler cannot be made to catch it, which is why this is a guard
 * rather than a type. Our RPCs are generated as `Returns: Json`, and `Json`
 * already includes arrays — so any parameter type narrow enough to reject a
 * query rejects every RPC we have (measured, 2026-08-29).
 *
 * The runtime backstops exist and are the reason this is cheap insurance rather
 * than the only line of defense: each wrapper faults when it is handed the
 * other one's answer. But a fault fires when the code RUNS, and half these call
 * sites are on paths a person has to reach.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A builder names its subject as a STRING LITERAL — `.from('clubs')`,
 * `.rpc('delete_game', …)`. The quote is load-bearing rather than decoration:
 * a bare `\.from\(` also matches `Array.from(gametypes)`, which is how the
 * first run of this guard reported `EditClubModal`'s perfectly good
 * `set_club_gametypes` call as a crossed wrapper.
 */
/**
 * The builder each wrapper takes. The two patterns are deliberately NOT
 * symmetric:
 *
 *   - `query` requires a quoted table name, because `.from(` is not ours
 *     alone — `Array.from(gametypes)` sits inside a `runRpc` argument in
 *     `EditClubModal`, and without the quote it reads as a table query being
 *     handed to the RPC wrapper.
 *   - `rpc` does not, because an RPC's NAME is sometimes a variable and
 *     legitimately so: letterboxed's `runChainRpc` takes
 *     `'undo_word' | 'clear_chain'` so one helper serves both actions.
 *     Nothing else in the codebase spells `.rpc(`, so the method alone is a
 *     safe signal here where it is not for `.from(`.
 *
 * What the guard is actually looking for either way is a CROSSED call —
 * `readRows` handed an RPC, `runRpc` handed a table query.
 */
const BUILDER = {
  rpc: /\.rpc\(/,
  query: /\.from\(\s*['"`]/,
}

/** What each wrapper's argument must contain, and must not. */
const WRAPPERS = [
  { name: 'runRpc', takes: 'RPCs', wants: BUILDER.rpc, rejects: BUILDER.query },
  { name: 'readRows', takes: 'table queries', wants: BUILDER.query, rejects: BUILDER.rpc },
] as const

/**
 * Where the two are DEFINED rather than called. Its docstrings show both in
 * examples, which is the subject matter — the same trap `serverErrorKeys`
 * fell into by counting prose as usage.
 */
const DEFINES_THEM = 'src/common/lib/supabase/dbResult.ts'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

/**
 * The text between a call's parentheses, starting at the index of its opening
 * one. Walks depth rather than matching a regex, because every one of these
 * arguments is itself a call — `runRpc(db.rpc('x', { … }))` — and the nesting
 * is what a regex gets wrong. Quotes are tracked so a paren inside a string
 * literal doesn't unbalance the count.
 */
function argumentText(src: string, open: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

/** Line comments inside an argument are prose about the call, not the call. */
const stripComments = (text: string) =>
  text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Every place a wrapper is CALLED, with the argument it was handed. A mention
 * inside a comment is skipped by requiring the `(` — or, for a generic call,
 * the `<`— to follow the name immediately.
 */
function callSites(src: string, name: string) {
  const found: { line: number; arg: string }[] = []
  const pattern = new RegExp(`\\b${name}\\s*(<|\\()`, 'g')
  let m: RegExpExecArray | null
  while ((m = pattern.exec(src)) !== null) {
    // Step past a generic argument list to the real opening paren.
    let open = m.index + m[0].length - 1
    if (src[open] === '<') {
      open = src.indexOf('(', open)
      if (open === -1) continue
    }
    found.push({
      line: src.slice(0, m.index).split('\n').length,
      arg: stripComments(argumentText(src, open)),
    })
  }
  return found
}

/**
 * **Where the builder is in a VARIABLE, so the text cannot show it.**
 *
 * This guard reads the call site's argument and looks for `.from(` or `.rpc(`.
 * A builder assembled into a local and then branched on defeats that — and it
 * would defeat it for a genuinely crossed call too, which is the honest reason
 * this is a list rather than a pattern.
 *
 * `useScratchpad` has the one case: the shared pad needs `.is('owner_id', null)`
 * and a private one `.eq('owner_id', id)`, so the last link differs while the
 * rest is common. Inlining the whole chain twice to satisfy a text search would
 * be the tail wagging the dog.
 */
const BUILDER_IN_A_VARIABLE = new Set([
  'src/common/hooks/scratchpad/useScratchpad.ts',
])

describe('the db call wrappers are not crossed', () => {
  for (const { name, takes, wants, rejects } of WRAPPERS) {
    it(`every ${name}() is handed a builder for ${takes}`, () => {
      const offenders: string[] = []
      for (const file of sourceFiles('src')) {
        if (file === DEFINES_THEM) continue
        const src = readFileSync(file, 'utf8')
        for (const { line, arg } of callSites(src, name)) {
          if (rejects.test(arg)) {
            offenders.push(`${file}:${line}  ${name} was handed the other wrapper's builder`)
          } else if (!wants.test(arg) && !BUILDER_IN_A_VARIABLE.has(file)) {
            offenders.push(`${file}:${line}  ${name}'s argument names no builder at all`)
          }
        }
      }
      expect(
        offenders,
        `${name} is for ${takes} — see docs/envelopes.md → Consumers`,
      ).toEqual([])
    })
  }

  // A guard that finds nothing because it is LOOKING at nothing passes just as
  // quietly as one that works. Both wrappers are in real use, so a zero here
  // means the scan broke — a renamed wrapper, a moved `src`, a paren walk that
  // returns early.
  it('is actually scanning call sites', () => {
    const counts = WRAPPERS.map(({ name }) => {
      const total = sourceFiles('src')
        .filter((f) => f !== DEFINES_THEM)
        .reduce((n, f) => n + callSites(readFileSync(f, 'utf8'), name).length, 0)
      return [name, total] as const
    })
    for (const [name, total] of counts) {
      expect(total, `found no ${name}() call sites at all — the scan is broken`).toBeGreaterThan(10)
    }
  })
})
