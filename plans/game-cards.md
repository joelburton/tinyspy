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
- **A card shows what the game does today, never a ruling.** A ruling not
  yet built lives in the game's `todo.md`; the target cards come later, so
  the two can be diffed.
- **Where the terms can't say cleanly what the code does**, the line gives
  the nearest term, then "(BUG: …)" saying what the code does.
- **coop and compete sub-items only where the modes differ in substance.**
  "The team's in coop, each player's in compete" is what coop means, and
  never splits a line. Nor does a term that belongs to one mode by
  definition: it is one line.
- **`score-formula`:** under goal, after `goal-progress`, naming what the
  game's score is. A game that keeps no score leaves it out.
- **`ranked-by`:** one step, on its line; several, as a numbered sublist in
  order. What happens when all are level (`co-winners`) is a step too.
- **`progress-shown`:** under winning and losing, after `announce-when`;
  each value followed by what it shows ("`progress-shown-count`: sets
  found"), and a sublist when there are two. Compete only, so a coop-only
  game leaves it out.
- **Hints:** one item per hint the game offers, titled by its kind (`hint`,
  or `hint-spoiler`; the title repeats for two of a kind), then a few words
  on what it hands over. Its tags go on a sub-line beneath: every hint tag
  that applies — the cost, `hint-earned`, `hint-self-informative`,
  `hint-recorded`. Never a
  negative, and never `hint` or `hint-spoiler`: the title already says it.

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

**After the cards** — the steps, in order:

| step | what | why here |
|---|---|---|
| 1 | Sanity-check the cards | The early cards predate definitions that changed later (`can-stop-by` dropped; hint costs and `hint-earned`; `hint-recorded`; `loses-by-fatal-move` and several `loses-by`; `progress-shown`; `solved`; the score-contest and reachable-goal rules). Every later step reads the cards. |
| 2 | Go through the ruling ideas | Leaves nothing ambiguous. Deciding only, not fixing; an answer may change a term. |
| 3 | Target cards | Only the lines that change, each pointing at the todo that holds its ruling — step 2's rulings and those already filed. |
| 4 | Clean up `win-lose.md`'s vocabulary | Rewrite the older text above the terms section and the Vocabulary table: each word current, a synonym retired to its better name, or dead. After this the doc has one vocabulary. Needs step 2's answers. |
| 5 | Update the naming plan | cross-game-consistency §1 and §3b's draft terms (`myEnding`, `'quit'`, `hasSolved` …), brought to step 4's vocabulary before anything is renamed. |
| 6 | Fix the mismatches | One prose sweep, facts only — every mismatch is a doc or comment wrong against running code. Wording waits for steps 7–8. The race/racer wording is identifiers too, so it goes with 7–8. |
| 7 | Change vocabulary in common and shared code | `common.end_game` / `concede`, `useStandardGameActions`, `terminalOutcomeVerb`, `docs/states.md` and the other cross-game docs. Done once; every game reads it. |
| 8 | List each game's vocabulary changes | Recorded per game, not made: picked up when app-audit opens that game. Each game's doc gains its **nomenclature** section then — the game's own words (theme word, spangram, par, hint bar), each meaning exactly one thing. Doing all sixteen now would reopen closed, blessed areas outside the audit. |
| 9 | Change game behavior | The rulings, filed as todos in each game's `todo.md`, worked as its area opens. |

**Groups** — the cards are written in this order: word hunts (spellingbee,
wordwheel, boggle) · guess what's hidden (wordle, psychicnum, codenamesduet,
connections) · solve the grid (crosswords, waffle, strands, stackdown) · build
with words (letterboxed, wordiply, bananagrams) · score-only contests
(scrabble, setgame).

**Progress:** psychicnum (the worked example), spellingbee, setgame, wordiply,
waffle, crosswords, strands, stackdown, wordwheel, boggle, wordle,
codenamesduet, connections, letterboxed, bananagrams, scrabble — every
game.

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
  - `score-formula` — points, for every word found, bonus words too: 1 for
    four letters, one per letter for longer; +10 for a pangram.
- **solving**
  - `solved` — every required word found; nothing reads it.
  - `perfect-play` — n/a: a wrong word costs nothing.
  - `author-solution` — the word list.
