// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: every `var(--token)` reference resolves to a token we actually
 * define somewhere.
 *
 * We own the entire CSS custom-property namespace, so a reference to an
 * undefined token is always a bug — a typo or a rename that didn't land
 * everywhere. The convention is therefore **no `var()` fallbacks**: a
 * fallback can only mask exactly this bug (and silently drift out of sync
 * with the real token), so we strip them and let this test be the safety
 * net instead. It's the build-time version of "paint missing tokens
 * obnoxious pink" — it fails CI before the bug can ship.
 *
 * A token counts as DEFINED if it's declared in any stylesheet (`--x:`)
 * or set inline from a component (a quoted `'--x'` style key in a .tsx —
 * e.g. the wordle reveal animation's `--reveal-bg`). Tokens whose names
 * are built dynamically (`var(--member-${name}-fill-color)`) are matched by
 * prefix.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

// Strip comments so a token mentioned in prose (e.g. theme.css's own
// "reference them via var(--token-name)" doc) isn't read as a real ref.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

/**
 * Parse the whole tree once: where each token is DEFINED, and where each is
 * REFERENCED. Both guards below read the same two maps from opposite ends —
 * that symmetry is the point, so a token can't be "defined" by one rule and
 * "referenced" by an incompatible one.
 */
function scanTokens() {
  const cssFiles = walk(SRC, ['.css'])
  const codeFiles = walk(SRC, ['.tsx', '.ts']).filter((f) => !f.endsWith('.test.ts'))

  // name → first file that defines it (for a useful failure message).
  //
  // TOKEN spells what may appear in a custom-property name, and it is wider than
  // it looks like it should be — do not narrow it back to [a-z0-9-]:
  //
  //   UPPERCASE  a multi-word part is camelCased (--mark-gameOver-dim-color),
  //              matching the 345 camelCase class names already in src/. CSS
  //              custom properties are case-SENSITIVE, unlike the rest of CSS,
  //              which is what makes that a stable name rather than a typo.
  //   UNDERSCORE a leading --_ marks a name private to one file
  //              (--_cardGap), the CSS answer to a local variable.
  //
  // Both conventions are plans/css-system-2.md §5. A narrower class does not
  // reject them — it makes them INVISIBLE here, so a typo'd --_crdGap would
  // never fail this guard. That is the failure mode to protect against.
  const TOKEN = String.raw`--[a-zA-Z0-9_-]+`
  const defined = new Map<string, string>()
  const define = (name: string, f: string) => {
    if (!defined.has(name)) defined.set(name, rel(f))
  }
  // Declared in a stylesheet.
  for (const f of cssFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(new RegExp(`(${TOKEN})\\s*:`, 'g')))
      define(m[1], f)
  // Set inline from a component (quoted style key).
  for (const f of codeFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(new RegExp(`['\"](${TOKEN})['\"]`, 'g')))
      define(m[1], f)

  // name → first file that reads it via var().
  const refs = new Map<string, string>()
  for (const f of [...cssFiles, ...codeFiles])
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(new RegExp(`var\\(\\s*(${TOKEN})`, 'g')))
      if (!refs.has(m[1])) refs.set(m[1], rel(f))

  /**
   * Token names BUILT BY INTERPOLATION — `var(--tile-${n}-fill-color)`.
   *
   * Captured as the pair around the hole (prefix `--tile-`, suffix
   * `-fill-color`) rather than as a prefix alone, and that is the whole point
   * of this pass. The prefix on its own vouches for far too much: `--tile-` is
   * happily satisfied by `--tile-slot-ink-color`, so a stale
   * `var(--tile-${n}-color)` — the exact shape a 2026-08-20 rename left behind
   * in stackdown — passed every guard here while painting nothing, because an
   * undefined custom property invalidates its declaration in silence. Stackdown's
   * tiles were transparent in both themes and it took someone opening the game
   * on a dark page to see it.
   *
   * With both ends, the reference is checkable: SOME defined token must match
   * `prefix + one segment + suffix`. That is as strong as this can get without
   * knowing the interpolation's domain, and it is strong enough — it is what
   * distinguishes `--tile-<n>-fill-color` from `--tile-<n>-color`.
   */
  const dynamic: { prefix: string; suffix: string; file: string }[] = []
  for (const f of codeFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(
      /var\(\s*(--[a-zA-Z0-9_-]*)\$\{[^}]*\}([a-zA-Z0-9_-]*)\s*\)/g,
    ))
      dynamic.push({ prefix: m[1], suffix: m[2], file: rel(f) })

  return { defined, refs, dynamic }
}

