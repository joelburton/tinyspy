// cs-unmet

/**
 * THE RESULT CODES — the three strings a refusal carries that nothing else
 * checks, and each of which fails somewhere nobody looks.
 *
 * Two places write them, from ONE sequence. A SQL raise says
 * `errcode` / `hint` / `column`; an edge function builds the envelope directly
 * and writes `dbcode` / `severity` / `field`. Both are text, typed by hand, in
 * files TypeScript never reads — a `.sql` and a Deno `.ts`:
 *
 *   - **a mistyped errcode** (`PN04`, `PNO44`) does not match `^P[AN][0-9]{3}$`,
 *     so the RPC's own handler RE-RAISES it. The player gets a raw Postgres
 *     fault instead of the sentence the author wrote two lines above.
 *   - **a REUSED code** makes two different refusals indistinguishable to any
 *     call site that branches on `dbcode` — and one already does. Reading both
 *     sources together is what keeps a Deno code from picking a number some
 *     `raise` already took.
 *   - **a mistyped hint** (`validaton`, `Fault`) lands in `severity` verbatim,
 *     so the envelope is well-formed and wrong: the frontend matches none of
 *     its arms and the message wears whatever the default look is.
 *
 * The digits are allocated max+1 and never reused, so a GAP is fine — it means
 * a raise was deleted, and its code stays retired. Only reuse is an error.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SQL_DIR = resolve(HERE, '../../supabase/sql')
/** The edge functions carry codes too, as literals in the envelopes they
 *  build. They are allocated from the SAME sequence as SQL's, so both have to
 *  be read together or a Deno code and a raise could pick the same number. */
const FN_DIR = resolve(HERE, '../../supabase/functions')

/** The two vocabularies HINT is drawn from, by branch. `PA` codes are results
 *  that read as an outcome; `PN` codes are failures with a severity. Pinned to
 *  the TypeScript unions by the last test in this file. */
const OUTCOMES = new Set(['won', 'lost', 'near', 'warning', 'neutral', 'noted'])
const SEVERITIES = new Set(['fault', 'race', 'form-validation', 'service-error'])

/** `error` is a full member of `Outcome` — a `not-ok`'s default appearance is
 *  that word — but a SUCCESSFUL result never reads as a failure, so a `PA`
 *  raise may not take it. The type can't say that (both arms hold an `Outcome`
 *  and the ok arm's restriction is about meaning, not shape), so this is where
 *  the rule actually lives, checked against the SQL that authors the value. */
const NOT_ON_A_SUCCESS = 'error'

/** The Deno builders in `_shared/envelope.ts`, and the severity each writes.
 *  **Every builder that takes a code belongs here**: one left out is not a
 *  failure but a silence — its codes never reach the uniqueness check, and the
 *  next-number line reports a number already in use. `serviceError` (then
 *  spelled `environmental`) was missing exactly that way, hiding three. */
const FN_BUILDERS: Record<string, string> = {
  fault: 'fault',
  // The value form, for `runRpc`'s two codes — an inbound failure has to be an
  // envelope the caller branches on, not a Response it returns blindly. Same
  // severity, so the same hint; invisible to this guard until it was named here.
  faultEnvelope: 'fault',
  formValidation: 'form-validation',
  serviceError: 'service-error',
}

type Raise = { file: string; code: string; hint: string | null }

/** Every `.ts` under `supabase/functions/`, at any depth. */
function fnFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fnFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  )
}

