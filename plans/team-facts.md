# Team facts — `gd.team` holds what the team shares; a player holds only their own

**Status: DECIDED 2026-10-02; psychicnum and wordle carry it (2026-10-02).**
Joel and Claude settled this over psychicnum's coop counts while wordle's
conversion to the page blobs was open in the working tree. It refines
[seat-view](seat-view.md) decision 7's shape, which now draws `team`;
docs/common-schema.md and code-conventions' casing section carry it. What is
left is each remaining game writing `team` as it converts, connections first;
this file goes when the last does.

**Order (Joel, 2026-10-02):** it starts once wordle's conversion is committed,
as its own slice — psychicnum first, then wordle — so neither game's whole-blob
pins change inside the conversion diff.

## The problem

In psychicnum coop, `psychicnum.players.found_secrets_count` is each player's
own tally (I found 2, Moth found 1), but `game_data.players[i].nFoundSecrets`
is the team's sum, written onto every player (3, on both of us), and
`summary_data.nFoundSecrets` is the same sum once more. One name, three
meanings by layer and by mode. The reader of `me.nFoundSecrets` has to know
which mode it is in to know what the number means, and a component that wanted
"mine" in coop would have to go around the blob.

Wordle made the opposite choice: its guess RPC writes the team's count onto
every player's ROW in coop, so the rows do not hold the per-player fact at all.

Each game had answered the question its own way. This plan answers it once.

## The decisions

1. **A player's keys are that player's own, in every mode.** The row and the
   player object say the same thing: `me.nFoundSecrets` is what I found,
   whether or not the finds are pooled. The database keeps recording who did
   what, because "Found: Moth 1 · Joel 2 · team 3" is a readout we may want
   one day and the rows are where it comes from.
