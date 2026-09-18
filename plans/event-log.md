# event-log — the frontend vocabulary, and turn history in compete

**Status: phase A built, awaiting review; B and C are left.** Agreed with Joel
2026-09-17. The last of three; see [events.md](events.md) for the framing and
the deploy rule. **Both phases here depend on every game's events table
existing**, so this plan started when events.md finished.

This is where the task that started the whole conversation finally lands:
`history-always-available`, which was §3's next area and is now phase B of this
plan. Its old row in [app-audit.md](app-audit.md) §3 points here.

> **Review notes at the end of this file (§F) — read them before starting
> either phase.** They are feedback from a second reader, not rulings. One is a
> game this plan never mentions.

## A. The vocabulary — `turn-log` → `event-log`

A row is an **event** and the table is `events`, so a component called
`<TurnLog>` is the repo's own "no new synonym for a known thing" rule broken in
the other direction. Joel: *"turn-log -> event-log : yes, let's do it. probably
in a separate sweep done just after the actual DB stuff … there are a bunch of
things named after turn-log (the headers and outcomes bars and such) and we'd
want to get those, too."*

Deliberately one sweep, after all ten games' tables have moved, so the diff that
renames everything is readable on its own rather than smeared through ten
migrations.

What it covers, as far as an opening grep shows:

- `src/common/turn-log/` — the folder, its `doc.md` and `todo.md`, and
  `TurnLog.tsx` · `TurnLog.module.css` · `gameTurnLog.module.css` ·
  `useTurnLogPlayerPicker.tsx` · `HistoryBanner.tsx` · `historyViewer.module.css`
  · `useHistoryViewer.ts`, with their tests.
- The exported atoms: `TurnLog`, `TurnLogNumber`, `TurnLogActor`,
  `TurnLogOutcomeBar`, `useTurnLogPlayerPicker`.
- Each game's `components/GameTurnLog.tsx` (eleven of them, codenamesduet
  included — its log stays, so its component renames with everyone else's).
- The frontend row types, which events.md deliberately left alone:
  `GuessRow` → `EventRow` in five games, plus `PlayRow`, `SwapRow`,
  `SubmissionRow`.
- The per-game heading text is NOT part of this. "Guesses", "Moves", "Turns",
  "Clues" stay whatever reads best on each screen — the vocabulary rule is about
  the code's names, not the words on the page.

`turn-log` is a closed, blessed area, so this sweep re-opens eleven blessed files
plus every game's import. Worth one commit of its own.

> **Built 2026-09-17.** `src/common/turn-log/` → `src/common/event-log/`, with
> `TurnLog.tsx` → `EventLog.tsx`, `gameTurnLog.module.css` →
> `gameEventLog.module.css`, `useTurnLogPlayerPicker` →
> `useEventLogPlayerPicker`, the three atoms (`EventLogOutcomeBar`,
> `EventLogNumber`, `EventLogActor`), eleven `GameTurnLog.tsx` files and their
> stylesheets, the `.turnLog*` CSS classes, and the row types — `GuessRow` →
> `EventRow` in four games (codenamesduet keeps its `GuessRow`: its table is
> still `guesses`), plus `PlayRow`, `SwapRow` and `SubmissionRow`.
>
> **Two things the opening grep had missed.** `src/common/pdf/turnLog.ts`
> exports `drawTurnLog` and is the printed log's half of the same vocabulary; it
> is `pdf/eventLog.ts` with `drawEventLog` now. Its `TurnRow` type stays — it is
> a row of the PRINTED log, whose per-game heading ("Turns", "Moves", "Guesses")
> §A keeps. And an e2e selector, `[class*="turnLogBox"]`, which the cssClasses
> guard caught: a spec waiting for a class that no longer exists fails on a
> timeout that reads like flake.
>
> **A rename's collateral, worth recording because it is invisible to a
> compiler in prose and fatal in code:** `s/turn log/event log/` over the repo
> rewrote `return logOut` to `reevent logOut` inside a test. Two lessons —
> a whole-word sweep needs `perl`, since BSD `sed` has no `\b` (it matched
> nothing and the first pass silently did nothing at all), and a prose sweep
> needs a scan for the word it just invented.
>
> Two stale claims in the folder's `doc.md` were fixed on the way past, one of
> them made stale by THIS sprint: scrabble no longer "names a turn by a
> game-wide ordinal" — it names a row by its id. The `boardIsShown` passages
> §F.3 lists are phase B's and are untouched.

