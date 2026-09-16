# Area: pause-suspend

The folders it reads: `pause-suspend`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN, the closing re-read done 2026-09-16.** Roster agreed (Joel:
*"audit the area"*) and stamped `cs-met-pause-suspend`; every file read. The
audit's thirteen findings are all worked. The re-read — every roster file end
to end, then every file the area touched outside the folder, with the
effect-name grep and a grep of each worked finding's fault class over the
siblings — found **seven more, F-14 to F-20, none worked**. The `doc.md`
harvest is done. Then the blessing, which is Joel's.

## The roster

`src/common/pause-suspend/` — every file `cs-met-pause-suspend`:

- `pause.ts` — `computePause`, the pure rule: given who is on the channel and
  who is expected, is the game paused (a boolean since F-14)
- `pause.test.ts`
- `PauseBoundary.tsx` — renders the play surface OR the overlay, never both;
  the unmount is the contract
- `PauseBoundary.test.tsx`
- `PauseOverlay.tsx` — the banner in the play surface's slot: the roster with
  present/away discs, "X paused the game", Resume, and the two escapes
- `PauseOverlay.module.css`
- `suspendConfirm.tsx` — the suspend question's words, built per game title
  (written by F-11, replacing `SuspendConfirmationBlockingModal.tsx`)
- `doc.md` (lede + intro + Details, written in the prose pass) · `todo.md`
  (one Soon)

Evidence, read and left:

