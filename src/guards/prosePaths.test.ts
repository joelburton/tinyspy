// cs-unmet

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a repo path named in prose — a comment, a doc, a todo — exists.
 *
 * A moved file leaves every comment that names it reading fine; nothing
 * compiles comments. Two kinds of name are checked:
 *
 *   - **Anchored at the root** — `src/…`, `supabase/…`, `e2e/…`, `docs/…`,
 *     `plans/…`, `scripts/…`, backticked or not. It must exist as written (or
 *     with its extension left off).
 *   - **Relative, in backticks, with an extension** — `lib/answer.ts`,
 *     `_shared/envelope.ts`. It must resolve from the writer's folder or an
 *     ancestor, from one of the usual roots, or inside SOME game, common or
 *     shared folder, because "each game's `lib/answer.ts`" names a file every
 *     game has.
 *
 * "Exists" means git knows it: tracked, or ignored on purpose (`.env`, the
 * generated word lists). Asked of git, not the disk, so a Mac answers as CI's
 * fresh Linux checkout does — the disk holds local-only files CI lacks, and a
 * Mac's filenames match regardless of case.
 *
 * Skipped: a placeholder (`<game>`, `*`, `…`, `${`), a name wrapped mid-word at
 * a line end, a string in code, `plans/areas/` and `plans/app-audit.md` (dated
 * records, which cite what existed then), and the few names below that are
 * not this repo's files.
 */

const ROOT = process.cwd()
const SOURCE = /\.(ts|tsx|css|sql|psql|md|mjs|js|sh|html)$/
/** The two prose guards themselves: their examples and allowlists read as prose. */
const SELF = ['src/guards/prosePointers.test.ts', 'src/guards/prosePaths.test.ts']
const RECORDS = (f: string) => f.startsWith('plans/areas/') || f === 'plans/app-audit.md'

/** `file → token`, each a name that is deliberately not a path in this repo. */
const NOT_OURS: Record<string, string> = {
  'README.md → supabase/tap/supabase': 'a Homebrew tap, in `brew install`',
  'src/common/game-page/todo.md → common/game-page/PlayArea.tsx': 'says the file does NOT exist',
  'src/crosswords/lib/types.ts → packages/shared/src/index.ts': "crossplay's repo, the port's source",
  'src/crosswords/pdf/solution.ts → print/solution.ts': "crossplay's repo, the port's source",
  'src/guards/cssClasses.test.ts → ./X.module.css': 'an example shape, not a file',
  'src/guards/cssClasses.test.ts → ./PlayArea.module.css': "each game's own, in its components folder",
  'src/letterboxed/lib/customBoard.ts → ./dice.ts': "boggle's import, relative to boggle's folder",
}

const gitFiles = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)

function trackedFiles(): string[] {
  return gitFiles.filter((f) => SOURCE.test(f) && !RECORDS(f) && !SELF.includes(f))
}

/** Every tracked file, and every folder holding one. */
const tracked = new Set(gitFiles.flatMap((f) => f.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))))

/** Which of `paths` an ignore rule covers, whether or not the file is on disk.
 *  Each is also asked with a trailing slash, for a rule written for a folder. */
function ignored(paths: string[]): Set<string> {
  const asked = paths.flatMap((p) => [p, `${p}/`])
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], { cwd: ROOT, encoding: 'utf8', input: asked.join('\n') })
    return new Set(out.split('\n').filter(Boolean).map((p) => p.replace(/\/$/, '')))
  } catch (e) {
    // Exit 1 is "none of them is ignored"; anything else is a real failure.
    if ((e as { status?: number }).status === 1) return new Set()
    throw e
  }
}

const subfolders = (d: string) =>
  readdirSync(join(ROOT, d), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(d, e.name))


describe('paths named in prose', () => {
  const files = trackedFiles()
  const anyFolder = [
    ...subfolders('src'),
    ...subfolders('src/common'),
    ...subfolders('src/shared'),
    ...subfolders('supabase/functions'),
    ...subfolders('supabase/tests'),
  ]
  const roots = ['src', 'src/common', 'src/shared', 'supabase', 'supabase/functions', 'supabase/tests', 'supabase/scripts', 'docs']

  it('finds files to read', () => {
    expect(files.length).toBeGreaterThan(400)
  })

  it('every repo path named in prose exists', () => {
    // A name with no tracked candidate waits here, and is reported unless an
    // ignore rule covers one of its candidates — one `check-ignore` for all.
    const untracked: Array<{ where: string; token: string; candidates: string[] }> = []
    const check = (file: string, line: number, token: string, candidates: string[]) => {
      if (NOT_OURS[`${file} → ${token}`] || candidates.some((c) => tracked.has(c))) return
      untracked.push({ where: `${file}:${line}`, token, candidates })
    }

    for (const file of files) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(/(?<![\w./@-])((?:src|supabase|e2e|docs|plans|scripts)\/[\w./-]*\w)/g)) {
            const p = m[1]
            if (/[<*{$…]/.test(p)) continue
            const next = line[m.index + p.length] ?? ''
            const prev = line[m.index - 1] ?? ''
            if (next === '-' || next === '*' || prev === "'" || prev === '"') continue
            check(file, i + 1, p, ['', '.sql', '.ts', '.tsx', '.md'].map((ext) => p + ext))
          }
          for (const m of line.matchAll(/`([\w.-]+(?:\/[\w.-]+)+\.(?:ts|tsx|css|sql|psql|md|mjs|json|toml|sh))`/g)) {
            const p = m[1]
            if (/^(src|supabase|e2e|docs|plans|scripts)\//.test(p)) continue
            const candidates: string[] = []
            for (let d = dirname(file); d && d !== '.'; d = dirname(d)) candidates.push(join(d, p))
            candidates.push(p, ...roots.map((r) => join(r, p)), ...anyFolder.map((d) => join(d, p)))
            check(file, i + 1, p, candidates)
          }
        })
    }
    const ignoredPaths = ignored(untracked.flatMap((u) => u.candidates))
    const missing = untracked
      .filter((u) => !u.candidates.some((c) => ignoredPaths.has(c)))
      .map((u) => `${u.where}  ${u.token}`)
    expect(missing, `Path(s) named in prose that don't exist:\n${missing.join('\n')}`).toEqual([])
  })

  it('every NOT_OURS entry is still needed', () => {
    for (const key of Object.keys(NOT_OURS)) {
      const [file, token] = key.split(' → ')
      expect(readFileSync(join(ROOT, file), 'utf8'), key).toContain(token)
    }
  })
})
