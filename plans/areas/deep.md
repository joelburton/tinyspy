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

**Two passes of three are DONE, with nothing open.** The BOOT pass: nine files,
sixteen findings — fourteen RESOLVED, one CLOSED, one MOVED to `corecss`. The
DATA PATH, read 2026-09-02: eleven files, eleven findings `F-deep-17` …
`F-deep-27`, **all RESOLVED**. The REALTIME PLUMBING was read the same day:
seven files, **five findings `F-deep-28` … `F-deep-32`, all RESOLVED** — no
defects, four duplications-of-one-fact and a coverage gap. **The three named
passes are done. The FAULT SINK was read the same day: two files, **three
findings `F-deep-33` … `F-deep-35`, all RESOLVED.** `cls.ts` was read the same
day: **one finding, `F-deep-36`, RESOLVED.** The SERVER SIDE of the envelope was
read the same day: three files, **three findings `F-deep-37` … `F-deep-39`** —
one RESOLVED, two open. **Every file on the roster has now been read.**

## The roster — 35 files, 4,880 lines

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
| the common non-game **hooks** — `useProfile`, `useTabRing`, `useAppShortcuts`, `useRealtimeRefetch` and the rest | Joel, 2026-09-02: *"we should do the common non-game ones, but not here."* They are the same kind of thing, but taking `hooks/` — 87 files, 12,177 lines — would have swallowed this area. **`hooks` is now an area of its own**, and `App.tsx` waits on it to be blessed |
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

## Pass 2 — the data path, read 2026-09-02

Eleven files, 2,860 lines — about half of it tests. This is the layer the
error/envelope sprint rebuilt and finished 2026-09-01, so it was read against
**docs/envelopes.md**, which is canonical and outranks any comment here.

**Findings F-deep-17 … F-deep-25.** The shape of what turned up: the LOGIC is in
good order and matches the doc; what has drifted is the prose around it — three
docstrings describing a world that changed under them — plus one real hole in the
presentation path and two facts computed and thrown away.

**Checked and NOT findings**, recorded so they are not re-derived:

- `faultEnvelope`'s `error?.code || ourCode || null` uses `||` rather than `??`
  deliberately: `callEdgeFn:98` sets `code: ''` for a codeless transport failure,
  and `??` would let the empty string win over `ourCode`.
- `db.ts` (26 lines) and `dbLog.ts` (175) are clean. `dbLog`'s fixed-field line,
  its `fieldValue` / `quotedText` split, and the level→console-method map all
  say what they do and do it.

## RESOLVED · F-deep-17 · `orphaned-docstrings-in-the-envelope-layer` · Two docstrings sit above the wrong declaration

Both have the tell an earlier audit named for this exact bug — **two docstrings
stacked with nothing between them** — so the one above documents whatever the
one below is attached to, and its real subject reads as undocumented.

- **`dbEnvelope.ts:105`** — *"**Is this one of the four?** — the question a call
  site asks when it wants to treat 'our server did not answer' as one thing"*,
  which describes `isEnvironmental` (`:129`), sits above `situationFor`'s own
  docstring (`:115`). So `situationFor` appears to carry two descriptions and
  `isEnvironmental` none — and the orphan is the more useful of the two, since it
  records why the codes exist at all (`useGameTimer` used to ask `dbcode === null`,
  which was true for these AND for every frontend-detected bug).
- **`envelope.ts:45`** — *"**The envelope** — the one shape everything travels
  in"*, twenty lines and the canonical description of the type, sits above
  `OkCommon<T>` (`:69`). `Envelope` itself (`:88`) has no top-level docstring;
  only its three arms are documented.

> **resolution: each docstring moved onto the declaration it describes** (Joel,
> 2026-09-02). Nothing was rewritten — the prose was already right about its
> subject, it was attached to the wrong one.
>
> `isEnvironmental` now carries the "Is this one of the four?" explanation, and
> `situationFor` carries one docstring instead of appearing to carry two.
> `Envelope` carries "The envelope — the one shape everything travels in", and
> `OkCommon` keeps its own two-line note.
>
> **Swept for the pattern afterwards rather than assumed fixed**: no docstring in
> any of the eleven data-path files now directly follows another. That is the tell
> this bug has had both times it has been found, so it is the thing to check.

## RESOLVED · F-deep-18 · `throw-path-is-silent` · A failure that arrives by throw is neither logged nor presented

`runRpc:375` and `readRows:471` each catch a throw and `return
nothingReachedUs(...)` — **no `reportFault`, no `logDb`.** Every other failure
path in both functions reports before returning.

**And the transport does not cover for them.** `dbFetch:181` logs a thrown fetch
only `if (name === 'AbortError' || isSupabaseInternal(...))`, on the stated
reasoning that *"a failure on OUR endpoints reaches a wrapper, which writes the
better line"*. For a throw on `/rest/v1/` or `/functions/v1/` that is false: the
wrapper writes nothing. **Neither layer records it** — no `[db]` line, no modal,
and the only trace is whatever the call site does with the envelope.

The comment on the branch says this is *"the same case by another road, not a
different one"*. That is exactly the argument for treating it the same, and the
two roads differ in the one thing this system exists to guarantee: the `status:
0` road goes `settled.error` → `failureEnvelope` → `reportFault`, logged and
shown.

**The tests can already see this and are not pointed at it.**
`dbResult.test.ts` imports `peekFaultsForTest` and asserts presentation at
`:131` and `:140`; the thrown-rejection test at `:255` asserts only the
envelope's contents. So the hole is invisible to a green suite.

Narrow — postgrest-js converts a rejected fetch to `{ status: 0 }` before it
reaches here, so this catches a throw from some *other* layer — but "narrow"
is why it would be silent for a long time.

