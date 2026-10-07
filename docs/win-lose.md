# Win & lose

The ideas every game's winning and losing is built from, and the words for
them. Each game's own rules — what wins, what loses, what its timer does — are
in its doc; this is what those rules are made of, and the invariants none of
them may break.

## The three primitives

1. **The goal** (`game-goal`) — what a player or team is trying to reach,
   and who supplies it:
   - **An intrinsic goal** (`goal-intrinsic`) — the game's own: find the word
     (wordle), find all four categories (connections), find every required
     word (spellingbee).
   - **A chosen goal** (`goal-chosen`) — players pick the target in the setup
     form (a rank, a percentage), and it becomes the goal in place of the
     intrinsic one. Without a target, the intrinsic goal is the goal.
   - **No goal** (`goal-none`) — the game can't be won or lost: an imagined
     game where the players just enter words they like.
2. **When a compete game ends** (`ends-when`) — what one player meeting the
   goal means to the others:
   - **It ends when decided** (`ends-when-decided`) — the first player to
     meet the goal ends the game on the spot. Ties can't happen: the game
     row's lock serializes two simultaneous finishes, so the first commits
     the winner and the second finds a finished game.
   - **It plays out** (`ends-when-all-done`) — a player who meets the goal is
     **player-ended** while the others continue, and the ranking decides
     at the end. Ties break **quality-then-speed** (`order by <metric>,
     solved_at`); a game whose ranking deliberately has no speed step has
     **co-winners** instead.

   A **race** (`race-game`) is ranked by speed: the first to meet the goal
   wins. That is a separate choice from when it ends: psychicnum's race ends
   when decided, and a race could play out to rank the rest.
3. **What a timeout does** (`timeout-result`):
   - **It ranks by goal** (`timeout-ranks-by-goal`) — only players who met
     the goal are ranked; the ones still going simply didn't. The winner is
     "solved, and best at it", never "got furthest". If nobody met the goal,
     everyone lost, however high the scores.
   - **It ranks by progress** (`timeout-ranks-by-progress`) — each player's
     progress (`goal-progress`) is the result, and the timer is just how the
     session stops. A player who made no progress isn't ranked.
   - **No result** (`timeout-no-result`) — nobody met the goal, but missing
     it is no loss: a coop word hunt with no target ends neutrally.

**A game that ends when decided has nobody at the goal when its timer runs
out**, so ranking by goal means everyone lost. Such a game may rank by
progress instead, when its progress is a real measure of it — a deliberate
departure, recorded in that game's doc.

**A collective finish** is an `exhaustible-resource` everyone shares: the bag
or the deck runs out for everyone at once. Its timeout ranks
by progress when progress at any moment is a complete result (a count of sets
taken, a score), and otherwise by goal.

## Where a coop loss comes from

Where the win comes from (the goal) and where the loss comes from
(`loses-by`) are two separate choices. The ways a coop team loses:

- **A move budget** (`loses-by-move-budget`) — every move spends it
  (guesses, swaps).
- **A mistake budget** (`loses-by-mistake-budget`) — only a wrong move
  spends it, so perfect play cannot lose.
