# Area: deep

An area of app-audit's step 7, and the one that ran first under the 2026-09-02
restart. The process is [app-audit.md](../app-audit.md) §21; **the plan holds the
order** (§7 → "The areas, in order"), this file holds everything else.

**Opened 2026-09-02**, added to §7's order the same day, ahead of `homepage`.
Scope, set by Joel when he asked for it:

> "there's a new area to add at the very top of the list: the deep stuff that is
> used in most places (the router, App.tsx, the rpc/edge-fn/query wrappers). I
> want to go through those files first to tidy and understand them before we hit
> even the homepage (otherwise the homepage, which is theoretically simple, will
> have dozens of dependencies)."

**The membership rule is "it names no game and no page."** "Deep" on its own
describes all 83 files of `src/common/lib/`, `trie.ts` and `rankLadder.ts`
included; the rule is what keeps game logic that merely lives in `lib/` out.

**Why it runs first, and it is not the dependency count.** Of the homepage's 33
listed dependencies this area absorbs six, and that page will still list around
twenty-two afterwards — the bulk being shared components and stylesheets owned by
`simple-page` and `shared-game-chrome`. The reason is that those twenty-two are
components: you can look at one and see what it does. **The deep layer is the
part you cannot understand by looking**, so "listed and left" costs the most
here, and reading it once pays into every area after.

**Its exit criterion is different, and that is deliberate.** This area renders
nothing, so it does not close on Joel looking at a surface. It closes on *read,
understood, tidied* — `cs-blessed` here means he has read the file, not seen it.

**Every heading says its status**; a heading with **no status prefix means OPEN**.

**The boot pass is DONE** — 2026-09-02, nine files, sixteen findings and
**nothing left open**: fourteen RESOLVED, one CLOSED (`F-deep-3`), one MOVED to
`corecss` (`F-deep-1`). The data path (11 files) and the realtime plumbing (7)
have not been read.

## The roster — 33 files, 4,880 lines

Agreed with Joel 2026-09-02 before anything was read, and stamped **`cs-met`** —
the eighth stamp, added the same day for exactly this state: on an open area's
roster, agreed, and not yet read (app-audit.md §21 → The stamp). About half the
line count is tests. **Line counts measured 2026-09-02, after the boot fixes** —
they move as this area edits its own files, so they date rather than promise.

**The boot path — 9 files, 874 lines**

| file | lines | |
|---|---|---|
| `src/main.tsx` | 81 | |
| `src/App.tsx` | 237 | **the boot half only** — its per-page and per-game routing rows belong to the areas that own those pages and games |
| `src/common/lib/routing/router.ts` | 103 | |
| `src/common/lib/routing/router.test.ts` | 142 | |
| `src/common/lib/routing/Link.tsx` | 48 | the homepage writes no link at all now — its last one went when the create-club page became a modal; the file is still the router's |
| `src/common/lib/routing/Link.test.tsx` | 78 | **written 2026-09-02 by `F-deep-7`**, which found the file had no test at all; stamped `cs-met-deep` on Joel's call |
| `src/common/lib/util/reloadOnStaleChunk.ts` | 36 | filed under `util/`, but it is boot machinery |
| `src/common/lib/util/reloadOnStaleChunk.test.ts` | 80 | |
| `src/common/themes/loadTheme.ts` | 69 | **added 2026-09-02 by `F-deep-9`** — `main.tsx` awaits it before the first render, and it names no game and no page |

**The data path — 11 files, 2,860 lines**

| file | lines |
|---|---|
| `src/common/lib/supabase/supabase.ts` | 128 |
| `src/common/db.ts` | 26 |
| `src/common/lib/supabase/envelope.ts` | 156 |
| `src/common/lib/supabase/dbEnvelope.ts` | 321 |
| `src/common/lib/supabase/dbResult.ts` | 530 |
| `src/common/lib/supabase/dbResult.test.ts` | 759 |
| `src/common/lib/supabase/dbFetch.ts` | 282 |
| `src/common/lib/supabase/dbFetch.test.ts` | 289 |
| `src/common/lib/supabase/callEdgeFn.ts` | 99 |
| `src/common/lib/supabase/callEdgeFn.test.ts` | 95 |
| `src/common/lib/supabase/dbLog.ts` | 175 |

