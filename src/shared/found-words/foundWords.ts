// cs-blessed-found-words

/**
 * The found-words family's two data shapes, as a game's `gd` holds them: one
 * legal word of the board, and one find.
 *
 * A game in the family ships every legal word with its board and keeps a
 * `<schema>.found_words` table of what was found; its builder writes both into
 * the page blob, and its `gd` turns a find's `userId` into the player. These
 * are those two rows, camel as every blob key is, with a predicate inside the
 * row bare (`bonus`, `pangram`). What differs between the games is the BOARD —
 * a hive, a wheel, a square of dice — and that lives in each game's own types,
 * never here.
 */

/** One legal word of the board, scored when the board was built. A bonus word
 *  is legal but not required: it scores and is accepted, and is not the goal;
 *  `pangram` is false on a board without the concept. */
export type FoundWordsWord = { word: string; points: number; pangram: boolean; bonus: boolean }

/** One find, as `gd` holds it: the word with its score and flags, who found
 *  it, and when. */
export type FoundWordRow = FoundWordsWord & {
  by: { id: string }
  at: string
}

/**
 * A word as it appears anywhere in feedback: caps, with a trailing ` •` bonus
 * bullet when it's a bonus find. Shared because the family names a found word
 * in several places — each game's own-move lines and its peers' finds — and
 * the bullet has to look the same in all of them.
 */
export function wordWithBonusBullet(word: string, bonus = false): string {
  return `${word.toUpperCase()}${bonus ? ' •' : ''}`
}
