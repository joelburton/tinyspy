# The error system — results, rejections, and faults

**Status: agreed shape, not yet built (2026-08-26).**

This supersedes `plans/error-copy-sprint.md` entirely. Ignore that file.

This document is the *shape* of the solution — what we agreed and why. It is
not a step-by-step and it does not commit to names.

---

## 1. Why we're redoing this

The current server-error system was built on a false premise: that changing an
error message in the database would require a schema change and a migration.

Everything downstream of that premise deserves re-examination. The key
indirection (`raise 'not-a-word|APPLE|'` → FE table lookup → "APPLE: not a
word") was built to keep prose out of SQL. With the premise gone, it mostly
moves the words *away from the person best placed to write them* — the author
of the RPC, who is looking straight at the condition that triggered them.

## 2. The diagnosis

Failures have a chokepoint and a shape: every failed call funnels through
`serverError.ts`, and every raise looks like `key|detail|`. **Results have
neither**, and the proof is what happened to the one wrapper we do have.

`callRpc.ts` wraps an RPC call, classifies the failure and names the action —
but it reaches only **12 of 99 RPC call sites**, because it returns `null` on
success. It *has* to: for a `returns void` RPC there is genuinely nothing to
hand back, so a wrapper that worked for those could not also serve a call whose
result the caller needs. One wrapper, usable only where the caller wants
nothing. Every other site calls `db.rpc()` raw.

The console shows the same asymmetry from the other side: `[db]` speaks on
failure and is silent on success.

That asymmetry is the actual problem, and three symptoms fall out of it:

- **`null` is ambiguous.** A null reply might mean success, or a branch that
  fell off the end without returning.
- **There's no uniform debugging hook.** You can't log "the result of this
  RPC" because the shapes are 31 different jsonb schemas plus `void`, `table`,
  `text`, `int`, and `boolean`.
- **There's nowhere to put metadata.** How many rows were searched, which
  branch ran, how long it took — no slot exists for any of it.

Note what this means for the fix: giving every RPC an envelope does not
*automatically* collapse the two classes of call site. It removes the reason
they had to exist. `callRpc` still has to be rewritten to hand the envelope
back, and the other 87 sites still have to be converted to it — per game,
alongside the rest of that game's work.

## 3. The shape

### Every RPC returns a JSONB envelope

One shape for every FE-facing RPC: an outcome discriminator, a payload, and a
slot for metadata. `void`, bare `text`, and single-row `returns table` all go
away for FE-facing functions.

Three things this buys, in order of importance:

1. **A missing decision becomes impossible to reach quietly.** A `returns
   jsonb` function that falls off the end without returning is a hard database
   error (`2F005`, "control reached end of function without RETURN"). A
   `returns void` function in the same state succeeds silently. Every branch
   now has to state its outcome or the call blows up — the same property the
   `|` delimiter gives keys, one layer down.
2. **One debugging hook becomes possible.** A single wrapper can log every
   call under the `[db]` tag that `logFault` already uses, so a call's success
   and its failure read as one stream instead of two systems.
3. **Metadata gets a home**, and it's additive — SQL can start dropping
   breadcrumbs in without a single frontend change.

### The discriminator is not the game's verdict

The existing ad-hoc `result` values mix two different things:

- `duplicate` (word already played) — the call refused it.
- `incorrect` (a wrong guess) — the guess was recorded; the *game* said no.

Both are `result` values today, and the frontend can't tell them apart
structurally — it has to know, per game, which words mean which. So the
discriminator says only what the plumbing needs (see "The envelope"
below), and everything game-specific moves into the payload as `verdict`.
"Won", "bonus", "correct" stop being call outcomes and become what they
actually are: facts about game state riding along.

This also dissolves what looked like a separate question — whether an
idempotent no-change outcome (a second click, a race you lost) needs its own
discriminator value. It doesn't: the server processed the call fine, so it's
`ok`, and "nothing changed" is a verdict like any other. `connections.sql:713`
is the live instance, where a unique-index race currently returns silently.

### Helpers raise; RPCs catch at their own boundary

The exception mechanism stays where it's genuinely useful and stops being the
transport to the client.

Of 249 functions in `supabase/sql/`, 50 are called by other SQL and 199 are
top-level. Of the 442 raises, only **25 live in helpers** — the
`require_game_player` / `_require_turn` family. The other **417 are already in
the top-level RPC itself**, so there is nothing for them to bubble *through*.
The call graph is flat.

So:

- **Helpers keep raising.** `common.require_game_player` has 54 callers and
  none of them change. Nothing propagates an outcome by hand.
- **Each top-level RPC catches at its boundary** and turns every outcome *we
  authored* into an envelope — faults included.
- **Only what nobody anticipated bubbles.** A decrement bug that drives
  `psychicnum.players.guesses_remaining` past its `check (between 0 and 9)`
  comes back as SQLSTATE `23514` in Postgres's own error shape, because no one
  wrote a line of SQL saying what it meant.

**The shape says who authored the failure.** Three populations, three shapes:

| shape | means | treated as |
|---|---|---|
| an **envelope** | we wrote this outcome down. Someone named the condition and wrote a sentence for it | whatever `type`/`severity` says |
| the **raw Postgres/PostgREST shape** (`{code, message, details, hint}`) | nobody anticipated it — constraint violation, missing function, deadlock, permission denied | always a fault |
| **no reply at all** | environmental — offline, server down, dead edge container | always a fault |

**Nomenclature: a "raw fault" is one that arrives in Postgres's own shape**, as
opposed to a fault we declared, which arrives as an envelope with `severity:
fault`. Both render the same to a player; they are completely different to
debug, because a declared fault has a named condition and a written reason and
a raw fault has neither. Use the term in code, comments, and conversation — the
distinction is worth a word.

An earlier draft made the fault test "is there an envelope", which put the
faults we *did* anticipate on the same side as the ones nobody ever thought
about. Those are different debugging situations: one has a named condition and
a written reason, the other has neither, and the shape should say which. A
fault we declared is still an envelope — see "The envelope" below.

Either way, the frontend never parses a key and never consults a membership
table. Today faults and rejections travel the *same* route, both as exceptions,
which is exactly why `ERROR_COPY` membership has to exist to tell them apart.

Constraint violations belong to the raw route by construction: all 85 CHECK
constraints are shape and domain guards, nothing anywhere catches a
`check_violation`, and the RPC always guards first — psychicnum rejects an
empty budget *before* it decrements, so the range check only fires if our own
arithmetic is wrong. (The two exceptions are UNIQUE indexes deliberately used
as race referees — `common.create_club`'s handle collision and `connections`'
dup-guess race — and both already catch locally and turn it into a result.)

**No raise site gets rewritten.** The change is one catch block per top-level
RPC, not 442 edits. This is the single most important property of the design
and the reason it's affordable.

### Catching is a savepoint, which dissolves the write-ordering problem

A PL/pgSQL exception block establishes a subtransaction. When the whole
function body sits inside one, catching a rejection rolls back everything the
body wrote and still returns cleanly.

That matters because it makes "did we write before we rejected?" stop being a
design question. For the record, we measured it: **433 of 442 raises (98%) fire
before the function writes anything**, and of the 9 that don't, six are the
"`update … ; if not found`" pattern where nothing was actually written and one
is already inside a savepoint. Only **two** genuinely wrote first — scrabble's
and setgame's `bad-first-turn` — and both check only function parameters, so
the check could simply move above the inserts.

"Reject before you write" is already how this codebase is written, apparently
by instinct. The savepoint means we don't have to enforce it.

### The message carries the words; the author writes them

The rejection's player-facing sentence is written **at the raise**, by the
person writing the RPC.

- **MESSAGE** = the player-facing prose.
- **DETAIL** = unchanged. It stays the debugging line, never shown, surfacing
  only in the `[db]` log and the fault modal's diagnostics.

Shared conditions stay single-authored for free: "You're not in this game"
lives once in `common.require_game_player` and serves all 54 callers.

**On drift.** The worry was that two games needing the same sentence would
drift apart, or that a rule enforced in both SQL and the frontend would grow
two different wordings. Both turn out to be small:

- Common checks are already centralized in shared helpers. One author, one site.
- Cross-game lookalikes are cosmetic, not bugs.
- The same rule enforced in both places is the only real case, and it's nearly
  empty: most server raises re-validate something the frontend already checked
  and are unreachable without a broken client, while the ones a player *can*
  reach are races the frontend can't predict — a teammate taking the word,
  filling the last slot, ending the game mid-move — which have no local twin to
  drift against. Boggle is the illustration: `submit_word` never checks the word
  against `common.words` at all, so there is no server-side "not a word" to
  disagree with the frontend's.

### The envelope

The vocabulary is about **what the player can do next**, not about what the
database did. An earlier draft split on "did a row get written", which is a SQL
fact the frontend never asks about.

**A note on wording: nothing new in this system says "copy" for message text.**
In the literary world it's the right word; among programmers "copy" means
*duplicate*, so a `*_COPY` table or a `hintCopy` variable reads as a copy OF
something. New identifiers, tables and prose here say **text** or **message**.

This is scoped to the new system, deliberately. The existing population —
`TerminalCopy`/`terminalCopy` (135 uses), `endedCopy` (35), `withCopy` (20),
`turnCopy` (13), `hintCopy` (3), and ~285 bare uses in comments — is a separate
job for later, and it wants a line in `docs/naming.md` rather than in a sprint
plan that gets deleted. `ERROR_COPY` and `errorCopy.ts` keep their names either
way: they are deleted wholesale at the end, and renaming a corpse is churn.

**"Envelope" means what the database returns** — the JSONB an RPC hands back.
Only an RPC produces one. A direct table read never does; the frontend
synthesizes something envelope-shaped for reads so every call site branches
alike, but no database returned it. Keep the two apart when talking about this:
the **envelope** comes off the wire, the **call-site shape** is what a caller
sees.

The discriminator is two-level, matching how a caller actually branches — first
"did it work", then "how bad":

```
{
  type:     ok | not-ok,
  message:  "Already guessed",   -- required on not-ok, optional on ok
  meta:     { … },
  dbcode:   'PA042',             -- the SQLSTATE, when the outcome came from a raise
  detail:   'word already in the guess log',
}
```

`ok` adds the reading and the game's own payload:

```
  outcome: won | lost | near | warning | neutral | noted,
  data:    { … whatever the game needs … }
```

`not-ok` adds how bad it is:

```
  severity: fault | validation | error
```

Four notes on the fields:

- **`message` is optional on `ok`.** Plenty of results have nothing to say —
  `concede`, `end_game`, an ordinary accepted move whose pill is built from
  `outcome` and `data`.
- **The game's own fields nest under `data`** rather than sitting as siblings
  of `outcome`, so a game wanting a field called `message` or `meta` can't
  shadow the envelope.
- **`dbcode`, not `code`.** "Code" is too broad a word for a field that means
  one specific thing: the Postgres SQLSTATE. And it is **not** exclusive to
  `not-ok` — because an `ok` outcome can come out of a raise (see below), those
  carry a SQLSTATE too, and keeping it is useful when debugging. A plain
  success that never raised has no `dbcode` at all.
- **`dbcode` and `detail` sit at the top level**, since both come from the
  raise and either branch can be raised.

**The frontend receives everything in the envelope**, `dbcode` and `detail`
included. `dbFetch` logs them and the fault modal's diagnostics use them; a call
site has no use for either, but nothing is stripped on the way — one shape, all
the way through, is simpler than deciding per-field who deserves what.

**`type` is deliberately empty of meaning.** `not-ok` says only "look at
`severity`". A word with content — `problem`, `error` — invites the reader to
wonder how it differs from `severity: error`, which is the exact confusion the
two levels exist to remove.

**What each `not-ok` severity means:**

| | means | the player's move | surface | console |
|---|---|---|---|---|
| **validation** | the values you sent can't work, and we had to ask the server to find out | fix the input, try again | form's red line | `console.debug` |
| **error** | something we depend on didn't work | nothing to fix; wait and retry | pill | `console.warn` |
| **fault** | a bug | nothing | modal / fault page | `console.error` |

…and `ok` sits at `console.debug`.

**An `ok` outcome can come out of a `raise`.** `already-guessed` is
`{type: ok, outcome: warning}`, but in SQL it is a `raise` today and stays one:
the catch block reads the SQLSTATE, sees that this condition is an `ok`, and
builds a success envelope from the exception handler. It reads oddly the first
time — an exception producing `type: ok` — but it buys two things worth the
strangeness. Control flow at all 442 raise sites is untouched, so the "one
catch block per RPC, not 442 edits" property survives; and the savepoint still
rolls back anything the body wrote before the condition was noticed, which an
early `return` would not.

**The raise's four fields each get exactly one job:**

| field | carries | audience |
|---|---|---|
| MESSAGE | the player-facing sentence | the player |
| DETAIL | the debugging line | the `[db]` log and the fault modal's diagnostics |
| ERRCODE | that this is ours, and which branch — see "The SQLSTATE scheme" | the catch block |
| HINT | the refinement: `outcome` when it's an `ok`, `severity` when it's a `not-ok` | the catch block only |

HINT is purely **inter-function**: the catch block consumes it to build the
envelope and does not forward it. (It does reach the frontend on a raw fault,
where PostgREST relays it, but nothing we author travels that way.) The two
branches are disjoint, so one field carrying two different vocabularies is
unambiguous — and the guard pins both.

### The SQLSTATE scheme

Every raise we author carries a code of our own. Postgres accepts any five
characters from `0-9A-Z`; the first two are the *class*, and its own table uses
only these:

```
00 01 02 03 08 09 0A 0B 0F 0L 0P 0Z 20 21 22 23 24 25 26 27 28 2B 2D 2F
34 38 39 3B 3D 3F 40 42 44 53 54 55 57 58 72 F0 HV P0 XX
```

`P0` is taken — that's PL/pgSQL's own (`P0001` raise_exception, `P0002`
no_data_found, …). `PA` and `PN` are free, so:

```
P A 0 4 2               P N 5 0 7
│ │ └─┴─┴── unique id, 000–999
│ └──────── A = this raise becomes `type: ok`
│           N = this raise becomes `type: not-ok`
└────────── P = ours
```

- **Ownership test**, and the reason the handler can be `when others`:
  `code ~ '^P[AN][0-9]{3}$'`. Anything else is re-raised and becomes a raw fault.
- **Branch test**: one character, `substr(code,2,1)`.
- **The digits encode nothing.** No families, no categories, no ranges to
  remember. They are a unique ID and only that: a code in a bug report leads to
  exactly one line of SQL.
- **A helper's code is shared by all its callers, and that is fine** (Joel,
  2026-08-27). `common.require_club_member` raises `PN012` whether it was
  reached through `delete_game` or `send_message`, so the code answers *what
  happened* and not *which call*. The call is answered by the diagnostics line,
  which carries `POST /rest/v1/rpc/delete_game` from the request path — so both
  facts are present, each from the layer that knows it.
