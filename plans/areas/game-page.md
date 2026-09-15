# Area: game-page

The folders it reads: `game-page`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-14, the closing re-read done 2026-09-15;
waiting on Joel's blessing.** Twenty-four findings: a prose group (F-1 to F-6)
and a decision group (F-7 to F-11) from the reading, and thirteen more from the
closing re-read (F-12 to F-24), every one worked or closed. On top of the
findings, the route was split into three components — see "The route split"
below. The folder's `todo.md` handed this area seven items from earlier areas
(F-11); one of them, the concern split of `playArea.module.css`, stays open
there by Joel's ruling, and the rest are worked, dissolved or closed. What is
left is Joel's: the blessing (five files this area created are `cs-unmet`:
`GamePageGate`, `GamePageLoader`, `NoSuchGamePage`, `InfoActionsRow` and its
test), and `e2e/bananagrams-block.e2e.ts`, whose selector F-9 changed and
which has not been run.

## The roster

Agreed 2026-09-14 (Joel: "these e2e's aren't part of this area"). The folder,
and nothing else:

- `GamePageGate.tsx` — the pre-flight "does this game exist" read
- `GamePageLoader.tsx` — `useCommonGame` and the wait for its answer
- `GamePage.tsx` + `.module.css` + `.test.tsx` — the shell, drawn from props
- `NoSuchGamePage.tsx` — `<ErrorPage>` in its Not-Found shape
- ~~`InfoActionsRow.tsx` + `.test.tsx`~~ — the info column's action row, every
  state (arrived from `common/terminal/` as F-11.3; moved on to
  `common/info-sheet/` 2026-09-15 at Joel's ask, with the outcome line's six
  rules as its own `InfoActionsRow.module.css` — the row classes stay in
  `playArea.module.css` because bananagrams composes them directly. Both files
  still `cs-unmet`; `info-sheet`'s area reads them)
- `gamePageCtx.ts` — what the shell hands a game
- `useCommonGame.ts` + `.test.ts` — the shared room: the row, the roster, the
  channel, presence, pause, suspend, the timer
- `useStandardGameActions.ts` + `.test.ts` — End, Concede and Restart, bound
  once per game
- `GameHeaderMenu.tsx` — the logo menu; the one subscriber to `gameMenuStore`
- `GameHelpCompanion.tsx` — the how-to-play panel frame (its `.module.css`
  went with the "Got it" button, 2026-09-15)
- `PlayAreaErrorBoundary.tsx` + `.test.tsx` — the boundary around a board
- `PlayAreaSlotLog.tsx` — the console breadcrumb + browser snapshot for a
  blank play area (was `PlayAreaMountLog.tsx`, two components; F-11.5)
- `playArea.module.css` — the shared play-surface stylesheet, five concerns
  wide (renamed from `PlayArea.module.css`; see below)
- `DeviceBlockNotice.tsx` + `.module.css` — the "needs a desktop" card
- ~~`useGameHasKeyboard.ts`~~ — moved to `common/keyboard/` (F-10)
- `doc.md` (a lede, on `INTROS_OWED` at the opening; the intro and Details
  written by F-1, harvested at the re-read) and `todo.md` (one Bug, six Soon,
  three Someday at the opening; one Soon open at the close)

No e2e is the area's own. `bananagrams-block.e2e.ts` drives `DeviceBlockNotice`
but is bananagrams'; `presence` and `suspend-dialog` are `pause-suspend`'s.

**Evidence, not roster:** `App.tsx` (hands the gate the URL's two parts and the
session, and nothing else — F-11.6 and the gametype move); `error-page/
ErrorPage.tsx` (took a `title` prop for this area's Not-Found page); `pause-suspend/
PauseBoundary.tsx` + `PauseOverlay.tsx` (take `actEndGame`); every game's
`PlayArea.tsx` (reads `GamePageCtx`); `bananagrams/components/PlayArea.tsx`
(the one `DeviceBlockNotice` caller); `word-entry/EntryBox.tsx` (the one caller
of `useGameHasKeyboard`, with `lists/FilterSelect.tsx` and
`bananagrams/hooks/usePlayerBoard.ts` citing it in prose but not calling it);
`menu/gameMenuStore.ts`; `core-css/base.css` (the `--z-` ladder,
`--game-chrome-height`, the `--tile-*` tokens).

Docs that describe it: `docs/ui.md` → GamePage header, GamePage menu, Layout
stability, Page-height fits the viewport, Interactive tile states, Tile
content; `docs/playarea.md`; `docs/states.md` → Lifecycle, Leaving the game
page; `docs/mobile.md` → Where each game plays; `docs/realtime-lost-events.md`.

Baseline at the opening: the folder's four test files pass (52 tests); `tsc -b`
and eslint clean.

## The route split — done 2026-09-14

Not a finding. Joel, reading `GamePage.tsx`: *"one of my goals is to make the
components more readable — some are hairy, which is leading to me letting you
do everything and then i don't understand things."* The file exported two
components, `GamePage` and `GamePageInner`, which is the defect `todo.md`
already records against `PlayAreaMountLog` ("the filename is the component" is
false there) and had never been recorded against this one.

**Three components, not two, and the third is the point.** `ClubPageLoader` is
the repo's precedent and its promise is *"it exists so `<ClubPage>` never holds
a club that might not be there."* The pre-flight alone does not keep that
promise — it hands down no loaded data — so the split that pays is:

- **`GamePageGate`** — does this game exist? One `select id`.
- **`GamePageLoader`** — `useCommonGame`, and the wait for its answer.
- **`GamePage`** — the shell, drawn from props. 647 lines to ~430.

Why three and not two is a hard constraint, not taste: React forbids calling a
hook conditionally, so `useCommonGame` cannot sit in the component that decides
whether to call it. The gate and the loader must be separate components.

Naming went `GamePageInner` → `LiveGame`/`GameRoom` → Joel's `GamePageStateLoader`
→ **Gate → Loader → Page**, so the two waits are distinguishable by name and
`GamePageLoader` means the same thing here as in `club/`. (`GameRoom` was
dropped because `docs/naming.md` already gives "room" to the club.)

What fell out, as predicted: five `commonGame?.` narrowings, the `clubHandle =
''` sentinel, and `if (!commonGame) return` inside the timeout effect. Two more
that were not: `isGameOver` and `gameOver` were the same expression computed on
either side of the guard, now one; and `useClubRoster`'s "no-ops on `''`"
comment described nothing.

**It dissolved `todo.md`'s only Bug, which is now deleted.** `act-back-to-club`
answered `active` before `clubHandle` loaded and then returned silently. There
is no such beat now — the loader does not render the page without a row, and a
row always carries its club — so the state is unrepresentable rather than
fixed. Its two tests went with it (`act-new-game-from-setup`'s "hidden until
the club handle is known" became "is active on a loaded game"; back-to-club's
"does nothing before the club handle is known" was deleted). Joel, on the entry
that outlived it: *"if there a bug that can't be reached, remove it."* The
`## Bugs` section is now empty.

**`ErrorPage` took a `title` prop** (Joel: *"i think we should use the ErrorPage
for no-such-game"*), defaulting to `'Error'`, and `diagnostics` became optional.
`NoSuchGamePage` is now `<ErrorPage title="Not Found">` with no `k=v` line,
which keeps the 2026-08-31 ruling that a missing game is a 404 and not a fault,
and its bespoke card and stylesheet are gone. `.heading` is
`--chrome-fault-color`, so "Not Found" draws in the fault red — raised, and
**Joel: "'Not Found' in red is fine."** Settled, not owed.

`ErrorPage.tsx` is stamped `cs-blessed-simple-page` and was edited; the stamp
was not touched.

## Findings

### The prose group — WORKED in one pass, 2026-09-14

F-1 to F-6 are done; each block below is the reading that found them, kept.
What the pass turned up that the audit had not:

- **Two of the audit's own claims were wrong, and the same mistake made both:
  counting mentions as callers.** `useGameHasKeyboard` has exactly ONE caller,
  `word-entry/EntryBox`. F-5 says "`FilterSelect` and bananagrams' board read it
  too" and F-10 says its readers are those three — neither calls it; both cite
  it in a docstring, because each is a control that takes focus away and has to
  give it back, which is the invariant this hook states. **F-10 is still open,
  but rewrite its evidence before deciding it** — the roster line above is
  corrected, and the hook's docstring now names the citation for what it is.
- **`GamePage`'s "the menu is the one thing on BOTH pages" was false** — the
  info switch rides both too, as the comment four lines up says. Rewritten.
  Not in F-5's twelve; found by reading the two comments together.
- **A five-line comment about menu ownership sat before `return (`, attached to
  nothing** — F-2's defect in miniature. The half that describes code moved onto
  `<GameHeaderMenu>`; the rest is doc.md's.
- **`unset_current_view`'s comment opened "errors logged, not surfaced" and its
  own body then said `runRpc` has already put a modal up.** The lede was the
  stale half. Rewritten — and `docs/deferred.md`'s matching item ("Acceptable
  for friends-alpha; revisit when there's a generic toast/error-surface layer",
  citing `// Fragile:` comments that no longer exist) is **deleted**: the
  user-visible surface it asks for is the fault modal, which ships.
- **"the three exits" counted Restart as one.** You do not leave. Both places
  now name the three actions instead of counting exits.
- **Three uses of the banned word "copy"** for a message's words, in
  `useCommonGame`, `gamePageCtx` and `GameHelpCompanion`. Fixed in passing.
- Two guard lists shrank: `folderDocs.test.ts`'s `INTROS_OWED` loses
  `common/game-page` (F-1), and `orphanedDocstrings.test.ts`'s `KNOWN` loses
  `GamePage.tsx › isGameId` (F-2) — that guard failed until the entry went,
  which is it working.

Kept deliberately: `.boardCol`'s debug tint and its "do NOT remove until Joel
asks"; `PlayAreaErrorBoundary`'s reload-path gap, which is `todo.md`'s F-11.7
and a decision, not prose.

### F-game-page-1 · `intro-owed` · `doc.md` is a lede, and the folder is on `INTROS_OWED`

Two sentences. It needs the `## Intro to area` narrative — what the page is
(one route, one shell, a hole a game fills), what the shell owns and what it
hands down, the shared room and why its name is stable, the three exits — and a
`## Details` for the arguments: the pre-flight read and why `useCommonGame`
cannot half-run; the pause/unmount contract and what state must live above the
boundary; the last-viewer-leaves write; why the menu's sections live in a store;
the count-up survives the end and the countdown does not.

### F-game-page-2 · `orphaned-docstring` · `GamePage`'s tree-shape docstring sits on `isGameId`

The 60-line docstring that draws the page's tree, the header rule, the menu
contract, the pause contract and the back-to-club asymmetry is followed
directly by `isGameId`'s own `/**` and the const — so it is attached to
nothing, and `GamePage` itself carries the (good) "does this game exist"
docstring further down. The shell's story belongs on `GamePageInner`, which is
the component it describes; some of it belongs in `doc.md` (F-1) and is
duplicated by the comments beside the code it describes.

Stale inside it: "Every game declares `help: ComponentType<{ onClose }>`" (it
takes `brand` too); "Chat (z-index 10000, above everything else)" (`--z-chat`
is 3100 on the ladder in `base.css`, and the number is not this file's to
state); "Help modal (when menu's Help item is active)" — also from the setup
dialog, but that one is not this page's.

### F-game-page-3 · `marker-pass` · `/**` on props and fields in six files, and one params block mixing both

- `GamePage.tsx` `Props`: all four props `/**`.
- `useCommonGame.ts`: every documented `CommonGame` field, and the four
  documented members of the return type literal.
- `useStandardGameActions.ts`: `mode`, `myConceded`, `selfSolved`,
  `offersEndForAll`, `onRestarted` are `/**` while `localFeedbackSlot` is `//`
  in the same block. `StandardGameActions`, `GameRpcClient`, `ConcedeResult`,
  `ReplayResult` are whole declarations and correct.
- `GameHelpCompanion.tsx` `Props`: `brand`, `size`, `children`.
- `DeviceBlockNotice.tsx` `Props`: all three.
- `PlayAreaMountLog.tsx`: correct throughout (`browserInfoLine` is a
  function).
- `gamePageCtx.ts`: correct — every member `//`, the type `/**`.

The other half of the rule — a rationale paragraph in a docstring — is where
this folder is heaviest: `useCommonGame`'s hook docstring argues the stable
channel name at length, `useStandardGameActions`'s argues why New game is
absent, `PlayAreaErrorBoundary`'s explains where it is mounted from. Each is a
`## Details` bullet or a comment on the line, not the hover.

### F-game-page-4 · `archaeology` · "used to", "old", "before this", "anymore", and one cite to a code review

- `GamePage.tsx`: "rather than the old one-way 'already submitted' latch"
  (the timeout edge); "This used to be a `display: none` in the button's own
  stylesheet"; "what the old full-height sheet did"; "the old 'Game info'
  menu item and the sheet's ✕"; the `manifest` prop's "(it did have one, and
  the dead branch rendered 'Unknown game type.' where nobody could reach it)".
- `useCommonGame.ts`: "Since clubs are now keyed by handle (no separate
  uuid)"; "(post-uuid-PK-drop)"; "No need to embed clubs(handle) anymore";
  "(An earlier comment here claimed Realtime echoes to the sender … wrong,
  though harmlessly so)".