function raises(): Raise[] {
  const found: Raise[] = []
  // SQL: the code and the hint are separate `using` clauses on one raise.
  for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, file), 'utf8')
    for (const m of sql.matchAll(/errcode\s*=\s*'([^']*)'([\s\S]{0,200})/g)) {
      if (!/^P[AN]/.test(m[1]!)) continue // a real Postgres code, not one of ours
      const hint = m[2]!.match(/hint\s*=\s*'([^']*)'/)
      found.push({ file, code: m[1]!, hint: hint ? hint[1]! : null })
    }
  }
  // Deno, two spellings. `_shared/envelope.ts` builds a refusal through a
  // helper NAMED for its severity, which is where the hint comes from — a
  // `fault(` call cannot be a form-validation, so there is no second string to
  // mistype and no way to omit it. A literal envelope object spells it out
  // instead, as `dbcode` + `severity`.
  //
  // Both are read, because a code allocated either way has to be visible to the
  // reuse check. It is not hypothetical: the first eleven Deno codes were
  // written as helper arguments while this only knew the object form, and the
  // guard cheerfully reported the next number to allocate as one already taken.
  for (const path of fnFiles(FN_DIR)) {
    const ts = readFileSync(path, 'utf8')
    const file = path.slice(path.indexOf('functions/'))
    const builders = new RegExp(`\\b(${Object.keys(FN_BUILDERS).join('|')})\\(\\s*\\n?\\s*'([^']*)'`, 'g')
    for (const m of ts.matchAll(builders)) {
      found.push({ file, code: m[2]!, hint: FN_BUILDERS[m[1]!]! })
    }
    for (const m of ts.matchAll(/dbcode:\s*'([^']*)'([\s\S]{0,200})/g)) {
      const near = m[2]!.match(/(?:severity|outcome):\s*'([^']*)'/)
      const before = ts.slice(Math.max(0, m.index! - 200), m.index!)
      const back = before.match(/(?:severity|outcome):\s*'([^']*)'/)
      found.push({ file, code: m[1]!, hint: near ? near[1]! : back ? back[1]! : null })
    }
  }
  return found
}