- **A fatal move** (`loses-by-fatal-move`) — one move ends it
  (codenamesduet's assassin).
- **Timeout only** (`loses-by-timeout-only`) — nothing to exhaust; the only
  way to lose is running out of time. A game whose board cannot dead-end has
  only this.

A **refundable budget** is not a way to lose: a cap that blocks play but that
undo refunds, so it can never lose the game (letterboxed's word cap).

A game with no goal can gain a target through an opt-in setup knob, and a
timeout that loses comes with it. Where the game also has a bounded session,
reaching the session's end below the target then becomes a loss rather than a
neutral stop — a bigger change than arming the timer, and one to make
knowingly.

## The invariants

**A win is earned** (`win-is-earned`). Outliving never wins. When every
player concedes or is eliminated, everyone lost, in every game, and a last
player standing must still meet the goal. If surviving crowned you,
conceding would hand out wins. This is the rule a newly ported game is most
likely to break by accident.

**Refusing to lose is out of scope** (ruled 2026-08-07). In a game that plays
out, a trailing player could stall forever rather than be ranked. A site for
strangers would defend against that; this one does not — the trust model
(CLAUDE.md: friends, not strangers) answers it. **Don't propose anti-stall
machinery.** The remedy is opt-in: play with a countdown timer
(`timer-countdown`), whose timeout ranks the players, and Stop is the social
way out of a timerless standoff.

## Timer fairness

The shared game timer is fair exactly when play is **simultaneous**: wall time
is every player's thinking time equally. In **turn-based compete** it is not —
a rival's deliberation spends your time, and a slow opponent can lose the game
for both of you. In turn-based coop the shared timer is right: a shared fate is
the point of coop.

The turn-based-compete answer is a **player timer**: each player's own
countdown, spent only on their own turns. **A player timer running out is an
automatic concede** — never "time's up, the opponent wins", which would be
winning by outliving (`win-is-earned`). As a concede it composes with everything already here: the
survivor plays on and must still meet the goal, and if every player timer
runs out, everyone conceded, so everyone lost. It is real work — today's timer is one
game-level count, and a player timer needs per-player accounting and
server-side detection of its running out.

## Ideas, not built

- **`setup.compete_style`** — an opt-in choice in setup of when a compete
  game ends (`ends-when`): when decided, or playing out. The shape of coop's
  `coop_style: 'turns'`, validated by `create_game` and branched where
  the game ends; not a new gametype. A game needs a per-player goal for
  playing out to rank anything, and something slower than a typing contest
  for ending when decided to mean anything.
- **Progress on a loss** — keep a verdict where everyone lost a loss, but
  attach who was ahead ("Lost (out of time) · closest: melissa 4/6") rather
  than crowning anyone. Weighed against crowning the closest and preferred:
  "closest" is ill-defined in most games with an intrinsic goal, and crowning
  a shared failure muddies won and lost. The carriers exist (each player's
  `player_status`, the end-of-game reveals); the work is each game's choice of progress
  measure.

## Where a player stands — the terms, as formulas

Each term means exactly one thing, and code uses the term only for that thing.
Where two ideas are close, they get two names, never one name stretched over
both. The frontend names are below; the database columns they read are named
in each formula. (The code is converging on these —
[plans/cross-game-consistency.md](../plans/cross-game-consistency.md) tracks
what still differs.)

The terms about a player are facts about a seat, computed for every player in
the game and read off the player (`p.isOnTurn`); the viewer is one of them,
`gd.me`, and is always a player
([plans/seat-view.md](../plans/seat-view.md)). "I" below reads as "this
player".

A negation is `!isFoo` or an `isNotFoo` that means exactly that ([code
conventions → Names about the viewing
player](code-conventions.md#names-about-the-viewing-player)); a negated idea
with a formula of its own is a new term, and goes here.

```js
// isGameEnded — the game is over, for everyone.
//   Doesn't mean: I'm out. A player who finished or conceded while the others
//   play on doesn't make it true.
isGameEnded = common.games.ended_at !== null

// isConceded — I walked away from a compete game, and forfeit any win.
//   Doesn't mean: I'm out for any other reason. A player who solved, was
//   eliminated or spent their budget has not conceded. Never true in coop: a
//   team can't concede.
isConceded = me.player_ended_reason === 'conceded'   // common.game_players.player_ended_reason

// isPlayerEnded — I'm not playing any more, for whatever reason: finished,
//   eliminated, out of budget, or conceded. The game may go on for the others.
//   Doesn't mean: the game is over — that is isGameEnded. Doesn't say why: for
//   the reason, read isConceded or the game's own fact (solved, eliminated,
//   budget spent). A player-ended player who did NOT concede may still win.
isPlayerEnded = me.player_ended_at !== null          // common.game_players.player_ended_at
// so every conceder is player-ended:
//   isConceded → isPlayerEnded

// isStillPlaying — the game still wants moves from me.
//   Doesn't mean: it's my turn. Waiting for my turn is still playing.
//   Implied by isOnTurn: whoever has the turn is still playing.
isStillPlaying = !isGameEnded && !isPlayerEnded

// isTurnBased — this game has a turn order. Fixed when the game is created.
//   Doesn't mean: someone holds the turn right now.
isTurnBased = /* the players were seated in a turn order: common.game_players.turn_seat is set */

// turnHolderId — the turn pointer as stored: the player the turn order names,
//   or null if it names nobody. A record, not a claim about who is playing.
//   Doesn't mean: that player is still playing, or that the game is still on —
//   the pointer is not cleared when a game ends, and a player's own end can
//   come while holding it. Doesn't mean "free-for-all" when null — that is
//   !isTurnBased. Never ask "is it my turn?" of this alone.
turnHolderId = common.games.current_turn_user_id

// isOnTurn — I'm still playing, and the move is mine: I hold the turn, or the
//   game has no turn order (a free-for-all game, where every player may move).
//   Doesn't mean: the pointer merely names me. A player who is out, or a
//   finished game, never has the turn; and a turn-based game whose pointer
//   names nobody is nobody's turn, never everybody's. A game with its own turn
//   structure (codenamesduet's sudden death, where the move belongs to whoever
//   still has words to guess) supplies isOnTurn itself — by this same meaning.
//   Asked of the viewer it is gd.me.isOnTurn; the hook derives it, so no
//   component compares the pointer to an id itself.
isOnTurn = isStillPlaying && (!isTurnBased || turnHolderId === p.id)

// isWaitingForTurn — I'm still playing, and the move is someone else's.
//   Only possible in a turn-based game: in a free-for-all isOnTurn is
//   isStillPlaying.
//   Doesn't mean: I'm out, or the game is over — nothing is coming to either.
//   Doesn't mean: the board is inert — a game that drafts off-turn (scrabble)
//   keeps it live while I wait. So a board dims on
//   isWaitingForTurn && !isBoardInteractive, and the whose-turn line and the
//   waiting message read isWaitingForTurn alone.
isWaitingForTurn = isStillPlaying && !isOnTurn

// draftsOffTurn — the game lets a waiting player try out a move on the board
//   (scrabble: place tiles, not play them). A fixed fact about the game — its
//   manifest.
//   Doesn't mean: a move can be committed off-turn. Committing always asks
//   isOnTurn.
draftsOffTurn = manifest.draftsOffTurn

// isBoardInteractive — the board responds to me: things hover, and it takes a
//   click, a drag or a key. When it isn't, it is shown but inert.
//   Doesn't mean: I may commit a move — that is isOnTurn, and a game that
//   drafts off-turn has an interactive board while !isOnTurn. Doesn't mean:
//   I'm not viewing a past turn — the history viewer blocks input itself.
//   Doesn't mean: no move is in flight — the single-flight `pending` blocks
//   that.
isBoardInteractive = draftsOffTurn ? isStillPlaying : isOnTurn

// isViewingHistory — a past turn is drawn on the board.
//   Doesn't mean: !isBoardInteractive. It changes what the board SHOWS; the
//   live board's isBoardInteractive is unchanged underneath it, and any click
//   or key leaves history.
isViewingHistory = /* the history viewer has a turn open */
```

## How a game ends — the terms (agreed 2026-09-25)

The nomenclature for talking about how a game ends, and how it ended for each
player. Dashed names are the nailed-down terms: the names for game cards and
for code. Prose, here and in other docs, may use the everyday words instead;
[Vocabulary](#vocabulary) pairs each with its term. These define words only;
which choices each game makes is a separate, per-game determination made in
these words. **Where anything else in this doc disagrees, this section
wins.**

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
- **`exhaustible-resource`** — what the game can run out of, ending play by
  its own rules: the bag, the deck, every player's guesses.
  - Doesn't mean: time. A `timeout` is never an exhausted resource; it only
    stops the game.
  - Doesn't mean: the `game-goal`. Running out ends play whether or not
    anyone met the goal; a crossword ends only by being solved, so it has
    none.
  - Conceded players are left out: "every player's guesses" means every
    player who hasn't conceded.
  - A fact about the gametype: setgame has one whether or not a given game
    gets there. For a game that ended that way, see `resource-exhausted`.
- **`resource-exhausted`** — this game ended because its
  `exhaustible-resource` ran out: the act that ended it was the last guess
  spent, the last card dealt, the bag emptied.
  - Doesn't mean: nobody won — scrabble's bag running out ends a game someone
    wins.
  - Doesn't mean: ended by conceding. If the last player out conceded, the
    game ended by concession, even when every other player had spent their
    budget; it is the act that ended the game that counts.
- **`all-passed`** — this game ended because every active player passed in
  a row (scrabble compete).
  - Doesn't mean: `resource-exhausted`. Nothing ran out; nobody would move.
- **`goal-progress`** — a player's measurable movement toward the
  `game-goal`: words found, categories solved, score. Each game that uses it
  names its own measure. A player has made progress when their measure is
  above zero.
- **`score-formula`** — how a game counts a player's score: what earns
  points, and how many (spellingbee: one point for a four-letter word, one
  per letter for a longer one, and a bonus for a pangram). Each game that
  keeps a score names its own, and says there what its score is called.
  - Doesn't mean: `goal-progress`. Progress may be read off the score
    (spellingbee's rank), or be something else entirely (letterboxed's
    letters covered, where nothing is scored).
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
- **`score-only-contest`** — a compete game won only by the best score, with
  no fixed point a player can reach partway through: scrabble, setgame,
  wordiply, boggle without a target. Something has to say when the score is
  judged, so it needs an `exhaustible-resource` or a `timer-countdown`.
  - Doesn't mean: any game that keeps a score or a count. letterboxed counts
    letters covered, but its goal is a fixed point (all twelve letters), and
    the count only ranks players at a `timeout`.
- **`decided`** — no remaining play can change who wins.
  - Doesn't mean: the game has `ended` — play may go on after it is decided.
  - Doesn't mean: the game has a `final-ranking`. Only the winner is known;
    the ranking comes at the end.
- **`player-ended`** — the player isn't playing any more, while the game
  may go on for others: `isPlayerEnded` in code, as `ended` is
  `isGameEnded`, and `common.game_players.player_ended_at` in the database,
  with the player's reason pair beside it.
  The reasons vary — `reached-goal`, `eliminated`, `conceded`, or their
  allotted play used up without losing by it.
  - Doesn't mean: `won` or `lost` — it says the player stopped, not how it
    went.
  - Doesn't mean: the game `ended`. When the game ends — a Stop, a `timeout`,
    a win — players who were still playing are not `player-ended`; the
    game is over.
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
  `timeout`, which end every game; each compete game is one or more of the
  cases below, or none: nothing in play ends it, only the Stop or the `timeout`
  (boggle compete without a target).
  - **`ends-when-decided`** — as soon as it is `decided` (crosswords: the
    first to solve it).
  - **`ends-when-all-done`** — only when every player is `player-ended`,
    so the rest play on after it is `decided` (wordle: short, and fun to
    finish).
  - **`ends-when-one-left`** — with two or more players, when only one is not
    yet `player-ended`: the last player needn't reach the `game-goal` to
    end it. A solo game ends when its one player is `player-ended`.
  - **`ends-when-resource-exhausted`** — for everyone at once, when its
    `exhaustible-resource` runs out, however long before that it was
    `decided` (setgame: a player already beaten plays the deck out).
  - **`ends-when-all-passed`** — for everyone at once, when every active
    player passes in a row (scrabble).
- **`timer`** — the game's timer: what `setup.timer` chooses and what the
  screen shows — none, `timer-countup`, or `timer-countdown`. Never "clock".
  - **`timer-countup`** — shows the time elapsed; ends nothing.
  - **`timer-countdown`** — runs down to zero: the only timer that can end a
    game.
- **`timeout`** — a `timer-countdown` reaching zero.
- **`timeout-result`** — what happens at a `timeout`: how the players are
  ranked when the timer runs out. Each game is one of:
  - **`timeout-ranks-by-goal`** — only players who `reached-goal` are
    ranked, by `ranked-by`. A player who fell short isn't ranked, so they
    `lost`. If nobody reached the goal, everyone `lost`
    (`timeout-no-winner`).
  - **`timeout-ranks-by-progress`** — every player who made progress is
    ranked, by `goal-progress`. A player who made none isn't ranked, so they
    `lost`. If nobody made progress, everyone `lost` (`timeout-no-winner`).
  - **`timeout-no-result`** — nobody won and nobody lost: the `game-goal`
    existed and nobody met it, but missing it is no loss (a coop word hunt
    with no target). The same neutral tone as `no-result`.
- **`timeout-no-winner`** — the outcome when a timeout ranks nobody: nobody
  won, and everyone `lost` (in coop, the team). A result, not a choice a
  game makes.
- **`announce-when`** — when results are told; each game is one of:
  - **`announce-when-decided`** — the winner is told as soon as the game is
    `decided`, before there is a `final-ranking`.
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
  word for `isGameEnded`.
  - Doesn't mean: `stopped` — a game ends many ways, and being stopped is one.
- **`stopped`** — any player stopped the whole game (the **Stop** action,
  formerly "End"). Nobody else `won` or `lost` it; players who `conceded`
  stay `conceded`, and so `lost`. Shown in a neutral tone.
  - **`decided-stands`** — stopping a game that is already `decided` keeps its
    win: the Stop only ends the play-on.
- **`no-result`** — a `goal-none` game reached its end (its
  `exhaustible-resource` ran out, or a `timeout`), or a game's
  `exhaustible-resource` ran out with its `game-goal` missed where missing it
  is no loss (setgame coop: the deck emptied with tiles left over): nobody
  `won` or `lost`. The same neutral tone as `stopped`, but a different word —
  nobody chose to stop it.

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
- **`won`** — the player is first by the game's `ranked-by`: known once the
  game is `decided`, and recorded at the end as a `final-ranking` of 1.
  - In coop, the whole team wins or doesn't: every player is ranked 1, or
    none is.
  - In compete, one player wins, or **`co-winners`** share 1 when the steps
    of `ranked-by` leave them level, or nobody does.
  - A player who `conceded` can never win: a conceder is never ranked.
  - Doesn't mean: `solved`, `perfect-play` or `reached-goal` — each can hold
    for a player who did not win.
- **`near`** — the player is ranked, but not first: they cleared the game's
  bar for a `final-ranking` and someone did better. In wordle the slower
  solver is `near`; the player who never solved is `lost`. Compete only. It
  reads as the place, "2nd", never "Lost"; the place and its outcome never
  depend on how many played.
  - Doesn't mean: `lost` — a `near` player was beaten, not failed.
- **`lost`** — the game went against the player:
  - in coop, the team failed the `game-goal`;
  - in compete, the player was `eliminated`, or `conceded`, or their
    `game-goal` became impossible, or someone else `won` and the player was
    not ranked.
  - Doesn't mean: "didn't win". A ranked player below first is `near`; a
    player in a `stopped` or `no-result` game, or at a `timeout-no-result`,
    who had not conceded neither won nor lost.
- **`conceded`** — a compete player voluntarily withdrew: a loss by choice.
  The player has `lost`; conceded says how, as `eliminated` does. Compete
  only. Never "quit".
  - Doesn't mean: anyone else `won` — see `win-is-earned`.
  - If every player concedes, nobody won, everybody lost, and the game has
    `ended`.
- **`eliminated`** — out by the game's own rules (out of guesses, out of
  mistakes). The player has `lost`, at once, while the others play on.
- **`final-ranking`** — each player's ranking at the end, by `ranked-by`, in
  every game: a number, or none for a player who isn't ranked. In coop the
  team shares one: 1 when it won, none when it did not. A player who failed
  — `eliminated`, `conceded`, or short of a goal the game has — is not
  ranked (`no-best-of-the-losers`); in a `score-only-contest` that leaves
  everyone who didn't concede and made progress. Players level on every step of `ranked-by`
  share a ranking, and the next one skips: two tied for first are both 1,
  and the player after them is 3. A ranking of 1 is `won`; any other ranking
  is `near`.
  - Doesn't mean: the players who are, or aren't, `player-ended`. A
    solver is player-ended and ranked; a conceder is player-ended and not.
  - Doesn't mean: everyone unranked `lost`. In a `stopped` or `no-result`
    game the unranked neither won nor lost, except the conceders; a
    `decided-stands` win keeps its 1.
- **`outcome-at-player-end`** — a player who becomes `player-ended` while
  the game goes on gets an outcome at once, read off the game's card:
  - `lost` — `eliminated` by one of the game's `loses-by`, or `conceded`
  - `won` — `reached-goal` in a game that `ends-when-decided`, which ends
    with them
  - `neutral` — otherwise: the game cannot judge yet (`announce-when-ended`,
    or `loses-by-none`)
  - Doesn't mean: final. The game's end writes every player's outcome from
    the `final-ranking`, so a `neutral` solver comes out `won` or not, and a
    `stopped` game leaves an `eliminated` player neither won nor lost.

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

### The rules

- **`win-is-earned`** — a win is never inherited: a player left alone after
  the others `conceded` must still `reached-goal` to win, or can lose. (The
  invariant "A win is earned", above.) So a game can end with nobody
  winning.
- **`no-best-of-the-losers`** — failing is final: among players who failed,
  nobody is crowned for having done better (two connections players who both
  run out of mistakes both `lost`, whatever their categories).
- A player who `conceded` can never win.
- `solved` and `perfect-play` survive a `stopped` game: a player who solved
  before the Stop still solved, and simply didn't win.

## Vocabulary

One concept, one name. The terms (in backticks) are the names for game cards
and for code. Prose may use a term's plain short form ("the goal" for
`game-goal`, "plays out" for `ends-when-all-done`), naming the term once per
section to tie the two together — never a second name for the same concept.

**Words prose keeps** — a short form of a term, or a thing no term names:

| word | the term | meaning |
|---|---|---|
| **target** | `goal-chosen` | the setup field players pick a chosen goal with (a rank, a percentage) |
| **plays out** | `ends-when-all-done` | the game waits for every player, and a ranking decides at the end |
| **race** | `race-game` | ranked by speed: the first to meet the goal wins, whether or not the game ends there |
| **player-ended** | `player-ended` | not playing any more, for whatever reason — met the goal, eliminated, out of budget, or conceded — while others may play on; `common.game_players.player_ended_at` ([common-schema.md](common-schema.md)). See [Where a player stands](#where-a-player-stands--the-terms-as-formulas) |
| **move budget** / **mistake budget** | `loses-by-move-budget` / `loses-by-mistake-budget` | what a wrong (or any) move spends |
| **collective finish** | — | an `exhaustible-resource` everyone shares: the bag or the deck running out for everyone |
| **refundable budget** | — | a cap that blocks play but that undo refunds, so it never loses the game |
| **quality-then-speed** | — | a ranking whose steps are a measure, then speed as its `tiebreak` (`<metric>, solved_at`) |
| **composite score** | — | a score made of parts: a weighted blend of components into one number that IS the ranking |
| **shared timer** / **player timer** | `timer` | the one game-level countdown / a per-player countdown spent on your own turns |
| **hint** | `hint` | what a game hands a stuck player: a nudge, a reveal, a check, an AI suggestion. **Never "help"** — help is the text explaining a form field, the rules of a game, or what an AI does (Joel, 2026-09-17) |
| **reveal** | `hint-reveal` | while hint-reveal is formally a kind of hint, when using in prose, make it clear that this reveals an answer |  
| **refusing to lose** | — | stalling a game that plays out to avoid the ranking — out of scope, never defended against |

**Retired words** — second names for a concept that has one. Older docs and
comments still use them; say the right-hand word instead:

| retired | say instead |
|---|---|
| player-done | player-ended (`player-ended`) |
| finish (line), built-in, none | the goal (`game-goal`): intrinsic (`goal-intrinsic`), no goal (`goal-none`) |
| first past the post | ends when decided (`ends-when-decided`) |
| natural finish | ran out (`resource-exhausted`); for the gametype's rule, `exhaustible-resource`; scrabble's all-pass is `all-passed` |
| best | plays out (`ends-when-all-done`) |
| standings | progress (`goal-progress`) |
| rank the finishers, all lose | ranks by goal (`timeout-ranks-by-goal`); nobody wins |
| rank the standings | ranks by progress (`timeout-ranks-by-progress`) |
| collective loss | everyone lost |
| no survival wins | a win is earned (`win-is-earned`) |
| sudden death (as a way to lose) | a fatal move (`loses-by-fatal-move`) |
| clock only, timer only | timeout only (`loses-by-timeout-only`) |
| comparator | ranked by (`ranked-by`) |
| clock | timer (`timer`) |
| open-ended | a game with no target |
| the reachable-end rule | what a timeout does (`timeout-result`); the rule is no longer true, since `timeout-no-result` misses a goal without a loss |