**The realtime plumbing — 7 files, 651 lines**

| file | lines |
|---|---|
| `src/common/lib/supabase/channelDedup.ts` + `.test.ts` | 56 + 110 |
| `src/common/lib/supabase/channelTeardown.ts` + `.test.ts` | 108 + 86 |
| `src/common/lib/supabase/postgresAttached.ts` + `.test.ts` | 42 + 54 |
| `src/common/lib/supabase/realtimeDiag.ts` | 195 |

**The fault sink — 2 files, 152 lines**

`src/common/lib/fault/faultStore.ts` (84) + `faultStore.test.ts` (68). Its modal
is a floating-panel instance, not this area's.

**One util — 1 file, 22 lines**

`src/common/lib/util/cls.ts`. It is in almost every component, and the first
homepage audit noted that the comment justifying a hand-rolled `cls` is off by
about thirty lines.

**The server side of the envelope — 3 files, 321 lines**

| file | lines |
|---|---|
| `supabase/functions/_shared/envelope.ts` | 168 |
| `supabase/functions/_shared/dbResult.ts` | 120 |
| `supabase/functions/_shared/http.ts` | 33 |

In because the envelope has two halves that have to agree, and reading one
without the other is how they drift. `supabase/functions/_shared/startGame.ts`
(151) is **out** — it names games, so the rule excludes it.

## Listed and left OUT, each with the rule that excludes it

| | why |
|---|---|
| `src/games.ts`, `src/common/lib/games.ts` + test | name every game |
| all 32 files of `src/common/lib/game/` | same |
| `supabase/functions/_shared/startGame.ts` | same |
| `src/types/db.ts` (4,422 lines) | generated, and it names every game's schema. **Set `cs-na` 2026-09-02** (Joel): it carries a stamp it could never earn its way off, because nobody will ever hand-read it |
| `lib/util/`: `mulberry32`, `friendlyDate`, `linkify`, `layoutWidth`, `keyboardHandoff` | **`utils`**, the area created 2026-09-02 to take them. `deep` had said each would be picked up by whichever area uses it, which is no answer for a helper with callers in six areas. `cls.ts` and `reloadOnStaleChunk` stay here for now — see that area's roster |
| the common non-game **hooks** — `useProfile`, `useTabRing`, `useAppShortcuts`, `useRealtimeRefetch` and the rest | Joel, 2026-09-02: *"we should do the common non-game ones, but not here."* They are the same kind of thing, but taking ~60 files under `hooks/` would double the area and mix two vocabularies. **A candidate area of its own** |
| `base.css`, `utilities.css`, `fixed.css`, `breakpoints.css`, `patterns/*.css`, `themes/*.css` | **`corecss`**, the area created 2026-09-02 to take them, running directly after this one |

## Pass 1 — the boot path, read 2026-09-02

