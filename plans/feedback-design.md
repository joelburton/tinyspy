# The feedback system — the design

**This is the target.** [feedback-system.md](feedback-system.md) describes the
system as it stands; this file describes what it becomes, and is kept current
as the design is agreed. `src/common/feedback/todo.md` holds what is already
owed, and the work happens under the `feedback` area of
[app-audit.md](app-audit.md) when it opens.

Every statement here carries one of three marks:

- **DECIDED** — Joel has said yes. Build to it.
- **PROPOSED** — my recommendation, with the reasoning; not yet agreed.
- **OPEN** — a question with no recommendation yet, or one Joel has to make.

Started 2026-09-04 from the design review in the Fable session that opened it.

**Status: OPEN; the machinery is BUILT and awaits Joel's read** (2026-09-12).
Every design item is decided (§9, §11.3). Built, alongside the old files,
which stay until each game converts:

| file | what it is |
|---|---|
| `common/feedback/FeedbackMessage.tsx` (+ test) | the class, `KINDS`, `Overrides`, the fourteen constructors |
| `common/feedback/feedbackSlotStore.ts` (+ test) | `createFeedbackSlot`: the list, the rank rule, timers, `dismiss` / `close` — no React |
| `common/feedback/useFeedbackSlot.ts` (+ test) | the hook: one stable slot per host, registered while mounted; `useTopFeedbackMessage` |
| `common/feedback/feedbackSlotRegistry.ts` (+ test) | mounted slots by name; `peekFeedbackSlotForTest`; `window.puppill` / `pupretract` |
| `common/feedback/FeedbackPill.tsx` (+ test + stylesheet) | draws a slot's top: outcome border, fill by kind, tap for gesture kinds, × for close kinds, the actor mention |
| `common/terminal/terminalMessage.ts` (+ test) | `TerminalMessage`, `TerminalOutcome`, `gameEndedTerminalMessage` |
| `common/info-sheet/turnText.tsx` (+ test) | `waitingForText` — one sentence for the status line and the pill |
| `guards/feedbackNames.test.ts` | bare `feedback` is never a declared name; two files pending until they convert |

Two old files were touched so old and new cannot drift while both exist:
`turnCopy.tsx`'s `waitingFor` IS `waitingForText`, and `terminalCopy.ts`
re-exports `TerminalOutcome` from `terminalMessage.ts`. `TurnStatusLine`
reads `waitingForText` directly; its fallback is "a player" now.

**psychicnum CONVERTED (2026-09-12), uncommitted, awaiting Joel's read**,
and with it the shared hosts it needed — every one now speaks the new
system, so every other game is red at `tsc -b` until it converts (accepted):

| file | what changed |
|---|---|
| `game-page/GamePage.tsx` + `gamePageCtx.ts` | `useFeedbackSlot('global')`; the hand-held state, its timer and `PEER_PILL_MS` are gone; `ctx.globalFeedbackSlot` |
| `club/ClubPage.tsx` | the same slot; "Rename club: coming soon" is an `acknowledgment` |
| `page-header/PageHeaderStatusSlot.tsx` | takes the slot, draws `<FeedbackPill>` while it holds a message |
| `word-entry/EntryRow.tsx` (+ new test) | takes `localFeedbackSlot`; draws its top in place of the controls. **WITHDRAWN and corrected the same day:** the first version kept the hosts' old "only while the entry is empty" gate for every kind, so typing hid a ×-only not-ok. Joel: *"the reason they're '×-to-close' is so THEY DON'T GO AWAY WHEN YOU TYPE."* Now only a gesture-cleared result yields to typing (the keystroke dismisses it anyway); every other kind holds the slot until it leaves the way its kind says |
| `game-page/useStandardGameActions.ts` | takes `localFeedbackSlot`; a not-ok is `FeedbackMessage.notOk(res)` |
| `terminal/TerminalActionRow.tsx` | takes a `TerminalMessage` (`infoColText`, `outcome`) |
| `chat/useChatFeedback.tsx` · `feedback/usePeerFeedback.ts` | producers take the slot; `messageFor` returns a `FeedbackMessage` |
| `feedback/useDismissLocalFeedbackOnKey.ts` | takes the slot's `dismiss`; docstring no longer names `locked` |
| psychicnum `PlayArea.tsx` · `BoardCol.tsx` · `InfoCol.tsx` | the three standing conditions are effects (`over` is memoized on primitives); results and not-oks are constructors; `buildOver` returns a `TerminalMessage`; the precedence expression and `boardPill` are gone; the entry row is always mounted, disabled once done |
| the tests of each, and `feedbackNames`' allowlist | a real slot with a spy on `show` replaces the `{ show, clear }` fakes |
| `docs/code-conventions.md` → Feedback naming · `docs/ui.md` → Feedback pill · `docs/outcomes.md` · `docs/games/psychicnum.md` | say the shipped system; the kinds table is in ui.md |

Docs that still name the old builders (`playarea.md`, `mobile.md`,
`deferred.md`, `envelopes.md`, `common.md`, six game docs) stay as they are
until the old files are deleted at the end of the conversion, since what they
describe still exists.

**psychicnum COMMITTED** (`fdeecbe6`), its five e2e specs green — the
turn-order spec now asserts the new rank order (a result over the whose-turn
note, and the note uncovered by a tap).

**wordle CONVERTED (2026-09-12), uncommitted, awaiting Joel's read.** The
same shape: `over` memoized on primitives (the compete tie-break inference
moved above the early returns with it), three condition effects, results
and not-oks as constructors, `buildOver` → `TerminalMessage`; BoardCol draws
`<FeedbackPill>` between the board and the keyboard, `softReject` shows a
`result`, `typeLetter` and the capture's `onAnyKey` are the slot's
`dismiss`. Its test fakes the global slot with a real one and a spy, which
took it off the name guard's pending list. Its four e2e specs (history,
keyboard, mobile, print) run on Joel's word.

**Next:** the other games, one by one.

**How the area runs — DECIDED 2026-09-12**, because the audit process was
built for tidying files that stay, and this area replaces most of its files:

- **This file is the working record.** Its open items are the findings list,
  worked in this file's order; `F-feedback-n` is reserved for what the read
  turns up that the design did not foresee. A statement leaves this file for
  `feedback/doc.md` the moment it is built, so the file empties as the area
  closes.
- **Build order: the machinery first, then STOP for Joel to read it.** Not a
  thin layer over today's types — *"a 'thin layer' sounds like a shim."* Then
  psychicnum converts entirely, and STOP again for a look. Then the other
  games, probably one by one. Other games may be broken in between.
- **Every game converts in this area.** Not the `shuffle` pattern of a
  `todo.md` line per game. When the area closes, nothing relies on the old
  builders, the old message shape or the hand-held global slots — including
  the producers outside the folder (`turnCopy`, `terminalCopy`,
  `useChatFeedback`) and the slot state in `GamePage` and `ClubPage`, which
  are edited here without opening their areas.
- **Stamps.** A file edited in another area keeps its stamp. A file this area
  creates is stamped `cs-met-feedback` at birth and `cs-audited-feedback` once
  audited.
- **Verification.** The general e2e run, plus any feedback-specific specs,
  after the machinery is built; each game's own e2e as that game converts.
  Every run is asked for first.
- **`FailureLine`** is not a pill and not bound for a slot; it is on the
  roster because it is in the folder, and whatever it needs is decided when
  the read reaches it.
- **`useDismissLocalFeedbackOnKey`** is not rewritten. It binds
  `act-dismiss-feedback` to whatever dismiss function it is handed and knows
  nothing about the game state; the slot decides whether the top message
  leaves by a gesture. What changes is the function it is handed and the
  docstring paragraph that explains permanence via `locked`.

---

## 1. What counts as feedback

**DECIDED 2026-09-12 — keep the definition the repo already has.** Feedback is a message
that lands in one of the two slots: below the board, or in the page header.
Nothing else. The test is physical — *does it end up in a slot?* — and it holds
for every borderline case checked:

| thing | feedback? | why |
|---|---|---|
| a not-ok shown under the board | yes | it's in the local slot |
| a peer's move narrated in the header | yes | it's in the global slot |
| a form-validation on a setup form | **no** | it goes to a field; the form owns it |
| chat's inline "couldn't send" line | **no** | rendered in the chat body, not a slot |
| a toast | **no** | a different surface ([docs/ui.md](../docs/ui.md) → Toasts) |
| a tile lighting up, a WordList underline | **no** | ambient board display |

The four origins in feedback-system.md §2 are all *upstream* of this test and
do not change it: a message can start anywhere, and it is feedback the moment
it is bound for a slot.

---

## 2. Two layers: text, then message

**DECIDED (vocabulary):** the words a message shows are its **text**. Never
"copy" — that word means a duplicate. The identifiers that carry it today
(`TerminalCopy`, `terminalCopy.ts`, `endedCopy`, `turnCopy.tsx`) rename under
this area.

