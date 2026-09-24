# Envelopes

Every RPC, every table read and every edge function answers in one shape, the
**envelope** — and so does every failure that never reached a server, because
the frontend builds one in the same shape when nothing answered. A caller
always has one thing to read. This is the introduction: what an envelope says,
the judgment each answer takes (ok or not, race or fault, who writes the
sentence), how a call site reads one, and how SQL writes one. The machinery
lives in [`common/supabase`](../src/common/supabase/doc.md) and
`supabase/functions/_shared/`; the outcome words are [outcomes.md](outcomes.md).

## Consumers

Every call to a server goes through one of four wrappers, each handing back an
`Envelope`, so no call site touches a raw response:

| direction | wrapper | where |
|---|---|---|
| frontend → RPC | `runRpc` | `src/common/supabase/dbResult.ts` |
| frontend → table read | `readRows` | same |
| frontend → edge function | `runEdgeFn` | same |
| edge function → RPC | `runRpc` | `supabase/functions/_shared/dbResult.ts` |

`dbCallWrapped.test.ts` keeps a fifth path from appearing — a raw `.rpc()`
reads `error` off an answer that refuses with HTTP 200, so the refusal reads as
success. `runRpc` takes an RPC and `readRows` a query, and crossing them is a
bug either way (`dbCallShape.test.ts`).

**A read never refuses.** It has no move to judge: its answer is rows, or a
fault. **Zero rows is `ok`** — only the caller knows whether it should have
found something. **Realtime is outside all this** — nobody called anything —
but it is what makes races possible: the frontend's gates are built on state
realtime delivered, and the gap before it arrives is exactly when a race
happens.

## Envelope type: ok | not-ok

A `not-ok` is a failure, and "failure" is narrower than it sounds:

| | |
|---|---|
| a losing move | **not** a failure — a wrong guess is the game working |
| a reasonable move refused by the game's rules ("FOOZLE: not a word") | **not** a failure |
| a legitimate race | a failure |
| something the frontend would have caught | a failure |
| an invalid form | a failure |

**The question is "was anything local consulted first?"** A rule only the
server knows produces a verdict: the move really reached the server, and the
answer is `ok`. A rule the client also enforces produces a race or a fault when
the server sees it, because the move should never have been sent. So the same
word can land on either side, and the frontend decides which: strands ships no
word list, so its "duplicate" is an `ok`; the word games dedup locally before
submitting, so theirs reaches the server only when the local list was stale,
and it is a race.

**If a caller has to clean up after an `ok`, the `ok` is probably a refusal.**
*Did this record anything?* separates the two arms better than *was the player
at fault?*

### What makes a race legitimate

A legitimate race is neither the player's fault nor a bug: two players acted at
once and only one could be taken. **The test is where the frontend learns the
move landed:**

| the gate is released by | window | so |
|---|---|---|
| the RPC's own response | none — the surface is locked until it returns | a **fault**: you could not have got here without a bug |
| **another player's** action, arriving by subscription | open, and not yours to close | a **race** |
| your own row arriving by subscription | none, and held longer than the round trip | a **fault** |

The third is easy to misread as the second: wordle's guess gate clears when the
guess's row arrives by realtime, so the board stays locked past the response,
and running out of your own budget is unreachable without a broken client. **A
classification may differ by mode** — written as two raises in an `if/else` —
**but check each half can run at all**: the mode that shares a thing is often
the mode that ends on it, so its "race" is dead code.

Connections' `submit_guess` has most of the kinds:

| raise | kind | why |
|---|---|---|
| PN485 "That game was already deleted" | race | a friend deleted it while the guess was in flight |
| PN245 "Game over" | race | a teammate ended it while the guess was in flight |
| PN246 "Already conceded" | race | your concede landed first; your client hadn't heard |
| PN251 "Out of mistakes" | race | your own fourth mistake landed; the row saying so hadn't |
| PN243 "Not your turn" | race | the turn moved on |
| PN247 "BUG: guess that was not four tiles" | fault | the board only ever selects four |
| PN248 "BUG: unknown guess result" | fault | the result comes from the frontend's own evaluator |

## Outcome

An **outcome** is the verdict on a move: `won`, `lost`, `near`, `warning`,
`neutral`, `noted` ([outcomes.md](outcomes.md)). An `ok` often carries one, and
it colors the pill and the event log. **A `not-ok` can carry one too**, which
is what lets a failure read calm or loud independently of how bad it is.

## Severity

Every `not-ok` says what kind of failure it is:

- **`fault`** — a bug, a broken server, or a request that did not come from our
  frontend. A blocking modal.
- **`race`** — the player lost a legitimate race. So far every race is in a
  game: a race needs shared state changing underneath you, and a form's values
  are yours alone. One on a form is worth looking at twice.
