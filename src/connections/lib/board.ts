// cs-blessed-connections

/**
 * The three numbers the game is built from. The puzzle's shape is `GPuzzle`
 * (types.ts); these are what every puzzle has in common, so the evaluator,
 * the board and the summary read them rather than counting.
 */

/** How many categories a puzzle hides — matching them all is the win. */
export const CATEGORY_COUNT = 4
/** How many tiles make a category, and so a guess. */
export const TILES_PER_CATEGORY = 4
/** How many mistakes a player (coop: the team) may make before losing. The
 *  builder writes the same four as every player's `maxMistakes`. */
export const MISTAKE_BUDGET = 4
