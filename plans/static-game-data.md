# Static game data — what never changes leaves `game_data`

**Status: DECIDED 2026-10-06, not started.** Joel is weighing building this
before the deploy. This file holds the list of what is static, the four
decisions and the work, layer by layer.

## What it is

Every move rebuilds a game's whole `game_data` and every page re-reads it
whole. For most games the biggest part of that blob is the puzzle — a word
list, a crossword's grid and clues — which `create_game` fixed and nothing
after it changes. This splits that part out into `static_game_data`, which
the page reads once, so a move re-reads only what moved.

## The rule

A key is static when nothing after `create_game` changes it: no move, no
ending, no Replay. Each game's `replay_board` was read for this: every one
keeps its puzzle and resets only the players' progress, the log and the
ending. scrabble and setgame re-deal their boards on Replay, but neither
board is a puzzle. Two other things checked:

- **No move writes a puzzle column.** codenamesduet's moves write
  `revealed_as` and the neutrals on `codenamesduet.words` (they feed
  `team.board`, not `puzzle`); crosswords' write `revision` and the grids.
- **The end-gated keys.** Seven puzzles carry a key the builder fills only
  once the game has ended (the solution). The key changes once, at the end,
  so it is not static and stays in `game_data` (The decisions, below).

## The list

Sizes are local `common.games` rows, in bytes of JSON (`octet_length` of the
text). The local fixtures run small; prod's letterboxed boards average about
12 KB, three quarters of it the word list.