> **⚠️ THE FINDING ABOVE IS OVERSTATED, and the correction is the useful part.**
> Asked to describe a problem that would actually be silent, I could not — so I
> read `postgrest-js` instead of reasoning about it:
>
> - `PostgrestBuilder.then()` wraps the request in `res.catch(fetchError => …)`
>   and returns `{ error, data: null, count: null, status: 0, statusText: '' }`
>   for **every** rejection, `AbortError` included;
> - the only escape is `shouldThrowOnError`, and **nothing in `src/` calls
>   `.throwOnError()`**;
> - every production call passes a real builder (`db.rpc`, `db.from`,
>   `client.schema`) — the only `Promise.reject` in the repo is in the test.
>
> **So the branch cannot fire today**, and `runEdgeFn`'s missing `catch` is
> equally unreachable: `functions-js`'s `invoke` catches its own body and
> RETURNS `{ data: null, error }`.
>
> What is real is not a silent failure but **a branch that cannot fire whose
> comment says it can** — *"the same case by another road, not a different one"*
> reads as a live safety net over dead code, and it is primed rather than broken:
> one `.throwOnError()`, or a supabase-js that stops converting, turns it into a
> silent failure whose trigger is a change somewhere else entirely.
>
> **resolution: make it report** (Joel, 2026-09-02, choosing that over deleting
> the branch or only correcting the comment). Both wrappers now build the
> transport and call `reportFault` before returning, so the branch cannot be
> reachable AND silent. The comments say what is true: unreachable today, kept as
> a guard against the library's conversion contract changing.
>
> One thing checked while chasing this and worth recording, because it would have
> been a much larger finding: **`processResponse` opens with `let statusText =
> res.statusText` and returns it**, so `dbFetch`'s `FE003`/`FE004` verdict does
> survive the library to the wrapper. The mechanism is intact in production, not
> only in tests.

## RESOLVED · F-deep-19 · `content-type-tell-is-computed-and-dropped` · The one fact that identifies a foreign responder is built and discarded

`dbFetch:246` builds `` `body was not JSON (content-type: ${contentType})` ``
into `unparsed`, above a comment saying *"The content-type is the tell, and it is
free: `text/html` is a gateway's error page, `text/plain` is the edge runtime,
nothing is an empty reply."*

**The string is never used.** `unparsed` appears three times in the file — its
declaration, that assignment, and `!unparsed` as a boolean at `:258`. The
content-type never reaches a log or an envelope.

The comparison is what makes it a finding rather than a nit: `callEdgeFn:86`
builds the identical sentence for the identical situation and **carries it**, as
`details`, so it lands on the `[db]` line. The same fact survives on the edge
path and evaporates on the database path.

> **resolution: the string goes, and the fact turns out not to be lost** (Joel,
> 2026-09-02). Tracing where it would have gone answered the finding: for an
> unparseable body `processResponse` does `else error = { message: body }`, so
> **the body itself already reaches the wrapper** and lands on the `[db]` line as
> `detail`. The content-type is redundant beside it — `<html><head><title>502…`
> says everything `content-type: text/html` does, and names the gateway.
>
> `unparsed: string | undefined` is now `parsed: boolean`, which is all the
> verdict chain ever read.
>
> **The alternative was rejected for a stated reason**, not omitted: logging it in
> `dbFetch` contradicts that file's own rule — *"this narrates only what nothing
> else will… a line here as well would put a bare `OK` directly above one that may
> contradict it"* — and there is no other channel, since `statusText` carries the
> verdict code that `situationFor` matches exactly, headers do not survive
> postgrest-js, and the body belongs to the caller.
>
> **What the chase actually turned up is `F-deep-26`**, below, which is the more
> valuable half.

## RESOLVED · F-deep-26 · `environmental-detail-is-unbounded` · A body the server chose the length of renders in the fault modal

Found while resolving `F-deep-19`, and the reason that one was worth chasing.

On the environmental path `detail` is frequently **a body we could not parse** —
a captive portal's whole HTML page, a gateway's error document — and it does not
stay in the console. `reportDbFault` passes the diagnostics line to
`showFaultModal`, and `diagnosticsLine` prints `detail=` in full. So an
untrimmed body renders on screen, quoted, on one line.

**The codebase already knew to guard this and this path was the exception**: five
sites in `dbResult.ts` trim a raw body into `detail` with `.slice(0, 120)`. The
environmental path — the one most likely to receive something enormous, since by
definition nobody could parse it — did not.

> **resolution: clamped in `environmentalEnvelope`**, which is the single builder
> every environmental path reaches, including `nothingReachedUs` and both of
> `failureEnvelope`'s branches. Same 120 as the existing five, with an ellipsis;
> matching them matters more than the number does. `faultEnvelope` is deliberately
> untouched — a raw fault's detail is Postgres talking, which is bounded and worth
> having whole.
>
> Pinned by a test and proved by planting: removing the clamp fails it.
>
> **A note for whoever owns `src/guards/`:** my first version of the `dbFetch`
> comment tripped `noRawServerMessage`, because that guard matches
> `<ident>.message` **inside comments** — so prose explaining the rule violates the
> rule. I reworded rather than take an exemption, but the guard reading comments
> as code is worth knowing about.

## RESOLVED · F-deep-20 · `verdict-comments-trail-their-branch` · In the file's subtlest expression, each comment explains the line above it

`dbFetch:256` decides who answered, in a four-way chain. Every comment in it
FOLLOWS the branch it explains, where every other comment in the file leads:

```ts
: !unparsed ? NO_ANSWER_TO_CODE_AND_TEXT.upstreamDown
// It PARSED but carried no SQLSTATE — Kong's own …
: NO_ANSWER_TO_CODE_AND_TEXT.foreignResponder
// An unparseable body. PostgREST ALWAYS speaks JSON …
```

