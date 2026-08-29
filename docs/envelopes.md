# Envelopes

**This is a design document for a convention we are still rolling out; not every
RPC returns an envelope yet.**

Every Supabase RPC, every Edge Function, and everything we treat like one
answers in a single shape. "Everything we treat like one" includes failures that
never reached a server at all — we build the same envelope for "couldn't reach
the server", so a caller has one thing to read no matter what happened.

This file is the canonical place for these decisions.
[plans/error-system.md](../plans/error-system.md) is the sprint doing the
conversion and tracks what is left; where the two disagree, this file wins.

**Some of what follows is decided and not yet built** — this file describes the
target, and the plan tracks the distance. As of 2026-08-28 the vocabulary here
is the vocabulary in the code: all four severities, `race` included, are spelled
as written here in TypeScript, in SQL's hints, in the Deno builders and in the
guard. Still to land: **the default-appearance resolution** (nothing fills
`outcome` from a severity yet), **`outcome` on the not-ok arm** (typed `null`
today), and **`getNotOkFeedback`**. No raise classifies itself as a `race` yet
either — the severity exists, and the roster decides which raises earn it.

## Consumers

The places we call servers, and what each does with an answer.

- **Game surfaces** — submitting a word for the server to adjudicate. These
  usually change game state and show something in a feedback pill.
- **Forms** — the Anagram dialog, the setup dialogs. A form's answer can carry a
  `form-validation`, which lands under the control it is about. Named for the
  surface rather than the act: "validate" alone is broad enough to describe most
  of what any RPC does.
- **Reads** — the homepage's "all your clubs", the club page's "all games".

**Realtime is the fourth way data arrives, and it is deliberately outside this
convention.** Nobody called anything, so there is no answer to wrap: a row
changed and we were told. It matters here anyway, because it is what makes races
possible — the frontend's gates are built on state realtime delivered, and the
gap before it arrives (or the deaf window in which it never does) is exactly
when a legitimate race happens.

**A read never authors a `not-ok` of its own.** It has no move to judge, so its answers
are rows, a failure, or silence. `readRows` builds the envelope, and a failed
read is always a `fault` — nothing was submitted, so there is nothing to have
been invalid. **Zero rows is `ok`**, always: an empty result is a correct answer
at the protocol level, and only the caller knows whether it *should* have found
something.

## Envelope type: ok | not-ok

A `not-ok` is a failure — but "failure" is a broad word, so:

| | |
|---|---|
| a losing move | **not** a failure — connections' wrong guess is the game working |
| a reasonable move refused for ordinary reasons | **not** a failure — "FOOZLE: not a word" |
| a legitimate race | a failure |
| something the FE would have caught | a failure |
| an invalid form | a failure |

**The yardstick for the second row: a game-rule refusal is `ok`.** Boggle
refusing a duplicate word is the game's rules being applied — that is what the
move was *for*, and the answer is a verdict. Submitting when it is not your turn
does not meet that bar: no rule of the game was consulted, and the move should
never have been sent.

### What makes a race legitimate

A legitimate race is neither the player's fault nor a bug. Two players act at
the same instant and only one can be taken; the FE could not have known.

**The sharp test: WHERE DOES THE FRONTEND LEARN THE MOVE LANDED?** Not "does the
gate depend on server state" — it nearly always does, and that answer decides
nothing. What decides it is whether a window exists at all between the move and
the frontend knowing its result. Three answers:

| the gate is released by | window | so |
|---|---|---|
| the RPC's own response | none — the surface is locked until it returns | a **fault**: you could not have got here without a bug |
| **another player's** action, arriving by subscription | open, and not yours to close | a **race** |
| your own row arriving by subscription | none, and it is held LONGER than the round trip | a **fault** |

The third is easy to misread as the second. wordle's guess gate is
`!submitting && !pendingWord`, and `pendingWord` clears when the guess's colored
row appears in `rows` — the realtime row, not the reply. So the board stays
locked past the response, and running out of your OWN compete budget is
unreachable without a broken client, even though a subscription is what releases
the lock.

Connections' `eliminated` is the second row: your fourth mistake has landed but
the row saying so has not arrived — a gap that is usually milliseconds,
unbounded during a deaf window (see
[realtime-lost-events.md](realtime-lost-events.md)), and permanent in a stale
second tab. Its `bad-selection` guard is neither: the board's own selection is
local, nothing about it can lag, so a five-tile guess arriving means a broken
client or someone poking at the API.

