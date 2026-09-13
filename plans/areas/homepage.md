# Area: homepage

The folders it reads: `home`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-13 — audited, re-read and blessed the same day.**
Five files `cs-blessed-homepage`, on Joel's words: "mark files in this area as
blessed. then close the area and commit." Nineteen findings: nine from the
reading and ten from the closing re-read, all worked. `doc.md` harvested,
`todo.md` empty. One thing not done at the close: `e2e/faults.e2e.ts` was not
re-run after F-19 cut an assertion from it.

## The roster

Agreed 2026-09-13 (Joel: "1 add" for the e2e).

- `src/common/home/HomePage.tsx`
- `src/common/home/HomePage.module.css`
- `e2e/home-keyboard.e2e.ts` — the club list's keys in a real browser; its
  header says the behavior is `SelectionList`'s and the page's half is the
  one-stop tab ring
- `src/common/home/HomePage.test.tsx` — created by F-1, so it joins the roster
- `e2e/faults.e2e.ts` — added at the re-read (Joel: "1" on F-16); the fault
  host's wiring test lands here after sign-in, and its second test is this
  page's zero-rows fault end to end

Plus `doc.md` (a lede, no Design; on `DESIGNS_OWED`) and `todo.md` (empty).
The page had no Vitest file at the opening — F-1, now written.

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

### F-homepage-1 · `no-unit-test` · the page has no test file — DONE

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

