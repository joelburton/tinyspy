// cs-fixed-outcome-fix

/**
 * ONE definition of what each rung SHOWS, because three surfaces must agree
 * word-for-word: the requester's own pill (`askForHintOrSpoiler`), the
 * teammates' echoed pill (the peer-events narration), and the turn log's
 * lasting record. Drift between them would make the same hint read as
 * different information to different players.
 *
 * What each rung is WORTH is `lib/answer.ts`'s to say.
 */

/**
 * The hint's opening letters: 3 normally, 4 for a long word (> 8) — enough to
 * find the word's start on the board without handing the whole thing over.
 */
export function hintPrefix(word: string): string {
  return word.slice(0, word.length > 8 ? 4 : 3).toUpperCase()
}

/** The pill text for a rung: the hint DESCRIBES the word, the spoiler IS it. */
export function hintOrSpoilerPillText(kind: 'hint' | 'spoiler', word: string): string {
  return kind === 'hint'
    ? `${word.length} letters starting with ${hintPrefix(word)}`
    : word.toUpperCase()
}
