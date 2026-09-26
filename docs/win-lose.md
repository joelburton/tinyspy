# Win & lose

The ideas every game's winning and losing is built from, and the words for
them. Each game's own rules — what wins, what loses, what its clock does — are
in its doc; this is what those rules are made of, and the invariants none of
them may break.

## The three primitives

1. **The finish line** — what "done" means, and who supplies it:
   - **built-in** — the game is its own goal: the word, the grid, the board
     consumed.
   - **target** — setup picks the finish line (a rank, a percentage); without
     one the game is **open-ended** and can only end neutrally.
   - **none** — no finish line at all; playing just stops (a bag running out,
     a guess allowance spent), and that stop is neutral.
2. **The compete style** — what one player finishing means to the others:
   - **race** — **first past the post**: the first finisher ends the game on
     the spot. Ties cannot happen, because the game row's lock serializes two
     simultaneous finishes: the first commits the winner and the second finds a
     finished game.
   - **best** — everyone **plays out**: a finisher goes **locally terminal**
     while the others continue, and a ranking decides at the end. Ties break
     **quality-then-speed** (`order by <metric>, solved_at`); a game whose
     ranking deliberately has no speed component has **co-winners** instead.
3. **The reachable-end rule** ([states.md](states.md)) — what the clock means:
   *a timeout is a loss iff the game had a reachable end you didn't reach.*
   It gives the three things a timeout can do:
   - **all lose** — a finish line existed and nobody crossed it: a collective
     loss, standings ignored, however high the scores.
   - **rank the finishers** — a per-player finish line existed and some crossed
     it: they are ranked, and the players still mid-board simply didn't finish.
     The winner is "solved, and best at it", never "got furthest".
   - **rank the standings** — there was no finish line to miss, so the clock is
     just how the session stops and what each player had IS the result.

**A race's clock always all-loses**, and not by choice: a finisher ends a race,
so a race still running at timeout has no finishers, and the reachable-end rule
does the rest. A race cut short by the clock may instead rank the standings,
when the game's partial progress is a real measure of it — a deliberate
departure, recorded in that game's doc.

**A collective finish has no finishers to rank** — the bag or the deck runs out
for everyone at once. Its timeout crowns the leader when the standings at any
moment are a complete result (a count of sets taken, a score), and otherwise is
a collective loss.

## Where a coop loss comes from

Where the win comes from (the finish line) and where the loss comes from are
two separate choices. The sources of a coop defeat:

- **move budget** — every move spends it (guesses, swaps).
- **mistake budget** — only a wrong move spends it, so perfect play cannot lose.
- **sudden death** — one fatal act ends it.
- **clock only** — nothing to exhaust; the only way to lose is running out of
  time. A game whose board cannot dead-end has only this.
- **refundable budget** — a cap that blocks play but that undo refunds, so it
  can never kill.

A game with no finish line (`none`) can be moved to **target** with an opt-in
setup knob, and the timeout-becomes-a-loss rule comes with it. Where the game
also has a bounded session, reaching the session's end below the target then
becomes a loss rather than a neutral stop — a bigger change than arming the
clock, and one to make knowingly.

## The invariants

**No survival wins.** Outliving never wins. All-conceded and all-eliminated
are **collective losses** everywhere, and a last player standing must still
finish. If surviving crowned you, conceding would hand out wins. This is the
rule a newly ported game is most likely to break by accident.

**Refusing to lose is out of scope** (ruled 2026-08-07). In a best-style game a
trailing player could stall forever rather than be ranked. A site for strangers
would defend against that; this one does not — the trust model (CLAUDE.md:
friends, not strangers) answers it. **Don't propose anti-stall machinery.** The
remedy is opt-in: play with a timer, whose clock ranks the finishers, and End
is the social way out of a timerless standoff.

**A hint in compete must be priced.** A hint is what a game hands a stuck
player — a nudge, a reveal, a check, an AI suggestion — and in compete it must
be one of:

- **banned** in compete;
- **earned** by play;
- **scored** into the ranking, which suits a best-style game (one more ranking
  component) and not a race;
