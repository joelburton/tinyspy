// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a class NAME means something, in both directions.
 *
 * A CSS class is written in one file and read in another, and nothing in the
 * toolchain connects the two. `styles.clubsList` where `.clubsList` no longer
 * exists is `undefined`, which `cls()` drops — so the element renders without
 * the class, nothing throws, and the page looks fine until someone notices the
 * thing it was supposed to do isn't happening. A bare `'item-list'` with a typo
 * is the same silence one layer over.
 *
 * ⚠️ **A RENDER TEST CANNOT DO THIS JOB**, which is the whole reason the check
 * is a text scan. `vite.config.ts` sets `css: false` for vitest, so a CSS module
 * resolves to a proxy that FABRICATES any class name asked for: `styles.typo`
 * returns the string "typo" and a mounted component happily reports it. A test
 * can assert a class is APPLIED; only reading the stylesheet can assert it
 * EXISTS.
 *
 * Four checks, and each one is here because the homepage area found it live
 * (plans/areas/homepage.md → F4):
 *
 *   1. every `styles.x` resolves to a class in the module it was imported from;
 *   2. every class a module defines is read by someone;
 *   3. every global class written as a string literal exists in a global
 *      stylesheet;
 *   4. every `[class*="…"]` selector in an e2e spec can match something.
 *
 * What this canNOT catch, said out loud so nobody assumes otherwise: a stale
 * class name inside a COMMENT. `see the .soloItem styles` is prose, and telling
 * a wrong one from a right one would mean flagging every word that starts with
 * a dot.
 *
 * Whole-repo, games included. A vocabulary is a game's own business
 * (docs/naming.md → tuned); a class that doesn't exist is nobody's.
 */

const CWD = process.cwd()
const rel = (f: string) => f.replace(`${CWD}/`, '')

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** `//` to end of line, but not the one inside `https://`. */
const stripLineComments = (s: string) => s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const CSS_FILES = walk(join(CWD, 'src'), ['.css'])
const MODULES = CSS_FILES.filter((f) => f.endsWith('.module.css'))
const GLOBAL_SHEETS = CSS_FILES.filter((f) => !f.endsWith('.module.css'))
const CODE_FILES = walk(join(CWD, 'src'), ['.ts', '.tsx'])
const E2E_FILES = walk(join(CWD, 'e2e'), ['.ts'])

/**
 * The class names a stylesheet DEFINES, split by scope.
 *
 * Reads selector text only — the run between one brace and the next `{` — so a
 * declaration can never be mistaken for a selector. That matters more than it
 * sounds: `background-image: url("…%3Cpath d='M1 1.5 6 6.5 11 1.5'/%3E…")`
 * contains plenty of dots, and a whole-file regex would invent classes out of
 * an inline SVG. Taking the prelude of each block also handles nesting for
 * free: `@media (--phone) { .x { … } }` yields the `@media` prelude (skipped,
 * it starts with `@`) and then ` .x `.
 *
 * `:global(.foo)` is pulled out first — a module can declare a global class,
 * and that name belongs to the global set rather than to the module's own.
 */
function classesIn(css: string): { local: Set<string>; global: Set<string> } {
  const local = new Set<string>()
  const global = new Set<string>()
  const src = stripComments(css)
  const CLASS = /\.(-?[A-Za-z_][\w-]*)/g

  let prev = -1
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch !== '{' && ch !== '}') continue
    if (ch === '}') {
      prev = i
      continue
    }
    let selector = src.slice(prev + 1, i)
    prev = i
    if (selector.trimStart().startsWith('@')) continue
    // `:global(.a .b)` — every class inside is global, and the span comes out
    // so the pass below doesn't also claim them as local.
    selector = selector.replace(/:global\s*\(([^)]*)\)/g, (_, inner: string) => {
      for (const m of inner.matchAll(CLASS)) global.add(m[1])
      return ' '
    })
    for (const m of selector.matchAll(CLASS)) local.add(m[1])
  }
  return { local, global }
}

/** module path → the classes it defines locally. */
const moduleClasses = new Map<string, Set<string>>()
/** Every class name reachable as a plain global. */
const globalClasses = new Set<string>()

for (const f of MODULES) {
  const { local, global } = classesIn(readFileSync(f, 'utf8'))
  moduleClasses.set(f, local)
  for (const g of global) globalClasses.add(g)
}
for (const f of GLOBAL_SHEETS)
  for (const g of classesIn(readFileSync(f, 'utf8')).local) globalClasses.add(g)

