import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { channelDedupSuffix } from '../lib/channelDedup'

/**
 * One Postgres-changes subscription target — schema + table +
 * Realtime filter. The factory wires `event: '*'` (INSERT,
 * UPDATE, DELETE all fire the same `load()`); per-event branching
 * isn't supported because every existing hook just refetches on
 * anything.
 */
export type TableSubscription = {
  schema: string
  table: string
  /** Realtime filter expression, e.g. `id=eq.${gameId}` or
   *  `game_id=eq.${gameId}`. Empty string for an unfiltered
   *  subscription (rarely the right call — most hooks scope to a
   *  single row's id). */
  filter: string
}

/**
 * Callback the caller writes once and the factory invokes on
 * mount, on every Realtime event, and on every SUBSCRIBED
 * status. Must be idempotent — refetch-and-replace, not
 * accumulate-and-append.
 *
 * The `mounted()` getter is closed over the factory's
 * mount/cleanup boolean. Standard usage: `await db.from(...)…`,
 * then `if (!mounted()) return` before any `setState`. Skipping
 * the check is a bug — a refetch triggered just before the
 * effect cleans up will land its `setState` after unmount and
 * either warn (React 17–18) or trigger a stale write into a
 * later mount of the same component (React 19's effect ordering).
 */
export type RealtimeLoad = (opts: { mounted: () => boolean }) => Promise<void>

type Config = {
  /** One table or several. Multiple tables fan into the same
   *  `load()` — convenient when the per-game "game row + child
   *  rows" pair both need to drive the same refetch (see
   *  psychicnum/useGame: subscribes to `games` AND `guesses`,
   *  same handler). For different per-table handlers, use two
   *  separate `useRealtimeRefetch` calls instead. */
  tables: TableSubscription | TableSubscription[]
  load: RealtimeLoad
  /** Channel-name prefix — `'board'`, `'clues'`, `'game'`,
   *  `'psychicnum'`. Combined with `id` + a per-effect-run UUID
   *  suffix to form the full channel name. */
  channelPrefix: string
  /** The per-game / per-club identifier — typically the same
   *  value that appears in the filter. Used as the `:id` segment
   *  of the channel name AND as the effect's dep, so changing it
   *  rebuilds the channel cleanly. */
  id: string
}

/**
 * The pattern parent for per-game data hooks that own one or two
 * rows and want full-refetch consistency over per-event
 * append/merge logic.
 *
 * The shape this factory codifies:
 *
 *   1. **Initial load on mount.** `load({ mounted })` runs once at
 *      effect start; the caller's load is responsible for its own
 *      `if (!mounted()) return` after each await before setState.
 *   2. **Refetch on any Realtime event.** Every postgres-changes
 *      event (INSERT, UPDATE, DELETE) on the subscribed table(s)
 *      reruns `load()`. Refetch over diff because the data
 *      volumes are small and diffing logic is more error-prone
 *      than the extra round-trip.
 *   3. **Refetch on every SUBSCRIBED status.** Covers the
 *      "reconnect dropped events" gap that postgres-changes alone
 *      leaves open.
 *   4. **Per-effect UUID-suffixed channel name.** Sidesteps
 *      supabase-js's name-cache + StrictMode double-mount
 *      collision. See `channelDedup.ts` for the rationale.
 *   5. **Cleanup**. `mounted` flag flips false; `removeChannel`
 *      tears down the subscription. The caller's `mounted()`
 *      reads false thereafter so any in-flight load() bails
 *      before setState.
 *
 * **When NOT to use this factory:**
 *
 *   - **Chat-style append-on-INSERT.** `useClubChat` appends each
 *     new message to local state without a refetch — under chat-
 *     heavy load that's a real perf win over refetch-always.
 *     The hand-rolled shape stays where it is; this factory is
 *     for "game state changed, reload the picture."
 *   - **Broadcast-coupled channels.** connections's `useGame` runs
 *     postgres-changes AND a shared-selection broadcast on the
 *     same stable-name channel (the broadcast needs the shared
 *     room across peers, the postgres-changes happen to ride
 *     along). Splitting that out into a factory call + a hand-
 *     rolled broadcast hook would leave two coordinating effects
 *     where today there's one cohesive one — net loss.
 *
 * **When porting a new game**, the per-game `useGame` hook
 * should default to using this factory. Reach for hand-rolling
 * only if the game introduces broadcast-coupling like connections
 * does, or chat-style append semantics like the club chat does.
 */
export function useRealtimeRefetch({
  tables,
  load,
  channelPrefix,
  id,
}: Config): void {
  // The load callback is almost always a fresh closure on each
  // render (it captures `gameId`, `userId`, etc. from the
  // component scope). Holding it in a ref means we don't have to
  // include it in the effect's deps — which would otherwise
  // thrash the channel on every render. The effect still
  // captures the latest `loadRef.current` every time the channel
  // fires a refetch.
  const loadRef = useRef<RealtimeLoad>(load)
  // Keep the ref pointing at the latest `load` after each commit. Done in an
  // effect (not a bare write during render — refs aren't render outputs) so the
  // subscription effect below, which deliberately omits `load` from its deps,
  // still fires the freshest closure when the channel calls back. No dep array:
  // it re-syncs on every render, which is exactly what "latest" wants.
  useEffect(() => {
    loadRef.current = load
  })

  // Normalize a single subscription to a one-element array — the
  // wiring loop below treats both shapes uniformly.
  const tableList = Array.isArray(tables) ? tables : [tables]
  // Stable string key for the deps array. Without this, passing
  // a fresh `[{...}]` literal each render would re-trigger the
  // effect (Array identity is not Array contents). Concatenating
  // schema/table/filter is enough — those are the only fields
  // the wiring uses.
  const tablesKey = tableList
    .map((t) => `${t.schema}.${t.table}?${t.filter}`)
    .join('|')

  useEffect(function realtimeRefetchEffect() {
    let mounted = true
    const mountedFn = () => mounted

    function refetch() {
      // Fire-and-forget. The caller's load handles its own
      // mounted-guard + setState; any rejection surfaces as an
      // unhandled promise warning the caller's load should have
      // caught itself.
      void loadRef.current({ mounted: mountedFn })
    }

    // Initial load before subscription comes up — gets state
    // populated as quickly as possible. Once SUBSCRIBED fires
    // it'll re-run (a brief double-fetch on first mount,
    // accepted as the cost of fast initial render + correctness
    // after reconnect).
    refetch()

    let chain = supabase.channel(
      `${channelPrefix}:${id}:${channelDedupSuffix()}`,
    )
    for (const t of tableList) {
      chain = chain.on(
        'postgres_changes',
        { event: '*', schema: t.schema, table: t.table, filter: t.filter },
        refetch,
      )
    }
    const channel = chain.subscribe((status) => {
      if (status === 'SUBSCRIBED') refetch()
    })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
    // Deps: channelPrefix + id + tablesKey. NOT load — held in
    // ref above. Rebuilding the channel on a load-identity
    // change would be wrong (load captures the same id and
    // tables; nothing structural is different). The effect also reads
    // `tableList`, but `tablesKey` is its stable string proxy (a fresh
    // `[{...}]` literal each render would otherwise thrash the channel) —
    // so we depend on the key, not the array. exhaustive-deps can't see
    // through that derivation, hence the scoped disable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelPrefix, id, tablesKey])
}
