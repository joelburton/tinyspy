// cs-unmet

/**
 * Guard: **a call site asks `=== 'not-ok'`, never `!== 'ok'`.**
 *
 * The negated form is a catch-all wearing a case's clothes — it compiles, it
 * narrows cleanly, and an answer that is neither `ok` nor `not-ok` is shown to
 * the player as a refusal (docs/envelopes.md → The shape of a call site).
 *
 * Why a guard at all, when the rule is written down: because writing it down
 * was not enough. Three of these were introduced BY the session that wrote the
 * rule, in the same file, minutes apart — the failure is not knowing the rule
 * but recognizing code as being in its scope, and a grep does not have that
 * problem (Joel, 2026-08-29).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The negated forms, both directions. `!== 'not-ok'` is the same defect one
 *  layer down — a helper re-asking what its caller already established. */
const NEGATED = /\.type\s*!==\s*'(ok|not-ok)'/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

function offenders(): string[] {
  const found: string[] = []
  for (const file of sourceFiles('src')) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // A docstring showing the bad form so a reader can recognize it is not
        // an instance of it — dbResult's and genericPills' examples are the
        // subject matter, the same trap serverErrorKeys fell into.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (NEGATED.test(line)) found.push(`${file}:${i + 1}  ${line.trim()}`)
      })
  }
  return found.sort()
}

