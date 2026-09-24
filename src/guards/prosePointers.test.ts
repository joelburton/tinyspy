// cs-unmet

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a pointer written in prose — `docs/ui.md → Layout stability` — names a
 * heading, or a **bold** phrase, that exists in the file it points at.
 *
 * `docLinks` checks markdown links, but most cross-references in this repo are
 * prose: comments and docs say "see docs/mobile.md → The info-sheet recipe".
 * A renamed heading leaves every such pointer reading fine and pointing at
 * nothing, and a doc rewrite renames headings wholesale.
 *
 * What counts as a match, from the text after the arrow:
 *   - it starts with a heading or a bold phrase of the target, or the phrase up
 *     to its first punctuation starts one — so a pointer may run on into its
 *     sentence, and may name a heading by its opening words;
 *   - a leading "the" and a section number are ignored on both sides;
 *   - a "quoted phrase", a finding id (`F-12`) or a slug must appear somewhere
 *     in the target's text, since those name words rather than a heading.
 *
 * `plans/areas/` is skipped: an area file is a dated record, and what it cited
 * then is part of the record.
 */

const ROOT = process.cwd()
const SOURCE = /\.(ts|tsx|css|sql|psql|md|mjs|js|sh|html)$/
/** The two prose guards themselves: their examples and allowlists read as prose. */
const SELF = ['src/guards/prosePointers.test.ts', 'src/guards/prosePaths.test.ts']

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => SOURCE.test(f) && !f.startsWith('plans/areas/') && !SELF.includes(f))
}

/** Lowercase, drop markup and quotes, fold dashes, collapse space, drop a leading article. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*"“”'’]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

const stripNumber = (s: string) => s.replace(/^\s*[\d.§]+\s+/, '')

interface Target {
  names: string[] // headings and bold phrases, normalized
  text: string // the whole file, normalized
}

const targets = new Map<string, Target>()
function target(file: string): Target {
  if (!targets.has(file)) {
    const body = readFileSync(join(ROOT, file), 'utf8')
    const outsideFences = body.replace(/^```[\s\S]*?^```/gm, '')
    const headings = [...outsideFences.matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => stripNumber(m[1]))
    const bold = [...outsideFences.matchAll(/\*\*([^*]+?)\*\*/g)].map((m) => m[1])
    targets.set(file, { names: [...headings, ...bold].map(norm), text: norm(body) })
  }
  return targets.get(file)!
}

/** The file a pointer names: relative to the writer and its ancestors, then the usual roots. */
function resolveTarget(from: string, name: string): string | null {
  const candidates: string[] = []
  for (let d = dirname(from); d && d !== '.'; d = dirname(d)) candidates.push(join(d, name))
  candidates.push(name, join('docs', name), join('docs/games', name), join('src', name), join('src/common', name))
  for (const c of candidates) {
    const abs = join(ROOT, c)
    if (existsSync(abs) && statSync(abs).isFile()) return c
  }
  return null
}

/** The text a pointer names, continued onto the next line when it wraps. */
function pointerText(after: string, next: string | undefined): string {
  let text = after
  const unclosedQuote = (text.match(/["“”]/g) ?? []).length % 2 === 1
  if (!/[.,;:)\]]/.test(text) || unclosedQuote) {
    text += ' ' + (next ?? '').replace(/^\s*(\*|\/\/|--|#)?\s*/, '')
  }
  return text.replace(/\*\/\s*$/, '')
}

function matches(t: Target, text: string): boolean {
  const quoted = text.match(/^\s*["“]([^"”]+)["”]/)
  const phrase = norm(
    quoted ? quoted[1] : stripNumber(text).split(/[,;:()[\]—"]|\.(?=\s|$|")| - /)[0],
  )
  if ((quoted || /^(f-[\w-]*\d+|\w+(-\w+)+)$/.test(phrase)) && t.text.includes(phrase)) return true
  const whole = norm(stripNumber(text))
  return t.names.some((n) => n && (whole.startsWith(n) || (phrase.length >= 4 && n.startsWith(phrase))))
}

describe('prose pointers', () => {
  const files = trackedFiles()

  it('finds files to read', () => {
    expect(files.length).toBeGreaterThan(400)
  })

  it('every "file.md → Heading" names a heading or bold phrase that exists', () => {
    const broken: string[] = []
    for (const file of files) {
      const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/([\w./-]+\.md)`?\)?\s*→\s*(.*)$/g)) {
          const [, name, after] = m
          if (name.startsWith('/')) continue // a template, `${folder}/doc.md`
          const before = line.slice(0, m.index)
          if (before.lastIndexOf('[') > before.lastIndexOf(']')) continue // link text; docLinks' job
          const text = pointerText(after, lines[i + 1])
          const resolved = resolveTarget(file, name)
          if (!resolved) {
            broken.push(`${file}:${i + 1}  no such file: ${name}`)
          } else if (!matches(target(resolved), text)) {
            broken.push(`${file}:${i + 1}  ${name} → ${text.trim().slice(0, 60)}`)
          }
        }
      })
    }
    expect(broken, `Prose pointer(s) to a heading that isn't there:\n${broken.join('\n')}`).toEqual([])
  })
})