- The two callers: `game-page/useCommonGame.ts` (calls `computePause` on
  `players` minus conceders, unions it with the manual pause, forces `paused`
  false at `ended_at`, and owns `sendSuspend`) and `game-page/GamePage.tsx`
  (renders `<PauseBoundary>` with `activePlayers`, binds the overlay's
  `act-end-game` hidden-unless-paused, and holds `confirmingSuspend` for the
  suspend question's third shape). `game-page/GamePage.test.tsx` covers the
  three shapes of back-to-club.
- `members/Dot.tsx` + `Dot.module.css` (the `--dot-*` overrides the roster
  uses), `members/ActorMention.tsx` (`DotActor` and what `show` means),
  `actions/ActionButton.tsx`, `buttons/StandardButton.tsx`,
  `actions/boundAction.fixture.ts`, `floating-panels/ConfirmationBlockingModal.tsx`.
- `realtime/useRealtimeReconnect.ts` — "the deadlock note", which the overlay's
  `actBackToClub` note now names (F-3).
- `docs/states.md` → paused, Suspended vs terminal, Leaving the game page;
  `docs/ui.md` → the no-reflow rule (the overlay is its canonical example),
  Confirm modals, Back to club, `<PauseButton>`; `docs/common.md` → the
  `paused` column and the End-game placements; `docs/games/connections.md` →
  Pause; `docs/naming.md`'s shared-names row; `docs/mobile.md`'s readiness
  table.
- `e2e/suspend-dialog.e2e.ts` (drives the suspend question end to end),
  `e2e/setgame.e2e.ts` (meets the presence-pause text), `e2e/new-game-shortcut.e2e.ts`.

## What the folder is, in one paragraph

Three files with a job each, and a fourth the todo already sentences. **The
rule** — `computePause` takes the ids on the game's realtime channel and the
players expected on it and answers "paused" (it answered "and who is missing"
too until F-14 found nothing read it); an empty roster is not everyone missing
(the first render has no roster yet) and an unknown id on the channel is
nobody. **The gate** — `PauseBoundary` takes one
boolean and renders the play surface or the overlay, and it UNMOUNTS the play
surface rather than hiding it, so every PlayArea's local state resets on
resume for free; that is the contract its test defends. **The banner** —
`PauseOverlay` draws the whole expected team with a filled disc for present and
a hollow gray ring for away, "X paused the game" with Resume for a manual
pause, and the two escapes from a pause that will not clear, Back to club and
End game, both `GamePage`'s bindings because the overlay itself is unmounted
the moment it is not needed. **The question** — `suspendConfirm(title)` is the words, and `GamePage` awaits
them through `askConfirmation` like every other question in the app (F-11; it
was a component rendered from a page flag when the area opened).
`useCommonGame` decides who counts (players minus conceders), unions presence
with the manual pause, and forces the flag false once the game has ended so
the terminal result can render.

## Findings

### F-pause-suspend-1 · `intro-owed` · `doc.md` is two sentences and the design lives in three docstrings

The `## Intro to area` owed: what a pause is for (the Zoom call has stalled —
someone is missing, or someone asked for a break), the two sources and that
they union, the one boolean the boundary takes and the unmount that makes
every game's pause-reset free, the overlay as the roster you are waiting on
plus the two ways out when presence never comes back, and where suspend sits
beside it (a different word for a different thing, owned by `states.md`).
`## Details`: why `computePause` is a function and not a hook (the channel
must attach every handler before it subscribes, so one hook owns it); the
"should this survive a pause?" rule for new game state; who decides the
roster (`useCommonGame`, minus conceders, invited-not-joined still counted);
the game-over short-circuit; why the escapes are `GamePage`'s bindings; the
render tree (`GamePage` → `PauseBoundary` → the game's PlayArea | `PauseOverlay`,
and the suspend modal beside it). Most of this is written — in
`computePause`'s docstring, `PauseBoundary`'s, and `states.md` → paused — so
it moves rather than being rewritten.

**WORKED 2026-09-16.** The lede says in plain words what the folder is for.
The intro is five narrative paragraphs: why a missing player has to stop the
game at all (nobody watches who is not playing, so somebody gone means the call
has stalled) with the tea-break beside it, then the rule, the gate and the
banner in the order a reader meets them, and suspend as the different word it
is. `## Details` took the five sharp things — why `computePause` is a function
and not a hook, who decides the roster plus the game-over short-circuit, the
"should this survive a pause?" rule, why the escapes are `GamePage`'s bindings,
and the render tree with the suspend question drawn as the boundary's sibling.
`common/pause-suspend` is off `INTROS_OWED`, and the guard bit when the intro
landed before the row came off.

### F-pause-suspend-2 · `paused-vs-suspended-thrice` · The paused ≠ suspended paragraph is written three times, and one copy is stale

`pause.ts` (lines 16–21 and 31–34), `PauseOverlay.tsx` (lines 66–76) and
`docs/states.md` → paused each define both words. `states.md` is the owner —
`pause.ts` says so and then defines them anyway. `PauseOverlay`'s version also
says the concept "surfaces in the ClubPage's 'Suspended games' section": there
is no such section — the club list draws a per-row flag (`current` /
`suspended` / `completed`), and `ClubPage.tsx` itself cites `states.md` → "no
special 'suspended' category". One home: the docstrings say the word and
point at `states.md`.

**WORKED 2026-09-16.** `states.md` is the only definition now. `pause.ts` keeps
one sentence of the distinction and points there; `PauseOverlay`'s eleven-line
version is a clause. The "ClubPage's 'Suspended games' section" went with it —
there is no such section to describe.

### F-pause-suspend-3 · `stale-claims` · Seven claims that describe something the repo no longer has

- `PauseBoundary` docstring: "the timer keeps a single anchor" — the clock is
  a tick count; nothing is anchored (`timer/doc.md`).
- `PauseBoundary` docstring: "See `docs/games/connections.md` → 'Pause on
  disconnect'" — the heading is "Pause (presence-driven + manual)", and it
  points back at `states.md`.
- `PauseBoundary` prop `actBackToClub`: "See PauseOverlay + the deadlock
  note" — the note is `useRealtimeReconnect`'s docstring; name it.
- `PauseOverlay` lede: "Banner + dim overlay" — its own stylesheet's header
  says "no backdrop dim — there's nothing behind it to dim".
- `PauseBoundary.test.tsx` header: "Not covered: the precise PauseOverlay copy
  variants (those belong with PauseOverlay's own future tests)" — no such file
  exists or is planned, and the specs below it DO assert both texts
  ("Waiting for", "paused the game").
- `docs/states.md` → paused: presence-only "reads 'Waiting for Bea to
  reconnect…'" — it reads "Waiting for everyone to connect…" over the whole
  roster, which is the design (a waiting player sees who is here too).
- `docs/naming.md`'s shared-names row: "Every game that uses one consumes it
  under this exact import" — no game imports `PauseBoundary`, `PauseOverlay`
  or `computePause`; `GamePage` and `useCommonGame` do, once. The row's point
  (one name, no per-game variant) holds; the sentence does not.

And the word: "copy" for a message's text in `PauseOverlay` (lede, the
`manuallyPausedBy` prop), `PauseBoundary` (the same prop), the boundary's test
header, and `states.md`'s "The overlay copy adapts". The folder is open, so
these become "text".

**WORKED 2026-09-16, and the grep found an eighth.** `docs/common.md` → "the
game waits for invitees" wrote the same dead sentence `states.md` did
("Waiting for Bea…"); it turned up by grepping the wrong WORDS repo-wide rather
than by reading the roster, and both now say what the overlay says — "Waiting
for everyone to connect…" over the whole roster, the invitee a hollow ring. The
timer anchor and the connections heading are gone from `PauseBoundary`'s
docstring, which points at `states.md` → paused instead; the deadlock note is
named once, as `useRealtimeReconnect`, in the overlay's `actBackToClub` note
rather than twice by hint; the overlay's lede stopped claiming a dim; the
boundary's test header no longer promises a PauseOverlay test file that was
never planned and says instead that it reads the overlay's text only far enough
to tell the two sources apart; and `naming.md`'s row keeps its point (one name,
no per-game variant) without claiming every game imports it. "copy" → "text" in
the boundary, the overlay, the test header, two spec names and `states.md`.
`docs/games/connections.md`'s table also stopped writing pre-reorg paths as its
link TEXTS, which was this area's to harvest.

