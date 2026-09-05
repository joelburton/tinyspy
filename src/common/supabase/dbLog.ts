// cs-blessed-deep

import { logStamp } from '../utils/logStamp'
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
 * `[db]` is one of the three stamped console channels, so filtering to it gives
 * every database call and nothing else. `logStamp.ts` names the three and why
 * they share a format.
 */

/**
 * **The db log kind** — what a `[db]` line is ABOUT, and how loudly. One word,
 * six values, and it decides the console method as well as the label, so a
 * line's kind and its severity can never disagree.
 *
 * Called a KIND rather than a level because "log level" is console's own idea —
 * `error` / `warn` / `debug`, which these six MAP TO but are not. The mapping is
 * `DB_LOG_KIND_TO_CONSOLE_LOG_METHOD` below, and it only reads as a mapping if
 * the two halves are named differently.
 *
 *     FAULT            a bug
 *     SERVICE_ERROR    something we depend on didn't answer
 *     SLOW             a call over the threshold that still worked
 *     RACE             a race the player lost
 *     FORM_VALIDATION  the values you sent
 *     OK               it worked
 *
 * **Four of the six are a severity, spelled the same way.** A kind named for
 * what it is about would drift from the severity it prints beside — a bare
 * `ERROR` on a line whose `severity=service-error` invites the reader to wonder
 * which of the two they are looking at, and `error` is the word this system
 * exists to stop using loosely. `SLOW` and `OK` are the exceptions because they
 * are `dbFetch` narrating transport, where no envelope reached a decision.
 *
 * Why each sits at the console method it does — including why `RACE` is `warn`
 * when nothing is wrong — is in docs/envelopes.md → the `[db]` line.
 */
export type DbLogKind =
  'FAULT' | 'SERVICE_ERROR' | 'SLOW' | 'RACE' | 'FORM_VALIDATION' | 'OK'

/** Which function on `console` writes a line of each db log kind — the values
 *  are literally its method names, called as `console[…]`, which is why the
 *  browser's own level filter is the only volume control this needs. */
const DB_LOG_KIND_TO_CONSOLE_LOG_METHOD: Record<DbLogKind, 'error' | 'warn' | 'debug'> = {
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
 *
 * **There is ONE way to say nothing here, and it is leaving the key out.**
 * `null` is the ENVELOPE's word for empty — its keys are always present, and
 * often null — so a value coming from one is converted on the way in, with
 * `?? undefined`, by whoever builds the fields (`envAndTransportToDiagFields`,
 * and `EnvelopeErrorPage`, which builds a line during render). Accepting both
 * would offer a distinction nothing downstream reads: a field prints blank
 * either way, and the two formatters below would each need to know it.
 */
export type DiagFields = {
  call: string                  // METHOD /path
  severity?: Severity
  outcome?: string
  dbcode?: string
  status?: number               // HTTP status
  ms?: number                   // Round-trip milliseconds.
  field?: string                // Raise's COLUMN, on a form-validation.
  detail?: string               // Debugging info, show in console + fault modal
}

/** What the LAYER THAT MADE THE REQUEST knows and the envelope cannot: which
 *  call it was, what the server answered, how long it took. `ms` matters more
 *  than it looks — an instant reject is a dead connection and a 30-second one is
 *  a timeout on a live connection, and they arrive with the same message. */
export type TransportFacts = {
  call: string                  // METHOD /path
  status?: number               // HTTP status
  ms?: number                   // Round-trip milliseconds
  // The device's own state at the moment of the call (`online=`, `hidden`).
  // `envAndTransportToDiagFields` appends the envelope's own detail to this
  // rather than letting either replace the other — they answer different
  // questions.
  detail?: string
}

/** A field's value for the `[db]` line: itself, or **empty** when the key was
 *  left out. Typed rather than `unknown` now that a missing field has one
 *  spelling — the only values a `[db]` field ever holds are a string, a number,
 *  or nothing. */
const fieldValue = (x: string | number | undefined) => (x === undefined ? '' : String(x))

/** The same, for **free text**, wrapped in quotes so its spaces and `|` cannot
 *  be mistaken for the line's own delimiters — and with its own quotes escaped,
 *  since Postgres routinely hands back a hint like `Perhaps you meant
 *  "clubs.name"` and an unescaped one makes the line unparseable exactly where
 *  it is most worth parsing. An empty string prints as nothing rather than as
 *  `""`, so it reads like every other empty field. */
const quotedText = (x: string | undefined) =>
  x === undefined || x === '' ? '' : `"${x.replace(/"/g, '\\"')}"`

/**
 * **The diagnostics line** — every field, in a fixed order, empty after the `=`
 * when there is nothing to say. The same fact is always in the same position,
 * and a blank is itself information: no `dbcode` means nothing raised, no
 * `status` means the server never answered.
 *
 * Pure, so a surface can build one during render — an `<ErrorPage>` showing a
 * failure that was already logged where it happened.
 */
export function diagnosticsLine(kind: DbLogKind, f: DiagFields): string {
  return [
    logStamp(),
    kind,
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
 */
export function logSlow(f: { call: string; ms?: number; detail?: string }): void {
  // Fewer fields than every other line, on purpose. The fixed list is a promise
  // that a blank means something: no `dbcode` means nothing raised, no `status`
  // means nothing answered. This line is written before the body is read, so it
  // can keep neither — printing `dbcode=` would say the response carried no code,
  // when the truth is that nobody looked. Omitted beats empty.
  console[DB_LOG_KIND_TO_CONSOLE_LOG_METHOD.SLOW](
    `[db] ${[logStamp(), 'SLOW', f.call, `ms=${fieldValue(f.ms)}`, 
      `detail=${quotedText(f.detail)}`].join(' | ')}`,
  )
}

/**
 * **Write one `[db]` line, and hand back its diagnostics half.**
 *
 * The console gets the whole line; the returned string is the same thing minus
 * the trailing `msg=`, which is what the fault modal and `<ErrorPage>` show
 * under the message — no point printing the message twice on a surface that
 * already leads with it.
 */
export function logDb(kind: DbLogKind, f: DiagFields, message?: string | null): string {
  // Built ONCE and shared, so the screen and the log carry the same timestamp as
  // well as the same fields. Two `logStamp()` calls would drift immediately.
  const diagnostics = diagnosticsLine(kind, f)
  // **The one place null still arrives**, and deliberately: `message` is handed
  // straight from an envelope by three of the four callers, and an envelope
  // always CARRIES the key with null in it. Converting at those call sites would
  // put `?? undefined` on each and buy nothing — the boundary is one comparison,
  // and it is here. Everything in `f` was normalized by whoever built it.
  console[DB_LOG_KIND_TO_CONSOLE_LOG_METHOD[kind]](
    `[db] ${diagnostics}${message === undefined || message === null ? '' : ` | msg=${quotedText(message)}`}`,
  )
  return diagnostics
}
