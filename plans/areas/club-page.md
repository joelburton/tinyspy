# Area: club-page

The folders it reads: `club`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-13.** Roster stamped `cs-audited-club-page`,
26 files at the opening, 29 now. Seventeen findings recorded; **F-9, F-10,
F-12, F-13, F-14, F-16 and F-17 worked 2026-09-13**, F-9 taking F-11's
club-page half and F-15's four not-ok arms with it — and **the prose group
(F-1 to F-8) done the same day.** Every finding is worked. What is left is
Joel's: the closing re-read, the stamps, the close.

## The roster

Agreed 2026-09-13 (Joel: "1. ok" to the four e2es, "2. keep in setup-form"
for `SetupGameModal`, "3. yes" to `CreateClubModal` staying here).

The folder, 22 files:

- `ClubPage.tsx` (1162 lines) + `ClubPage.module.css`
- `CurrentGameCard.tsx` + `.module.css` — the current-game callout (was
  `ClubGameCard`; renamed 2026-09-13, F-12)
- `ClubGameRow.tsx` — a "Your games" row's contents (its stylesheet went with
  F-12)
- `StartGameRow.tsx` — a "Start a new game" row's contents (its stylesheet went
  with F-12)
- `ClubGameDeleteButton.tsx` + `.module.css`
- `ClubHelpCompanion.tsx` + `.module.css`
- `GametypeFilter.tsx`, `ModeFilter.tsx`, `modeFilterOptions.ts`,
  `clubFilters.module.css`
- `GameEntry.tsx` + `.module.css` — the face all three game entries wear, the
  corner flag included (added 2026-09-13, F-12; `StartGameRow.module.css` and
  `ClubGameRow.module.css` went with it)
- `ModeBadge.tsx` + `.module.css` + `ModeBadge.test.tsx` — was `game-page`'s
  `ModePill` (moved 2026-09-13, F-10); still `cs-unmet`
- `ClubPage.test.tsx` (added 2026-09-13, F-16)
- `ClubPageLoader.tsx` + `.test.tsx`, `useClubGames.ts` + `.test.ts`,
  `useSetupDialog.ts` + `.test.ts` — the decomposition and its tests, added
  2026-09-13 (see "The decomposition" below)
- `CreateClubModal.tsx` + `.module.css` + `CreateClubModal.test.tsx`
- `EditClubModal.tsx` + `EditClubModal.test.tsx`
- `useClubRoster.ts` — used by `GamePage`, not by this page

The e2es, found by test title:

- `e2e/club-filters.e2e.ts` — "club page list filters", four tests
- `e2e/club-keyboard.e2e.ts` — "club page keyboard nav", four tests
- `e2e/club-mobile-tabs.e2e.ts` — the mobile column toggle
- `e2e/new-game-shortcut.e2e.ts` — two tests; the first is a game-page test,
  the second lands on this page with the setup dialog open via `?new=`

Plus `doc.md` (a lede, on `INTROS_OWED`) and `todo.md`, which carries one Bug,
seven Soon and one Someday from the stopped step 6.

