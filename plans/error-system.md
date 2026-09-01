# The error system — results, rejections, and faults

**Status: in flight — 40 of the 146 call sites in §7 are converted.**

This supersedes `plans/error-copy-sprint.md` entirely. Ignore that file.

**The shape is [docs/envelopes.md](../docs/envelopes.md) and the outcome
vocabulary is [docs/outcomes.md](../docs/outcomes.md); both are canonical and
outrank this file.** That inverts the usual "a running sprint's plan outranks
the docs" rule, deliberately: the sharper version got written into `docs/`, and
two copies of one decision is how they drift. What this plan owns is the work —
the evidence behind the design (§3), what is still open (§4), the worked example
(§5), the process (§6) and the roster (§7).

The prep that ran before the rest of the roster is finished, and so is the
layering fix that came out of it — one author for "nothing answered",
`dbResult` split so the imports point down, `ReadFailure` deleted. Both plans
are gone; what survives them is in [docs/envelopes.md](../docs/envelopes.md),
[docs/code-conventions.md](../docs/code-conventions.md) and the code itself.

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

**The shape lives in [docs/envelopes.md](../docs/envelopes.md), which is
canonical** — the envelope's two arms, the severities, the outcome vocabulary,
the keys, how SQL and Deno build one, and how the frontend receives one. Where
this plan and that doc ever disagree, the doc wins. What this section holds is
the part a reference doc should not: the evidence that the conversion is
affordable, and the rules that stop applying once it is done.

### Why it is affordable

**No raise site gets rewritten.** The change is one catch block per top-level
RPC, not 442 edits, and that is the single most important property of the
design. The call graph is flat enough to allow it: of 249 functions in
`supabase/sql/`, 199 are top-level, and of the 442 raises only **25 live in
helpers** (the `require_game_player` / `_require_turn` family). The other 417
are already in the top-level RPC itself, so there is nothing for them to bubble
through. `common.require_game_player` has 54 callers and none of them change.

**Catching is a savepoint, so "did we write before we rejected?" is not a design
question.** A PL/pgSQL exception block establishes a subtransaction: with the
whole body inside one, catching a rejection rolls back everything the body wrote
and still returns cleanly. Measured, for the record: **433 of 442 raises (98%)
fire before the function writes anything**, six of the remaining nine are the
`update … ; if not found` pattern where nothing was written, one is already
inside a savepoint, and only **two** genuinely wrote first — scrabble's and
setgame's `bad-first-turn`, both checking only function parameters, so the check
could simply move above the inserts. "Reject before you write" is already how
this codebase is written, apparently by instinct; the savepoint means we don't
have to enforce it.

**Constraint violations belong to the raw-fault route by construction.** All 85
CHECK constraints are shape and domain guards, nothing anywhere catches a
`check_violation`, and the RPC always guards first — psychicnum rejects an empty
budget *before* it decrements, so the range check only fires if our own
arithmetic is wrong. The two exceptions are UNIQUE indexes deliberately used as
race referees (`common.create_club`'s handle collision and `connections`'
dup-guess race), and both already catch locally and turn it into a result.

### The discriminator is not the game's verdict

A conversion rule, because it is about what to do with the shapes that exist
today. The ad-hoc `result` values mix two different things:

- `duplicate` (word already played) — the call refused it.
- `incorrect` (a wrong guess) — the guess was recorded; the *game* said no.

The frontend can't tell those apart structurally; it has to know, per game,
which words mean which. So when converting, the discriminator says only what the
plumbing needs and everything game-specific moves into `data` as a **verdict**.
"Won", "bonus", "correct" stop being call outcomes and become what they actually
are: facts about game state riding along.

This also dissolves what looked like a separate question — whether an idempotent
no-change outcome (a second click, a race you lost) needs its own discriminator
value. It doesn't: the server processed the call fine, so it's `ok`, and
"nothing changed" is a verdict like any other. `connections.sql:713` is the live
instance, where a unique-index race currently returns silently.

### What conversion does to a game, in one number