### F-pause-suspend-4 · `prop-markers` · Both Props blocks wear `/**` on every prop

`PauseBoundary.tsx` (seven props) and `PauseOverlay.tsx` (six). The rule is
`//` on a member of a declaration; `SuspendConfirmationBlockingModal.tsx`
already has it right. The `expected` / `presentUserIds` / `manuallyPausedBy` /
`onResume` notes are also written TWICE, once per file, nearly verbatim —
the boundary passes them straight through, so its copy can be one line
pointing at the overlay's.

**WORKED 2026-09-16.** Both Props blocks are `//`. The boundary's notes group
the props it hands straight through — the roster pair, the manual-pause pair,
the two escapes — and point at `PauseOverlay`, whose Props say what each one
draws, so the pair of near-verbatim copies is one copy.

### F-pause-suspend-5 · `docstring-for-the-caller` · `computePause`'s docstring is a design essay; `PauseBoundary`'s carries the rule for new game state

`computePause` (30 lines) holds: what expected means (the caller's — good),
the paused/suspended definitions (F-2), why it is a pure function rather than
a hook (design → `doc.md`), and "why a conceder stops counting is argued at
that call site" (a pointer at a comment in another folder). A caller wants
the inputs, what "expected" means, the two outputs, and the two edge cases
the test pins (an empty roster is not paused; an unknown id is nobody).
`PauseBoundary`'s docstring keeps the unmount contract (that IS the
component) and loses the "design rule for new game state" paragraph and the
`useCommonGame` tour to `doc.md` → Details.

