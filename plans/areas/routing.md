# Area: routing

The folders it reads: `routing`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-05. F-routing-8 worked; eight findings left.**

## The roster

Agreed 2026-09-05 — every file of `src/common/routing/`, nothing outside it
(`routes.ts` and its test joined the folder while the area was open):

| file | what it is | stamp |
|---|---|---|
| `router.ts` | `usePath()` and `navigate()` — the store half | `cs-audited-routing` |
| `router.test.ts` | its contract | `cs-audited-routing` |
| `routes.ts` | the two URL shapes, built and matched — WRITTEN by this area (F-routing-8) | `cs-audited-routing` |
| `routes.test.ts` | its contract | `cs-audited-routing` |
| `Link.tsx` | `<Link>` — the anchor that routes a plain left-click | `cs-audited-routing` |
| `Link.test.tsx` | which clicks it keeps, which it hands back | `cs-audited-routing` |
| `doc.md` | lede at open: "The hash router, and `<Link>`." No Design | (no stamp — markdown) |
| `todo.md` | empty under all four headings at open | (no stamp — markdown) |

No stylesheet, no SQL. Nine files outside the folder import it (`App.tsx`,
`ClubGameCard`, `ClubPage`, `ErrorPage`, `GamePage`, `useCommonGame`,
`HomePage`, `useGameInvitations`, crosswords' `PlayArea`); they were read as
EVIDENCE for the claims below and keep their stamps.

## Findings

The code is small and right. Every finding but two (F-5, F-8) is about what is
SAID about it — in the folder's own lede, in three docs, and in a server config
comment — and the pattern is the same each time: the prose was written once and
the router moved (from `lib/router.tsx` to `lib/routing/` to `routing/`) while
the prose stayed.

### F-routing-1 · not-a-hash-router · the folder calls itself a hash router, and it isn't

`src/common/routing/doc.md:3` — *"The hash router, and `<Link>`."*
`docs/common-folders.md:256` — *"the hash router and `<Link>`"*.

It is path-based on the History API: `readPath` returns
`window.location.pathname`, `navigate()` calls `pushState`/`replaceState`, and
`docs/common.md:570` says so outright — *"Path-based; no hash."* A reader who
trusts the folder index will look for `hashchange` and a `#` and find neither.

**Recommend:** both say "the path router". The lede is rewritten in full by the
Design work this area owes anyway.

### F-routing-2 · stale-router-paths · three places point at paths the router has not had since the reorg

| where | says | is |
|---|---|---|
| `docs/common.md:863` | link LABEL `src/common/lib/routing/router.test.ts` | `src/common/routing/router.test.ts` (the link TARGET is already right) |
| `docs/testing.md:190` | link LABEL `src/common/lib/routing/router.test.ts` | same |
| `public/_redirects:4` | *"handled by src/common/lib/router.tsx"* | `src/common/routing/router.ts` — two moves and an extension ago |

The two doc links work because the target was updated in the reorg sweep and the
visible text was not. `_redirects` is a server config, outside the stamp scope,
and nothing sweeps it.

**Recommend:** fix the three strings. For `_redirects`, name the folder
(`src/common/routing/`) rather than a file, since a folder name survives the
next rename of a file inside it.

### F-routing-3 · counts-that-rot · "~40 lines" three times, "five routes" once

- `docs/common.md:570` — *"is ~40 lines"*; `docs/common.md:587` — *"what we'd
  write in ~40 lines"*; `README.md:26` — *"a ~40-line hand-rolled router"*.
  `router.ts` is 101 lines today (twenty-odd of code, the rest docstring).
- `docs/common.md:587` — *"the app has five routes"*, twelve lines under a
  routes table with four rows. The fifth is presumably `/palette` or `/font`,
  which the table does not list and this audit does not read.

None of the numbers changes what a reader does; the CONDITION does — the route
surface is flat and a regex match is the whole job, so a library would be a
dependency for nothing. `router.ts:8-9` already says it that way.

**Recommend:** drop the four numbers and keep the condition. Same rule as every
roster tally in the repo: a count rots, a condition stays true.

### F-routing-4 · common-md-misplaces-link · the routing section puts `<Link>` in `router.ts` and undercounts what it hands back

`docs/common.md:570`: *"The hand-rolled router in `router.ts` is …: a
`usePath()` hook …, a `navigate(to, replace?)` function …, and a `<Link>`
component that intercepts left-click and falls through for cmd/ctrl-click."*

`<Link>` lives in `Link.tsx` (its own file, for Fast Refresh — `Link.tsx:13`),
and it hands back four modifiers, a non-left button and any `target` other than
`_self`, not just cmd/ctrl. The sentence is a paraphrase of an older `Link` that
has since grown a rule and a file of its own.

**Recommend:** the sentence names both files and says `<Link>` "routes a plain
left-click and hands every open-elsewhere gesture to the browser", and leaves
the list to the docstring, which is the one copy that stays right.

### F-routing-5 · middle-click-check-is-unreachable · `e.button !== 0` guards a click a browser never sends

`Link.tsx:38` returns early when `e.button !== 0`, and `Link.test.tsx:49-53`
pins it by firing a synthetic `click` with `button: 1`. The docstring
(`Link.tsx:26-27`) credits the check: *"cmd/ctrl/shift/alt clicks and
middle-clicks fall through to the browser"*.

A non-primary button does not produce a `click` event in any current browser; it
produces `auxclick`, which React's `onClick` never sees. So the middle-click
fall-through is real — a middle-click opens the href in a new tab — but the
browser does it on its own and this line never runs. The test proves the
handler's logic against an event no browser constructs.

Two honest shapes:

- **(a) Delete the check and its test**, and let the docstring say the true
  thing: a middle-click never reaches `onClick`, so only modifiers and `target`
  need handling here. **Recommend this** — a branch that cannot run, with a
  test that says it matters, is exactly the slot-filler a reader has to stop
  and disprove.
- **(b) Keep it as defense** and reword the docstring and the test's comment to
  say it is belt-and-braces for a browser that does not exist. Costs nothing at
  runtime; costs the reader the same stop.

### F-routing-6 · link-file-note-marker · `Link.tsx`'s file note is a `//` block, and it is archaeology

`Link.tsx:13-17` is the explanation of why the file exists — *"Lives in its own
file (split from `router.ts`) because Vite Fast Refresh requires a file to
export only components if it exports any"* — written as a `//` block between
the props type and the component, under a double blank line (`Link.tsx:11-12`).
`router.ts:21-22` points readers at it: *"Why it is a separate file is said
there."*

Two things. The marker: a note that answers "should I read this file, and why
is it here" is a file docstring and takes `/**`
(`docs/code-conventions.md:13`). The words: "split from `router.ts`" is how it
came to be, which the commit message owns; what the reader needs is "its own
file BECAUSE Fast Refresh …", which is already the rest of the sentence.

**Recommend:** make it the file's `/** */` docstring at the top, drop "(split
from `router.ts`)", collapse the double blank line. Related nit in the same
sweep: `router.ts:43-46` puts a `/**` on `subscribeToPath` that says "Both
module-level", but `readPath` right under it carries nothing — the note is
about the pair and about why the body is shaped so, which is `//` territory.

