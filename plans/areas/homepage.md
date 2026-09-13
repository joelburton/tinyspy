# Area: homepage

The folders it reads: `home`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-13.** Roster stamped `cs-audited-homepage`.
Nine findings recorded, none worked.

## The roster

Agreed 2026-09-13 (Joel: "1 add" for the e2e).

- `src/common/home/HomePage.tsx`
- `src/common/home/HomePage.module.css`
- `e2e/home-keyboard.e2e.ts` — the club list's keys in a real browser; its
  header says the behavior is `SelectionList`'s and the page's half is the
  one-stop tab ring

Plus `doc.md` (a lede, no Design; on `DESIGNS_OWED`) and `todo.md` (empty).
**There is no Vitest file for the page** — F-1.

**Evidence, not roster:** `CreateClubModal` (club's), `SelectionList`,
`useProfile`, `useRealtimeRefetch`, `readRows`, `PageHeader` +
`PageHeaderMenu` + `useAccountMenuSection`, `Dot`, the two branding marks,
`useTabRing`. `App` routes `/` to it and anything unrouted falls back to it.

Docs that describe it: `docs/ui.md` → the height-bound list (HomePage bullet),
→ Selection lists ("The same idiom on the club-list page"), → Player identity;
`docs/common.md` → Solo clubs, → Routing; `docs/keyboard-shortcuts.md` → Club
page and home page; `docs/mobile.md` → The `.card` shell pages. Guards: only
`folderDocs` (the `DESIGNS_OWED` row); no `vocabularies` pending row names the
stylesheet.

Baseline at the opening: no unit tests to run; `tsc -b` and eslint clean on
the e2e. The e2e itself is not run without Joel's word.

## Findings

### F-homepage-1 · `no-unit-test` · the page has no test file

Joel, at the opening: *"we should definitely have a unit test for the
homepage!"* Nothing pins: the three load states (a blank line while the read
is in flight, "Your clubs couldn't be loaded." after a not-ok, "No clubs found
for your account." on an empty answer); that zero rows raises the fault modal
with the "solo club" sentence on EVERY load and a non-empty answer does not;
the greeting with and without a profile; the Solo badge on a solo row only;
`onActivate` navigating to the club's path; "+ New club" mounting the modal
and `onCreated` navigating into the new club. The mocks needed are the ones
`ClubPage`'s and `ClaimHandleScreen`'s tests already build — the `db` handle,
`useProfile`, and `useRealtimeRefetch` reduced to "call `load` once".

### F-homepage-2 · `docstring-for-the-caller` · the page's docstring is the folder's Design

`HomePage.tsx` 39–59: "Pure shell content …", the solo-clubs-on-top argument,
"Clubs RLS does the visibility filtering …". A caller needs: the `/` page,
takes the session. The rest is `home/doc.md`'s Design (F-3).

### F-homepage-3 · `design` · `home/doc.md` Design owed

The lede is "The landing page after login: your clubs." The Design, from what
the code and its comments already argue: one list and the button that adds to
it; the tab ring is that one stop and the accepted cost is that "+ New club"
is not keyboard-reachable; the three load states and why an empty list means
something different in each; zero rows is a fault the PAGE raises, since the
server has no opinion about a site invariant, and it fires on every load; solo
clubs sort first and are marked, not separated; creating a club is a modal
because the act is "add to this list"; the greeting leads with the disc
because home is where the disc says *you*. Then the `DESIGNS_OWED` row comes
off.

### F-homepage-4 · `marker-pass` · a field note on `/**`

`HomePage.tsx` 29–31: `is_solo` inside `ClubListEntry` carries `/**`. A note
on one member of a declaration takes `//`.

### F-homepage-5 · `archaeology` · a finding ID, a dated ruling, a story, a date in the e2e

- `HomePage.tsx` 249: "Creating a club is a modal, not a page (F36)" — a
  finding ID from the deleted first homepage audit, in durable code.
- `HomePage.tsx` 125: "(Joel, 2026-08-22)".
- `HomePage.tsx` 68: "is what let this page tell people they had joined no
  clubs" — the bug's story; the standing fact is the sentence before it.
- `e2e/home-keyboard.e2e.ts` 8: "which since 2026-08-24 is
  `<SelectionList>`'s"; 15–16: "It is also the only place the … rule can be
  checked at all" — the uniqueness clause; the property is that only a
  browser has a focused element that is also the scroll box.

### F-homepage-6 · `comments-restate-docs` · five comments explain shared things at length

Each of these explains a mechanism whose own docstring or doc section is the
copy that stays right, where a comment is one sentence and a pointer:

- 162–165, `PageHeader`: what the strip is and why it is a sibling of the
  card — page-header's.
- 175–181, the disc in the greeting: the app-wide "this color is you" rule,
  with the ui.md pointer already in it.
- 196–204, `heading-with-controls` and the `quiet` tone: the pattern's
  meaning and the tone's meaning, both ui.md's. The two local decisions in
  that block — the `+` is a typed character, and creating is the uncommon
  path — are the part that belongs.
- 227–232, the `empty` prop: where no-rows states go is ui.md → Selection
  lists; the local decision is the blank-while-loading.
- 103–107, the failed load: the envelope contract, with the docs/envelopes.md
  pointer already in it.

Options:

1. **Trim each to its local decision and a pointer** — the `+` as a typed
   character, the blank while loading, the nbsp, "creating is the uncommon
   path"; the rest is one line naming the doc.
2. **Keep them** — the page is the model page and its comments teach the
   patterns in place.

Recommend 1: CLAUDE.md's rule is that a comment is not there to teach, and
every one of these has a home that will be updated when the rule moves.

### F-homepage-7 · `stale-docs` · ui.md describes a `<ul>` and a `.frame` the page does not have

- `docs/ui.md` → the height-bound HomePage bullet: "`.frame` → `.card` → the
  section → the `<ul>`". The chain is `.pageMain-fills` → `.card` →
  `.clubsSection` → the `SelectionList`, whose rows are `<div>`s.
- `docs/ui.md` → "The same idiom on the club-list page": "the `<ul>` holds
  focus". Same.

Not roster; fixed in place like the docs sentences at `simple-page`.

### F-homepage-8 · `vacuous-assertion` · the Space check passes for every URL

`e2e/home-keyboard.e2e.ts` 79: `expect(page.url()).toContain('/')` — every
URL contains a slash, so the assertion that Space did not open the club cannot
fail. The intent is that the page is still home: `toHaveURL(/\/$/)`, or that
the URL does not end in the solo handle the Enter check below uses. Changing
an e2e assertion means running it, which is asked first.

### F-homepage-9 · `census` · the badge comment names who else reads the token

`HomePage.module.css` 26–29: "Solo takes the same one Co-op takes; they never
share a screen (Solo is the homepage's, the mode badges are the club page's)".
`ModePill` lives in `game-page`, and whether two readers of a flexible color
share a screen is a claim that moves with every reader. The rule stands on its
own: a flexible color means nothing and only has to differ from the other one.

## Notes

- **The greeting swaps text when the profile lands** — "Welcome!" becomes
  "● joel — welcome!". One line either way, the disc is `0.7em` inside the
  h1's line box, so nothing below moves. Not a reflow finding.
- **The zero-rows fault writes its own `call` line** (`'GET /rest/v1/clubs'`,
  `status: 200`) rather than getting one from `readRows`, because `readRows`
  answered ok. Consistent with "whoever detects a condition writes its words".
- **The e2e finds rows by `[class*="_row_"]`** — sniffing a CSS-module class
  name. It is scoped by the list's `aria-label`, and the comment says why. A
  `data-` handle would be `lists`' to add; left.
- **Two stray blank lines** — `HomePage.tsx` 158–159 and 259. Whitespace;
  goes with whichever finding touches the file first.
- **`+ New club` is not keyboard-reachable**, by design (ui.md says "the
  accepted cost"). The Design (F-3) should say it in the same words.

## Predicted test breaks

- F-1 adds `HomePage.test.tsx`; nothing existing breaks.
- F-3: `src/guards/folderDocs.test.ts` — the `common/home` row comes off
  `DESIGNS_OWED`.
- F-8 changes an e2e assertion — run on Joel's word only.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