- **Unique per raise site**, not per condition. That distinction matters here —
  `game-not-found` is raised **88 times** and `game-not-in-play` **57**, across
  186 distinct conditions and 442 sites. Per-condition numbering would send you
  to 88 lines; per-site sends you to one. The cost is that a single condition
  wears many codes, so "find every game-not-found" is a grep on the message
  prose rather than on the code.
- **We never reuse a Postgres code**, even where one fits semantically. If a
  condition resembles `unique_violation`, it still gets a `PN###` of its own —
  so "did we raise this, or did the database?" is answered by the prefix alone,
  with nothing to disambiguate.

442 sites today against 2,000 slots, and the two classes grow at very different
rates without competing for room.

**Allocating a number.** `max + 1` for that class, **never filling gaps**. A
reused number means an old bug report — "it said PA003" — later points at a
different condition, and gaps cost nothing against 1,000 slots per class. The
regex is the whole allocator:

```sh
grep -rhoE '\bP[AN][0-9]{3}\b' supabase/sql | sort -u   # everything in use
```

The guard below prints the next free number of each class as part of its
output, so the same regex serves both the test and a by-hand check. It enforces
shape and uniqueness, **not contiguity** — gaps are expected.

**The guard.** A vitest test over `supabase/sql/`, in the shape
`src/guards/serverErrorKeys.test.ts` already uses (`readFileSync`, no database).
It asserts:

1. Every raise carries an errcode matching `^P[AN][0-9]{3}$` — **the shape
   check matters most**, because a malformed errcode does not fail. Postgres
   also accepts a *condition name* there, so `ABC`, `abcde`, or `PU00-` are
   silently looked up as names and come back as `42704 undefined_object`. A
   typo doesn't produce obvious garbage; it produces a plausible Postgres code
   that lands on the raw-fault route looking genuine.
2. Every code appears exactly once across the whole app.
3. Every `PA` raise has a HINT drawn from the `outcome` vocabulary; every `PN`
   raise has a HINT drawn from `fault | validation | error`.
4. That the `outcome` vocabulary equals `GenericFeedbackTone` minus `error` —
   the SQL↔TypeScript link, which is the assertion that actually rots if left
   unguarded.

Two things it implies, and one it can't do:

- **Errcodes stay bare literals.** `errcode = case when g.mode = 'coop' then …`
  is legal SQL and would blind the guard exactly where the interesting
  classification lives. A condition that classifies differently per mode gets
  written as two raises in an `if/else`. All 442 raises use literal errcodes
  today, so nothing changes to adopt this.
- **Plant a failure before trusting it.** `--radius-md` was named but unguarded
  and rotted for months while the guarded color tokens didn't; a guard that
  can't fail is worse than none.
- **It can check that a severity is well-formed, never that it is right.**
  Whether `no-guesses-left` is really a fault is the author's judgment, and no
  test can second-guess it.

**`not-ok` sends no tone.** Severity is enough — a fault is a modal, a
validation is the form's red line, an error is a wait-and-retry pill. There is
no per-message color decision left to make on that branch, which is why
`outcome` lives only under `ok`.

**`ok` is wider than "the move was good."** The server does not distinguish a
good move from a bad one — a word already on the board, a guess you already
made, a game that ended while you were typing are all things it processed
successfully, and the answer rides in `outcome` and `data`. That's why
`already-guessed` is `{type: ok, outcome: warning}` and not a failure of any
kind: the game had an answer for you.

**`error` is narrower than it sounds**, and it's worth naming its whole
population, because it's one idea: something *we* depend on didn't answer.
Every current member says so —

- `dictionary-source-failed` — "Dictionary service couldn't be reached"
- `nyt-fetch` / `guardian-fetch` — "couldn't be reached — try again later"
- `ai-clue-declined`, `ai-truncated`, `ai-malformed` — "try again"

Notably all of those are raised by edge functions, which this plan defers. Most
RPC conversions will produce only `ok`, `fault`, and `validation`; psychicnum's
`submit_guess` produces no `error` at all.

### The `[db]` line

One format, one builder, for the console AND for the diagnostics under a fault
modal or an `<ErrorPage>` — the second is the first minus the trailing `msg=`,
since those surfaces already lead with the message. **Every field prints every
time**, empty after the `=` when there is nothing to say, so a fact is always in
the same position and a blank is itself information: no `dbcode` means nothing
raised, no `status` means the server never answered.

```
[db] 05:41:12.204 | FAULT | POST /rest/v1/rpc/delete_game | severity=fault | outcome= | dbcode=PN012 | status=200 | ms= | field=_ | detail="caller is not in common.club_members for this club" | msg="You are not a member of this club"
```

The level is the first word and picks the console method, so a line's level and
its severity cannot disagree: `FAULT` → `error`, `ERROR`/`SLOW` → `warn`,
`VALIDATION`/`OK` → `debug`. `SLOW` and `OK` are `dbFetch` narrating
transport; the other three are an envelope's own meaning.

`call` is never blank — `label()` in `dbFetch`, `callLabel()` in `runRpc`, and
the query it made at a call site that authored its own failure. That retires
the hand-written lines (`key=render-crashed` and its four siblings), which
carried an invented condition name and no `severity` or `dbcode` at all.

The console column is what makes §2's second symptom affordable: with `ok` at
`debug`, the shared wrapper can log *every* call without drowning anything, and
the browser's own level filter is the volume control — no custom verbose flag.
`console.error` is already the fault level today (`serverError.ts`, `dbFetch`,
`channelTeardown`), and `dbFetch` already uses `warn` for notable-but-not-fatal.

### "The frontend should have caught this" means fault

If the frontend prevents an action and the server sees it anyway, that's a bug
in our software, not an invalid move — even when it reads like an ordinary
rejection. Most server raises re-validate something the frontend already
checked, so this reclassifies a great many of them.

What it does to psychicnum's `submit_guess`, whose ten raise sites are 8 pills
and 2 faults today:

| raise | today | after | why |
|---|---|---|---|
| `game-not-found` | fault | **fault** | |
| `not-on-board` | fault | **fault** | the FE disables non-board tiles |
| `not-a-player` | pill | **fault** | the FE knows the roster |
| `you-conceded` | pill | **fault** | the FE knows you conceded |
| `no-guesses-left` | pill | **fault** | the FE knows your budget |
| `not-authenticated` | pill | **fault** | the player needs the modal's information to know what to do |
| `game-not-in-play` | pill | **ok**, `outcome: noted` | the server processed it; the answer is "too late" |
| `not-your-turn` | pill | **ok** | same — and it dodges the fault modal, which is wrong for bad timing |
| `already-guessed` | pill | **ok**, `outcome: warning` | the game has an answer: that word is already down |

Six faults, three `ok`, and no `error` at all. Today it's eight pills and two
faults, so this is close to an inversion — most of what currently reads as an
ordinary rejection is really "the frontend let you do something it shouldn't
have."

**Why the last three are `ok` rather than a gentler kind of failure.** They're
not failures. The server understood the call, ran it, and has an answer; the
answer is just negative. That's what `outcome` is for — `already-guessed`
carries `warning` so the pill gets the right color without anyone calling it an
error.