**WORKED 2026-09-16.** `computePause`'s docstring is four short paragraphs: what
it answers, the two inputs (with "expected" as the caller's call, and why the
club's list is the wrong one) and the two outputs, the two edge cases the test
pins, and the word. Why it is a function rather than a hook moved to `doc.md` →
Details, and the pointer at a comment in another folder is gone — who counts as
expected is `doc.md`'s to say. `PauseBoundary`'s keeps the unmount contract and
what follows from it for a caller, and lost the new-game-state rule and the
`useCommonGame` tour to the same section. The suspend wrapper was read in the
same pass: its third paragraph re-listed the shared modal's behavior — scrim,
trapped Tab, Enter, Esc — and is a clause pointing at the component that owns
it.

### F-pause-suspend-6 · `overlay-second-guesses-boundary` · `PauseOverlay` returns null on a condition the boundary already decided

`PauseOverlay` line 90: `if (!someoneMissing && !manuallyPausedBy) return null`.
It is only ever rendered by `PauseBoundary`, only when `paused` is true, and
`paused` is `computePause(presentUserIds, activePlayers).paused ||
manuallyPausedBy !== null` on the same `activePlayers` the overlay receives as
`expected` — so the two answers cannot differ today. If they ever did, the
boundary would have unmounted the play surface and the overlay would draw
NOTHING: a blank slot where the game was, with no message. Options: (1) drop
the guard — the boundary decides, the overlay draws what it is given; (2)
keep the guard and make it scream (`console.error`), since the blank slot is
a bug and silence is the wrong volume; (3) leave it. Recommend (1): one
decision, made once, in `useCommonGame`.

**WORKED 2026-09-16, as option (1).** The early return is gone; `someoneMissing`
stays, because the roster block is what reads it, and the comment above it now
says the boundary owns the paused decision. Joel asked first whether the guard's
state is reachable at all, and it is not: with `manuallyPausedBy` set the guard
cannot fire, and with it null `paused` required `presencePaused`, which is this
same predicate over the same two values — `GamePage` passes `activePlayers` as
`expected` and the same `presentUserIds`. Nor can the two read different
snapshots: both are computed in one render pass, and the presence handler builds
a fresh `new Set` per sync rather than mutating one. The `ended_at` clause only
makes `paused` falser. What would make the state reachable is a SECOND caller
computing `paused` from something other than the roster it passes — the tests
are the nearest thing today, and no spec combines `paused={true}` with an empty
`expected` and no manual pauser.

### F-pause-suspend-7 · `optional-props-one-caller` · Four props are optional for the tests' sake

`manuallyPausedBy`, `onResume`, `actBackToClub` and `actEndGame` are `?` on
both components. The one caller, `GamePage`, always passes all four. The
optionality exists so `PauseBoundary.test.tsx` can render without them —
and the overlay then has to branch on their absence (`onResume &&
manuallyPausedBy`, the `? … : null` around `.actions`), which is a branch no
player ever reaches. Options: (1) required, and the tests pass what
`GamePage` passes (`boundActionFixture` already exists for the two actions;
`vi.fn()` for `onResume`); (2) leave. Recommend (1): a default is a decision,
and this one is "the overlay can be drawn without its escapes", which is not
true anywhere.

**WORKED 2026-09-16, as option (1).** Joel: *"it seems like a poor idea to make
things optional just for a test."* All four are required on both components, and
`manuallyPausedBy` is required-but-nullable — `Member | null` has the two states
the fact has, where the `?` added a third that meant the same as `null`. The
overlay lost both branches with them: the `.actions` ternary is a plain `<div>`,
since the two escapes are always there now, and the Resume gate is
`manuallyPausedBy &&` rather than `onResume && manuallyPausedBy`. Nine renders
in `PauseBoundary.test.tsx` gained the four through an `escapes()` factory —
a factory and not a shared const because the vitest config sets no `clearMocks`,
so a module-scope `vi.fn()` would carry one spec's clicks into another's count.
Every spec that asserts on one of the four still passes its own.

### F-pause-suspend-8 · `expected-prop-name` · `expected` says "expected what?"

The boundary and the overlay call the roster `expected`; `GamePage` passes
`activePlayers`; `useCommonGame`'s comment calls it "the presence-pause
roster". Three names for one list. Options: (1) `roster` — what the overlay
draws IS a roster, and "roster" is the word the docstrings and `states.md`
already reach for; (2) `activePlayers`, matching the caller's name end to end;
(3) leave. Recommend (1); (2) drags "active" (a word `states.md` uses for
view state) into a component that only lists people.

**WORKED 2026-09-16 as `players`, not the `roster` this finding recommended.**
The re-verification turned up a ruling the audit had missed: `docs/naming.md` →
player says that inside game-context code the variable is `players` with type
`Player[]`, and these two components are game-context code — `computePause`'s
own parameter already obeys it. Two things also told against `roster`: the word
already means the sixteen gametypes through much of `docs/`, and `activePlayers`
would drag "active" in (not forbidden — the no-`'active'` convention is about
play_state VALUES — but it is the overload that convention warns about). Joel:
*"is this just 'what to call the prop'? if so, i'll take 1."* Renamed in both
components, `GamePage`'s call, and the test's nine renders. The CSS keeps its
`.roster*` classes, which name the visual block, and `states.md` keeps calling
it the roster in prose; "expected" survives only where it is the CONCEPT — who
is expected — in `computePause`'s docstring and the stylesheet's header.

### F-pause-suspend-9 · `both-on-a-leading-actor` · The manual-pause sentence forces `show="both"` where the actor already leads

`<DotActor actor={manuallyPausedBy} show="both" /> paused the game.` with a
comment: dropping the name on a phone would leave "● paused the game." Joel's
ruling on codenamesduet's banners (2026-09-12, in that game's `todo.md`) was
the opposite: lead with the actor — "● moth gives remaining clues" — and the
sentence then takes the DEFAULT `auto`, because the disc carries identity.
This sentence already leads. Options: (1) take the default, so the pause
banner reads like every other actor sentence on a phone; (2) keep `both` and
write the reason it differs; (3) leave. A UX change, so it is Joel's call —
recommend (1) for consistency, with the "Someone paused" pseudo-member
(`useCommonGame`) as the case to check first, since its disc has no color.

