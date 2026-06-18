import { useEffect, useRef, useState } from 'react'

/** How long a freshly-arrived word stays "recently found" — the
 *  duration the per-finder underline shows in the WordList. */
const RECENT_MS = 5000

/**
 * Returns the set of words that arrived in `found` since the
 * last render. Each freshly-arrived word stays in the set for
 * 5 seconds, then drops out.
 *
 * Two subtleties worth knowing about:
 *
 *   1. **Per-word timers live in a ref**, not in the effect's
 *      cleanup. The submitter's path can trigger `setFoundWords`
 *      twice in quick succession (the immediate Realtime
 *      INSERT echo + a postgres-changes refetch a tick later);
 *      a per-effect cleanup would clear the just-scheduled
 *      timer on the second update, leaving the underline stuck
 *      on forever.
 *
 *   2. **The initial mount doesn't flash existing words.** A
 *      reconnect (or a navigate-back-to-game) brings a fully-
 *      populated `found` array; without the `knownFoundRef`
 *      bootstrap, every entry would count as "fresh" and the
 *      whole list would underline at once. Bootstrapping from
 *      the constructor argument keeps the initial render quiet.
 *
 * Direct TS port of `~/freebee-ws/src/components/useRecentlyFound.js`.
 */
export function useRecentlyFound(found: string[]): ReadonlySet<string> {
  const [recentlyFound, setRecentlyFound] = useState<Set<string>>(
    () => new Set(),
  )
  const knownFoundRef = useRef<Set<string>>(new Set(found))
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )

  useEffect(function flagFreshArrivals() {
    const known = knownFoundRef.current
    const fresh = found.filter((w) => !known.has(w))
    if (fresh.length === 0) return
    knownFoundRef.current = new Set(found)
    setRecentlyFound((cur) => {
      const next = new Set(cur)
      for (const w of fresh) next.add(w)
      return next
    })
    for (const w of fresh) {
      const existing = timersRef.current.get(w)
      if (existing) clearTimeout(existing)
      const id = setTimeout(() => {
        timersRef.current.delete(w)
        setRecentlyFound((cur) => {
          if (!cur.has(w)) return cur
          const next = new Set(cur)
          next.delete(w)
          return next
        })
      }, RECENT_MS)
      timersRef.current.set(w, id)
    }
  }, [found])

  // One-shot cleanup on unmount. The per-effect path above doesn't
  // own these — see the note about double-update timers — so we
  // explicitly tear them down here.
  useEffect(function clearTimersOnUnmount() {
    const timers = timersRef.current
    return () => {
      for (const id of timers.values()) clearTimeout(id)
      timers.clear()
    }
  }, [])

  return recentlyFound
}
