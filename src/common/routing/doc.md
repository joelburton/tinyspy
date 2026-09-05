# routing

How the page moves between URLs without reloading. Two ways to move — `<Link>`
for a click, `navigate()` for code — and one hook, `usePath()`, that tells a
component where the page is now. What each path SHOWS is decided in `App.tsx`,
not here.

## Design

The app is a single page. Opening a club or a game changes the URL bar and swaps
what React renders, and the server is never asked for a new document. Something
has to own that swap — know the current path, announce when it changes, and give
the rest of the app a way to change it — and this folder is that something. It
also knows how the app's URLs are spelled, since there are only two of them and
both the code that writes one and the code that reads one back are better off
looking at the same rule. What it does not know is what a path MEANS: `App.tsx`
takes a matched club handle or game id and decides which page that is.

We wrote it ourselves rather than adopt a routing library because the route
surface is flat — home, a club, a game, and everything else lands on home.
Matching that is a regex per shape, and a library would be a dependency for
nested layouts, loaders and transitions that nothing here wants. The trade is
that the folder is deliberately dumb: it moves the page and reports the path,
and that is all.

The idea worth understanding is that everything rides on the browser's own
history. `navigate()` calls `pushState` (or `replaceState`, for a move that
should leave no Back entry), and then fires a `popstate` event itself, because
the browser announces `pushState` to nobody. A component subscribed through
`usePath()` therefore cannot tell a Back press from one of our own calls, and
never needs to: both arrive as the same event and re-render it with the new
path. Subscribing goes through `useSyncExternalStore`, which reads the path
during render and checks it again once the listener is attached, so a
`navigate()` fired in the gap between those two moments is not lost.

`<Link>` is an ordinary anchor with a real `href`. That is what keeps the
browser's own affordances — open in a new tab, copy the address, the status-bar
preview — working exactly as they do on any link. The only click it takes for
itself is the plain left one; a click that asks for "open this elsewhere", by a
modifier key or a `target` attribute, is handed straight back to the browser.

Because the server never takes part in a move, a refresh or a pasted deep link
has to work too: Netlify serves `index.html` for every path, and the page then
routes itself from the URL it wakes up with.

## Details

**`usePath()` returns the pathname alone.** The query is read by two callers
that each want it exactly once and never reactively — the theme chain reads
`?theme=` before React exists, and ClubPage reads `?new=` at mount and then
strips it. A caller that needs the query reads `window.location.search`
itself.

**Navigating to where you already are does nothing.** A push to the current
URL would stack an identical history entry and make Back appear broken, so
`navigate()` compares first — against the path, query AND hash together, so
that stripping `?new=` from a path that stays the same still counts as a move.

**`<Link>` is a separate file for Fast Refresh.** Vite's HMR wants a module
that exports a component to export only components, so the component sits in
`Link.tsx` and the two functions in `router.ts`. A caller that only wants
`navigate()` also stays clear of the JSX import graph that way.

**The route shapes live in `routes.ts`** — `/c/<handle>` for a club,
`/g/<gametype>/<gameId>` for a game, with the gametype in the URL so a game id
never has to be looked up across schemas. Each shape is a builder and a matcher
side by side, so a caller sending someone to a game and `App.tsx` recognizing
one on the way in cannot disagree about what a game id may look like. What each
path SHOWS is still `App.tsx`'s.

**The server side is one Netlify rule.** `public/_redirects` rewrites every
path to `index.html` with HTTP 200, so the URL stays as typed; a companion rule
lets a missing `/assets/*` file 404 instead, which is `common/boot`'s concern
(the stale-chunk reload).
