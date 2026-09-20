# Area: boot

The folders it reads: `boot` · `main.tsx` · `App.tsx` · `themes/loadTheme.ts`
(which stays in `common/themes/`). The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-05** (Joel: "mark files in this area as blessed,
close the area, and commit") — fifteen findings: F-boot-1 and -4 closed with
no change, F-boot-3 handed to `game-page`, the other twelve worked (the last
three came from the whole-area re-read, all prose in the `loadTheme` pair).
Nine files `cs-blessed-boot`, two of them written by the area; `boot/doc.md`'s
Design written and the folder off `INTROS_OWED`.

## The roster

Proposed 2026-09-05 as the four files of `src/common/boot/`; Joel added the
two root files ("include main.tsx and app.tsx in this area") and then
`loadTheme.ts` ("add loadTheme.ts to the area … we're not moving loadTheme.ts.
instead, we're going to audit it and treat it as this area"), and gave the word
("read files and audit the area"):

| file | what it is | stamp |
|---|---|---|
| `src/main.tsx` | the boot ORDER: width tracker, stale-chunk listener, theme, root — and the one `try` around it | `cs-blessed-boot` |
| `src/App.tsx` | the shell: the gates in order, the route → page table, the hosts that hang off the root | `cs-blessed-boot` |
| `src/common/boot/panic.ts` | the last-resort screen, plain DOM, for a boot throw or an unboundaried render throw | `cs-blessed-boot` |
| `src/common/boot/panic.test.ts` | both ways in, the render path against a real `createRoot` | `cs-blessed-boot` |
| `src/common/boot/reloadOnStaleChunk.ts` | one reload per minute per tab when a lazy chunk fails to load | `cs-blessed-boot` |
| `src/common/boot/reloadOnStaleChunk.test.ts` | the reload, the guard window, the fail-closed read, the window passing | `cs-blessed-boot` |
| `src/common/themes/loadTheme.ts` | pick a theme chain and import it before the first render | `cs-blessed-boot` |
| `src/common/themes/loadTheme.test.ts` | WRITTEN by this area (F-boot-6): the four rules the file used to argue only in comments | `cs-blessed-boot` |
| `src/common/boot/reload.fake.ts` | WRITTEN by this area (F-boot-8): a pressable `location.reload()`, shared by both boot tests | `cs-blessed-boot` |
| `src/common/boot/reloadOnStaleBuild.ts` | WRITTEN AFTER THE CLOSE (2026-09-19, the stale-build work): fetch `version.json`, compare to the baked stamp, reload once per value | `cs-unmet` — awaits Joel's read |
| `src/common/boot/reloadOnStaleBuild.test.ts` | the reload, the by-value cap, the non-stamp answers, the fail-closed read, the floor, the three return events | `cs-unmet` — awaits Joel's read |
| `src/common/boot/reloadNotice.ts` | the note a self-reload leaves for the page that comes back; `App` turns it into a toast | `cs-unmet` — awaits Joel's read |
| `src/common/boot/reloadNotice.test.ts` | read once, then gone | `cs-unmet` — awaits Joel's read |
| `src/common/boot/doc.md` | lede, Design and Details written at the re-read; off `INTROS_OWED` | (no stamp — markdown) |
| `src/common/boot/todo.md` | empty at the open | (no stamp — markdown) |

**Decided at the opening:**

- **`loadTheme.ts` stays in `common/themes/`** and is audited here. `themes` is
  therefore the one folder two rows of §3 name; both rows say so.
- **`root-files` folded into `manifest`** once the two root files came here:
  `gametypes.ts` is the registry's list. Its skeleton is deleted.
- **Nothing is stamped `cs-found`.** Every folder `App.tsx` imports already has a
  row in §3; `found` exists to make sure something reaches an area, and these
  all have one.
- **Evidence, not roster:** `index.html`, `GamePage.tsx` and its `Props`,
  `PlayAreaErrorBoundary.tsx`, `routes.ts`, `storage.ts` + `storage.fake.ts`,
  `dbLog.ts`, Vite 8.0.16's preload helper (`node_modules/vite/dist/node/chunks/node.js:28407–28419`),
  `docs/common.md`, `docs/common-folders.md`, `docs/ui.md`, `plans/dark-mode.md`.

## Findings

Audited 2026-09-05. Every file read in one sitting; every cross-file claim
below was checked against the tree — the wrappers, the Vite helper, the
boundary, the docs — not taken from a docstring. The code does its job and the
tests pass (`npx vitest run src/common/boot`, 8 of 8; eslint quiet on all
seven files). What the read turned up: one edge the reload counter gets
backwards, one comment that overclaims what a swallowed import does, two shape
questions that belong to `game-page` and are recorded here for it, one name
that hides a write, two files with no test, two tests that hand-roll what a
shared fake already does, and prose describing an app from before `panic.ts`
and before the reorg.

Shape findings first (F-boot-1 to -8), so prose is written once.

### CLOSED, NO CHANGE · F-boot-1 · `write-fails-open` · The reload counter fails closed on a read it cannot make and open on a write it cannot make

`reloadedRecently` (`reloadOnStaleChunk.ts:40–48`) answers "yes, recently"
when storage throws, so the reload is skipped — the docstring's argument:
*"a counter that cannot count has to answer one way or the other … 'No' would
reload every time a chunk failed, which is the loop the counter exists to
prevent."* `rememberReload` (`:50–56`) then calls `writeStored`, which
swallows a failed write and returns `void` (`storage.ts:78`), and the listener
goes on to `preventDefault()` and `reload()` regardless.

So a browser whose `sessionStorage` reads fine and rejects writes — a full
quota, or the storage-that-died-mid-session case `storage.fake.ts` names its
`failCalls` switch for — reloads on every chunk failure with nothing counted.
That is the loop, on the exact path the docstring says the counter prevents.
The comment at `:51–54` argues why the swallow matters and is right about the
throw (a throw before `preventDefault` would let the error through, which is
what "let it throw" already does); what it misses is that a swallowed write
makes the NEXT reload uncounted.

**Recommendation.** Reload only if the reload was remembered: write, then
read back, and treat "not there" like "reloaded just now". Inside `boot`, with
no change to `web-storage`'s blessed API:

```ts
function rememberReload(): boolean {
  const now = String(Date.now())
  writeStored('session', GUARD_KEY, now)
  return readStored('session', GUARD_KEY, null) === now
}
…
if (reloadedRecently() || !rememberReload()) return // let it throw
```

The alternative is `writeStored` returning whether it landed, which is a
change to a blessed file for one caller. The test comes with F-boot-7.

1. Agree it is a bug worth the branch, or close as too rare?
2. Read-back inside `boot` (the recommendation), or a boolean from `writeStored`?

**Resolution (2026-09-05, Joel: "close as too-rare")** — no change. A tab whose
`sessionStorage` reads but will not write is rare enough that the branch, the
docstring rewrites and the stub it would need are not worth it; the loop it
guards against needs that rarity AND a chunk failure a fresh `index.html` does
not fix.

One claim above was wrong and is corrected here rather than in the code: the
finding cites `storage.fake.ts`'s `failCalls` as naming the reads-work-writes-
fail case. It throws from `getItem`, `setItem` and `removeItem` alike
(`storage.fake.ts:110–114`), so it models storage that died entirely — its
docstring names a full quota, but the switch is wider than the docstring. A
test wanting writes-only failure would swap the whole accessor for a stub with
a working `getItem`, the way this file's own test already swaps one
(`reloadOnStaleChunk.test.ts:77–84`), because jsdom serves `Storage` through a
proxy that a single-method spy does not reach.

### WORKED · F-boot-2 · `swallowed-import-resolves-undefined` · "The reload supersedes it" — a swallowed `vite:preloadError` does not stop the caller; it makes the import resolve to nothing

`reloadOnStaleChunk.ts:62`: `event.preventDefault() // swallow the import
error; the reload supersedes it`. Verified against the installed Vite
(8.0.16, `handlePreloadError`): when the event is default-prevented the helper
RETURNS instead of throwing, so the `import()` that failed resolves with
`undefined`, and whatever awaited it keeps running until the navigation lands.
Two callers, two flashes:

- `React.lazy` gets `undefined` and throws "Expected the result of a dynamic
  import()" into `PlayAreaErrorBoundary` — the card paints for the instant
  before the reload.
- `loadTheme`'s `Promise.all([import(…), import(…)])` resolves, `data-theme` is
  stamped, and `main.tsx` renders the whole app with no theme for a frame.

Sub-second and cosmetic, and `reload()` has already been requested, so nothing
is broken. But the comment says the swallow halts things, and a reader
trusting it would not expect the boundary card in a screenshot. Not
preventing the default instead would let the import reject — the same flash,
plus the error kept in the console — which is a defensible alternative and not
obviously better.

**Recommendation.** CLOSE with a one-sentence comment: the swallow makes the
import resolve to nothing, so the caller runs once more against `undefined`;
the reload already requested replaces the page before that shows for more
than a frame.

3. Keep `preventDefault` and say so (the recommendation), or drop it and let
   the error through alongside the reload?

**Resolution (2026-09-05, Joel: "i'll take your rec")** — `preventDefault` kept,
the comment at `reloadOnStaleChunk.ts:62` replaced with three lines saying what
the swallow does: the helper returns instead of throwing, so the import
resolves to nothing and its caller runs once more against `undefined`, and the
reload replaces the page first.

Two corrections the re-verification made to the finding above:

- The lazy path lands in the boundary for a different reason than written.
  Every manifest wraps the import — `lazy(() => import('./components/PlayArea')
  .then((m) => ({ default: m.PlayArea })))` (`wordiply/manifest.ts:46–48` and
  its siblings) — so `m.PlayArea` throws a `TypeError` on `undefined` inside
  the `.then` and the promise REJECTS. React never receives a bare `undefined`,
  and "Expected the result of a dynamic import()" is a dev-only warning
  (`react.development.js:503`); an unwrapped loader in production would throw
  `Cannot read properties of undefined (reading 'default')`
  (`react.production.js:280`). Same destination, different error.
- The flash costs nothing but pixels: `PlayAreaErrorBoundary` builds its
  diagnostics with `diagnosticsLine` (`dbLog.ts:127–140`), which formats a
  string and logs nothing.

### HANDED OFF — AND LANDED · F-boot-3 · `render-prop-with-manifest-in-hand` · App wraps the play surface in the boundary, the Suspense and both mount logs inside a render-prop, for a GamePage that already holds the manifest

**Done 2026-09-14 in the game-page area** (its F-11.6): `GamePage` builds the
play surface itself, `children` is gone from the route, and App's game route is
one self-closing tag. One of the two mount logs went at the same time. The
reading below is left as it was written — it is why the handoff was made.

`App.tsx:144–168` builds `PlayAreaSlotLog > PlayAreaErrorBoundary > Suspense >
PlayAreaReadyLog > PlayArea` inside `<GamePage>`'s render-prop child. GamePage
takes `manifest: GameManifest` (`GamePage.tsx:72`) and uses it for the timeout
dispatcher, the logo and the help component; `manifest.PlayArea` and
`manifest.gametype` are in its hands. So the render-prop hands GamePage
nothing it does not have. Its `children` docstring (`:73–77`) gives one reason
— "Called only when the game is loaded AND not paused — PauseBoundary
conditional-renders the overlay otherwise" — which is a reason for CONDITIONAL
rendering, not for the caller to supply the child.

What it costs: five lines of play-surface wrapping live in the route table;
`PlayAreaErrorBoundary`'s docstring has to explain that it is "Mounted in
App.tsx around the PlayArea Suspense, INSIDE the GamePage render-prop"; and
`App` imports four game-page files to do it.

**Recommendation.** GamePage renders `<manifest.PlayArea {...ctx} />` under its
own boundary, Suspense and logs, and `App`'s `gamePage` collapses to
`<GamePage key={gameId} gameId session manifest />`. The decision and the
files are `game-page`'s — this is recorded here and goes to
`src/common/game-page/todo.md` → Soon, with `App.tsx` changing when it lands.

4. Hand it to `game-page` (the recommendation), or do it now from this area?

**Resolution (2026-09-05, Joel: "i'll take your rec")** — handed to
`game-page`, written into `src/common/game-page/todo.md` → Soon as a change
that drops `children` from `GamePageProps` entirely. `App.tsx` is untouched by
this area; its one line changes when that folder does the work.

Two things the re-verification added:

- The count above is wrong: `App` imports THREE files out of `common/game-page/`,
  not four — `GamePage`, `PlayAreaErrorBoundary`, and `PlayAreaMountLog` for
  two symbols (`App.tsx:8–10`). (Since F-boot-3 landed it imports ONE, the
  route's entry component.)
- **`App` is `GamePage`'s only caller** (`App.tsx:148`; every other hit in the
  tree is a docstring or a test's `GamePageCtx` fixture), and
  `gameManifest.PlayArea` is read only at `App.tsx:144`. So the render-prop
  has one consumer and can go entirely, rather than merely being simplified —
  which is what makes this a shape change worth that folder deciding.

`PlayAreaErrorBoundary.tsx`'s stale docstring (from F-boot-2) went into the
same `todo.md` in this change.

### CLOSED, NO CHANGE · F-boot-4 · `unknown-gametype-is-a-fault` · A mistyped gametype gets an ErrorPage logged as a FAULT; a mistyped game id gets a card and a debug line

No manifest for the URL's gametype → `<ErrorPage>` with
`diagnosticsLine('FAULT', { call: 'GET /g/<gametype>', severity: 'fault',
detail: 'no manifest registered for this gametype' })`. No row for the game id
→ `<NoSuchGamePage>`, a `card` with "There's no game
here. It may have been deleted, or the link you followed might be wrong or out
of date", a Back home link, and `console.debug('[ui] no-such-game …')`.

From the person's side these are the same mistake — a bad link — and they get
two different screens, one of which calls itself a fault. Nothing in the app
is broken when someone types `/g/wordl/…`; `docs/envelopes.md` reserves
`fault` for the app failing. The comment beside the lookup already knows this
for the case-mismatch case ("reported as a fault — which it isn't") and
normalizes to avoid it.

**The ruling stands; both branches moved.** On 2026-09-14 the game-page area
took the gametype lookup and this error page into `GamePageGate`, which now
answers every way a game URL can come to nothing in one place — App passes the
URL's two parts and the session. The two screens are still deliberately
different, and now sit four lines apart where the difference can be read.

**Recommendation.** One not-found treatment for both: the unknown-gametype
branch renders what `noSuchGamePage` renders, with its own detail in the debug
line. Where that page lives — exported from `game-page`, or a `NotFoundPage`
in `error-page` beside `ErrorPage` — is a call for whichever of those areas
opens first; until then `App` imports it from `game-page`.

5. Agree a bad gametype is not a fault, and match the two pages?
6. Home for the shared page: `game-page` exports it now, or wait for
   `simple-page` (`error-page`)?

**Resolution (2026-09-05, Joel: "no, this division is intentional and good")**
— no change, and the split is a decision rather than drift: a gametype that is
not in the registry is a different thing from a game that is not there, and
the two screens say so. Question 6 falls with it — no page is shared, so
`noSuchGamePage` stays private to `GamePage.tsx` and `App` keeps its
`ErrorPage`. The ruling is recorded as a comment above `App.tsx`'s
`if (!gameManifest)` branch, so the next area to read either file does not
re-find it. It went there rather than `common/game-page/doc.md`: that folder is
still on `INTROS_OWED`, a rationale is Design material, and writing one there
now would both claim a Design `game-page` has not written and fail the guard
from the other side.

What the reading turned up and remains true: there are THREE routes to a game
URL with nothing behind it, not two — an unknown gametype (`App.tsx:127–142`),
an id that is not uuid-shaped (`GamePage.tsx:225`), and an id with no row
(`:227`, `:525`) — and the last two share `noSuchGamePage` while the first
does not. `App.tsx:119–122`'s comment ("reported as a fault — which it
isn't") is about the case-mismatch instance it normalizes away, not about
this ruling.

### WORKED · F-boot-5 · `chosen-theme-writes` · `chosenTheme()` persists and clears the stored choice, and its name says read

`loadTheme.ts:46–57`: `chosenTheme` reads `?theme=` and, on either value,
WRITES — `rememberTheme('midnight')` or `rememberTheme(null)` — before
returning. Every call site that reads the name reads a getter. The rule is
Joel's: a name carries the side effect, and a comment at a call site
explaining one means the name is wrong.

**Recommendation.** Let `loadTheme` do the three steps in the open, so the
write is visible where it happens:

```ts
const fromUrl = themeFromUrl()                     // 'daylight' | 'midnight' | null
if (fromUrl) rememberTheme(fromUrl === 'midnight' ? 'midnight' : null)
const theme = fromUrl ?? storedTheme() ?? 'daylight'
```

`chosenTheme`'s docstring — the URL wins, and `?theme=daylight` clears rather
than merely loses — moves onto `loadTheme`, which is where a reader is.

7. Agree?

**Resolution (2026-09-05, Joel: "7. yes")** — done. `chosenTheme` is gone;
`themeFromUrl()` parses and only parses, and `loadTheme` does the three steps
itself, with the write on a line of its own. `chosenTheme`'s docstring — the
URL wins, and `?theme=daylight` clears rather than merely loses — is now the
comment over that write. All three helpers were already private to the file
and `loadTheme` has one caller (`main.tsx:36`), so nothing outside moved;
`docs/ui.md:547–556` names the chain, never this function.

### WORKED · F-boot-6 · `load-theme-untested` · `loadTheme.ts` has no test, and its comments argue three rules nothing pins

No `loadTheme.test.ts`. The rules the file carries in prose: the URL wins over
the stored choice; `?theme=daylight` CLEARS the stored value; blocked storage
falls back to daylight instead of taking boot down (`:22–28`, six lines of
argument); the theme name lands on `<html>` (`:76`, read by
`stackdown/theme.css:64`). `storage.fake.ts`'s `blockAccess()` is exactly the
third case. A file per unit.

Written after F-boot-5, so the cases pin the shape that stays.

8. Agree?

**Resolution (2026-09-05, Joel: "do it")** — `src/common/themes/loadTheme.test.ts`,
eight cases, all through the one export: midnight from the URL and it sticks ·
`?theme=daylight` CLEARS a stored midnight · the stored choice wins when the
URL is silent · daylight with neither · a theme name we do not have falls
through to the stored choice · blocked storage answers daylight · a blocked
browser still honors the URL for THIS load and stores nothing · `<html>`
carries `data-theme`.

The URL is set with `history.replaceState`, which jsdom derives
`location.search` from, so this file needs none of the `window.location` stub
machinery F-boot-8 is about. `installFakeStorage()` is required rather than
convenient: `window.localStorage` is `undefined` under vitest.

**Two cases were rewritten because they passed for the wrong reason.** As
first written, "falls back to daylight when the browser blocks site data"
stored nothing before calling `blockAccess()` — so it would have passed with
`blockAccess` as a no-op, since nothing stored answers daylight anyway. It now
stores midnight first, and can only pass by the read actually throwing. The
same for the honors-the-URL case, which now also asserts the write did not
land, read off the fake directly (reachable while `window.localStorage` is
not).

Verified by planting: replacing the pick with a constant `'daylight'` fails
five of the eight, and dropping the clear (`?theme=daylight` storing nothing
instead of removing) fails exactly the clears case.

### WORKED · F-boot-7 · `blocked-storage-by-hand` · The stale-chunk test models a blocked browser by hand, as the wrong failure, beside a fake built for it

`reloadOnStaleChunk.test.ts:68–93`: the "fails closed" case swaps
`window.sessionStorage` for `{ getItem: blocked, setItem: blocked }` under a
nine-line comment about jsdom's `Storage` proxy. That models a CALL throwing.
A browser blocking site data throws on the property ACCESS — which is the
case `storage.ts` names its storages for (`:42–43`) and the case `web-storage`
built `installFakeStorage().blockAccess()` to model; `failCalls()` is the
quota shape. `sessionStorage.clear()` at `:27` is why this file holds a row in
`src/guards/rawStorage.test.ts:82`.

**Recommendation.** Install the fake once; `blockAccess()` for the fail-closed
case, `fake.clear()` between cases (the guard row goes), and `failCalls()` —
or a spy on the fake's `setItem` alone — for F-boot-1's write-fails case.
`storage.fake.ts:9` says "`reloadOnStaleChunk.test.ts` clears it raw"; that
sentence goes with it.

9. Agree?
9b. The `storage.fake.ts` sentence is in a `cs-blessed-web-storage` file — fix
    it here as a mechanical consequence, or note it for `web-storage`?

**Resolution (2026-09-05, Joel: "i'll take your rec")** — converted. The fake
is installed once in `beforeAll`, `storage.clear()` replaces the raw
`sessionStorage.clear()`, and the fail-closed case is `storage.blockAccess()`
plus the four assertions: the saved-and-restored accessor, the `finally`, and
the nine-line comment about jsdom's `Storage` proxy are all gone, since none
of it is true of the fake. `restoreAllMocks` in `afterEach` undoes the spy,
which the fake's own docstring specifies.

Both mechanical consequences landed with it: the file's row in
`rawStorage.test.ts` ALLOWED is deleted (the guard's third case fails from
that side once the last raw touch goes), and `storage.fake.ts:7–8` no longer
cites this file as the one that "clears it raw" — 9b answered by taking the
recommendation, so it was fixed here.

**One thing the conversion turned up.** Deleting the ALLOWED row left the
guard RED on a hit the audit had not counted: the regex matches the bare word
anywhere outside a comment, and the case was TITLED "does NOT reload when
sessionStorage is unavailable". Renamed to "when the browser blocks site
data", which is what the case actually models and reads better for it. Worth
knowing for any other file leaving that allowlist: a test NAME can hold the
last raw touch.

Verified by planting: dropping the `blockAccess()` call fails exactly the
fail-closed case (the reload fires, uncounted), which is the loop the counter
exists to prevent.

### WORKED · F-boot-8 · `location-stub-thrice` · The reload stub is written verbatim in three test files

`panic.test.ts:20–41`, `reloadOnStaleChunk.test.ts:16–45` and
`auth/ClaimHandleScreen.test.tsx` each hold the same twelve lines: keep
`realLocation`, `Object.defineProperty(window, 'location', { value: {
...realLocation, reload }, writable, configurable })`, restore in `afterEach`,
and the same explanation that jsdom's `reload` is non-configurable. Three
copies is drift waiting to happen, and the second boot test already dropped
the explanation.

**Recommendation.** `src/common/boot/reload.fake.ts` on `storage.fake.ts`'s
pattern — `installFakeReload(): { reload: Mock, restore(): void }` — used by
both boot tests; `ClaimHandleScreen.test.tsx` converts as a sweep (no
reading, stamp unchanged) or when `simple-page` opens. In `boot` because
reloading the page IS boot's business: both of its modules do it.

10. Agree, and is `boot` the home?

**Resolution (2026-09-05, Joel: "10 yes")** — `src/common/boot/reload.fake.ts`,
`installFakeReload(): { reload, restore }`, used by both boot tests. Twelve
lines per file become two, each docstring keeps a pointer instead of its own
copy of the jsdom explanation, and the assertions read `location.reload`.

**The finding was wrong about its own scope, twice, and the correction is the
interesting half.** It is a TWO-file duplication, not three:
`ClaimHandleScreen.test.tsx:22–33` stubs `location` for **`assign`**, with a
different stub shape (`{ assign, href }`), for a different reason (jsdom
cannot navigate), through a `stubLocation()` helper rather than a
`beforeEach`/`afterEach` pair. Same property, different method, different
purpose — so it was left alone, and one fake serving both would have been a
stub doing `reload` AND `assign` for a caller that is not asking. And "the
second boot test already dropped the explanation" was false: both carried one
(`panic.test.ts:16–17`, `reloadOnStaleChunk.test.ts:13–14`), so no drift had
started.

`vi.restoreAllMocks()` does NOT undo a defined property, so `restore()` is
called explicitly in both `afterEach`s — the fake's docstring says so, since
that is the trap.

Verified by planting: dropping the `reload` override from the stub fails four
of the eight cases across the two files.

### WORKED · F-boot-9 · `app-docstring-half-the-file` · App's docstring describes the route table and nothing else the file does, and parts of what it does say are stale

`App.tsx:33–69` opens "Owns the URL → component routing for all paths the app
understands" and lists routes. The file also renders the gates IN ORDER before
any route — loading, signed out, probe failed, unclaimed (`:92–113`) — and
mounts the hosts that hang off the root after the page (`:195–225`); the
docstring says nothing of either, and the gate order is the one thing a
reader cannot get from `routes.ts`. Inside it: "GamePageCtx (session, gameId,
members, timer)" — there is no `members`; the ctx has `players` and a dozen
more fields (`gamePageCtx.ts`); "Why the gametype is in the URL … no
cross-schema id resolution" is `routing/doc.md:66`'s sentence, a second copy;
and the `<CreateClubModal>` aside is HomePage's detail. Added while working
F-boot-3: the sketch at `:54` writes `<GamePage gameId session gametype>`, and
the prop is `manifest` (`GamePage.tsx:61–72`); there is no `gametype` prop.

**Recommendation.** Rewrite in three parts, after F-boot-3 and -4 settle how
much the game route needs: the gates in order and what each renders; the
route → page table; what hangs off the root and why it is here rather than in
a page. The game-route paragraph becomes a sentence and a pointer to
`game-page`. The dev-page line in the code is not touched.

11. Take the draft, or adjust it first?

**Resolution (2026-09-05, Joel: "11 ok")** — rewritten in the three parts. The
gates now lead, in the order they run and with what each returns; the route →
page table follows; and the root-mounted singletons come last, each with the
reason it is there rather than in the page that opens it.

What left the docstring: the gametype-in-the-URL paragraph (it is
`routing/doc.md:64–66`'s, and that doc draws the line itself — "What each path
SHOWS is still `App.tsx`'s"), the `<CreateClubModal>` aside (mounted by
`HomePage.tsx:259`), the `members` field that never existed, and the code
sketch — the game route is one table entry and a pointer now, so it cannot go
stale on `game-page`'s props the way the sketch had.

The dev pages are neither named nor counted. They are not gates, so a gate
list that omits them is accurate rather than silent about something.

One correction to the finding: it cites the hosts as `:195–225`, which stops
at `FaultModal`. The range is `:195–229` — `TooltipHost` is in it, and the two
root-mounted popups belong to that part of the story too.

### WORKED · F-boot-10 · `stale-blank-page-story` · `reloadOnStaleChunk.ts`'s docstring describes the app before `panic.ts`, and the exported function has none

- `:12–13` — "the import rejects, nothing catches it, and React unmounts to a
  blank page." Since `panic.ts`, nothing unmounts to a blank page: a chunk
  failing under the boundary lands in its card, and one failing outside it
  lands in the panic screen (`PlayAreaErrorBoundary.tsx:9` says the same —
  "the only boundary in the app").
- `:8–9` — "(the sibling-manifest + code-splitting pattern, docs/common.md)".
  The sibling-manifest pattern is coop/compete variants; the section is
  `docs/common.md → Code-splitting`.
- `:11–13` — "a tab opened before a deploy that lazy-loads its first game
  *after* it asks for a chunk that no longer exists" does not parse.
- `:22–23` and the test header `:10` — "landing in PlayAreaErrorBoundary's
  card" is true only under the boundary; a SetupForm or Help chunk fails into
  the panic screen.
- `:58` — `export function reloadOnStaleChunk()` has no docstring. The file
  docstring carries the mechanism; the function `main.tsx` calls says nothing
  about when to call it (before the first dynamic import, which `main.tsx:29`
  has to say for it).

One rewrite, with F-boot-1 and -2 settled first so the counter's rule is
written once.

12. Take the draft?
13. `main.tsx:27–29` carries the before-the-await rule the function docstring
    would own — trim it here, or leave `main.tsx` to F-boot-12?

**Resolution (2026-09-05, Joel: "12: ok / 13: do it")** — all five points, plus
the call site.

The blank-page story is gone: the failure is now described as what it actually
produces, which is one of two screens depending on whether the chunk was under
the play surface. The pointer is `docs/common.md → Code-splitting`, not the
sibling-manifest pattern (that one is coop/compete variants, `:40–46`). The
sentence that did not parse is rewritten. The guard paragraph says "one of
those two screens" rather than naming only the boundary, and
`reloadOnStaleChunk.test.ts`'s docstring, which repeated the same half-truth,
says the same thing now.

The export has a docstring, and it owns the calling rule: once at boot, before
the first dynamic import, because `main.tsx` awaits the theme chain and that is
one. `main.tsx`'s comment keeps the local fact — this call goes first, and why
— and points at the helper for the rest (13).

### WORKED · F-boot-11 · `docs-common-stale-boot-lines` · `docs/common.md`'s folder layout names a path that does not exist, under a paragraph saying it inlines no tree

`docs/common.md:549–552` — "paints the plain-DOM last-resort screen in
`common/lib/util/panic.ts`"; it is `common/boot/panic.ts`. The `common/` lines
under it (`:557–559`: `db.ts`, `theme.css`, `components/ hooks/ lib/ pdf/`)
describe the pre-reorg tree, and the paragraph directly below (`:562–565`)
says the file "no longer inlines a per-file tree". The `main.tsx` and
`App.tsx` lines are this area's; the fix for the `common/` sub-tree is the one
that paragraph already promises — drop it and point at `common-folders.md` —
and is two lines, so it ships here rather than waiting for an owner.

Also found, not this area's: `docs/common.md:621` says "`<GameInvitations>`
renders the popups"; it is headless (`GameInvitations.tsx:64` returns null)
and `ToastHost` renders them, as `App.tsx:210–214` says. A sentence about the
invitations component → `common-hosts` (Notes).

**Resolution (2026-09-05, Joel: "fix both")** — `common/lib/util/panic.ts`
became `common/boot/panic.ts`; the three `common/` sub-lines went (`db.ts` and
`theme.css` are both gone from the tree, verified, and `components/ hooks/
lib/ pdf/` predates the reorg), leaving one `common/` line and the pointer the
paragraph below already promised. That paragraph itself said
`common/{components,hooks,lib}`, so it now says `common/`. The `App.tsx` line
describes the file as F-boot-9 left it: the gates, then the route table, then
the root-mounted singletons.

**Still absent from that tree, and NOT added** — it lists every top-level
entry of `src/` except `shared/`, `guards/` and `test-setup.ts`. Adding rows
is past what this finding names, and `shared/` in particular is a `docs`
question about what the layout section is for. Left for whoever rules on it.

### WORKED · F-boot-12 · `main-docstring-and-suffix` · `main.tsx`'s docstring is one line for a file that is entirely an order, and one import carries a suffix

- `:3` — "Top of the React application." The file's content is a SEQUENCE —
  width tracker, stale-chunk listener, theme, root — and every reason is
  per-line; the docstring should say in a sentence that the order is the
  point, so a reader knows why the lines may not move. Three sentences.
- `:17` — `import App from './App.tsx'`, the only extension-suffixed import
  in `src/`. Drop the suffix.

The CSS import comments (`:8–15`) are `corecss`'s words and are not touched.

**Resolution (2026-09-05, Joel: "fix both")** — the docstring says the file is
an order, and why each line sits where it does: the width tracker publishes
the token board sizing reads, the stale-chunk listener has to be up before the
first dynamic import, the theme is awaited so the first paint is not a frame
of undefined tokens. It closes on the `try` and the root's `onUncaughtError`
being two halves of one promise, never a blank page.

The suffix is dropped — `import App from './App'`. Verified by a real build,
not just `tsc`: the extension resolution is Vite's, not TypeScript's.

### The whole-area re-read, 2026-09-05

All nine code files read again in one sitting, after the last fix, and every
citation checked against the tree: the `web-storage` API and its key shape
(`storage.ts:19–28`, which names `puzpuzpuz::theme` as the one empty-area
key), `diagnosticsLine`'s format (`FAULT | boot |` is the second and third
field), the one boundary in the app, `useSession`'s fields, `routes.ts:28`
carrying the gametype-in-the-URL reason App's docstring credits it with,
`GamePage`/`PlayAreaSlotLog`/`PlayAreaReadyLog`/`ErrorPage`/`StandardButton`
props (`PlayAreaReadyLog` has since been deleted — F-boot-3 above),
`WordEditDialog` being a `Dialog` and so a `FloatingPanel`,
`GameInvitations` returning null, `TooltipHost` reading `data-tooltip`, the
`docs/ui.md` Faults heading (`:112`) and FloatingPanel gotcha (`:1335`), the
`docs/common.md` Code-splitting heading (`:588`) and boot lines (`:548–554`),
the `docs/ui.md` theme chain (`:547–556`), Vite 8.0.16's helper still
dispatching `vite:preloadError`, and React's `logUncaughtError` pushing to
`thrownErrors` under `actQueue` and calling `onUncaughtError` only otherwise
(`react-dom-client.development.js:9427–9431`). All hold. The tests pass
(boot + themes + the two folder guards, 23 of 23). Three things did not hold,
all prose, all in the `loadTheme` pair; F-boot-1's ruling also now has a
durable home (`boot/doc.md` → Details), which nothing in the code recorded.

Also fixed in this file while re-reading it: F-boot-5 and F-boot-6 carried no
status in their headings despite resolution blocks — both now `WORKED`.

### WORKED · F-boot-13 · `each-game-theme-reads-it` · A test title says every game theme reads `data-theme`; one does

`loadTheme.test.ts:92` — "publishes the theme on <html>, where each game
theme reads it". The tree has one reader: `stackdown/theme.css:64`
(`html[data-theme='midnight']`). `codenamesduet/theme.css:17` mentions the
attribute in a comment as what a future sibling file would key on, and no
other stylesheet names it. The claim the case pins is true — the attribute is
published — but the title tells a reader every game theme depends on it,
which would make removing it a sixteen-game change rather than a one-game one.

**Recommendation.** Title it for what is true: "publishes the theme on <html>,
where a game theme can read it". The comment in `loadTheme.ts:68` already says
it that way ("for anything that wants to know").

14. Agree?

**Resolution (2026-09-05, Joel: "f13, f14, f15: fix")** — the title now reads
"where a game theme can read it". Nothing else in the case changed; it pins
the attribute being published, which was always the true half.

### WORKED · F-boot-14 · `could-not-start-is-panics` · `loadTheme.ts` and its test credit `main.tsx` with the "could not start" sentence that `panic.ts` owns

`loadTheme.ts:25` — "the app paints main.tsx's "could not start" instead of a
page"; `loadTheme.test.ts:17–18` says the same. The sentence is
`panic.ts:25`'s (`SENTENCE.boot`); `main.tsx:65` only catches and calls
`showPanic('boot', err)`. A reader grepping for the words lands in `panic.ts`
and finds no `main.tsx` in it. The `.ts` comment predates this area; the test
was written by it (F-boot-6) and copied the phrasing.

**Recommendation.** Both say "paints `panic.ts`'s last-resort screen" —
which names the file that owns the words and the screen's own name for
itself. One phrase, two places.

15. Agree?

**Resolution (2026-09-05, Joel: "f13, f14, f15: fix")** — both places say
"paints `panic.ts`'s last-resort screen instead of a page". The quoted
sentence is gone from both, so the words can change in `panic.ts` without
either going stale.

### WORKED · F-boot-15 · `docstring-detached-by-a-blank` · `loadTheme`'s function docstring is separated from its function by a blank line

`loadTheme.ts:54–56` — the closing `*/` of "Pick a theme and load ITS chain",
a blank line, then `export async function loadTheme()`. The file's other
three helpers sit directly under theirs, and so does every function in the
other eight roster files; the only blank-line gaps elsewhere are the FILE
docstrings of `App.tsx` and `reloadOnStaleChunk.ts`, where the gap is the
point. Here it makes a function docstring read as a file one. Predates this
area (`d0aae843`, 2026-09-02).

**Recommendation.** Delete the blank line.

16. Agree?

**Resolution (2026-09-05, Joel: "f13, f14, f15: fix")** — deleted. The
docstring now sits directly on the function like the file's other three.

## Notes

- **Two console channels this area writes, neither one `logStamp` names:**
  `[route]` (`App.tsx:187`) and `[render]` (`panic.ts:66`). `session` ruled
  bare channels the repo-wide shape outside `[db]`, `[rt]`, `[ui]` (twelve
  sites in `src/common/`), so not a finding here either; noted for whichever
  area decides the channels.
- **What earns a mount at the root is `common-hosts`' question** (§3), and
  `App.tsx:81–90` answers it per instance with the FloatingPanel
  flow-position reason (`docs/ui.md:1334–1335` agrees; `FloatingPanel.tsx`
  still uses react-rnd). Listed, not audited: the comments are true today and
  the decision is that area's.
- **Left for `common-hosts`:** `docs/common.md:621` — `<GameInvitations>`
  "renders the popups" (F-boot-11).
- **Left for `game-page`:** F-boot-3 and the `PlayAreaErrorBoundary` docstring
  from F-boot-2 are both WRITTEN into `src/common/game-page/todo.md` → Soon.
  Still to place: the home of the not-found page (F-boot-4).
- **`docs/ui.md → Faults`** (`App.tsx:218`) resolves — the heading is at
  `docs/ui.md:112`. Checked, not a finding.
- `common.sql`, `_shared/http.ts` and `_shared/startGame.ts` are still
  unplaced in the areas table (carried from `supabase` and `session`).

## Predicted test breaks

- ~~`src/guards/rawStorage.test.ts` — its row for `reloadOnStaleChunk.test.ts`~~
  DONE with F-boot-7: the row is deleted, and the case that used to name
  `sessionStorage` in its TITLE was renamed, since the regex reads titles too.
- ~~`src/common/web-storage/storage.fake.ts`~~ DONE with F-boot-7: its
  docstring no longer names this test as the one that "clears it raw".
- ~~`src/guards/folderDocs.test.ts`~~ DONE at the re-read: `INTROS_OWED`
  lost `common/boot` when the Design was written.
- ~~`src/guards/csStamps.test.ts`~~ DONE: `loadTheme.test.ts` (F-boot-6) and
  `reload.fake.ts` (F-boot-8) both carry `cs-unmet` and the guard passes. The
  tally counts TRACKED files only, so a new file does not appear in it until
  it is committed.

## Closing

- [x] the whole area re-read in one sitting after the last group — three
      findings, F-boot-13 to -15, all worked
- [x] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      — `boot/todo.md` is empty and nothing is owed to the folder itself;
      F-boot-1's ruling moved to `doc.md` → Details. The one unruled item in
      Notes (`docs/common.md`'s `src/` tree omitting `shared/`, `guards/`,
      `test-setup.ts`) is a `docs` question with no folder, and stays here
      until someone rules
- [x] every file on the roster blessed, or its stamp says why not — nine
      files `cs-blessed-boot` (Joel, 2026-09-05: "mark files in this area as
      blessed, close the area, and commit")
