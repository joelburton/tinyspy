# Area: club-page

The folders it reads: `club`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-13.** Roster stamped `cs-audited-club-page`,
26 files. Seventeen findings recorded, none worked. The prose group (F-1 to
F-8) is fork-free and waits on "do the prose"; F-9 to F-17 each hold a
decision.

## The roster

Agreed 2026-09-13 (Joel: "1. ok" to the four e2es, "2. keep in setup-form"
for `SetupGameModal`, "3. yes" to `CreateClubModal` staying here).

The folder, 22 files:

- `ClubPage.tsx` (1162 lines) + `ClubPage.module.css`
- `ClubGameCard.tsx` + `.module.css` — the current-game callout
- `ClubGameRow.tsx` + `.module.css` — a "Your games" row's contents
- `StartGameRow.tsx` + `.module.css` — a "Start a new game" row's contents
- `ClubGameDeleteButton.tsx` + `.module.css`
- `ClubHelpCompanion.tsx` + `.module.css`
- `GametypeFilter.tsx`, `ModeFilter.tsx`, `modeFilterOptions.ts`,
  `clubFilters.module.css`
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
on every change; the roster and the enrolled set are read once, because
membership is fixed at creation. Details: the two filters and why they persist
differently; the mobile fold and why the filters render twice; the abandoned-
pointer heal; deleting the current game (broadcast first, then the RPC); the
zero-rows "not found or not a member" answer; the `?new=` intent. Then the row
comes off `INTROS_OWED`.

### F-club-page-2 · `docstring-for-the-caller` · the page's docstring describes a page that is gone

`ClubPage.tsx` 102–123: "Shows: club name, member roster, games (active /
suspended / completed), per-gametype 'Start' buttons, and chat." There are no
three sections (`docs/states.md`: no suspended category in the listing; the
flag on the row is the whole signal) and no Start buttons (a `SelectionList` of
`StartGameRow`s). The RLS paragraph and the Realtime paragraph are intro and
Details material. A caller needs: the `/c/<handle>` page, takes the handle and
the session. Also: `Member` and `reportUnhandled` are imported at 57–58, after
a type declaration.

### F-club-page-3 · `marker-pass` · every Props block in the folder puts `/**` on its members

A prop note is `//` (the marker rule: a note on one member of a declaration).
`ClubPage.tsx` (`session`), `ClubGameCard`, `ClubGameRow`, `StartGameRow`,
`ClubGameDeleteButton`, `ModeFilter`, `GametypeFilter`, `CreateClubModal`,
`EditClubModal` — nine Props blocks. Also `ListedGame`'s three member notes
(73–80), and the `fault` state at 134–139, which is a local `useState` and
takes `//`. `closeSetup` and `gameState` are function-valued consts inside the
component body and take `//` as well.

### F-club-page-4 · `archaeology` · the folder narrates how it used to work, in twenty places

`ClubPage.tsx`: "canceling a setup used to cost a Tab press" (321), "Two
distinct phases that both got called 'start' before the rename" (535–537),
"Bails now, where it used to drop the error" (607), "the labelFor refactor
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

### F-club-page-5 · `stale-claims` · fourteen sentences in the folder describe something that is not there

- `ClubPage.tsx` 545–546: "These don't change during v1 (membership is fixed
  at creation)". Membership IS fixed — `create_club` and `claim_username` are
  the two writers of `clubs_members` — but "v1" frames it as provisional.
- `ClubPage.tsx` 276–277: "docs/code-conventions.md (TBD) for the
  evolution-strategy story" — no such section exists.
- `ClubPage.tsx` 975: "right column is the 'Other games' list" — it is "Your
  games".
- `ClubPage.tsx` 863–865: "Rename club … fires a 'coming soon' toast" — it
  shows an acknowledgment in the global feedback slot (408).
- `ClubPage.tsx` 881–886: the `players` / `members` naming note cites a
  naming.md rule; naming.md's rule is about game context, and this is a
  comment about a prop name that could just say "the roster".
- `ClubGameCard.tsx` 18–19 and `ClubGameRow.tsx` 17–18: `title?` is "Optional
  because the lookup map may not have populated by first render". There is no
  lookup map; `ClubPage` sets it from the row, and `common.games.title` is
  `not null`. The prop should be required.
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
- The delete toast (489–502): `docs/ui.md` → Toasts and `docs/envelopes.md`.
  Local: no `ms`, because the toast is the only lasting record here.
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

