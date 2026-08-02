import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: every relative link in our markdown resolves — the file exists, and
 * a `#fragment` matches a real heading in it.
 *
 * The docs are heavily cross-linked (CLAUDE.md's map, the per-game registers,
 * the pointer-to-the-canonical-entry convention), and nothing else checks
 * them: a renamed heading or a moved file leaves a link that looks fine in
 * the source and 404s on GitHub. Eleven had accumulated silently before this
 * test existed — five from one heading's em-dash and four from `../` used for
 * a sibling inside `docs/`.
 *
 * Both failure modes are the kind a human eye slides past, which is exactly
 * what a test is for. Same spirit as `cssTokens.test.ts`: we own the whole
 * namespace, so a dangling reference is always a bug, never a judgment call.
 */

const ROOT = process.cwd()

/** Markdown we own. Everything under `docs/`, plus the two root files. */
function markdownFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.md')) out.push(p)
    }
  }
  walk(join(ROOT, 'docs'))
  for (const f of ['CLAUDE.md', 'README.md']) {
    const p = join(ROOT, f)
    if (existsSync(p)) out.push(p)
  }
  return out
}

/**
 * GitHub's heading → anchor rule, which is fiddly in exactly one way that
 * bites us: punctuation is DELETED rather than replaced, but the spaces
 * around it survive and each become a hyphen. So
 *
 *   ## Terminal results — the moment vs the record
 *        → `#terminal-results--the-moment-vs-the-record`   (two hyphens)
 *
 * Writing `#terminal-results-the-moment…` (one) or keeping the literal `—`
 * both dangle. Numbered headings keep their digits: `## 9. Deferred` →
 * `#9-deferred`.
 */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation, keep the spaces around it
    .replace(/\s/g, '-') // EACH space becomes a hyphen, not each run
}

/** Every anchor a file offers, from its ATX headings. */
function anchorsOf(file: string): Set<string> {
  const headings = readFileSync(file, 'utf8').matchAll(/^#{1,6}\s+(.*)$/gm)
  return new Set([...headings].map((m) => slug(m[1])))
}

/** `[text](target)` — inline links only; we don't use reference-style links. */
function linksIn(body: string): string[] {
  return [...body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1])
}

describe('markdown cross-links', () => {
  const files = markdownFiles()

  it('finds the docs to check (guards against the walk silently matching nothing)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('every relative link points at a file that exists', () => {
    const broken: string[] = []
    for (const file of files) {
      for (const link of linksIn(readFileSync(file, 'utf8'))) {
        if (/^(https?:|mailto:|#)/.test(link)) continue
        const [path] = link.split('#')
        // Links may point outside the docs tree (../src/…, ../.github/…) —
        // those are real targets too, so resolve and check them the same way.
        if (!existsSync(resolve(dirname(file), path))) {
          broken.push(`${relative(ROOT, file)} → ${link}`)
        }
      }
    }
    expect(broken, `Link(s) to a nonexistent file:\n${broken.join('\n')}`).toEqual([])
  })

  it('every #fragment matches a heading in the file it points at', () => {
    // Cache per target: the game docs all link the same few hub sections.
    const cache = new Map<string, Set<string>>()
    const anchors = (f: string) => {
      if (!cache.has(f)) cache.set(f, anchorsOf(f))
      return cache.get(f)!
    }

    const broken: string[] = []
    for (const file of files) {
      for (const link of linksIn(readFileSync(file, 'utf8'))) {
        if (/^(https?:|mailto:)/.test(link)) continue
        const [path, fragment] = link.split('#')
        if (!fragment) continue
        const target = path ? resolve(dirname(file), path) : file
        // Only markdown has headings; a #fragment on anything else (or on a
        // file the test above already flagged) isn't this test's business.
        if (!target.endsWith('.md') || !existsSync(target)) continue
        if (!anchors(target).has(fragment)) {
          broken.push(`${relative(ROOT, file)} → ${link}`)
        }
      }
    }
    expect(
      broken,
      `Link(s) to a heading that doesn't exist (see slug() above — an em-dash\n` +
        `leaves TWO hyphens, and punctuation is deleted, not replaced):\n${broken.join('\n')}`,
    ).toEqual([])
  })
})
