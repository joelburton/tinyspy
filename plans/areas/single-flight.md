# Area: single-flight

The folders it reads: `single-flight`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-05). The folder's `todo.md` was empty at the opening —
no earlier area handed anything here.

## The roster

| file | stamp at the opening |
|---|---|
| `src/common/single-flight/useSingleFlight.ts` | `cs-unmet` |
| `src/common/single-flight/useSingleFlight.test.ts` | `cs-unmet` |
| `src/common/single-flight/doc.md` | lede only, no Design |
| `src/common/single-flight/todo.md` | empty under all four headings |

Off the roster, but read to check the files' claims: the eighteen call sites
(sixteen games' `PlayArea.tsx`, waffle's swap, setgame's hint), fourteen
`InfoCol.tsx` docstring lines, `common/game-page/GamePage.tsx`,
`common/game-page/useStandardGameActions.ts`,
`codenamesduet/components/BoardCol.tsx`, `docs/code-conventions.md`,
`docs/common-folders.md`.

**The hook's code is sound.** Every finding below is about what is *said* about
it — in its own docstring, in the folder's lede, in the doc that teaches it, and
in the thirteen game comments that re-explain it — plus three places that
re-implement or half-implement its contract.

## Findings

### F-single-flight-1 · `menu-item-disabled` · the usage example teaches a wiring fifteen of sixteen games deliberately reject

The docstring's worked example says to feed `pending` to "the button + menu
item's `disabled`, so the UI says so and the `+` shortcut inherits it (GamePage's
dispatcher already skips a disabled item)".

The dispatcher half is true — `GamePage.tsx:468` is `if (item && !item.disabled)
item.onClick?.()`. The instruction is not what the app does. Thirteen games
carry the opposite in a comment beside the call, e.g. spellingbee:

> The MENU ITEM deliberately takes no `disabled`: its effect is built above this
> line and is kept independent of handler identity on purpose (the actionsRef
> indirection). It doesn't need one — `+` and the menu both route through this
> same guarded handler.

