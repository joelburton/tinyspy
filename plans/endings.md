# Endings — every winner, my outcome, and the word "ending"

**Status: decided 2026-10-06, not started.** How a game's ending is named,
stored and shown: the word "terminal" goes, both page blobs can hold several
winners, the club page's line can speak to the viewer, and the game page
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
- **Both blobs name every winner.** `ending.winners`, the ids of every player
  ranked 1, replaces `ending.winner` in the common part of `game_data` and
  `summary_data`. scrabble's and setgame's own `winnerIds` fold into it.
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
skips), and every coop win ranks the whole team 1. The single winner is made
in `common._make_json_ending` (`limit 1`), and the rest is the page.

### Server

| gametype | co-winners possible | ranking stored at the end | club line names the winner from |
|---|---|---|---|
| bananagrams | no: a race | the winner only | `ending.winner` |
| boggle | **yes**: compete with no target, at a `timeout` (score) | with no target, the full ranking; with one, the winner only | `ending.winner`: one of a tie |
| codenamesduet | coop only | the team | nobody (coop) |
| connections | no: a race | the winner only | `ending.winner` |
| crosswords | no: a race | the winner only | `ending.winner` |
| letterboxed | **yes**: a compete `timeout` (letters, then words) | at a `timeout`, the full ranking; on a solve, the winner only | `ending.winner`: one of a tie |
| psychicnum | no: a race | the winner only | `ending.winner` |
| scrabble | **yes**: score | the full ranking | `winnerIds`: every winner |
| setgame | **yes**: sets found | the full ranking | `winnerIds`: every winner |
| spellingbee | no: a race to the target | the winner only | `ending.winner` |
| stackdown | no: a race | the winner only | `ending.winner` |
| strands | in effect no: the earlier solve breaks ties | the full ranking | nobody ("Won · N hints") |
| waffle | in effect no: the earlier solve | the full ranking | `ending.winner` |
| wordiply | in effect no: the earlier last guess | the full ranking | `ending.winner` |
| wordle | in effect no: the earlier solve | the full ranking | `ending.winner` |
| wordwheel | no: a race to the target | the winner only | `ending.winner` |

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
- `terminalOutcomeVerb` has no callers; each of the seven strips writes its
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

## The work — proposed order, not yet agreed

1. **Common SQL.** `common._make_json_ending` writes `winners`;
   `common._make_json_summary_data` adds the player list; scrabble's and
   setgame's `winnerIds` go. Every game's `_rebuild_data_cols_for_all()` on
   deploy.
2. **Common front end.** The types follow; `summaryFor` takes the viewer;
   `.endingFrame_near`; one shared verb for the strips, with `near` and the
   place.
3. **Each game.** Its message colored by mine and naming every winner; "2nd
   place"; the frame; its strip on the shared verb; its `summaryFor` on
   `winners`. boggle, spellingbee and wordwheel's hard-coded `'lost'` first:
   they color a `near` player red today.
4. **"Terminal" out.** Common first (`src/common/terminal/` becomes
   `common/ending/`; `TerminalMessage`, `terminalFrame`,
   `terminalVerdict`, `isTerminal`, `isLocallyTerminal`), then every game,
   the docs and `plans/areas`. Last, so it doesn't rename code steps 1–3 are
   about to rewrite.

## Overlaps

cross-game-consistency holds two items this plan covers:
→ Endings → "A ranking below first shows as `near`, never 'Lost'", and
→ Renames → "Terminal" → "ended". Each wants one home.

## Open

- **The `near` line's words.** "2nd place" is decided; a tied place ("2nd
  place, tied"?) and what the line says beside it are not.
