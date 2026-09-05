// cs-unmet

/**
 * Guard: **no raw `localStorage` / `sessionStorage` outside the wrapper.**
 *
 * A browser set to block site data does not return `null` from these APIs — it
 * throws, and it throws on the property access as readily as on the call. So
 * every touch needs a `try`, and "every touch needs a try" is a convention. This
 * repo answers conventions with mechanisms, because this one was held by eight
 * files and broken by two, and those two were separate bugs found in a single
 * audit.
 *
 * The mechanism is `common/web-storage/storage.ts`: `readStored` / `writeStored` /
 * `removeStored`, each guarded, with `whenUnavailable` a REQUIRED argument so a
 * caller states what "no storage" means for it rather than inheriting an answer.
 * That argument is not ceremony — `reloadOnStaleChunk` fails CLOSED, where every
 * other caller fails open, and a helper with a benign default would have turned
 * its reload counter into a reload loop.
 *
 * **Comments are stripped before scanning, and that is load-bearing** rather
 * than a courtesy. About sixty comments across thirty files mention storage —
 * every one of these modules explains the persistence it does — and at least
 * four write real call syntax that this scan would otherwise flag:
 * `realtimeDiag`'s docstring, which tells a person what to type into their own
 * console to enable the verbose socket log, plus `chatOpenStore.test.ts` and
 * `reloadOnStaleChunk.test.ts` describing the spies they install. Without the
 * stripping this guard would have been red the day it was written — and a guard
 * that counts prose about its own subject will sooner or later report a
 * sentence as a violation, or count a sentence as proof something is still in
 * use.
 *
 * **Test files are swept too, deliberately** — unlike `noRawServerMessage`,
 * which this is otherwise modeled on and which skips them. A test reaching for
 * raw storage is exactly what should have to justify itself, because
 * `storage.fake.ts` exists so that it does not have to; that is why tests
 * outnumber source files in `ALLOWED`, and why `storage.test.ts` is not among
 * them.
 *
 * **Known limit: `stripComments` has no notion of string literals.** A `/*`
 * inside a string opens a fake block comment that blanks everything to the next
 * close, code included, and a glob is the ordinary way that happens — a
 * `'themes/*.css'` in `cssTokens.test.ts` hides the twenty-odd lines after it
 * from this scan. Measured across `src/`: every such region is inside
 * `src/guards/`, so no storage touch is hidden today, but the hole is real.
 * Closing it needs a tokenizer, and three other guards carry the same stripper,
 * so it is filed in `docs/deferred.md` as one change to all four rather than
 * fixed in one. The other half of the same hole — a URL's `//` swallowing the
 * rest of its line — IS handled; see `stripComments`.
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
  ['src/common/web-storage/storage.ts', 'the wrapper itself'],
  ['src/common/web-storage/storage.fake.ts', 'installs the test fake onto window, which is by definition a raw touch'],
  // The two below predate `storage.fake.ts` and install a hand-rolled fake onto
  // `window`, which is a thing no wrapper call can do. `storage.test.ts` is
  // deliberately NOT here: it asserts through the shared fake's handles, which
  // is the pattern these two should adopt when their areas open (`hooks` and
  // whoever takes chat).
  ['src/common/web-storage/useStickyChoice.test.ts', 'installs its own Storage fake on window; adopt storage.fake.ts when `hooks` opens'],
  ['src/common/chat/chatOpenStore.test.ts', 'installs its own Storage fake on window, and spies on setItem to make a write throw'],
  ['src/common/boot/reloadOnStaleChunk.test.ts', 'clears the session guard between cases'],
  // This file scans `src/`, and `src/` includes this file. Its fixture holds
  // real violations on purpose — spelling them around the scan (`'local' +
  // 'Storage'`) would make the test stop testing what it claims to.
  ['src/guards/rawStorage.test.ts', 'its own fixture spells out the violations it asserts are caught'],
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

/**
 * Blank out block and line comments, keeping line numbering intact so an
 * offender still reports the line you have to open.
 *
 * **`[^:]` before the `//` is what keeps a URL from eating the rest of a line.**
 * Without it, `const u = 'https://x'` reads as a comment start and everything
 * after it on that line vanishes — including a storage touch, which the guard
 * would then pass silently. Borrowed from `cssClasses` and `vocabularies`,
 * which strip line comments the same way for the same reason.
 */
function stripComments(src: string): string[] {
  const out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return out.split('\n').map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
}

describe('no raw web storage outside the wrapper', () => {
  it('every storage touch goes through common/web-storage/storage', () => {
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

  // `stripComments` is the part of this guard that can fail SILENTLY — it
  // decides what the scan never sees — so it is pinned directly rather than
  // only through the files it happens to process today.
  it('strips comments without letting a URL swallow the rest of the line', () => {
    const lines = stripComments(
      [
        "const u = 'https://example.com'; localStorage.getItem(k)",
        '// localStorage.getItem(k)',
        'code() // localStorage.getItem(k)',
        '/* localStorage.getItem(k) */',
        'localStorage.getItem(k)',
      ].join('\n'),
    )
    const seen = lines.map((line) => RAW_STORAGE.test(line))
    // The URL line and the bare call are violations; the three comment forms
    // are not. Getting the first one wrong is the silent failure.
    expect(seen).toEqual([true, false, false, false, true])
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