describe('the raise codes', () => {
  it('finds them at all', () => {
    // A regex that matched nothing would let every assertion below pass while
    // proving nothing — the failure mode a guard must not have.
    expect(raises().length).toBeGreaterThan(40)
  })

  it('is shaped so the handler recognizes it as ours', () => {
    const malformed = raises()
      .filter((r) => !/^P[AN][0-9]{3}$/.test(r.code))
      .map((r) => `${r.file}: ${r.code}`)
    expect(malformed, 'a code the catch block will re-raise as a raw fault').toEqual([])
  })

  it('never reuses a number', () => {
    const seen = new Map<string, string[]>()
    for (const r of raises()) seen.set(r.code, [...(seen.get(r.code) ?? []), r.file])
    const reused = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([code, files]) => `${code} raised in ${files.join(', ')}`)
    expect(reused, 'two refusals sharing a code are indistinguishable to a caller').toEqual([])
  })

  it('says which kind of thing it is', () => {
    const hintless = raises()
      .filter((r) => r.hint === null)
      .map((r) => `${r.file}: ${r.code}`)
    expect(hintless, 'a raise with no HINT — the envelope would carry no severity').toEqual([])
  })

  it('draws its hint from the vocabulary its branch uses', () => {
    const wrong = raises()
      .filter((r) => {
        const allowed = r.code.startsWith('PA') ? OUTCOMES : SEVERITIES
        return r.hint !== null && !allowed.has(r.hint)
      })
      .map((r) => `${r.file}: ${r.code} says hint='${r.hint}'`)
    expect(wrong, 'a hint outside the vocabulary lands in the envelope verbatim').toEqual([])
  })

  // A form-validation says WHICH FIELD in COLUMN, and `'_'` is the spelling for
  // "not one field" (docs/envelopes.md → The keys). A raise that writes neither
  // is not caught by anything downstream: `get stacked diagnostics` hands the
  // handler '' for a missing column, the envelope carries `field: null`, and
  // every form reads that as its own line via `?? FORM_ERROR_KEYNAME`. The
  // message lands somewhere plausible and nobody notices it is the wrong place.
  //
  // SQL only. The Deno builder takes the field as a required argument, so it
  // cannot be left out there.
  it('names a column on every form-validation raise', () => {
    const columnless: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      for (const m of sql.matchAll(/raise exception\s[\s\S]*?\busing\b([\s\S]*?);/g)) {
        const using = m[1]!
        if (!/hint\s*=\s*'form-validation'/.test(using)) continue
        if (/\bcolumn\s*=/.test(using)) continue
        const code = using.match(/errcode\s*=\s*'([^']*)'/)
        columnless.push(`${file}: ${code ? code[1] : '(no errcode)'}`)
      }
    }
    expect(columnless, "a form-validation with no COLUMN — say the field, or '_' for none").toEqual([])
  })

  // A `not-ok` says how bad it is in HINT and how it READS in CONSTRAINT, and
  // the second is easy to write and lose: `get stacked diagnostics` only gives
  // you the fields you ask for, so a handler that doesn't request
  // `constraint_name` drops the override on the floor. Nothing fails, nothing
  // logs — the pill just wears the severity's default and looks fine.
  //
  // **The handler is not always the raiser's own.** A HELPER — one with no
  // `exception` block at all — cannot drop anything, because the raise leaves
  // it untouched and lands in whichever caller catches. So for those the
  // question moves outward: every function that calls it has to read the field,
  // and a caller that is itself handler-less passes the question on again.
  // `common._set_conceded` is the shape that forced this: it writes
  // `constraint='noted'` for the two concede races and SEVENTEEN handlers read
  // it back, none of them its own.
  it('reads back every outcome override a raise writes', () => {
    const missing: string[] = []
    const badWord: string[] = []

    /** Every function in `supabase/sql/`, by qualified name. */
    const bodies = new Map<string, { file: string; body: string }>()
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      // Split on function boundaries so "does the handler read it" is asked of
      // the SAME function that raised it, not of the file.
      for (const body of sql.split(/create or replace function /).slice(1)) {
        bodies.set(body.slice(0, body.indexOf('(')).trim(), { file, body })
      }
    }
    const catches = (body: string) => /^exception when /m.test(body)
    const reads = (body: string) => body.includes('constraint_name')

    /** Who, if anyone, would drop this helper's override. Walks outward until
     *  it meets a handler: that one either reads the field or is the offender. */
    function droppedBy(helper: string): string[] {
      const bad: string[] = []
      const seen = new Set([helper])
      const queue = [helper]
      while (queue.length) {
        const callee = queue.shift()!
        for (const [name, { body }] of bodies) {
          if (seen.has(name) || !body.includes(`${callee}(`)) continue
          if (catches(body)) {
            if (!reads(body)) bad.push(name)
          } else {
            seen.add(name)
            queue.push(name)
          }
        }
      }
      return bad
    }

    for (const [fn, { file, body }] of bodies) {
      for (const m of body.matchAll(/constraint = '([^']*)'/g)) {
        if (!OUTCOMES.has(m[1]!) && m[1] !== NOT_ON_A_SUCCESS) {
          badWord.push(`${file}: ${fn} says constraint='${m[1]}'`)
        }
        if (catches(body)) {
          if (!reads(body)) {
            missing.push(`${file}: ${fn} writes constraint='${m[1]}' but its handler never reads constraint_name`)
          }
        } else {
          for (const caller of droppedBy(fn)) {
            missing.push(`${file}: ${fn} writes constraint='${m[1]}' but ${caller}, which catches it, never reads constraint_name`)
          }
        }
      }
    }
    expect(missing, 'an outcome override nothing reads back').toEqual([])
    expect(badWord, 'an override outside the outcome vocabulary').toEqual([])
  })

  // A FAULT means the frontend let something through that it prevents, so its
  // sentence says that — `BUG: guess was not four tiles`, never `A guess must be
  // four tiles`, which recites a rule at someone who cannot have broken it
  // (docs/envelopes.md → A fault says what reached the server).
  //
  // Guarded because it was precedent and nothing else for months, and four
  // conversions broke it seven times without anyone noticing. Writing it down
  // was not enough; the next conversion reads this file's failures, not the doc.
  it('prefixes every fault caused by a bug with BUG:', () => {
    // A fault about a STATE rather than about something malformed that arrived.
    // The idiom does not fit these and the plain sentence is right: the game is
    // gone, your session expired, your budget is spent. Keep this list SHORT —
    // adding to it is the move this guard exists to make deliberate.
    const STATE_NOT_BUG = new Set([
      'Signed out; try refresh',
      'Your session expired — signing you out.',
      'Your profile is no longer on the server. Please refresh.',
      'You are not a member of this club',
      'You are not in this game',
      'That game no longer exists',
      'No guesses left',
      'No swaps left',
      'Already solved',
      "You can't edit the dictionary",
      // A lapsed session is a real state, not our bug — the frontend cannot send
      // an Authorization header it does not have (Joel, 2026-08-31).
      'You are not signed in.',
    ])
    const offenders: string[] = []
    const seen = new Set<string>()
    const check = (file: string, msg: string) => {
      seen.add(msg)
      if (msg.startsWith('BUG: ') || STATE_NOT_BUG.has(msg)) return
      offenders.push(`${file}: ${msg}`)
    }
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      for (const m of sql.matchAll(/raise exception\s+'((?:[^']|'')*)'((?:[^;']|'[^']*')*);/g)) {
        if (!/hint\s*=\s*'fault'/.test(m[2]!)) continue
        check(file, m[1]!.replace(/''/g, "'"))
      }
    }
    // The Deno half, which this guard did not read until 2026-08-31 — which is
    // why those messages drifted to a second idiom nobody chose. They copied the
    // paragraph in envelopes.md that EXPLAINS the rule ("…reached the server")
    // rather than the rule above it, and nothing was looking.
    //
    // A template literal is normalized to its `${…}` source text, not evaluated:
    // the guard only cares whether the sentence opens with `BUG: `, and an
    // interpolated value never appears at the front.
    for (const path of fnFiles(FN_DIR)) {
      const ts = readFileSync(path, 'utf8')
      const file = path.slice(path.indexOf('functions/'))
      for (const m of ts.matchAll(
        /\b(?:fault|faultEnvelope)\(\s*\n?\s*'(PN\d{3})'\s*,\s*\n?\s*(`(?:[^`]*)`|'(?:[^']*)')/g,
      )) {
        check(file, m[2]!.slice(1, -1))
      }
    }
    expect(
      offenders,
      'a fault that reads like a game rule — prefix it `BUG: `, or justify it in STATE_NOT_BUG',
    ).toEqual([])
    // The list must not outlive what it excuses, or it stops meaning "these are
    // the exceptions" and starts meaning "these were, once". Same arm
    // `noRawServerMessage.test.ts` carries on its own allowlist.
    expect(
      [...STATE_NOT_BUG].filter((m) => !seen.has(m)),
      'excused but no longer raised — remove it',
    ).toEqual([])
  })

  // The same contract from the OTHER side. A raise cannot break it — every `PA`
  // raise must carry a HINT, checked above — but `common.ok_envelope` takes its
  // data, outcome and message as three independent arguments, so nothing stops
  // a plain `ok_envelope(x, null, 'some words')`. A non-null message means
  // "render this" and the outcome is how it renders; without one a call site
  // has nothing to do but guess, which is how a server bug becomes a pill
  // nobody questions (`dbResult.ts` faults on it at runtime; this stops it
  // being written).
  it('never builds an ok with a message and no outcome', () => {
    const offenders: string[] = []
    for (const file of readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8')
      for (const m of sql.matchAll(/common\.ok_envelope\(([\s\S]{0,400}?)\);/g)) {
        const args = m[1]!
        // Named form: `message => …` with no `outcome => …` beside it.
        if (/\bmessage\s*=>/.test(args) && !/\boutcome\s*=>/.test(args)) {
          offenders.push(`${file}: ok_envelope(… message => …) with no outcome`)
          continue
        }
        // Positional form: (data, outcome, message) — a third argument with a
        // literal `null` in the second slot.
        if (/^\s*[^,]+,\s*null\s*,\s*'/.test(args)) {
          offenders.push(`${file}: ok_envelope(…, null, '…') — a message with no outcome`)
        }
      }
    }
    expect(offenders, 'an `ok` a caller could only render by guessing').toEqual([])
  })

  // The SQL↔TypeScript link, and the assertion most likely to rot unwatched:
  // the sets above are hand-written strings in a test, while the truth is a
  // union under `src/common/`. Nothing but this notices when someone adds a
  // severity and every SQL raise carrying it starts failing the vocabulary
  // check for a reason the message wouldn't explain.
  it('keeps its vocabularies equal to the TypeScript unions', () => {
    const union = (file: string, name: string): Set<string> => {
      const src = readFileSync(resolve(HERE, '../common', file), 'utf8')
      // Up to the next blank line, or the end of the file — a union is often
      // the last thing in its module, and requiring a trailing blank line would
      // make this fail for a reason that has nothing to do with vocabulary.
      const decl = src.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?)(?:\\n\\s*\\n|$)`))
      expect(decl, `couldn't find \`export type ${name}\` in ${file}`).toBeTruthy()
      return new Set([...decl![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!))
    }

    const outcomes = union('outcomes/outcomes.ts', 'Outcome')
    expect(outcomes.has(NOT_ON_A_SUCCESS), '`error` belongs to the outcome vocabulary').toBe(true)
    expect(
      [...OUTCOMES].sort(),
      "a PA raise's vocabulary is every outcome but `error`",
    ).toEqual([...outcomes].filter((o) => o !== NOT_ON_A_SUCCESS).sort())

    expect([...SEVERITIES].sort(), 'the severities, exactly').toEqual(
      [...union('supabase/envelope.ts', 'Severity')].sort(),
    )
  })

  /**
   * **The frontend authors codes too, and they share the PN sequence.**
   *
   * `PN307`–`PN310` are in `dbEnvelope.ts`, not in a raise — the letter says
   * what the code does to `type`, never who authored it, and that sequence
   * already spans SQL and 64 Deno raises. So the counter below has to see them
   * or it will hand out a number already taken.
   *
   * `FE001`–`FE004` are a separate class and a separate sequence, so they are
   * checked for uniqueness and shape here but do not feed the PN counter.
   */
  const frontendCodes = () => {
    const ts = readFileSync('src/common/supabase/dbEnvelope.ts', 'utf8')
    // The ASSIGNMENT form only — a docstring naming a code as an example is
    // prose, not an allocation, and counting it reports a duplicate that is
    // not one.
    return [...ts.matchAll(/^\s*\w+: '((?:PN|FE)[0-9]{3})',/gm)].map((m) => m[1]!)
  }

  it('the frontend-authored codes are unique, and unique against the raises', () => {
    const fe = frontendCodes()
    const dupes = fe.filter((c, i) => fe.indexOf(c) !== i)
    expect(dupes, 'a frontend code used twice').toEqual([])
    const raised = new Set(raises().map((r) => r.code))
    const clash = fe.filter((c) => raised.has(c))
    expect(clash, 'a frontend code that a SQL or Deno raise already uses').toEqual([])
  })

  it('reports the next number to allocate (a line, not a failure)', () => {
    const nums = [...raises().map((r) => r.code), ...frontendCodes()]
      .filter((c) => c.startsWith('PN'))
      .map((c) => Number(c.slice(2)))
    console.log(`[codes] ${new Set(nums).size} allocated; next PN is ${String(Math.max(...nums) + 1).padStart(3, '0')}`)
    expect(nums.length).toBeGreaterThan(0)
  })
})
