// cs-unmet

/**
 * Guard: **every call to the server goes through a wrapper.**
 *
 * `runRpc`, `readRows` and `runEdgeFn` are the three ways the frontend talks to
 * the server, and the envelope contract holds only because nothing skips them
 * (docs/envelopes.md → Consumers). A raw `db.rpc(...)` reads `{ data, error }`
 * off an RPC that answers 200 with a `not-ok` BODY — so `error` is null, the
 * refusal reads as success, and `data` is the envelope where the answer was
 * meant to be.
 *
 * **This is a different question from `dbCallShape.test.ts`**, which asks
 * whether a wrapper was handed the OTHER wrapper's builder. Crossed and
 * unwrapped are both invisible to the compiler, and a crossed-only guard cannot
 * see a call with no wrapper at all. That gap is not hypothetical: connections'
 * in-game "New game" called `db.rpc('create_game', …).single()` and read
 * `data.id` off the envelope — three lines from its own manifest, which carries
 * the comment "No `.single()`: the RPC returns the envelope itself". It
 * survived every guard in the sprint and was found by hand (2026-09-01).
 *
 * ─── What counts as wrapped ──────────────────────────────────
 * The builder must sit INSIDE a wrapper's argument list, which is the shape
 * every call site already has:
 *
 *     runRpc<Answer>(db.rpc('submit_word', { … }))
 *
 * A builder assigned to a variable and handed over later is also fine — two
 * reads need `.is()` vs `.eq()` chosen at the last moment — so a file that
 * mentions a wrapper at all is trusted for its QUERIES. RPCs get no such
 * latitude: none of them is built in a variable, and the one defect this guard
 * exists for looked exactly like that.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WRAPPERS = ['runRpc', 'readRows', 'runEdgeFn', 'callEdgeFn']

/**
 * Files that ARE the boundary rather than crossing it: the wrappers themselves,
 * and the transport under them. Each one's raw call is its whole job.
 */
const THE_BOUNDARY_ITSELF = new Set([
  'src/common/lib/supabase/dbResult.ts',
  'src/common/lib/supabase/dbFetch.ts',
  'src/common/lib/supabase/callEdgeFn.ts',
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

/** The span of a call's argument list, from its opening paren. Walks depth
 *  rather than matching a regex: every argument here is itself a call, and
 *  quotes are tracked so a paren in a string cannot unbalance the count. */
function argumentSpan(src: string, open: number): [number, number] {
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
      if (depth === 0) return [open, i]
    }
  }
  return [open, src.length]
}

/** Indices inside a line or block comment — prose about a call, not a call. */
function commentMask(src: string): boolean[] {
  const mask = new Array<boolean>(src.length).fill(false)
  let i = 0
  while (i < src.length) {
    if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i)
      const stop = end < 0 ? src.length : end
      for (let k = i; k < stop; k++) mask[k] = true
      i = stop
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i)
      const stop = end < 0 ? src.length : end + 2
      for (let k = i; k < stop; k++) mask[k] = true
      i = stop
    } else i++
  }
  return mask
}

describe('every server call goes through a wrapper', () => {
  const files = sourceFiles('src').filter((f) => !THE_BOUNDARY_ITSELF.has(f))

  it('reads enough files to be meaningful', () => {
    // A guard that finds nothing passes just as quietly as one that works.
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no bare `.rpc(` outside a wrapper', () => {
    const bare: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const mask = commentMask(src)
      const spans = [...src.matchAll(/\b(?:runRpc|readRows|runEdgeFn|callEdgeFn)\s*(?:<[^(]*?>)?\s*\(/g)]
        .map((m) => argumentSpan(src, m.index! + m[0].length - 1))
      for (const m of src.matchAll(/\.rpc\s*\(/g)) {
        const at = m.index!
        if (mask[at]) continue
        if (spans.some(([a, b]) => a < at && at < b)) continue
        bare.push(`${file}:${src.slice(0, at).split('\n').length}`)
      }
    }
    expect(bare, 'a raw RPC reads `error` off an answer that refuses with HTTP 200').toEqual([])
  })

  it('has no bare table query in a file that never mentions a wrapper', () => {
    // Weaker on purpose, and the docstring says why: a query builder is
    // legitimately assigned to a variable first. What this still catches is a
    // file that reads the database without importing a wrapper at all — the
    // shape a new file gets when someone copies a pre-envelope example.
    const bare: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      if (WRAPPERS.some((w) => src.includes(w))) continue
      const mask = commentMask(src)
      for (const m of src.matchAll(/\.from\(\s*['"`]/g)) {
        if (mask[m.index!]) continue
        bare.push(`${file}:${src.slice(0, m.index!).split('\n').length}`)
      }
    }
    expect(bare, 'a table read that never reaches `readRows` has no envelope').toEqual([])
  })
})
