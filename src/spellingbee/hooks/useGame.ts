// cs-unmet

import type { Member } from '@/common/members/member'
import { makeBeeGame } from '@/shared/bee-games/makeBeeGame'

/**
 * One player in a spellingbee game — a straight Member re-export (spellingbee
 * adds no per-player state; any club member who joined can submit). Kept per the
 * cross-game vocabulary convention (naming.md → player): every game's hook file
 * exposes a Player type so a reader scanning per-game folders finds the same
 * parallel everywhere.
 */
export type Player = Member

/**
 * spellingbee's `useGame`: the shared bee-games hook body bound to this schema,
 * with the data types re-exported under spellingbee's local names. What the bee
 * games share, and when a game should stop sharing it, is `makeBeeGame`'s own
 * docstring — this file is the seam that would change.
 */
export type { BeeGame as SpellingbeeGame } from '@/shared/bee-games/makeBeeGame'
export type {
  FoundWordsWord as SpellingbeeWord,
  FoundWordRow,
} from '@/shared/found-words/foundWords'

export const useGame = makeBeeGame('spellingbee')