**Evidence, not roster:** `SetupGameModal` (setup-form's, mounted here),
`SelectionList` + `FilterSelect` (lists'), `Segmented`, `TrashButton`,
`Companion`, `KeyList`, `ModePill` (game-page's; every render site is here),
`Chat` + `ChatButton`, `PageHeader` + `PageHeaderMenu` + `PageHeaderStatusSlot`,
`useClubPresence` + `useClubSetupPresence`, `useTabRing`, `useBoundAction`,
`useStickyChoice`, `useFeedbackSlot`, `GameLogo`, `friendlyDate`, and the RPCs
`unset_current_view`, `delete_game`, `create_club`, `set_club_gametypes`. `App`
routes `/c/<handle>` here, keyed by handle.

Docs that describe it: `docs/ui.md` → Page-height fits the viewport (the
ClubPage bullet), → ClubPage header (with "Filtering the two lists"), → Real
forms, → Selection lists, → Mode badges "Where it shows"; `docs/common.md` →
the player-count paragraph, → Solo-club handling, → the current-view pointer;
`docs/mobile.md` → Club page — tabs instead of two columns;
`docs/keyboard-shortcuts.md` → Club page and home page; `docs/states.md` →
Exiting a club page; `docs/naming.md` → the component table.

Baseline at the opening: the two modal tests, 7/7; `tsc -b` and eslint clean
on every roster file. No e2e is run without Joel's word.

## Findings

### The prose group — fork-free

### F-club-page-1 · `intro-owed` · `club/doc.md` is a lede on `INTROS_OWED`

The lede: "The club room and everything shown on it … The page binds
`act-back-to-home`, `act-help`, `act-edit-club` and `act-rename-club`." A list
of four action ids is a census, not a lede. The intro, from what the page and
its comments already argue: a club is the venue, and this page is the room —
who is here (the roster strip and presence), what is being played (the
current-game callout), what could be started (the start list, gated by the
club's enrolled gametypes and its member count), and everything the club has
played (the "Your games" list); `App` renders it at `/c/<handle>`; the games
list is one read of `common.games` plus a Realtime subscription that refetches
on every change; the club, the roster and the enrolled set are one
`get_club_page` call, made once, because membership is fixed at creation. Details: the two filters and why they persist
differently; the mobile fold and why the filters render twice; the abandoned-
pointer heal; deleting the current game (broadcast first, then the RPC); the
`?new=` intent. Then the row
comes off `INTROS_OWED`.

### F-club-page-2 · `docstring-for-the-caller` · the page's docstring describes a page that is gone

`ClubPage.tsx` 102–123: "Shows: club name, member roster, games (active /
suspended / completed), per-gametype 'Start' buttons, and chat." There are no
three sections (`docs/states.md`: no suspended category in the listing; the
flag on the row is the whole signal) and no Start buttons (a `SelectionList` of
`StartGameRow`s). The load paragraph and the Realtime paragraph are intro and
Details material. A caller needs: the `/c/<handle>` page, takes the handle and
the session.

F-9 took two of this entry's three claims with it: the RLS paragraph (replaced
by one about `get_club_page` — still too long for a docstring) and the
mid-file imports, now above the types.

### F-club-page-3 · `marker-pass` · every Props block in the folder puts `/**` on its members

A prop note is `//` (the marker rule: a note on one member of a declaration).
`ClubPage.tsx` (`session`), `ClubGameCard`, `ClubGameRow`, `StartGameRow`,
`ClubGameDeleteButton`, `ModeFilter`, `GametypeFilter`, `CreateClubModal`,
`EditClubModal` — nine Props blocks. Also `ListedGame`'s three member notes
(73–80), and the `failure` state (`fault` until F-9 renamed it), which is a
local `useState` and takes `//`. `closeSetup` and `gameState` are function-valued consts inside the
component body and take `//` as well.

### F-club-page-4 · `archaeology` · the folder narrates how it used to work, in twenty places

`ClubPage.tsx`: "canceling a setup used to cost a Tab press" (321), "Two
distinct phases that both got called 'start' before the rename" (535–537),
"the labelFor refactor
moved all the listing data here" (679–681), "We DON'T auto-navigate anyone …
anymore … no more being yanked off the club page" (745–751), "It was excluded
back when it lived only in the callout" (810–814), "Hoisted from
StartGameButtons" (377), "It used to decide the paint in StartGameButtons"
(1033–1034). `ModeFilter.tsx` 47: "Same trick, same reason, as
StartGameButtons' own buttons" — a component that no longer exists.
`StartGameRow.tsx` 28–29: "That predicate used to be evaluated twice".
`EditClubModal.tsx` 115–116: "Before this, the height was a fixed pixel count
nobody derived (F23 → C)" — a finding id from a deleted audit. `GametypeFilter`
36–44: the focus-stealing bug's story. `useClubRoster.ts` 15–16: "which is why
a non-player's messages used to render as `?`". `ClubGameCard.tsx` 36 and
`ClubGameRow.tsx` 50: "(Joel, 2026-08-24)". `ClubGameCard.module.css` 8:
"since the keyboard list-nav arrived". `ClubGameDeleteButton.module.css`
19–21: "It used to set `--iconButton-size` itself". `ClubPage.module.css`
80–85: "Both used to be written here … `:global(.item-row)`". The e2es:
`club-filters` 106–108 "(The old native `<select>` stole focus …)",
`club-keyboard` 86 "The row has no href to read any more". Each keeps its
standing fact and loses the story.

### F-club-page-5 · `stale-claims` · sentences in the folder describe something that is not there

F-9 removed two of these — the "v1" framing on the step-1 comment, and
`handleDelete`'s "the header slot is for other people's news", which the same
file already disproved and which F-9 made load-bearing to state correctly.

F-12 removed a third, the hard way. `title?` was "Optional because the lookup
map may not have populated by first render" — no lookup map exists,
`common.games.title` is `not null`, and `ListedGame.title` is a `string`. The
new `<GameEntry>` copied the claim forward in a REWORDING ("the row can render
before ClubPage has it"), which is worse than the original: the old wording
named a falsifiable thing, which is how this entry caught it. Joel caught the
new one on sight. `title` is now required in all three.

- `ClubPage.tsx` 276–277: "docs/code-conventions.md (TBD) for the
  evolution-strategy story" — no such section exists.
- `ClubPage.tsx` 975: "right column is the 'Other games' list" — it is "Your
  games".
- `ClubPage.tsx` 863–865: "Rename club … fires a 'coming soon' toast" — it
  shows an acknowledgment in the global feedback slot. (Joel, on that slot's
  own comment claiming it takes only other people's news: *"those were already
  lies anyway — rename-club puts a message into the global feedback."*)
- `ClubPage.tsx` 881–886: the `players` / `members` naming note cites a
  naming.md rule; naming.md's rule is about game context, and this is a
  comment about a prop name that could just say "the roster".
- `ClubPage.module.css` 11–13: "The only card-style chrome is the gamesList
  frame … and the per-game ClubGameCard items inside it" — no `.gamesList`
  class remains (the frame is `SelectionList`'s), and `ClubGameCard` is the
  callout, not an item inside a list.
- `ClubPage.module.css` 136–137: "`:global()`, which nothing in this codebase
  uses" — a census; the standing reason is that a module cannot target a
  global class.
- `clubFilters.module.css` 7–8: "for the same reason ClubPage.module.css
  shares a rule between `.startList` and `.gamesList`" — neither class exists.
- `clubFilters.module.css` 14: "theme.css's `<button>`" — there is no
  `theme.css` in core-css; the element rule is `base.css`'s.
- `ClubHelpCompanion.tsx` 16: "(parity — see docs/common.md → ClubPage)" — no
  such heading.
- `ClubHelpCompanion.tsx` 18–20: "Placeholder content for now … Flesh it out
  when clubs grow features (invites, roles)" — a todo in a docstring.
- `EditClubModal.tsx` 38–41: "framed as a general club-options panel so future
  settings (rename, member management) slot in" — a plan, not a description.
- `CreateClubModal.tsx` 91–100: "v1 club semantics (see CLAUDE.md /
  docs/common.md / project memory) … alpha-software prior; we're optimizing for
  'Joel and a couple friends' … A real picker … lands when we have enough
  users". CLAUDE.md says the app is no longer alpha; the paragraph cites
  memory; the picker is a todo.
- `src/common/home/HomePage.tsx` 60: the subscription comment says "when a
  friend accepts an invite and I add them" — no invite flow exists. Home's
  file; fixed in place from here.

### F-club-page-6 · `comments-restate-docs` · five comments carry a doc section's argument in full

- The two-filters block (154–176) is `docs/ui.md` → "Filtering the two lists"
  nearly verbatim, and the `club-filters` e2e (121–133) carries it a third
  time. Local: the key is per user, and `selfId` is available on first render.
- The mobile tab bar (909–923): the `aria-pressed`-not-tabs argument is
  `Segmented`'s own docstring's and `docs/mobile.md`'s. Local: which column
  each tab shows.
- The delete toast: `docs/ui.md` → Toasts and `docs/envelopes.md`. Local: no
  `ms`, because the toast is the only lasting record here. (F-9 rewrote the
  sentence above it, which gave the wrong reason for the toast.)
- The menu sections (859–866): the menu shape is `docs/ui.md` → ClubPage
  header's. Local: the four rows and the account section last.
- The heal (197–204, 231–246): the pointer-can-stick story is the current-view
  section of `docs/common.md`. Local: the grace period and what each answer
  means.

Each becomes its local decision plus a pointer, under the ruling `homepage`
F-6 set.

### F-club-page-7 · `stale-docs` · docs still name components this page no longer has

- `docs/naming.md` 173: a `<StartGameButtons onStartSetup>` row in the
  component table.
- `docs/ui.md` 1395 and `docs/code-conventions.md` 404: `StartGameButtons` in
  the shared-components lists.
- `docs/ui.md` 1898 (Mode badges → Where it shows): "the per-gametype Start
  buttons (`StartGameButtons`), the club's games list (`ClubGameCard`)" — the
  start list is `StartGameRow`, the games list is `ClubGameRow`, and
  `ClubGameCard` is the callout.
- `docs/ui.md` 1971: "StartGameButtons" in the click-target list.
- `docs/deferred.md` 129: `common/components/club/StartGameButtons.module.css`,
  a pre-reorg path to a deleted file.
- `docs/ui.md` 555: "ClubPage — fits the viewport via `height: calc(100svh -
  …)`" — the bound is the shared `.pageHeaderAndMainArea`'s, on every page.
- `docs/common.md` 33: "`src/common/lib/gameManifest.ts`" — it is
  `common/manifest/gameManifest.ts`.
- `docs/common.md` 63: "later structurally — ClubPage may render siblings as
  a single visual group" — a speculation in a reference doc.
- `src/common/game-page/ModePill.tsx` 27–28: "the per-gametype Start buttons,
  the club's games list, the club editor". Game-page's file; the sentence is
  about this page's surfaces.

This is `todo.md`'s "`<StartGameButtons>` no longer exists and is still named
in nine places", found at eight (the `GameLogo.module.css` mention is gone).

### F-club-page-8 · `tidy` · two things the eye trips on

A stray blank line at `ClubPage.tsx` 372–373. The mid-file imports went with
F-9.

### The decision group — each waits for Joel

### F-club-page-9 · `duplicate-roster-load` · WORKED 2026-09-13 — one RPC, not one loader

The finding as recorded: `ClubPage` read `clubs_members` then `profiles`
inline, `useClubRoster` read the same two for `GamePage`, and only the hook
carried `todo.md`'s Bug. The options were one loader, fix the hook alone, or
leave both.

**What the conversation turned it into.** Asking what a failed load should DO
moved the question off "where does the loading code live": the page's four
step-1 reads were serial only because each failure bailed, so the chain cost
four round trips on every successful load to save three on a miscopied URL.
Joel's rulings — a bad handle is 404-style, a failed members read is fatal,
"no members" is a fault, "no gametypes" is not an error — do not fit four
direct reads, because RLS answers "no such club" and "not yours" identically
with zero rows and four parallel failures would raise four modals (faults do
not coalesce).

**Built instead:** `common.get_club_page(target_handle)` — a `stable security
definer` read returning club (with `is_solo`), the roster alphabetical by
username, and the enrolled gametypes with their `default_setup`. Refusals
`PN493` signed out · `PN494` no such club · `PN495` not a member, the last
worded exactly as `require_club_member`'s `PN012`. The call site passes
`presentFaults: false` and renders every not-ok as `<EnvelopeErrorPage>`,
which `callSiteShape.test.ts` names as the fourth legitimate opt-out: a modal
over a page that failed to load says the same sentence twice.

**Step 2 (the games list) stays a PostgREST read** with its Realtime refetch,
and its silent `return` became a fault modal plus a message in the GLOBAL
feedback slot. That bends `feedback/doc.md`'s split — the header is for other
people's news — deliberately: nothing retries this read, so a stale list is a
page to reload, and the roster and chat pills it hides are not what the player
needs meanwhile. Joel: *"there's nothing useful about showing the user list or
chat message pills or such — the user should be reloading the page."* The
exception is commented at the slot, NOT added to `feedback/doc.md` (Joel:
*"this is something only someone reading the clubpage code would want to
know"*). The list's `empty` node now says the read failed rather than "No
games yet."

**The two loaders were left alone**, which is what the finding originally
asked about: `ClubPage` has no inline roster read any more, so there is
nothing left to duplicate, and `useClubRoster` stays untouched for `GamePage`.
**The Bug is NOT fixed** — the hook still returns silently on a first-load
failure, and the surface it needs is the game page's, which is another area.

Carried with it: F-11's club-page half (`soloClub` reads `is_solo`;
`SetupGameModal`'s `modeSuffix` and the two SQL sites remain) and F-15's four
not-ok arms (the fifth, hand-built "Unknown error." fallback is gone too —
what is left is the loader's `else`, which screams).

Tests: `supabase/tests/common/get_club_page_test.sql`, 13 assertions.

### F-club-page-10 · `pill-vocabulary` · WORKED 2026-09-13 — option 1

The rule is `todo.md`'s and general: **"pill" means the FEEDBACK pill and
nothing else** — the fully-round-ended lozenge is a badge. This folder spent
the word on two other things.

`ModePill` → **`ModeBadge`**, and the file moved from `game-page/` to `club/`.
Every real import was already a club file (the mentions elsewhere — four
manifests, `CheckboxListField`, `SetupGameModal` — are prose), so the move
removed four `../game-page/` imports and introduced none. Its module already
read the shared `.badge`, so this was a name, as `todo.md` said.

The delete button's expanded shape is a **labeled button**, not a pill:
`ClubGameDeleteButton.tsx` and its stylesheet say so now. The two remaining
uses of "pill" in `ClubPage.tsx` are the feedback pill and are correct.

Docs followed: `docs/ui.md` (three sites, and the parenthetical saying the
name was owed a fix is gone), `docs/naming.md`, four game docs, one e2e
comment. `docs/naming.md`'s "a folder is not an owner" bullet used `ModePill`
as its example of a component locked away from its file; that instance is
resolved, so `<PageHeader>` carries the point and the old example is named as
history.

### F-club-page-11 · `solo-prefix-in-fe` · CLUB-PAGE HALF DONE 2026-09-13 (with F-9)

`ClubPage`'s `soloClub` was `handle.startsWith('=')`; `is_solo` is a generated
column on `common.clubs`, and the home page already read it instead. Joel: "we
should get '=' stuff out of FE when we get to them." `get_club_page` returns
`is_solo`, so the page reads the column now.

**Still open, elsewhere**: `SetupGameModal`'s `modeSuffix` (setup-form's area),
and the two SQL sites that write `like '=%'` (`common.sql`, the setgame
migration). `StartGameRow` and `ModeFilter`'s prop notes still say "handle
starts with '='" — prose, so they belong to the F-3/F-5 pass.

### F-club-page-12 · `two-line-row-thrice` · WORKED 2026-09-13 — `<GameEntry>`

The three game entries — the current-game callout, a "Your games" row, a
"Start a new game" row — each wrote their own `.content`, `.titleRow`, title
and `.meta`, and the card and the row repeated the JSX between them verbatim.

**What re-reading the files changed.** The audit said "three stylesheets with
the same values"; the truth was two twins and a cousin. `ClubGameRow` and
`ClubGameCard` were identical in four of five rules, differing only in the
title's font-size. `StartGameRow` differed in two more: its title row did not
wrap, and its second line was one muted sentence rather than a two-ended
status/date row.

Joel closed both gaps rather than working around them: *"for all of these, we
shouldn't be wrapping the title row, anyway… we could make a component and
pass an empty date field for the StartGameRow. We should keep the size
difference for the active game."* So the wrap goes everywhere, the start row
passes no `date`, and the callout keeps its larger title.

**Built:** `GameEntry.tsx` + `GameEntry.module.css`. It returns a FRAGMENT and
owns no box — a list row's belongs to `<SelectionList>`, the callout's to
`ClubGameCard` — because anything pinned to a corner needs a positioning
context it has no part of. `StartGameRow.module.css` is gone entirely;
`ClubGameRow.module.css` is now the corner flag and nothing else;
`ClubGameCard.module.css` is its box, its `<Link>` and its flag.

Two things that would have broken quietly, both caught before the build:

- `.meta` is a flex row, so `StartGameRow`'s bare text run (description, `·`,
  count) would have become three anonymous flex items spread by the gap. The
  prop takes ONE node.
- Dropping `flex-wrap` left nothing holding the badge's width, so a long title
  would have squashed "Compete". `.badgeSlot` is `flex-shrink: 0`.

`vocabularies.test.ts`: the three pending rows merged into one for the new
file. The debt merged; it did not grow.

**Then the flag moved in too** (Joel: *"move the flag in"*). My reason for
leaving it out was wrong and said so in the docstring — that a corner-pinned
thing "needs a positioning context this has no part of." It does not: the flag
is `position: absolute` and resolves against whichever caller's box contains
it, which is what it always did. So `ClubGameRow.module.css` is gone as well,
and `CurrentGameCard.module.css` is a box and a link.

**Three names went with it**, each for what the thing IS rather than where it
sits (Joel: *"name it for what it *IS*"*):

- `.titleCallout` → `.titleCurrentGame`. "Callout" was jargon I introduced.
- `ClubGameState`'s `'active'` → `'current'`, and the type moved to
  `GameEntry`, which now draws the flag. `docs/states.md` keeps view-state and
  play-state apart and warns that "active" reads as both; its rule is scoped to
  `play_state` values, so this was not a violation, only the same confusion.
- `ClubGameCard` → **`CurrentGameCard`**. It renders the club's current game
  and nothing else. The filename propagated to four docs and five other area
  files — a rename is mechanical, and nothing should point at a file that is
  not there.

`docs/ui.md`'s club-page paragraph described a `variant` prop that does not
exist and a `CurrentGameCard` that drew both registers; it now describes the
three entries sharing one face. That took one of F-7's eight `StartGameButtons`
sites with it, in the mode-badge "Where it shows" line.

### F-club-page-13 · `filters-twice` · CLOSED 2026-09-13 — option 1, keep both

Joel: *"1."* — keep two instances, record the reason, close the todo item.

The argument, now in `club/doc.md` → Details rather than only in a comment: a
filter's desktop home is inside a column and its mobile home is a sibling of
the tab bar, and no CSS relocates an element across containers, so one instance
placed by CSS is not available. One instance placed by a `useIsMobile` hook
would state the mobile threshold twice — a media query and JS — which can
disagree across a resize (`mobile/doc.md`). A duplicated STATELESS control has
nothing to disagree about, since all the state is `ClubPage`'s. The cost it
does carry is real DOM, which is why `club-filters.e2e.ts` scopes every
locator.

Reading the comment rather than this finding's summary of it corrected one
thing: on mobile only ONE filter is in the row at a time — the showing tab's —
so it is each filter that appears twice, not both at once.

Moving the argument into the doc left the comment restating it, which is
F-6's defect, so the comment shrank to the local fact plus a pointer in the
same pass. `doc.md` gained its `## Details` section for this; the folder stays
on `INTROS_OWED` until F-1 writes the intro above it.

### F-club-page-14 · `fold-vs-sheet` · CLOSED 2026-09-13 — option 1, keep the tabs

Joel: *"1."*

The reason, now in `docs/mobile.md` → "Club page — tabs instead of two
columns", beside the tabs it explains: **what differs is what the second column
holds.** A game's info column sits beside a BOARD, and the board is the page,
so the info-sheet recipe takes the column off-canvas and hands the board the
full width. This page has no board — both columns are lists you choose from,
peers, and choosing one is why you arrived. A sheet would make one the page and
the other an aside, which is a claim about priority this page does not make.

**It also corrected F-13, one commit old.** `docs/mobile.md` already carried the
duplicated-filters reasoning, in its club-page section, and F-13 put a second
copy in `club/doc.md` because I recorded the reason without checking whether it
was already written down. The doc.md item is now a pointer plus the one thing
mobile.md does not say (why the `useIsMobile` alternative is worse). Reading the
docs the area file LISTS — it names `docs/mobile.md` → "Club page — tabs
instead of two columns" in its own roster — would have caught it before the
commit rather than after.

### F-club-page-15 · `error-page-pair` — RESOLVED 2026-09-13 by F-9

`todo.md` Someday: `EnvelopeErrorPage` derives both halves from the envelope
the caller already has. Five arms built the pair by hand, and the reason to
keep them was the fifth — zero rows, "Club not found, or you are not a
member." — which had no envelope at all, only an OK line the page wrote
itself, because a successful read returning nothing is not a failure.

`get_club_page` gives that case a real envelope (`PN494`/`PN495`), so all five
arms collapsed into `<EnvelopeErrorPage envelope={failure} />`. The recommend
was option 1, keep the pair; the RPC removed the thing that forced it.

The one hand-built envelope left is `LOADED_WITH_NEITHER`, a module constant
for the loader's `else` — a wire type neither `ok` nor `not-ok`, which has
already screamed. It is a page with no sentence of its own to write.

### F-club-page-16 · `no-unit-test` · WORKED 2026-09-13 — option 1

Joel: *"1"* — write it, on `HomePage.test.tsx`'s pattern.

`ClubPage.test.tsx`, 15 assertions in five groups: the club RPC's three answers
(the page, the server-worded error page, the scream); the games list (what came
back, the current game found by `is_current_view`, an unknown gametype skipped,
a failed read keeping the page); the filters (mode narrows the start list only,
the start list can be emptied and says which mode, a solo club has no filter);
`?new=` (opens for a known gametype, ignores an unknown one); and the delete
answers (the title toasted before the refetch sweeps the row, a not-ok toasted
and the button backing out, a scream at an answer with no branch).

**The finding's inventory was stale and F-9 is why.** It listed "five failure
arms (four faults, one not-found)" — the four-read world. What the test pins is
three answers, and two of the paths it covers (the games-read pill and the
empty-state text) F-9 added with no coverage at all.

**One assertion was aiming at nothing, and planting found it.** `expect(
peekFaultsForTest()).toEqual([])` was commented as proof that
`presentFaults: false` keeps the modal away — but `runRpc` is MOCKED, so the
wrapper that would raise the modal never runs, and deleting `presentFaults:
false` from the page left the test green. The empty queue proves only that the
PAGE raises nothing itself. The other half is now asserted at the call
(`toHaveBeenCalledWith(expect.anything(), { presentFaults: false })`), and that
plant is red.

Three plants, all red after the fix: dropping `presentFaults: false`, reverting
the games-failed empty text to "No games yet.", and letting an unknown gametype
through the list build.

**What it cannot see** is the whole class of bug this session shipped twice:
jsdom does no layout. It also confirmed F-13's cost first-hand — both instances
of each filter answer a bare query, so every filter lookup is scoped through
its heading.

### F-club-page-17 · `class-sniffing-e2e` · WORKED 2026-09-13 — option 2

Joel: *"2"* — add the handles now. I had recommended leaving it, on the
grounds that the fix belongs to `lists` and `homepage` had already declined it
for that reason. He took the other branch, and it is the better one: "wait for
the owning area" had already been said once, which is how a thing never gets
done.

`SelectionList`'s row carries `data-testid="list-row"`; this page's two heading
rows carry `data-testid="heading-controls"` and its mobile filter row
`data-testid="mobile-filters"`. Every `[class*="_row_"]`,
`[class*="_headingRow_"]` and `[class*="_mobileFilters_"]` in
`club-keyboard`, `club-filters`, `home-keyboard` and `helpers/clubPage.ts` uses
them instead — `home-keyboard` included, since the handle it wanted is the one
`SelectionList` now has. `homepage`'s own note is struck through and points
here.

The shape follows the one precedent in the app, `EntryBox`'s
`data-testid="entry-value"`: kebab-case, named for what the thing is.

**The e2es are NOT run** — a selector swap with no behavior behind it, and e2e
runs are Joel's to ask for.

**One sniff is left, and it is a unit test's**: `ClubPage.test.tsx`'s
`emptyLine` helper matches `el.className === 'emptyState'`. That is a plain
global class rather than a hashed module one, so it does not rot the same way,
and this finding named the three sites it named. Recorded rather than
extended.

## Notes

- **`useClubRoster` is in this folder and used only by `GamePage`.** The
  folder is not the owner of its caller; F-9 is where that goes.
- **The heal's `console.error`** at 246 is the shape `docs/envelopes.md`
  itself quotes as the example of "logged, not surfaced". Not a finding.
- **`club-keyboard`'s "⇧<"** presses `<`, which is Shift+, on a US layout.
- **The `CreateClubModal` body text** — "Membership is set at creation and
  can't be changed later (no invitations, no leaving)" — is true today:
  `create_club` and `claim_username` are the only writers of `clubs_members`.
- **`todo.md`'s "viewport-fit chain has no vocabulary"** is core-css's
  question and stays in the todo.

## Predicted test breaks

- F-3, F-4, F-5, F-6: prose only; nothing runs differently.
- F-5's `title` prop going required: `tsc -b` is the check.
- F-10: `ModePill.test.tsx` renames with the component; the four manifests
  and `CheckboxListField`, `SetupGameModal` change an import.
- F-11: `club-filters`' solo test ("a solo club gets no mode filter") is the
  e2e that would notice; run on Joel's word.
- F-16 adds `ClubPage.test.tsx`; nothing existing breaks.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not

## The decomposition — 2026-09-13, after the findings

Not a finding. Joel, once F-16 had put a net under the page: *"the ClubPage is
very long and has a lot of complex stuff inside… Is there a decomposition
(either multiple components or hooks) that you'd recommend?"* — and then *"do
it. we can weigh the JSX later, once i see how much the other ideas helped."*

**`ClubPageLoader`** (114 lines) owns the `get_club_page` call and the three
pages it can end in — `<Loading>`, `<EnvelopeErrorPage>`, or `<ClubPage>`. The
point was never the line count: `club` stops being `ClubRow | null` for the
length of the file, and the two early returns, the `!club` narrowing arm and
four scattered null guards go with it. `savedDefaults` turned out to be derived
rather than state once the payload was a prop — nothing on the page changes a
saved default — and the `?new=` intent lost its `loading ||` guard, since the
page no longer exists before the load lands.

**`useClubGames(clubHandle, slot)`** (192 lines) is the games read, its
Realtime subscription, the generation guard and the list build, returning
`{ games, currentGameId, failed }`. `ListedGame` went with it.

**`useSetupDialog(startListRef)`** (73 lines) collapses five scattered pieces —
`pendingSetup`, `requestedGametype`, `requestConsumed`, the derived open state,
`closeSetup`, `handleStartSetup` — into `{ manifest, open, close }`. It was the
smallest cut by volume and the largest by scatter.

**`handleDelete` was left**, as recommended: one contiguous function with a
docstring, whose extraction would trade cohesion for a parameter list.

`ClubPage.tsx` 1155 → 851. Nothing behavioral moved: the 26 club tests passed
unchanged at every step, and `ClubPage.test.tsx` needed one edit — it renders
the loader now.

**One behavior did shift, and it is worth knowing**: `useClubPresence` used to
run while the club was loading and now runs after, since it lives in the page
rather than above it. A member is announced at the club a beat later, which is
if anything more honest, but it is a change no test can see.

**The JSX is untouched** — ~285 lines, and the open question Joel parked.

### The tests followed it

Joel: *"does the refactoring help the complexity of the tests you wrote for
ClubPage?"* — no, not as they stood; the rename was the only edit they had
taken. Then: *"do it."*

`ClubPage.test.tsx` was one file mounting the whole tree through the loader,
with ten mocks. It is now four files, each testing one unit:

- **`ClubPageLoader.test.tsx`** — the three answers, and the two things the
  not-ok arm carries separately: the server's sentence, and the promise
  (`presentFaults: false`) asserted at the CALL rather than inferred from an
  empty fault queue, which a mocked wrapper would leave empty anyway.
- **`useClubGames.test.ts`** — the list build and the failure, via `renderHook`.
  Its channel stub keeps the `postgres_changes` handler so a test can fire the
  event that actually drives a refetch; a `rerender` cannot, since the effect's
  deps do not change. That is what let "a failed refetch keeps the list" be
  tested honestly.
- **`useSetupDialog.test.ts`** — a press, a `?new=` arrival, and the collapse of
  the two into one answer.
- **`ClubPage.test.tsx`** — props in, `useClubGames` mocked. Three mocks left
  the file with the code they served (the Realtime channel, `postgresAttached`,
  `readRows`), and with them went the settle-retries four assertions needed.

What this gives up, and it is real: no test now mounts the page against the
real hook, so nothing proves the two fit together. The integration had caught
nothing, and the units say more precisely what they mean, but it is a trade
rather than a free win.

Three plants, all red: dropping the unknown-gametype skip, dropping
`setRequestConsumed(true)` from `close`, and dropping `presentFaults: false`
from the loader.

**The spelling guard caught two comments across this work**, both times only
AFTER the file was staged. It reads the git index, so a brand-new file is
invisible to it until then: for a new file, `git add` before trusting a green
run. (The two words are not repeated here — the guard's list is absolute, and
CLAUDE.md keeps even prose about the rule clear of them.)

## The prose pass — F-1 to F-8, 2026-09-13

Joel: *"do the prose (we refactored the clubpage heavily, so remember to check
that)"* — and the warning was the right one. Every line number in F-3, F-4 and
F-5 was stale, two files had been renamed, and the code three of the findings
described had moved into files that did not exist when they were written. Each
category was re-swept fresh rather than worked from the list.

**F-1** — `doc.md` gets its intro and comes off `INTROS_OWED`. It answers the
four questions the page answers at once (who is here, what is being played,
what could be started, what has been played), then the two reads with two
different jobs, then the thing the decomposition made true: three of the four
game entries are one object drawn three times.

**F-2** — the page docstring described a page with three game sections and
Start buttons, then (after F-9) a load that is no longer here. It now says what
a caller needs: what the page is, that everything arrives loaded, and that
`initialGametypes` is a SEED rather than a fact.

**F-3** — the marker rule, applied to eight Props blocks plus `ListedGame`'s
member notes and three function-valued consts. `handleDelete` keeps its `/**`:
it is a function DECLARATION, not a const.

**F-4** — the folder no longer narrates how it used to work. Fourteen sites,
including two dated attributions and a finding id from a deleted audit.

**F-5** — one claim had already gone with F-12's `savedDefaults` rewrite; the
rest were checked one at a time against the current code. Two were in other
folders (`HomePage.tsx`'s invite flow, which does not exist) and were fixed in
place.

**F-6** — five comments that carried a doc section's argument in full now carry
their local decision and a pointer. The filters block lost sixteen lines to
`docs/ui.md`, the tab bar's ARIA argument to `<Segmented>`'s own docstring.

**F-7** — `StartGameButtons` is gone from the repo: two docs rows rewritten for
what replaced it, three list entries and a `deferred.md` opacity row deleted,
one comment reworded.

**F-8** — the stray blank line, and one I had left in `ClubPage.module.css`.

**The marker pass fixed a guard entry nobody predicted.** `orphanedDocstrings`
listed `EditClubModal › Values` as a known orphan; converting the Props block
to `//` un-stacked the pair and the guard went red asking for its line back.
Its sibling `CreateClubModal › Values` was a real orphan of a different kind —
the component's docstring sat above `type Values` instead of above the
component — and moving it cleared that one too. Both lines are deleted.
