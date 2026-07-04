# scrabble

A Scrabble-style word game: players build interlocking words from lettered tiles
on a 15×15 premium-square board, drawing from a shared 100-tile bag and scoring
by letter values × board premiums. The first game in the roster that is
**turn-based with a shared, contended resource** (one board, one bag) — which is
where almost all of its novelty lives.

> **Brand ≠ codename.** User-facing name is **scrabble**; the identifier
> everywhere in code / DB / schema / tests is `scrabble` — the codename keeps the
> link to the original game obvious in source, the same call waffle/`waffle`
> and wordle/`wordle` make. ("Scrabble" is a trademark, so it can't be the
> brand, but as an internal codename it's the clearest possible name.)

scrabble is a **coop / compete sibling pair** (`scrabble_coop`,
`scrabble_compete`) and inherits the shared chrome — timer, chat, presence-pause,
manual "End game" — through `<GamePage>` + `useCommonGame`, like every other
multiplayer gametype.

> **Status: live.** scrabble is the **9th** registered gametype — built
> end-to-end (engine, migration, RPCs, FE) and shipping. Design forks settled in
> §11. A few choices landed *after* the initial build, from playtesting, and are
> reflected throughout: two difficulty bands by word length ([§3.3](#33-the-dictionary-difficulty-bands-by-word-length)),
> the coop "tiles unplayed" forfeit ([§2.7](#27-ending-the-game)), and the
> title/label shapes ([§8](#8-title-formula), [§9](#9-status-jsonb--labels)).

---

## 1. The shape of the novelty

Every existing game is either "any player acts whenever" (spellingbee, stackdown
coop) or fixed two-seat (codenamesduet). scrabble is structurally different in three
ways that drive most of the schema:

1. **One shared 15×15 board** all players mutate, sequentially.
2. **One shared 100-tile bag** everyone draws from — a *contended* resource, not
   a per-player puzzle.
3. **Rotating turns** (compete only) where only the active player may act.

The flip side: there is **no board library and no builder edge function**. The
board layout and tile distribution are *constants in code*; the only per-game
randomness is the bag's shuffle order. So unlike spellingbee / waffle / stackdown,
there's nothing to pre-generate and nothing to import. The complexity instead
lands in **move evaluation** (a single placement forms a main word *plus* every
perpendicular cross-word) — which lives in **one place, the TS `lib/play.ts`**,
shared by the live preview and the commit path (see [§6](#6-where-validation-lives))
— and in **turn / lifecycle management**.

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
- **Rack:** 7 tiles. **Compete:** each player has a *private* rack (RLS hides
  peers' racks). **Coop:** there is **one shared rack** the whole team plays from
  (see [§2.4](#24-coop-vs-compete)).

### 2.2 A play (placing a word)

On a turn (compete) or at any time (coop), a player places one or more rack tiles
on empty board squares. The play is legal iff:

- **First play covers the center** (7,7).
- **All placed tiles lie in a single row or column**, contiguous along that line
  (gaps are allowed only where the board already has tiles bridging them).
- **After the first play, the new tiles connect** to at least one existing tile.
- **Every word formed is in the dictionary** — the *main* word along the line of
  play, *and* every perpendicular **cross-word** of length ≥ 2 that a new tile
  participates in.

The first three (geometry) and the scoring are evaluated **on the FE** by
`lib/play.ts` — instantly, so the player sees their score and any illegal
placement before they commit. The fourth (dictionary) needs the 283k-row word
list, which lives in Postgres, so the **commit RPC** checks it. See
[§6](#6-where-validation-lives) for the full split + the optimistic-concurrency
race handling.

A play that fails the **dictionary** check is **rejected for free**: the tiles
bounce back to the rack, nothing is consumed (no turn lost in compete, no score
change), and the attempt is *not* logged. Per our trust model + Joel's call:
penalizing a rejected word turns the game into "did you memorize the difficulty
bands," which is not the game. (Geometry-illegal plays never reach the server —
the FE won't let you submit one.)

A play that passes is **scored** ([§2.3](#23-scoring)), its tiles are committed
to the board permanently, the rack is **refilled** from the bag (draw as many as
were played, or as many as remain), and — in compete — **the turn advances**.

### 2.3 Scoring

Standard Scrabble scoring:

- Each tile contributes its letter value, multiplied by any **letter premium**
  (DL/TL) on its square — *but only for premiums under newly-placed tiles*. Tiles
  already on the board score face value with no premium.
- Then **word premiums** (DW/TW) multiply the whole word's total — again, only
  premiums under *newly-placed* tiles count, and they stack (two DWs in one word
  = ×4).
- A play that forms multiple words sums each word's independent score.
- **Bingo:** using all 7 rack tiles in one play scores **+50**.
- **Blanks** score **0** but still occupy their declared letter for every word
  they're part of.

### 2.4 Coop vs compete

- **Compete** (`scrabble_compete`, 2–4 players): classic Scrabble. **Turn-based**
  — a rotating order, only the active player may play / exchange / pass. Private
  per-player racks, per-player scores. Highest final score wins.
- **Coop** (`scrabble_coop`, 1–4 players, solo-capable): **one shared rack, one
  shared board, one shared bag, one shared score.** There is **no turn rotation**
  — *any* player may attempt a word at any time; players coordinate over chat to
  plan the team's best move. The team plays for the highest score it can reach
  (a "see what you can get" practice/collaboration mode; solo is just the
  1-player case).

  Mirroring stackdown coop: a player **stages tiles privately** — tentative
  placements are local to their client, never broadcast — and only on a
  successful **commit** does the word hit the shared board for everyone. Commits
  serialize on the game-row lock, so if two players commit at once the first wins
  and the second's staged word **resets** — and because the rack is *shared*, a
  peer's commit can pull tiles out from under your half-built word, forcing the
  same reset (exactly stackdown's "whoever submits first claims it, the other's
  in-progress resets," with the shared rack as the contended resource).

### 2.5 Blank tiles

A blank is wild, but **its letter is declared at the moment it's played and is
permanent** for the rest of the game (this is the real Scrabble rule — a blank
played as the `M` in `MASK` can never later be reread as a `T`; you'd build
`TASK` off the *real* A/S/K instead). So the FE **demands the letter when the
word is entered** (a small picker on commit), the board tile stores
`{ letter, is_blank: true }`, and that letter is immutable and used for all
future word validation. The tile scores 0 forever.

### 2.6 Exchange & pass

- **Exchange:** return some or all rack tiles to the bag, reshuffle, and redraw
  the same count. Legal only when the **bag holds ≥ 7 tiles** (standard rule).
  Costs the turn (compete) and counts as a **scoreless turn** ([§2.7](#27-ending-the-game)).
- **Pass:** forfeit the turn with no play. Compete only (coop has no turns —
  the coop "we're stuck" path is exchange-if-possible or **End game**). Counts as
  a scoreless turn.

### 2.7 Ending the game

Two natural end triggers, plus the universal manual / timeout paths:

- **Going out:** the bag is empty **and** a player empties their rack (compete) /
  the shared rack is empty (coop). The classic end.
- **Blocked (compete only):** 6 consecutive scoreless turns (passes + exchanges
  with no word played) — the standard tournament signal that nobody can move.
  **Coop has no blocked-end** (and no turns/passes): it ends *only* on going-out
  or **End game**.
- **Manual end** (`end_game`): any player stops the game. **Compete** is the
  uniform neutral stop ([common.md → Manual end](../common.md#manual-end--every-gametypes-end_gametarget_game))
  — no winner, no scoring. **Coop deviates** (see below): it *forfeits* the
  leftover-tile value.
- **Timeout** (`submit_timeout`): a countdown clock hit 0.

**Final scoring** runs on every terminal except a **compete** manual end:

- **Compete:** each player's leftover rack-tile values are **subtracted** from
  their score; the player who went out **gains the sum of all opponents'
  leftover values**. Highest final score wins (`won_compete`); a tie crowns
  **co-winners** (all top-scorers get `{won: true}`).
- **Coop:** leftover shared-rack values subtract from the team score; the final
  number is reported. Coop has no opponent, so there's no "loss" — completion is
  a neutral score report; a countdown that expires first just frames it as
  "time's up" (gentle, not a punishment). **Manual end is NOT neutral in coop**:
  ending with tiles still in hand forfeits their value from the team score
  (logged as a `'forfeit'` play, a red "−N tiles unplayed" in the log). This is
  deliberate — it pushes a solo/coop team to find plays for its last tiles
  rather than just stopping, the same penalty a natural end applies.

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

The legal word set is the shared `common.words` list (see
[common.md → The word list](../common.md#the-word-list-commonwords)), gated by
**two per-game difficulty bands** chosen at setup — one for **2-letter** words
(`dict_2`) and one for **3+-letter** words (`dict_3plus`), both 1..6. A word is
legal iff `difficulty ≤ the band for its length` and it's valid in the
**american OR british** dialect (the codebase's default-play convention). The
two-band split (the same bananagrams uses) exists because 2-letter words are a
thin, separate vocabulary you usually want to gate independently of the rest. No
clean filter — among friends, crude words are legal Scrabble plays (standard
dictionaries include them), the same way spellingbee's *legal* tier carries no clean
restriction.

**The bands are the acceptance gate — scrabble deviates from the roster default
here.** The general convention (common.md) is "validation accepts the *full* 1–6
range; which bands a game *offers* is a UI choice" — because in most games the
band only shapes the puzzle / required set, not what's enterable. scrabble is
the spellingbee-*legal*-tier case instead: the selected band **is** the bar that
`play_word` enforces (a word above its length's band is the *only* kind that's
rejected), so picking a lower band genuinely makes a stricter game. The setup
form offers **all six** for each (default 3 / 3). The bands are server-only
config — not exposed to the FE (which never validates words).

Word legality is a plain `common.words` lookup inside `play_word` — the one piece
of validation that stays server-side, because that's where the word list is
([§6](#6-where-validation-lives)). The geometry + word-extraction + scoring live
*only* in `lib/play.ts` (no SQL re-implementation).

---

## 4. Schema (`scrabble.*`)

Built as the standard sibling pair on a per-baseGametype `scrabble` schema.
Migration: `supabase/migrations/20260627000000_scrabble.sql` (next after
stackdown's `20260626`).

### 4.1 Tables

| table | what it holds | visibility |
|---|---|---|
| `games` | one row per game. `mode`, `dict_2` + `dict_3plus` (the two acceptance bands, server-only — not granted), `board` jsonb (the placed tiles, a flat 225-cell array — PUBLIC), `bag` text[] (remaining draw order — **HIDDEN**), `version` int (the move counter for optimistic-concurrency — see [§6](#6-where-validation-lives)). **Coop-only:** `shared_rack` text[] (PUBLIC — the team rack) + `team_score`. **Compete-only:** `current_user_id` (whose turn) + `consecutive_scoreless` (the blocked-end counter — coop has no blocked-end). | `board`/`version` granted; `bag` column-excluded; coop rack/score public |
| `players` | `(game_id, user_id)` → `seat` (turn order, compete), `score` (compete per-player). **Compete:** `rack` jsonb (**HIDDEN** — own-rack-only mid-game; peers' revealed at terminal for leftover scoring). Coop leaves `rack`/`score` null (they live on `games`). | club members; `rack` column-excluded |
| `plays` | durable move log `(game_id, user_id, seq)`. `kind`: `'word'` (`placements` jsonb, `words text[]`, `score`) / `'exchange'` (`tile_count`) / `'pass'` / `'forfeit'` (`tile_count` returned, negative `score` for the leftover penalty). | club members, both modes |

**Why `plays` is public in both modes** (unlike spellingbee's mid-game-private
`found_words`): every committed word is *on the shared board*, which is public —
so a play's word + score is already visible to opponents. Only **racks** and the
**bag** are secret. This makes scrabble's hidden-state surface smaller than the
answer-hiding games: there's no hidden *solution*, just hidden *resources*.

### 4.2 The deliberate coop/compete column asymmetry

Coop's rack + score sit on `games` (one shared thing); compete's sit on `players`
(partitioned per player). Each is null in the other mode. This mirrors the modes
themselves — coop *shares* the contended resource, compete *partitions* it — and
is cleaner than forcing one shape to serve both (a single shared rack modeled as
N per-player rows would make RLS and refill writes awkward). Documented here so
the nulls read as intentional, not a gap.

### 4.3 Hidden-state pattern

Same column-grant + `security_invoker` view shape the answer-hiding games use
(stackdown's `solution`, spellingbee's `required_words`), but applied to *resources*:

- **`bag`** is column-excluded from the `authenticated` grant and **never
  revealed**. A `scrabble.games_state` view exposes `bag_count` (via a
  `SECURITY DEFINER` `_bag_count_for(id)` helper that reads the hidden column) so
  the FE can show "N tiles left" without seeing their letters.
- **`players.rack`** (compete) is column-excluded; a `scrabble.players_state`
  view exposes `rack` through a definer helper that returns it **only when
  `user_id = auth.uid()` OR the game is terminal** (the terminal branch is what
  lets the end-of-game leftover-tile display show everyone's final rack), plus
  `rack_count` always (so peers see "Bea: 7 tiles").
- **`board`**, **coop `shared_rack`/`team_score`**, and **`plays`** are plain
  public columns — no hiding.

The FE reads `games_state` / `players_state`, never the base tables.

---

## 5. RPCs (all `security definer`)

### 5.1 `create_game(target_club, setup, player_user_ids, mode)`

Club-member + player-count (compete 2–4, coop 1–4) + timer validation, reads
`setup.dict_2` / `setup.dict_3plus` (each 1–6, default 3), then:

- Builds the 100-tile bag and **shuffles** it (`order by random()`); the shuffle
  is the only randomness — no board library, no builder edge function.
- **Deals racks:** compete → 7 tiles into each `players.rack`; coop → 7 into
  `games.shared_rack`.
- Sets the first turn (compete: a **random** seated player).
- Inserts the `games` row + one `players` row per uid, seeds `common.update_state`
  with the initial status ([§9](#9-status-jsonb--labels)).

### 5.2 `play_word(target_game, base_version int, placements jsonb, words text[], score int) → jsonb`

**The core move — a *trusting* commit, not a re-validation** (see
[§6](#6-where-validation-lives) for why). The FE has already validated geometry
and computed `words` + `score` with `lib/play.ts`; it passes them in along with
`base_version` (the `games.version` its board was read at). `placements` =
`[{x, y, letter, blank}]` (`letter` is the played letter — for a blank, its
declared letter).

1. Lock `games` `for update`; `require_game_player`.
2. **Optimistic-concurrency gate:** if `games.version <> base_version`, someone
   moved first → return `{result:'stale'}` (the FE refetches + recomputes). This
   is the race handler — it also rejects a *stale* client that computed against
   an old board.
3. **Compete:** reject unless `current_user_id = caller` (`P0001`). **Coop:** no
   turn check — any player.
4. **Integrity guards** (cheap; data-consistency, *not* anti-cheat): every
   placement is in-bounds and lands on an empty square; the consumed tiles
   (`?` per blank, else the letter) are actually in the acting rack (compete:
   caller's; coop: shared). These keep the board + bag accounting honest against
   a buggy client; they do *not* re-derive words or score.
5. **Dictionary:** every word in `words` must be legal at the band for its length
   (`dict_2` for 2-letter, `dict_3plus` for 3+). **Any**
   failure → return `{result:'invalid', bad_words}` with **no state change** (the
   free reject). This is the only validation the server does, because the word
   list is here.
6. **Commit:** apply the placements to `board` (a cell-write loop — the server
   builds its own next board, it doesn't trust a board blob); remove the played
   tiles from the rack and **draw replacements from the hidden `bag`** (the
   server owns this — fairness without trust); add the trusted `score` (compete:
   `players.score`; coop: `games.team_score`); insert the `plays` row;
   `version += 1`; reset `consecutive_scoreless = 0`.
7. **Compete:** advance `current_user_id`. **Both:** check end conditions
   ([§2.7](#27-ending-the-game)); end the game if met, else `common.update_state`.
8. Return `{result:'accepted', drawn, version}` — the newly-drawn tiles (so the
   FE updates the rack without leaking the rest of the bag) and the new version.

There is **no instant-win threshold** — Scrabble is decided at game end, not by
crossing a score. So `play_word` only *ends* the game via the natural triggers.

### 5.3 `exchange_tiles(target_game, base_version int, rack_tiles text[])`

Lock + version CAS (same stale-guard as `play_word` — it mutates the shared rack
+ bag) + gate + (compete) turn check. `rack_tiles` are the tile glyphs to return
(`?` for a blank). Requires `bag_count ≥ 7`. Returns the tiles to the bag,
reshuffles, redraws the same count; `version += 1`; logs `kind='exchange'`.
**Compete:** `consecutive_scoreless += 1`, advance turn, check the blocked-end
condition. **Coop:** none of that — it's just a rack refresh (no turns, no
blocked-end). Returns `{drawn, version}`.

### 5.4 `pass_turn(target_game, base_version)` (compete only)

Advances the turn, `consecutive_scoreless += 1`, logs `kind='pass'`, checks the
blocked-end condition. Like the other moves it takes `base_version` and runs the
optimistic-concurrency stale-guard, returning `{result, version, terminal}`.

### 5.5 `end_game` / `concede` / `submit_timeout`

`submit_timeout` is countdown expiry and always runs final scoring
([§2.7](#27-ending-the-game)). `end_game` is the player-fired stop shown in
**coop** only: it runs final scoring with a leftover-tile **forfeit** (a
`'forfeit'` play row with the negative value lost, `play_state 'won'`, `outcome
'manual'`). **Compete uses `scrabble.concede`, not `end_game`** — a per-player
"I quit, the others keep playing". Because scrabble is turn-based, concede is
more than a flag: `scrabble._advance_turn` **skips** conceders, `scrabble._finish`
picks the winner among **non-conceded** players (a drop-out forfeits even a tying
score), and `scrabble.concede` hands the turn off if it was the conceder's, or
ends the game (final scoring, nobody eligible to win) when the last active player
drops. FE: `<ConcedeGameButton>` in compete, conceder "out" in the OpponentStrip
(and `Quit · score` at terminal via `playerOutcome`), input disabled once
conceded. See [common.md → Concede](../common.md#concede--per-player-drop-out).
pgTAP: `concede_test.sql`. All the terminal paths do the realtime-touch self-write
on a `scrabble` row so the FE subscription wakes to reveal final racks.

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
(live score, word highlighting, illegal-placement greying) and, on submit, hands
the server the `placements` it made, the `words` it read off, and the `score` it
computed. **The server trusts those** (per the trust model — players are friends;
we don't defend against cheating) and only does the things it alone can: check
the words against the dictionary, draw replacement tiles from the hidden bag, and
keep the books. This is the model Joel chose: simpler SQL, one implementation of
the hard logic, and the same `lib/play.ts` is reusable by a future AI clue-helper.

**Atomicity + races, without re-deriving the move.** The earlier worry — that
trusting the FE opens a read-then-write TOCTOU, especially in coop's shared rack —
is handled by **optimistic concurrency**, not by re-validation. `games.version`
is a move counter; the FE submits the `base_version` its board was read at, and
`play_word` does a compare-and-set under the row lock: if the version moved, the
commit is rejected as `stale` and the FE recomputes against fresh state. This is
the explicit form of stackdown coop's "first commit wins, the other resets," and
it *also* catches a stale client that computed against an old board (which a bare
lock would silently clobber). Two cheap **integrity guards** (placements
in-bounds + on empty squares; consumed tiles really in the rack) protect the
board/bag accounting from a *buggy* client — they're data-consistency checks, not
the duplicated word/score logic.

**The trade-off, stated honestly.** Server-authority for geometry/score is gone:
a buggy (not malicious) client could persist a wrong score or a missed cross-word.
We accept that under FE-trust; the mitigation is that `lib/play.ts` is the single,
unit-tested source of those rules. If we ever wanted server authority back, the
port target is exactly that one tested module — but YAGNI today.

(No edge function anywhere: the dictionary check and bag draw are trivial SQL, and
edge functions in this repo are only ever *setup-time board generation*, which
scrabble doesn't have.)

---

## 7. Frontend (`src/scrabble/`)

Shared `PlayArea` / `SetupForm` / `Help` / `useGame`, mode-branched at render on
`game.mode`. **v3 layout** (the shared two-column scaffold — see
[docs/design-decisions.md](../design-decisions.md)): the **board column** holds
the 15×15 board (the square *hug* model — `--side = min(--avail-w, --avail-h)`,
the largest square that fits, like waffle/boggle) and, directly below it,
scrabble's **GameEntryArea**: the **rack + action row** (the rack *is* the input,
so it lives with everything else needed to play). That row is pinned to the board
width and split by a divider — Shuffle + the icon-only Recall (`ClearButton`) on
the left; the **commit slot** ([Swap] [Submit] [Pass]) on the right. The commit
slot doubles as the **local feedback area**: an own-move result (or the terminal
verdict) shows as a sticky `<FeedbackPill>` in place of the commit buttons,
dismissed by the player's next move (a tile tap / a keystroke). To keep that row
on one line within the board width, the buttons are compact — **Swap is
icon-only** (the `ExchangeButton`, two-way-arrows glyph, `info` tone); Pass (compete
only) is the de-emphasized end-turn octagon (`PassButton` — icon-only, secondary,
`warning` tone, left of Submit); and **Submit is the `SubmitWithScore` button**, a
shared component that doubles as the live preview — the triangle pinned left, the
play's score right-justified ("+23"), an em-dash on an empty board, at a fixed
width so it never resizes. Submit is enabled for *any* placed tiles; an illegal
shape isn't disabled-away but surfaces as an error pill on submit. The **info column** holds
the live turn/score state, the compete `OpponentStrip` (metric "Score"), the
End/Concede action row (the terminal outcome line at game over), a help line, the
setup disclosure, and the Moves log filling the rest.

**Placement mirrors bananagrams's two input modes** — its pointer-gesture system
(a press-past-threshold becomes a drag, with a floating ghost + drop highlights)
and its crossword cursor (arrow keys move it, a perpendicular arrow rotates →/↓,
typing places a matching rack tile / a blank declared by the typed letter, then
advances). The keyboard cursor rides the **shared `useBoardCursorKeys`** (the
common 2-D board-cursor hook both games use); scrabble's 5% is that only STAGED
tiles are editable — committed tiles are locked — and Enter plays the staged word
(vs bananagrams's peel). Drag a tile rack→board, board→board (move), board→rack (recall), or
**rack→rack to reorder** (people rearrange tiles to hunt for anagrams — the drop
position is read off the rack tiles' midpoints and moves the tile in the display
`order`); tap a square to position the cursor; tap a rack tile to mark it for
Exchange.

**Pre-play (compete).** Placement is split from commit by two gates: `canPlace`
(stage / recall / reorder / shuffle) and `canCommit` (Submit / Swap / Pass — needs
your turn). In compete `canPlace` is true **even when it isn't your turn**, so you
can *pre-play* — lay a move out while waiting, to line it up and see its score (a
disabled Submit showing "+N"). Pre-played tiles use the same bright tentative face.
When an opponent commits, your pre-play **persists** (the version-move effect keeps
it + your rack order, since your rack is untouched) — *unless* the opponent placed a
tile on a cell you'd pre-played, in which case the whole pre-play is cleared with a
terse local `warning` pill, "Pre-play cleared: conflict" (no name/disc — the commit
slot is too narrow). When your turn then starts with tiles already staged, Submit is enabled and
Pass is disabled (you have a move pending). Coop is unchanged — no turns, and a
teammate's commit still resets your in-progress staging (the stackdown-style "first
commit wins").

**Turn viewer.** Click any Moves-log row to inspect that turn on the board: the
board swaps to the **replayed historical state** (`boardUpToSeq` in `lib/play.ts` —
a pure fold of every word play's `placements` with `seq ≤ target`; no per-turn
snapshot stored, since the board *is* the accumulation of placements). The tiles
*that turn placed* take the **placed-tile yellow** face (the same "staged, not
committed" color) plus a **success-green outline** (they really were the turn's good
words — so only word turns light up, not a pass). That same **yellow** (a single
`--scrabble-viewer` = `--scrabble-tile-tentative`) outlines the whole board, the
selected log row, and the banner overlaying the input area — a terse "#12 Bea: +54
JUKEBOX" (non-word turns read "#5 Bea passed" / "exchanged N"), plain surface fill +
normal text, with a `✕` at its far right. Yellow, not green, for the frame/row/banner:
it's a neutral "you're looking at history" marker, and green would wrongly imply the
*whole* turn was a success (a pass isn't).
The rack stays mounted *underneath* the banner, so `staged` (your pre-play) is
preserved and restored on exit. **Navigate by clicking rows** (no arrows); the `✕`, a
click anywhere on the banner or board, any key, or an opponent's move all **exit
cleanly** to the live board. It's a local view-only state (like the board rotation) —
never shared, never persisted, doesn't pause.

- **`lib/board.ts`** — premium grid, tile values, distribution constants. Pure;
  Vitest (layout symmetry, distribution sums to 100).
- **`lib/play.ts`** — the **sole** geometry validation + word extraction + scoring
  (`evaluatePlay`), used both for the live preview and to build the commit payload
  (no SQL re-implementation — see [§6](#6-where-validation-lives)). Vitest-heavy:
  in-line/contiguous/connected/center-first; main + cross-word extraction;
  premiums-only-on-new-tiles; bingo +50; blanks = 0. Plus **`boardUpToSeq`** (the
  turn-viewer replay): word plays fold in, pass/exchange add nothing, blanks keep
  their declared letter.
- **`lib/setup.ts`** — `ScrabbleSetup` (the two difficulty bands + timer).
- **`hooks/useGame.ts`** — postgres-changes on `scrabble.{games_state,
  players_state, plays}` (Pattern A, per-tab UUID-suffixed channel).
- **`hooks/useSharedMove.ts`** — the coop "show a move" transport: a **stable-name**
  Broadcast channel (`scrabble:${gameId}`, so teammates merge into one room, like
  connections' peer-selection channel), separate from `useGame`'s postgres-changes
  channel because the shared move is ephemeral (a not-yet-committed move, never
  stored). **Coop only** — in compete the channel never opens (`shareMove` no-ops),
  and supabase Broadcast doesn't echo to the sender, so only teammates preview it.
- **`components/`** — `Board` (15×15 premium grid; committed / tentative tiles,
  blanks shown on a brighter golden face; the cursor overlay; drag drop-highlights
  + lifted-tile fade; green/red flashes on accept/reject), `Rack` (a fixed
  7-wide tray, left-aligned; drag-to-place, tap-to-exchange-select, the
  just-drawn tiles flashed yellow, blanks greyed), `Controls` (the action half of
  the below-board row: the icon-only Recall `ClearButton` on the left, then — coop,
  ≥2 players — the icon-only `SharePreviewButton` (see [Show a move](#show-a-move-coop)),
  then the **commit slot** pushed right [Swap `ExchangeButton` icon-only / Pass
  `PassButton` icon-only, compete / Submit `SubmitWithScore`]; that slot doubles as the
  local feedback area, swapping in a `<FeedbackPill>` for the buttons + filling its width
  when there's an own-move result or the terminal verdict; the rack's `ShuffleButton`
  floats over the rack corner, not in this row), `BlankPicker` (declare a
  dragged blank's letter on drop), `PlayLog` (the move log on the shared
  `<TurnLog>` — one `<tr>` per play: an outcome bar [green word / neutral
  exchange-pass / red forfeit], the move in `.main` [`+score WORD…`], the actor's
  `<ActorTag>`; words click-to-define via the common `DefinitionPopover`),
  `BoardCol` (the turn machine — drag / cursor / keyboard staging, the live score
  preview, the optimistic just-played hold, and — the **documented exception** to
  the "PlayArea does the RPC" contract — the `play_word` / `exchange` RPCs
  themselves, because their commit is inseparable from that input state [the
  `lastActionRef` race + the version-reset effect]; PlayArea just hands it `game` +
  `gameId`. Also takes the board to show — live, a `boardUpToSeq` history snapshot,
  OR a coop teammate's shared move — the `ViewTarget` union it switches on; and owns
  the Share trigger), `InfoCol` (the readouts + score + the End/Concede action-row
  button + the PlayLog), `PlayArea` (the thin coordinator: `useGame`, the shared
  below-board feedback channel [both columns write it], the coop `useSharedMove`
  transport, the terminal `GameOverModal`, and the board-viewer state), `SetupForm`
  (two `<DifficultyField>`s + timer), `Help`.

**Tentative placement is local state** (and private in coop until commit — per the
"should this survive a pause?" rule it lives in `BoardCol` [the turn machine],
clearing on pause/unmount, and — for *your own* commit — on the server `version`
move). On an
accepted word the played tiles are held **optimistically** (rendered committed)
until the realtime refetch lands, so they never blink off the board. **Compete
allows placement off-turn** (pre-play, above) — only *committing* needs your turn;
coop is always-live (race to commit).

### Show a move (coop)

In coop (≥2 players) a player building a word can click **Share** (the info-tone,
icon-only `SharePreviewButton`, beside Recall) to broadcast their **staged tiles** to
teammates, who see them laid on their own board in a **read-only preview** — the
deliberate **twin of the turn-history viewer**: the shared `historyViewer` chrome
(framed board + a banner `● moth showing: +18 BERRY`, input frozen) and the same
exits (click / keystroke / ✕ / a new committed move). The one difference from history
is the board content — the live board + the sharer's *tentative* tiles, vs history's
committed *past* board — so both ride one `useHistoryViewer` via the `ViewTarget`
union (`{kind:'turn'} | {kind:'shared'}`), and `BoardCol` switches on `kind`.

It's **ephemeral** — a stable Broadcast channel (`useSharedMove`), never stored; a
teammate who misses it simply doesn't see it, matching the trust model (friends, no
anti-cheat needed). The committed board is already shared in coop, so the payload is
just the placements (+ `sharerId` / `words` / `score` for the banner) overlaid on the
receiver's live board; a **stale** broadcast — its `baseVersion` no longer matches the
receiver's board, i.e. a real move landed in between — is dropped, so it never renders
a move that no longer fits. The preview wears its **own** color token
(`--color-share-preview`, initialized to the history yellow but tinkerable
independently, via a `--viewer-accent` override on the `.sharePreview` column). Coop
only — compete has private racks and no shared board, so the button and channel are
absent. Verified cross-client in `e2e/scrabble-show-move.e2e.ts` (two contexts:
Alice shares → Bob previews → Bob dismisses; no self-echo to Alice).

### Realtime channels

| channel | opener | carries |
|---|---|---|
| `game:${gameId}` (stable) | `useCommonGame` | presence + pause + suspend + `common.games` (incl. compete leaderboard via `status`) |
| `scrabble:${gameId}:${uuid}` | `useGame` | postgres-changes on `scrabble.{games, players, plays}` |
| `scrabble:${gameId}` (stable) | `useSharedMove` | **coop only** — the "show a move" Broadcast (`show-move` event: a teammate's staged tiles for a read-only preview). Ephemeral, never stored; stable name so teammates merge into one room. |

### Printing the board (PDF)

scrabble joins the printable games — a **"Print board (PDF)"** GamePage menu item that
hands you a paper record of the game. It shows the 15×15 board (premium squares in faint
pastels), the rack, and the move log flowing newspaper-style down two columns
(`src/scrabble/pdf/printScrabblePdf.ts`). The shared clean-printable design language +
helpers live in [docs/pdf.md](../pdf.md).

---

## 8. Title formula

The `common.games.title` is the **first three words played**, uppercased and
`·`-joined (e.g. `"SCOWL · TABLE · QUARTZ"`), built by `scrabble._title` and
rewritten by `play_word` in **both** modes — a game is recognizable at a glance
in the club list. No spoiler risk: the board is public, so the words are already
visible. A fresh game stays `"New game"` until the first word lands.

---

## 9. `status` jsonb & labels

The `status` jsonb (written by the state-transition RPCs) drives the club-list
`labelFor`:

- **Coop:** `{ mode:'coop', team_score, bag_count, outcome? }` (`outcome` ∈
  `complete` / `timeout` / `manual` at terminal).
- **Compete:** `{ mode:'compete', leaderboard:[{user_id, score}], current_user_id,
  bag_count, winner?, winner_name?, outcome? }` — the leaderboard drives the
  in-game `OpponentStrip` (scores aren't hidden — the board reveals them);
  `winner_name` (NULL on a tie) lets the label name the winner.

`labelFor` shows, **mid-game**, the tiles left in the bag (coop prepends the team
score: `"124 pts · 30 tiles left"`); **at terminal**, the result — `"ended"`
(compete manual stop), `"won by <name>"` / `"tie"` (compete), or the final
`"N pts"` (coop).

---

## 10. Tests

**Vitest** (`src/scrabble/lib/`):
- `board.test.ts` — premium layout symmetry, tile values, distribution = 100.
- `play.test.ts` — geometry (off-line / gap / disconnected / center-first
  rejects), main + cross-word extraction, scoring (premiums only under new tiles,
  stacked word multipliers, bingo +50, blanks 0).
- `components/PlayArea.test.tsx` — render smoke (coop / compete / terminal): the
  v3 tree mounts without throwing (board cells, the state line, the compete
  OpponentStrip, the terminal pill), the 7-tile rack renders (a regression guard),
  and the turn viewer opens on a row click + exits on ✕. `useGame` + `db` mocked.
  Shallow by design — the logic lives in the lib + pgTAP suites; this guards the
  wiring `tsc` can't.

**pgTAP** (`supabase/tests/scrabble/`) — covers the *server's* job (the trusting
commit), not the TS-owned geometry/scoring:
- `create_game` — deal (compete per-player racks / coop shared rack), hidden bag,
  version = 0, both modes, player-count floors.
- `play_word` — the **version CAS** (`stale` on a mismatch), the integrity guards
  (out-of-bounds / occupied square / tile-not-in-rack rejects), the **dictionary
  free reject** (no row, no state change, no version bump), the happy path (board
  applied, rack drawn from bag, score added, version bumped), compete turn advance,
  and the **title** becoming the first word played.
- `exchange` / `pass` — bag-≥7 gate, version CAS, scoreless counter, turn advance.
- `endgame` — going-out + blocked triggers, final scoring (leftover subtraction +
  going-out bonus, compete; team-score adjust, coop), winner determination + ties,
  and `winner_name` in the status (set on a win, NULL on a tie).
- `rls` — own rack only mid-game / peers' revealed at terminal; bag never
  revealed (only `bag_count`); board + plays public; club-membership gates.
- `end_game` / `submit_timeout` — **coop manual end forfeits** the leftover-tile
  value (the `forfeit` log row + `5 − 11 = −6` team score), compete manual stays
  neutral; the realtime touch.

(No TS↔SQL mirror test — there's no SQL scoring to mirror. `lib/play.test.ts` is
the single source of truth for geometry + scoring.)

---

## 11. Resolved decisions

Every design fork below was settled before building (and is what shipped):

- **Shared coop rack, no coop turns** — one rack/board/bag/score; any player
  commits anytime; private staging → shared on commit.
- **Blanks in** — letter declared on commit, permanent ([§2.5](#25-blank-tiles)).
- **Rejected word costs nothing** — free bounce, no turn lost, not logged
  ([§2.2](#22-a-play-placing-a-word)).
- **Difficulty bands are the acceptance gate** (not the roster-default "accept
  all 1–6"): two bands by word length — `dict_2` (2-letter) and `dict_3plus`
  (3+), each legal iff `difficulty ≤ band`; the form offers all six for each,
  default 3 ([§3.3](#33-the-dictionary-difficulty-bands-by-word-length)).
- **Endgame** — full Scrabble rules in compete (leftover subtraction + going-out
  bonus); **coop ends only on going-out or End game** (no blocked-end);
  **compete ties → co-winners**; **compete first turn is random**
  ([§2.7](#27-ending-the-game), [§5.1](#51-create_gametarget_club-setup-player_user_ids-mode)).
- **Coop countdown expiry** is a gentle "time's up — here's your score," not a
  loss ([§2.7](#27-ending-the-game)).

All shipped in migration `20260627000000_scrabble.sql` (which registers
`scrabble_coop` min 1 + `scrabble_compete` min 2 in `common.gametypes`), the
`src/scrabble/` manifest pair in `src/games.ts`, and the CLAUDE.md doc-table line.

### Post-build additions (from playtesting)

- **Two difficulty bands** by word length, not one — `dict_2` (2-letter) /
  `dict_3plus` (3+), the bananagrams split ([§3.3](#33-the-dictionary-difficulty-bands-by-word-length)).
- **Coop manual end forfeits** the leftover-tile value (a `forfeit` log row,
  red "−N tiles unplayed") instead of the uniform neutral stop — it nudges a
  solo/coop team to play its last tiles ([§2.7](#27-ending-the-game), [§5.5](#55-end_game--concede--submit_timeout)).
- **Title = first three words played** ([§8](#8-title-formula)); the label adds
  tiles-left mid-game and names the winner / "tie" at terminal ([§9](#9-status-jsonb--labels)).
- **Word definitions** — click a word in the move log, or press `~` for the
  free-form lookup; the shared `DefinitionView` now also shows a word's band /
  dialects / slur-crude flags / wordle-membership (a `common` change across all
  word games).
