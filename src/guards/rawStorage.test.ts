// cs-unmet

/**
 * Guard: **no raw `localStorage` / `sessionStorage` outside the wrapper.**
 *
 * A browser set to block site data does not return `null` from these APIs — it
 * throws, and it throws on the property access as readily as on the call. So
 * every touch needs a `try`, and "every touch needs a try" is a convention. This
 * repo answers conventions with mechanisms, because this one was held by eight
 * files and broken by two, and those two were separate bugs found in a single
 * audit (`plans/areas/deep.md`, F-deep-11 and F-deep-13).
 *
 * The mechanism is `common/lib/util/storage.ts`: `readStored` / `writeStored` /
 * `removeStored`, each guarded, with `whenUnavailable` a REQUIRED argument so a
 * caller states what "no storage" means for it rather than inheriting an answer.
 * That argument is not ceremony — `reloadOnStaleChunk` fails CLOSED, where every
 * other caller fails open, and a helper with a benign default would have turned
 * its reload counter into a reload loop.
 *
 * **Comments are stripped before scanning**, so prose about storage passes: the
 * one place that legitimately shows a raw call is `realtimeDiag`'s docstring,
 * which tells a person what to type into their own console to turn on the
 * verbose socket log. A guard that failed on its own subject matter is how
 * `serverErrorKeys.test.ts` came to believe a dead key was still live.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Any mention of either web storage. Deliberately WIDE — the identifier alone,
 * with no following `.`, because the first version of this regex required one
 * and therefore missed both `const ls = window.localStorage` (which then does
 * its reads through a local name) and `storage.ts`'s own `store()` helper. Its
 * own subject evading it is a good sign a pattern is too clever.
 *
 * Matching the bare word also catches `Object.defineProperty(window,
 * 'localStorage', …)`, which is how a test installs a fake — correctly, since
 * that is as raw as a touch gets.
 */
const RAW_STORAGE = /\b(?:local|session)Storage\b/

/**
 * Files allowed to touch storage directly, each for a reason that is not "a
 * feature persisting something". Keep it SHORT — adding to it is the exact move
 * this guard exists to make deliberate.
 */
const ALLOWED = new Map<string, string>([
  ['src/common/lib/util/storage.ts', 'the wrapper itself'],
  ['src/common/lib/util/storage.fake.ts', 'installs the test fake onto window, which is by definition a raw touch'],
  // The two below predate `storage.fake.ts` and install a hand-rolled fake onto
  // `window`, which is a thing no wrapper call can do. `storage.test.ts` is
  // deliberately NOT here: it asserts through the shared fake's handles, which
  // is the pattern these two should adopt when their areas open (`hooks` and
  // whoever takes chat).
  ['src/common/hooks/ui/useStickyChoice.test.ts', 'installs its own Storage fake on window; adopt storage.fake.ts when `hooks` opens'],
  ['src/common/lib/chat/chatOpenStore.test.ts', 'installs its own Storage fake on window, and spies on setItem to make a write throw'],
  ['src/common/lib/util/reloadOnStaleChunk.test.ts', 'clears the session guard between cases'],
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

/** Blank out block and line comments, keeping line numbering intact so an
 *  offender still reports the line you have to open. */
function stripComments(src: string): string[] {
  const out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return out.split('\n').map((line) => line.replace(/\/\/.*$/, ''))
}

describe('no raw web storage outside the wrapper', () => {
  it('every storage touch goes through common/lib/util/storage', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      if (ALLOWED.has(file)) continue
      stripComments(readFileSync(file, 'utf8')).forEach((line, i) => {
        if (RAW_STORAGE.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(
      offenders,
      'use readStored/writeStored/removeStored, or justify the file in ALLOWED',
    ).toEqual([])
  })

  // An allowlist nobody prunes is a list of files that stopped needing to be on
  // it. This is the same both-directions shape `cssTokens.test.ts` uses for
  // DECLARED_AHEAD: an entry must still be an offender, or it goes.
  it('every ALLOWED entry still touches storage', () => {
    const stale: string[] = []
    for (const [file, why] of ALLOWED) {
      const lines = stripComments(readFileSync(file, 'utf8'))
      if (!lines.some((line) => RAW_STORAGE.test(line))) stale.push(`${file} — "${why}"`)
    }
    expect(stale, 'no longer touches storage; drop it from ALLOWED').toEqual([])
  })
})
