import type { GameManifest } from '../common/lib/games'
import { TinyspyRoot } from './Root'

/**
 * Tinyspy's registration with the shell. Exported as the only thing
 * outside `src/tinyspy/` needs to know about this game — `src/games.ts`
 * imports this constant and adds it to the registry.
 *
 * The `id` matches the Postgres `schema` name by convention. Nothing
 * enforces that today; the type just keeps them as separate fields so
 * we don't conflate two roles into one string.
 */
export const tinyspyGame: GameManifest = {
  id: 'tinyspy',
  schema: 'tinyspy',
  name: 'Tinyspy',
  blurb: 'Cooperative Codenames Duet for two.',
  Root: TinyspyRoot,
}
