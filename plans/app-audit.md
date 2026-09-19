# App audit — the plan

**THE LIVE SPRINT, and the only one.** An app-wide walk through every area's
React, SQL and CSS together, locking down shared ideas to reduce difference and
code. This file is the plan and the process; it is **not** a record of what
shipped. Anything decided-built-done lives in `docs/` or the owning folder's
`doc.md`, and anything owed to a folder lives in that folder's `todo.md`. The
reasoning archive behind the CSS half is [css-philosophy.md](css-philosophy.md).

**Trimmed to this shape on 2026-09-05**, when the sprint restarted for the
second time (§4 → "The restarts"). Before that it held every decision the sprint
had made; those went to [docs/ui.md](../docs/ui.md),
[docs/code-conventions.md](../docs/code-conventions.md),
[docs/naming.md](../docs/naming.md), [docs/testing.md](../docs/testing.md) and
the folders' `todo.md` files in the same pass, and the plan keeps only what is
still open or still process.

## Where to start

**Every file was `cs-unmet`** on 2026-09-05, when the sprint restarted. The
three areas that had closed — `deep`, `utils`, `game-lib` — went from the table
below with their blessings; Joel: *"it's super-easy for me to rebless things
when we go into an area where i've already seen the files."*

**`utils` is closed** (2026-09-04): ten files `cs-blessed-utils`, eight
findings worked or closed, and a shared `shuffle` written where nine hand-rolled
Fisher–Yates loops had been — those nine callers are a line in seven games'
`todo.md`, to convert as each area opens.

**`icons` is closed** (2026-09-04): `icons.ts` is `cs-blessed-icons`, and all
eight findings are settled — six worked, two closed with no change. The
registry's comments lost their archaeology and their stale caller claims, four
names now say what the glyph MEANS (`IconEndGame`, `IconRevealSolution`,
`IconInfoSheetOpen` / `Close`), and the exports are grouped by what a glyph is
for instead of by when it was adopted. `docs/ui.md` stopped carrying a second
copy of the map and points at the registry. One thing found and left: a menu
row picks its glyph by hand, so every game names the same action's glyph twice
— a line in `src/common/menu/todo.md` for when that area opens.

**`web-storage` is closed** (2026-09-05): five files `cs-blessed-web-storage`,
six findings — five worked, one closed with no change. The shape every stored
key takes was written in a hook's param docstring and asserted in passing by a
comment, neither of which a new caller reads; it now lives in the wrapper all of
them go through, and the seven keys that disagreed were renamed. The
sticky-choice test dropped its hand-rolled fake for the shared one, which let it
cover the way storage actually fails in a blocking browser — the property access
throwing, which no test had touched, and which the old suite would have passed
against a wrapper that had lost it. Crosswords' rebus toggle turned out to be
that hook rewritten by hand, with its write in an effect that fired on mount;
converting it removed the write and settled that a boolean is a two-position
choice rather than a case for a second hook. One thing found and left,
`chatOpenStore.test.ts` as the last hand-rolled storage fake, went to
`src/common/chat/todo.md` and the `chat` area converted it.

**`outcomes` is closed** (2026-09-05): `outcomes.ts` is `cs-blessed-outcomes`,
and all nine findings are settled — six worked, two filed as work other folders
own, one closed by correcting a doc that stayed off the roster. The vocabulary
itself held up; what had drifted was every sentence about it. The file claiming
"no second spelling" had one — `good` / `bad` / `partial` for `won` / `lost` /
`near`, in six docstrings and two docs, all of which wrote the right string in
the code beside the wrong word. The palette had grown from four roles to seven
without the prose noticing, so the recipe for adding an outcome told a reader to
ship three missing cells. And one concept — how a finished game reads — was
retyped by hand in twelve places under three spellings; it is `TerminalOutcome`
now, `Extract`ed from the list so a rename breaks it instead of leaving it
behind, and the rule that a subset lives with its consumer is written in the
folder's `doc.md`. Two things found and handed on, both to `turn-log`:
`TurnOutcome` is a second name for `Outcome` with three words missing, and the
missing `warning` is why four games work around it to log a hint row. One thing
found and left for `pdf`: its printed ✓/✗ marks are still glossed `good` / `bad`.

**`mobile` is closed** (2026-09-05): fifteen files `cs-blessed-mobile`, and all
thirteen findings settled — twelve worked, one closed with no change. Three
device queries were written twice, once as a `@custom-media` name and once as a
string in the hook that mirrors it, with five prose warnings to keep them in sync
by hand and nothing checking it; each hook now exports its query and a spec
holds it to the stylesheet, which is also what made composing `--phone` from its
two arms safe — the arms had been declared and read by nothing, while the union
repeated their conditions longhand. The emitted CSS was diffed condition by
condition against the previous build to prove that change was source-level only.
Docstrings stopped telling their callers' stories: the coarse-pointer hook spent
six of nine lines on FloatingPanel's drag bug, and the phone hook's "use this
when" described one of its three callers. Three specs were written where the
folder had none, one of them for a property — `getSnapshot` must return the same
object — that reads as an optimization and is load-bearing. Two rules came out
of it and went where the rest of the app can inherit them: a hook returning a
boolean is named `useIsX` (so `usePhone` → `useIsPhone`, `useCoarsePointer` →
`useIsCoarsePointer`), and `window` is always there while a browser FEATURE may
not be, which is `docs/code-conventions.md` → Known gotchas. Handed on: six
`typeof window` guards in `floating-panels` that supply fallback values, and one
each in `faults` and `toasts` that install a dev helper.

**`routing` is closed** (2026-09-05): six files `cs-blessed-routing`, nine
findings worked, and the folder grew a third unit. The `/g/<gametype>/<gameId>`
shape was matched in two files and built in seven, and the two matchers disagreed
about what a game id may be — `App.tsx` matched it loosely on purpose while the
invitations hook required a uuid; `routes.ts` now holds both shapes as a builder
and a matcher side by side, so the code writing a link and the code recognizing
one read the same rule. `<Link>` lost a branch that could never run: a
non-primary button fires `auxclick`, not `click`, so the middle-click
fall-through was always the browser's doing and the check plus the test that
pinned it with a synthetic event are gone. Everything else was prose that had
stopped being true as the router moved twice — the folder index called it a hash
router when it is path-based, three docs carried a line count and a route count,
and `docs/common.md` put `<Link>` inside `router.ts`. Counts went; conditions
stayed. Two things the area's reading turned up elsewhere and fixed rather than
deferred: `docs/common.md` and `gameManifest.ts` both described the pre-reorg
`lib/` layout, the latter including a paragraph arguing a placement inside a
folder that no longer exists. Nothing handed on; `todo.md` is empty. **The
closing re-read earned its place again** — six more findings, every one a
sentence describing a two-file folder after `routes.ts` made it three, including
a Design paragraph contradicting the one directly above it.

**`supabase` is closed** (2026-09-05): thirteen files `cs-blessed-supabase` —
every file of `src/common/supabase/` plus the two Deno files in
`supabase/functions/_shared/` that build and read the same envelope — with
twelve findings worked, one closed with no change and one withdrawn. The code
held up: the envelope's shape, the three-wrappers split and the
classify-here/present-there line between `dbFetch` and `dbResult` all read as
designed, and the folder's `doc.md` now explains that line for a newcomer. What
had drifted was the prose about it. Two comments promised a guard that no
longer existed for a form-validation raise with no COLUMN; `raiseCodes.test.ts`
now has that check, a forward fix into the guards area. `NotOkEnv` became
`NotOkEnvelope`, the one abbreviation in a folder that spells the word out
everywhere else. Ten places that called a not-ok a "refusal" say not-ok, since
the word collides with the game-rule refusal that is an `ok`. Six counts became
conditions, five doc link texts and one docstring stopped writing pre-reorg
import paths, and the five `typeof window` guards went bare, this folder's
half of the per-folder decision `docs/code-conventions.md` leaves open. Three
small code cleanups: one named `Settled<T>` where the response shape had been
spelled five ways, one URL parse per request instead of two in `dbFetch`, and
Deno's `isEnvelope` now as strict as its frontend twin. The withdrawn finding
is the lesson: the audit grepped for a file named `EnvelopeErrorPage` and found
none, but it is an export of `ErrorPage.tsx` and both docstrings naming it were
right — grep the name, not the path. Nothing handed on; `todo.md` is empty.
Left unplaced for the areas table: `_shared/http.ts`, `_shared/startGame.ts`
and `supabase/sql/common.sql`, none of which has a row.

**`session` is closed** (2026-09-05): four files `cs-blessed-session`, twelve
findings, all twelve worked. The area's real find was structural: one profiles
row was read twice at boot, by a probe asking whether it existed and a store
hook asking what was in it, behind two hooks whose names said the same thing.
The probe now reads the whole row and seeds the store, so there is one read, one
arg-free subscribe-only `useProfile()`, no menu row that starts life showing a
placeholder — and, newly, a store that is emptied on every signed-out path,
which nothing did before. Two behaviors changed with it. A failed profile read
used to be answered with a guess, sending the player to the claim screen under a
fault modal to pick a handle they might already own; it is a fourth state now,
rendered by `EnvelopeErrorPage` with a Try again, and the read opts out of the
modal because the page is the message. And the probe fired on every auth event —
`getUser()` plus a read on each hourly token refresh — where auth-js's own docs
say the event name does not tell you whether the person changed; it is keyed on
the user id now, which covers refreshes, repeat `SIGNED_IN`s and multi-tab noise
under one rule. The prose pass came after those three, so it was written once:
the docstring lost its history and gained the four states, "friends-alpha"
stopped being an argument anywhere in the folder, and the stale-JWT story now
names `PN018`, which is what the RPC raises, rather than the 23503 it swallows.
`useProfile.ts` got the test file it never had. Two things this cost elsewhere,
both deliberate and both reversible: `PN491` keeps its registry entry with
nothing raising it, since one read leaves no window in which a row exists for
the probe and not for the load; and `callSiteShape`'s opt-out guard gained a
fourth way to be satisfied — handing the envelope up to a caller that renders it
— because that guard is file-level and this presentation lives in `App`. Handed
on: `useCommonGame` shows a whole-page failure as both a modal and an error
page, the same doubling this area removed, and it carries the fourth
"friends-alpha" comment. `docs/deferred.md` lost an item this area's work had
made untrue, pointing at a `// Fragile:` comment that no longer existed.
`todo.md` is empty. **The closing re-read earned its place again** — six more,
including two different "fours" a page apart in one file, and a piece of
archaeology in `doc.md` that no code change had ever touched.

**`boot` is closed** (2026-09-05): nine files `cs-blessed-boot` — the four in
`common/boot/`, the two root files `main.tsx` and `App.tsx`, and
`themes/loadTheme.ts`, plus the two files the area wrote — and fifteen
findings: twelve worked, two closed with no change, one handed on. The code
was doing its job; the area's finds were mostly about what the files SAID.
`main.tsx` is an order and its docstring now says so, one reason per line;
`App.tsx`'s docstring described only the route table for a file that also runs
the gates and mounts the root singletons, and now tells all three parts in the
order they happen; `reloadOnStaleChunk.ts` described an app from before
`panic.ts` existed, and its exported function gained the docstring that owns
the "call it before the first dynamic import" rule. Two names and two tests
moved: `chosenTheme()` wrote to storage under a getter's name and is gone,
`loadTheme` doing its three steps in the open; `loadTheme.ts` got the test
file its comments had stood in for, with two cases rewritten after they were
found to pass for the wrong reason; the stale-chunk test dropped a hand-rolled
blocked-storage stub for the fake `web-storage` built, and left that guard's
allowlist; and a twelve-line `location` stub written in both boot tests became
`reload.fake.ts`. Two rulings, both no change: a `sessionStorage` that reads but
will not write reloads uncounted, accepted as too rare (recorded in `doc.md` →
Details), and a gametype the registry has never heard of keeps its error page
rather than sharing `GamePage`'s "no game here" card — "this division is
intentional and good", now a comment at the branch. Handed on: the render-prop
`App` builds for a `GamePage` that already holds the manifest is `game-page`'s
to remove, written into that folder's `todo.md` — and removed there 2026-09-14,
along with the gametype lookup and F-boot-4's error page, which moved into
`GamePageGate`. `docs/common.md` lost a path that had not existed since the
reorg. `todo.md` is empty. **The closing re-read
earned its place again** — three more, all prose in the `loadTheme` pair, and
the F-boot-1 ruling turned out to have no durable home until `doc.md` gave it
one.