/**
 * What one code file does with the CSS modules it imports.
 *
 * `styles` is the usual name and not the only one — 88 files read
 * `PlayArea.module.css` as `shared`, and there are eight other aliases — so the
 * identifier is taken from the import statement rather than assumed.
 *
 * `dynamic` records `styles[…]`. A computed access names no class the scanner
 * can see (`styles[tileColor(code)]`), so a module read that way cannot be
 * checked for unread classes: everything in it is potentially reachable. That
 * is a real hole and it is the honest one — the alternative is a guard that
 * reports every tile color as dead.
 */
type Usage = { module: string; read: Set<string>; dynamic: boolean }

function usagesIn(file: string): Usage[] {
  const src = stripLineComments(stripComments(readFileSync(file, 'utf8')))
  // The import statements come OUT before the member scan. `import gridCursor
  // from '…/gridCursor.module.css'` otherwise reads as an access of
  // `gridCursor.module`, and the guard's first run reported nine of them.
  const body = src.replace(/^\s*import[^\n]*\n/gm, '')
  const out: Usage[] = []
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)) {
    const [, ident, spec] = m
    const modPath = resolve(dirname(file), spec)
    const read = new Set<string>()
    for (const a of body.matchAll(new RegExp(`\\b${ident}\\.([A-Za-z_]\\w*)`, 'g'))) read.add(a[1])
    out.push({ module: modPath, read, dynamic: new RegExp(`\\b${ident}\\s*\\[`).test(body) })
  }
  return out
}

const USAGES = new Map<string, Usage[]>()
for (const f of CODE_FILES) {
  const u = usagesIn(f)
  if (u.length) USAGES.set(f, u)
}

/**
 * Files with a known miss, waiting on the area that owns them.
 *
 * The same shrinking-allowlist rule the vocabulary guard uses
 * (plans/css-system-2.md §10): a listed path is silent, an unlisted one fails,
 * and a listed path that no longer misses has to leave the list. Every line
 * names the area that will clear it — a scoped pass never edits another game's
 * code, so finding these is where this guard's job ends.
 */
const MEMBER_PENDING: string[] = [
  // `styles.hint` — HintBar.module.css defines `.hintReady` and no `.hint`, so
  // the button's base class has been `undefined` for as long as the file has
  // read that way. → the `strands` area.
  'src/strands/components/HintBar.tsx',
]

const DEAD_CLASS_PENDING: string[] = [
  // `.clueLabel` — nothing reads it. → the `codenamesduet` area.
  'src/codenamesduet/components/CluePanel.module.css',
  // `.breakdown` + three siblings — the per-player breakdown they styled was
  // replaced (see that game's GameTurnLog). → the `setgame` area.
  'src/setgame/components/PlayArea.module.css',
  // `.good` / `.bad` — the slots take their colors elsewhere now. → the
  // `stackdown` area.
  'src/stackdown/components/WordEntry.module.css',
]