So "It PARSED" sits directly above `foreignResponder`, which is the branch for a
body that did NOT parse, and the last comment dangles past the end of the
expression. **The code is correct** and matches docs/envelopes.md (`FE003` =
parsed without a SQLSTATE, `FE004` = would not parse); it is the reading that is
off by one, in the one place in this file where getting the branch wrong matters.

> **resolution: each comment moved above the branch it explains** (Joel,
> 2026-09-02), which is the convention everywhere else in the file. No prose
> changed and no branch moved — `git diff --numstat` is `2 2`, and the four
> changed lines are the same two expressions in the other order.
>
> The `null` arm needs no comment of its own: the block above `verdict` already
> says *"`null` means there is nothing for this layer to add — Postgres named
> itself with a SQLSTATE."*

## RESOLVED · F-deep-21 · `nothing-answered-says-four-sites` · A docstring counts call sites, and the count is wrong

`dbResult.ts:55` — *"it is asked at four call sites, and getting it wrong is
invisible"*. It is asked at **two**: `:167` in `failureEnvelope` and `:295` in
`runEdgeFn`. The argument for naming the predicate still holds; the number does
not, and a number in a docstring is a thing a reader checks.

> **resolution: the count comes out rather than being corrected** (Joel,
> 2026-09-02) — the same move he made on `router.ts` for `F-deep-8`, and for the
> same reason: a number in a comment is a thing that rots, and this one already
> had. The argument survives whole without it, because the argument was never the
> count — *"getting it wrong is invisible: both answers produce an
> `Envelope<never>`, so no type and no test notices the difference."*
>
> **Fixing it prompted a sweep for the same species, which found `F-deep-27`.**

## RESOLVED · F-deep-27 · `fifteen-games` · Three comments count the games, and the count is one behind

Found by sweeping for counted claims after `F-deep-21`. **Sixteen games are
registered** — sixteen manifest imports in `src/games.ts`, sixteen folders under
`src/` — and three comments say fifteen:

- `dbResult.ts:104` — *"so fifteen boards can't drift on it"*
- `supabase.ts:124` — *"covers all fifteen games' data channels"*
- `lib/games.ts:229` — *"it reads in all fifteen games afterwards"*

> **resolution: the two in this area are rewritten to say the thing that stays
> true** — "so no board can drift on it", "covers every game's data channels" —
> rather than bumped to sixteen, which would rot again the next time the roster
> grows. That is `F-deep-21`'s lesson applied rather than restated.
>
> **The third is NOT this area's.** `src/common/lib/games.ts` names every game,
> so `deep`'s membership rule excludes it; it belongs to whichever area takes the
> manifest registry. Recorded here so it is not lost.

## RESOLVED · F-deep-22 · `calledgefn-doc-describes-the-superseded-contract` · The transport adapter documents the system that replaced it

Two ways, both in `callEdgeFn.ts`:

- **`:39` names three functions that do not exist.** *"`{ error }` ready for
  `failureMessage` / `faultMessage` / `failureText`, which own all wording per
  the caller's surface."* None of the three is defined anywhere in `src/` —
  they went with `errorCopy.ts` and `serverError.ts` when the envelope sprint
  deleted them. Every remaining mention in the repo is a comment.
- **`:29` frames the fe-error-key contract as how a function reports errors.**
  *"Every function returns errors as `{ error: '<fe-error-key>', code? }` —
  `key|detail1|detail2|` shapes, never player-facing prose."* docs/envelopes.md
  → How edge functions build one is the authority and says otherwise: **a
  function answers 200 with an envelope whenever it RAN**, relays an RPC's
  envelope untouched, and *"the function's own `error` channel then means only
  one thing: the RPC never ran."* The channel still exists; what it means is now
  much narrower than this describes.

The code below the docstring is fine — parsing a 4xx body for `{ error, code }`
is right for the case that remains. It is the framing that is a version behind.

> **resolution: the contract section rewritten from docs/envelopes.md**, which
> is canonical (Joel, 2026-09-02). It now says what is true: a function that RAN
> answers 200 with an envelope, faults included; where it calls an RPC it relays
> that envelope untouched; **so its own `error` channel means one thing only —
> the RPC never ran** — which is precisely the case this adapter digs out of a
> 4xx. The three deleted helpers are gone from the closing line, replaced by
> "`{ error }` for `runEdgeFn` to classify. Nothing here words anything a player
> reads."
>
> Everything still true was left alone: why call sites must not hand-roll the
> `error.context` read, and the two facts that read recovers (`code` and
> `answered`).
>
> **The data path now has no reference to the three deleted helpers.** Four
> remain elsewhere, and none is this area's:
>
> | file | owner |
> |---|---|
> | `codenamesduet/components/PlayArea.tsx:86` | `codenamesduet` |
> | `common/hooks/game/useWordSubmit.ts:121` | `hooks` |
> | `scrabble/components/BoardCol.tsx:50` | `scrabble` |
> | `guards/noRawServerMessage.test.ts:86`, `:96` | whoever owns `src/guards/` — and `:96` is the failure MESSAGE, so it prescribes a function that does not exist to whoever trips the guard |

## RESOLVED · F-deep-23 · `notrows-fault-has-no-duration` · One report drops the `ms` every other one carries

`readRows:501` reports the not-rows fault with `{ call, status: 200 }` and no
`ms`, where `started` is in scope four lines up and every other `reportFault` in
both wrappers passes one. The `[db]` line's promise is that a blank field means
something — here a blank `ms=` means nobody passed it, which is the one meaning
it is not allowed to have.

> **resolution: it passes `ms` like the others** (Joel, 2026-09-02). One
> expression, from the `started` that was already four lines up.
>
> **Swept the rest rather than fixing only the one named**: all twelve
> `reportFault` sites in the file now carry a duration — nine through the shared
> `transport` object, three built inline in `readRows`, which has no `transport`
> because its two failure paths need different statuses. That is the whole of it;
> there is no fourth shape.

