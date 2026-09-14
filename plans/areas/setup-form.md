# Area: setup-form

The folders it reads: `setup-form`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-14, blessed** (Joel: *"bless all the files and close
the area. then commit."*). Roster stamped `cs-blessed-setup-form`, 26 files —
the 25 audited at the opening plus the stylesheet F-10 created. Thirteen findings recorded: a prose group (F-1 to F-7) and a decision
group (F-8 to F-13). F-8 is F-club-page-11 (`solo-prefix-in-fe`)'s remaining
half, carried in on Joel's word.

**All thirteen findings are worked** — the decision group (F-8 to F-13) one at
a time, then the prose group (F-1 to F-7) in one pass, 2026-09-14. The folder
is off `INTROS_OWED`.

**The closing re-read is done (2026-09-14): seven more, F-14 to F-20, all
worked.** The `doc.md` is harvested and `todo.md`
holds what is still owed.

## The roster

Agreed 2026-09-14 (Joel: "1. yes" to the two e2es, "2. yes" to the games'
forms staying with their games, and "include that in this area" for
F-club-page-11's `SetupGameModal` half).

The folder:

- `SetupGameModal.tsx` + `.module.css` + `.test.tsx` — the dialog
- `setupForm.ts` — the contract a game's setup body fills in
- `setupRows.ts` — the recap rows the info column and the PDF share
- `fieldNames.ts` — a test helper: which settings a form offers
- `difficulty.ts` — the dictionary bands and their sample words
- `SetupSection.tsx` + `.module.css` + `.test.tsx` — a collapsible setting
- `PlayersSection.tsx` + `.module.css` + `.test.tsx`
- `SetupCoopStyleSection.tsx` + `.test.tsx`
- `SetupTimerSection.tsx` + `.module.css` + `.test.tsx`
- `SetupNextPuzzleSection.tsx` + `.module.css` + `.test.tsx`
- `SetupDisclosure.tsx` + `.module.css` + `.test.tsx` — the in-game "Setup
  options" recap (the stylesheet was created by F-10 and joins the roster)
- `doc.md` (a lede, on `INTROS_OWED`) and `todo.md` (one Soon item: five
  games' `font-family: monospace` on their letters preview, to be decided
  once)

The e2es, found by test title:

- `e2e/coop-setup.e2e.ts` — "coop setup — pacing field", one test
- `e2e/puzzle-pickers.e2e.ts` — "puzzle pickers", five tests

**Evidence, not roster:** every game's `components/SetupForm.tsx` + test,
`lib/setup.ts` and `lib/setupSummary.ts` (sixteen games fill the contract;
crosswords has no `setupSummary.ts`, which `guards/setupRows.test.ts`
records); `ClubPage` + `useSetupDialog` (mount it); `gameManifest.ts`
(`GameManifest.setupForm`, `startGameInClub`, `CreatedGame`, `TimerMode`);
`statusLabel.ts`; `pdf/frame.ts` (`drawSetup`) and `pdf/turnLog.ts`;
`DictBandField` (renders `difficulty.ts`); `NormalModal`, `StandardForm`,
`FailureLine`, `RadioRow`, `SelectField`, `DateField`, `PlayersField`,
`Field` (`data-field`); `common.require_valid_timer`; connections' and
strands' `next_puzzle_for_club` / `puzzle_for_date`; `PlayArea.module.css`
(which `SetupDisclosure` wore until F-10). `src/guards/setupRows.test.ts`
is a guard and on no roster.

Docs that describe it: `docs/code-conventions.md` → Reserved coop-turn setup
keys; `docs/features.md` → Player-tunable difficulty; `docs/naming.md` → start
(startSetup vs startGame); `docs/pdf.md` → Setup rows; `docs/ui.md` → the
setup-dialog paragraph under the button taxonomy (the Help button, the
`<SetupSection>` disclosures).

Baseline at the opening: the folder's seven test files pass; `tsc -b` and
eslint clean. No e2e is run without Joel's word.

## Findings

### The prose group — WORKED 2026-09-14, in one pass

Re-swept fresh rather than worked from the recorded list
([[reference_area_file_line_numbers_rot]] — the decision group had already
moved several of these, and re-reading turned up three the audit had missed).
What each finding came to:

### F-setup-form-1 · `intro-owed` · WORKED — `doc.md` has an intro, and the folder is off `INTROS_OWED`

Four paragraphs: starting a game is two phases and this is the first; the
dialog is a `<StandardForm>` in a `<NormalModal>` where a game supplies only a
body, defaults, a check and a sentence; every setting is a `<SetupSection>`
whose summary carries its value; and the choices are read back later by
`setupRows` and `<SetupDisclosure>`.

`## Details` took the eight things that are arguments rather than narrative:
the one destructure at the seam, the seeding order, where a refusal lands,
`defaultOpen` being a default, the players picker's two peculiarities, the
timer's text-vs-value split (pointing at the new envelopes section F-9 wrote),
the puzzle section's three-state values, and a pointer to `docs/pdf.md` for
what earns a recap row.

Verified by planting: renaming the heading to `## Intro` fails
`folderDocs.test.ts` naming this folder, so the guard is watching it.

### F-setup-form-2 · `marker-pass` · WORKED — every prop note is `//`

`SetupGameModal`, `PlayersSection`, `SetupCoopStyleSection`, `SetupTimerSection`,
`SetupNextPuzzleSection`, and `SetupSection`'s inline props type.
`SetupTimerSection`'s one docstring over two consts became a `//` comment
covering both, which is what it always described.

### F-setup-form-3 · `archaeology` · WORKED — every site, and the standing fact kept

`SetupGameModal`'s intro comment now says the sentence is the manifest's and
that is why the modal places it, rather than telling where it used to live.
`PlayersSection`'s "In the form, not around it" keeps the fact and drops the
before. `SetupSection`'s `defaultOpen` keeps "it can go false again and must
not slam shut" and loses the date and the e2e story; its stylesheet keeps the
three-step spacing argument and loses "until the fields became components".
`SetupTimerSection.module.css` loses the whole `.timerRow` paragraph — a rule
that is not there. `SetupTimerSection` loses "the app's last hand-written radio
group". `SetupCoopStyleSection` loses "the historical behavior".
`SetupNextPuzzleSection` keeps "`undefined` is LOOKING, `null` is nothing" and
loses the story. `fieldNames.ts` loses the paragraph about names that no longer
appear and keeps the rule that produced it. The three test files lose "since
F35", "this used to be a loose `<p className="error">`" and "before this the
frontend's half…", each rewritten to say what the assertion is FOR. Both e2es
lose their rework dates, the `<fieldset>` history, the tabs the pickers
replaced, and both "(It did, while this was being written.)".

### F-setup-form-4 · `stale-claims` · WORKED — and three more found in the re-sweep

The recorded list, less the three the decision group had already resolved
(F-9 made the timer sentences true; F-10 and F-11 took their own). Plus three
the audit had not caught:

- `SetupNextPuzzleSection`'s "a caller that has not converted yet leaves this
  line as the only word" — there is no unconverted caller: connections raises
  PN302 and strands PN416, both validations naming `puzzle_id`.
- `SetupNextPuzzleSection.module.css` said the line has THREE states; the code
  has four, and the fourth ("nothing on that date") is the one the min-height
  argument most needs.
- `e2e/coop-setup.e2e.ts` called a start-list row a "button", which
  `clubPage.ts`'s own docstring says it is not. It now says what is actually
  load-bearing: `startGameRow` takes the FIRST match, and the registry lists
  each sibling pair coop-first.

Also gone: `.fieldset` named twice in `SetupSection.module.css` for a class no
stylesheet defines; "the three in the app all head a pair"; "Exported as a
private helper" on a function that is not exported; "bananagrams's … is the
first"; "the one game exempted"; `lib/gameManifest.ts` for
`manifest/gameManifest.ts`; and a garbled sentence in `SetupGameModal`'s
Suspense-fallback comment that had lost its verb.

### F-setup-form-5 · `comments-restate-docs` · WORKED — both headers point instead

`setupRows.ts`'s header was `docs/pdf.md` → Setup rows nearly verbatim, rule
and both exceptions. It now says what the file IS — one array per game, shared
by the info column and the PDF — names what this file owns, and links the doc
for the rules. `SetupCoopStyleSection`'s `CoopTurnSetup` links
`docs/code-conventions.md` → Reserved coop-turn setup keys instead of restating
which key round-trips; its `errors` prop note dropped the same sentence a third
time.

### F-setup-form-6 · `copy-for-text` · WORKED — all six

Four were the banned sense and are now "sentence" / "message" / "sentences".
Two meant a DUPLICATE (`SetupTimerSection` and its test, on the form's stored
error) and read ambiguously beside the ban, so they say "the form's stored one"
and "the form's stored message".

### F-setup-form-7 · `tidy` · WORKED — all three

The committed `page.screenshot` to a dead session scratchpad is deleted from
`coop-setup.e2e.ts`. `SetupCoopStyleSection.test.tsx` has the file docstring
the other test files carry — self-gating first, then the seeded default and the
re-seed on unchecking, then both keys traveling together.
`SetupNextPuzzleSection.test.tsx`'s two imports from `@testing-library/react`
are one.

### The decision group — each waits for Joel

### F-setup-form-8 · `solo-prefix-in-fe` · WORKED 2026-09-14 — option 1, with "AI" for "AI Compete"

Carried from F-club-page-11, and the last FE site to test the handle. Was:

```ts
const modeSuffix = clubHandle.startsWith('=')
  ? ''
  : ` · ${MODE_LABEL[manifest.mode]}`
```

Two things wrong with it. The prefix test is the FE reading a convention
`common.clubs.is_solo` already carries, and the comment beside it said solo
clubs "register a single variant per game, so there's no ambiguity to
resolve" — they do not. `scrabble_compete` seeds `min_players 1` so a lone
player can race the AI, so a solo club is enrolled in BOTH scrabble variants
and both dialogs read "Start RackAttack" with nothing between them.

`SetupGameModal` takes a `soloClub` prop now and applies `<ModeBadge>`'s rule:
no tail in a solo club, except a compete variant whose manifest sets
`aiOpponent`. `ClubPage` passes `club.is_solo`, which it already holds.

**The words are "· AI", not the badge's "AI Compete".** Joel: *"we can't have
the button says 'Start Scrabble - AI Compete'; there wouldn't be room."* The
tail is drawn after the game's name on the Start button as well as in the
title, and that button also holds Cancel beside it. So the dialog and the club
row deliberately say the same thing at different lengths.

`SetupGameModal.test.tsx`'s `draw` grew a third argument, and a
`— the mode tail` describe covers the three branches. Each was verified by
planting: inverting the solo test fails all three, lengthening the tail fails
the AI one.

### F-setup-form-9 · `timer-refusal-names-no-field` · WORKED 2026-09-14 — the raises name `timer`, and stay faults

`common.require_valid_timer` raised PN035-PN039 with `hint = 'fault'` and
`column = '_'`, while `SetupTimerSection` read `errors.timer` "for the raise
that names it" — a raise that could not happen.

The severity was never in question. Joel: *"of course it's a fault... a bug is
a bug. we'd never change a bug to a form-validation."* Nothing the timer
control can do reaches those raises: the kind comes from three radios, and an
unparseable MM:SS never reaches the setup, so the box keeps the last valid
seconds and complains in place over the same 1..3600 range. Arriving means a
bug, a hand-built request, or a corrupt saved default, and the `BUG:` messages
are right.

**What changed is the column: `'_'` → `'timer'` on all five.** `field` and
`severity` answer different questions — one says what kind of failure this is,
the other what the sentence is about — and a fault about one control is still
about that control.

Measured before deciding, since the option existed only if the frontend would
honor it: a probe stubbing `severity: 'fault'` **with** `field: 'guesses'` put
the words under that field and left the form line empty. No opt-in anywhere —
`SetupGameModal` files with `result.field ?? FORM_ERROR_KEYNAME` and never
consults severity. So the dialog shows the fault modal, and dismissing it
leaves the same words under the timer.

Sites: the five raises and the helper's header comment in `supabase/sql/common.sql`
(behavior, so in place); twelve `"field":"_"` assertions across the
codenamesduet / connections / psychicnum / bananagrams `create_game` tests
(`helpers_test.sql` uses `throws_ok`, which cannot see a column, so it is
unchanged). Verified by planting: PN035 back to `'_'` fails four pgTAP files.

Prose that this made TRUE rather than needing a fix: `SetupTimerSection`'s
`errors` prop and its RadioRow comment, both on F-4's list. They say it is a
fault now as well as that it names the field. The component docstring's
"server-side validation rejects with a clear message" was the same claim in the
wrong vocabulary and is rewritten.

Vocabulary that outgrew the area, since `field` had been described as a
validation-only channel everywhere: `docs/envelopes.md` gains **"A fault can
still name a field"** (and its `field` row in The keys points at it),
`common.sql`'s COLUMN legend says the channel is not validation-only, and
`envelope.ts`'s comment on `field` says any severity may name one.

### F-setup-form-10 · `disclosure-wears-game-page-css` · WORKED 2026-09-14 — the rules move here and the class is renamed

`SetupDisclosure` had no stylesheet. Its one class came from
`game-page/PlayArea.module.css` as `.infoSetup`, three rules about 300 lines
into a file about the play surface.

**The finding as first recorded got the shape wrong**, and the recount is the
useful part. It said `.infoSetup` was one of four info-column readout kinds
that belonged together, so pulling it out would break a family. Counting the
readers killed that:

| class | readers |
|---|---|
| `.infoActions` | 17 — every game's `InfoCol`, plus both terminal rows |
| `.infoHelp` | 11 games' `InfoCol` |
| `.infoState` | 11 — ten games plus `TurnStatusLine` |
| `.infoSetup` | **1 — `SetupDisclosure`** |

The other three are shared because a game's own InfoCol applies them to its own
markup. Nothing applied `.infoSetup` but this component. It was grouped with
them for being drawn in the same column, which is not the same thing, and the
stylesheet's header calling them "the four info-column READOUT kinds" is what
made the grouping look like a fact.

Joel: *"if the setup-form needs css for the setup-form, it should be in
setup-form, right? if it's in PlayArea instead, it should move to here and lose
the .infoSetup name."*

So: a new `SetupDisclosure.module.css` holds the three rules as `.disclosure`
(matching `SetupSection`'s `.section` — a component's root class named for the
component), and they are gone from `PlayArea.module.css`. Nothing else changes
— no other reader existed. The `/* @@ */` markers travel with the rules, since
they are unreviewed either way.

Sites that named the class: `docs/playarea.md` (the "four recurring kinds"
sentence, the canonical-order line, the table row, and the "Shared in" list —
all now say the recap is a COMPONENT, not a class), `docs/games/waffle.md`,
`docs/games/codenamesduet.md`, and the `info-sheet/todo.md` line filed earlier
this session. `PlayArea.module.css`'s own header and its readout section say
three kinds and say why the recap is not one of them.

`vocabularies.test.ts` needed the pending-literal rows to travel too — `0.3rem`
(spacer) and `0.85rem` (font-size) moved from `PlayArea.module.css`'s rows to
the new file's. The guard failing on the new file before that edit is the
proof it is watching it.

**What this does NOT settle**: the three genuinely-shared classes, whose home
is still `game-page` while `docs/common-folders.md` gives `info-sheet` "the
chrome its panels share". That question is filed in `terminal`, `info-sheet`
and `word-entry` (Joel, 2026-09-14), each with its own version of it.

### F-setup-form-11 · `class-sniffing-e2e` · WORKED 2026-09-14 — option 1: our half gets a handle, the library's half is filed

`nextUpLine` was `puzzleSection(page).locator('p[class*="next"]').first()` — a
substring match against the hashed build of `styles.next` in
`SetupNextPuzzleSection.module.css`, standing under about ten assertions.
Renaming that class would have turned every one of them into "element not
found" rather than a wrong message, which is the failure mode the helper's own
docstring says it exists to avoid.

The line takes `data-testid="next-puzzle"` and the helper takes
`getByTestId('next-puzzle')`, following F-club-page-17's precedent (`list-row`,
`heading-controls`, `mobile-filters`). The trailing `.first()` goes:
`puzzleSection` already narrows to one `<details>`, and there is one such line
in it. The docstring keeps the reason the locator is by element rather than by
text shape and loses the archaeology in its last sentence (F-3's class).

**The other locator stays**, and is a different problem: the crosswords cancel
test scopes the NYT picker with `.react-draggable, [class*="rnd"]`, which are
`react-rnd`'s class names, not ours. Nothing here can keep those true, and what
a `<FloatingPanel>` should offer a test instead — most likely a test id off its
title, which would serve every "which panel" locator — is that folder's call.
Filed in `floating-panels/todo.md`.

**Not run.** The e2e is edited and unverified; `tsc -b`, eslint and the unit
suites are clean. Same standing as F-club-page-17's four.

### F-setup-form-12 · `players-section-count-twice` · WORKED 2026-09-14 — option 1: both readings are real, and both now say so

`PlayersSection` computes `countComplaint` from `numberOfPlayers` and draws it;
`SetupGameModal` computes `countOk` from the same bounds and gates Start on it.
Two expressions, one rule, one file apart, each with its own test.

**The duplication is load-bearing.** `PlayersSection` opens with
`if (members.length <= 1) return null` — a solo club has nothing to pick, and a
picker with one locked row is worse than none — so in a solo club there is no
section, and the modal is the only thing counting. The gate has to survive the
message's absence.

The silent-disable that implies (Start off in a solo club with nothing on screen
saying why) is not reachable: it needs a solo club enrolled in a gametype with
`min_players > 1`, and `common.gametypes.min_players` is exactly what decides
enrollment.

**What was actually wrong was a sentence.** `countComplaint`'s comment read
"the count complaint, which is also what keeps Start disabled" — asserting the
sharing that does not exist. It draws the words and gates nothing. Both sites
now name the other: the section says it is the WORDS and why the modal counts
again, the modal says it is the GATE and why it does not wait for the section.

Option 2 (one `playerCountError(size, bounds)` called from both) was declined:
the two uses answer different questions — what to say, and whether to allow —
the bounds come from one manifest value so they cannot drift apart silently,
and its real payoff was the case the server already prevents.

### F-setup-form-13 · `coop-style-reseed-effect` · WORKED 2026-09-14 — option 1: the effect stays, the comment stops arguing

`SetupCoopStyleSection` seeds `first_turn_user_id` to `players[0]` from an
effect that calls the parent's `onChange`, whenever turns is on and the current
pick is not among the selected players.

The defense beside it was wrong: *"Parent-owned onChange, so this is not a
setState-in-effect."* It is a render-then-write either way — a child computing
a value for its parent after render — and whose setter gets called does not
change what the rule is about. `GameSetupForm.validate`'s docstring names the
same loop as the thing the rule exists to prevent.

It is nonetheless safe, and the comment now says why instead of why-it-isn't:
the write makes `stillSelected` true, so the next pass takes the early return
and every pass after it does nothing.

**Found while verifying, and recorded rather than fixed: the dep array never
stabilizes.** All nine callers build the prop inline
(`members.filter((m) => s.player_user_ids.has(m.user_id))`) and pass an inline
`onChange`, so both identities are new every render and the effect runs every
render. It no-ops, so nothing is broken and no test moves — but the deps read
as a gate and are not one. The comment says so, and names memoizing in the nine
forms as the change that would alter it. Not done: it touches nine game files
for no behavior, and those games have their own areas coming.

The docstring's "mirrors codenamesduet's SetupForm" was re-checked and holds —
`seedFirstClueGiver` there is the same shape — so it stays, without the lint
argument.

Options 2 (seed in the handlers) and 3 (derive at read time) were declined for
the same reason: the re-seed is triggered by unchecking a player, which happens
in `<PlayersSection>` inside each game's form, so both push the rule out of the
component that understands it and into `SetupGameModal`'s seam — which today
knows only "split `player_user_ids` off, the rest is setup" and does not know
the coop keys exist. Pinned meanwhile by two unit tests and the `coop-setup`
e2e.

### The closing re-read — F-14 to F-20, 2026-09-14

The whole roster read in one sitting, then one grep per worked finding over
every roster file and the docs that name them. Five of the seven are the
area's own findings recurring next door, three of them in prose the day's
fixes wrote.

### F-setup-form-14 · `modal-draws-the-picker` · WORKED — the body draws it, and four places said otherwise

Every game's form opens with `<PlayersSection>`; the modal renders no picker.
`doc.md`'s intro listed "the players picker" among what the modal supplies;
`setupForm.ts`'s `intro` note said "`<SetupGameModal>` draws the player picker
and then the game's form" as the reason the intro is on the manifest;
`coop-setup.e2e.ts` said "the dialog's player picker"; and `docs/common.md`'s
turn-order section said a `SetupBodyProps.players` field carries the checked
subset down — no such prop exists (each form filters `members` by
`player_user_ids`), and it placed `SetupCoopStyleSection` in
`components/fields/`. All four now say what happens. The intro's reason still
holds — an intro inside the body lands under the picker the body opens with —
and is now stated that way.

### F-setup-form-15 · `archaeology-again` · WORKED — five sites, three written by this area

`SetupDisclosure.module.css`'s header told where the rules "sat" (F-10 wrote
it the same day); `setupForm.ts`'s `setError` note carried a dated story
("(Joel, 2026-08-29)"); `SetupGameModal.test.tsx` said "an ordinary
`<StandardForm>` now", "the dialog became a form", and described an `ok`
without `result` as "what a game whose SQL has not been converted yet sends"
(the error sprint finished 2026-09-01); `puzzle-pickers.e2e.ts` said
connections and strands "lost their pickers" and scoped to "the Puzzle
fieldset" (a `<details>`). Each keeps its standing fact.

### F-setup-form-16 · `stale-claims-again` · WORKED — seven

- `SetupCoopStyleSection`'s docstring: "two labeled radio rows" — the second
  is a `<SelectField>`, as its own comment inside says.
- `SetupSection`'s docstring named two users of five; now names the condition
  (every shared section wraps itself in one).
- `SetupSection.module.css`'s spacing argument: "0.4rem inside a field …
  1rem between sections". Measured: `<Field>`'s gap is `--spacer-4` (0.5rem)
  and `<StandardForm>`'s is `--spacer-3` (0.75rem) — the same step as inside a
  section, which the blessed `StandardForm.module.css` says is on purpose. The
  three-step argument contradicted a blessed rule; it now says the form's step
  is shared and only a field's own stack is tighter.
- `setupRows.ts`'s `BOARD_KEY`: "see 'The board-identity exception' above" —
  F-5 moved that to `docs/pdf.md`; the pointer follows.
- `SetupTimerSection`: "an hour is plenty for any cooperative-puzzle gametype"
  — scrabble compete carries the timer too.
- `SetupNextPuzzleSection`'s test-id comment (F-11's) had lost its sense:
  "matches none of two of them".
