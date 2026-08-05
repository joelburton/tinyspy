/**
 * The help vocabulary — ONE definition of what each help rung shows, because
 * three surfaces must agree word-for-word: the requester's own pill (askHelp),
 * the teammates' echoed pill (the peer-events narration), and the turn log's
 * lasting record. Drift between them would make the same hint read as
 * different information to different players.
 */

/**
 * The hint's opening letters: 3 normally, 4 for a long word (> 8) — enough to
 * find the word's start on the board without handing the whole thing over.
 */
export function hintPrefix(word: string): string {
  return word.slice(0, word.length > 8 ? 4 : 3).toUpperCase()
}

/** The pill text for a help rung: the hint DESCRIBES the word, the spoiler IS it. */
export function helpPillText(kind: 'hint' | 'spoiler', word: string): string {
  return kind === 'hint'
    ? `${word.length} letters starting with ${hintPrefix(word)}`
    : word.toUpperCase()
}
