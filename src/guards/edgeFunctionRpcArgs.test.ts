// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY ARGUMENT AN EDGE FUNCTION SENDS AN RPC IS ONE OF ITS PARAMETERS.
 *
 * PostgREST finds a function by its name AND its argument names, so a call
 * whose keys are not the function's parameters does not reach it: it answers
 * "Could not find the function … in the schema cache", and the edge function
 * fails. Nothing on the frontend catches it — an edge function's `.rpc(…)`
 * arguments are an untyped object, `deno check` passes, and the unit suite
 * never calls one. When every RPC's parameters took the `p_` prefix
 * (docs/code-conventions.md → RPC functions), no edge function's call was
 * renamed, and every game whose board is built server-side could not be
 * started until an e2e spec went red.
 *
 * So the check is static: every `create or replace function` signature in
 * `supabase/sql/`, and every `.rpc('name', { … })` in `supabase/functions/`,
 * each key of the object a parameter of that function. `invokeCreateGame`'s
 * argument type is checked against the `create_game` of every game that
 * calls it, since it is the one call every board builder makes.
 */

const CWD = process.cwd()

function walk(dir: string, ext: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(walk(full, ext))
    else if (entry.endsWith(ext)) out.push(full)
  }
  return out
}

/** `schema.name` → the parameter names of each of its overloads. */
function readSignatures(): Map<string, string[][]> {
  const sigs = new Map<string, string[][]>()
  for (const file of walk(join(CWD, 'supabase/sql'), '.sql')) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/create or replace function (\w+)\.(\w+)\s*\(([^)]*)\)/gi)) {
      const params = m[3]!
        .split(',')
        .map((p) => p.trim().split(/\s+/)[0]!)
        .filter(Boolean)
      const key = `${m[1]}.${m[2]}`
      sigs.set(key, [...(sigs.get(key) ?? []), params])
    }
  }
  return sigs
}

/** The text of the `{ … }` that opens at `open`, braces balanced. */
function objectAt(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i)
  }
  throw new Error(`unbalanced braces from offset ${open}`)
}

/** The top-level keys of an object literal's body, shorthand included. */
function topLevelKeys(body: string): string[] {
  const keys: string[] = []
  let depth = 0
  let entry = ''
  for (const ch of body + ',') {
    if ('{[('.includes(ch)) depth++
    if ('}])'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      const text = entry.replace(/\/\/[^\n]*/g, '').trim()
      const m = /^(\w+)\s*(?::|$)/.exec(text)
      if (m) keys.push(m[1]!)
      entry = ''
    } else entry += ch
  }
  return keys
}

type RpcCall = { file: string; schema: string | null; name: string; keys: string[] }

/** Every `.rpc('name', { … })` in the edge functions, with the schema it is
 *  called on: the `.schema('x')` on its own chain, else the one schema the
 *  file names, else null. */
function readRpcCalls(): RpcCall[] {
  const calls: RpcCall[] = []
  for (const file of walk(join(CWD, 'supabase/functions'), '.ts')) {
    const src = readFileSync(file, 'utf8')
    const fileSchemas = [...new Set([...src.matchAll(/\.schema\(['"](\w+)['"]\)/g)].map((m) => m[1]!))]
    for (const m of src.matchAll(/\.rpc\(\s*['"](\w+)['"]\s*,\s*\{/g)) {
      // A docstring's worked example is not a call.
      const lineStart = src.lastIndexOf('\n', m.index) + 1
      if (/^\s*\*/.test(src.slice(lineStart, m.index))) continue
      const chain = /\.schema\(['"](\w+)['"]\)\s*$/.exec(src.slice(Math.max(0, m.index - 80), m.index))
      calls.push({
        file: relative(CWD, file),
        schema: chain?.[1] ?? (fileSchemas.length === 1 ? fileSchemas[0]! : null),
        name: m[1]!,
        keys: topLevelKeys(objectAt(src, m.index + m[0].length - 1)),
      })
    }
  }
  return calls
}

const SIGNATURES = readSignatures()

/** The overloads a call may mean: its own schema's, or every schema's. */
function overloadsFor(call: RpcCall): string[][] {
  if (call.schema) return SIGNATURES.get(`${call.schema}.${call.name}`) ?? []
  return [...SIGNATURES].filter(([k]) => k.endsWith(`.${call.name}`)).flatMap(([, v]) => v)
}

describe('edge functions call RPCs with their parameter names', () => {
  const calls = readRpcCalls()

  it('has a scope that actually found the calls and the signatures', () => {
    // A walk that found nothing would pass the checks below vacuously.
    expect(SIGNATURES.size).toBeGreaterThan(100)
    expect(calls.length).toBeGreaterThan(15)
  })

  it('every called function exists in supabase/sql/', () => {
    const missing = calls
      .filter((c) => overloadsFor(c).length === 0)
      .map((c) => `${c.file}: ${c.schema ?? '?'}.${c.name}`)
    expect(missing).toEqual([])
  })

  it('every argument is a parameter of the function', () => {
    const wrong = calls
      .filter((c) => {
        const overloads = overloadsFor(c)
        return overloads.length > 0 && !overloads.some((params) => c.keys.every((k) => params.includes(k)))
      })
      .map((c) => `${c.file}: ${c.schema ?? '?'}.${c.name} sends { ${c.keys.join(', ')} }`)
    expect(wrong, 'rename the keys to the function\'s parameters (p_…)').toEqual([])
  })

  it("invokeCreateGame's arguments are its callers' create_game parameters", () => {
    const src = readFileSync(join(CWD, 'supabase/functions/_shared/startGame.ts'), 'utf8')
    const open = src.indexOf('{', src.indexOf('args: {', src.indexOf('export async function invokeCreateGame')))
    const keys = [...objectAt(src, open).matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]!)
    // The schemas its callers name: `invokeCreateGame(supabase, 'boggle', …)`.
    const schemas = walk(join(CWD, 'supabase/functions'), '.ts').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/invokeCreateGame\(\s*\w+,\s*['"](\w+)['"]/g)].map((m) => m[1]!),
    )
    expect(keys.length).toBeGreaterThan(0)
    expect(schemas.length).toBeGreaterThan(5)
    const wrong = schemas
      .map((schema) => [`${schema}.create_game`, SIGNATURES.get(`${schema}.create_game`) ?? []] as const)
      .filter(([, overloads]) => !overloads.some((params) => keys.every((k) => params.includes(k))))
      .map(([name, overloads]) => `${name} takes ${overloads.map((p) => p.join(', ')).join(' | ') || 'nothing — not found'}`)
    expect(wrong, `invokeCreateGame sends { ${keys.join(', ')} }`).toEqual([])
  })
})