- `coop-setup.e2e.ts`'s title claimed "Co-op section is first" and nothing in
  the test asserts an order; retitled to what it checks.

### F-setup-form-17 · `counts-again` · WORKED — three, two written by this area

"Memoizing in the nine forms" (F-13), "a dozen games apply each" (F-10), and
`setupRows.ts`'s "the rows every game shares" (coop pacing and the center
letters are not every game's). Each names the condition instead.

### F-setup-form-18 · `docstring-restates-doc` · WORKED — the modal's docstring, F-5's shape one file over

`SetupGameModal`'s docstring had a "Setup-value flow" paragraph that was
`doc.md` → Details' seeding bullet and the component's own seeding comment a
third time, and a "Lifecycle model" paragraph that was the `onCancel` prop note
again. Both gone; it keeps what a caller needs — what it is, who mounts it, the
two `<NormalModal>` choices, and the cancel-during-pending decision — and
points at `doc.md` for the seeding.

### F-setup-form-19 · `players-fault-names-no-field` · WORKED 2026-09-14 — option 1, the raise names `player_user_ids`

`common.sql`'s shared create path raises `PN059 'BUG: game with no players'`
with `hint = 'fault', column = '_'`, while `<PlayersSection>` reads
`errors.player_user_ids` — the same relationship F-9 found between
`require_valid_timer` and `errors.timer`. Every other `column = '_'` fault in
`common.sql` was checked and is about no field (a scratchpad owner, club
membership, the mode, a concede in coop). Not reachable from the dialog: the
gate keeps Start off below the floor, and a solo club's set is the lone member.