Nine files — seven read on 2026-09-02, then `loadTheme.ts` when `F-deep-9` put it
on the roster, and `Link.test.tsx`, which `F-deep-7` wrote because there was none. **Scope, set by Joel:** *"don't go deep into consumers of
the boot area (I don't want this audit to explode with issues), just critique of
the code/comments/correctness/etc of the boot area."* So a consumer is named only
where it is the evidence for something inside these seven files, and no consumer's
stamp moves.

**Numbering is per area, and the ID says which** (Joel, 2026-09-02): this area's
findings are `F-deep-1` … `F-deep-12`, so a number is never adrift from the
sequence it belongs to. §21 → "Areas" holds the reasoning.

**F-deep-12 came from the `homepage` area**, raised on 2026-08-26 while it read
its dependencies. It is numbered here rather than kept at the number it had,
because the file that raised it has been deleted (§21 → the restart) and a
regenerated `homepage` starts again at 1 — so its old number would come to mean
a different finding.

**Checked and NOT a finding**, recorded so it isn't re-derived: `Link.tsx` looked
like dead code — the homepage's last link went when the create-club page became a
modal — but it has three live consumers (`ClubGameCard:59`, `GamePage:178`, `ErrorPage:93`).

## Findings — pass 1, the boot path

Sixteen — **F-deep-1 … F-deep-16**, and none is open. Every heading says its
status; a heading with no status prefix would mean OPEN.

## MOVED · F-deep-1 · `stylesheet-map-rotted` · main.tsx's map of the stylesheet chain names two files that were deleted

**Moved to `corecss` 2026-09-02** (Joel), where it is `F-corecss-1`. The comment
is in `main.tsx`, which is this area's file, but what it describes is the core
stylesheet chain — so the correction belongs to the area that will decide what
the chain should say.

The number stays here, spent, per §21: an ID never moves and is never reused.

## RESOLVED · F-deep-2 · `gametype-case-mismatch` · A mis-capitalized gametype in a URL is diagnosed as a FAULT

`App.tsx:135` matches the game route with `/^\/g\/([a-z0-9_]+)\/([^/]+)\/?$/i`.
**The `/i` makes `[a-z0-9_]` match uppercase**, so `/g/Wordle/<id>` matches the
route. The registry lookup on the next line is case-SENSITIVE
(`games.find((g) => g.gametype === gametype)`), so it fails, and the branch that
handles a failed lookup renders the fault `ErrorPage` — whose text says *"The link
is wrong, or the game was removed from the app"* and whose comment justifies the
fault severity with *"every gametype in a URL came from a link this app wrote, so
an unregistered one means the registry and the link disagree."*

For a hand-typed capital that reasoning is false: the registry and the link agree,
the URL is just mis-cased. Two coherent answers, and they go opposite ways:

- **drop the `/i`** — a mis-cased URL then fails the regex and falls through to
  HomePage, which is the "be forgiving with URLs" stance the fallback comment
  states four lines earlier; or
- **lowercase the captured gametype before the lookup** — a mis-cased URL then
  works, which is more forgiving still.

Either is fine. What is wrong today is the third thing it does: diagnose it as a
fault.

> **resolution: lowercase before matching** (Joel, 2026-09-02) — the second
> option, and the more forgiving one. `App.tsx` now captures `urlGametype` and
> looks up `urlGametype.toLowerCase()`; every registered gametype is lowercase
> (checked against all sixteen manifests), so nothing else moves.
>
> `urlGametype` survives for the two places that should echo what the URL
> actually said rather than the normalized form: the error message and the
> diagnostics line's `call`. The fault branch keeps its severity — a gametype
> that is not a casing slip is still the registry and a link disagreeing.

## CLOSED · F-deep-3 · `palette-waits-for-the-session` · "Ahead of the auth gates" is true of the auth gate and false of the loading gate

`App.tsx:93` says the palette route sits ahead of the auth gates *"on purpose: it
renders tokens, not data, so there is nothing to sign in for"*, and `:97` says the
same for the font route. But `App.tsx:92` — `if (loading) return <Loading />` —
runs before both, so both instrument routes still wait on the session probe before
they render anything.

The comment is describing an intent the code half implements. Either the two
routes move above the loading gate, or the comment says "ahead of the auth gates,
behind the session probe".

> **resolution: CLOSED, and the finding should not have been raised** (Joel,
> 2026-09-02): *"the palette and fonts page are ABSOLUTELY EXCLUDED from this
> sprint. Do not read them, do not edit them, do not touch them."*
>
> I raised it thinking the rule covered the two pages and not a comment about
> them. It does not: the exclusion is total, and a finding about when those
> routes render is a finding about those routes. Nothing changes in `App.tsx`.

## RESOLVED · F-deep-4 · `boot-has-no-failure-path` · Two ways the boot can end in a white screen, neither of them announced

`main.tsx` has two unguarded steps:

- `document.getElementById('root')!` (`:55`) — a non-null assertion on the one
  DOM node the whole app needs.
- `await loadTheme()` (`:53`) — a **top-level await on a dynamic import**. If the
  theme chunk fails to load the module rejects, `createRoot` is never reached, and
  the page stays blank with nothing rendered to say so.

Also uncommented and load-bearing: **`reloadOnStaleChunk()` is registered at `:48`,
before that await, and the order matters.** A theme stylesheet fetched by dynamic
import is exactly the kind of asset an atomic deploy deletes, so the one thing that
can recover this failure has to already be listening when it happens. Nothing in
either file says so, and a tidy-up that moved the call below the await would break
it silently.

Whether boot deserves a real error path is a decision — the alternative is a
`try/catch` that paints a plain "couldn't start" message with the diagnostics line.

> **resolution: the try/catch, kept small** (Joel, 2026-09-02) — *"we don't
> need/want anything complex here, but they shouldn't get a totally white page,
> either — so a simple try/catch with whatever diagnostics are cheap would be
> good."*
>
> The theme load, the `#root` lookup and the render sit inside one `try`. The `!`
> is gone: a missing `#root` throws with a reason instead of asserting one away.
>
> The catch **paints itself** — plain DOM with inline styles, `textContent` not
> `innerHTML` — because nothing has rendered yet and the stylesheet chain is one
> of the things that can have failed. It shows one sentence and the app's own
> `diagnosticsLine('FAULT', …)`, which was already in the module graph, so the
> cheap diagnostics are also the standard format. The same line goes to
> `console.error`.
>
> **The ordering is now stated** in one clause on `reloadOnStaleChunk()`:
> registered before the await below, which is itself a dynamic import.
>
> `tsc -b` and eslint clean; `vite build` succeeds and the failure path survives
> minification (checked in the bundle, since a top-level `await` inside a
> `try` is the sort of thing a build target can quietly reject).

## RESOLVED · F-deep-5 · `usepath-misses-updates-before-mount` · A navigate() between first render and effect commit is lost

`usePath()` (`router.ts:58`) reads `window.location.pathname` in a `useState`
initializer and subscribes to `popstate` in a `useEffect`. Between those two
moments nothing is listening, so a `navigate()` fired in that window updates the
URL bar and the subscriber never hears it.

`useSyncExternalStore` is the React API built for precisely this shape, and it
closes the window by construction. **Severity, honestly: low today** — there are
two subscribers (`App:73` and `useGameInvitations:63`), App mounts once at boot,
and nothing currently navigates from a mount effect. It is a latent trap, not a
live bug, and the fix is small enough that the question is only whether to spend
it.

> **resolution: converted to `useSyncExternalStore`** (Joel, 2026-09-02). Thirteen
> lines became seven and the `useState` + `useEffect` pair is gone; `subscribeToPath`
> and `readPath` are module-level so React never resubscribes on a re-render, which
> is the one easy way to get this hook wrong.
>
> **The window is closed by construction**, not narrowed: React reads the snapshot
> during render and re-checks it once subscribed, so a `navigate()` in between
> forces a re-render. The snapshot is a string, so it needs no caching to compare
> equal, and there is no SSR here to need a server snapshot.
>
> **Pinned by a new test** — *"catches a navigate() fired before the subscription
> attaches"* — which stages the gap with a sibling that navigates from a LAYOUT
> effect, since those run before the passive effect a `useEffect` subscription
> would attach in. Proved by planting: it fails against the old implementation and
> passes against the new, while the other six tests pass against BOTH. That is why
> the gap survived — nothing already written could see it.
>
> It does not foreclose `F-deep-12`: if the router later carries the query,
> `readPath` becomes `pathname + search` and stays a primitive.

## RESOLVED · F-deep-6 · `navigate-pushes-duplicate-entries` · Navigating to the path you are already on adds a history entry

`navigate()` (`router.ts:90`) always pushes. Called with the current path it
stacks an identical entry, so the next Back press appears to do nothing — the URL
is the same and every subscriber re-renders to the same value. Nothing does this
today; it costs one comparison to make impossible.

> **resolution: an early return when the URL is already the one asked for**
> (Joel, 2026-09-02). It covers `replace` as well as push — a `replaceState` to
> the identical URL changes nothing either, and dispatching `popstate` for it
> wakes every subscriber for no change.
>
> **The comparison spans the query and hash, not just the pathname**, and that is
> the load-bearing detail rather than a nicety: `ClubPage:335` clears `?new=` with
> `navigate(window.location.pathname, true)`, so a pathname-only comparison would
> turn the strip into a no-op and strand the query in the URL bar.
>
> **All fifteen call sites checked first.** None navigates to the URL it is
> already on; `GamePage`'s `goToGame` looked like the exception and is not — it is
> for a PlayArea that just started a FOLLOW-UP game, so the id differs.
>
> Two tests, each proved by planting a different mistake: removing the guard fails
> *"does nothing when the URL is already the one asked for"*, and narrowing the
> comparison to the pathname fails *"still strips a query…"*. The second test was
> written the wrong way round first — it added a query rather than removing one,
> which passes under both implementations, and the plant is what caught that it
> guarded nothing.

## RESOLVED · F-deep-7 · `link-intercepts-target-blank` · The one "open elsewhere" gesture Link does not honor

`Link` (`Link.tsx:32`) is careful about gestures — it lets modifier-clicks and
non-left buttons fall through to the browser so "open in new tab" works, and its
docstring makes that promise explicitly. But `target` arrives through `...rest`
(the props type only omits `href` and `onClick`), so a caller writing
`<Link to="/c/x" target="_blank">` gets its click intercepted and navigated
in-page — the same affordance the file exists to preserve, broken by the one
attribute that states it declaratively.

None of the three consumers passes `target` today, so this is a trap rather than a
bug: one line (`if (rest.target) return`) or a type that omits `target` closes it.

> **resolution: honor it, don't forbid it** (Joel, 2026-09-02). One line —
> `if (rest.target && rest.target !== '_self') return`. Omitting `target` from the
> props type was the other option and is the wrong one: the component's whole
> promise is that it behaves like a vanilla anchor apart from plain left-clicks,
> and refusing an attribute is a smaller anchor, not a truer one. `_self` names
> this frame, so it routes.
>
> **`Link.tsx` had no test at all; it has one now** — `Link.test.tsx`, nine cases
> covering each way of asking for "open this elsewhere": the four modifier keys, a
> non-left button, `target="_blank"`, and `target="_self"` as the control.
> Removing the new line fails the `_blank` case and nothing else.
>
> Two things worth knowing about how it reads. The modifier and button cases use
> `fireEvent` rather than `userEvent`, because they assert about one FIELD of the
> click event and `userEvent`'s held-key state does not survive between two calls
> to the standalone API — the first draft used it and passed for the wrong reason,
> routing a click it believed was modified. And a handed-back click is asserted as
> an UNCHANGED path: jsdom does not follow an href, so it logs *"Not implemented:
> navigation to another Document"* — which is jsdom confirming the click reached
> the browser.
>
> **`download` was considered and left alone.** It is the same class of attribute,
> but `Link` addresses in-app routes and nothing can download one, so guarding it
> would be inventing a case.

## RESOLVED · F-deep-8 · `router-doc-cites-what-cannot-be-read` · The decision docstring points outside the repo, and its supporting number is stale

`router.ts:8` opens its rationale with *"Decision context (see project memory's
clubs-v1 entry)"*. **That is not in the repo** — no reader can follow it, and the
sprint has no way to check whether what it says still holds.