**Worked 2026-09-13.** `src/common/home/HomePage.test.tsx`, thirteen tests, all
of the above pinned. Two corrections to the paragraph over this one: there is
no `ClubPage.test.tsx` (club's tests are its two modals), and no test in the
repo had ever reduced `useRealtimeRefetch` — the `useProfile` idiom came from
`account/EditProfileModal.test.tsx`.

The decision inside it was how the load gets driven, and it went to the stub:
`useRealtimeRefetch` is mocked to run the page's `load` once and hand the
config back, because the hook's own test already covers the channel, the
SUBSCRIBED refetch and the mounted guard. `readRows` is mocked rather than the
query — with the real one, a failed read reports its own fault and the test
could not tell whose fault the queue was holding. That mock is what lets the
"failed load raises NOTHING here" claim in the code's comment be a test.

Beyond the F-1 list it also pins the query itself — `is_solo` DESC then
`created_at` DESC — since the display order is a decision the page makes in
SQL and re-derives nowhere.

Planted six defects, each caught by the test that should: collapsing the
in-flight blank into the loaded sentence, firing the zero-rows fault once per
mount instead of per load, wording the failed load in the page, sorting solo
last, badging every row, and an `onCreated` that closes the modal without
going into the new club.

### F-homepage-2 · `docstring-for-the-caller` · the page's docstring is the folder's Design — DONE

`HomePage.tsx` 39–59: "Pure shell content …", the solo-clubs-on-top argument,
"Clubs RLS does the visibility filtering …". A caller needs: the `/` page,
takes the session. The rest is `home/doc.md`'s Design (F-3).

**Worked 2026-09-13**, with F-3 — the material moved to the Design first, and
what is left is the page, the `session` prop (its id filters the subscription;
the read sends none because RLS filters it), and a pointer.

### F-homepage-3 · `design` · `home/doc.md` Design owed — DONE

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

**Worked 2026-09-13.** Written to that shape, opening with what the page IS —
one list and the button that adds to it, and no lobby — since the club is a
venue and the list is the set of rooms you can walk into. The `common/home` row
is off `DESIGNS_OWED`; planted a renamed heading to confirm `folderDocs` now
requires the section (it does: "0 \"## Design\" sections, want exactly 1").

### F-homepage-4 · `marker-pass` · a field note on `/**` — DONE

`HomePage.tsx` 29–31: `is_solo` inside `ClubListEntry` carries `/**`. A note
on one member of a declaration takes `//`.

**Worked 2026-09-13.** Now `//`, same words.

### F-homepage-5 · `archaeology` · a finding ID, a dated ruling, a story, a date in the e2e — DONE

- `HomePage.tsx` 249: "Creating a club is a modal, not a page (F36)" — a
  finding ID from the deleted first homepage audit, in durable code.
- `HomePage.tsx` 125: "(Joel, 2026-08-22)".
- `HomePage.tsx` 68: "is what let this page tell people they had joined no
  clubs" — the bug's story; the standing fact is the sentence before it.
- `e2e/home-keyboard.e2e.ts` 8: "which since 2026-08-24 is
  `<SelectionList>`'s"; 15–16: "It is also the only place the … rule can be
  checked at all" — the uniqueness clause; the property is that only a
  browser has a focused element that is also the scroll box.

**Worked 2026-09-13.** All five cut: "(F36)", "(Joel, 2026-08-22)", the
had-joined-no-clubs clause, "which since 2026-08-24 is", and the uniqueness
clause — the last rewritten to the property it was pointing at ("the focused
element IS the scroll box, so only a browser has the default scroll to
suppress"). The two stray blank lines in the Notes went with them. The e2e was
not re-run: the change is its header prose, no code.

### F-homepage-6 · `comments-restate-docs` · five comments explain shared things at length — DONE

Each of these explains a mechanism whose own docstring or doc section is the
copy that stays right, where a comment is one sentence and a pointer:

- the `PageHeader` block: what the strip is and why it is a sibling of the
  card — page-header's.
- the disc in the greeting: the app-wide "this color is you" rule,
  with the ui.md pointer already in it.
- the `heading-with-controls` header, and the `quiet` tone: the pattern's
  meaning and the tone's meaning, both ui.md's. The two local decisions in
  that block — the `+` is a typed character, and creating is the uncommon
  path — are the part that belongs.
- the `empty` prop: where no-rows states go is ui.md → Selection
  lists; the local decision is the blank-while-loading.
- the failed-load bail-out: the envelope contract, with the docs/envelopes.md
  pointer already in it.

Options:

1. **Trim each to its local decision and a pointer** — the `+` as a typed
   character, the blank while loading, the nbsp, "creating is the uncommon
   path"; the rest is one line naming the doc.
2. **Keep them** — the page is the model page and its comments teach the
   patterns in place.

Recommend 1: CLAUDE.md's rule is that a comment is not there to teach, and
every one of these has a home that will be updated when the rule moves.

These were recorded with line numbers, which moved twice while the other
findings were worked; they are named instead. Note that the Design (F-3) now
carries the argument several of them were making, which is a second reason the
long form here is a second home for it.

**Worked 2026-09-13**, option 1: each is now its local decision plus the doc
that owns the mechanism — 34 comment lines to 12. What was kept as local: the
header strip being a sibling of the card, name-before-greeting, the `quiet`
tone for the uncommon path, the `+` as a typed character rather than a glyph,
the blank while the answer is in flight, and that a failed load needs nothing
here. What went: what a `PageHeader` is, what "this color is you" means, what
`.heading-with-controls` is for, where no-rows states go, and the envelope
contract.

### F-homepage-7 · `stale-docs` · ui.md describes a `<ul>` and a `.frame` the page does not have — DONE

- `docs/ui.md` → the height-bound HomePage bullet: "`.frame` → `.card` → the
  section → the `<ul>`". The chain is `.pageMain-fills` → `.card` →
  `.clubsSection` → the `SelectionList`, whose rows are `<div>`s.
- `docs/ui.md` → "The same idiom on the club-list page": "the `<ul>` holds
  focus". Same.

Not roster; fixed in place like the docs sentences at `simple-page`.

**Worked 2026-09-13.** The chain now reads `.pageMain-fills` → `.card` → the
clubs section → the `SelectionList`, and the focus sentence says "the list
container". Grepped the docs for sibling claims about this markup: the
remaining `<ul>` in ui.md is Help's, which is a real one.

### F-homepage-8 · `vacuous-assertion` · the Space check passes for every URL — DONE

`e2e/home-keyboard.e2e.ts` 79: `expect(page.url()).toContain('/')` — every
URL contains a slash, so the assertion that Space did not open the club cannot
fail. The intent is that the page is still home: `toHaveURL(/\/$/)`, or that
the URL does not end in the solo handle the Enter check below uses. Changing
an e2e assertion means running it, which is asked first.

**Worked 2026-09-13**, option 1: `await expect(page).toHaveURL(/\/$/)`, the
form `e2e/club-keyboard.e2e.ts` already uses for "back at home". Run green
(1.1s). Planted by pressing `Enter` in place of `Space`: line 79 is the line
that failed, on `http://localhost:5173/c/=e2e…`, and all 28 polls saw the club
URL — so `toHaveURL`'s retrying does not let a slow navigation slip past the
assertion. Plant reverted, re-run green.

### F-homepage-9 · `census` · the badge comment names who else reads the token — DONE

`HomePage.module.css` 26–29: "Solo takes the same one Co-op takes; they never
share a screen (Solo is the homepage's, the mode badges are the club page's)".
`ModePill` lives in `game-page`, and whether two readers of a flexible color
share a screen is a claim that moves with every reader. The rule stands on its
own: a flexible color means nothing and only has to differ from the other one.

Both claims were TRUE when checked — three readers of the flexible colors
(this one and `ModePill`'s `.coop`, both `--flex-color-1`; `.compete` takes
`--flex-color-2`), and every place `ModePill` renders is the club page
(`ClubGameCard`, `ClubGameRow`, `StartGameRow`, `EditClubModal`), so the
parenthetical was right too. They are still the kind of claim that goes stale
with nothing failing.

**Worked 2026-09-13**, option 1: the census sentence is replaced by the rule it
was standing in for — "Another badge wearing this same color is not a
collision, for exactly that reason." The sentence was not only a census; it
answered "isn't this the same teal Co-op wears?", and that reassurance is kept,
as a property of the token rather than a fact about today's readers.

## The closing re-read (2026-09-13)

One sitting over the four roster files, `doc.md`, and every doc sentence about
the page, with the sibling greps for each of the nine. What it found was the
usual: the reading's own work, either not landed or landed next door.

### F-homepage-10 · `edit-not-landed` · F-2's docstring cut never reached the file — DONE

The commit for the prose group says "F-2 then leaves the docstring the page,
the session prop and a pointer", and F-2's Worked paragraph above says the
same; the diff touched every other comment in the file and not this one.
`HomePage.tsx` still opened on the twenty-line "Pure shell content …" docstring
the finding was about.

**Worked 2026-09-13.** Cut to the shape F-2 agreed: the page, the `session`
prop (its id scopes the subscription; the read sends none because RLS filters
it), and a pointer at `doc.md`'s Design.

### F-homepage-11 · `record-disagrees-with-code` · F-4's note was deleted, not moved to `//` — DONE

F-4 says "Now `//`, same words" and the commit says "F-4 puts the is_solo note
on //". The diff removed the `/**` note and added nothing. The note is a local
decision — the page reads a generated column rather than testing the `=`
prefix itself — which is exactly what a `//` field note is for.

**Worked 2026-09-13.** Restored on `//`, same words, so the code matches what
was agreed and recorded. Joel then cut it again in his own pass over the file
the same day, along with more of the load, ring and heading comments — so the
note is gone by his hand, and the deletion stands.

### F-homepage-12 · `comments-restate-docs` · three more comments the Design now duplicates — DONE

F-3 wrote the Design FROM the page's comments, and F-6 trimmed five of them.
Three it did not list were left carrying the Design's paragraphs word for
word: the zero-rows block (fifteen lines: the invariant, the "whoever detects a
condition" rule, the every-load argument), the keyboard-ring block (the way
back, the open `<Menu>` — which is `Menu`'s own contract), and the modal block
(add-to-this-list, the no-open/shut-state line, "what you made it for"). Plus
F-9's kind one file over from where F-9 looked: the `creating` state's
"(the pattern ClubPage uses for its two modals)" — a census of who else does
this.

**Worked 2026-09-13**, under F-6's ruling: each is its local decision and a
pointer at `doc.md → Design`. Kept: the page raises the fault and fires it on
every load; the ring is exactly one stop and the rest is out by omission; a
modal so the list stays behind it, and success goes into the club. The
`ClubPage` parenthetical is gone.

### F-homepage-13 · `stale-claim` · "the muted line under the list" — DONE

The failed-load comment said the failure is recorded "so the muted line under
the list can say something true". The line is the frame's own no-rows line,
inside the list container, not under it — F-7's kind of claim, one comment
over from where F-7 looked.

**Worked 2026-09-13.** "the no-rows line in the frame".

### F-homepage-14 · `stale-claim` · the stylesheet says the wordmark "takes no className of its own" — DONE

`HomePage.module.css`, the `.card > *:not(.clubsSection)` comment. The
wordmark's `<img>` wears `styles.wordmark`; what is true is that the component
accepts no `className` prop, which is why the page reaches it by child selector.

**Worked 2026-09-13.** Reworded to the prop.

### F-homepage-15 · `stale-docs` · four more sentences about the page, in the docs F-7 fixed — DONE

- `docs/ui.md` → Selection lists, the same paragraph F-7 corrected: "The rows
  stay ordinary links, so clicking is unchanged." A row is a plain `<div>`
  (`SelectionList`'s own docstring says so — "not an anchor").
- `docs/ui.md` → Player identity: the greeting is "the one place the disc says
  *you*" — a census with no condition on it.
- `docs/mobile.md` → The `.card` shell pages: 'a long username in the
  "Welcome, …" heading' — the heading is "● name — welcome!"; and 'The home
  "SOLO" pill is pinned to `white-space: nowrap`' — the `nowrap` is the shared
  `.badge`'s, the label is "Solo", and it is not a pill.

**Worked 2026-09-13**, in place: "Clicking a row is unchanged."; "where the
disc says *you*"; the heading quoted as it renders; the badge sentence
attributed to `.badge`.

### F-homepage-16 · `roster-miss` · `e2e/faults.e2e.ts` drives this page and is `cs-unmet` — OPEN, Joel's call

Found the way `simple-page`'s F-20 said to look: grepping `e2e/` for the
page's heading text. Both tests in it sign in and land on `/`; the second —
"an empty club list faults instead of claiming you joined none" — is THIS
page's zero-rows fault end to end: it removes the member's memberships and
asserts the fault text and the `rows=0` detail line, the same claim F-1's unit
test pins. Its header says "This is about faults, not about the homepage", but
no area has audited it: the stamp is `cs-unmet`, and it carries a "It used to
select `button.primary`" story and a "There is no `key=` in it any more"
clause, both archaeology.

Options:

1. **Add it to the roster** — stamp it `cs-audited-homepage`, audit it here
   (the two archaeology comments, the header's claim about what it is about),
   and it joins the four.
2. **Leave it as evidence** — it is the faults host's e2e by its own account,
   and its audit is `common-hosts`' to reopen.

Recommend 1: `common-hosts` closed without it, so option 2 leaves it unmet
with no area coming; and the test it holds is this page's behavior.

**Worked 2026-09-13**, option 1 (Joel: "1"). Stamped `cs-audited-homepage`,
staged, and read; what the read found is F-17 to F-19.

### F-homepage-17 · `stale-claim` · the helper's docstring describes a × the fault modal does not have — DONE

`closeButton`'s docstring: "not the panel's `×`, which carries the same
accessible name, so a role query matches both. `.primary` is the shared global
button class". A fault modal is a `BlockingModal`, which is a card, and a card
draws no × — its own prop comment says "the fault's Close is the only exit it
has". And `.primary` is a CSS-module class now, not a global one. The header
below had its own rotted count: "the two tokens it paints with" — the
stylesheet uses four, and the count was never the point; that they are the
theme's, loaded at boot, is.

**Worked 2026-09-13.** The docstring says what the handle IS — the Close
button by role and accessible name, which `StandardButton` guarantees where a
class name is hashed — and the header says the tokens are the theme's, loaded
at boot rather than in a game's lazy chunk.

### F-homepage-18 · `archaeology` · three stories, and a header that disowns half the file — DONE

- The `//` comment stacked under the helper's docstring: "It used to select
  `button.primary` — a global class that stopped existing when …".
- The header: "This is about faults, not about the homepage; the homepage is
  only where we happen to hit one" — true of the first test and not the
  second, which is the homepage's own fault; and "A shell page has twice been
  caught missing a stylesheet" — the incident, where the standing fact is the
  sentence after it.
- The second test: "There is no `key=` in it any more: a fault carries an
  envelope's fields now".

**Worked 2026-09-13.** The stacked comment is gone (its one standing sentence
folded into the docstring); the header says which test is about what; the
"twice been caught" clause is cut; "any more … now" is cut and the sentence
says what a fault carries.

### F-homepage-19 · `assertion-pinned-to-history` · the test asserts a sentence the app no longer has is absent — OPEN

The second test's last lines: a comment telling the story of the sentence the
no-rows line replaced — "You haven't joined a club yet." — and then
`expect(page.getByText("You haven't joined a club yet.")).toHaveCount(0)`.
That string appears nowhere in `src/` or `e2e/` outside this assertion, so it
can only fail if someone types that exact sentence back in; the standing claim
— behind the modal, the page's own line says what is true — is the assertion
above it, on "No clubs found for your account."

Options:

1. **Cut the story and the absence assertion**, keeping the positive one; the
   comment says the line states a fact about the database, not the person.
2. **Cut the story only**, keeping the absence assertion as a tripwire.

Recommend 1: F-8 is the same family — an assertion that cannot fail is not
pinning anything — and the sentence it guards against is the story. Either
option changes the e2e file; option 1 changes its code, so it gets a run first,
on Joel's word.

**Worked 2026-09-13**, option 1 (Joel: "do the first"). The story and the
absence assertion are gone; the comment says the line states a fact about the
database, not the person. Lint clean; the e2e not yet run — asked.

## Notes

- ~~**The greeting swaps text when the profile lands** — "Welcome!" becomes
  "● joel — welcome!". One line either way, the disc is `0.7em` inside the
  h1's line box, so nothing below moves. Not a reflow finding.~~ Harvested
  into `doc.md`'s greeting paragraph at the re-read.
- **The zero-rows fault writes its own `call` line** (`'GET /rest/v1/clubs'`,
  `status: 200`) rather than getting one from `readRows`, because `readRows`
  answered ok. Consistent with "whoever detects a condition writes its words".
- **The e2e finds rows by `[class*="_row_"]`** — sniffing a CSS-module class
  name. It is scoped by the list's `aria-label`, and the comment says why. A
  `data-` handle would be `lists`' to add; left.
- ~~**Two stray blank lines** — `HomePage.tsx` 158–159 and 259.~~ Gone with
  F-5, the first finding to touch the file.
- **`+ New club` is not keyboard-reachable**, by design (ui.md says "the
  accepted cost"). The Design (F-3) should say it in the same words.

## Predicted test breaks

- F-1 adds `HomePage.test.tsx`; nothing existing breaks. (Confirmed: the
  whole suite, 316 files / 3125 tests, green with it.)
- F-3: `src/guards/folderDocs.test.ts` — the `common/home` row comes off
  `DESIGNS_OWED`.
- F-8 changes an e2e assertion — run on Joel's word only.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-13;
      ten findings, all worked)
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      (nothing is owed; the greeting note was harvested into the Design)
- [x] every file on the roster blessed, or its stamp says why not (2026-09-13,
      Joel: "mark files in this area as blessed")
