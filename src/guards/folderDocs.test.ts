// cs-unmet

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY FEATURE FOLDER CARRIES A `doc.md` AND A `todo.md`, BOTH IN SHAPE.
 *
 * The two files are written one folder at a time over months
 * (docs/common-folders.md → "Every folder carries a doc.md and a todo.md"),
 * which is exactly the schedule on which a format that is only *described*
 * drifts apart: the fourth one invents a heading, the tenth drops the lede, and
 * by the twentieth there is no format to point at any more. So the mechanical
 * half is asserted here.
 *
 * What is mechanical, and all this checks:
 *
 *   - a `todo.md` exists, and carries the four fixed headings in their fixed
 *     order — **all four, empty or not.** The skeleton is the point: adding the
 *     first item to a folder should be one line, not a guess at the structure;
 *   - a `doc.md` exists, opens with its folder's name, and spends one to three
 *     sentences before the first heading;
 *   - it has exactly one `## Intro to area` — once the folder has left
 *     `INTROS_OWED`, which is what tracks the half an area writes;
 *   - the intro is an INTRODUCTION: no paragraph in it opens with bold (a
 *     bolded claim is a Details item), and an intro longer than
 *     `INTRO_LINES_BEFORE_A_SECTION_IS_OWED` has a section after it, because
 *     an intro that long has detail in it and the detail has a place to go.
 *     `INTROS_TO_RESHAPE` lists the folders written before that rule.
 *
 * What is NOT mechanical and is nobody's guard: whether the lede is any good,
 * whether the intro explains the area, and whether an item is in the right one
 * of the four sections. Those are read, not tested.
 *
 * `common/devtools` is not a feature folder for any purpose here — `/palette`
 * and `/font` are excluded from the audit, and giving them a folder did not
 * change that.
 */

const CWD = process.cwd()

/** The four, in the one order they may appear. A ramp of certainty: an item
 *  that firms up moves UP the file, which is the whole re-classification
 *  mechanism. */
const TODO_SECTIONS = ['Bugs', 'Soon', 'Someday', 'Maybe']

const SKIP = new Set(['devtools'])

/** Every feature folder — one level under `src/common/` and `src/shared/`. */
function featureFolders(): { top: string; name: string; dir: string }[] {
  const out: { top: string; name: string; dir: string }[] = []
  for (const top of ['common', 'shared']) {
    const base = join(CWD, 'src', top)
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (e.isDirectory() && !SKIP.has(e.name)) out.push({ top, name: e.name, dir: join(base, e.name) })
    }
  }
  return out
}

/**
 * Folders whose `doc.md` has a lede but no `## Intro to area` yet — the same
 * shrinking allowlist the vocabulary and css-class guards use: a listed folder
 * is silent, an unlisted one fails, and a listed folder that HAS an intro has
 * to leave.
 *
 * **It tracks the intro, not the file**, and that distinction is the whole
 * point of the list. Every folder got a `doc.md` the day the format landed,
 * because a one-line lede is enough to navigate a tree by and Joel wanted them
 * for ordering the sprint. If this list tracked the FILE it would have emptied
 * that same day, leaving sixty docs that look finished and a green guard over
 * work nobody has done.
 *
 * So it starts as every folder, which is honest: a lede says what a folder is,
 * and none of them yet says why it is that way. Each area deletes its own line
 * when it writes its intro, and the length of this list is how much of the
 * tree is still undescribed — a progress marker that cannot drift, because it
 * is the test.
 */
const INTROS_OWED: string[] = [
  'common/game-page', 'common/info-sheet',
  'common/manifest',
  'common/move-flash',
  'common/pause-suspend', 'common/pdf', 'common/reveal',
  'common/setup-form',
  'common/terminal',
  'common/timer',
  'common/turn-log', 'common/word-entry',
  'common/word-list',
  'shared/bee-games', 'shared/board-cursor', 'shared/dict-trie',
  'shared/grid-and-drag', 'shared/onscreen-keyboard', 'shared/rank-ladder',
  'shared/word-hunt', 'shared/wordle-style',
]

/**
 * An intro longer than this with nothing after it is carrying detail. The
 * number is an altitude, not a word count: a few narrative paragraphs fit
 * under it, and the sharp specifics that push past it belong in `## Details`
 * or a named section (docs/common-folders.md → "three fixed elements").
 */
const INTRO_LINES_BEFORE_A_SECTION_IS_OWED = 25

/**
 * Folders whose intro was written before the intro rule had a guard — as a
 * stack of bolded claims, or as one long section with nothing after it. The
 * same shrinking list as above: a listed folder is silent, and one that has
 * been reshaped has to leave. Reshaping one is a documentation pass on a
 * closed area, which is Joel's to schedule.
 */
const INTROS_TO_RESHAPE: string[] = []

/** The `##` headings of a markdown file, in order. */
const headings = (src: string): string[] =>
  [...src.matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1]!)

/**
 * Sentences before the first heading.
 *
 * A stated limit rather than a parser: the four abbreviations this repo
 * actually writes are removed first, and anything else ending in a period
 * counts as a sentence. Same trade `stripComments` makes in the storage guard —
 * a tokenizer is out of proportion to a three-sentence cap.
 */
