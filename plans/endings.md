# Endings — every winner, my outcome, and the word "ending"

**Status: decided 2026-10-06, being built; steps 1–3 are done, step 4 (each game) is next.** How a game's ending is named,
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
- **`summary_data` carries every player.** The common part gains a short list,
  one entry per player: `id`, `outcome`, `finalRanking`, `conceded`. Always
  written, for every game, whether or not its summary reads it.
- **The club line may speak to the viewer.** `summaryFor` takes the viewer's
  id beside the summary and the members, and each game chooses what to say:
  every winner, one, or the viewer's own end ("You conceded · Won by joel &
  leah").
- **The game page shows my outcome, never the game's.** The ending message
  (pill and info-column line), the ending frame and the celebration are
  colored by `gd.me.outcome`. In compete, someone else's win is my `lost` or
  `near`, though the game's outcome is `won`.
- **`near` reads as a place.** A player ranked 2nd reads "2nd place", never
  "Lost: …".
- **Every game draws the ending frame.** bananagrams and crosswords may be
  exempt if an outline has no room; measured before deciding.

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

- `playArea.module.css` has no `.endingFrame_near`, so a `near` player's frame
  falls back to the neutral gray.
- `endingOutcomeVerb` has no callers; each of the seven strips writes its
  own two-way verb.
- crosswords celebrates only a coop win (`gd.coop && gd.outcome === 'won'`);
  a compete winner gets none.

### The game cards against the code

`plans/game-cards.md` says how each game should end. Two gaps, to discuss:

1. **scrabble ranks a player who scored nothing.** Its compete `_finish` ranks
   everyone who didn't concede, at 0 points too. The card's
   `timeout-ranks-by-progress`, and the `final-ranking` rule for a
   `score-only-contest`, leave a player with no progress unranked (`lost`).
   boggle and setgame drop them.
2. **boggle's card has no `co-winners`.** With no target, a compete `timeout`
   ranks by score and two equal top scores are both 1; the card's
   `timeout-result` line names no tie, where letterboxed's, scrabble's and
   setgame's do.

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
4. **Each game.** Its message colored by mine and naming every winner; "2nd
   place"; the frame; its strip on the shared verb; its `summaryFor` naming
   every winner. boggle, spellingbee and wordwheel's hard-coded `'lost'` first:
   they color a `near` player red today. Each game also closes its gaps
   against `plans/game-cards.md` and answers "what should the club-page
   summary be?". Its strip reads neutral for a player who neither won nor
   lost — a `stopped` or `no-result` game, unless they conceded — where
   `endingOutcomeVerb` says "Lost" today.

## Overlaps

cross-game-consistency holds an item this plan covers:
→ Endings → "A ranking below first shows as `near`, never 'Lost'". It wants
one home. Its → Renames → "Terminal" → "ended" points here.

## Open

- **The `near` line's words.** "2nd place" is decided; a tied place ("2nd
  place, tied"?) and what the line says beside it are not.
- **The strip's neutral word.** A player who neither won nor lost reads
  neutral (decided); the word is not.
