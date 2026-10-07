// cs-unmet

import { useMemo, useState } from 'react'
import { gametypes } from '@/gametypes'
import type { GameManifest } from '../manifest/gameManifest'
import type { ClubPageData } from './ClubPage'

/** What the edit dialog sets per gametype: listed or not, and the daily cap,
 *  null for no limit (paw protection). */
export type GametypeSettings = { isEnabled: boolean; maxDailyGames: number | null }

/** The club's gametypes: which it lists and can start (`common.clubs_gametypes`),
 *  each one's settings, and the setup its friends last played in each. */
export type ClubGametypes = {
  // The club's listed gametypes, by `gametype`.
  allowed: Set<string>
  // Their manifests in the start list's order: by brand, coop before compete.
  startable: GameManifest[]
  // Every registered gametype's settings, by `gametype` — the edit dialog's
  // starting values.
  settings: Map<string, GametypeSettings>
  // Gametype → the setup last played in it; a gametype with none is absent.
  savedDefaults: Map<string, unknown>
  // Replace `settings`, after the club editor saves; `allowed` and
  // `startable` follow.
  applySettings: (next: Map<string, GametypeSettings>) => void
}

/**
 * The club's gametypes, seeded from `get_club_page` and owned here after that:
 * the "Edit club" dialog changes them while the page is up, and hands back the
 * new settings so the start list updates without a refetch.
 *
 * The saved defaults are read once and never change: nothing on this page
 * writes one, and a gametype the editor unlists draws no start row to open a
 * setup dialog from. `_create_game`'s `saved_default` is the write side.
 */
export function useClubGametypes(
  initialGametypes: ClubPageData['gametypes'],
): ClubGametypes {
  const [settings, setSettings] = useState<Map<string, GametypeSettings>>(
    () =>
      new Map(
        initialGametypes.map((k) => [
          k.gametype,
          { isEnabled: k.is_enabled, maxDailyGames: k.max_daily_games },
        ]),
      ),
  )

  const allowed = useMemo(
    () => new Set([...settings].filter(([, s]) => s.isEnabled).map(([gametype]) => gametype)),
    [settings],
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

  return { allowed, startable, settings, savedDefaults, applySettings: setSettings }
}