- free only when **self-informative** — it can tell you you're wrong, never hand
  you progress.

A free hint that hands over progress in a race is the one indefensible case:
asking and then using the answer becomes a legal shortcut to the win.

## Clock fairness

The shared game clock is fair exactly when play is **simultaneous**: wall time
is every player's thinking time equally. In **turn-based compete** it is not —
a rival's deliberation spends your time, and a slow opponent can lose the game
for both of you. In turn-based coop the shared clock is right: a shared fate is
the point of coop.

The turn-based-compete answer is a **player clock** (a chess clock): each
player's own budget, spent only on their own turns. **Flag fall is an automatic
concede** — never chess's "flag falls, the opponent wins", which would be a
survival win. As a concede it composes with everything already here: the
survivor plays on and must still finish, and all flags fallen is all conceded,
a collective loss. It is real work — today's timer is one game-level count, and
a player clock needs per-player accounting and server-side flag-fall
detection.

## Ideas, not built

- **`setup.compete_style: 'race' | 'best'`** — an opt-in style in setup, the
  shape of coop's `coop_style: 'turns'`, validated by `create_game` and branched
  at the terminal transition; not a new gametype. boggle already does this
  implicitly: a target makes it a race with an all-lose clock, and no target
  makes it a best game whose clock is the finish line. A game needs a
  per-player finish for "best" to rank anything, and something slower than a
  typing contest for "race" to mean anything.
- **Standings on a collective loss** — keep an all-lose verdict a loss, but
  attach who was ahead ("Lost (out of time) · closest: melissa 4/6") rather than
  crowning anyone. Weighed against crowning the closest and preferred: "closest"
  is ill-defined in most built-in-finish games, and crowning a collective
  failure muddies won and lost. The carriers exist (per-player `result`, the
  terminal reveals); the work is each game's choice of standings metric.

## Where a player stands — the terms, as formulas

Each term means exactly one thing, and code uses the term only for that thing.
Where two ideas are close, they get two names, never one name stretched over
both. The frontend names are below; the database columns they read are named
in each formula. (The code is converging on these —
[plans/cross-game-consistency.md](../plans/cross-game-consistency.md) tracks
what still differs.)

