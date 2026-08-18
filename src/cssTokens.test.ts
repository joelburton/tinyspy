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
 * are built dynamically (`var(--member-${name}-dot-color)`) are matched by
 * prefix.
 */

/**
 * The mirror guard below (`every defined token is referenced`) needs one
 * exception list, because a token can be deliberately defined ahead of its
 * first caller.
 *
 * **Vocabulary completeness.** `common/theme.css` lays the outcome colors out as
 * a GRID — each tier (won / lost / active / near / current / neutral) × each
 * role (`-bg` fill, `-border`, `-strong` legible-on-white) — and fills every
 * cell even where nothing consumes it yet. That's the point: a complete,
 * predictable grid tells the next contributor "there's already a color for
 * current / neutral — use it" instead of minting a new one. Same argument for
 * the `--tile-*` ramp's top border.
 *
 * This list IS that policy, made executable. A token here is a deliberate
 * vocabulary slot; a token that ISN'T here and has no `var()` reader is dead
 * code and this test says so. Adding a name here is a real decision — it means
 * "the vocabulary is incomplete without this," not "the test is annoying."
 */
const VOCABULARY_COMPLETENESS = new Set([
  // ONE policy, not a list of excuses: every OUTCOME family carries all five
  // variants (ink / fill / edge / wash / terminal-frame), because a family picked
  // all at once is picked by one formula — where a colour chosen alone in two
  // years would be reasoned about differently. So an outcome cell with no reader
  // is reserved by design; nothing else in the palette gets that licence.
  '--outcome-neutral-wash-color',
  '--outcome-neutral-ink-color',
  '--outcome-lost-wash-color',
  '--outcome-near-edge-color',
  '--outcome-warning-edge-color',
  '--outcome-neutral-edge-color',
  '--outcome-near-terminal-frame-color',
  '--outcome-warning-terminal-frame-color',
  // The CHROME tones used to need two entries here. They no longer do: every
  // tone now wires BOTH treatments through ActionButton.module.css, so all
  // twenty values have a reader. The policy they were claiming is enforced
  // directly instead — see "the chrome tones are complete" below.
  '--tile-4-edge-color',
])

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
  const defined = new Map<string, string>()
  const define = (name: string, f: string) => {
    if (!defined.has(name)) defined.set(name, rel(f))
  }
  // Declared in a stylesheet.
  for (const f of cssFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/(--[a-z0-9-]+)\s*:/g))
      define(m[1], f)
  // Set inline from a component (quoted style key).
  for (const f of codeFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/['"](--[a-z0-9-]+)['"]/g))
      define(m[1], f)

  // name → first file that reads it via var().
  const refs = new Map<string, string>()
  for (const f of [...cssFiles, ...codeFiles])
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/var\(\s*(--[a-z0-9-]+)/g))
      if (!refs.has(m[1])) refs.set(m[1], rel(f))

  return { defined, refs }
}

