# Area: game-page

The folders it reads: `game-page`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-14.** Roster stamped `cs-audited-game-page`,
eighteen files. Eleven findings recorded: a prose group (F-1 to F-6) and a
decision group (F-7 to F-11). None worked. The folder's `todo.md` carries seven
more items from earlier areas, listed under "From todo.md" below; each is a
decision this area makes with its files open.

## The roster

Agreed 2026-09-14 (Joel: "these e2e's aren't part of this area"). The folder,
and nothing else:

- `GamePage.tsx` + `.module.css` + `.test.tsx` — the page: the pre-flight
  "does this game exist" read, then the shell (`GamePageInner`)
- `gamePageCtx.ts` — what the shell hands a game
- `useCommonGame.ts` + `.test.ts` — the shared room: the row, the roster, the
  channel, presence, pause, suspend, the timer
- `useStandardGameActions.ts` + `.test.ts` — End, Concede and Restart, bound
  once per game
- `GameHeaderMenu.tsx` — the logo menu; the one subscriber to `gameMenuStore`
- `GameHelpCompanion.tsx` + `.module.css` — the how-to-play panel frame
- `PlayAreaErrorBoundary.tsx` + `.test.tsx` — the boundary around a board
- `PlayAreaMountLog.tsx` — the two console breadcrumbs for a blank play area
- `PlayArea.module.css` — the play surface's stylesheet, five concerns wide
- `DeviceBlockNotice.tsx` + `.module.css` — the "needs a desktop" card
- `useGameHasKeyboard.ts` — does the game own the keyboard right now
- `doc.md` (a lede, on `INTROS_OWED`) and `todo.md` (one Bug, six Soon, three
  Someday)

No e2e is the area's own. `bananagrams-block.e2e.ts` drives `DeviceBlockNotice`
but is bananagrams'; `presence` and `suspend-dialog` are `pause-suspend`'s.

**Evidence, not roster:** `App.tsx` (mounts `GamePage`, the boundary, the two
mount logs and the Suspense — the render-prop child); `pause-suspend/
PauseBoundary.tsx` + `PauseOverlay.tsx` (take `actEndGame`); every game's
`PlayArea.tsx` (reads `GamePageCtx`); `bananagrams/components/PlayArea.tsx`
(the one `DeviceBlockNotice` caller); `word-entry/EntryBox.tsx`,
`lists/FilterSelect.tsx`, `bananagrams/hooks/usePlayerBoard.ts` (read
`useGameHasKeyboard`); `menu/gameMenuStore.ts`; `core-css/base.css` (the `--z-`
ladder, `--game-chrome-height`, the `--tile-*` tokens).

Docs that describe it: `docs/ui.md` → GamePage header, GamePage menu, Layout
stability, Page-height fits the viewport, Interactive tile states, Tile
content; `docs/playarea.md`; `docs/states.md` → Lifecycle, Leaving the game
page; `docs/mobile.md` → Where each game plays; `docs/realtime-lost-events.md`.

Baseline at the opening: the folder's four test files pass (52 tests); `tsc -b`
and eslint clean.

## Findings

### The prose group

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

### F-game-page-7 · `missing-unread` · `useCommonGame` returns `missing`, and nothing reads it

`computePause` answers `{ paused, missing }`; the hook returns both. `GamePage`
destructures neither `missing` nor anything that would use it — `PauseBoundary`
takes `expected` + `presentUserIds` and works out the absent set itself. The
only reader is the hook's test.

Options: (1) drop `missing` from the return and the docstring; (2) hand it to
`PauseBoundary` and have the overlay stop recomputing it; (3) leave it.

### F-game-page-8 · `dim-game-over-kept` · `.dimGameOver` has no user and says it is "the alternative, kept"

`.gameOverFrame` is the mark a finished board wears; `.dimGameOver` is a second
way to say it, used by no game, kept "because it may yet be the better answer
on a board whose edges are busy". A rule with no reader is a rule the phantom
guard cannot vouch for and the marks census miscounts. This is
`plans/tile-feedback.md`'s subject.