- **winning and losing**
  - `ranked-by` — first to reach the target rank.
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-milestones`: rank.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`; with no target, `no-result`.
- **hints** — none.

**Mismatches** — none.

**Surprises and ruling ideas** — none.

### wordwheel

Nine tiles on a wheel, letters may repeat; find words that use the center,
each tile once per word. Points climb the same rank ladder as spellingbee.
Its ending code is spellingbee's.

- **goal**
  - `game-goal`
    - coop: `goal-chosen` when a target rank is set; with none, `goal-none`.
    - compete: `goal-chosen`, always.
  - `goal-chosen` — a target rank, Good to Genius.
  - `goal-progress` — points, read as a rank.
  - `score-formula` — points, for every word found, bonus words too: 1 for
    four letters, one per letter for longer; +15 for a pangram (all nine
    tiles).
- **solving**
  - `solved` — every required word found; nothing reads it.
  - `perfect-play` — n/a: a wrong word costs nothing.
  - `author-solution` — the word list.
- **winning and losing**
  - `ranked-by` — first to reach the target rank.
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-milestones`: rank.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`; with no target, `no-result`.
- **hints** — none.

**Mismatches** — none.

**Surprises and ruling ideas** — none.

### boggle

A grid of letter dice; trace words through touching dice. Required words
score toward an optional target; bonus words score too.

- **goal**
  - `game-goal`
    - with a target: `goal-chosen`.
    - without a target: coop, `goal-none`; compete, the top score at the
      `timeout` (untimed, `goal-none`).
  - `goal-chosen` — a share of the required words' points, 50% to 100%.
  - `goal-progress` — points.
  - `score-formula` — points by word length, on a ladder picked at setup
    (flat, basic, fib, big).
    - toward a target: required words only.
    - the score: every word found, bonus words too.
- **solving**
  - `solved` — every required word found; only a 100% target reads it.
  - `perfect-play` — n/a: a wrong word costs nothing.
  - `author-solution` — the word lists.
- **winning and losing**
  - `ranked-by`
    - with a target: first to reach it.
    - without a target:
      1. most points
      2. `co-winners`
  - `loses-by`
    - with a target: `loses-by-timeout-only`.
    - without a target: `loses-by-none`.
  - `announce-when`
    - with a target: `announce-when-decided`.
    - without a target: `announce-when-ended`.
  - `progress-shown` — `progress-shown-count`: score.
- **ending**
  - `natural-finish` — none.
  - `ends-when`
    - with a target: `ends-when-decided`.
    - without a target: none.
  - `timeout-result`
    - coop: `timeout-no-winner`; without a target, `no-result`.
    - compete: `timeout-no-winner`; without a target,
      `timeout-best-progress`, and if nobody scored, `timeout-no-winner`.
- **hints** — none.

**Mismatches**

- `docs/games/boggle.md` → 1. The game: with no target, "you hunt until the
  timer expires, a player hits **End game**, or (compete) everyone's done — a
  neutral end." In compete the timeout crowns the top score, and everyone
  conceding is a `lost_compete`.
- `docs/games/boggle.md` §7 names `_finish`'s parameter `outcome`; it is
  `reason`.
- `submit_word`'s comment says compete "scores are private", and
  `_finish`'s that "the leaderboard is privacy-scoped"; `_refresh_status`
  publishes every player's score to the club-readable status during play,
  and the opponent strip shows it.

**Surprises and ruling ideas**

1. **Two measures of points.** A target counts required words only; the
   no-target score race counts bonus words too.

## Guess what's hidden

### wordle

A hidden five-letter word; each guess colors its letters. A budget of 5–8
guesses.

- **goal**
  - `game-goal` — `goal-intrinsic`: the word found.
  - `goal-chosen` — none.
  - `goal-progress` — none.
- **solving**
  - `solved` — the word found.
  - `perfect-play` — one guess.
  - `author-solution` — the word.
- **winning and losing**
  - `ranked-by`
    1. fewest guesses
    2. the earlier solve
  - `final-ranking` — by `ranked-by` (BUG: only the winner is recorded).
  - `loses-by` — `loses-by-move-budget`.
  - `announce-when`
    - coop: `announce-when-decided`.
    - compete: `announce-when-ended`.
  - `progress-shown`
    - `progress-shown-count`: guesses used.
    - `progress-shown-milestones`: solved.