## RESOLVED · F-deep-24 · `is-environmental-null-check-is-dead` · A guard that cannot change the answer

`dbEnvelope.ts:131`:

```ts
return dbcode !== null && Object.values(NO_ANSWER_TO_CODE_AND_TEXT).some((s) => s.code === dbcode)
```

`null` is never equal to any of the four code strings, so `.some(...)` already
answers `false` for it. The conjunct reads as a necessary null guard and is
inert.

> **resolution: the conjunct deleted** (Joel, 2026-09-02), leaving the `.some`
> alone. Proved inert before removing rather than argued: both forms were run
> against `null`, `undefined`, `''`, a real code, an unknown `FE` code and
> nonsense, and agree on all six. Both live callers (`useGameTimer:98`, `:132`)
> pass `res.dbcode` off a narrowed `not-ok`, so neither depended on it either.
>
> **Why it was worth removing rather than shrugging at**, since the cost was
> four skipped comparisons: the line made a claim about the domain that is not
> true — that `null` is a special case here — and this is the one function where
> that misreads worst. Its own docstring records that `dbcode === null` USED to
> be the whole test, and that the four codes exist so nothing has to identify
> these by an absence. A leftover null check on the function that replaced the
> null check is exactly where the old idea gets read back in.

## RESOLVED · F-deep-25 · `no-test-covers-the-silent-throw` · The suite pins the envelope on that path and not the reporting

The test half of `F-deep-18`, separated because it outlives the fix: whatever is
decided about the throw path, the reason it could go unnoticed is that
`dbResult.test.ts:255` asserts `type`, `severity`, `message` and `detail` on a
thrown rejection and asks nothing about whether it was reported — while the same
file asserts exactly that for the `status: 0` road at `:131` and `:140`, using
`peekFaultsForTest`.

A fix for `F-deep-18` that does not add the assertion leaves the next regression
just as quiet.

> **resolution: the assertion added, and the criticism corrected.** The test was
> not failing to cover a real failure mode — it covers a SYNTHETIC one, since a
> hand-built rejected promise is the only thing that reaches that branch. That is
> the reason the assertion belongs there rather than an accident: the branch's
> whole job is to behave if it ever fires.
>
> `expect(peekFaultsForTest()).toHaveLength(1)` now sits beside the envelope
> assertions, and it was proved by planting — reverting `readRows`'s catch to the
> silent form fails it, and nothing else.

## Notes from this pass that belong to OTHER areas

Filed here because `callEdgeFn`'s docstring is what led to them; **none is this
area's to fix.**

1. **`src/guards/edgeFnErrorKeys.test.ts` guards a shape almost nothing emits.**
   Exactly one `json({ error` site is left in `supabase/functions`
   (`letterboxed-build-board`), the rest having become envelopes. Worse, its
   non-vacuity assertion is `expect(files.length).toBeGreaterThan(10)` — that the
   scan found FILES, not that it found any `error:` value to check. It passes
   26/26 and could pass while checking nothing. **Whoever owns `src/guards/`.**
2. **Two edge functions still document the old shape**:
   `crosswords-import-nyt/index.ts:29` and
   `crosswords-import-guardian/index.ts:28` both describe
   `→ { error: fe-error-key, code?: SQLSTATE }`. **`crosswords`.**
3. **`src/guards/noRawServerMessage.test.ts:96` prescribes a deleted function**:
   its failure message tells you to *"route it through
   failureMessage()/failureText()"*. Neither exists. **Whoever owns
   `src/guards/`.**


## Pass 3 — the realtime plumbing, read 2026-09-02

Seven files, 651 lines. Small, and the least changed by the recent sprints —
this is the layer built for the lost-event failure mode
(docs/realtime-lost-events.md), and it holds up on reading.

**Findings F-deep-28 … F-deep-32.** Nothing here is a defect. Four are one
fact written in two places, one is a coverage gap, and the last is a
placement question this pass inherits rather than raises.

**Checked and NOT findings**, recorded so the next reader does not repeat the
work:

- **The deaf-window contract IS honored everywhere.** Grepping for
  `onPostgresAttached` finds it in 8 files while 16 bind `postgres_changes`,
  which looks like eight surfaces exposed — and three of those are non-test
  files (`letterboxed/hooks/useGame.ts`, `strands/hooks/useGame.ts`,
  `common/lib/game/pause.ts`). **It is a false positive.** The first two go
  through `useRealtimeRefetch`, which imports `onPostgresAttached` and does the
  attach refetch centrally, and `pause.ts`'s only mention is prose in a comment.
  A file-level grep under-counts a contract kept by a shared hook.
- **`rtVerbose()` guards its `localStorage` read** (`realtimeDiag.ts:89`), so
  this file was already following the rule `loadTheme` was not — see
  `F-deep-13`.
- `channelDedupSuffix`'s docstring cites "`useGame.ts` files" as the canonical
  example; those exist, one per game.

## RESOLVED · F-deep-28 · `logstamp-lives-in-the-realtime-module` · An app-wide primitive is imported from the diagnostics of one subsystem

`logStamp()` is defined in `realtimeDiag.ts:64` and its own docstring says it is
shared *"across the console-diagnostics families"* — three of them, and only one
is realtime:

| channel | reader |
|---|---|
| `[rt]` | `realtimeDiag.ts` itself |
| `[db]` | `dbLog.ts:3` — the lowest layer of the server-result system |
| `[ui]` | `components/game/PlayAreaMountLog.tsx:4` |

So `dbLog`, whose own docstring says it is where `dbFetch` and `dbResult`
*"meet"* and that it has no opinion about anything, reaches into the realtime
module for its timestamp. Nothing is duplicated and nothing is broken — one
implementation, three importers — it is purely a question of where the thing
lives.