The argument it introduces then leans on a count: *"The app has a flat, small route
surface (~3 routes)"*. `App.tsx` resolves six — `/palette`, `/font`, `/c/<handle>`,
`/g/<gametype>/<gameId>`, the fallback, plus the auth and claim gates ahead of them.

**The decision itself still stands**, and nothing here argues for adding
`react-router`; six flat routes is still a route surface a regex handles. What
needs fixing is a rationale that cites an unreadable source and an out-of-date
number.

> **resolution: cut the rationale to the decision** (Joel, 2026-09-02) — *"we
> don't need to record the decision metadata: just a simple comment that says
> we're-not-using-react-router."* Twelve lines became two:
>
> > We don't use `react-router`. The route surface is flat and small enough that
> > a regex match is the whole job.
>
> Gone with them: the pointer to project memory, the route count, the bundle-size
> estimate, and the hash-vs-path comparison. Each was an argument for a decision
> already made, and every one of them could rot — which two of them had. What a
> reader needs is that the choice was made and roughly why; the case for it is
> not the file's job.
>
> `grep "project memory"` over `src/`, `supabase/` and `e2e/` returns nothing
> else, so this was the only pointer of its kind.

## RESOLVED · F-deep-9 · `loadtheme-is-boot-and-is-not-on-the-roster` · The file main.tsx awaits was left out

