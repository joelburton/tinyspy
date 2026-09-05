# Area: mobile

The folders it reads: `mobile`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-05). Roster agreed; every file read; twelve findings
below, of which F-mobile-3 is worked.

## The roster

Agreed 2026-09-05. `docs/mobile.md` is OFF the roster — Joel: it is the overall
approach to mobile, and this folder's `doc.md` is about the individual hooks and
tools only. A correction to that doc made as a side effect of a finding is fine
(the `outcomes` precedent).

| file | stamp | callers (evidence, not roster) |
|---|---|---|
| `breakpoints.css` | `cs-audited-mobile` | injected into every stylesheet by `postcss.config.js`; `--mobile` read by 19 stylesheets, `--phone` by 10, `--touch` by 4, the other four by none |
| `useMediaQuery.ts` | `cs-audited-mobile` | the three device hooks below; nothing else |
| `useIsMobile.ts` | `cs-audited-mobile` | `menu/Menu.tsx`, `info-sheet/useInfoSheet.ts`, `game-page/GamePage.tsx` |
| `useIsPhone.ts` (was `usePhone.ts`) | `cs-audited-mobile` | `floating-panels/FloatingPanel.tsx`, `codenamesduet/components/CluePanel.tsx` (twice), `connections/components/BoardCol.tsx` |
| `useIsCoarsePointer.ts` (was `useCoarsePointer.ts`) | `cs-audited-mobile` | `floating-panels/FloatingPanel.tsx`, `bananagrams/components/PlayArea.tsx`, `waffle/components/Board.tsx` |
| `useVisualViewport.ts` | `cs-audited-mobile` | `floating-panels/FloatingPanel.tsx` only |
| `layoutWidth.ts` | `cs-audited-mobile` | `main.tsx` calls it once; `--client-width` read by `game-page/PlayArea.module.css` (4 rules) |
| `doc.md` | — | lede written; Design owed |
| `todo.md` | — | empty under all four headings at opening |

Written by the area (F-mobile-3), and on the roster from here:

| file | stamp | what it is |
|---|---|---|
| `readCustomMedia.ts` | `cs-met-mobile` | reads one `@custom-media` condition out of `breakpoints.css`; test-only |
| `useIsMobile.test.ts` | `cs-met-mobile` | its query is `--mobile` |
| `useIsPhone.test.ts` | `cs-met-mobile` | its query is `--phone` |
| `useIsCoarsePointer.test.ts` | `cs-met-mobile` | its query is `--touch` |

At opening, no test file existed for any of these units. Two specs elsewhere
touch the engine in passing: `menu/Menu.test.tsx` stubs `matchMedia` by hand to
reach the mobile drill-down, and `tooltips/TooltipHost.test.tsx` relies on jsdom
having no `matchMedia`. Ten e2e specs run at phone viewports and exercise the
CSS side.

## Findings

### F-mobile-1 · `dead-custom-media` · Four of the seven names have no reader

`--phone-p`, `--phone-l`, `--tablet-p` and `--tablet-l` are declared and read by
no stylesheet (grep `(--<name>)` across `src/`: zero each). `breakpoints.css`
justifies them as "for the occasional per-mode tweak"; after the whole mobile
pass (`docs/mobile.md`, ten phone e2e specs) no such tweak exists. `--phone` is
also written out longhand rather than composed from its two arms, so the arms
are not even used to build the one name that is read.

Two honest shapes: (a) delete the four, and the matching six-line block in
`docs/mobile.md → Naming the device classes` shrinks to the three names that
exist; or (b) keep them as vocabulary, in which case `--phone` should be
composed from `--phone-p, --phone-l` (postcss-custom-media resolves a name
inside a definition) so the arms have a reader. The doc's "five classes defined
once" was written before any of them was used; the file has three. Joel's call
— an unread declaration is the shape the dead-token guard exists for on the
property side, and this is the same thing on the media side.

### F-mobile-2 · `mirror-count` · "The JS side keeps its own copy of the `--mobile` line" — it keeps three

