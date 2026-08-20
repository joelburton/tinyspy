/**
 * Token snapshot — what every shared token RESOLVES TO, in a real browser.
 *
 *     node scripts/css-token-snapshot.mjs before.json      # capture
 *     node scripts/css-token-snapshot.mjs after.json before.json   # capture + diff
 *
 * This is the acceptance instrument for the css-system sprint's step 3
 * (plans/css-system.md → §4.3), whose exit criterion is **nothing looks
 * different**. Restructuring 561 token definitions across new files is exactly
 * the kind of change that is impossible to eyeball and trivial to get subtly
 * wrong, so the check is mechanical: resolve every token before, resolve every
 * token after, and require the two lists to be identical.
 *
 * ── Why a browser, and not a reimplementation ─────────────────────────────
 *
 * The sprint replaces frozen hexes with derivations — `color-mix(in srgb, …)`,
 * `oklch(…)`, chains of `var()` several links long. Recomputing those in Node
 * means writing a second oklab implementation and trusting it to round the same
 * way Chrome does, which is precisely the thing under test. `getComputedStyle`
 * is the browser telling us what it will actually paint.
 *
 * ── How a token is probed ─────────────────────────────────────────────────
 *
 * `getComputedStyle(el).getPropertyValue('--x')` is no use here: for an
 * unregistered custom property it hands back the token's TEXT, not its resolved
 * value — `var(--gray-98)` rather than `rgb(250, 250, 250)`. So each token is
 * substituted into five real properties at once and all five computed values are
 * read back:
 *
 *   color                a color token resolves here
 *   width                a length (radii, sizes, the page padding)
 *   box-shadow           the elevation family
 *   opacity              --chrome-disabled-opacity
 *   transition-duration  the feedback timings
 *
 * A token parses as at most one of those; the other four fall back to their
 * initial value, identically before and after. So the five together are a stable
 * FINGERPRINT — and a token that stops resolving at all (the silent-failure
 * landmine of §6.1: an undefined custom property invalidates the whole
 * declaration) shows up as every field reverting to initial, which is a diff.
 *
 * ── Scope ────────────────────────────────────────────────────────────────
 *
 * Tokens defined under `src/common/` only. A game's own tokens ship in that
 * game's lazy chunk (§6.1) and are simply not present on the page this loads, so
 * including them would record fifteen false "unresolved"s. Widen the scope when
 * a game converts — pass its route and re-run.
 *
 * Needs the dev server up (`npm run dev`); it does not start one, because
 * killing and restarting vite around a render is its own class of flake.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = process.cwd()
const URL = process.env.SNAPSHOT_URL ?? 'http://localhost:5173/'

const [outPath, comparePath] = process.argv.slice(2)
if (!outPath) {
  console.error('usage: node scripts/css-token-snapshot.mjs <out.json> [compare-to.json]')
  process.exit(2)
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.css')) out.push(p)
  }
  return out
}

/**
 * Every token DEFINED under src/common/. The regex deliberately matches the
 * widened name shape from §3.1 (`--[a-zA-Z0-9_-]+`) — a camelCased or
 * underscored token must be visible here, or the snapshot would quietly skip
 * exactly the names the new convention introduces.
 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const names = new Set()
for (const file of walk(join(ROOT, 'src', 'common'))) {
  const text = strip(readFileSync(file, 'utf8'))
  for (const m of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
    // `--_name` is private to one file (§3.1) and is not a shared contract;
    // it also may not be in scope on :root, so probing it would record noise.
    if (!m[1].startsWith('--_')) names.add(m[1])
  }
}
const tokens = [...names].sort()

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })

const resolved = await page.evaluate((list) => {
  const out = {}
  for (const name of list) {
    // A FRESH element per token, which is not tidiness — it is the fix for a
    // real flake. `transition-duration: var(--x)` is a live transition when the
    // token holds a time, so re-using one element makes the NEXT token's color
    // interpolate away from the previous one's, and getComputedStyle faithfully
    // reports the half-way value. (Measured: --mark-attention-flash-duration
    // came back wearing the attention yellow, inherited from the token sorted
    // before it.) A newly inserted element has no previous style to transition
    // from, so nothing animates.
    const probe = document.createElement('div')
    probe.style.cssText =
      `position:absolute;visibility:hidden;` +
      `color:var(${name});width:var(${name});box-shadow:var(${name});` +
      `opacity:var(${name});transition-duration:var(${name})`
    // Off-screen but IN the document — a detached element has no computed style.
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    out[name] = [cs.color, cs.width, cs.boxShadow, cs.opacity, cs.transitionDuration].join(' | ')
    probe.remove()
  }
  return out
}, tokens)

await browser.close()

writeFileSync(outPath, JSON.stringify(resolved, null, 1) + '\n')
console.log(`${tokens.length} tokens probed at ${URL} → ${relative(ROOT, outPath)}`)

if (!comparePath) process.exit(0)

const before = JSON.parse(readFileSync(comparePath, 'utf8'))
const gone = Object.keys(before).filter((k) => !(k in resolved))
const added = Object.keys(resolved).filter((k) => !(k in before))
const moved = Object.keys(resolved).filter((k) => k in before && before[k] !== resolved[k])

for (const k of gone) console.log(`GONE   ${k}`)
for (const k of added) console.log(`ADDED  ${k}   ${resolved[k]}`)
for (const k of moved) console.log(`MOVED  ${k}\n         was ${before[k]}\n         now ${resolved[k]}`)

console.log(
  `\n${gone.length} gone · ${added.length} added · ${moved.length} MOVED` +
    (moved.length ? '  ← every one of these is a pixel that changed' : '  ← nothing looks different'),
)
process.exit(moved.length ? 1 : 0)
