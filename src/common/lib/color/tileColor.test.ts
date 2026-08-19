import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * Guard: every stylesheet that INDEXES by a TileColor defines all of them.
 *
 * `styles[tileColor(code)]` is a lookup with no compiler behind it. Rename a
 * class in one of these files and nothing errors — the key resolves to
 * `undefined`, `cls()` drops it, and the tile renders with no colour at all.
 * Silent, and only visible to someone playing that game.
 *
 * IT HAS TO BE A STATIC CHECK. A rendering test cannot see this: `css: false`
 * in vitest.config.ts replaces every CSS module with a proxy that fabricates
 * `_<key>_<hash>` for any key asked of it, so a board whose stylesheet has lost
 * the class still "renders" it. That was verified by planting the rename and
 * watching a DOM assertion pass anyway.
 *
 * The keyboard is here too, at three of the four: its tone type is
 * `Exclude<TileColor, 'blank'>`, because an untried key carries no tone rather
 * than an unjudged one.
 */
const JUDGED = ['wordleGreen', 'wordleYellow', 'wordleGray'] as const
const INDEXED_BY_TILE_COLOR: [file: string, classes: readonly string[]][] = [
  ['wordle/components/Board.module.css', [...JUDGED, 'blank']],
  ['wordle/components/GameTurnLog.module.css', [...JUDGED, 'blank']],
  ['waffle/components/Board.module.css', [...JUDGED, 'blank']],
  ['common/components/game/entry/GuessKeyboard.module.css', JUDGED],
]

describe('the letter palette reaches the stylesheets', () => {
  it.each(INDEXED_BY_TILE_COLOR)('%s defines every class it is indexed with', (file, classes) => {
    const css = readFileSync(join(process.cwd(), 'src', file), 'utf8')
    const missing = classes.filter((c) => !new RegExp(`^\\.${c}\\b`, 'm').test(css))
    expect(
      missing,
      `${file} is indexed by TileColor but defines no rule for: ${missing.join(', ')}`,
    ).toEqual([])
  })
})