**WORKED 2026-09-16 as option (2), Joel's call** (*"do 2"*): the pixels are
unchanged and the comment stops arguing with the codenamesduet ruling. It now
says why this one sentence overrides `DotActor`'s `auto` — the banner IS the
whole message, it has 32rem to itself so no username can overflow it, and who
stopped the game is worth the width on a phone too. The ruling that a leading
actor takes the default still stands for a line in a stack; this is the
recorded exception, and the reason is at the call.

Read in passing, and it cost nothing either way: a spectating club member who
pauses resolves to the pseudo-member `{ username: 'Someone', color: '' }`,
whose disc falls back to body text — so that line names nobody on a desktop
either.

### F-pause-suspend-10 · `todo-premise` · The Soon says no e2e drives the suspend question; one does, in seven places

`todo.md`: "No e2e drives this question (checked for 'Suspend this game?')".
`e2e/suspend-dialog.e2e.ts` asserts that text visible, hidden and absent, and
clicks "Keep playing" — the whole dialog, solo and multiplayer, keyboard
included. The fix's SHAPE survives it (`askConfirmation` renders the same
`ConfirmationBlockingModal`, so the text handles hold), but the todo's test
paragraph is wrong and has to name the e2e as what must stay green. Corrected
in the prose pass; it is the second false absence in two areas.

**WORKED 2026-09-16.** Re-verified against the file rather than taken from the
audit: the todo's Tests paragraph now names `e2e/suspend-dialog.e2e.ts` as what
must stay green UNCHANGED, and says what it holds — "Suspend this game?"
visible, hidden and absent, Esc cancels, Enter confirms, "Keep playing" read
out of the dialog's Tab ring, solo and multiplayer — with the reason the handles
survive (`askConfirmation` renders the same `ConfirmationBlockingModal`).

### F-pause-suspend-11 · `suspend-question-by-hand` · The one question not asked through `askConfirmation`

The `todo.md` Soon, recorded here so the area works it and the file leaves
the roster. Everything is already decided in the todo: the multiplayer branch
of `requestBackToClub` becomes `if ((await askConfirmation(suspendConfirm(title)))
=== 'confirm') sendSuspend()`, the flag and the render in `GamePage` go, the
question is a FUNCTION of the title and lives in this folder replacing the
wrapper file. `GamePage.test.tsx` already mocks `askConfirmation` and its
suspend specs adapt; `e2e/suspend-dialog.e2e.ts` is the thing that must stay
green (F-10). `GamePage` is blessed; closed is not locked.

**WORKED 2026-09-16, on Joel's ruling — and the presentation of it got the
framing backwards, which is the part worth keeping.** Offered as "make this one
match the others", it drew the right objection: the wrapper's page-scoped render
is the only one that DISCARDS its question when the game page goes away, and the
four service-backed questions are the ones misbehaving. Traced and confirmed
statically — `<ConfirmationHost>` is a root sibling of the routed content
(`App.tsx`), `settleConfirmation` is called by its three buttons and nothing
else, so a peer's suspend navigates your tab to the club page with "Restart this
game?" still up; and `useBoundAction` reads its handlers from a ref AFTER the
await, deliberately, so answering it fires `replay_board` on the game you just
left. Joel: *"it still seems like there's no reason for f11 to not join the
others in using askConfirmation. we've got a minor bug with askConfirmation, but
we should change to that so they all act alike."*

What landed: the multiplayer branch of `requestBackToClub` is
`else if ((await askConfirmation(suspendConfirm(commonGame.title))) === 'confirm') sendSuspend()`,
and the `confirmingSuspend` flag, its render and the wrapper file are gone
(`git rm`, so the stamp guard reads the index). `suspendConfirm.tsx` holds the
words — a `.tsx` and not a `.ts` because `message` is a `ReactNode` and the
title is `<strong>`-wrapped. `GamePage.test.tsx` stops looking for the dialog's
text and asserts the service was asked with `suspendConfirm('Secrets')`; a
planted wrong title failed the spec, so that assertion tests the title rather
than passing on a loose deep-equal. The answer-no case is new. Six prose homes
named the wrapper and were retargeted: `docs/ui.md` (three), `docs/states.md`,
`docs/common.md`, `docs/code-conventions.md`, and the render trees in
`floating-panels/doc.md` and `game-page/doc.md` — plus
`ConfirmationBlockingModal`'s docstring, which had named this file as its one
exception and now says there is none.

