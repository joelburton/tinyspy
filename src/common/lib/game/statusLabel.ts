/**
 * The vocabulary every game's `labelFor` speaks — the club-page **status
 * line**, the second line of a game card (see docs/game-status-labels.md).
 *
 * Thirteen games each wrote their own strings and drifted into six words for
 * "in progress" and four phrasings of "alice won". These helpers exist so the
 * shape is decided once:
 *
 *     OUTCOME (why) · other · facts
 *
 * with exactly two devices — **parentheses for a reason**, and **`·` between
 * facts** — and one of four leading words: `Playing`, `Won`, `Lost`, `Ended`.
 * The lead is what survives truncation on a narrow card, so it carries the
 * thing you scan for.
 *
 * Two conventions worth stating, because they're easy to get subtly wrong:
 *
 *   - A **reason belongs on a loss or an end, not on a win.** `Won by alice
 *     (out of time)` fights itself; how a win arrived rarely matters.
 *   - **A status line may only say what every player already sees.** It's
 *     rendered from `common.games.status`, which is readable by the whole
 *     club, so a compete game's private per-player progress must NOT appear
 *     here — that's why several compete labels are a bare `Playing`.
 */

import { DIFFICULTY_LABELS } from './difficulty'

/** The separator between facts. One character, one meaning. */
const SEP = ' · '

/**
 * Join the parts of a status line, dropping the empty ones — so a caller can
 * write the optional facts inline (`count && \`${count} left\``) instead of
 * assembling an array by hand.
 */
export function statusLine(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(SEP)
}

/**
 * An outcome word with an optional parenthesised reason:
 * `Lost` / `Lost (out of time)`. The reason is the *why*, phrased in the
 * game's own noun — "out of guesses", "out of swaps", "4 mistakes".
 */
export function outcome(word: 'Playing' | 'Won' | 'Lost' | 'Ended', reason?: string | null): string {
  return reason ? `${word} (${reason})` : word
}

/** `Won by alice` — the winner is extra info about the outcome, so no parens. */
export function wonBy(username: string | null | undefined): string {
  return username ? `Won by ${username}` : 'Won'
}

/**
 * The dictionary band a game was set up with: `dict "Familiar"`.
 *
 * Only for the games whose FEEL changes a lot between bands (waffle, wordle,
 * stackdown) — for spellingbee or boggle the band barely shows, and a constant
 * word on every row would just eat the card's width. Quoted because a bare
 * `dict Familiar` reads like a typo; the band names aren't self-evident.
 */
export function dictLabel(band: number | null | undefined): string | null {
  if (band == null) return null
  const name = DIFFICULTY_LABELS[band - 1]
  return name ? `dict "${name}"` : null
}

/** Read a numeric setup field off the (untyped) listing row. */
export function setupNum(
  setup: Record<string, unknown> | null,
  key: string,
): number | null {
  const v = setup?.[key]
  return typeof v === 'number' ? v : null
}

/** `2/3 found`, `21/50 pts` — a tally, or null when either half is missing. */
export function tally(
  have: number | null | undefined,
  total: number | null | undefined,
  noun: string,
): string | null {
  if (have == null || total == null) return null
  return `${have}/${total} ${noun}`
}

/** `1 mistake` / `2 mistakes` — pluralise a counted noun. */
export function count(n: number | null | undefined, noun: string, plural = `${noun}s`): string | null {
  if (n == null) return null
  return `${n} ${n === 1 ? noun : plural}`
}