**This was found before and lost its home.** The `homepage` area's 2026-08-26
dependency read raised it as `logstamp-in-realtimediag`; that audit was deleted
2026-09-02, and both files are `cs-met-deep`, so this area can own it.

> **resolution: moved to `src/common/lib/util/logStamp.ts`** (Joel, 2026-09-02).
> Four files, no behavior change. `docs/common-folders.md:155` defines that
> folder as *"tiny cross-cutting utilities (class names, dates, layout width)"*,
> which this matches more exactly than `cls` or `layoutWidth` do — and, the point,
> it now lives somewhere **none of its three consumers owns**. Moving it into
> `dbLog` instead would have rotated the oddity rather than removed it: `[rt]` and
> `[ui]` would import from the database module.
>
> Its docstring is rewritten from the neutral position and names all three
> channels; the old one was written from inside `realtimeDiag`, so it called one
> family "here", named `[ui]`, and omitted `[db]` altogether — the very consumer
> that made this a finding.
>
> **A `lib/log/` module for the console channels was considered and rejected.**
> The three share a convention (`[tag HH:MM:SS.mmm]`) but only the stamp is
> genuinely common: `logDb` writes a fixed nine-field line, `rtLog` writes
> `topic — msg` with a level, `PlayAreaMountLog` writes prose. A `channelLine()`
> helper would have one real caller and two pass-throughs, which is the generic
> layer this sprint keeps learning not to build.
>
> The roster is 34 files; `utils` inherits the question of whether the file
> belongs to it permanently, exactly as it already does for `cls.ts` and
> `reloadOnStaleChunk.ts`.

## RESOLVED · F-deep-29 · `bare-topic-written-twice` · One fact about realtime-js, in two functions

`channelTeardown.ts:62` and `realtimeDiag.ts:98` are the same three lines:

```ts
topic.replace(/^realtime:/, '')
```

Each carries its own docstring saying realtime-js prefixes topics and our
callers speak the bare name — so the library detail is stated twice as well as
implemented twice. `channelTeardown` calls its copy `bareName`, `realtimeDiag`
calls its copy `bareTopic`, and the two differ only in taking a string versus a
channel.

Small, and the reason it is worth a line: the prefix is not ours. It is a
convention of a dependency this area's comments elsewhere pin to an exact
version ("verified against `@supabase/realtime-js` 2.108.1"), and a change to
it would need finding in two places.

> **resolution: one definition, exported from `realtimeDiag`** (Joel,
> 2026-09-02), taking a string so both callers use the same one —
> `channelTeardown` on `ch.topic`, `instrumentChannel` on `ch.topic`.
>
> **The direction was forced, not chosen.** `channelTeardown` already imports
> `rtLog` from `realtimeDiag`, so exporting from there adds no new coupling;
> putting it the other way would have made a cycle.
>
> Kept `bareName` over `bareTopic`, because it names the ANSWER rather than the
> input, and matches the vocabulary `channelTeardown`'s own map docstring already
> uses: *"keyed by the bare channel name … without realtime-js's `realtime:`
> topic prefix."* Topic is the library's word, name is ours, and the function
> converts one to the other.

## RESOLVED · F-deep-30 · `system-payload-parsed-twice` · The correctness guard and the diagnostic read one message independently

`onPostgresAttached` (`postgresAttached.ts:35`) and `instrumentChannel`
(`realtimeDiag.ts:119`) both bind `'system'` on every channel and both pick
apart the same payload with the same string literals — `['status']`,
`['extension']`, `'ok'`, `'postgres_changes'`.

They are not redundant: one is a correctness guard that triggers a refetch, the
other writes the console line. What makes the pair worth naming is **which two
things would drift.** If the server's message shape ever changes, the guard
stops closing the deaf window and the diagnostic stops reporting it — and the
diagnostic is exactly what you would read to discover the guard had stopped
firing. The two things that must not fail together are the two that share no
code.

> **resolution: the message gets a name — `SystemPayload`, in `realtimeDiag`**
> (Joel, 2026-09-02), and both readers take it. Exported from the module that
> instruments channels generally rather than from the one specific concern, which
> is the same direction `F-deep-29` sent `bareName`; no cycle either way, so the
> rule was consistency rather than necessity.
>
> **What it buys, stated exactly, because it is less than it looks.** A wire
> shape can be renamed by the server and a TypeScript type will not notice — the
> field just reads `undefined` in both places, as before. What the type removes is
> the key names being spelled independently at two call sites, and it makes both
> read in dot notation instead of `payload?.['status']`. Its docstring carries the
> reason the pair matters, at the shape rather than at either reader.
>
> Neither reader lost anything: the guard is one line now, and the diagnostic
> still logs EVERY system message, not just the postgres_changes one.

## RESOLVED · F-deep-31 · `realtimediag-has-no-test` · The one file that patches a third-party API by hand is the one with no test

Three of the four modules here have tests — `channelDedup` (110 lines),
`channelTeardown` (86), `postgresAttached` (54). `realtimeDiag.ts` is the
largest at 195 lines and has none.

It is also the one doing the riskiest thing: it **monkey-patches three methods**
of a `RealtimeChannel` — `.on()`, `.subscribe()`, `.unsubscribe()` — reassigning
`.on` through a cast (`;(ch as { on: unknown }).on = …`) and forwarding
arguments verbatim because *"RealtimeChannel.on has a dozen overloads"*. Its
correctness rests on a hand-verification against one library version, recorded
in a comment.

So the failure mode is a dependency bump: a changed overload or subscribe
signature would break instrumentation for every channel in the app, and the
symptom is **console lines going missing** — which is the one symptom nobody
notices, because the module's whole job is to be the thing you read when
something else is wrong.

