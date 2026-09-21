// cs-audited-word-list

import { useEffect, useRef, useState } from 'react'

/** How long a freshly-arrived word stays "recently found" — the duration the
 *  per-finder underline shows in the shared `<WordList>`. */
const RECENT_MS = 5000

/**
 * Which words have arrived in `found` since it last changed, each staying in the
 * set for `RECENT_MS` and then dropping out. The shared `<WordList>` underlines
 * them in their finder's color.
 *
 * Pass the found words alone — a caller holding reveal entries too must filter
 * them out first, or the whole reveal marks itself as just-arrived.
 */
export function useRecentlyFound(found: string[]): ReadonlySet<string> {
  const [recentlyFound, setRecentlyFound] = useState<Set<string>>(() => new Set())
  // Seeded from the FIRST render's argument, so a reconnect or a navigate back
  // into a game arrives with its list already known and marks nothing. Without
  // the seed every existing word would read as fresh at once.
  const knownFoundRef = useRef<Set<string>>(new Set(found))
  // Per-word timers, held here rather than in the effect's cleanup: one submit
  // can change `found` twice in quick succession (the Realtime echo, then the
  // refetch a tick later), and a per-effect cleanup would cancel the timer the
  // first update just scheduled — leaving that word underlined for good.
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

  // One-shot cleanup on unmount, because the effect above deliberately does not
  // own these — see the timers' own note at the ref.
  useEffect(function clearTimersOnUnmount() {
    const timers = timersRef.current
    return () => {
      for (const id of timers.values()) clearTimeout(id)
      timers.clear()
    }
  }, [])

  return recentlyFound
}
