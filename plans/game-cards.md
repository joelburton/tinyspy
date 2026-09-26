# Game cards — how each game ends today, in the new terms

**What this is.** One card per game, saying how the game ends TODAY in the
terms of [docs/win-lose.md → How a game ends — the
terms](../docs/win-lose.md#how-a-game-ends--the-terms-agreed-2026-09-25), for
Joel to read and react to. It is part of
[cross-game-consistency §3b](cross-game-consistency.md#3b-how-it-ended-for-me--won-lost-quit-no-result-solved-not-started).
Each card is read off the CODE — the SQL paths that end a game (the winning
move, `submit_timeout`, `end_game`, `concede`) and the front end's verdicts —
and the game's doc is compared against it afterward.

**Every card has the same lines**, each titled by its term from win-lose.md
in backticks, less the ones that are empty only because
another line already says so (no `final-placing` in a game that ends when
decided, no `no-result` in a game with a goal). An empty line that tells
something about the game stays, written "none" or "n/a": no `goal-chosen`,
only one valid solution. A line
splits into a coop and a compete sub-item only where the modes differ in
substance; "the team's in coop, each player's in compete" is what coop means,
not a difference, so it never splits a line. Nor does a term that belongs to
one mode by definition (a team can't concede; only compete has a winning
order): it is one line about the mode it belongs to. Below each card:

- **Mismatches** — where a doc or comment says something the code does not.
  Fixed soon, after the cards.
- **Surprises and ruling ideas** — what looks odd, or wants a decision. Each
  becomes a todo in that game's own `todo.md` once Joel decides; nothing is
  done here.

One list at the end: **gaps in the terms**, where a game does something the
terms have no word for.

**Groups** — the cards are written in this order: word hunts (spellingbee,
wordwheel, boggle) · guess what's hidden (wordle, psychicnum, codenamesduet,
connections) · solve the grid (crosswords, waffle, strands, stackdown) · build
with words (letterboxed, wordiply, bananagrams) · score contests (scrabble,
setgame).

**Progress:** psychicnum only, written first as the worked example.

## Guess what's hidden

### psychicnum

Three secret words hidden on a board of 5–20; every guess spends one from a
budget of 3, 5, 7 or 9.

- **goal**
  - `game-goal` — `goal-intrinsic`: find all three secrets.
  - `goal-chosen` — none.
  - `goal-progress` — secrets found.
- **solving**
  - `solved` — all three found.
  - `perfect-play` — three guesses, no misses.
  - `author-solution` — n/a: one valid solution.
- **winning and losing**
  - `winning-ordering` — first to find all three.
  - `tiebreak` — none: a race can't tie.
  - `loses-by` — `move-budget`.
  - `announce-when` — `announce-when-decided`.
- **ending**
  - `natural-finish` — every budget spent, a conceder's aside.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
  - `stop-by`
    - coop: anyone.
    - compete: only a player already `done`.
- **hints**
  - `hint` — a clue for an unfound secret
    - `hint-free`, `hint-recorded`
  - `hint-spoiler` — an unfound secret word
    - `hint-free`, `hint-recorded`.

**Mismatches**

- `src/psychicnum/doc.md` → Compete says "There is no way to stop a race for
  the whole table — see `common/game-page/todo.md`." The code lets a racer who
  is out Stop it (`useStandardGameActions`, since `d29adb54`,
  2026-09-24), `psychicnum.end_game` has no mode check, and
  `common/game-page/todo.md` has no such item.
- `src/psychicnum/doc.md`, under `psychicnum.request_spoiler(target_game)`:
  "in coop teammates see that a spoiler was taken, never which word." The
  header line leaves the word out, but the event log shows the spoiled word
  to every teammate (coop's `events` rows are all readable, and
  `GameEventLog` draws a spoiler row's word).
- `src/psychicnum/doc.md` says a racer sees every rival's remaining budget; the
  opponent strip shows only "Found". (Already in cross-game-consistency §5.)
- The status's `guesses_used` in compete: the doc says it is the SUM of every
  racer's count. `submit_guess` writes the sum mid-game, but the
  `'exhausted'` ending writes the budget itself (`initial_guesses`) and
  `submit_timeout` writes the average (`sum / count`). Nothing shows compete's
  count, so nothing on screen is wrong.
- `psychicnum.sql`, `concede`'s header: "the compete game ends only when EVERY
  player is done — either someone completed the set (immediate win) …" — a
  race ends at the first finisher, which is not "every player done".
- `psychicnum.sql`, `submit_guess`: "The FE gates on myConceded" — the name is
  `isConceded` since §3a.
- `psychicnum.sql`, `end_game`'s header: "the post-terminal number reveal" —
  what is revealed is the three secret words.

**Surprises and ruling ideas**

1. **Compete's hint and spoiler both hand over progress, free.** Already filed
   in `src/psychicnum/todo.md` (Maybe) for the spoiler; the HINT breaks
   `hint-priced` too — a clue points you at an unfound secret, which is
   progress, so it is not `hint-self-informative`. The todo item should name
   both.
2. **In compete, only an out racer may Stop.** A racer still playing cannot
   stop the race; one who has conceded or spent their budget can, and ends it
   for the others mid-hunt with nobody winning. Is that the rule wanted?
3. **A Stop records `{won: false}` for every player** — the same per-player
   result as a loss. `play_state = 'ended'` is what tells them apart. (The
   cross-game version of this is §3b's "`result.won` is not written
   everywhere".)
4. **Is it perfect-play after a hint or spoiler?** The card says three
   guesses, no misses, and nothing about either.
5. **Compete's timeout ignores goal-progress** (`timeout-no-winner`), though
   each racer's count is right there. That follows `no-best-of-the-losers`;
   noted only so `timeout-best-progress` is a choice made, not missed.
6. **`reason = 'exhausted'` also covers an ending by concession.** When some
   racers spent their budgets and the last one out conceded,
   `_maybe_finish_compete` writes `'exhausted'` (`'conceded'` only when EVERY
   racer conceded). By `reached-natural-finish` that game ended by concession.

## Gaps in the terms

- **The clock running out after SOME players reached the goal** (known before
  the cards). Not reachable in psychicnum: a finisher ends a race.
