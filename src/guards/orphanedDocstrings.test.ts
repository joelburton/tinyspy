// cs-blessed-deep

/**
 * GUARD: **a docstring sits on the thing it describes.**
 *
 * The tell is two docstrings stacked with nothing between them:
 *
 *     /** Reflect a just-saved color across every consumer in the tab. *\/
 *     /** The already-loaded profile snapshot … *\/
 *     export function useCurrentProfile() { … }
 *
 * The second documents the declaration; **the first documents nothing**, and
 * whatever it describes — usually a function further down — reads as
 * undocumented. Both halves are wrong at once, and neither is visible: the
 * prose is correct, it is merely attached to its neighbor.
 *
 * **It recurs, which is why it is a guard and not a note.** Found in three
 * unrelated files during the `deep` audit (`dbEnvelope.ts`, `envelope.ts`,
 * `_shared/envelope.ts`), and once a week earlier by the `homepage` area in
 * `useProfile.ts` — where it was recorded, and where it still sits, because a
 * recorded observation is not a mechanism.
 *
 * ─── The one rule that makes it usable ────────────────────────
 * A stacked pair is only suspect when the earlier docstring is **not the
 * file's first**. A module docstring abutting the first declaration's is the
 * ordinary way a file opens, and without this exception the check reports six
 * false positives against eleven real ones.
 *
 * ─── The allowlist SHRINKS ────────────────────────────────────
 * Every entry belongs to an area that has not been audited yet. They are not
 * exemptions: an area removes its own line when it opens the file and works out
 * which declaration the stranded prose belongs to. That judgment needs the file
 * read, which is what an area is for — a sweep would just re-attach the prose
 * confidently to the wrong thing, which is the bug.
 *
 * A file not on this list fails immediately, which is the point.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Known orphans, `path:line` of the SECOND docstring's opening, each owned by
 * the area that will read the file. Delete a line when its area fixes it;
 * never add one to quiet a new failure.
 */
const KNOWN: string[] = [
  // → bananagrams
  'src/bananagrams/hooks/usePlayerBoard.ts:109',
  // → boggle
  'src/boggle/manifest.ts:62',
  'src/boggle/manifest.ts:89',
  // → codenamesduet
  'src/codenamesduet/components/BoardCol.tsx:135',
  'src/codenamesduet/components/CluePanel.tsx:61',
  'src/codenamesduet/components/CluePanel.tsx:94',
  // → common — club-page / hooks / common-hosts / shared-game-chrome
  'src/common/components/account/EditProfileModal.tsx:42',
  'src/common/components/club/CreateClubModal.tsx:105',
  'src/common/components/club/EditClubModal.tsx:54',
  'src/common/components/definitions/AnagramDialog.tsx:56',
  'src/common/components/game/GamePage.tsx:147',
  'src/common/hooks/scratchpad/useScratchpad.ts:52',
  'src/common/hooks/session/useProfile.ts:137',
  'src/common/lib/games.ts:414',
  'src/common/lib/games.ts:588',
  // → connections
  'src/connections/components/BoardCol.tsx:54',
  // → crosswords
  'src/crosswords/components/PlayArea.tsx:91',
  'src/crosswords/components/PuzzleSourceField.tsx:58',
  'src/crosswords/components/pickers/LibraryPickerBlockingModal.tsx:70',
  'src/crosswords/lib/setup.ts:62',
  'src/crosswords/manifest.ts:119',
  // → e2e
  'e2e/gallery/index.ts:43',
  // → letterboxed
  'src/letterboxed/components/InfoCol.tsx:103',
  'src/letterboxed/components/PlayArea.tsx:75',
  // → psychicnum
  'src/psychicnum/components/PlayArea.tsx:67',
  // → scrabble
  'src/scrabble/components/BoardCol.tsx:168',
  'src/scrabble/components/BoardCol.tsx:37',
  'src/scrabble/components/BoardCol.tsx:48',
  'src/scrabble/manifest.ts:58',
  // → setgame
  'src/setgame/components/Card.tsx:36',
  // → spellingbee
  'src/spellingbee/components/InfoCol.tsx:119',
  // → src/guards
  'src/guards/callSiteShape.test.ts:85',
  'src/guards/cssTokens.test.ts:490',
  'src/guards/dbCallShape.test.ts:40',
  // → stackdown
  'src/stackdown/components/PlayArea.tsx:88',
  'src/stackdown/manifest.ts:60',
  // → strands
  'src/strands/components/PlayArea.tsx:51',
  'src/strands/pdf/model.ts:112',
  // → waffle
  'src/waffle/manifest.ts:68',
  // → wordiply
  'src/wordiply/components/PlayArea.tsx:65',
  // → wordle
  'src/wordle/manifest.ts:61',
  // → wordwheel
  'src/wordwheel/components/InfoCol.tsx:119',
]

const ROOTS = ['src', 'supabase/functions', 'e2e', 'scripts']

function sourceFiles(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(sourceFiles(full))
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Every docstring in a file, as `[startLine, endLine]` (0-based).
 *
 * It finds the SPANS rather than matching a bare `/**` line, because a
 * docstring can be written on one line — and the first orphan this guard was
 * built for was exactly that shape. A line-shaped test misses it and reports a
 * clean file, which is the way a guard fails without saying so.
 */
function docstringSpans(lines: string[]): [number, number][] {
  const spans: [number, number][] = []
  let start: number | null = null
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (start === null) {
      if (!t.startsWith('/**')) continue
      // One-liner: opens and closes on the same line.
      if (t.length > 3 && t.endsWith('*/')) spans.push([i, i])
      else start = i
    } else if (t.endsWith('*/')) {
      spans.push([start, i])
      start = null
    }
  }
  return spans
}

/** Every stacked pair in one file, as `path:line` of the SECOND docstring. */
function orphansIn(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  const spans = docstringSpans(lines)
  return spans
    .slice(1)
    .filter(([start], k) => {
      const [prevStart, prevEnd] = spans[k]
      // Adjacent, and the earlier one is not the file's own header — a module
      // docstring meeting the first declaration's is the ordinary shape.
      return prevEnd === start - 1 && prevStart !== spans[0][0]
    })
    .map(([start]) => `${file}:${start + 1}`)
}

describe('docstrings sit on what they describe', () => {
  const found = ROOTS.flatMap(sourceFiles)
    .filter((f) => !f.endsWith('orphanedDocstrings.test.ts'))
    .flatMap(orphansIn)

  it('has a scope that actually found the repo', () => {
    // A walk that returns nothing would make the assertion below vacuously
    // pass — the failure mode where a guard cannot fail.
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(500)
  })

  it('no NEW docstring is stranded above its neighbor', () => {
    const unknown = found.filter((f) => !KNOWN.includes(f))
    expect(
      unknown,
      'a docstring with another docstring directly below it documents nothing — '
        + 'move it onto the declaration it describes',
    ).toEqual([])
  })

  it('the allowlist shrinks — every entry is still real', () => {
    // The other arm, so a fixed orphan does not leave its line behind to
    // excuse a future one at the same place. Line numbers move, so a stale
    // entry is likely as well as possible.
    const stale = KNOWN.filter((k) => !found.includes(k))
    expect(
      stale,
      'listed as a known orphan but not found — fixed, or moved. Delete the line',
    ).toEqual([])
  })
})