**A classification MAY differ by mode**, and the server knows the mode, so it
can say so — written as two raises in an `if/else`, since an errcode must stay a
bare literal and a `case` expression is not an option (see the guard, below).

**Check that both halves are REACHABLE before splitting, though.** The temptation
is to reason "coop shares this, so coop is the race" and stop, and the mode that
shares a thing is usually the mode that ENDS on it. wordle's exhausted guess
budget is the case that taught this: a shared coop budget sounds like the
textbook race — a teammate spends the last guess while yours is in flight — but
spending the last coop guess ends the game, so a later guess meets the
`play_state` guard instead and reads "Game over". The coop half of the split was
dead code, and the honest answer was one fault. **The question to ask of each
half is not "is this a race here?" but "can this line run here at all?"**

### Worked cases

Connections' `submit_guess`, which has one of nearly every kind:

| raise | kind | why |
|---|---|---|
| `game-not-in-play` | race | a teammate ended it while your guess was in flight |
| `you-conceded` | race | your concede landed first; your client hadn't heard |
| `eliminated` | race | your own fourth mistake landed; same lag |
| `bad-selection` | fault | the board only ever selects four tiles |
| `bad-result` | fault | `result` comes from the FE's own evaluator |
| `bad-category-rank` | fault | ditto |
| `not-a-player` | fault | `create_game` seeds the row; its own comment says "shouldn't happen" |
| `game-not-found` | fault | nothing to race against |

And one that looks like the first three and is not:

| raise | kind | why |
|---|---|---|
| `hint-in-compete` | fault | mode is fixed at `create_game` and never changes, so no unbroken FE would have sent it |

## Outcome

An **outcome** is the verdict on a move, or a move-like thing: `won`, `lost`,
`near`, `warning`, `neutral`, `noted`. Despite the names, `won` and `lost` are
"good move" and "bad move" as often as they are the end of a game.

An `ok` will often carry one. It colors the feedback pill and the verdict
column in a game's turn log.

**A `not-ok` can carry one too** — which is what lets one look calm or loud
independently of how bad it is. See Appearance, below.

Each outcome's meaning, and where it is used, is in
[outcomes.md](outcomes.md).

## Severity (not-ok only)

Every `not-ok` carries one:

- **`fault`** — a hard failure: a bug, a broken server, or a request that did
  not come from our FE. Shown as a blocking modal, and may also appear on a form
  or a pill.
- **`race`** — the player lost a legitimate race. Shown as a local feedback pill.

  **So far every race is in a game**, and there is a reason to expect that to
  hold: a race needs shared state changing underneath you, and only a game has
  any. A form's values are yours alone until you submit, and a read has no move
  to lose. If one ever turns up on a form, that is worth looking at twice — it
  probably means the form was reading live state it should not have been.
- **`form-validation`** — the form is invalid, and the message belongs under the
  control it is about. The only severity that names a `field`.
- **`service-error`** — something we depend on did not answer. NYT unreachable,
  the Guardian timing out, a pasted cookie the site no longer accepts. Nobody's
  fault in either direction; it reads as "try again later", not as a bug.

**`service-error` is not a catchall.** A catchall severity is where
classification goes to die — the next ambiguous case lands there instead of
being decided.

**The two compound names are spelled out rather than shortened**, because both
short forms are words that already mean something else here. A bare `validation`
describes most of what any RPC does, while this one means specifically "put it
under that control". A bare `error` would collide with the outcome of the same
name — one severity and one outcome, spelled identically, meaning different
things, which is the confusion the two levels exist to remove.

### Appearance

A severity carries a default appearance; an outcome overrides it.

| severity | default | reads as |
|---|---|---|
| `fault` | `error` (red) | something is broken |
| `form-validation` | `error` (red) | fix this and try again |
| `service-error` | `error` (red) | not us, not you — try later |
| `race` | `warning` (orange) | we're not taking it, and you should notice |

Orange is the point of `race`. It is not a losing move — that would be red — but
the move is not being taken and you should notice, the way "that's a duplicate
word" needs noticing.

