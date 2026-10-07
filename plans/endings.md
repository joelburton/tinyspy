# Endings — every winner, my outcome, and the word "ending"

**Status: decided 2026-10-06, being built; steps 1–3 are done; step 4 (each game) is under way — psychicnum, boggle, spellingbee, wordwheel and setgame are done.** How a game's ending is named,
stored and shown: the word "terminal" goes, every winner is named from the
final ranking, the club page's line can speak to the viewer, and the game page
always shows MY outcome.

## Decided

- **The names.** "Terminal" goes everywhere: identifiers, CSS, SQL, comments,
  docs. Each use becomes one of three:
  - **the game's ending** — `isGameEnded`, `GameEnded…`
    (cross-game-consistency → "Terminal" → "ended" settled these stems)
  - **a player's end** — `isPlayerEnded`, `PlayerEnded…`
  - **either one** — plain `ending` (`endingFrame`, `EndingMessage`,
    `common/ending/`); `eitherEnding` only where the plain word could be
    misread as the game's
- **Winners come from the final ranking.** A `finalRanking` of 1 is `won`, none
  is `lost`, any other is `near` — what `common._end_game` already writes.
  Some games cannot have co-winners by their rules; the blobs hold several
  anyway.
- **The blobs carry the ranking, not a winner.** The winners are exactly the
  players with `finalRanking` 1, and every player carries it, so `ending` loses
  `winner` in both blobs, and scrabble's and setgame's own `winnerIds` go.