**`realtime` is closed** (2026-09-05): seventeen files `cs-blessed-realtime` —
fifteen plus the two the area wrote — and eighteen findings, all worked. The one
bug was the club page painting the viewer's OWN member dot hollow until the
presence server answered, filed on prod and never diagnosed: the roster started
empty and only a sync filled it, when self is present by definition while the
hook that announces it is mounted. It now carries self from the first render,
memoized because the club page restarts its 2.5s abandoned-game wait whenever
the roster changes. The folder's one untested hook — the "someone is already
setting up a game" toast — got thirteen cases and a shared `channel.fake.ts`
whose two seams are the server's two moves, the join ack and a presence sync;
holding those apart is what let the announce-before-SUBSCRIBED ordering be
tested at all. Planting corrected the finding that prompted it: the stable toast
id is NOT what stops a re-sync stacking toasts (the reconcile loop does), it is
what keeps the toast in its place in the stack, and that case only exists
because a planted random id passed. The rest was prose, and it was the same
defect over and over: **a count or a list written where a condition belonged.**
Two docstrings claimed "four" and "the other three" against seventeen and eight;
`code-conventions.md` kept a five-row channel list beside the registry that
calls itself every channel in one place, naming one channel nothing opens; a
teardown docstring listed four of eight stable rooms; `supabase.md` credited
each game's schema test with a publication guard that lives in one common file;
and the deaf-window story — the reason this whole folder exists — was written
out in full in four places plus a test comment. One home each now, and every
list replaced by the condition that decides membership. Twenty-one comments
across the repo still pointed at `common/lib/supabase/`, the folder's pre-reorg
path; that sweep shipped here, since this folder moving is what caused it. Also
from Joel this session, and now a standing rule: a label like "Pattern A" is an
index into a doc, not a meaning, so it always travels with a short gloss. **The
closing re-read earned its place again** — four more, three of them created by
this area's own fixes, including an invitation in the new fake that read the
three deliberate hand-built doubles as oversights. `todo.md` carries two
cosmetic items.

**`corecss` is paused, one step from closed** (2026-09-05): nineteen audit
findings worked, the closing re-read's eleven worked, `core-css/doc.md` and
`themes/doc.md` written and off `INTROS_OWED`. Its roster stays
`cs-audited-corecss` because the last step is Joel's read, and Joel: *"i can't
really review these files and bless them until we've complete some areas that
rely on corecss."* A base rule is best judged from the surfaces that wear it,
so the blessing comes after those areas, and `branding` opens next as usual.
Three decisions it left are `todo.md` items, not open work: the hand-written
`--game-chrome-height` (core-css), the `.card` name collision (core-css), and
GamePage's own wrapper class (game-page).

**`branding` is closed** (2026-09-05): six files `cs-blessed-branding`, fifteen
findings — thirteen worked, two closed with no change. The folder's rule, now
in its `doc.md`: a mark is a bare `<img>` and never a control, because the same
mark stands in two wrappers that mean different things by a click. `<GameLogo>`
takes the manifest its callers already hold rather than re-resolving a gametype
string, and following that one level up reshaped ClubPage's list row — it had
copied manifest fields onto the row and then handed the string down to be
looked up again. `--logo-size` now holds the 32px the two marks share, with the
header's height composed from it instead of explained in prose in two files.
**The closing re-read earned its place again** — six more, four of them created
by this area's own fixes, including a docstring in a THIRD file repeating the
staleness the audit had just corrected in the other two. Nothing is owed here,
so `branding/todo.md` stays empty; the two handoffs went to `manifest/todo.md`
(resolving a gametype string is hand-written at five call sites, each answering
"what if it isn't there?" differently) and `club/todo.md` (`<StartGameButtons>`
no longer exists and is named in nine places).

**`members` is closed** (2026-09-09): ten files `cs-blessed-members`, fifteen
findings all worked, closed moot or decided. Two of them changed the folder's
shape rather than its prose — `common/text` was deleted (its one component had
had no caller since August and no producer since before that), and
`<ActorTag>` / `<ActorDot>` moved in from `turn-log`, where one JSX use site was
a turn log and about thirty-seven were not. Both were then renamed to read in
draw order, in two passes because the target names overlapped the current ones.
The folder's rule — identity is a NAME the database constrains, and exactly one
shape carries it — is why four surfaces stopped coloring player names, and
`memberPalette.test.ts` is what keeps the eight names agreeing across the FIVE
places that spell them, not the three the read found. **Both closing re-reads
earned their place**: between them ten findings, and every single one was prose
the area itself had written, several of them that same day. Owed work is in
`members/todo.md`; the handoff to `club` is that a first-load roster read that
fails leaves `members` at `[]` for the life of the page.

**`feedback` is closed** (2026-09-12): twenty-two files `cs-blessed-feedback`,
twenty-one findings, all worked or closed. A redesign rather than a tidy:
the machinery was built first, every one of the sixteen games converted to it
the same day, and the old system's twelve files were deleted before the audit
began — so the audit read what the build left. A message is now a class with
a private constructor, one constructor per KIND, and the kind decides fill,
rank, exit and duration in one table; a slot is a list that discards nothing
and draws the lowest rank; a standing condition is an effect whose cleanup
retracts. Three ranks moved during the audit, each for a stated reason — a
rank is a priority and nothing more, so `waiting`, `chat`, `peerMilestone`
and `peerStatus` became kinds of their own — and two placements changed:
setgame's whose-turn note left the header for the board, and codenamesduet's
header sudden-death line was deleted outright. `FailureLine` moved to
`forms/`, `Actor` to `members/`, and the names guard lost its allowlist.
**The closing re-read earned its place again** — eight more, and two of them
were the area's own earlier findings recurring in a sibling file. Owed: one
unit test, in `waffle/todo.md`.

**`page-header` is closed** (2026-09-12): thirteen files
`cs-blessed-page-header`, sixteen findings, all worked or closed. The area's
own question — the marks' separation, the folder's one todo item — closed as
a stated decision: the gap is a base and each mark's padding is part of its
look. Two things a player could see: the players strip is now a block
container, because `text-overflow` never paints on a flex row and a long
roster was clipped mid-name with no sign (verified headless); and the club
strip's presence hint is a `data-tooltip` like every other hover text in the
header. The chat mark's `aria-label` is a fixed "Chat" — it computed three
variants nobody read. Three literal-number questions closed as decisions
written into the guard and the stylesheets. Joel's read of the re-read caught
two "a component rather than a class, because…" paragraphs in docstrings —
rationale, and the prose pass had trimmed around them. **The full e2e suite
ran for the first time in a while and is green (233)**: four keyboard cases
had been red since the lists area hid the cursor until asked without
updating the two specs it left off, and one setgame spec bet on a deal the
deal-three rule can overturn; all repaired from here. Owed: nothing.

**`definitions` is closed** (2026-09-12): twenty-five files
`cs-blessed-definitions`, twenty-two findings, all worked. The one that
changed the app: click-to-define is one component over a root host —
`<DefinableWord>` writes a one-slot store and `<DefinitionHost>` in `App.tsx`
draws the card, so the fourteen surfaces that show a definable word each lost
a hook call, a popover render and a four-prop bundle, and `useDefinePopover`
is gone; the native title stays (Joel: a styled bubble would trail popups down
a hundred-word list), one hover feel everywhere, and wordle's squares got an
underline that had never painted. Two live bugs: the Edit link showed after a
failed lookup, and two local hover rules could only ever paint a disabled
button. Both stylesheets joined the size vocabulary, the popover now a few
percent smaller. The closing re-read's lesson, for the third area running:
three of its four findings were the area's own fault classes recurring in
prose the area wrote that day — thirteen bare "panel"s, three of them in
comments a finding had written, and eleven "used to"s after a finding had
fixed one. Grep the class, not the phrase. Owed: a screenshot of wordle's
turn-log hover, which needs Playwright.

**`chat` is closed** (2026-09-12): sixteen files `cs-blessed-chat`, seventeen
findings, all worked. The one that changed the app: every real page opened the
club's chat stream twice — the panel subscribed for its list and the page
subscribed again for the feedback bridge — and now the panel, which already
holds the stream, calls `useChatFeedback` itself, so there is one subscription
per page and on `GamePage` the bridge no longer runs before the game row has
loaded. The unread store publishes a fact, the sender's color NAME, and the
blessed `page-header` mark turns it into the paint, muted case and all — the
decision moved to the mark and took a new `ChatButton.test.tsx` with it. The
non-subscribing `getChatOpen` read stays as a declared test seam, and
scratchpad's twin took the same answer in the same pass. `ChatBody`'s six
literals took the ramps, an inert `.inputRow` reset came out, and the tests
lost a twice-built channel mock and a hand-rolled storage fake. The closing
re-read, for the fourth area running, found the area's own faults in prose it
had written that week: nine stale sentences, most of them left by two
findings worked the day before, `members.find` beside `memberById` a second
time, a guard recommending a token that does not exist, and three pre-reorg
paths in `docs/common.md`. Owed: nothing; `todo.md` holds one Maybe, the
open-flag encoding chat and scratchpad store two ways.

**`scratchpad` is closed** (2026-09-12): eight files `cs-blessed-scratchpad`,
sixteen findings — fifteen worked, one closed by another's decision. What
changed the app: the pad stays writable after the game ends, a whole vertical
slice — the companion's terminal flag, the hook's parameter, the RPC's
play-state guard and its race arm, the pgTAP case, the read-only status text —
gone on the ruling that the notes are the players', not the game's. The two
one-second intervals that ran for the life of every coop game page run only
while a holder exists; the reconnect refetch gained the holder guard the CDC
path already had; "Take over" is a standard small quiet button, and ui.md's
last "unsettled" case went with it. The editor is named by a `<DotActor>` from
the club roster, so the lock claim carries a user id and nothing else, and
`GamePage`'s `?? 'You'` went with the username. The textarea paints as a field
like every other — no wrapper, no read-only mute, the monospace face decided.
`useIsScratchpadOpen` and `useIsChatOpen` in one pass, the rect key in the
storage convention's shape, and the store test its twin had. The closing
re-read found five stale claims in prose outside the folder — a rollback the
body never had in supabase.md's register, "bubble" for the mark in two blessed
page-header docstrings — and moved the two lock races from crosswords'
register to the folder's todo. Owed: nothing; `todo.md` holds two Maybes, the
open-flag encoding and the lock races. Three game companions store rects
without the `puzpuzpuz:` prefix, noted in the area file for those games.

**`account` is closed** (2026-09-12): eight files `cs-blessed-account`, fifteen
findings, all worked. What changed the app: a failed sign-out was a
`console.error`, and `GoTrueClient` returns before clearing the local session on
one, so you stayed signed in with nothing on screen saying so — it goes through
`reportDbFault` now with a code of its own (`PN492`, in a third table beside the
`FE` four, for the auth calls a signed-in player makes that no wrapper speaks
for), and the hook got its first test file. A `<legend>` is not a flex item, so
every `group` field's caption had been sitting flush against its control — one
rule in `field.module.css` fixed the picker in two screens and Edit club's
checkbox list. The color swatches are quiet buttons now, wearing quiet's washes
and no transition because a standard button paints its wash instantly, and the
chosen one takes an ink border rather than the keyboard cursor's blue ring —
which let both `⚠️` essays defending that resemblance be deleted, `focus-ring.css`
included. `ColorChoiceList` folded into its wrapper as `ColorChoiceField`, so a
blessed folder no longer imports its inner from elsewhere. The reserved `theme`
column got its own pgTAP file. Two null branches that cannot fire kept their
`??` and lost the comments describing a loading moment that does not exist.
The prose pass's catch: `supabase/sql/common.sql`'s profiles policy justified
its standing rule with "all four columns today" when the table has six — the
conclusion held, the reasoning had not. Owed: nothing; `todo.md` is empty.
`fields/ColorChoiceField.tsx` still says `cs-blessed-forms` over content it
gained here, for forms to re-bless when it next opens.