Fifteen games pass `startingNewGame` to the terminal `NewGameButton` only;
strands alone also sets `disabled: startingNewGame` on the menu item (and pays
for it with `startingNewGame` in the menu effect's deps). letterboxed and setgame
have neither the comment nor the menu `disabled`.

So the file that argues "guard the handler, not the button" ends its own example
by telling the reader to guard the button as well, for a reason (the shortcut
inheriting it) that the handler guard already covers.

**Resolution: DONE here, and the rest is the `menu` area's.** The docstring no
longer instructs it: the example now says to gray whatever control should show
the wait, and that no trigger needs it because they all route through the
guarded handler — true whichever way the menu question goes.

The question itself — does a menu row gray while its action is in flight, as
opposed to graying for state, which rows already do — is filed in
`src/common/menu/todo.md` for that area to decide (Joel, 2026-09-05: *"that's
something worth deciding"*). **Whatever `menu` decides does not come back
here**: this hook guards the handler, and every trigger is covered whether or
not any of them also grays.

### F-single-flight-2 · `lede-says-submit-handlers` · the folder's lede names a caller that doesn't exist

`doc.md` reads: "Submit and action handlers wrap in it so a double-click cannot
double-fire an RPC." No submit handler wraps it. The eighteen call sites are
sixteen `createNewGame`s, waffle's `doSwap` and setgame's `askHint`; every
text-entry submit in the app is guarded some other way or not at all.

**Resolution: DONE.** The lede now names the callers that exist — every game's
New game, and a board action whose control stays live across the round trip.

### F-single-flight-3 · `one-caller-shape-named` · the second shape the hook is actually used for is unnamed, and both its callers discard `pending`

The docstring frames the hook around one shape: "a handler that fires a mutation
and then navigates", with New game as the worked case. Two callers are a
different shape — a control that stays live across a round trip, changing the
board rather than leaving the page:

- `waffle/PlayArea.tsx:274` — `const [handleSwap] = useSingleFlight(doSwap)`
- `setgame/PlayArea.tsx:386` — `const [requestHint] = useSingleFlight(askHint)`,
  whose comment states the shape well: *"a press takes a round trip to record and
  the button stays live meanwhile."*

Both discard `pending`, which is legal and undocumented: with nothing reading it,
a dropped press is completely invisible — no gray, no pill, nothing. That is the
trap the e2e suites already hit from the other side (a repeat click that never
lands). The docstring should say what the caller owes the player when it drops a
call, not only when it drops a duplicate New game.

**Resolution: DONE as description.** The docstring now names the second shape
(waffle's swap, setgame's hint) and says what ignoring `pending` costs — nothing
else reports the drop, so where nobody reads it the dropped press leaves no
trace. Whether those two callers should show something is left to them.

### F-single-flight-4 · `three-copies-of-one-explanation` · the same paragraph is written out in three places

The New-game rationale — three triggers, `create_game` is not idempotent, ref
gates and state reports, cleared in a `finally` — exists in full in the hook's
docstring, again in `docs/code-conventions.md` → "Guarding a non-idempotent
action", and a third time as a ~10-line comment in thirteen games' `PlayArea.tsx`
above the call. Fifteen versions, one subject; they have already drifted (F-1 is
the docstring and the games disagreeing about the menu item). The thirteen game
comments are byte-identical (hashed the comment block in all thirteen: one
hash), so the paste is literal, not thirteen people explaining it thirteen ways.

**Resolution: the RULE is settled; the sweep is not done.** Joel ruled that a
comment is not there to teach — the generosity is for docstrings, and a call
site gets one short sentence naming the job plus a pointer ("Guards
non-idempotent requests from firing twice; see …"). The two files that stated
the old rule are changed: `CLAUDE.md → Educational priority` and
`docs/code-conventions.md → Code clarity & docstrings`, whose shared-concept
bullet now covers a shared MECHANISM and carries the one-line form as its
example.

**Then DONE.** The thirteen game comments are one line each — "Guards a
non-idempotent request from firing twice; see `useSingleFlight`." — with the
menu-item paragraph cut rather than left standing while `menu` decides it (that
claim is recorded in `menu/todo.md`, and thirteen copies of a claim under review
is how the drift happened the first time). `code-conventions.md`'s section keeps
the rule and the route: the guard goes on the handler because one action is
reachable from a button, a menu row and a shortcut, and a `disabled` prop covers
the first; the mechanism is the docstring's. The New game story is gone from it.

### F-single-flight-5 · `restart-hand-rolls-it` · the shared restart re-implements the gate, and the doc's reason for that isn't one

`useStandardGameActions.restart` (`common/game-page`) holds `restarting =
useRef(false)`, gates on it, and clears it in a `finally` — this hook, written
out. `docs/code-conventions.md` explains it as *"since it's already inside a
shared hook"*, which is not a reason: a hook may call a hook.

The real difference is the confirm. `useSingleFlight` closes the gate on the
first call, *before* the wrapped action's confirm resolves, and the docstring
says stacking two modals is its own small bug. `restart` reads the ref before the
confirm but sets it only after (`useStandardGameActions.ts:169–171`), so a second
trigger while the modal is open would open a second modal. **It is not reachable
today** — `BlockingModal` makes everything below it inert, and Restart has no
keyboard shortcut, so the menu item is its only mid-game trigger — but the
divergence is undocumented and the doc explains it wrongly.

**Owner:** `common/game-page`.

**Resolution: DONE.** Joel ruled it fine to fix in `useStandardGameActions`, so
`restart` calls the hook: the body is a plain `useCallback` (identity kept, so
the games' `actionsRef` effects don't re-run every render) wrapped in
`useSingleFlight`, and the ref, the `try/finally` and the IIFE are gone. The
gate now closes on the click rather than on the confirm's answer — the change
this conversion carries, and unobservable today. Its two existing specs (drops a
second click; retryable after a failure) pass unchanged. The comment above it is
one sentence and a pointer, per the rule settled at F-4, plus the part that is
true here and nowhere else: why End and Concede need no guard.
`code-conventions.md` no longer describes a hand-rolled ref.

### F-single-flight-6 · `codenamesduet-guess-in-flight` · a game hand-rolls the same gate

`codenamesduet/components/BoardCol.tsx:172` — `guessInFlight = useRef(false)`,
checked and set around `submit_guess`, for the reason this hook exists (the
tile's `disabled` follows a re-render and misses a same-tick second click). It
also keeps `pendingPos` state, which the hook's boolean can't carry, so a
conversion keeps that state and takes only the gate.

Reviewed and NOT the same job, so not listed: bananagrams' `dumpPending` (a
label for the next tile-growth announcement) and crosswords' `committed` (a
blur-vs-commit guard).

**Owner:** `codenamesduet`, and Joel had it done here rather than filed.

**Resolution: DONE.** The handler is a plain `useCallback` named `submitGuess`,
wrapped as `const [handleGuess] = useSingleFlight(submitGuess)`; the ref and both
of its assignments are gone, and `useRef` left the file's imports. `pendingPos`
stays — it says WHICH tile is committing, which Board reads to mark and disable
that one, so the hook's boolean can't stand in for it; its note now says that
instead of explaining the ref. The gate also gained a `finally` it never had, so
a throw in the handler can no longer wedge the board.

### F-single-flight-7 · `gate-survives-a-new-action` · the suite misses the property a plausible rewrite breaks

Five specs cover the drop, the pending flag, the clear on rejection, argument
forwarding and a synchronous action. None re-renders with a *different* `action`
while a call is in flight. That is exactly what separates the ref from the
obvious wrong version — a `let` inside the `useCallback`, which passes all five
existing specs and reopens the gate the moment `action`'s identity changes.

It is not hypothetical: strands passes an inline `async () => {…}`, so its
`action` is a new function on every render, and the hook's own `setPending(true)`
guarantees a render mid-flight.

**Not a bug** — the shipped hook uses the ref and is correct. This is coverage
for a property nothing pins.

**Resolution: DONE.** One spec added, "stays closed when a re-render rebuilds the
action", and verified from both sides: planting a render-local `{ current:
false }` in place of the ref fails the new spec (`expected 1 times, but got 2`)
and leaves the other five green. The hook's file is byte-identical after the
plant was removed.

### F-single-flight-8 · `new-game-id-literal` · fifteen games hard-code a shell contract

Checking the "`+` inherits it" claim in F-1 turned this up. `GamePage` finds the
item to fire by `NEW_GAME_ID` (`common/menu/gameMenu.ts:132`, `'new-game'`).
strands imports the constant; the other fifteen games write `id: 'new-game'` by
hand, so the contract that makes the shortcut work is a string literal in
sixteen files.

**Not this area's subject at all** — it surfaced only because checking the
docstring's "`+` inherits it" claim meant reading `GamePage`'s handler, which is
where the lookup lives.

**Resolution: FILED** in `src/common/menu/todo.md` under Soon, with the
`END_OR_CONCEDE_IDS` pair noted alongside it (those two literals sit in the same
file as their constant, so they are the same one-line fix).

## Notes

- **Claims checked and TRUE**, so they don't recur as findings: the three New
  game triggers (`NewGameButton` is rendered only in the terminal action row);
  `GamePage`'s dispatcher skipping a disabled item (`GamePage.tsx:468`);
  `common.create_game` clearing `is_current_view` and inserting a new current row
  (`supabase/sql/common.sql:1011–1021`); `submit_timeout` existing as the
  idempotent everyone-fires-it counter-example; `useConfirmation` being the async
  styled modal, not `window.confirm`.
- The `useCommonGame` cross-reference in the `catch` comment is loose but not
  wrong: both log and swallow, but `useCommonGame` logs a not-ok envelope nobody
  asked for, while this logs an unexpected throw. Not raised as a finding.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
