// cs-unmet

import type { GameManifest } from '../manifest/gameManifest'
import { useStickyChoice } from '../web-storage/useStickyChoice'
import { MODE_FILTER_VALUES, type ModeFilterValue } from './modeFilterOptions'

/** The mode filter over the start list, and the rows it leaves. */
export type StartListFilter = {
  mode: ModeFilterValue
  setMode: (mode: ModeFilterValue) => void
  // The startable gametypes the mode leaves, in the same order.
  visible: GameManifest[]
}

/**
 * The "All | Co-op | Compete" filter over the start list. It sticks, per user
 * and across clubs (club/doc.md → The two filters persist differently): keyed
 * by user id, so two accounts sharing a browser don't inherit each other's.
 *
 * **A solo club is pinned to `'all'`.** It shows no mode filter (`ModeFilter`),
 * and a list filtered by a control that isn't on screen could not be
 * unfiltered, so the stored choice is ignored there rather than trusted.
 */
export function useStartListFilter(
  myId: string,
  soloClub: boolean,
  startable: GameManifest[],
): StartListFilter {
  const [storedMode, setMode] = useStickyChoice<ModeFilterValue>(
    `puzpuzpuz:club:modeFilter:${myId}`,
    MODE_FILTER_VALUES,
    'all',
  )
  const mode = soloClub ? 'all' : storedMode
  const visible = startable.filter((g) => mode === 'all' || g.mode === mode)

  return { mode, setMode, visible }
}
