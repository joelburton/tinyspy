// cs-unmet

/**
 * CSS structural baseline — how much CSS there is, where it lives, and how much
 * of it holds a color VALUE rather than a reference.
 *
 *     node scripts/css-baseline.mjs
 *
 * Written for the css-system sprint (plans/css-system.md → §2 Acceptance tests),
 * whose whole premise is that the duplication is invisible from inside any one
 * file and only shows from a whole-tree vantage point. Re-run it after each
 * surface converts; the numbers in the plan's roster come from here.
 *
 * NOT a second color census. `scripts/color-census.py` answers a different
 * question — which colors are perceptual lookalikes of each other (oklab
 * distance), so a duplicate can be spotted. This one answers "how much, and
 * where". Neither subsumes the other; if their hex counts ever disagree, one of
 * them has a parsing bug.
 *
 * Parsing deliberately mirrors `src/guards/cssTokens.test.ts` — same walk, same
 * comment stripping, same COLOR regex — so these numbers are directly comparable
 * with what the guard already enforces rather than being a second opinion about
 * what counts as a color.
 *
 * Two counts worth understanding before quoting them:
 *
 * - **rules** are selector blocks, so `@media`/`@keyframes` wrappers are
 *   subtracted: they open a brace without being a rule.
 * - **declarations** are `prop: value` pairs, split on `[;{}]` rather than by
 *   line, because a value legitimately wraps across lines. Comment density in
 *   this repo would drown a line count, which is why the plan measures rules and
 *   declarations instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

function walk(dir, exts) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/
const HEX = /#[0-9a-fA-F]{3,8}\b/g

/**
 * Which surface a file belongs to — a game name, or a common sub-area. The
 * grouping matches the plan's roster (§9), so its rows can be filled straight
 * from this output.
 */
function surfaceOf(rel) {
  const parts = rel.split('/') // src/<top>/...
  if (parts[1] !== 'common') return parts[1]
  return parts[2] === 'components' ? `common/${parts[3]}` : 'common (root)'
}

// An SVG data-URI carries %23rrggbb — a color inside a URL, not a declaration
// of one. The guard strips url() for the same reason.
const clean = (raw) => stripComments(raw).replace(/url\([^)]*\)/g, 'url()')

const rows = []
const hexUses = new Map()
const files = walk(SRC, ['.css'])