describe('CSS custom-property tokens', () => {
  it('every var(--token) reference is defined (no phantom tokens)', () => {
    const { defined, refs } = scanTokens()

    const isDefined = (name: string) =>
      defined.has(name) ||
      // dynamic name like `var(--member-${x}-fill-color)` → captured as the
      // trailing-dash prefix; OK if any defined token extends it.
      (name.endsWith('-') && [...defined.keys()].some((d) => d.startsWith(name)))

    const phantom = [...refs.entries()]
      .filter(([name]) => !isDefined(name))
      .map(([name, file]) => `${name}  (first seen in ${file})`)

    expect(phantom, `Undefined CSS token(s) referenced via var():\n${phantom.join('\n')}`).toEqual(
      [],
    )
  })

  it('every interpolated var(--x-${…}-y) can name a real token', () => {
    const { defined, dynamic } = scanTokens()

    const broken = dynamic
      .filter(({ prefix, suffix }) => {
        const shape = new RegExp(
          `^${prefix.replace(/-/g, '\\-')}[a-zA-Z0-9]+${suffix.replace(/-/g, '\\-')}$`,
        )
        return ![...defined.keys()].some((d) => shape.test(d))
      })
      .map(({ prefix, suffix, file }) => `${prefix}\${…}${suffix}  (in ${file})`)

    expect(
      broken,
      `A token name built by interpolation that no defined token can match. The ` +
        `usual cause is a rename that moved the literal names and left the ` +
        `template behind — nothing fails at runtime, the declaration just stops ` +
        `painting:\n${broken.join('\n')}`,
    ).toEqual([])
  })

  /**
   * Tokens declared AHEAD of their first reader, which the dead-token guard
   * below would otherwise fail on.
   *
   * The CSS sprint lands a vocabulary as a whole ramp and then converts
   * surfaces to it area by area (plans/css-system-2.md §6.6), so for a while
   * most of a ramp has nowhere reading it. The alternative — parking the
   * scale in a comment until someone needs a step — is worse than it sounds:
   * a commented token is invisible to every instrument we own. This guard,
   * the phantom guard, the palette page and scripts/css-token-snapshot.mjs
   * all read declarations, and none of them reads a comment. A ramp is also
   * ONE decision rather than five; declaring `-2` alone invites the other
   * four being re-argued at every area.
   *
   * So the debt is written down instead, and it is checked from both sides:
   * a name here must still exist, and a name here must still be unread. The
   * list empties two ways — an area converting a value to the token, or
   * /palette growing a row that shows the ramp doing its job.
   *
   * IT IS NOT A PLACE TO PUT A TOKEN YOU ARE UNSURE OF. Everything on it is
   * a step in a ramp whose other steps are in use; a one-off with no reader
   * is just dead, and the guard below should say so.
   */
  const DECLARED_AHEAD = [
    // The spacer ramp. Four of its five steps are read now — `--spacer-2` by
    // the homepage's card gap, the rest by the font page, which is the first
    // surface written after the ramp existed and so is the first that could
    // simply use it.
    '--font-size-1',
    '--font-size-2',
    '--line-height-1',
    '--line-height-2',
    '--opacity-1',
    '--opacity-2',
    '--transition-duration-nudge',
    '--transition-duration-travel',
    '--letter-spacing-label',
    '--letter-spacing-wide',
    '--border-width-frame',

    // The two text grays the ramp was missing. The other two —
    // `--page-text-color` and `--page-text-muted-color` — are read everywhere
    // and keep the names they have.
    '--page-text-label-color',
    '--page-text-strong-color',

    // The z- ladder (base.css → THE Z- LAYERS). Almost all of it is LIVE now —
    // the floating panels resolve their tier from their family, and the menu,
    // toasts, tooltips, the definition popover and the info sheet all read a
    // rung directly. What is left is the BOARD's three, which arrive when the
    // games convert: a board's own stacking is still local 0–5 today, and
    // `--z-board` graduating to a reader is the signal that boards became
    // sealed.
    '--z-board',
    '--z-board-question',
    '--z-ghost',
  ]

  /**
   * The MIRROR of the guard above, and the one that catches the bug the other
   * can't see: a token defined and then never read. It costs nothing at runtime
   * (an unused custom property just sits there), which is exactly why these rot
   * silently — a 2026-07-13 CSS audit hand-found four, three of them carrying
   * comments that described them as in use.
   *
   * **A reserved cell in a color family is not dead**, and it no longer needs an
   * exception here to prove it. A family is picked at one sitting by one formula,
   * including the cells nothing consumes yet, and
   * `common/components/palette/palette.ts` reads every one of them — so the
   * palette page is the reader, and this guard keeps its teeth everywhere else.
   * That replaced a hand-maintained allow-list, which had to argue its own case
   * in a paragraph and got argued with anyway.
   *
   * Anything else with no reader is dead: delete the declaration AND whatever
   * comment claims it's live.
   */
  it('every defined token is referenced (no dead tokens)', () => {
    const { defined, refs } = scanTokens()

    // The declared-ahead list, and both of its arms fail — see the block
    // comment above it.
    const ahead = new Set(DECLARED_AHEAD)

    // A ref whose name was built dynamically (`var(--member-${x}-fill-color)`) is
    // captured as its trailing-dash prefix, so it vouches for every token that
    // extends it — the same rule the forward guard uses, read the other way.
    const dynamicPrefixes = [...refs.keys()].filter((r) => r.endsWith('-'))
    const isReferenced = (name: string) =>
      refs.has(name) || dynamicPrefixes.some((p) => name.startsWith(p))

    const dead = [...defined.entries()]
      .filter(([name]) => !isReferenced(name) && !ahead.has(name))
      .map(([name, file]) => `${name}  (defined in ${file})`)

    expect(
      dead,
      `Defined but never read via var() — delete them. If the token is a reserved cell in a ` +
        `color family, it belongs on the palette page (common/components/palette/palette.ts), ` +
        `which is what keeps it alive:\n${dead.join('\n')}`,
    ).toEqual([])

    // ARM 1: a name on the list must still EXIST. This is what stops the list
    // from becoming a graveyard of misspellings that excuse nothing.
    const phantomAhead = [...ahead].filter((name) => !defined.has(name)).sort()
    expect(
      phantomAhead,
      `On the declared-ahead list but not defined anywhere. Either the token was ` +
        `renamed and the list wasn't, or it was deleted and the line should go ` +
        `with it:\n${phantomAhead.join('\n')}`,
    ).toEqual([])

    // ARM 2: the list SHRINKS. A token that has found its first reader is an
    // ordinary live token, and leaving it here would quietly re-exempt it if
    // that reader ever went away.
    const arrived = [...ahead].filter((name) => isReferenced(name)).sort()
    expect(
      arrived,
      `These are read now, so they are no longer declared ahead of anything — ` +
        `delete them from DECLARED_AHEAD:\n${arrived.join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Guard: `.button` is the SHAPE, the treatment is the PAINT, and every button
 * says which treatment it wants.
 *
 * This is the class-layer twin of the token rule right below — both treatments
 * marked, no unmarked default — and it is a test because the first attempt got
 * it wrong in exactly the way the tokens had been wrong. `.button` carried the
 * shape AND the filled paint, so a button that said nothing silently meant
 * "primary": one name doing two jobs, which is what `-fill-color` was.
 *
 * Keeping the paint out of `.button` also removes a cascade dependency. When
 * both painted, `.secondary` only won because it came later in the file at equal
 * weight. Split, exactly one treatment rule matches and nothing overrides
 * anything.
 */
describe('button shape and treatment are separate', () => {
  const BUTTON_CSS = join(SRC, 'common/components/buttons/StandardButton.module.css')

  /** The declarations of a top-level rule in the module, by exact selector. */
  const ruleBody = (selector: string) => {
    const css = stripComments(readFileSync(BUTTON_CSS, 'utf8'))
    const m = new RegExp(`(^|\\})\\s*${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm').exec(css)
    expect(m, `StandardButton.module.css has no \`${selector}\` rule`).not.toBeNull()
    return m![2]
  }

  const PAINT = /(^|;)\s*(background|color|border-color)\s*:/

  it('.standardButton paints nothing — no background, color or border-color', () => {
    const body = ruleBody('.standardButton')
    const paints = body
      .split(';')
      .map((d) => d.trim())
      .filter((d) => PAINT.test(`;${d}`))
    expect(
      paints,
      `\`.standardButton\` is the SHAPE only. Color belongs to \`.primary\` / ` +
        `\`.secondary\`, or an unmarked button silently means one of them:\n${paints.join('\n')}`,
    ).toEqual([])
  })

  it('.primary and .secondary each paint background, border and label', () => {
    for (const treatment of ['.primary', '.secondary']) {
      const body = ruleBody(treatment)
      for (const prop of ['background', 'border-color', 'color']) {
        expect(
          new RegExp(`(^|;)\\s*${prop}\\s*:`).test(body),
          `\`${treatment}\` must declare ${prop} — a treatment paints the whole button, ` +
            `so neither one leaks into the other.`,
        ).toBe(true)
      }
    }
  })

  /**
   * The markup half, inverted by the move to a component. There is no longer a
   * global `.button` class for a call site to compose — `<StandardButton>` emits
   * the shape class and its treatment together, from a typed `weight` that has
   * no unmarked default. So the thing worth pinning is that the escape hatch
   * stayed shut: nothing outside the button's own folder writes those class
   * names by hand.
   *
   * `SubmitWithScore` is the one exception and is named here rather than
   * silently allowed — it wants the standard chrome with a different internal
   * layout, and what to do about that is scrabble's to decide
   * (docs/games/scrabble.md → Deferred).
   */
  it('nobody re-implements the button by hand-composing its classes', () => {
    const ALLOWED = ['common/components/buttons/']
    const offenders: string[] = []
    for (const f of walk(SRC, ['.tsx']).filter((f) => !f.endsWith('.test.tsx'))) {
      if (ALLOWED.some((a) => rel(f).includes(a))) continue
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/className=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*")/g)) {
        const expr = m[1]
        // A bare `button` / `primary` / `secondary` token in a class STRING —
        // not `type="button"`, and not a `styles.x` module class.
        if (!/['"`](?:[\w- ]*\s)?(?:button|primary|secondary)(?:\s[\w- ]*)?['"`]/.test(expr)) continue
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${rel(f)}:${line}  ${expr.replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
    expect(
      offenders,
      `These compose a button's classes by hand. Render \`<StandardButton>\` (or a ` +
        `purpose button) instead — the classes are its module's now:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('the color families are complete rectangles', () => {
  /**
   * Every family in a bucket carries every variant of that bucket, always,
   * whether or not anything reads the cell yet. The variant lists differ from
   * bucket to bucket — a button never needs a `bar`, an outcome never needs a
   * hover — but within a bucket the grid is rectangular.
   *
   * `base` is in both lists and is painted by nothing: it is the anchor each
   * family was designed from, and its siblings derive from IT rather than from
   * each other, so no formula silently inherits another's tweak.
   */
  const BUCKETS = [
    {
      bucket: 'button',
      families: ['normal', 'success', 'destructive', 'caution', 'quiet'],
      variants: [
        'base-color',
        'primary-color',
        'primary-hover-color',
        'primary-ink-color',
        'secondary-color',
        'secondary-hover-color',
      ],
      where: 'themes/daylight.css → BUTTON',
    },
    {
      bucket: 'outcomes',
      families: ['won', 'lost', 'near', 'warning', 'neutral', 'noted', 'error'],
      variants: [
        'base-color',
        'ink-color',
        'fill-color',
        'edge-color',
        'wash-color',
        'bar-color',
        'terminalFrame-color',
      ],
      where: 'themes/daylight.css → OUTCOMES',
    },
    {
      /**
       * The one family whose cells live in TWO files, which is why it is worth
       * guarding: the fills and edges are in fixed.css (exempt from theming —
       * everyone arrives already knowing that green), and the ink is in each
       * theme, because it is half of a contrast whose other half is the page.
       * A half-finished move would leave a kind with a fill and no ink, and
       * nothing else would notice.
       */
      bucket: 'wordle',
      families: ['green', 'yellow', 'gray'],
      variants: ['fill-color', 'edge-color', 'ink-color'],
      where: 'fixed.css for fill/edge, themes/*.css for ink',
    },
    {
      bucket: 'pill',
      families: ['won', 'lost', 'near', 'warning', 'neutral', 'noted', 'error'],
      variants: ['color', 'tint-color', 'ink-color'],
      where: 'themes/daylight.css → PILL',
    },
  ]

  for (const { bucket, families, variants, where } of BUCKETS) {
    it(`every ${bucket} family carries every variant`, () => {
      const { defined } = scanTokens()
      const missing = families.flatMap((f) =>
        variants.map((v) => `--${bucket}-${f}-${v}`).filter((t) => !defined.has(t)),
      )
      expect(
        missing,
        `A ${bucket} family is missing part of its rectangle. Every family carries ` +
          `every variant even with no reader — a family picked at one sitting is ` +
          `picked by one formula, where a value derived alone in two years drifts. ` +
          `Write it now, at ${where}:\n${missing.join('\n')}`,
      ).toEqual([])
    })
  }

  /**
   * `quiet` is the case that proves the rule above. It went two years as an
   * outline-only tone on the argument that "a filled quiet button would out-shout
   * its neighbour" — a claim about one USE, promoted into a fact about the
   * FAMILY, which then made `tone="quiet" weight="primary"` paint itself blue.
   * Nothing reads quiet's primary trio today. It is still written today.
   *
   * And the names say the TREATMENT (`primary` / `secondary`), never the paint.
   * "fill" named the property while pretending to name the axis, so `-fill-color`
   * and the `.primary` class were one idea spelled two ways. It is banned by name
   * here, because that is the rename that keeps coming back.
   */
  it('no button family token says "fill" — the axis is primary/secondary', () => {
    const { defined } = scanTokens()
    const named = [...defined.keys()].filter(
      (t) => t.startsWith('--button-') && t.includes('fill'),
    )
    expect(
      named,
      `"fill" names the property, not the axis — a button is primary or secondary ` +
        `and the property is always a background. Rename these:\n${named.join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Guard: a color may only appear in a custom-property DEFINITION.
 *
 * "No magic numbers, make a named constant", applied to color. A literal at a
 * use site can't be discussed, reused, or themed — and the exception set is much
 * smaller here than it is in code: `#fff` and `#000` look like primitives and
 * aren't (white is a decision; crosswords' grid used raw `#fff` / `#000` / `#333`
 * for three separate ones). Nor does "used once, so inline is fine" apply: a
 * second theme needs a PLACE to intervene, and a color with no name is a color
 * no theme can reach.
 *
 * It catches expressions too — a `color-mix()` at a use site is the same problem
 * wearing a function.
 *
 * It is necessary and not sufficient. `--crosswords-wrong: #d33` passes cleanly
 * and is exactly the drift the 2026-08-17 audit found: a machine can catch a
 * magic number, but only a person catches a bad name. The human half — brand, or
 * a UI color that belongs in common? — is asked per game as each converts
 * (docs/ui.md → The color system).
 */
/**
 * Guard: every THEME answers exactly the same roles.
 *
 * The rectangle guards above ask whether a token is defined *somewhere*, which
 * is the right question for a family and the wrong one for a theme. A role that
 * daylight defines and midnight forgets passes them cleanly — midnight is not
 * where they look — and then resolves to nothing at all on a dark page, where
 * an undefined custom property invalidates the whole declaration silently.
 *
 * It has to be nothing rather than something: the chain loads ONE theme
 * (common/themes/loadTheme.ts) precisely so a forgotten role fails loudly
 * instead of falling back to a plausible LIGHT hex. This test is what makes
 * "loudly" mean "before it ships".
 *
 * The check is set equality, in both directions. A token only midnight defines
 * is the same bug wearing the other hat: either it is a role, in which case
 * daylight owes an answer, or it is not, in which case it belongs in base.css
 * or fixed.css with everything else no theme touches.
 */
describe('the themes are in step', () => {
  const THEMES = ['daylight', 'midnight']

  /** The tokens a theme file defines, by name. */
  const rolesOf = (theme: string) => {
    const css = stripComments(readFileSync(join(SRC, `common/themes/${theme}.css`), 'utf8'))
    return new Set([...css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]))
  }

  /** Relative luminance of a `#rrggbb`, for ordering a ramp. */
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const chan = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255)
  }

  /**
   * The tile ramp runs LIGHTEST to DARKEST in every theme, and `spent` sits
   * below the whole of it.
   *
   * The numbers are an ORDINAL, and every consumer reads them as one — most
   * sharply stackdown, which maps covering-depth onto the ramp so the exposed
   * tile is 1 and the buried ones are 2, 3, 4. Midnight's first ramp ran the
   * other way, because it preserved "how far each shade sits from the page"
   * rather than "how dark each shade is" — two rules that agree in daylight and
   * are opposites on a dark page. The result lit the BOTTOM of a stack and left
   * the top in shadow.
   *
   * Deeper means less light reaches it. That is a fact about lighting, not about
   * the page, so it does not flip with the theme — and a theme is exactly where
   * someone would flip it by accident, which is why this is a test rather than a
   * sentence in a comment.
   */
  it('the tile ramp descends 1 → 5 in every theme, with spent below it', () => {
    for (const theme of THEMES) {
      const css = stripComments(readFileSync(join(SRC, `common/themes/${theme}.css`), 'utf8'))
      const hexOf = (name: string) => {
        const m = new RegExp(`--tile-${name}-fill-color:\\s*(#[0-9a-fA-F]{6})`).exec(css)
        expect(m, `${theme}.css has no --tile-${name}-fill-color literal`).not.toBeNull()
        return m![1]
      }
      const ramp = [1, 2, 3, 4, 5].map((n) => ({ n: String(n), lum: luminance(hexOf(String(n))) }))
      const descending = ramp.every((s, i) => i === 0 || s.lum < ramp[i - 1].lum)
      expect(
        descending,
        `${theme}.css: the tile ramp must run LIGHTEST (1) to DARKEST (5) — the ` +
          `numbers are an ordinal and stackdown reads them as covering-depth, so an ` +
          `inverted ramp lights the bottom of a stack. Luminances 1→5: ` +
          ramp.map((s) => s.lum.toFixed(4)).join(' '),
      ).toBe(true)
      expect(
        luminance(hexOf('spent')) < ramp[4].lum,
        `${theme}.css: \`spent\` must sit below shade 5 — it is the shade BEYOND the ` +
          `ramp, for a piece that is out of play.`,
      ).toBe(true)
    }
  })

  it('every theme defines exactly the same roles', () => {
    const [first, ...rest] = THEMES
    const base = rolesOf(first)
    for (const theme of rest) {
      const other = rolesOf(theme)
      const missing = [...base].filter((t) => !other.has(t)).sort()
      const extra = [...other].filter((t) => !base.has(t)).sort()
      expect(
        { missing, extra },
        `\`${theme}\` is out of step with \`${first}\`. A role one theme answers and ` +
          `another does not resolves to NOTHING under the second — the chain loads one ` +
          `theme, so there is no light value to fall back on.\n` +
          `missing from ${theme}:\n  ${missing.join('\n  ')}\n` +
          `only in ${theme}:\n  ${extra.join('\n  ')}`,
      ).toEqual({ missing: [], extra: [] })
    }
  })
})

describe('no unnamed colors', () => {
  // Values that carry no design decision, so naming them would be noise.
  const NO_DECISION = /^(transparent|currentColor|inherit|initial|unset|none)$/

  const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/

  it('every color literal or expression sits in a `--token:` definition', () => {
    const offenders: string[] = []
    for (const f of walk(SRC, ['.css'])) {
      const css = stripComments(readFileSync(f, 'utf8'))
        // An SVG data-URI carries %23rrggbb, which is a color inside a URL
        // rather than a declaration of one.
        .replace(/url\([^)]*\)/g, 'url()')
      // Declarations, not lines: a value legitimately wraps (connections' peer
      // border spans two).
      for (const chunk of css.split(/[;{}]/)) {
        const i = chunk.indexOf(':')
        if (i < 0) continue
        const prop = chunk.slice(0, i).trim()
        const value = chunk.slice(i + 1).trim()
        if (prop.startsWith('--')) continue
        if (NO_DECISION.test(value)) continue
        if (COLOR.test(value)) {
          offenders.push(`${rel(f)}  ${prop}: ${value.replace(/\s+/g, ' ').slice(0, 60)}`)
        }
      }
    }
    expect(
      offenders,
      `A color outside a custom-property definition. Name it — in the game's ` +
        `theme.css if it is a brand color, in common/theme.css if it isn't:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * And a COMPONENT may not hold a color value at all — only a reference.
   *
   * This is the blind spot of the rule above, stated as its own rule. `--x: #fff`
   * IS a custom-property definition, so it passes cleanly, and twelve boards used
   * exactly that shape to write a raw white into `--tile-slot-ink-color` while
   * `--ink-onDark-color` sat in theme.css meaning the same thing. The value had a
   * SLOT but no NAME, and a second theme could reach nine of the whites and not
   * the other twelve.
   *
   * So: values live in a `theme.css` — common's if the color is shared, the
   * game's if it is brand — and a `.module.css` references them. That is the
   * audit preference docs/ui.md → The color system states, made checkable now that
   * it is true everywhere but one deliberate exception.
   *
   * SHADOWS ARE NOT COLORS and are exempt: a shadow is a composite of geometry
   * and an alpha black, and the same doc says a component may keep its own where
   * it is close-but-not-equal to the shared one, with a note. The keyboard's two
   * are exactly that — a keycap sits closer to the page than a tile does, and
   * collapsing them onto the tile's would be the silent restyle the collapse rule
   * warns about.
   */
  const VALUE_IN_A_COMPONENT = new Set([
    // A layout-debugging affordance, transparent at rest, kept on purpose and
    // documented at the declaration. It is a knob rather than a color: the
    // whole point is to raise its alpha by hand while working on the column.
    '--board-col-debug-tint-color',
  ])

  it('a component module references colors, never holds one', () => {
    const offenders: string[] = []
    for (const f of walk(SRC, ['.css'])) {
      if (!f.endsWith('.module.css')) continue
      const css = stripComments(readFileSync(f, 'utf8')).replace(/url\([^)]*\)/g, 'url()')
      for (const chunk of css.split(/[;{}]/)) {
        const i = chunk.indexOf(':')
        if (i < 0) continue
        const prop = chunk.slice(0, i).trim()
        const value = chunk.slice(i + 1).trim()
        if (!prop.startsWith('--') || prop.endsWith('-shadow')) continue
        if (VALUE_IN_A_COMPONENT.has(prop)) continue
        if (COLOR.test(value)) offenders.push(`${rel(f)}  ${prop}: ${value.slice(0, 50)}`)
      }
    }
    expect(
      offenders,
      `A color VALUE in a component module. Move it to a theme.css and reference ` +
        `it — or, if the value already has a name there, use that name:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * And no `var()` may fall back to a COLOR.
   *
   * ui.md already forbids color fallbacks; this is what makes that true, and it
   * catches what the guard above structurally cannot: a fallback hiding INSIDE a
   * token definition, where the property starts with `--` and the rule above
   * looks away. A hex fallback drifts silently from the token it shadows (we
   * shipped `var(--color-text, #1a1a1b)` against a real `#1a1a1a`) and hides
   * where the value actually lives (wordle's keyboard had an unreachable one
   * masking three aliases, and the same missing token painted wordiply's keyboard
   * entirely from fallbacks).
   *
   * Deliberately COLOR-only. A size fallback can be legitimate — `--client-width`
   * is measured by JS and genuinely does not exist before the first paint, so
   * `var(--client-width, 100vw)` is the honest thing to write. The per-game knobs
   * with rem defaults are a different question (a default declaration and the
   * cascade would usually be better), and not this sweep's.
   */
  it('no var() falls back to a color', () => {
    const offenders: string[] = []
    for (const f of [...walk(SRC, ['.css']), ...walk(SRC, ['.tsx', '.ts'])]) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/var\(\s*--[a-zA-Z0-9_-]+\s*,([^)]*)\)/g)) {
        if (COLOR.test(m[1])) offenders.push(`${rel(f)}  ${m[0].slice(0, 70)}`)
      }
    }
    expect(
      offenders,
      `var() falling back to a color. Define the token instead — a fallback can ` +
        `only mask one of our own bugs:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * Guard: nothing may hand a DISABLED control a `cursor: pointer`.
   *
   * theme.css says `button:disabled { cursor: not-allowed }`, and that cursor is
   * load-bearing rather than cosmetic — the pointer changing is a large part of
   * how a disabled control announces itself, which is precisely why the fade is
   * allowed to be as gentle as 0.75 (docs/ui.md → "A disabled button still gets
   * a tooltip"). A `cursor: pointer` that out-ranks it takes that away, and the
   * button then looks pressable, does nothing, and explains nothing.
   *
   * The failure is pure specificity, so it is invisible in review: the global is
   * `button:disabled` at (0,1,1), and a bare module class at (0,1,0) loses to it
   * safely — but add an attribute or a second class and the rule quietly wins.
   * boggle's `.tile[role='button']` was exactly that at (0,2,1), a trap that
   * never fired only because boggle happens to guard its handler instead of
   * disabling the tile.
   *
   * So: any `cursor: pointer` rule at (0,1,1) or above must say `:not(:disabled)`
   * — cheap to write, and it makes the intent explicit at the site.
   */
  it('no `cursor: pointer` can out-rank the disabled cursor', () => {
    /** Approximate CSS specificity — enough to rank against (0,1,1). */
    const spec = (sel: string): [number, number, number] => {
      const s = sel.replace(/::[a-z-]+/g, '')
      const ids = (s.match(/(?<![\w-])#[\w-]+/g) ?? []).length
      let cls = (s.match(/\.[\w-]+/g) ?? []).length
      cls += (s.match(/\[[^\]]+\]/g) ?? []).length
      cls += (s.match(/:(?!not\b)(?!:)[a-z-]+/g) ?? []).length
      // `:not()` contributes the weight of its argument.
      for (const arg of s.match(/:not\(([^)]*)\)/g) ?? [])
        cls += (arg.match(/[.[:]/g) ?? []).length
      const els = (s.match(/(?<![\w.#\-[:])\b(button|a|div|span|input|td|tr|li|label|select|textarea)\b/g) ?? [])
        .length
      return [ids, cls, els]
    }
    const beatsGlobal = ([i, c, e]: [number, number, number]) =>
      i > 0 || c > 1 || (c === 1 && e >= 1)

    const offenders: string[] = []
    for (const f of walk(SRC, ['.css'])) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/cursor:\s*pointer/.test(m[2])) continue
        for (const one of m[1].split(',').map((x) => x.trim())) {
          if (!one || one.startsWith('@')) continue
          if (one.includes(':disabled')) continue
          if (beatsGlobal(spec(one))) offenders.push(`${rel(f)}  ${one}`)
        }
      }
    }
    expect(
      offenders,
      `\`cursor: pointer\` at a specificity that beats theme.css's ` +
        `\`button:disabled { cursor: not-allowed }\`. Add \`:not(:disabled)\` — a ` +
        `disabled control must not keep the clickable cursor:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Guard: a module never restyles a shared class app-wide.
 *
 * `:global()` is CSS-Modules syntax the build strips — `:global(.item-row)`
 * ships as plain `.item-row`. So a rule written inside `ClubPage.module.css`
 * can silently restyle the homepage, and nothing about where it sits suggests
 * that. The filename creates a false sense of containment.
 *
 * The rule is about the selector's SUBJECT — its rightmost compound, which is
 * the thing actually being styled:
 *
 *     :global(.item-row) { … }              subject global, unscoped   ✗ leaks
 *     .gamesList :global(.item-row) { … }   scoped by a local ancestor ✓
 *     :global(.dragging) .row { … }         subject is local           ✓
 *
 * The scoped form is legitimate and worth having — it also lands at (0,2,0),
 * so it beats a pattern's (0,1,0) on WEIGHT rather than on stylesheet load
 * order, which is what a bare local override quietly relies on today.
 *
 * Prefer a local class on the element even so: an override that sits on the
 * element it affects is visible next to everything else about that element,
 * and having to write it is useful friction — it makes you ask whether the
 * pattern wants a variant instead.
 */
describe('a module never restyles a shared class app-wide', () => {
  it('every `:global()` subject is scoped by a local class', () => {
    const offenders: string[] = []
    for (const f of walk(SRC, ['.css']).filter((f) => f.endsWith('.module.css'))) {
      const css = stripComments(readFileSync(f, 'utf8'))
      // Selector = everything before a `{` that isn't an at-rule or a
      // declaration. Good enough: we only need the ones mentioning :global.
      for (const m of css.matchAll(/(^|[}{;])\s*([^{}@;]*?)\s*\{/g)) {
        const selectorList = m[2]
        if (!selectorList.includes(':global')) continue
        for (const selector of selectorList.split(',').map((s) => s.trim())) {
          if (!selector.includes(':global')) continue
          // The SUBJECT is the last compound — split on descendant/child/
          // sibling combinators, outside of any parens.
          const compounds = selector.split(/\s*[>+~]\s*|\s+(?![^(]*\))/)
          const subject = compounds[compounds.length - 1] ?? ''
          if (!subject.includes(':global')) continue // subject is local — fine
          // Subject is global: require a local class somewhere to its left.
          const before = compounds.slice(0, -1).join(' ')
          const hasLocalAncestor = /\.[A-Za-z_][\w-]*/.test(
            before.replace(/:global\([^)]*\)/g, ''),
          )
          if (!hasLocalAncestor) {
            const line = css.slice(0, m.index).split('\n').length
            offenders.push(`${rel(f)}:${line}  ${selector}`)
          }
        }
      }
    }
    expect(
      offenders,
      `A \`:global()\` subject with no local ancestor is styled EVERYWHERE, not ` +
        `just on this surface — the module it sits in gives it no scope at all. ` +
        `Scope it (\`.myList :global(.item-row)\`) or, better, put a local class ` +
        `on the element:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