**The default is resolved once, in `notOkOutcome` (`dbResult.ts`).** Not in SQL,
which would repeat it at every raise and mean editing all of them to change it;
not at the call site, which is the same problem one layer up.

**Nothing is written back into the envelope.** A caller reads exactly the
envelope the server sent, and `outcome` on a `not-ok` keeps one meaning — *the
author overrode the default* — rather than meaning "the default, filled in on
the way past". So a blank `outcome=` on a `[db]` line beside an orange pill is
not a discrepancy to explain: it says nobody overrode anything, and orange is
what a `race` looks like.

`outcome` stays nullable on the not-ok arm, and null means "use the default"
rather than "no appearance" — which is why filling it in would have cost the
distinction.

## What a caller does with one

### Presenting a fault is not a call site's job

**One rule, and everything else here follows from it: the layer that KNOWS a
failure is a fault, and HOLDS its diagnostics, is the layer that shows the
modal.** That is `dbFetch` for an environmental failure and a raw fault, and
`runRpc` / `runEdgeFn` / `readRows` for a declared one arriving on a 200. Never
a call site.

The diagnostics line is why: it is built from **transport** facts — the call,
the HTTP status, the elapsed milliseconds — that no envelope carries and no call
site has. A call site raising its own modal can only produce a worse copy of one
that already fired.

### But the surface still shows it — the modal is an ESCALATION, not a replacement

**Do not filter by severity when you report an answer.** A fault goes in the
form's error line, or the pill, exactly as a `form-validation` or a race would.
The modal is *additional*.

The reason is what the player sees after dismissing it. Press OK on a modal and
a form that filtered the fault out looks like nothing is wrong — or worse, shows
some lesser validation error, so the dialog now claims the problem is a
too-short club name when the truth is the server is down. A board is the same:
leaving "FOOZLE: not a word" in the pill is pointless when the real news is that
nothing is reaching the server.

So `getNotOkFeedback` maps **every** severity, `fault` included, and a form
writes `res.message` to its error line whatever the severity says. Nothing
anywhere reads `severity` to decide whether to display an answer — only to
decide how it reads.

### The mapping

A `not-ok`'s appearance is derived, not decided at the call site.
`getNotOkFeedback(envelope)` in `src/common/lib/game/genericPills.ts` maps it to
the parts of a feedback message: the outcome — the author's, or the default its
severity carries — and the text from `message`.

**One function, because it is one mapping.** The first surface where a single
call can answer three ways — `submit_guess`, which returns `ok`, a race, or a
fault — cannot have that line written by hand, and neither can the fifteen
boards after it. Letting each derive its own would put back exactly the drift
`ERROR_COPY` was centralizing.

`genericPills.ts` rather than `localPills.ts`: a **local** pill is specifically
the below-board one, about this player. This mapping serves global pills too, so
it does not belong in a file whose docstring says otherwise.

**`mode` stays at the call site** — permanence is about the surface, not about
the answer — so the function returns the message minus its mode:

```ts
if (res.type !== 'ok') {
  showLocalFeedback({ ...getNotOkFeedback(res), mode: { kind: 'manual' } })
  return
}
```

**There is no equivalent for `ok`, deliberately.** What pill a successful answer
shows is game-specific — a pangram's score, a word's length, nothing at all —
and we do not know whether rules exist there yet. Better an honest gap than a
shared helper guessing at one.

### Who writes the words, per answer

Not per game, and not per arm — the question is asked of each answer an RPC can
give, and there are three rules.

**1. `data` carries the fact, structurally, whether or not a message goes with
it.** A server that judged a word and found it isn't one says so in `data`;
"the sentence mentions it" is not the same as the caller being told. The
frontend has its own uses for the fact — a board shake, a counter, a mark on the
tiles — that have nothing to do with the words.

**2. Where the RPC can write the sentence, it does**, on the same principle as a
raise: whoever knows why the answer is what it is writes it, once, where the
decision was made. `common.ok_envelope` takes a `message` for exactly this.

**3. `message: null` means THE FRONTEND COMPOSES IT** — a signal, not an
absence. Some sentences need what only the frontend has: a player's name beside
their color dot, a link, a piece of local state. Non-null means render it as it
came, and do not rebuild it without a very good reason.