`src/common/themes/loadTheme.ts` (69 lines, `cs-unmet`, no test) is awaited by
`main.tsx:53` before the first render, decides which stylesheet chain the app
loads, and reads `?theme=` — which makes it the other half of F-deep-12. It **names no
game and no page**, so the area's own membership rule admits it, and the roster
missed it because `themes/` was set aside wholesale as "the vocabularies" when the
rest of that folder is stylesheets.

**Joel's call**, since it changes the roster: add it (making the boot path 8 files,
665 lines), or leave it to whichever area takes the themes.

> **resolution: it joins this roster** (Joel, 2026-09-02) — *"yes, loadTheme
> should be in roster for this."* Stamped `cs-met-deep` and read in the same
> sitting; the boot path is eight files, 665 lines. It has one consumer,
> `main.tsx`, and no test.
>
> `corecss` recorded it as a question it inherited; that note now points here so
> it is not decided twice.

## RESOLVED · F-deep-10 · `suspense-fallback-is-a-bare-p` · The game chunk's loading state is a raw paragraph

`App.tsx:180` — `<Suspense fallback={<p>Loading game…</p>}>` — while the app has a
`<Loading />` component, imported into this very file and used eight lines above at
`:92`. An earlier count found nine different ways to say "not ready" across the
app; this is the one sitting in this area's file.