- **ending**
  - `natural-finish` — every player's guesses spent.
  - `ends-when` — `ends-when-all-done`.
  - `timeout-result`
    - coop: `timeout-no-winner`.
    - compete: `timeout-ranking-stands`; if nobody solved, `timeout-no-winner`.
- **hints** — none.

**Mismatches**

- `src/wordle/doc.md`, the SQL and the FE call compete a "race" and its
  players "racers"; the terms name wordle as not a `race-game`.

**Surprises and ruling ideas** — none.

### psychicnum

Three secret words hidden on a board of 5–20; every guess spends one from a
budget of 3, 5, 7 or 9.

- **goal**
  - `game-goal` — `goal-intrinsic`: find all three secrets.
  - `goal-chosen` — none.
  - `goal-progress` — secrets found.
- **solving**
  - `solved` — all three found.
  - `perfect-play` — three guesses.
  - `author-solution` — the three secrets.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `loses-by` — `loses-by-move-budget`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-count`: secrets found.
- **ending**
  - `natural-finish` — every player's budget spent.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
- **hints**
  - `hint` — a clue for an unfound secret
    - `hint-free`, `hint-recorded`
  - `hint-spoiler` — an unfound secret word
    - `hint-free`, `hint-recorded`

**Mismatches**

- `src/psychicnum/doc.md` → Compete says "There is no way to stop a race for
  the whole table — see `common/game-page/todo.md`." Any compete player may
  Stop (Concede's question offers it; End once `player-done`),
  `psychicnum.end_game` has no mode check, and `common/game-page/todo.md` has
  no such item.
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
   guesses, and nothing about either.
3. **`reason = 'exhausted'` also covers an ending by concession.** When some
   players spent their budgets and the last one out conceded,
   `_maybe_finish_compete` writes `'exhausted'` (`'conceded'` only when EVERY
   player conceded). By `reached-natural-finish` that game ended by concession.

### codenamesduet

Two players, each seeing a different key to one board of 25 words; clues
lead the partner to the agents on your key. Coop only, two players.

- **goal**
  - `game-goal` — `goal-intrinsic`: all fifteen agents contacted.
  - `goal-chosen` — none.
  - `goal-progress` — agents contacted.
- **solving**
  - `solved` — all fifteen agents contacted.
  - `perfect-play` — two turns, no bystanders.
  - `author-solution` — the two keys.
- **winning and losing**
  - `loses-by`
    - `loses-by-fatal-move`: any assassin.
    - `loses-by-move-budget`: the turns spent, then any miss.
  - `announce-when` — `announce-when-decided`.
- **ending**
  - `natural-finish` — none: a spent budget begins the game's sudden death.
  - `timeout-result` — `timeout-no-winner`.
- **hints**
  - `hint` — an AI-suggested clue, for the clue-giver
    - `hint-free`, `hint-recorded`

**Mismatches** — none.

**Surprises and ruling ideas** — none.

### connections

Sixteen words hiding four categories of four; pick four at a time. Four
mistakes to spend.

- **goal**
  - `game-goal` — `goal-intrinsic`: all four categories found.
  - `goal-chosen` — none.
  - `goal-progress` — categories found.
- **solving**
  - `solved` — all four categories found.
  - `perfect-play` — no mistakes, no hints.
  - `author-solution` — the four categories.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `loses-by` — `loses-by-mistake-budget`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-count`: categories found.
- **ending**
  - `natural-finish` — every player's mistakes spent.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
- **hints**
  - `hint` — one word of a category you pick
    - `hint-free`

**Mismatches** — none.

**Surprises and ruling ideas**

1. **Compete's hint breaks `hint-priced`**, as psychicnum's and stackdown's
   do: free, and it hands over progress.
2. **The hint's button says "Reveal"**, the spoiler's word by
   `hint-spoiler`; it leaves three words of the category to find.

## Solve the grid

### crosswords

A crossword from the library or the NYT; fill every cell. Coop shares one
grid, compete gives each player their own.