describe('a class name resolves — the module side', () => {
  it('every styles.x is a class the module defines', () => {
    const offenders: string[] = []
    const cleanPending = new Set(MEMBER_PENDING)
    for (const [file, usages] of USAGES)
      for (const u of usages) {
        const defined = moduleClasses.get(u.module)
        if (!defined) continue // import path didn't resolve; check 2 reports it
        const misses = [...u.read].filter((n) => !defined.has(n))
        if (!misses.length) continue
        if (MEMBER_PENDING.includes(rel(file))) {
          cleanPending.delete(rel(file))
          continue
        }
        for (const name of misses)
          offenders.push(`${rel(file)}  →  ${name}  (not in ${rel(u.module)})`)
      }

    expect(
      offenders,
      'A member of a CSS module that the module does not define. It resolves to ' +
        '`undefined`, `cls()` drops it, and the element renders without the ' +
        'class — silently.\n\n' +
        offenders.join('\n'),
    ).toEqual([])

    expect(
      [...cleanPending],
      `These paths are on the pending list but no longer miss — delete them ` +
        `from it:\n${[...cleanPending].join('\n')}`,
    ).toEqual([])
  })

  it('every class a module defines is read by someone', () => {
    /** Modules whose classes are reached by computed access somewhere. */
    const dynamic = new Set<string>()
    /** module → every name read off it, across all its importers. */
    const readByModule = new Map<string, Set<string>>()
    for (const usages of USAGES.values())
      for (const u of usages) {
        if (u.dynamic) dynamic.add(u.module)
        const seen = readByModule.get(u.module) ?? new Set<string>()
        for (const n of u.read) seen.add(n)
        readByModule.set(u.module, seen)
      }

    const offenders: string[] = []
    const cleanPending = new Set(DEAD_CLASS_PENDING)
    for (const [mod, defined] of moduleClasses) {
      if (dynamic.has(mod)) continue
      const read = readByModule.get(mod) ?? new Set<string>()
      const dead = [...defined].filter((c) => !read.has(c))
      if (!dead.length) continue
      if (DEAD_CLASS_PENDING.includes(rel(mod))) {
        cleanPending.delete(rel(mod))
        continue
      }
      offenders.push(`${rel(mod)}  →  ${dead.join(', ')}`)
    }

    expect(
      offenders,
      'A class defined in a CSS module that nothing reads — the rule outlived ' +
        'the markup it styled.\n\n' +
        offenders.join('\n'),
    ).toEqual([])

    expect(
      [...cleanPending],
      `These modules are on the pending list but no longer hold a dead class — ` +
        `delete them from it:\n${[...cleanPending].join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Class names written as plain strings — `cls('item-list', …)`,
 * `className="card"`. These are the global patterns and utilities, and a typo
 * in one is invisible: the class simply matches no rule.
 *
 * Only two shapes are read, both of which are class lists by definition: a
 * literal `className`, and a string argument inside a `cls(…)` call. Anything
 * else a string could be is not guessed at.
 */
function globalLiteralsIn(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*'([^']*)'\s*\})/g))
    out.push(...(m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean))
  // `cls(` to its matching paren, so a nested call or a ternary is included.
  for (const m of src.matchAll(/\bcls\(/g)) {
    let depth = 0
    let end = m.index!
    for (let i = m.index! + 3; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    // A literal in CLASS position only. `cls(styles.tile, outcome === 'won' &&
    // styles.won)` holds a string that is a comparison operand, not a class —
    // the guard's first run reported 33 of those and one real name would have
    // been lost in them. Both sides of the operator are dropped.
    const span = src
      .slice(m.index!, end)
      .replace(/[=!]==?\s*(['"])[^'"]*\1/g, ' ')
      .replace(/(['"])[^'"]*\1\s*[=!]==?/g, ' ')
    for (const s of span.matchAll(/'([^']*)'|"([^"]*)"/g))
      out.push(...(s[1] ?? s[2]).split(/\s+/).filter(Boolean))
  }
  return out
}

describe('a class name resolves — the global side', () => {
  it('every global class written as a string exists in a stylesheet', () => {
    const offenders: string[] = []
    for (const f of CODE_FILES) {
      if (!f.endsWith('.tsx')) continue
      const src = stripLineComments(stripComments(readFileSync(f, 'utf8')))
      for (const name of new Set(globalLiteralsIn(src)))
        if (!globalClasses.has(name)) offenders.push(`${rel(f)}  →  '${name}'`)
    }

    expect(
      offenders,
      'A class name written as a plain string that no global stylesheet ' +
        'defines. A module class must be read through its import, not typed ' +
        'out; a global one has to exist.\n\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})

/**
 * The e2e side, and it is the weakest of the four by necessity.
 *
 * A spec reaches a styled element through `[class*="boardCol"]`, because the
 * built class name carries a hash the spec cannot know. That is a SUBSTRING
 * match, so this can only ask whether any class anywhere contains the needle —
 * it cannot tell `[class*="tile"]` from `[class*="tileMissed"]`. It still
 * catches the case that brought it here: nothing in the app contains
 * "clubItem", and hasn't since the day the class was renamed.
 *
 * Leading and trailing underscores come off first: the built name is
 * `_<local>_<hash>`, so a spec pinning a whole segment writes `_button_`.
 */
const E2E_PENDING: string[] = []

describe('a class name resolves — the e2e side', () => {
  it('every [class*="…"] selector can match a class that exists', () => {
    const known = [...globalClasses, ...[...moduleClasses.values()].flatMap((s) => [...s])]
    const hits = (needle: string) => known.some((c) => c.includes(needle))
    const offenders: string[] = []
    const cleanPending = new Set(E2E_PENDING)

    for (const f of E2E_FILES) {
      const src = stripLineComments(stripComments(readFileSync(f, 'utf8')))
      const misses: string[] = []
      // A SELECTOR AT A TIME, not an attribute at a time. `[class*="keyboard"],
      // [class*="Keyboard"]` is one query with two alternatives and it finds
      // the element on the first — reading the attributes independently reports
      // the spare arm as broken. So: an alternative passes when EVERY needle in
      // it hits (they are a descendant chain), and the selector passes when ANY
      // alternative does.
      // The body excludes only the delimiter, because the selectors are
      // single-quoted with double quotes INSIDE — `'[class*="boardCol"]'`.
      for (const q of src.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) {
        const selector = q[2]
        if (!selector.includes('[class')) continue
        const alternatives = selector.split(',')
        const ok = alternatives.some((alt) => {
          const needles = [...alt.matchAll(/\[class[\^*$]?=["']([^"']+)["']\]/g)].map((m) =>
            m[1].replace(/^_+|_+$/g, ''),
          )
          return needles.length > 0 && needles.every((n) => !n || hits(n))
        })
        if (!ok) misses.push(selector)
      }
      if (!misses.length) continue
      if (E2E_PENDING.includes(rel(f))) {
        cleanPending.delete(rel(f))
        continue
      }
      offenders.push(`${rel(f)}  →  ${[...new Set(misses)].join(', ')}`)
    }

    expect(
      offenders,
      'An e2e selector naming a class that exists nowhere in the app. The spec ' +
        'will wait for an element that can never appear, and fail on a timeout ' +
        'that reads like flake.\n\n' +
        offenders.join('\n'),
    ).toEqual([])

    // The list SHRINKS, the same rule vocabularies.test.ts uses.
    expect(
      [...cleanPending],
      `These paths are on the e2e pending list but no longer miss — delete ` +
        `them from it:\n${[...cleanPending].join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Guard: what a CSS-module import is CALLED says where it came from.
 *
 * A file that imports two stylesheets has to name them apart, and every author
 * picked differently. The shared setup stylesheet was `styles` in eleven files,
 * `form` in three and `shared` in one, while the game's own module took whichever
 * word was left — so `styles.checkRow` meant the SHARED class in one file and a
 * local one in the next (plans/areas/forms.md → F42).
 *
 * Two rules, and both already held nearly everywhere before they were written
 * down. They are GUARDED rather than merely documented because that is the whole
 * difference between `--radius-md`, which rotted for months, and the colour
 * vocabulary, which did not: ship the check with the name.
 */
describe('a CSS-module import is named for where it comes from', () => {
  // The second check here was "the shared setup stylesheet is imported as
  // `form`". It went on 2026-08-26 WITH ITS SUBJECT: setupForm.module.css was
  // deleted once every rule in it had moved to the component that draws it —
  // the radio row to <RadioRow>, the help text to <Field> and <SetupSection>,
  // the form's column to <SetupGameModal>. A guard whose subject no longer
  // exists is not a guard; the rule it enforced is now unenforceable because it
  // is unbreakable.
  /** Same-directory imports only — `./X.module.css`. A basename match is not
   *  enough: every game's `PlayArea.tsx` imports BOTH its own `./PlayArea.module.css`
   *  as `styles` and `common/components/game/PlayArea.module.css` as `shared`,
   *  which is the convention working, not breaking it. */
  const IMPORT = /^import (\w+) from '\.\/([A-Za-z]+)\.module\.css'$/gm

  /**
   * A module named after the importing file is that file's OWN, and is always
   * `styles`. This is the one that caught F42: four setup forms called the
   * SHARED sheet `styles` and their own `local`, which inverts what every other
   * file in the repo means by the word.
   *
   * Importing somebody else's module as `styles` is fine when it is the only one
   * a file imports — `HandCard` reads `PlayerBoard.module.css` and there is
   * nothing to confuse it with. The ambiguity needs two sheets to exist.
   */
  it("a file's OWN module is imported as `styles`", () => {
    const offenders: string[] = []
    for (const f of CODE_FILES) {
      const base = f.split('/').pop()!.replace(/\.tsx?$/, '')
      for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
        const [, binding, sheet] = m
        if (sheet === base && binding !== 'styles') {
          offenders.push(
            `${rel(f)}  imports its OWN ${sheet}.module.css as \`${binding}\` — call it \`styles\``,
          )
        }
      }
    }
    expect(
      offenders,
      `\`styles\` means "this file's own classes" in 171 other files. A file that ` +
        `uses it for something else makes every reader check:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

})
