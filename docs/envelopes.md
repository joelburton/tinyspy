# Envelopes

**This describes what the code does today.** The convention is fully rolled out:
every RPC, every read and every edge function answers in this shape, and
[`dbCallWrapped.test.ts`](../src/guards/dbCallWrapped.test.ts) is what stops a
new call site from skipping it.

Every Supabase RPC, every Edge Function, and everything we treat like one
answers in a single shape. "Everything we treat like one" includes failures that
never reached a server at all — we build the same envelope for "couldn't reach
the server", so a caller has one thing to read no matter what happened.

This file is the canonical place for these decisions, and the only one:
**the conversion finished on 2026-09-01** — every RPC, every read, every edge
function. Its durable lessons are folded in below (→ [Four things the roster
conversion taught](#four-things-the-roster-conversion-taught)).
[`plans/error-system.md`](../plans/error-system.md) is still there and holds the
sprint's own record — the per-area roster and how each conversion went. **This
file outranks it** wherever they disagree: the plan describes the work, and this
describes the result.

The vocabulary here is the vocabulary in the code: all four severities, `race`
included, are spelled as written here in TypeScript, in SQL's hints, in the Deno
builders and in the guard. The default-appearance resolution lives in
`notOkOutcome` (a severity's default, overridable per raise), the not-ok arm
carries `outcome: Outcome | null`, `getNotOkFeedback` has 29 call sites, and
raises do classify themselves as `race` — the four word games' duplicates are
PN359/PN360/PN361/PN365.

## Consumers

**Four directions, four wrappers.** Every call to a server in this app goes
through one of them, and each hands back the same `Envelope`, so no call site
touches a raw response:

| direction | wrapper | where |
|---|---|---|
| frontend → RPC | `runRpc` | `src/common/lib/supabase/dbResult.ts` |
| frontend → table read | `readRows` | same |
| frontend → edge function | `runEdgeFn` | same |
| edge function → RPC | `runRpc` | `supabase/functions/_shared/dbResult.ts` |

The fourth is a separate implementation rather than an import: the frontend's
reaches the browser client and the fault-modal store, neither of which exists in
Deno. It is described under [How edge functions RECEIVE
one](#how-edge-functions-receive-one).
[`dbCallWrapped.test.ts`](../src/guards/dbCallWrapped.test.ts) is what keeps a
fifth path from appearing — a raw `.rpc()` reads `error` off an answer that
refuses with HTTP 200, so the refusal reads as success.

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

**`runRpc` takes an RPC and `readRows` takes a query, and crossing them is a
bug in both directions.** The wrappers look interchangeable and are not: one
receives an envelope an author wrote, the other builds one around rows nobody
authored. An envelope read as rows lands inside `data`, where its `type` and
`severity` are invisible; rows read as an envelope are unreadable.

The compiler catches only half of it — `readRows` demands an array, so an RPC
fails to compile, while `runRpc`'s parameter is `data: unknown` and accepts
anything. **And it cannot be made to catch the rest**: our RPCs generate as
`Returns: Json`, which already includes arrays, so a parameter type narrow
enough to reject a query rejects every RPC we have (measured 2026-08-29). Hence
two mechanisms instead: `src/guards/dbCallShape.test.ts` reads every call site
and asserts the builder matches its wrapper, and each wrapper faults at runtime
on the other's answer.

## Envelope type: ok | not-ok

A `not-ok` is a failure — but "failure" is a broad word, so:

| | |
|---|---|
| a losing move | **not** a failure — connections' wrong guess is the game working |
| a reasonable move refused for ordinary reasons | **not** a failure — "FOOZLE: not a word" |
| a legitimate race | a failure |
| something the FE would have caught | a failure |
| an invalid form | a failure |

**The yardstick for the second row: a game-rule refusal is `ok` — if the rule
was applied to a move that HAPPENED.** strands refusing a duplicate path is the
game's rules being applied: nothing local was consulted first, the move really
reached the server, and the answer is a verdict on it. Submitting when it is not
your turn does not meet that bar — no rule of the game was consulted, and the
move should never have been sent.

**The same word can fall on either side, and the frontend decides which.**
strands ships no word list to the client and does not gate on
`min_word_length`, so its `duplicate`, `too_short` and `invalid` are all `ok`.
The four word games are the mirror image: `useWordSubmit` dedups locally against
`foundWords` plus a synchronous `pendingRef` and returns *before* calling
`commit`, so the server's duplicate branch is reachable ONLY when that list was
stale — a teammate found the word between the render and the submit, or the
caller's own row had not landed. Nothing is recorded, so it refuses, and it is a
race by the test below: **boggle PN359, spellingbee PN360, wordwheel PN361,
wordiply PN365** (Joel, 2026-09-01).

psychicnum makes the same choice deliberately and documents it: its board does
not check for a repeated guess, so "already guessed" is reached by ordinary
typing and answers `PA002` — an `ok` in `warning`.

So the question is not "is this a rule of the game?" but **"was anything local
consulted first?"** A rule the client also enforces produces a race when the
server sees it; a rule only the server knows produces a verdict. It is a
frontend decision as much as a SQL one, which is why the same word is an `ok` in
one game and a `not-ok` in another.

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

### The shape of a call site

#### Why these rules exist, before the rules

**An envelope is a wire format from another system, not a value this codebase
constructs** (Joel, 2026-08-29). Postgres composes it and PostgREST carries it.
The `Envelope` union is our CLAIM about what arrives — it is not a constraint on
what can. Every rule below is about staying correct on the day the claim goes
stale, and none of them is a style preference.

**The type system covers the wrong half.** Say a third member is added —
`maybe`. That is a compile error everywhere an envelope is PRODUCED
exhaustively: the Deno builders, a total `Record<Severity, …>`, anything the
compiler can see must cover every case. It is not an error anywhere one is
CONSUMED by negation. `res.type !== 'ok'` still compiles and still narrows
cleanly — it narrows a `maybe` into the not-ok branch and shows the player a
refusal. A statement after the chain still runs. Nothing goes red. All 146 call
sites are consumers, so the entire blast radius sits on the side the compiler
does not cover.

**The goal, as a metaphor: an exhaustive `when`.** Kotlin will not compile a
`when` over a sealed type that misses a variant, and adding a variant turns every
such `when` red. That is the guarantee this chain is hand-rolling — the metaphor
is Joel's, and it is a statement of the END, not a claim that we are switching on
an enum (2026-08-29). Naming what we cannot have says precisely what the shape is
substituting for.

TypeScript has the compile-time half of it. A `const _exhaustive: never = res` in
the `else` goes red the day the union grows a member, which IS the Kotlin
behavior. It cannot reach these chains, for two reasons, and both of them are the
argument for the scream:

- **The set is open at runtime.** Kotlin's check is sound because a sealed type
  is closed — no value outside the set can exist. Ours arrives over a wire from
  another system, so any compile-time proof is a proof about our declaration, not
  about what a player will receive.
- **Our cases are not variants.** Past `res.type === 'ok'` the branches split on
  `res.data.result === 'claimed'` — a VALUE INSIDE the payload. That narrows
  nothing toward `never`, so the assignment would not even compile; and where it
  did, it would be checking a `'claimed'` we declared against a wire that can
  carry any string. No language checks that exhaustively.

So we are two steps from the compiler, not one, and the `else` has to be a
RUNTIME branch that does something visible. A sealed `when` needs no else because
the compiler already proved there is nothing to catch. Ours needs one because
nothing proved anything: the scream is the exhaustiveness check, run a year
later, in production, by a player.

**And the net that would catch it is what that edit removes.** `isEnvelope`
(`dbResult.ts`) returns true for exactly two strings, so a third type arriving
today becomes *"The server answered with an unreadable result."* — loud, central,
one modal. Whoever adds `maybe` widens that check in the same commit as the
union, because otherwise their new answer never reaches a call site at all. That
one edit flips every consumer's behavior at once, and silently.

So the rules below are one rule wearing several hats. Asking `=== 'not-ok'` is
what stops an unrecognized type being drawn as a refusal. Asking `res.type ===
'ok' && <case>` is what stops a `maybe` carrying an ok-shaped `data` from sailing
into an ok branch. The bare `else`, with no work stranded after the chain, is
what turns the change into 146 visible events instead of zero. **The scream is
not defensive ceremony — it is the only construct here that converts "the server
changed and nobody told the frontend" into something a human sees.**

#### The shape

**One branch per answer the RPC can give, each condition a positive assertion
about that answer, and a bare `else` that screams.**

```ts
const res = await runRpc<WordAnswer>(db.rpc('submit_word', { … }))

if (res.type === 'not-ok') {
  clearWord()
  showMsg({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
  return
} else if (res.type === 'ok' && res.data.result === 'accepted') {
  commitWord(tileIds)
  showFlash([...res.data.word.toUpperCase()], 'won')
  return
} else if (res.type === 'ok' && res.data.result === 'invalid' && res.message !== null) {
  clearWord()
  showMsg({ tone: res.outcome, text: res.message, mode: { kind: 'sticky' } })
  return
} else {
  reportUnhandled('submit_word', res)
  return
}
// Nothing may follow. `allowUnreachableCode: false` makes anything here TS7027.
```

**EVERY RPC CALL IS A BRANCH CHAIN.** Not "should be shaped like one" — is one
(Joel, 2026-08-29). A guard clause, a bare statement after an `if`, a `?:` on the
result: all wrong on sight, before anyone reads a single condition, because a
call written that way has nowhere to put the answers it is not handling.

(**A guard clause is not the same thing as a branch that returns.** The rule
below says every branch of the chain ends in `return`; what is wrong here is
`if (res.type === 'not-ok') { … return }` followed by UNBRANCHED code — one
answer handled and exited, the rest of the function serving as an unnamed `else`
that no future answer can be kept out of. The shape is what distinguishes them,
not the keyword.)

This is
first because it is the only rule here that needs no judgment — every other one
below asks you to evaluate a condition, and this one asks you to look at a
shape.

It is stated this way because the alternative failed repeatedly. When the rule
described a shape rather than demanding it, code that did not already resemble
the shape — a guard clause, an inherited early-return sequence — never got held
up against it at all, and the rules were applied to the lines being rewritten
while the surrounding structure kept its silent fall-through.

**EVERY BRANCH ENDS IN `return`, AND NOTHING FOLLOWS THE CHAIN** (Joel,
2026-08-29). The chain is the last thing in the function. All the work an answer
causes lives inside that answer's branch.

The point is not tidiness — it is that this makes the rule a BUILD ERROR rather
than something a reviewer has to notice. With every branch returning, a statement
appended after the chain is unreachable, and `allowUnreachableCode: false` (set
in both tsconfigs) turns that into `TS7027: Unreachable code detected`. Written
the other way — no returns, a statement at the bottom — that same line is legal
code that quietly runs for every answer, including the ones added next year.

```ts
} else if (res.type === 'ok' && res.data.result === 'recorded') {
  if (next.length === CLAIM_SIZE) void submitClaim(next)   // only a recorded hint claims
  return
}
```

**The `return` in the last branch and in the scream is LOAD-BEARING, however
redundant it looks.** Nothing follows it, so it reads like noise and invites a
tidy-up — and deleting it disarms TS7027 at that site, silently, restoring the
exact hazard the rule exists to remove. Leave them.

**Work that several answers need becomes a named function each of them calls**,
never a statement at the bottom that they all fall into. **Give it explicit
parameters rather than closing over `res`**: it is defined outside the chain, so
it cannot see the narrowed arm anyway, and having to name what it takes is the
point. A trailing statement never has to say which answers it serves, which is
how it ends up serving one it was never meant to.

**And nothing downstream re-asks.** A helper the chain calls takes the NARROWED
arm as its parameter — `Extract<Envelope<T>, { type: 'not-ok' }>` — so there is
no second test to get backwards. A `if (res.type !== 'not-ok') return` inside
such a helper is the same defect one layer down, and it is easy to write because
it reads as a guard rather than as a question already answered.

**Branch positively, on exact things.** `res.type === 'not-ok'`, never
`res.type !== 'ok'`. A negated condition is a catch-all wearing a case's
clothes: it compiles, it narrows cleanly, and an answer that is neither `ok` nor
`not-ok` is shown to the player as a refusal. Naming the case you handle puts
anything else where it belongs, in the scream.

**There is always a bare `else`, and it only ever screams.** Not when the types
say it is unreachable, not when you have just read the RPC and know it cannot
happen — those are the claims that rot, and the whole job of this branch is to
be there on the day one of them stops being true.

**The scream is one call: `reportUnhandled(<rpc_name>, res)`** (`PN488`, from
`dbEnvelope.ts`). It writes the sentence — `BUG: <rpc_name> fell through to
unhandled` — logs a `[db]` line, and raises the modal with real diagnostics
under it. **Pass the answer, not just the name.** The useful fact about a
fall-through is what the server actually said, and `res` is what carries it;
`call` stays hand-written because an envelope does not know the name of the call
that produced it. For the same reason its `status=` is 200 for an `ok` — which
arrives 200 on every transport — and **blank for a `not-ok`**, whose HTTP
status the envelope does not carry: the one `[db]` line where a blank means
"not known here" rather than "nothing answered". The change that would make it
known is filed in [deferred.md](deferred.md#common--architecture).

Before it existed each site hand-wrote `showFaultModal({ text: … })`, and the
one fault category that always means a bug of OURS was the only one arriving
with no console trail and no diagnostics line — `runRpc` had already logged the
call as `OK`, because at the wire level it was. `src/guards/callSiteShape.test.ts`
now requires the helper, and that only `dbEnvelope.ts` writes the sentence.

**Do not contort anything to serve it.** It should be rare, it is a plain bug
when it fires, and the modal's `detail` carries enough to work out what
happened. If the branch would have to cast, or restructure the chain, or reach
into a value TypeScript has narrowed to `never`, don't: the cost of the ceremony
is paid at every call site, and the payoff is a line nobody will read anyway.

**The modal is the whole report. Anything beside it is the surface's own
unwind, and most surfaces need none** (Joel, 2026-08-29). Where a call site
does, it is the same obligation the `not-ok` branch has when it clears a
selection or releases a dim: state this answer has left mid-flight. In
`ClubPage.handleDelete` that is a `throw`, because `ClubGameDeleteButton` leaves
"Deleting…" only when the promise it awaited rejects — a fact about that button,
not about screaming. So **`throw` is not this branch's default shape**: reach
for one only when leaving the surface untouched would strand something, and
never as a second way of reporting, which is what the modal is for.

**No outer branch for "neither `ok` nor `not-ok`".** `runRpc` /
`runEdgeFn` / `readRows` have already turned that into a fault envelope —
`isEnvelope` accepts only those two — so a call site's outer `else` is
unreachable by construction and would be ceremony repeated 146 times. The scream
at the end of the chain covers it.

### Choosing which `ok` branch

**Every one of these branches states its arm: `res.type === 'ok' && <the
case>`.** The chain opens with `res.type === 'ok'` and never merely inherits it
(Joel, 2026-08-29).

It is redundant to the compiler, and that is not what it is for. An `ok` branch
that tests only `res.data.result === 'saved'` is asserting a case while
*assuming* an arm — and the assumption is that some earlier branch already took
every `not-ok` away. That holds until someone edits an earlier branch. Narrow the
`not-ok` arm by anything (`res.type === 'not-ok' && res.severity === 'fault'` is
a real shape and already in the repo, at `ClubPage.tsx`), and every later branch
silently starts receiving `not-ok`s — where `res.data` is null by construction,
so the reads below it throw rather than reaching the scream.

The failure is worse than a wrong pill, because it is not a rendering bug:

```ts
} else if (res.data.result === 'added') {   // TypeError on a not-ok that got this far
} else if (res.type === 'ok' && res.data.result === 'added') {   // reaches the scream
```

The same argument the `!== 'ok'` rule makes one level up, arriving one level
down: **a branch says which case it is, and a case is an arm plus a value.**

**Never test `message` to decide which `ok` case you are in.** That asks about
the wire, not about the game — a reader has to deduce "there were words, so it
must have been the rejection", which is a deduction the code should not be
asking for, and two worded cases collapse into one branch the day the second
arrives.

**Never use `outcome` either.** Several cases legitimately share one — two
different refusals both read `lost` — so it identifies nothing.

**Branch on `data`, or on `dbcode`.** And **if `data` cannot tell the cases
apart, add something to `data` that can.** The payload is where the case lives;
making it legible is the RPC's job, not a puzzle for the call site.

**The test must be equality against a specific value — never against `null` or
`undefined`.** `res.dbcode === null` and `res.data === null` look like they name
a case, and they name an *absence*: the answer that happens to have nothing in
that slot today. Add a second wordless `ok` and it matches too, is drawn as the
first, and nothing fails (Joel, 2026-08-29). The negated forms (`!== null`,
`?? …`, a truthiness check) are the same defect wearing different clothes. So
`res.data?.result === 'cleared'` is a case; `res.dbcode === null` is a catch-all
that has learned to sit in the middle of the chain — and the chain already has
somewhere for anything unnamed to go, which screams.

A raise is the one place where `dbcode` carries the name, because
`common.raised_envelope` always builds `data: null` — so an RPC whose `ok`s
include both a raised one and a returned one names the raised one by its
`PA###` and the returned one by its payload. Two keys, two cases, neither of
them an absence.

**No just-matching `ok` branch.** Even when an RPC has exactly one `ok` answer
today, assert what that answer *is*. A branch that matches merely by being
`ok` swallows the second `ok` silently on the day it is added, and produces a
bug that is invisible in review: nothing changed at the call site, and the new
case is quietly rendered as the old one.

**Never guess a tone or a sentence.** `res.outcome ?? 'lost'` and
`res.message ?? ''` are the tell that the branch is wrong: inside a branch that
has named its case, what the server sends for that case is a known fact. A
guessed outcome turns a server bug into a pill nobody questions.

**Keep an assertion that completes the case's contract, even when it is
technically redundant.** `res.data.result === 'invalid' && res.message !== null`
states the whole of what that answer promises — this case, *with* its sentence —
where `result` alone states half. TypeScript needs the second half anyway (the
`ok` arm is two shapes and it discriminates on `message`), but the reason to
keep it is the failure mode: if the RPC ever stops sending the sentence, the
branch does not match, and the answer reaches the scream instead of rendering a
pill with a hole in it. This is the one place `message` may be tested, and it
tests it as an assertion — never as the thing that picks the case.

**Do not move words out of the server to dodge a typing problem.** If reading a
server-written message is awkward at the call site, that is a question about the
types, not a reason to make the surface compose a sentence the RPC already
knows how to write (→ [Who writes the words](#who-writes-the-words-per-answer)).

### The cancel guard comes FIRST

**Where a call site has an `if (!mounted) return` — or a generation check — it
belongs above the branch chain, not inside it.** The reason is one specific
answer: an `AbortError`. When a component unmounts mid-flight and cancels its
own request, the wrapper still hands back a `not-ok`, because from its side a
request that never completed is a failure like any other. (Nothing in `src/`
aborts a request today — `nothingAnswered`'s docstring records that as a known
limit — but the ordering is right whether or not it ever does.)

So a chain that asks `type` before it asks whether anyone is still listening
renders a failure for its own cleanup: a page that says "Could not load this
club" because you navigated away from it. Ordering the guard first is the whole
fix, and it is worth checking at every site rather than assuming — the two
lines look independent and are not (Joel, 2026-08-29).

### The `not-ok` branch is one line

It is a mapping, and the mapping is shared, so this branch rarely holds an `if`
at all: `getNotOkFeedback(res)` plus whatever the surface has to undo — the
selection cleared, the dim released. A call site that finds itself branching on
`severity` or `dbcode` here should check that what it wants is not already in
the mapping (→ [The mapping](#the-mapping)).

### The rare site with NO surface at all

**First: almost nothing qualifies.** A form has an error line, a board has a
pill, a page has its own failure state — and all of them write `res.message`
there whatever the severity says, because the modal is dismissable and that line
is what remains (→ [the modal is an
ESCALATION](#but-the-surface-still-shows-it--the-modal-is-an-escalation-not-a-replacement)).
Reaching for the pattern below because a surface is *awkward* is the mistake it
is easiest to make; the answer there is to give the surface a way to say it.
`SetupBodyProps` gained a `setError` for exactly that reason, on 2026-08-29,
rather than let a setup body keep quiet about a failed load.

A couple of sites genuinely have nowhere: `ClubPage`'s presence heal, which
fires on a 2.5-second timer with nobody having asked for it, and
`useCommonGame`'s last-viewer-leave, which runs in an effect cleanup on a tab
that is leaving. Those log — and because a bare `not-ok` → log-and-move-on would
swallow a race or a validation added later, they **name the severity they are
accounting for**:

```ts
if (res.type === 'not-ok' && res.severity === 'fault') {
  console.error('heal unset_current_view failed', res.message)
} else if (…) {
  …
} else {
  reportUnhandled('unset_current_view', res)
}
```

`fault` is the one severity a site with no surface may leave to the modal;
everything else reaches the scream, which is loud and greppable. **A site that
gains a surface drops the assertion** and goes back to the one-line mapping.

### Presenting a fault is not a call site's job

**One rule, and everything else here follows from it: the layer that HOLDS the
answer is the layer that shows the modal.** That is the three wrappers —
`runRpc`, `readRows`, `runEdgeFn` — for every fault, whatever built it. Never a
call site, and **never `dbFetch`**, which classifies and logs but shows nothing.

The diagnostics line is why a call site cannot: it is built from **transport**
facts — the call, the HTTP status, the elapsed milliseconds — that no envelope
carries and no call site has. A call site raising its own modal can only produce
a worse copy of one that already fired.

`dbFetch` is excluded for the opposite reason: **all it knows is the URL.** The
only rule it can express is *"calls to this path never show a modal"*, which is
all-or-nothing per endpoint. The case that broke it was `useGameTimer`, which
polls once a second and wants quiet when the network dropped but a modal when
the player is signed out — one call, two treatments, decided by what came back.
To `dbFetch` both are "a request to `tick_timer` failed".

So the split is by what a layer can see, and it was measured rather than assumed
(against postgrest-js and functions-js, 2026-09-01). **Only `dbFetch` knows two
things**: whether the response body PARSED — postgrest-js flattens a parsed body
and an unparseable one into the same `{ message }`, so Kong's JSON and a captive
portal's HTML are structurally identical by the time a wrapper sees them — and
the thrown error's `name`, which is what tells an abort from a real network
failure. It carries the first forward in `statusText`, the one field that
survives postgrest-js untouched. Everything else a wrapper can get for itself:
the elapsed ms (it times itself), `navigator.onLine` and `document.visibilityState`
(globals), the path (off the query builder's own `url`), and the status
(postgrest-js forwards it).

### Opting out: `presentFaults`

A call site that wants to handle its own faults passes `{ presentFaults: false }`
to any of the three wrappers:

```ts
runRpc<Ticked>(commonDb.rpc('tick_timer', …), { presentFaults: false })
```

**Default-on is what makes forgetting impossible** — a call site that ignores its
result entirely still surfaces the failure. And unlike a path string in another
file, an opt-out is visible at the call, typed, and cannot be aimed at the wrong
endpoint.

**It means *I will show my own*, never *drop it*.** `useGameTimer` is the model:
silent for the four `FE` codes on purpose, and it calls `showFaultModal` itself
for `PN011`/`PN012`. `src/guards/callSiteShape.test.ts` enforces the promise at
file level — a file containing `presentFaults: false` must also contain a
`showFaultModal` or a `console.error`. The wrapper writes the `[db]` line either
way, so an opt-out that shows nothing is not silent in the console; it is silent
to the player, which is the thing a diff cannot show you.

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
boards after it. Letting each derive its own is exactly the drift one shared mapping exists to
prevent.

`genericPills.ts` rather than `localPills.ts`: a **local** pill is specifically
the below-board one, about this player. This mapping serves global pills too, so
it does not belong in a file whose docstring says otherwise.

**`mode` stays at the call site** — permanence is about the surface, not about
the answer — so the function returns the message minus its mode:

```ts
if (res.type === 'not-ok') {
  showLocalFeedback({ ...getNotOkFeedback(res), mode: { kind: 'manual' } })
  return
}
```

**There is no equivalent for `ok`, deliberately.** What pill a successful answer
shows is game-specific — a pangram's score, a word's length, nothing at all —
and we do not know whether rules exist there yet. Better an honest gap than a
shared helper guessing at one.

And a helper is the wrong shape besides. Anything shared could only ask the
envelope what it happens to contain — "is there a message?" — which is exactly
the question a call site must not ask (→ [Choosing which `ok`
branch](#choosing-which-ok-branch)). Which `ok` case this is, is knowledge the
call site has and a helper does not.

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

**A message therefore REQUIRES an outcome, and the pair is enforced four ways.**
The outcome is how the message reads; without one a call site has nothing to do
but guess, and a guess turns a server bug into a pill nobody questions — the
frontend is supposed to know every answer an RPC can give.

1. **The TYPE says it.** The `ok` arm is two shapes, not one: `{ message:
   string; outcome: Outcome }` or `{ message: null; outcome: Outcome | null }`.
   So `if (res.message !== null)` narrows to the first, and `res.outcome` is an
   `Outcome` with **no second test and no default** — which is the point. The
   bad shape is a compile error at every place that builds one.
2. Every `PA` raise must carry a HINT from the outcome vocabulary.
3. `src/guards/raiseCodes.test.ts` refuses a `common.ok_envelope` built with a
   message and no outcome.
4. `runRpc` / `runEdgeFn` **fault** on the pair at runtime — for an edge
   function's literal, or anything hand-built, which neither guard can see.

Call sites do not default. If one is tempted to, the answer is wrong somewhere
further up.

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
| `dbcode` | both | **which answer this is** — a SQLSTATE when a raise produced it, an `FE`/`PN` code when the frontend built the envelope |
| `detail` | both | the debugging line — **never the player's sentence**; it reaches the screen only as the muted diagnostics under the message |

**The message is written at the raise, by the RPC author.** This is the decision
the whole convention rests on: whoever knows why the answer is what it is writes
the sentence, once, where the decision was made. The frontend does not rebuild
it from a key.

### A fault says what REACHED THE SERVER, not what the rule is

A fault means the frontend let something through that it prevents. So the
sentence says that, in the form ~100 raises across every `create_game` already
use:

> "BUG: game with no players"
> "BUG: board with a repeated letter"
> "BUG: guess that was not four tiles"

**Not** "A guess must be four tiles." That recites a rule at someone who cannot
have broken it — the board only ever selects four — so it reads as *you did
something wrong* when the truth is *we did*. It also sends the player off to fix
their own behavior, which will not help, instead of telling them the app is
broken, which is the one useful thing a fault modal can say. The distinction is
audible in a bug report: "it said I must guess four tiles" sounds like a player
misunderstanding the game; "it said a guess that was not four tiles reached the
server" sounds like a bug, which it is.

**The exception is a fault about a STATE rather than an input.** "That game no
longer exists", "You are not in this game", "No guesses left", "Already solved"
describe a condition, not something malformed that arrived — the idiom does not
fit and the plain sentence is right.

This was precedent and nothing else until 2026-08-29, which is exactly why the
first four move RPCs converted broke it seven times without anyone noticing.

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

**`return common.ok_envelope()` — with no arguments — is a defect, and a loud
one to grep for.** It answers `ok` while saying nothing about *which* `ok`, so
the only thing left for a call site to test is what the envelope does not have
(→ [Choosing which `ok` branch](#choosing-which-ok-branch)). Give the answer a
`data` that names it — `jsonb_build_object('result', 'cleared')` — even when
the RPC has exactly one `ok` today, and especially when it also raises a `PA`,
because then there are already two. The argument is the same one the no-just-
matching-`ok` rule makes on the frontend, arriving one layer earlier: the day a
second answer lands, the naming is what stops it being drawn as the first.

**A typed caller can tell you the answer is on the wrong arm.** boggle's
`submit_word` answered `gameOver` as an `ok` for months, and it was wrong the
whole time: the word is not recorded on that path, so an `ok` left
`useWordSubmit`'s optimistic `+N` pill standing over a word that never landed.
Nothing noticed, because the call site read `error` alone and an `ok` looks like
success. What surfaced it was giving the hook a real contract —
`commit: (entry) => Promise<NotOk | null>`, where `null` means the word landed.
There is no way in that shape to say *"ok, but release the word"*, and the
absence is the report: an answer that cannot be expressed on the arm it is
sitting on is on the wrong arm. It is **PN368** now, beside its three siblings.

The general form: if a caller has to do cleanup after an `ok`, the `ok` is
probably a refusal. **Did this record anything?** is the sharper question than
*was the player at fault?*, and it is the one that separates these two arms.

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
| `detail` | `detail` | for the log and the diagnostics line, never the player's sentence |
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

### Four things the roster conversion taught

Each of these cost a wrong answer that nothing caught, so each has a guard now.

**A raise that looks unreachable is usually one that something ABOVE it is
answering instead.** All sixteen `replay_board`s checked membership before
checking that the game still existed — but `delete_game` takes the game's own
row, `common.games` and every `game_players` row together, so a caller whose
game had just been deleted had no membership either and was told "You are not
in this game". True of the rows, false of the player. boggle and crosswords had
no row check at all in `end_game` / `submit_timeout` and returned **silent
success**. Order the checks so the truest sentence wins;
[`gameDeletedFirst.test.ts`](../src/guards/gameDeletedFirst.test.ts) holds it.

**A race's TONE lives in the raise's `CONSTRAINT`, not in its severity.** A bare
`hint = 'race'` renders `warning`. When the news is news rather than a setback —
"Game over", "Already conceded" — add `constraint = 'noted'` at the raise. There
is nowhere else to say it: the frontend does not second-guess an outcome.

**A HELPER that raises with a constraint has no handler of its own**, so the
override is read back by whichever CALLER catches. `get stacked diagnostics`
returns only the fields you ask for, so a caller that omits `constraint_name`
drops it silently and the pill quietly wears the default.
[`raiseCodes.test.ts`](../src/guards/raiseCodes.test.ts) walks outward from a
handler-less raiser to every catch that could swallow it.

**One code can serve many sites when it is one question asked in many
schemas.** `common.require_game_player` (PN252/PN253), `_raise_game_deleted`
(PN485) and `_raise_game_over` (PN486) are each raised from dozens of places
under a single code, because what a code distinguishes is WHICH QUESTION
failed — not which file asked it. A caller always knows which RPC it called.
Sixteen codes for one fact says the fact is sixteen things, and it is not.

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

## How edge functions RECEIVE one

The section above is the answer a function **sends**. This is the answer it
**receives** — the fourth call direction, and the one that had no wrapper until
2026-09-01.

**One wrapper, mirroring the frontend's**, in
`supabase/functions/_shared/dbResult.ts`:

```ts
runRpc<T>(call, rpcName): Promise<Envelope<T>>
```

It does what the frontend's does minus everything belonging to a user surface —
no modal, no pill, no fault reporting, because an edge function has no surface;
it answers by returning an envelope of its own. Four steps: await the call; an
`error` means the RPC never ran; a body that is not an envelope means it
answered something unreadable; otherwise log a line and return it, typed. The
first two are **PN117** and **PN118**, one pair for every call site rather than
a pair per function — eight codes led to one fix, and the RPC's name is already
in the message.

Then a function reads the way a frontend call site reads:

```ts
const res = await runRpc<ClueContext>(
  db.schema('codenamesduet').rpc('get_clue_context', { … }), 'get_clue_context',
)
if (res.type === 'not-ok') return json(res)   // relay the refusal untouched
const ctx = res.data                          // carry on
```

**Relay-vs-unwrap is the call site's choice, and it is one line either way.**
`startGame` and `scrabble-ai-move` relay the whole envelope; the two AI
suggesters and the clue explainer unwrap the `ok` and keep working. A real
per-function difference that does not deserve two wrapper variants.

Two things the wrapper does that the frontend's does differently:

- **The RPC name is a parameter**, not dug off the query builder. The frontend's
  `callLabel` digs `url`/`method` off postgrest-js defensively because they are
  `protected`; here the name is known at every call site, and a parameter cannot
  go stale when a library renames a field.
- **`faultEnvelope` is the only builder in `_shared/envelope.ts` with a value
  form**, and `fault` delegates to it. An inbound failure has to be a VALUE the
  caller branches on; the outbound builders return a `Response`, because a
  function that has decided something is done deciding.

It logs one line per call — `[rpc] <name> <type> <ms>ms`, plus severity and
dbcode on a `not-ok` — the Deno counterpart of the frontend's `[db]` line.

### The board builders are deliberately NOT on it

There is no Deno `readRows`, and **ten** raw calls to row-returning helper RPCs
— `candidate_words` (×4), `pick_seed`, `seed_for`, `candidate_bases`,
`try_base`, `matching_words`, `cache_definition` — call them without a wrapper.
**This is a decision, not an omission.**

They sit inside pure helpers (`buildBoard(): Promise<Board | null>`), not inside
a request handler, and they signal failure by `throw`, which the function-level
`crash(FN, e)` turns into a fault envelope at the edge. That is already a
coherent boundary. Handing those helpers envelopes would push envelope-branching
into every board builder to gain nothing: there is no refusal to relay, no
player sentence, and `crash` already produces the right answer.

A Deno `readRows` earns its place the day one of those calls needs to relay a
refusal, and not before.

### The relay above an RPC has to convert WITH it

A function that relays sits above its RPC, and pointing `runRpc` at an RPC that
still answers bare **faults every SUCCESS** — the answer is not an envelope, so
step 3 rejects it. So the two halves move in one commit, and the wrapper goes in
before the RPCs whose answers it relays. Worth remembering for any new
edge-function/RPC pair, which starts in exactly that position.

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
  through it. It **classifies and shows nothing**. For a request nothing
  answered it re-throws the browser's error untouched; for a non-2xx it reads
  the body as text, decides who answered — Postgres with a SQLSTATE, our own
  gateway (`FE003`), or something that is not ours (`FE004`) — writes that
  verdict into `statusText`, the one field postgrest-js forwards untouched, and
  re-emits the response. It logs only what no wrapper will speak for: an
  **abort**, which is us canceling our own request, and Supabase's **own auth
  endpoints**, which the sign-in screen handles.
- **`runRpc` / `runEdgeFn` / `readRows`** own every answer and every failure,
  because they hold the parsed result: the transport facts for the diagnostics
  line, `status: 0` for nothing-answered, `dbFetch`'s verdict in `statusText`,
  and the body's meaning when it arrived 200. A fault gets the modal here,
  whatever built it; everything else gets its `[db]` line. `dbFetch` stays
  quiet on a 2xx to our endpoints rather than printing an `OK` directly above a
  line contradicting it. The half that reads a server-written envelope — is it
  one at all, does an `ok` carry words without an outcome, present or log — is
  one function, `readEnvelope`, shared by `runRpc` and `runEdgeFn`.

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

### When OUR SERVER did not answer — the `FE` codes

Four situations, four codes, four sentences. They live in `dbEnvelope.ts` and
are the ONE place any of them is chosen — `dbFetch` names the situation as a
code in `statusText`, and the three wrappers call it to word both the envelope
a call site reads and the modal above it, so the two cannot disagree about one
event.

| code | what happened | how it is told apart |
|---|---|---|
| `FE001` | nothing answered, and the device knew it was offline | no `Response`; `status=` blank |
| `FE002` | nothing answered, and the device thought it was online | no `Response`; `status=` blank |
| `FE003` | **our own gateway** answered and what sits behind it did not | body parsed, no SQLSTATE |
| `FE004` | **something that is not ours** answered — a captive portal, a proxy, an ISP page | body would not parse, on `/rest/v1/` |

The definition widened on 2026-08-31, from *"the JS fetch failed"* to **"our
server did not answer."** The old line reasoned from whether a `Response` object
existed, which is a fact about JavaScript rather than about anything a player or
a debugger needs; the useful question is whether the game server answered, and
for a portal or a dead upstream it did not.

**Why four and not one.** They are four different things to go fix, and telling
a player their network is at fault when our own upstream is down sends them to
repair a router that works. `FE003` says "our server appears to be down, try
again later"; `FE004` names the one thing on the player's side of the wire.

**They still name no action beyond refreshing**, and that rule is unchanged: an
answer that never arrived cannot tell you whether your move landed — the
connection can die on the way *back*, after the write committed — so "refresh
and try again" is right because refreshing reveals the real state before a retry
can double-apply.

### Bugs the frontend catches — `PN307`–`PN310`

`PN`, not a class of their own: the letter says what a code does to `type`, not
who authored it, and the sequence already spans SQL raises and 64 Deno ones.
All of them are OURS, so every message opens `BUG:` — something answered, and
the answer was wrong.

`PN488` is out of family on purpose. `max + 1` across the whole `PN` class is
what allocates a code, and the 3xx block filled with SQL raises long after
307–310 were taken; never filling gaps is the rule, so "PN488" in a bug report
can only ever mean the one thing.

| code | what happened |
|---|---|
| `PN307` | a 2xx whose body is not one of our envelopes |
| `PN308` | an `ok` carrying a message with no outcome |
| `PN309` | `readRows` got a value instead of rows |
| `PN310` | the edge-function runtime answered instead of the function |
| `PN488` | a call site's branches did not cover the answer it got |

**Why these have codes at all:** without them a frontend-built envelope carried
`dbcode: null`, and `useGameTimer` — the first call site that had to tell one
failure from another — identified its case by an ABSENCE. That was true for
reasons its condition could not state, and would have stopped being true the day
a fifth codeless failure was added.

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

**The db log kind** is the first word of the line, and it picks the console
method — so a line's kind and its severity cannot disagree. It is a KIND rather
than a level because "log level" is console's own idea (`error` / `warn` /
`debug`), which these six map to but are not:

| db log kind | method | is |
|---|---|---|
| `FAULT` | `console.error` | a bug |
| `SERVICE_ERROR` | `console.warn` | something we depend on didn't answer |
| `SLOW` | `console.warn` | a call over the threshold that still worked |
| `RACE` | `console.warn` | a race the player lost |
| `FORM_VALIDATION` | `console.debug` | the values you sent |
| `OK` | `console.debug` | it worked |

**Four of the six are a severity, spelled the same way**, so a line's kind and
the `severity=` on it cannot read as two different claims. `SLOW` and `OK` are
the exceptions: they are `dbFetch` narrating transport, where no envelope
reached a decision at all.

The two quiet kinds are why every call can be logged without drowning
anything — the browser's own level filter is the volume control, and no custom
verbose flag is needed.

**`RACE` is `warn` even though nothing is wrong**, and it is the one kind that
isn't tracking how bad something is. A lost race is rare and genuinely puzzling
from the player's side — the move they made simply didn't happen — so the
question it produces is "what was that?", and the answer should be one glance at
the console rather than a dig through debug output.

**A `not-ok` that is not a fault is logged too**, at `warn`. The old rule was
"expected rejections are NOT logged", which makes a MISCLASSIFIED bug completely
silent: if "already deleted" starts firing on every click because something
broke, nothing anywhere says so. One line keeps that visible without putting a
modal in anyone's way, and tagging by db log kind keeps real faults from being
buried among them.

`SLOW` is the one line about the REQUEST rather than an answer, and it carries
fewer fields on purpose: it is written before the body is read, so printing
`dbcode=` would say the response carried no code when the truth is that nobody
looked. Omitted beats empty.

`[db]` is its own console channel beside `[rt]` (realtime) and `[ui]`, so
filtering to it gives every database call and nothing else.