- **`form-validation`** — the form is invalid, and the sentence goes under the
  control it is about. The only severity that names a field by nature.
- **`service-error`** — something we depend on did not answer (NYT down, a
  pasted cookie no longer accepted). Not a catch-all: a catch-all is where
  classification goes to die.

### Appearance

A severity has a default look; an outcome on the raise overrides it.

| severity | default | reads as |
|---|---|---|
| `fault` | `error` (red) | something is broken |
| `form-validation` | `error` | fix this and try again |
| `service-error` | `error` | not us, not you — try later |
| `race` | `warning` (orange) | we're not taking it, and you should notice |

The default is resolved once, in `notOkOutcome`, and never written back into
the envelope — so a not-ok's `outcome` keeps one meaning: *the author overrode
the default*.

## Who writes the words

Asked of each answer an RPC can give:

1. **`data` carries the fact**, structurally, whether or not a sentence goes
   with it — the frontend has uses for it beyond words (a shake, a counter).
2. **Where the server can write the sentence, it does**, once, where the
   decision was made. A raise's message is the player's sentence.
3. **`message: null` means the frontend composes it** — a signal, not a gap —
   for a sentence that needs what only the frontend has: a player's name
   beside their color dot, a link, local state. **A server-written message may
   not say less than the sentence it replaces**; if the honest server version
   is a downgrade, the message stays null.

**A message always comes with an outcome**, so no call site guesses how it
reads. The `ok` type is two shapes (a message and an `Outcome`, or none and
perhaps an outcome), the guard refuses an `ok_envelope` with words and no
outcome, and the wrappers fault on one at runtime.

