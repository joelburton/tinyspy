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
neither.** There is no shared RPC wrapper anywhere — every call site calls
`db.rpc()` raw and destructures whatever comes back. The console proves it:
`[db]` speaks on failure and is silent on success.

That asymmetry is the actual problem, and three symptoms fall out of it:

- **`null` is ambiguous.** A null reply might mean success, or a branch that
  fell off the end without returning.
- **There's no uniform debugging hook.** You can't log "the result of this
  RPC" because the shapes are 31 different jsonb schemas plus `void`, `table`,
  `text`, `int`, and `boolean`.
- **There's nowhere to put metadata.** How many rows were searched, which
  branch ran, how long it took — no slot exists for any of it.

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

The discriminator is two-level, matching how a caller actually branches — first
"did it work", then "how bad":

```
{
  type:    ok | not-ok,
  message: "Already guessed",
  meta:    { … }
}
```

`ok` adds the reading and the game's own payload:

```
  outcome: won | lost | near | warning | neutral | noted,
  data:    { … whatever the game needs … }
```

`not-ok` adds how bad it is and what broke:

```
  severity: fault | validation | error,
  code:     'PU00x',            -- the SQLSTATE, when there is one
  detail:   'guess absent from games.words'
```

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

**Severity is still not surface.** The server doesn't know which button was
pressed. `create_game` is the live counter-example: the setup form calls it and
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
`bad-anagram-input` — whose copy is a real user-facing line — and a
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
           message: <the MESSAGE>, code: code, detail: <the DETAIL> };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| success | `{ type: ok, data: { id: "…uuid…" } }` |
| too few players | `{ type: not-ok, severity: validation, message: "A game needs at least two players" }` |
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
           message: <the MESSAGE>, code: code, detail: <the DETAIL> };
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
   remembered to write copy for it. That's the safe-default problem going away.

---

## 6. Process

**This is incremental, not a boil-the-ocean rewrite.** `ERROR_COPY` and the
existing `serverError.ts` functions stay in place, working, for as long as any
game still needs them. Games convert one at a time — and within a game, RPCs
can convert one at a time. Nothing is deployed until it's all done, so a
half-converted repo is fine.

**The shared helpers change first**, and they take `supabase/tests/common/`
with them. The helpers (`common.require_game_player`, `_require_turn`,
`require_valid_timer` and the dozen or so siblings) raise keys today and prose
tomorrow, and they're called from everywhere, so there's no way to convert them
per-game. Their tests — `helpers_test.sql`, `games_test.sql`,
`turn_order_test.sql`, and the other 15 files under `tests/common/` — belong to
no game, so nothing in the per-game rhythm would ever come back for them. They
convert in that same first step.

The alternatives were considered and rejected: renaming the helpers so old and
new coexist just defers the work and leaves corpses to find later, and a
forward-sweep converting every RPC's helper usage at once is the boil-the-ocean
approach this avoids.

**Unconverted games are knowingly broken in the meantime**, and the breakage is
mild. An unconverted RPC has no catch block, so a helper's prose propagates as
an exception; `parseServerKey` rejects it (prose doesn't end in `|`), `code` is
set so it isn't transport, and it lands as a fault. The player sees
`guess|Not your turn` in fault styling — the right words with the wrong look
and a manual dismiss. Nothing is swallowed and nothing lies.

**Don't run pgTAP until the game is converted.** Tests are per-game
directories and `supabase test db --local` takes a path, so
`supabase/tests/<game>` runs just that game. Convert the game's RPCs, convert
its tests, then run them and fix what's actually wrong. Predicting the breaks
in advance is work that duplicates what running the suite tells you, and it
only pays off if you're still running the whole suite — which we aren't.

**Per game, then, the loop is:** convert the RPCs to the envelope → move their
messages into the raises with a kind → add the catch block → convert that
game's pgTAP (including swapping `throws_ok` for the rejection helper) → run
`supabase/tests/<game>` → fix. When the last game lands, `ERROR_COPY` drops to
the environmental entries and the old `serverError.ts` machinery goes.

**The pgTAP cost — it isn't de-JSON.** Of 2,379 assertions, 1,683 (71%) read
table state and never touch a return value, so they're untouched. The JSON
handling is concentrated in ~347 temp-table setup lines, which all converge
on one shape: `create temp table g as select (x.create_game(…)->>'id')::uuid
as id` — and every downstream `(select id from g)` stays as it is. The
`::uuid` cast is mandatory (`->>` yields text) and forgetting it is the thing
that will bite.

**The real cost is that `throws_ok` stops being the right verb.** 366
assertions currently pin a SQLSTATE plus an exact key — `'P0001',
'not-your-turn|'` — against a call that will no longer throw. Both halves
change: the verb becomes an equality check on the envelope, the expected
value becomes prose. That's the single largest chunk of work in this plan,
bigger than the RPCs. A `pg_temp` helper (`pg_temp.rejects(sql, text, desc)`)
absorbs the JSON so no individual test does de-JSON and the conversion is a
one-line swap per assertion — the suite already leans on `pg_temp` helpers
everywhere.
