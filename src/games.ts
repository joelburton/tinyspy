import type { GameManifest } from './common/lib/games'
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

/**
 * The single source of truth for which games this monorepo includes.
 *
 * Adding a game = create `src/<game>/` and add its manifest import +
 * registry entry here. **Also add the game's schema to
 * `supabase/config.toml`'s `[api] schemas`** (PostgREST only serves
 * listed schemas; a missing one makes every request fail with
 * `Invalid schema: <game>`) — and restart the stack so PostgREST
 * re-reads it (`supabase stop && supabase start`; a `db reset` does
 * NOT re-read `[api]`). `src/schemaExposure.e2e.test.ts` guards this.
 * Removing a game = delete the folder, delete the line(s) below, drop
 * its Postgres schema. Nothing else in the codebase names a specific
 * game directly (the shell iterates this list; common code stays
 * generic; each game lives in its own folder + schema).
 *
 * **Variants** — a single game folder/schema can export multiple
 * manifest entries (e.g. psychicnum exports both a coop and a compete
 * manifest pointing at the same schema). Each entry gets its own
 * registry row, its own Start button, its own URL prefix. Use the
 * `baseGametype` field on each manifest to group siblings. Removing
 * the family drops *all* its registry lines together with the
 * schema.
 *
 * That removability property is the structural integrity check for the
 * whole monorepo — see docs/common.md.
 *
 * ESLint's `no-restricted-imports` carves this file out as the one
 * place allowed to import from every `<game>/` folder. Don't replicate
 * those imports elsewhere.
 */
export const games: GameManifest[] = [
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
]
