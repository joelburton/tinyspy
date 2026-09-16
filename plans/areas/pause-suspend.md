# Area: pause-suspend

The folders it reads: `pause-suspend`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN, the prose pass done 2026-09-16.** Roster agreed (Joel: *"audit
the area"*) and stamped `cs-met-pause-suspend`; every file read. Thirteen
findings: the prose ones — F-1 to F-5, F-10, F-12 — are worked, and so are F-6
and F-7. The four that remain each carry a decision and are presented one at a
time: F-8, F-9, F-11, F-13.

## The roster

`src/common/pause-suspend/` — every file `cs-met-pause-suspend`:

- `pause.ts` — `computePause`, the pure rule: given who is on the channel and
  who is expected, is the game paused and who is missing
- `pause.test.ts`
- `PauseBoundary.tsx` — renders the play surface OR the overlay, never both;
  the unmount is the contract
- `PauseBoundary.test.tsx`
- `PauseOverlay.tsx` — the banner in the play surface's slot: the roster with
  present/away discs, "X paused the game", Resume, and the two escapes
- `PauseOverlay.module.css`
- `SuspendConfirmationBlockingModal.tsx` — the suspend question, rendered by
  hand (the `todo.md` Soon)
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
players expected on it and answers "paused, and who is missing"; an empty
roster is not everyone missing (the first render has no roster yet) and an
unknown id on the channel is nobody. **The gate** — `PauseBoundary` takes one
boolean and renders the play surface or the overlay, and it UNMOUNTS the play
surface rather than hiding it, so every PlayArea's local state resets on
resume for free; that is the contract its test defends. **The banner** —
`PauseOverlay` draws the whole expected team with a filled disc for present and
a hollow gray ring for away, "X paused the game" with Resume for a manual
pause, and the two escapes from a pause that will not clear, Back to club and
End game, both `GamePage`'s bindings because the overlay itself is unmounted
the moment it is not needed. **The question** —
`SuspendConfirmationBlockingModal` wraps the shared confirm with the suspend
words, and is the one question in the app not asked through `askConfirmation`.
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

## Notes

- **`common.games.paused` is a column nothing on the FE reads or writes** —
  `docs/common.md` says so ("exists for future presence-pause durability").
  SQL is not this area's roster; recorded for whichever area reads
  `common.sql`'s schema, so the question is asked with the file open.
- **"Keep playing"** is the cancel label of both the suspend question and
  `NEW_GAME_CONFIRM`; `e2e/new-game-shortcut.e2e.ts` clicks it for the latter.
  Nothing wrong, worth knowing when F-11 moves the words.
- `docs/mobile.md`'s readiness table lists pause + timer as mobile-ready in
  the header; the overlay itself is not in the table.

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

- [ ] the whole area re-read in one sitting after the last group — with the
      effect-name grep over every file touched
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