Joel: option 1. `column = 'player_user_ids'` on the one raise in
`supabase/sql/common.sql` (behavior, so in place). No test moved: the only
pgTAP site is `games_test.sql`'s `throws_ok`, which cannot see a column.
Verified directly — `create_game` called as a club member with an empty array,
`get stacked diagnostics` reads `PN059` / `player_user_ids`. The whole pgTAP
suite passes; one run of it failed nine tests and the three runs after it
passed unchanged, and the failing run's output was not captured.

### F-setup-form-20 · `docs-name-dead-paths` · WORKED — three game docs

`docs/games/strands.md` and `connections.md` named
`common/components/setup/SetupNextPuzzleSection`, `boggle.md` named
`common/lib/game/setupRows.ts`; neither folder exists since the reorg. The three
that name this area's files are fixed. **`common/components/` survives in
twenty-seven other doc sentences** about other folders' files — a sweep
for the docs, not this area's, and noted here so it is not mistaken for done.

## Notes

- **The tests are real.** Every test file pins behavior a caller depends on,
  and three of them (`SetupTimerSection`, `SetupNextPuzzleSection`,
  `SetupGameModal`) pin the routing of a server message to a field, which is
  the folder's most breakable promise.
- **`docs/pdf.md` → Setup rows names three games by BRAND** (freebee,
  MooseWheel, MothCubes) where prose says the codename. `pdf`'s doc, not this
  area's; noted for when it opens.
