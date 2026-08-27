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

### The discriminator describes state, not the game's verdict

The existing ad-hoc `result` values conflate two different axes:

- `duplicate` (word already played) — **nothing was written**; the call refused.
- `incorrect` (a wrong guess) — **the guess was written**; the *game* said no.

Both are `result` values today, and the frontend can't tell them apart
structurally — it has to know, per game, which words mean which. So the
discriminator answers only the question the plumbing asks — *did state change
as requested?* — and everything game-specific moves into the payload. "Won",
"bonus", "correct" stop being call outcomes and become what they actually are:
facts about game state riding along.

An open question: whether an idempotent no-change outcome (the second click,
the race you lost) deserves its own discriminator value or is just a flag in
the payload.

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

### The server states the kind; the frontend picks the surface

The author knows what sort of thing happened — a bug, an ordinary rejection, a
validation failure — so the raise says so. This removes the safe-default
problem: today, forgetting to write copy for a key silently classifies it, and
under the new scheme nothing defaults.

But **kind is not surface.** The server doesn't know which button was pressed.
`create_game` is the live counter-example: the setup form calls it, and so does
the in-game "New game" button, and those deliberately render differently — the
form shows a red line, the in-game button always shows the fault look, because
setup already built a game once so anything coming back is an outage rather
than play.

So the server states the kind, and the frontend maps **kind + call site →
surface**.

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

- **How a deliberate rejection is told from a fault inside the catch block.**
  The message's key shape (`already-guessed|`) works and needs no edits to
  existing raises; a dedicated SQLSTATE is sturdier but means touching every
  raise. Undecided.
- **The exact envelope keys and the discriminator vocabulary.** Deliberately
  not settled here.
- **Whether the idempotent no-change case earns its own discriminator value.**
- **Multi-row query RPCs.** Split by consumer. **FE-facing ones convert** —
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
- **Sequencing.** Per-game, one at a time, the way the CSS sprint works — the
  envelope spec'd once up front, then games converted individually.
- **The pgTAP cost.** `create_game` alone is called ~487 times across 168 test
  files. Most of those need no change (~140 sit inside `throws_ok`/`lives_ok`
  and discard the result), and the rest are temp-table setup lines that all
  converge on one replacement shape — but `->>` returns text, so a `::uuid`
  cast is mandatory and its absence is the thing that will bite. [XXX: let's talk about pgTAP & this move]

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

  return { result: ok, data: { id: new_id } };

exception when <a deliberate rejection> then
  -- One block. It has never heard of any specific key: the message and the
  -- kind ride out of the raise itself. Anything else keeps bubbling.
  return { result: rejected, kind: <from the raise>,
           text: <the message>, detail: <the DETAIL, for the console> };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| success | `{ result: ok, data: { id: "…uuid…" } }` |
| too few players | `{ result: rejected, kind: validation, text: "A game needs at least two players" }` |
| bad setup value | `{ result: rejected, kind: validation, text: "Pick how many guesses each player gets" }` |
| a check constraint blew up | *(nothing returns — the exception bubbles as a fault)* |

**The setup form** (`SetupGameModal`) reads it as:

```
if result is ok        → onStarted(data.id)
if kind is validation  → red line in the form, text as-is
if kind is fault       → fault modal
if no reply at all     → environmental table ("Offline", "Server; try refresh")
```

**The in-game "New game" button** (`PlayArea`) calls the *same* RPC and maps
the same envelope differently — setup already built a game once, so a rejection
here is an outage, not play:

```
if result is ok        → swap to the new game
anything else          → fault look, whatever the kind says
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

  if caller_remaining <= 0 then
    raise exception 'No guesses left'
      using errcode = <rejection>, detail = 'budget spent';
  end if;

  if <already guessed in scope> then
    raise exception 'Already guessed'
      using errcode = <rejection>, detail = 'word already in the guess log';
  end if;

  … write the guess row, adjust budgets and counts …

  return { result: ok,
           data: { verdict: <hit or miss>, found_all: <bool> },
           meta: { guesses_remaining: caller_remaining } };

exception when <a deliberate rejection> then
  return { result: rejected, kind: <from the raise>, text: <the message>, … };
end $$;
```

What crosses the wire:

| case | envelope |
|---|---|
| a hit | `{ result: ok, data: { verdict: hit }, meta: { guesses_remaining: 4 } }` |
| a miss | `{ result: ok, data: { verdict: miss }, meta: { guesses_remaining: 4 } }` |
| out of budget | `{ result: rejected, kind: rejection, text: "No guesses left" }` |
| word already guessed | `{ result: rejected, kind: rejection, text: "Already guessed" }` |
| word not on the board | *(bubbles as a fault — the frontend disables those tiles, so reaching this means something is broken)* |

**The board** (`BoardCol`) reads it as:

```
if result is ok        → pill from data.verdict — green "Correct" / red "Incorrect"
                         (terminal transitions still arrive via realtime, not here)
if kind is rejection   → ordinary pill, text as-is
if kind is fault       → fault modal
if no reply at all     → environmental table
```

Three things to notice in this example:

1. **`meta.guesses_remaining` costs nothing to add** and has nowhere to live
   today. That's the third symptom from §2, solved by having a slot.
2. **The `won`/`correct`/`wrong` vocabulary disappears** into
   `data.verdict` plus realtime, because it was describing the game's answer,
   not whether the call did what was asked.
3. **`not-on-board` is marked a fault by its author**, not by whether someone
   remembered to write copy for it. That's the safe-default problem going away.
