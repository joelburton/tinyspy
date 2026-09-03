// cs-met-deep

import { logStamp } from '../util/logStamp'
import type { Severity } from './envelope'

/**
 * **The `[db]` console line** — its vocabulary, its fixed shape, and the two
 * functions that write one.
 *
 * The lowest layer of the server-result system, and the only one with no
 * opinion about what a failure MEANS: it is handed fields and it formats them.
 * `dbFetch` (the transport) and `dbResult` (the wrappers) both write lines, and
 * neither imports the other — they meet here.
 *
 * `[db]` is its own console channel, beside `[rt]` (realtime) and `[ui]`, so
 * filtering to it gives every database call and nothing else.
 */

/**
 * What a `[db]` line is ABOUT, and how loudly. One word, six values, and it
 * decides the console method as well as the label — so a line's level and its
 * severity can never disagree.
 *
 *     FAULT            a bug
 *     SERVICE_ERROR    something we depend on didn't answer
 *     SLOW             a call over the threshold that still worked
 *     RACE             a race the player lost
 *     FORM_VALIDATION  the values you sent
 *     OK               it worked
 *
 * **Four of the six are a severity, spelled the same way.** A level named for
 * what it is about would drift from the severity it prints beside — a bare
 * `ERROR` on a line whose `severity=service-error` invites the reader to wonder
 * which of the two they are looking at, and `error` is the word this system
 * exists to stop using loosely. `SLOW` and `OK` are the exceptions because they
 * are `dbFetch` narrating transport, where no envelope reached a decision.
 *
 * Why each sits at the console method it does — including why `RACE` is `warn`
 * when nothing is wrong — is in docs/envelopes.md → the `[db]` line.
 */
export type LogLevel =
  'FAULT' | 'SERVICE_ERROR' | 'SLOW' | 'RACE' | 'FORM_VALIDATION' | 'OK'

/** Which function on `console` writes a line at each level — the values are
 *  literally its method names, called as `console[…]`, which is why the browser's
 *  own level filter is the only volume control this needs. */
const LOGLEVEL_TO_CONSOLE_LOG_METHOD: Record<LogLevel, 'error' | 'warn' | 'debug'> = {
  FAULT: 'error',
  SERVICE_ERROR: 'warn',
  SLOW: 'warn',
  RACE: 'warn',
  FORM_VALIDATION: 'debug',
  OK: 'debug',
}

/**
 * Everything a `[db]` line can carry. **Every field prints, every time**, empty
 * after the `=` when there is nothing to say — so the same fact is always in the
 * same position whether you are reading one line or scanning fifty, and a blank
 * is itself information (no `dbcode` means nothing raised; no `status` means the
 * server never answered).
 */
export type DiagFields = {
  /** `METHOD /path`. The one field that is never blank. */
  call: string
  // `| null` because an envelope's are always PRESENT and null when empty, and
  // this reads them straight through. The formatter already treats the two
  // alike (`fieldValue` returns '' for either), so this only lets the type say so.
  severity?: Severity | null
  outcome?: string | null
  dbcode?: string | null
  status?: number
  /** Round-trip milliseconds. Known where the fetch happens, not after it. */
  ms?: number
  /** The raise's COLUMN, on a form-validation. */
  field?: string | null
  /** The debugging line: the raise's DETAIL, Postgres's details + hint, or the
   *  thrown JS error. Never shown to a player. */
  detail?: string | null
}

/** What the LAYER THAT MADE THE REQUEST knows and the envelope cannot: which
 *  call it was, what the server answered, how long it took. `ms` matters more
 *  than it looks — an instant reject is a dead connection and a 30-second one is
 *  a timeout on a live connection, and they arrive with the same message. */
export type Transport = {
  call: string
  status?: number
  ms?: number
  /** What the REQUEST knew, which no envelope can carry: the device's own state
   *  at the moment of the call. `dbFetch` has always passed one; the type simply
   *  did not say so, which is how it came to be silently dropped below. */
  detail?: string
}