A stray blank line at `ClubPage.tsx` 372–373, and the mid-file imports (F-2).

### The decision group — each waits for Joel

### F-club-page-9 · `duplicate-roster-load` · the page loads the roster the way `useClubRoster` does, and the hook has a bug the page does not

`ClubPage.tsx` 591–619 reads `clubs_members` then `profiles`, in sequence,
bailing to the fault page on either failure. `useClubRoster.ts` reads the same
two, for `GamePage`, and its docstring says so: "resolved the same two-step
way ClubPage does inline". The hook is where `todo.md`'s one Bug lives: a
first-load failure leaves `members` at `[]` for the life of the page, with no
retry and no fault of the hook's own. The page's copy does not have that bug
because it treats a failed roster as a page that cannot render.

Options:

1. **One loader.** `ClubPage` calls `useClubRoster`, and the hook grows what
   the page needs: a `failed` answer on first load (so the page can render its
   fault), while a refetch failure still leaves the last roster alone. The
   page's inline steps go. The Bug closes with it.
2. **Fix the hook's bug alone** — a `failed` flag the game page reads — and
   leave the page's inline load, since its sequencing (club → roster →
   enrolled set, one `loading` flag) is its own.
3. **Leave both**; record the duplication.

Recommend 1: the two loaders already diverge on the one thing that matters
(what a failure means), and the hook's docstring is a pointer at the
duplication. The sequencing survives — the hook takes the club handle the page
already has.

### F-club-page-10 · `pill-vocabulary` · "pill" means the feedback pill, and this folder says it for two other things

`todo.md` Soon: `<ModePill>` is a BADGE and should be renamed; "pill" is the
feedback pill and nothing else; every render site is a club surface. This
folder's prose says "mode pill" in `ClubGameCard`, `ClubGameRow`,
`StartGameRow`, `ModeFilter` and `ClubPage` (126–127), and "pill" for the
delete button's expanded shape in `ClubGameDeleteButton.tsx` (23, 31) and its
stylesheet (5, 40). The expanded delete button is a labeled button, not a
badge and not a pill.

Options:

1. **Rename `ModePill` → `ModeBadge` here**, file and all, and say "badge" and
   "labeled button" in this folder's prose. `game-page`'s file moves because
   the area that owns every render site is open; `CheckboxListField`,
   `SetupGameModal` and four manifests import it and get the one-line rename.
2. **Prose only** — this folder says "badge"; the component keeps its name
   until `game-page` opens.

Recommend 1: the todo already ruled it a name, not a conversion, and a folder
that says "badge" while importing `ModePill` reads as two words for one thing.

### F-club-page-11 · `solo-prefix-in-fe` · the page tests `handle.startsWith('=')` when the database has the answer

`ClubPage.tsx` 128: `const soloClub = handle.startsWith('=')`. `is_solo` is a
generated column on `common.clubs`, and the home page reads it instead of
the prefix. Joel: "we should get '=' stuff out of FE when we get to them." The
page already selects from `clubs`; adding `is_solo` to the select is the whole
change. `SetupGameModal`'s `modeSuffix` is setup-form's.

Options:

1. **Select `is_solo` and drop the prefix test.** `StartGameRow` and
   `ModeFilter`'s prop notes stop saying "handle starts with '='".
2. **Leave**, and let setup-form's area take both sites together.

Recommend 1: it is a three-line change in the file that is open.

### F-club-page-12 · `two-line-row-thrice` · the name-over-meta row is written in three stylesheets

`StartGameRow.module.css`, `ClubGameRow.module.css` and
`ClubGameCard.module.css` each declare `.content`, `.titleRow`, `.meta` and a
title class with the same values (flex column, `min-width: 0`; a wrapping
title row with `0.4rem` gap; a muted `0.85rem` meta line, `line-height: 1.25`).
Both row docstrings say the duplication is "known and left for the club-page
area". `todo.md` Soon: "the pattern should name the SLOTS; each component
keeps its own name for what goes in one".

Options:

1. **One `gameEntry.module.css`** in this folder with the three slot classes,
   composed by all three; the card keeps its larger title size as its own
   rule.
