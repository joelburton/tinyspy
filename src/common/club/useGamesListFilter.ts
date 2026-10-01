// cs-unmet

import { useState } from 'react'
import type { ListedGame } from './useClubGames'

/** One dropdown choice: a gametype FAMILY (`manifest.baseGametype`) labeled
 *  with its brand (`manifest.name`). */
export type GametypeOption = { value: string; label: string }

/** The gametype filter over "Your games", and the rows it leaves. */
export type GamesListFilter = {
  // The selected `baseGametype`, or `'all'`.
  gametype: string
  // The families in the list, by brand. Excludes `'all'`.
  options: GametypeOption[]
  setGametype: (gametype: string) => void
  // The listed games the gametype leaves, in the same order.
  visible: ListedGame[]
}

/**
 * The gametype filter over "Your games". Not remembered (club/doc.md → The two
 * filters persist differently).
 *
 * The options are built from the games actually listed, so the dropdown never
 * offers a choice that empties the list. A selection whose family has since
 * left the list — its last game deleted — falls back to `'all'`, worked out at
 * render rather than repaired by an effect.
 */
export function useGamesListFilter(games: ListedGame[]): GamesListFilter {
  const [selected, setGametype] = useState<string>('all')

  // One entry per family: the Map folds a coop/compete pair onto their shared
  // `baseGametype`.
  const options = [
    ...new Map(games.map((g) => [g.manifest.baseGametype, g.manifest.name])).entries(),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const gametype = options.some((o) => o.value === selected) ? selected : 'all'
  const visible = games.filter(
    (g) => gametype === 'all' || g.manifest.baseGametype === gametype,
  )

  return { gametype, options, setGametype, visible }
}