- **goal**
  - `game-goal` — `goal-intrinsic`: the grid filled right.
  - `goal-chosen` — none.
  - `goal-progress` — none.
- **solving**
  - `solved` — every cell right; revealed cells count.
  - `perfect-play` — no checks, no reveals.
  - `author-solution` — the author's grid.
  - `matched-author-solution` — not read: Reveal is offered on every ended
    game.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-none`.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
- **hints**
  - `hint` — check a letter, word or puzzle: marks the wrong letters
    - `hint-free`, `hint-self-informative`
  - `hint-spoiler` — reveal a letter, word or puzzle
    - coop: `hint-free`, `hint-recorded`
    - compete: `hint-banned`

**Mismatches**

- `docs/games/crosswords.md` (§1, §4's `end_game` and `submit_timeout` rows,
  §8, §9) and the SQL headers of `end_game` and `submit_timeout` give the
  status key as `outcome`; the code writes `reason`.
- `docs/games/crosswords.md` §4 lists `clear_board`, which `replay_board`
  replaced.
- `docs/games/crosswords.md` §9 and `reveal_cells`'s comment say waffle and
  wordle end a reveal as `ended` + `'revealed'`; both reveals are gone, and
  Reveal is terminal-only there.
- `docs/games/crosswords.md` §7: a compete game everyone conceded reads
  "Lost: out of the race" — the code says "Lost: all conceded". And a conceded
  player's strip shows "an inert Concede" — Concede is hidden once
  `player-done`, and End shows instead.

**Surprises and ruling ideas**

1. **Reveal puzzle wins coop.** A grid filled entirely by Reveal is `solved`,
   and so `won`; deliberate, per `reveal_cells`'s comment. With the terms, the
   question is whether that is `solved` at all.
2. **A compete win writes no `reason`**; coop's writes `'solved'`.

### waffle

A 5×5 waffle of six crossing words, scrambled; swap two letters at a time
until every tile is green. Par is the fewest swaps that can solve it; the
budget is par plus a few.

- **goal**
  - `game-goal` — `goal-intrinsic`: the board all green.
  - `goal-chosen` — none.
  - `goal-progress` — words right.
- **solving**
  - `solved` — the board all green.
  - `perfect-play` — solved at par.
  - `author-solution` — the solution board, the only one.
- **winning and losing**
  - `ranked-by`
    1. fewest swaps
    2. the earlier solve
  - `final-ranking` — by `ranked-by` (BUG: only the winner is recorded).
  - `loses-by` — `loses-by-move-budget`.
  - `announce-when`
    - coop: `announce-when-decided`.
    - compete: `announce-when-ended`.
  - `progress-shown`
    - `progress-shown-count`: swaps used.
    - `progress-shown-milestones`: solved, out of swaps.
- **ending**
  - `natural-finish` — every player's swaps spent.
  - `ends-when` — `ends-when-all-done`.
  - `timeout-result`
    - coop: `timeout-no-winner`.
    - compete: `timeout-ranking-stands`; if nobody solved, `timeout-no-winner`.
- **hints** — none.

**Mismatches**

- `docs/games/waffle.md` → `end_game`: "(**coop**; compete shows Concede
  instead)" — any compete player may Stop (Concede's question offers it; End
  once `player-done`). It and `waffle.end_game`'s header give the status as
  `outcome: 'manual'`; the code writes `reason`. `submit_swap`'s coop comment
  says each terminal write "states its `outcome`" — it is `reason` there too.
- `docs/games/waffle.md` → Frontend (`src/waffle/`): "Concede goes gray once
  you have SOLVED" — Concede is hidden once `player-done`, and End shows
  instead.
- `docs/games/waffle.md` → Frontend (`src/waffle/`) and → Title formula,
  `waffle._sync_title`'s comments, and `PlayArea.tsx`'s board comment still
  describe the mid-game `reveal_answer`, which ended the game and wrote the
  solution onto every board. It is gone: Reveal is terminal-only and changes
  only the board on show.
- `docs/games/waffle.md` → Rules: "**Star rating** (FE flourish): swaps left
  at solve → stars" — there are no stars; the coop win reads against par
  ("Won: par +2").
- Compete is called a "race" and its players "racers" throughout the SQL,
  the FE and the doc; ranked by swaps, it is not a `race-game`.

**Surprises and ruling ideas** — none.

### strands

A letter board tiled exactly by hidden theme words and a spangram; trace
each. Other valid words fill a bar that buys a hint.

- **goal**
  - `game-goal` — `goal-intrinsic`: every theme word and the spangram.
  - `goal-chosen` — none.
  - `goal-progress` — words found, the spangram included.
- **solving**
  - `solved` — every theme word and the spangram found.
  - `perfect-play` — no hints spent.
  - `author-solution` — the theme words and spangram, where they lie.
- **winning and losing**
  - `ranked-by`
    1. fewest hints
    2. the earlier solve
    3. `co-winners`
  - `final-ranking` — by `ranked-by` (BUG: only the winner is recorded).
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when`
    - coop: `announce-when-decided`.
    - compete: `announce-when-ended`.
  - `progress-shown`
    - `progress-shown-count`: hints used.
    - `progress-shown-milestones`: solved.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-all-done`.
  - `timeout-result`
    - coop: `timeout-no-winner`.
    - compete: `timeout-ranking-stands`; if nobody solved, `timeout-no-winner`.
- **hints**
  - `hint` — rings an unfound theme word's tiles, not their order
    - coop: `hint-free`, `hint-earned`, `hint-recorded`
    - compete: `hint-scored`, `hint-earned`, `hint-recorded`

**Mismatches**

- `end_game`'s header gives the status as `outcome = 'manual'`, and
  `_maybe_finish_compete`'s says "`outcome` names which way it happened"; the
  code writes `reason`.
- `docs/games/strands.md` → The winner, and why the race can't end early: "a
  player who never spends can be beaten on speed by nobody, only matched" —
  two players on no hints are split by the earlier solve.
- `docs/games/strands.md` → Terminal vocabulary lists `unsolved` among
  `lost_compete`'s reasons; nothing can write it (see below).

**Surprises and ruling ideas**

1. **`'unsolved'` is dead code.** Without a `timeout`, the game ends only once
   every player has solved or conceded, and a solver cannot concede; so a
   no-winner ending there is always `'conceded'`. Filed in
   `src/strands/todo.md`.

### stackdown

A stack of overlapping tiles that spells six words; clear them in order,
each from the tiles left exposed.

- **goal**
  - `game-goal` — `goal-intrinsic`: the stack cleared.
  - `goal-chosen` — none.
  - `goal-progress` — words cleared.
- **solving**
  - `solved` — the stack cleared.
  - `perfect-play` — no hints.
  - `author-solution` — the six words, in order; the only one.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-count`: words cleared.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