describe('call-site shape', () => {
  it('nobody asks `!== ok` any more', () => {
    const left = offenders()
    console.log(
      `[envelope-sweep] ${left.length} call sites still ask \`!== 'ok'\`:\n` +
        left.map((o) => `  ${o}`).join('\n'),
    )
    // The scan works — asserted FIRST, because a guard that finds nothing
    // because it is looking at nothing passes just as quietly as one that
    // works, and that trap is the whole reason this line outlived the sweep.
    expect(sourceFiles('src').length).toBeGreaterThan(100)
    // Zero since 2026-09-01, when the last call site converted. It was a
    // REPORT for the length of the sprint — a hard assertion would have been
    // red for months and stopped meaning anything — and a manually-kept list of
    // finished files carried the rule in the meantime. That list is gone: this
    // line covers every file, which is the whole reason it could replace it.
    expect(left, 'the negated form is a catch-all wearing a case\'s clothes').toEqual([])
  })

  /**
   * Guard: **an `ok` branch states its arm** — `res.type === 'ok' && <the case>`,
   * never the case alone (docs/envelopes.md → Choosing which `ok` branch).
   *
   * Testing only `res.data.result === 'saved'` asserts a case while ASSUMING an
   * arm, and the assumption is that some earlier branch took every `not-ok`
   * away. That holds until someone narrows an earlier branch — `res.type ===
   * 'not-ok' && res.severity === 'fault'` is a real shape and already in the
   * repo — after which a `not-ok` reaches here, `res.data` is null by
   * construction, and the read THROWS rather than reaching the scream.
   *
   * Not hypothetical: `WordEditDialog` was doing exactly that, twice, in its own
   * test file, as an unhandled rejection that failed nothing.
   *
   * Keyed on `.data.` so it cannot confuse an envelope with an old-style
   * `{ data, error }` result cast to a local shape — scrabble's `res.result`
   * reads are the unconverted roster, not this rule's business.
   */
  /**
   * Guard: **`edgeFnTransport` is `runEdgeFn`'s, and nobody else's.**
   *
   * It is the transport adapter — it digs the real error out of a functions-js
   * failure and normalizes it into the `{ data, error }` shape a postgrest call
   * resolves to. What it does NOT do is read the envelope, log the outcome, or
   * present a fault; that is `runEdgeFn`, and a call site reaching past it gets
   * none of those.
   *
   * Five sites used to (the AI features and the definition lookup), which is
   * how they came to present nothing at all. They are converted; this is what
   * stops a sixth appearing — an editor's auto-import is all it would take,
   * since the export itself cannot say who it is for.
   *
   * TESTS may: mocking the adapter is how you drive the real `runEdgeFn` from a
   * component test, which is the opposite of reaching past it.
   */
  it('nothing but runEdgeFn imports edgeFnTransport', () => {
    const offenders = sourceFiles('src')
      .filter((f) => !f.endsWith('dbResult.ts') && !f.includes('edgeFnTransport') && !f.includes('.test.'))
      .filter((f) => /from '[^']*edgeFnTransport'/.test(readFileSync(f, 'utf8')))
    expect(
      offenders,
      'imported the transport adapter directly — it neither logs nor presents',
    ).toEqual([])
  })

  /**
   * Guard: **opting out is a promise to handle it.**
   *
   * `presentFaults: false` says *I will show my own faults* — not *drop them*.
   * The wrapper still writes the `[db]` line either way, so a file that opts
   * out and then shows nothing is not silent in the console; it is silent to
   * the PLAYER, which is the thing that cannot be noticed from a diff.
   *
   * A `showFaultModal`, a `reportUnhandled` or a `console.error` is enough to
   * satisfy this: the
   * point is that somebody thought about it, not that they picked a particular
   * surface. `useGameTimer` is the model — it is silent for the four `FE`
   * codes on purpose, and says so, and shows `PN011`/`PN012` itself.
   *
   * File-level, like the scream guard below, and for the same reason: it
   * catches the case that actually happens — an opt-out written without a plan
   * — rather than trying to pair each option with each branch.
   */
  it('a file that opts out of presenting shows something itself', () => {
    const offenders = sourceFiles('src')
      .filter((f) => !f.includes('/guards/') && !f.includes('.test.'))
      .filter((f) => {
        const text = readFileSync(f, 'utf8')
        return /presentFaults:\s*false/.test(text)
          && !/showFaultModal|reportUnhandled|console\.error/.test(text)
      })
    expect(
      offenders,
      'opted out of the modal and shows nothing — a fault the player never sees',
    ).toEqual([])
  })

  /**
   * Guard: **every call site ends in a scream.** `docs/envelopes.md` → the
   * shape of a call site says a chain closes with a bare `else` that reports
   * the fall-through. Since 2026-09-02 that is `reportUnhandled(call, answer)`,
   * which logs a `[db] FAULT` line and raises the modal; the sentence itself
   * lives in `dbEnvelope.ts` and nowhere else, which the third check below
   * keeps true. Nothing enforced any of it until now, and
   * the omission is invisible by construction: a missing `else` is a branch
   * that silently does nothing, which is exactly what it looks like when the
   * code is right.
   *
   * `useGameTimer` shipped without one (Joel caught it, 2026-08-31). It read as
   * three `if (…) return` statements — which ALSO slipped past the arm rule
   * below, because that one exempts a standalone `if` on data an earlier return
   * already narrowed. So writing early returns instead of a chain evaded both
   * halves at once.
   *
   * **Branching is what triggers it, not calling.** A manifest's
   * `startGameInClub` runs `runRpc` and hands the envelope straight back —
   * `SetupGameModal` is the one that reads it, and owns the scream. Producing
   * an envelope obliges nothing; asking it a question obliges an else.
   *
   * Deliberately coarse beyond that: it asks whether the same FILE that
   * branches also contains a scream, not whether each chain has its own. A file
   * with two chains and one scream passes. That is the cheap version, and it
   * catches the case that actually happens — a call site written without one.
   */
  it('a file that branches on an envelope also screams somewhere', () => {
    const CALLS = /\b(runRpc|runEdgeFn)\s*[<(]/
    const BRANCHES = /\.type === '(ok|not-ok)'/
    const offenders = sourceFiles('src')
      .filter((f) => !f.includes('/guards/') && !f.includes('.test.') && !f.endsWith('dbResult.ts'))
      .filter((f) => {
        const text = readFileSync(f, 'utf8')
        return CALLS.test(text) && BRANCHES.test(text)
          && !/reportUnhandled\(/.test(text)
      })
    expect(
      offenders,
      'a call site with no `else` scream — an answer it cannot read would vanish',
    ).toEqual([])
  })

  /**
   * Guard: **the scream's sentence has ONE author.**
   *
   * It used to be hand-written at 95 call sites — one string, ninety-five
   * copies, none of which could be changed centrally and none of which wrote a
   * `[db]` line. `reportUnhandled` replaced them all on 2026-09-02, and this is
   * what stops the ninety-sixth from being typed by hand: a convention held by
   * habit is precisely what produced the ninety-five.
   *
   * `dbEnvelope.ts` owns the words; everywhere else calls the function.
   */
  it('only dbEnvelope writes the fall-through sentence', () => {
    const offenders = sourceFiles('src')
      // Tests assert on the sentence, which is the one legitimate reason to
      // write it out — the same exclusion the two checks above make.
      .filter((f) => !f.endsWith('dbEnvelope.ts') && !f.includes('/guards/') && !f.includes('.test.'))
      .filter((f) => /fell through to unhandled/.test(readFileSync(f, 'utf8')))
    expect(
      offenders,
      'hand-written fall-through text — call reportUnhandled(call, answer) instead',
    ).toEqual([])
  })

  it('every `ok` branch states its arm', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (!/\bif\s*\(/.test(line) || !/\.data\./.test(line)) return
        if (/\.type === 'ok'/.test(line)) return
        // A branch of a CHAIN, which is what this rule is about — not a
        // standalone `if` on data an earlier `not-ok` return already narrowed.
        // A `} else if` is one by definition; a bare `if` is one only when the
        // block it opens is continued, so look ahead for that.
        const isChain =
          /}\s*else if\s*\(/.test(line) ||
          lines.slice(i + 1, i + 14).some((l) => /^\s*}\s*else\b/.test(l))
        if (!isChain) return
        offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(
      offenders,
      "an `ok` branch that assumes its arm — a not-ok reaching it throws on `data`",
    ).toEqual([])
  })
})