It also settles a worry about the reclassification: a fault modal is the wrong
response to bad timing, and the costs are asymmetric — a pill shown for a real
bug is a missed report, while a fault modal shown to someone who clicked a
moment late tells them the app is broken when it isn't. Routing the ambiguous
cases to `ok` avoids that without inventing a softer failure.

The missed-report half is why **`not-ok`/`error` is logged too**, at `warn`.
That reverses today's rule in `serverError.ts` ("Expected rejections are NOT
logged"), which would otherwise make a misclassified bug completely silent.
Tagging the line by level keeps faults from being buried among them.

**Classification can depend on mode, and the server knows the mode.** Where a
condition genuinely means different things per mode, the raise can say so:
`already-guessed` is scoped by mode in the SQL itself — `and (g.mode = 'coop'
or user_id = caller_id)` — so in compete only your own guesses count while in
coop a teammate can take the word first, and `g.mode` is in hand right at that
line.

That voids the argument in `serverError.ts` for why the frontend had to be the
classifier — *"whether a player can reach a given raise depends on whether the
FRONTEND checks the same rule first, and that changes"*. It assumed the server
couldn't know. It can.

### `outcome` is the vocabulary that already exists

`ok`'s `outcome` is not a new vocabulary. It's `GenericFeedbackTone`, already
defined in `src/common/lib/games.ts:168` and already shared with the board and
tile vocabulary — the point being that a pill reporting a won game and a board
showing one say the same thing in the same word.

A tightening falls out: **an envelope never carries `error` as an outcome.**
That value means "a real failure, not a bad move" (`games.ts`), and a real
failure is now `type: not-ok`, which has `severity` instead. So `outcome` draws
from the six that remain — `won`, `lost`, `near`, `warning`, `neutral`,
`noted`.

That answers a question the codebase has had open. `games.ts:163` says:

> *"The line between `lost`, `warning` and `error` is not yet drawn where it
> should be — most server rejections currently take `error` by default, and
> about twenty take `info`. Both are known wrong and deliberately not fixed
> here."*

The line gets drawn structurally rather than by judgment: `error` belongs to
the `not-ok` branch as a severity, and everything on the `ok` branch picks from
the outcome families. Nothing has to guess.

**Severity is still not surface**, and `delete_game` is the first conversion to
prove it in both directions. Its "That game was already deleted" is a `not-ok /
error` — nothing bad happened, but two friends pressing the same button is
unusual enough to be worth red — and the club page renders it as a **toast that
waits to be dismissed**, while an ordinary success is a toast that self-clears.
Neither reading is in the envelope: the server said `error`, and the page chose
the corner because it has no local feedback area and the header slot is where
*other people's* news goes (docs/ui.md → Toasts). Expect that question at every
converted call site on a page without a local pill.

The server doesn't know which button was
pressed either. `create_game` is the live counter-example: the setup form calls it and
so does the in-game "New game" button, and those deliberately render
differently — the form shows a red line, the in-game button always shows the
fault look, because setup already built a game once so anything coming back is
an outage rather than play. So the server states `type`, `severity` and
`outcome`; the frontend maps **those + the call site → surface**.

### Multi-row query RPCs convert too, if the frontend calls them

Split by consumer. **FE-facing ones convert** —
`common.anagrams`, `crosswords.library_for_club`, and the
`next_puzzle_for_club` / `puzzle_for_date` pairs. The rule is structural
("FE-facing ⇒ envelope"), not "converts if it can reject": five of the six
are pure reads today, but `common.anagrams` already raises
`bad-anagram-input` — whose message is a real user-facing line — and a
conditional rule would silently turn the next such validation into a fault.
Converting also closes a hole unique to this shape: a `returns table`
function that falls off the end yields **zero rows, silently**, and zero rows
is a legitimate answer, so nothing can tell "no matches" from "never ran".
The cost is the generated row types, traded knowingly. **Edge-function-fed
ones stay as they are** (`candidate_words`, `pick_seed`, `matching_words`,
and the rest) — different consumer, no fault surface, Deno reads rows fine.

### What survives on the frontend

`ERROR_COPY` stops being the classifier and stops holding server prose. What
remains is a small table for **environmental** failures — the things with no
server-side author, because the server never spoke:

- no connection / offline
- the request died in transit
- a reply arrived but isn't the envelope (null data, or JSON with no
  discriminator)
- infrastructure with no game meaning: `PGRST202` (function missing from the
  schema cache after a reset), a dead edge-function container

That's roughly what `classifyFailure`'s transport branch already is — it has
two strings today.

**The result: three sources of language, each with exactly one owner.** The RPC
author writes rejection text at the raise. The frontend writes the
environmental strings. Nothing in between needs a lookup table to reconcile
them.

### The environmental messages

Strictly environmental means **the fetch never completed**, and there are only
two distinguishable causes: `navigator.onLine` was false, or it wasn't. That is
the two strings `classifyFailure` carries today. `PGRST202` and a dead
edge-function container are *not* in this half — they arrive as real HTTP
responses with codes, so they are raw faults that may earn nicer messages.

**The sentences are generic and name no action.** Today's text is
action-prefixed (`guess: Offline; try again`), and an earlier draft proposed
deriving the action from the request path to keep that. It was dropped for a
correctness reason, not a simplicity one: **an environmental failure cannot
tell you whether the move landed.** The connection can drop on the way *back*,
after the write committed, so "Your guess didn't send" would be a confident
false statement in exactly the moment a player most needs the truth.

So: something like *"You appear to be offline. Please refresh and try again."*
— and note that "refresh and try again" is the correct instruction precisely
because refreshing reveals the real state before a retry can double-apply.

**Which call it was goes in the diagnostics line, free.** `dbFetch`'s `label()`
already builds the path for every call, and it is the identifier in all three
shapes with no branching:

```
POST /rest/v1/rpc/submit_guess
GET  /rest/v1/clubs
POST /functions/v1/boggle-build-board
```

`label()` keeps only the pathname, because a Supabase URL carries the apikey
and often a JWT in the query string and console output gets screenshotted into
chat (`dbFetch.ts:69`). So a read shows *which table*, not *which query*. That
is enough to find the call site, and widening it would put credentials in
screenshots.

**This deletes a loose end rather than creating one.** `ACTION` and
`actionName()` in `callRpc.ts` — 21 entries mapping `submit_word` → "word",
`replay_board` → "restart" — exist only so a pill could name the deed. Nothing
in the new system reads them, so they go with the rest of the old machinery
instead of migrating into the new file.

### Faults and environmental failures are presented centrally

**There is already one function every Supabase call passes through.** `dbFetch` is
installed as the client's `global.fetch` (`supabase.ts:84`), so PostgREST
requests, table reads, edge functions and auth all go through it. Today it only
logs — a non-2xx status, a slow success, a rejected fetch — because it never
reads the body.

