# Area: setup-form

The folders it reads: `setup-form`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-14.** Roster stamped `cs-audited-setup-form`,
25 files. Thirteen findings recorded: a prose group (F-1 to F-7) and a decision
group (F-8 to F-13). F-8 is F-club-page-11 (`solo-prefix-in-fe`)'s remaining
half, carried in on Joel's word.

**Worked so far: F-8, F-9, F-10, F-11** — all decision findings, taken one at a
time. The prose group is untouched; F-9 and F-11 each left it one sentence
lighter (see their records).

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

### The prose group — fork-free

### F-setup-form-1 · `intro-owed` · `setup-form/doc.md` is a lede on `INTROS_OWED`

The lede is one sentence and says what the folder holds. The intro, from what
the files already argue: starting a game is two phases, and this folder is the
first — a dialog that collects the choices, then hands `create_game` a setup
blob and a separate player list. The dialog is one `<StandardForm>` inside a
`<NormalModal>`; a game supplies a lazy body, its defaults, an optional
cross-field check and an optional intro sentence through `manifest.setupForm`,
and the modal supplies the players picker's seeding, the Help button, the
Cancel/Start row and where a refusal lands (under the field the server named,
or the form's own line). Every setting is a collapsible section whose summary
shows the current value, so the dialog reads at a glance and opens only to
change. The same choices are read back later: `setupRows` is the recap the
info column and the printed board both draw, and `SetupDisclosure` is the
in-game wrapper for it. `ClubPage` mounts the dialog, from a start row's press
or a `?new=` arrival.

Details: the seeding order (manifest defaults under the club's saved default,
players from the roster); the one seam (players split off the setup, and why a
game's `Setup` type is `Omit<Values, 'player_user_ids'>`); why a section is a
`<details>` and why `defaultOpen` is a default rather than a controlled value;
Players open by default and its summary being dots; the timer's text-vs-value
split (the box can hold text the setup never sees); the puzzle section's two
three-state values; the recap rule and the board-identity exception (pointer to
`docs/pdf.md` → Setup rows, which owns it). Then the row comes off
`INTROS_OWED`.

### F-setup-form-2 · `marker-pass` · six Props blocks put `/**` on their members

A prop note is `//`. `SetupGameModal.tsx` (seven props), `SetupSection.tsx`
(the inline props type: `label`, `help`, `defaultOpen`), `PlayersSection.tsx`
(six), `SetupCoopStyleSection.tsx` (six), `SetupTimerSection.tsx` (two),
`SetupNextPuzzleSection.tsx` (seven). `setupForm.ts`'s `SetupBodyProps` and
`GameSetupForm` already have it right and are the model. Also
`SetupTimerSection.tsx`'s one docstring over two consts
(`MIN_COUNTDOWN_SECONDS`, `MAX_COUNTDOWN_SECONDS`) documents the first and
leaves the second bare.

### F-setup-form-3 · `archaeology` · the folder narrates how it used to work, in sixteen places

- `SetupGameModal.tsx`: the intro's JSX comment ("It used to live inside each
  game's SetupForm, which meant it rendered BELOW the player picker … It is
  manifest copy now").
- `PlayersSection.tsx`: "**In the form, not around it.** It sat in
  `<SetupGameModal>` while the setup bodies were handed a `setup` object the
  picker was not part of. Now the form holds one values object" — the standing
  fact is one sentence.
- `SetupSection.tsx`, `defaultOpen`: "(2026-08-25) … which an e2e spec caught
  by timing out on an invisible input."
- `SetupSection.module.css`: "Until the fields became components each brought
  its own margins, and when they stopped, 'Required words' sat flush on …";
  and `.help`'s "It carried its own until 2026-08-26, back when it was a
  hand-written <p>".
- `SetupTimerSection.module.css`: the whole `.timerRow` paragraph — a rule
  that no longer exists, measured before it was deleted.
- `SetupTimerSection.tsx`: "which is why this was the app's last hand-written
  radio group — and why it needn't have been."
- `SetupTimerSection.test.tsx`: "This used to be a loose `<p className=
  "error">` outside the errors object entirely"; and "every setup field is,
  since F35" — a finding id from a deleted audit, in a durable file.
- `SetupCoopStyleSection.tsx`: "'free-for-all' (the default) is the historical
  behavior".
- `SetupNextPuzzleSection.tsx`: "Collapsing them to one `null` made 'we
  haven't asked yet' indistinguishable from … which read as an error for the
  instant between typing a date and the answer coming back" — the reason
  survives as "`undefined` is LOOKING, `null` is nothing"; the story goes.
- `fieldNames.ts`: "So the composed names are gone, and both of them were
  parts rather than settings" — a paragraph about names that no longer appear.
- `SetupGameModal.test.tsx`: "Before this the frontend's half always went to
  the bottom line".
- `e2e/puzzle-pickers.e2e.ts`: "after the 2026-08-13 rework"; "It was a
  `<fieldset>` until 2026-08-25, when every setup field became a
  `<SetupSection>`"; "Leaving a source used to be a side effect of pressing a
  different tab"; and "(It did, while this was being written.)" — which was
  twice until F-11 rewrote `nextUpLine`'s docstring and took one with it.

Each keeps its standing fact and loses the story.

### F-setup-form-4 · `stale-claims` · sentences in the folder describe something that is not there

- `SetupGameModal.tsx`, the `manifest` prop: "Non-null while the dialog should
  be open — the parent unmounts us by passing `null`" — the prop is typed
  `GameManifest`, and the parent stops rendering the component.
- `SetupGameModal.tsx`, `savedDefault`: "Sourced by the parent (ClubPage)
  alongside the allowed-gametypes query so the dialog opens instantly without
  an extra round-trip" — it arrives in `get_club_page`'s one answer.
- `SetupGameModal.tsx`, the docstring: "the resulting game lands in the club's
  paused-games list" — it lands in "Your games", flying its flag.
- ~~`SetupTimerSection.tsx`, the `errors` prop and the RadioRow comment~~ —
  **resolved by F-9, which made them true rather than rewriting them.** The
  raises name `timer` now; both sentences say so, and say it is a fault. The
  component docstring's "server-side validation rejects with a clear message"
  was the same claim in the wrong vocabulary and went with them.
- `SetupTimerSection.tsx`, the docstring: "NOTE: the component is *just the
  timer fieldset*. Per-game setup forms wrap it in their own `<div>`" — it is
  a `<SetupSection>`, and wordle renders it bare beside its siblings.
- `SetupTimerSection.tsx`, `parseMmSs`: "Exported as a private helper of this
  component" — it is not exported.
- `SetupCoopStyleSection.tsx`, the `players` prop: "The SELECTED players
  (SetupBodyProps.players)" — no such prop; the body reads
  `values.player_user_ids`.
- `SetupCoopStyleSection.tsx`, the docstring: "Dropped into all six turn-order
  games' SetupForms (psychicnum, wordle, connections, waffle, wordiply,
  scrabble-coop)" — nine render it (letterboxed, setgame and strands too). A
  census in a docstring; say "every coop game that offers turns".
- `SetupSection.module.css`: "a bordered box (matching the setup form's
  `.fieldset` chrome)" and "the rest matches `.fieldset`'s inner padding" — no
  `.fieldset` class exists in `src/common`.
- `SetupSection.module.css`, `.help`: "The three in the app all head a pair" —
  five forms pass a section `help`. A census; the rule ("a group, not one
  field") is the standing fact.
- `SetupNextPuzzleSection.module.css`: "in place of a date picker" (the date
  box IS there, as the override), "the only concrete fact in the fieldset",
  "the fieldsets below it (the timer, and strands' three knobs)" — sections.
- `setupForm.ts`: "It stays in `lib/gameManifest.ts`" — it is
  `manifest/gameManifest.ts`.
- `setupRows.ts`: "carries the reason for the one game exempted from it" —
  "the one" rots; the guard carries each exemption's reason.
- `SetupDisclosure.test.tsx`: "so sixteen info columns don't each re-author" —
  a count.
- `e2e/coop-setup.e2e.ts`: "(coop is the first WordNerd button)" — a row;
  "identical across the six turn-order games" — nine.

### F-setup-form-5 · `comments-restate-docs` · two module headers carry a doc section in full

- `setupRows.ts`'s header is `docs/pdf.md` → Setup rows nearly verbatim: the
  rule, the mode exception, the board-identity exception with its two
  reasons. The doc is listed as owning it. Local: what a `SetupRow` is, the two
  pseudo-keys, and a pointer.
- `SetupCoopStyleSection.tsx`'s `CoopStyle` and `CoopTurnSetup` docstrings
  carry `docs/code-conventions.md` → Reserved coop-turn setup keys (what
  round-trips and what `create_game` strips). Local: the two values, and that
  the pair is declared once here for every opting-in game.

### F-setup-form-6 · `copy-for-text` · "copy" used for a message's words, six times

`SetupGameModal.tsx` ("manifest copy"), `setupForm.ts` (`brand`: "a setup
form's own copy"), `SetupNextPuzzleSection.tsx` (`brand`: "for the exhausted
copy"), `SetupTimerSection.tsx` and its test ("the form's copy is about
whatever was last submitted" — here it means the form's ENTRY, which is the
better word anyway), `e2e/puzzle-pickers.e2e.ts` ("the not-found copy names
the date").

### F-setup-form-7 · `tidy` · three things the eye trips on

- `e2e/coop-setup.e2e.ts` ends its one test with `page.screenshot({ path:
  '/private/tmp/claude-501/…/d9659abe-…/scratchpad/coop-setup-turns.png' })` —
  a debugging artifact aimed at a session scratchpad that no longer exists,
  committed. Delete the call.
- `SetupCoopStyleSection.test.tsx` is the folder's one test file without the
  file docstring the other six carry.
- `SetupNextPuzzleSection.test.tsx` imports `fireEvent` on its own line right
  after importing from the same module.

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

### F-setup-form-12 · `players-section-count-twice` · the player-count check is written in two places

`PlayersSection` computes `countComplaint` from `numberOfPlayers` and draws
it; `SetupGameModal` computes `countOk` from the same bounds to gate Start.
Two readings of one rule, one file apart, and the modal's test covers the
gate while the section's covers the words. They agree today. Options:

1. **Leave it** — the modal must gate Start with or without a picker on
   screen (a solo club draws none), so both readings are real; record why.
2. **Have `manifest.setupForm.validate` carry it**: the modal already merges
   `validate`'s errors into the gate and into `errors.player_user_ids`, so a
   shared `playerCountErrors(players.size, numberOfPlayers)` called from the
   modal and passed down would make the section a renderer only.

Recommend 1, with the sentence in the section's docstring: it counts because
it is the one drawing the message, and the modal counts because the section
may not be there.

### F-setup-form-13 · `coop-style-reseed-effect` · the first-player seed is an effect that calls up

`SetupCoopStyleSection` re-seeds `first_turn_user_id` from an effect that
calls the parent's `onChange`. The comment argues it is not
setState-in-effect because the setter is the parent's; it is the same loop in
a different coat — a child computing a value for its parent after render —
and `GameSetupForm.validate`'s own docstring names that loop as what the rule
exists to prevent. It works because the parent's `set` is stable and the
condition converges in one pass. Options:

1. **Leave it**, and say plainly in the comment that it is a render-then-write
   and why it converges.
2. **Seed in the handlers**: when turns is chosen, `onChange({ coopStyle:
   'turns', firstTurnUserId: players[0].user_id })`; when a player is
   unchecked, the players picker's `onChange` in each game's form has no view
   of this — so the modal would need to do it, which is where option 2 gets
   expensive.
3. **Derive at read time**: treat a `first_turn_user_id` that is not among the
   selected players as "first selected" when rendering AND when submitting
   (the modal's seam), never writing it back. No effect; one more rule at the
   seam.

Recommend 1. The e2e and the unit tests both pin the seed, and the
alternatives move a small rule to a bigger place.

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

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
