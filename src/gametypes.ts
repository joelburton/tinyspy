// cs-audited-manifest

import type { GameManifest } from './common/manifest/gameManifest'
import { codenamesduetGame } from './codenamesduet/manifest'
import {
  psychicnumCoopGame,
  psychicnumCompeteGame,
} from './psychicnum/manifest'
import {
  connectionsCoopGame,
  connectionsCompeteGame,
} from './connections/manifest'
import {
  spellingbeeCoopGame,
  spellingbeeCompeteGame,
} from './spellingbee/manifest'
import {
  wordwheelCoopGame,
  wordwheelCompeteGame,
} from './wordwheel/manifest'
import { bananagramsGame } from './bananagrams/manifest'
import { waffleCoopGame, waffleCompeteGame } from './waffle/manifest'
import { wordleCoopGame, wordleCompeteGame } from './wordle/manifest'
import { stackdownCoopGame, stackdownCompeteGame } from './stackdown/manifest'
import { scrabbleCoopGame, scrabbleCompeteGame } from './scrabble/manifest'
import { boggleCoopGame, boggleCompeteGame } from './boggle/manifest'
import { crosswordsCoopGame, crosswordsCompeteGame } from './crosswords/manifest'
import { wordiplyCoopGame, wordiplyCompeteGame } from './wordiply/manifest'
import { strandsCoopGame, strandsCompeteGame } from './strands/manifest'
import {
  letterboxedCoopGame,
  letterboxedCompeteGame,
} from './letterboxed/manifest'
import { setgameCoopGame, setgameCompeteGame } from './setgame/manifest'

/**
 * THE REGISTRY — which games this monorepo includes. Nothing else in the
 * codebase names a specific game: the shell iterates this list, common code
 * stays generic, and each game lives in its own folder + schema.
 *
 * **Adding or removing a game is a checklist, and it is not here.**
 * docs/common.md holds it, along with the removability invariant that makes it
 * the structural integrity check for the whole monorepo, and the
 * sibling-manifest pattern that lets one folder + schema export a coop and a
 * compete entry. The step easiest to forget is the schema in
 * `supabase/config.toml`'s `[api] schemas`, which docs/supabase.md explains and
 * `src/guards/schemaExposure.e2e.test.ts` catches.
 *
 * **Two things are this file's own**, and both are about the lines below rather
 * than about games:
 *
 *   - **ESLint reads this file.** `no-restricted-imports` carves it out as the
 *     one place allowed to import from every `<game>/` folder, and
 *     `eslint.config.js` derives that rule's game list by regexing the
 *     `from './<name>/manifest'` specifiers below. Keep them in that literal
 *     shape — no aliasing the path, no computed imports — or a game silently
 *     stops being guarded.
 *   - **The order is the generated doc's order.** `gameStatusLabels.test.ts`
 *     walks this list to build the table in `docs/game-status-labels.md`, so
 *     reordering it rewrites that doc. Nothing a PLAYER sees comes from this
 *     order: the club page's lists sort for themselves.
 */
export const gametypes: GameManifest[] = [
  codenamesduetGame,
  psychicnumCoopGame,
  psychicnumCompeteGame,
  connectionsCoopGame,
  connectionsCompeteGame,
  spellingbeeCoopGame,
  spellingbeeCompeteGame,
  wordwheelCoopGame,
  wordwheelCompeteGame,
  bananagramsGame,
  waffleCoopGame,
  waffleCompeteGame,
  wordleCoopGame,
  wordleCompeteGame,
  stackdownCoopGame,
  stackdownCompeteGame,
  scrabbleCoopGame,
  scrabbleCompeteGame,
  boggleCoopGame,
  boggleCompeteGame,
  crosswordsCoopGame,
  crosswordsCompeteGame,
  wordiplyCoopGame,
  wordiplyCompeteGame,
  strandsCoopGame,
  strandsCompeteGame,
  letterboxedCoopGame,
  letterboxedCompeteGame,
  setgameCoopGame,
  setgameCompeteGame,
]

/**
 * The manifest for a gametype string, or `undefined` if this bundle's registry
 * has no such game.
 *
 * Beside the list because it reads the list. Every caller answers a miss its
 * own way, and should: a gametype string arrives from three places and a miss
 * means something different in each — the URL (the player typed a game that
 * does not exist), a `common.games` row (this bundle is behind the server, and
 * `reportUnknownGametypes` says so), or another manifest (impossible, so it
 * faults). A helper that picked one answer would be wrong at the other two.
 */
export function manifestFor(gametype: string): GameManifest | undefined {
  return gametypes.find((g) => g.gametype === gametype)
}
