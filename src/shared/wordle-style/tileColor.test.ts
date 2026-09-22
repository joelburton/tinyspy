// cs-blessed-wordle-style

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tileColor } from './tileColor'

describe('tileColor', () => {
  it('maps the server codes to class keys', () => {
    expect(tileColor('g')).toBe('wordleGreen')
    expect(tileColor('y')).toBe('wordleYellow')
    expect(tileColor('x')).toBe('wordleGray')
  })

  it('falls back to blank for unevaluated / absent / unknown codes', () => {
    expect(tileColor(undefined)).toBe('blank')
    expect(tileColor('')).toBe('blank')
    expect(tileColor('.')).toBe('blank')
    expect(tileColor('?')).toBe('blank')
  })
})

const CWD = process.cwd()

/** The three states a judged tile can be in. Defining any one of them is what
 *  marks a stylesheet as painting this palette. */
const JUDGED = ['wordleGreen', 'wordleYellow', 'wordleGray'] as const

/**
 * The one sheet that paints the judged three and no `blank`, and a TYPE says
 * why: the keyboard is indexed by `KeyTone`, which is
 * `Exclude<TileColor, 'blank'>` — an untried key carries no tone rather than an
 * unjudged one, so there is no class for it to be missing.
 *
 * Every other painter is required to define `blank`, a newly discovered one
 * included. That is the safe default: the full `TileColor` is what a board
 * indexes with, and a sheet that genuinely does not need it says so here.
 */
const INDEXED_BY_KEY_TONE = 'shared/onscreen-keyboard/GuessKeyboard.module.css'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.module.css')) out.push(p)
  }
  return out
}

/** Does this stylesheet DEFINE the class, rather than merely mention it?
 *  Anchored at the line start, so a descendant selector or a comment doesn't
 *  count — with room for the sprint's undecided marker, which also sits at
 *  column 0. */
function defines(css: string, cls: string): boolean {
  return new RegExp(`^(?:/\\* @@ \\*/ )?\\.${cls}\\b`, 'm').test(css)
}

/**
 * Every module stylesheet painting this palette — DISCOVERED, not listed. A
 * hand-written list covers the files someone remembered, and a game that starts
 * painting these classes tomorrow is simply not in it.
 *
 * It keys on the JUDGED classes rather than on `blank`, because `blank` is a
 * word other palettes spend: boggle's PlayArea defines one and has nothing to
 * do with letter colors.
 */
const PAINTERS = walk(join(CWD, 'src'))
  .map((path) => ({ path: relative(join(CWD, 'src'), path), css: readFileSync(path, 'utf8') }))
  .filter(({ css }) => JUDGED.some((c) => defines(css, c)))

/**
 * Guard: every stylesheet that paints this palette defines ALL of it.
 *
 * `styles[tileColor(code)]` is a lookup with no compiler behind it. Rename a
 * class in one of these files and nothing errors — the key resolves to
 * `undefined`, `cls()` drops it, and the tile renders with no color at all.
 * Silent, and only visible to someone playing that game.
 *
 * IT HAS TO BE A STATIC CHECK. A rendering test cannot see this: `css: false`
 * in vitest.config.ts replaces every CSS module with a proxy that fabricates
 * `_<key>_<hash>` for any key asked of it, so a board whose stylesheet has lost
 * the class still "renders" it. That was verified by planting the rename and
 * watching a DOM assertion pass anyway.
 */
describe('the letter palette reaches the stylesheets', () => {
  it('finds the stylesheets that paint it', () => {
    // A discovered set can go empty — a renamed class, a moved folder, a regex
    // that stops matching — and every `it.each` below would then pass by having
    // nothing to say. This is the one assertion that cannot.
    expect(PAINTERS.map((p) => p.path).sort()).toEqual([
      'shared/onscreen-keyboard/GuessKeyboard.module.css',
      'waffle/components/Board.module.css',
      'wordle/components/Board.module.css',
      'wordle/components/GameEventLog.module.css',
    ])
  })

  it.each(PAINTERS)('$path defines every judged class', ({ path, css }) => {
    const missing = JUDGED.filter((c) => !defines(css, c))
    expect(missing, `${path} paints this palette but defines no rule for: ${missing.join(', ')}`)
      .toEqual([])
  })

  it.each(PAINTERS.filter((p) => p.path !== INDEXED_BY_KEY_TONE))(
    '$path defines blank too, being indexed by a whole TileColor',
    ({ path, css }) => {
      expect(defines(css, 'blank'), `${path} is indexed by TileColor but defines no .blank`)
        .toBe(true)
    },
  )
})