> **resolution: `realtimeDiag.test.ts`, fourteen cases** (Joel, 2026-09-02),
> stamped `cs-met-deep`. The roster is 35 files.
>
> **Every wrapper test asserts BOTH halves, and the second is the point:** the
> line is written, AND the app's own callback still runs with the payload
> untouched. A wrapper that logs but swallows the callback would break every
> realtime feature in the app while looking perfectly healthy in the console —
> the failure this module could produce and nothing would have caught.
>
> Proved by planting both: dropping `cb(payload)` from the `.on` wrapper fails
> the postgres_changes case, dropping `cb?.(status, err)` from the subscribe
> wrapper fails the status case. One test each, nothing else.
>
> **The channel double is hand-built rather than mocked from the library**, and
> deliberately: what is under test is that we forward what a channel hands us, so
> a double built from our own expectations would agree with us about the wrong
> thing. It implements `topic`, `on`, `subscribe`, `unsubscribe` — what this
> module touches and nothing more.
>
> Also covered: a binding type the module does NOT wrap (`presence`) passes
> through with no line written, a `subscribe()` with no callback does not throw,
> and every line is named by the bare topic.

## RESOLVED · F-deep-32 · `rtlog-takes-level-last` · Reaching the last argument means passing a placeholder

`rtLog(topic, msg, extra?, level?)`, so a caller that wants to raise a line to
`warn` without attaching an object writes `undefined` to get past `extra`:

```ts
rtLog(name, `teardown ${String(status)}`, undefined, status === 'ok' ? 'log' : 'warn')
```

Four of the twelve call sites do this — one in `channelTeardown`, three inside
`realtimeDiag` itself — and the level is the argument most likely to be wanted
alone, since it is what makes a failure stand out in a friend's screenshot.

Not a bug and not urgent; the shape is `(what, message, then two optional
knobs)` and the knobs are in the wrong order for how they are used.

> **resolution: the two optionals swapped — `(topic, msg, level?, extra?)`**
> (Joel, 2026-09-02). **The order was decided by counting the call sites rather
> than by taste:** of the twelve, eight pass neither, three pass both, two pass a
> placeholder to reach `level` — and **none has ever passed `extra` alone.** So
> the swap costs nothing anywhere and removes every placeholder; the eight bare
> calls are untouched.
>
> That count is now the docstring's justification, where there was none.
> `grep "rtLog(.*undefined"` returns nothing.

## Pass 4 — the fault sink, read 2026-09-02

Two files, 152 lines: `faultStore.ts` and its test. Small, and it produced the
largest gap between what a file says and what the app does that this area has
turned up.

**Findings F-deep-33 … F-deep-35.** All three are the same shape — the store's
docstring describes the world of a week ago — but the first has a consequence
worth more than a doc fix.

**Checked and NOT a finding:** `useCurrentFault` passes an INLINE arrow as
`getSnapshot` where `usePath` (fixed in `F-deep-5`) uses a module-level
function. That difference is fine and should not be "made consistent":
`useSyncExternalStore` compares the RESULT of `getSnapshot`, not its identity —
only `subscribe` must be stable, and here it is module-level.

## RESOLVED · F-deep-33 · `showfaultmodal-has-a-hundred-callers` · The store documents one caller, and there are 101

`faultStore.ts:14` — *"Nothing decides here. `reportDbFault` … picks the words
and writes the `[db]` line, then calls `showFaultModal`"* — reads as a
description of the one path in. Counted:

| | |
|---|---|
| direct `showFaultModal` call sites outside the store | **101** |
| of those, the hand-written scream-else `{ text: 'BUG: <rpc> fell through to unhandled' }` | **94** |
| of those, passing `diagnostics` | **4** |

The scream-else is a deliberate convention — the mandatory `else` at an RPC call
site — so the callers are not wrong. **The docstring is**, and it takes two
other claims down with it:

- **`FaultEntry.diagnostics`** says it is *"Absent only for hand-triggered test
  faults."* It is absent at ~97 production call sites.
- **The `QUEUE_CAP` comment** says a dropped fault costs nothing because *"the
  classifier already wrote the `[db]` console line before routing, so nothing is
  lost to diagnosis."* True of `reportDbFault`'s faults. For the 94 it is only
  half true: `runRpc` did log the CALL, so there is a `[db]` line for it — but
  the fact that the call site fell through exists nowhere except the modal, so
  at the cap that specific diagnosis is gone with no trace.

**The fix is not obviously "make the 94 carry diagnostics".** That is a question
about the call-site convention (docs/envelopes.md → The shape of a call site),
which is not this file's and not this area's — the scream-else fires exactly
when a caller's branches did not cover an answer, and what it should record is a
decision about that convention. What IS this file's is that its docstring should
describe the callers it has.

