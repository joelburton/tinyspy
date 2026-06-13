import type { GameManifest } from './common/lib/games'
import { tinyspyGame } from './tinyspy/manifest'

/**
 * The single source of truth for which games this monorepo includes.
 *
 * Adding a game = create `src/<game>/` and add its manifest import +
 * registry entry here. Removing a game = delete the folder, delete the
 * line below, drop its Postgres schema. Nothing else in the codebase
 * names a specific game directly (the shell iterates this list; common
 * code stays generic; each game lives in its own folder + schema).
 *
 * That removability property is the structural integrity check for the
 * whole monorepo — see docs/naming.md.
 *
 * ESLint's `no-restricted-imports` carves this file out as the one
 * place allowed to import from every `<game>/` folder. Don't replicate
 * those imports elsewhere.
 */
export const games: GameManifest[] = [tinyspyGame]