**The e2e is the proof and has NOT been run.** `e2e/suspend-dialog.e2e.ts`
should hold unchanged; running it needs Joel's word.

**FILED**, on Joel's word (*"file the todo in floating panels as a bug. i'm not
going to answer questions about it now; we'll answer those when we get to that
bug."*): `src/common/floating-panels/todo.md` → Bugs holds the trace, the
`replay_board` half, and the two things that area has to decide — what "the
asker went away" means, and whether an answer should run through a ref that
outlived its component. Neither is decided, and neither blocks this area.

### F-pause-suspend-12 · `unnamed-effect-in-test` · `MountCounterChild`'s effect has a five-line header and no name

`PauseBoundary.test.tsx` line 58: `useEffect(() => {` under a comment about
StrictMode double-invocation. The convention's own test is "deserves a
header comment, deserves a name": `countRealMounts`.

**WORKED 2026-09-16.** `countRealMounts`. The same file's note above the
End-game spec also lost its `/**` for `//`: it sits on a call, not a
declaration, which is how the blessed `timer` tests write a spec note.

### F-pause-suspend-13 · `explainer-under-manual-pause` · The overlay's explanatory line describes presence rules under a manual pause

"The game waits until everyone's joined and connected, and any player can
pause it. Your in-progress selections reset on every pause." is drawn for
BOTH sources. Under a manual pause everyone IS connected, and the first
clause answers a question nobody asked. Options: (1) draw the "waits until
everyone's joined" sentence only with the roster and the "any player can
pause it … selections reset" sentence always; (2) leave. Recommend (1); the
text itself is Joel's and stays as written.

**WORKED 2026-09-16 with Joel's text, and the third sentence deleted.** Neither
of the options offered was taken: the line is now one sentence per source, in
his words — presence draws "The game is waiting until everyone is joined and
connected.", a manual pause draws "Any player can pause the game.", and a pause
with both sources draws both. "Your in-progress selections reset on every
pause." is gone entirely — Joel: *"will just be confusing for people to read."*
The reset it described is a rule for whoever writes a game's state, and its home
is `doc.md` → Details, not the banner. Nothing asserted any of that text, so no
test moved.

### F-pause-suspend-14 · `missing-has-no-reader` · `computePause` returns `missing`, and nothing reads it

`computePause` answers `{ paused, missing }`. The one caller takes the flag
alone — `useCommonGame`: *"`computePause` also answers WHO is absent; the
overlay derives that itself from `activePlayers` + `presentUserIds`, so only the
flag is taken"* — and the overlay draws the WHOLE roster with a present/away
disc per row, so it has no use for a missing-only list. A grep of `src/` for
`.missing` finds no reader outside `pause.ts` and its test. Yet the docstring
says `missing` comes back *"in roster order — the order the overlay reads names
in"*, the test header repeats it, and the order spec's comment quotes a banner
that does not exist: *"Bea and Cade have gone offline" should render in roster
order*. Both were written this area (F-5 rewrote the docstring around a reader
it never checked for), so this is the re-read's own class: prose the day's
fixes wrote.

Options: (1) the function answers the question its caller asks —
`computePause(presentUserIds, players): boolean`, one line
(`players.length > 0 && players.some((m) => !presentUserIds.has(m.user_id))`),
the docstring loses the `missing` paragraph, `useCommonGame` reads
`const presencePaused = computePause(presentUserIds, activePlayers)`, and the
test keeps its five cases on the flag and drops the order spec and the
`missing` assertions; (2) keep the return shape and make the prose honest —
"`missing` is returned for a caller that wants names; today only the flag is
taken" — and fix the order spec's quoted banner; (3) leave. Recommend (1): a
return value with no reader is a claim, and this one has been recruiting false
sentences since it was written. If Joel would rather keep a list-shaped answer
for a future reader, (2) is the honest version of it.

**WORKED 2026-09-16, as option (1)** (Joel: *"1"*). Re-verified before working
it: `computePause` has one caller and no file reads `missing`. The function is
one line returning a boolean; its docstring says the overlay marks each player
present or away itself, in place of the sentence that claimed it read a list.
`useCommonGame` reads the boolean straight and lost the two-line comment
explaining why it ignored half the answer. The test keeps its five cases on
the flag — the four-case matrix plus the unknown-id case — and dropped the
`missing` assertions, the order spec and the phantom banner it quoted; its
header no longer promises roster order. `tsc -b`, the folder's, the caller's
and the guard tests, and eslint on the three files are green. Prose elsewhere
that names `computePause` (common.md, naming.md, connections.md) describes the
boolean and needed nothing.