**DECIDED 2026-09-12, through §7's vocabulary — the system has two layers,
and the seam between them is the thing with no home today.**

- **Text** is a string someone wrote for a player: the server's
  `envelope.message`, a game's terminal verdict from `buildOver`, a builder's
  wording. Text has no mode, no dot, and no idea where it will be shown.
- A **message** is text plus everything a slot needs: `outcome`, its kind, an
  optional `actor`, and a `text` that may be a `ReactNode` (a string is one, so
  nothing is lost; 21 sites pass JSX today, mostly a leading `<DotActor>`).

**DECIDED 2026-09-12 — the message carries the ACTOR, not a dot.** Today's
`dot?: string | null` is a color name the pill draws as a bare `<Dot>`, with
the name left to the text string; two sites use it, and nineteen put a
`<DotActor>` inside the text node instead. `members` has since ruled that
identity is carried by exactly one shape, the name-and-disc pair, and names
the feedback pill as one of the surfaces the rule is for. So a peer
constructor takes the member, the pill draws the `<DotActor>` before the
text, and the text at those sites goes back to a string. What sits between
the mention and the text is the KIND's: the gap is CSS on the pill, never a
leading space in a text; chat's ": " join and its bold sender are the chat
kind's constructor's, one line each. (The bold was almost certainly never
designed; Joel, 2026-09-12: *"keep it bold."*) The fallback for a missing actor is one string, "a player":
a PlayArea never mounts before its roster has loaded, and a player cannot be
added to a game, so no reachable case uses it — it exists because the actor
is optional in the type. The seven fallback strings in use today ("Someone",
"someone", "A teammate", "An opponent", "Your partner", "your partner", "?")
retire at the feedback sites.

The conversion from text to message is where the **mode** is chosen, and the
mode is the surface's decision, not the answer's (feedback-system.md §4 has the
division, and it survives). Today that conversion is a spread-and-finish object
literal at ~60 sites; here it becomes the constructors in §3.

`TerminalCopy` is more than text — two sentences for two surfaces of
different width, plus an outcome — so by the revised vocabulary (§7) it is a
message: `TerminalMessage`, fields `pillText` / `infoColText` / `outcome`, and
`actor?` for a verdict that names a person. It is not a FEEDBACK message; the
`terminalVerdict` constructor is what turns it into one.

---

## 3. `FeedbackMessage`

**DECIDED:** one message type, carrying the mode, whose `text` accepts a string
or a `ReactNode`. Named `FeedbackMessage`.

**DECIDED 2026-09-12 — it is a `class`, with a private constructor.** The
reason that survived the kinds table is not the getters: once a constructor
per kind sets fill, rank and leaves-by, a reader reads a field under any
shape. It is that a class is the one shape an object literal cannot satisfy
and a spread cannot re-mode (the spread has no prototype), so a hand-built or
re-ranked message is a compile error, in tests too — and that is the defect
this area exists to end. It is the repo's first data-carrying class, so
`docs/code-conventions.md` gets a sentence on when a class is the shape; and
getters are not enumerable, so the log at the one door spells rank and kind.
The original reasoning, kept: four things
follow from a message's mode, and today each is decided by the *reader*, in
four different files:

| decision | decided today in |
|---|---|
| does it wear the tinted fill? | `GenericFeedbackPill` |
| does a tap dismiss it? | `GenericFeedbackPill` |
| does `clear()` refuse it? | `useLocalFeedback` (via `locked`) |
| how long does a `timed` one live? | `useLocalFeedback` (1400), `GamePage` (`PEER_PILL_MS`), `ClubPage` (3000) |

If the message answers those itself, as getters, the pill and the slot are
consumers and the mode→behavior table exists once. A type plus a module of
functions can hold the same table, but a reader still has to know which
function to call; a getter on the instance is the only shape where the reader
*cannot* re-derive it by hand.

**The constructors are the second reason.** Static constructors on one name
give every call site one place to look, and make the mode a required argument
instead of a field to remember:

```ts
FeedbackMessage.notOk(res, 'sticky')      // the answer's outcome + text, the surface's mode
FeedbackMessage.terminalVerdict(over)     // permanent; the verdict text
FeedbackMessage.outOfRace(myConceded, …)  // permanent; neutral
FeedbackMessage.waitingTurn(current)      // sticky; neutral; the <Dot> node
```

That closes the `todo.md` item "`stickyPill` and `getNotOkFeedback` cannot
compose" by construction — the half-built `Pick<…>` that `getNotOkFeedback`
returns stops existing.

**Two costs, both of which are also the point.** A class with getters is not
structurally satisfied by an object literal, so (a) every test builds messages
through the constructors, and (b) `{ ...msg, mode }` stops type-checking,
because a spread drops the prototype. That ends the hand-built message
everywhere — scrabble's `LocalFeedbackMsg`, with `mode` made optional, goes
with it — and ends fabricated message shapes in tests.

**The test to apply once the vocabulary settles:** if the design ends with the
message as pure data and every behavior in the slot and pill, a class is a
struct with a capital letter and a plain type + module is the honest shape. The
reasoning above says it does not land there.

### 3.1 A constructor per KIND of feedback, packaging fill + rank + leaves-by

**DECIDED — §11 is the table (Joel, 2026-09-04):** *"we tend to use the same 'mode' for the same
kind-of-feedback, so the constructors will package this up: game-ending
feedback always has fill=true, priority=x, dismiss=NONE."* The inventory
(§4.1) bears it out — every category there uses one mode, and the exceptions
are the three inconsistencies. So under (a′) the mode stops being something a
call site writes. It decomposes into three fields the constructor sets:

- **fill** — does it wear the tinted background (a standing condition)?
- **rank** — which live message the slot draws; lower shows over higher.
- **leaves by** — your next gesture (tap / key) · a timer · the × only ·
  nothing (its owner retracts it when the condition ends).

**Superseded by §11 (2026-09-12)**, which was re-read from the code and
carries the signatures; this draft stays for the record only.

The draft set of kinds, from the inventory. Names are placeholders; the
numbers are one proposed order:

| kind | fill | rank | leaves by | slot | today |
|---|---|---|---|---|---|
| verdict | yes | 2 | owner | local | `terminalPill`, 16 |
| out of the race | yes | 3 | owner | local | `outOfRacePill`, 15 |
| standing danger | yes | 3 | owner | global | codenamesduet sudden death, 1 |
| something failed on a finished board | no | 1 | × | local | New Game not-ok, 17 |
| an answer to hunt with | no | 1 | × | local | stackdown hint + spoiler, 2 |
| whose turn | no | 4 | owner | local (setgame: global) | `waitingTurnPill`, 10 |
| a standing note | no | 5 | owner | local | theme clue, "Chain is full", "reached Genius", history description |
| a not-ok during play | no | 6 | gesture | either | 40 |
| an own-move result | no | 6 | gesture | local | `stickyPill` + hand-built, 46 |
| an own-move acknowledgment | no | 6 | timer | local | accepted word, dump, peel, pencil note, 4 |
| peer narration | no | 6 | timer | global | 21 |
| peer status | no | 5 | owner | global | "moth is writing a clue" |

What the table decides, or exposes for deciding:

1. **Rank 1 above the verdict is the fix for the dead ×** (§4.1): a New Game
   not-ok shows over the verdict while it's up, and the verdict is what's
   underneath when it's dismissed.
2. **The three inconsistencies become one decision each.** An accepted word
   is a timed acknowledgment in letterboxed and a gesture-cleared result in
   spellingbee, strands and connections; "reached Genius" is a standing note
   where every other peer event is narration. Whichever constructor a site
   calls settles it.
3. **The not-ok constructor cannot know the board is finished.** `notOk(res)`
   packages outcome + text from the envelope with the result behavior; the New
   Game case needs the × and the top rank, so it is a different constructor,
   named for the job, taking the same envelope.
4. **Rank order is now a number in one place**, not an expression in fourteen
   games. Waiting above result keeps today's behavior — a not-ok pushed while
   it isn't your turn stays behind "Waiting for moth", which the turn-pill
   docstring argues for. DECIDED the other way 2026-09-12 (§4.4 row 3): a
   not-ok shows over "Waiting for…", and in §11 a result (40) does too.

---

## 4. The slot

**DECIDED (vocabulary):** a **slot** is the thing that holds messages and
draws one. There are two, **local** (below the board) and **global** (the
page header). Under (a′) — §4.2, decided as the direction — it holds every
live message and draws the top-ranked one; "show replaces" was the old
single-value slot.

