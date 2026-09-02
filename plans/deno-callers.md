# The Deno callers — the fourth quadrant

**Status: DONE (2026-09-01)** — the wrapper is built and all ten call sites
are on it. What remains of this plan is its record of why, which folds into
docs/envelopes.md when the sprint ends. The other seven call RPCs that have not converted yet, and they
join as those do — see §6. A piece of the error sprint
([error-system.md](error-system.md)), split out because it is engine work rather
than a roster entry: it is the inbound half of the envelope in Deno, and the
remaining edge-function conversions should land on top of it rather than
alongside it.

## 1. What is missing

The sprint gave the **browser** one way to talk to the server. Three wrappers in
`src/common/lib/supabase/dbResult.ts` — `runRpc`, `readRows`, `runEdgeFn` — all
hand back the same `Envelope`, and a call site never touches a raw response. The
question "did the call work, and is what came back the shape we think it is" is
answered once, inside the wrapper, and all 145 sites inherit the answer.

**Edge functions talk to the same server and got none of it.** There are four
call directions in the app and only three have a caller:

| direction | wrapper |
|---|---|
| FE → RPC | `runRpc` |
| FE → table read | `readRows` |
| FE → edge function | `runEdgeFn` |
| **edge function → RPC** | **none** |

`_shared/envelope.ts` holds *builders* — `ok`, `fault`, `formValidation`,
`serviceError`, `crash` — for the answer an edge function **sends**. Nothing
exists for the answer it **receives**. So each function hand-writes the inbound
sequence, and thirteen of them have drifted into four spellings of it.

This is traceable to the plan rather than to anyone's oversight:
[error-system.md](error-system.md) §6 Step 1 named three engine pieces and all
three are frontend, and §3's Deno paragraph is titled "How edge functions
**build** one". The outbound half was specified; the inbound half never was.

## 2. The evidence

**Two sentences, eight codes.** Every one of these means exactly one of two
things — the RPC never ran, or it answered a shape we cannot read:

| sentence | codes today |
|---|---|
| `BUG: <rpc> did not run` | PN117 (`startGame`), PN233 (import-nyt), PN241 (import-guardian), PN316 (suggest-clue), PN325 (explain-clue) |
| `BUG: <rpc> returned no envelope` | PN118 (`startGame`), PN234 (import-nyt), PN242 (import-guardian) |

Per-site codes are the rule for *raises*, and the reason is that a code in a bug
report should lead to one line of SQL. It earns nothing here: eight codes lead
to one fix, and the RPC's name is already in every `detail` string.

**Four spellings of one boundary check.**

```ts
isEnvelope(data)                                          // _shared/envelope.ts, 4 functions
!data || typeof data !== 'object' || !('type' in data)    // import-nyt + import-guardian, inline
                                                          //   — and WEAKER: never checks type's VALUE
if (error) throw new Error(`pick_seed failed: …`)          // the build-board helpers
if (error) return fault('PN316', …)                        // the suggest/explain functions
```

**The shim that rots.** Four functions carry this line:

```ts
if (isEnvelope(data)) return json(data)
const ctx = data as ClueContext
```

It reads *"an envelope here means a refusal; anything else is the old bare
shape"* — a straddle across the conversion, and it stops being true the moment
the RPC it calls converts, because then the **success** is an envelope too and
gets relayed to the FE unread. Two of the four carry a comment claiming the RPC
below them is already converted when it is not
(`codenamesduet-suggest-clue:98`, `crosswords-explain-clue:66`), which is how
this was found.

## 3. The design

**One wrapper, mirroring `runRpc`, in `supabase/functions/_shared/dbResult.ts`:**

```ts
runRpc<T>(call, rpcName): Promise<Envelope<T>>
```

It does what the frontend's does, minus everything that belongs to a user
surface (no modal, no pill, no `reportFault` — an edge function has no surface;
it answers by returning an envelope of its own). Four steps:

1. await the call
2. `error` ⇒ the RPC never ran ⇒ a fault envelope naming it
3. not an envelope ⇒ a fault envelope naming it
4. otherwise log one line and return it, typed

Then every edge function reads the way an FE call site reads:

```ts
const res = await runRpc<ClueContext>(db.schema('codenamesduet').rpc('get_clue_context', { … }), 'get_clue_context')
if (res.type === 'not-ok') return json(res)   // relay the refusal untouched
const ctx = res.data                          // carry on
```

**Relay-vs-unwrap stays at the call site.** `startGame` and `scrabble-ai-move`
relay the whole envelope; `codenamesduet-suggest-clue` and
`crosswords-explain-clue` unwrap the `ok` and keep working. That is a real
per-function difference and it is one line either way — it does not deserve two
wrapper variants.

### Only ONE wrapper, not two — the population-A decision

An earlier draft of this said "give Deno both callers, `runRpc` and `readRows`".
Reading the call sites changed it. The nine row-returning helper calls —
`candidate_words`, `pick_seed`, `candidate_bases`, `try_base`,
`matching_words`, `seed_for`, `cache_definition` — sit inside **pure helpers**
(`buildBoard(): Promise<Board | null>`), not inside the request handler, and they
signal failure by `throw`, which the function-level `crash(FN, e)` turns into a
fault envelope at the edge.

That is already a coherent boundary. Handing those helpers envelopes would push
envelope-branching into every board builder to gain nothing: there is no refusal
to relay, no player sentence, and `crash` already produces the right answer.
[error-system.md](error-system.md) §3 made the same call for the RPCs
themselves — *"Edge-function-fed ones stay as they are… different consumer, no
fault surface, Deno reads rows fine"* — and this is that decision arriving at
the callers.

**So population A is deliberately untouched.** Written down here so the next
reader does not "finish the job". A Deno `readRows` earns its place the day one
of those calls needs to relay a refusal, and not before.

## 4. What it deletes

**Done:** four PN codes (PN233, PN234, PN241, PN242) and the inline
`!('type' in data)` predicate in both crosswords importers, which is the weak
spelling — it never checked what `type` actually WAS.

**Still to come, with the blocked call sites:** PN316 and PN325, the four shim
lines, and the two comments claiming `get_clue_context` and
`reveal_solved_word` are converted when they are not.

## 5. Decisions

1. **The wrapper owns PN117 and PN118** — `startGame`'s pair, which already
   meant exactly these two things, generalized to name the RPC. Nothing is
   reused in the sense the allocator forbids: no number changed meaning, and no
   new code was minted to retire six.
2. **It logs one line per call** — `[rpc] <name> <type> <ms>ms`, plus severity
   and dbcode on a `not-ok`. The Deno counterpart of the frontend's `[db]` line.
   Deno logging was per-function taste before.
3. **The RPC name is a parameter**, not dug off the query builder. The
   frontend's `callLabel` digs `url`/`method` off postgrest-js defensively,
   because they are `protected`; here the name is known at every call site and a
   parameter cannot go stale when a library renames a field.
4. **`faultEnvelope` is the only builder in `envelope.ts` with a value form**,
   and `fault` delegates to it. The inbound path needs a fault it can HAND BACK
   for the caller to branch on; the outbound builders never do, because a
   function that has decided something is done deciding.

## 6. The roster

**Verified 2026-09-01, and the first draft of this section was wrong.** It
assumed the ten Deno-called RPCs were converted because
[error-system.md](error-system.md) says so of the edge functions above them.
Checking each one for `ok_envelope` / `raised_envelope`:

| RPC | envelope today |
|---|---|
| `crosswords.create_game`, and the seven build-board `create_game`s via `startGame` | **yes** |
| `scrabble.get_ai_context`, `get_suggest_context`, `ai_play_word`, `ai_exchange_tiles`, `ai_pass_turn` | no — `_commit_word` returns bare `{result:'stale'}` and raises old-format |
| `crosswords.next_nyt_date_for_club` (`returns date`), `reveal_solved_word` (`returns table`) | no |
| `codenamesduet.get_clue_context` | no |

So the wrapper serves **three call sites today**, not ten. That is not an
argument against it — all four `isEnvelope` shims sit exactly where the RPC has
not converted, which is coherent, and each of those conversions is smaller with
the wrapper already there.