> **resolution: `reportUnhandled(call)` and `PN488`, built but NOT swept in**
> (Joel, 2026-09-02, asking *"given that the scream clause is always the same …
> should we make this a small function that can log and put the modal up?"*).
>
> **Why it needed a report of its own, which is the part worth keeping:** the
> scream-else fires when the server answered fine and the CALLER had no branch —
> so `runRpc` has already logged the call, at `OK`. The console line for a
> fall-through reads exactly like a healthy call. The only record that anything
> went wrong is a modal: dismissible, capped at five, and carrying no diagnostics
> at all. **The one fault category that always means a bug of ours was the only
> one with no console trail.**
>
> `reportUnhandled` goes through `reportDbFault`, so a fall-through now gets the
> same `[db] FAULT` line and the same `k=v` diagnostics under the modal as every
> other fault, from the same builder. Five lines, no new machinery.
>
> **`PN488`, and the number is not a typo.** The frontend-caught family is
> `PN307`–`PN310`, but the allocator is `max + 1` across the whole `PN` class and
> never fills gaps (docs/envelopes.md → Allocating one); the 3xx block filled with
> SQL raises long after those four were taken. Verified free everywhere. Its
> docstring says why it is out of family, so the next reader does not "fix" it.
>
> **The 95 call sites are NOT converted, deliberately.** That is a sweep across
> ~30 files in a dozen game areas, and doing it in the same breath would mean the
> helper's shape gets settled by whoever is mid-sweep. The helper is one file to
> read and reject; the sweep is thirty to re-do. **Joel's call, separately** — and
> if it happens it should ship with a guard forbidding the old literal outside the
> helper, since a 95-site rule held by habit is what produced 94 copies.
>
> Proved by planting: reverting `reportUnhandled` to a bare `showFaultModal`
> fails the new test, which asserts both halves — the `[db]` line AND the modal's
> diagnostics.
>
> **A note went to `common-hosts`** for `FaultModal`, whose docstring promises the
> diagnostics line it actually renders conditionally.

## RESOLVED · F-deep-34 · `faultstore-cites-the-wrong-file` · `reportDbFault` is pointed at twice, and both point at the wrong module

`faultStore.ts:14` and `:49` both say `reportDbFault (lib/supabase/dbResult.ts)`.
It is in **`dbEnvelope.ts:335`**. `dbResult.ts` has `reportFault`, a different
function — the private wrapper that honors `presentFaults: false` — so the
citation does not merely miss, it lands next to a similarly-named neighbor.

> **resolution: the citation corrected, and the two claims it propped up
> rechecked rather than assumed** (Joel, 2026-09-02).
>
> The `F-deep-33` sweep had changed what is true around it. The docstring's
> *"Nothing decides here; `reportDbFault` … then calls `showFaultModal`"* was
> false when 95 call sites went around it; it is true again now, because
> `reportUnhandled` routes through `reportDbFault`. So the paragraph keeps its
> claim and gains the four callers that legitimately reach past it — `HomePage`
> and the `pupfault` trigger build their own diagnostics, `useGameTimer` and
> `useWordSubmit` show a fault whose words are already chosen.
>
> **`FaultEntry.diagnostics` stopped claiming to be near-universal.** It now says
> what is true — optional, rendered only when present, so a hand-built fault
> shows a sentence and nothing under it — which is also the fact `common-hosts`
> is holding a note about for `FaultModal`.
>
> The `QUEUE_CAP` comment keeps its conclusion, since the sweep made it earn it.

## RESOLVED · F-deep-35 · `fault-true-sinks-are-gone` · The source describes a routing flag its own test says was deleted

`faultStore.ts:15` — *"the older `fault: true` sinks (useLocalFeedback / the
GamePage global slot) route here the same way, so no game wires anything."*

**That flag is gone, and the store's own test file says so** in its docstring:
*"It used to guard a routing rule as well: a `fault: true` message handed to a
sink had to reach the modal queue instead of slot state. That flag is gone
(2026-09-01)."* `useLocalFeedback:76` agrees in the past tense — *"This branched
on a `fault` flag until…"*.

So the test and the consumer both record the deletion and the source does not.
The rule it encoded still holds — a fault never sits in a pill slot — but by
construction rather than by a branch, which is a better thing for the docstring
to say.

> **resolution: the sentence is gone, removed with `F-deep-34`'s paragraph**
> (they were the same paragraph). Nothing replaced it: the rule it described is
> now true by construction, and a docstring that explained how a deleted flag
> used to enforce it would be the archaeology this repo rules out. The store's
> own test file still records the deletion, which is the right place for it.

## Pass 5 — `cls.ts`, read 2026-09-02

One file, 22 lines, of which one is the function. **One finding**, inherited in
substance from the `homepage` area's deleted dependency read, which had it as
`cls-thirty-lines`.

**Checked and NOT findings:**

- **Nobody has worked around its shape.** No hand-rolled
  `filter(Boolean).join(' ')` anywhere else in `src/`, and no call site spreads
  an array into it — so the varargs form fits all 206 uses, and the features
  `clsx` adds over it (object and array forms) are ones nothing here wants.
- **The parameter type earns its keep.** `Array<string | false | null |
  undefined>` excludes `number`, so the classic `cls(items.length && styles.x)`
  — which would render a bare `0` into `className` — is a compile error rather
  than a rendered artifact.
- **No test, and that is fine.** The body is `args.filter(Boolean).join(' ')`,
  it has 206 call sites and two CSS guards reading its output, and a break would
  be instant and universal. A test here would pin a tautology.

## RESOLVED · F-deep-36 · `cls-usage-count-inverts-its-own-argument` · The number defending the decision now argues against it

`cls.ts:4` — *"Hand-rolled because clsx/classnames are overkill for the handful
of conditional class composition sites we have — and we'd rather not add a
dependency for ~30 lines of usage."*

**Measured: 206 call sites across 116 files.** Roughly seven times the stated
figure, and "a handful" is not a description of 116 files.

What makes this worth more than a number fix: **the argument reverses.** As
written, the case against `clsx` is scale — we barely use this, so a dependency
would not pay. At 206 sites that sentence argues the other way, because 206 is
precisely the scale at which a project reaches for `clsx`.

**The DECISION is still right and the reasoning for it is simply different now.**
The function is one line. A dependency is not worth it because there is nothing
to depend on — not because the need is rare. That is a justification which
cannot rot with the roster, and it is what the docstring should say.

> **resolution: the count comes out, not corrected** (Joel, 2026-09-02): *"just
> remove the number of callers, it will always be stale."* Both halves go — "the
> handful of … sites we have" as well as "~30 lines of usage" — leaving the
> reason that holds at any size: *"Hand-rolled rather than clsx/classnames
> because there is nothing to depend on: the whole thing is the one expression
> below."*
>
> Third time this sprint a number in a comment has been deleted rather than
> updated (`F-deep-8`, `F-deep-21`, here). The rule those three make: **a count
> in a docstring is a maintenance promise nobody keeps** — state the property,
> not the tally.