- `GameHelpCompanion.tsx`: the whole second paragraph — "Before this, each
  game hand-rolled … boggle had drifted to a bare `<div>`".
- `GameHelpCompanion.module.css`: "Replaces the inline style each game's
  Help.tsx used to carry (code-review §4.5)" — a cite into a review that is not
  in the repo.
- `PlayArea.module.css`: "Validated on psychicnum, adopted by connections";
  "A touch more than the old 0.5rem"; "which was byte-identical across all
  four before this extraction".

Kept, because it is a decision and not history: `.boardCol`'s debug tint
("do NOT remove until Joel asks").

### F-game-page-5 · `stale-claims` · Twelve sentences the code no longer matches

- `CommonGame.club_handle`: "Lets the GamePage header render Back-to-club as
  a real `<Link>` (with browser-visible href on hover, middle-click…)". The
  page draws no such link: Back to club is `act-back-to-club`, a menu row
  that calls `navigate`. The one `<Link>` in the file is the no-such-game
  page's "← Back home".
- `GamePage.tsx` `Props.manifest`: "Used for the submitTimeout dispatcher …
  the right SVG for `<GameLogo>`, and the per-game `help` component" — also
  `endGame` (the overlay hatch), `scratchpad`, `name` (`ctx.brand`, the help
  title), `mode` (the scratchpad owner). Name the condition, not the list.