### F-pause-suspend-15 · `suspend-question-still-a-panel` · Three sentences still describe the question as something the page renders

F-11 retargeted six prose homes and missed three, two of them in files it
touched:

- `game-page/GamePage.tsx`, the component docstring: *"the panels that
  outlive a pause — chat, the scratchpad, help, the suspend confirm"*. The
  page renders no suspend confirm now; it awaits a question. Blessed file;
  closed is not locked.
- `docs/ui.md` → Confirm modals, the paragraph above the standing questions:
  *"the suspend question below is the one still rendered by hand"* — directly
  contradicted by the Suspend bullet six lines down, which F-11 wrote.
- `docs/ui.md` → Consistency across games, the "Back-to-club +
  suspend-confirm" bullet: *"Non-terminal games show the suspend-confirm modal
  first; terminal is a single-click back"* — predates the area, but a solo
  non-terminal game shows nothing, and the three shapes are written twice
  elsewhere in the same doc.

Options: (1) fix all three — the docstring lists chat, the scratchpad and
help, the ui.md paragraph drops its last clause, the bullet says "asks first
when there are peers" and points at the Suspend bullet; (2) leave. Recommend
(1); it is the F-11 sweep finishing.

**WORKED 2026-09-16, as option (1)** (Joel: *"1"*). The docstring lists three
panels; the ui.md paragraph ends at "some of them"; the consistency bullet says
it asks first only when there are peers to surprise and links the Confirm
modals section, where the three shapes are already written.

### F-pause-suspend-16 · `timer-accumulator` · `docs/common.md` names a pause-accumulator the clock does not have