Have it read the body (`res.clone().json()` leaves the caller's stream intact),
and it can own all three of the outcomes a call site has no opinion about:

| what `dbFetch` sees | action |
|---|---|
| the fetch rejected | environmental — the words live here, in one place |
| the response is a raw Postgres error | raw fault |
| the body says `{type: not-ok, severity: fault}` | declared fault |

All three: log, then `presentFault()`, before the caller is resumed.

**What reaches a call site is then only `ok`, `error`, or `validation`** — the
three things it actually has an opinion about. It renders the words the server
sent into its own pill or form line. It never classifies a failure, never
words a network problem, and never calls `presentFault` itself.

Two things fall out, and they're the point:

- **The dual-purpose helpers go away.** `expectedTextOrFault` exists precisely
  because a call site had to both obtain text *and* trigger a modal. Once the
  modal has already happened centrally there is nothing left for it to do but
  return a string, so it collapses into an ordinary accessor. The problem is
  solved by deleting the side effect rather than by naming it carefully.
- **The `action` parameter disappears.** Every call passes one today
  (`failureMessage(error, 'guess')`) because a shared helper "cannot know which
  button reached it". In `dbFetch` we have the request path —
  `POST /rest/v1/rpc/submit_guess` — which is more accurate than a hand-written
  word and needs no maintenance.

**The one `if` that stays** is a call site noticing it didn't get data, so it
can clear its own `busy` flag or roll back an optimistic write. That's local
state nothing else knows about — but it's a bail-out, not a decision, and it
needs no error vocabulary at all.

**Direct table reads live under the same rule.** They are not RPCs and get no
envelope — an RPC has an authored judgment to report and a read does not, and
93 of the ~192 call sites in `src/` are reads leaning hard on PostgREST
composition (85 `.select()`, 69 `.eq()`, 31 `.single()`, 21 `.order()`).
Converting them to RPCs would mean hand-writing ~93 query shapes and discarding
the one thing PostgREST is good at. Instead the frontend normalizes them into
the same call-site shape: rows (**zero included**) are `ok`, an error is a
fault `dbFetch` has already presented. An invariant like "every profile has a
solo club" is checked at the call site with its sentence written there — the
same rule as the RPC side, with the frontend as author because the frontend is
what knows the invariant. `HomePage.tsx:120` is the built example.

## 4. Still open

**Settled since the first draft**, recorded here because the reasoning matters:
the catch block discriminates by **SQLSTATE**, not by the message. An early
draft proposed matching the message's key shape (`already-guessed|`) on the
grounds that it needed no edits — but once the MESSAGE became player-facing
prose there is no key shape left to match, and the prose migration visits all
442 raise sites anyway, so adding an `errcode` in the same edit is free. Using
(An earlier draft said the handler could be `when sqlstate <…>`, so a raw fault
would never enter it. That's wrong: `WHEN SQLSTATE` accepts only a literal
five-character code — no patterns, no variables — so the handler is `when
others`, reads the code, and `raise;`s anything that isn't ours. Verified: a
planted `1/0` comes back out as `22012`, message and context intact. The
consequence is that the ownership test is load-bearing rather than decorative.)

Genuinely open:

- **The exact spelling of the envelope's keys.** `type: ok | not-ok` is
  settled — `not-ok` is deliberately empty of meaning so it says only "look at
  `severity`", where a word with content (`problem`, `error`) would invite the
  reader to wonder how it differs from `severity: error`. The rest of the key
  names are not settled. (The SQLSTATE letters are: see "The SQLSTATE scheme".)
- **Transient contention.** A deadlock (`40P01`) or serialization failure
  (`40001`) is neither a bug nor a broken server, and the right answer is
  usually a silent retry rather than a fault. It's the one member of the
  no-envelope class where "fault" is wrong. Vanishingly rare here —
  `submit_guess` takes a single `FOR UPDATE` on the game row, so concurrent
  submits queue rather than deadlock — and deliberately deferred.

### Field-level validation — designed, not built

A `validation` currently lands on a form's bottom line. It should be able to
land **under the field it is about**, with that field turned red — the same
place a client-side check already puts its message, via the field's existing
`error` prop.

**The channel is `COLUMN`.** The raise's other options are spoken for —
MESSAGE is the player's sentence, DETAIL the debugging line, ERRCODE the branch,
HINT the severity — but PL/pgSQL's `RAISE` also takes `COLUMN`, `CONSTRAINT`
and `TABLE`, and `COLUMN` means almost exactly "which field". Verified to
survive to the handler:

```sql
raise exception '2–15 letters, or ?'
  using errcode = 'PN001', hint = 'validation', column = 'letters',
        detail = 'anagram input must be 2-15 letters or ?';
```
```
code=PN001  msg=2–15 letters, or ?  hint=validation  column=letters
```

Packing it into HINT alongside the severity was the alternative, and it is the
wrong one: two values in one string rebuilds the `key|detail|` mini-format this
design deleted.

**What makes it work:** PostgREST relays only `{code, message, details, hint}`,
so `COLUMN` would be lost on a raw error. It doesn't need to survive that trip —
the RPC's own handler catches the raise *inside* the function and converts it to
jsonb before any response is built. The channel only has to reach
`get stacked diagnostics`.

**The pieces, when it gets built:**

1. The handler gains one diagnostics item, `v_col = column_name`, passed
   through to `raised_envelope`.
2. The envelope gains one optional key on the `not-ok` arm: `field`.
3. The form routes it. **Not `StandardForm`** — that is a bare `<form>` with a
   class and no state. The frontend half is
   [areas/forms.md → F48](areas/forms.md) `form-state-and-field-errors`: a
   form's values become one object keyed by field name, its errors become
   another, and `<Field>` — which ten of the eleven field components already
   render through — reads `errors[name]`. The envelope contributes one entry:
   `errors[field]`, or the form-level key when `field` is absent.

   Until F48 lands, a validation shows on the form's bottom line, which is
   where it shows today. Nothing here blocks converting RPCs.

**One accepted limitation: a validation is about exactly one field.** A raise
stops at the first failure, so the server cannot report several at once. A form
wanting every bad field together would need the RPC to collect them and
`return` an envelope rather than raise — a different shape. The limitation has
a redeeming property: it makes server validation incremental in the same way a
form is — fix the field it names, resubmit, it names the next — and it never
lies about which field is at fault.

---

## 5. Worked example — psychicnum

Illustrative pseudo-code. Names are placeholders; the point is the shape of
what crosses the wire and what the caller does with it.

### 5a. `create_game` — reached from two surfaces

Today: `create_game(target_club text, setup jsonb, player_user_ids uuid[],
mode text) returns table(id uuid)`. It raises nine keys of its own
(`too-few-players`, `missing-guesses`, `bad-guesses|N|`, `missing-word-count`,
`bad-word-count|N|`, `missing-band`, `bad-band|N|`, `too-few-words`,
`bad-first-turn`) plus whatever `require_valid_mode`,
`require_player_count_max`, and `require_valid_timer` raise.

```sql
create or replace function psychicnum.create_game(…) returns jsonb as $$
begin
  -- Helpers raise, exactly as they do today. Unchanged.
  perform common.require_valid_mode(mode);
  perform common.require_player_count_max(player_user_ids, 6);

  -- Local checks raise too — but now the MESSAGE is what a person reads,
  -- and the raise says what KIND of thing this is.
  if array_length(player_user_ids, 1) < 2 then
    raise exception 'A game needs at least two players'
      using errcode = <validation>, detail = 'player_user_ids shorter than 2';
  end if;

  if s_guesses is null then
    raise exception 'Pick how many guesses each player gets'
      using errcode = <validation>, detail = 'setup.guesses absent';
  end if;

  … build the board, insert the game, seat the players …

  return { type: ok, outcome: neutral, data: { id: new_id } };

exception when others then
  -- One block. It has never heard of any specific condition: it tests the code
  -- for OUR prefix, re-raises anything else, then reads one character to pick
  -- the branch. Message, severity and outcome all ride out of the raise itself.
  get stacked diagnostics <msg, detail, hint, code>;
  if code !~ '^P[AN][0-9]{3}$' then raise; end if;   -- not ours → raw fault
  if substr(code,2,1) = 'A' then
    return { type: ok, outcome: <the HINT>, message: <the MESSAGE> };
  end if;
  return { type: not-ok, severity: <the HINT>,
           message: <the MESSAGE>, dbcode: code, detail: <the DETAIL> };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| success | `{ type: ok, data: { id: "…uuid…" } }` |
| too few players | `{ type: not-ok, severity: validation, message: "A game needs at least two players", dbcode: "PN301" }` |
| bad setup value | `{ type: not-ok, severity: validation, message: "Pick how many guesses each player gets" }` |
| a check constraint blew up | *(nothing returns — the exception bubbles as a fault)* |

**The setup form** (`SetupGameModal`) reads it as:

```
type ok             → onStarted(data.id)
severity validation → red line in the form, message as-is
severity fault      → fault modal
no envelope at all  → fault modal, or the environmental table when the
                      server never spoke ("Offline", "Server; try refresh")
```

**The in-game "New game" button** (`PlayArea`) calls the *same* RPC and maps
the same envelope differently — setup already built a game once, so anything
other than success here is an outage, not play:

```
type ok             → swap to the new game
anything else       → fault look, whatever the severity says
```

Same server answer, two presentations. That's the kind-vs-surface split: the
server says what happened, the call site decides how it looks.

### 5b. `submit_guess` — the move RPC

Today: `submit_guess(target_game uuid, guess text) returns text`, returning
`'won' | 'correct' | 'wrong'`. Ten raise sites, eight distinct keys. Worth
noting what the caller currently does with that return value: `BoardCol.tsx`
collapses all three into a binary — green "Correct" for `won`/`correct`, red
"Incorrect" for `wrong` — and learns about winning through realtime instead. The
`won`/`correct` distinction is documented across twenty lines of SQL comment and
then discarded by its only reader.

```sql
create or replace function psychicnum.submit_guess(…) returns jsonb as $$
begin
  select … from psychicnum.games where id = target_game for update;
  if not found then
    raise exception 'That game is gone'
      using errcode = <fault>, detail = 'no psychicnum.games row';
  end if;

  caller_id := common.require_game_player(target_game);   -- may raise
  perform common._require_turn(target_game, caller_id);   -- may raise

  if not (w = any(g.words)) then
    raise exception 'That word is not on the board'
      using errcode = <fault>, detail = 'guess absent from games.words';
  end if;

  -- The FE knows your budget, so reaching this is a bug, not a bad move.
  if caller_remaining <= 0 then
    raise exception 'No guesses left'
      using errcode = <fault>, detail = 'budget spent';
  end if;

  -- Still a raise, and still in the same place — but this one is an `ok`.
  -- ERRCODE says so; HINT carries the outcome the pill should wear.
  if <already guessed in scope> then
    raise exception 'Already guessed'
      using errcode = <ok>, hint = 'warning',
            detail = 'word already in the guess log';
  end if;

  … write the guess row, adjust budgets and counts …

  return { type: ok, outcome: <won or neutral>,
           data: { verdict: <hit or miss>, found_all: <bool> },
           meta: { guesses_remaining: caller_remaining } };

-- The same block every RPC carries, verbatim.
exception when others then
  get stacked diagnostics <msg, detail, hint, code>;
  if code !~ '^P[AN][0-9]{3}$' then raise; end if;
  if substr(code,2,1) = 'A' then
    return { type: ok, outcome: <the HINT>, message: <the MESSAGE> };
  end if;
  return { type: not-ok, severity: <the HINT>,
           message: <the MESSAGE>, dbcode: code, detail: <the DETAIL> };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| a hit | `{ type: ok, outcome: won, data: { verdict: hit }, meta: { guesses_remaining: 4 } }` |
| a miss | `{ type: ok, outcome: neutral, data: { verdict: miss }, meta: { guesses_remaining: 4 } }` |
| game ended mid-flight | `{ type: ok, outcome: noted, message: "Game over" }` |
| already guessed | `{ type: ok, outcome: warning, message: "Already guessed" }` |
| out of budget | `{ type: not-ok, severity: fault, message: "No guesses left", … }` — the FE knows your budget |
| word not on the board | `{ type: not-ok, severity: fault, message: "That word is not on the board", … }` — the FE disables those tiles |
| a check constraint blew up | *(no envelope — Postgres's own shape, always a fault)* |

**The board** (`BoardCol`) reads it as:

```
type ok         → pill in the tone `outcome` names; the words come from
                  `message` when there is one, else from data.verdict
                  (terminal transitions still arrive via realtime, not here)
severity fault  → fault modal
no envelope     → fault modal, or the environmental table if the server
                  never spoke
```

Three things to notice in this example:

1. **`meta.guesses_remaining` costs nothing to add** and has nowhere to live
   today. That's the third symptom from §2, solved by having a slot.
2. **The `won`/`correct`/`wrong` vocabulary disappears** into
   `data.verdict` plus realtime, because it was describing the game's answer,
   not whether the call did what was asked.
3. **`not-on-board` is marked a fault by its author**, not by whether someone
   remembered to write words for it. That's the safe-default problem going away.

---

## 6. Process

**Build the engine first, then convert one call at a time.** The engine is the
part nothing else can proceed without; conversions are then a long tail of
small, independent edits.

### Step 1 — the engine

Three pieces, built once, complete:

1. **`dbFetch` reads the body and presents.** `res.clone().json()` leaves the
   caller's stream intact. It logs every call, and it presents environmental
   failures, raw faults, and declared faults — all three, from day one.
2. **`callRpc` returns the envelope** instead of `null`. That's what makes it
   usable at more than the 12 of 99 sites it reaches today.
3. **The environmental messages** — the frontend's own small set of sentences, for
   the failures where the server never spoke.

**The engine needs no knowledge of the old system, because the SQLSTATE
ownership test does the format detection for free.** An unconverted raise
carries `P0001`, whose second character is `0`, so it fails
`^P[AN][0-9]{3}$` and is simply "not ours" — a raw fault. There is no
two-format boundary and no transitional branch to delete later.

**Where the new machinery lives.** One new file under
`src/common/lib/supabase/`, holding the envelope types, the classifier, the
small message table, and the wrapper that replaces `callRpc`. The location is
chosen for the old/new split: `lib/game/` is where the machinery being deleted
lives (`errorCopy.ts`, `serverError.ts`, `callRpc.ts`), so putting the new file
there would re-create the "is this new or old?" question this is meant to
avoid. Under `lib/supabase/` it sits beside `dbFetch`, which is what it is
about, and `lib/game/` is left as a clean deletion set.

**`dbFetch` is the one edit to an existing file** — a hook calling into the new
module, not logic. Everything it does lives in the new file.

**The message table is new and small, not an addition to `ERROR_COPY`.** That
table is big, messy, and deleted wholesale at the end; growing it now would be
work thrown away and would blur which entries belong to which system. The new
one has two halves:

- **Environmental** — permanent residents, because the server never spoke and
  no author could have written for them: no network, a request that died in
  transit, `PGRST202` after a reset, a dead edge-function container.
- **Raw faults we want to word better** — and this half should stay nearly
  empty, by a principle rather than by discipline: **if a raw fault deserves
  nice words, that is a signal it should have been a declared fault instead.**
  Anything we can anticipate well enough to write a message for, we can anticipate
  well enough to raise with a `PN` code and a sentence at the site. So each
  entry here is a small admission, and the only permanent ones are what we
  structurally cannot declare — an RLS `42501`, a deadlock, a violation of a
  constraint that lives in a migration rather than in our SQL.

### Step 2 — convert, one call at a time

Each conversion moves one call from "not ours" to "ours". Per game:

> **drop the function** → convert it to the envelope → move its message into
> the raise, with a `PA`/`PN` code, a HINT and a COLUMN → add the catch block →
> convert that game's pgTAP (swapping `throws_ok` for `envelope_is`) → run it →
> fix.

**The drop comes first and is not optional.** `create or replace` cannot change
a function's return type, and every conversion changes it:

```
ERROR:  cannot change return type of existing function
```

So each converted function is preceded by `drop function if exists
common.thing(argtypes);` — with `if exists`, because `supabase/sql/` is
re-applied in full on every deploy. Both conversions so far hit this, and the
first one hid the error behind a `grep` filter and looked like it had worked.

Within a game, RPCs can go one at a time; direct queries convert independently
of any game.

**The shared helpers are their own conversion**, and they take
`supabase/tests/common/` with them. **`common.require_club_member` is done**
(PN011 not signed in, PN012 not a member) — pulled forward because three
converted club-page RPCs were emitting its `42501`, which is a code we
authored and therefore had to be one of ours. Converting it re-pointed 23
pgTAP assertions across 15 files, and it is the reason `dbFetch` now reports
a raw `PA`/`PN` instead of skipping it: an unconverted RPC calling a
converted helper leaks our code with no handler to catch it, and that is a
missing handler rather than nothing. `require_game_player`, `_require_turn`
and `require_valid_timer` are still on the old keys. `common.require_game_player`,
`_require_turn`, `require_valid_timer` and their dozen siblings are called from
everywhere, so there's no way to do them per-game; and their tests —
`helpers_test.sql`, `games_test.sql`, `turn_order_test.sql`, and the other 15
files under `tests/common/` — belong to no game, so nothing in the per-game
rhythm would ever come back for them. Two rejected alternatives, for the
record: renaming the helpers so old and new coexist defers the work and leaves
corpses to find later, and a forward-sweep converting every caller at once is
the boil-the-ocean approach this avoids.

**Unconverted games are knowingly broken throughout**, and more visibly than an
earlier draft of this section claimed. Their raises carry `P0001`, so `dbFetch`
files them as raw faults and every routine rejection — "Not your turn" — pops a
fault modal. That makes an unconverted game unpleasant to play, which is
accepted: nothing is deployed until the whole sprint lands, and there is no
play-testing of unconverted games in the meantime.

**Don't run pgTAP until the game is converted.** Convert, then run, then fix
what's actually wrong. Predicting the breaks in advance duplicates what running
the suite tells you, and only pays off if you're still running the whole suite
— which we aren't.

**How to run one file**, because the obvious way does not work:

```sh
psql "$DB_URL" -f supabase/tests/<game>/<file>_test.sql
```

`supabase test db --local supabase/tests/<game>` looks like it should work and
does not: pointing it at a subdirectory mounts only that directory, so
`\ir ../_shared/setup.psql` fails and EVERY test in it dies with "No plan found
in TAP output" rather than a useful failure. The `psql` form runs on the host,
where the relative path resolves — but pgTAP is installed by the container per
run, so a local database needs it once:

```sh
psql "$DB_URL" -c "create extension if not exists pgtap with schema extensions;"
```

### Step 3 — the sweep-up

When the last call converts: `ERROR_COPY` drops to the environmental entries,
the old `serverError.ts` machinery goes, and `expectedTextOrFault` and the
`action` parameter go with it.

**The pgTAP cost — it isn't de-JSON.** Of 2,379 assertions, 1,683 (71%) read
table state and never touch a return value, so they're untouched. The JSON
handling is concentrated in ~347 temp-table setup lines, which all converge
on one shape: `create temp table g as select (x.create_game(…)->>'id')::uuid
as id` — and every downstream `(select id from g)` stays as it is. The
`::uuid` cast is mandatory (`->>` yields text) and forgetting it is the thing
that will bite.

**The real cost is that `throws_ok` stops being the right verb.** 366
assertions currently pin a SQLSTATE plus an exact key — `'P0001',
'not-your-turn|'` — against a call that will no longer throw. That's the single
largest chunk of work in this plan, bigger than the RPCs themselves.

And it really is nearly all of them: the 366 break down as 174 `P0001`, 72
`42501`, 6 `P0002` and the rest keyed directly, and **every one of those codes
is one we raise**, so every one becomes a returned envelope. `throws_ok`
survives only where a test deliberately provokes something we did not author.

**What replaces it: a `pg_temp` helper asserting jsonb containment.**

```sql
select pg_temp.envelope_is(
  psychicnum.submit_guess(gid, 'zdelta'),
  '{"type":"ok","outcome":"warning","message":"Already guessed"}'::jsonb,
  'a repeat guess is refused');
```

- **Containment, not equality.** `meta` is explicitly the additive slot — SQL
  is meant to be able to drop breadcrumbs into it without a frontend change —
  so an exact-match assertion would break every test the first time someone
  used it. Containment also lets a test ignore `dbcode` and `data` when they
  aren't the subject.
- **A helper rather than bare `ok(… @> …)`**, because `ok()` reports only
  false. The helper diffs expected against actual so a red test names the field
  that differed, which over 366 assertions is the difference between a
  conversion and an archaeology project.
- It lives in `supabase/tests/_shared/`, where the suite's other `pg_temp`
  helpers already are, and it is **built and proven against one game before the
  sweep** — the same plant-a-failure rule the SQL guard gets.

---

## 7. The conversion roster

**139 entries. 26 done, 5 edge functions deferred, 108 to go.** Cross them off
here as they land.

An entry is one RPC or one table read **per area**, so the same name in two
areas is two entries — each has its own call sites and converts separately.
`clubs` is the live example: HomePage's read is done, ClubPage's is not.

The order is Joel's: club page, auth, common, then the games.

**Three names break the per-area rhythm.** `concede`, `end_game` and
`replay_board` are each ONE frontend path (`useStandardGameActions`) over
SIXTEEN SQL definitions, so converting the frontend converts every game at once
and all sixteen SQL files must land together. Sequence them after the games, or
accept a sixteen-file commit. They appear in several areas below, flagged.

Everything else is self-contained. `create_game` appears sixteen times but each
is a distinct function in its own schema, so it carries none of that cost — and
the same is true of every game's reads (`games_state`, `players_state`, …).

**`psychicnum` first among the games**, whatever its size: it is the
deliberately-minimal toy, every one of its raises is already classified in §5,
and its `submit_guess` is the first RPC returning a VERDICT rather than an
identifier — a shape nothing has exercised yet.

#### Club page

- [x] `create_club` · RPC
- [x] `delete_game` · RPC — and its feedback moved to toasts (see below)
- [x] `set_club_gametypes` · RPC — no outcomes of its own; envelope + handler only
- [x] `unset_current_view` · RPC — the club page's presence heal
- [x] `clubs` · read
- [x] `clubs_gametypes` · read
- [x] `clubs_members` · read
- [x] `games` · read — a refetch, so a failure leaves the last list on screen
- [x] `profiles` · read

#### Auth

- [x] `claim_username` · RPC — PN017 is the sprint's first caught UNIQUE-as-referee
  after create_club's; PN018 is the first `dbcode` a call site branches on
- [x] `profiles` · read (2 call sites) — both dropped `.maybeSingle()`/`.single()`:
  zero rows is the answer each was really asking for

#### Common

- [x] `add_word` · RPC — with update_word, delete_word and their two private
  helpers, which share every raise an editor actually hits
- [x] `anagrams` · RPC
- [ ] `concede` · RPC — cross-cutting, see above
- [x] `delete_word` · RPC
- [ ] `end_game` · RPC — cross-cutting, see above
- [ ] `replay_board` · RPC — cross-cutting, see above
- [x] `send_message` · RPC
- [ ] `set_current_view` · RPC
- [ ] `set_scratchpad` · RPC
- [ ] `start_game` · RPC
- [ ] `tick_timer` · RPC
- [x] `unset_current_view` · RPC — `useCommonGame`'s last-viewer-leave; ONE SQL
  definition serves both areas, so it converted with the club page's
- [x] `update_profile_color` · RPC — with EditProfileModal, as one unit
- [x] `update_word` · RPC
- [x] `clubs` · read (2 call sites)
- [ ] `clubs_members` · read
- [ ] `found_words` · read
- [ ] `game_players` · read (2 call sites)
- [ ] `game_scratchpads` · read
- [ ] `games` · read (2 call sites)
- [ ] `games_state` · read
- [x] `messages` · read — the same chat, and a refetch: a failure leaves the
  transcript alone
- [ ] `profiles` · read (4 call sites)
- [ ] `timers` · read
- [x] `words` · read — the same dialog's load
- [ ] `common-define` · edge fn — deferred

#### bananagrams

- [ ] `check_board` · RPC
- [ ] `concede` · RPC — cross-cutting, see above
- [ ] `create_game` · RPC (3 call sites)
- [ ] `dump` · RPC
- [ ] `end_game` · RPC — cross-cutting, see above
- [ ] `peel` · RPC
- [ ] `replay_board` · RPC — cross-cutting, see above
- [ ] `save_player_board` · RPC (3 call sites)
- [ ] `player_boards` · read (3 call sites)
- [ ] `progress` · read

#### boggle

- [ ] `end_game` · RPC — cross-cutting, see above
- [ ] `submit_timeout` · RPC
- [ ] `submit_word` · RPC (2 call sites)
- [ ] `found_words` · read (2 call sites)
- [ ] `games` · read (2 call sites)

#### codenamesduet

- [ ] `create_game` · RPC (2 call sites)
- [ ] `pass_turn` · RPC
- [ ] `submit_clue` · RPC (2 call sites)
- [ ] `submit_guess` · RPC
- [ ] `clues` · read
- [ ] `games` · read (3 call sites)
- [ ] `guesses` · read
- [ ] `profiles` · read
- [ ] `words` · read
- [ ] `codenamesduet-suggest-clue` · edge fn — deferred

#### connections

- [x] `create_game` · RPC (3 call sites)
- [ ] `next_puzzle_for_club` · RPC (2 call sites)
- [ ] `puzzle_for_date` · RPC
- [ ] `submit_guess` · RPC
- [ ] `games` · read (2 call sites)
- [ ] `guesses` · read (2 call sites)
- [ ] `players` · read

#### crosswords

- [ ] `create_game` · RPC
- [ ] `export_solution` · RPC (2 call sites)
- [ ] `library_for_club` · RPC
- [ ] `next_nyt_date_for_club` · RPC
- [ ] `set_cell` · RPC
- [ ] `set_mark` · RPC
- [ ] `cells` · read
- [ ] `games` · read
- [ ] `games_state` · read
- [ ] `crosswords-explain-clue` · edge fn — deferred

#### letterboxed

- [ ] `log_help` · RPC
- [ ] `submit_word` · RPC
- [ ] `events` · read (2 call sites)
- [ ] `games_state` · read (2 call sites)
- [ ] `players_state` · read (2 call sites)

#### psychicnum

- [x] `create_game` · RPC (2 call sites) — the first game. Took the three shared
  guards with it (`require_valid_mode`, `require_player_count_max`,
  `require_valid_timer`, PN035–PN041): psychicnum's handler re-raises anything
  not `PN`/`PA`-coded, so an unconverted guard would have escaped it as a raw
  fault in the game being converted. They are called by 15–17 files, so until
  each of those converts, their failures wear the fault look elsewhere — right
  words, wrong weight, and not worth a shim for an afternoon
- [ ] `submit_guess` · RPC (2 call sites)
- [ ] `games` · read
- [ ] `games_state` · read
- [ ] `guesses` · read
- [ ] `players` · read

#### scrabble

- [ ] `create_game` · RPC (2 call sites)
- [ ] `exchange_tiles` · RPC
- [ ] `pass_turn` · RPC
- [ ] `play_word` · RPC
- [ ] `games_state` · read (2 call sites)
- [ ] `players_state` · read
- [ ] `plays` · read
- [ ] `scrabble-ai-move` · edge fn — deferred
- [ ] `scrabble-suggest-move` · edge fn — deferred

#### setgame

- [ ] `create_game` · RPC (2 call sites)
- [ ] `record_hint` · RPC
- [ ] `submit_set` · RPC (2 call sites)
- [ ] `events` · read
- [ ] `games_state` · read (2 call sites)
- [ ] `players` · read

#### spellingbee

- [ ] `submit_word` · RPC (2 call sites)
- [ ] `found_words` · read
- [ ] `games_state` · read

#### stackdown

- [x] `create_game` · RPC (2 call sites)
- [ ] `reveal_next_hint` · RPC
- [ ] `reveal_next_word` · RPC
- [ ] `submit_word` · RPC
- [ ] `games` · read
- [ ] `games_state` · read
- [ ] `players` · read
- [ ] `submissions` · read

#### strands

- [x] `create_game` · RPC (2 call sites)
- [ ] `next_puzzle_for_club` · RPC (2 call sites)
- [ ] `puzzle_for_date` · RPC
- [ ] `spend_hint` · RPC
- [ ] `submit_path` · RPC (2 call sites)
- [ ] `events` · read
- [ ] `games_state` · read (2 call sites)
- [ ] `players_state` · read

#### waffle

- [ ] `submit_swap` · RPC (2 call sites)
- [ ] `games_state` · read (2 call sites)
- [ ] `players_state` · read
- [ ] `swaps` · read

#### wordiply

- [ ] `submit_guess` · RPC (3 call sites)
- [ ] `games_state` · read (2 call sites)
- [ ] `guesses` · read (2 call sites)

#### wordle

- [x] `create_game` · RPC (2 call sites)
- [ ] `submit_guess` · RPC (2 call sites)
- [ ] `games_state` · read (2 call sites)
- [ ] `guesses` · read
- [ ] `players` · read

#### wordwheel

- [ ] `submit_word` · RPC (2 call sites)
- [ ] `found_words` · read
- [ ] `games_state` · read

### Edge functions — deferred

A second producer with a different mechanism: they return
`json({ error: … }, 4xx)` rather than raising, so none of the SQL machinery
reaches them. Nothing in the RPC conversions depends on them, and the board
builders (not listed, since the frontend never calls them directly) are in the
same position.
