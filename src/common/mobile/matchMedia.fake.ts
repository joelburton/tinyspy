// cs-blessed-mobile

/**
 * A `window.matchMedia` stand-in for tests, whose queries can be flipped so a
 * subscriber sees a `change` event.
 *
 * **jsdom has no `matchMedia` at all**, which is why any test that needs one
 * installs a fake. That absence is itself load-bearing: `useMediaQuery` treats a
 * missing `matchMedia` as "query unmet", so every component test in the repo
 * renders the desktop layout without asking for it. Install this only when a
 * test wants the other answer, and let the rest keep the default.
 *
 * The reason it is worth sharing rather than hand-rolling per suite is
 * {@link InstalledMatchMedia.set}: a stub whose `matches` is fixed at
 * construction can say "we are on a phone", but it cannot make a hook RE-RENDER,
 * which is the whole point of `useMediaQuery` being a subscription rather than a
 * one-shot read. Firing that transition needs the listeners a real
 * MediaQueryList keeps, so the fake keeps them too.
 *
 * Not a `.test.ts` file, so it ships no cases of its own; it is imported by the
 * tests that need it, the way `web-storage/storage.fake.ts` is.
 */

type Listener = () => void

export type InstalledMatchMedia = {
  /**
   * Make `query` match (or stop matching) and notify everyone listening to it,
   * the way a resize or a rotation does. Wrap the call in `act()` when a hook is
   * subscribed, so the re-render flushes before the assertion.
   */
  set: (query: string, matches: boolean) => void
  /** How many listeners are attached to `query` — 0 after a clean unmount. */
  listenerCount: (query: string) => number
  /** Take `matchMedia` back off `window`, restoring the jsdom default. */
  uninstall: () => void
}

/**
 * Put a fake `matchMedia` on `window`, with every query unmatched until `set`
 * says otherwise. Call it in `beforeEach` and `uninstall` in `afterEach`, so a
 * suite that installs it doesn't change what the next file sees.
 */
export function installFakeMatchMedia(): InstalledMatchMedia {
  const matched = new Map<string, boolean>()
  const listeners = new Map<string, Set<Listener>>()

  const listenersFor = (query: string): Set<Listener> => {
    const existing = listeners.get(query)
    if (existing) return existing
    const created = new Set<Listener>()
    listeners.set(query, created)
    return created
  }

  // Each call builds a fresh MediaQueryList, as the real one does — the callers
  // hold a query string, not a list — but they share the maps above, so a list
  // made by `subscribe` and a list made by `getSnapshot` agree.
  const matchMedia = (query: string): MediaQueryList => {
    const set = listenersFor(query)
    return {
      media: query,
      get matches() {
        return matched.get(query) ?? false
      },
      addEventListener: (_type: string, listener: Listener) => set.add(listener),
      removeEventListener: (_type: string, listener: Listener) => set.delete(listener),
      // The deprecated pair, present because the type demands them; nothing here
      // calls them, and a caller reaching for one should be a visible failure.
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })

  return {
    set: (query, matches) => {
      matched.set(query, matches)
      for (const listener of listenersFor(query)) listener()
    },
    listenerCount: (query) => listenersFor(query).size,
    uninstall: () => {
      // `delete` rather than assigning undefined: `useMediaQuery` asks
      // `typeof window.matchMedia !== 'function'`, and the point of restoring is
      // to leave jsdom exactly as it was found.
      delete (window as { matchMedia?: unknown }).matchMedia
    },
  }
}
