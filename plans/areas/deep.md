# Area: deep

The first area of app-audit's step 7, and the first one to run under the
2026-09-02 restart. The process is [app-audit.md](../app-audit.md) §21; the plan
holds the order, this file holds everything else.

**Opened 2026-09-02.** It was added to the top of §7's order the same day, ahead
of `homepage`. Scope, set by Joel when he asked for it:

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

**One pass of three has run** — the boot path, 2026-09-02, twelve findings and
all of them open. The data path and the realtime plumbing have not been read.

## The roster — 31 files, 4,797 lines

Agreed with Joel 2026-09-02 before anything was read, and stamped **`cs-met`** —
the eighth stamp, added the same day for exactly this state: on an open area's
roster, agreed, and not yet read (app-audit.md §21 → The stamp). About half the line count is tests.

**The boot path — 7 files, 596 lines**

| file | lines | |
|---|---|---|
| `src/main.tsx` | 59 | |
| `src/App.tsx` | 231 | **the boot half only** — its per-page and per-game routing rows belong to the areas that own those pages and games |
| `src/common/lib/routing/router.ts` | 97 | |
| `src/common/lib/routing/router.test.ts` | 93 | |
| `src/common/lib/routing/Link.tsx` | 44 | the homepage writes no link at all now — its last one went when the create-club page became a modal; the file is still the router's |
| `src/common/lib/util/reloadOnStaleChunk.ts` | 36 | filed under `util/`, but it is boot machinery |
| `src/common/lib/util/reloadOnStaleChunk.test.ts` | 36 | |

**The data path — 11 files, 2,867 lines**

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
| `lib/util/`: `mulberry32`, `friendlyDate`, `linkify`, `layoutWidth`, `keyboardHandoff` | picked up by whichever area uses them — a util has no shared design language to settle |
| the common non-game **hooks** — `useProfile`, `useTabRing`, `useAppShortcuts`, `useRealtimeRefetch` and the rest | Joel, 2026-09-02: *"we should do the common non-game ones, but not here."* They are the same kind of thing, but taking ~60 files under `hooks/` would double the area and mix two vocabularies. **A candidate area of its own** |
| `base.css`, `utilities.css`, `fixed.css`, `breakpoints.css` | the vocabularies; owned by the page areas |

## Pass 1 — the boot path, read 2026-09-02

Seven files, 596 lines. **Scope, set by Joel:** *"don't go deep into consumers of
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

Twelve — **F-deep-1 … F-deep-12**. Every heading says its status; a heading with
no status prefix means OPEN, so all twelve are open.

## F-deep-1 · `stylesheet-map-rotted` · main.tsx's map of the stylesheet chain names two files that were deleted

`main.tsx:11` describes `patterns/*.css` as "one named pattern per file — badge,
button, list, page, …". **`patterns/button.css` and `patterns/list.css` do not
exist** — `list.css` went when `<SelectionList>` landed and `button.css` when the
`forms` area moved buttons onto `StandardButton.module.css`. The three that
DO exist and are imported four lines below go unnamed: `focus-ring`, `heading`,
`segmented`.

Two smaller drifts in the same comment block:

- `main.tsx:12` calls `utilities.css` "the adjustments that name nothing: muted,
  error". Those two are still there, but the file is 137 lines and its own header
  says "Surfaces and text" — `.card`, `.link-button`, `.definable` and
  `[data-tooltip]` are surfaces and affordances, not adjustments.
- `loadTheme.ts:27` describes the same theme-independent half as "(fixed.css,
  base.css, utilities.css)" and omits `patterns/` entirely. Two files describe one
  chain and neither describes it correctly.

> resolution:

## F-deep-2 · `gametype-case-mismatch` · A mis-capitalized gametype in a URL is diagnosed as a FAULT

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

> resolution:

## F-deep-3 · `palette-waits-for-the-session` · "Ahead of the auth gates" is true of the auth gate and false of the loading gate

`App.tsx:93` says the palette route sits ahead of the auth gates *"on purpose: it
renders tokens, not data, so there is nothing to sign in for"*, and `:97` says the
same for the font route. But `App.tsx:92` — `if (loading) return <Loading />` —
runs before both, so both instrument routes still wait on the session probe before
they render anything.

The comment is describing an intent the code half implements. Either the two
routes move above the loading gate, or the comment says "ahead of the auth gates,
behind the session probe". **This is a finding about `App.tsx`'s comment**; the two
pages themselves stay out of the sprint entirely.

> resolution:

