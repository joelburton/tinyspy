// cs-unmet

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
 * Known orphans as `path › subject` — the declaration the stacked docstrings
 * are crowding — each owned by the area that will read the file. Delete a line
 * when its area fixes it; never add one to quiet a new failure.
 *
 * **Not line numbers**, deliberately; `orphansIn` below says why.
 */
const KNOWN: string[] = [
  // → bananagrams
  'src/bananagrams/hooks/usePlayerBoard.ts › BananagramsCheckResult',
  // → boggle
  'src/boggle/manifest.ts › coopLabel',
  'src/boggle/manifest.ts › competeLabel',
  // → codenamesduet
  'src/codenamesduet/components/BoardCol.tsx › onError',
  'src/codenamesduet/components/CluePanel.tsx › onError',
  'src/codenamesduet/components/CluePanel.tsx › SuggestedClue',
  // → common — club-page / hooks / common-hosts / shared-game-chrome
  'src/common/account/EditProfileModal.tsx › Values',
  'src/common/club/CreateClubModal.tsx › Values',
  'src/common/club/EditClubModal.tsx › Values',
  'src/common/anagram-finder/AnagramDialog.tsx › Values',
  'src/common/game-page/GamePage.tsx › PEER_PILL_MS',
  'src/common/scratchpad/useScratchpad.ts › SavedPad',
  // → connections
  'src/connections/components/BoardCol.tsx › GuessAnswer',
  // → crosswords
  'src/crosswords/components/PlayArea.tsx › CheckAnswer',
  'src/crosswords/components/PuzzleSourceField.tsx › NextDateAnswer',
  'src/crosswords/components/pickers/LibraryPickerBlockingModal.tsx › LibraryAnswer',
  'src/crosswords/lib/setup.ts › PuzzleChoice',
  'src/crosswords/manifest.ts › coopLabel',
  // → e2e
  'e2e/gallery/index.ts › renderViewer',
  // → letterboxed
  'src/letterboxed/components/InfoCol.tsx › setupRows',
  'src/letterboxed/components/PlayArea.tsx › WordAnswer',
  // → psychicnum
  'src/psychicnum/components/PlayArea.tsx › HintAnswer',
  // → scrabble
  'src/scrabble/components/BoardCol.tsx › PlayAnswer',
  'src/scrabble/components/BoardCol.tsx › LocalFeedbackMsg',
  'src/scrabble/manifest.ts › labelFor',
  // → setgame
  'src/setgame/components/Card.tsx › flash',
  // → spellingbee
  'src/spellingbee/components/InfoCol.tsx › reveal',
  // → src/guards
  'src/guards/callSiteShape.test.ts › it',
  'src/guards/cssTokens.test.ts › describe',
  'src/guards/dbCallShape.test.ts › BUILDER',
  // → stackdown
  'src/stackdown/components/PlayArea.tsx › SOLUTION_WORDS',
  'src/stackdown/manifest.ts › labelFor',
  // → strands
  'src/strands/components/PlayArea.tsx › HintAnswer',
  'src/strands/pdf/model.ts › FoundEvent',
  // → waffle
  'src/waffle/manifest.ts › labelFor',
  // → wordiply
  'src/wordiply/components/PlayArea.tsx › GuessResult',
  // → wordle
  'src/wordle/manifest.ts › labelFor',
  // → wordwheel
  'src/wordwheel/components/InfoCol.tsx › reveal',
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

/**
 * What a run of stacked docstrings is sitting on top of — the name from the
 * first line of code below them, which is the declaration all of them are
 * crowding.
 *
 * Falls back to that line's text when it declares nothing nameable, so a key is
 * always produced. Silently dropping one would let an orphan escape the census,
 * which is the way this guard would fail without saying so.
 */
function subjectBelow(lines: string[], spans: [number, number][], from: number): string {
  let i = from
  // Walk to the end of the run — the stacked docstrings after this one.
  while (i + 1 < spans.length && spans[i][1] === spans[i + 1][0] - 1) i++
  for (let n = spans[i][1] + 1; n < lines.length; n++) {
    const t = lines[n].trim()
    if (!t) continue
    const m = /(?:export\s+)?(?:async\s+)?(?:type|function|const|let|interface|class|enum)\s+(\w+)/.exec(t)
      ?? /^(\w+)\s*[?:(<]/.exec(t)
    return m ? m[1] : t.slice(0, 40)
  }
  return '<end of file>'
}

/**
 * Every stacked run in one file, as `path › subject` — the declaration being
 * crowded, NOT a line number.
 *
 * **Keyed by subject because line numbers move and the fault does not.** An
 * allowlist keyed `path:line` breaks on any edit ABOVE an entry: splitting one
 * import into two shifted six of these by a line and failed the suite twice
 * over, once for a "new" orphan and once for a "fixed" one, about docstrings
 * nobody had touched (2026-09-03, three times in one sitting). The number
 * carries no meaning — it is where the pair happens to sit — and a guard that
 * cries wolf on unrelated edits teaches people to re-anchor it without looking,
 * which is how a shrinking allowlist quietly becomes a rubber stamp.
 *
 * A run of three docstrings over one declaration is **one** entry, not two.
 * It is one problem, and its fix is one act: reattach each stranded docstring
 * to what it describes.
 */
function orphansIn(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  const spans = docstringSpans(lines)
  const found = new Set<string>()
  spans.slice(1).forEach(([start], k) => {
    const [prevStart, prevEnd] = spans[k]
    // Adjacent, and the earlier one is not the file's own header — a module
    // docstring meeting the first declaration's is the ordinary shape.
    if (prevEnd !== start - 1 || prevStart === spans[0][0]) return
    found.add(`${file} › ${subjectBelow(lines, spans, k + 1)}`)
  })
  return [...found]
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
