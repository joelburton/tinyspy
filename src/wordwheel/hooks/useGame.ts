// cs-unmet

import type { Member } from '@/common/members/member'
import { makeBeeGame } from '@/shared/bee-games/makeBeeGame'

/**
 * One player in a wordwheel game — a straight Member re-export (wordwheel adds
 * no per-player state; any club member who joined can submit). Kept per the
 * cross-game vocabulary convention (naming.md → player): every game's hook file
 * exposes a Player type so a reader scanning per-game folders finds the same
 * parallel everywhere.
 */
export type Player = Member

/**
 * wordwheel + spellingbee project the identical game shape, so the hook
 * body — the once-loaded header + the found_words realtime refetch — lives once
 * in `makeBeeGame`; this binds it to the wordwheel schema. The data types
 * are re-exported under wordwheel's local names; if wordwheel ever grows a
 * schema-specific column, that's the seam to fork (give it its own body).
 */
export type { BeeGame as WordwheelGame } from '@/shared/bee-games/makeBeeGame'
export type {
  FoundWordsWord as WordwheelWord,
  FoundWordRow,
} from '@/shared/found-words/foundWords'

export const useGame = makeBeeGame('wordwheel')
