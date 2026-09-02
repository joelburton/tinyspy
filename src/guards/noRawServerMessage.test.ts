// cs-unmet

/**
 * Guard: **no server `error.message` reaches a UI sink.**
 *
 * `runRpc` and its wrappers decide whether a failed call
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
 * The detection pattern, shared by the offender scan and the stale-entry
 * check. Deliberately WIDE: any identifier containing err/Err (error,
 * lookupError, cacheErr, …) plus the bare `e` of a catch clause — strands
 * shipped `lookupError.message` straight into a pill precisely because the
 * old pattern only matched identifiers named exactly err/error (review
 * finding 4). Wide + a short justified allowlist beats narrow + silent
 * misses.
 */
const MESSAGE_READ = /\b(?:e|[\w$]*[eE]rr[\w$]*)\??\.message\b/

/**
 * Files allowed to touch a raw `.message`, each for a reason that is not "a
 * server error on its way to a player". Keep this list SHORT and justified —
 * adding to it is the exact move this guard exists to make deliberate.
 */
const ALLOWED = new Map<string, string>([
  // The classifier itself, and the wrapper that feeds it.
  // Reads `.message` for exactly one case: a RAW FAULT — a Postgres error
  // nobody wrote a sentence for. Showing its own text is the deliberate design
  // there, because the alternative is "something went wrong" with the diagnosis
  // thrown away. Anything we authored arrives as an envelope and is read from
  // `message` on that, not here.
  ['src/common/lib/supabase/dbEnvelope.ts', "shows a raw fault's own text, since nobody wrote one for it"],
  ['src/common/lib/supabase/dbResult.ts', "puts the browser's opaque string in an envelope's DETAIL, which no surface renders — the MESSAGE on that path is the frontend's own sentence"],
  // Reads the message to build a CallError for the classifier — the opposite of
  // rendering it.
  ['src/common/lib/supabase/callEdgeFn.ts', 'builds the classifiable CallError off a functions-js failure'],
  // Not server errors at all.
  ['src/crosswords/components/pickers/UploadPickerBlockingModal.tsx', 'a FileReader failure reading a local .ipuz'],
  // GoTrue auth errors are the AUTH SERVICE's own user-facing text ("Token has
  // expired or is invalid") — not our DB speaking, no fe-error-keys, and its
  // sentences are written for end users. The form line shows them as-is.
  ['src/common/components/auth/LoginScreen.tsx', "GoTrue's own user-facing auth errors, shown in the form line"],
  ['src/common/components/game/PlayAreaErrorBoundary.tsx', 'a React render error, not a server one'],
  // The boot catch. Nothing has rendered and no call has been made — the error
  // is a theme chunk that would not load or a missing `#root`, so there is no
  // envelope to classify and no server sentence to protect a player from. It
  // paints the message because the alternative is a blank page with the one
  // useful fact thrown away.
  ['src/main.tsx', 'a boot failure, which has no envelope and no server sentence'],
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
        if (!MESSAGE_READ.test(line)) return
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

  // ── The same failure one layer up ──────────────────────────
  //
  // `fault: true` on a feedback message routes it to `showFaultModal`, which was
  // how a call site raised the fault modal before the modal became central. It
  // is now raised by `runRpc` / `runEdgeFn` / `readRows`, WITH the diagnostics
  // only the transport layer can build — so a call site setting the flag pops a
  // SECOND modal carrying less than the first.
  //
  // That is not hypothetical: all fourteen "New game" buttons did it, and the
  // player dismissed one modal to find a poorer copy behind it. Nothing failed;
  // there is no dedupe in `faultStore` and both simply queued.
  it('no call site marks a feedback message as a fault', () => {
    // `serverError.ts` is the unconverted system's classifier and still owns the
    // flag; it goes when the roster empties, and this list should empty with it.
    const OWNS_THE_FLAG: string[] = []
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      if (OWNS_THE_FLAG.includes(file)) continue
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // Comment lines are prose ABOUT the flag — the pill renderer and the
        // fault store both describe the routing they implement. A guard that
        // counted those would fail on its own subject matter, which is how
        // `serverErrorKeys.test.ts` came to believe a dead key was still live.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (/\bfault:\s*true\b/.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(
      offenders,
      'the modal is raised centrally — use getNotOkFeedback and let the pill carry the words',
    ).toEqual([])
  })

  it('the allowlist has no stale entries', () => {
    // A file that stopped touching `.message` should leave the list, so the list
    // keeps meaning "these are the exceptions" rather than accumulating.
    const stale = [...ALLOWED.keys()].filter((f) => {
      const src = readFileSync(f, 'utf8')
      return !MESSAGE_READ.test(src)
    })
    expect(stale, 'allowlisted but no longer touching .message — remove').toEqual([])
  })
})