psychicnum's `submit_guess` has ten raise sites: **eight pills and two faults
today, six faults and three `ok` after** (worked through in §5b). That near
inversion is what the yardstick in
[envelopes.md → Envelope type](../docs/envelopes.md) does in practice — a
game-rule rejection is `ok`, something the frontend should have caught is a fault.
Most of what currently reads as an ordinary rejection is really "the frontend
let you do something it shouldn't have", so expect a conversion to *move*
classifications rather than preserve them, at every remaining roster entry.

### Multi-row query RPCs convert too, if the frontend calls them

Split by consumer. **FE-facing ones convert** — `common.anagrams`,
`crosswords.library_for_club`, and the `next_puzzle_for_club` /
`puzzle_for_date` pairs. The rule is structural ("FE-facing ⇒ envelope"), not
"converts if it can reject": five of the six are pure reads today, but
`common.anagrams` already raises `bad-anagram-input`, whose message is a real
user-facing line, and a conditional rule would silently turn the next such
validation into a fault. Converting also closes a hole unique to this shape: a
`returns table` function that falls off the end yields **zero rows, silently**,
and zero rows is a legitimate answer, so nothing can tell "no matches" from
"never ran". The cost is the generated row types, traded knowingly.
**Edge-function-fed ones stay as they are** (`candidate_words`, `pick_seed`,
`matching_words`, and the rest) — different consumer, no fault surface, Deno
reads rows fine.

### What survives on the frontend

`ERROR_COPY` stops being the classifier and stops holding server prose. What
remains is the **environmental** table — two sentences, for the failure with no
server-side author because the server never spoke (the rule they follow is in
[envelopes.md](../docs/envelopes.md)). `PGRST202` after a schema-cache reset and
a dead edge-function container are *not* in that half: they arrive as real HTTP
responses with codes, so they are raw faults that may later earn nicer words.

**The result: three sources of language, each with exactly one owner.** The RPC
author writes rejection text at the raise. The frontend writes the environmental
strings. Nothing in between needs a lookup table to reconcile them.

Two loose ends go with the old machinery rather than migrating into the new
files: `ACTION` and `actionName()` in `callRpc.ts` — 21 entries mapping
`submit_word` → "word" — exist only so a pill could name the deed, and nothing
in the new system reads them; and `expectedTextOrFault`, which exists because a
call site had to both obtain text *and* trigger a modal, collapses into an
ordinary accessor once the modal has already happened centrally. The problem is
solved by deleting the side effect rather than by naming it carefully.

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
  names are not settled. (The SQLSTATE letters are — see
  [envelopes.md → How SQL builds one](../docs/envelopes.md).)
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
  no author could have written for them: no network, or a request that died in
  transit. Not `PGRST202` and not a dead edge-function container — both answer,
  so both are raw faults ([envelopes.md](../docs/envelopes.md) → "Environmental"
  means the JS fetch failed).
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

> **the table** (below, and Joel rules on it) → **drop the function** → convert
> it to the envelope → move its message into the raise, with a `PA`/`PN` code, a
> HINT and a COLUMN → add the catch block → **rewrite the call site to the
> branch shape** → convert that game's pgTAP (swapping `throws_ok` for
> `envelope_is`) → run it → fix.