**DECIDED — two steps, not one.** A constructor returns a complete message;
`show(message)` on a slot is the single door, and returns an **id** — a
string the slot stamps, as `showToast` does — which `retract(id)` takes. The
message is the thing the pill renders, the slot stores, a producer's
`messageFor` returns, and a test builds — none of which is the call site — so
it is not a distraction; a HALF-built one (today's `Pick`) is.
The toast store has the same seam (`ToastSpec` → `showToast`).

**DECIDED 2026-09-12 — one hook, and a slot's list lives in its host.** Today
the local slot is a hook and the global slot is inline state written twice
(`GamePage`, `ClubPage`), each with its own auto-clear effect and its own
default duration. One `useFeedbackSlot` owns the list, the timers and the
draw-the-top rule; each PlayArea calls it for the local slot and each page
for the global one, and the page still hands its instance down as
`ctx.globalFeedback`. The type and hook are unqualified; only the two
*instances* are called local and global.

Why in the host and not a module singleton keyed by slot name (the toast
store's shape): a slot must die with its page or its PlayArea, and a list
held in the host does that for free, where a singleton would need every host
to empty it by hand on unmount and on game change — and a result left showing
when a player leaves a game would otherwise be drawn by the next game's
PlayArea. The root-mount rule (`App.tsx`'s docstring) does not apply: a
slot's pusher and drawer are both inside one page. The list logic — add,
remove by id, top by rank, timers — is a pure module tested without React,
and the hook is its React wrapper. A console trigger (`puppill`) and a test
peek need a reachable instance, so a mounted host registers its slot in a
module registry keyed by slot name for as long as it is mounted.

Not built here: a shared core under the toast, fault and slot stores. The two
existing stores are blessed and would share only subscribe-and-snapshot; if
the slot's pure module turns out to be that core with "which to draw" as its
one parameter, it is a `todo.md` Someday.

### 4.1 What the inventory found: two mechanisms

A count of every site that creates a message (2026-09-04; sites in code, not
messages at runtime; the shared feedback files and tests excluded):

| mode | sites | of which not-ok | what ends up there |
|---|---|---|---|
| sticky | 97 | 40 | a not-ok; an own-move result the FE or an `ok` wrote (46); whose turn it is (10); a peer's status in the header (3) |
| permanent | 32 | 0 | the verdict (16), out-of-race (15), codenamesduet's sudden death (1) — no site hand-writes this mode |
| timed | 27 | 0 | peer narration and chat in the global slot (23); four own-move acknowledgements of a success the player already saw |
| manual | 21 | 19 | New Game not-oks on a finished board (17 sites, 15 games); stackdown's two help not-oks and two help answers, which stay up while the player hunts |

`permanent`, `manual` and `timed` each hold one kind of thing. **`sticky`
holds two:** a *result* — something you did, answered where you did it,
cleared by your next action, which is what the docs say sticky means — and a
*condition* that is true until something changes: it isn't your turn, an
opponent holds a rank, strands' theme clue before the first find, letterboxed's
"Chain is full", setgame's history description while viewing. Thirteen sites
plus strays.

**The two kinds arrive by two mechanisms, and the mechanism decides the
behavior, not the mode.** Results are *pushed* with `show()` and live in the
slot's state. Conditions are *derived* — computed every render in a precedence
expression that 14 games write by hand:

```ts
over ? terminalPill(…) : isLocallyDone ? outOfRacePill(…) : waiting ? waitingTurnPill(…) : localFeedback
```

with the pushed state as the fallback at the end. So a keystroke on a derived
"Waiting for moth" clears the state and changes nothing: the next render
derives the same pill. The one condition that is pushed — setgame's header
waiting pill — IS dismissed by a tap and stays gone until the turn changes.
Same builder, same mode, opposite behavior.

Two consequences already on record:

- **`locked` and `permanent` are different things** (Joel, 2026-09-04): `locked`
  is a property of the slot for a period — while terminal, `clear()` refuses —
  and has no look; `permanent` is a property of a message — the fill, and
  nothing dismisses it. They coincide except where they don't: a New Game
  not-ok on a finished board is a `manual` message pushed into a locked slot,
  so its × calls a clear the lock refuses. **The × is dead** in every game with
  a New Game item. And because `show` replaces, the verdict is gone from the
  slot either way.
- **The same event gets different modes in different games.** An accepted word
  is timed in letterboxed and sticky in spellingbee, strands and connections;
  a peer reaching a rank is sticky while every other peer event is timed.
  Nothing records whether that is deliberate.

### 4.2 Making the two mechanisms one — DECIDED, (a′) push with a rank

**(a) Conditions push** (Joel, 2026-09-04: *"we could change this by having
the 'condition' mechanisms output a push message"*). Every message lives in
the slot's state. Each condition needs an effect keyed on its own edge —
show on true, clear on false — and a pushed condition is dismissable by
whatever its mode allows, so a tap or a keystroke on "Waiting for moth"
removes it until the turn next changes (setgame's header pill today). State
written from effects is the shape `react-hooks` errors on here and the one
that has looped before.

**(a′) Push with a rank** — **DECIDED as the direction** (Joel, 2026-09-04:
*"ok. this seems like a good direction for feedback — more orthogonal, and
easier to find 'what produces feedback in a game', since I grep for one
thing, rather than knowing the different pieces of state that might be set
that change what ultimately shows in the slot"*). The fields, ranks and kind
names below stay PROPOSED. It is the fuller form of (a), from Joel puzzling
over whether one mechanism makes *priorities* possible. Every message
carries a rank; the slot keeps every live message and draws the highest;
when that one clears or times out the next shows. That is what the 14
hand-written precedence expressions do today, declared once per message
instead of once per game — and it can say things the expression can't, like
a manual New Game not-ok outranking the verdict while it's up and the verdict
returning when it's dismissed. A condition is then push + **retract**, and an
effect's cleanup does the retracting when the condition ends or the component
unmounts, so no ending edge is written by hand. Costs: the slot grows a
`retract(id)` verb and becomes a small collection; condition effects must
depend on primitives (a boolean, a key string), never on the message object,
or they re-run every render; a push on mount must land after anything that
clears on mount; and `permanent` splits, because "Waiting for moth" is
owner-cleared but must not wear the fill — the fill becomes its own flag.
Against (b), which gives exactly two levels with condition order still stated
per game, (a′) is the design that has general priority.

**Why (a′) is recommended over (b).** Three arguments from Joel (2026-09-04),
each checked:

- **One door, so one place to audit and debug.** Every message that ever
  shows passes through `show`; a log or a console trigger there sees all of
  them. A derived condition passes through nothing. The toast store already
  does this — `showToast` is the only way in, which is what makes
  `window.puptoast()` possible; pills get a `puppill()` the same way.
- **It is the toast store's shape**, not a resemblance.
  `common/toasts/toastStore.ts` is a module-level collection pushed into by
  `showToast`, replaced in place by a stable `id`, retracted by
  `dismissToast(id)`, self-cleared by `ms`, drawn by a host — and its
  invitation watcher keeps one toast per thing alive by pushing on the edge
  and dismissing when the thing goes, which is exactly the condition pattern.
  (a′) is that store with a rank, drawing only its top live message, keyed by
  slot.
- ~~Toast or pill as a call-site choice~~ — **DECIDED 2026-09-12: NOT a
  goal, not even Someday.** Joel: *"feedback pills are not toasts and there's
  no reason to merge this at all."* The toast store's shape is a precedent
  for the slot; the two stores and their message types stay separate.

- **"What produces feedback in this game?" is one grep.** Every message is a
  `show` of a constructor. Today the answer is: the `show` sites, PLUS every
  piece of state the derived precedence expression reads — `over`,
  `isLocallyDone`, `waiting`, `viewing`, `chainFull` — which nothing names as
  feedback.

**Three stores, one shape** (Joel, 2026-09-04: *"this plan for feedback also
matches much of how we handle fault modals — a similar kind of store"*). The
fault store's own docstring opens "the toastStore pattern", so (a′) makes a
third:

| store | holds | draws | retract | self-clear | scope |
|---|---|---|---|---|---|
| toast (`common/toasts/toastStore.ts`) | a list; a stable id replaces in place | all, stacked | by id | `ms` | app — one host |
| fault (`common/faults/faultStore.ts`) | a FIFO queue, capped at 5 | the first | dismiss the first | none | app — one host |
| pill slot, under (a′) | a list, ordered by rank | the top | by id | `ms` | one per page + one per PlayArea |

The one real difference is scope: toast and fault are module singletons
because App mounts one host; a local slot is mounted per PlayArea and must
empty on unmount, so it is the same shape held in a hook (or a singleton
keyed by slot with a reset) — a question of where the store lives, not what
it is. Two things to copy from the fault store: its field is already `text`,
and `peekFaultsForTest` is the seam a test uses to assert "this went to the
modal, not a slot" without rendering — the slot wants the same `peek` for
"this went to the local slot at this rank". **DECIDED 2026-09-12: NOT built
in this area** (§4, the slot's home); recorded as it was proposed — the
three could share one core — a `useSyncExternalStore` collection with
"which to draw" as the only pluggable part. Not this area's to build unless
the slot's implementation makes it free.

What (b) had over it was only "no effects for conditions". The rule that
keeps (a′) safe — **a condition effect depends on primitives, never on the
message object** — is stated here as a hard rule, and is the thing to guard.

**(b) is kept below for the record**, not as a live candidate.

**(b) The slot holds two layers** (superseded by (a′)). A derived **condition**,
handed in every render, and a pushed **message**, held in state. The message
shows while it lives; when cleared or timed out, the condition shows. A
condition is never cleared — it ends when the state that produced it changes.
Then:

- **sticky / timed / manual apply only to messages**, which are all results,
  and every one is dismissable by the gesture its mode names.
- **conditions have no dismissal mode.** They carry outcome, text, and whether
  they wear the fill: the verdict, out-of-race and sudden death do;
  "Waiting for moth", "moth reached Genius", the theme clue don't. This is
  the axis `permanent` was really naming (§5).
- **`locked` goes, and the two bugs above close.** The verdict is a condition,
  so nothing clears it; a New Game not-ok is a manual message on top; its ×
  works, and dismissing it shows the verdict again instead of nothing.
- **the precedence expression moves into the slot**, written once.

What (b) costs: the global slot takes only pushes today, so setgame's header
waiting pill and the two "reached rank" pills either stay pushed or the
global slot learns to take a condition; and precedence *among* conditions
(verdict over out-of-race over waiting) still has to be stated — either one
ordered builder per game or an order the slot knows.

### 4.3 The whole flow, one picture

The twin of [feedback-system.md §7](feedback-system.md). Four origins still;
the difference is that every one of them ends in a constructor, every
constructor ends in `show`, and a condition is an origin like the others
instead of a branch in a render expression.

```
    SERVER                    FE'S OWN CHECK      PEER EVENT             CONDITION
 rpc / read / edge fn       "Not enough letters"  (append-only stream)   a state EDGE: over,
       │                          │                      │               waiting, out-of-race,
    Envelope                      │                      │               sudden death, …
       │                          │                      │                      │
 ┌─────┴──────┬──────────┐        │              producer hook            an effect keyed on
 fault     not-ok    ok + words   │           (peer narration, chat)      a PRIMITIVE — never
   │          │           │       │                      │               the message object
 MODAL        │           │       │                messageFor()                 │
 (central,    │           │       │                      │                      │
 below this   └────┬──────┘       │                      │                      │
 area — and        │              │                      │                      │
 the pill is       ▼              ▼                      ▼                      ▼
 ALSO shown) ┌────────────────────────────────────────────────────────────────────────┐
             │                FeedbackMessage.<kind>(…)  — the constructors           │
             │      notOk(res) · result(outcome, text) · terminalVerdict(over)         │
             │   outOfRace(…) · waiting(who) · peer(who, text) · …   (§3.1's table)   │
             │   each one sets:  outcome · text · fill · rank · leaves-by             │
             └──────────────────────────────────┬─────────────────────────────────────┘
                                                │  one complete FeedbackMessage
                                                ▼
                            slot.show(message) → id               ◄── THE one door
                                                │                      (a log or puppill()
                          ┌─────────────────────┴──────────────────┐   sees everything)
                     local slot                               global slot
                  (below the board;                          (page header;
                   one per PlayArea)                          one per page)
                          │                                        │
              holds every LIVE message, ordered by rank ──► draws the TOP one ──► <FeedbackPill>
                          │                                               (outcome · text · fill · ×?)
              how a message leaves — set by its kind, enforced by the slot:
                 gesture  ── a tap / a key ─────────────► slot.clear(id)
                 timer    ── ms elapsed ────────────────► slot auto-retracts
                 × only   ── the close button ──────────► slot.clear(id)
                 owner    ── the condition's effect ends ► cleanup: slot.retract(id)
              …and whatever is next by rank shows.

   NOT feedback, for the record (§1):
     form-validation ──► the FIELD (setError)          toast ──► showToast(spec): the same
     a board mark     ──► the tile / WordList             seam, a different host, stacks
```

Three things the picture says that the old one couldn't:

- **A fault reaches two channels, still.** The modal is raised centrally
  below this area, and the same envelope goes on into `notOk(res)` — the pill
  is what remains once the modal is dismissed (docs/envelopes.md).
- **Conditions have an origin box.** In the old picture they were nowhere:
  they lived inside 14 render expressions. Here they are an effect on a
  primitive that shows on the rising edge and retracts in its cleanup.
- **Leaving is the slot's job, per kind.** The four ways out are one column,
  and "what shows next" is answered by rank, not by whoever cleared last.

**Restart, under either.** Today the verdict leaves after a restart because
`isTerminal` flips false and `locked` with it. Under (b) it leaves because the
derived condition does. Under (a) something has to clear it. Check every
game's restart and game-end path against the chosen design (both, per the
standing rule).

### 4.4 What a player notices — the agreed list

Written 2026-09-12 as the design review's summary before any code, and
agreed row by row — all ten DECIDED. Rows 1–6 change behavior; the rest
change appearance or nothing.

1. **A New Game not-ok on a finished board.** Today its × is dead (the slot
   is locked at terminal and refuses the clear) and the verdict it replaced
   is gone for good. After: it shows above the verdict, its × works, and the
   verdict comes back when it is dismissed. DECIDED.
2. **The three sticky header pills** — setgame's "Waiting for ● moth…", and
   spellingbee's and wordwheel's "● moth reached Genius" — are tap-dismissable
   today only because `FeedbackPill` dismisses any sticky or timed message on
   click, and they are the only sticky ones in the header. After: nothing is
   special about them; each takes its kind's behavior (whose-turn is
   owner-cleared; "reached" is row 5). DECIDED — Joel: *"there's no reason
   setgame's waiting pill should be special; once we convert, it'll snap into
   place like the others."*
3. **A not-ok while it isn't your turn** shows OVER "Waiting for ● moth…".
   DECIDED — Joel: rare, *"but definitely more important than 'waiting
   for'"*. Today it hides behind it. An input to the rank order (§9 item 7).
4. **An accepted word** is sticky everywhere — cleared by the next action: any
   keystroke (`act-dismiss-feedback`, which does not consume it), a tile
   click, or a tap on the pill. Today letterboxed times it out. DECIDED, with
   a rider: **every constructor takes an optional `overrides` argument** — an
   object whose keys are the message's own field names (`outcome`, `fill`,
   `rank`, `leavesBy`, `ms`, …), applied over the kind's defaults — so a
   game's own area may tweak this later without a new kind: a different
   outcome for a waiting message, or `{ leavesBy: 'timer', ms: 500 }`.
   Uncommon by design. That is the one exception to §9 item 2b's "a message
   carries no duration of its own": the KINDS table is the default, and a
   site that passes an override is making a decision there, in the open. The
   constructor is still the only door — the class stays unforgeable, and the
   override is a parameter it honors, not a spread.
5. **"● moth reached Genius"** (spellingbee, wordwheel, compete) becomes timed
   like every other peer event. DECIDED. Today it is sticky.
6. **Durations** follow the kind: bananagrams' peel and dump (2.5s today) and
   chat's header pill (2s today) take their kind's number unless the review
   gives them one. DECIDED.
7. **The missing-player placeholder** is "a player", replacing seven strings.
   Unreachable in practice. DECIDED.
8. **Peer pills draw the person the standard way.** Scrabble's peer-move pill
   gets the name-and-disc mention (the name drops on phones) where today it
   bakes the name into the text; chat's header pill gets the same mention and
   loses its bold sender unless the chat kind keeps it. DECIDED.
9. **Compete verdicts that name the winner** (spellingbee, wordwheel,
   wordiply) look the same; the pill draws the actor instead of the game
   building a `verdictNode`. DECIDED.
10. **Restart and game end.** The verdict leaves on restart because its
    owning effect retracts it when the terminal state ends, which is what
    `locked` flipping did. Same result; checked per game at conversion by the
    standing rule. DECIDED.
11. **Every not-ok pill stays until its × is pressed, and shows over the
    verdict.** Today a race during play ("Not your turn", "Board changed",
    "Game over", "CAT — already found" on commit) clears on the next
    keystroke, and the red pill under a fault modal does too. After: all of
    them are `notOk` — × only, above the verdict — the same as a New
    Game failure already is. A move that raced the game's end shows its
    "Someone got there first" over the "Lost", and the × reveals the
    verdict. DECIDED 2026-09-12 (§11.3 item 10).

---

## 5. The mode

**MOOT 2026-09-12 (§9 item 3).** Today `mode` is `{ kind: 'sticky' } | { kind: 'timed'; ms?: number }
| { kind: 'manual' } | { kind: 'permanent' }`. The object shape exists only so
`timed` can carry `ms`. Hand-written literals today, outside the shared files:

| kind | hand-written sites |
|---|---|
| `sticky` | 44 |
| `timed` | 26 |
| `manual` | 19 |
| `permanent` | 2 |

**Under (a′) + §3.1 this question changes shape.** The call site never writes
a mode: the constructor for the KIND sets fill, rank and leaves-by, and the
four mode names survive only as the vocabulary for describing a kind. What is
left to decide is the internal representation — three fields on the message,
or one discriminated value the three derive from. The earlier framing, kept
for the record:

With constructors most of those disappear, so the question is what the
constructor *argument* reads like. Candidates:

1. `mode: 'sticky'` as a plain string, with `ms` a separate optional field on
   the message.
2. Keep the discriminated object.

The four meanings and their behaviors are settled and not reopened
([docs/ui.md](../docs/ui.md) → Dismiss modes): `sticky`, `timed`, `manual`,
`permanent`.

---

## 6. The producers

**DECIDED (vocabulary):** `usePeerFeedback` is not a slot; it *produces*
messages from a peer-event stream into someone else's slot. `useChatFeedback`
is the same kind of thing for chat.

**DECIDED 2026-09-12 — `usePeerFeedback`, after one reversal.** First ruling
(from the names table): keep `useGlobalFeedback` — *"We call our feedback
slots 'local' and 'global'."* Then, on reading the hook itself: *"it's not
at all about the slot — it's about streaming peer messages to it. Let's
change it to your original name, usePeerFeedback."* A producer is named for
what it produces from, and the slot it feeds is an argument.
`useChatFeedback` already followed that rule and keeps its name.

---

## 7. The words

**DECIDED, revised 2026-09-12.** One meaning per word:

| word | means | and nothing else |
|---|---|---|
| **text** | the words something shows (string or node); a field that is literally the words is `text`, or `pillText` / `infoColText` where one object holds words for two places | not "copy", not "verdict" |
| **message** | the generic word for anything that is MORE than text — words plus what goes with them; fine wherever the purpose is clear, and qualified where it is not | not a bare string |
| **feedback message** | the object a slot holds: text + outcome + kind (+ actor); `FeedbackMessage`, and a variable is `feedbackMessage` / `feedbackMsg` | never bare `feedback` |
| **outcome** | the `won` / `lost` / `near` / … value a message carries, typed `Outcome` — the field and every variable holding one is `outcome` | never `tone`: that word bled into a synonym for outcome (`GenericFeedbackMsg.tone`, `TerminalCopy.tone`, `stickyPill(tone, …)`) and stops here. A button's or a toast's `tone` (`caution`, `destructive`, `info`, …) is a different thing — how a control or an announcement is styled, not an outcome — and keeps its name (Joel, 2026-09-12) |
| **slot** | the holder of live feedback messages, drawing the top one; the two instances are `localFeedbackSlot` and `globalFeedbackSlot` | not a hook name, not "area", never bare `feedback` |
| **pill** | the visual thing, `<FeedbackPill>` — and only the visual thing | not a message, not a builder, not a slot, not "the words a pill shows" |
| **producer** | a hook that fires feedback messages into a slot from a stream; named for the stream it reads (`usePeerFeedback`, `useChatFeedback`), and handed the slot | not a slot |

Joel's four rules, 2026-09-12, which the table above and the one below
follow: *"text" is a good name for a field that is literally the text; if
that's ambiguous where it's used, `pillText` / `infoColText`. "pill" is a
visual thing; a field using it to mean the textual contents of a pill is
confusing. A variable for a feedback message is `feedbackMessage` /
`feedbackMsg`; "feedback" isn't. "message" / "msg" is a good generic name
for any kind of message, so don't use it where its purpose wouldn't be clear.*

**Old → new — every row DECIDED 2026-09-12** (Joel: *"then these names
are fine"*), each re-derived from the four rules:

| today | becomes | status |
|---|---|---|
| `GenericFeedbackMsg` | `FeedbackMessage`, a class; its words field is `text` | DECIDED |
| `GenericFeedbackApi` | `FeedbackSlot`, what `useFeedbackSlot()` returns | DECIDED 2026-09-12 |
| `useLocalFeedback`; its value `localFeedback` | `useFeedbackSlot()` in a PlayArea; the instance is `localFeedbackSlot` | DECIDED 2026-09-12 |
| `GamePage` / `ClubPage` inline state; `ctx.globalFeedback` | `useFeedbackSlot()` in the page; the instance is `globalFeedbackSlot`, on `ctx` under that name | DECIDED 2026-09-12 |
| `useGlobalFeedback` | `usePeerFeedback` — a producer is named for the stream it reads; `useChatFeedback` unchanged | DECIDED |
| `GenericFeedbackPill` (+ stylesheet) | `FeedbackPill` | DECIDED 2026-09-12 |
| `getNotOkFeedback` | `FeedbackMessage.notOk(res)` | DECIDED 2026-09-12 |
| `stickyPill` / `terminalPill` / `outOfRacePill` / `waitingTurnPill` / `yourTurnPill` | constructors on `FeedbackMessage`, named at the kinds review (§9 item 7) | DECIDED 2026-09-12 |
| `localPills.ts` / `genericPills.ts` / scrabble's `LocalFeedbackMsg` | gone | DECIDED 2026-09-12 |
| `TerminalCopy` / `terminalCopy.ts`; fields `verdict`, `message`, `tone` | `TerminalMessage` / `terminalMessage.ts`; fields `pillText`, `infoColText`, `outcome`, plus `actor?` (retiring wordiply's and wordwheel's `verdictNode`) | DECIDED 2026-09-12 |
| `GenericFeedbackMsg.tone`, `stickyPill(tone, …)`, `terminalPill(tone, …)` | `outcome`, everywhere a `won` / `lost` / … value is held — "tone" was a synonym that bled in | DECIDED 2026-09-12 |
| `endedCopy` | `gameEndedTerminalMessage`, returning a `TerminalMessage` — Joel: *"'ended' is such a broad concept!"*, then *"wordy, but even better"* | DECIDED |
| `turnCopy.tsx` with `waitingFor` | `turnText.tsx` with `waitingForText(member)`; the two pill builders go to the constructors row | DECIDED 2026-09-12 |
| the `Generic` prefix | dropped — it qualified the three shared types and never the instances, where the lazy bare `feedback` actually appears; the instance rule and its guard (§8) are the forcing function instead | DECIDED |

---

## 8. What this changes in the docs

Recorded here so the distribution at the end of the area is a checklist, not
a rediscovery:

- **[docs/code-conventions.md](../docs/code-conventions.md) → Feedback
  naming, rule 1** ("every feedback identifier is qualified by `Global`,
  `Local`, or `Generic`") is revised: the type, the hook, the pill and the
  producers are unqualified; a slot instance is `localFeedbackSlot` /
  `globalFeedbackSlot` and a feedback-message variable is `feedbackMessage` /
  `feedbackMsg`; bare `feedback` is never a declared name. The rule was
  written to stop bare `feedback` meaning five things, and the instance half
  is the part that did that work — so it becomes a guard in `src/guards/`,
  shipped with the rename (Joel, 2026-09-12: the prefix was a forcing
  function against lazily using "feedback" to mean a type; the guard is its
  replacement).
- **Rule 2** ("the noun is always `feedback`") stands.
- **The role table** under those rules is rewritten to §7's names.
- **[docs/outcomes.md](../docs/outcomes.md)** says "a feedback pill's `tone`
  is an `Outcome`" and calls the pill's border "the tone color"; both say
  `outcome` once the field does.
- **[docs/ui.md](../docs/ui.md) → Feedback pill**: the `feedback: { show,
  clear }` snippet and the "state lives in `<GamePage>`" line follow the slot
  hook. Dismiss modes are unchanged.
- **feedback-system.md** is deleted when this ships — it describes the system
  this replaces. Its §10 (what is good and survives) is honored here: the
  envelope, severity→channel, central faults, one outcome vocabulary, the
  answer/surface division, and no `getOkFeedback`.

---

## 9. Open questions, in one place

1. ~~Is §1's definition of feedback agreed as written?~~ — **decided 2026-09-12: yes, as written.**
2. ~~`class` (§3), or type + module?~~ — **decided 2026-09-12: a class, private constructor.**
2a. ~~One mechanism (§4.2)~~ — **decided: (a′), push with a rank.** Still
    open under it: the rank order in §3.1's table (see 7).
2b. ~~The internal representation of fill / rank / leaves-by (§5)~~ —
    **decided 2026-09-12: the message stores its `kind`; one `KINDS` table
    holds fill, rank, leaves-by AND the duration of a timed kind, and the
    getters read it.** The slot keeps no default duration, and a message
    carries no `ms` of its own; the four sites that pass one today
    (bananagrams' peel and dump at 2500, chat at 2000) become one question
    each when their surfaces convert.
2c. ~~`dot` on the message~~ — **decided 2026-09-12: the message carries the
    actor (§2); the pill draws the mention; join and weight are the kind's;
    one fallback, "a player".**
3. ~~The mode argument's shape (§5)~~ — **moot 2026-09-12: a call site never
   writes a mode; the kind carries it (2b).**
4. ~~The producer names (§6)~~ — **decided 2026-09-12: unchanged.**
5. ~~The names of the two-surface terminal text type and its fields (§2, §7)~~ — **decided 2026-09-12: `TerminalMessage` with `pillText` / `infoColText` / `outcome` (+ `actor?`).**
6. ~~The slot API object's name (§7)~~ — **decided 2026-09-12: `FeedbackSlot`; instances `localFeedbackSlot` / `globalFeedbackSlot`.**
6a. ~~Where a slot's list lives~~ — **decided 2026-09-12: in its host (§4),
    not a module singleton; no shared store core in this area.**
7. **The kinds table itself (§3.1) — examined LAST, once 1–6 are answered
   and the plan is being written up** (Joel, 2026-09-12). Its kind names,
   its rank order, its duration column, a fixed-outcome column for kinds
   whose outcome never varies, and chat as its own kind (its ": " join, its
   sender's weight, its 2s). Inputs already decided: a not-ok during play
   ranks ABOVE whose-turn (§4.4 row 3); "reached a rank" is peer narration,
   timed (row 5); an accepted word is a sticky result (row 4); constructors
   take call-site overrides (row 4).

---

## 10. Log

- **2026-09-04** — created, after the review that produced feedback-system.md.
  Vocabulary decided (§7 table, first column of marks); "copy" ruled out; the
  class recommended on the merits.
- **2026-09-04, later** — every message-creating site inventoried (§4.1):
  sticky holds results AND conditions, and they arrive by two mechanisms
  (pushed vs derived) that behave differently under a clear. Joel proposed
  unifying on push; two-layer slot recorded as the alternative and
  recommended (§4.2). `locked` ≠ `permanent` recorded, with the dead-× bug.
  "not-ok" is the only name for a not-ok envelope.
- **2026-09-04, third pass** — Joel's case for push everywhere (one door to
  audit; the toast store's shape; toast-or-pill at the call site) checked
  against `toastStore.ts`, which turns out to be (a′) minus the rank.
  Recommendation switched from (b) to (a′). Still OPEN: Joel has not said
  yes.
- **2026-09-04, fourth pass** — Joel: constructors package the behavior per
  KIND of feedback. §3.1 written: mode decomposes into fill + rank +
  leaves-by; twelve draft kinds from the inventory with a proposed rank
  order; the three inconsistencies become one decision each. §5 reframed.
- **2026-09-04, fifth pass** — **(a′) decided as the direction**, with
  Joel's fourth argument (one grep finds every producer). Two-step API
  decided: constructor → message, `show(message)` → id. The kinds table
  stays PROPOSED for tweaking.
- **2026-09-04, sixth pass** — §4.3 flow diagram added. "id", not "handle".
  Joel: the fault modal is the same kind of store; the three-stores table
  written into §4.2, with scope as the one real difference and `text` +
  `peekForTest` as the two things to copy.
- **2026-09-12** — the opening session. §9 items 1–6 decided (see each);
  §4.4 written and agreed; §11 written from a fresh read of every
  message-creating site, for the kinds review that comes last.

---

## 11. The kinds table

**Read from the code on 2026-09-12**, every site that creates a message
(about 160, in 33 files), not from the 2026-09-04 inventory. **The kind
names, their defaults and their constructors are DECIDED 2026-09-12** (Joel,
reading §12: *"these look good"*), after two corrections of his:
`terminalVerdict`, because any move can have a verdict, and `hint`, the
repo's word for priced help. What §11.3 lists is still open.

**What a kind IS.** A kind is a bucket of BEHAVIOR — how the message looks
(fill or outline), where it sits when several are live (rank), how it leaves
(gesture, timer, ×, or its owner's retract), and how long a timed one lives.
A kind is NOT a shape of words: several constructors can make messages of
one kind (`notOk(res)` and `result(outcome, text)` both make a *result*),
and the constructor is what a call site names. The table has ten kinds and
fourteen constructors.

**Two slot rules the table leans on, both PROPOSED:**

- **Lower rank shows over higher.** Ties go to the newest.
- **Showing a message retracts any live message of the SAME rank** (DECIDED
  2026-09-12, §11.3 item 2). That is what keeps a second "Not a word" from
  stacking behind the first, and a second peer's narration from queueing
  behind a teammate's — today's "show replaces" behavior, kept per rank
  instead of per slot. Ranks are spaced by ten so one can be moved by
  editing one number; two kinds share a rank only where replacing each
  other is wanted.

### 11.1 The table

Slot is where the kind is used TODAY, not a property of the kind: a site
picks its slot by which instance it shows into.

| kind | outcome | fill | rank | leaves by | ms | slot today | constructors |
|---|---|---|---|---|---|---|---|
| `notOk` | the answer's | no | 10 | × | — | local (one global) | `notOk(res)` — every not-ok, whatever its severity |
| `terminalVerdict` | the terminal message's | **yes** | 20 | owner | — | local | `terminalVerdict(terminalMessage)` |
| `standingState` | per message | **yes** | 30 | owner | — | local (one global) | `outOfRace(myConceded, activeText?)` · `standingState(outcome, text)` |
| `result` | per message | no | 40 | gesture | — | local | `result(outcome, text)` |
| `acknowledgment` | per message | no | 40 | timer | 1400 | local, club page | `acknowledgment(outcome, text)` |
| `hint` | the answer's | no | 50 | × | — | local | `hint(outcome, text)` |
| `standingNote` | neutral, fixed | no | 60 | owner | — | local (setgame: global) | `waiting(member)` · `peerStatus(member, text)` · `note(text)` |
| `prompt` | neutral, fixed | no | 70 | owner | — | local | `prompt(text)` |
| `peer` | per message | no | 80 | timer | 3000 | global | `peer(member, outcome, text)` |
| `chat` | neutral, fixed | no | 80 | timer | 2000 | global | `chat(member, text)` |

**The same table as the constant the getters read**, every field explicit
(the "—" cells above are `null` here):

```ts
type LeavesBy = 'gesture' | 'timer' | 'close' | 'owner'

type KindDefaults = {
  fill: boolean           // the tinted background
  rank: number            // lower shows over higher
  leavesBy: LeavesBy      // how the message leaves the slot
  ms: number | null       // read only when leavesBy === 'timer'
  outcome: Outcome | null // fixed for the kind, or null = the constructor supplies one
}

const KINDS: Record<Kind, KindDefaults> = {
  notOk:           { fill: false, rank: 10, leavesBy: 'close',   ms: null, outcome: null },      // from the envelope
  terminalVerdict: { fill: true,  rank: 20, leavesBy: 'owner',   ms: null, outcome: null },      // from the terminal message
  standingState:   { fill: true,  rank: 30, leavesBy: 'owner',   ms: null, outcome: null },      // outOfRace passes 'neutral'
  result:          { fill: false, rank: 40, leavesBy: 'gesture', ms: null, outcome: null },      // notOk: from the envelope
  acknowledgment:  { fill: false, rank: 40, leavesBy: 'timer',   ms: 1400, outcome: null },
  hint:            { fill: false, rank: 50, leavesBy: 'close',   ms: null, outcome: null },      // from the answer
  standingNote:    { fill: false, rank: 60, leavesBy: 'owner',   ms: null, outcome: 'neutral' },
  prompt:          { fill: false, rank: 70, leavesBy: 'owner',   ms: null, outcome: 'neutral' },
  peer:            { fill: false, rank: 80, leavesBy: 'timer',   ms: 3000, outcome: null },
  chat:            { fill: false, rank: 80, leavesBy: 'timer',   ms: 2000, outcome: 'neutral' },
}
```

**The constructors — what is passed, and what each makes.** A kind with a
fixed `outcome` has constructors that take none; a kind with `outcome: null`
has constructors that must supply one — from the envelope, the terminal
message, or a parameter. Every constructor ends in an optional `overrides`.
Parameter order is the same everywhere: who (if anyone) · outcome (if the
kind varies) · text · overrides.

```ts
type Overrides = Partial<KindDefaults>   // any of fill / rank / leavesBy / ms / outcome, at the call site

class FeedbackMessage {
  // ── what every message carries ──
  readonly kind: Kind
  readonly text: ReactNode
  readonly outcome: Outcome
  readonly actor: Member | undefined     // drawn before the text as <DotActor>; set only by the
                                         // constructors that take a member. "a player" when undefined.
  get fill(): boolean                    // ┐
  get rank(): number                     // │ KINDS[this.kind], with this message's overrides
  get leavesBy(): LeavesBy               // │ applied over it
  get ms(): number | null                // ┘
  private constructor(…)

  // ── rank 10: the server said no — × only ──
  static notOk(res: NotOkEnvelope, overrides?: Overrides): FeedbackMessage
  //   text = res.message · outcome = notOkOutcome(res) · every not-ok, whatever its severity:
  //   a race ("Someone got there first") shows over the verdict too, and the × reveals it

  // ── rank 20: the game is over ──
  static terminalVerdict(terminalMessage: TerminalMessage, overrides?: Overrides): FeedbackMessage
  //   text = terminalMessage.pillText · outcome = terminalMessage.outcome · actor = terminalMessage.actor

  // ── rank 30: a standing state, with the fill ──
  static outOfRace(myConceded: boolean, activeText?: string, overrides?: Overrides): FeedbackMessage
  //   text = myConceded ? 'Conceded — race continues' : activeText ?? 'Lost — race continues' · outcome = 'neutral'
  static standingState(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   codenamesduet's sudden death: standingState('lost', 'Sudden death: wrong loses')

  // ── rank 40: what your last action did ──
  static result(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   the FE's own verdict on a move: result('lost', 'Not a word')
  static acknowledgment(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   timed: acknowledgment('neutral', '🍌 Peel! You drew 3 tiles.')

  // ── rank 50 and 60: what you asked for; the state you are stuck in ──
  static hint(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   × only: hint(res.outcome, `Hint: ${res.data.hint}`)
  static waiting(member: Member | undefined, overrides?: Overrides): FeedbackMessage
  //   text = waitingForText(member) — "Waiting for ● moth…", the mention mid-sentence (Joel,
  //   2026-09-12: keep this wording), so the constructor builds the node and sets no actor · 'neutral'
  static peerStatus(member: Member | undefined, text: string, overrides?: Overrides): FeedbackMessage
  //   actor = member, text after it: peerStatus(partner, 'writing clue') → "● moth writing clue" · 'neutral'
  static note(text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   note('Chain is full — remove a word') · 'neutral'

  // ── rank 70 and 80: what an empty slot says; what the others are doing ──
  static prompt(text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   prompt('Waiting for your move') · 'neutral'
  static peer(member: Member | undefined, outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage
  //   actor = member: peer(moth, 'won', 'found APPLE +7') → "● moth found APPLE +7", fades after 3000
  static chat(member: Member | undefined, text: string, overrides?: Overrides): FeedbackMessage
  //   actor = member, joined with ": " → "● moth: hi everyone" · 'neutral' · fades after 2000
}
```

Two of them, written out, to show the shape of the body:

```ts
static waiting(member: Member | undefined, overrides?: Overrides) {
  return new FeedbackMessage('standingNote', waitingForText(member), undefined, { ...KINDS.standingNote, ...overrides })
}
static notOk(res: NotOkEnvelope, overrides?: Overrides) {
  return new FeedbackMessage('result', res.message, undefined, { ...KINDS.result, outcome: notOkOutcome(res), ...overrides })
}
```

Rank order, top to bottom, reads: *something failed on a finished board* →
*the game is over* → *you are out / you are in danger* → *what your last
action did* → *what you asked for / the state you are stuck in* → *what an
empty slot says / what the others are doing*. §4.4 row 3 (a not-ok over
"Waiting for…") is rank 40 over rank 60.

### 11.2 Each kind, with what is in it today

Each kind: what it is for, then one bullet per constructor with what that
constructor makes today. Anything still to decide is in §11.3, not here.

**`notOk` — rank 10, × only.** Every not-ok: the server said no, and the
player reads why and presses the × to move on. Above the verdict, because a
move that raced the game's end ("Someone got there first", "Game over") is
worth reading over the "Lost" it lost to, and the × then shows the verdict
(§4.4 rows 1 and 11).
- `notOk(res)` — the New Game answers on a finished board (17 sites,
  `manual` today: boggle `PlayArea.tsx:344`, bananagrams `:316`, wordle
  `:315`, and one per game); the races during play (about 40 sites,
  `sticky` today: "Board changed" at scrabble `BoardCol.tsx:654`, "Not your
  turn", "Game over", "Already conceded", "CAT — already found", "Someone
  got there first"; crosswords `PlayArea.tsx:260, 282, 529, 559, 605, 650`;
  `useStandardGameActions.ts:126, 174, 197`; GamePage's End race `:467` in
  the global slot); stackdown's two help not-oks (`:292`, `:319`, `manual`
  today — unchanged); and the red pill left under a fault modal at any of
  those sites.

**`terminalVerdict` — rank 20, fill, owner-cleared.** The terminal verdict,
from a game's `buildOver`. Pushed by an effect on the terminal edge,
retracted by its cleanup when the game restarts.
- `terminalVerdict(terminalMessage)` — "Won: all found" / "Lost: out of
  guesses" / "Beaten to the punch" (psychicnum `PlayArea.tsx:739–751`),
  "Game ended" (`gameEndedTerminalMessage`), "● moth won at Genius" with
  the actor (spellingbee, wordwheel, wordiply): 17 `terminalPill(...)`
  sites, one per game plus stackdown's.

**`standingState` — rank 30, fill, owner-cleared, outcome per message.** A
condition you are in for the rest of the game, worn with the fill.
- `outOfRace(myConceded, activeText?)` — "Conceded — race continues" /
  "Lost — race continues" / "Out of guesses — race continues" (psychicnum
  `BoardCol.tsx:269`) / "Solved — waiting on the rest" (wordle `:499`,
  waffle `:625`, strands `:761`): 15 `outOfRacePill(...)` sites, neutral.
- `standingState(outcome, text)` — `standingState('lost', 'Sudden death:
  wrong loses')`, codenamesduet `PlayArea.tsx:186–189`, in the global slot.

**`result` — rank 40, outline, gesture-cleared.** What your last action did,
answered where you did it, in the FE's own words. A not-ok is never a
result: the server's no is a `notOk`, above.
- `result(outcome, text)` — the FE's own verdict on a move: "Correct" /
  "One away!" / "Incorrect" (connections `BoardCol.tsx:328–337`), "Not on
  the board" (psychicnum `BoardCol.tsx:216`), "CAT — too short" / "— already
  found" / "— +7" (`useWordSubmit.ts:203–238`: boggle, spellingbee,
  wordwheel), strands' `pillFor` (`:92–102`), "Not enough letters" (wordle
  `BoardCol.tsx:260`), "Not a set" (setgame `:281`), bananagrams' Check
  answers (`:175–184`), stackdown's "not a word" `ok` (`:272`),
  letterboxed's accepted word "APPLE — 3 words left" (`:213–217`, timed
  today; sticky by §4.4 row 4): about 45 sites.

**`acknowledgment` — rank 40, outline, timed, 1400 by default.** A success
the player already saw on the board, said once and gone.
- `acknowledgment(outcome, text)` — "🍌 Peel! You drew 3 tiles." / "⇄ Dumped
  1, drew 3." (bananagrams `:231–246`, 2500 today — §11.3 item 7), "Check
  skips pencil marks" (crosswords `PENCIL_SKIPPED_MSG`, `:73–77`), and
  ClubPage's "Rename club: coming soon" (`:426–430`) and "<title> deleted",
  a page acknowledging its own menu action in its global slot.

**`hint` — rank 50, outline, × only.** Priced help the player asked
for, kept up while they hunt with it. Below results on purpose: a "Not a
word" shows over it, and dismissing that brings the hint back.
- `hint(outcome, text)` — "Next word: APPLE" / "Hint: a fruit"
  (stackdown `:299`, `:322`, `manual` today); letterboxed's help text
  `helpPillText(kind, word)`, both the player's own (`:385`) and a
  teammate's shown in the local slot (`:574`), `sticky` today (§11.3 item 4).

**`standingNote` — rank 60, outline, neutral, owner-cleared.** A state you
are in until something changes, with no fill because it is not final.
- `waiting(member)` — "Waiting for ● moth…": ten games' precedence
  expressions (`waitingTurnPill`), and setgame's pushed header copy
  (`:553–559`).
- `peerStatus(member, text)` — "● moth writing clue" / "● moth guessing" /
  "● moth waiting for you" (codenamesduet `:191–207`, in the header).
- `note(text)` — "Chain is full — remove a word" (letterboxed
  `BoardCol.tsx:113`). (setgame's history-viewer description, `:620`, was
  here; it leaves the feedback system for the shared history banner —
  §11.3 item 3.)

**`prompt` — rank 70, outline, neutral, owner-cleared.** What an empty slot
says. Everything outranks it.
- `prompt(text)` — "Waiting for your move" (setgame `:634`, the fallback
  under an own-move result in turn coop); strands' theme clue “…” (`:768`,
  before the first find — §11.3 item 6).

**`peer` — rank 80, outline, timed 3000, outcome per message.** A peer did
something; the header narrates it and lets it fade. The actor leads.
- `peer(member, outcome, text)` — "● moth found APPLE +7" (spellingbee
  `:444`, wordwheel `:451`, boggle `:419`), "● moth guessed CRANE" (wordle
  `:191`), "● moth solved it" (wordle `:222`, waffle `:177`), "● moth found
  a set" (setgame `:527`), "● moth got a hint" (letterboxed `:579`,
  psychicnum `:290`), "● moth out of swaps" (waffle, `warning`), "● moth
  tried CAT" (stackdown `:584`, `lost`), scrabble's peer move (`:292–297`),
  "● moth reached Genius" (spellingbee `:477`, wordwheel `:484`, sticky
  today; timed by §4.4 row 5): 23 sites, 21 of them through
  `usePeerFeedback`'s `messageFor`.

**`chat` — rank 80, outline, neutral, timed 2000.** A chat line announced in
the header. Its own kind because its join is ": " and its duration is
shorter; its sender stays bold (Joel, 2026-09-12), one line in this
constructor.
- `chat(member, text)` — "● moth: hi everyone" (`useChatFeedback.tsx:64–77`).

### 11.3 What the review has to settle

1. ~~The kind names.~~ **DECIDED 2026-09-12**: as §12 shows them.
2. ~~Same-kind or same-rank replace.~~ **DECIDED 2026-09-12: same RANK
   replaces**, and ranks are spaced by ten so a kind can be bumped by
   editing one number. The assignment, with the consequence that decided
   each gap:
   `notOk` 10 · `terminalVerdict` 20 · `standingState` 30 ·
   `result` 40 · `acknowledgment` 40 (an own-move thing replaces an own-move
   thing, as today) · `hint` 50 · `standingNote` 60 (NOT 50: a pushed hint
   would otherwise evict "Waiting for ● moth…", and nothing would push it
   back until the turn changed) · `prompt` 70 · `peer` 80 · `chat` 80 (a chat
   line replaces a narration, as today). §11.1's table and constant carry
   these numbers.
3. ~~setgame's history-viewer description above the verdict.~~ **DECIDED
   2026-09-12**: setgame is not special. waffle and connections show the
   viewed move in the shared history BANNER over the move area, not in the
   feedback slot; setgame converts to that banner, and the description
   leaves the feedback system. `note(text)` loses that example.
4. ~~`hint`'s dismissal.~~ **DECIDED 2026-09-12: always the ×** — *"otherwise
   it's too easy to get charged for a clue and you accidentally cleared
   it."* letterboxed's hint and spoiler text (gesture-cleared today) change.
5. ~~stackdown's help not-oks~~ — settled by 10: `notOk`, which is what
   their `manual` already was.
6. ~~strands' theme clue returning~~ after a rejected word is dismissed.
   **DECIDED 2026-09-12: yes.**
7. ~~bananagrams' 2500~~ — **DECIDED 2026-09-12: an override at the site**;
   it is specific to bananagrams.
8. ~~Fixed-outcome column~~ — answered by the constant Joel approved:
   `outcome` is a field of `KindDefaults`, `'neutral'` where the kind never
   varies and `null` where the constructor supplies it.
9. ~~Global-slot ranks~~ — **DECIDED 2026-09-12: the same numbers.** Some
   kinds only ever appear in the global slot, and that is fine.
10. ~~How a not-ok leaves~~ — **DECIDED 2026-09-12: every not-ok is a
    `notOk`, rank 10, × only, whatever its severity.** The sentences were
    read from the SQL: nearly every not-ok a player meets during play is a
    RACE — "Game over" (37 raises), "Already conceded" (20), "Board
    changed", "CAT — already found", "Not your turn", "Someone got there
    first", "Crosses a found word", … First ruling: races stay gesture
    results and only a fault or service error is × only (Joel, on a
    fault's pill clearing by a keystroke: *"hell no"*). Then, on races too:
    *"it'll be uncommon for a race to happen after a game is terminal, but
    if a player tried to make a move, the game timed out (or a peer used
    the last guess) and they get the 'lost' message first, it'll still be
    handy for them to get the 'someone else beat you to the race' message.
    They can click the × to see the underlying terminal message."* So one
    constructor, `notOk(res)`, one kind; `newGameFailed` is gone because it
    would have done the same thing. Consequence worth knowing: the
    word-hunt games' "CAT — already found" exists twice, as the FE's own
    check (a `result`, cleared by the next key) and as the server's race on
    commit (a `notOk`, × only) — same words, two dismissals. Added to §4.4
    as row 11.
11. ~~The rank-10 kind's name~~ — **DECIDED 2026-09-12: `notOk`**, the
    same word as the envelope and the constructor. Joel: *"otherwise, we're
    just inventing a new synonym to memorize."*

---

## 12. The kinds, for reading — one place, top to bottom

The same content as §11, laid out to be read straight through: each kind,
its defaults, its constructors, and where each constructor is used. Every
constructor's last parameter is `overrides?: Overrides`, any of the five
defaults, applied over the kind's.

### `notOk`

*The server said no. You read why, and press the × to move on. Shows over
the verdict, so a move that raced the game's end still gets its "someone
got there first", and the × reveals the "Lost" under it.*

- outline · rank 10 · leaves by the × · no timer · outcome from the answer

`notOk(res, overrides?)`
- Every not-ok, whatever its severity. New Game on a finished board when a
  teammate already started one or the generator gave up; "Not your turn",
  "Board changed", "Game over", "Someone got there first" when the board
  moved under your move; and the red pill left under a fault modal once it
  is closed.

### `terminalVerdict`

*The game is over, and this is how it ended.*

- **fill** · rank 20 · leaves when its owner retracts it (the game restarts) ·
  no timer · outcome from the terminal message

`terminalVerdict(terminalMessage, overrides?)`
- Every game's below-board slot once `isTerminal` is true: "Won: all found",
  "Lost: out of time", "Game ended", or "● moth won at Genius" with the
  winner's mention when a compete verdict names a person.

### `standingState`

*A state you are in for the rest of the game, worn with the fill because it
is final for you even though the game goes on.*

- **fill** · rank 30 · owner-retracted · no timer · outcome per message

`outOfRace(myConceded, activeText?, overrides?)`
- A compete player who is out while the others play on: "Conceded — race
  continues" when you conceded, or the game's own words otherwise — "Out
  of guesses — race continues" (psychicnum), "Solved — waiting on the rest"
  (wordle, waffle, strands). Neutral.

`standingState(outcome, text, overrides?)`
- codenamesduet's sudden death, in the header: `standingState('lost',
  'Sudden death: wrong loses')`. The only game-specific standing state.

### `result`

*What your last action did, in the FE's own words, said where you did it.
Your next action clears it: any key, a tile click, or a tap on the pill. A
not-ok is never one of these; the server's no is a `notOk`.*

- outline · rank 40 · leaves by gesture · no timer · outcome per message

`result(outcome, text, overrides?)`
- The FE's own verdict on a move: "Correct" / "One away!" / "Incorrect"
  (connections), "CAT — too short" / "CAT — +7" (the word-hunt games),
  "Not enough letters" (wordle), "Not a set" (setgame), letterboxed's
  accepted word "APPLE — 3 words left". About forty-five sites.

### `acknowledgment`

*A success you already saw on the board, said once and gone.*

- outline · rank 40 · leaves by timer · **1400 ms** · outcome per message

`acknowledgment(outcome, text, overrides?)`
- bananagrams' "🍌 Peel! You drew 3 tiles." after a peel, crosswords' "Check
  skips pencil marks" after a check that skipped some, the club page's
  "Rename club: coming soon" from a placeholder menu item.

### `hint`

*Priced help you asked for, kept up while you hunt with it. Below results,
so "Not a word" shows over it and the hint is back when that is dismissed.*

- outline · rank 50 · leaves by the × · no timer · outcome from the answer

`hint(outcome, text, overrides?)`
- stackdown's "Next word: APPLE" and "Hint: a fruit"; letterboxed's hint
  and spoiler text, shown to the player who asked and to their teammates.

### `standingNote`

*A state you are in until something changes. No fill, because it is not
final.*

- outline · rank 60 · owner-retracted · no timer · **neutral**

`waiting(member, overrides?)`
- "Waiting for ● moth…" in every turn-order coop game while it is not your
  turn; setgame puts it in the header, the others below the board.

`peerStatus(member, text, overrides?)`
- codenamesduet's header line for what your partner is doing: "● moth
  writing clue", "● moth guessing", "● moth waiting for you".

`note(text, overrides?)`
- letterboxed's "Chain is full — remove a word" when the chain is at its
  cap.

### `prompt`

*What an empty slot says. Everything outranks it.*

- outline · rank 70 · owner-retracted · no timer · **neutral**

`prompt(text, overrides?)`
- setgame's "Waiting for your move" under the board when it is your turn
  and nothing else is showing; strands' theme clue before the first find.

### `peer`

*A peer did something; the header says so and lets it fade. The actor
leads.*

- outline · rank 80 · leaves by timer · **3000 ms** · outcome per message

`peer(member, outcome, text, overrides?)`
- "● moth found APPLE +7", "● moth guessed CRANE", "● moth solved it",
  "● moth found a set", "● moth got a hint", "● moth tried CAT", "● moth
  reached Genius" — every coop and compete game's narration of a teammate
  or opponent, through `usePeerFeedback`.

### `chat`

*A chat line announced in the header.*

- outline · rank 80 · leaves by timer · **2000 ms** · **neutral**

`chat(member, text, overrides?)`
- "● **moth**: hi everyone" on the club page and in a game, from the chat
  producer. Joined with ": " rather than a space, and the sender bold, which
  is why it is its own kind.