**`simple-page` is closed** (2026-09-13): twelve files `cs-blessed-simple-page`,
twenty findings, all worked, one of them a handoff and one — a claim-screen e2e
the roster had missed — worked the day after the close on Joel's word. What changed the app: the
claim screen's two exits — the "Not you? Sign out" button and the PN018 branch —
run one `signOutAndLeave()`, where PN018 had signed out and trusted an auth
listener the button's own comment said could not be trusted; the sign-in code's
placeholder stopped naming a digit count the docs say is a Supabase setting; a
wrong code no longer erases the sentence saying where the mail went; and the
error page's "Error" is sized by `h1` like every page's title rather than forced
under the modal's. Three Designs written: auth carries the weight (one email
with two uses, no password flow, the raw-GoTrue-message exception, the
permanent handle, the seeded color, the two halves of the claim's refusals),
error-page the modal-vs-page rule, loading the word-with-no-box. Both screens'
docstrings had been stranded above a constant where the orphan guard cannot
see them, and both essays became hovers with the reasoning in the Design. The
claim screen's error-mapping block described SQLSTATE codes the code had
stopped reading; the pgTAP file, `docs/common.md` and two comments in an
applied migration said the same, and Joel ruled the migration's comments get
fixed in place. PN018 got its pgTAP assertion, pinned there because the session
gate turns a stale token away before the e2e can reach the RPC. The closing
re-read found the area's own sentence — "PN017 is the only one a player can
act on" — written into six files the day before, and a prop comment naming a
helper that does not exist. Owed: `auth/todo.md` holds one Someday (the
`.buttonRow` / `modalActions` merge, floating-panels' to make); `club`'s
`todo.md` the hand-paired `{ text, diagnostics }`; five games' `todo.md` their
own "Loading game…" paragraph where `<Loading>` is the word.

**`homepage` is closed** (2026-09-13): five files `cs-blessed-homepage`,
nineteen findings, all worked — nine from the reading and ten from the closing
re-read. What changed the app: the page got the unit test it never had
(thirteen tests, the three empty states, the zero-rows fault on every load and
NOT on a failed read, the display order asked of the database, the modal and
where success goes); the keyboard e2e's Space check got an assertion that can
fail, where `toContain('/')` had matched every URL; and `e2e/faults.e2e.ts`,
`cs-unmet` with no area coming for it, joined the roster because its second
test is this page's zero-rows fault end to end — found by grepping `e2e/` for
the page's heading text, which is now the way every opening looks. A Design
written for `home`: one list and the button that adds to it, no lobby; the
one-stop tab ring and its accepted cost; why an empty list means three things;
why zero rows is the page's fault to raise and a failed read is not; solo clubs
marked, not separated; the modal because the act is add-to-this-list; the disc
leading the greeting. The docstring shrank to the page and its one prop, and
eight comments to their local decision plus a pointer, five in the reading and
three at the re-read — because the Design was written FROM the comments and
then left in them. The closing re-read's own lesson: a commit message is not
evidence that an edit landed — F-2's docstring cut was described in the commit
and recorded as worked, and the diff had never touched it; F-4 was recorded as
a move and had landed as a deletion. Stale claims fixed in place in `ui.md`
and `mobile.md`: a `<ul>` and a `.frame` the page does not have, rows that
"stay ordinary links", a "Welcome, …" heading, a "SOLO pill". Nothing owed:
`home/todo.md` is empty.

**Closed-area doc passes — render trees, DONE 2026-09-15.** The render-tree
rule (§4 → "Harvest the folder's `doc.md`") arrived at `game-page` on
2026-09-15, after these closed. Assessed by reading each folder's components
and who mounts them, and drawn the same day at Joel's ask (each tree was built
from the JSX, not the docs); none reopened its area:

- **`boot`** — `App.tsx`'s tree: the page it picks per session state and
  route, and the hosts it mounts under every page (`ToastHost`, `FaultModal`,
  `TooltipHost`, `DefinitionHost`, `ConfirmationHost`, `AppActionsHost`,
  `GameInvitations`, the two root dialogs). The root of every other tree.
- **`club-page`** — `App` → `ClubPageLoader` → `ClubPage`, and what the page
  draws: header, current-game card, the start row, the game list's rows and
  filters, the edit and help panels, `Chat`, and `setup-form`'s modal.
- **`page-header`** — rendered by `ClubPage`, `HomePage` and `GamePage`;
  draws the menu slot, the panel toggles, and the status slot that swaps the
  players strip for `feedback`'s pill.
- **`setup-form`** — `ClubPage` → `SetupGameModal` → the shared sections and
  the game's own `setupForm.Component`; separately, every game's info column
  → `SetupDisclosure`.
- **`floating-panels`** — which shell wraps which: `FloatingPanel` under the
  three window families, `BlockingModal` under its two members, and
  `ConfirmationHost` at the root drawing whatever is pending. A family tree
  more than a render tree, and the same question. Its `doc.md` has no
  `## Details` at all today.
- **`definitions`** — `DefinableWord` in text → `DefinitionHost` at the root
  → the popover → `DefinitionView`; `AppActionsHost` → `WordLookupDialog` →
  the same view; `App` → `WordEditDialog`. Two hosts, one view.
- **`chat`** — short, and worth it for the edge: `Chat` → `ChatBody` is
  mounted by `ClubPage` and `GamePage`, while its header mark is
  `page-header`'s.

Not worth a tree: `buttons`, `fields`, `forms`, `lists`, `members` (leaf
components rendered from everywhere); `menu` (one component, one renderer —
a sentence); `common-hosts`, `account`, `simple-page`, `scratchpad`,
`actions` (their mount is `App`'s or `GamePage`'s tree). Folders not yet
closed draw theirs at their own harvest.

- **§3** is the areas, in order, and the ONLY place an area's position is
  written down.
- **§4** is the process — the stamps, what opening an area means, what "broken"
  is allowed to mean while this runs. Read it before doing anything.
- **§2** is the steps, and where the sprint is in them.

## 1. What this sprint is, and why

It began as CSS. Sixteen games share a great deal and should have little
customized CSS; instead the app exploded into thousands of lines of module CSS
against a few hundred of shared, and the same choice was made in many places
while things with the same meaning were styled differently for no reason. The
root cause (css-philosophy.md) was **unchecked CSS Modules**: containing CSS per
game or per component was almost always wrong, in an app where the games
*should* look alike and the conventions *should* be shared.

Two things followed from measuring it, and they set the priorities:

- **Color is the smaller half.** The common surfaces already referenced color
  and never declared it; the color discipline worked there.
- **Patterns are the bigger win.** The duplication is shapes that have no name
  — every dialog has the same fields / save / cancel / spacing and no class
  says so, so each is rebuilt locally.

Then it grew: the same duplication lives in the React (three pages hand-rolling
one header; a component's parts renamed by every consumer) and in the SQL, and
the sweep reads each file once, so **anything the area needs gets done while it
is open**. That is what "area by area" means, and why this stopped being "the
CSS sprint". Growing is expected, not scope creep — as long as the growth is
organized by area.

**What success looks like:**

- Far less CSS.
- Lots of colors, most predictably computed from a base, so most of theming is
  changing the base and letting the rest follow. **A color should have a
  meaning.**
- What's left in a game's module is **board geometry and brand color.** A
  dialog rule or a button rule still sitting in a game module means we missed
  one. **Crosswords and scrabble are exempted by ruling**: crosswords was
  imported from an implementation written outside this repo and genuinely
  needs a UI unlike any other game's (printed notation, a whole-word cursor
  highlight, a keyboard-required layout); scrabble's premium-square board is a
  different object from a grid of tiles. Don't optimize for them and don't
  measure the sprint by them.
- Every file read once, by Joel, with the reading recorded (§4 → the stamp).

## 2. The steps

