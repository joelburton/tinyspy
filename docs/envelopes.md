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

## Consumers

The places we call servers, and what each does with an answer.

- **Game surfaces** — submitting a word for the server to adjudicate. These
  usually change game state and show something in a feedback pill.
- **Forms** — the Anagram dialog, the setup dialogs. A form's answer can carry a
  `form-validation`, which lands under the control it is about. Named for the
  surface rather than the act: "validate" alone is broad enough to describe most
  of what any RPC does.
- **Reads** — the homepage's "all your clubs", the club page's "all games".

(XXX: are there other places or other categories?)

**A read never authors a refusal.** It has no move to judge, so its only answers
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

**The sharp test: was the FE's gate depending on state it can only learn from
the server, and had it not learned it yet?**

That is what separates a race from a broken client. Connections' `eliminated`
fires when your fourth mistake has landed but the realtime row saying so has not
arrived — a gap that is usually milliseconds, unbounded during a deaf window
(see [realtime-lost-events.md](realtime-lost-events.md)), and permanent in a
stale second tab. Its `bad-selection` guard is the opposite: the board's own
selection is local, nothing about it can lag, so a five-tile guess arriving
means a broken client or someone poking at the API.

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

An `ok` will often carry one. It colours the feedback pill and the verdict
column in a game's turn log.

**A `not-ok` can carry one too** — which is what lets a refusal look calm or
loud independently of how bad it is. See Appearance, below.

XXX: outcomes deserve their own canonical doc (`outcomes.md`) explaining each
one. It should also settle what `noted` is FOR, now that the game refusals which
used it are races.

## Severity (not-ok only)

Every `not-ok` carries one:

- **`fault`** — a hard failure: a bug, a broken server, or a request that did
  not come from our FE. Shown as a blocking modal, and may also appear on a form
  or a pill.
- **`race`** — the player lost a legitimate race. Usually a local feedback pill
  in a game. (XXX: i suspect all races will be about games)
- **`form-validation`** — the form is invalid, and the message belongs under the
  control it is about. The only severity that names a `field`.
- **`service-error`** — something we depend on did not answer. NYT unreachable,
  the Guardian timing out, a pasted cookie the site no longer accepts. Nobody's
  fault in either direction; it reads as "try again later", not as a bug.

**`service-error` is not a catchall.** A catchall severity is where
classification goes to die — the next ambiguous case lands there instead of
being decided.

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

**The default is resolved in `dbResult`, once.** Not in SQL, which would repeat
it at every raise and mean editing all of them to change it; not at the call
site, which is the same problem one layer up. One function maps severity to its
default and fills in `outcome` where the server left it null, and `runRpc`,
`runEdgeFn` and `readRows` all pass through it.

One consequence worth knowing: the envelope a caller reads is then not identical
to the one the server sent. **The `[db]` line logs what ARRIVED**, before
normalization — so a blank `outcome=` beside an orange pill is explained by that
one function rather than being a mystery.

`outcome` stays nullable on the not-ok arm for now. We do not yet know that
every refusal will have one; it can be tightened later.

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
| `severity` | not-ok | what kind of refusal |
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
returns a refusal directly — which is what lets a helper deep in a call stack
refuse while the RPC at the boundary still answers in one shape.

**The SQLSTATE says which branch.** `PA###` produces an `ok`; `PN###` produces a
`not-ok`. Digits are allocated max+1 and never reused, so a gap means a raise
was deleted and its code is retired. `src/guards/raiseCodes.test.ts` reads the
SQL and the edge functions together, since both draw from one sequence.

**Each `RAISE` clause carries exactly one thing:**

| clause | becomes | notes |
|---|---|---|
| `errcode` | `dbcode`, and the branch | `PA` / `PN` |
| `message` | `message` | the player's sentence |
| `hint` | `outcome` (PA) or `severity` (PN) | disjoint vocabularies, so one channel is unambiguous |
| `column` | `field` | `'_'` for "not one field" |
| `detail` | `detail` | for the log, never the player |

`constraint` is free and survives `get stacked diagnostics` — the channel to
reach for if a raise ever needs to carry a sixth thing.

**Every RPC ends with the same handler**, which knows about no specific
condition. It reads the SQLSTATE, re-raises anything that is not ours, and lets
the raise itself carry the message, the kind and the field:

```sql
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
```

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
carry two unrelated jobs, and the frontend can no longer tell a refusal it
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