**The call-site half has its own rules, and they are not in this plan.**
[docs/envelopes.md → The shape of a call site](../docs/envelopes.md#the-shape-of-a-call-site)
holds them: one branch per answer, positive conditions, a bare `else` that
screams, and never picking an `ok` branch by asking whether there is a message
or what the outcome is. They were written on 2026-08-29 after stackdown's
conversion produced four wrong versions of one branch in a row, so read them
before the first call site of a game, not after.

#### The table comes first, and then you STOP

Before writing anything, show **every answer the RPC can give** — both arms — and
wait (Joel, 2026-08-29). The classification is the whole design; the code is
transcription. Do not go reading the frontend to fill it in: what the FE shows
today is not the input, and Joel already knows it.

**ok**

| | data | outcome | message |
|---|---|---|---|
| *each success and each game-rule refusal* | the fact, structurally | how it reads | the sentence, or **null** = the FE composes |

**not-ok**

| raise | severity | message | why |
|---|---|---|---|
| *each raise* | `fault` / `race` / `form-validation` / `service-error` | the player's sentence | what makes it that kind |

Three things the table is FOR, each of which has already caught something:

- **The severity is a judgment, and it is the one thing a test cannot check.**
  Whether a raise is a race or a fault turns on what the frontend gates, which
  is where a conversion goes wrong invisibly.
- **`data` must carry the fact structurally**, even where the message says it
  too — the frontend has uses for it that have nothing to do with words (a board
  shake, a counter, a mark). An `ok` with no `data` at all is a smell: the
  function computed something, and "returns void today" is not a reason to throw
  it away.
- **A fault's message says what REACHED THE SERVER**, in the form every
  `create_game` already uses — "A guess that was not four tiles reached the
  server", never "A guess must be four tiles". A fault means the frontend let
  something through that it prevents, so reciting the rule blames the player for
  a bug (envelopes.md → A fault says what reached the server). A fault about a
  STATE rather than an input — "No guesses left", "Already solved" — is the
  exception and keeps its plain sentence.
- **A null message is a decision**, not an omission: see "Who writes the words,
  per answer" in [envelopes.md](../docs/envelopes.md).

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

When the last call converts: **`ERROR_COPY` is deleted outright**, the old
`serverError.ts` machinery goes, and `expectedTextOrFault` and the `action`
parameter go with it.

Not "drops to the environmental entries" — that was written before
`service-error` messages moved to the raise as well (the two NYT ones and the
Guardian's already have). There is no residue and no mapping table at the end:
whoever decided the answer wrote the sentence, and nothing on the frontend looks
a key up.

**The migration rule, per key.** An `ERROR_COPY` entry is two things — a
sentence and a `tone` — and both have a home in the raise that replaces it:

| the entry's | becomes the raise's | notes |
|---|---|---|
| `text` | `message` | verbatim; the words were approved once already |
| `tone` | `hint`, on a `PA` code — or nothing | see below |
| membership in the table | the severity, via `hint` on a `PN` code | having copy meant "expected"; now the author says which kind |

**The `tone` usually disappears rather than moving**, because a severity carries
a default appearance (docs/envelopes.md → Appearance). A `tone: 'noted'` entry
that becomes a `race` needs no outcome at all — orange is what a race already
reads as. Carry the tone across only where the raise wants to override its
severity's default, and then it is an `outcome` on the envelope.

19 of the 40 remaining entries carry a `tone`, and all 19 are game `not-ok`s
that become races. So the expected outcome of this sweep is 19 tones dropped, not 19
tones moved.

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

**144 entries. 96 done, 48 to go** (5 of those are the deferred edge
functions). Cross them off here as they land.

**Un-paused 2026-08-31: the retro-fix list is empty.** It existed because a
"done" entry meant its SQL answered with an envelope, not that its call site was
written to the rules — which did not exist when the first 68 landed. Those 68
have been brought up to the rules, so a "done" entry now means both.

An entry is one RPC or one table read **per area**, so the same name in two
areas is two entries — each has its own call sites and converts separately.
`clubs` is the live example: HomePage's read is done, ClubPage's is not.

The order is Joel's: club page, auth, common, then the games.

**Three names break the per-area rhythm.** `concede`, `end_game` and
`replay_board` are each ONE frontend path (`useStandardGameActions`) over
SIXTEEN SQL definitions, so converting the frontend converts every game at once
and all sixteen SQL files must land together. Sequence them after the games, or
accept a sixteen-file commit. They appear in several areas below, flagged.

**A fourth name breaks it the same way, through a HOOK rather than a
component.** `useWordSubmit`'s `commit` callback is typed
`Promise<{ error: { message, code? } | null }>` and FOUR games pass one — boggle
`submit_word`, spellingbee `submit_word`, wordwheel `submit_word`, wordiply
`submit_guess`. The hook, not the game, decides what a failure looks like: it
calls `failureMessage(error, 'word')` and releases the optimistically-accepted
word.

**Count the `commit` callbacks, not the files that name the hook.** strands and
letterboxed mention `useWordSubmit` only in prose — strands' `submit_path` is a
standalone callback that already reads `data`, and letterboxed's header says it
is "deliberately NOT `useWordSubmit` … the commit is a plain RPC". Both are
ordinary entries in their own areas.

So those four convert in TWO halves (Joel, 2026-09-01):

- **each game's SQL converts in its own area**, leaving its call site raw. The
  entry is marked done and says "SQL only".
- **`useWordSubmit` converts ONCE, after the last of the four**, taking every
  call site with it and deleting the hook's use of `failureMessage`.

**wordiply settles the hook's shape, so it goes last of the four.** Its `commit`
manufactures an error out of a SUCCESSFUL answer — `res.ok === false` becomes
`{ error: { message: rejectReason(…) } }` — to get the shared hook to pill a
refusal. A refused guess is a designed answer there (it is a TURN), so what
`commit` must be able to hand back is "refused, and here is why", not an error.
wordiply also has a second call site, `recordReject`, firing the same RPC with
`fe_legal: false`.

**A DUPLICATE is a race, not an answer** (Joel, 2026-09-01), in all four.
`useWordSubmit.submit` dedups against `foundWords` PLUS a synchronous
`pendingRef` and returns BEFORE calling `commit`, painting its own orange
`warning` pill — so the server's duplicate branch is reachable only when that
list is stale: a teammate found the word between the render and the submit
(coop), or the caller's own row had not landed (compete, a second tab). Nothing
is recorded, so it refuses. It is the §3 distinction exactly — `duplicate` is
"the call refused it", where `incorrect` is "recorded, and the game said no" —
and it matches connections' PN301. Codes: boggle PN359, spellingbee PN360,
wordwheel PN361.

The cost is a swallow window per game: a converted RPC answers `not-ok` with a
200, so `error` is null at a raw call site and a refused word stays
optimistically accepted until the next realtime refetch drops it. Accepted —
the alternative is either a four-area commit or a call site whose sentence is
still written by the system this sprint deletes.

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
- [x] `set_current_view` · RPC — PA003 for a deleted game, the twin of unset's
      PA001. Its own pgTAP had it throwing `P0002 game-not-found|`; both that and
      the non-member `throws_ok` are envelope assertions now
- [x] `set_scratchpad` · RPC — three raises: PN304/PN306 are `BUG:` faults (the
      FE sends its own id or null, and the textarea carries maxLength=10000), and
      PN305 is a RACE — the debounced flush landing after the game ended, which
      is the one keystroke this system can actually lose. Its pgTAP gained that
      case, which it never had
- [x] `tick_timer` · RPC — PA004 for a deleted game (no clock to advance), and
      a POLL: `dbFetch` gained `isPolled` so a per-second call is logged, never
      presented. A 5s wifi drop was 5 fault modals with the queue refilling as
      you dismissed. The gap that leaves is docs/deferred.md → a disconnected
      player is the one person who is not told
- [x] `unset_current_view` · RPC — `useCommonGame`'s last-viewer-leave; ONE SQL
  definition serves both areas, so it converted with the club page's
- [x] `update_profile_color` · RPC — with EditProfileModal, as one unit
- [x] `update_word` · RPC
- [x] `clubs` · read (2 call sites)
- [x] `clubs_members` · read — `useClubRoster`; ClubPage's copy converted
      earlier. A failed read leaves `members` alone rather than emptying it: a
      club with nobody in it is a worse answer than a stale one
- [x] `found_words` · read — `makeFoundWordsGame`'s, converted in the useGame
      sweep; it is filed here because the factory lives in `src/common/`
- [x] `game_players` · read (2 call sites) — `useCommonGame`'s converted in the
      useGame sweep; `useGameInvitations`' embed here
- [x] `game_scratchpads` · read — a failed read leaves the pad alone; blanking
      one someone is typing in is the only thing worse than a stale one
- [x] `games` · read (2 call sites) — `useCommonGame`'s and `GamePage`'s
      pre-flight, both converted
- [x] `games_state` · read — `makeFoundWordsGame`'s, same as `found_words`
- [x] `messages` · read — the same chat, and a refetch: a failure leaves the
  transcript alone
- [x] `profiles` · read — ONE real site left when this began, not four: two of
      the four hits are docstring examples. A failed name lookup does not drop
      the invites, it only costs the inviter's name
- [x] `timers` · read — the seed beside the tick RPC, and it opts out for the
      SAME reason: a seed read and a tick fail together, so showing one while
      the driver swallows its twin would modal the mount and nothing after
- [x] `words` · read — the same dialog's load
- [x] `common-define` · edge fn — PN311/PN312 service-errors (the dictionary
      source down), PN313/PN314 faults. Three NAMED ok results replacing one
      shape with `unknown?` and `def: string | null` flags

#### bananagrams

- [x] `check_board` · RPC — THREE named ok results where the caller derived
      `empty` from a `placed` count. PN337 replaces a raise that said "no
      bananagrams.games row" while querying `player_boards`
- [ ] `concede` · RPC — cross-cutting, see above
- [x] `create_game` · RPC (3 call sites)
- [x] `dump` · RPC
- [ ] `end_game` · RPC — cross-cutting, see above
- [x] `peel` · RPC
- [ ] `replay_board` · RPC — cross-cutting, see above
- [x] `save_player_board` · RPC — TWO named ok results where the two
      deliberate no-ops (terminal, conceded) used to be silent. The three
      call sites collapse to one: `save()` returns its promise, so the peel
      and check-words flushes await the same chain
- [x] `player_boards` · read (3 call sites) — converted in the useGame sweep
- [x] `progress` · read — converted in the useGame sweep

#### boggle

- [x] `create_game` · RPC, reached through `boggle-build-board`
- [ ] `end_game` · RPC — cross-cutting, see above
- [ ] `submit_timeout` · RPC
- [x] `submit_word` · RPC — **SQL only**; its call site is `useWordSubmit`'s
      `commit`, converted with the other five (see the hook note above).
      PN352 keeps the raise-not-a-soft-return intent of `you-conceded`:
      a refusal is what releases the optimistic word. PN359 makes a DUPLICATE a
      race — see the note below
- [ ] `found_words` · read (2 call sites)
- [ ] `games` · read (2 call sites)

#### codenamesduet

- [x] `create_game` · RPC (2 call sites)
- [ ] `pass_turn` · RPC
- [ ] `submit_clue` · RPC (2 call sites)
- [ ] `submit_guess` · RPC
- [ ] `clues` · read
- [ ] `games` · read (3 call sites)
- [ ] `guesses` · read
- [ ] `profiles` · read
- [ ] `words` · read
- [x] `codenamesduet-suggest-clue` · edge fn — PN319/PN320 service-errors (the
      model declined, or was cut off: it RAN), five faults, and
      `get_clue_context`'s own refusals relayed untouched. `isEnvelope` added to
      the Deno shared envelope, which `startGame.ts` had inlined

#### connections

- [x] `create_game` · RPC (3 call sites)
- [x] `next_puzzle_for_club` · RPC (2 call sites)
- [x] `puzzle_for_date` · RPC
- [x] `submit_guess` · RPC
- [x] `games` · read
- [x] `guesses` · read
- [x] `players` · read

All three are one `Promise.all` in `hooks/useGame.ts` — the "2 call sites" above
counted `load()` being INVOKED twice (mount, then the postgres-attached
refetch), not two places in the source.

#### crosswords

- [x] `create_game` · RPC, reached through `crosswords-import-nyt / -guardian`
- [x] `create_game` · RPC
- [ ] `export_solution` · RPC (2 call sites)
- [ ] `library_for_club` · RPC
- [ ] `next_nyt_date_for_club` · RPC
- [ ] `set_cell` · RPC
- [ ] `set_mark` · RPC
- [ ] `cells` · read
- [ ] `games` · read
- [ ] `games_state` · read
- [x] `crosswords-explain-clue` · edge fn — PN327/PN328 service-errors (the
      model ran, explained nothing), five faults, and `reveal_solved_word`'s
      refusals relayed. `unsolved` stays an OK: the menu item is live on any
      clue because the FE cannot see which are solved

#### letterboxed

- [x] `create_game` · RPC, reached through `letterboxed-build-board`
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
- [x] `submit_guess` · RPC
- [x] `games_state` · read
- [x] `guesses` · read
- [x] `players` · read

`games` was already read through the `games_state` view, so there was no second
read to convert; `submit_guess` has one call site, not two.

#### scrabble

- [x] `create_game` · RPC (2 call sites)
- [ ] `exchange_tiles` · RPC
- [ ] `pass_turn` · RPC
- [ ] `play_word` · RPC
- [ ] `games_state` · read (2 call sites)
- [ ] `players_state` · read
- [ ] `plays` · read
- [x] `scrabble-ai-move` · edge fn — PN333–PN336, all faults, and the five
      `ai_*` RPCs' own envelopes relayed. `moves` renamed `turns`: one loop pass
      is one seat's TURN however many words it crossed, and 0 is the common
      value since every client pokes and one wins. **The last raw `callEdgeFn`
      call site**, with a guard that keeps it that way — the export cannot say
      who it is for, and an auto-import is all a sixth would take
- [x] `scrabble-suggest-move` · edge fn — PN330–PN332 faults, and
      `get_suggest_context`'s refusals relayed. TWO ok results: an empty
      `moves` array was standing in for `no-legal-moves`, which the panel
      already renders as its own sentence

#### setgame

- [x] `create_game` · RPC (2 call sites)
- [x] `record_hint` · RPC
- [x] `submit_set` · RPC
- [x] `events` · read
- [x] `games_state` · read
- [x] `players` · read

#### spellingbee

- [x] `create_game` · RPC, reached through `spellingbee-build-board`
- [x] `submit_word` · RPC — **SQL only**; the call site is `useWordSubmit`'s
      `commit` (see the hook note above). The WIN became its own named result in
      BOTH modes: it used to be a `won: true` field bolted onto coop's
      `accepted`, and nothing at all on the compete path, so one event was
      reported two different ways depending on mode. PN360 makes a duplicate a
      race
- [ ] `found_words` · read
- [ ] `games_state` · read

#### stackdown

- [x] `create_game` · RPC (2 call sites)
- [x] `reveal_next_hint` · RPC — a hintless word is now a FAULT, not an answer
- [x] `reveal_next_word` · RPC — its "all cleared" branch is unreachable, kept
  as a `BUG:` assertion that clearing the last word really does end the game
- [x] `submit_word` · RPC
- [x] ~~`games` · read~~ — **there is no such read.** The entry came from
  `stackdown/db.ts`'s docstring, which spells `db.from('games')` as its EXAMPLE
  of what the schema-scoped client buys you. Same false positive as the dead
  `ERROR_COPY` key a docstring kept alive; the roster is one entry shorter
- [x] `games_state` · read
- [x] `players` · read
- [x] `submissions` · read

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

- [x] `create_game` · RPC, reached through `waffle-build-board`
- [x] `submit_swap` · RPC
- [x] `games_state` · read
- [x] `players_state` · read
- [x] `swaps` · read

#### wordiply

- [x] `create_game` · RPC, reached through `wordiply-build-board`
- [x] `submit_guess` · RPC — **SQL only**; the call sites are `useWordSubmit`'s
      `commit` AND `recordReject` (see the hook note above). PN362–PN367. Two
      shapes that shared `ok: false` split across the arms: a DUPLICATE records
      nothing and refuses (PN365), while a REJECT inserts a `guesses` row and
      may spend the caller's go — it is a move the game said no to, so it stays
      `ok`. It must also RETURN rather than raise: catching is a savepoint, and
      a raise would roll back the row that is the point of the call. And
      `fe_legal` tells the two callers apart — a structural break claimed legal
      by `commit` is PN367, a fault, because the FE holds `legalWords` and
      checks `minWordLength` before committing
- [ ] `games_state` · read (2 call sites)
- [ ] `guesses` · read (2 call sites)

#### wordle

- [x] `create_game` · RPC (2 call sites)
- [x] `submit_guess` · RPC (2 call sites)
- [x] `games_state` · read
- [x] `guesses` · read
- [x] `players` · read

#### wordwheel

- [x] `create_game` · RPC, reached through `wordwheel-build-board`
- [x] `submit_word` · RPC — **SQL only**; the call site is `useWordSubmit`'s
      `commit` (see the hook note above). PN356–PN358 + PN361, and the win
      becomes one named result in both modes exactly as in spellingbee, which
      this is a fork of
- [ ] `found_words` · read
- [ ] `games_state` · read

### Edge functions

A second producer with a different mechanism: they return
`json({ error: … }, 4xx)` rather than raising, so none of the SQL machinery
reaches them.

**The seven board builders are NOT deferred.** They are how seven games start a
game — the setup dialog calls the function, the function calls that game's
`create_game` — so deferring them would mean deferring seven `create_game`
conversions, which is most of what §7 has left. They are listed with their games.

**200 whenever the function answered**, faults included. The status says whether
the function RAN; the envelope says what it decided. A function that answers 400
for "that difficulty has no buildable board" makes the status carry two
unrelated jobs, and the frontend then cannot tell a `not-ok` that belongs under a
field from a container that never woke up. `runEdgeFn` reads the envelope for
the verdict and the status for nothing but "did this reach the function at all".

The pieces, all shared:

- **`_shared/envelope.ts`** — `ok` / `validation` / `fault` / `crash`, the Deno
  twins of `common.ok_envelope` and `common.raised_envelope`. The severity is
  the FUNCTION NAME, so unlike SQL's `hint` there is no second string to
  mistype: `deno check` owns it.
- **`_shared/startGame.ts`** — `invokeCreateGame` forwards the RPC's envelope
  **untouched**, which is what lets a raise written in SQL reach the player with
  its own words and its own field. `error` then means only "the RPC never ran".
  `parseBuildBoardRequest`'s four gates are faults on the form: the setup dialog
  composes every one of those fields itself.
- **`runEdgeFn`** in `dbResult.ts` — the twin of `runRpc`, and the only place a
  declared fault arriving 200 gets reported, since `dbFetch`'s seam only reads a
  non-2xx body.
- **`raiseCodes`** reads `supabase/functions/**/*.ts` too. One sequence, two
  spellings.

Because those are shared, converting the first board builder converts the
handoff for all seven — the other six are red until they land. That is the
chosen sequencing, not an accident.

**ALL SEVEN ARE DONE**, crosswords last, because it needed a field before its
one validation had anywhere to land — see plans/areas/forms.md → F50
`puzzle-source-picks-in-a-dialog`, which turned its four source tabs into one
`source` field — named for the setup key it writes, like every other field.

Crosswords is also where the third severity finally appears. `error` — "something
we depend on didn't answer" — had been in the type and in the `[db]` line with
nothing producing it, because it belongs to services outside us and only the two
importers talk to any: NYT rejecting a stale cookie, the Guardian unreachable.
Both keep Joel's approved words.

**The three temporary start-game adapters are gone** (`startEnvelope`,
`edgeStartEnvelope`, `invokeStartGameEdgeFn` — `manifestRpcs.ts` is 146 lines
down to 70). They existed to make an unconverted RPC's `{ data, error }` look
like an envelope so the frontend could convert first; every `create_game` returns
one now, so a manifest calls `runRpc` or `runEdgeFn` and there is nothing to
adapt. That was the stated end and this is it.

**Still deferred:** the five that answer a question rather than start a game
(`common-define`, `codenamesduet-suggest-clue`, `crosswords-explain-clue`,
`scrabble-ai-move`, `scrabble-suggest-move`). Whether every edge function should
return an envelope is a separate question, worth deciding once these seven have
shown what it costs.