- **hints**
  - `hint` — a clue for the next word
    - `hint-free`, `hint-recorded`
  - `hint-spoiler` — the next word
    - `hint-free`, `hint-recorded`

**Mismatches**

- `docs/games/stackdown.md` → The status blob (`common.games.status`) names
  the key `outcome`, and the label's "`outcome`-keyed loss phrasing"; the
  code writes and reads `reason`.
- `docs/games/stackdown.md` §5.2 and `reveal_next_word`'s header call the
  spoiler a playtest cheat that "may be removed once boards are trusted"; it
  is the game's spoiler, the way out for a stuck player.

**Surprises and ruling ideas**

1. **Compete's hint and spoiler break `hint-priced`**, as psychicnum's do:
   both free, and neither `hint-self-informative`.
2. **A compete win writes no `reason`**, as in crosswords; coop's writes
   `'cleared'`, where waffle, crosswords and strands write `'solved'`.

## Build with words

### letterboxed

Twelve letters, three on each side of a square; chain words, each starting
with the last one's final letter, never two letters from one side in a row,
until all twelve are used. The chain has a word cap; undo refunds.

- **goal**
  - `game-goal` — `goal-intrinsic`: all twelve letters, within the cap.
  - `goal-chosen` — none.
  - `goal-progress` — letters covered.