> **resolution: `fallback={<Loading />}`** (Joel, 2026-09-02). The component was
> already imported in this file and used eight lines above, so the change is one
> expression.
>
> `<Loading />` is the right shape for a fallback rather than merely the shared
> one: it renders a word with no box, deliberately — *"they're not a card and
> don't need or want a border"* — and a bordered box that exists for 200ms before
> being replaced by a differently shaped one is the flash that layout stability
> exists to prevent. Its own docstring cites the count this finding is a leftover
> of.
>
> The boundary sits inside `GamePage`'s render-prop, so the fallback replaces the
> play surface only; the header and chrome stay put while the game's chunk
> arrives.

## RESOLVED · F-deep-11 · `sessionstorage-unguarded` · Blocked site data turns the recovery into a second failure

`reloadOnStaleChunk` (`:30`, `:32`) reads and writes `sessionStorage` inside the
listener with no `try/catch`. Where a browser blocks site data the access throws,
which means the listener throws before `event.preventDefault()` — so the page does
not reload AND the preload error is no longer swallowed. The failure is strictly
worse than not having the guard at all.

Genuinely an edge case, and the question is whether the app cares about that
browser configuration. If it does, it is a `try/catch` returning "no record".

> **resolution: guarded, and it FAILS CLOSED** (Joel, 2026-09-02, taking the
> recommendation). Not a question after all — the app decided this already:
> **eight of the eleven files that touch storage guard it**, and
> `useStickyChoice`'s docstring states the rule (*"`localStorage` failures are
> non-fatal. Private mode throws on read and write"*). This file and
> `loadTheme.ts` were the two that never got it.
>
> **The fallback is a decision, not a wrap.** The counter cannot count without
> storage, so it has to answer one way: `reloadedRecently()` returns TRUE. That
> gives up stale-deploy recovery — costing a manual refresh, which is what people
> did before this helper existed — rather than reloading uncounted, which is a
> reload loop on a genuine outage, the exact thing the counter is for.
>
> The write is guarded separately: a read can succeed where a write fails on a
> full quota, and a throw there would skip the `preventDefault()` and leave the
> page neither reloaded nor showing the error it swallowed.
>
> Pinned by a fourth test, and both directions planted: it fails if the fallback
> flips to `false`. It swaps the whole `sessionStorage` accessor rather than
> spying on `getItem`, because **jsdom implements `Storage` as a proxy** — a
> `vi.spyOn` there defines a property the proxy does not serve and the real method
> still runs, so the first version of the test passed against a deliberately
> broken implementation.

## RESOLVED · F-deep-12 · `router-query-params` · The router says query parsing is "not needed yet"; three places parse it

**Raised first by the `homepage` area** on 2026-08-26, reading its dependencies,
and it lands squarely on this area's files. It is numbered here rather than
inherited because the file that raised it has been deleted (§21 → the restart) and
a regenerated `homepage` will start again at 1 — so its old number would come to
mean a different finding. `loadTheme.ts:44` reads `?theme=`,
`ClubPage.tsx:275` reads `?new=`, and `ClubPage.tsx:302` strips the query once it
has read it. `usePath()` returns the pathname alone, so a component that cares
about the query cannot subscribe to it. Whether the router should carry the query
is a decision; the docstring asserting nobody needs it is just false.

