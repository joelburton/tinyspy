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
discriminator says only what the plumbing needs (see "The four outcomes"
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
  none of them change. Nothing propagates a rejection by hand.
- **Each top-level RPC catches at its boundary** and converts a deliberate
  rejection into a returned result.
- **Genuine faults keep bubbling**, which means the RPC returns *nothing* — no
  envelope at all — and the call arrives as a PostgREST error instead. A
  decrement bug that drives `psychicnum.players.guesses_remaining` past its
  `check (between 0 and 9)` comes back as SQLSTATE `23514`, never as a result.

**The presence or absence of an envelope is the fault test.** Either the RPC
reached a decision and said what it was, or something is broken — no key
parsing, no membership lookup. Today faults and rejections travel the *same*
route, both as exceptions, which is exactly why `ERROR_COPY` membership has to
exist to tell them apart; after this change they travel different routes, so it
doesn't.

Everything on the no-envelope route is a bug or a broken server. Constraint
violations belong to it by construction: all 85 CHECK constraints are shape and
domain guards, nothing anywhere catches a `check_violation`, and the RPC always
guards first — psychicnum raises `no-guesses-left` *before* it decrements, so
the range check only fires if our own arithmetic is wrong. (The two exceptions
are UNIQUE indexes deliberately used as race referees — `common.create_club`'s
handle collision and `connections`' dup-guess race — and both already catch
locally and turn it into a result.)

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

### The four outcomes

The vocabulary is about **what the player can do next**, not about what the
database did. An earlier draft split on "did a row get written", which is a SQL
fact the frontend never asks about.

| | means | the player's move | surface | console |
|---|---|---|---|---|
| **validation-error** | the values you sent can't work, and we had to ask the server to find out | fix the input, try again | form's red line | `console.debug` |
| **error** | your move couldn't be accepted — circumstances beat you | nothing to fix; carry on | pill | `console.warn` |
| **fault** | a bug | nothing | modal / fault page | `console.error` |
| **ok** | I processed your move; `verdict` says what came of it | keep playing | pill, or nothing | `console.debug` |

**`ok` is the residual** — not a validation-error, not an error, not a fault.
The server deliberately does *not* distinguish "that was a good move" from
"that was a bad move": a word already on the board, a guess you already made,
a game that has ended are all things the server processed successfully. What
came of it is `verdict`, which only the game's own handler reads.

**Only `fault` has no envelope.** The other three arrive as one, so the
envelope's discriminator is three-valued.

The console column is what makes §2's third symptom affordable: with `ok` at
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

| raise | today | after |
|---|---|---|
| `game-not-found` | fault | fault |
| `not-on-board` | fault | fault — the FE disables non-board tiles |
| `not-a-player` | pill | fault — the FE knows the roster |
| `you-conceded` | pill | fault — the FE knows you conceded |
| `no-guesses-left` | pill | fault — the FE knows your budget |
| `not-authenticated` | pill | fault — the player needs the modal's info to know what to do |
| `game-not-in-play` | pill | error — a peer ended it while you were in flight |
| `not-your-turn` | pill | error — see the rule below |
| `already-guessed` | pill | error — see the rule below |

Roughly a near-inversion: 3 errors and 7 faults.

**The kindest-plausible-reading rule.** When a raise can be either a race or a
bug, classify it as the gentler one. The costs are asymmetric: a pill shown for
a real bug is a missed report, while a fault modal shown for bad timing tells a
player the app is broken when they clicked a moment late. The second is worse.
That's why `not-your-turn` and `already-guessed` are errors — the frontend does
disable both, but the turn can pass and a coop teammate can take your word
while your call is in flight.

The missed report is why **errors are logged too**, at `warn`. That reverses
today's rule in `serverError.ts` ("Expected rejections are NOT logged"), which
would otherwise make a misclassified bug completely silent. Tagging the line by
level keeps faults from being buried among them.

**Classification can depend on mode, and the server knows the mode.**
`already-guessed` is scoped by mode in the SQL itself — `and (g.mode = 'coop'
or user_id = caller_id)`. In compete only your own guesses count and the
frontend knows them all, so reaching it is a bug; in coop a teammate can take
the word first, so it's a race. Same raise site, two classifications, and
`g.mode` is in hand right there.

That voids the argument in `serverError.ts` for why the frontend had to be the
classifier — *"whether a player can reach a given raise depends on whether the
FRONTEND checks the same rule first, and that changes"*. It assumed the server
couldn't know. It can.

### The tone rides along, from the vocabulary that already exists

The outcome alone isn't enough: two `error`s can read very differently on
screen — a lost race is news, a move that cost you the game is a defeat. So the
author also picks a **tone** at the raise, from the seven values already in
`GenericFeedbackTone` — `won`, `lost`, `near`, `warning`, `neutral`, `error`,
`noted` — which are already shared with the board and tile vocabulary.

A tightening falls out: **nothing inside an envelope ever carries the tone
`error`.** That tone means "a real failure, not a bad move", and real failures
are faults now, which have no envelope. So the tone `error` belongs to the
fault route exclusively, and the envelope's tones are the five outcome families
plus `noted`. That is the line `games.ts:163` says isn't drawn yet — *"most
server rejections currently take `error` by default, and about twenty take
`info`. Both are known wrong"* — and it gets drawn by route rather than by
judgment.

**Watch the word `error` doing two jobs here.** It is an *outcome* ("your move
couldn't be accepted") and separately a *tone* ("this is a failure, not a bad
move"), on two different axes. The combination `{outcome: error, tone: error}`
never occurs, so nothing is ambiguous in practice — but the collision is a
naming problem, filed in §4.

**Kind is still not surface.** The server doesn't know which button was
pressed. `create_game` is the live counter-example: the setup form calls it and
so does the in-game "New game" button, and those deliberately render
differently — the form shows a red line, the in-game button always shows the
fault look, because setup already built a game once so anything coming back is
an outage rather than play. So the server states kind and tone; the frontend
maps **kind + call site → surface**.

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
`when sqlstate <…>` rather than `when others` also means a fault never enters
the handler at all: no re-raise, no filter that could be wrong.

Genuinely open:

- **The names.** The envelope's keys, the SQLSTATE letters, and whether `ok` is
  the right word for the residual outcome. Deliberately unsettled. One known
  collision to resolve: **`error` is both an outcome and a tone**, on different
  axes — `{outcome: error, tone: error}` never occurs, so it's unambiguous in
  practice, but one of the two wants a different word.
- **Whether the tone rides in its own SQLSTATE per value, or in `HINT`.**
  SQLSTATE-per-tone fails loudly — a typo'd code isn't caught, so it bubbles as
  a fault — while a typo'd `HINT` string yields a bogus tone quietly. `HINT`
  reads better at the raise site. Either way it wants a guard test pinning the
  code↔tone table.
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

  return { outcome: ok, data: { id: new_id } };

exception when <any deliberate outcome code> then
  -- One block. It has never heard of any specific condition: the message, the
  -- outcome and the tone all ride out of the raise itself. A fault's code
  -- isn't in this list, so a fault never even enters here.
  return { outcome: <from the sqlstate>, tone: <from the sqlstate>,
           text: <the message>, detail: <the DETAIL, for the console> };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| success | `{ outcome: ok, data: { id: "…uuid…" } }` |
| too few players | `{ outcome: validation-error, text: "A game needs at least two players" }` |
| bad setup value | `{ outcome: validation-error, text: "Pick how many guesses each player gets" }` |
| a check constraint blew up | *(nothing returns — the exception bubbles as a fault)* |

**The setup form** (`SetupGameModal`) reads it as:

```
outcome ok               → onStarted(data.id)
outcome validation-error → red line in the form, text as-is
no envelope at all       → fault modal, or the environmental table when the
                           server never spoke ("Offline", "Server; try refresh")
```

**The in-game "New game" button** (`PlayArea`) calls the *same* RPC and maps
the same envelope differently — setup already built a game once, so anything
other than success here is an outage, not play:

```
outcome ok               → swap to the new game
anything else            → fault look, whatever the outcome says
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

  -- Coop only: a teammate can take the word while your call is in flight.
  -- In compete the FE knows every guess that counts, so the same condition
  -- is a bug. `g.mode` is right here, so the raise can say which.
  if <already guessed in scope> then
    raise exception 'Already guessed'
      using errcode = case when g.mode = 'coop' then <error/warning> else <fault> end,
            detail = 'word already in the guess log';
  end if;

  … write the guess row, adjust budgets and counts …

  return { outcome: ok,
           data: { verdict: <hit or miss>, found_all: <bool> },
           meta: { guesses_remaining: caller_remaining } };

exception when <any deliberate outcome code> then
  return { outcome: <from the sqlstate>, tone: <from the sqlstate>,
           text: <the message> };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| a hit | `{ outcome: ok, data: { verdict: hit }, meta: { guesses_remaining: 4 } }` |
| a miss | `{ outcome: ok, data: { verdict: miss }, meta: { guesses_remaining: 4 } }` |
| game ended mid-flight | `{ outcome: error, tone: noted, text: "Game over" }` |
| already guessed (coop) | `{ outcome: error, tone: warning, text: "Already guessed" }` |
| already guessed (compete) | *(bubbles as a fault — the FE knows your own guesses)* |
| out of budget | *(bubbles as a fault — the FE knows your budget)* |
| word not on the board | *(bubbles as a fault — the FE disables those tiles)* |

**The board** (`BoardCol`) reads it as:

```
outcome ok      → pill from data.verdict — green "Correct" / red "Incorrect"
                  (terminal transitions still arrive via realtime, not here)
outcome error   → ordinary pill, text as-is, in the tone the server sent
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