- `useCommonGame.test.ts` line ~198: "`set_current_view` is unconverted and
  only reads `.error`, so one default serves both" — it reads the envelope
  through `runRpc<SetAnswer>` now; the default serves both because both are
  converted.
- `useCommonGame`'s hook docstring, "Returns:", lists six of the eleven
  returns; `activePlayers`, `presentUserIds`, `sendSuspend`, `isMyTurn` and
  `failure` are documented on the return type instead. One home.
- `sendSuspend`'s comment: "Called by GamePage when the local user accepts the
  suspend-confirm modal" — also called with no dialog for a solo game, and as
  the pause overlay's Return to club.
- `GamePage.test.tsx` header: "the three actions the game shell binds for
  every game" — it binds four (`act-help` too); the file tests three.
- `useStandardGameActions.test.ts` header: "every action here has one" (a
  question) — Restart at terminal goes straight through, and the file's own
  case says so.
- `PlayArea.module.css` header: "Three things live here" — the shell, the
  readouts, the tile. The file also holds the local-feedback / swap boxes,
  `mobileFill`, `responsiveInfoCol`, `hugRectWidth`, and the whole feedback-
  mark vocabulary (`.dimInFlight` … `.yourTurnFlash`). `todo.md` already
  counts five concerns and owns the split; the header should at least count
  what is there.
- `useGameHasKeyboard`'s docstring describes only "the capture-input games …
  simulated caret" — `FilterSelect` and bananagrams' board read it too, for
  the same question.
- `DeviceBlockNotice`: "scrabble + crossplay are keyboard-required" — the
  codename is crosswords; a brand appears only in a manifest's `name`.