for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  const css = clean(raw)
  const rel = relative(ROOT, f)

  const braces = (css.match(/\{/g) || []).length
  const wrappers = (css.match(/@(media|supports|keyframes|container|layer)[^{]*\{/g) || []).length

  let decls = 0
  let tokenDefs = 0
  let holdsValue = 0
  let holdsRef = 0
  for (const chunk of css.split(/[;{}]/)) {
    const i = chunk.indexOf(':')
    if (i < 0) continue
    const prop = chunk.slice(0, i).trim()
    const value = chunk.slice(i + 1).trim()
    if (!prop || /\s/.test(prop) || prop.startsWith('@') || !value) continue
    decls++
    if (!prop.startsWith('--')) continue
    tokenDefs++
    if (COLOR.test(value)) holdsValue++
    else if (/var\(--/.test(value)) holdsRef++
  }

  const hexes = (css.match(HEX) || []).map((h) => h.toLowerCase())
  for (const h of hexes) hexUses.set(h, (hexUses.get(h) || 0) + 1)

  rows.push({
    rel,
    surface: surfaceOf(rel),
    lines: raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0),
    rules: braces - wrappers,
    decls,
    tokenDefs,
    holdsValue,
    holdsRef,
    hexes: new Set(hexes),
  })
}

const total = (k) => rows.reduce((a, r) => a + r[k], 0)
const pad = (n, w = 6) => String(n).padStart(w)

console.log('## Totals\n')
console.log(`css files            ${pad(rows.length)}`)
console.log(`lines                ${pad(total('lines'))}`)
console.log(`rules                ${pad(total('rules'))}`)
console.log(`declarations         ${pad(total('decls'))}`)
console.log(`token definitions    ${pad(total('tokenDefs'))}`)
console.log(`  holding a VALUE    ${pad(total('holdsValue'))}   → the palette layer's raw material`)
console.log(`  holding a REF      ${pad(total('holdsRef'))}   → already correctly shaped`)
console.log(`distinct hexes       ${pad(hexUses.size)}`)
console.log(`  used exactly once  ${pad([...hexUses.values()].filter((n) => n === 1).length)}`)
console.log(`files holding a hex  ${pad(rows.filter((r) => r.hexes.size).length)}`)

console.log('\n## By file kind\n')
const kinds = [
  ['*.module.css', (r) => r.rel.endsWith('.module.css')],
  ['theme.css', (r) => r.rel.endsWith('theme.css')],
  ['other', (r) => !r.rel.endsWith('.module.css') && !r.rel.endsWith('theme.css')],
]
for (const [name, pick] of kinds) {
  const g = rows.filter(pick)
  const s = (k) => g.reduce((a, r) => a + r[k], 0)
  console.log(`${name.padEnd(14)} ${pad(g.length, 4)} files ${pad(s('lines'))} lines ${pad(s('rules'), 5)} rules ${pad(s('decls'), 5)} decls`)
}

console.log('\n## By surface\n')
console.log('| surface | files | lines | rules | decls | tokens | hexes |')
console.log('|---|---:|---:|---:|---:|---:|---:|')
const bySurface = new Map()
for (const r of rows) {
  const s =
    bySurface.get(r.surface) ||
    { files: 0, lines: 0, rules: 0, decls: 0, tokenDefs: 0, hexes: new Set() }
  s.files++
  for (const k of ['lines', 'rules', 'decls', 'tokenDefs']) s[k] += r[k]
  for (const h of r.hexes) s.hexes.add(h)
  bySurface.set(r.surface, s)
}
for (const [name, s] of [...bySurface].sort((a, b) => b[1].lines - a[1].lines))
  console.log(`| ${name} | ${s.files} | ${s.lines} | ${s.rules} | ${s.decls} | ${s.tokenDefs} | ${s.hexes.size} |`)

// ── Purpose classification (plans/css-system.md §4.1) ───────────────────────
// The value-kind split above is mechanical. This is the one that took judgment:
// what each token is FOR. Six buckets, not the four the plan first named.
const GAMES = readdirSync(SRC).filter(
  (d) => statSync(join(SRC, d)).isDirectory() && d !== 'common' && d !== 'guards',
)
const gameOf = (prop) => GAMES.find((g) => prop.startsWith(`--${g}-`)) || null
const inCommon = (rel) => rel.includes('/common/')

const all = []
for (const f of files) {
  const css = clean(readFileSync(f, 'utf8'))
  const rel = relative(ROOT, f)
  for (const chunk of css.split(/[;{}]/)) {
    const i = chunk.indexOf(':')
    if (i < 0) continue
    const prop = chunk.slice(0, i).trim()
    const value = chunk.slice(i + 1).trim()
    if (!prop.startsWith('--') || !value) continue
    all.push({ prop, value, rel, game: gameOf(prop), isColor: COLOR.test(value) })
  }
}
const commonOwned = new Set(all.filter((d) => inCommon(d.rel)).map((d) => d.prop))

console.log('\n## §4.5 audit — every color VALUE, by where it lives\n')
const V = all.filter((d) => d.isColor)
const cat = {
  'game-prefixed, in its own game   (correct)': V.filter((d) => d.game && !inCommon(d.rel)),
  'game-prefixed, but in COMMON     (r1)': V.filter((d) => d.game && inCommon(d.rel)),
  'shared name, in common           (the palette)': V.filter((d) => !d.game && inCommon(d.rel)),
  'shared name, in a GAME file      (breaks the rule)': V.filter((d) => !d.game && !inCommon(d.rel)),
}
for (const [name, g] of Object.entries(cat)) {
  console.log(`${pad(g.length, 4)}  ${name}`)
  if (name.startsWith('game-prefixed, but') || name.startsWith('shared name, in a GAME'))
    for (const d of g) console.log(`        ${d.prop}  ${d.rel}`)
}

// A name assigned in a game file that neither the game nor common owns.
const unowned = new Set(
  all.filter((d) => !inCommon(d.rel) && !d.game && !commonOwned.has(d.prop)).map((d) => d.prop),
)
const readInCommon = new Set()
for (const f of walk(SRC, ['.css', '.ts', '.tsx'])) {
  if (/\.test\.tsx?$/.test(f)) continue
  if (!inCommon(relative(ROOT, f))) continue
  for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g))
    if (unowned.has(m[1])) readInCommon.add(m[1])
}
console.log('\n## Contract slots — common READS, a game FILLS, NOBODY declares\n')
console.log(`${pad(readInCommon.size, 4)}  unowned names that common reads. A game that forgets one`)
console.log('      kills the whole declaration, silently — the --info-col-width failure mode.\n')
for (const p of [...readInCommon].sort()) console.log(`      ${p}`)
console.log(`\n${pad(unowned.size - readInCommon.size, 4)}  read only inside their own game — local math, not tokens`)

console.log('\n## Files holding a hex\n')
for (const r of rows.filter((r) => r.hexes.size).sort((a, b) => b.hexes.size - a.hexes.size))
  console.log(`${pad(r.hexes.size, 4)}  ${r.rel}`)

console.log('\n## Hexes written more than once\n')
for (const [h, n] of [...hexUses].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]))
  console.log(`${pad(n, 4)}  ${h}`)