### F-routing-7 · replace-popstate-untested · the test file promises "either way" and asserts one way

`router.test.ts:12` — *"`navigate(to)` updates the URL via pushState,
`navigate(to, true)` via replaceState, and dispatches a popstate either way."*
The popstate assertion (`router.test.ts:136-142`) fires a push. The replace
case (`router.test.ts:102-109`) asserts the URL and that `pushState` was not
called; nothing checks that subscribers heard about it. A `navigate(x, true)`
that forgot the dispatch would pass this file.

**Recommend:** add the popstate listener to the replace test — two lines — or
one more `it` beside the existing one. The strip-a-query test at 127 is a
replace too and could carry the assertion instead.

### F-routing-8 · game-route-parsed-twice · the `/g/…` shape is matched in two files and built in seven, and the two matchers disagree

`router.ts:26-27` says route matching is deliberately not here: *"Callers do
their own `path.startsWith('/c/')` or regex match — flat structure makes this
cheap and explicit."* Today that means:

- **Two matchers of `/g/<gametype>/<gameId>`.** `App.tsx:44` matches the id
  LOOSELY (`[^/]+`) on purpose, with a paragraph saying whether a string names a
  game is `GamePage`'s question. `useGameInvitations.ts:23` matches it as
  uuid-shaped (`[0-9a-f-]+`). Same URL, two rules for what an id is.
- **Ten template literals** building `/c/${handle}` or
  `/g/${gametype}/${gameId}` across `ClubPage`, `GamePage`, `useCommonGame`,
  `HomePage`, `ClubGameCard`, `useGameInvitations` and crosswords' `PlayArea`
  (two of them append `?new=…`).

Nothing is broken by it — the invitation matcher only decides whether the
game you are already viewing should also pop an invitation, and a non-uuid id
never reaches it. It is a question about where the URL shapes LIVE.

**Two shapes, and this one is Joel's to rule:**

- **(a) One home, here.** `routes.ts` in this folder exports `clubPath(handle)`,
  `gamePath(gametype, gameId)` and the two matchers; `App.tsx` and the
  invitations hook import the matcher, the ten literals become calls. The
  router's "NOT here" paragraph changes to "the shapes are here; what each shows
  is `App.tsx`'s". The uses are known and named for the job, so this is not a
  generic layer. **Recommend this**, on the strength of two matchers already
  disagreeing.