- **`gd.ending.winners` is built once, in common.** The players ranked 1, in
  seat order: empty when nobody won, the whole team in a coop win, every
  co-winner in a tie. It replaces each `useGame`'s `winner:
  playerOf(ending.winner)`. "Did I win" is `gd.me.outcome`, already there; no
  second field says it. The club page gets the same list of ids from a shared
  helper over `summary_data`'s players, for `summaryFor` to name.
- **`summary_data` carries every player** as `game_data` has them for how they
  came out: `id`, `ending`, `outcome`, `finalRanking`, `conceded`, `solved`,
  `stillPlaying` (`SummaryPlayer`, that subset of `PlayerRaw`). Always written,
  for every game.
- **A player's ending label says how they came out**, in one place per game.
  `common/ending/endingLabel.ts` holds the shape (`EndingLabel`: `labelType`,
  `word`, `long`, `pill`, `outcome`, `endedBy`) and the common half,
  `makeEndingLabelWord`, which reads the word from the server's facts in a
  fixed order: Won, Conceded, a place ("2nd" — `labelType` `placed`), Stopped,
  Solved, Finished, Lost. Solved and Finished are a player out of play with no
  result yet while the game goes on (`player.solved`, not the reason). A
  `no-result` ending is the game's to word. Each game's `lib/endingLabel.ts`
  (`makeEndingLabel`) adds its detail; `long` and `pill` are what follows the
  word, never the word again, empty when the word says it all, so a surface
  can set the word apart. The label's `outcome` is the player's.
- **Words live in `gd`, not in the components.** Each player in `gd` carries
  `endingLabel`, built once in `useGame`. One hook (`useGetEndingMessage`)
  turns mine into the pill and the info column's line through the common
  `makeEndingMessage` ("Lost: out of guesses", "Lost (out of guesses)"), and
  `endedBy` routes it to the shared `useShowEndingFeedback`. It replaces each
  game's two ending-message hooks.
- **The club line leads with my result**, through the same label over
  `summary_data`'s players: `Won`, `Won, tied with bea`, `Conceded · Won by
  bea`; a game I did not win or concede names its winners (`Won by bea &
  cade`). No "You": the context says whose. It shows my result as soon as I am
  out of play, before the game ends; while I play it says `Playing`, with the
  game's facts after it. `summaryFor(summary, members, myId)`.
- **The compete strip shows "metric (word)"** once a player is out of play:
  `3 (won)`, `280 (2nd)`, `1 (conceded)`, `2 (stopped)`; the metric alone while
  they play. Equal metrics already show a tie.
- **A stopped game says so.** The shared Stop message is `buildStoppedMessage`:
  "Stopped" in coop, "Stopped — no winner" in compete. Every surface chooses it
  by the ending reason `stopped`, never by a `neutral` outcome: a `no-result`
  is neutral too, and a Stop on a decided game keeps its win.
- **The game page shows my outcome, never the game's.** The ending message,
  the ending frame and the celebration are colored by `gd.me.outcome`. In
  compete, someone else's win is my `lost` or `near`, though the game's outcome
  is `won`.
- **`near` reads as a place.** A player ranked 2nd reads "2nd place", never
  "Lost: …"; a tied place reads "2nd place, tied".
- **Every game draws the ending frame**, on my ending and the game's.
  bananagrams and crosswords may be exempt if an outline has no room; measured
  before deciding.

## Where it stands (2026-10-06)

Storage is already right: every player's `final_ranking` and `outcome` are on
`common.game_players`, every ranking uses `rank()` (ties share, the next
skips), and every coop win ranks the whole team 1. Steps 2 and 3 made the
blobs carry the ranking and no winner; what is left is the page.

### Server

| gametype | co-winners possible | ranking stored at the end | club line names |
|---|---|---|---|
| bananagrams | no: a race | the winner only | the first winner |
| boggle | **yes**: compete with no target, at a `timeout` (score) | with no target, the full ranking; with one, the winner only | the first winner: one of a tie |
| codenamesduet | coop only | the team | nobody (coop) |
| connections | no: a race | the winner only | the first winner |
| crosswords | no: a race | the winner only | the first winner |
| letterboxed | **yes**: a compete `timeout` (letters, then words) | at a `timeout`, the full ranking; on a solve, the winner only | the first winner: one of a tie |
| psychicnum | no: a race | the winner only | the first winner |
| scrabble | **yes**: score | the full ranking | every winner |
| setgame | **yes**: sets found | the full ranking | every winner |
| spellingbee | no: a race to the target | the winner only | the first winner |
| stackdown | no: a race | the winner only | the first winner |
| strands | in effect no: the earlier solve breaks ties | the full ranking | nobody ("Won · N hints") |
| waffle | in effect no: the earlier solve | the full ranking | the first winner |
| wordiply | in effect no: the earlier last guess | the full ranking | the first winner |
| wordle | in effect no: the earlier solve | the full ranking | the first winner |
| wordwheel | no: a race to the target | the winner only | the first winner |

"The winner only" leaves a race's other players unranked, so they come out
`lost`, never `near`.

### Game page

| gametype | message colored by | a `near` player sees | names co-winners | strip verb | frame |
|---|---|---|---|---|---|
| bananagrams | mine | gold, "X went out" | one | — | no |
| boggle | **`'lost'`, hard-coded** | **red** | one | **Won/Conceded/Lost** | no |
| codenamesduet | the game's (coop) | — | — | — | yes |
| connections | mine | gold, "Opponent won" | nobody | — | yes, **gray for `near`** |
| crosswords | mine | gold, "X won" | one | — | no |
| letterboxed | mine | gold, "Lost: …" | all, but the line names the first | — | no |
| psychicnum | mine | gold | one | — | yes, **gray for `near`** |
| scrabble | mine | gold, "X won" | all | **Won/Conceded/Lost** | no |
| setgame | mine | gold, "X won/tied" | all | **Won/Conceded/Lost** | no |
| spellingbee | **`'lost'`, hard-coded** | **red** | one | **Won/Conceded/Lost** | no |
| stackdown | mine | gold, "X won" | one | — | no |
| strands | mine | gold, "Lost: …" | all (the hint count is the first's) | **Won/Conceded/Lost** | no |
| waffle | mine | gold, "Lost: …" | nobody | — | yes, **gray for `near`** |
| wordiply | mine | gold, "X won at N%" | one | **Won/Conceded/Lost** | no |
| wordle | mine | gold, "Lost: …" | nobody | — | yes, **gray for `near`** |
| wordwheel | **`'lost'`, hard-coded** | **red** | one | **Won/Conceded/Lost** | no |

Also:

- The seven strips above work out their word in the component, through the
  shared `endingOutcomeVerb`; each moves to its players' `endingLabel` in its
  turn, and `endingOutcomeVerb` goes with the last.
- crosswords celebrates only a coop win (`gd.coop && gd.outcome === 'won'`);
  a compete winner gets none.

### The game cards against the code

`plans/game-cards.md` says how each game should end. Two gaps, to discuss:

1. **scrabble ranks a player who scored nothing.** Its compete `_finish` ranks
   everyone who didn't concede, at 0 points too. The card's
   `timeout-ranks-by-progress`, and the `final-ranking` rule for a
   `score-only-contest`, leave a player with no progress unranked (`lost`).
   boggle and setgame drop them.

## The work

1. **"Terminal" out.** Common (the folder becomes `common/ending/`;
   `TerminalMessage`, `terminalFrame`,
   `terminalVerdict`, `isTerminal`, `isLocallyTerminal`), every game, the
   docs and `plans/areas`.
2. **Common SQL.** `common._make_json_summary_data` adds the player list.
   Additive: nothing reads it yet, and `ending.winner` stays until step 3 has
   moved its readers. Every game's `_rebuild_data_cols_for_all()` on deploy.
3. **Common front end.** The types follow; `gd.ending.winners` and the club
   page's winners helper; every reader of `ending.winner` and `winnerIds`
   moves to them, and then the SQL drops both. `summaryFor` takes the viewer;
   `.endingFrame_near`; one shared verb for the strips, with `near` and the
   place.
4. **Each game**, one at a time, changing only that game: a common change that
   would touch another game is raised first. For each:
   - its `lib/endingLabel.ts`, `endingLabel` on its `gd` players, and the one
     `useGetEndingMessage` in place of its two ending-message hooks;
   - its strip as "metric (word)", its `summaryFor` on the label;
   - names every winner; "2nd place"; the frame on both endings;
   - outcomes read, never worked out; the Stop chosen by its reason;
   - the turn bell and the your-turn flash, as the games that have them do;
   - its gaps against `plans/game-cards.md`, closed in the code or the card;
     **a rule that changes changes its card in the same work**, and every
     sibling card that shares the rule.

   **Done:** psychicnum. It added to common `endingLabel.ts`
   (`makeEndingLabelWord`, `makeEndingMessage`), the summary players' `ending`,
   `solved` and `stillPlaying`, and `findUsername` in `members/memberList.ts`.
   boggle. It added the `ended` label type, a no-result ending the game words
   ("Ended (out of time)"), and closed its two card gaps: every required word
   is the goal with no target, and a compete game with no target needs a
   countdown (`PN512`); its card gained `co-winners`.
   spellingbee and wordwheel, together, since `shared/bee-games` builds both
   games' `gd`: the label, the one `useGetEndingMessage` and the club lines
   live there. Their two card gaps closed as boggle's did — every required
   word is the goal with no target, and a race with no target is allowed with
   a countdown, which ranks by score — and their cards gained `co-winners`.
   setgame, whose card the code already matched. Its label names a tie after
   the word ("Won (tied with bea)", "2nd (tied with cade)"), and a coop win
   says "deck emptied", or "perfect clear" with no tile left.

## Overlaps

cross-game-consistency holds an item this plan covers:
→ Endings → "A ranking below first shows as `near`, never 'Lost'". It wants
one home. Its → Renames → "Terminal" → "ended" points here.

## Open

- **What the `near` line says beside the place**, game by game.
