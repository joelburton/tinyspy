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
      // NOT psychicnum's PlayArea, for stackdown's reason below: its `submit_guess`
      // and its three reads are converted, and its in-game New Game is not.
      // NOT stackdown's PlayArea: its three gameplay RPCs are converted and are
      // the model the rules came from, but its in-game New Game still calls
      // `create_game` with the negated form — the half its roster entry leaves
      // open, deferred with the whole create_game group. Listing it here is how
      // this guard caught my own bookkeeping being wrong on its first run.
    ]
    const regressed = CONVERTED.filter((f) => NEGATED.test(readFileSync(f, 'utf8')))
    expect(regressed, 'a converted file went back to the negated form').toEqual([])
  })
})