`breakpoints.css` (header NOTE) and `docs/mobile.md` (end of "Naming the device
classes") both say the JS mirror is `useIsMobile.ts`, singular. Three hooks
mirror three names: `useIsMobile` ↔ `--mobile`, `useIsPhone` ↔ `--phone`,
`useIsCoarsePointer` ↔ `--touch` (both renamed by F-mobile-13 since). The `--mobile` line's own comment says "Mirrored
in useIsMobile.ts", which is right for that line; the header and the doc
undercount.

`useIsMobile.ts`'s docstring is worse than an undercount — it says the reverse
of the truth: *"Kept in sync by hand with the `56.25rem` in every mobile
`@media` override — CSS can't share the constant without a build step, so grep
it."* The build step exists (`postcss.config.js`), the CSS has exactly one copy
of the literal, and no override writes `56.25rem` (F-mobile-4 is the single
exception). That sentence predates custom-media and was never re-read.

Resolution shape: header + doc name all three mirrors (or, after F-mobile-3,
name the test that holds them together and stop saying "by hand" anywhere);
`useIsMobile`'s docstring says what `useIsPhone`'s says — it mirrors a named
custom-media, and how it stays in sync.

**Half of it went with F-mobile-3** (2026-09-05), which had to rewrite the same
two sentences: the stylesheet's NOTE names all three mirrors and the test that
holds them, and `MOBILE_QUERY`'s docstring no longer claims there is no build
step. **Left here: `docs/mobile.md`'s copy of the undercount** (the same
paragraph F-mobile-11 corrects), and `useIsMobile`'s HOOK docstring, which
still describes itself against `@media (max-width: 56.25rem)` overrides rather
than against the `--mobile` name.

### WORKED · F-mobile-3 · `sync-by-test` · "Kept in sync by hand" is written five times and nothing checks it

The same warning sits in `breakpoints.css`, `useMediaQuery.ts` (NOTE for
callers), `useIsMobile.ts`, `useIsPhone.ts` and `useIsCoarsePointer.ts`, each with
its own "grep the literal" advice. The sync is mechanical and a test can hold
it: read `breakpoints.css`, take the definition after `@custom-media --mobile`
(and `--phone`, `--touch`), normalize whitespace, and assert it equals the
hook's query string. Today the three strings DO match exactly (checked
character for character); a test makes that stay true when someone tunes a
threshold.

What it needs: the three query constants exported (`MOBILE_QUERY`,
`PHONE_QUERY`, `COARSE_QUERY`), and one spec per hook (a file per unit) —
`useIsMobile.test.ts` asserts its query is the CSS `--mobile`, and so on. Then
all five "by hand" sentences become one sentence in `useMediaQuery`'s docstring:
each device hook's query is asserted equal to its custom-media by its spec.
**This is the first test the area should get** — it is the only claim in the
folder that a refactor can silently falsify in production (a threshold tuned in
CSS and not in JS puts the info sheet and the layout collapse on different
lines).

**Done (2026-09-05), as written.** The three constants are exported;
`readCustomMedia.ts` reads one `@custom-media` condition out of
`breakpoints.css`; `useIsMobile.test.ts`, `useIsPhone.test.ts` and
`useIsCoarsePointer.test.ts` each hold their copy to it. All five "by hand"
sentences are gone — the four hook/engine ones now name the spec that holds the
pair, and the stylesheet's header NOTE names all three mirrors instead of one.

Two details worth keeping:

- **`import.meta.url` is not a file URL under vitest** (vite transforms the
  module and serves it over http), so reading a sibling file by relative URL
  throws `The URL must be of scheme file`. The reader goes from
  `process.cwd()`, which is what the guards under `src/guards/` already do.
- **Whitespace is normalized, everything else is exact** — so a re-indent or a
  wrap on either side is not a failure while a changed number is. Both halves
  were verified by planting: `56.25rem` → `56rem` in the CSS fails
  `useIsMobile.test.ts` and only it; a doubled space before `--phone`'s
  condition keeps `useIsPhone.test.ts` green.

Side effect on **F-mobile-2**: the stylesheet's NOTE was one of the five
sentences this finding rewrites, so its undercount is fixed here — it could not
be rewritten and left saying "the `--mobile` line" alone. What F-mobile-2 still
owns is `docs/mobile.md`'s copy of the same undercount, and
`useIsMobile`'s hook-level docstring (its CONSTANT's docstring, the one that
said the reverse of the truth about a build step, is rewritten).

### F-mobile-4 · `raw-breakpoint` · One stylesheet writes the collapse line longhand