describe('CSS custom-property tokens', () => {
  it('every var(--token) reference is defined (no phantom tokens)', () => {
    const { defined, refs } = scanTokens()

    const isDefined = (name: string) =>
      defined.has(name) ||
      // dynamic name like `var(--member-${x}-dot-color)` → captured as the
      // trailing-dash prefix; OK if any defined token extends it.
      (name.endsWith('-') && [...defined.keys()].some((d) => d.startsWith(name)))

    const phantom = [...refs.entries()]
      .filter(([name]) => !isDefined(name))
      .map(([name, file]) => `${name}  (first seen in ${file})`)

    expect(phantom, `Undefined CSS token(s) referenced via var():\n${phantom.join('\n')}`).toEqual(
      [],
    )
  })

  /**
   * The MIRROR of the guard above, and the one that catches the bug the other
   * can't see: a token defined and then never read. It costs nothing at runtime
   * (an unused custom property just sits there), which is exactly why these rot
   * silently — a 2026-07-13 CSS audit hand-found four, three of them carrying
   * comments that described them as in use.
   *
   * Deliberate vocabulary slots go in VOCABULARY_COMPLETENESS above, and that
   * list is short on purpose. Anything else with no reader is dead: delete the
   * declaration AND whatever comment claims it's live.
   */
  it('every defined token is referenced (no dead tokens)', () => {
    const { defined, refs } = scanTokens()

    // A ref whose name was built dynamically (`var(--member-${x}-dot-color)`) is
    // captured as its trailing-dash prefix, so it vouches for every token that
    // extends it — the same rule the forward guard uses, read the other way.
    const dynamicPrefixes = [...refs.keys()].filter((r) => r.endsWith('-'))
    const isReferenced = (name: string) =>
      refs.has(name) || dynamicPrefixes.some((p) => name.startsWith(p))

    const dead = [...defined.entries()]
      .filter(([name]) => !isReferenced(name) && !VOCABULARY_COMPLETENESS.has(name))
      .map(([name, file]) => `${name}  (defined in ${file})`)

    expect(
      dead,
      `Defined but never read via var() — delete them, or add to VOCABULARY_COMPLETENESS if the ` +
        `slot is deliberate:\n${dead.join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Guard: the four chrome tones are a COMPLETE GRID, named for their treatment.
 *
 * Two decisions live here because prose couldn't hold them. Both were made, both
 * were written down in docs/colors-refinement.md, and both were then quietly
 * undone by a later pass that renamed its way past them — after which the doc got
 * a "superseded" banner to match the code rather than the code being brought back
 * to the decision. A test is the version of a decision that argues back.
 *
 * ONE — every tone carries all five values, whether or not anything reads them
 * yet. A family picked at one sitting is picked by one formula; a value derived
 * alone in two years, next to the button that happened to need it, is reasoned
 * about differently and drifts out of family. `quiet` is the case that proves it:
 * it went two years as an outline-only tone on the argument that "a filled quiet
 * button would out-shout its neighbour" — a claim about one USE, promoted into a
 * fact about the TONE, which then made `tone="quiet" weight="primary"` paint
 * itself action-blue. Nothing reads quiet's primary trio today. It is still
 * written today.
 *
 * TWO — the names say the TREATMENT (`primary` / `secondary`), never the paint.
 * "fill" named the property while pretending to name the axis, so `-fill-color`
 * and the `.primary` class were one idea spelled two ways. It is banned by name
 * here, because that is the rename that keeps coming back.
 */
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
  const THEME = join(SRC, 'common/theme.css')

  /** The declarations of a top-level rule in theme.css, by exact selector. */
  const ruleBody = (selector: string) => {
    const css = stripComments(readFileSync(THEME, 'utf8'))
    const m = new RegExp(`(^|\\})\\s*${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm').exec(css)
    expect(m, `theme.css has no \`${selector}\` rule`).not.toBeNull()
    return m![2]
  }

  const PAINT = /(^|;)\s*(background|color|border-color)\s*:/

  it('.button paints nothing — no background, colour or border-colour', () => {
    const body = ruleBody('.button')
    const paints = body
      .split(';')
      .map((d) => d.trim())
      .filter((d) => PAINT.test(`;${d}`))
    expect(
      paints,
      `\`.button\` is the SHAPE only. Colour belongs to \`.primary\` / \`.secondary\`, ` +
        `or an unmarked \`.button\` silently means one of them:\n${paints.join('\n')}`,
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
   * The markup half. `ActionButton` composes the class from its typed `weight`
   * (`'primary' | 'secondary'`), so the treatment is named by a variable rather
   * than a literal — accepted here, and better than a literal: add a third
   * weight and it arrives needing a class rather than defaulting into one.
   */
  it('every button carrying `.button` also names its treatment', () => {
    const offenders: string[] = []
    for (const f of walk(SRC, ['.tsx']).filter((f) => !f.endsWith('.test.tsx'))) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/className=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*")/g)) {
        const expr = m[1]
        // the `button` CLASS — a bare token in a string, not `type="button"`
        // and not a `styles.button` module class.
        if (!/['"`](?:[\w- ]*\s)?button(?:\s[\w- ]*)?['"`]/.test(expr)) continue
        if (/\bprimary\b|\bsecondary\b|\bweight\b/.test(expr)) continue
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${rel(f)}:${line}  ${expr.replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
    expect(
      offenders,
      `A \`.button\` with no treatment is a shape with no colour. Add \`primary\` ` +
        `(filled) or \`secondary\` (outline):\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('the chrome tones are complete', () => {
  const TONES = ['action', 'caution', 'destructive', 'quiet']
  const VALUES = [
    'primary-color',
    'primary-hover-color',
    'primary-ink-color',
    'secondary-color',
    'secondary-hover-color',
  ]

  it('every tone carries all five treatment values', () => {
    const { defined } = scanTokens()
    const missing = TONES.flatMap((tone) =>
      VALUES.map((v) => `--chrome-${tone}-${v}`).filter((t) => !defined.has(t)),
    )
    expect(
      missing,
      `A chrome tone is missing part of its family. Every tone carries all five ` +
        `values even with no reader — derive it now, from the primary, with the ` +
        `formula at theme.css → FIVE VALUES PER TONE:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('no chrome tone token says "fill" — the axis is primary/secondary', () => {
    const { defined } = scanTokens()
    const named = [...defined.keys()].filter((t) =>
      TONES.some((tone) => t.startsWith(`--chrome-${tone}-`) && t.includes('fill')),
    )
    expect(
      named,
      `"fill" names the property, not the axis — a button is primary or secondary ` +
        `and the property is always a background. Rename these:\n${named.join('\n')}`,
    ).toEqual([])
  })
})

/**
 * Guard: a colour may only appear in a custom-property DEFINITION.
 *
 * "No magic numbers, make a named constant", applied to colour. A literal at a
 * use site can't be discussed, reused, or themed — and the exception set is much
 * smaller here than it is in code: `#fff` and `#000` look like primitives and
 * aren't (white is a decision; crosswords' grid used raw `#fff` / `#000` / `#333`
 * for three separate ones). Nor does "used once, so inline is fine" apply: a
 * second theme needs a PLACE to intervene, and a colour with no name is a colour
 * no theme can reach.
 *
 * It catches expressions too — a `color-mix()` at a use site is the same problem
 * wearing a function.
 *
 * It is necessary and not sufficient. `--crosswords-wrong: #d33` passes cleanly
 * and is exactly the drift the 2026-08-17 audit found: a machine can catch a
 * magic number, but only a person catches a bad name. The human half — brand, or
 * a UI colour that belongs in common? — is asked per game as each converts
 * (docs/colors-refinement.md).
 */
describe('no unnamed colors', () => {
  // Values that carry no design decision, so naming them would be noise.
  const NO_DECISION = /^(transparent|currentColor|inherit|initial|unset|none)$/

  const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/

  it('every color literal or expression sits in a `--token:` definition', () => {
    const offenders: string[] = []
    for (const f of walk(SRC, ['.css'])) {
      const css = stripComments(readFileSync(f, 'utf8'))
        // An SVG data-URI carries %23rrggbb, which is a colour inside a URL
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
   * And no `var()` may fall back to a COLOR.
   *
   * ui.md already forbids colour fallbacks; this is what makes that true, and it
   * catches what the guard above structurally cannot: a fallback hiding INSIDE a
   * token definition, where the property starts with `--` and the rule above
   * looks away. A hex fallback drifts silently from the token it shadows (we
   * shipped `var(--color-text, #1a1a1b)` against a real `#1a1a1a`) and hides
   * where the value actually lives (wordle's keyboard had an unreachable one
   * masking three aliases, and the same missing token painted wordiply's keyboard
   * entirely from fallbacks).
   *
   * Deliberately COLOUR-only. A size fallback can be legitimate — `--client-width`
   * is measured by JS and genuinely does not exist before the first paint, so
   * `var(--client-width, 100vw)` is the honest thing to write. The per-game knobs
   * with rem defaults are a different question (a default declaration and the
   * cascade would usually be better), and not this sweep's.
   */
  it('no var() falls back to a color', () => {
    const offenders: string[] = []
    for (const f of [...walk(SRC, ['.css']), ...walk(SRC, ['.tsx', '.ts'])]) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/var\(\s*--[a-z0-9-]+\s*,([^)]*)\)/g)) {
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
