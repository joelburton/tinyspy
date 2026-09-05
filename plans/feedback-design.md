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

**Status: PAUSED 2026-09-04, to resume when `game-lib` closes** (Joel: *"we'll
pick up this plan when i'm done with the game-lib area"*). Nothing in code has
changed for it yet. Where it stands: the mechanism is decided (§4.2, push with
a rank), the two-step API is decided (§4), the vocabulary is decided (§7);
the kinds table (§3.1) is the thing to tweak next, and §9 lists what is open.

---

## 1. What counts as feedback

**PROPOSED — keep the definition the repo already has.** Feedback is a message
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

**PROPOSED — the system has two layers, and the seam between them is the thing
with no home today.**

- **Text** is a string someone wrote for a player: the server's
  `envelope.message`, a game's terminal verdict from `buildOver`, a builder's
  wording. Text has no mode, no dot, and no idea where it will be shown.
- A **message** is text plus everything a slot needs: `tone`, `mode`, an
  optional `dot`, and a `text` that may be a `ReactNode` (a string is one, so
  nothing is lost; 21 sites pass JSX today, mostly a leading `<Dot>`).

The conversion from text to message is where the **mode** is chosen, and the
mode is the surface's decision, not the answer's (feedback-system.md §4 has the
division, and it survives). Today that conversion is a spread-and-finish object
literal at ~60 sites; here it becomes the constructors in §3.

`TerminalCopy` is a text type, not a message type: two sentences for two
surfaces of different width. It stays a pair of strings; its fields get names
that say which surface each serves (OPEN: the names — `pill` / `line`?).

---

## 3. `FeedbackMessage`

**DECIDED:** one message type, carrying the mode, whose `text` accepts a string
or a `ReactNode`. Named `FeedbackMessage`.

**PROPOSED — it is a `class`, because the message owns behavior.** Four things
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
FeedbackMessage.notOk(res, 'sticky')      // the answer's tone + text, the surface's mode
FeedbackMessage.terminal(over)            // permanent; the verdict text
FeedbackMessage.outOfRace(myConceded, …)  // permanent; neutral
FeedbackMessage.waitingTurn(current)      // sticky; neutral; the <Dot> node
```

That closes **F-feedback-1** (`sticky-pill-and-not-ok-dont-compose`) by
construction — the half-built `Pick<…>` that `getNotOkFeedback` returns stops
existing.

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

**PROPOSED (Joel, 2026-09-04):** *"we tend to use the same 'mode' for the same
kind-of-feedback, so the constructors will package this up: game-ending
feedback always has fill=true, priority=x, dismiss=NONE."* The inventory
(§4.1) bears it out — every category there uses one mode, and the exceptions
are the three inconsistencies. So under (a′) the mode stops being something a
call site writes. It decomposes into three fields the constructor sets:

- **fill** — does it wear the tinted background (a standing condition)?
- **rank** — which live message the slot draws; lower shows over higher.
- **leaves by** — your next gesture (tap / key) · a timer · the × only ·
  nothing (its owner retracts it when the condition ends).

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
   packages tone + text from the envelope with the result behavior; the New
   Game case needs the × and the top rank, so it is a different constructor,
   named for the job, taking the same envelope.
4. **Rank order is now a number in one place**, not an expression in fourteen
   games. Waiting above result keeps today's behavior — a not-ok pushed while
   it isn't your turn stays behind "Waiting for moth", which the turn-pill
   docstring argues for. OPEN whether that is wanted.

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

**PROPOSED — one hook, two instances.** Today the local slot is a hook and the
global slot is inline state written twice (`GamePage`, `ClubPage`), each with
its own auto-clear effect and its own default duration. One `useFeedbackSlot`
owns the message, the timer and the replace semantics; `GamePage`, `ClubPage`
and every PlayArea call it. The type and hook are unqualified; only the two
*instances* are called local and global.

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

### 4.2 Making the two mechanisms one — OPEN, two candidates

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
  `common/lib/toast/toastStore.ts` is a module-level collection pushed into by
  `showToast`, replaced in place by a stable `id`, retracted by
  `dismissToast(id)`, self-cleared by `ms`, drawn by a host — and its
  invitation watcher keeps one toast per thing alive by pushing on the edge
  and dismissing when the thing goes, which is exactly the condition pattern.
  (a′) is that store with a rank, drawing only its top live message, keyed by
  slot.
- **Toast or pill can become a call-site choice** once both take the same
  message. Three gaps close first: the toast's `tone` is three cosmetic values
  where a pill's is the seven outcomes — and docs/ui.md says a toast
  deliberately carries no validity tone, so the TYPE can be shared without
  the LOOK being shared; the toast's `message: ReactNode` becomes `text`; and
  toasts are app-global where pill slots are per page, so a pushed message
  names its slot.

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
| toast (`lib/toast/toastStore.ts`) | a list; a stable id replaces in place | all, stacked | by id | `ms` | app — one host |
| fault (`lib/fault/faultStore.ts`) | a FIFO queue, capped at 5 | the first | dismiss the first | none | app — one host |
| pill slot, under (a′) | a list, ordered by rank | the top | by id | `ms` | one per page + one per PlayArea |

The one real difference is scope: toast and fault are module singletons
because App mounts one host; a local slot is mounted per PlayArea and must
empty on unmount, so it is the same shape held in a hook (or a singleton
keyed by slot with a reset) — a question of where the store lives, not what
it is. Two things to copy from the fault store: its field is already `text`,
and `peekFaultsForTest` is the seam a test uses to assert "this went to the
modal, not a slot" without rendering — the slot wants the same `peek` for
"this went to the local slot at this rank". **PROPOSED, not decided:** the
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
- **conditions have no dismissal mode.** They carry tone, text, and whether
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
             │   notOk(res) · newGameFailed(res) · result(tone, text) · verdict(over) │
             │   outOfRace(…) · waiting(who) · peer(who, text) · …   (§3.1's table)   │
             │   each one sets:  tone · text · fill · rank · leaves-by                │
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
                          │                                                  (tone · text · fill · ×?)
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

---

## 5. The mode

**OPEN.** Today `mode` is `{ kind: 'sticky' } | { kind: 'timed'; ms?: number }
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

**DECIDED (vocabulary):** `useGlobalFeedback` is not a slot; it *produces*
messages from a peer-event stream into someone else's slot, and it needs a
name with a subject. `useChatFeedback` is the same kind of thing for chat.

**OPEN:** the names. Something like `usePeerNarration`; Joel's call.

---

## 7. The words

**DECIDED.** One meaning per word:

| word | means | and nothing else |
|---|---|---|
| **text** | the words a message shows (string or node) | not "copy", not "verdict", not "message" |
| **message** | the object a slot holds: text + tone + mode (+ dot) | not a string |
| **slot** | the holder of one message; local or global | not a hook name, not "area" |
| **pill** | the rendered component, `<…Pill>` | not a message, not a builder, not a slot |
| **producer** | a hook that fires messages into a slot from a stream | not a slot |

**PROPOSED — old → new**, filled in as names are agreed:

| today | becomes | status |
|---|---|---|
| `GenericFeedbackMsg` | `FeedbackMessage` | DECIDED |
| `GenericFeedbackApi` | the slot's API object — `FeedbackSlot`? | OPEN |
| `useLocalFeedback` | `useFeedbackSlot` (a local instance) | PROPOSED |
| `GamePage` / `ClubPage` inline state | `useFeedbackSlot` (a global instance) | PROPOSED |
| `useGlobalFeedback` | a producer name with a subject | OPEN |
| `getNotOkFeedback` | `FeedbackMessage.notOk` | PROPOSED |
| `stickyPill` | gone — `FeedbackMessage.notOk(res, 'sticky')` or a text + mode constructor | PROPOSED |
| `terminalPill` / `outOfRacePill` / `waitingTurnPill` / `yourTurnPill` | constructors on `FeedbackMessage` | PROPOSED |
| `TerminalCopy` / `endedCopy` / `terminalCopy.ts` | a text-type name without "copy" | OPEN (name) |
| `turnCopy.tsx` | a name without "copy" | OPEN (name) |
| `GenericFeedbackPill` | `FeedbackPill` | PROPOSED |
| `LocalFeedbackMsg` (scrabble) | gone | PROPOSED |
| `localPills.ts` / `genericPills.ts` | gone; their contents become constructors | PROPOSED |

---

## 8. What this changes in the docs

Recorded here so the distribution at the end of the area is a checklist, not
a rediscovery:

- **[docs/code-conventions.md](../docs/code-conventions.md) → Feedback
  naming, rule 1** ("every feedback identifier is qualified by `Global`,
  `Local`, or `Generic`") is revised: the type and the slot hook are
  unqualified; only the two slot *instances* carry local / global. The rule
  was written to stop bare `feedback` meaning five things, and one type with
  two named instances gets there more directly.
- **Rule 2** ("the noun is always `feedback`") stands.
- **The role table** under those rules is rewritten to §7's names.
- **[docs/ui.md](../docs/ui.md) → Feedback pill**: the `feedback: { show,
  clear }` snippet and the "state lives in `<GamePage>`" line follow the slot
  hook. Dismiss modes are unchanged.
- **feedback-system.md** is deleted when this ships — it describes the system
  this replaces. Its §10 (what is good and survives) is honored here: the
  envelope, severity→channel, central faults, one tone vocabulary, the
  answer/surface division, and no `getOkFeedback`.

---

## 9. Open questions, in one place

1. Is §1's definition of feedback agreed as written?
2. `class` (§3), or type + module?
2a. ~~One mechanism (§4.2)~~ — **decided: (a′), push with a rank.** Still
    open under it: the rank order in §3.1's table, and the internal
    representation of fill / rank / leaves-by (§5).
3. The mode argument's shape (§5).
4. The producer names (§6).
5. The names of the two-surface terminal text type and its fields (§2, §7).
6. The slot API object's name (§7).

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
