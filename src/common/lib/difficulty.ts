/**
 * Vocabulary-difficulty bands (1..6), shared by every word game's setup. The
 * band IS `common.words.difficulty`; the labels + sample words here just SIGNAL
 * to a player roughly how obscure each band feels. They're illustrative only —
 * NOT a validated word list (a game may not even accept words this short).
 *
 * `DifficultyField` renders these. A game passes the word length its dictionary
 * cares about (a 2-letter dictionary shows 2-letter samples). Kept as plain
 * literal arrays on purpose — nothing clever.
 */

/** Band → label. Index 0 is band 1. */
export const DIFFICULTY_LABELS = [
  'Universal',
  'Common',
  'Familiar',
  'Uncommon',
  'Obscure',
  'Expert',
] as const

/**
 * Which sample-word set a dropdown shows: a fixed word length, or `null` for
 * "any length" (open). `'3+'` is the open set with its 2-letter words dropped
 * — bananagrams's longer-words dictionary, where 2-letter words are a separate
 * choice.
 */
export type WordLength = 2 | 5 | '3+' | null

// ─── Sample words per band (index 0 = band 1) ──────────────────────────────

// Open / any length.
const SAMPLES_OPEN: readonly (readonly string[])[] = [
  ['ox', 'cat', 'milk', 'happy', 'jump'],
  ['ax', 'vex', 'whiff', 'gale', 'romp'],
  ['id', 'cur', 'moxie', 'abet', 'gird'],
  ['qi', 'dun', 'cruet', 'dreck', 'priss'],
  ['mu', 'wen', 'stere', 'jugal', 'baize'],
  ['xu', 'adz', 'poind', 'swarf', 'zarf'],
]

// The open set minus its 2-letter entries (3+ letters only).
const SAMPLES_3PLUS: readonly (readonly string[])[] = [
  ['cat', 'milk', 'happy', 'jump'],
  ['vex', 'whiff', 'gale', 'romp'],
  ['cur', 'moxie', 'abet', 'gird'],
  ['dun', 'cruet', 'dreck', 'priss'],
  ['wen', 'stere', 'jugal', 'baize'],
  ['adz', 'poind', 'swarf', 'zarf'],
]

// Exactly two letters.
const SAMPLES_2: readonly (readonly string[])[] = [
  ['go', 'hi', 'up', 'ox', 'no'],
  ['ax', 'ex', 'ow', 'bi', 'yo'],
  ['id', 'om', 'em', 'el', 'ye'],
  ['qi', 'gi', 'ja', 'op', 'po'],
  ['mu', 'xi', 'za', 'ka', 'aa'],
  ['xu', 'zo', 'oe', 'ky', 'gu'],
]

// Exactly five letters.
const SAMPLES_5: readonly (readonly string[])[] = [
  ['happy', 'chair', 'bloom', 'tulip', 'alarm'],
  ['qualm', 'sheen', 'swish', 'flora', 'clink'],
  ['moxie', 'whorl', 'venal', 'addle', 'burro'],
  ['cruet', 'priss', 'magus', 'miler', 'alack'],
  ['stere', 'jugal', 'baize', 'stirk', 'fosse'],
  ['poind', 'swarf', 'nixie', 'brank', 'quern'],
]

/** The sample-word set (band 1..6) for a given length category. */
export function sampleWordsFor(length: WordLength): readonly (readonly string[])[] {
  switch (length) {
    case 2:
      return SAMPLES_2
    case 5:
      return SAMPLES_5
    case '3+':
      return SAMPLES_3PLUS
    case null:
      return SAMPLES_OPEN
  }
}