**Done:**

- [x] `_shared/dbResult.ts` — the wrapper, owning PN117 (`did not run`) and
      PN118 (`returned no envelope`). `faultEnvelope` added beside the outbound
      builders in `_shared/envelope.ts`, because an inbound failure has to be a
      VALUE the caller branches on rather than a `Response` it returns blindly;
      `fault` now delegates to it. `raiseCodes.test.ts` learned the new builder
      name — verified by planting a duplicate code and a non-`BUG:` message,
      both caught
- [x] `_shared/startGame.ts` — `create_game` for the seven build-board games.
      Its PN117/PN118 became the wrapper's; the function is nine lines shorter
- [x] `crosswords-import-nyt` — the `create_game` call. PN233/PN234 deleted,
      and with them the inline `!('type' in data)` predicate, which never
      checked what `type` actually WAS
- [x] `crosswords-import-guardian` — the same, PN241/PN242 deleted

- [x] `codenamesduet-suggest-clue` — converted with
      `codenamesduet.get_clue_context` itself (2026-09-01), the first call site
      to UNWRAP rather than relay. PN316 deleted; its shim was the one that
      started this plan

**Converted with their RPCs**, each in the same commit — pointing `runRpc` at
an unconverted RPC would have faulted every SUCCESS, so neither half could move
alone:

- [x] `crosswords-explain-clue` — converted with `reveal_solved_word`
      (2026-09-01), the LAST of the ten. PN325 deleted; it unwraps the ok and
      branches on `result` where it used to test `answer` for null
- [x] `scrabble-ai-move` (4 sites) — converted with scrabble's RPCs
      (2026-09-01). Its `stale` break became `res.severity === 'race'`: losing
      the race to another driver is the ORDINARY outcome here, since every
      client pokes this function. PN335/PN336 deleted — `runRpc` names the RPC
      in the message it faults with, which is what the `fail` helper's `where`
      argument existed to do
- [x] `scrabble-suggest-move` — converted with `get_suggest_context`. PN332
      deleted; it UNWRAPS the ok rather than relaying, like the duet suggester
- [x] `crosswords-import-nyt`'s second call — converted with
      `next_nyt_date_for_club`. It RELAYS both arms now: the empty answer moved
      into the RPC, because the setup form asks the same question and deserved
      the same sentence. PN227/PN228 deleted

### Roster rows that error-system.md is missing

Found while verifying the table above; noted here rather than fixed, since each
needs its own answer table before it converts:

- **`scrabble.get_ai_context`, `get_suggest_context`, `ai_play_word`,
  `ai_exchange_tiles`, `ai_pass_turn`** — no rows, and the `scrabble-ai-move`
  row claims "the five `ai_*` RPCs' own envelopes relayed", which is not true of
  the SQL: they answer bare and raise `P0001`. The relay line was written for
  what they will be. Their real answers live in `_commit_word` /
  `_commit_exchange` / `_commit_pass`, three shared cores, so the five RPCs are
  fewer conversions than they look.
- **`codenamesduet.get_clue_context`** — now has a row (added 2026-09-01).

## 7. Sequencing

**The wrapper goes before the RPCs its call sites relay**, and that is how
`codenamesduet.get_clue_context` went: with `runRpc` already there, its
conversion was an ordinary one — SQL, a three-line edit to the function above
it, pgTAP — instead of "and be careful, or the success gets swallowed".

`crosswords.reveal_solved_word` is the same shape and still carries the trap.
It also changes return TYPE, not just shape (`returns table(answer, solved,
note)` → `returns jsonb`), so it needs a `drop function if exists` above it;
`get_clue_context` did not, being jsonb already.

**The five scrabble RPCs are the larger remaining piece**, and they are not on
error-system.md's roster at all. Their answers are authored in three shared
cores (`_commit_word`, `_commit_exchange`, `_commit_pass`), so converting the
cores converts all five call sites at once — closer to one conversion than
five.

When this ships, its durable half — the fourth quadrant, and what the Deno
caller does — belongs in [docs/envelopes.md](../docs/envelopes.md) beside "How
edge functions build one", and this file is deleted.