- **(b) Leave it.** Flat, explicit, and the disagreement has no observable
  effect. If so, the invitations regex should at least say why it is stricter
  than `App.tsx`'s, or match the same way.

Touches seven files either way (a) goes; churn is not an argument for or
against.

**RULED (a), 2026-09-05 — done.** `routes.ts` + `routes.test.ts` are the
folder's third unit: `clubPath`, `gamePath`, `matchClubRoute`, `matchGameRoute`.
`App.tsx`'s two regexes moved there with their paragraphs; the invitations
hook's `currentGameIdFromPath` is gone, so the uuid-shaped rule disappeared with
it and there is one rule for what a game id is. The ten literals are calls.

Two decisions the ruling did not settle, taken while working it:

- **The query stays out.** The two `?new=` sites compose
  `` `${clubPath(h)}?new=…` `` rather than `routes.ts` growing an option.
  `router.ts` says query parsing is deliberately the caller's, and the folder
  owning the `?new=` name on the writing side while ClubPage reads it with a
  raw `URLSearchParams` would be worse than either whole.
- **Anchoring unified on `App.tsx`'s.** The invitations matcher was a prefix
  match; it is now anchored, so `/g/wordle/<id>/extra` stops yielding an id.
  `App.tsx` already showed the home page for that path, so the two now agree.

`useGameInvitations.test.ts:50` had a comment explaining the id must be
uuid-shaped for the regex; the regex is gone, so the comment says why the
fixture is realistic instead.

### F-routing-9 · handed-back-clicks-print-noise · five `Not implemented: navigation to another Document` lines per run

Every `Link.test.tsx` case that hands a click back to the browser (the four
modifiers and the `target="_blank"` one) lets the anchor's default action run,
and jsdom answers by printing *"Not implemented: navigation to another
Document"* to the console — five lines in every test run, none of them a
failure. Same five at HEAD; not introduced this session.

The test's method is sound — an unchanged pathname IS the proof nothing of ours
ran — but the noise makes a real console message in the same run easy to miss.

**Recommend:** one `beforeEach` that adds a `click` listener on `document`
which calls `preventDefault()` AFTER the component's handler has had its turn
(a bubbling listener on the document runs after React's), so the browser's
default is swallowed by the test rather than attempted by jsdom. Five lines of
setup, and the assertions do not change.

## Notes

- **The folder's `todo.md` was empty at open** — nothing handed in from earlier
  areas.
- **The two app-wide rules every area owes** ([code-conventions →
  TypeScript naming](../../docs/code-conventions.md), [→ Known
  gotchas](../../docs/code-conventions.md)): no boolean-returning hook here
  (`usePath` returns a string), and no `typeof window` guard in the folder.
  Both checked, both clean.
- **Forward-fix candidate, another folder's doc:** `docs/common.md:583` cites
  `src/common/lib/gamePageCtx.ts`; the file is
  `src/common/game-page/gamePageCtx.ts`. A one-line path fix that this area's
  reading turned up — ships with whichever commit fixes F-routing-2's sibling
  paths, or is left for `game-page`. Joel's call.
- **Read as evidence, found correct, not findings:** `ClaimHandleScreen.tsx:171`
  reloads with `window.location.assign('/')` rather than `navigate()`, and its
  comment says exactly why (the screen is gated on `needsClaim`, not the path).
  `loadTheme.ts:47` and `ClubPage.tsx:304/331` read the query the way
  `router.ts:28-35` says they do. `public/_redirects` does serve `index.html`
  with a 200 for every path except `/assets/*`, which 404s so a stale chunk
  fails honestly — that rule is `boot`'s to read.
- **Not read:** the `/palette` and `/font` branches of `App.tsx` (excluded from
  the audit). `App.tsx` itself belongs to `root-files`; the route dispatch was
  read here as evidence only.

## Predicted test breaks

- F-routing-5 (a): `Link.test.tsx` loses the non-left-button case; the file's
  docstring sentence "a modifier key, a non-left button, and the `target`
  attribute" changes with it.
- F-routing-7: `router.test.ts` gains an assertion; no break.
- F-routing-9: `Link.test.tsx` gains a `beforeEach`; the run goes quiet, no
  break.
- F-routing-8 (a): `router.test.ts` is unaffected; a new `routes.test.ts`
  follows the file-per-unit rule. `useGameInvitations.test.ts` may pin the
  current regex — check before moving it.
- `src/guards/folderDocs.test.ts`: `common/routing` leaves `DESIGNS_OWED` the
  same change that writes the Design (the guard fails from both sides).

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