`docs/common.md` → "Should this survive a pause?": *"State that must survive a
pause goes either in the DB or in `useCommonGame` above the boundary (members,
presence, the timer's pause-accumulator)."* The clock is a tick count in
`common.timers` and pauses need no bookkeeping — the same doc says so 440 lines
earlier, and `timer/doc.md` spends three paragraphs on why there is no
accumulator. F-3 removed the sister claim ("the timer keeps a single anchor")
from `PauseBoundary`'s docstring and did not grep the class. Options: (1) the
parenthetical reads "(members, presence, the clock)"; (2) leave. Recommend (1).

**WORKED 2026-09-16, as option (1)** (Joel: *"1"*). One word: the parenthetical
names the clock. A grep of `docs/` and `src/common/` for "accumulator" now hits
only sentences that name the design the clock rejected — `common.md`'s own
clock section and `timer/doc.md`.

### F-pause-suspend-17 · `naming-three-state` · `docs/naming.md` describes a club three-state that uses both words wrongly

`docs/naming.md` → Clubs: *"See `common.md` for the full club model —
invariants, lifecycle, three-state (active/paused/completed) semantics."*
`common.md` has no such three-state. The club list's per-row flag is current /
suspended / completed (`states.md` → Suspended vs terminal), "active" is the
word `states.md` bans for a state, and "paused" is the transient stop this
folder implements, not a shelf. Options: (1) the sentence ends at "lifecycle",
or says "the current / suspended / completed flag"; (2) leave. Recommend (1).

### F-pause-suspend-18 · `connections-eliminated-pointer` · `docs/games/connections.md` files a pause defect in a memory file

`docs/games/connections.md` → Pause, the compete caveat: *"an eliminated player
is still in `members`, so leaving their tab drops their Presence and pauses the
game for survivors. Annoying but tolerable for v1 — see `deferred.md` / the
next-session pickup memory for the planned fix."* The claim holds — this area's
roster rule drops CONCEDERS only, and `connections._maybe_finish_compete`
eliminates on `mistake_count >= 4` without touching `conceded` — but the
pointer is dead twice: `docs/deferred.md` has no such item, and a memory file is
not a doc. Nothing durable holds the planned fix. Who counts as expected is
this folder's rule and the exception is connections' to decide, so: (1) file it
in `src/connections/todo.md` (Soon — an eliminated player should stop counting
the way a conceder does, or the caveat is accepted and written as a rule) and
the doc sentence points there; (2) leave. Recommend (1).

### F-pause-suspend-19 · `copy-in-touched-docs` · The banned word in two docs the area touched

F-3 turned "copy" into "text" across the roster and `states.md` and did not
grep the two other docs the area edited: `docs/common.md` → the manifest
section (*"labelFor / Help copy … gets distinct copy per-manifest"*) and
`docs/code-conventions.md` → the `error.message` guard (*"defeats the copy
table"*). Options: (1) "text" in both; (2) leave. Recommend (1).

### F-pause-suspend-20 · `overlay-prose-nits` · Two nits in the overlay's own prose

- `PauseOverlay.module.css`'s header: *"a softly-tinted surround to make the
  'paused' framing visually distinct"* — `.overlay` paints
  `--default-bg-color`, which is `#ffffff`, on a `#fafafa` page. The framing is
  the border; nothing is tinted.
- `PauseOverlay.tsx`'s docstring has one 140-character line where F-3's edit
  joined two sentences ("…still waiting on. Names stay black…").

Options: (1) the header says "a bordered white banner" and the line wraps;
(2) leave. Recommend (1).

## What checked out

- The unmount contract is real and tested: the mount-counter spec proves the
  play surface leaves the DOM.
- `role="status"` on the overlay is the test handle (`getByRole('status')`);
  keep it.
- Every token the stylesheet reads resolves, and the `--dot-*` overrides are
  the documented seam in `Dot.module.css`. The centered action row is
  `ui.md`'s recorded exception to the right-justified modal row.
- Both escapes go through PostgREST, and `useRealtimeReconnect` is the
  automatic path; the overlay is the manual backstop it names.
- `GamePage`'s `act-end-game` for the overlay is hidden unless paused, so it
  and the game's own binding are never live together; `manifest.endGame` is
  required, so no game lacks the hatch.
- No effect in the folder's source is a bare arrow (the only one is F-12, in
  a test).

At the re-read:

- **The effect-name grep** over every file the area touched finds two bare
  arrows, both one-liners: `GamePage.tsx`'s cleanup-only
  `useEffect(() => () => setGameMenuSections([]), [])` and a mount counter in
  `GamePage.test.tsx`. Both are the convention's "when not to bother" case —
  no header comment of their own, nothing to scan past — and are left.
- **Every date the area wrote is a commit date**: fourteen `2026-09-16`s in
  this file against eight commits of that day, and the one in
  `code-conventions.md` (Joel's "if they're non-trivial" ruling) is
  `670da79b`, 2026-09-16.
- **The menu claim in two docs holds**: `game-page/doc.md` and `ui.md` say a
  game's menu sections vanish on pause because the PlayArea's own effect
  clears them on unmount — wordiply's `publishGameMenu` returns
  `() => menu.setGameSections([])`, and the shell's own clear is only at page
  unmount.
- **"Keep playing"** is the cancel label of both the suspend question and
  `NEW_GAME_CONFIRM`, and `e2e/new-game-shortcut.e2e.ts` clicks it for the
  latter. Nothing is owed: F-11 moved the words unchanged, and the two
  questions are never on screen together.
- **`docs/mobile.md`'s header table is right** — pause + timer ride the info
  page. The overlay's own absence from that doc is now `todo.md` → Soon.
- The eight sibling greps for the worked findings' fault classes — the
  deleted wrapper's name, the page flag, "rendered by hand", the dead banner
  texts ("Bea to reconnect", "gone offline", "everyone's joined", "selections
  reset"), "Pause on disconnect", "dim", "Suspended games", "copy" — are what
  found F-14, F-15, F-19 and F-20; the rest came from reading.

## Notes

The three items that stood here at the audit are placed: `common.games.paused`
is in `docs/deferred.md` → Common / architecture (no folder owns the common
SQL); "Keep playing" checked out, above; the overlay's missing mobile pass is
the folder's `todo.md` → Soon.

## Predicted test breaks

If F-7 makes the four props required: every `PauseBoundary.test.tsx` render
that omits them fails to typecheck (`tsc -b`), not at runtime — seven specs
to give fixtures. If F-8 renames `expected`: the same file and `GamePage.tsx`,
find-and-replace. If F-6 drops the guard: nothing asserts on the null case.
If F-11 lands: `GamePage.test.tsx`'s multiplayer suspend spec stops looking
for the question's text and asserts `askConfirmation` was asked with the
suspend words; `e2e/suspend-dialog.e2e.ts` should hold unchanged and is the
proof.

## Closing

- [x] the whole area re-read in one sitting after the last group — with the
      effect-name grep over every file touched (2026-09-16; F-14 to F-20 are
      what it found, and they are open)
- [x] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
      — the three notes are placed; waits on F-14 to F-20
- [ ] every file on the roster blessed, or its stamp says why not
