// cs-unmet

import { useEffect, useRef } from 'react'

/**
 * What a game's `load` is handed. `isCurrent()` is true while the hook is still
 * mounted AND this load is still the newest one, so a load checks it after
 * each `await` and commits nothing once it reads false.
 */
export type GameLoad = (opts: { isCurrent: () => boolean }) => Promise<void>

type RefetchOnGameUpdateOptions = {
  commonGameUpdatedAt: string
  resubscribeCount: number
  load: GameLoad
}

/**
 * Keep a game's own tables fresh off the page's `common.games` row. Reach for
 * it from a game's `useGame`: it runs `load` on mount, and again whenever
 * `commonGameUpdatedAt` or `resubscribeCount` changes (both `PlayAreaLoaderProps`).
 *
 * The game keeps no subscription of its own. Every move writes `common.games`
 * through the game's status builder in the same transaction as its own tables,
 * so the row's `updated_at` moving is the sign they changed, and the page's
 * one subscription, in `useCommonGame`, is what hears it
 * (plans/common-tables.md → The model). `resubscribeCount` covers the
 * reconnect: a load that failed while the connection was down runs again when
 * it comes back, whether or not anybody moved.
 *
 * `load` may be a fresh closure every render; the latest one is what runs.
 * Loads can overlap and land out of order, so each one's `isCurrent()` reads
 * false once a newer one has started: the newest load wins, not the last to
 * land.
 */
export function useRefetchOnGameUpdate({
  commonGameUpdatedAt,
  resubscribeCount,
  load,
}: RefetchOnGameUpdateOptions): void {
  // The latest `load`, so the effect below can leave it out of its
  // dependencies and still run the freshest closure. Kept in step after each
  // commit, not during render: a ref is not a render output.
  const loadRef = useRef<GameLoad>(load)
  useEffect(() => {
    loadRef.current = load
  })

  // One load per run of this effect. The cleanup runs on unmount AND before
  // the next run, so an older load's `isCurrent()` reads false as soon as a
  // newer one starts.
  useEffect(function refetchOnGameUpdate() {
    let current = true
    void loadRef.current({ isCurrent: () => current })
    return () => {
      current = false
    }
  }, [commonGameUpdatedAt, resubscribeCount])
}
