// cs-unmet

/**
 * Guard: **a call site asks `=== 'not-ok'`, never `!== 'ok'`.**
 *
 * The negated form is a catch-all wearing a case's clothes — it compiles, it
 * narrows cleanly, and an answer that is neither `ok` nor `not-ok` is shown to
 * the player as a refusal (docs/envelopes.md → The shape of a call site).
 *
 * **This REPORTS rather than fails, for now.** The envelope sweep
 * (plans/envelope-rollout.md) is converting these one entry at a time, so a
 * hard assertion would be red for the length of the sprint and stop meaning
 * anything. The count printed on every run is the remaining work, and it only
 * goes down. `serverErrorKeys.test.ts` has the same shape for the same reason —
 * "a list, not a failure".
 *
 * **Flip it to a hard assertion the day the roster empties.** That is the last
 * step of the sweep, and the number below reaching zero is what says it is due.
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
  it('reports every remaining `!== ok` (a list, not a failure)', () => {
    const left = offenders()
    console.log(
      `[envelope-sweep] ${left.length} call sites still ask \`!== 'ok'\`:\n` +
        left.map((o) => `  ${o}`).join('\n'),
    )
    // The only assertion: the scan works. A zero here would mean the regex or
    // the walk broke, not that the sweep finished — and a guard that finds
    // nothing because it is looking at nothing passes just as quietly as one
    // that works. Delete this and assert `toEqual([])` when the roster empties.
    expect(sourceFiles('src').length).toBeGreaterThan(100)
  })

  it('the files already converted stay converted', () => {
    // Every file the sweep has finished. Adding one here is the last step of
    // its entry, and it is what makes the guard bite before the roster is done:
    // a converted file that grows a `!== 'ok'` fails immediately.
    const CONVERTED = [
      'src/common/components/club/ClubPage.tsx',
      'src/common/components/club/CreateClubModal.tsx',
      'src/common/components/club/EditClubModal.tsx',
      'src/common/components/home/HomePage.tsx',
      'src/common/components/chat/ChatBody.tsx',
      'src/common/hooks/chat/useClubChat.ts',
      'src/common/components/auth/ClaimHandleScreen.tsx',
      'src/common/components/account/EditProfileModal.tsx',
      'src/common/components/definitions/WordEditDialog.tsx',
      'src/common/components/definitions/AnagramDialog.tsx',
      'src/common/hooks/session/useSession.ts',
      'src/common/hooks/session/useProfile.ts',
      'src/common/hooks/game/useCommonGame.ts',
      'src/common/components/setup/SetupGameModal.tsx',
      'src/connections/components/BoardCol.tsx',
      'src/connections/components/PlayArea.tsx',
      'src/connections/components/SetupForm.tsx',
      'src/connections/hooks/useGame.ts',
      'src/psychicnum/components/BoardCol.tsx',
      'src/psychicnum/hooks/useGame.ts',
      'src/setgame/hooks/useGame.ts',
      'src/setgame/components/PlayArea.tsx',
      'src/setgame/manifest.ts',
      'src/waffle/components/PlayArea.tsx',
      'src/waffle/hooks/useGame.ts',
      'src/waffle/manifest.ts',
      'src/wordle/components/BoardCol.tsx',
      'src/wordle/components/PlayArea.tsx',
      'src/wordle/hooks/useGame.ts',
      'src/wordle/manifest.ts',
      'src/stackdown/components/PlayArea.tsx',
      'src/stackdown/hooks/useGame.ts',
      'src/stackdown/manifest.ts',
      'src/bananagrams/components/PlayArea.tsx',
      'src/bananagrams/manifest.ts',
      'src/boggle/components/PlayArea.tsx',
      'src/boggle/manifest.ts',
      'src/codenamesduet/components/PlayArea.tsx',
      'src/codenamesduet/manifest.ts',
      'src/crosswords/manifest.ts',
      'src/letterboxed/components/PlayArea.tsx',
      'src/letterboxed/manifest.ts',
      'src/psychicnum/components/PlayArea.tsx',
      'src/psychicnum/manifest.ts',
      'src/scrabble/components/PlayArea.tsx',
      'src/scrabble/manifest.ts',
      'src/spellingbee/components/PlayArea.tsx',
      'src/spellingbee/manifest.ts',
      'src/strands/components/PlayArea.tsx',
      'src/strands/manifest.ts',
      'src/wordiply/components/PlayArea.tsx',
      'src/wordiply/manifest.ts',
      'src/wordwheel/components/PlayArea.tsx',
      'src/wordwheel/manifest.ts',
      // EVERY file in `src/` that reads an envelope is now listed. When the
      // roster empties, delete this list and flip the report above into
      // `expect(offenders()).toEqual([])` — the guard's own docstring says so. Each joins as its own entry lands, which is
      // the list above growing one game at a time
      // (plans/envelope-rollout.md → create_game).
    ]
    const regressed = CONVERTED.filter((f) => NEGATED.test(readFileSync(f, 'utf8')))
    expect(regressed, 'a converted file went back to the negated form').toEqual([])
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
   * Guard: **opting out is a promise to handle it.**
   *
   * `presentFaults: false` says *I will show my own faults* — not *drop them*.
   * The wrapper still writes the `[db]` line either way, so a file that opts
   * out and then shows nothing is not silent in the console; it is silent to
   * the PLAYER, which is the thing that cannot be noticed from a diff.
   *
   * A `showFaultModal` or a `console.error` is enough to satisfy this: the
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
          && !/showFaultModal|console\.error/.test(text)
      })
    expect(
      offenders,
      'opted out of the modal and shows nothing — a fault the player never sees',
    ).toEqual([])
  })

  /**
   * Guard: **every call site ends in a scream.** `docs/envelopes.md` → the
   * shape of a call site says a chain closes with a bare `else` that reports
   * `BUG: <rpc> fell through to unhandled`. Nothing enforced it until now, and
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
          && !/BUG: .* fell through to unhandled/.test(text)
      })
    expect(
      offenders,
      'a call site with no `else` scream — an answer it cannot read would vanish',
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