2. **A shared `<GameEntryContents>` component** taking logo, title, badge,
   status and date, rendered by all three; the card wraps it in its box.
3. **Leave**, and close the todo item with the reason.

Recommend 2: the three files also repeat the markup (logo, title row with the
badge, meta with status and date), and a component names the slots better than
three classes do.

### F-club-page-13 · `filters-twice` · both filters are in the tree twice

`todo.md` Soon: "The club page's filters render TWICE, desktop and mobile,
each hidden in the other mode. A markup decision before a CSS one." The
comment at 943–957 argues why: the desktop home is inside a column, the mobile
one is a sibling of the tab bar, and CSS cannot move an element across
containers; the components are stateless, so the two instances cannot
disagree. The `club-filters` e2e scopes every locator because of it.

Options:

1. **Keep two instances**, record the reason in the Details, and close the
   todo item.
2. **One instance, placed by a media-query hook** (`useIsMobile`) — the page
   renders the filter in one of two places. A hook and a CSS rule are two
   reads of the same threshold and can disagree across a resize
   (`mobile/doc.md`).

Recommend 1: the argument in the comment holds, and option 2 trades a
duplicated stateless control for a duplicated threshold.

### F-club-page-14 · `fold-vs-sheet` · the two-column fold answers the mobile question differently from GamePage

`todo.md` Soon: "The two-column fold: `.columns` stacks at `--mobile` and
`data-tab` hides one side. GamePage answers the same question with the info
sheet." Here both columns are lists a player chooses from; on the game page
the second column is information beside a board.

Options:

1. **Keep the tabs**, record why the two pages differ, close the item.
2. **Make "Your games" a sheet** opened from a button, like the info column.

Recommend 1: the two columns are peers here, and a sheet would demote one.

### F-club-page-15 · `error-page-pair` · the page builds its own `{ text, diagnostics }` for `<ErrorPage>`

`todo.md` Someday: `EnvelopeErrorPage` derives both from the envelope the hook
already has. Here five failure arms build the pair (563–641, 784–793); four
have a not-ok envelope in hand, and the fifth — zero rows, "Club not found, or
you are not a member." — has no envelope at all, only an OK line the page
writes itself.

Options:

1. **Keep the pair**, because one arm has no envelope and the four that do
   share one `diag()` helper already; close the item with that reason.
2. **`EnvelopeErrorPage` for the four not-ok arms**, the pair for the fifth —
   two error components on one page.

Recommend 1.

### F-club-page-16 · `no-unit-test` · the page has no test file

`ClubPage.tsx` is 1162 lines and its two tests are the modals'. Nothing pins:
the load sequence and its five failure arms (four faults, one not-found); the
games list from a `common.games` answer, the current game found by
`is_current_view`, an unknown gametype skipped; the two filters (mode narrows
the start list only, gametype narrows the games list only, a stale gametype
selection falling back to all, a solo club pinned to all); `?new=` opening the
setup dialog after load; deleting a game (the toast on each answer, the card
backing out on a thrown error); `EditClubModal`'s `onSaved` updating the start
list without a refetch. The heal and the current-game broadcast need Realtime
and are the e2es' to hold.

Options:

1. **Write it**, on the `HomePage.test.tsx` pattern: `readRows` mocked per
   table, `runRpc` mocked, the presence hooks stubbed, `SetupGameModal` and
   `Chat` mocked to their props.
2. **Not now** — the four e2es cover the filters and the keyboard, and a
   1162-line page is a test that will fight its mocks.

Recommend 1, scoped to the load arms, the list build, the filters and the
delete answers.

### F-club-page-17 · `class-sniffing-e2e` · three e2es find rows and rows-of-controls by hashed class fragment

`club-filters` scopes by `_headingRow_` and `_mobileFilters_`, and all three
list e2es find rows by `[class*="_row_"]`. Each says why (the desktop and
mobile instances would trip strict mode; the rows are `SelectionList`'s own).
A `data-` handle would be `lists`' to add, as `homepage` noted and left.

Options:

1. **Leave**, as `homepage` did; a line in `lists/todo.md` if Joel wants the
   handle.
2. **Add `data-testid` on `SelectionList`'s row and on this page's two
   heading rows** now.

Recommend 1.

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
