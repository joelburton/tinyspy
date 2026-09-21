// cs-met-found-words

/**
 * The found-words family's two data shapes: one accepted guess, and one entry
 * of a word list the board ships with.
 *
 * A game in the family keeps a `<schema>.found_words` table, and they agree
 * column for column but for the pangram flag. What differs between them is the
 * BOARD — a hive, a wheel, a square of dice — and that lives in each game's own
 * header type, never here.
 *
 * `is_pangram` is optional because not every board has the concept, and a table
 * for a board that doesn't has no such column. Absent reads as false at every
 * site that shows it, which is the shape `WordListRow` already settled on and
 * what `buildRevealWords` and `buildWordListRows` are generic over.
 */

/** One entry of a shipped word list, required or bonus. Carries points + the
 *  pangram flag so the FE validates + scores a guess locally. The reveal is
 *  this wrapped — `RevealWord<FoundWordsWord>` adds the tag saying which of the
 *  two lists an entry came from. */
export type FoundWordsWord = { word: string; points: number; is_pangram?: boolean }

/** One accepted guess (a row of `<schema>.found_words`). */
export type FoundWordRow = {
  game_id: string
  user_id: string
  word: string
  points: number
  is_pangram?: boolean
  is_bonus: boolean
  found_at: string
}