| # | step | state |
|---|---|---|
| 1 | this doc | done; trimmed 2026-09-05 |
| 2 | build the theme | **DONE 2026-08-20.** [docs/ui.md → Themes](../docs/ui.md#themes) |
| 3 | rebuild `/palette` | **swatch half DONE 2026-08-20.** The in-situ half — every variant rendered DOING ITS JOB, ink as text, bar in a list row, fill on a tile — is DEFERRED, not skipped: it was built by hand, was wrong about the pill in three ways at once, and got reverted. It returns when the demos can render the REAL components (`<FeedbackPill>`, `<Dot>`, `<EventLogOutcomeBar>`, the shared `.tile`), which may mean after those components' areas. An invented example is worse than none — it manufactures evidence about the stylesheet. `/palette` and `/font` are otherwise OUT of the sprint (§3) |
| 4 | the midnight spike | **DONE 2026-08-21.** [dark-mode.md](dark-mode.md) has everything it found; dark mode is not part of this sprint |
| 5 | shallow whole-app pattern pass | **DONE 2026-08-21.** The rules it produced are [docs/code-conventions.md → Patterns](../docs/code-conventions.md#patterns--a-class-a-token-or-a-utility); the patterns still unbuilt are `todo.md` items in `forms`, `floating-panels`, `core-css`, `buttons`, `lists` |
| 6 | homepage · clubpage, with the pattern half of the toolkit | **STOPPED 2026-08-21 on purpose**, because the vocabularies didn't exist yet and every conversion was picking a spacing value by hand. Both pages are re-audited from scratch as areas (§3) |
| 6a | the conversion process + the allowlist guard | **DONE.** §5 and [docs/code-conventions.md → The CSS checklist](../docs/code-conventions.md#the-css-checklist) rule 7 |
| 6b | the vocabularies | **NAMED 2026-08-21, LANDED 2026-08-22.** [docs/ui.md → The non-color vocabularies](../docs/ui.md#the-non-color-vocabularies). Values are provisional and get tuned area by area |
| 6c | the z- layers | **DONE 2026-08-25.** [docs/code-conventions.md → The z- layers](../docs/code-conventions.md#the-z--layers) and [docs/ui.md → Floating panels](../docs/ui.md#floating-panels--five-families-one-shell) |
| 7 | **the areas** | All the remaining reading, run **area by area** — the process is §4, the order is §3. Each area's audit and working notes live in `plans/areas/<area>.md` while it is open. **Areas are named, never numbered** |
| 11 | assets | 17 game logos carry baked color; the wordmark and favicon carry near-whites that fail on a dark page. All of it at once, at the end — doing one per game argues about a tree sixteen times |
| 12 | fold + delete | the allowlists empty; **every `cs-` stamp comes out** (`cs-stamp.mjs unstamp`, then the script and its guard go); `plans/areas/` goes; the non-sprint plan this sprint leans on (`tile-feedback.md`; `feedback-system.md` went with the old system and `feedback-design.md` with the `feedback` area's close, both 2026-09-12) has folded into `docs/` or a `doc.md`; this doc goes. What `css-philosophy.md` becomes is Joel's call — he wants it kept |

Steps 8, 9 and 10 were folded into 7 on 2026-08-22 and their numbers are
retired rather than reused, so a stale "step 9" reads as stale.

## 3. The areas, in order

**The table is keyed to folders**: pick any file, read its folder, and exactly
one row names it. That is the test two earlier gaps failed (chat's files and
the game scaffolding were on no roster until something needed to be *filed*),
and keying to folders makes it answerable by looking rather than remembering.
**An area may span two or three tiny sibling folders** when they are one
subject, because a one-file area helps nobody. The reverse happens once:
`themes` is named by two rows, because `loadTheme.ts` is `boot`'s and both
rows say so — still answerable by looking.

**The order is by depth, decided 2026-09-05** from the folder-level import
graph (who imports whom across `common/` and `shared/`, and which folders the
games and the root files reach). Two rules, Joel's: **deep-down things
earlier**, so the app is felt coming together from its fundamental parts; and
**what everything needs before what only games need**, so `turn-log` and
`info-sheet` come after `routing` and `boot`. Within a tier, the folder more
things read goes first. Two calls the graph could not make on its own:
`feedback` sits mid-depth (six folders under it, twelve and every game above
it), so it runs once its dependencies are read rather than first as
originally decided; and `manifest` and `game-page` import each other, so one
will list the other as a dependency whichever goes first.

| #  | area | the folders it reads | what it is |
|----|---|---|---|
|    | **Foundations** — read by nearly everything, reading nothing | | |
| 1  | `utils` | `utils` | **CLOSED 2026-09-04.** The small general helpers that belong to no page, no game and no subsystem; thirty folders and every game import them |
| 2  | `icons` | `icons` | **CLOSED 2026-09-04.** the glyph registry — every glyph, under the name of what it means |
| 3  | `web-storage` | `web-storage` | **CLOSED 2026-09-05.** storage that cannot throw, and the sticky-choice hook |
| 4  | `outcomes` | `outcomes` | **CLOSED 2026-09-05.** the outcome vocabulary — [docs/outcomes.md](../docs/outcomes.md) |
| 5  | `single-flight` | `single-flight` | **CLOSED 2026-09-05.** the guard every submit wraps |
| 6  | `mobile` | `mobile` | **CLOSED 2026-09-05.** the one desktop→mobile breakpoint, the device hooks, the viewport. `breakpoints.css` lives here |
| 7  | `routing` | `routing` | **CLOSED 2026-09-05.** the router, `usePath`, and the app's two URL shapes |
|    | **The data path and the boot** | | |
| 8  | `supabase` | `supabase` · `functions/_shared/envelope.ts` + `dbResult.ts` | **CLOSED 2026-09-05.** the client, the wrappers, the envelope — including the two Deno files that build and receive the same envelope server-side. The fault sink it reaches is `common-hosts`' to read |
| 9  | `session` | `session` | **CLOSED 2026-09-05.** who is signed in, and their profile |
| 10 | `boot` | `boot` · `main.tsx` · `App.tsx` · `themes/loadTheme.ts` | **CLOSED 2026-09-05.** mounting, the theme load, the session gate, panic, the stale-chunk reload. The two root files were added at the opening (Joel, 2026-09-05), and `loadTheme.ts` with them: it STAYS in `common/themes/` and is audited here, so `themes` is the one folder two rows name |
| 11 | `realtime` | `realtime` | **CLOSED 2026-09-05.** presence, reconnect, the subscribe hooks. Presence is what pauses a game and the pause boundary that reads it is `pause-suspend`'s; whichever opens second inherits what the first decided — and this one decided the CLUB orbit only: the roster that pauses a game is tracked in `game-page`, so `pause-suspend` inherits nothing from here |
|    | **The look, before anything renders** | | |
| 12 | `corecss` | `core-css` · `themes` (less `loadTheme.ts`, which is `boot`'s) | **PAUSED 2026-09-05, one step from closed.** Every finding worked, the re-read done, both Designs written; the roster stays `cs-audited-corecss` until Joel blesses it, which waits until areas that rely on these stylesheets have closed — a base rule is judged from the surfaces that wear it. The stylesheets every page loads and none owns, and the theme chain |
| 13 | `branding` | `branding` | **CLOSED 2026-09-05.** the app logo, the wordmark, and the `<GameLogo>` that renders a game's. Fifteen findings, thirteen worked; the folder's rule is that a mark is a bare `<img>` and never a control, because the same mark stands in two wrappers that mean different things by a click. **Not step 11's asset pass** — the 16 per-game logo files live in `src/<game>/`, so that stays one sweep at the end |
|    | **The people** | | |
| 14 | `members` | `members` (and `text`, which the area deleted) | **CLOSED 2026-09-09, blessed.** who someone is, their color, and the disc that carries it. Fifteen findings. Two of them were the area's shape rather than its prose: `common/text` had no caller and no producer, so the folder went instead of getting a Design; and `<ActorTag>`/`<ActorDot>` — one turn-log use site against ~37 elsewhere — moved in from `turn-log` and were renamed to read in draw order (`ActorDot` "moth ●", `DotActor` "● moth"). The folder's rule is that identity is a NAME the database constrains and exactly one shape carries it, which is why four surfaces stopped coloring player names. `memberPalette.test.ts` is new: the eight color names are spelled in FIVE places, not the three the read found |
|    | **The controls everyone touches** | | |
| 15 | `buttons` | `buttons` | **CLOSED 2026-09-08, blessed.** the button taxonomy. Twenty-one findings; the two biggest came from Joel rather than the read — a call site now states what its button DRAWS (`label` + a required `show`, with `tooltip` carrying the name), and a segmented choice became `<Segmented>` here rather than a global class. `FormSubmitButton` is new. The folder owns how a button is BUILT; `docs/ui.md` keeps the taxonomy around it |
| 16 | `keyboard` | `keyboard` | **CLOSED 2026-09-10, blessed.** Whose keystroke it is, where Tab may go, and backtick as Escape — what is left once every key became an action. Twenty findings, sixteen resolved (most by the actions sprint that came out of this area); the four surviving are the folder's `todo.md`. The tab-rings sprint ran out of this area and finished 2026-09-11: `useTabRing` lives here, every surface declares its ring, and the model is in the folder's `doc.md` |
| 17 | `lists` | `lists` | **CLOSED 2026-09-11.** pick-one and scrolling lists — [SelectionList](../docs/ui.md#selection-lists) is the canonical one |
| 18 | `forms` | `forms` · `fields` | **CLOSED 2026-09-11.** the design language of forms: the frame, the state, and every field — including the three only a setup form renders |
| 19 | `actions` | `actions` | **CLOSED 2026-09-11.** what a command IS: the registry of every command's fixed half, the one key dispatcher, the bound action a page or component makes, and the surfaces that read it (`<ActionButton>`, `actionSurface`, the key list). Built by the actions sprint (2026-09-10) and on no roster since; `doc.md` is written. Its two guards (`actionIds`, `registeredChords`) and `e2e/helpers/actions.ts` are its to list at the opening |
|    | **Floating things and the root hosts** | | |
| 20 | `floating-panels` | `floating-panels` | **CLOSED 2026-09-11, blessed.** the machinery and shared look of every window-like thing that floats over the page. Not the instances. Twenty-nine findings; the ones that mattered were the ones the audit's own reading had gotten wrong and a check caught — a live double-dismiss on Escape recorded as theoretical (`useDismissOnEscape` + a guard), two "harmless" fallbacks that centered a panel top-left and shrank it on every drag, a rules-of-hooks reason that did not hold (three components gone), a `minWidth` that outranked a phone. `useConfirmation` deleted: one way to ask. Handed on: the suspend question still rendered by hand (`pause-suspend`), and "backdrop" vs "scrim" as a vocabulary ruling |
| 21 | `menu` | `menu` | **CLOSED 2026-09-11, blessed.** the one menu, its store, and what a game puts in it. Twenty-two findings, all worked or closed. Two were live bugs a throwaway spec caught before they were written down — an outside click that forgot the open submenu, and a second flyout opened by click recording its parent as row 0 — and the second copy of the popover that let the first one hide is gone: one render path. The stylesheet joined the vocabulary (two type sizes on the ramp, every mark in a row `1em`, one muted ink of the menu's own, the submenu mark a registry glyph); a disabled fade that had never painted was deleted. The closing re-read's catch: three files said the game menu unmounts while paused, and it does not. Handed on: "hint" as a repo-wide vocabulary ruling with no guard; a disabled row cannot say why |
| 22 | `common-hosts` | `toasts` · `tooltips` · `faults` · `invitations` | **CLOSED 2026-09-11, blessed.** the three root hosts and the headless watcher. Thirty-six findings: thirty-four worked, one closed, one withdrawn. The area's question — what earns a mount at the root — got the wide rule: a thing is mounted at the root when its state crosses subtrees, and the store is how a page reaches it; home is App.tsx's docstring. Two live bugs a throwaway spec caught first: a long press ended by `touchcancel` left the click suppression armed, and a scroll left the hovered control unable to show its bubble again. The card's two exits got the spec they never had; `puptoast` and `pupfault` install in prod; the fault modal's canned fault is built by `diagnosticsLine`; the toast stripe is `--toast-stripe-width`. The closing re-read's lesson: prose names a game by its codename, never the brand. Handed on: `@starting-style` (`core-css`), `FaultModal` hand-draws its title (`floating-panels`) |
|    | **The feedback system** | | |
| 23 | `feedback` | `feedback` · `terminalMessage` (in `terminal`) · `turnText` (in `info-sheet`) | **CLOSED 2026-09-12, blessed.** A redesign, not a tidy: everything between an envelope and a player reading words. The design plan (`feedback-design.md`) was deleted at the close; what shipped is in `docs/ui.md → Feedback pill`, `docs/code-conventions.md → Feedback naming` and `feedback/doc.md`. Twenty-one findings; the summary is under "Where to start" |
|    | **Page furniture** | | |
| 24 | `page-header` | `page-header` | **CLOSED 2026-09-12, blessed.** the top strip and the marks in it — furniture every page carries and no page owns. Sixteen findings; the summary is under "Where to start" |
| 25 | `definitions` | `definitions` · `anagram-finder` | **CLOSED 2026-09-12, blessed.** click-a-word lookup, dictionary curation, and the anagram dialog. Twenty-two findings; the summary is under "Where to start" |
| 26 | `chat` | `chat` | **CLOSED 2026-09-12, blessed.** the club chat panel end to end. It belongs to no page: `ClubPage` and `GamePage` both mount it, which is why it is not `club-page`'s. Seventeen findings; the summary is under "Where to start" |
| 27 | `scratchpad` | `scratchpad` | **CLOSED 2026-09-12, blessed.** a game's notepad: shared in coop, private per player in compete. Sixteen findings; the summary is under "Where to start" |
| 28 | `account` | `account` | **CLOSED 2026-09-12, blessed.** your own menu and profile editing. Fifteen findings; the summary is under "Where to start" |
|    | **The pages** | | |
| 29 | `simple-page` | `auth` · `loading` · `error-page` | **CLOSED 2026-09-13, blessed.** the pages that are not home, club or game. **The roster's test is "does `App` render it directly?"** — it catches `ErrorPage` and `Loading`, which stand in for a page AND appear inside one. Twenty findings; the summary is under "Where to start" |
| 30 | `homepage` | `home` | **CLOSED 2026-09-13, blessed.** the landing page after login: one list and the button that adds to it. Nineteen findings, all worked; the summary is under "Where to start". The roster took `e2e/faults.e2e.ts`, which no area had audited: grep `e2e/` by the page's heading text at every opening |
| 31 | `club-page` | `club` | **CLOSED 2026-09-14, blessed.** the club page: one RPC for the load, a shared face for its three game entries, a decomposition into a loader and two hooks. Twenty-five findings; the reading is `plans/areas/club-page.md` |
| 32 | `setup-form` | `setup-form` | **CLOSED 2026-09-14, blessed.** the start-a-game dialog, its sections, and the recap rows the info column and the PDF share. With the pages because the club page is where a game starts. Twenty findings in `plans/areas/setup-form.md`, all worked. The closing re-read earned its place again — seven more, five of them the area's own findings recurring next door, three in prose the day's fixes wrote. What changed the app: the dialog reads `is_solo` and says "· AI" for scrabble's solo compete; `require_valid_timer`'s faults name `timer` and the create path's no-players fault names `player_user_ids`; `SetupDisclosure` owns its stylesheet; the "next up" line has a test handle |
|    | **The game shell** — needed by games and nothing else | | |
| 33 | `manifest` | `manifest` · `gametypes.ts` | **CLOSED 2026-09-14, blessed.** the registry and the manifest contract every game fills in. `gametypes.ts` is the registry's list, the one file allowed to import every game; it was `root-files`' until that row folded into this one (Joel, 2026-09-05), once `boot` had taken the other two root files. Fifteen findings in `plans/areas/manifest.md`, all worked, and two of the recorded ones were WRONG as recorded — F-9 counted manifest files where the registry has thirty entries, and `tsc` found the one (crosswords compete) that omitted `endGame`. What changed the app: `endGame` is required and crosswords compete has `end_game` (PN487 retired); `manifestFor` replaced six hand-rolled lookups and a registry miss now says what it means — an error page from the URL, a reload fault from a stale bundle, and `?new=` no longer bypasses club enrollment; both club lists sort coop-first explicitly; `statusLabel.ts`'s header is the one home of the status-line grammar. The closing re-read found a recorded fix that had never landed |
| 34 | `game-page` | `game-page` | **CLOSED 2026-09-15, blessed.** the live game's page and what it hands down — `GamePage`, `gamePageCtx`, `useCommonGame`, the error boundary, the device gate, the mount points. It imports 23 folders, which is why it comes after them. Twenty-four findings in `plans/areas/game-page.md`: eleven from the reading, thirteen from the re-read, plus the seven decisions `todo.md` handed it. What changed the app: the route is three components (`GamePageGate` → `GamePageLoader` → `GamePage`), and the page builds its own play surface — `App.tsx` passes the URL's two parts and the session and nothing else; one Back to club from every surface, the pause overlay and the device-block card included (`BackToClubButton` and `ctx.goToClub` deleted); `InfoActionsRow` is the info column's action row in every state, absorbing `terminal/`'s two (moved on to `info-sheet/` at the close, Joel's call); `describe()` takes its asker; `.noShrinkRow` reserves no height, by Joel's row-by-row rule; `--game-chrome-height` is composed and the shell no longer overflows by 1px; Help closes by its ✕. The re-read's lesson, for the fifth area running: eight of its thirteen were the area's own findings next door or written by its own fixes — and forty-three lines in twenty-three files dated the work to a day that had not happened yet. Open in its `todo.md`: the concern split of `playArea.module.css`, which waits for the first game area (Joel). Unrun: `e2e/bananagrams-block.e2e.ts`, whose selector F-9 changed |
| 35 | `board-marks` | `board-marks` (+ setgame's `lib/flash.ts` pair, by Joel's word) | **CLOSED 2026-09-16, blessed** (Joel: *"bless the files in this area and close the area"*): fifteen files `cs-blessed-board-marks`; `base.css`'s flash lines were read here and keep `cs-audited-corecss`. The marks a board wears for a beat, and every mark's lifetime. Renamed from `move-flash` 2026-09-16 (F-12): a move's attention flash is one of the things in it, and by the end of the area the newest were about a refused WORD. Twenty-three findings in `plans/areas/board-marks.md`, all worked: fifteen from the reading and the board work, seven from the closing re-read, one from Joel at the close. What changed the app: `useMoveAttention` (the attention mark end to end), `useChangeCause` answering in three parts (setgame on the shared parts), `useMark` and `useAnnouncedMark` (a tagged mark, and the announce-then-answer sequence), no default duration anywhere, one clock per mark (`feedbackTiming.ts` publishes the durations, no stylesheet declares them), and eight games' marks brought onto the vocabulary — a record players will feel, kept in the area file's "Games this area changed". The re-read's lesson, for the sixth area running: six of its seven were the area's own fixes writing stale claims next door — and every effect the area wrote was a bare arrow, which Joel caught, so the effect-name grep now sits beside the docstring-marker pass. **Read [tile-feedback.md](tile-feedback.md) at every game area** — this folder is the mechanism that pass is about |
| 36 | `timer` | `timer` | **CLOSED 2026-09-16, blessed** (Joel: *"mark files in this area as blessed, then close the area"*): four files `cs-blessed-timer`. The game clock — one integer counting seconds of play, and the words a configured timer is described in. The SQL half (`common.tick_timer`, `require_valid_timer`, the `timers` table) was EVIDENCE by Joel's ruling, read and left `cs-unmet`. Fifteen findings in `plans/areas/timer.md`, all worked: eight from the reading, seven from the closing re-read. What changed the app: M:SS is written once, in `timerLabel.ts`, and the hook file is the hook (no printer reaches through the poller); the hook's orphaned essay became `doc.md`'s intro and a twelve-line docstring that says the hook fires nothing; `ticked(n)` in the test; five stale doc claims about the old accumulator gone from `common.md`, `win-lose.md`, `states.md`, and after the re-read from `gameManifest.ts` and `codenamesduet.sql` too. Two decisions that outlive it: the hook-callback rule now tests the BODY, not the call shape (Joel: *"if they're non-trivial, a name is useful"*), and `expired` stays a level because a hook cannot hand back a one-render edge under StrictMode — F-8's recorded reason was wrong and the re-verify found the real one. The re-read's lesson, for the seventh area running: a finding that overturns a reason has to chase every file that wrote it (`doc.md` still had F-8's struck rationale), and a NOTE can have a false premise too — "no pgTAP for `tick_timer`" handed off a gap that a nine-spec file had covered since June |
| 37 | `pause-suspend` | `pause-suspend` | **CLOSED 2026-09-16, blessed** (Joel: *"bless the files in this area, then close the area"*): seven files `cs-blessed-pause-suspend`. Stopping a game while a player is missing or somebody wants a break — the rule, the gate that unmounts the play surface, the banner that stands in for it, and the words of the suspend question. Twenty findings in `plans/areas/pause-suspend.md`, all worked: thirteen from the reading, seven from the closing re-read. What changed the app: the suspend question is asked through `askConfirmation` like every other question (the hand-rendered wrapper is gone, and the real bug — a pending question outliving its page — is filed in `floating-panels/todo.md`); the overlay's four props stopped being optional for a test's sake; the roster prop is `players`, the name `naming.md` had already given it; the overlay stopped second-guessing the boundary's decision; the explanatory line is one sentence per pause source, in Joel's words; `computePause` answers a boolean, since nothing read the list it returned. Handed on: the overlay's mobile pass (its own `todo.md`), the unread `common.games.paused` column (`deferred.md`), the eliminated-racer pause caveat (`connections/todo.md`). The re-read's lesson, for the eighth area running: a return value with no reader recruits false sentences — the docstring, the test header, the order spec and the caller's comment all described a reader that was not there |
| 38 | `turn-log` | `turn-log` | **CLOSED 2026-09-16, blessed** (Joel: *"mark the files in this area blessed, then close the area and commit"*): eleven files `cs-blessed-turn-log`. The chronological history readout and its viewer — a panel that owns no row and supplies the frame plus a row vocabulary, and one flag with three exits. Thirty-one findings in `plans/areas/turn-log.md`: twenty-six worked, two closed by another, three skipped to the areas they caused (rows 39–41). What changed the app: the log stops re-snapping on every clock tick (six games passed a fresh array as the scroll key — `entryCount`, and the panel takes `shown` so the count cannot be mis-wired); `<HistoryBanner>` replaces nine hand-drawn banners, letterboxed gets its ✕ and stops wrapping, and the ✕ has a test for the first time; the `#N` handle wears the app's tooltip rather than the native `title`, and draws the inert number too so seven games lost a branch; the last literal `black` in `src/` became the token it should have read (and was wrong under midnight); the stylesheet split by READER into `TurnLog.module.css` and `gameTurnLog.module.css`, with `.meta` becoming `.turnNumber` and `.muted`; the panel takes the picker whole (`<TurnLog heading picker shown>`); the viewer has ONE prop contract across ten games with `isViewingHistory` derived, never passed; and the history vocabulary — `historyId` / `showHistory` / `exitHistory` / `historyLabel` / `historyLit…`, `act-exit-history`, `data-history-handle`, the `.history*` classes and `--history-*` tokens — replaced eight spellings, then a per-game read found ten more names no grep could reach. The closing re-read found nine, eight of them the area's own findings standing next door. Handed on: `boardIsShown`'s name and compete history to `history-always-available`, the wrong `near`s to `outcome-fix` (left in place as its proof), the banner's `z-index: 5` to `z-index`, and the banner ✕'s `<CloseButton>` question stays in `deferred.md` as a look decision |
| 39 | `outcome-fix` | no folder — every game's move path: the `useGame` row seam, `lib/evaluate` / `lib/history`, `GameTurnLog.tsx`, the board's verdict mark, the feedback pill, and each game's PDF | **CLOSED 2026-09-17, `cs-fixed-outcome-fix` and NOT BLESSED** (Joel: *"stamp fix onto outcome-fix and close the area"*) — the one area that closes without a blessing, because Joel ruled the same day that its files belong to other areas and should not have been stamped for it at all. All 109 roster files read `cs-fixed-outcome-fix` (findings resolved, Claude's claim); the blessing comes with each file's own area, never here. All eleven games worked (twelve commits, `1e6d65e5`..`9a207b74`), then the closing re-read, then its findings (`30406c8e`, `cfae81d8`, `e9169d26`). Every game decides a move's outcome once, in `lib/answer.ts` (codenamesduet's turn in `lib/turnOutcome.ts`; waffle needs none), the pill reads `res.outcome`, rows index the table, and each half is pinned — pgTAP asserts the envelope's word, a vitest test asserts the table, and each names the other. Seven games' SQL changed a word. The re-read found seventeen more (F-5 to F-21), all settled: the docs, then the code — `tone` for an outcome gone from the games' own code, "help" never a hint or a spoiler (two letterboxed raise texts with it), a key-card value named as what a cell REVEALED, five peer-line `'won'` literals indexing a table, the missing pgTAP outcome assertions and the four `"outcome":null` pins for events that carry none, `answer.test.ts` for spellingbee/boggle/wordiply, wordle's `rejectOutcome` made required, and the archaeology this area wrote into its own comments cut (the dated lines) or put in the present tense (the six "why a table exists" sentences). Handed on: strands' pill reading the table instead of the envelope, and stackdown's ambiguous ring in `error` ink under a `warning` pill — both decisions, both filed to the game's `todo.md` rather than made here — plus the five todos the area filed (setgame's hint ring, psychicnum's decided-tile fill, wordle's not-ok ring, connections' `matched`, game-page's `verdictTone`). Scheduled 2026-09-16 out of `turn-log` F-17, which is SKIPPED because this area caught it — the four games logging a hint or a reveal as `near` were left in place as the proof it worked, and are gone. The rule it was opened for is Joel's and now lives in [outcomes.md](../docs/outcomes.md): the outcome is determined ONCE, the server's word is right where there is one, and a hint is `warning` while a reveal or a spoiler is `lost` |
| 40 | `history-always-available` | no folder — the ten viewer games' `lib/history.ts` + `PlayArea`, `common/event-log/useEventLogPlayerPicker.tsx`, and each game's `Board` | **CLOSED 2026-09-18, no roster and nothing stamped** (Joel: *"mark history-always-available and z-index as closed"*) — moved out of the sprint 2026-09-17 and shipped 2026-09-18. Opening it turned up a schema question underneath — the `#N` handle addressed a row by its position in a filtered list, and three tables had no stable row id at all — so the work became three plans of its own, built, verified against production's rows and deployed together. **No file was stamped for this area.** Joel: *"this 'area' is really just a single task, and not an area… don't stamp any files during this area."* What it settled, since the plans are gone and this is the row that scheduled it: **the number and the link are different values** — the number is the row's place in the list on show, the link is the row's own `id`, so every handle is live under every filter and a compete terminal can replay an OPPONENT's board with the banner naming them. The picker's `boardIsShown` was deleted rather than renamed, which is the naming question answering itself: once a handle carries an id there is nothing to gate. wordiply gained the viewer it lacked, and setgame's contrary rule — the one that made it the existence proof — was reversed in place. It all rested on every game's log becoming `<game>.events` with a `bigint identity`: [docs/supabase.md](../docs/supabase.md#every-games-log-is-gameevents) has that shape, [docs/playarea.md](../docs/playarea.md#turn-history-viewer) the viewer's seam and the per-game roster, and [src/common/event-log/doc.md](../src/common/event-log/doc.md) the folder |
| 41 | `z-index` | no folder — a TASK, not an area (Joel: *"we shouldn't associate any files with it"*), so no roster and no stamps | **CLOSED 2026-09-18, no roster and nothing stamped** (Joel: *"we can close the zindex area"*) — the stacking order, end to end, shipped in `ecec3ce4` and `afb3d388`. Six findings in `plans/areas/z-index.md`, all worked. **What the area turned on was a correction to its own first answer.** The ladder was mixing two unlike things: things that LEAVE THE FLOW (chat, toasts, modals, the menu, the mobile info sheet), which land in one contest where a rung is the right instrument — and things that merely SIT IN THE LAYOUT (the board, the desktop info column), two flex siblings that never overlap and have never competed. The first pass sealed the boards *and* gave them `--z-board` (1000), which put the board above an info column at `auto` and inverted what the ladder itself claims; the tell was that it had to be defended with an 18px geometry measurement. Joel: *"i feel like i understand our layer/stacking strategy and implementation less now than before we designed a system for it"* — which was right, and is the sentence the area is really about. So a board is **sealed, not ranked**: `.boardSeal` (`isolation: isolate`) on all sixteen board roots, containment and no rung, and `--z-board` deleted alongside `--z-board-question`. The board keeps its place in the flow and the app paints exactly as it did before, except that a number written inside a board can no longer reach chat however big it is — which is what makes `vocabularies.test.ts`'s "0–10 is local layering" a fact the browser enforces rather than a convention everyone had kept. `--z-ghost` gained its two readers (both drag ghosts, from 1000 and 100), emptying the guard's pending list; `DECLARED_AHEAD` lost all three z- entries; and `--z-infocol` stopped claiming the desktop column is a layer — its 1300 is earned by `<InfoSheet>`, which does leave the flow. The test for any future rung is the durable output: **does this thing leave the flow?** Prose corrected in six files, including two that described a tier the app never had (the grid cursor's "board-layer tier", crosswords' number-jump modal riding a "popover tier below chat" when it has read `--z-modal-blocking` all along). The closing re-read found five more stale claims, every one the correction failing to reach a paragraph the first pass had written — twice the same stacking-context / containing-block conflation the area exists to untangle. Handed on: the number-jump modal's `<BlockingModal>` conversion to `src/crosswords/todo.md`; the history banner's `5` and the RankBar's `0/1/2`, which sit outside any board and are still held by the gap rather than by containment, are named in the area file as the next two questions |
| 42 | `word-list` | `word-list` | the alphabetical finds readout — common, not a family's: it takes its rows as a prop |
| 43 | `word-entry` | `word-entry` | **CLOSED 2026-09-18, blessed** (Joel: *"make files in this area as blessed, close it, then commit"*): ten files `cs-blessed-word-entry`. The typed-word box and its row — no `<input>`; keystrokes come off the window. Taken out of order at Joel's ask. Seventeen findings in `plans/areas/word-entry.md`, all worked: eleven from the reading, six from the closing re-read. **All three components were renamed** — `EntryBox` → `WordEntryInput`, `EntryRow` → `WordEntryArea`, `MoveRow` → `WordEntryRow` — on Joel's call, because "move" was the wrong word for it (*"a move can be clicking on a tile"*) and the `WordEntry` stem matches the folder. What changed the app: a game that offers no recall says so with `hasHistory` rather than by omitting `recall`, so letterboxed's two arrows are `hidden` instead of reading as live keys in Help; the arrows take `disabled`/`busy` like the blessed core does, so the four keys on the row cannot disagree; and **hard-off now grays rather than hides** — Joel's ruling that Help teaches a game's keys rather than reporting the moment (*"they're not keeping it open to watch it change"*), so a finished word game still lists `A–Z`, `⌫`, `↵` and the arrows, the buttons gray instead of vanishing, and the keys stop falling through to the browser. `--letter-spacing-display` (0.05em) joined the ramp, the axis against `-label` being SIZE and not case. `WordEntryInput.test.tsx` was written where the box had no spec of its own. The re-read's lesson, for the ninth area running: a rename's tail is prose, not identifiers — "an" left in front of every renamed name (ten sites, two of them line-wrapped where a line-anchored grep cannot see them), "the move row" standing in eleven files after `MoveRow` was gone, and F-2's and F-6's deleted claims restated in four more. Handed on to `common/actions/todo.md`: the Help ruling's reach past the entry keys, and the never-widen constraint on `describe(asker)` that an implementing session invented |
| 44 | `terminal` | `terminal` | **CLOSED 2026-09-18, blessed** (Joel: *"close the area and commit"*). Seven files `cs-blessed-terminal` (Joel: *"bless the files in this area"*, 2026-09-18); the row had said CLOSED for one commit before the re-read, and that was Claude's inference, not Joel's word (*"re-open the area; that was ENTIRELY WRONG"*). The closing re-read was done 2026-09-18 after Joel's own edits: eight more findings, all worked — and, for the sixth area running, most of them were the day's own work recurring next door (the doc.md tree drew the h2 he had changed, a test counted callers the way F-7 had just stopped ui.md doing, ui.md kept two phrases F-2 removed). Three rulings came out of it, each Joel's: the title is an `h2` at `1.5rem` by decision, uncommented (*"we don't need a comment explaining why i've resized a title"*), with the literal excused in `vocabularies.test.ts`; "a single-button dialog right-justifies its button" is not a rule and left ui.md; and `title`'s default and `primary`, the "Play again" half of the 2026-07-08 port that no game ever passed, are gone (*"remove both, since they're not used"*). Nothing is open. A game's end — when to celebrate it, the celebration, and the words. Twenty-two findings in `plans/areas/terminal.md`: ten prose ones in a single pass, four decisions Joel took one at a time, every one answered as (a), and the re-read's eight. **What changed the app:** the celebration's `body` has no default, the one it had ("You solved the puzzle.") being false at scrabble's compete win and a second copy of the title at the three puzzle sites that took it; and the `.title` size override went, after which Joel made the heading an `<h1>` outright (`91e67ce8`); `base.css`'s heading comment dropped its h2 example on his call and `docs/ui.md`'s table dropped the name, so **what level a modal title takes is now unstated** — listing it under h1 would contradict that level's meaning, and that ruling has not been made. **What changed the docs:** the celebration is a `modal-blocking` wherever it is described (it has rendered one since 2026-08-25), and ui.md's "Two panels stay off the shell" paragraph — rotted in BOTH halves, scrabble's blank picker having joined the shell 2026-09-10 — now names crosswords' number jump as the one panel still hand-rolled. **The area's lesson: re-verify a finding's premise before presenting it.** F-14 recommended making scrabble print `Won · 260` like its siblings; reading its call site first showed `260 (lost)` is argued — `OpponentStrip` separates PLAYERS with `·`, so `Won · 260` runs one mark through two jobs — and the docstring changed while no game did. `doc.md` was written during the prose pass (F-10 is a prose finding) and `common/terminal` came off `INTROS_OWED`; `todo.md` is empty. Handed on: setgame and wordiply join with `·` inside a strip cell, for their own areas; `terminalMessage.ts` stayed `cs-blessed-feedback` throughout, evidence rather than roster |
| 45 | `reveal` | `reveal` | **CLOSED 2026-09-18, blessed** (Joel: *"first, bless the files in this area. then: close the area and commit"*): four files `cs-blessed-reveal`, two of them written by the area. Audited the same day (Joel: *"this is a tiny section, just do the audit"*), every finding worked, the closing re-read done. Showing the answer after the end: `useSolutionReveal`, the personal, temporary, unpersisted display choice; `solvedByMe`, the predicate that starts a solver's answer shown; and `describeReveal`, the one `describe()` every game's `act-reveal` places. The design shipped 2026-08-15 and is documented in [common.md → Revealing the solution](../docs/common.md#revealing-the-solution) and [ui.md → Terminal results](../docs/ui.md#terminal-results--the-moment-vs-the-record); this row used to say the area "has to build" it, three weeks after it had. Nineteen findings in `plans/areas/reveal.md`: eleven from the audit, eight from the closing re-read. **What the area turns on is a vocabulary, Joel's:** the **puzzle-solution** (the puzzle's own, fixed at generation, the same for everybody, and what the control shows) and a **board-solution** (what one player's finished board amounts to, per player and per run); `impliedBy` is one sentence over them — *this player's board-solution IS the puzzle-solution* — which is why wordle implies and crosswords does not (Joel: *"crosswords will continue to have reveal; the author's solution is distinct"*). Three earlier namings were tried and each broke on a game; the terms live in `doc.md`, ui.md and both docstrings. **What changed the app:** `SolutionReveal` is `{ revealed, toggle, impliedBySolve }` — `reset` and `hide` had had no caller since the restart key (2026-09-15) unmounts the surface, so they went, test case and all; `describeReveal({ noun, revealed, impliedBySolve?, isTerminal })` replaced ten hand-written `describe()` bodies, so every game's gray Reveal now carries *"Can't reveal until all end"* where five had none (Joel: *"they should all show the tooltip"*); the noun is **solution** wherever the thing is one (Joel: wordiply says *best solution*, codenamesduet *key cards*), so seven games' words changed and *"Solution already shown"* stopped contradicting two of them; and psychicnum's reveal hides only the BUTTON mid-hunt, keeping its menu row and Help entry gray (Joel: *"'reveal solution' makes no sense until the game is ended"*). **What changed the docs:** the hook's docstring is twelve lines over the folder's new `doc.md`, which carries the two terms, the caller table and the per-game reasons (`common/reveal` off `INTROS_OWED`); *"nothing autoreveals, a win included"* was false for every game that implies and stood in its game docs, its components and two e2e headers — all fixed, the last of them at the re-read; `onRestarted`, a callback that exists nowhere in `src`, went from five sentences and an e2e comment, one of which credited it for a re-hide that `_target_for` does. **The re-read's eight were the day's own work standing next door, for the seventh area running**: the rejected "clear win" in two test headers, F-8 landing after the `doc.md` tree and the interface note had been written, the "shipped broken" sentence F-3 cut from the docstring still in ui.md with its wrong date, F-6's claim in two more PlayAreas, two tallies and this row — and F-19, the one with a decision in it: ui.md's Terminal results and `doc.md` carried the per-game reasons and the coop mechanics twice, and Joel ruled that **`doc.md` defers to ui.md** (the intro keeps the two terms, the caller table stays, and ui.md is where the per-game reasons live). Nothing is open |
| 46 | `info-sheet` | `info-sheet` | **OPEN — audited 2026-09-18** (Joel: *"this is the roster. do the audit"*), fifteen files `cs-audited-info-sheet`; `turnText` stays `cs-blessed-feedback` as evidence. The info column: its mobile sheet, its switch, the bordered panel its readouts wear, the whose-turn line (`TurnStatusLine`, moved in from `turn-log` 2026-09-12), and its action row (`InfoActionsRow`, moved in from `game-page` 2026-09-15). Seventeen findings in `plans/areas/info-sheet.md`. **The prose pass landed 2026-09-18** — the marker pass, the switch docstring arguing from a sheet width the same commit abolished, "used to" in seven files, the consumer rosters in five files and two docs (each now naming its condition), the stylesheet crediting a hook that renders nothing of it, the `@/` import inside `common/`, and a `doc.md` grown from one paragraph to an intro plus a Details with the render tree (off `INTROS_OWED`); it swept twelve files outside the folder that still opened their mobile comment on the deleted "Game info" menu item or the retired `wide` prop. **F-11 then ruled and shipped (b) the same day** — the info column's own stylesheet, `info-sheet/infoCol.module.css`: the column box and its eight row classes left `game-page/playArea.module.css` on the line that a game's PlayArea root div keeps its classes (`.layout` / `.mobileFill` / `.responsiveInfoCol`, the column-width clamp among them) and the column keeps its own; eighteen files repointed one import, no class renamed, no pixel moved. **F-12 ruled and shipped (a)** the same day: the row's `Exclude<Outcome, 'error'>` is gone, an `.outcome_error` rule inks the seventh word, and `Exclude<Outcome, …>` now appears nowhere in the repo — the three surfaces that show an outcome agree about the vocabulary. **F-15 ruled and shipped** the same day: the info column's unnamed `0.95rem` became **`--font-size-packed`** in `base.css` — a role name beside the font ramp rather than a step on it, for text where vertical space is the scarce thing — and the folder's other fits took their tokens, which emptied three `DECLARED_AHEAD` entries and turned up a false claim in blessed `StandardButton.module.css` (an info-column button has always been 1rem; the column sets no font-size). **F-16 ruled (2), no change to the CSS:** `infoPanel.headerRow` stays rather than becoming `core-css`'s `.heading-with-controls`, because that pattern is a global class whose readers are pages while these two are shared components — the reason now sits on the rule, and `patterns/heading.css` and `docs/ui.md` stop claiming the info column's two rows as instances of it, which they were not. **Nothing left in the area needs a decision, and the one "measured bug" was not one.** F-7 is WITHDRAWN on a false premise: the terminal turn line's character is a literal **U+00A0**, written as the character itself, so the line is 17px and the four places saying it holds its height were right all along. The audit had read it as U+0020 — which it is indistinguishable from in every view of a source file — and its measurement script then reproduced 0px from a scaffold typed by hand. A claim about a character is a claim about bytes. That line now says what the character is; Joel's ruling that *"changing things at terminal is ok"* stands but is kept local, so the code is unchanged. What remains is the two settled conversions: the `useInfoSheetOpen` rename code-conventions.md already made, and `metricLabel` optional for nobody |
| 47 | `pdf` | `pdf` | printing a board — the frame, the columns, the marks. [docs/pdf.md](../docs/pdf.md) is already its doc |
|    | **The shared families** | | |
| 48 | `dict-trie` | `shared/dict-trie` | the shared dictionary trie |
| 49 | `rank-ladder` | `shared/rank-ladder` | the Start..Genius ladder, its bar and its stat grid |
| 50 | `board-cursor` | `shared/board-cursor` | arrows move a cursor over a board. [keyboard-nav-plan.md](keyboard-nav-plan.md) would add five games to it |
| 51 | `wordle-style` | `shared/wordle-style` | the per-letter color codes of the hidden-target games, on screen and on paper |
| 52 | `onscreen-keyboard` | `shared/onscreen-keyboard` | the on-screen QWERTY |
| 53 | `grid-and-drag` | `shared/grid-and-drag` | dragging a tile to the right place on the grid |
| 54 | `bee-games` | `shared/bee-games` | what spellingbee and wordwheel share and nothing else does. **The name is a placeholder** |
| 55 | `word-hunt` | `shared/word-hunt` | find-words-on-a-board games |
|    | **The games** | | |
| 53 | per game, one area each | `src/<game>/` | **Sixteen areas**, keyed by CODENAME. Two passes back to back: the audit — React, SQL and CSS together — then the **tile-feedback** pass against [tile-feedback.md](tile-feedback.md). `psychicnum` first, as the control: the deliberately minimal toy, so what it settles is about the shape of a game area rather than about the game |

**`common/devtools` is on no row, deliberately.** `/palette` and `/font` are
ABSOLUTELY EXCLUDED (Joel, 2026-09-02: *"Do not read them, do not edit them, do
not touch them."*). They are instruments whose audience is Joel, and there is no
user to make them consistent for. **The exclusion covers findings ABOUT them,
not just the files** — a finding about when those routes render is a finding
about those routes.

**The three root files are in no folder, so a row names each by file.**
`main.tsx` and `App.tsx` are `boot`'s and `gametypes.ts` is `manifest`'s.
`App.tsx` is a shell — the route table and what hangs off the root — and it
does not get split into per-page pieces; the boot/routing line is a scope line
for the audit, not one the code owes anyone.

## 4. The area process — stamps, areas, and what "broken" means

The sprint reads **every** file — CSS, React, tests, SQL, edge functions,
scripts — so the first requirement is knowing, for any file, whether it has
been read.

### The stamp

Every file in scope carries one comment on its first line, `cs-` for
"css-system" (the sprint outgrew the name; the name stays).

| stamp | means | who sets it |
|---|---|---|
| `cs-unmet` | not reached yet | the initial sweep |
| `cs-found` | reached through the import/render graph | whoever reads the file that pointed at it |
| `cs-met` | **on an open area's agreed roster** — an area is being done for it | Claude, when Joel agrees the roster |
| `cs-audited` | an audit for it exists in `plans/areas/<area>.md` | Claude |
| `cs-partial` | some findings resolved; it names which are outstanding and where | Claude |
| `cs-fixed` | every finding resolved | Claude |
| `cs-blessed` | **Joel read it himself** | **only Joel** |
| `cs-na` | in the tree, deliberately not read | either |

**A judgment stamp names the area that made it**, as a suffix:
`cs-met-feedback`, `cs-audited-club-page`, `cs-blessed-forms`. `cs-unmet` and
`cs-na` stay bare. It answers a question only the file itself can answer —
Joel: *"hey, when did I approve this? should I revisit it now that we're
elsewhere in the sprint?"* — and a claim with no author cannot be re-examined.
**The suffix is not guarded, deliberately**: validating the area would need a
manifest, and a manifest rots on the renames this sprint does constantly, while
a stamp reading `cs-blessed-dialogs-and-forms` after that area split still
answers the question right. The cost, stated plainly: a typo'd area passes
silently.

**`cs-fixed` and `cs-blessed` are different claims.** "Claude found nothing"
and "Joel actually read it" are not the same statement, and the sprint's real
exit criterion is the second one.

**There is no ladder to walk.** The stamp is the latest true statement about a
file, not a position in a sequence. A file can go `unmet` → `audited` in one
sitting, and — the load-bearing half — **a dependency at `cs-found` stays there
until an area is scheduled for it. Being found is not a claim on attention.**

**`cs-found` means one specific thing, and reading is not it** (Joel): *"'found'
marks 'we came across this organically while exploring that area' — this helps
us make sure a page will be audited in an area. Reading-needed-for-research
isn't 'found'."* A file the area DEPENDS ON gets the stamp, because that is how
something downstream of an audited surface eventually gets an area of its own.
A file opened as EVIDENCE — compared against, measured, quoted — does not,
however carefully it was read.

**`cs-found` and `cs-met` are different claims too.** `found` says *this
deserves an area*; nobody owes it anything. `met` says *this HAS an area, and
the area is open*; somebody is coming for it. Neither means read.

`scripts/cs-stamp.mjs` does the work (`stamp` · `unstamp` · `tally` · `list` ·
`set`; `splitStamp()` splits state from area at the first hyphen, which is why
an area name may contain as many as it likes) and owns the scope: **what git
tracks**, in `src/` `e2e/` `supabase/` `scripts/`, in a language with a
first-line comment. Assets and puzzle data have nowhere to put a comment, so
they are step 11's. `src/guards/csStamps.test.ts` fails on a file with no stamp
(which is every NEW file) or a word outside the eight, and prints the tally.
Stamping a migration is safe (`schema_migrations` keys on `version` with no
checksum), and `stamp` / `unstamp` are exact inverses, proved by round-tripping
every file.

### The restarts

**2026-09-02.** Sprints nested inside this one — the error/envelope sprint above
all — rebuilt machinery underneath every surface already audited, so the three
finished audits were deleted and every stamp went back to `cs-unmet`. An audit
of a surface whose foundation moved afterwards describes an app that no longer
exists, and keeping one invites the worst outcome: treating it as current.

**2026-09-05.** The `src/common/` restructure rekeyed the areas table to folders,
and the three areas that had closed (`deep`, `utils`, `game-lib`) were keyed to
folders that no longer exist and spanned parts of a dozen current ones. Rather
than special-case "done but not complete", **every stamp went back to
`cs-unmet` again, every old area file was deleted, and this plan was trimmed
to the plan.** What those area files held that still mattered went to the
owning folder's `todo.md`; what the plan held that had shipped went to `docs/`.
Joel: *"starting with the areas empty and from the top will be less confusing
than special-casing 'done but not complete'."*

**Finding numbers die with their area file.** Each area regenerates from
`F-<area>-1`, so an old number would come to name a different finding. A
surviving mention describes the finding and names the audit it came from,
never a number that will be reused.

### Areas

An area is a loose unit of reading — a folder, a page, a game.
`plans/areas/<area>.md` exists for every area from the start, as a skeleton
(Joel, 2026-09-05: *"this gives us a place to drop things — for example, if
we forward-fix an area, we'll already have a place to put that"*), and holds
its audit (findings, each with its resolution), its predicted test breaks,
and its notes — the things worth remembering about an area that are neither a
finding nor owed work. **The plan holds the order** (§3); the area file holds
the reading; the folder's `todo.md` and `doc.md` hold what outlives the
sprint, and a note here never stands in for either. A skeleton is not an open
area: opening is still "list the files and STOP".

**AREAS ARE REFERRED TO BY NAME, NEVER BY POSITION** (Joel): *"the ordinal
numbers of the areas will move as we go through them. Do not put this kind of
stuff in other pages."* §3's table is the ONLY place an area's position is
written down. Everywhere else — area files, docs, commit messages, conversation
— an area is `club-page` or "directly after `feedback`", never "area 7".
Adding an area or reordering the list touches §3 and nothing else.

**Where a note goes — one of three places:**

- **the folder's `todo.md`** — work OWED to that folder, whenever it turns up
  and whoever finds it. Four sections, always all four, in a ramp of certainty:
  Bugs · Soon · Someday · Maybe
  ([docs/common-folders.md](../docs/common-folders.md#every-folder-carries-a-docmd-and-a-todomd)).
  This is the durable home, and it is where an area starts reading when it
  opens.
- **the area file** — the audit, the findings, the record of what the sprint
  did here, and the working notes. Everything, including archaeology, while the
  area is open; nothing that has to outlive it.
- **the standing register** — `docs/games/<game>.md` → Deferred for a game,
  `docs/deferred.md` otherwise — only for something genuinely OUT of the
  sprint's scope, added deliberately and by name.

The split is by *whose work it is*, not by whether it is finished.

**A finding's ID names its AREA: `F-feedback-1`, `F-club-page-7`**,
sub-numbered `F-club-page-6.1` when one finding grows a list of its own.
Numbering restarts at 1 in every area. Use the full ID everywhere the finding
is referred to inside the sprint — the area file, conversation, a commit
message — and never outside it (below). This doc has sections AND steps, so
write `§5` for a section, `step 5` for a step, and never a bare number for
either.

**Dependencies are listed, not audited.** Reading the homepage is the first
time the page header appears; auditing it there would hand Joel a list nobody
can hold in one sitting. So a dependency is stamped `cs-found`, listed by name
in the area file, and left. **The stamp tracks the file, the plan tracks the
area**: a file audited inside one area can be fixed inside a later one.

### How an area opens, and how it closes

**Opening an area is one thing: LIST ITS FILES AND STOP** (Joel). The whole
output is the files thought to belong to the area — its OWN files, not the
things they depend on. **No stamps, no audit, no reading ahead**, until Joel
has agreed the list. What counts as "the homepage area" is Joel's to define,
and stamping first means the disagreement arrives *after* the audit exists — a
list of findings about files he would have excluded, which is exactly the
drowning this process is built to prevent. A game's roster is `src/<game>/`,
its two SQL files, and `docs/games/<game>.md`.

**An area's first read is its folder's `todo.md`**, so it does not start by
re-deriving what earlier areas already handed it.

**An area is committed before the next one opens.** Several commits inside one
area is normal; what may not share a commit is two areas' WORK — you finish and
commit one area before starting the next, so the history reads area by area.

**This is not a fence around an area's files.** A fix this area's reading turned
up in another folder is normal and ships with the area that found it — a sweep
caused by this area's rename, a call site that has to move with a renamed
export, a two-line conformance edit where this area owns the rule being broken.
None of that opens the other folder's area: what an area owns is its FINDINGS,
not a claim on every file it touches. The handoff to a `todo.md` is for work
with a DECISION in it — a call site to restructure, a shape to choose — which
the folder's own area should make with its files open. (Joel, 2026-09-05:
making every single-line change in four folders its own commit is dumb.)

**An area's last two steps, as steps and not as habits:**

1. **Re-read the whole area in one sitting, after its last group.** Each
   group's fixes are verified against that group and not against the rest, so
   a claim one group disproved can still stand in a sibling file, and a count
   one group corrected gets re-written by the next. The one closing re-read the
   sprint has done found eleven findings that six group passes had not — most
   of them the area's own recorded faults recurring in prose written that
   week.

   **The docstring-marker pass belongs to this sitting, not only to the
   opening.** Prose written while working the area's own findings is prose
   nothing has checked, and it is where the marker rule and the
   rationale-in-a-docstring rule get broken — `members` broke both, in
   docstrings written the same day, after it had already made an opening pass.
   See [The docstring marker](#the-docstring-marker--a-pass-every-area-makes).
2. **Harvest the folder's `doc.md`** (Joel, 2026-09-04). Everything durable and
   important the area learned has to be somewhere that outlives it — a section
   of the `doc.md` AFTER the intro (`## Details`, or a named one), or a
   docstring or comment in the code, whichever is the better home. **The
   `## Intro to area` is not the harvest's destination.** It is written first
   and kept short: a few narrative paragraphs introducing the area to someone
   who does not know it — what it is for, what it shows, who mounts it, how it
   stays current. The area file's findings are bolded claims, and poured into
   the intro they make it a list of claims with nothing after it, which is
   what `homepage` did (Joel, 2026-09-13: *"everything is put in 'Design'
   … it's a huge smell if there are no other sections"*). The guard now holds
   both shapes. Its row comes off `INTROS_OWED` in
   `src/guards/folderDocs.test.ts`. Anything still owed goes to `todo.md`. The
   area file is then a record of the reading and nothing more.

   **A folder that holds components gets a render tree in `## Details`** —
   who renders it, and what it renders, the other folders' and the games'
   nodes marked. `game-page/doc.md` is the model; Joel, 2026-09-15: *"this
   kind of diagram ('who renders me and what do i render') is extremely
   helpful."* The rule is in
   [docs/common-folders.md → doc.md](../docs/common-folders.md#docmd--three-fixed-elements-then-freedom);
   this is the reminder that the harvest draws it. Closed areas that would
   benefit are listed under "Where to start" → closed-area doc passes.

**Those two steps are the last things CLAUDE does. Neither is the close.** An
area is closed when its roster files read `cs-blessed-<area>`, and only Joel
sets that stamp — [The stamp](#the-stamp) above. So an area with every finding
worked, the re-read done and the `doc.md` harvested is still OPEN, waiting on a
read Claude cannot perform on Joel's behalf. Claude never writes a `cs-blessed`
stamp and never ticks that box: recording that Joel read something is a claim
only Joel can make.

**And "close the area" is not an instruction to stamp.** Closing follows from
the blessing, so the word "close" is exactly the one Claude must not turn into
a stamp run. Claude did that on `lists` (2026-09-11): told "close the area and
commit", it ran `cs-stamp.mjs set blessed-lists` over the whole roster and
committed, while Joel's next message was that the files still needed blessing.
A stamp written on an instruction records that Joel said something, not that
he read the file. At a close Claude says the roster is not blessed and that the
stamp is Joel's to set, and stops.

**And the blessing check must not be run the easy way.** "Every roster file
blessed" is not "every roster file has a stamp." While an area is open its files
carry `cs-audited-<area>` — the stamp the area itself wrote on the way in — so a
check for *a stamp being present* passes on the area's first day and every day
after, and passes hardest at the moment it is meant to fail. Claude ran exactly
that check on `routing` (2026-09-05), saw six stamped files, ticked the box and
declared the area closed with not one blessed file in it. The check is: does
every roster file say `cs-blessed`, with THIS area's name after it.

**Claude does not decide that we are moving on.** Finishing a step is not
permission to start the next one, and that includes the sprint's own setup.

### Durable files never cite the plan, the audit, or a finding

**Ruled 2026-09-05, and it applies to every file that outlives the sprint:
`docs/`, a folder's `doc.md` or `todo.md`, and every docstring and comment in
code.** None of them may point at this file, at a `§` of it, at a
`plans/areas/<area>.md` file, or at an `F-<area>-n` finding ID. Joel: *"the
plan is a transient asset for the sprint"*, and *"F-numbers … go away after the
sprint."* A shipped plan is deleted (CLAUDE.md → Plans) and an area file is
deleted with it, so a cite into either is a dangling pointer with a known
expiry; a finding ID is worse, because every area's numbering restarts at 1.
The link guard catches a dead *path*; it cannot catch a `§20` or an `F-deep-11`
written in prose.

What a durable file says instead:

- **the reason, in its own words.** If the words are already there, the cite
  was a courtesy and just goes.
- **the doc that owns the rule** — `docs/ui.md → The grammar`. When the rule
  has not reached a doc yet, moving it is part of the same edit.
- **nothing**, when the cite was a handoff to an area that has not opened. A
  handoff is a `todo.md` item.

The non-sprint plans — `tile-feedback.md`, `dark-mode.md`,
`css-philosophy.md` — are the
exception only until each folds into `docs/` or a `doc.md`; a cite to one of
them is tolerated today and repointed the day it folds.

### The docstring marker — a pass every area makes

Joel, reading `dbLog.ts`: a `/**` docstring is what a reader consults to decide
*should I read this, should I call it*; a note about one field or one line is
a comment and takes `//`. His editor lights `/**` up, so a field note written
with it reads as "you must read this first" and the signal that tells him what
to read is gone. The rule lives in
[docs/code-conventions.md → Code clarity & docstrings](../docs/code-conventions.md#code-clarity--docstrings);
this is the note that it gets applied **per area, not swept**. Separating a
method's docstring from a field note takes a read per file, which is what an
area already does.

**A props block is the case this pass keeps missing** (`members`, 2026-09-09,
and only because Joel asked twice). Two things make it slippery, and both are
worth knowing before the next area opens one:

- **A props block does not feel like fields.** It is the shape a caller passes,
  so it reads as API surface and the marker looks earned. It is still one
  declaration, and a note on one prop is a note on one of its members. The
  docstring that answers *how do I call this* is the component's own.
- **Much of the app still has it wrong, so the surrounding code argues for the
  violation.** Closed areas are among them — `buttons` was audited and blessed
  with prop `/**` throughout. In `members` that observation was written into
  the area file as a REASON to leave the block alone, which is precedent
  overriding a stated rule; the rule wins, and a blessed folder that predates
  the pass is just a folder that predates the pass.

**And there is no cheap test for it, which is why this is a read.** Indentation
is not the tell: a docstring on a nested function or a method is indented and
correct. What separates the two is what the marker SITS ON — a whole
declaration, or one member of one — and answering that means having the
declaration in front of you. A grep can gather candidates; only the read
decides.

The other half of the same rule is missed as often and is easier to check:
a paragraph explaining **why the implementation is what it is** belongs on the
line it defends, not in the docstring. `members` had three, and had written two
of them that same day while working its own findings — the pass catches what
the area itself just wrote, which is the argument for doing it at the CLOSING
re-read and not only at the opening.

### A narrower `Outcome` type is a finding until proven otherwise

Ruled 2026-09-15. **Any outcome is a valid outcome**, so a type admitting only
some of them is presumed wrong until its reason is written down and holds. The
cost is not hypothetical: `TurnOutcome` made `warning` unsayable in a turn log,
so games logged a hint as `near` and their logs disagreed with their own pills
about the same event — for months, in five games. It is deleted.

An area meeting one asks whether the set is genuinely closed or is a ceiling
nobody revisited, and the same goes for a MAP over outcomes: one covering the
words a game happens to use today hands every other word to whichever branch it
ends on. [docs/outcomes.md](../docs/outcomes.md) owns the rule and lists the
three subsets that survive.

### Findings are numbered AND slugged

Every finding in an area file gets an ID and a slug, written together as its
heading, with its status in front when it has one:

```
## F-club-page-26 · `three-wrappers` · Three `.frame` rules, and only one of the
differences is a decision
```

The **ID** is the address: it never changes, and a finding raised after the
audit takes the next free number rather than a sub-number. The **slug** is the
hook (Joel): two or three kebab words naming the SUBJECT rather than the
verdict, so it survives the finding being resolved either way, and written once
and reused verbatim so it is greppable. A new finding gets a slug when it is
written, no exceptions. **In conversation, say the ID AND the slug** —
`F-club-page-26 (three-wrappers)` — every mention: *"a little bit more to read
is less disruptive for me than switching context to remember what F99 is."* A
slug may be renamed if the subject genuinely changes, never silently.

### Broken is expected, and it comes in three kinds

The app does not need to work until the sprint ends; only what has reached
`cs-fixed` should. Stopping mid-area to repair every consumer makes the diff
unreadable and is how both of us lose the thread. But "broken" covers three
different things and they get three different rules.

| kind | what it is | the rule |
|---|---|---|
| **compile break** | a rename, a newly-required prop; consumers don't build | **We MAY sweep every consumer in the same commit — and Joel decides that, not Claude.** The case it fits is a rename, where the fix is find-and-replace and keeping `tsc -b` alive is worth it for the area we're standing in |
| **test break** | it builds; a spec asserts the old shape | **Predict it, write the spec names in the area file, leave it.** The diff against that prediction is what tells us we broke something we didn't expect |
| **behavior break** | it builds and passes; it looks or acts wrong somewhere we haven't reached | **Leave it.** Note it in the owning folder's `todo.md` |

**A sweep is invisible to the stamp model** (Joel). When we do fix the consumers
of a rename, those files are edited and **their stamps do not move** — a
`cs-unmet` file stays `cs-unmet`. The stamp answers *has this been read*, not
*has this been edited*; a find-and-replace involves no reading and produces no
knowledge. It is also why such a commit doesn't break "no commit spans two
areas": the sweep belongs to the area whose rename caused it.

### Renaming is the point, not a risk

A lot of renaming happens here — it is what a whole-repo read is FOR, and
"that's a lot of work" is not an argument against one. The stamp is what makes
it safe: a rename that breaks something reaches a file we have not read yet,
and that file's stamp already says so.

## 5. How a value gets converted

**Vocabularies are not swept in; they are applied area by area** (Joel). When
an area is being converted, for each raw value in it:

- **it equals a vocabulary value → change it silently.** Nobody chose `4px`
  over `--radius-sm`; they're the same number.
- **it doesn't → surface it, look at it together, then change it.** Almost
  every near-miss was picked at a different time by a different hand, not
  decided. Asking once, in context, is how we find the few that were. What
  the answer may be is the a/b/c rule
  ([docs/ui.md → The a/b/c rule](../docs/ui.md#the-abc-rule--a-value-that-doesnt-fit)):
  add a level, fit an existing one, or keep it bespoke with a written reason —
  and *"there is no such thing as 6 bespoke values."*

This is why there is no up-front adoption pass: you cannot fit the near-misses
to a scale without looking at them, and looking at all of them at once is the
forest-for-trees failure §6 exists to prevent. **Tuned surfaces are exempt**
([docs/naming.md → tuned / justified / locked](../docs/naming.md#tuned--justified--locked)).

**The guard is a shrinking allowlist keyed by value**
(`src/guards/vocabularies.test.ts`): a file not yet converted is on the list
and silent; a converted value that regresses fails; a new file fails
immediately. Its `pending` is the sprint's own to-do list, and an area deletes
from it as it converts.

**The structural passes are not color passes.** A few values shifting is fine
and expected; what is not fine is a value shifting without anyone noticing.
Every move is recorded, decided, or marked (§6). Broad color tinkering is a
separate later pass, and its agenda is `src/common/themes/todo.md`.

## 6. When a decision won't come — paint it hot pink

**Do not pause mid-step to noodle on one color.** If a value can't be snapped
to an obvious existing one, point it at the marker and move on:

```css
--UNDECIDED-color: #ff00ff;
```

Better to see a screaming page and fix a dozen of them together, thoughtfully,
than to stall a structural pass on a single hue. `/palette` makes them
impossible to miss, and a guard fails the build if any token resolves to the
marker, so none can ship.

**There is no hot pink for a LENGTH.** A wrong hue is loud and harmless; an
absurd border-width breaks the layout and a plausible one is invisible. So the
non-color vocabularies get the other half of the same discipline — **snap to
the nearest step, keep moving, and write the objection down here.**

**The quibble list.** Anything a surface's conversion made you want to argue
about, recorded when it comes up and settled together at the end, when there is
a whole app to look at rather than one screen. The failure this prevents:
"don't quibble" quietly meaning "your objection evaporated".

| raised at | the quibble |
|---|---|
| *(empty — add as the sweep surfaces them)* | |

## 7. Open

- **A guard has to tell bespoke-BY-INTENT from bespoke-by-laziness** (Joel).
  The vocabularies exist to answer *"are we going crazy-stupid with bespoke
  numbers?"* and *"before I make up a value, should I check whether it fits a
  vocabulary?"*, and neither requires bespoke to be rare — boards are almost
  always bespoke, correctly. Today `vocabularies.test.ts` knows two states,
  converted and `pending`, and `pending` means *nobody has looked yet*, which
  is exactly what a deliberate bespoke value is not. What is missing is a third
  state, marked AT THE DECLARATION with its reason, which the guard reads and
  COUNTS rather than fails on. `SelectionList.module.css` already writes the
  annotation by hand for its row padding; nothing reads it. **Due before the
  first game area**, since that is where the count either stays legible or
  stops meaning anything.
- **The vocabulary VALUES are provisional** and get tuned as areas convert.
  `0.4rem` is deliberately absent from the spacer scale: it and `0.5rem` are
  the two most-used values in locked surfaces, which is what
  difference-without-distinction looks like, so every `0.4` becomes
  `--spacer-4` at its area's pass, and if converting one loses something real
  that is when a member gets added.
- **Owed to tile-feedback**, and it stays here until that plan folds: the
  dim-up rule wants restating in light-mode language, and
  `--tile-disabled-color` cannot be one token — a delta frozen into an
  absolute is right for exactly one starting point, and the tile ramp has
  five.
- **The monospace surfaces** — nine declarations across seven files, none a
  considered decision — are decided once (`setup-form/todo.md`) and applied
  per game, deliberately NOT swept (Joel).
