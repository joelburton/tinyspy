// cs-unmet

import { useMemo, useState } from 'react'
import { gametypes } from '@/gametypes'
import type { GameManifest } from '../manifest/gameManifest'
import type { ClubPageData } from './ClubPage'

/** The gametypes a club can start (`common.clubs_gametypes`), with the setup
 *  its friends last played in each. */
export type ClubGametypes = {
  // The club's gametypes, by `gametype`.
  allowed: Set<string>
  // Their manifests in the start list's order: by brand, coop before compete.
  startable: GameManifest[]
  // Gametype → the setup last played in it; a gametype with none is absent.
  savedDefaults: Map<string, unknown>
  // Replace `allowed`, after the club editor saves.
  setAllowed: (next: Set<string>) => void
}

/**
 * The club's gametypes, seeded from `get_club_page` and owned here after that:
 * the "Edit club" dialog changes them while the page is up, and hands back the
 * new set so the start list updates without a refetch.
 *
 * The saved defaults are read once and never change: nothing on this page
 * writes one, and a gametype the editor removes draws no start row to open a
 * setup dialog from. `_create_game`'s `saved_default` is the write side.
 */
export function useClubGametypes(
  initialGametypes: ClubPageData['gametypes'],
): ClubGametypes {
  const [allowed, setAllowed] = useState<Set<string>>(
    () => new Set(initialGametypes.map((k) => k.gametype)),
  )

  const savedDefaults = useMemo(
    () =>
      new Map(
        initialGametypes
          .filter((k) => k.default_setup !== null)
          .map((k) => [k.gametype, k.default_setup]),
      ),
    [initialGametypes],
  )

  // A coop/compete pair shares a `name`, so the mode breaks the tie. Sorted
  // here, not left in the registry's order, so the keyboard cursor indexes the
  // order the list renders in.
  const startable = useMemo(
    () =>
      gametypes
        .filter((g) => allowed.has(g.gametype))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            (a.mode === b.mode ? 0 : a.mode === 'coop' ? -1 : 1),
        ),
    [allowed],
  )

  return { allowed, startable, savedDefaults, setAllowed }
}