- `useCommonGame.ts` line ~574: "Same friends-alpha tradeoff as above" — the
  regime CLAUDE.md retired; the sentence beside it already gives the real
  reason (idempotent, self-heals at the next reconnect). `docs/deferred.md`'s
  matching item ("Acceptable for friends-alpha; revisit when there's a generic
  toast/error-surface layer") is resolved-stale: `runRpc` raises the fault
  modal now, which is what the code's own comment says.
- `CommonGame`'s type docstring: "future Boggle '5x5' badges" — a guess about
  a feature that did not arrive.

Held up under checking, and stays: `PlayAreaErrorBoundary` is "the only
boundary in the app" (one `getDerivedStateFromError`); codenamesduet's schema
has no `concede`; `.infoCol` is the one `--z-host` declarer; every `docs/`
heading the CSS cites exists (four under slightly different names — "the
info-sheet recipe", "Tap feedback", "The z- layers", "Below-board structure").

### F-game-page-6 · `counts` · Enumerations that rot

- `DeviceBlockNotice`: "Today only bananagrams uses it (blocked on all touch);
  scrabble + crossplay are keyboard-required but deliberately left un-gated"
  — a census of callers and non-callers. State the rule (the game decides the
  axis and the words) and let `docs/mobile.md` hold the roster.
- `useStandardGameActions` "New game is NOT here": four games' internals
  (wordle's direct RPC, spellingbee/wordwheel's custom letters, waffle's
  click-time ref) as the argument. The condition — the create path differs per
  game more than the shared shell would save — is the sentence; the examples
  are the part that rots.
- `gamePageCtx.ts` `status`: "Most of the compete games do this" — name the
  convention (`status.leaderboard`, read by an OpponentStrip) without the
  tally.

### The decision group — each waits for Joel

### F-game-page-7 · `missing-unread` · `useCommonGame` returned `missing`, and nothing read it — WORKED (option 1)

`computePause` answers `{ paused, missing }`; the hook returned both. `GamePage`
destructured neither `missing` nor anything that would use it — `PauseBoundary`
takes `expected` + `presentUserIds` and works out the absent set itself. The
only readers were the hook's test and a `GamePage.test.tsx` fixture line.

Options were: (1) drop `missing` from the return and the docstring; (2) hand it
to `PauseBoundary` and have the overlay stop recomputing it; (3) leave it.

**Joel took 1** (2026-09-14). Option 2 was oversold in the audit: `PauseOverlay`
consumes no missing *list* — it derives a boolean and then renders the WHOLE
roster, splitting present from absent per row, which is a deliberate design
("lists the WHOLE expected team, not just the missing"). Passing `missing` down
would have replaced one `.some()` and added a third presence prop.

Gone: the return field, the return-type member, the `Returns:` docstring bullet,
the three test assertions and the fixture line. `computePause` still answers
`missing` — `paused` is derived from it. The destructure carries a comment
saying why only the flag is taken. The concede test's dropped assertion was the
only thing proving cara leaves the watched roster, so it was replaced with the
`activePlayers` assertion that says it directly.

**Knock-on for `pause-suspend`, not worked:** `computePause`'s `missing` now has
no production reader either — `pause.test.ts` alone. Unlike the hook's, it is a
byproduct the function needs internally, so it is not obviously dead. That is
`pause-suspend`'s call when its area opens.

### F-game-page-8 · `dim-game-over-kept` · `.dimGameOver` had no user and said it was "the alternative, kept" — WORKED (deleted)

`.gameOverFrame` is the mark a finished board wears — `waffle`, `wordle`,
`connections` and `psychicnum` boards each apply it as `gameOver !== null &&
!viewing && shared.gameOverFrame`. `.dimGameOver` was a second way to say it,
used by no game, kept "because it may yet be the better answer on a board whose
edges are busy".

Options were: (1) delete it; (2) keep it and record it in `todo.md` as a mark
waiting for a board; (3) leave it.

**Joel ruled it settled, not open** (2026-09-14): *"we're not going to be
dimming the board at end of game — the frame is the choice we made (i think in
tile-feedback, which we're in the middle of)."* So this is not an option-not-
taken filed for later; the dim is gone and the reason is written where the
choice lives.

Four edits, because one rule was load-bearing in three other places:

- `PlayArea.module.css` — the rule, its `::after`, and the "two ways to say it"
  paragraph. What was two comment blocks is one, and it now states the
  frame-not-dim ruling with a pointer to tile-feedback.md.
- `core-css/base.css` — `--mark-gameOver-dim-color` and the paragraph of the
  dim-ramp comment arguing its value against `notYourTurn`. **Deleting the rule
  alone would have failed `cssTokens.test.ts`'s dead-token guard**, which the
  finding did not predict; the token had exactly one reader.
- `plans/tile-feedback.md` — the paragraph naming both classes and both tokens
  as a live pair now records the ruling. It also had the token's name wrong
  (`--mark-game-over-dim-color` for `--mark-gameOver-dim-color`), which is why
  a grep for the dim missed it.
- `todo.md`'s five-concerns list, and one comment in `cssTokens.test.ts` that
  used the deleted token as its camelCase naming example.

### F-game-page-9 · `go-to-club-mid-game` · The device block exited through `goToClub`, which says it is terminal-only — WORKED

`ctx.goToClub`'s note: "Only valid to call when the game is terminal — for
non-terminal back-to-club, use the menu (which fires the suspend-confirm
flow)." `bananagrams/PlayArea.tsx` handed it to `DeviceBlockNotice` as the
blocked player's exit, and that branch fires on `isTouch` before any terminal
check, so a phone leaving a LIVE game did so with no suspend and no broadcast.

I first argued the finding's own fix was wrong — that suspending on behalf of
the group was worse than leaving quietly. **Joel: "That's no 'strictly worse'.
Friends want to play games with friends. If one person can't play it, they'd
pick another game."** Which is CLAUDE.md's Zoom-call test, and it settles it:
the group being told is the point. The confirm's text was already written for
this case ("Everyone in this game will return to the club page; you can resume
from there later").

Joel's spec: *"if a player is on mobile, they see a back-to-club button on the
block that does the same thing as every other back-to-club button on a live
game — the game is shelved and everyone goes back to the club. we have an
action for this."*

Done: `DeviceBlockNotice` takes `actBackToClub: BoundAction` and places it as an
`<ActionButton>`, the way codenamesduet's terminal row already does; bananagrams
passes `ctx.menu.actBackToClub`. All three shapes now come free — solo suspends
with no dialog, multiplayer asks, terminal navigates straight through.

**The premise that justified the callback was a false claim in a blessed file.**
`BackToClubButton`'s docstring said it served "the two surfaces that cannot
reach the action ... the game's binding is not on the stack". `act-back-to-club`
is not a game's binding — it is `GamePage`'s, handed down on `ctx.menu`, and the
shell stays mounted when the play area is replaced. So both surfaces could
always reach it. The overlay's reason is real but different, and `GamePage`
states it correctly at the call site: it must NOT ask, because the game is
already stopped. Docstring corrected (prose only; the `cs-blessed-buttons` stamp
was not touched).

**The e2e stopped selecting by wording.** `bananagrams-block.e2e.ts` found the
button with `getByRole('button', { name: 'Back to club' })`, which read the
`BackToClubButton` tooltip. Joel: *"or you[r] test could stop relying on tooltip
text to find things in tests."* `ActionButton` already emits the handle for
exactly this — `data-action={action.id}`, documented as "a handle for a
stylesheet or a test that would otherwise search by wording" — so the assertion
is now `[data-action="act-back-to-club"]`. **Not run; e2e needs Joel.**

**The pause overlay took the action too** (Joel: *"why not use the normal
back-to-club action for the pause overlay? it would pop up a confirmation, but
that's fine."*). Nothing blocked it: the ladder in `base.css` documents
`--z-pause-gate` as "A LAYER WITH NO Z-INDEX ... a render gate, not a stacking
one", and the confirm is `GamePage`'s, rendered outside `PauseBoundary` at
`--z-modal-blocking`, so it paints over the overlay unopposed. The overlay was
already placing `actEndGame` this way, so its two escapes are now placed alike.
Solo is unchanged (immediate suspend, no dialog); a paused game with peers now
asks. What is lost is the overlay's hand-written "Suspend and return to club" —
the button says "Back to club" and the confirm carries the promise instead.

**`BackToClubButton` is deleted**, having gone to zero callers. `iconScale.ts`
had already planned for it — "the buttons that used to own these numbers are
going away ... the chevron's 0.9 ... would have died with the file" — which is
why the glyph scale was moved out ahead of time. Its `StandardButton.test.tsx`
case, which pinned "drawn words and name differ", now exercises
`StandardButton`'s `label`/`tooltip` pair directly, and `docs/ui.md`'s Back-to-
club paragraph (whose "cannot reach the binding" claim was the same false one)
is rewritten.

**`ctx.goToClub` went with it.** The block card was its last production caller.
Its own docstring said it served "the PlayArea terminal action row's Back to
club button" — no terminal row called it; they all place `<ActionButton
action={actBackToClub}>`, and at terminal that navigates straight through with
no dialog, so the stated purpose was already served. The only behavior it
uniquely offered was *navigate mid-game, without asking*, which is the one this
finding ruled wrong. Joel: *"is there a reason not to remove ctx.goToClub?"* —
there wasn't.

Gone: the `GamePageCtx` member, its `useCallback` in `GamePage`, the handoff,
and `goToClub: vi.fn()` from sixteen per-game PlayArea fixtures. `goToGame`'s
docstring loses its cross-reference and says instead that it is the one
navigation a game does for itself. Five docs named the member — `code-
conventions.md`, `common.md`, `ui.md` ("`<GamePage>` provides `goToClub` for the
Back-to-Club button") and `games/psychicnum.md` twice — all corrected, and
crosswords' comment about going around it no longer names it.

Not touched: `plans/react-context.md` names `goToClub` twice. It is the GATED
"ONLY A CONVERSATION" file, a record of what was said on 2026-09-07 rather than
a description of today, so it keeps the vocabulary of its own moment.

### F-game-page-10 · `keyboard-hook-home` · `useGameHasKeyboard` is about document focus — MOVED to `common/keyboard/`

**The evidence first recorded here was wrong** (corrected 2026-09-14 during the
prose pass): it named three readers, and two of them only mention the hook in a
docstring. Its ONE caller is `word-entry/EntryBox`, for the simulated caret.
`lists/FilterSelect` and bananagrams' `usePlayerBoard` cite it as the reason
they hand focus back, which makes it a rule they obey, not a hook they call.

Options were: (1) move it to `common/keyboard/`; (2) leave it here with the
corrected docstring. **Joel took 1.**

The argument was already written, in the target folder's own `doc.md`, before
this file was a candidate to join it: *"What is here is the part that was never
about a particular key ... **Whose keystroke is it — a focused text field's, or
the game's?** `editableField.ts` answers with two predicates, and it lives here
because the action dispatcher is not the only asker."* The hook is that
question as a value that changes with focus, and it is built on
`isEditableField` from that folder.

The objection I expected — a `cs-audited-game-page` file landing in a blessed
folder — does not hold: `keyboard/` already hosts `useDismissOnEscape.ts`
(`cs-blessed-floating-panels`) and a `cs-unmet` test, so a file under another
area's stamp is precedented, and this one's stamp is honest about who audited
it.

Moved with `git mv`; one import in `EntryBox`, and its own import of
`editableField` shortens to `./`. Two prose citations name it without a path,
so they did not move. `docs/keyboard-shortcuts.md` links it by path and was
corrected — **the `docLinks` guard caught that, not me.**

`keyboard/doc.md` said "three questions and one shape", a count this move makes
wrong and that would rot again anyway; the intro now says "a few" and names the
hook beside `editableField.ts`, and `## Details` gains a paragraph on the caret
invariant and on the two files that cite it without calling it.

`useGameHasKeyboard.ts` has **no test**, invisible in `game-page/` and
conspicuous in `keyboard/` where every other unit has one. Filed as a Soon in
`keyboard/todo.md` rather than written unasked — it is that folder's to write.

`plans/areas/keyboard.md` names the hook in a table of four spellings of one
predicate; its row now points at the new home. I had left it, on the reasoning
that a CLOSED area is a record rather than a description — **Joel corrected
that: "just because an area is closed doesn't mean we can't change things
there ... closing an area is just acknowledging that we audited it, so i don't
lose track. it doesn't mean locked-down."** The other three rows still name
files that no longer exist, which is the audit's own reading of a moment and
stays.

### F-game-page-11 · `from-todo` · The seven items `todo.md` handed this area, each a decision

Recorded here so the area's status can count them; the text is in `todo.md`.

1. ~~**Bug** — `act-back-to-club` answers `active` before `clubHandle` loads and
   then returns silently; should answer `disabled` (its sibling answers
   `hidden`).~~ — DISSOLVED by the route split: the state is unrepresentable.
   See "The route split" above.
2. **`playArea.module.css` is five concerns in one file** — HALF WORKED: the
   lowercase rename is done, the concern-split stays open by Joel's ruling.
   See below.
3. ~~**The info column's action box reserves no height** — build the reserved
   box, or record the per-game `over ?` split as the shape.~~ — WORKED as
   F-11.3 (one row for every state), then CLOSED 2026-09-15: it will not
   reserve. See "2026-09-15" below.
4. ~~**A contract-slot guard per mount point** — the custom properties a game
   must define for the CSS it mounts.~~ — CLOSED 2026-09-15, no change. See
   "2026-09-15" below.
5. ~~**`PlayAreaMountLog.tsx` exports two components**~~ — WORKED, by
   subtraction rather than by splitting or justifying. See below.
6. ~~**`GamePage` should build the play surface itself and drop `children`**~~
   — WORKED. See below.
7. ~~**`PlayAreaErrorBoundary`'s docstring under-describes** the reload path
   (Vite's preload helper returns, the `.then` throws on `undefined`, the card
   paints for a frame).~~ — WORKED 2026-09-15; the docstring now walks both
   branches of the stale-chunk path.

Plus three Someday items (Help's "Got it" on a companion — WORKED 2026-09-15,
the button and its stylesheet deleted; the global slot's ownership is
`feedback`'s — CLOSED 2026-09-15, the redesign already landed; the page is the
one not wearing `.pageHeaderAndMainArea` — CLOSED 2026-09-15 on measurement).
All three are recorded in `todo.md` where they were filed.

## Notes

- **`setChannel` inside the join effect** is a setState-in-effect by shape,
  with a comment saying the channel IS the external system being synced.
  eslint is clean on the folder, so the rule does not reach it (the call sits
  in a nested `joinRoom`). Not a finding; recorded so nobody re-derives it.
- **The pre-flight read is asked twice** — `GamePage` proves the row exists,
  then `useCommonGame` reads it again a moment later. The docstring argues it
  well (the hook cannot half-run). Not a finding.
- **`act-help` is bound in three places** (`GamePage`, `ClubPage`,
  `SetupGameModal`); each page owns its own. Not a finding.
- **`PlayAreaMountLog`'s two components are read by `App.tsx` only.** F-11.6
  (drop `children`) would move them into this folder's own render and settle
  F-11.5 at the same time; decide those two together. — Both worked 2026-09-14;
  the note was half right. F-11.6 did not settle F-11.5, it made it answerable,
  and the answer turned out to be that one of the two components had aged out.

### F-11.5 + F-11.6 · the render prop, and the two logs — WORKED 2026-09-14

Presented together because the area file said 6 would settle 5. Re-verifying,
it would not have — after 6 the logs are still two exported components in one
file, which is the actual complaint. What 6 does is make 5 answerable in this
folder instead of deferring to `App.tsx`.

Then Joel asked the better question: *"i'm wondering if we really still need
the two-components-to-log. we added those to help debug issue where a gamepage
didn't render anything other than a white page ... this may be complexity
overload that is no longer needed."*

**Reading the file's own decision tree against today's code, two of its three
cases had changed under us.** "No slot-mounted line → the shell never rendered
the surface" is now self-announcing: the gate, the loader and the pause
boundary each draw a named page for every way they stop, so the log's silence
corroborates what is on screen rather than being the only evidence. And "slot
mounted but no rendered → the chunk never committed" was insurance the
docstring itself described as such — *"Both designed exits for that are
visible, not blank — so this pair IS the smoking gun for a NEW failure mode."*
A branch for a case with no instance.

The asymmetry is that the slot log had grown a second job with nothing to do
with blank pages: its browser snapshot (viewport, DPR, zoom, root font, pointer,
UA), whose own docstring names a live use — bananagrams gates on `pointer:
coarse` alone, so a touchscreen laptop gets the desktop-only screen while
holding a mouse, and the log is how that reaches you from a report.

So: **`PlayAreaReadyLog` deleted, `PlayAreaSlotLog` kept**, file renamed to
match its one component. F-11.5 dissolved rather than being split or justified.
The cost, stated and accepted: a future blank play area can no longer be told
apart as "chunk never committed" vs "game rendered empty" without shipping a
deploy mid-incident.

**F-11.6**: `GamePage` now builds the play surface — the slot log, the
boundary, the Suspense and `<PlayArea …/>` — and `children` is gone from all
three route components. `App.tsx`'s game route is one self-closing tag, and App
imports nothing from this folder but the gate. Behavior identical: same
wrappers, same order, under `PauseBoundary` as before.

Test impact was the one predicted: `GamePage.test.tsx` used `children` as its
"is the surface up" probe. The probe is now the manifest's `PlayArea`, which the
fixture already supplied — it draws the same word, and every assertion stands.

**What the change falsified, beyond the folder.** `render-prop child` was
written into `docs/common.md` (three places), `docs/code-conventions.md`, four
game docs, this folder's `doc.md` and `GamePage.tsx`'s own Props docstring —
all corrected. `logStamp.ts`'s log-format example named the old filename.
`members/todo.md` and `turn-log/todo.md` both cite `game-page` for
`PlayAreaMountLog.tsx` as a sibling instance of "two components in one file";
both now record how it was answered, since subtraction is worth trying before a
split. Closed areas updated too, once Joel ruled that closed is not locked:
`boot.md`'s F-boot-3 — the handoff item 6 came from — now says it landed, and
its re-verification note that "App imports THREE files out of
`common/game-page/`" records that it is now one; `app-audit.md`'s matching
hand-off line says the same; `simple-page.md`, `utils.md` and `mobile.md` each
named the old filename, and `mobile.md` anchored on a line number besides.

### Also moved: the unknown-gametype error page — 2026-09-14

Not a finding; Joel, reading the collapsed route: *"can we move this into
GamePageGate? that seems a better place for this, and simplifier readers of
App.tsx."*

`App` was resolving the gametype through the registry and drawing an
`<ErrorPage>` when it named nothing, then handing the gate a `manifest`. So the
four ways a game URL can come to nothing were split two and two — unknown
gametype in the routing file, and a bad id, a missing row and a failed read in
the gate. They are now all the gate's, which is what the gate is for.

The route therefore hands over `urlGametype` rather than a manifest, and the
gate resolves it. No rule stretched: six `common/` files already import
`manifestFor`, and this was `App`'s only use of it. The case-insensitive
lookup and its comment moved along with it. `GameRouteProps` became
`GameShellProps` — with the gate taking its own props, the shared type is now
what the gate hands DOWN rather than what the route hands in.

App's game route is four props and no logic; it dropped three imports
(`manifestFor`, `ErrorPage`, `diagnosticsLine`) and its `gamePage` helper
entirely.

**The branch gained a test on the way.** It had none while it lived in
`App.tsx`; `GamePage.test.tsx` now mocks `@/gametypes` — which is also how a
test supplies its manifest now — and asserts the fault screen for a gametype the
registry has never heard of, and that the play surface does not draw.

`plans/areas/boot.md`'s **F-boot-4** is the ruling that these two screens should
stay different ("this division is intentional and good"). It stands; its
citations pointed at `App.tsx:127–142`, so that closed area's entry now records
where both branches live and that they sit four lines apart.

### F-11.2 · `playArea.module.css` — the rename, and why the split waits

The naming rule was already written and already named this file. `docs/deferred.
md` → Common / architecture: *"a stylesheet meant to be read by others is named
in lowercase, because it is not a component's ... The offenders under it are
`turn-log/TurnLog.module.css` and `game-page/PlayArea.module.css` (no such
component exists; five concerns in one file)."* So the leading cap was itself
the defect — it promised "the look of `PlayArea`" in a folder with no
`PlayArea`, which is what let `setup-form`'s `.infoSetup` land here.

Renamed to `playArea.module.css` — 88 files, every one a path rewrite, and the
case-only rename recorded in git as a rename rather than an add/delete. The
sheet's header now says why it is lowercase. `docs/deferred.md`'s offender list
is down to `turn-log/TurnLog.module.css`.

**One premise in `todo.md` was wrong and is corrected there:** it said splitting
"needs no component to change". Every game writes `shared.infoCol` off one
import, so moving a class to another sheet renames it at each call site — 19
`.tsx` files for the info-column classes alone — and a missed one is an
unstyled element, not a build error. That is the real size of the split, and
`composes:` (which the repo uses nowhere) is the way to avoid it.

**Joel, 2026-09-14:** *"let's do 1 now, and continue to have an issue to
subdivide it later. once we're at the point of being able to audit our first
game, we'll be a in a better place."* The consumers are the games; the split
wants a game's CSS pass open beside it.

Measured while deciding, and worth having when it is picked up — consumers per
concern: shell 16 games (`.layout`, `.boardCol`), info-column readouts 19 files,
below-board feedback 8, tile chrome 5, the marks 4.

### F-11.3 · the info column's action row — ONE component, arrived from `terminal/`

The recorded item was *"the action box does not reserve its height ... decide
whether to build the reserved box or record that the per-game `over ?` split is
the shape."* Re-verifying it turned up two things.

**Its premise named the wrong class.** `.infoActions` reserves nothing, true,
but the container is `.noShrinkRow` and it has `min-height: 6rem` — a floor. So
the rule holds while both states fit under it, and the thing that could break it
is the help line vanishing at terminal (`shared.infoHelp` is play-only in eight
games), which removes a flow element plus a 1rem gap. Whether any game exceeds
6rem is a measurement nobody has taken.

**And Joel saw past the question.** *"All games have an area where the actions
appear (both in-play and terminal). The only difference between them is that
terminal games also show a brief terminal message to the left of the buttons."*
Which is the answer to the layout question too: if the row is the same row
throughout, there is nothing to reserve.

What existed: `terminal/TerminalActionRow` (message from `over`) and
`terminal/LocalTerminalRow` (a hand-written neutral label), two near-identical
files, plus a bare `<div className={shared.infoActions}>` for the playing
branch — three branches, two components, in a folder that is not the one owning
the stylesheet all three wore.

Now: **`game-page/InfoActionsRow`**, `message?: InfoActionsMessage` and
children. Joel named it — *"it's helpful to clarify that it's in the InfoCol"* —
and set its type: the message is its own (`InfoActionsMessage`), not a
`TerminalMessage`, and takes **any** outcome rather than a terminal one, since a
live game may want a line too. `error` is the one member excluded, because
docs/outcomes.md says it is never an outcome. That required three new rules in
`playArea.module.css` (`.outcome_near`, `.outcome_warning`, `.outcome_noted`) —
the ink tokens for all of them already existed — and the new test asserts one
class per member, because the class is INDEXED into and a missing rule renders
unstyled rather than failing.

**The message is passed, never derived**, which was Joel's open question
("or calculate it, which makes more sense"). `terminalMessage.ts` already draws
that boundary in its own words: the one message common code can write is "the
friends agreed to stop", *"because nothing about that outcome is game-specific"*.
"Out of guesses" needs the game's rules.

19 call sites across 16 games. **crosswords is deliberately untouched** (Joel:
its buttons are not normal action buttons — its own area's call).

**It also closes an item in `terminal/todo.md`**, which asked whether those two
components belonged there at all given they wore another folder's stylesheet.
They did not, and now they do not.

Still open, and separate: whether `.noShrinkRow` needs a reserved height. The
row is one row now, but the help line above it still comes and goes.

### The action vocabulary gained an asker — 2026-09-14

Filing F-11.3's collapse in sixteen todos told each game to "push the knowledge
into each action's `describe()`". Working it on psychicnum proved that wrong
three separate times, and the design that came out is worth reading before the
other fifteen are done.

**What failed.** `describe()` is read by four surfaces — the button, the menu
row, Help's key list and the dispatcher — and they want different answers.
Making hint and reveal honest for the ROW broke tests that defend the MENU
("a grayed row still teaches its glyph"), and hiding `act-new-game` mid-game
killed the `+` key, whose confirmation is written for exactly that use ("the
game in progress will be shelved, not lost", "Keep playing").

**What Joel proposed instead**, after rejecting a `hideDisabled` prop on the
grounds that it cannot tell "not applicable" from "in flight": pass the caller's
category to `describe`, and make it REQUIRED. Required costs the 119
implementations nothing — a zero-argument function satisfies a one-argument
signature — while forcing the seven readers to name themselves, which is the
half that can get it wrong. `noUnusedParameters` then means an implementation
takes the parameter only when it uses it, so its presence is a reliable signal.

    export type ActionAsker = 'button' | 'menu' | 'help' | 'key'

`help` is separate from `key` because a chord can work without being taught —
`GamePage` binds `act-new-game-from-setup` on `⌥+` and says it is "placed
nowhere", and Help advertises it today with no way to say otherwise. **`key` is
the widest and the other three may each narrow it**, never widen; the wrapper in
`useBoundAction` asserts that in development, since it is the one road every
read takes.

**Joel's state rule**, which the vocabulary already documented and the games had
drifted from: `hidden` is *not even possible in this state*; `disabled` is
*possible here, not right now*, with a tooltip. So End and Concede are hidden at
terminal rather than gray — there is no ending an ended game — while a conceder
keeps End, because conceding is not ending.

**What psychicnum came to.** One row, eight actions listed once, the only branch
being the message. Playing and terminal draw exactly what they drew before; the
locally-done row gains the back-to-club it never had. Two actions answer their
asker differently (Restart, New game: a button only at terminal, menu and key
all game) and that is the whole of the placement knowledge.

Three things the collapse would have destroyed silently, all now recorded in the
todos: back-to-club's `weight="primary"` belonged to the terminal branch and
became every state's when hoisted; `canGuess` hid "terminal" inside "out of
guesses", which is how the hint bug was written in the first place (renamed
`isStillPlaying` — Joel: *"that's a poor variable name, since i'd assume it also
would be true for 'not your turn'"*); and the row needs a divider between the
actions you take WHILE PLAYING and those about the END, because both sides are
pressable mid-game and nothing else says where the meaning changes. The divider
draws only when a button sits immediately before it — `:first-child` cannot
express that, since the outcome line takes the first slot whenever there is one.

## Predicted test breaks

- F-1 to F-6 (worked): prose only, and green — plus one break the prediction
  missed, `orphanedDocstrings.test.ts` failing until `GamePage.tsx › isGameId`
  left its `KNOWN` list. F-1 moved a row out of `INTROS_OWED` as predicted.
- F-7 option 1 (worked): three `useCommonGame.test.ts` assertions, plus one the
  prediction missed — `GamePage.test.tsx`'s hook fixture sets `missing: []`.
- F-8 (worked): no test names the class, as predicted — but the prediction
  missed the dead-token guard, which the rule's token would have tripped.
- F-9 option 1: `bananagrams-block.e2e.ts` clicks the card's Back-to-club (not
  run — ASK first); `bananagrams` PlayArea tests may mount the block.
- F-10 option 1: import-path edits only.
- F-11.1: `GamePage.test.tsx`'s "does nothing before the club handle is known"
  becomes "is disabled before…".
- F-11.6: `GamePage.test.tsx` renders `children`; `App.tsx` loses three
  imports.

## 2026-09-15 — the day between the last group and the re-read

Not findings; the todo items F-11 counted, decided with Joel and recorded in
`todo.md` and the commits. Listed so the area file says what happened to each:

- **F-11.4 closed, no change.** A CSS-only guard for `--cols` /
  `--max-tile-width` / `--grid-gap` would be unsound (psychicnum fills `--cols`
  from an inline style on the parent) and the break it would catch is
  immediate and visible in the board being edited.
- **`.actionSlot` → `.steadyRows` → `.noShrinkRow`, and it reserves no
  height.** Joel: the don't-move rule is kept at the item level — the action
  row is always one line, an opponent strip reserves the lines it can grow to
  — so a `min-height` on the stack was the container-level reservation the
  rule refuses. The per-game row reservations are filed in each game's todo.
- **The shell was 1px too tall.** `--game-chrome-height` was a hand-written
  `5rem` for five stacked things and omitted the 1px rule; every desktop game
  page scrolled by a pixel. MEASURED across fifteen solo-playable games at
  three viewports before and after; the token is now composed from its terms.
  Two tests had permitted the old number. The below-board reserves that carry
  the same construction per game went to nine game todos (Joel: not
  `deferred.md`).
- **Help closes by its ✕.** The "Got it" button, its `.gotItRow` and the
  stylesheet that rule was the whole of are gone; the boundary's docstring
  (F-11.7) walks both branches of the stale-chunk path.
- **Two Someday items closed** without change: the global feedback slot stays
  in `GamePage` (feedback's redesign landed and states it as the rule);
  the page keeps its own wrapper (`.pageHeaderAndPlaySurface`, renamed from
  `.frame` at Joel's ask — a frame is what a finished board wears) rather than
  `.pageHeaderAndMainArea`, on
  measurement and three reasons recorded in `todo.md`.

## The closing re-read — 2026-09-15

The whole roster in one sitting, then every worked finding's grep run over the
siblings, the docs that describe the folder, and the day's own commits. Thirteen
more, and eight of them were the area's own findings recurring next door or
written by its own fixes.

### F-game-page-12 · `children-in-prose` · `children` survived F-11.6 in three places — WORKED

`GamePage`'s own component docstring ("The hole in the middle is `children`"),
`GamePage.module.css`'s header ("PauseBoundary + children") and `doc.md`'s tree
(`children(GamePageCtx)`) all still described the render prop F-11.6 removed.
The Props docstring had been corrected; the sentence above it had not. All
three now say the manifest's `PlayArea`, and the tree shows the three wrappers
the page builds around it.

### F-game-page-13 · `loader-named-page` · Three comments name `GamePage` as the reader the split moved — WORKED

`useCommonGame.ts`: `failure`'s note ("GamePage renders this"), the zero-rows
comment ("GamePage reads it as the game being gone") and the PA003 branch
("GamePage says it properly"). Since the route split that reader is
`GamePageLoader`, and the file has a component literally named `GamePage` that
does none of it. Corrected.

### F-game-page-14 · `echo-claims` · Three comments say a broadcast echoes to its sender; the same file says twice that it does not — WORKED

`SuspendEvent`'s docstring ("every connected peer (including the sender)"),
the suspend handler ("including the sender, via echo") and the manual-pause
handler ("handles echoes of our own sends") — against `applyManualPause`'s and
`sendSuspend`'s own comments that realtime-js defaults to `broadcast: { self:
false }`, which is exactly why `sendSuspend` navigates itself. F-4 deleted the
archaeology sentence that admitted the earlier claim was wrong and left the
claims standing. `SuspendEvent`'s docstring also mis-described the cleanup
(peers "see an empty presence set after they untrack" — the check reads the
ref BEFORE untrack, and doc.md already had it right). The three comments now
say who receives what; the type docstring is a pointer at the cleanup.

### F-game-page-15 · `disabled-at-terminal` · The asker commit made End and Concede HIDDEN at terminal and left "disabled" in four places — WORKED

`useStandardGameActions`'s docstring ("both go disabled once the game is
over"), its test's header ("both go disabled at terminal" — while the file's
own case says HIDDEN, not disabled), `docs/games/spellingbee.md` ("disabled at
terminal") and a `dispatcher.test.tsx` comment that used it as its example.
All four corrected; the dispatcher comment now describes its fixture rather
than the app.

### F-game-page-16 · `return-to-club` · F-9's overlay change left the old surface named in five places — WORKED

`sendSuspend`'s return-type note ("by the pause overlay's Return to club"),
`docs/states.md` ("Suspend and return to club (`sendSuspend`…)"),
`GamePage`'s two comments that scoped Back to club to "the menu's item" and
"the menu + its `<` key", `doc.md`'s intro ("the menu's Back to club picks") —
and `doc.md`'s "the two navigations", which counted the `goToClub` F-9
deleted. Every one now says the one action, placed by every surface. The
`suspend-dialog` e2e's comment still quoted the overlay's old button; rewritten
to say what `.first()` is for.

### F-game-page-17 · `help-is-a-companion` · "Help modal" in eight places, and a day-old archaeology — WORKED

The floating-panels vocabulary is the companion (`docs/ui.md` → "The keys in
Help": "every game's help companion"), and a companion is by construction not
modal. `GamePage.tsx` said "Help modal" three times, `GamePage.test.tsx` once,
`ClubPage.tsx` twice, `boot/reloadOnStaleChunk.ts` and `codenamesduet/Help.tsx`
once each. `GameHelpCompanion`'s docstring, rewritten on 2026-09-15, carried
"It carried a 'Got it' button until 2026-09-15" — F-4's defect written by the
day's own fix — and cited "docs/ui.md documents Help as part of the uniform
frame", a passage that does not exist; `docs/ui.md`'s dialog-buttons paragraph
still gave Help's "Got it" as its example. All corrected.

### F-game-page-18 · `action-slot-leftovers` · The rename to `.noShrinkRow` left its predecessor's prose — WORKED

An entire orphaned comment block sat directly above `.noShrinkRow`'s own,
claiming the region is "same height whether the game is in play or terminal" —
the reservation the rename had just refused, two blocks apart. "Action slot"
survived in `.responsiveInfoCol`, `.infoCol` (twice) and `.terminalExtra`;
`.infoActions` and `.outcome` still described the pre-`InfoActionsRow`
terminal swap ("the play buttons are replaced by the bold outcome line + a
compact back-to-club button"); `.terminalExtra` called itself "the one
info-column region that GROWS" on the transition, when the help line leaves at
terminal in eight games. Deleted, renamed and reworded.

### F-game-page-19 · `stale-cites` · Six pointers at things that moved or went — WORKED

`playArea.module.css`'s header and `docs/playarea.md` (twice) cite
`setupForm.module.css`, which the setup-form area deleted; playarea.md's link
text still read `common/components/game/`. `PlayAreaErrorBoundary` put
`reloadOnStaleChunk` "in main.tsx" (it is `boot/`'s; main.tsx installs it).
`.tile:disabled` quoted `button:disabled { opacity: 0.5 }`, which is a token
now — `docs/deferred.md` had already listed it among four such comments, and
its list is three. `.responsiveInfoCol` named three composers where five
compose it (setgame and strands too); it names the condition now.

### F-game-page-20 · `wrong-dates` · Forty-three lines in twenty-three files dated the area's work to a day that had not happened — WORKED

Everything this area did on 2026-09-14 — the route split, F-10, F-11.2,
F-11.5/6, the gametype move, the asker — was dated "2026-09-16" in this file,
`app-audit.md`, the `boot`, `buttons` and `keyboard` area files,
`docs/deferred.md`, this folder's `todo.md`, `keyboard/todo.md` and sixteen
game todos. The commits are dated 2026-09-14. Every one corrected.

### F-game-page-21 · `false-owed-item` · A closed todo entry carried an owed item, and the item was false — CORRECTED

The action-box item, closed 2026-09-15, ended: "`SetupDisclosure` also adds
`margin: 0.3rem 0 0` of its own on top of the column gap, so the setup row sits
1.3rem below its neighbor … the one inconsistency in the column's spacing."
The margin is on the `ul` INSIDE the disclosure, between its summary and its
list; the disclosure sits at the column's gap like every other row. Nothing to
file; the entry says so.

### F-game-page-22 · `slot-log-header` · The component's story was a file header, its docstring one line — WORKED

`PlayAreaSlotLog.tsx`: a 27-line `/**` block after the imports, attached to
nothing (the orphan guard exempts a file's first docstring, so it was green),
and `PlayAreaSlotLog` itself carried "Wraps the play-surface slot; logs when
GamePage mounts/unmounts it." The feedback area's F-15 shape. One export, so
the header is now its docstring.

### F-game-page-23 · `asker-unharvested` · `ActionAsker` landed in a closed area with no word in its doc — WORKED

The asker commit (2026-09-14) changed `actions/useBoundAction.ts` and left
`actions/doc.md`'s Details describing `describe()` with no parameter. Closed is
not locked: a paragraph there now says who asks, that the parameter is
required, and that `key` is the widest.

### F-game-page-24 · `gate-duplicate-import` · `GamePageGate` imported `ErrorPage` twice — WORKED

Two import lines from `../error-page/ErrorPage`, one for each export. Merged.

### Held up under checking

The menu empties during a pause (psychicnum's publish effect returns
`setGameSections([])`, and `menu/doc.md` says the same); every game's
`Help.tsx` renders `GameHelpCompanion`; `.infoCol` is still the one `--z-host`
declarer; `unset_current_view` has two callers (this hook and ClubPage's heal);
`gamePageCtx.ts` is imported by the games and `gameManifest.ts` only;
`App.tsx` keys the route by `gameId`; wordle's grid does read `ctx.brand` for
its label; the `.moveAreaOrLocalFeedback` and `.localFeedback` rosters in the
stylesheet are exact.

### The doc.md harvest

Done in the same sitting. The lede named "the manifest's device and keyboard
gates" — the keyboard gate F-10 moved out — and now names the action row, the
stylesheet and the device-block card; "sixteen" (twice) is "every game"; the
tree shows the wrappers the page builds; "the route's four" is "what the gate
resolved"; the gate's four answers and their two screens are written down.
Two Details paragraphs added: what a game wears from this folder besides the
page (`playArea.module.css`, `InfoActionsRow`, `useStandardGameActions`'s
rules, `DeviceBlockNotice`), and the row-by-row don't-move rule.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-15)
- [x] the folder's `doc.md` intro written; its row off `INTROS_OWED` (F-1);
      the harvest done at the re-read
- [x] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not — **Joel's.**
      Sixteen files are `cs-audited-game-page`; five the area created are
      `cs-unmet` (`GamePageGate`, `GamePageLoader`, `NoSuchGamePage`,
      `InfoActionsRow`, `InfoActionsRow.test`).