> **resolution: the docstring, and only the docstring** (Joel, 2026-09-02).
> Surveying the callers is what settled it — **no consumer wants the reactive
> thing a router usually provides**, so there is nothing to build:
>
> | param | written by | read by | what it is |
> |---|---|---|---|
> | `?new=<gametype>` | `GamePage:491` (⌥+), `crosswords/PlayArea:874` | `ClubPage:308` | a ONE-SHOT intent: read once at mount, held until the club fetch settles, then stripped from the URL so a refresh cannot re-open the dialog |
> | `?theme=` | nobody — you type it | `loadTheme:75` | picks the stylesheet chain and writes through to `localStorage`; `?theme=daylight` is the way back out |
> | `?img=` | `e2e/gallery/index.html` | `e2e/gallery/index.ts:70` | **not the app** — a standalone dev page with no React and no router |
>
> `?theme=` is read **before React exists**, so a hook could not serve it, and
> `?new=` is deliberately read once — subscribing is the bug ClubPage is written
> to avoid. The gap the finding named is real but latent: `usePath()` returns the
> pathname alone, so a component that wanted the query could not subscribe, and
> none does.
>
> Two options were declined and are recorded so they are not re-derived: a plain
> `queryParam(name)` helper (mild duplication, two call sites), and carrying the
> query in `usePath` (cheap — it stays a primitive — but it changes what every
> subscriber re-renders on, to buy a capability nobody has asked for).

## RESOLVED · F-deep-13 · `theme-storage-unguarded` · Blocked site data stops the app from starting at all

`chosenTheme()` (`loadTheme.ts:44`, `:46`, `:50`, `:53`) reads and writes
`window.localStorage` with no `try/catch`. Where a browser blocks site data the
access throws — and this one throws **before any CSS is imported**, from inside
the function `loadTheme()` calls first. So `loadTheme()` rejects, and since
`F-deep-4` that is caught and painted as "The app could not start."

Before `F-deep-4` it was a silent white page; it was always fatal. **This is not a
style question the app has left open** — `useDraggablePanel` guards its
`localStorage` access at `:306` and `:314` and its docstring promises the
behavior: *"Falls back gracefully if `localStorage` is unavailable (private
browsing…)"*. Two files, two answers, and the one that gets it wrong is the one
that runs first.

Same shape as `F-deep-11` (`sessionstorage-unguarded`) and strictly worse:
there, blocked storage costs a stale-deploy recovery; here it costs the app.
Whatever is decided for one should decide both — the honest options are a shared
"storage that can't throw" helper, or a `try/catch` in each of the two places
that lack one.

> **resolution: guarded, falling back to daylight** (Joel, 2026-09-02, with
> `F-deep-11`). `storedTheme()` returns null where storage throws and
> `rememberTheme()` swallows a failed write — the `?theme=` still applies to the
> load that set it, it just will not survive the next navigation. The cost is a
> midnight user's stickiness in that browser; the cost of leaving it was the app.
>
> **The shared helper was NOT built, deliberately.** Landing it with these two
> callers converted and the other eight left raw is a half-migration, and those
> eight belong to areas that have not opened. It went to the new `utils` area
> instead, together with the half that matters — **a guard banning raw
> `localStorage.` outside the helper.** A convention that eight files keep and two
> break is what produced both of these findings, and the repo's answer to that is
> a mechanism, not more care.

## RESOLVED · F-deep-14 · `theme-chunks-load-serially` · Two awaits where one wait would do

`loadTheme()` awaits its two stylesheet imports one after the other
(`:59`–`:60`, `:62`–`:63`) — `dark-mode` then `midnight`, or `light-mode` then
`daylight`. The second request does not start until the first resolves, so the
chain costs two round trips.

They have no dependency on each other: both are plain CSS, and the cascade order
is decided by import order in the built stylesheet rather than by which promise
settles first. `Promise.all` makes it one wait.

It is a small number, in the one place the app can least afford one: this await
is the last thing before the first paint, and every other boot step is
synchronous.