## B. history-always-available

### B.1 What is broken today

The `#N` handle opens a past turn on the board. Two things are wrong with it, and
they are the same bug: **the number and the link are the same value.**

**Seven** games pass the index of the *filtered* array — connections,
letterboxed, psychicnum, stackdown, strands, waffle, wordle:

```ts
const shown = turnLogPicker.filter(guesses)
…
{shown.map((g, i) => <TurnLogNumber n={i + 1} onShowHistory={() => onShowHistory(i)} …>)}
```

So filtering renumbers the game, and the handle addresses a row by a position
that the filter just changed.

**waffle is the seventh instance plus a mismatch of its own** (§F.2): it prints
`n={s.seq}` — the swapper's own count — while passing `onShowHistory(i)`, the
filtered position. Its comment says exactly that: *"Identified by POSITION in
the log … shown as seq."* So in compete the number on screen and the row the
handle opens already disagree.

Only two games address a row stably today, and for different reasons: scrabble
because its `plays.seq` is a game-wide ordinal (*"by `seq`, not by log position,
so filtering can't misaddress it"*), and codenamesduet because it addresses a
`turn_number`. setgame is the near miss — it indexes into the UNFILTERED list,
which keeps its handles live but is still a position.

And **compete has no history at all**, because seven games' RLS hides other
players' log rows until the game ends
(`mode = 'coop' or user_id = auth.uid() or cg.is_terminal` — setgame excepted,
which shares one board and shows its events to the whole club in both modes).

### B.2 The rule

Joel, 2026-09-17, reversing his own first instinct once the leak became clear
(*"during the game, the player shouldn't see how many moves the opponent
made"*):

> - **the number is the ordinal of the row in the log you are looking at.** It
>   numbers 1, 2, 3… under whatever filter is applied. With the filter off it is
>   the true order of events, because that is what the log then is.
> - **the link is the row's `id`** — not secret, just pointless to show a human.
> - **so any board history can be jumped to, under any filter, in any mode.**

Nothing leaks, because nothing crosses RLS: in compete mid-game you see your own
rows numbered 1..N, which from your seat is honest — your third move *is* your
third move. At terminal every row is visible and the numbering is the game's
real order.

This reverses setgame's recorded decision and the comment that states it (*"the
number is the turn's identity, and a filter must not renumber the game"*).

`turn-log/doc.md` carries no echo of that sentence — it states the OPPOSITE
convention as the norm, in two places: *"`boardIsShown` is false more often than
it looks … the filtered list's row 3 is not the board's turn 3"*, and *"scrabble
and codenamesduet name a turn by a game-wide ordinal, everyone else by its
position in the log."* Those two passages are what this phase rewrites (§F.3),
along with the `Id` docstring in `useHistoryViewer.ts` (*"stackdown's log
position"*) and the four builder docstrings that tell the caller to pass the
displayed list — wordle, strands, waffle, letterboxed.

**Ordering is `order by id`** (events.md §2) — and by the time this plan starts
it is already done. Ten hooks order their log fetch by five different columns
today (`guessed_at` in psychicnum, connections and wordiply; `seq` in wordle,
scrabble and waffle; `submitted_at` in stackdown; `created_at` in strands; `id`
in letterboxed and setgame), and events.md §10 puts each hook's select and order
change in that game's own phase as "data access" (§F.4). Nobody does it twice,
and nobody waits for this plan to do it.

### B.2.1 What the number does when a compete game ends, and why that is fine

A consequence of "the ordinal of the row in the log you are looking at" that is
worth writing down before someone reports it as a bug: **in compete, the number
on a row can change when the game ends.** Mid-game the visible list is your own
rows (RLS), so your second move is `#2`; at terminal every player's rows are
visible, so under "All" that same move may read `#3` because somebody else moved
in between. Nothing is wrong — the list you are looking at got bigger, and the
number says where you are in it.

Whether that widening is *informative* depends on something the roster already
distinguishes, and the frontend already carries the flag:
`useTurnLogPlayerPicker`'s **`competeSharesOneGame`**, passed by scrabble and
setgame.

- **scrabble and setgame** — compete is one shared board with a real shared
  order, so the interleaved terminal numbering is the honest one. Their pickers
  default to the aggregate in both modes for exactly this reason.
- **everyone else** — compete is parallel private boards, two people playing
  separate games in the same room. The interleaving is real chronology but not a
  shared sequence of turns, which is why those pickers default to *your own*
  board in compete: the log you came to read is yours.

Not part of this work, noted because the design leaves the door open: if the
number ever becomes the *turn* number instead of the ordinal (events.md §8 makes
one available), the same split decides the grouping — per player where compete
means parallel boards, game-wide where it shares one.

### B.3 The snapshot lookup

This is the piece that was mistaken for impossible, and it is worth stating
plainly: **the number and the snapshot are different lists.**

- the **number** is a game-wide fact about presentation — the position in what is
  shown;
- the **snapshot** is a fold over the rows of *the board being viewed*, which are
  the rows the viewer can always see (their own mid-game; everyone's at
  terminal).

So each builder takes a row **id** and resolves it against the list it is
folding, instead of taking an index into the displayed list. Nine
`lib/history.ts` files and one `lib/play.ts` — scrabble's builder is
`historyBoard`, and it has no `lib/history.ts` (§F.5):

| game | today | after |
|---|---|---|
| connections · letterboxed · psychicnum · stackdown · strands · wordle · waffle | an index into the shown (or sorted) list | the row's `id` |
| setgame | `events.indexOf(event)` | the row's `id` |
| scrabble | `plays.seq` | the row's `id` |
| codenamesduet | `turn_number` | unchanged — it addresses a TURN, not a row, and duet is out of events.md |

`useHistoryViewer<T>` is already generic and stays that way. **The handle does
not become a number everywhere** (§F.5): scrabble's target is
`{ kind: 'turn'; seq }` | `{ kind: 'peerPreview'; placements; sharerId; words; score }`,
because coop's show-a-move preview rides the same hook. It narrows to
`{ kind: 'turn'; id }`, not to a bare id.

### B.4 Compete history — the new feature

Once the handle is a row id and the snapshot folds a chosen player's rows,
compete history is reachable: at terminal every player's rows are visible, each
snapshot builder is pure, and a compete log's `#N` can replay **someone else's**
board. Joel: reading moth's finished wordle as six rows of text, when the game
can draw it as a board, is the gap.

Two things it needs beyond the plumbing:

1. **The decision that a compete `#N` may open a board that is not yours**, which
   mid-game is impossible anyway (their rows are hidden) and at terminal is just
   reading a finished game.
2. **Saying whose board you are looking at.** Joel: *"we'd want to put that in
   the box that appears below the board, the same place as the 'x' to close"* —
   which is the shared `<HistoryBanner>`, already rendered by all ten games and
   already taking a per-game label. So it is a label change, not a new surface.

### B.5 `boardIsShown`

The picker's `boardIsShown` is one flag over two unrelated conditions, and it
reads as always-true (there is always a board shown) where the value means *"the
log shows every move made on the board you're looking at, and nothing else"*.
Whether the right name is `canOpenHistory` (what the call sites ask) or
`logMatchesBoard` (what the value is) depended on whether an unmatched log
becomes openable — which B.2 answers: it does. Decide the name in this phase,
with the seven call sites in front of you.

## C. wordiply gets a viewer

**Ruled 2026-09-17** (§F.1). wordiply is the one log game with no turn-history
viewer at all — no `lib/history.ts`, no `#N` — and it stays that way through
phase B, which re-keys viewers that exist. Joel wants it anyway, for consistency
rather than for use: *"for UI consistency, though, it will get it, even if its
pretty much useless."*

It is genuinely new work, not a re-keying:

- a new `src/wordiply/lib/history.ts` — the board at row N, folded from the
  `valid` rows up to that id (five slots, so the "board" is the first N accepted
  words);
- `TurnLogNumber` gains its `#N` and `onShowHistory` in wordiply's
  `GameTurnLog.tsx`, which passes neither today;
- the game's `PlayArea` wires `useHistoryViewer` and a `<HistoryBanner>` label,
  neither of which it has.

**This phase may be deferred past all three plans** without holding anything up
— it is the only one that may. Joel: *"this can be after-these-plans if that
makes sense."*

## D. Verification

**An e2e that a realtime subscription is live.** Joel: *"an e2e for
realtime-subscription-is-live seems like a great idea."* The frontend subscribes
with `{ schema, table, filter }` strings — ten of them — and a stale table name
fails **silently**: no error, just a game that stops updating. events.md's
publication assertion covers the database half; this covers the client half, and
it is the only thing that would catch a typo'd table name in a rename of this
size.

It belongs here rather than in events.md because each game's subscription string
changes with that game's phase, and this is the plan that can assert them all at
once. **Ask Joel before running any e2e** — that is his standing instruction to
the assistant, not something `docs/testing.md` says (§F.6).

The spec has precedent in the same folder: `wordwheel.e2e.ts` and
`psychicnum-turn-order.e2e.ts` each assert that an update ARRIVES by realtime
rather than by refetch. The new one is that shape, once per renamed table. Read
`src/common/realtime/useRealtimeRefetch.ts` first — `TableSubscription` is the
`{ schema, table, filter }` triple every game hands it — and check connections
separately, since it hand-rolls its three `postgres_changes` handlers.

**Two existing specs exercise the `#N` handle and are the ones most likely to go
red** when it becomes a row id: `e2e/codenamesduet-history.e2e.ts` and
`e2e/stackdown-history.e2e.ts`. stackdown's is the one that proves the
filtered-index bug is gone.

Otherwise: every game's `PlayArea` and `GameTurnLog` tests, the `turn-log` folder
tests renamed with their subjects, and the board-geometry baseline left alone (it
is gitignored and unrelated).

## E. Open

1. **`boardIsShown`'s new name** (§B.5).
2. ~~**Whether a compete log offers `#N` on an opponent's row mid-game.**~~
   **MOOT, ruled 2026-09-17** (§F.7): the row never renders, so there is nothing
   to put a handle on.
3. **The `<HistoryBanner>` label's wording** for someone else's board — "moth's
   board · GUESS 3"? Sketch it before the phase, not during.

## F. Review notes — 2026-09-17 (FEEDBACK, not rulings)

> **FOLDED IN 2026-09-17.** Every WRONG, TRAP and SUGGEST note below has been
> corrected or absorbed above, and F.1 and F.7 are ruled. The section stays as
> the record of what a second reader found by checking the plan against the
> code.

**What this section is.** A second reader (Claude Fable) checked this plan
against the code on 2026-09-17, before either phase started. The tags mean the
same as in [events.md](events.md) §14: **WRONG** is a false claim about the
code, verified at the file named, and the plan text should be corrected before
building; **ASK JOEL** is a question only he can answer, so ask and do not
pick; **TRAP** will bite even though the plan is right; **SUGGEST** is
optional. Line numbers are as of 2026-09-17 and will rot.

### F.1 ASK JOEL — wordiply is not in this plan at all

wordiply has a `GameTurnLog.tsx` and no viewer: no `lib/history.ts`, no
`TurnLogNumber`, no `#N` (its own docstring says so). §A counts it among the
eleven logs to rename; §B never names it, and §B.3's table of "ten builders"
lists ten games without it. app-audit.md's row for `history-always-available`
records Joel on exactly this: *"setgame and wordiply shouldn't need to be
different around this stuff."*

So: does phase B give wordiply a viewer? If yes, it is a new snapshot builder
(a five-slot board at row N, from the `valid` rows up to that id), not a
re-keying like the other nine, and it belongs in §B.3's table and §D's tests.
If no, say so in §B so the omission reads as a decision.

**RULED 2026-09-17 — yes, and it may come last.** Joel: *"yes; this can be
after-these-plans if that makes sense. for UI consistency, though, it will get
it, even if its pretty much useless."* So it is phase C below: real new work, not
a re-keying, and the only phase in these three plans that may be deferred
without holding anything else up.

### F.2 WRONG — seven games, and waffle is one of them

§B.1 says *"Six games pass the index of the filtered array"* and lists waffle
among the games that get it right, *"by accident."* Seven games pass the
filtered index: connections, letterboxed, psychicnum, stackdown, strands,
waffle, wordle. waffle is not right by accident; it is the seventh instance of
the bug plus a mismatch of its own. Its `GameTurnLog` prints `n={s.seq}` (the
swapper's own count) but passes `onShowHistory(i)` (the filtered position), and
its comment says as much: *"Identified by POSITION in the log … shown as
seq."* In compete the printed number and the handle already disagree. Rewrite
that paragraph: the games that address a row stably today are scrabble (`seq`,
game-wide) and codenamesduet (`turn_number`); setgame indexes into the
UNFILTERED list, which is why its handles stay live but is still a position.

### F.3 WRONG — what `turn-log/doc.md` says, and where

§B.2 says the reversed decision lives in setgame's comment *"and any echo of it
in `turn-log/doc.md`."* There is no echo of the "identity" sentence in
`doc.md`. What `doc.md` has is the OPPOSITE convention stated as the norm, in
two places: *"`boardIsShown` is false more often than it looks … the filtered
list's row 3 is not the board's turn 3"*, and *"scrabble and codenamesduet name
a turn by a game-wide ordinal, everyone else by its position in the log."*
Those two passages are what phase B rewrites, along with the `Id` docstring in
`useHistoryViewer.ts` (*"stackdown's log position"*) and the four builder
docstrings that say the caller must pass the displayed list (wordle, strands,
waffle, letterboxed).

### F.4 WRONG — the orderings belong to events.md, and there are more of them

§B.2 says `order by id` *"replaces three different frontend orderings today."*
Ten hooks order by five columns: `guessed_at` (psychicnum, connections,
wordiply), `seq` (wordle, scrabble, waffle), `submitted_at` (stackdown),
`created_at` (strands), `id` (letterboxed, setgame). And events.md §10 puts each
hook's select and order change in that game's phase, as "data access". Say
here that by the time this plan starts, every hook already orders by `id`, so
nobody does it twice or forgets one.

### F.5 TRAP — the history handle is not a number everywhere

§B.3 says the shared hook needs *"a narrower"* shape because *"every game's
handle becomes the same type."* scrabble's stays an object:
`useHistoryViewer<HistoryTarget>()` where the target is `{ kind: 'turn'; seq }`
or `{ kind: 'peerPreview'; … }`, because peer preview rides the same hook. It
narrows to `{ kind: 'turn'; id }`, not to a number. Also, scrabble's builder is
`historyBoard` in `lib/play.ts`; it has no `lib/history.ts`, so §B.3's "each
game's `lib/history.ts`" is nine games and one `play.ts`.

### F.6 WRONG — the e2e rule's citation, and two specs the plan does not list

§D says *"Ask before running any e2e ([docs/testing.md])."* That rule is Joel's
standing instruction to the assistant; `docs/testing.md` says only that e2e
needs the local stack and is not part of `npm test`. Keep the rule, fix the
citation.

Two things to add under §D:

- `e2e/codenamesduet-history.e2e.ts` and `e2e/stackdown-history.e2e.ts`
  exercise the `#N` handle. When the handle becomes a row id they are the
  specs most likely to go red, and stackdown's is the one that proves the
  filtered-index bug is gone. List them.
- The "subscription is live" spec has precedent in the same folder:
  `wordwheel.e2e.ts` and `psychicnum-turn-order.e2e.ts` each assert that an
  update arrives by realtime, not by refetch. The new spec is that shape, once
  per renamed table. The shared factory to read first is
  `src/common/realtime/useRealtimeRefetch.ts` (`TableSubscription` is the
  `{ schema, table, filter }` triple); connections hand-rolls its three
  `postgres_changes` handlers and is the one to check separately.

### F.7 SUGGEST — §E.2 may answer itself

§E asks whether a compete log offers `#N` on an opponent's row mid-game.
Mid-game the opponent's rows are RLS-hidden, so they are not in the list the
log renders; there is no row to put a handle on, live or dead. The only case is
at terminal, where every row is visible and §B.4 already says the handle opens
their board. Suggest confirming with Joel that D.2 is moot rather than
designing a disabled number for a row that never renders.

**RULED 2026-09-17 — moot.** Joel: *"in a compete game, how would we even KNOW
there was a row to number?"* We would not: RLS filters the opponent's rows out of
the query result, so the client holds no row, no placeholder and no count, and
the log renders only what it has. There is never a row needing a handle that
cannot work. (The one degenerate exception, recorded so nobody rediscovers it as
a leak: with `bigint identity` ids a player could notice GAPS in their own ids
and infer that somebody wrote something in between. It needs devtools to see and
nothing in this design reads or exposes it — the trust model's "friends, not
strangers" covers it.) §E.2 is struck.
