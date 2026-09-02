// cs-met-deep

import { useSyncExternalStore } from 'react'

/**
 * Tiny hand-rolled path-based router. The non-component half.
 *
 * Decision context (see project memory's clubs-v1 entry):
 *
 * - We deliberately don't use `react-router`. The app has a flat,
 *   small route surface (~3 routes); declarative `<Routes>` config +
 *   nested layouts + loaders aren't earning their 30–50 KB of bundle
 *   and the API churn that comes with the library.
 * - Hash routing (`#/c/<handle>`) was the alternative; we picked
 *   paths for nicer SMS-shareable URLs ("games.example.com/c/joel-leah")
 *   and to keep the URL space clean for edge customization later.
 *
 * What's here:
 *
 * - `usePath()` — subscribes a component to `window.location.pathname`.
 *   Reads sync at mount, listens for `popstate` (back/forward buttons
 *   AND our own `navigate()` calls — see below).
 * - `navigate(to, replace?)` — programmatic navigation. Uses the
 *   History API (`pushState` / `replaceState`) then dispatches a
 *   synthetic `popstate` event so every `usePath()` subscriber
 *   re-renders with the new path.
 *
 * Companion `Link.tsx` exports `<Link to=…>` — the JSX half lives in
 * a separate file so Vite Fast Refresh's "components-only" file rule
 * stays happy (and so callers that only need the imperative API
 * don't pull React JSX into the import graph).
 *
 * What's NOT here:
 *
 * - Route matching helpers. Callers do their own `path.startsWith('/c/')`
 *   or regex match — flat structure makes this cheap and explicit.
 * - Query/search-param parsing. Not needed yet; `URLSearchParams` is
 *   in the browser if a caller ever wants it.
 * - Scroll restoration, prefetching, layout transitions. Out of scope.
 *
 * Server side (Netlify): `public/_redirects` rewrites every path to
 * `index.html` with HTTP 200 so a refresh on `/c/joel-leah` works.
 * Vite's dev server does the equivalent by default.
 */

/**
 * Both module-level, so they are stable across renders — a `subscribe`
 * that changed identity would make React resubscribe every render.
 */
const subscribeToPath = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}
const readPath = () => window.location.pathname

/**
 * Subscribes a component to changes in `window.location.pathname`.
 *
 * Updates fire via the browser's `popstate` event. The browser
 * dispatches that natively on back/forward navigation; we also
 * dispatch it ourselves from `navigate()` below so programmatic
 * navigation triggers the same subscriber path.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: it reads
 * the path during render AND re-checks it once subscribed, so a
 * `navigate()` between those two moments cannot be missed. The snapshot
 * is a string, so it needs no caching to compare equal.
 */
export function usePath(): string {
  return useSyncExternalStore(subscribeToPath, readPath)
}

/**
 * Programmatic navigation.
 *
 *   navigate('/c/joel-leah')           — push a new history entry
 *   navigate('/c/joel-leah', true)     — replace the current entry
 *                                        (no "back" entry — useful for
 *                                        e.g. redirect-after-login)
 *
 * `pushState` / `replaceState` only mutate the URL bar; they don't
 * notify any listeners. We dispatch a synthetic `popstate` so
 * `usePath()` subscribers re-render with the new path.
 *
 * (Native `popstate` is fired by the browser on user-initiated nav
 * — back button, forward button, hash change. Our synthetic dispatch
 * is a documented pattern for "programmatic nav uses the same
 * subscriber path as user nav.")
 *
 * Navigating to where you already are does nothing at all — see below.
 */
export function navigate(to: string, replace = false) {
  // A push to the current URL stacks an identical entry, so Back lands on the
  // same page and appears broken. The comparison spans the query and hash, not
  // just the path: `/c/x?new=wordle` is a real move from `/c/x`.
  if (to === window.location.pathname + window.location.search + window.location.hash) return
  if (replace) {
    window.history.replaceState(null, '', to)
  } else {
    window.history.pushState(null, '', to)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}