## Pass 6 — the server side of the envelope, read 2026-09-02

Three files, 321 lines: `_shared/envelope.ts` (the outbound builders),
`_shared/dbResult.ts` (the inbound `runRpc`), `_shared/http.ts` (transport).
**Three findings, `F-deep-37` … `F-deep-39`.** The design is in good order —
this is the half the error sprint finished last, and it shows.

**Checked and NOT findings:**

- **`http.ts` is clean**, and its closing comment is the reason: *"There is
  deliberately no catch-all error response here … This file knows nothing about
  envelopes and should not: it is transport."* A file that says what it refuses
  to do is worth more than one that does it.
- **`[rpc]` is a documented channel** (docs/envelopes.md:1081), so
  `dbResult.ts`'s log line is not a fourth invented one. `dbLog`'s "beside
  `[rt]` and `[ui]`" stays accurate because those three are the BROWSER's; this
  one is the edge runtime's.
- **The "four builders" count in `envelope.ts:21` is right** — `ok`,
  `formValidation`, `faultEnvelope` and `serviceError` spell the nine keys out;
  `fault` delegates, and the docstring says so.

## RESOLVED · F-deep-37 · `third-orphaned-docstring` · A one-line docstring for `ok` sits above `isEnvelope`

`envelope.ts:35`:

```ts
/** The function answered, and here is what the caller asked for. */
/**
 * **Is this an envelope?** — for a function that calls a converted RPC …
 */
export const isEnvelope = …
```

The first line describes **`ok`**, which is seventeen lines below at `:52` and
therefore undocumented; `isEnvelope` appears to carry two descriptions. Same tell
as `F-deep-17` — **two docstrings stacked with nothing between them** — which is
now the third time this exact bug has been found, in three different files.

The sweep `F-deep-17` ran covered `src/common/lib/supabase/`; this file is under
`supabase/functions/`, so it was outside it. **Worth doing repo-wide rather than
per-pass**, since the tell is one grep and the bug is invisible by construction.

> **resolution: the docstring moved onto `ok`, and the repo-wide half became a
> GUARD rather than a list** (Joel, 2026-09-02, taking the recommendation over
> forward-fixing).
>
> **Why not forward-fix the others.** Fixing an orphan means deciding which
> declaration the stranded prose belongs to, which means reading the file — that
> is the audit, not a mechanical edit, and a confidently misplaced docstring is
> worse than an obviously stranded one. But "flag it and move on" has a record
> here: `useProfile.ts`'s orphan was identified by the `homepage` area a week
> ago, recorded, and lost when that file was deleted. So neither.
>
> `src/guards/orphanedDocstrings.test.ts` instead — the shrinking-allowlist shape
> this repo already uses three times (`DECLARED_AHEAD`, `noRawServerMessage`'s
> `ALLOWED`, `vocabularies`' `pending`). Two arms, both proved by planting: a NEW
> stranded docstring fails, and a listed entry that has since been fixed fails
> too, so the list cannot rot into blanket exemptions. **44 entries, grouped by
> owning area**, each deleted by the area that opens the file. Nothing in an
> unopened area was edited.
>
> **⚠️ The guard was broken when first written, and only planting found it.** Its
> detector matched a bare `/**` LINE, so it saw stacked MULTI-line docstrings and
> missed a SINGLE-line one above another — which is exactly the shape of this
> finding, the orphan in `_shared/envelope.ts`. The guard built to catch this bug
> could not have caught this bug, and reported a clean file. It parses docstring
> SPANS now.
>
> That correction moved the count from 11 to 44: the single-line form is far more
> common, which is why the first number looked reassuring.
>
> **The list is DETECTION, not verification.** Several were sampled and are real
> — `boggle/manifest.ts:62` strands a coop-label docstring above the manifest's,
> `GamePage.tsx:147` strands one above `PEER_PILL_MS` — but 44 files were not
> read, and deciding where each sentence belongs is the owning area's judgment.
>
> The one exception that keeps it usable: a stacked pair is only suspect when the
> earlier docstring is NOT the file's first, so a module header meeting the first
> declaration does not cry wolf.

## F-deep-38 · `isenvelope-is-not-a-predicate` · The Deno twin checks the same thing and tells the compiler nothing

`envelope.ts:45` is `(body: unknown): boolean`. Its frontend twin
`_isEnvelope` (`dbResult.ts:221`) is `(body: unknown): body is Envelope`, and
this one's docstring claims the likeness — *"Deliberately strict, like its
frontend twin."*

They are alike in what they TEST and not in what they tell TypeScript. The
consequence is at the one call site: after
`if (!isEnvelope(settled.data)) return …`, `settled.data` is still `unknown`, so
`:111`'s `settled.data as Envelope<T>` casts **from `unknown`** — which accepts
anything at all. With a predicate the same line would narrow from a checked
`Envelope`, and the cast would only be adding `T`.

Small — one call site, and the runtime behavior is identical. It is filed
because the fix is one word and the current shape quietly wastes the check it
already performs.

> resolution:

## F-deep-39 · `cites-a-deleted-plan` · A comment points at a plan file that no longer exists

`dbResult.ts:34` justifies what the wrapper deliberately does not cover and
cites `(plans/deno-callers.md §3)`. **That file is not in `plans/`** — the eight
that are, are listed in CLAUDE.md.

Unlike `F-deep-8`'s pointer to project memory, **the replacement is known and
written down**: `plans/error-system.md` refers to it twice as *"`deno-callers.md`
(deleted; its content is in docs/envelopes.md)"*. So this is a citation to
repoint, not a claim to delete.

> resolution:

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