/** A field's value for the `[db]` line: itself, or **empty** when it has nothing
 *  to say. Both "absent" and "explicitly null" print as nothing, because the
 *  line's promise is that a blank means the same thing wherever you see one —
 *  an envelope's keys are always present and often null, while the transport's
 *  are simply missing, and a reader should not have to know which they are
 *  looking at. */
const fieldValue = (x: unknown) => (x === undefined || x === null ? '' : String(x))

/** The same, for **free text**, wrapped in quotes so its spaces and `|` cannot
 *  be mistaken for the line's own delimiters — and with its own quotes escaped,
 *  since Postgres routinely hands back a hint like `Perhaps you meant
 *  "clubs.name"` and an unescaped one makes the line unparseable exactly where
 *  it is most worth parsing. An empty string prints as nothing rather than as
 *  `""`, so it reads like every other empty field. */
const quotedText = (x: unknown) =>
  x === undefined || x === null || x === '' ? '' : `"${String(x).replace(/"/g, '\\"')}"`

/**
 * **The diagnostics line** — every field, in a fixed order, empty after the `=`
 * when there is nothing to say. The same fact is always in the same position,
 * and a blank is itself information: no `dbcode` means nothing raised, no
 * `status` means the server never answered.
 *
 * Pure, so a surface can build one during render — an `<ErrorPage>` showing a
 * failure that was already logged where it happened.
 */
export function diagnosticsLine(level: LogLevel, f: DiagFields): string {
  return [
    logStamp(),
    level,
    f.call,
    `severity=${fieldValue(f.severity)}`,
    `outcome=${fieldValue(f.outcome)}`,
    `dbcode=${fieldValue(f.dbcode)}`,
    `status=${fieldValue(f.status)}`,
    `ms=${fieldValue(f.ms)}`,
    `field=${fieldValue(f.field)}`,
    `detail=${quotedText(f.detail)}`,
  ].join(' | ')
}

/**
 * **A call took too long.** The one `[db]` line that is about the REQUEST rather
 * than about an answer — it says how long, and nothing about what came back.
 *
 * It carries fewer fields than every other line, on purpose. The fixed list is a
 * promise that a blank means something: no `dbcode` means nothing raised, no
 * `status` means nothing answered. This line is written before the body is read,
 * so it can keep neither — printing `dbcode=` would say the response carried no
 * code, when the truth is that nobody looked. Omitted beats empty.
 */
export function logSlow(f: { call: string; ms?: number; detail?: string }): void {
  console[LOGLEVEL_TO_CONSOLE_LOG_METHOD.SLOW](
    `[db] ${[logStamp(), 'SLOW', f.call, `ms=${fieldValue(f.ms)}`, `detail=${quotedText(f.detail)}`].join(' | ')}`,
  )
}

/**
 * **Write one `[db]` line, and hand back its diagnostics half.**
 *
 * The console gets the whole line; the returned string is the same thing minus
 * the trailing `msg=`, which is what the fault modal and `<ErrorPage>` show
 * under the message — no point printing the message twice on a surface that
 * already leads with it.
 *
 * Built ONCE and shared, so the screen and the log carry the same timestamp as
 * well as the same fields. Two `logStamp()` calls would drift immediately.
 *
 * `[db]` is its own console channel, beside `[rt]` (realtime) and `[ui]`, so
 * filtering to it gives every database call and nothing else.
 */
export function logDb(level: LogLevel, f: DiagFields, message?: string | null): string {
  const diagnostics = diagnosticsLine(level, f)
  // `null` as well as `undefined`: an `ok` envelope always CARRIES a `message`
  // key and it is usually null, so "nothing to say" arrives both ways.
  console[LOGLEVEL_TO_CONSOLE_LOG_METHOD[level]](
    `[db] ${diagnostics}${message === undefined || message === null ? '' : ` | msg=${quotedText(message)}`}`,
  )
  return diagnostics
}