`common/lists/FilterSelect.module.css:152` writes `@media (max-width: 56.25rem)`
with a comment saying it is the shared line, instead of `@media (--mobile)`. It
is the only CSS reader outside the folder that bypasses the name (every other
`56.25rem` outside `mobile/` is prose in a comment, an e2e note, or
letterboxed's unrelated `34rem` board cap). The file header's "any module can
write `@media (--phone)`" and `docs/mobile.md`'s "used as `@media (--mobile)`
everywhere" are both one file from true. Owned by `lists`: a line in
`src/common/lists/todo.md` → Soon.

### F-mobile-5 · `three-pastes` · The lint-rule sentence is pasted into three files, and its pointer is wrong

*"Re-renders … via the shared `useMediaQuery` engine — no setState-in-effect,
so it's clean under the repo's lint rule"* appears near-verbatim in
`useMediaQuery.ts`, `useIsMobile.ts` and `useIsCoarsePointer.ts`
(`useIsPhone.ts` escaped it). It is true once, in the engine — the device hooks are one-liners
that call it and have no effect to be clean about. Same paste pattern the
`single-flight` area removed from thirteen games.

`useMediaQuery`'s copy also says "(see docs/code-conventions)", and that doc
does not name the rule anywhere (grep `set-state-in-effect`, `setState`: the one
hit is an unrelated code sample). The rule is `eslint-plugin-react-hooks`'s
`set-state-in-effect`, enabled by `eslint.config.js`; the pointer should go
there or nowhere. `info-sheet/useInfoSheet.ts` carries the same "the repo lints
against setState-in-effect" claim with no pointer — noted for that area.

### F-mobile-6 · `caller-story-in-hook` · The hooks tell their callers' stories, and one tells the wrong one

`useIsCoarsePointer`'s function docstring spends six lines on FloatingPanel:
"the flagship use", the react-draggable `preventDefault` touchstart bug, "remove
the drag binding and the X works". That story already lives where it belongs —
`FloatingPanel.tsx:333` (with its pointer to `docs/mobile.md → Panels on
touch`) and the header of `e2e/panels-touch.e2e.ts`. The hook's docstring should
say what a coarse pointer means and when to choose this over `useIsMobile`
(which its constant's docstring already does well) and stop there.

`useIsPhone`'s "use this when" clause describes ONE of its three callers: *"when a
behavior must be scoped to the full-screen-sheet phone layout specifically — e.g.
clamping a panel to the visual viewport."* Two of the three callers (codenamesduet's
clue row, connections' action row) use it for something else entirely — buttons
go icon-only because the below-board row is tight on a phone. The docstring's
rule for choosing it should cover both jobs, or state the general one (a phone
is the device with no room to spare) and let call sites say which room.

### F-mobile-7 · `docstring-marker` · Five files, five different answers to "what gets `/**`"

The per-area `/**`-vs-`//` pass (plan §4 → "The docstring marker"):

- `useIsMobile.ts`, `useIsCoarsePointer.ts`: TWO `/**` blocks each — one on the
  query constant, one on the exported hook. The constant's block is really the
  file's docstring, and the two overlap (both explain the query).
- `useIsPhone.ts`: ONE `/**`, on the constant; the exported hook has none.
- `useVisualViewport.ts`: ONE `/**`, on the private `ViewportMetrics` type
  (fine — a type earns one) and NONE on the exported hook, so a reader deciding
  whether to call it finds the explanation attached to a type alias.
- `layoutWidth.ts`: a file-level `/**` block that floats above `let last` with
  no symbol, then a one-line `/**` on the function. The floating block reads as
  the docstring of a module variable.

The blessed siblings (`utils/shuffle.ts`, `web-storage/useStickyChoice.ts`) put
ONE `/**` on the exported symbol and let it carry the file. Resolution: each
hook gets one `/**` on its export; the query constant gets a `//` line or
nothing (after F-mobile-3 it is exported and the docstring names it);
`layoutWidth`'s floating block becomes `trackLayoutWidth`'s docstring.

### F-mobile-8 · `window-guards` · Two files in one folder disagree on whether `window` can be missing

`useVisualViewport.ts` writes `typeof window !== 'undefined'` three times and
its docstring names SSR; `useMediaQuery.ts` reads `window.matchMedia` bare. The
app is a Vite SPA with no server render and jsdom always has `window`; the
no-window case is one that never runs, and the `getServerSnapshot` third
argument to `useSyncExternalStore` exists for the same case in both files. The
REAL absence is `window.visualViewport` (old browsers, jsdom) and
`window.matchMedia` (jsdom), and both files handle that correctly. Pick one
answer — the SPA one — and drop the `typeof window` guards, keeping the
feature-absence checks and one comment saying which environments they are for.

Small, but it is exactly the kind of drift a folder's Design should settle in
one sentence: "these run in a browser or jsdom; a missing FEATURE is guarded, a
missing `window` is not."

### F-mobile-9 · `first-pass-thresholds` · A to-do lives in a file header

`breakpoints.css` ends its header with *"Thresholds are a first pass — tune
against real devices"*, and `docs/mobile.md` says *"a starting proposal — tune
against real devices."* The numbers have since been through the whole mobile
pass, ten phone e2e specs and the gallery. Either they are decided, and both
sentences go; or tuning is still owed, and it is a `todo.md` → Someday line
with the device it is waiting on, not a header caveat. (`useIsMobile`'s "(see
docs/mobile.md)" and the doc's own description of the 900px choice are the
reasoning; the caveat adds nothing to it.)

### F-mobile-10 · `tests-owed` · Which tests are worth writing, unit by unit

Joel at opening: *"we should make some, if they're worthwhile. determine that."*
Judged per unit; F-mobile-3 is the first and is not repeated here.

- **`useMediaQuery` — worthwhile.** It is the engine behind three hooks and
  the thing two specs elsewhere already stub by hand. Four claims to hold:
  returns `matches`; re-renders when the MediaQueryList fires `change`; removes
  the listener on unmount (a leak here is one listener per mounted menu); and
  returns `false` with no `matchMedia`, which is the documented desktop-first
  default every jsdom test silently depends on. The stub `Menu.test.tsx` builds
  (`stubMatchMedia`) is the fake this spec needs, so it belongs here as a shared
  test helper and the menu spec imports it — the `web-storage` shape, where the
  hand-rolled storage fakes gave way to one shared one.
- **`useVisualViewport` — worthwhile, for one property above the rest.**
  `getSnapshot` must return the SAME object while nothing changed, because
  `useSyncExternalStore` compares with `Object.is` and a fresh object loops
  forever. Every value-based test passes against a refactor that returns
  `{ ...next }`; only an identity assertion fails it. The `single-flight` area
  wrote a test of exactly this kind ("stays closed when a re-render rebuilds the
  action") and planted the break to prove it bites. Also: updates on `resize`
  and on `scroll` (the iOS `offsetTop` case), and falls back to `innerHeight`
  with no `visualViewport` — the fallback is the branch every jsdom render
  takes, so it is worth one line.
- **`layoutWidth` — marginal.** jsdom reports `clientWidth` 0 and has no
  `ResizeObserver`, so the spec would fake both to assert two things: the
  property is written on install, and a repeat observation with the same width
  does not write again. The second is the only non-obvious claim in the file and
  the comment on it is the reason it exists. Worth it only if the fake is
  cheap; recommend writing it last, or not at all, and saying which.
- **The three device hooks — no behavior test.** Each is `useMediaQuery(Q)`;
  F-mobile-3 asserts `Q`, `useMediaQuery`'s spec asserts the behavior. A per-hook
  render test would test the engine a second time.

### F-mobile-11 · `stale-doc-path` · `docs/mobile.md` names the pre-reorg path

`docs/mobile.md → Naming the device classes` says global-data injects "the
definitions from `src/common/breakpoints.css`"; the link two lines later points
at the real `src/common/mobile/breakpoints.css`. The doc is off the roster; the
one-word fix is a side effect and should ride with whichever finding touches
that paragraph (F-mobile-1 or F-mobile-2 both do).

### F-mobile-12 · `hand-rolled-hover-query` · `TooltipHost` reads a device query the way this folder did before it had an engine

`tooltips/TooltipHost.tsx:75` reads `window.matchMedia('(hover: hover)')` once,
inside an effect, with its own jsdom guard, and cites "the useIsMobile
convention" for the fallback. It is a device signal of the same family as the
three hooks here — the fourth question a page asks about its device (can it
hover) — read once at mount rather than subscribed, so plugging a mouse into a
tablet leaves tooltips off until reload. Whether it becomes
`useMediaQuery('(hover: hover)')` (or a fourth named hook with a CSS twin, since
nothing in CSS asks `(hover: hover)` today) is `common-hosts`'s call, which owns
`tooltips`; a line in `src/common/tooltips/todo.md` → Soon. Left alone:
`game-page/PlayAreaMountLog.tsx:73` reads four queries once for a diagnostic
line, which is a one-shot read on purpose.

### WORKED · F-mobile-13 · `boolean-hook-names` · A hook that answers yes/no says `is` in its name

Not in the opening audit — it came out of reading the three hooks side by side.
`useIsMobile` says `Is` and `usePhone` / `useCoarsePointer` do not, so the pair
that IS related by size looks unrelated and the two that answer the same kind of
question are spelled two ways.

**Ruled (Joel, 2026-09-05): `useIsX`.** A hook returning a boolean is a
predicate, and a predicate names itself the way `isEmpty()` does — the call site
should read as a yes/no. So `usePhone` → `useIsPhone`, `useCoarsePointer` →
`useIsCoarsePointer`, and `useIsMobile` is already right.

The rest of `common/` disagrees today — `useChatOpen`, `useScratchpadOpen`,
`useInfoSheetOpen`, `useEditProfileOpen`, `useGameHasKeyboard` — and that is
FINE: those are other areas' files, and each converts when its area opens. This
folder's three are outliers in the meantime, which is the direction of travel
rather than drift. Joel: *"the house style is dumb."*

**Done (2026-09-05).** Both hooks and their two specs renamed, file and symbol
together; the call sites are `floating-panels` (both hooks), `codenamesduet`'s
CluePanel, `connections`' BoardCol, `bananagrams`' PlayArea and `waffle`'s Board.
The rule is written where the other areas will find it —
`docs/code-conventions.md` → TypeScript naming conventions, with the four
`useXOpen` hooks named as converting per area, since it is a rule for the whole
app rather than a fact about this folder.

**What a rename does NOT break, and had to be grepped by hand**: four places
that only NAME the hooks in prose — `setup-form/SetupGameModal.tsx` and
`game-page/DeviceBlockNotice.tsx` in comments, `e2e/bananagrams-block.e2e.ts` in
its header, and eight mentions across `docs/mobile.md` + `docs/deferred.md`. The
compiler is silent on every one of them.

**Left open, and separate from the spelling**: `useIsMobile` names a device
class but decides the LAYOUT-COLLAPSE line, which is why a landscape phone wider
than 900px is `useIsPhone` true and `useIsMobile` false. Renaming it for what it
decides would mean renaming `--mobile` with it (19 stylesheets read the name), so
the hook and its CSS twin stay a pair. No decision yet.

## Notes

- **`useMediaQuery` builds two MediaQueryLists per hook** — `subscribe` holds
  one, and `getSnapshot` calls `window.matchMedia(query)` afresh on every
  render. Cheap in browsers and correct (`matches` is a boolean, so the snapshot
  is stable), so not a finding; a reader wondering why the two are separate
  should find that in the docstring after F-mobile-5 trims it.
- **`useInfoSheet.ts` and `docs/mobile.md:799` state the reason the
  MobileStatusBar is CSS-gated, not `useIsMobile`-gated**: two independent
  reads of one breakpoint can disagree across a resize; one CSS rule cannot.
  That is a design rule about the whole folder (prefer the CSS name; reach for
  the hook only when what is RENDERED changes), already stated in `useIsMobile`'s
  docstring — it is the sentence the `doc.md` Design opens with.
- **`--client-width` sits in `mobile/` but is not mobile-specific** — it fixes
  `100vw` counting the scrollbar on every device. It belongs here under the
  folder's "the viewport" clause, not its "mobile" one; the `doc.md` lede should
  say so in a word so nobody moves it to `game-page` for being read only there.
- `e2e/panels-touch.e2e.ts` is the browser-level cover for `useIsPhone` +
  `useIsCoarsePointer` + `useVisualViewport` together (a full-screen sheet, the
  X closes on tap, the sheet ends at the keyboard). Nothing in F-mobile-10
  duplicates it; the unit specs cover what jsdom can see.

## Predicted test breaks

- `src/guards/folderDocs.test.ts` — `DESIGNS_OWED` loses its `mobile` row when
  the Design is written (fails from both sides until the two land together).
- `src/guards/csStamps.test.ts` — a new file with no stamp fails it. The four
  F-mobile-3 wrote were stamped `cs-met-mobile` as they were written, so it
  stayed green; the same holds for anything F-mobile-10 adds.
- `src/guards/cssTokens.test.ts` / the vocabularies guard — none expected;
  F-mobile-1 removes `@custom-media` lines, which neither guard reads.
- `common/menu/Menu.test.tsx` — only if F-mobile-10 moves `stubMatchMedia` to a
  shared helper (an import change, not a behavior change).

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