function ledeSentences(src: string): number {
  const lede = src.replace(/^# .*$/m, '').split(/^## /m)[0] ?? ''
  const flat = lede.replace(/\b(e\.g|i\.e|etc|vs)\./g, '$1')
  return [...flat.matchAll(/[.!?](?:\s|$)/g)].length
}

/**
 * What the intro is made of, for the two shape checks: how many of its
 * paragraphs open with bold, how many lines it runs, and whether any section
 * follows it. `null` when the file has no intro.
 */
function introShape(src: string): { bolded: number; lines: number; followed: boolean } | null {
  const at = /^## Intro to area\s*$/m.exec(src)
  if (!at) return null
  const rest = src.slice(at.index + at[0].length)
  const next = /^## /m.exec(rest)
  const body = (next ? rest.slice(0, next.index) : rest).trim()
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return {
    bolded: paragraphs.filter((p) => p.startsWith('**')).length,
    lines: body === '' ? 0 : body.split('\n').length,
    followed: next !== null,
  }
}

describe('every feature folder', () => {
  it('has a todo.md', () => {
    const missing = featureFolders()
      .filter((f) => !existsSync(join(f.dir, 'todo.md')))
      .map((f) => `${f.top}/${f.name}`)
    expect(missing, 'feature folders with no todo.md — write the skeleton').toEqual([])
  })

  it('has a todo.md carrying the four sections, in order', () => {
    const wrong: string[] = []
    for (const f of featureFolders()) {
      const path = join(f.dir, 'todo.md')
      if (!existsSync(path)) continue // the test above reports it
      const src = readFileSync(path, 'utf8')
      const first = src.split('\n')[0]
      if (first !== `# ${f.name} — todo`) {
        wrong.push(`${f.top}/${f.name}/todo.md  →  first line is "${first}", not "# ${f.name} — todo"`)
      }
      const found = headings(src)
      if (found.join('|') !== TODO_SECTIONS.join('|')) {
        wrong.push(`${f.top}/${f.name}/todo.md  →  sections are [${found}], not [${TODO_SECTIONS}]`)
      }
    }
    expect(
      wrong,
      'A todo.md whose skeleton has drifted. All four sections are always ' +
        'present, empty or not, in the order Bugs · Soon · Someday · Maybe — ' +
        'so that adding the first item is one line, not a guess at the ' +
        'structure.\n\n' + wrong.join('\n'),
    ).toEqual([])
  })

  it('has a doc.md', () => {
    const missing = featureFolders()
      .filter((f) => !existsSync(join(f.dir, 'doc.md')))
      .map((f) => `${f.top}/${f.name}`)
    expect(
      missing,
      'A feature folder with no doc.md. Being new is not an exemption — write ' +
        'the H1 and a one-sentence lede, and put the folder on INTROS_OWED ' +
        'until its area writes the intro.\n\n' + missing.join('\n'),
    ).toEqual([])
  })

  it('has a doc.md in shape', () => {
    const wrong: string[] = []
    for (const f of featureFolders()) {
      const path = join(f.dir, 'doc.md')
      if (!existsSync(path)) continue // the test above reports it
      const key = `${f.top}/${f.name}`
      const src = readFileSync(path, 'utf8')

      const first = src.split('\n')[0]
      if (first !== `# ${f.name}`) {
        wrong.push(`${key}/doc.md  →  first line is "${first}", not "# ${f.name}"`)
      }

      const sentences = ledeSentences(src)
      if (sentences < 1 || sentences > 3) {
        wrong.push(`${key}/doc.md  →  lede is ${sentences} sentences, want 1–3`)
      }

      // The intro is what an area writes; until then the folder says so on
      // INTROS_OWED rather than carrying an empty heading that reads as done.
      const intros = headings(src).filter((h) => h === 'Intro to area').length
      const owed = INTROS_OWED.includes(key)
      if (!owed && intros !== 1) {
        wrong.push(`${key}/doc.md  →  ${intros} "## Intro to area" sections, want exactly 1`)
      }
      if (owed && intros > 0) {
        wrong.push(`${key}/doc.md  →  has a "## Intro to area" but is still on INTROS_OWED — delete its row`)
      }

      // The intro is an introduction. A paragraph opening with bold is a claim,
      // which is a Details item; an intro that runs long with nothing after it
      // is carrying the detail that section exists for.
      const shape = introShape(src)
      if (shape === null) continue
      const faults: string[] = []
      if (shape.bolded > 0) {
        faults.push(`${shape.bolded} intro paragraph(s) open with bold — a bolded claim is a Details item, and the intro is narrative`)
      }
      if (shape.lines > INTRO_LINES_BEFORE_A_SECTION_IS_OWED && !shape.followed) {
        faults.push(`the intro is ${shape.lines} lines and nothing follows it — an intro that long has detail in it; move the detail under a section after it`)
      }
      const reshape = INTROS_TO_RESHAPE.includes(key)
      if (!reshape) for (const fault of faults) wrong.push(`${key}/doc.md  →  ${fault}`)
      if (reshape && faults.length === 0) {
        wrong.push(`${key}/doc.md  →  is on INTROS_TO_RESHAPE but its intro is in shape — delete its row`)
      }
    }
    expect(
      wrong,
      'A doc.md that has drifted from the three fixed elements: the H1 is the ' +
        'folder name, the lede is 1–3 unlabeled sentences, and `## Intro to area` ' +
        'is required exactly once once the folder leaves INTROS_OWED — and is an ' +
        'introduction: narrative paragraphs, none opening with bold, with the ' +
        'detail in a section after it. Everything after that is free.\n\n' +
        wrong.join('\n'),
    ).toEqual([])
  })
})