| game | static: `puzzle`, less its end-gated key | end-gated key, staying in `game_data` | `puzzle` avg / max | `game_data` avg / max |
|---|---|---|---|---|
| spellingbee | `tiles`, `centerLetter`, `outerLetters`, `words`, `nReqdWords`, `reqdWordsScore` | — | 10,765 / 34,356 | 15,403 / 60,163 |
| crosswords (coop) | the template (`puzzle_content`: grid, clues, givens) | `solution` | 12,631 / 30,692 | 14,834 / 34,397 |
| letterboxed | `tiles`, `words`, `uncleanWords`, `nParWords` | `solution` | 7,828 / 27,593 | 9,233 / 28,734 |
| boggle | `tiles`, `boardSideSize`, `minWordLength`, `words`, `nReqdWords`, `reqdWordsScore`, `nBonusWords`, `bonusWordsScore` | — | 3,339 / 29,364 | 5,363 / 35,540 |
| wordwheel | `tiles`, `centerLetter`, `outerLetters`, `words`, `nReqdWords`, `reqdWordsScore` | — | 3,180 / 18,556 | 5,166 / 35,175 |
| codenamesduet | `tiles` (each word and both players' keys) | — | 3,267 / 3,286 | 9,115 / 16,063 |
| strands | `title`, `tiles` | `puzzleWords` | 2,770 / 3,246 | 5,710 / 11,342 |
| stackdown | `tiles`, `nReqdWords` | `solution` | 1,633 / 1,676 | 4,435 / 6,626 |
| connections | `date`, `cats`, `tiles` | — | 865 / 1,379 | 2,611 / 4,146 |
| waffle | `dealtTiles`, `parSwaps` | `solution` | 821 / 1,248 | 2,841 / 5,872 |
| wordiply | `base`, `maxWordLen`, `longestWords`, `legalWords` | — | 698 / 3,353 | 1,905 / 7,214 |
| psychicnum | `words` | `secrets` | 124 / 149 | 1,857 / 3,244 |

crosswords' compete rows are four local games of about 2 KB and are left out
of the table; its `puzzle` is the same template in either mode. The `puzzle`
sizes are as the local rows hold them, mostly unended, so they leave out the
end-gated key.

**No static puzzle:** bananagrams (no puzzle; its blob is the tiles and
boards in play), scrabble (no puzzle; the board is the game in play), setgame
(no puzzle; the table refills in place), wordle (its `puzzle` is only
`target`, which is end-gated). Their `game_data` gains nothing from this;
their static blob is the common part alone (below).

### The common part (Joel, 2026-10-06)

`game_data`'s common part splits: its fixed keys move to the static blob's
common part, each at the same top-level place.

```
static_game_data, the common part:
  id, gametype, brand, club: {handle}
  mode, coop, compete, oneBoard
  setup                         as create_game was handed it; its timer: {kind, seconds}

game_data, the common part:
  title
  turns, ending, ended, outcome
  players
```

Nothing writes `common.games.setup`, `mode`, `gametype` or `club_handle`
after `common._create_game` inserts them; a club's handle cannot be renamed;
`brand` comes from `common.gametypes`, which changes only with the code, and
`_rebuild_data_cols_for_all()` reaches every game then. `title` stays (wordle,
waffle, scrabble and stackdown rewrite it), and so do the players (a username
or color can change mid-game).

### The timer, in `setup`

`setup.timer` carries the timer's kind and a countdown's length, so the page
reads the timer from there and the static blob needs no timer key of its
own. Today `readCommonGame` reads the two from `common.timers` on every read,
beside `shell_data, game_data`, so every move re-reads them; from the static
blob they are read once, and `useCommonGame` stops reading `common.timers`
at all. `useGameTimer` keeps its own read of `ticks`, which it makes once on
mount.

- **The two agree locally:** every one of 3,213 local games has a
  `setup.timer` whose kind and seconds match its `common.timers` row
  (`kind`, `countdown_seconds_at_setup`), which `_create_game` writes from
  `p_setup` and nothing rewrites (`_reset_game` and `tick_timer` write only
  `ticks` and `last_tick`). Prod's games are asked the same before the
  deploy.
- **A comment to change:** `_create_game` says the kind and the countdown's
  length "are the game's to read from here on, never `setup`". This plan
  reverses that; the comment changes with it.

This is the one key the page reads inside the static blob: `GamePage` needs
the timer for the header, so it reads `setup.timer` and still hands the
whole blob down untouched.

### Static, but staying in `game_data` (Joel, 2026-10-06)

**Per-player constants**: connections' `maxMistakes`, psychicnum's
`nReqdSecrets` and `maxGuesses`, letterboxed's `maxWords`, waffle's
`maxSwaps`, wordiply's `maxGuesses`, spellingbee's and wordwheel's
`targetRankIdx`. A few bytes each, and they sit inside each element of
`players`; moving them would take a `players` list in the static blob that
each `useGame` matches to `gameData.players` by id.

### Not static, and outside this plan

The logs grow but never change what they hold: `events` (codenamesduet's and
setgame's are most of their 9–10 KB) and `foundWords` (spellingbee, boggle,
wordwheel). Sending only what is new is a different design — append, not
split — and is not proposed here.

## The shape

Each static key keeps its place: the static blob holds it where `game_data`
holds it today, and `game_data` loses it. Nothing names a key as static; the
two blobs simply share a shape. letterboxed's:

```
static_game_data:
  setup
  puzzle: {tiles, words, uncleanWords, nParWords}

game_data:
  …
  puzzle: {solution}
```

**Each game's `useGame` merges them (Joel, 2026-10-06), not `useCommonGame`:**
`GamePage` reads only `setup.timer` in the static blob, and only the game
knows where its keys go. The merge puts each key back where the game's raw
type has it, so `GGameDataRaw`, `makeGameData`, `gd`, the components and the
fixtures keep their shape. letterboxed's:

```ts
const raw = {
  ...gameData,
  ...staticGameData,
  puzzle: { ...staticGameData.puzzle, ...gameData.puzzle },
}
```

One rule for all twelve games with a static `puzzle`, psychicnum included
even though its word list is tiny, so no game is an exception.

## The decisions

**1. The end-gated keys stay in `game_data` (Joel, 2026-10-06: if they are
small).** They are. Each one's size as the builder writes it once the game
has ended, over every local game:

| game | key | avg | max |
|---|---|---|---|
| crosswords | `solution` | 1,367 | 3,347 |
| strands | `puzzleWords` | 684 | 797 |
| waffle | `solution` | 601 | 601 |
| stackdown | `solution` | 54 | 54 |
| psychicnum | `secrets` | 28 | 31 |
| letterboxed | `solution` | 23 | 31 |
| wordle | `target` | 7 | 7 |

The builder keeps writing the key as it does today: null while the game is
played, the answer once it has ended. After the end the blob is rarely
rebuilt: every game's SQL refuses a move into an ended game through
`common._raise_game_over` (crosswords' gate read in full; the rest by its
presence, not per RPC), and Replay clears the ending, so the answer goes back
to null. So a page receives the answer about once.

The key keeps its place, `game_data.puzzle`, which now holds only it; the
game's `useGame` merges the static `puzzle` around it (The shape, above).

**2. A column on `common.games`, `static_game_data` (Joel, 2026-10-06).**
Beside `shell_data` and `game_data`; the one read stays one row.

The game page subscribes to no row changes: it hears a move through the
Broadcast `changed` that `common._nudge_game_page` sends, and re-reads. The
club page's `useClubGames` still subscribes to `common.games` row changes
(the table is in the `supabase_realtime` publication, replica identity full).
Whether a column a move's `UPDATE` leaves alone rides in each of those
messages is not measured; `gmake move-bytes GAME=spellingbee` before and
after answers it for the club page.

**3. The page reads it once per mount (Joel, 2026-10-06).** The static blob
is written once and never changes; a static blob rewritten under an open
page is not provided for.

`readCommonGame` adds `static_game_data` to its select, and `GamePage` reads
`setup.timer` in it (The timer, in `setup`, above); `PlayAreaLoaderProps` gains
`staticGameData: unknown` beside `gameData`, handed down untouched. The
loader already holds the PlayArea back until `gameData` has arrived.

**Every load asks for the static blob until a load that carried it has been
applied.** `useCommonGame`'s loads overlap — one on mount, one when the
channel subscribes, one per `changed` — and only the newest is applied (its
`generation` check); an older load that lands later is dropped. If only the
first load asked, a nudge during it would start a newer load without the
static blob, the newer one would be applied, the first dropped, and the
static blob would never arrive. So a ref says whether the static blob has
arrived, each load reads it as it starts, and a load started before the
static blob arrived asks for it. The applied load therefore always carries
it if none had arrived. After that, a re-read asks only for
`shell_data, game_data`.

**4. `create_game` writes it (Joel, 2026-10-06); a move does not.** Each game
gains a `_write_static_game_data(p_game_id)` that `create_game` calls beside
its `_rebuild_data_cols`, and `_rebuild_data_cols_for_all()` calls both, so
the deploy's backfill and a later shape change reach every game. Replay
leaves it alone, since the puzzle survives Replay. `_rebuild_data_cols`
writes `shell_data`, `game_data` and `summary_data` as today, and no longer
every `*_data` column: writing the static blob there would rebuild it and
store a fresh copy every move (10–35 KB for a spellingbee board) though
nothing in it changed.

## The work

In order:

1. **Shape** — a new migration adding `common.games.static_game_data`, read
   under the same grant and policy as `game_data`.
2. **Behavior** — `common._make_json_static_game_data(p_game_id)` builds the
   common part (its fixed keys and `setup`), and
   `common._make_json_game_data` drops them.
   Per game (`supabase/sql/<game>.sql`), a
   `_make_json_static_game_data(p_game_id)` puts `puzzle` less the end-gated
   key on top of it, and the game's `_make_json_game_data` keeps only the
   end-gated key in `puzzle`; bananagrams, scrabble, setgame and wordle write
   the common part alone. Each game's `_write_static_game_data`, called by
   `create_game` and `_rebuild_data_cols_for_all()`.
3. **The read** — `readCommonGame` reads `static_game_data` once per mount in
   place of `common.timers`; `GamePage` reads `setup.timer` in it and hands
   the blob down as `staticGameData`; every load asks for it until one that
   carried it has been applied. `_create_game`'s comment
   on reading the timer "never `setup`" changes with it.
4. **Each game's `useGame`** — merges the static blob into its place before
   `makeGameData`, which with the raw types stays as it is.
5. **Tests** — each game's pgTAP blob test splits into the two blobs; a test
   that the page does not read the static blob again; each game's merge
   tested by its `useGame`'s tests. The fixtures stay as they are, since the
   merged shape is today's.
6. **Docs** — `docs/common-schema.md` (the page blobs), each game's doc's
   `game_data` section, `docs/supabase.md → Reading data`.
7. **Measure** — `gmake move-bytes` before and after, every coop game.
8. **Deploy** — the migration joins the pending batch;
   `_rebuild_data_cols_for_all()` for every game afterward writes the static
   for every game already in prod.
