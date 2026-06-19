# FreeBee

A NYT-Spelling-Bee-style word-finding game. The fourth registered gametype in this monorepo, ported from the standalone `~/freebee-ws` codebase (websocket + Node backend, rich React FE). The port preserves the gameplay loop and the honeycomb-board visual layout; the websocket / session / chat / presence machinery is replaced by Supabase Realtime + the pupgames common shell.

"FreeBee" is the codename. User-facing copy is "FreeBee"; folder / schema / RPC names are all `freebee`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](../common.md). For testing conventions + persona shapes see [`testing.md`](../testing.md). For per-gametype comparisons see [`tinyspy.md`](tinyspy.md), [`psychicnum.md`](psychicnum.md), and [`wordknit.md`](wordknit.md).

**Manifest declarations.** Two-manifest family (sibling-pattern) — `freebeeCoopGame` (`gametype: 'freebee_coop'`, `mode: 'coop'`, `numberOfPlayers: [1, 6]`) and `freebeeCompeteGame` (`gametype: 'freebee_compete'`, `mode: 'compete'`, `numberOfPlayers: [2, 6]`). Both share `baseGametype: 'freebee'`, one schema, and one PlayArea / SetupForm / Help / useGame; the mode branches at render time on `game.mode` (denormalized from the gametype string at create_game time). See [Compete mode](#compete-mode) below for the per-mode behavior and [`psychicnum.md → The sibling-manifest pattern`](psychicnum.md#the-sibling-manifest-pattern) for the canonical pattern write-up.

## What the game is

A honeycomb of **7 distinct letters** — one **center letter** plus 6 **outer letters**. Players form words from those 7 letters; every word must include the center letter. Find as many words as you can. A word that uses **all 7** distinct letters is a **pangram** — every board has at least one.

### Rules

- **Word validity:**
  - Minimum 4 letters.
  - Every letter must be one of the 7 (with repetition allowed: `BANANA` is fine even if `N` appears only once on the board).
  - Must include the center letter.
  - Must be in the legal dictionary.
- **Scoring:**
  - 4-letter word: **1 point**.
  - 5+-letter word: **points = word length**.
  - Pangram: **+10 bonus** on top of the length score (a 7-letter pangram is 7 + 10 = 17). Pangram-ness is determined at submit time by the WORD's distinct-letter count (= 7), not by a precomputed flag — so a *bonus* word with 7 distinct letters earns the +10 too.
- **Bonus words:** the dictionary has two tiers — a smaller *scoring set* (SCOWL-50) and a larger *legal set* (SCOWL-80). A word in the legal set but NOT in the scoring set is accepted as **bonus** and **scores the same way as a scoring word** (length-based + pangram bonus). The difference is purely about what the player saw before they found it: bonus words are NOT counted in `total_words` and NOT included in the puzzle-quality gate (`≥30 scoring words`) or the rank-threshold *denominator* (`total_score`). So a player who finds a bonus pangram (rare-word knowledge!) can legitimately rocket past the displayed "max" score and even past the Genius rank. The `Words: X/Y` display lets `X` overshoot `Y` when bonus words are found, signaling the extra credit. Bonus contribution to score + rank is *intentional* — the design call is "we don't want players to feel bad for missing obscure words, but reward them if they find them." Matches `~/freebee-ws/server/sessions.js:988-990`.
- **Rank ladder:** as score climbs vs. the puzzle's maximum-possible score, the player passes through **Start → Good → Solid → Nice → Great → Amazing → Genius**. Genius unlocks at **70%** of the maximum. The ladder is mirrored on the FE in [`src/freebee/lib/ranks.ts`](../../src/freebee/lib/ranks.ts) and on the SQL side in `freebee._rank_idx` — both compute from the same constants, and a Vitest assertion checks they agree numerically across every score-vs-total combination.
- **Lifecycle:**
  - *Coop*: ends when (a) the countdown timer expires (`timer.kind = 'countdown'` only) or (b) any player chooses the **End game** menu item. **There's no auto-end on 100%-found** — players who exhaust the scoring set keep going, finding bonus words past the displayed `Y / total_words` and pushing the score past `total_score` (the rank clamps at Genius). Untimed and count-up games end only via (b). Matches `~/freebee-ws/server/sessions.js`'s `submitWord` (no terminal check past acceptance).
  - *Compete*: ends when (a) a player reaches the configured `target_rank` first (→ `play_state='won_compete'`, that player wins, others lose), (b) the countdown timer expires before any winner emerges (→ `play_state='ended'`, no winner), or (c) any player ends the game manually (→ `play_state='ended'`, no winner). Per-player elimination doesn't exist — players keep racing until terminal.

### Coop vs compete

**Coop**: all players see the same found-words list; whoever finds a word first claims it (their color marks the entry). The team score is everyone's points combined. The game ends when (a) the countdown timer expires (`outcome='timeout'`) or (b) any player chooses the **End game** menu item (`outcome='manual'`). No auto-end at 100%-found — past the scoring set, players climb the score with bonus words; rank clamps at Genius.

**Compete**: each player races independently on the same honeycomb. Per-player score, per-player found-words list (RLS hides peers' rows during play). **First to the setup-configured target rank wins** — the race ends instantly for everyone with `play_state='won_compete'`, the winner's `common.game_players.result = {won: true}`, opponents `{won: false}`. Timer expiry or manual end before any winner emerges → `play_state='ended'` with everyone `{won: false}` (a collective non-finish; no winner declared on a non-race outcome). Opponents see each other's RANK ONLY during play (via the `status.leaderboard` payload); guesses + matched-word lists stay private until terminal. See [Compete mode](#compete-mode) for the per-mode picks + schema details.

### What the game isn't

- **Not turn-based.** Any player can submit at any time. Submissions are atomic on the server.

### Parity with `~/freebee-ws`

The rules + scoring match `~/freebee-ws` (the standalone codebase this is ported from). One intentional difference: **compete winner determination** — this port pins `winner_user_id = caller` when the target-hitting `submit_word` lands. `~/freebee-ws` ends the session and then picks the highest-score player; in practice these match because the target-hitter just gained points and has the top score, but the local-pinned variant is more deterministic.

## Vocabulary

In addition to the cross-cutting terms in [`naming.md`](../naming.md):

| term | meaning |
|---|---|
| **board** | The 7 letters of one puzzle: 6 outer + 1 center. Determines which words are legal. |
| **pangram** | A word that uses all 7 distinct letters of the board. Every board has at least one (the seeds table is built from pangrams in the scoring dictionary). Pangrams earn the +10 bonus on top of the length score and render bold in the found-words list. |
| **scoring word** | A word in the smaller, higher-quality dictionary (`scowl-50`). Earns points and contributes to rank. |
| **legal word** | A word in the larger dictionary (`scowl-80`) but NOT in the scoring set. Accepted as **bonus** — 0 points, no rank progress, but recorded. |
| **bonus word** | Synonym for legal-not-scoring. Accepted by `submit_word` as `'bonus'`; **scores normally** (length-based + pangram bonus per the same rules as a scoring word), but does NOT count toward `total_words` and doesn't affect the rank-threshold *denominator*. Recorded in `found_words` with `is_bonus = true` and shown with a trailing dot in the WordList. Because score climbs without the max climbing, finding bonus words can push you past the displayed-max score and even past Genius / past compete's target rank. |
| **rank** | The player's tier on the 7-step Start..Genius ladder, derived from `score / total_score` via `currentRankIndex`. Genius unlocks at 70% (`GENIUS_AT`). Same word `wordknit` uses for category difficulty, but the underlying concept is different and the scope (puzzle-wide vs per-category) disambiguates in context. |
| **letter mask** | A 26-bit integer encoding which letters a word/puzzle uses. Same encoding everywhere (TS, SQL, the importer): bit `n` is set iff letter `'a' + n` is present. Used for fast subset-of-puzzle checks (`(wordMask & ~puzzleMask) === 0`) instead of per-character scans. |
| **outcome** | The `status.outcome` enum value for terminal freebee games: `'timeout'` (countdown expired), `'manual'` (any player clicked the End-game menu item), `'won_compete'` (compete: a player hit `target_rank`), `'lost_compete'` (compete: timer / manual end with no winner — but actually this port writes `'timeout'`/`'manual'` with `mode='compete'` in the status to distinguish). The corresponding `play_state` is `'ended'` for everything except `'won_compete'` which uses `play_state='won_compete'`. |

## Scope: v1 vs. deferred

| feature | status | notes |
|---|---|---|
| **Coop mode** (shared found list) | **shipped** | The whole gameplay loop |
| **Honeycomb board with click + keyboard input** | shipped | CSS lifted from `~/freebee-ws/src/globals.css §7` (clip-path flat-top, nth-child positions) |
| **Shuffle / Delete / Enter actions** | shipped | Shuffle stays clickable when locked; hover rotates only the ⟲ glyph, not the button |
| **Pangram detection + bonus + visual marker** | shipped | |
| **Rank ladder + rank-bar UI with hover tooltips** | shipped | |
| **Found-words list** (column-fill, per-finder color, pangram bold, bonus dot, recently-found underline) | shipped | |
| **Timer modes** (none / countup / countdown) + countdown-expiry termination | shipped | Via shared `<TimerField>` + `useGameTimer` |
| **Manual end-game** (menu item; confirms then writes terminal) | shipped | Per-game menu item; outcome = `'manual'` |
| **Pause-on-disconnect + manual pause** | shipped (via common) | Free from the common shell |
| **Chat** (incl. `!`-prefix force-open) | shipped (via common) | In `ClubChatPanel` / `FloatingChat` |
| **Reveal scoring + bonus wordlists on game end** | shipped | Via `freebee.games_state` view's conditional-on-terminal column exposure |
| **`GameOverModal` + terminal indicator** | shipped | Verdict copy: "Genius!" (rank 6) or "Stopped at <rank>" (rank < 6 — covers both timeout and manual) |
| **Diverse board-builder** (rare-letter weighting, ING dampening, previous-board overlap cap) | shipped | The only builder; "default" strategy dropped |
| **Compete mode** (per-player found list, target-rank race, OpponentRanksStrip, RLS-narrowed WordList) | **shipped** | Sibling-manifest pair landed in the 20260621 freebee_compete migration. See [Compete mode](#compete-mode). |
| **Custom-letters puzzle** (player-specified 6+1) | **deferred** | Edge-fn parameter unused; setup-form field absent. |
| **Click-to-define popover** | **deferred (→ common)** | Common feature, not freebee-specific. See `~/.claude/projects/-Users-joel-src-codenames/memory/project_common_dictionary_lookup.md`. |
| **Sounds** | out of scope | freebee-ws doesn't have them either. |
| **Mid-session "new board" affordance** | out of scope | Pupgames path is exit-to-club → start new game. The "End game" menu item is the closest analog. |

## Compete mode

Freebee's compete mode is a per-player race to a setup-configured target rank. Same honeycomb for everyone; private per-player progress; first to the target ends the race for everyone else.

### Sibling-manifest at a glance

| field | `freebeeCoopGame` | `freebeeCompeteGame` |
|---|---|---|
| `gametype` | `freebee_coop` | `freebee_compete` |
| `schema` | `freebee` | `freebee` |
| `baseGametype` | `freebee` | `freebee` |
| `mode` | `'coop'` | `'compete'` |
| `name` | `FreeBee (coop)` | `FreeBee (compete)` |
| `numberOfPlayers` | `[1, 6]` (solo OK) | `[2, 6]` (needs ≥1 opponent) |
| `setupForm.defaults` | `{ timer: countdown 10m }` | `{ timer: countdown 10m, target_rank: 5 }` |

Both manifests share the same `PlayArea`, `SetupForm`, `Help`, and `useGame`. The mode branches at render time on `game.mode` (read from `freebee.games_state.mode`, denormalized for RLS + RPC branching).

### Rules (compete)

- **Setup**: in addition to the timer, the start-game dialog asks for a **target rank** — one of Solid / Nice / Great / Amazing / Genius (RANKS indices 2..6 — Start and Good are excluded as trivially-won). Default is **Amazing (5)**.
- **Per-player score + word list**: each player's `submit_word` calls write into `freebee.found_words` with `user_id` set to caller. RLS hides peers' rows mid-game (caller sees only their own); the WordList renders just the caller's finds.
- **First-to-target wins**: when caller's `_rank_idx(caller_score, total_score) >= target_rank`, `submit_word` flips `play_state` to `won_compete`, writes `status.winner_user_id = caller`, sets caller's `common.game_players.result = {won: true}` and every opponent's `= {won: false}`. The race ends for everyone instantly — opponents with sub-target ranks can no longer submit. **Bonus words count toward the rank** — a player who hits bonus pangrams can reach target faster than the displayed max-score implies (see [Rules → Bonus words](#rules)).
- **Timeout / manual end → no winner**: if the countdown timer fires or any player ends the game manually before any player hits target, terminal `play_state='ended'` with `outcome='timeout'` (or `'manual'`) and every player's `result = {won: false}`. Friends-agreed-to-stop is a valid outcome, not a "you lose" punishment.
- **Opponent visibility = rank only**: the `OpponentRanksStrip` rendered between the RankBar and the Stats card shows each player's current rank (and the target). The exact score, words-found count, and guesses stay private. The strip reads from `common.games.status.leaderboard` (RLS-permissive — it's on the cross-cutting common row, not the per-game found_words).
- **Post-terminal reveal**: the FE WordList shows the caller's own finds + the missed scoring words (gray-filled). Peers' `found_words` rows ARE opened by the RLS policy's `is_terminal` branch (for a future "what others found" expansion), but v1 doesn't render them — the focus is "what you missed."
- **FE-knows trade preserved**: the `scoring_words` / `legal_words` answer keys stay hidden via the column-grant + `games_state` view pattern, just like coop.

### Schema deltas (vs. the baseline coop-only setup)

The 20260621 `freebee_compete` migration:

- Cascade-deletes the old `'freebee'` row from `common.gametypes` and inserts `'freebee_coop'` + `'freebee_compete'`; backfills `common.clubs_gametypes` for existing clubs.
- Adds `freebee.games.mode text not null check (mode in ('coop','compete'))` — denormalized from the gametype string. The column grant extends to include `mode` so the `security_invoker` view + the mode-aware RLS policy on `found_words` can read it.
- Re-exposes `freebee.games_state` with a `mode` column so the FE has the value on the same row it already reads.
- Recreates `found_words_select` to read mode off `freebee.games.mode` instead of `common.games.setup->>'mode'` (one fewer cross-schema reach per visibility check):
  ```sql
  using (
    exists (
      select 1 from freebee.games fg
       join common.games cg on cg.id = fg.id
       where fg.id = found_words.game_id
         and common.is_club_member(fg.club_handle)
         and (
               fg.mode = 'coop'
            or found_words.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  )
  ```
- Rewrites `freebee.create_game` with a new positional `mode text` arg (slotted between `player_user_ids` and `board`). The new signature is `(target_club, setup, player_user_ids, mode, board)`. Setup is rejected with P0001 if it carries a `mode` field (catches stale FE deploys loudly).
- `freebee.submit_word` / `freebee.submit_timeout` / `freebee.end_game` all read mode off the just-locked `freebee.games` row instead of joining to `common.games.setup` — the branch logic itself was already in place from the original "designed for compete" phase.

The edge function `freebee-build-board` accepts `mode` as a top-level body field (falls back to the legacy `setup.mode` for one release of overlap) and forwards it to the new positional RPC arg. It also strips `setup.mode` from the forwarded payload as belt-and-braces.

## Schema: `freebee.*`

### Tables

| table | purpose |
|---|---|
| `dictionary` | Global word-lookup table. ~46k rows (after normalization: lowercase ASCII, ≥4 chars, no `s`). One row per word with `letter_mask` (26-bit), `in_scoring` (counts toward score/rank), `in_legal` (accepted as bonus). Populated by `npm run freebee:import`. Public-readable to `authenticated`; only `service_role` has INSERT. |
| `pangrams` | Precomputed seed pool. ~3.5k rows: one per unique 7-letter mask drawn from the scoring set that satisfies `isValidPuzzleMask` (q→u, ≥2 vowels). Each row carries `scoring_words` (count of scoring words that fit; ≥30 gate at sample time) and `has_rare_letters` (the diverse-builder weighting tier). The edge function samples from this table to seed a new board. See [Why a seeds table?](#why-a-seeds-table) below. |
| `games` | One row per playthrough. `id` is FK to `common.games(id)`. Holds `mode` (`'coop'`/`'compete'`, denormalized from the gametype string for RLS branching), `outer_letters` (6 chars), `center_letter` (1 char), `total_score` and `total_words` (cached at create-game time), plus the **hidden** wordlist columns `scoring_words` (jsonb array of `{word, points, is_pangram}`) and `legal_words` (text[] bonus-only). Hidden via column-level grant; exposed conditionally via `games_state`. The column grant explicitly includes `mode` so the security_invoker view + the mode-aware found_words RLS policy can read it. |
| `found_words` | One row per `(player, word)`. Includes `points` (length-based + `+10` if pangram; bonus rows score normally too), `is_pangram` (true when the word's distinct-letter count = 7), `is_bonus` (true when the word came from `legal_words` rather than `scoring_words`). PK `(game_id, user_id, word)` — compete-friendly. Coop uniqueness across players is enforced inside `submit_word` via the per-game-id duplicate check. |

### The hidden-wordlist pattern

`freebee.games.scoring_words` and `freebee.games.legal_words` are the answer keys for the puzzle. They must be hidden during play (otherwise devtools reveals the puzzle) but revealed post-terminal for the end-of-game wordlist display.

Same two-layer pattern as `psychicnum.games.target` (see [`psychicnum.md` → The hidden-target mechanic](psychicnum.md#the-hidden-target-mechanic)):

1. **Column-level grant** on the base table omits those two columns from the `authenticated` role's SELECT. A direct `SELECT scoring_words FROM freebee.games` returns `42501 permission denied`.
2. **`freebee.games_state` view** with `security_invoker = true`, exposing the wordlists through `SECURITY DEFINER` helpers (`_scoring_words_for` / `_legal_words_for`) that bypass the column grant and apply a CASE on `common.games.is_terminal`. Pre-terminal: returns `null`. Post-terminal: returns the actual list.

The FE only ever reads from `games_state`, never from `games` directly.

### Why a seeds table?

A valid FreeBee board needs at least one pangram (the 7-distinct-letter word). Random 7-letter sets mostly *don't* contain a pangram, so generating "pick 7 random letters and check" wastes thousands of attempts. The flip: **start from known pangrams**. Scan the scoring dictionary for every 7-distinct-letter word, dedupe by letter mask, store the masks. That gives ~3.5k seeds, each guaranteed to admit at least one pangram.

To build a board, the edge function:
1. Samples one row (weighted by `has_rare_letters` ×3 to even out the natural skew toward `e`, `a`, `i`).
2. Picks a center from the 7 letters of the mask.
3. Reads candidate words via `freebee.candidate_words(puzzle_mask, center_bit)` — a small SQL helper that pushes the bitmask intersection server-side (see [Why a SQL helper for candidate_words?](#why-a-sql-helper-for-candidate_words) below).
4. Optionally rejects if it shares >4 letters with the club's previous board (the diverse-builder overlap cap).

### Why a SQL helper for `candidate_words`?

[`freebee.candidate_words(puzzle_mask, center_bit)`](../../supabase/migrations/20260618000001_freebee_candidate_words.sql) is a tiny `stable` `security invoker` function returning `(word, letter_mask, in_scoring)` for every dictionary row whose mask is a subset of `puzzle_mask` and contains `center_bit`.

It exists because the obvious-looking pattern — "fetch all in_legal words, filter the bitmask in JS" — silently truncates against PostgREST's `max_rows = 1000` cap. The dictionary has 46k rows; the alphabetical first 1000 mostly start with `a` and don't represent the puzzle's candidate space at all, so `total_words` ends up below the ≥30 gate and the function returns 500. Pushing the filter into Postgres returns only the ~hundreds of actual candidates in one round-trip, well under any cap.

### Play states

`common.games.play_state` carries freebee's lifecycle enum:

- **`playing`** — submissions accepted. The default.
- **`ended`** — terminal. Covers two outcome shapes: countdown expiry (`status.outcome='timeout'`) and manual end (`'manual'`). In compete, both still write `play_state='ended'` (no winner). In coop, these are the *only* paths to terminal.
- **`won_compete`** — terminal. Compete only: a player hit `setup.target_rank`. `status.outcome='won_compete'` + `status.winner_user_id`.

`is_terminal` is true for `ended` and `won_compete`.

### `status` jsonb

Drives `manifest.labelFor` for the club page's game-list label and (in compete) drives the live `OpponentRanksStrip` via `GamePageCtx.status`.

- **Coop:** `{ mode: 'coop', outcome?, score, total_score, rank_idx, words_found, total_words }`. `outcome` is absent mid-game and present at terminal (`'timeout'` or `'manual'`). `words_found` counts ALL submissions (scoring + bonus); `score` includes bonus points. The displayed `Y / total_words` can overshoot, and `score / total_score` can climb past 1.0 (rank_idx clamps at 6).
- **Compete:** `{ mode: 'compete', target_rank, leaderboard: [{user_id, score, rank_idx, words_found}, …], total_score, total_words, winner_user_id?, outcome? }`. The leaderboard array drives the FE's `OpponentRanksStrip` — opponent visibility is rank-only by design (score + words_found are in the payload but the FE intentionally surfaces only `rank_idx`). At terminal: `winner_user_id` set on `won_compete`; `outcome` set on `'timeout'`/`'manual'`.

### Title formula

`"<CENTER>·<OUTER-SORTED>"` (e.g., `"E·ABCDFG"`). Center letter, dot separator, outer letters alphabetized + uppercased. Identifies a board at a glance in the club's history.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `freebee, common, public, extensions`.

### `freebee.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text, board jsonb) → table(id uuid)`

Called only by the `freebee-build-board` edge function in practice (it builds the board and passes it in). The positional `mode text` parameter (between `player_user_ids` and `board`) routes the gametype string to `'freebee_coop'`/`'freebee_compete'` and lands on `freebee.games.mode` for RLS branching. Validates everything end-to-end:

- `mode` ∈ `{'coop', 'compete'}`. Compete enforces ≥2 players (`array_length(player_user_ids, 1) >= 2`).
- `setup.mode` is **rejected** if present (P0001) — catches a stale FE that didn't strip it after the sibling-manifest split.
- `setup.target_rank` is required iff `mode='compete'`; absent iff `mode='coop'`. Range 0..6.
- `setup.timer` delegated to `common.validate_timer`.
- `board.outer_letters` is exactly 6 distinct lowercase ASCII letters excluding `s`; `board.center_letter` is one lowercase ASCII letter excluding `s` and not present in outer.
- `board.total_words ≥ 30` (mirrors the edge function's gate).
- `board.scoring_words` and `board.legal_words` are arrays.

Builds the title (per the formula above), calls `common.create_game` with the `'freebee_<mode>'` gametype string, inserts the `freebee.games` detail row (with `mode` column), and seeds `common.update_state`. The seeded status shape differs by mode: coop carries `{score:0, total_score, rank_idx:0, words_found:0, total_words}`; compete carries `{target_rank, total_score, total_words, leaderboard:[]}` (numeric per-player fields land once the first `submit_word` runs).

### `freebee.submit_word(target_game uuid, word text) → text`

The main mid-game action. Validates the word in the freebee-ws order (chosen so the friendliest message wins when multiple things are wrong):

1. `tooShort` — length < 4
2. `badLetters` — uses a letter not on the board
3. `missingCenter` — doesn't include the center letter
4. `notAWord` — not in scoring_words and not in legal_words
5. `alreadyFound` — per mode rule (coop: any row with `(game_id, word)`; compete: row with `(game_id, user_id, word)`)
6. otherwise: `accepted` (scoring word) or `bonus` (legal-but-not-scoring). **Bonus scores normally** — length + pangram bonus, same as a scoring word; the `'bonus'` enum value just lets the FE render a different feedback pill copy.

On accept: inserts `found_words` row, recomputes team/player score, calls `common.update_state` (in coop, every accept; in compete, until the caller hits `target_rank`) or `common.end_game` (compete target-rank-hit only — coop never auto-terminates from `submit_word`).

`SELECT … FOR UPDATE` on `freebee.games` serializes concurrent submissions. The PK on `found_words` is `(game_id, user_id, word)` — a same-player double-submit is also caught at the constraint level.

### `freebee.submit_timeout(target_game uuid) → void`

Countdown-expiry handler. Calls `common.end_game(target_game, 'ended', {outcome:'timeout', ...}, player_results)`. Idempotent — second call raises `P0001 'game is not in progress'`, which the FE swallows.

**Realtime touch at the tail**: `update freebee.games set club_handle = club_handle where id = target_game`. `submit_timeout` would otherwise never write to any `freebee` table (no word was submitted; `common.end_game` only writes to `common.games`), so the FE's `useGame` subscription on `freebee.games` would never wake up to refetch and reveal the wordlists. The self-set writes a WAL entry that Realtime picks up. See [`migration 20260618000002`](../../supabase/migrations/20260618000002_freebee_submit_timeout_realtime_touch.sql) for the bug history.

### `freebee.end_game(target_game uuid) → void`

The "End game" menu item fires this. Same shape as `submit_timeout` but with `status.outcome = 'manual'`. Any current game player can call it.

The Realtime-touch pattern repeats — see `submit_timeout` above. Tested via the `ctid` change in `gameplay_test.sql`.

### Helper functions

- **`freebee._rank_idx(score int, total int) → int`** — integer-math implementation of the rank ladder. Mirrors `currentRankIndex` in [`ranks.ts`](../../src/freebee/lib/ranks.ts); a Vitest assertion pins the two implementations together.
- **`freebee._scoring_words_for(g uuid) → jsonb`** + **`freebee._legal_words_for(g uuid) → text[]`** — the conditional-reveal helpers that the `games_state` view calls. `SECURITY DEFINER` so they bypass the column grant; the CASE on `common.games.is_terminal` enforces the reveal gate.
- **`freebee.candidate_words(puzzle_mask bigint, center_bit bigint) → table(word text, letter_mask bigint, in_scoring boolean)`** — the bitmask-intersection lookup the edge function uses (see [Why a SQL helper](#why-a-sql-helper-for-candidate_words) above).

## Edge function: `freebee-build-board`

[`supabase/functions/freebee-build-board/index.ts`](../../supabase/functions/freebee-build-board/index.ts) — the FE's `manifest.startGameInClub` invokes this. It runs as the caller (via the JWT in the Authorization header) for all PostgREST calls.

1. Reads `freebee.pangrams` in pages of 1000 (paginated to defeat `max_rows`); reads the club's most recent `freebee.games` row for the previous-board overlap cap.
2. Filters the pangram pool by overlap cap (≤4/7 letters shared with previous board).
3. Builds a weighted candidate array (rare-letter masks ×3).
4. Samples + applies ING dampening (1/3 accept on masks containing all of `{i, n, g}`).
5. Picks a center uniformly from the 7 letters.
6. Calls `freebee.candidate_words(puzzle_mask, center_bit)` — gets back the dictionary slice that fits this puzzle.
7. Computes points per scoring word (length + 10 if pangram), builds the `board` payload.
8. Calls `freebee.create_game(...)` over PostgREST — the RPC validates the board end-to-end and creates the game.
9. Returns `{ id }`.

The function logs one line per step in dev (`console.log` lands in `supabase functions serve` output), so when a board build fails the cause is on screen.

## Dictionary import: `npm run freebee:import`

[`supabase/scripts/import-freebee-dictionary.ts`](../../supabase/scripts/import-freebee-dictionary.ts), mirroring [`import-wordknit-puzzles.ts`](../../supabase/scripts/import-wordknit-puzzles.ts).

**Inputs (vendored, committed to repo):**
- `supabase/data/scowl-50.txt` — the scoring word list (~40k entries pre-filter).
- `supabase/data/scowl-80.txt` — the legal word list (~100k entries pre-filter).

Both are [SCOWL](http://wordlist.aspell.net/) (Spell Checker Oriented Word Lists). Copied verbatim from `~/freebee-ws/data/`.

**Script flow:**
1. Read both vendored files.
2. Normalize each word: trim, lowercase, ASCII-only, drop length<4, drop any word containing `s`.
3. Compute the 26-bit `letter_mask` per word.
4. Union the two sets; rows with `(word, mask, in_scoring, in_legal)`.
5. Batch-upsert into `freebee.dictionary` (`on conflict (word) do nothing`).
6. Build the pangrams from the resulting dictionary: aggregate `letter_mask` where `popcount(letter_mask) = 7` and `isValidPuzzleMask(mask)` (q→u when q is set, ≥2 vowels). Compute `scoring_words` count per mask. Insert into `freebee.pangrams`.

**Idempotent.** Re-runs are no-ops on already-imported rows. A SCOWL bump (unlikely) needs a manual `truncate freebee.dictionary, freebee.pangrams cascade` before re-running.

**Env:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Local defaults to `127.0.0.1:54321` and the well-known local service-role JWT. For hosted, point env at the project ref + service-role key from the dashboard.

## Row-level security

| table | SELECT policy | INSERT/UPDATE/DELETE |
|---|---|---|
| `dictionary` | RLS off (public reference data) | INSERT only via `service_role` (the import script) |
| `pangrams` | RLS off | Same |
| `games` | `common.is_club_member(club_handle)` | None — writes go through `freebee.create_game` |
| `found_words` | Mode-aware via the denormalized `freebee.games.mode`: club-membership AND (`fg.mode='coop'` OR `found_words.user_id=auth.uid()` OR `cg.is_terminal`). Coop hits branch (a); compete mid-game hits branch (b); compete post-terminal opens via branch (c). | None — writes go through `freebee.submit_word` |

**Realtime publication**: `freebee.games` and `freebee.found_words` are in `supabase_realtime` so the FE's `useGame` can subscribe to in-game state.

## Frontend

### Folder layout

```
src/freebee/
  manifest.ts             TWO GameManifest entries (freebeeCoopGame + freebeeCompeteGame)
                          sharing the lazy-loaded PlayArea / SetupForm / Help. Per-mode
                          differences are the gametype string, name, numberOfPlayers,
                          startGameInClub's forwarded mode arg, setupForm.defaults
                          (compete seeds target_rank=5), and labelFor's vocabulary
                          (coop: "X/Y pts · Z/W words"; compete: "compete · race to
                          Amazing" / "compete · winner at Amazing" / "compete · time
                          up · no winner at Amazing"). submitTimeout shared.
  db.ts                   export const db = supabase.schema('freebee')
  theme.css               --freebee-hex / --freebee-accent / feedback colors. Loaded
                          with this gametype's chunk via the PlayArea.tsx import.
  logo.svg                Bee glyph (copied from freebee-ws).

  components/
    PlayArea.tsx          Two-column composition (input column left, side panel right).
                          Owns the typed word, the shuffle seed, the feedback pill timer,
                          the submit_word dispatch, and the End-game menu item registration.
                          Compete-only: renders the OpponentRanksStrip between RankBar
                          and Stats (reading from ctx.status.leaderboard). buildOver
                          branches mode → terminal verdict copy. Mounts GameOverModal
                          via useTerminalModal on the isTerminal flip.
    PlayArea.module.css   Two-column grid; no @media reflow — desktop-first per ui.md.
    Letters.tsx           The 7-hex honeycomb. Render order: center → top → upper-right →
                          lower-right → bottom → lower-left → upper-left. Position via
                          nth-child rules in Letters.module.css.
    Letters.module.css    `clip-path: polygon(...)` flat-top hexes, absolute positioning,
                          per-position nth-child rules — lifted verbatim from
                          ~/freebee-ws/src/globals.css §7.
    Letter.tsx            Single hex. onMouseDown preventDefault so a click doesn't steal
                          focus from the keyboard-handler attachment point.
    WordInput.tsx         The current typed word above the honeycomb. Renders per-character
                          so illegal letters (not in the puzzle's allowed set) dim individually.
                          No <input> — typing is captured by useGlobalKeyHandler.
    Actions.tsx           Delete / Shuffle / Enter triplet. Shuffle stays clickable when
                          locked (so the player can fidget post-end). Hover rotates only
                          the ⟲ glyph (via an inner <span> + .iconGlyph transform), not
                          the button.
    Feedback.tsx          Submission-result pill: success / warning / error. role="status"
                          aria-live="polite". The caller (PlayArea) drives the
                          show-and-clear timer.
    RankBar.tsx           7 dots from Start to Genius, filled up to the current rank.
                          Per-dot hover tooltip with rank name + points threshold.
    Stats.tsx             3-cell grid: Score / Words / Time. Tabular-nums so the digits
                          don't shift width as the score climbs.
    WordList.tsx          Alphabetical 2-column flow. Per-finder color via
                          memberColor.colorVarFor. Pangram = font-weight: 700; bonus =
                          trailing dot via ::after; recently-found = underline (5s via
                          useRecentlyFound). Post-terminal: revealWords prop fills in
                          unfound scoring words in gray. In compete mode the foundWords
                          input is already caller-only (RLS branch (b) hides peers'
                          rows mid-game) — the list renders just the caller's finds
                          without an FE branch.
    SetupForm.tsx         The setup dialog body (lazy-loaded inside the common
                          SetupGameDialog wrapper). Reads `mode` from SetupBodyProps
                          (fed by the sibling-manifest's GameManifest.mode). Coop:
                          short paragraph + shared <TimerField>. Compete: adds a
                          target-rank radio (Solid..Genius, default Amazing) above
                          the timer. Custom-letters fields still deferred.
    Help.tsx              Rules modal mounted from the common menu's Help item. Built on
                          the shared <FloatingPanel>. Implements the manifest's
                          help: ComponentType<{ onClose }> contract.

  hooks/
    useGame.ts            Per-gametype data hook. Pattern A (useRealtimeRefetch) with a
                          two-table subscription on freebee.{games, found_words}. Reads
                          from games_state so the post-terminal wordlist reveal Just Works
                          on the next refetch.
    useGlobalKeyHandler.ts  Window-level keydown listener with a ref-dispatch so the
                          listener stays mounted for the component's lifetime but
                          dispatches into a fresh closure each render. Ported verbatim
                          from freebee-ws.
    useRecentlyFound.ts   Tracks freshly-arrived words from the found_words log. Each
                          new arrival stays "recent" for 5 seconds, then drops out via
                          per-word setTimeouts in a ref (NOT effect cleanup — see the
                          inline note about double-update timer cancellation).

  lib/
    setup.ts              FreeBeeSetup type (timer / target_rank? / custom_letters? /
                          custom_center?) + DEFAULT_FREEBEE_SETUP_COOP +
                          DEFAULT_FREEBEE_SETUP_COMPETE (compete seeds target_rank=5).
                          Mode is NOT on this type — it's locked at the gametype level.
    ranks.ts              Port of ~/freebee-ws/shared/ranks.js: RANKS, GENIUS_AT,
                          rankThreshold, rankPoints, currentRankIndex. Mirrored on the SQL
                          side by freebee._rank_idx (different numeric form, same answer
                          — Vitest verifies agreement at every score / total).
    letterMask.ts         26-bit letter mask helpers (letterMask, popcount26, isSubsetMask).
                          Used by WordInput for per-character illegal-letter dimming.
    pangram.ts            isPangram (popcount26(letterMask(w)) === 7). UI cue only;
                          authority on "real" scoring pangrams is the server's
                          scoring_words.is_pangram flag.
```

### Routes & shell

Standard pupgames route: `/g/freebee_coop/<gameId>` or `/g/freebee_compete/<gameId>` (the gametype URL segment is the sibling-manifest's full string, not the `baseGametype`). Mounted by `App.tsx` via `<GamePage>` with `freebee`'s shared `PlayArea` as the render-prop child. `GamePage` owns the cross-cutting chrome (header / timer / pause overlay / chat / Back-to-club / common menu items). `PlayArea` owns everything per-game, including the `<GameOverModal>` itself — same pattern as wordknit / PsychicNum / tinyspy, since the verdict copy needs game-specific context.

### State flow for one submission

1. User types or clicks letters → `PlayArea` updates `word` state.
2. User hits Enter → `handleSubmit` calls `db.rpc('submit_word', {target_game, word})`.
3. RPC validates, inserts a `found_words` row, updates `common.games.status`, possibly fires the terminal flip.
4. Realtime UPDATE event on `freebee.found_words` reaches `useGame`'s `useRealtimeRefetch`; `load()` re-reads `games_state` + `found_words`.
5. `setGame({...})` + `setFoundWords(...)` re-render `PlayArea`.
6. The submission's `result` enum (`'accepted'` / `'bonus'` / `'tooShort'` / …) drives the feedback pill.
7. `useRecentlyFound` flags the new word as recent for 5s → `<WordList>` underlines it in the finder's color.

### "End game" menu wiring

[`useEffect(syncMenuItems)`](../../src/freebee/components/PlayArea.tsx) registers a single per-game menu item via `ctx.menu.setGameItems([{id, label, onClick, disabled}])`. Click → `window.confirm()` → `db.rpc('end_game', ...)`. The menu item is disabled when `isTerminal=true`. Cleanup on PlayArea unmount restores the empty per-game section.

### Terminal experience

When `isTerminal` flips true:
1. `useTerminalModal` opens the `<GameOverModal>` (won/lost color + verdict line + Back-to-club).
2. The input column's `<Feedback>` row swaps for a terminal indicator: `"Game over — <indicator copy>"` plus a Back-to-club button.
3. `<Actions>`' Delete + Enter disable; Shuffle stays clickable.
4. `games_state.scoring_words` and `legal_words` materialize via the helpers; `useGame.load()` refetches; `game.scoringWords` populates.
5. `<WordList revealWords={game.scoringWords}>` merges the unfound scoring words into the alphabetical render as gray rows.

The verdict copy is computed by `buildOver({mode, playState, status, targetRankIdx, ...})`:

**Coop**:
- `rank >= 6` (Genius) → `outcome='won'`, verdict `"Genius! N/M points."`
- `rank < 6` → `outcome='won'`, verdict `"Stopped at <rank> — N/M points."` (covers both timeout and manual end since the player knows which one happened)

**Compete** (uses `targetRankIdx` read from `setup.target_rank` — the canonical, immutable source — not from `status.target_rank` which `submit_timeout`/`end_game` don't re-emit on terminal):
- `playState='won_compete'` + caller is winner → `outcome='won'`, verdict `"You won the race — reached <rank>!"`
- `playState='won_compete'` + caller is NOT winner → `outcome='lost'`, verdict `"<winner-name> beat you to <rank>."`
- `playState='ended'` + `outcome='timeout'` → `outcome='lost'`, verdict `"Time's up — no winner at <rank>."`
- `playState='ended'` + `outcome='manual'` → `outcome='lost'`, verdict `"Game ended — no winner at <rank>."`

### Realtime channels

| channel | who opens it | what rides on it |
|---|---|---|
| `game:${gameId}` (stable) | `useCommonGame` | Presence + manual-pause Broadcast + suspend Broadcast + postgres-changes on `common.games`. The compete OpponentRanksStrip rides this channel — `submit_word` writes the updated `status.leaderboard` to `common.games.status`, which propagates here, and `useCommonGame` surfaces it through `GamePageCtx.status` to the PlayArea. |
| `freebee:${gameId}:${uuid}` | `useRealtimeRefetch` inside `useGame` | postgres-changes on `freebee.{games, found_words}`. UUID-suffixed because there's no peer-coordination state here — each tab gets its own room. |

See [`code-conventions.md` → Realtime data hooks](../code-conventions.md#realtime-data-hooks--two-patterns) for the pattern catalogue.

### Code-splitting

Same pattern as the other gametypes — the manifest's `PlayArea`, `setupForm.Component`, and `help` are all `React.lazy`. Three chunks ship under freebee; users who only play other games never download them.

## Tests

### pgTAP

| file | covers |
|---|---|
| `tests/freebee/schema_test.sql` | Both gametype rows registered, public reference reads, column-grant blocks SELECT of hidden columns, view exposes them conditionally pre/post-terminal. |
| `tests/freebee/rls_test.sql` | Coop branch (everyone sees all in club); outsider sees nothing; INSERT-grant rejections; compete-mode mid-game narrowing (only own rows); compete post-terminal opens reveal. |
| `tests/freebee/create_game_test.sql` | Auth, membership, coop + compete happy paths, gametype-string routing, mode arg validation, setup.mode rejected if present (loud catch for stale FE), target_rank-iff-compete + range + coop-must-omit, compete ≥2-player floor, board structure validation, title formula, per-mode status seeding. |
| `tests/freebee/gameplay_test.sql` | Coop `submit_word` result-enum branches incl. pangram +10 bonus (scoring AND bonus paths), bonus-words-score-normally assertions, soft-reject "no row inserted" check, coop duplicate semantics, coop-has-no-auto-terminal sanity (play_state stays 'playing' past total_words; score overshoots total_score; rank clamps at Genius), `submit_timeout` (ctid touch + idempotency + post-terminal games_state reveal), `freebee.end_game` (ctid touch, status.outcome='manual', auth, idempotency). |
| `tests/freebee/compete_test.sql` | Per-player duplicate rule (bea can re-find ada's word; ada can't re-find her own), mid-game leaderboard shape, first-to-target → won_compete (winner_user_id, {won:true}/{won:false} per-player results, opponents can't submit post-win), submit_timeout in compete (no winner, all {won:false}), end_game in compete (no winner, outcome=manual), RLS branches (a / b / c) per mode + terminal state. |

### Per-test fixtures

`tests/freebee/setup.psql` provides:
- `pg_temp.freebee_board()` — a valid 30-scoring-word + 3-bonus board jsonb. Letters: outer `'abcdfg'`, center `'e'`. Includes a synthetic 7-letter scoring pangram (`'abcdefg'`) for the scoring-pangram +10 path AND a synthetic 7-letter bonus pangram (`'gfedcba'`) for the bonus-pangram +10 path. Total: 50 scoring points across 30 words.
- `pg_temp.freebee_setup()` — no-timer setup blob (mode is now an RPC arg, not a setup field). Tests override timer / target_rank via `|| jsonb_build_object(...)` and pass `'coop'`/`'compete'` as the 4th positional arg to `freebee.create_game`.

### FE Vitest

| file | covers |
|---|---|
| `src/freebee/lib/ranks.test.ts` | Rank ladder boundary cases; integer-math agreement with `freebee._rank_idx`. |
| `src/freebee/lib/pangram.test.ts` | `isPangram` boundary cases (6/7/8 distinct, case-insensitive). |
| `src/freebee/lib/letterMask.test.ts` | `letterMask` round-trips, `popcount26`, `isSubsetMask`. |
| `src/freebee/hooks/useRecentlyFound.test.ts` | Initial-quiet, fresh-arrival, 5s expiry, staggered expiry per word, no-op rerender idempotency. |

## File locations

| asking… | look at… |
|---|---|
| The Phase-1 schema, column grants, RLS, view, hidden-wordlist helpers | [`supabase/migrations/20260617000000_freebee_baseline.sql`](../../supabase/migrations/20260617000000_freebee_baseline.sql) |
| The Phase-2 RPCs (`create_game`, `submit_word`, `submit_timeout`) + `_rank_idx` (pre-split signatures) | [`supabase/migrations/20260618000000_freebee_rpcs.sql`](../../supabase/migrations/20260618000000_freebee_rpcs.sql) |
| `candidate_words` helper | [`supabase/migrations/20260618000001_freebee_candidate_words.sql`](../../supabase/migrations/20260618000001_freebee_candidate_words.sql) |
| `submit_timeout`'s Realtime-touch fix | [`supabase/migrations/20260618000002_freebee_submit_timeout_realtime_touch.sql`](../../supabase/migrations/20260618000002_freebee_submit_timeout_realtime_touch.sql) |
| `freebee.end_game` (manual terminal — pre-split signature) | [`supabase/migrations/20260618000003_freebee_end_game.sql`](../../supabase/migrations/20260618000003_freebee_end_game.sql) |
| Sibling-manifest split: mode column, gametype-row swap, mode-aware RLS, RPC rewrites with `mode text` arg | [`supabase/migrations/20260621000000_freebee_compete.sql`](../../supabase/migrations/20260621000000_freebee_compete.sql) |
| Compete-specific FE rendering (OpponentRanksStrip, mode-aware buildOver) | [`src/freebee/components/PlayArea.tsx`](../../src/freebee/components/PlayArea.tsx) |
| Target-rank picker in the setup dialog | [`src/freebee/components/SetupForm.tsx`](../../src/freebee/components/SetupForm.tsx) |
| How the dictionary is populated | [`supabase/scripts/import-freebee-dictionary.ts`](../../supabase/scripts/import-freebee-dictionary.ts); SCOWL data in `supabase/data/` |
| The board-builder edge function | [`supabase/functions/freebee-build-board/index.ts`](../../supabase/functions/freebee-build-board/index.ts) |
| The play surface | [`src/freebee/components/PlayArea.tsx`](../../src/freebee/components/PlayArea.tsx) |
| The honeycomb layout (CSS lifted from freebee-ws) | [`src/freebee/components/Letters.module.css`](../../src/freebee/components/Letters.module.css) |
| The rank ladder math | [`src/freebee/lib/ranks.ts`](../../src/freebee/lib/ranks.ts) |
| The found-words list | [`src/freebee/components/WordList.tsx`](../../src/freebee/components/WordList.tsx) |
| The per-gametype data hook | [`src/freebee/hooks/useGame.ts`](../../src/freebee/hooks/useGame.ts) |

## Open / deferred

Tracked in [`deferred.md`](../deferred.md) → FreeBee. Today's open items:

- **Custom-letters puzzle** — edge-function parameter unused; setup-form field absent.
- **Click-to-define popover** — common feature (not freebee-specific); see the memory note at `~/.claude/projects/-Users-joel-src-codenames/memory/project_common_dictionary_lookup.md`.
- **"What peers found" reveal in compete** — the RLS policy already opens peers' `found_words` post-terminal (branch c), but the FE renders only the caller's own finds (+ the missed scoring set). A future expansion could recolor every word with its finder's color post-terminal, or add a per-player leaderboard panel. The data + permissions are in place; only the WordList render needs widening.
