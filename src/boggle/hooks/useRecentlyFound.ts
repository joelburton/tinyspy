import { useEffect, useRef, useState } from 'react'

/** How long a freshly-arrived word stays "recently found" — the duration the
 *  per-finder underline shows in the WordList. */
const RECENT_MS = 5000

/**
 * Returns the set of words that arrived in `found` since the last render; each
 * stays for 5s then drops out. Per-word timers live in a ref (a submit can fire
 * two updates in quick succession — the Realtime echo + a refetch — and a
 * per-effect cleanup would clear the just-scheduled timer). The initial mount
 * doesn't flash existing words (bootstrap from the first `found`). Same hook as
 * FreeBee's; generic enough that each word game keeps its own copy.
 */
export function useRecentlyFound(found: string[]): ReadonlySet<string> {
  const [recentlyFound, setRecentlyFound] = useState<Set<string>>(() => new Set())
  const knownFoundRef = useRef<Set<string>>(new Set(found))
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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

  useEffect(function clearTimersOnUnmount() {
    const timers = timersRef.current
    return () => {
      for (const id of timers.values()) clearTimeout(id)
      timers.clear()
    }
  }, [])

  return recentlyFound
}