## F-deep-4 · `boot-has-no-failure-path` · Two ways the boot can end in a white screen, neither of them announced

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

> resolution:

## F-deep-5 · `usepath-misses-updates-before-mount` · A navigate() between first render and effect commit is lost

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

> resolution:

## F-deep-6 · `navigate-pushes-duplicate-entries` · Navigating to the path you are already on adds a history entry

`navigate()` (`router.ts:90`) always pushes. Called with the current path it
stacks an identical entry, so the next Back press appears to do nothing — the URL
is the same and every subscriber re-renders to the same value. Nothing does this
today; it costs one comparison to make impossible.

> resolution:

## F-deep-7 · `link-intercepts-target-blank` · The one "open elsewhere" gesture Link does not honor

`Link` (`Link.tsx:32`) is careful about gestures — it lets modifier-clicks and
non-left buttons fall through to the browser so "open in new tab" works, and its
docstring makes that promise explicitly. But `target` arrives through `...rest`
(the props type only omits `href` and `onClick`), so a caller writing
`<Link to="/c/x" target="_blank">` gets its click intercepted and navigated
in-page — the same affordance the file exists to preserve, broken by the one
attribute that states it declaratively.

None of the three consumers passes `target` today, so this is a trap rather than a
bug: one line (`if (rest.target) return`) or a type that omits `target` closes it.

> resolution:

## F-deep-8 · `router-doc-cites-what-cannot-be-read` · The decision docstring points outside the repo, and its supporting number is stale

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

> resolution:

## F-deep-9 · `loadtheme-is-boot-and-is-not-on-the-roster` · The file main.tsx awaits was left out

`src/common/themes/loadTheme.ts` (69 lines, `cs-unmet`, no test) is awaited by
`main.tsx:53` before the first render, decides which stylesheet chain the app
loads, and reads `?theme=` — which makes it the other half of F-deep-12. It **names no
game and no page**, so the area's own membership rule admits it, and the roster
missed it because `themes/` was set aside wholesale as "the vocabularies" when the
rest of that folder is stylesheets.

**Joel's call**, since it changes the roster: add it (making the boot path 8 files,
665 lines), or leave it to whichever area takes the themes.

> resolution:

## F-deep-10 · `suspense-fallback-is-a-bare-p` · The game chunk's loading state is a raw paragraph

`App.tsx:180` — `<Suspense fallback={<p>Loading game…</p>}>` — while the app has a
`<Loading />` component, imported into this very file and used eight lines above at
`:92`. An earlier count found nine different ways to say "not ready" across the
app; this is the one sitting in this area's file.

> resolution:

## F-deep-11 · `sessionstorage-unguarded` · Blocked site data turns the recovery into a second failure

`reloadOnStaleChunk` (`:30`, `:32`) reads and writes `sessionStorage` inside the
listener with no `try/catch`. Where a browser blocks site data the access throws,
which means the listener throws before `event.preventDefault()` — so the page does
not reload AND the preload error is no longer swallowed. The failure is strictly
worse than not having the guard at all.

Genuinely an edge case, and the question is whether the app cares about that
browser configuration. If it does, it is a `try/catch` returning "no record".

> resolution:

## F-deep-12 · `router-query-params` · The router says query parsing is "not needed yet"; three places parse it

**Raised first by the `homepage` area** on 2026-08-26, reading its dependencies,
and it lands squarely on this area's files. It is numbered here rather than
inherited because the file that raised it has been deleted (§21 → the restart) and
a regenerated `homepage` will start again at 1 — so its old number would come to
mean a different finding. `loadTheme.ts:44` reads `?theme=`,
`ClubPage.tsx:275` reads `?new=`, and `ClubPage.tsx:302` strips the query once it
has read it. `usePath()` returns the pathname alone, so a component that cares
about the query cannot subscribe to it. Whether the router should carry the query
is a decision; the docstring asserting nobody needs it is just false.

> resolution:

## Questions this pass raises rather than answers

1. **`App.tsx` has no seam where the plan says it splits.** §7 puts its boot half
   in this area and its per-page/per-game routing rows in the areas that own those
   pages, but the file interleaves them in one 160-line function body — the route
   table is inside the same `if/else` chain as the auth gates, and four global
   hosts (`GameInvitations`, `ToastHost`, `FaultModal`, `TooltipHost`) plus two
   cross-subtree modals hang off the same return. Splitting it is a real change
   with consumers, so it is a question, not a finding.

*(the data-path and realtime passes have not run.)*
