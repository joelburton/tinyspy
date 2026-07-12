// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every game folder ships a `logo.svg`, imported as a URL (`./logo.svg?url`) and
 * rendered as an `<img src>` in the game registry / start dialog. As an `<img>`
 * (or a `?url` asset) the browser parses it as a STANDALONE XML document — much
 * stricter than the inline-innerHTML path. The classic silent failure: a `--`
 * (double hyphen) inside an XML comment is illegal, so the whole file is invalid
 * XML and the logo renders as a broken-image icon with no console error.
 *
 * This globs every `src/<game>/logo.svg` and asserts it parses cleanly as XML —
 * a cheap guard against shipping a logo that won't render. (Regression: the
 * wordwheel logo shipped once with a theme-token name like `--wordwheel-accent`
 * in its header comment, which broke it exactly this way.)
 */
const srcDir = join(process.cwd(), 'src')
const logos = readdirSync(srcDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(srcDir, d.name, 'logo.svg')))
  .map((d) => ({ game: d.name, path: join(srcDir, d.name, 'logo.svg') }))

describe('game logo.svg files render as valid standalone SVG', () => {
  it('discovers logo files to check', () => {
    // If this ever hits zero the glob broke — every game has a logo.
    expect(logos.length).toBeGreaterThan(0)
  })

  it.each(logos)('$game/logo.svg is well-formed XML with an <svg> root', ({ path }) => {
    const svg = readFileSync(path, 'utf8')
    const doc = new DOMParser().parseFromString(svg, 'application/xml')
    // A parse failure surfaces as a <parsererror> node in the returned document.
    const err = doc.querySelector('parsererror')
    expect(err?.textContent ?? null).toBeNull()
    expect(doc.documentElement.tagName.toLowerCase()).toBe('svg')
  })
})