**A fault says what reached the server, not the rule.** "BUG: guess that was
not four tiles", not "A guess must be four tiles": the player cannot have
broken that rule, so reciting it reads as *you did something wrong* when the
truth is *we did*. A fault about a state rather than an input ("You are not in
this game") is said plainly.

**`field` is independent of severity**: severity says what kind of failure it
is, field says what the sentence is about. A fault about the timer names
`timer` and lands under the timer section after the modal. `'_'` means
"deliberately not one field" — the form's own line.

## The keys

**Every key is present on every envelope**, null when it has nothing to say, so
a key added later is a compile error at every builder rather than a silent
omission. The type is `src/common/supabase/envelope.ts`.

| key | on | holds |
|---|---|---|
| `type` | both | `ok` \| `not-ok` |
| `data` | ok | the payload |
| `outcome` | both | how it reads |
| `severity` | not-ok | what kind of not-ok |
| `message` | both | the player's sentence |
| `field` | not-ok | which control the sentence is about |
| `meta` | both | an additive slot SQL can use with no frontend change |
| `dbcode` | both | which answer this is — a `PA`/`PN` raise, or an `FE`/`PN` code the frontend built |
| `detail` | both | the debugging line, never the player's sentence |

**The codes.** A `PA###` raise becomes an `ok`, a `PN###` raise a `not-ok`; the
`P` keeps them apart from Postgres's own classes, and we never reuse a Postgres
code. The digits encode nothing; a code is unique per raise **site**, so a code
in a bug report leads to one line — except a shared helper, whose one code
answers one question asked from many places. `FE001`–`FE004` are the
frontend's for "our server did not answer" (`common/supabase/doc.md`). The
next free number of each class is printed by `raiseCodes.test.ts`.

## What a caller does with one

### The shape of a call site

**Every RPC call is a branch chain: one branch per answer, each a positive
assertion about that answer, each ending in `return`, and a bare `else` that
screams.**

```ts
const res = await runRpc<WordAnswer>(db.rpc('submit_word', { … }))

if (res.type === 'not-ok') {
  clearWord()
  localFeedbackSlot.show(FeedbackMessage.notOk(res))
  return
} else if (res.type === 'ok' && res.data.result === 'accepted') {
  commitWord(tileIds)
  return
} else if (res.type === 'ok' && res.data.result === 'invalid' && res.message !== null) {
  clearWord()
  localFeedbackSlot.show(FeedbackMessage.result(res.outcome, res.message))
  return
} else {
  reportUnhandled('submit_word', res)
  return
}
```

**Why:** an envelope is a wire format from another system, and the `Envelope`
type is our claim about what arrives, not a constraint on what can. The
compiler covers the side that *builds* envelopes, not the side that reads them:
add an answer tomorrow and a negated test (`res.type !== 'ok'`) or a statement
after the chain will quietly run it as something it isn't. The scream is the
exhaustiveness check the compiler can't do, run in production, and it is the
only thing that turns "the server changed and nobody told the frontend" into
something a person sees.

The rules:

- **Branch positively**: `=== 'not-ok'`, never `!== 'ok'`.
- **Every branch ends in `return`, and nothing follows the chain.**
  `allowUnreachableCode: false` then makes a stray statement a build error
  (TS7027). The last `return`s look redundant and are load-bearing.
- **Work several answers need is a named function each calls**, with explicit
  parameters — never a statement they all fall into.
- **The bare `else` only screams**: `reportUnhandled(<rpc>, res)` (PN488), even
  when you're sure it can't happen — that is the claim that rots.
- **The not-ok branch is one line**: `FeedbackMessage.notOk(res)`, plus whatever
  the surface has to undo. Every severity is shown there, fault included — the
  modal is an escalation, not a replacement, so dismissing it must not leave a
  form looking fine.
- **A cancel guard (`if (!mounted) return`) goes above the chain**, or a page
  renders a failure for its own cleanup.
- **A site with no surface at all** (a timer-driven heal, an unmount cleanup)
  names the severity it accepts — `res.type === 'not-ok' && res.severity ===
  'fault'` — so a race added later reaches the scream instead of the log.

`callSiteShape.test.ts` and `dbCallShape.test.ts` enforce the shape.

### Choosing which `ok` branch

**Every `ok` branch states its arm**: `res.type === 'ok' && <the case>`, never
just the case — otherwise narrowing an earlier not-ok branch silently sends
not-oks into it, where `data` is null. **Branch on `data`, or on `dbcode`** —
never on `message` or `outcome`, which several cases share. **Test equality
against a specific value, never against null**: `res.data === null` names an
absence, and the next wordless answer matches it too. **No branch matches merely
by being `ok`**, even when there is one `ok` today. **Never guess a sentence or
a look** (`res.outcome ?? 'lost'`): inside a branch that named its case, what
the server sends is a known fact. If `data` can't tell two cases apart, add
something to `data` that can.

### Presenting a fault is not a call site's job

**The layer that holds the answer shows the modal**: the three frontend
wrappers, for every fault, since only they have the transport facts the
diagnostics line needs. A call site that wants to handle its own passes
`{ presentFaults: false }`, which means *I will show my own*, never *drop it*.
The mechanics are [`common/supabase`](../src/common/supabase/doc.md).

## How SQL builds one

**An RPC raises, and catches its own raise.** Nothing returns a `not-ok`
directly, which is what lets a shared helper raise from deep in a call stack
while the RPC at the boundary still answers in one shape. Every RPC ends with
the same handler, which knows no specific condition:

```sql
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
```

Anything not ours re-raises and reaches the client in Postgres's own shape — a
raw fault. **Each clause of a raise carries one thing:**

| clause | becomes | notes |
|---|---|---|
| `errcode` | `dbcode`, and the arm | `PA` or `PN`, a bare literal |
| `message` | `message` | the player's sentence |
| `hint` | `outcome` (PA) or `severity` (PN) | the two vocabularies don't overlap |
| `column` | `field` | `'_'` for "not one field" |
| `detail` | `detail` | never the player's sentence |
| `constraint` | `outcome`, on a not-ok | the look override; omit it for the severity's default |

- **A handler that omits `v_out` drops the override silently** — the pill just
  wears the default. And a helper that raises with a constraint has no handler
  of its own, so whichever caller catches must read it back.
- **A race that is news rather than a setback** ("Game over", "Already
  conceded") takes `constraint = 'noted'`.
- **Errcodes stay bare literals**, so a classification that differs by mode is
  two raises in an `if/else`, never a `case`.
- **A function that never raises still returns an envelope**
  (`common.ok_envelope`, with a `data` that names the answer — never with no
  arguments), so the call shape doesn't depend on whether it raises today.
- **Order the checks so the truest sentence wins.** **A missing game row is
  PN485**, the shared race from `common._raise_game_deleted`, in every game RPC
  that looks for one, the moves included — and asked BEFORE membership, since a
  delete takes the membership rows with it and would otherwise answer "You are
  not in this game" (`gameDeletedFirst.test.ts`).

`raiseCodes.test.ts` reads the SQL and the edge functions together: every raise
has a well-formed code, used once; the hints match the TypeScript vocabularies;
a form-validation names a column; a fault's message opens `BUG:` unless it
describes a state; a constraint written is read back by its handler, walking
out from helpers to their callers; and no `ok_envelope` has words without an
outcome.

## How edge functions build one

**An edge function answers HTTP 200 whenever it ran**, faults included: the
status says whether the function RAN, the envelope what it decided. Where it
calls an RPC it relays that envelope untouched, so a sentence written in a SQL
raise reaches the player in its own words. The builders are
`supabase/functions/_shared/envelope.ts`, typed against the same `Envelope`;
reading an RPC's answer inside a function is `_shared/dbResult.ts`.
