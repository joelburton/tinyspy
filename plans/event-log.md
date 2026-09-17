# event-log — the frontend vocabulary, and turn history in compete

**Status: NOT STARTED.** Agreed with Joel 2026-09-17. The last of three; see
[events.md](events.md) for the framing and the deploy rule. **Both phases here
depend on every game's events table existing**, so this plan starts when
events.md finishes.

This is where the task that started the whole conversation finally lands:
`history-always-available`, which was §3's next area and is now phase B of this
plan. Its old row in [app-audit.md](app-audit.md) §3 points here.

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

## B. history-always-available

### B.1 What is broken today

The `#N` handle opens a past turn on the board. Two things are wrong with it, and
they are the same bug: **the number and the link are the same value.**

Six games pass the index of the *filtered* array:

```ts
const shown = turnLogPicker.filter(guesses)
…
{shown.map((g, i) => <TurnLogNumber n={i + 1} onShowHistory={() => onShowHistory(i)} …>)}
```

So filtering renumbers the game, and the handle addresses a row by a position
that the filter just changed. The games that get it right today get it right for
different reasons: scrabble because its `plays.seq` is a game-wide ordinal
(*"by `seq`, not by log position, so filtering can't misaddress it"*), setgame
because it numbers over the full log via `events.indexOf(event)`, codenamesduet
because it addresses a `turn_number`, waffle by accident (its per-player `seq`
is game-wide in coop by lock-step, and wrong in compete).

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
number is the turn's identity, and a filter must not renumber the game"*). That
comment and any echo of it in `turn-log/doc.md` are rewritten as part of this
phase, not left contradicting the code.

**Ordering is `order by id`** (events.md §2), which replaces three different
frontend orderings today: connections by `guessed_at`, strands by `created_at`,
wordle by `seq`.

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

So each game's `lib/history.ts` takes a row **id** and resolves it against the
list it is folding, instead of taking an index into the displayed list. Ten
builders, one shape:

| game | today | after |
|---|---|---|
| connections · letterboxed · psychicnum · stackdown · strands · wordle · waffle | an index into the shown (or sorted) list | the row's `id` |
| setgame | `events.indexOf(event)` | the row's `id` |
| scrabble | `plays.seq` | the row's `id` |
| codenamesduet | `turn_number` | unchanged — it addresses a TURN, not a row, and duet is out of events.md |

`useHistoryViewer<T>` is already generic (scrabble passes an object target), so
the shared hook needs no new shape — just a narrower one, since every game's
handle becomes the same type.

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

## C. Verification

**An e2e that a realtime subscription is live.** Joel: *"an e2e for
realtime-subscription-is-live seems like a great idea."* The frontend subscribes
with `{ schema, table, filter }` strings — ten of them — and a stale table name
fails **silently**: no error, just a game that stops updating. events.md's
publication assertion covers the database half; this covers the client half, and
it is the only thing that would catch a typo'd table name in a rename of this
size.

It belongs here rather than in events.md because each game's subscription string
changes with that game's phase, and this is the plan that can assert them all at
once. **Ask before running any e2e** ([docs/testing.md](../docs/testing.md)).

Otherwise: every game's `PlayArea` and `GameTurnLog` tests, the `turn-log` folder
tests renamed with their subjects, and the board-geometry baseline left alone (it
is gitignored and unrelated).

## D. Open

1. **`boardIsShown`'s new name** (§B.5).
2. **Whether a compete log offers `#N` on an opponent's row mid-game** — it
   cannot resolve (the row is hidden), so the handle should be absent rather than
   dead; confirm that is the behavior wanted rather than a disabled number.
3. **The `<HistoryBanner>` label's wording** for someone else's board — "moth's
   board · GUESS 3"? Sketch it before the phase, not during.