- **`vite.config.ts` has `css: false`** with the comment "tests assert on
  classes" — the opposite of what `SetupTimerSection.test.tsx` says the setting
  means. Root config, no area; noted.
- **`SetupNextPuzzleSection`'s `eslint-disable-next-line`** on `load` has its
  reason written beside it, and the reason holds. Not a finding.
- **`crosswords` has no `setupSummary.ts`** and the guard says why. Evidence
  only.

## Predicted test breaks

- F-2 to F-7: prose only.
- F-8 option 1 or 2: `SetupGameModal.test.tsx`'s `draw` passes a new prop;
  `ClubPage.test.tsx` mounts the real dialog and needs no change; e2e titles
  are not asserted on.
- F-9 option 2: `supabase/tests/common/*timer*` pgTAP, if any asserts the
  severity; run the whole suite.
- F-11: `puzzle-pickers.e2e.ts` changes a locator; run on Joel's word.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-14, F-14 to F-20)
- [x] the folder's `doc.md` intro written; its row off `INTROS_OWED` (F-1; the re-read added the count-twice and mode-tail details)
- [x] `todo.md` holds everything still owed (the mono-face decision; the seed effect's deps); no finding is open
- [x] every file on the roster blessed — all 26 read `cs-blessed-setup-form` (Joel, 2026-09-14)
