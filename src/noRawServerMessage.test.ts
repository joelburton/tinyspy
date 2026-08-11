/**
 * Guard: **no server `error.message` reaches a UI sink.**
 *
 * The classifier in `lib/game/serverError.ts` decides whether a failed call
 * becomes a pill (a rule we anticipated) or a fault (bare red text, logged
 * under `[db]`) — but it is a FUNCTION, so it only decides for call sites that
 * call it. A site doing this asks nothing and gets neither:
 *
 *     showLocalFeedback(stickyPill('error', error.message))   // ← the bug
 *
 * That is how five games shipped, briefly, showing `no-guesses-left|` as a red
 * pill: their SQL was converted to keys while their own call sites still handed
 * the raw string to a pill. It defeats the copy table AND the fault styling AND
 * the log at once, and nothing failed — the words just quietly got worse.
 *
 * "Be careful next time" is not a mechanism. This is.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Files allowed to touch a raw `.message`, each for a reason that is not "a
 * server error on its way to a player". Keep this list SHORT and justified —
 * adding to it is the exact move this guard exists to make deliberate.
 */
const ALLOWED = new Map<string, string>([
  // The classifier itself, and the wrapper that feeds it.
  ['src/common/lib/game/serverError.ts', 'defines the classification'],
  ['src/common/lib/game/callRpc.ts', 'documents the rule in a comment'],
  // Reads the message to build a CallError for the classifier — the opposite of
  // rendering it.
  ['src/common/hooks/game/useWordSubmit.ts', 'normalises a thrown rejection into a CallError'],
  ['src/common/lib/supabase/callEdgeFn.ts', 'builds the classifiable CallError off a functions-js failure'],
  // Returns the string UP to a caller, which classifies it. The edge-function
  // path strips the SQLSTATE, so the message is the only thing left to carry.
  ['src/common/lib/game/manifestRpcs.ts', 'passes the message to its caller, which classifies'],
  ['src/scrabble/components/PlayArea.tsx', 'unwraps an edge-fn body, then classifies it'],
  // A manifest's `startGameInClub` returns `{ error: string }` UP to
  // SetupGameDialog, which classifies it. The edge-function path strips the
  // SQLSTATE, so the message is the only thing left to carry — passing it along
  // is the mechanism, not a bypass.
  ['src/bananagrams/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/codenamesduet/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/connections/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/crosswords/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/psychicnum/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/scrabble/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/stackdown/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/strands/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  ['src/wordle/manifest.ts', 'returns the message to SetupGameDialog, which classifies'],
  // Same pass-through shape: useCells hands the string to crosswords' PlayArea.
  ['src/crosswords/hooks/useCells.ts', 'returns the message to its caller, which classifies'],
  // Not server errors at all.
  ['src/crosswords/components/SetupForm.tsx', 'a FileReader failure reading a local .ipuz'],
  ['src/common/components/game/PlayAreaErrorBoundary.tsx', 'a React render error, not a server one'],
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('no raw server message reaches a UI sink', () => {
  it('every `error.message` read is either allowed or routed through the classifier', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      if (ALLOWED.has(file)) continue
      const src = readFileSync(file, 'utf8')
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (!/\berr(or)?\??\.message\b/.test(line)) return
        // A WINDOW, not the line: a console call is a log rather than a sink,
        // and reading the message to BUILD a CallError is the opposite of
        // rendering it — but a wrapped call puts `failureText(` several lines
        // above the read, so a line-only test reports the fix as the bug.
        const near = lines.slice(Math.max(0, i - 3), i + 2).join('\n')
        if (/console\.(log|warn|error|debug)/.test(near)) return
        if (/failure(Text|Message)\(/.test(near)) return
        offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(
      offenders,
      'route it through failureMessage()/failureText(), or justify it in ALLOWED',
    ).toEqual([])
  })

  it('the allowlist has no stale entries', () => {
    // A file that stopped touching `.message` should leave the list, so the list
    // keeps meaning "these are the exceptions" rather than accumulating.
    const stale = [...ALLOWED.keys()].filter((f) => {
      const src = readFileSync(f, 'utf8')
      return !/\berr(or)?\??\.message\b/.test(src)
    })
    expect(stale, 'allowlisted but no longer touching .message — remove').toEqual([])
  })
})