Options: (1) delete it, with the note moved to tile-feedback.md as an option
not taken; (2) keep it and record it in `todo.md` as a mark waiting for a
board; (3) leave it.

### F-game-page-9 · `go-to-club-mid-game` · The device block exits through `goToClub`, which says it is terminal-only

`ctx.goToClub`'s note: "Only valid to call when the game is terminal — for
non-terminal back-to-club, use the menu (which fires the suspend-confirm
flow)." `bananagrams/PlayArea.tsx` hands it to `DeviceBlockNotice` as the
blocked player's exit, mid-game. So a phone that opens a bananagrams game
tracks presence, then leaves with no suspend and no broadcast; the desktop
peers get a presence-pause the moment it goes, for a player who was never
going to play. `ctx.menu.actBackToClub` is on the same context and does the
right thing for every shape (terminal, solo, peers).

Options: (1) the block's exit is `actBackToClub` — `DeviceBlockNotice` takes a
`BoundAction` and places it, like the overlay does; (2) keep `goToClub` and
loosen its note to "navigates without suspending"; (3) leave it — a phone
opening bananagrams is rare enough.

### F-game-page-10 · `keyboard-hook-home` · `useGameHasKeyboard` is about document focus, and its readers are not this folder's

It answers "is a text field focused" off `focusin`/`focusout` and
`isEditableField` from `common/keyboard/`. Its readers are `word-entry/
EntryBox`, `lists/FilterSelect` and bananagrams' board hook — none of them the
page. `common/keyboard/` already holds `editableField.ts` and
`useCaptureKeys.ts`, the two things it is written against.

Options: (1) move it to `common/keyboard/` (the import sites move with it);
(2) leave it here with a docstring that names all three readers' question.

### F-game-page-11 · `from-todo` · The seven items `todo.md` handed this area, each a decision

Recorded here so the area's status can count them; the text is in `todo.md`.

1. **Bug** — `act-back-to-club` answers `active` before `clubHandle` loads and
   then returns silently; should answer `disabled` (its sibling answers
   `hidden`).
2. **`PlayArea.module.css` is five concerns in one file** — the split by
   concern (Joel: info-col CSS belongs in a shared `InfoCol.module.css`).
3. **The info column's action box reserves no height** — build the reserved
   box, or record the per-game `over ?` split as the shape.
4. **A contract-slot guard per mount point** — the custom properties a game
   must define for the CSS it mounts.
5. **`PlayAreaMountLog.tsx` exports two components** — split, or justify the
   one file (Joel asked what it is and why two, 2026-09-14; the answer is that
   they commit at different positions in the tree).
6. **`GamePage` should build the play surface itself and drop `children`** —
   `App.tsx` carries five levels of identical plumbing; `App` is the only
   caller.
7. **`PlayAreaErrorBoundary`'s docstring under-describes** the reload path
   (Vite's preload helper returns, the `.then` throws on `undefined`, the card
   paints for a frame).

Plus three Someday items (Help's "Got it" on a companion; the global slot's
ownership is `feedback`'s; the page is the one not wearing
`.pageHeaderAndMainArea`).

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
  F-11.5 at the same time; decide those two together.

## Predicted test breaks

- F-1 to F-6: prose only; F-1 moves a row out of `INTROS_OWED`.
- F-7 option 1: `useCommonGame.test.ts` asserts `missing` in three cases.
- F-8 option 1: none — no test names the class.
- F-9 option 1: `bananagrams-block.e2e.ts` clicks the card's Back-to-club (not
  run — ASK first); `bananagrams` PlayArea tests may mount the block.
- F-10 option 1: import-path edits only.
- F-11.1: `GamePage.test.tsx`'s "does nothing before the club handle is known"
  becomes "is disabled before…".
- F-11.6: `GamePage.test.tsx` renders `children`; `App.tsx` loses three
  imports.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
