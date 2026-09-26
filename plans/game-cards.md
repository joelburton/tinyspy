# Game cards — how each game ends today, in the new terms

**What this is.** One card per game, saying how the game ends TODAY in the
terms of [docs/win-lose.md → How a game ends — the
terms](../docs/win-lose.md#how-a-game-ends--the-terms-agreed-2026-09-25), for
Joel to read and react to. It is part of
[cross-game-consistency §3b](cross-game-consistency.md#3b-how-it-ended-for-me--won-lost-quit-no-result-solved-not-started).
Each card is read off the CODE — the SQL paths that end a game (the winning
move, `submit_timeout`, `end_game`, `concede`) and the front end's verdicts —
and the game's doc is compared against it afterward.

**A card is a table written as a list** — for Joel and Claude to read
quickly, and to practice the terms. The game's own `doc.md` carries the
explanation; the card carries none. psychicnum's card is the model. The rules:

- **Every line is titled by its term** from win-lose.md, in backticks. A line
  with no term gets one added to win-lose.md first.
- **Lines are grouped** under plain bold headings, in this order: **goal** ·
  **solving** · **winning and losing** · **ending** · **hints**.
- **Terse as a table cell.** Never what is true of every game (every game
  ends at a Stop and at a `timeout`; every compete game has Concede), never a
  term's own definition, never a restatement of the goal. No attributions or
  dates. No process words ("not ruled"): an open question goes in the ruling
  ideas.
- **An empty line stays only if it tells something** about the game, written
  "none" or "n/a" (no `goal-chosen`; no `perfect-play` when a wrong word
  costs nothing). One that follows from another line goes (no `final-ranking` in a game that ends when
  decided, no `no-result` in a game with a goal).
- **coop and compete sub-items only where the modes differ in substance.**
  "The team's in coop, each player's in compete" is what coop means, and
  never splits a line. Nor does a term that belongs to one mode by
  definition: it is one line.
- **Hints:** one item per hint the game offers, titled by its kind (`hint`,
  or `hint-spoiler`; the title repeats for two of a kind), then a few words
  on what it hands over. Its tags go on a sub-line beneath: the cost, and
  `hint-recorded` if it is. Only the tags that apply, never a negative, and
  never the tag the title already is.

Below each card:

- **Mismatches** — where a doc or comment says something the code does not.
  Fixed soon, after the cards — except where the wrong text is
  `docs/win-lose.md`'s terms or this plan's own: that is fixed as the card
  finds it, since every later card reads the terms.
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

**Progress:** psychicnum (the worked example), spellingbee, setgame.

## Word hunts

### spellingbee

Seven letters in a honeycomb; find words that use the center letter. Points
climb a rank ladder, Start to Genius.

- **goal**
  - `game-goal`
    - coop: `goal-chosen` when a target rank is set; with none, `goal-none`.
    - compete: `goal-chosen`, always.
  - `goal-chosen` — a target rank, Good to Genius.
  - `goal-progress` — points, read as a rank.
- **solving**
  - `solved` — every required word found; nothing reads it.
  - `perfect-play` — n/a: a wrong word costs nothing.
  - `author-solution` — the word list.
- **winning and losing**
  - `ranked-by` — first to reach the target rank.
  - `tiebreak` — none: a `race-game` can't tie.
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when` — `announce-when-decided`.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`; with no target, `no-result`.
  - `can-stop-by`
    - coop: anyone.
    - compete: only a player already `player-done`.
- **hints** — none.

**Mismatches** — none. (The terms' "every word" examples describe the
ruled design; the code catching up is in `src/spellingbee/todo.md`.)

**Surprises and ruling ideas** — none.

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
  - `author-solution` — the three secrets.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `tiebreak` — none: a `race-game` can't tie.
  - `loses-by` — `loses-by-move-budget`.
  - `announce-when` — `announce-when-decided`.
- **ending**
  - `natural-finish` — last player spent budget.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
  - `can-stop-by`
    - coop: anyone.
    - compete: only a player already `player-done`.
- **hints**
  - `hint` — a clue for an unfound secret
    - `hint-free`, `hint-recorded`
  - `hint-spoiler` — an unfound secret word
    - `hint-free`, `hint-recorded`.

**Mismatches**

- `src/psychicnum/doc.md` → Compete says "There is no way to stop a race for
  the whole table — see `common/game-page/todo.md`." The code lets a player who
  is out Stop it (`useStandardGameActions`, since `d29adb54`,
  2026-09-24), `psychicnum.end_game` has no mode check, and
  `common/game-page/todo.md` has no such item.
- `psychicnum.sql`, `concede`'s header: "the compete game ends only when EVERY
  player is done — either someone completed the set (immediate win) …" — this
  `race-game` ends at the first finish, which is not "every player done".

**Surprises and ruling ideas**

1. **Compete's hint and spoiler both hand over progress, free.** Already filed
   in `src/psychicnum/todo.md` (Maybe) for the spoiler; the HINT breaks
   `hint-priced` too — a clue points you at an unfound secret, which is
   progress, so it is not `hint-self-informative`. The todo item should name
   both.
2. **Is it perfect-play after a hint or spoiler?** The card says three
   guesses, no misses, and nothing about either.
3. **`reason = 'exhausted'` also covers an ending by concession.** When some
   players spent their budgets and the last one out conceded,
   `_maybe_finish_compete` writes `'exhausted'` (`'conceded'` only when EVERY
   player conceded). By `reached-natural-finish` that game ended by concession.

## Score contests

### setgame

A table of cards with four features each; claim three that make a set. The
deck deals out onto the table as sets are claimed.

- **goal**
  - `game-goal` — `goal-intrinsic`.
    - coop: clear the deck of sets.
    - compete: the most sets.
  - `goal-chosen` — none.
  - `goal-progress` — sets found.
- **solving**
  - `solved` — the deck cleared of sets.
  - `perfect-play` — every solve: a non-set can't be claimed.
  - `author-solution` — none: nothing is hidden.
- **winning and losing**
  - `ranked-by` — most sets found.
  - `tiebreak` — none: `co-winners`.
  - `final-ranking` — by sets found.
  - `loses-by`
    - coop: `loses-by-timeout-only`.
    - compete: `loses-by-none`.
  - `announce-when`
    - coop: `announce-when-decided`.
    - compete: `announce-when-ended`.
- **ending**
  - `natural-finish` — the deck spent, and no set on the table.
  - `ends-when` — `ends-when-natural-finish`.
  - `timeout-result`
    - coop: `timeout-no-winner`.
    - compete: `timeout-best-progress`; if nobody scored, everyone `lost`.
  - `can-stop-by`
    - coop: anyone.
    - compete: only a player already `player-done`.
- **hints**
  - `hint` — one more card of a set on the table, per press
    - coop: `hint-free`, `hint-recorded`
    - compete: `hint-banned`

**Mismatches** — none.

**Surprises and ruling ideas**

1. **A lone player can win on fewer sets than a conceder.** A conceder keeps
   their sets but is ranked out, and the game plays on to the deck's end. So
   when the leader concedes, the last player left wins with any count above
   zero. They do have to play the deck out, so the win is not simply
   outliving; still, it is the nearest thing to a survival win on the cards
   so far.

## Gaps in the terms

None open.
