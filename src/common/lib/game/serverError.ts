import type { GenericFeedbackMsg } from '../games'
import { ERROR_COPY } from './errorCopy'

/**
 * Turning a failed server call into something a player reads.
 *
 * ─── The rule this enforces ──────────────────────────────────
 * **SQL enforces rules; TypeScript owns every word a player sees.** The server
 * never writes player-facing prose. It raises a machine-shaped key:
 *
 *     unplayable-board|BITCH|
 *     chain-full|5|
 *     already-ended|
 *
 * `key|detail1|detail2|…`, kebab-case, ALWAYS ending in the delimiter — the
 * trailing `|` is how you can tell on a phone whether you're seeing the whole
 * message or an ellipsised one.
 *
 * The shape is deliberately not prose: if one of these ever reaches a player it
 * must look like the bug it is, rather than like something we wrote for them.
 * The human explanation for whoever is debugging rides in PL/pgSQL's `DETAIL`,
 * which reaches the console and psql but is never shown.
 *
 * ─── Who decides what's expected ─────────────────────────────
 * `ERROR_COPY` alone. A key with copy is one we anticipated a player reaching,
 * so it gets a normal pill in whatever tone fits. A key WITHOUT copy — or a
 * failure carrying no key at all — is by definition unanticipated, and renders
 * as a fault: bare red text, visually unlike every normal message.
 *
 * The server is never asked to classify, deliberately. Whether a player can
 * reach a given raise depends on whether the FRONTEND checks the same rule
 * first, and that changes: `already-in-chain` is reachable in coop (a teammate
 * races you to the word) and unreachable in compete. The knowledge lives here,
 * so the declaration does too — and writing copy for a key IS the act of
 * declaring it expected.
 */

/** A parsed server key. `details` are the params after the key, in order. */
export type ServerKey = { key: string; details: string[] }

/**
 * Pull `key|detail1|detail2|` out of a server message, or null if it isn't one.
 *
 * Deliberately strict: a real key is kebab-case and the message ENDS with the
 * delimiter. Prose can't accidentally match, which matters during the migration
 * — every not-yet-converted message must fall through to the fault path rather
 * than being half-read as a key.
 */
export function parseServerKey(message: string | undefined | null): ServerKey | null {
  if (!message) return null
  if (!message.endsWith('|')) return null
  const parts = message.slice(0, -1).split('|')
  const key = parts[0]
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(key)) return null
  return { key, details: parts.slice(1) }
}

/** The shape every failed call is reduced to before it becomes a message. */
export type Failure =
  /** The server answered, with a key we have copy for. */
  | { kind: 'expected'; key: string; details: string[] }
  /** The server answered, but with something no one wrote copy for. */
  | { kind: 'fault'; raw: string }
  /** The request never reached the server. */
  | { kind: 'transport'; cause: 'Offline' | 'Server' }

/** The subset of a supabase error this needs. Structural so a PostgrestError,
 *  a FunctionsError, or a hand-built `{ message }` all satisfy it. */
export type CallError = { message?: string; code?: string } | null | undefined

/**
 * Classify a failed call.
 *
 * The transport test is `code`: PostgREST gives every server-produced error a
 * SQLSTATE (`P0001` for our raises, `42501`, `PGRST116`, …), while a rejected
 * fetch arrives with `code: ''` because nothing server-side produced it.
 *
 * Only two transport causes, not the three we sketched. `Offline` is a fact —
 * `navigator.onLine` said so. Telling a timeout from a dead connection would
 * need the elapsed time, and that measurement doesn't survive the trip: the
 * error a call site receives is one postgrest-js CONSTRUCTS, not the one
 * `dbFetch` saw, so the duration is gone by then. It's in the `[db]` console
 * line instead, which is the audience that can act on it.
 */
export function classifyFailure(error: CallError): Failure {
  const message = error?.message ?? ''
  if (!error?.code) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return { kind: 'transport', cause: offline ? 'Offline' : 'Server' }
  }
  const parsed = parseServerKey(message)
  if (parsed && ERROR_COPY[parsed.key]) {
    return { kind: 'expected', key: parsed.key, details: parsed.details }
  }
  return { kind: 'fault', raw: message }
}

/**
 * The player-facing message for a failed call.
 *
 * `action` is the player's word for what they were doing — "word", "reveal",
 * "new game" — supplied by the RPC wrapper, not by the server. It has to come
 * from this side because a shared helper like `common._require_turn` (called
 * from nine of the sixteen SQL files) cannot know which button reached it, and
 * because a transport failure has no server message to carry it at all.
 */
export function failureMessage(error: CallError, action: string): GenericFeedbackMsg {
  const failure = classifyFailure(error)

  if (failure.kind === 'expected') {
    const entry = ERROR_COPY[failure.key]
    return {
      tone: entry.tone ?? 'error',
      text: entry.text(failure.details),
      mode: { kind: 'sticky' },
    }
  }

  // ── Faults: NOT a pill ──────────────────────────────────────
  // `manual` so it survives the next keystroke: this is the message that has to
  // stay on screen long enough to be read down a phone line, and every other
  // dismissal path would take it away mid-sentence.
  if (failure.kind === 'transport') {
    return {
      tone: 'error',
      fault: true,
      text: `${action}: ${failure.cause}; try ${failure.cause === 'Offline' ? 'again' : 'refresh'}`,
      mode: { kind: 'manual' },
    }
  }
  return {
    tone: 'error',
    fault: true,
    // Raw and unedited. It isn't written for them — but hiding it behind
    // "something broke" would leave nothing to read back, and a friend reading
    // out `word|unplayable-board|BITCH|` is the whole diagnosis.
    text: `${action}|${failure.raw}`,
    mode: { kind: 'manual' },
  }
}
