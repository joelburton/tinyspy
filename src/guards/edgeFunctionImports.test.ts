// cs-unmet

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY MODULE AN EDGE FUNCTION REACHES MUST BE RESOLVABLE BY DENO.
 *
 * Edge functions import game logic straight out of `src/` — boggle's solver,
 * scrabble's move generator, the shared trie — so those files are compiled by
 * two runtimes with different resolution rules, and only one of them is
 * forgiving:
 *
 *   - **The `@/` alias is a frontend fact.** It exists as a `paths` entry in
 *     the tsconfigs and a `resolve.alias` in `vite.config.ts`
 *     (docs/common-folders.md). Deno reads neither. An `@/…` specifier
 *     anywhere on a function's import graph kills the worker at boot.
 *   - **Deno requires the file extension.** `./board` resolves in Vite and
 *     fails in Deno; `./board.ts` works in both.
 *
 * Either mistake fails the same way, and it is the worst way: the worker never
 * boots, so the function answers nothing, and the only place it is written
 * down is the edge runtime's docker log. `deno check` on the entry point does
 * NOT catch it — measured against the real breakage this guard was written
 * for, where three functions were dead in the tree for two days and `deno
 * check` passed on all three.
 *
 * Nothing else can catch it either. The unit suite passes, because Vite
 * resolves what Deno cannot. `tsc` passes, for the same reason. Only an e2e
 * that starts one of those games goes red — for boggle and scrabble that is
 * four specs, and for a game whose board is built server-side but never
 * exercised end-to-end it would be none at all.
 *
 * So the check is a static walk of the import graph from each function's
 * `index.ts`, through every relative hop, reporting each specifier Deno would
 * refuse. It follows relative imports only: a bare specifier is a URL or an
 * npm package, which is Deno's business, not ours.
 */

const CWD = process.cwd()
const FUNCTIONS = join(CWD, 'supabase/functions')

/** Every `from '…'` specifier in a file, imports and re-exports alike. */
function specifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return [
    ...src.matchAll(/^\s*(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]/gm),
  ].map((m) => m[1]!)
}

/** What a specifier points at, or null when it is not ours to resolve. */
function target(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null // a URL, an npm package, or `@/` — reported above
  const p = resolve(dirname(from), spec)
  for (const candidate of [p, `${p}.ts`, `${p}.tsx`, join(p, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) return candidate
  }
  return null // a broken path; tsc is what reports that
}

/** Walk one function's whole graph, collecting what Deno would refuse. */
function unresolvable(entry: string): string[] {
  const seen = new Set<string>()
  const bad: string[] = []
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const where = relative(CWD, file)
    for (const spec of specifiers(file)) {
      if (spec.startsWith('@/')) {
        bad.push(`${where} → ${spec}  (the @/ alias; Deno has no alias map)`)
        continue
      }
      if (!spec.startsWith('.')) continue
      const next = target(file, spec)
      if (next === null) continue
      if (!/\.(ts|tsx)$/.test(spec)) {
        bad.push(`${where} → ${spec}  (no file extension; Deno needs one)`)
      }
      walk(next)
    }
  }
  walk(entry)
  return bad
}

describe('edge-function import graphs', () => {
  const entries = readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared')
    .map((d) => ({ name: d.name, entry: join(FUNCTIONS, d.name, 'index.ts') }))
    .filter((f) => existsSync(f.entry))

  it('found the functions', () => {
    // A readdir that returned nothing would make the assertion below pass
    // while checking no graph at all.
    expect(entries.length).toBeGreaterThan(5)
  })

  it('reach only modules Deno can resolve', () => {
    const bad = entries.flatMap((f) =>
      unresolvable(f.entry).map((line) => `${f.name}:  ${line}`),
    )
    expect(
      bad,
      'A module on an edge function\'s import graph uses a specifier Deno ' +
        'cannot resolve. The worker will not boot and the function will answer ' +
        'nothing — with no error anywhere but the edge runtime\'s log. Write ' +
        'the import relative, with its `.ts` extension.\n\n' + bad.join('\n'),
    ).toEqual([])
  })
})