2. **`team` is a top-level key on every game's `gd`**, the standard place to
   look for what the team shares. What it holds is the game's: psychicnum's
   `nFoundSecrets` and `nGuessesUsed`, wordle's `guessesUsed`. The game's
   builder writes it from the rows (a sum, a max,
   whatever the game's rule is), so the database owns "guesses are shared in
   coop for this game".
3. **`team` is null when the game has no team.** `if (!gd.team)` means "this
   game cannot have team facts" and never "there happens to be nothing in it".
   A coop game with a team and nothing to say about it would carry `{}`; no
   game needs that today, and it is written down only so the null is never
   read two ways.
4. **`summary_data` follows:** its team numbers move under a `team` key with
   the same null rule, since the club page card is the one reader and it
   should find the team's facts where the play page does.
5. **Nothing else moves.** `requiredSecretsCount` and `maxGuesses` stay where
   they are.
6. **A game adjusts when its area opens.** The rule is "the row and the player
   show the per-player fact where that is reasonable for the game"; crosswords
   and scrabble, with large rows, may settle on something else when their
   areas open, and that is theirs to decide then.

The FE still branches on mode, but the branch becomes "which fact do I show":
a coop readout shows `gd.team`, a compete readout shows `gd.me` beside the
rivals. **Where that pick lives (Joel, 2026-10-02): in `gd`.** "How this game
works" stays in `gd`, so `useGame` decides once — psychicnum's
`gd.stateLineData` is the team's counts where there is one, else mine — and no
component picks. The field is named for its reader, since it is what to SHOW
there and not a fact for other components to scrounge.
"How do I compute this" never leaves the hook either way.

## The naming rule for a loose copy

Inside its group a name is bare and the path supplies the context:
`team.nFoundSecrets` and `me.nFoundSecrets` are both right, and the
reader knows which from the dot.

A copy pulled out of its group — a local, a prop that carries just the one
number — has lost that context and **must say which it is**. The spelling is
mechanical: **a dot becomes an underscore.** `team_foundSecretsCount`,
`me_foundSecretsCount`, `me_board_tileResults`.

- It is lossless: the leaf is spelled exactly as the key, so a grep for
  `nFoundSecrets` finds every loose copy. `teamFoundSecretsCount` would
  hide from it.
- It settles what camelCase leaves open: a copy of `me.…` is `me_…`, with no
  `my` versus `me` choice, and deeper paths compose the same way.
- Its oddness in TS is the signal. A loose copy is rare by the house rules
  (don't destructure a group; a local name is earned), and a snake-looking
  name says "this is a copy of a path; the group is nearby".

It does not collide with the row-field convention: a row field is all
lowercase (`team_score`), a path copy has a camelCase leaf
(`team_foundSecretsCount`), and "has an underscore" was never the test for a
row field anyway (`id`, `mode`, `seat`). The casing section gets a third form
beside snake_case for row fields and camelCase for TS-native shapes and the
page blobs' keys.

The boundary: the path name is for a copy of the fact. When a parent hands a
child a value for the child's own purpose, the purpose rule still wins:
`canPick`, never `me_onTurn`.

The rule is expected to be rare (Joel, 2026-10-02): a value passed down
usually already has a more useful name, the way `canPick` names what
`gd.me.onTurn` is for at the board. What it guards against is a prop called
plainly `guessesUsed`, which cannot say on its own whether it is a player's or
the team's.

## The shape

```
gd:
  team: {…}                               # game; null when the game has no team
  players: [player, …]
  me

player:
  nFoundSecrets                       # own, in every mode
  nGuessesUsed                             # own, in every mode

summary_data:
  team: {…}                               # the same key, the same null rule
```

psychicnum's `team` is `{nFoundSecrets, nGuessesUsed}`; wordle's is
`{nGuessesUsed}`; connections' is `{nMatchedCats, nMistakes}`. The next game's
starts from these.

## What it touches

### psychicnum, first (the canary) — done 2026-10-02

- **SQL.** A `_make_json_team(p_game_id)` piece, null in compete, summing the
  rows in coop; `_make_json_players` passes each row through in both modes;
  `_make_json_summary_data` writes `team`. The header comment's shape, the
  `game_data_test.sql` and `rebuild_data_cols` pins.
- **Types.** `GPlayerRaw`'s comments, a `team` group on `GGameDataRaw` and
  `GSummaryData`, and `lib/gameData.fixture.ts`, which today builds the team's
  sum onto each player.
- **Readers.** `StateLine` (cs-blessed; reads the player's counts, so in coop
  it shows the team's and in compete mine), `InfoCol`'s per-player score,
  `BoardCol`'s `moveCount` (the flash's timing: in coop any player's guess
  moves the board, so it is the team's count), `useShowOppsFoundMessages`,
  `manifest.ts`'s summary tallies, `useGame.test.ts`, `PlayArea.test.tsx`.

### wordle, next — done 2026-10-02

- **SQL.** The guess RPC's coop branch writes the team's count onto every row;
  it writes the caller's row only, in both modes, and the team's count is the
  sum at build time. Two places read a row as the shared count and sum
  instead: the summary's `max(guesses_used)`, and the guess RPC's budget
  guard and out-of-guesses check, which read the caller's row. The compete
  ranking reads each racer's own row and is untouched. `_make_json_team`,
  `summary_data.team`, the pins.
- **A data migration, in the same deploy.** Every existing coop wordle game
  holds the team's count on every `wordle.players` row, so a builder that sums
  the rows would read N times the real count. One migration rewrites each
  row's `guesses_used` from that player's own `wordle.events` rows before the
  new RPC and builder apply (CLAUDE.md → Production software):
  `20261002000001_wordle_players_own_counts.sql`, which checks that every
  coop game's rows sum to the count they all carried. After the deploy, run
  `select wordle._rebuild_data_cols_for_all()` and psychicnum's by hand: a
  migration cannot call what `supabase/sql/` defines, and both games' blobs
  change shape.
- **Types and readers.** `types.ts`'s shape comments, `InfoCol`'s guesses line
  and per-player readout, `useGame.test.ts`.

### connections — done 2026-10-02, with its conversion

A mistake is a per-player row fact: `submit_guess` writes the caller's row in
both modes and coop's loss guard sums the rows, as wordle's does. The
migration `20261002000002_connections_own_counts.sql` rewrote each coop row to
the player's own misses off their events, with the same sum check, and
renamed the three count columns to the blobs' names (`n_matched_cats`,
`n_mistakes`, `matched_cat_rank`). `team` is `{nMatchedCats, nMistakes}` on
both blobs; `gd.stateLineData` is `{nMatchedCats, nMistakes, maxMistakes}`.

### The rest

Each game's conversion to the blobs writes `team` as part of the slice. Until
then nothing changes for it.

## Where the knowledge lands when this ships

- seat-view decision 7's shape gains `team`, and its player lines lose "the
  team's, on every player, in coop".
- docs/common-schema.md's game_data contract: `team` on every game's blob,
  null when the game has no team.
- docs/code-conventions.md → TypeScript casing: the third form,
  `group_leaf` for a loose copy of a path, with its boundary.