A negation is `!isFoo` or an `isNotFoo` that means exactly that ([code
conventions → Names about the viewing
player](code-conventions.md#names-about-the-viewing-player)); a negated idea
with a formula of its own is a new term, and goes here.

```js
// isTerminal — the game is over, for everyone.
//   Doesn't mean: I'm out. A player who finished or conceded while the others
//   play on doesn't make it true.
isTerminal = common.games.is_terminal

// isPlayer — I'm seated in this game.
//   Doesn't mean: I'm still playing. A player stays a player after the game,
//   or their part in it, ends. A club member watching is not a player.
isPlayer = /* I have a common.game_players row */

// isConceded — I walked away from a compete game, and forfeit any win.
//   Doesn't mean: I'm out for any other reason. A player who solved, was
//   eliminated or spent their budget has not conceded. Never true in coop: a
//   team can't concede.
isConceded = me.conceded                     // common.game_players.conceded

// isLocallyTerminal — I'm not playing any more, for whatever reason: finished,
//   eliminated, out of budget, or conceded. The game may go on for the others.
//   Doesn't mean: the game is over — that is isTerminal. Doesn't say why: for
//   the reason, read isConceded or the game's own fact (solved, eliminated,
//   budget spent). A locally terminal player who did NOT concede may still win.
isLocallyTerminal = me.locally_terminal      // common.game_players.locally_terminal
// so every conceder is locally terminal:
//   isConceded → isLocallyTerminal

// isStillPlaying — I'm a player, and the game still wants moves from me.
//   Doesn't mean: it's my turn. Waiting for my turn is still playing.
//   Implied by isMyTurn: whoever has the turn is still playing.
isStillPlaying = isPlayer && !isTerminal && !isLocallyTerminal

// isTurnBased — this game has a turn order. Fixed when the game is created.
//   Doesn't mean: someone holds the turn right now.
isTurnBased = /* the players were seated in a turn order: common.game_players.turn_seat is set */

// turnHolderId — the turn pointer as stored: the player the turn order names,
//   or null if it names nobody. A record, not a claim about who is playing.
//   Doesn't mean: that player is still playing, or that the game is still on —
//   the pointer is not cleared when a game ends, and a player can go locally
//   terminal while holding it. Doesn't mean "free-for-all" when null — that is
//   !isTurnBased. Never ask "is it my turn?" of this alone.
turnHolderId = common.games.current_turn_user_id

// isMyTurn — I'm still playing, and the move is mine: I hold the turn, or the
//   game has no turn order (a free-for-all game, where every player may move).
//   Doesn't mean: the pointer merely names me. A player who is out, or a
//   finished game, never has the turn; and a turn-based game whose pointer
//   names nobody is nobody's turn, never everybody's. A game with its own turn
//   structure (codenamesduet's sudden death, where the move belongs to whoever
//   still has words to guess) supplies isMyTurn itself — by this same meaning.
isMyTurn = isStillPlaying && (!isTurnBased || turnHolderId === me)

// isWaitingForTurn — I'm still playing, and the move is someone else's.
//   Only possible in a turn-based game: in a free-for-all isMyTurn is
//   isStillPlaying.
//   Doesn't mean: I'm out, or the game is over — nothing is coming to either.
//   Doesn't mean: the board is inert — a game that drafts off-turn (scrabble)
//   keeps it live while I wait. So a board dims on
//   isWaitingForTurn && !isBoardInteractive, and the whose-turn line and the
//   waiting message read isWaitingForTurn alone.
isWaitingForTurn = isStillPlaying && !isMyTurn

// draftsOffTurn — the game lets a waiting player try out a move on the board
//   (scrabble: place tiles, not play them). A fixed fact about the game — its
//   manifest.
//   Doesn't mean: a move can be committed off-turn. Committing always asks
//   isMyTurn.
draftsOffTurn = manifest.draftsOffTurn

// isBoardInteractive — the board responds to me: things hover, and it takes a
//   click, a drag or a key. When it isn't, it is shown but inert.
//   Doesn't mean: I may commit a move — that is isMyTurn, and a game that
//   drafts off-turn has an interactive board while !isMyTurn. Doesn't mean:
//   I'm not viewing a past turn — the history viewer blocks input itself.
//   Doesn't mean: no move is in flight — the single-flight `pending` blocks
//   that.
isBoardInteractive = draftsOffTurn ? isStillPlaying : isMyTurn

// isViewingHistory — a past turn is drawn on the board.
//   Doesn't mean: !isBoardInteractive. It changes what the board SHOWS; the
//   live board's isBoardInteractive is unchanged underneath it, and any click
//   or key leaves history.
isViewingHistory = /* the history viewer has a turn open */
```

## How a game ends — the terms (agreed 2026-09-25)

The nomenclature for talking about how a game ends, and how it ended for each
player. Dashed names are the nailed-down terms, not the everyday English words.
These define words only; which choices each game makes is a separate, per-game
determination made in these words. **Where anything else in this doc disagrees,
this section wins** — the older text above and in [Vocabulary](#vocabulary) is
still current but is going away, to be rewritten in these terms. `open-ended`
is retired.

### The game

- **`game-goal`** — what a player or team is trying to reach. Every game that
  can be won or lost has one.
  - **`goal-intrinsic`** — the game's own goal: find the word (wordle), turn
    the board all green (waffle), go out (bananagrams), the highest score
    (scrabble compete), every required word (spellingbee, wordwheel,
    boggle).
  - **`goal-chosen`** — an easier goal picked at setup in place of the
    `goal-intrinsic`: reach Genius in spellingbee. With none picked, the
    `game-goal` is the `goal-intrinsic`.
  - **`goal-none`** — the game has no goal, so it cannot be won or lost: an
    imagined game where the players just enter words they like. A score is
    only a goal as a contest between players.
  - A score contest is a `game-goal` only in a game with a `natural-finish`
    or a `timer-countdown`: something has to say when the points are judged
    (setgame compete: the most sets when the deck is spent).
- **`natural-finish`** — an end the game reaches by its own rules: the bag
  runs out, the deck is spent, the guesses are used up.
  - Doesn't mean: a `timeout`. A timeout is never a
    `natural-finish`; it only stops the game.
  - Doesn't mean: reaching the `game-goal`. A natural-finish ends play
    whether or not anyone met the goal; a crossword ends only by being solved,
    so it has none.
  - Conceded players are left out: "every player's guesses spent" means every
    player who hasn't conceded.
  - A fact about the gametype: setgame has one whether or not a given game
    gets there. For a game that ended that way, see `reached-natural-finish`.
- **`reached-natural-finish`** — this game ended at its `natural-finish`: the
  act that ended it was the rules running out (the last guess spent, the last
  card dealt, the bag emptied).
  - Doesn't mean: nobody won — scrabble's bag running out ends a game someone
    wins.
  - Doesn't mean: ended by conceding. If the last player out conceded, the
    game ended by concession, even when every other player had spent their
    budget; it is the act that ended the game that counts.
- **`goal-progress`** — a player's measurable movement toward the
  `game-goal`: words found, categories solved, score. Each game that uses it
  names its own measure.
- **`author-solution`** — the solution the board was built with: what
  "reveal solution" shows (spellingbee's word list, psychicnum's three
  secrets, the author's crossword grid).
  - Doesn't mean: the only valid solution. Where several are valid
    (crosswords, letterboxed, wordiply), a player can solve without it; see
    `matched-author-solution`.
- **`ranked-by`** — how a compete game judges its players at the end: its
  steps in order, each consulted only when the ones before leave players
  level, ending in what happens when every step is exhausted (wordle:
  fewest guesses → faster; setgame: most sets → `co-winners`). Each compete
  game names its own. A rule, not a result: the order it produces is the
  `final-ranking`.
  - **`tiebreak`** — any step of `ranked-by` after the first. A word for
    prose ("scrabble's official tiebreak"), not a line of its own.
- **`race-game`** — a compete game `ranked-by` speed: the
  first player to `reached-goal` wins. It can't tie: the game row's lock
  serializes two finishes, so one always lands first.
  - Doesn't mean: the game ends at the first finish. That is `ends-when`, a
    separate choice: a race-game may end at once (psychicnum,
    `ends-when-decided`) or play on for a `final-ranking` (a marathon).
  - Doesn't mean: any compete game where time counts. wordle ranks by fewest
    guesses and uses time only as a later step, so it is not a race-game.
  - Doesn't mean: the not-ok kind `race` ([envelopes.md](envelopes.md)), two
    requests colliding.
  - A player in a race-game may be called a **racer**, but only when the race
    itself is the point. In names, comments and docs the word is **player**,
    as in every other compete game.
- **`decided`** — no remaining play can change who wins.
  - Doesn't mean: the game has `ended` — play may go on after it is decided.
- **`player-done`** — the player isn't playing any more, while the game may
  go on for others: the prose word for `isLocallyTerminal`, as `ended` is for
  `isTerminal`. The reasons vary — `reached-goal`, `eliminated`, `conceded`,
  or their allotted play used up without losing by it.
  - Doesn't mean: `won` or `lost` — it says the player stopped, not how it
    went.
  - Doesn't mean: the game `ended`. When the game ends — a Stop, a `timeout`,
    a win — players who were still playing are not player-done; the game is
    over.
- **`loses-by`** — what, other than someone else winning, makes a player
  (or team) lose: in compete what makes a player `eliminated`, in coop what
  fails the team. One or more of the first three (codenamesduet has a move
  budget and a fatal move), or else one of the last two alone:
  - **`loses-by-move-budget`** — every move spends it, right or wrong
    (guesses, swaps).
  - **`loses-by-mistake-budget`** — only a wrong move spends it, so perfect
    play cannot lose.
  - **`loses-by-fatal-move`** — one move ends it (codenamesduet's assassin).
    "Fatal" as in the game, not a code error.
  - **`loses-by-timeout-only`** — nothing to exhaust; only a `timeout` can
    end it in a loss.
  - **`loses-by-none`** — nothing: a player loses only because someone else
    `won` (setgame compete, whose `timeout` crowns the leader).
- **`ends-when`** — when a compete game ends, besides a Stop or a
  `timeout`, which end every game; each compete game is one of the cases
  below, or none: nothing in play ends it, only the Stop or the `timeout`
  (boggle compete without a target).
  - **`ends-when-decided`** — as soon as it is `decided` (crosswords: the
    first to solve it).
  - **`ends-when-all-done`** — only when every player is `player-done`, so the rest
    play on after it is `decided` (wordle: short, and fun to finish).
  - **`ends-when-one-left`** — with two or more players, when only one is not
    yet `player-done`: the last player needn't reach the `game-goal` to end
    it. A solo game ends when its one player is `player-done`.
  - **`ends-when-natural-finish`** — for everyone at once, at its
    `natural-finish`, however long before that it was `decided` (setgame:
    a player already beaten plays the deck out).
- **`timer`** — the game's timer: what `setup.timer` chooses and what the
  screen shows — none, `timer-countup`, or `timer-countdown`. Never "clock".
  - **`timer-countup`** — shows the time elapsed; ends nothing.
  - **`timer-countdown`** — runs down to zero: the only timer that can end a
    game.
- **`timeout`** — a `timer-countdown` reaching zero.
- **`timeout-result`** — what happens at a `timeout`. When nobody has
  `reached-goal`, each game is one of:
  - **`timeout-no-winner`** — nobody won; the `game-goal` existed and nobody
    met it, so everyone `lost` (in coop, the team).
  - **`timeout-best-progress`** — the best `goal-progress` wins.
  - **`timeout-no-result`** — nobody won and nobody lost: the `game-goal`
    existed and nobody met it, but missing it is no loss (a coop word hunt
    with no target, whose goal is every required word). The same neutral
    tone as `no-result`.

  When some players have — possible only in a game that plays on after it is
  `decided` — each such game is:
  - **`timeout-ranking-stands`** — the timeout ends the game and the
    `final-ranking` of those who `reached-goal` stands; the players still
    playing `lost`.
- **`announce-when`** — when results are told; each game is one of:
  - **`announce-when-decided`** — the winner is told as soon as the game is
    `decided`.
  - **`announce-when-ended`** — results come only once the game has `ended`.
- **`progress-shown`** — what a compete player sees of a rival's progress
  during play; at the end, every game shows everything. Compete only. One or
  more of the last two, or else the first alone:
  - **`progress-shown-none`** — nothing.
  - **`progress-shown-milestones`** — where a rival stands, in coarse steps
    and never a number: solved, out of swaps, a rank reached (Genius).
  - **`progress-shown-count`** — a live number per rival; the card says what
    it counts (sets found, categories found, hints used).
- **`ended`** — the game is over for everyone: the prose and player-facing
  word for `isTerminal`.
  - Doesn't mean: `stopped` — a game ends many ways, and being stopped is one.
- **`stopped`** — any player stopped the whole game (the **Stop** action,
  formerly "End"). Nobody else `won` or `lost` it; players who `conceded`
  stay `conceded`, and so `lost`. Shown in a neutral tone.
  - **`decided-stands`** — stopping a game that is already `decided` keeps its
    win: the Stop only ends the play-on.
- **`no-result`** — a `goal-none` game reached its end (its `natural-finish`,
  or a `timeout`): nobody `won` or `lost`. The same neutral tone as `stopped`,
  but a different word — nobody chose to stop it.

### The player

- **`reached-goal`** — the player (or team) met the `game-goal`, whether the
  `goal-intrinsic` or a `goal-chosen`. Winning and losing are judged against
  it.
  - Doesn't mean: `solved` — reaching Genius is not solving spellingbee.
- **`solved`** — completed the puzzle: the game's own end state, whether or
  not it is the `game-goal`. In coop, the team's. The word found (wordle),
  the board all green (waffle), every word found (spellingbee, boggle), the
  three hidden words found (psychicnum), five words found (wordiply), the
  deck cleared of sets (setgame).
  - Where a game has nothing to complete (scrabble), it is not applicable,
    not false.
  - Doesn't mean: `reached-goal`; see there.
  - Doesn't mean: `won`. Nor is it needed to win: a compete game's
    `ranked-by` can crown a player who never solved (the most sets in
    setgame, the best score at a `timeout` in wordiply).
- **`perfect-play`** — `solved` in the best possible way: wordle in one guess,
  letterboxed in two words, waffle at par. Measured in moves, never time.
  Implies `solved`. Each game that has it names what counts (connections with no
  mistakes? strands with no hints?); where a game has no such distinction, it
  is not applicable, not false.
  - Doesn't mean: `won` — a player with perfect play can lose to an equally
    good game played faster.
- **`matched-author-solution`** — the player's solution is exactly the
  game's `author-solution` (the author's crossword grid; letterboxed's two
  built-in words). Meaningful only where several different solutions
  are valid. A fact the game uses — it decides whether "reveal solution" is
  offered on a solved game — not an outcome shown to the player.
  - Doesn't mean: `solved` or `perfect-play` — both can hold without it.
- **`won`** — decided by the game's `ranked-by`.
  - In coop, the whole team wins or doesn't.
  - In compete, one player wins, or **`co-winners`** share it when the
    steps of `ranked-by` leave them level, or nobody does.
  - A player who `conceded` can never win.
  - Doesn't mean: `solved`, `perfect-play` or `reached-goal` — each can hold
    for a player who did not win.
- **`lost`** — the game went against the player:
  - in coop, the team failed the `game-goal`;
  - in compete, someone else `won` (every place in the `final-ranking`
    below first is lost), or the player was `eliminated`, or `conceded`, or their `game-goal`
    became impossible.
  - Doesn't mean: "didn't win". A player in a `stopped` or `no-result` game,
    or at a `timeout-no-result`, who had not conceded neither won nor lost.
- **`conceded`** — a compete player voluntarily withdrew: a loss by choice.
  The player has `lost`; conceded says how, as `eliminated` does. Compete
  only. Never "quit".
  - Doesn't mean: anyone else `won` — see `win-is-earned`.
  - If every player concedes, nobody won, everybody lost, and the game has
    `ended`.
- **`eliminated`** — out by the game's own rules (out of guesses, out of
  mistakes). The player has `lost`, at once, while the others play on.
- **`final-ranking`** — the order the players end in, by `ranked-by`, in a
  game that plays on after it is `decided`. A player who
  failed — `eliminated`, `conceded`, or short of a finish line the game has —
  is not ranked (`no-best-of-the-losers`); in a score contest that leaves
  everyone who didn't concede. Ties share a place. First is `won`; every
  other place is `lost`.
  - Doesn't mean: the players who are, or aren't, `player-done`. A solver is
    `player-done` and ranked; a conceder is `player-done` and not.

### Hints

A **hint** is what a game hands a stuck player ([Vocabulary](#vocabulary)).
Independent things describe a game's hints, and each mode of a game answers
them separately (hints may be banned in compete and free in coop).

- **What a hint costs** — exactly one of:
  - **`hint-banned`** — not offered at all (setgame compete).
  - **`hint-scored`** — counted in the game's `ranked-by` (strands compete).
  - **`hint-free`** — costs nothing to use.
- **`hint-earned`** — won by play before it can be used (strands' bar). Goes
  with `hint-free` or `hint-scored`, never `hint-banned`.
  - Doesn't mean: a cost. Earning decides when a hint is there to use, not
    what using it costs.
- **`hint-self-informative`** — what a hint tells: it can tell a player they
  are wrong, never hand them progress.
  - Doesn't mean: `hint-free`. A free hint may hand over progress, and a
    self-informative one may cost something. They describe cost and content,
    two separate things.
- **`hint-spoiler`** — what a hint tells: it hands over an answer with
  nothing left to work out, so the player only has to enter it (psychicnum's
  secret word, stackdown's next word, a crossword's revealed letter). It is
  the way out for a player who is stuck. A spoiler is a hint, with its own
  cost and recording like any other; the tag mostly sets its button and its
  wording apart ("reveal a word" vs "hint at a word").
  - Doesn't mean: a generous hint. One that still leaves work to do is a
    `hint`, however much it gives: strands rings a word's tiles but not
    their order.
  - Never `hint-self-informative`: handing over the answer is progress.
- **`hint-recorded`** — a hint is stored with the game. Any of the costs may
  be recorded or not.
  - Doesn't mean: `hint-scored` — a recorded hint may cost nothing.
- **`hint-priced`** — the name of the existing compete rule ("the priced-hint
  rule" in the code and the older text), stated in these terms: in compete a
  hint is `hint-banned`, `hint-scored`, `hint-earned`, or `hint-free` and
  `hint-self-informative`. Recorded here as the rule that stands today, not
  ruled anew.

### The rules

- **`win-is-earned`** — a win is never inherited: a player left alone after
  the others `conceded` must still `reached-goal` to win, or can lose. (The
  same rule as "no survival wins", above.) So a game can end with nobody
  winning.
- **`no-best-of-the-losers`** — failing is final: among players who failed,
  nobody is crowned for having done better (two connections players who both
  run out of mistakes both `lost`, whatever their categories).
- A player who `conceded` can never win.
- `solved` and `perfect-play` survive a `stopped` game: a player who solved
  before the Stop still solved, and simply didn't win.

## Vocabulary

Prefer these in docs, comments, identifiers and setup keys.

| term | meaning |
|---|---|
| **finish (line)** | what "done" is for one player or team; **built-in**, **target** (setup-chosen), or **none** |
| **open-ended** | a target-capable game played without a target — it can only end neutrally |
| **race** / **best** | the two compete styles: the first finisher ends it, or everyone plays out and a ranking decides |
| **first past the post** | the race mechanism — an instant end, serialized by the lock, so no ties |
| **play out** | the best-style property: the game waits for every player |
| **locally terminal** | not playing any more, for whatever reason — finished, eliminated, out of budget, or conceded — while others may play on; `common.game_players.locally_terminal` ([common.md](common.md)). See [Where a player stands](#where-a-player-stands--the-terms-as-formulas) |
| **standings** | partial progress read as a ranking |
| **all lose** / **rank the finishers** / **rank the standings** | the three things a timeout can do |
| **the reachable-end rule** | a timeout is a loss iff an end was reachable and unreached ([states.md](states.md)) |
| **collective loss** | everyone loses together — `lost` / `lost_compete`, no winner |
| **collective finish** | a finish nobody reaches alone: the bag or the deck running out for everyone |
| **no survival wins** | outliving never wins; conceding or elimination can't crown anyone |
| **move budget** / **mistake budget** / **sudden death** / **clock only** / **refundable budget** | where a coop loss comes from |
| **quality-then-speed** | best's tiebreak ordering (`<metric>, solved_at`) |
| **co-winners** | a shared win: a ranking exhausted with players still level, or one with no tiebreak at all |
| **comparator** | a lexicographic ranking — later components matter only on an exact tie |
| **composite score** | a weighted blend of ranking components into one number that IS the ranking |
| **shared clock** / **player clock** | the one game-level countdown / a per-player budget spent on your own turns |
| **flag fall** | a player clock running out — an automatic **concede**, never a crowning |
| **standings on a loss** | a collective loss that records who was ahead, without adjudicating |
| **hint** | what a game hands a stuck player: a nudge, a reveal, a check, an AI suggestion. **Never "help"** — help is the text explaining a form field, the rules of a game, or what an AI does (Joel, 2026-09-17) |
| **priced hint** | the compete rule: banned, earned, scored, or free only if self-informative |
| **refusing to lose** | stalling a best game to avoid the ranking — out of scope, never defended against |
