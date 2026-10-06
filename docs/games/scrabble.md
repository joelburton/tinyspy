# scrabble

A Scrabble-style word game: players build interlocking words from lettered tiles
on a 15×15 premium-square board, drawing from a shared 100-tile bag and scoring
by letter values × board premiums. The first game in the roster that is
**turn-based with a shared, contended resource** (one board, one bag) — which is
where almost all of its novelty lives.

> **Brand ≠ codename.** User-facing brand is **RackAttack** (the manifest
> `title`); the identifier everywhere in code / DB / schema / tests is the
> codename `scrabble` — it keeps the link to the original game obvious in source,
> the same brand/codename split waffle (SyrupSwap) and wordle (WordNerd) make.
> ("Scrabble" is a trademark, so it can't be the public brand, but as an internal
> codename it's the clearest possible name.)

scrabble is a **coop / compete sibling pair** (`scrabble_coop`,
`scrabble_compete`) and inherits the shared chrome — timer, chat,
presence-pause, manual "Stop game" — through `<GamePage>` + `useCommonGame`, like
every other multiplayer gametype.

> **Status: live.** scrabble is built end-to-end (engine, migration, RPCs, FE)
> and shipping. The design forks — difficulty bands by word length
> ([§3.3](#33-the-dictionary-difficulty-bands-by-word-length)), endgame rules
> and the leftover rows ([§2.7](#27-ending-the-game)), and the title/label
> shapes ([§8](#8-title-formula), [§9](#9-the-summary)) — are documented in
> place across §§2–9.

> **Keyboard-friendly, NOT desktop-only.** A tile goes onto the 15×15 board by
> a drag, by typing at the cursor, or by a tap on a rack tile and then a tap on
> an empty cell — the one way that needs neither a mouse nor a keyboard. We
> won't build touch-drag or an in-game keyboard. scrabble is **un-gated
> everywhere** (no device block) and has a **mobile layout** (§7). Contrast
> bananagrams, which is genuinely desktop-only and touch-blocked. See
> [docs/mobile.md](../mobile.md) → "Where each game plays".

---

## 1. The shape of the novelty

Every existing game is either "any player acts whenever" (spellingbee, stackdown
coop) or fixed two-seat (codenamesduet). scrabble is structurally different in
three ways that drive most of the schema:

1. **One shared 15×15 board** all players mutate, sequentially.
2. **One shared 100-tile bag** everyone draws from — a *contended* resource, not
   a per-player puzzle.
3. **Rotating turns** (compete only) where only the active player may act.

The flip side: there is **no board library and no builder edge function**. The
board layout and tile distribution are *constants in code*; the only per-game
randomness is the bag's shuffle order. So unlike spellingbee / waffle /
stackdown, there's nothing to pre-generate and nothing to import. The complexity
instead lands in **move evaluation** (a single placement forms a main word
*plus* every perpendicular cross-word) — which lives in **one place, the TS
`lib/play.ts`**, shared by the live preview and the submit path (see
[§6](#6-where-validation-lives)) — and in **turn / lifecycle management**.

---

## 2. Rules

### 2.1 The board, the bag, the rack

- **Board:** the standard symmetric 15×15 premium-square layout — 8 triple-word,
  17 double-word (the two diagonals + the center star, which is itself a DW),
  12 triple-letter, 24 double-letter, the rest plain. Encoded as a constant
  premium-type grid in `lib/board.ts`; it never varies between games.
- **Bag:** the standard English distribution — 98 letter tiles + **2 blanks** =
  100. Letter point values are constant (`A`=1 … `Q`/`Z`=10, blank=0). The full
  distribution lives in `lib/board.ts` (and is mirrored SQL-side); the canonical
  table is in [§3.2](#32-the-tile-distribution).
- **Rack:** 7 tiles. **Compete:** each player has a *private* rack — the blob
  carries every rack, and `makeGameData` withholds a rival's until the game
  ends. **Coop:** there is **one shared rack** the whole team plays from (see
  [§2.4](#24-coop-vs-compete)).

### 2.2 A play (placing a word)

On a turn (compete) or at any time (coop), a player places one or more rack
tiles on empty board cells. The play is legal iff:

- **First play covers the center** (7,7).
- **All placed tiles lie in a single row or column**, contiguous along that line
  (gaps are allowed only where the board already has tiles bridging them).
- **After the first play, the new tiles connect** to at least one existing tile.
- **Every word formed is in the dictionary** — the *main* word along the line of
  play, *and* every perpendicular **cross-word** of length ≥ 2 that a new tile
  participates in.

The first three (geometry) and the scoring are evaluated **on the FE** by
`lib/play.ts` — instantly, so the player sees their score and any illegal
placement before they submit. The fourth (dictionary) needs the 283k-row word
list, which lives in Postgres, so the **move RPC** checks it. See
[§6](#6-where-validation-lives) for the full split + the optimistic-concurrency
race handling.

A play that fails the **dictionary** check is **rejected for free**: the tiles
bounce back to the rack, nothing is consumed (no turn lost in compete, no score
change), and the attempt is *not* logged. Per our trust model + Joel's call:
penalizing a rejected word turns the game into "did you memorize the difficulty
bands," which is not the game. (Geometry-illegal plays never reach the server —
the FE won't let you submit one.)

A play that passes is **scored** ([§2.3](#23-scoring)), its tiles are played
on the board permanently, the rack is **refilled** from the bag (draw as many as
were played, or as many as remain), and — in compete — **the turn advances**.

### 2.3 Scoring

Standard Scrabble scoring:

- Each tile contributes its letter value, multiplied by any **letter premium**
  (DL/TL) on its cell — *but only for premiums under newly-placed tiles*.
  Tiles already on the board score face value with no premium.
- Then **word premiums** (DW/TW) multiply the whole word's total — again, only
  premiums under *newly-placed* tiles count, and they stack (two DWs in one word
  = ×4).
- A play that forms multiple words sums each word's independent score.
- **Bingo:** using all 7 rack tiles in one play scores **+50**.
- **Blanks** score **0** but still occupy their declared letter for every word
  they're part of.

### 2.4 Coop vs compete

- **Compete** (`scrabble_compete`, 1–4 players): classic Scrabble.
  **Turn-based** — a rotating order, only the active player may play / exchange
  / pass. Private per-player racks, per-player scores. Highest final score wins.
  Unusually for a compete manifest, its floor is **1**, not 2: a lone player can
  race the autonomous AI opponent (see §12), which fills the other seat.
- **Coop** (`scrabble_coop`, 1–4 players, solo-capable): **one shared rack, one
  shared board, one shared bag, one shared score.** There is **no turn
  rotation** — *any* player may attempt a word at any time; players coordinate
  over chat to plan the team's best move. The team plays for the highest score
  it can reach (a "see what you can get" practice/collaboration mode; solo is
  just the 1-player case).

  Mirroring stackdown coop: a player **stages tiles privately** — staged tiles
  are local to their client, never stored (a player may choose to *show* them,
  §7) — and only on a successful **submit** does the word hit the shared board
  for everyone. Submits serialize on the game-row lock, so if two players
  submit at once the first wins and the second's staged word **resets** — and
  because the rack is *shared*, a peer's submit can pull tiles out from under
  your half-built word,
  forcing the same reset (exactly stackdown's "whoever submits first claims it,
  the other's in-progress resets," with the shared rack as the contended
  resource).

### 2.5 Blank tiles

A blank is wild, but **its letter is declared at the moment it's played and is
permanent** for the rest of the game (this is the real Scrabble rule — a blank
played as the `M` in `MASK` can never later be reread as a `T`; you'd build
`TASK` off the *real* A/S/K instead). So the letter is declared as the blank is
placed: a typed letter the rack lacks takes a blank as that letter, and a blank
dragged or tap-placed opens the letter picker (`BlankPickerBlockingModal`). The
board column stores `{l, b: true}`; the page's board string writes it as a
capital (§4). The letter is immutable and used for all future word validation,
and the tile scores 0 forever.

### 2.6 Exchange & pass

- **Exchange:** return some or all rack tiles to the bag, reshuffle, and redraw
  the same count. Legal only when the **bag holds ≥ 7 tiles** (standard rule).
  Costs the turn (compete) but **clears** the pass streak — it's an attempt to
  get unstuck, not a refusal to move ([§2.7](#27-ending-the-game)).
- **Pass:** forfeit the turn with no play. Compete only (coop has no turns —
  the coop "we're stuck" path is exchange-if-possible or **Stop game**). Feeds
  the **consecutive-pass streak** that ends a blocked game, which is why it asks
  first — scrabble's own question (`PASS_CONFIRM`, through `askConfirmation`),
  since the registry's `act-pass` carries none.

### 2.7 Ending the game

Two natural end triggers, plus the universal manual / timeout paths:

- **Going out:** the bag is empty **and** a player empties their rack (compete)
  / the shared rack is empty (coop). The classic end.
- **Blocked (compete only):** **every player still in passed in a row** — one lap of
  the table with nobody willing to play. A deliberate *casual* house rule
  (2026-08-01) in place of tournament Scrabble's 6 consecutive scoreless turns,
  which drags a decided game out. The threshold is the count of players still
  in (people + bots), so it tracks drop-outs: in a 3-player game where one
  conceded, two passes end it. An **exchange clears the streak** rather than
  feeding it — swapping tiles is a real attempt to move, and (needing a 7+ tile
  bag) it's impossible in the endgame where blocked-ends actually happen.
  **Coop has no blocked-end** (and no turns/passes): it ends *only* on going-out
  or **Stop game**.
- **Manual end** (`stop_game`): any player stops the game. **Compete** is the
  uniform neutral stop ([common-schema.md →
  Stop](../common-schema.md#stop--every-gametypes-stop_game)) —
  no winner, no scoring. **Coop deviates** (see below): it *forfeits* the
  leftover-tile value.
- **Timeout** (`submit_timeout`): a countdown clock hit 0.

**Final scoring** (`scrabble._score_leftovers`) runs on every ending except a
Stop in **compete**, and every deduction is a row in the log: a `leftovers`
row (negative) per rack still holding tiles, and a `went_out` row (positive)
for the player who emptied their rack. Neither row took a turn. Then the game
ends through `common._end_game` ([docs/win-lose.md](../win-lose.md)):

- **Compete:** each player's leftover tile values are **subtracted** from
  their score, a `leftovers` row each; the player who went out **gains the sum
  of everyone else's**, their `went_out` row. The players who didn't concede
  are then **ranked by final score**, ties sharing a rank — so an exact tie at
  the top is two winners. The reason is the act: `resource_exhausted` /
  `complete` (going out), `all_passed` / `blocked`, `timeout`, or `conceded`
  (see Concede, §5.6).
- **Coop:** the team's score is the players' own scores summed, less the
  shared rack's leftovers — one `leftovers` row, in the name of whoever's act
  ended the game. **Playing the bag out is a `won` outcome** (`resource_exhausted`
  / `complete`, the whole team ranked 1 — Joel, 2026-09-27: plans/common-tables.md
  → Decided), drawn green, but its words say "Completed" and "Ended": the
  score is the point, not a verdict (Joel, 2026-10-05). **The clock is the one
  way a coop table loses** (`timeout`, nobody ranked). **A Stop is neutral**
  (`stopped`), **but not free in coop**: tiles still in hand cost their value,
  the same penalty a natural end applies, so a team is pushed to find plays
  for its last tiles rather than just stopping.

> **Deliberate deviation from the roster's timeout convention.** spellingbee/etc.
> treat a compete timeout as *no winner*. scrabble instead crowns the highest
> score on timeout, because a Scrabble score accumulated over real plays is
> meaningful — voiding it would reward stalling. Only **manual** end is neutral.

---

## 3. The board model & constants

### 3.1 Premium-square layout

A constant 15×15 grid of premium types `{ none, DL, TL, DW, TW }`, in
`lib/board.ts`, mirrored SQL-side. The standard symmetric layout (8 TW / 17 DW
incl. center / 12 TL / 24 DL). Premiums apply **once**, only to newly-placed
tiles, and are "spent" after — a tile placed on a TW this turn does not re-trip
the TW for a future cross-word.

### 3.2 The tile distribution

The canonical 100-tile English set, a constant in `lib/board.ts` (mirrored
SQL-side for the bag shuffle):

| pts | tiles |
|---|---|
| 0 | blank ×2 |
| 1 | E×12, A×9, I×9, O×8, N×6, R×6, T×6, L×4, S×4, U×4 |
| 2 | D×4, G×3 |
| 3 | B×2, C×2, M×2, P×2 |
| 4 | F×2, H×2, V×2, W×2, Y×2 |
| 5 | K×1 |
| 8 | J×1, X×1 |
| 10 | Q×1, Z×1 |

(Unlike spellingbee, **`S` is included and plurals are legal** — they're core to
Scrabble, not a trivializing exploit.)

### 3.3 The dictionary (difficulty bands, by word length)

The legal word set is the shared `common.words` list (see [word-list.md → The
word list](../word-list.md#the-word-list-commonwords)), gated by **two per-game
difficulty bands** chosen at setup — one for **2-letter** words (`dict_2`) and
one for **3+-letter** words (`dict_3plus`), both 1..6. A word is legal iff
`difficulty ≤ the band for its length` and it's valid in the **american OR
british** dialect (the codebase's default-play convention). The two-band split
(the same bananagrams uses) exists because 2-letter words are a thin, separate
vocabulary you usually want to gate independently of the rest. No clean filter —
among friends, crude words are legal Scrabble plays (standard dictionaries
include them), the same way spellingbee's *legal* tier carries no clean
restriction. **The AI is held to a stricter bar than the players** (2026-08-03):
its bundled vocabulary drops slurs + profanity, because a word the app puts on a
shared board is the app's, not the player's — see
[§11](#11-the-move-suggester-ai) and [word-list.md → Which words a game may
use](../word-list.md#which-words-a-game-may-use--the-two-tier-rule).

**The bands are the acceptance gate — scrabble deviates from the roster default
here.** The general convention (common.md) is "validation accepts the *full* 1–6
range; which bands a game *offers* is a UI choice" — because in most games the
band only shapes the puzzle / required set, not what's enterable. scrabble is
the spellingbee-*legal*-tier case instead: the selected band **is** the bar that
`play_word` enforces (a word above its length's band is the *only* kind that's
rejected), so picking a lower band genuinely makes a stricter game. The setup
form offers **all six** for each (default 3 / 3). The bands are server-only
config — not exposed to the FE (which never validates words).

Word legality is a plain `common.words` lookup inside `play_word` — the one
piece of validation that stays server-side, because that's where the word list
is ([§6](#6-where-validation-lives)). The geometry + word-extraction + scoring
live *only* in `lib/play.ts` (no SQL re-implementation).

---

## 4. Schema (`scrabble.*`)

Built as the standard sibling pair on a per-baseGametype `scrabble` schema.
Shape: `supabase/migrations/20260627000000_scrabble.sql` and the migrations
after it; behavior: `supabase/sql/scrabble.sql`. The page reads none of these
tables: it reads the two blobs on `common.games` (below).

### 4.1 Tables

| table | what it holds | granted to a club member |
|---|---|---|
| `games` | one row per game, keyed `game_id`. `dict_2` + `dict_3plus` (the two acceptance bands), `board` jsonb (a flat 225-cell array of `{l, b}` or null — the RPCs' working state, and the shape the AI reads), `bag` text[] (the remaining draw order), `version` int (the move counter for optimistic concurrency — see [§6](#6-where-validation-lives)), `team_rack` text[] (coop's one rack; null in compete), `consecutive_passes` (compete's blocked-end counter). The mode and the club are `common.games`'. | `game_id`, `board`, `version`, `team_rack`, `consecutive_passes` — never the bands or the bag |
| `players` | PK `(game_id, user_id)`; every player, bot or person, is found by `user_id`. `score` is the player's own in both modes — the points from the words they played, less their leftovers in compete. `rack` is compete's (null in coop). `ai_level` is non-null on a bot's row: its strength in this game. A compete game's turn order is `common.game_players.turn_seat`: people, then bots. | everything but `rack` |
| `events` | the move log, keyed by a `bigint identity` and read `order by id`. `user_id` is the player whose row it is. `kind`: `word` (`placements` jsonb `[{x, y, letter, blank}]`, `words`, `score`) / `exchange` (`tile_count`) / `pass` / `leftovers` (negative `score`, the rack's `tile_count`) / `went_out` (positive `score`). `took_turn` is true on the three moves and false on the two rows an ending writes. | everything, both modes |

Letters are lowercase in every column; a capital never reaches the database.

**Why the log is public in both modes** (unlike spellingbee's mid-game-private
found words): every played word is *on the shared board*, which is public —
so a word and its score are already visible to opponents. Only **racks** and
the **bag** are secret. scrabble has no hidden *solution*, just hidden
*resources*.

### 4.2 The page blobs

`scrabble._rebuild_data_cols` writes everything a page shows onto
`common.games` at create, Restart, and the end of every move, in named
`_make_json_*` pieces (plans/seat-view.md → The page is written, not
assembled). Every key is always present, null when it has no value.
`static_game_data`, what nothing after create changes, is written once by
`_write_static_game_data`, from `create_game` and the rebuild over every game,
and is the common part alone: scrabble has no puzzle, and its board is the
game in play ([common-schema.md → Title, statuses and the two
dates](../common-schema.md#title-statuses-and-the-two-dates)). Beside the
common part:

| `game_data` key | what it is |
|---|---|
| `version` | the move counter every move sends back |
| `nBagTiles` | the tiles left in the bag; the bag's order never leaves the server |
| `board.letters` | the one board, shared in both modes: 225 characters, row by row — `.` an empty cell, `c` a C tile, `C` a blank played as C. Case carries the blank, and `makeGameData` is its one reader, decoding each cell into a `GCell` holding its `GTile` |
| `team` | coop's own facts, sent once: `{rack, score, nRackTiles}`; null in compete |
| `events` | every row, every player's: `id`, `userId`, `kind`, `placements` (a word's tiles as `"x,y:c"`, the board's case rule), `words`, `score`, `nTiles`, `tookTurn`, `at` |
| `players` | the common player, plus `aiLevel`, `score` (own, every mode), `rack` and `nRackTiles` (compete; null in coop) |

| `summary_data` key | what it is |
|---|---|
| `team` | coop's `{score}`; null in compete |
| `nBagTiles` | the tiles left in the bag |
| `winnerIds` | every player ranked first — a compete tie shares rank 1; null in coop, or with no winner |
| `winnerScore` | the score the winners share; null likewise |

**Every player carries the facts** (`GFacts`: `score`, `rack`, `nRackTiles`,
`board`, `nBagTiles`) twice: spread on, the side's — the team's in coop, their
own in compete; under `own`, their own
([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)). The board and the bag are
one in both modes, so the wire sends them once at the top and `useGame` puts
them on every player, the same board object on each; a coop rack is the
team's, on every player and under `own` alike. `gd` has no `board`, `nBagTiles`
or `team` of its own, and the state line reads `gd.me`.

**The seat rule.** The blob carries every rack. `makeGameData` withholds a
rival's (`rack: null`, `nRackTiles` kept) until the game ends — what a racer
may see of a rival is the page's rule, not the database's.

`scrabble._rebuild_data_cols_for_all()` rewrites every scrabble game's blobs
without re-dating any, for a shape change.

## 5. RPCs (all `security definer`)

### 5.1 `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)`

Club-member + player-count + timer validation. The count rules speak in
**humans and AI seats**: `_require_player_count_max` caps the *humans* at 4 (and
at least one human always — an empty roster is rejected); compete additionally
requires the **total** (humans + `setup.ai_count`) to be 2–4, so a solo human
vs an AI is a legal compete table but a 1-seat "race" is not. Reads
`setup.dict_2` / `setup.dict_3plus` (each 1–6, default 3), then:

- Builds the 100-tile bag and **shuffles** it (`order by random()`); the shuffle
  is the only randomness — no board library, no builder edge function.
- **Deals racks:** compete → 7 tiles into each `players.rack`, people then
  bots; coop → 7 into `games.team_rack`.
- Sets the turn order (compete: `turn_seat` people then bots, the opener a
  **random player** among all of them — so a bot may open; see
  [§12](#12-the-ai-opponent-compete)).
- Inserts the `games` row + one `players` row per player, and writes the
  blobs ([§4.2](#42-the-page-blobs)).

### 5.2 `play_word(p_game_id, p_base_version int, p_placements jsonb, p_words text[], p_score int)`

**The core move — a *trusting* commit, not a re-validation** (see
[§6](#6-where-validation-lives) for why). The FE has already validated geometry
and computed `words` + `score` with `lib/play.ts`; it passes them in along with
`base_version` (the `games.version` its board was read at). `placements` =
`[{x, y, letter, blank}]` (`letter` is the played letter — for a blank, its
declared letter).

1. Lock `games` `for update`; `_require_game_player`.
2. **Optimistic-concurrency gate:** if `games.version <> base_version`, someone
   moved first → **`PN437`, a `race`, "Board changed"**. This is the race
   handler — it also rejects a *stale* client that computed against an old
   board. It is a refusal, and the board version rides in the raise's DETAIL,
   where the `[db]` line shows it.

   **This gate is also why almost everything below it is a `fault`.** Any server
   state a later check could disagree with — the rack, the bag, the board —
   would have bumped `version` on its way, so reaching one of those checks with
   a version that MATCHES means the client's own state is wrong. The game's
   ending and the turn escape it: both live on `common.games`, so a peer ending
   the game or the turn moving on reaches the client apart from `version`.
3. **The turn:** `common._require_turn` refuses a move by anyone but the
   player on the common turn pointer — **`PN243`, a race**. Compete always has
   a pointer; coop is free-for-all by default (any player, the pointer null),
   and turn-by-turn when set up that way (`coop_style = 'turns'`). See
   [common-schema.md →
   Turn-order](../common-schema.md#turn-order--opt-in-turn-by-turn-for-coop-games).
4. **Integrity guards** (cheap; data-consistency, *not* anti-cheat): every
   placement is in-bounds and lands on an empty cell; the consumed tiles
   (`?` per blank, else the letter) are actually in the acting rack (compete:
   caller's; coop: shared). These keep the board + bag accounting honest against
   a buggy client; they do *not* re-derive words or score.
5. **Dictionary:** every word in `words` must be legal at the band for its
   length (`dict_2` for 2-letter, `dict_3plus` for 3+). **Any** failure → an
   `ok` · `{result:'invalid', bad_words}`, with **no state change** (the free
   reject); `lib/answer.ts` reads it as `lost`. An `ok` rather than a refusal because this is the
   only validation the client cannot do — the word list is here — so asking is
   what the move was for, and this is the answer.
6. **Apply:** the placements to `board` (a cell-write loop — the server
   builds its own next board, it doesn't trust a board blob); remove the played
   tiles from the rack and **draw replacements from the hidden `bag`** (the
   server owns this — fairness without trust); add the trusted `score` to the
   player's own `players.score` (both modes); insert the `events` row;
   `version += 1`; reset `consecutive_passes = 0`.
7. Check end conditions ([§2.7](#27-ending-the-game)); end the game if met,
   else hand the turn on (`common._advance_turn`, a no-op in free-for-all coop);
   either way, rewrite the blobs.
8. An `ok` · `{result:'accepted', drawn}` — the tiles it drew, whose count is
   the rack's new tiles to flash. What the word did, the page reads from the
   blobs; how it reads (`won`) is `lib/answer.ts`'s.

**The full answer set, and where it is written.** The six move RPCs are thin
wrappers over three shared cores — `_commit_word`, `_commit_exchange`,
`_commit_pass` — which author every answer; a wrapper adds one player gate
(`_require_person`, or `_require_bot` for an AI move) and delegates. The cores
share `_require_move`: the lock, the deleted game, the ended game, and the
version gate. Each wrapper carries its own catch block anyway, and must: its gate
raises BEFORE it delegates, so the core's block never sees it.

**The version gate is what classifies everything below it.** Any server state
a later check could disagree with would have bumped `version` first, so a
MATCHING version plus a disagreement means the client's own state is wrong —
which is why every check after the gate is a fault. The game's ending and the
turn pointer escape, living on `common.games` where no scrabble version tracks them,
and that is why "Game over" and "Not your turn" are races too.

| | | |
|---|---|---|
| `PN437` / `PN447` / `PN456` "Board changed" | `race` | the version gate, one per core |
| `PN486` "Game over" | `race` | the game's ending, which bumps no version; `common._raise_game_over` |
| `PN243` "Not your turn" | `race` | the turn pointer, from `common._require_turn` |
| `PN439`–`PN442` `BUG: …` | `fault` | no word formed, a tile off the board, on an occupied cell, not in the rack |
| `PN449` / `PN450` `BUG: a swap of no tiles` / `…against a bag under seven` | `fault` | |
| `PN454` `BUG: a pass in a coop game` | `fault` | see Deferred — the rule itself is in question |
| `PN443` / `PN451` / `PN458` `BUG: a move from a player with no seat` | `fault` | the person's wrappers, through `_require_person` |
| `PN444` / `PN452` / `PN459` `BUG: an AI move for a player who is not a bot` | `fault` | the AI wrappers, through `_require_bot` |
| `PN485` "That game was already deleted" | `race` | `common._raise_game_deleted`, asked by every wrapper's gate before the membership gate — a friend may delete the game from the club list |

There is **no instant-win threshold** — Scrabble is decided at game end, not by
crossing a score. So `play_word` only *ends* the game via the natural triggers.

### 5.3 `exchange_tiles(p_game_id, p_base_version int, p_rack_tiles text[])`

Lock + version CAS (same stale-guard as `play_word` — it mutates the shared
rack + bag) + gate + (compete) turn check. `p_rack_tiles` are the tile glyphs to
return (`?` for a blank). Requires 7 or more tiles in the bag. Returns the tiles to the
bag, reshuffles, redraws the same count; `version += 1`; logs `kind='exchange'`.
**Compete:** `consecutive_passes = 0` (an exchange clears the streak), advance
turn. **Coop:** none of that — it's just a rack refresh (no compete turns,
no blocked-end). Under **coop turn-by-turn** (setup `coop_style = 'turns'`) the
shared `_commit_exchange` core also gates on `common._require_turn` and hands
off via `common._advance_turn` — an exchange is a real turn-consuming coop move.
(There's no coop pass — `pass_turn` is compete-only, which is the rule now in
question: see Deferred — so only `_commit_word` and `_commit_exchange` carry the
common gate.) Answers an `ok` · `{result:'exchanged', drawn}`; an exchange
never ends a game. A CAS miss is `PN447`, a race, exactly as `play_word`'s.

### 5.4 `pass_turn(p_game_id, p_base_version)` (compete only)

Advances the turn, `consecutive_passes += 1`, logs `kind='pass'`, checks the
blocked-end condition (streak == the players still in). Like the other moves it takes
`base_version` and runs the optimistic-concurrency gate. Answers an `ok` ·
`{result:'passed'}` — a pass is a turn that counts and that nothing
adjudicates — or `PN456`, a race, on a CAS miss.

### 5.5 `replay_board`

The "Restart" menu item / terminal-row Restart. Note what "the board" means
here: scrabble's 15×15 premium grid is the **standard layout**, the same for
every game — not a generated puzzle. So unlike waffle/wordle there is nothing to
restore, and a replay **re-deals**: freshly shuffled bag, new racks, empty grid,
keeping the setup (club, players and bots, turn order, dictionary bands). "Same
table, new deal", not "same puzzle again" — which is also why replay and New
game differ less here than elsewhere (New game additionally mints a NEW game
row, leaving this one in the club's list).

Any game player may call it, from a finished game OR mid-game; both modes reset
every player. Three subtleties:

- **`version` is BUMPED, not zeroed.** It's the optimistic-concurrency counter
  every move RPC checks `base_version` against. Zeroing would let a client
  holding a stale mid-game version play against the fresh deal; bumping keeps
  it monotonic so every in-flight move fails its check — correct, since that
  move was for the old deal.
- **Compete re-randomizes the opener**, matching `create_game`: the deal is
  new, so who opens is drawn afresh — after `common._reset_game`, which rewinds
  the turn to `turn_seat` 0.
- **Coop turn-order rewinds** to the player seated first
  (`game_players.turn_seat = 0`) — `common._reset_game` does it. The rotation
  was assigned at create time and doesn't change, so this restores the original
  opener without re-reading `setup.first_turn_user_id`. A free-for-all game's
  null pointer stays null.

It also puts `common.games.title` back to `"New game"` (the title is the first
three words played — see §7 — so it would otherwise advertise the old deal),
then hands the common half to `common._reset_game`. Takes the row `FOR UPDATE`: a
replay racing a move must not interleave with it. pgTAP: `replay_test.sql`.

### 5.6 `stop_game` / `concede` / `submit_timeout`

`submit_timeout` is countdown expiry and always runs final scoring
([§2.7](#27-ending-the-game)); it is ended by whoever held the turn. `stop_game`
is the player-fired stop and **serves both modes**, through `common._stop`
(neutral, `stopped`). **Coop** then scores the leftovers, with a `leftovers`
row logging the negative value lost; **compete** does no scoring — the group
agreeing there's no result. The FE **menu** surfaces one exit per mode: **Stop
game** in coop, **Concede** in compete, whose question offers the whole-table
Stop as its second answer (`useStandardGameActions`, for every race), so the
neutral compete branch is reachable from the board.

`scrabble.concede` is the per-player "I quit, the others keep playing". It locks
the row and calls `common._concede`. Because scrabble is turn-based, a
concession is more than a record: `common._advance_turn` **skips** conceders,
`_finish` ranks only players who **didn't concede** (a drop-out forfeits even a
tying score), and `scrabble.concede` hands the turn on if it was the
conceder's. When the last **person** concedes, the game ends `conceded`:

- **with bots at the table**, through `scrabble._maybe_finish_compete`, named as
  the other elimination games name theirs — final scoring, then the bots ranked
  by score. **The bots win when every person concedes** (Joel, 2026-09-27:
  plans/common-tables.md → Decided): the winner is picked among players who
  have not conceded, and a bot never does;
- **without bots**, inside `common._concede`, a loss for everyone — and
  final scoring still runs, so the scores the page shows are the final ones.

FE: `act-concede` (hidden in coop) in compete, a conceder "out" in the
opponent strip (and `score (conceded)` at the end), the board inert once
conceded. See [common-schema.md →
Concede](../common-schema.md#concede--per-player-drop-out). pgTAP:
`concede_test.sql`.

---

## 6. Where validation lives

The rules split by **where each piece's data is**, so nothing complex is written
twice:

| piece | needs | lives |
|---|---|---|
| geometry (in-line / contiguous / connected / center) | the board | **FE** `lib/play.ts` |
| word extraction (main + cross-words) + scoring | the board + premium grid | **FE** `lib/play.ts` |
| dictionary legality | `common.words` (283k rows) | **server** `play_word` |
| bag draw (rack refill) | the hidden `bag` | **server** `play_word` |
| endgame + final scoring | every player's rack/score | **server** |

The geometry + word-extraction + scoring — the genuinely intricate logic — runs
**only in TS**, where the board already is. The FE evaluates a play instantly
(live score, word highlighting, illegal-placement graying) and, on submit, hands
the server the `placements` it made, the `words` it read off, and the `score` it
computed. **The server trusts those** (per the trust model — players are
friends; we don't defend against cheating) and only does the things it alone
can: check the words against the dictionary, draw replacement tiles from the
hidden bag, and keep the books. This is the model Joel chose: simpler SQL, one
implementation of the hard logic, and the same `lib/play.ts` is what the AI move
suggester reuses ([§11](#11-the-move-suggester-ai)).

**Atomicity + races, without re-deriving the move.** Trusting the FE could
open a read-then-write race, especially in coop's shared rack; it is handled by
**optimistic concurrency**, not by re-validation.
`games.version` is a move counter; the FE submits the `base_version` its board
was read at, and `play_word` does a compare-and-set under the row lock: if the
version moved, the move is refused as a race ("Board changed") and the player
tries again on the fresh board. This is the explicit form of stackdown coop's
"first submit wins, the other resets," and it *also* catches a stale client
that computed against an old board (which a bare lock would silently clobber).
Two cheap **integrity guards** (placements in-bounds + on empty cells; consumed
tiles really in the
rack) protect the board/bag accounting from a *buggy* client — they're
data-consistency checks, not the duplicated word/score logic.

**The trade-off, stated honestly.** Server-authority for geometry/score is gone:
a buggy (not malicious) client could persist a wrong score or a missed
cross-word. We accept that under FE-trust; the mitigation is that `lib/play.ts`
is the single, unit-tested source of those rules. If we ever wanted server
authority back, the port target is exactly that one tested module — but YAGNI
today.

(No edge function on the *play* path: the dictionary check and bag draw are
trivial SQL. scrabble's one edge function, `scrabble-suggest-move`, is the
[§11](#11-the-move-suggester-ai) hint helper — advisory, never a validator.)

---

## 7. Frontend (`src/scrabble/`)

Shared `PlayArea` / `SetupForm` / `Help` / `useGame` for both manifests, the
mode read at render off `gd.mode`. The **board column** holds the 15×15 board
(the square *hug* model — `--side = min(--avail-w, --avail-h)`, the largest
square that fits, like waffle/boggle) and, directly below it, the **rack and
the move row** (the rack *is* the input, so it lives with everything needed to
play). That row is pinned to the board width: the rack, with Shuffle
(`act-shuffle`, `⌥Z`) floating over its corner; then Recall
(`act-recall-tiles`) and Show move (`act-share-preview`, coop with a teammate) on
the left of the controls; and the **move slot** on the right — Swap
(`act-exchange`, icon-only, carrying its own reason when it can't act), Pass
(`act-pass`, compete only, the end-turn octagon in the registry's caution
tone) and Submit (`SubmitWithScore` over `act-submit`, doubling as the live
score, "+23", an em-dash with nothing staged). The move slot doubles as the
**local feedback area**: while the slot holds a message — a move's answer, a
refusal, "Conceded — race continues", whose turn, the ending — its
`<FeedbackPill>` takes the buttons' place ([ui.md → Feedback
pill](../ui.md#feedback-pill)). Submit is enabled for *any* staged tiles; an
illegal shape surfaces as a `lost` pill on submit rather than a gray button.
The **info column** holds the state line, the compete opponent strip (metric
"Score"), coop's whose-turn line under turn order, one action row, a help
line, the suggestions, the setup options, and the move log filling the rest.

**Mobile** (the [mobile.md](../mobile.md) info-sheet recipe): below the
breakpoint the board fills the width and the info column moves into the
off-canvas `<InfoSheet>`. The state stays on the play surface via the shared
`<MobileStatusBar>` above the board — scrabble's `StateLine` ("Your turn · 7 in
bag" / "Turn: ● moth · 7 in bag" / coop's "Team score: 152 · 7 in bag"), the
same component the info column draws, so the two can't drift ([mobile.md → The
mobile status bar](../mobile.md#the-mobile-status-bar--core-state-above-the-board)).
At phone widths the rack and the controls can't share one line, so at `@media
(--phone)` `.moveArea` wraps and `.controls` takes a full-width second row —
unconditional, never state-dependent — with the below-board reserve and
`--avail-h` grown in lockstep so a height-bound landscape board still fits
without page scroll. Guard: `e2e/scrabble-mobile.e2e.ts`.

**Laying a move out — three ways.** Drag a tile rack→board, board→board
(move), board→rack (take it back), or rack→rack to reorder it (people
rearrange tiles to hunt for anagrams). Or tap a cell to put the keyboard cursor
there and type: an arrow moves the cursor, a sideways arrow turns it, a letter
stages a rack tile for it (or a blank declared as it) and moves on past played
tiles, ⌫ takes one back — the shared `useBoardCursorKeys`, with Submit as its
commit (Enter). Or tap a rack tile, then tap an empty cell: one picked tile is
placed there; with two or more picked, a tap on a cell does nothing, since it
can't say which. A tap on a rack tile picks it — to place, or for a Swap.

**Two gates.** `isInteractive` (stage, recall, reorder) is true while I'm
still playing on the live board — **on another player's turn too**, so a
racer can *pre-play*: lay a move out while waiting and see its score on a gray
Submit. `canSubmit` (Submit / Swap / Pass) adds my turn. When an opponent's move
lands, a pre-play **persists** — *unless* the move took a cell I'd staged on,
when it is cleared with a terse `warning`, "Pre-play cleared: conflict". In
coop a teammate's move resets my staged tiles (the stackdown-style "first
submit wins").

**The board viewer.** The shared turn-history viewer — the `#N` handle, the
history frame and banner, the ✕ / click / any-key / new-move exits ([playarea.md
→ Turn-history viewer](../playarea.md#turn-history-viewer)) — shows two things
in scrabble: a past turn, drawn as the board just after it (`historyBoard`
folds every word's tiles up to that row, since no row keeps a board; that
turn's tiles wear the attention face and a green ring; the banner reads "#12
Bea: +54 JUKEBOX" or "#5 Bea passed"), and in coop a teammate's **preview**
(below). `useHistoryView` picks the cells, and PlayArea hands BoardCol the
board to show. The rack stays mounted underneath the banner, so a staged move
survives a look back.

**One case, the data's.** Letters are lowercase in the blob, in state, in
every RPC call and in `lib/`; the capitals go on where a letter is drawn — CSS
`text-transform` on the tile, the drag ghost and the blank picker, and by hand
in a pill's sentence, the banner and the PDF.

### The component tree

Folder [`src/scrabble/`](../../src/scrabble/), on the page blobs: `useGame` is
`makeGameData(game_data, me)` — no read, no subscription — and every type the
folder exports is in [`types.ts`](../../src/scrabble/types.ts) (the `gd`
sketch at its top), or in `reactTypes.ts` for the one that reaches React.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: picks the board to show
        ├── BoardCol                the board, the rack and the move row; owns the move
        │     ├── MobileStatusBar ← on a phone: StateLine
        │     ├── Board             the 15×15 grid; decides each cell's marks
        │     │     └── Cell        one spot: its premium, the cursor, a drop ring
        │     │           └── Tile  the tile on it: letter, value, a blank's ring
        │     ├── HistoryBanner ←   over the rack row while a turn or a preview is open
        │     ├── Rack              my rack in my order
        │     │     └── Tile        the same tile, in a slot
        │     ├── Controls          Recall, Show move, and the move slot or its pill
        │     └── BlankPickerBlockingModal   a placed blank's letter
        ├── InfoSheet ←             off-canvas on a phone, a flex child on desktop
        │     └── InfoCol           the readouts and the action row
        │           ├── StateLine
        │           ├── OpponentStrip ←    compete only: each player's score, or "out"
        │           ├── TurnStatusLine ←   turn-by-turn coop only
        │           ├── InfoActionsRow ←   one row, every action
        │           ├── SuggestPanel       coop's suggested moves
        │           ├── SetupDisclosure ←
        │           └── GameEventLog       every row
        └── CelebrationBlockingModal ←  a race won

  ← belongs to common/ ; everything else is this folder's
```

`PlayArea`'s hooks: the two ending messages (`useGetGameEndingMessage`,
`useGetPlayerEndingMessage`, from `lib/gameEndingMessage.ts` and
`lib/playerEndingMessage.ts`), `useShowOpponentMoves` (each opponent's turn in
the header, compete only), `useHistoryView`, `useMovePreview` (the Broadcast),
`useSuggestMove` (coop's suggester and its action), `useDriveAiTurns` (pokes
`scrabble-ai-move` while a bot holds the turn) and `useActionsAndMenu`.
`BoardCol`'s: `useSubmitMove` (the three move RPCs, the claim on the rack, the
held tiles and the green and red marks), `useStagedTiles` (the staged tiles,
the picks, the blank's letter, a suggestion staged, a tap-placed tile),
`useRackOrder` (my order, Shuffle, the drawn-tiles flash), `useBoardDrag` (the
drag and the taps) and `useBoardColActions` (the cursor keys and the six
commands). `lib/`: `board.ts` (the constants and the board-string decoders),
`play.ts` (the geometry, the words and the score — the one copy), `suggest.ts`,
`rank.ts` and `policy.ts` (§11–12), `answer.ts`, `eventText.ts` (a logged
turn in words, for the banner and the printout), `rackOrder.ts`,
`aiLevels.ts`, `setup.ts` and `setupRows.ts`.

**A move claims the rack before its RPC returns.** My own write can bump the
board's version while the call is still out, and the landing must read that as
MY move — rebuild my rack, keep what stayed in place and put the drawn tiles on
the right — rather than an opponent's. So `useSubmitMove` claims the slots
first and gives them back on any answer that wrote nothing. A played word is
held on the board until the blob has it, so it never blinks off.

### The answers (`lib/answer.ts`)

`answerMessage(answer)` says how every answer reads — the pill, the header's
opponent line, the log's bar: a played word is `won` ("CAT · AT +10", 🎉 for a
bingo); the dictionary's refusal is `lost` ("No: QZX") and writes no row; an
exchange, a pass and the two ending rows are `neutral` — scrabble adjudicates
the PLAY and lets the score carry everything else. `eventToOutcome(row)` colors
a log row. A play the board turns away for its shape is not an answer: it
never leaves the client, and its pill is its only surface. The rule this
follows is [outcomes.md → One event, one
outcome](../outcomes.md#one-event-one-outcome--and-who-decides-it).

### Move preview (coop)

In coop with a teammate, a player laying a move out can press **Show move to
team** (`act-share-preview`, beside Recall) to broadcast their staged tiles;
teammates see them laid on their own live board, read-only — the twin of the
board viewer, with its chrome (a framed board and a banner, "● moth showing:
+18 BERRY") and its exits. It's **ephemeral** — the stable Broadcast channel of
`useMovePreview`, never stored; a teammate who misses it simply doesn't see it.
The payload (`GMovePreviewRaw`) is the placements, `byId`, `baseVersion`, and the
words and score for the banner; a receiver whose board has moved on since
`baseVersion` drops it. The preview wears its own color
(`--peer-preview-color`, through the shared `.peerPreview` override of
`--history-accent`). Verified cross-client in `e2e/scrabble-show-move.e2e.ts`.

### Realtime channels

| channel | opener | carries |
|---|---|---|
| `game:${gameId}` (stable) | `useCommonGame` | presence, pause, and the `changed` nudge the `common.games` row's trigger sends once per move, so this is how the page hears of every move and the end |
| `scrabble:${gameId}` (stable) | `useMovePreview` | **coop only** — the `show-move` Broadcast. Ephemeral, never stored; stable name so teammates merge into one room. |

### Printing the board (PDF)

scrabble joins the printable games — a **"Print board (PDF)"** GamePage menu
item that hands you a paper record of the game. It shows the 15×15 board
(premium squares in faint pastels), the rack, and the move log flowing
newspaper-style down two columns (`src/scrabble/pdf/printScrabblePdf.ts`). The
shared clean-printable design language + helpers live in
[common/pdf/doc.md](../../src/common/pdf/doc.md).

---

## 8. Title formula

The `common.games.title` is the **first three words played**, uppercased and
dash-joined (e.g. `"SCOWL-TABLE-QUARTZ"` — the app-wide separator for a title
built from several words), built by `scrabble._title_for` and
rewritten by `play_word` in **both** modes — a game is recognizable at a glance
in the club list. No spoiler risk: the board is public, so the words are already
visible. A fresh game stays `"New game"` until the first word lands.

---

## 9. The summary

The club line reads `summary_data` ([§4.2](#42-the-page-blobs)) and the
ending (`manifest.ts`'s `summaryFor`). **Mid-game:** coop's score and the bag —
`Playing · 152 pts · 47 tiles left`; compete's bag — `Playing · 47 tiles
left`. **At the end:** coop's `Ended · 312 pts` for the bag played out and for
a Stop alike (the first is a `won` outcome, drawn green), `Lost (out of time) ·
152 pts` on the clock; compete's `Won by alice · 312 pts`, `Won (tied) · alice
& bob · 280 pts`, `Lost (all conceded)`, or `Ended` for a Stop.
`npm run report:summaries` prints them all.

---

## 10. Tests

**Vitest** (`src/scrabble/`):

| file | pins |
|---|---|
| `lib/board.test.ts` | the premium layout, the tile values and distribution, the board-string decoders |
| `lib/play.test.ts` | geometry (off-line / gap / disconnected / center-first), main + cross-word extraction, scoring (premiums only under new tiles, stacked multipliers, bingo +50, blanks 0), `historyBoard` |
| `lib/suggest.test.ts` | the move generator's exact move-set against a brute-force reference, on hand-built and random boards |
| `lib/rank.test.ts`, `lib/policy.test.ts` | the leave heuristic and ranking; the bots' choice and a self-played game |
| `lib/rackOrder.test.ts` | the rack order after a draw |
| `lib/answer.test.ts`, `lib/gameEndingMessage.test.ts` | every answer's words and outcome, and every ending's, both modes |
| `lib/setup.test.ts` | the setup's checks |
| `hooks/useGame.test.ts` | `makeGameData`: the decoded board, the log's tiles, a rival's rack withheld mid-race and shown at the end, the board and bag on every player, the side's facts and `own` |
| `hooks/useStagedTiles.test.ts` | staged tiles kept when an opponent's move misses them, a typed letter's tile, a tap-placed tile |
| `hooks/useSubmitMove.test.ts` | the claim on the rack, taken once on a played word and given back on a refusal |
| `components/Board.test.tsx` | which marks a cell's tile wears |
| `components/GameEventLog.test.tsx` | the whose-moves picker (a bot pickable like anyone), the ending rows' words |
| `components/SetupForm.test.tsx` | the form's checks |
| `components/PlayArea.test.tsx` | the wiring, on the fixture: both modes, the turn, the bots' poke, the viewer and a preview, the strip, the action row, the rack row, a typed word submitted, a tap-placed tile, Pass, `+`, `⌥⌫`, Restart |

The fixture (`lib/gameData.fixture.ts`) builds the `game_data` blob from a
game's facts as the builder would.

**pgTAP** (`supabase/tests/scrabble/`) — the *server's* job, the trusting
commit, not the TS-owned geometry and scoring:
- `game_data` — the blobs: a fresh game, a blank in the board string and its
  placement, every rack in the blob, the endings' rows and winners, a Restart,
  and the rebuild for every game.
- `create_game` — the deal (compete's racks / coop's one rack), version 0, the
  player-count floors, the turn order (people then bots).
- `play_word` — the **version gate**, the integrity guards, the **dictionary's
  free refusal** (no row, no state change, no version bump), the happy path,
  the turn handed on, the **title**, and a word into a game a friend just
  deleted (PN485).
- `exchange_pass` — the bag-≥7 gate, the version gate, the pass streak (a pass
  feeds it, an exchange clears it), the turn handed on, and each into a deleted
  game.
- `auto_finish` — the game ending itself: going out and the all-passed end, the
  leftovers and `went_out` rows, the ranking and a tie sharing it.
- `stop_game` — coop's Stop paying its leftovers, compete's neutral Stop, and
  `submit_timeout`'s final scoring.
- `turn_order` / `compete_turn_order` — coop's opt-in turns and compete's turn
  on the common pointer: people then bots, the out-of-turn race, the turn
  handed on, a conceder skipped, a restart.
- `replay` — the re-deal ([§5.5](#55-replay_board)).
- `concede` — the turn-based concede ([§5.6](#56-stop_game--concede--submit_timeout)).
- `ai_players` — the bots ([§12](#12-the-ai-opponent-compete)).
- `get_suggest_context` — the suggester's door ([§11](#11-the-move-suggester-ai)).
- `rls` — what a club member may read: the bands, the bag and the racks never.

(No TS↔SQL mirror test — there's no SQL scoring to mirror. `lib/play.test.ts`
is the single source of truth for geometry and scoring.)

---

## 11. The move suggester (AI)

Coop's info column has a **Suggest** button (`act-suggest-move`, sparkles +
amber); it returns the top-5 legal moves, and clicking one **stages** that
move's tiles — the same staging state a hand-placed move uses, reviewed and
submitted through the normal play flow. The suggester is advisory: it never
submits.

**The engine is pure TS in `src/scrabble/lib/`**, beside the play engine it
reuses:

- `suggest.ts` — `generateMoves`: complete legal-move enumeration, the Appel &
  Jacobson 1988 recipe (anchors, cross-check masks, left parts) run across +
  transposed, over the shared flat trie (`shared/dict-trie/trie.ts`, whose
  **rated terminals** carry each word's difficulty 1..6). Its `isLegal` is the
  band predicate, applied to every formed word — main and cross-words alike:
  `difficulty ≤ (len = 2 ? dict_2 : dict_3plus)`, matching `play_word`'s SQL by
  construction. Verified by **exact move-set equality against a brute-force
  reference generator** in `suggest.test.ts`.
- `rank.ts` — `rankMoves`: every candidate scored **through `evaluatePlay`**
  (a hint's score can't disagree with what the game awards), plus a hand-rolled
  Maven-style **leave** heuristic; sorted by `equity = score + leave`. The
  strength levers (vocab cap / score fraction / leave off) are in the signature
  but not yet in the UI.

**The edge function `scrabble-suggest-move`** hosts the engine (the dictionary
deliberately never ships to the game FE). It builds ONE all-bands rated trie at
cold start from a bundled word list (`gmake g-scrabble-trie` generates it — len
2..15, american OR british, all bands, **minus slurs + profanity** (`slur = 0
AND crude = 0`, 612 of ~277k); git-ignored, rebuilt on deploy). That last filter
makes the trie a **strict subset of what `play_word` accepts**, and deliberately
so: a player may play a crude word, the AI may not. The same trie backs the
autonomous opponent ([§12](#12-the-ai-opponent-compete)), so this one asset
decides it for both. Consequences worth knowing: the suggester will miss a few
high-scoring plays a human could make, and the AI won't *extend* a crude word
already on the board (the cross-word it would form isn't in its trie, so it
plays elsewhere). Calling shape:

```
POST /functions/v1/scrabble-suggest-move   { game_id }
  → { result: 'suggested', moves: GRankedMove[] /* top 5 */, version }
  · { result: 'no-legal-moves', version }            · a not-ok envelope
```

**`scrabble.get_suggest_context(uuid)`** is the function's one read — a SECURITY
DEFINER RPC (the `codenamesduet.get_clue_context` shape), because the dictionary
bands are **grant-hidden** on `scrabble.games` and this is the one sanctioned
door. It asks that the game still exists (a friend may have deleted it: the
shared race), then enforces membership (`_require_game_player`), that the game hasn't
ended, and **coop only** (in compete the rack is private — the gate is also
what keeps the suggester from becoming a rack-reading side channel), then
returns `{board, rack, dict_2, dict_3plus, version}` from one SELECT — an atomic
snapshot. `board` is the page's own board string (`_make_json_board`), which the
edge function decodes with the same `lib/board.ts` as the page. pgTAP:
`get_suggest_context_test.sql`.

**`version` is the staleness currency** (coop has no turns, so a teammate can
play while a hint is in flight). Staleness is **derived at render**, never
messaged (`useSuggestMove`): a `ready` list shows exactly while its version is
`gd.version` and hides otherwise — so it quietly clears the moment the board
moves past it (most commonly because the player just played the suggested
move), and a hint
whose DB-fresh version is *ahead* of a lagging FE simply appears once the FE
catches up (no false "board changed" alarm). The suggest box **claims no space
when idle** and snaps to a **fixed height** once it holds content (loading /
results / error), so an arriving list never reflows the column below it. The
e2e (`scrabble-suggest.e2e.ts`) checks these invariants against the real edge
function in a real browser.

## 12. The AI opponent (compete)

Distinct from the always-best suggester above: an autonomous **AI player** you
can seat in a **compete** game — 0–3 of them, all at one chosen skill level —
built on the same engine.

**The bot is an account.** A bot's row in `scrabble.players` carries an
`ai_level`, and the player is one of the three bots — ordinary accounts with
`common.profiles.ai_member` set, seated in `common.game_players` like any
player but in **no human's club**, which is what keeps them off the club
roster. Presence-pause skips them by the same mark. `create_game` seats people
then bots, and the turn walks them in that order on the common turn pointer; a
bot takes its turn, and wins, like anyone. The person's move RPCs
(`play_word` / `exchange_tiles` / `pass_turn`) and the AI twins
(`ai_play_word` / `ai_exchange_tiles` / `ai_pass_turn`, naming the bot by
`p_user_id`) share one core (`_commit_word` / `_commit_exchange` / `_commit_pass`), so there's no
second copy of the trusting-commit logic.

**The brain is `src/scrabble/lib/policy.ts`.** `choosePlay(board, rack, trie,
bands, knobs, rng)` picks one move (or an exchange) — pure + deterministic given
`rng` — by generating every legal move, ranking it under the knobs, then
applying two human-fallibility filters. Five preset **levels** (`LEVELS`):
beginner / casual / intermediate / strong / best. The knobs:

| knob | effect | source |
|---|---|---|
| `vocabCap` | the AI only *plays* words at/below a difficulty band | `rankMoves` lever |
| `scoreFraction` | aim the pick at a fraction of the best equity | `rankMoves` lever |
| `useLeave` | include the leave heuristic (off → greedy; the rack degrades over a game) | `rankMoves` lever |
| `bingoMissProb` | probability of "not seeing" an otherwise-best bingo (anagramming is hard) | fallibility |
| `equityNoise` | Gaussian jitter on equity before the argmax (doesn't reliably *find* the best) | fallibility |

**Orchestration** — a client-invoked edge function `scrabble-ai-move` loops
`get_ai_context` (the context of the bot holding the turn pointer, its
`user_id` included, or `{result: 'done'}` when it's a person's turn or the
game has ended) → `choosePlay` → the matching `ai_*` RPC, walking a chain of
bots taking turns in a row in one invocation until a person's turn. Any
connected client may poke it — `useDriveAiTurns` fires, once per board
version, while the turn holder carries an `aiLevel`; the RPCs are turn- and
version-guarded, so a duplicate poke loses the race and stops. `get_ai_context` is the
`SECURITY DEFINER` door to the bot's hidden rack + the grant-hidden bands —
the twin of `get_suggest_context`.

**The band rule.** Whenever an AI is present, the game's `dict_2` AND
`dict_3plus` must be ≥ the level's band (its `vocabCap`: beginner 1, casual 2,
intermediate 4, strong/best 6). The setup form **validates** this as a blocking
error and never silently raises the dictionary (a hidden change would be a
trap); `create_game` re-checks as the authority. Because the AI generates
against the game's own bands, it can never play a word illegal in the game — the
rule only stops it from playing *below* its tuned strength.

**Tuning + measurement.** The level presets were tuned with a headless self-play
harness — `npm run scrabble:selfplay` (`supabase/scripts/scrabble-selfplay.ts`
over `policy.ts`'s `playSelfGame`), which self-plays coop games over **paired
bag seeds** (common random numbers) so a modest sample resolves each knob's
effect against tile-luck variance. The shipped ladder averages ≈ **450 / 582 /
720 / 844 / 906** points per coop game (beginner → best). Known simplification:
no *strategic* exchange — the AI only swaps when it has no legal play at all.

**Surfacing.** Solo clubs get the compete Start button (`scrabble_compete`'s
`min_players` is 1 — you race the AI alone), badged **"AI Compete"** by
`ModeBadge`. Each opponent's turn (a person's or a bot's) is announced in the
global header as a `peer` message ("● ada-bot played COATS (+18)"); an AI seat's
score shows in a compact strip in the info column. pgTAP: `ai_players_test.sql`;
e2e: `scrabble-ai-player.e2e.ts` (a human-vs-AI game against the real edge
function).

## Deferred

**Passing is refused in turn-by-turn coop, and probably should not be** (raised
2026-09-01, converting the area to envelopes). Scrabble supports the opt-in
coop turn pointer — `create_game` seats it when `setup.coop_style = 'turns'`,
and BOTH other move cores respect it: `_commit_word` and `_commit_exchange`
each `perform common._require_turn` and `_advance_turn`. `_commit_pass` is the
odd one out: it refuses coop outright, on the stated grounds that *"coop has no
turns to pass"* — which was true before opt-in turn coop landed and is not true
now.

Deliberately left alone rather than fixed in passing, because allowing it is a
GAMEPLAY decision with a second question inside it: compete's pass feeds
`consecutive_passes`, the blocked-end counter, and coop has no blocked end. So
a coop pass either stays a pure hand-off — the shape letterboxed's undo takes,
priced at one turn — or it becomes a way for a coop game to end in a stalemate,
which is a rule this game does not have today. The FE's `act-pass` is hidden in
coop, so nothing is broken meanwhile; the refusal is a fault (PN452) for
exactly that reason.

**The AI suggest-a-move box is the one SelectionList site that didn't convert,
and the choice is still open.** It was on the roster for
[`<SelectionList>`](../ui.md#selection-lists) and should not have been: the box
is five bare text lines with no frame, no surface, no hairlines and no hover,
pinned to a fixed `5 × 1.35rem = 6.75rem` (`SuggestPanel.module.css`) whose own
comment says a growable height would shift the setup disclosure and the Moves
log below it.

A SelectionList row is ~2.4rem with its padding, so five of them run to ~12rem.
Converting therefore roughly doubles the box and reflows the column — the one
thing that height rule exists to forbid — and brings the frame, the surface and
the hairlines with it, which is a visible redesign of a game's info column.

Three ways out, none of them chosen (closed out of the `homepage` area
2026-08-24, moved here 2026-09-02 when the SelectionList plan was swept):

1. **Leave it bespoke**, as crosswords' clue lists are. It is a list of five
   readouts you can click, and the family resemblance may be all there is.
2. **Give `<SelectionList>` a frameless, compact form** — a real new variant
   rather than a `density`, since "no frame" contradicts *the frame is what says
   this is a list*.
3. **Redesign the box** to wear the frame, and redo the height arithmetic.

It is a scrabble-area decision either way, which is why it waits for scrabble's
CSS pass rather than being settled from outside.

**`<SubmitWithScore>` doesn't fit the shared button shape.** It composes
`cls('button', 'primary', styles.button)` and its own module supplies
`justify-content: space-between; width: 5.5rem` — a fixed-width button with the
label pushed left and the live score pushed right. Every other shared button is
the centered icon-and-label shape, so this is the one genuine variance case in
the roster, and the shared `Button` component can't express it today.

Deferred to scrabble's own CSS-sprint area (2026-08-25) rather than decided in
the `forms` area: the question is what this button should look like, which is a
scrabble question, and the answer may be a shared prop or may be that scrabble
keeps a shape of its own.