**The rule that makes the signal usable: a server-written message may not say
LESS than the sentence it replaces.** Without it, "can the server write this?"
is answerable *yes* almost anywhere, by writing a worse one — nothing stops an
RPC producing "Waiting for another player" in place of "Waiting for ● moth",
and the result looks like a properly server-authored message while having
quietly dropped the dot and the name. The test is not *can the server say
something*; it is **can the server say this thing, at full fidelity**. If the
honest server version is a downgrade, the message stays null.

So a null message is not a gap waiting to be filled. "Why has this one no
message?" has a real answer: because the sentence carries an identity, a link,
or local state, and a server-written one would say less.

A **form** needs none of this: `setErrors({ [res.field ?? '_']: res.message })`
is the whole mapping, and a field error has one look. Note that there is no
`if` in it — a fault lands on the form line like anything else, per the
escalation rule above, and `'_'` is where one goes since a fault is not about a
control.

## The keys

**Every key is present on every envelope, null when it has nothing to say.**
Nothing is optional in the "might not be there" sense.

Two reasons, and the second is the load-bearing one:

- An envelope has defined fields. A caller reads one rather than first checking
  whether it exists.
- **A key added LATER.** If keys were optional, adding `error_url?` would leave
  every existing builder compiling while silently omitting it — so "we looked at
  this site and it has no URL" and "nobody looked at this site" become the same
  source text, permanently. Required and nullable, a new key is a compile error
  at every construction point, and somebody has to answer for each one.

| key | on | holds |
|---|---|---|
| `type` | both | `ok` \| `not-ok` |
| `data` | ok | the payload the caller asked for |
| `outcome` | both | how it reads on screen |
| `severity` | not-ok | what kind of `not-ok` it is |
| `message` | both | **the player-facing sentence** |
| `field` | not-ok | which control a `form-validation` is about |
| `meta` | both | the additive slot — SQL can leave breadcrumbs with no FE change |
| `dbcode` | both | the SQLSTATE, when a raise produced this |
| `detail` | both | the debugging line — **never shown to a player** |

**The message is written at the raise, by the RPC author.** This is the decision
the whole convention rests on: whoever knows why the answer is what it is writes
the sentence, once, where the decision was made. The frontend does not rebuild
it from a key.

**`field`, and `'_'`.** `_` means "deliberately not about one field" — the
form's own line — and it is a real value, distinct from an author having
forgotten to say. The marker has to exist because `get stacked diagnostics`
cannot return null for `COLUMN`: an unset one arrives as `''`, so without `_`,
"decided" and "forgot" would look identical. The same string is the form-level
key in a form's errors object, so it serves SQL, the envelope and the form
alike.

## How SQL builds one

An RPC builds its envelope by RAISING and catching its own raise. Nothing
returns a `not-ok` directly, and that is what lets a shared helper — say
`common.require_club_member` — raise from deep in a call stack while the RPC at
the boundary still answers in one shape. A helper cannot return an envelope
without every caller having to check and re-return it.

**The SQLSTATE says which branch.** `PA###` produces an `ok`; `PN###` produces a
`not-ok`. `src/guards/raiseCodes.test.ts` reads the SQL and the edge functions
together, since both draw from one sequence.

```
P A 0 4 2               P N 5 0 7
│ │ └─┴─┴── unique id, 000–999
│ └──────── A = this raise becomes `type: ok`
│           N = this raise becomes `type: not-ok`
└────────── P = ours
```

`P0` is PL/pgSQL's own class (`P0001` raise_exception, `P0002` no_data_found),
which is why ours are `PA` / `PN`: a code from anywhere else can never be
mistaken for one of ours. **We never reuse a Postgres code**, even where one fits
semantically — a condition resembling `unique_violation` still gets a `PN###`,
so "did we raise this, or did the database?" is answered by the prefix alone.

**The digits encode nothing** — no families, no ranges to remember. They are a
unique ID, so a code in a bug report leads to exactly one line of SQL.

**Unique per raise SITE, not per condition.** `game-not-found` is raised 88
times and `game-not-in-play` 57; per-condition numbering would send you to 88
lines, per-site to one. The cost is that one condition wears many codes, so
"find every game-not-found" is a grep on the message prose. **A helper's code is
shared by all its callers, and that is fine**: `common.require_club_member`
raises the same code through `delete_game` and `send_message`, because the code
answers *what happened* and the diagnostics line answers *which call*.