- **solving**
  - `solved` — all twelve letters, within the cap.
  - `perfect-play` — two words, no hints.
  - `author-solution` — the two seed words.
  - `matched-author-solution` — not read: Reveal is offered on every ended
    game.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `loses-by`
    - coop: `loses-by-timeout-only`.
    - compete: `loses-by-none`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-count`: letters covered, words used.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result`
    - coop: `timeout-no-winner`.
    - compete: `timeout-best-progress`:
      1. most letters covered
      2. fewest words
      3. `co-winners`
- **hints**
  - `hint` — the next word's length and first letters
    - coop: `hint-free`, `hint-recorded`
    - compete: `hint-banned`
  - `hint-spoiler` — the next word
    - coop: `hint-free`, `hint-recorded`
    - compete: `hint-banned`

**Mismatches**

- `docs/games/letterboxed.md` → Play states: compete is `lost_compete` for "a
  timed-out race nobody scored in"; `submit_timeout` has no such case, and
  writes `won_compete` whatever the coverage.

**Surprises and ruling ideas**

1. **A compete timeout crowns players who covered nothing.** With every
   chain empty, every player still in ties on zero and is a `co-winner`;
   boggle guards against this ("if nobody scored, everyone `lost`").
2. **No terminal writes a `reason`.** letterboxed says how it ended with its
   own flags (`solved`, `timed_out`, `stopped`), where the other games write
   `reason`.

### wordiply

A short base (`AR`); five guesses, each a longer word containing it. Scored
at the end: the longest word against the longest possible, then the letters
across all five.

- **goal**
  - `game-goal`
    - coop: `goal-none`.
    - compete: `goal-intrinsic`: the best score.
  - `goal-chosen` — none.
  - `goal-progress` — the longest word so far.
  - `score-formula` — two numbers, compared in order: the longest word as a
    percentage of the longest possible, then the letters across all five
    words.
- **solving**
  - `solved` — five words found.
  - `perfect-play` — n/a.
  - `author-solution` — a longest possible word (the first alphabetically).
- **winning and losing**
  - `ranked-by`
    1. the best score
    2. timed: the earlier last guess; untimed: `co-winners`
  - `loses-by`
    - coop: `loses-by-timeout-only`.
    - compete: `loses-by-none`.
  - `announce-when` — `announce-when-ended`.
  - `progress-shown` — `progress-shown-count`: guesses used.
- **ending**
  - `natural-finish` — every player's five guesses spent.
  - `ends-when` — `ends-when-all-done`.
  - `timeout-result`
    - coop: everyone `lost`.
    - compete: `timeout-best-progress`; if nobody scored, `timeout-no-winner`.
  - `no-result` — coop, at its `natural-finish`.
- **hints** — none.

**Mismatches**

- `docs/games/wordiply.md` → `status` jsonb: the key is shown as
  `"outcome": "complete" | "timeout" | "manual" | "conceded"`. The code
  writes those values under `reason` (`conceded` from `common.concede`).

**Surprises and ruling ideas**

1. **A coop timeout is a loss in a `goal-none` game.** Settled: five words
   is coop's goal, so the timeout's loss follows. Filed in
   `src/wordiply/todo.md`; the code still ends a coop game neutral on the
   fifth guess.
2. **Is there a `perfect-play`?** `solved` is five words found; the best
   solve would add a longest possible word and the most letters possible.
   Or it stays n/a.
3. **The leaderboard ranks conceders among the players**, as scrabble's and
   setgame's do; `final-ranking` leaves them out.

### bananagrams

Each player builds a private crossword from a hand of tiles; when every tile
is placed, Peel and everyone draws more. Compete only, one to six players.

- **goal**
  - `game-goal` — `goal-intrinsic`: go out — every tile placed when the
    bunch can't refill the table.
  - `goal-chosen` — none.
  - `goal-progress` — tiles left in hand.
- **solving**
  - `solved` — went out.
  - `perfect-play` — n/a.
  - `author-solution` — none: nothing is hidden.
- **winning and losing**
  - `ranked-by` — first to reach `game-goal`.
  - `loses-by` — `loses-by-timeout-only`.
  - `announce-when` — `announce-when-decided`.
  - `progress-shown` — `progress-shown-count`: tiles left in hand.
- **ending**
  - `natural-finish` — none.
  - `ends-when` — `ends-when-decided`.
  - `timeout-result` — `timeout-no-winner`.
