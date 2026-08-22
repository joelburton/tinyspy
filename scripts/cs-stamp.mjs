/**
 * The `cs-` sprint stamp — add, remove, change and count it.
 *
 * The css-system sprint (plans/css-system-2.md) reads the repo AREA BY AREA,
 * and every file carries one comment on its first line saying where it stands:
 *
 *   cs-unmet    not reached yet
 *   cs-found    reached through the import/render graph; NOT audited, and
 *               being found is not a claim on anyone's attention
 *   cs-audited  an audit for it exists in plans/areas/<area>.md
 *   cs-partial  some findings resolved; the file says which are outstanding
 *   cs-fixed    every finding resolved
 *   cs-blessed  Joel read it himself — the only stamp Claude never sets alone
 *   cs-na       in the tree, deliberately not read
 *
 * WHY IN THE FILE rather than one manifest: this sprint renames constantly, and
 * a manifest rots on every rename while a stamp travels with the file.
 *
 * The stamps are TEMPORARY. Step 12 runs `unstamp` and deletes this script, at
 * which point every untouched file is byte-identical to what it was before the
 * sprint — `stamp` and `unstamp` are exact inverses, which is a property proved
 * by round-tripping the whole tree rather than asserted.
 *
 * Usage:
 *   node scripts/cs-stamp.mjs stamp            add cs-unmet to unstamped files
 *   node scripts/cs-stamp.mjs unstamp          strip the stamp from every file
 *   node scripts/cs-stamp.mjs tally            count files per stamp
 *   node scripts/cs-stamp.mjs list <stamp>     print the files at one stamp
 *   node scripts/cs-stamp.mjs set <stamp> <path>...   restamp named files
 *
 * `stamp` and `set` take `--dry` to print what they would do and change nothing.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** The seven states, in ladder order — though there is no ladder to walk: the
 *  stamp is simply the latest true statement about the file. A file can go
 *  from `unmet` to `audited` in one sitting, and a dependency can sit at
 *  `found` for the rest of the sprint. */
export const STAMPS = ['unmet', 'found', 'audited', 'partial', 'fixed', 'blessed', 'na']

/** Where the sprint reads. Everything hand-written under these four. */
export const ROOTS = ['src', 'e2e', 'supabase', 'scripts']

/**
 * The comment syntax per extension — which is also the definition of what gets
 * stamped: a file is in scope when its language has a comment we can put on
 * line 1. That is why the exclusions below are about FILE KIND, never about
 * whether we expect to change the file.
 */
const SYNTAX = {
  '.ts': ['//', ''],
  '.tsx': ['//', ''],
  '.mjs': ['//', ''],
  '.css': ['/*', ' */'],
  '.sql': ['--', ''],
  '.psql': ['--', ''],
  '.sh': ['#', ''],
  '.py': ['#', ''],
}

/**
 * Excluded, each for a reason — none of them "we don't plan to touch it".
 *
 * Assets and data have no comment line to carry a stamp (`.png`, `.json`) or
 * would be corrupted by inventing one (`.ipuz`, `.puz`). The sprint still owns
 * the assets; they are step 11, tracked in the plan rather than in the file.
 * `supabase/temp/` and `supabase/branches/` are CLI scratch, `*~` are editor
 * backups, and this script is sprint tooling that step 12 deletes outright.
 */
export const EXCLUDED = [
  /\/node_modules\//,
  /^supabase\/(temp|branches)\//,
  /~$/,
  /\.DS_Store$/,
  /^scripts\/cs-stamp\.mjs$/,
]

const CWD = process.cwd()
const extOf = (p) => (p.match(/\.[^./]+$/) ?? [''])[0]

/** Every file in scope, repo-relative, sorted. */
export function inScope() {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else {
        const r = relative(CWD, p)
        if (SYNTAX[extOf(r)] && !EXCLUDED.some((rx) => rx.test(r))) out.push(r)
      }
    }
  }
  for (const root of ROOTS) walk(join(CWD, root))
  return out
}

/** Matches a stamp line and nothing else — the tight regex is what makes
 *  `unstamp` safe to run blind over 1300 files. */
const STAMP_RE = new RegExp(`^(?://|--|#|/\\*) cs-(${STAMPS.join('|')})(?: \\*/)?$`)

/** A shebang has to stay on line 1, so the stamp goes under it. */
const isShebang = (line) => line.startsWith('#!')

/** The stamp a file carries, or null. */
export function readStamp(rel) {
  const lines = readFileSync(join(CWD, rel), 'utf8').split('\n')
  const at = isShebang(lines[0] ?? '') ? 1 : 0
  const m = (lines[at] ?? '').match(STAMP_RE)
  return m ? m[1] : null
}

function stampLine(rel, stamp) {
  const [open, close] = SYNTAX[extOf(rel)]
  return `${open} cs-${stamp}${close}`
}

/** Write `stamp` onto a file, replacing whatever it carries. */
function writeStamp(rel, stamp, dry) {
  const path = join(CWD, rel)
  const lines = readFileSync(path, 'utf8').split('\n')
  const at = isShebang(lines[0] ?? '') ? 1 : 0
  const line = stampLine(rel, stamp)
  if (STAMP_RE.test(lines[at] ?? '')) lines[at] = line
  // A blank line after, so the stamp never runs into a docstring. `unstamp`
  // removes both, which is why the pair has to be written as a pair.
  else lines.splice(at, 0, line, '')
  if (!dry) writeFileSync(path, lines.join('\n'))
}

function removeStamp(rel) {
  const path = join(CWD, rel)
  const lines = readFileSync(path, 'utf8').split('\n')
  const at = isShebang(lines[0] ?? '') ? 1 : 0
  if (!STAMP_RE.test(lines[at] ?? '')) return false
  lines.splice(at, lines[at + 1] === '' ? 2 : 1)
  writeFileSync(path, lines.join('\n'))
  return true
}

// ─── the commands ────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2)
const dry = rest.includes('--dry')
const args = rest.filter((a) => a !== '--dry')

if (cmd === 'stamp') {
  const files = inScope().filter((f) => readStamp(f) === null)
  for (const f of files) writeStamp(f, 'unmet', dry)
  console.log(`${dry ? 'would stamp' : 'stamped'} ${files.length} file(s) cs-unmet`)
} else if (cmd === 'unstamp') {
  let n = 0
  for (const f of inScope()) if (removeStamp(f)) n++
  console.log(`unstamped ${n} file(s)`)
} else if (cmd === 'set') {
  const [stamp, ...paths] = args
  if (!STAMPS.includes(stamp)) throw new Error(`unknown stamp: ${stamp}`)
  for (const p of paths) writeStamp(relative(CWD, join(CWD, p)), stamp, dry)
  console.log(`${dry ? 'would set' : 'set'} ${paths.length} file(s) cs-${stamp}`)
} else if (cmd === 'list') {
  for (const f of inScope()) if (readStamp(f) === args[0]) console.log(f)
} else if (cmd === 'tally') {
  const counts = Object.fromEntries([...STAMPS, 'MISSING'].map((s) => [s, 0]))
  for (const f of inScope()) counts[readStamp(f) ?? 'MISSING']++
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  for (const s of [...STAMPS, 'MISSING']) {
    if (counts[s]) console.log(`  cs-${s}`.padEnd(14), String(counts[s]).padStart(5))
  }
  console.log('  total'.padEnd(14), String(total).padStart(5))
} else {
  console.error('usage: cs-stamp.mjs stamp|unstamp|tally|list <stamp>|set <stamp> <path>...')
  process.exit(1)
}