**Allocating one: `max + 1` for that class, never filling gaps.** A reused number
means an old bug report — "it said PA003" — later points at a different
condition, and gaps cost nothing against 1,000 slots per class. The regex is the
whole allocator:

```sh
grep -rhoE '\bP[AN][0-9]{3}\b' supabase/sql supabase/functions | sort -u
```

`raiseCodes.test.ts` prints the next free number of each class on every run, so
the same regex serves the guard and a by-hand check. It enforces shape and
uniqueness, **not contiguity**. What it asserts:

1. Every raise carries an errcode matching `^P[AN][0-9]{3}$`. **The shape check
   matters most**, because a malformed errcode does not fail loudly: Postgres
   accepts a *condition name* in that slot, so `PU00-` is looked up as a name and
   comes back as `42704 undefined_object` — a plausible-looking code on the raw-fault
   route rather than obvious garbage.
2. Every code appears exactly once across the whole app.
3. Every `PA` raise's HINT is an `outcome`; every `PN` raise's HINT is a severity.
4. That its two vocabularies equal the TypeScript unions — a `PA` raise's is
   every `Outcome` but `error` (a successful result never reads as a failure),
   a `PN` raise's is `Severity` exactly. This is the SQL↔TypeScript link, and
   the assertion that actually rots unguarded.

**Errcodes stay bare literals.** `errcode = case when g.mode = 'coop' then …` is
legal SQL and would blind the guard exactly where the interesting classification
lives; a condition that classifies differently per mode gets written as two
raises in an `if/else`. And the guard can check that a severity is well-formed,
never that it is *right* — whether a given raise is really a fault is the
author's judgment, and no test can second-guess it.

**Each `RAISE` clause carries exactly one thing:**

| clause | becomes | notes |
|---|---|---|
| `errcode` | `dbcode`, and the branch | `PA` / `PN` |
| `message` | `message` | the player's sentence |
| `hint` | `outcome` (PA) or `severity` (PN) | disjoint vocabularies, so one channel is unambiguous |
| `column` | `field` | `'_'` for "not one field" |
| `detail` | `detail` | for the log, never the player |
| `constraint` | `outcome`, on a `not-ok` | the appearance OVERRIDE — omit it and the severity's default applies |

**Why the override needs a channel of its own:** a `not-ok` has two things to
say — how bad it is, and how it reads — and `hint` is already carrying the
first. `common.delete_game` is the case that wanted both: *"That game was
already deleted"* is a `race` (a friend deleted it a moment earlier and your
list hadn't heard), but a race's orange is too quiet for a game vanishing, so it
takes `constraint = 'lost'` and reads red.

**Every RPC ends with the same handler**, which knows about no specific
condition. It reads the SQLSTATE, re-raises anything that is not ours, and lets
the raise itself carry the message, the kind, the field and the appearance:

```sql
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
```

**A handler that omits `v_out` drops the override silently** — `get stacked
diagnostics` returns only what you ask for, so nothing fails and nothing logs;
the pill just wears the default. `raiseCodes.test.ts` therefore fails any
function that writes a `constraint` its own handler never reads back. The
handlers written before the channel existed are correct as they are: they carry
no override, so there is nothing to lose.

`when others` rather than `when sqlstate …` because the latter accepts only a
literal code — no patterns, no variables. Anything not ours reaches the client
in Postgres's own shape, which is how the frontend tells a fault WE declared
from one nobody anticipated.

**A function with no raises still returns an envelope** — via
`common.ok_envelope`, with no handler, because there is nothing to catch. The
call shape must not depend on whether the SQL happens to raise *today*, or
adding a raise later would silently invalidate every call site.

**Grants.** Not every RPC is `security definer` — one that filters nothing has
no reason to be — and a plain function runs as the caller. So the caller must be
able to call the builders: `common.ok_envelope` and `common.raised_envelope` are
granted to `authenticated` where they are defined.

## How edge functions build one

**An edge function answers 200 whenever it ran**, faults included. The status
says whether the function RAN; the envelope says what it decided. A function
answering 400 for "that difficulty has no buildable board" makes the status
carry two unrelated jobs, and the frontend can no longer tell a `not-ok` it
should show under a field from a container that never woke up.