- **hints**
  - `hint` — check words: marks the board's invalid cells
    - `hint-free`, `hint-self-informative`

**Mismatches**

- `docs/games/bananagrams.md` (`submit_timeout`, `concede`) and the SQL
  headers of `submit_timeout` and `concede` give the status key as
  `outcome`; the code writes `reason`.

**Surprises and ruling ideas**

1. **A compete game with coop's play states.** The bare gametype
   `bananagrams` writes `won` and `lost`, not `won_compete` and
   `lost_compete` — deliberate, per the doc, since it has no coop sibling.

## Score-only contests

### scrabble

A 15×15 board and a bag of lettered tiles; play words from a rack of seven,
scored by tile values and premium squares. Compete can seat AI players.

- **goal**
  - `game-goal`
    - coop: `goal-none`.
    - compete: `goal-intrinsic`: the highest score.
  - `goal-chosen` — none.
  - `goal-progress` — score.
  - `score-formula` — each word's tile values, with premium squares; +50
    for playing all seven tiles. At the end each rack's leftover tiles are
    subtracted, and in compete the player who went out gains everyone's.
- **solving**
  - `solved` — n/a: nothing to complete.
  - `perfect-play` — n/a.
  - `author-solution` — none: nothing is hidden.
- **winning and losing**
  - `ranked-by`
    1. the highest score
    2. `co-winners`
  - `loses-by`
    - coop: `loses-by-timeout-only`.
    - compete: `loses-by-none`.
  - `announce-when` — `announce-when-ended`.
  - `progress-shown` — `progress-shown-count`: score.
- **ending**
  - `natural-finish` — a player goes out with the bag empty; in compete
    also every active seat passing in a row.
  - `ends-when` — `ends-when-natural-finish`.
  - `timeout-result`
    - coop: everyone `lost`.
    - compete: `timeout-best-progress`.
  - `no-result` — coop, at its `natural-finish`.
- **hints**
  - `hint` — a suggested move
    - coop: `hint-free`
    - compete: `hint-banned`

**Mismatches**

- `docs/games/scrabble.md` §5.6 and its club-label list give the status key
  as `outcome`; the code writes `reason`. `_finish`'s header says "`outcome`
  ∈ complete | timeout | blocked (NOT manual …)": the parameter is `reason`,
  and coop's manual end (`'manual'`) and the last concede (`'conceded'`) run
  through it too.

**Surprises and ruling ideas**

1. **A coop timeout is a loss in a `goal-none` game.** Settled: going out
   is coop's goal, so the timeout's loss follows. Filed in
   `src/scrabble/todo.md`.
2. **A compete timeout before anyone scores crowns the lightest rack.** Every
   score is 0, the leftovers are subtracted, and the least negative wins.
3. **The leaderboard ranks conceders among the players**, as setgame's does;
   `final-ranking` leaves them out.

### setgame

A table of cards with four features each; claim three that make a set. The
deck deals out onto the table as sets are claimed.

- **goal**
  - `game-goal` — `goal-intrinsic`.
    - coop: clear the deck of sets.
    - compete: the most sets.
  - `goal-chosen` — none.
  - `goal-progress` — sets found.
  - `score-formula` — sets found, one point each.
- **solving**
  - `solved` — the deck cleared of sets.
  - `perfect-play` — no hints.
  - `author-solution` — none: nothing is hidden.
- **winning and losing**
  - `ranked-by`
    1. most sets found
    2. `co-winners`
  - `loses-by`
    - coop: `loses-by-timeout-only`.
    - compete: `loses-by-none`.
  - `announce-when`
    - coop: `announce-when-decided`.
    - compete: `announce-when-ended`.
  - `progress-shown` — `progress-shown-count`: sets found.
- **ending**
  - `natural-finish` — the deck spent, and no set on the table.
  - `ends-when` — `ends-when-natural-finish`.
  - `timeout-result`
    - coop: `timeout-no-winner`.
    - compete: `timeout-best-progress`; if nobody scored, `timeout-no-winner`.
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
   outliving; still, it is the nearest thing to a survival win on any card.

## Gaps in the terms

None open.