> **resolution: `Promise.all`** (Joel, 2026-09-02). One wait instead of two.
>
> **The finding asserted that cascade order survives this, and that claim was
> checked against the real build rather than reasoned about**, because it is the
> whole risk: if the `<link>` order followed which download finished first, a
> parallel load could put `midnight.css` ahead of `dark-mode.css` intermittently
> — invisible on a fast local machine and wrong in production.
>
> It holds. Vite compiles each `import('./x.css')` to `__vitePreload(() =>
> Promise.resolve({}), deps)`, and that helper does
> `document.head.appendChild(link)` **synchronously inside the `.map` over its
> deps** — at CALL time, not on resolve. Both calls sit inside the array literal,
> so both links attach in written order before either is awaited. Confirmed in
> the minified bundle:
>
> ```js
> // before:  await T(deps[201]), await T(deps[202])
> // after:   await Promise.all([T(deps[201]), T(deps[202])])
> ```

## RESOLVED · F-deep-15 · `theme-key-off-convention` · The one localStorage key that doesn't look like the others

`STORAGE_KEY = 'pup-theme'` (`loadTheme.ts:35`). Every other key the app stores
under is `<scope>:<thing>` with a colon, and the app-wide scope is spelled
`puzpuzpuz`: `puzpuzpuz:chat:open`, `puzpuzpuz:scratchpad:open`,
`puzpuzpuz:help:rect`, `puzpuzpuz:gameInvitesSeen`, plus game-scoped ones like
`crosswords:collapseRebus`.

`pup-theme` is the only key with a hyphen instead of a colon, and `pup` is a
prefix nothing else in the app uses.

**Renaming it is a data question, not just a naming one:** the key is live in
real browsers, so a rename silently drops whoever has `midnight` stored. That
costs nothing here — midnight is a flagged spike and `?theme=midnight` sets it
again — but it should be said out loud rather than discovered.

> **resolution: `puzpuzpuz:theme`** (Joel, 2026-09-02), which puts it on the
> app-wide scope with the rest: `puzpuzpuz:chat:open`,
> `puzpuzpuz:gameInvitesSeen`, `puzpuzpuz:help:rect`,
> `puzpuzpuz:scratchpad:open`. One reference, one file — nothing else names the
> key.
>
> **No migration, and that is the decision rather than an oversight.** Anyone
> holding `pup-theme: midnight` in a real browser silently returns to daylight.
> The cost is one keystroke of `?theme=midnight` on a flag with no UI, which is
> not worth a read-the-old-key-then-write-the-new shim that would have to be
> carried until someone remembered to delete it.

## RESOLVED · F-deep-16 · `themename-export-unread` · An exported type and a return value, neither read

`export type ThemeName` (`loadTheme.ts:33`) has no consumer outside its own file.
`loadTheme()` is typed `Promise<ThemeName>` and its one caller, `main.tsx:56`,
discards the result.

The docstring explains a different mechanism and is right about it: the theme is
published on `document.documentElement.dataset.theme` (`:67`), which is what a
reader would actually use. The return value is a second channel for the same fact
that nobody reads.

Not a bug, and not urgent — but `ThemeName` is exported, which is a claim that
somebody outside needs it.

> **resolution: keep both, change nothing** (Joel, 2026-09-02): *"we'll keep the
> export and not worry that main.tsx doesn't use it now."*
>
> A theme's name is the kind of thing a caller will want, and `loadTheme()`
> already knows it — dropping the return to add it back later is churn for a
> line that costs nothing. Recorded so the next reader does not re-raise it: the
> unread export is deliberate, not an oversight.

## Questions this pass raises rather than answers

1. **ANSWERED 2026-09-02 — `App.tsx` has no seam where the plan says it splits.**
   §7 puts its boot half in this area and its per-page/per-game routing rows in the
   areas that own those pages, but the file interleaves them in one 160-line
   function body — the route table sits in the same `if/else` chain as the auth
   gates, and four global hosts plus two cross-subtree modals hang off athe same
   return.

   Joel's answer: **`App.tsx` does not get split.** It is a shell, and a shell
   holds the route table and what hangs off the root; the boot/routing line is a
   scope line for this audit, not a seam the code owes anyone. The root-mounted
   components became **`common-hosts`** instead, scheduled after `utils`.

*(the data-path and realtime passes have not run.)*