Where a function calls an RPC it **relays that envelope untouched**, so a
sentence written in a SQL raise reaches the player with its own words and its
own field. The function's own `error` channel then means only one thing: the RPC
never ran.

The builders are in `supabase/functions/_shared/envelope.ts`, typed against the
same `Envelope` the frontend uses. That type lives in its own module
(`src/common/lib/supabase/envelope.ts`) precisely so Deno can import it —
`dbResult.ts` reaches the browser client and cannot cross. The builders write
every key out rather than spreading a shared constant, so a new key is a compile
error there too.

## How the frontend receives one

**Three populations, three shapes, and the shape says who authored the
failure:**

| shape | means | treated as |
|---|---|---|
| an **envelope** | we wrote this outcome down — someone named the condition and wrote a sentence for it | whatever `type` / `severity` says |
| the **raw Postgres/PostgREST shape** (`{code, message, details, hint}`) | nobody anticipated it — a constraint violation, a missing function, a deadlock, permission denied | always a fault |
| **no reply at all** | environmental — offline, or the fetch died in transit | always a fault |

**Nomenclature: a "raw fault" is one that arrives in Postgres's own shape**, as
opposed to a **declared fault**, which arrives as an envelope with `severity:
fault`. Both look identical to a player and are completely different to debug: a
declared fault has a named condition and a written reason, a raw fault has
neither. The term is worth using in code, comments and conversation. An earlier
draft made the fault test "is there an envelope", which put the faults we *did*
anticipate on the same side as the ones nobody ever thought about.

**Where the envelope comes from when the server didn't send one.** `runRpc`,
`runEdgeFn` and `readRows` in `src/common/lib/supabase/dbResult.ts` each hand
back an `Envelope`, building one in the same shape when the call errored, never
completed, or answered with something unreadable. So a call site has one thing
to read no matter what happened, and a **read** — which never authors a `not-ok`
of its own — branches like everything else.

**Faults are presented centrally, and a call site never words a failure.** Two
layers split the job by what each can see:

- **`dbFetch`** is installed as the client's `global.fetch` (`supabase.ts`), so
  every PostgREST request, table read, edge function and auth call passes
  through it. It owns the two failures with no body worth reading: **nothing
  answered** (environmental) and **a non-2xx** (a raw fault — it clones the
  response and parses Postgres's shape out of it). Both are logged and shown.
  Two deliberate exceptions are logged but never presented: an **abort**, which
  is us canceling our own request, and Supabase's **own auth endpoints**, which
  the sign-in screen speaks for.
- **`runRpc` / `runEdgeFn` / `readRows`** own everything that arrives HTTP 200,
  because the meaning is in the body. A `severity: fault` gets the modal here;
  everything else gets its `[db]` line. `dbFetch` stays quiet on an RPC's 2xx
  rather than printing an `OK` directly above a line contradicting it.

One diagnostic falls out of the split: **a `PA`/`PN` code arriving in the raw
shape is always a bug of ours.** Our codes are meant to arrive 200 inside an
envelope, so one beside a 4xx means the RPC that raised it has no handler to
catch it — during the rollout, an unconverted RPC calling a converted helper.

**What reaches a call site is then only what it has an opinion about**: an `ok`,
or a `not-ok` it renders with `getNotOkFeedback`. A declared fault still arrives
— one shape, always — but the modal is already up, so there is nothing left to
render. The one `if` that stays is a caller noticing it didn't get data so it
can clear a `busy` flag or roll back an optimistic write: a bail-out, not a
decision, needing no error vocabulary at all.

### "Environmental" means the JS fetch failed

The word is narrow, and worth holding to its edges because it is easy to widen
by accident. The one-line version: **an environmental problem is a failed JS
fetch.** The promise rejected, no `Response` object exists, and `dbFetch` — the
only place that builds one — tests exactly that.

With one carve-out, because not every failed fetch is the environment's fault:
**a fetch WE canceled doesn't count.** An `AbortError` — a component unmounting,
a superseded request — is logged and nothing more, since nobody is owed a modal
for a request we withdrew. Calls to Supabase's own auth endpoints are excluded
too; the sign-in screen speaks for those. So, fully: *the JS fetch failed, and
we didn't cause it.*

What is **not** environmental, though each is tempting:

| | is | because |
|---|---|---|
| `PGRST202` — no function by that name | a **raw fault** | a real HTTP response, with a code. Something answered |
| a dead edge-function container | a **raw fault** | a gateway 502 is still a response |
| a working edge function reporting that NYT is down | a **`service-error`** | our function ran, reached a decision, and said so on a 200 |

**The third is the one to guard.** An outside service failing is not the
environment failing: our own stack worked perfectly, and a function wrote a
sentence about what it found. It is a decision, so it travels as one, and the
Deno builder that writes it is `serviceError` — named for the severity, so the
two words cannot be swapped by reflex.

Nothing behavioral hangs on the line being here rather than one step wider: a
raw fault and an environmental failure both pop the same modal and read the same
to a player. It is drawn here because it is a property the code can test in one
expression, and a boundary that needs judgment is a boundary that drifts. The
fact a wider definition wanted is already on the `[db]` line anyway — **a blank
`status=` is "nothing answered"**.

### The environmental sentences

The frontend authors exactly two sentences, and they are the only ones it
authors at all — for the one failure above, where the server never spoke, so no
author could have written for it. Which applies turns on `navigator.onLine`.

**They are generic and name no action**, and that is a correctness rule rather
than a simplicity one: **an environmental failure cannot tell you whether the
move landed.** The connection can die on the way *back*, after the write
committed, so "Your guess didn't send" would be a confident false statement in
the one moment a player most needs the truth. "Refresh and try again" is the
right instruction for the same reason — refreshing reveals the real state before
a retry can double-apply. Which call it was rides in the diagnostics line
instead, free, where the request path already is.

### The `[db]` line

One format and one builder, for the console **and** for the diagnostics under a
fault modal or an `<ErrorPage>` — the second is the first minus the trailing
`msg=`, since those surfaces already lead with the message. Built once and
shared, so screen and log carry the same timestamp as well as the same fields.

```
[db] 05:41:12.204 | FAULT | POST /rest/v1/rpc/delete_game | severity=fault | outcome= | dbcode=PN012 | status=200 | ms= | field=_ | detail="caller is not in common.club_members for this club" | msg="You are not a member of this club"
```

**Every field prints every time**, empty after the `=` when there is nothing to
say, so a fact is always in the same position and a blank is itself information:
no `dbcode` means nothing raised, no `status` means the server never answered.
`call` is never blank.

The level is the first word and picks the console method, so a line's level and
its severity cannot disagree:

| level | method | is |
|---|---|---|
| `FAULT` | `console.error` | a bug |
| `SERVICE_ERROR` | `console.warn` | something we depend on didn't answer |
| `SLOW` | `console.warn` | a call over the threshold that still worked |
| `RACE` | `console.warn` | a race the player lost |
| `FORM_VALIDATION` | `console.debug` | the values you sent |
| `OK` | `console.debug` | it worked |

**Four of the six are a severity, spelled the same way**, so a line's level and
the `severity=` on it cannot read as two different claims. `SLOW` and `OK` are
the exceptions: they are `dbFetch` narrating transport, where no envelope
reached a decision at all.

The two quiet levels are why every call can be logged without drowning
anything — the browser's own level filter is the volume control, and no custom
verbose flag is needed.

**`RACE` is `warn` even though nothing is wrong**, and it is the one level that
isn't tracking how bad something is. A lost race is rare and genuinely puzzling
from the player's side — the move they made simply didn't happen — so the
question it produces is "what was that?", and the answer should be one glance at
the console rather than a dig through debug output.

**A `not-ok` that is not a fault is logged too**, at `warn`. The old rule was
"expected rejections are NOT logged", which makes a MISCLASSIFIED bug completely
silent: if "already deleted" starts firing on every click because something
broke, nothing anywhere says so. One line keeps that visible without putting a
modal in anyone's way, and tagging by level keeps real faults from being buried
among them.

`SLOW` is the one line about the REQUEST rather than an answer, and it carries
fewer fields on purpose: it is written before the body is read, so printing
`dbcode=` would say the response carried no code when the truth is that nobody
looked. Omitted beats empty.

`[db]` is its own console channel beside `[rt]` (realtime) and `[ui]`, so
filtering to it gives every database call and nothing else.
