import type { GameManifest } from './common/lib/games'
import { tinyspyGame } from './tinyspy/manifest'
import {
  psychicnumCoopGame,
  psychicnumCompeteGame,
} from './psychicnum/manifest'
import {
  wordknitCoopGame,
  wordknitCompeteGame,
} from './wordknit/manifest'
import {
  freebeeCoopGame,
  freebeeCompeteGame,
} from './freebee/manifest'
import { monkeygramGame } from './monkeygram/manifest'
import { waffleCoopGame } from './waffle/manifest'

/**
 * The single source of truth for which games this monorepo includes.
 *
 * Adding a game = create `src/<game>/` and add its manifest import +
 * registry entry here. Removing a game = delete the folder, delete the
 * line(s) below, drop its Postgres schema. Nothing else in the
 * codebase names a specific game directly (the shell iterates this
 * list; common code stays generic; each game lives in its own folder
 * + schema).
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
  tinyspyGame,
  psychicnumCoopGame,
  psychicnumCompeteGame,
  wordknitCoopGame,
  wordknitCompeteGame,
  freebeeCoopGame,
  freebeeCompeteGame,
  monkeygramGame,
  waffleCoopGame,
]
