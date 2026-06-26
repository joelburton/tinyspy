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
- **Bonus words:** freebee slices the shared `common.words` list into two nested tiers — a smaller **required** set (band ≤ `setup.required`, american, no slang, clean: slur 0 + crude 0 — the goal shown to players) and a larger **legal** set (band ≤ `setup.legal`, no other restriction: the acceptance bar). Both bands are per-game setup choices (`required` 2..6 default 3; `legal` required..6 default 5); the rest of this section uses the defaults for concreteness. A word that's legal but NOT required is a **bonus** word (`bonus = legal − required`), accepted and **scored the same way as a required word** (length-based + pangram bonus). The difference is purely about what the player saw before they found it: bonus words are NOT counted in `required_words_count` and NOT included in the puzzle-quality gate (`≥30 required words`) or the rank-threshold *denominator* (`required_words_score`). So a player who finds a bonus pangram (rare-word knowledge!) can legitimately rocket past the displayed "max" score and even past the Genius rank. The `Words: X/Y` display lets `X` (`found_words_count`, all finds) overshoot `Y` (`required_words_count`) when bonus words are found, signaling the extra credit. Bonus contribution to score + rank is *intentional* — the design call is "we don't want players to feel bad for missing obscure words, but reward them if they find them." Matches `~/freebee-ws/server/sessions.js:988-990`.
- **Rank ladder:** as score climbs vs. the puzzle's maximum-possible score, the player passes through **Start → Good → Solid → Nice → Great → Amazing → Genius**. Genius unlocks at **70%** of the maximum. The ladder is mirrored on the FE in [`src/freebee/lib/ranks.ts`](../../src/freebee/lib/ranks.ts) and on the SQL side in `freebee._rank_idx` — both compute from the same constants, and a Vitest assertion checks they agree numerically across every score-vs-total combination.
- **Lifecycle:**
  - *Coop*: ends when (a) the countdown timer expires (`timer.kind = 'countdown'` only) or (b) any player chooses the **End game** menu item. **There's no auto-end on 100%-found** — players who exhaust the required set keep going, finding bonus words past the displayed `Y / required_words_count` and pushing the score past `required_words_score` (the rank clamps at Genius). Untimed and count-up games end only via (b). Matches `~/freebee-ws/server/sessions.js`'s `submitWord` (no terminal check past acceptance).
  - *Compete*: ends when (a) a player reaches the configured `target_rank` first (→ `play_state='won_compete'`, that player wins, others lose), (b) the countdown timer expires before any winner emerges (→ `play_state='ended'`, no winner), or (c) any player ends the game manually (→ `play_state='ended'`, no winner). Per-player elimination doesn't exist — players keep racing until terminal.

### Coop vs compete

**Coop**: all players see the same found-words list; whoever finds a word first claims it (their color marks the entry). The team score is everyone's points combined. The game ends when (a) the countdown timer expires (`outcome='timeout'`) or (b) any player chooses the **End game** menu item (`outcome='manual'`). No auto-end at 100%-found — past the required set, players climb the score with bonus words; rank clamps at Genius.

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
| **pangram** | A word that uses all 7 distinct letters of the board. Every board has at least one (the seeds table is built from band-1 pangrams in `common.words`, so it's always a *common* word). Pangrams earn the +10 bonus on top of the length score and render bold in the found-words list. |
| **required word** | A word in freebee's smaller tier of `common.words` (band ≤ `setup.required`, default 3; american, not slang, clean: `slur = 0 AND crude = 0`). These are the goal shown to players — they earn points and contribute to rank, and their count/score are the "X / Y" denominators (`required_words_count` / `required_words_score`). |
| **legal word** | A word in freebee's larger tier (band ≤ `setup.legal`, default 5; no other restriction). This is the *superset* — it includes every required word plus the bonus ones. "Legal" is the acceptance bar (`submit_word` accepts a word iff it's legal); it's a concept, not a stored column. |
| **bonus word** | A word that's legal but not required (`bonus = legal − required`: a band above `setup.required` but ≤ `setup.legal`, or a band ≤ `setup.required` word that's non-american / slang / crude / a slur). Accepted by `submit_word` as `'bonus'`; **scores normally** (length-based + pangram bonus, same as a required word), but does NOT count toward the required goal. Recorded in `found_words` with `is_bonus = true` and shown with a trailing bullet in the WordList. Because the found score climbs without the required max climbing, finding bonus words can push you past the displayed-max score and even past Genius / past compete's target rank. |
| **found words** | The words you (coop: your team) have found — required *and* bonus. `found_words_count` / `found_words_score` are the live "X" numerators and can exceed the required "Y" denominators. |
| **rank** | The player's tier on the 7-step Start..Genius ladder, derived from `found_words_score / required_words_score` via `currentRankIndex`. Genius unlocks at 70% (`GENIUS_AT`). Same word `wordknit` uses for category difficulty, but the underlying concept is different and the scope (puzzle-wide vs per-category) disambiguates in context. |
| **letter mask** | A 26-bit integer encoding which letters a word/puzzle uses. Same encoding everywhere (TS, SQL, the generated `common.words.letter_mask` column): bit `n` is set iff letter `'a' + n` is present. Used for fast subset-of-puzzle checks (`(wordMask & ~puzzleMask) === 0`) instead of per-character scans. |
| **outcome** | The `status.outcome` enum value for terminal freebee games: `'timeout'` (countdown expired), `'manual'` (any player clicked the End-game menu item), `'won_compete'` (compete: a player hit `target_rank`), `'lost_compete'` (compete: timer / manual end with no winner — but actually this port writes `'timeout'`/`'manual'` with `mode='compete'` in the status to distinguish). The corresponding `play_state` is `'ended'` for everything except `'won_compete'` which uses `play_state='won_compete'`. |

## Scope: v1 vs. deferred

| feature | status | notes |
|---|---|---|
| **Coop mode** (shared found list) | **shipped** | The whole gameplay loop |
| **Honeycomb board with click + keyboard input** | shipped | CSS lifted from `~/freebee-ws/src/globals.css §7` (clip-path flat-top, nth-child positions) |
| **Shuffle / Delete / Enter actions** | shipped | Shuffle stays clickable when locked; hover rotates only the ⟲ glyph, not the button |
| **Pangram detection + bonus + visual marker** | shipped | |
| **Rank ladder + rank-bar UI with hover tooltips** | shipped | |
| **Found-words list** (column-major grid, fixed height, horizontal scroll past 3 columns; found words in their finder's color, missed required words grey, pangram bold, bonus bullet, recently-found underline) | shipped | |
| **Timer modes** (none / countup / countdown) + countdown-expiry termination | shipped | Via shared `<TimerField>` + `useGameTimer` |
| **Manual end-game** (menu item; confirms then writes terminal) | shipped | Per-game menu item; outcome = `'manual'` |
| **Pause-on-disconnect + manual pause** | shipped (via common) | Free from the common shell |
| **Chat** (incl. `!`-prefix force-open) | shipped (via common) | In `ClubChatPanel` / `FloatingChat` |
| **Reveal the required wordlist on game end** | shipped | Via `freebee.games_state` view's conditional-on-terminal column exposure (bonus words aren't revealed) |
| **`GameOverModal` + terminal indicator** | shipped | Verdict copy: "Genius!" (rank 6) or "Stopped at <rank>" (rank < 6 — covers both timeout and manual) |
| **Diverse board-builder** (rare-letter weighting, ING dampening, previous-board overlap cap) | shipped | The only builder; "default" strategy dropped |
| **Compete mode** (per-player found list, target-rank race, OpponentStrip, RLS-narrowed WordList) | **shipped** | Sibling-manifest pair; both modes live in the consolidated `20260617000000_freebee.sql`. See [Compete mode](#compete-mode). |
| **Custom-letters puzzle** (player-specified 6+1) | **deferred** | Edge-fn parameter unused; setup-form field absent. |
| **Click-to-define popover + word-lookup dialog** | **shipped (via common)** | Common feature, not freebee-specific. Clicking a `WordList` row opens `common/components/DefinitionPopover` anchored to that row; the `~` key opens `common/components/WordLookupDialog` to define any word — and `~` is now an **app-global** shortcut (`common/hooks/useAppShortcuts`), not wired here. Both are backed by the `supabase/functions/define` edge function. |
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
| `name` | `FreeBee` | `FreeBee` |
| `numberOfPlayers` | `[1, 6]` (solo OK) | `[2, 6]` (needs ≥1 opponent) |
| `setupForm.defaults` | `{ timer: countdown 10m }` | `{ timer: countdown 10m, target_rank: 5 }` |

Both manifests share the same `PlayArea`, `SetupForm`, `Help`, and `useGame`. The mode branches at render time on `game.mode` (read from `freebee.games_state.mode`, denormalized for RLS + RPC branching).

### Rules (compete)

- **Setup**: in addition to the timer, the start-game dialog asks for a **target rank** — one of Solid / Nice / Great / Amazing / Genius (RANKS indices 2..6 — Start and Good are excluded as trivially-won). Default is **Amazing (5)**.
- **Per-player score + word list**: each player's `submit_word` calls write into `freebee.found_words` with `user_id` set to caller. RLS hides peers' rows mid-game (caller sees only their own); the WordList renders just the caller's finds until the game ends (post-terminal it opens up — see the reveal bullet below).
- **First-to-target wins**: when caller's `_rank_idx(caller_score, required_words_score) >= target_rank`, `submit_word` flips `play_state` to `won_compete`, writes `status.winner_user_id = caller`, sets caller's `common.game_players.result = {won: true}` and every opponent's `= {won: false}`. The race ends for everyone instantly — opponents with sub-target ranks can no longer submit. **Bonus words count toward the rank** — a player who hits bonus pangrams can reach target faster than the displayed max-score implies (see [Rules → Bonus words](#rules)).
- **Timeout / manual end → no winner**: if the countdown timer fires or any player ends the game manually before any player hits target, terminal `play_state='ended'` with `outcome='timeout'` (or `'manual'`) and every player's `result = {won: false}`. Friends-agreed-to-stop is a valid outcome, not a "you lose" punishment.
- **Opponent visibility = rank only**: the `OpponentStrip` rendered between the RankBar and the Stats card shows each player's current rank (and the target). The exact score, words-found count, and guesses stay private. The strip reads from `common.games.status.leaderboard` (RLS-permissive — it's on the cross-cutting common row, not the per-game found_words).
- **Post-terminal reveal**: the WordList interleaves the required words nobody found (materialized via the RLS policy's `is_terminal` branch — `games_state.required_words`) into the alphabetical list, rendered **medium grey**. Found words keep their **finder's** color throughout — and a word more than one player found (compete, now that RLS exposes every player's `found_words`) is colored by the **first finder** (earliest `found_at`); `buildDisplayRows` dedups it to one row. The caller's own score/rank/stats stay caller-only across the terminal transition (`PlayArea` filters `found_words` to the caller in compete rather than leaning on the now-relaxed RLS).
- **FE-knows trade preserved**: the `required_words` answer key stays hidden via the column-grant + `games_state` view pattern, just like coop.

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

The word list itself is **not** a freebee table — it's the shared `common.words` master list (see [common.md → The word list](../common.md#the-word-list-commonwords)). freebee filters it on the fly in `candidate_words`. The only freebee-owned reference table is the pangram seed pool:

| table | purpose |
|---|---|
| `pangrams` | Precomputed seed pool. ~2.1k rows: one per unique 7-letter mask drawn from the **band-1 (universal)** slice of `common.words` that satisfies `isValidPuzzleMask` (q→u, ≥2 vowels). Drawing seeds from band 1 guarantees every board's pangram is a word everyone knows. Each row carries `required_words_count` (how many **required** words fit *at the band-2 floor* — band ≤ 2, american, no slang, clean (slur 0 + crude 0); ≥30 gate at sample time, independent of the per-game `setup.required` choice) and `has_rare_letters` (the diverse-builder weighting tier). The edge function samples from this table to seed a new board. Rebuilt by `npm run freebee:import` (after `words:import`). See [Why a seeds table?](#why-a-seeds-table). |
| `games` | One row per playthrough. `id` is FK to `common.games(id)`. Holds `mode` (`'coop'`/`'compete'`, denormalized from the gametype string for RLS branching), `outer_letters` (6 chars), `center_letter` (1 char), `required_words_score` and `required_words_count` (cached at create-game time), plus the **hidden** wordlist columns `required_words` (jsonb array of `{word, points, is_pangram}` — the answer key, revealed post-terminal) and `bonus_words` (text[]; the bonus set, used only server-side for validation, never revealed). Hidden via column-level grant; `required_words` exposed conditionally via `games_state`. The column grant explicitly includes `mode` so the security_invoker view + the mode-aware found_words RLS policy can read it. |
| `found_words` | One row per `(player, word)`. Includes `points` (length-based + `+10` if pangram; bonus rows score normally too), `is_pangram` (true when the word's distinct-letter count = 7), `is_bonus` (true when the word is a bonus word — legal but not required). PK `(game_id, user_id, word)` — compete-friendly. Coop uniqueness across players is enforced inside `submit_word` via the per-game-id duplicate check. |

### The terminal-gated wordlist pattern

`freebee.games.required_words` is the answer key for the puzzle. The normal play data path keeps it out of the FE's hands during play and reveals it post-terminal for the end-of-game wordlist display. (`bonus_words` is also column-hidden, but it's *never* exposed — unfound bonus words aren't shown — so it's read only server-side, for validation.)

This is **not an anti-cheat boundary** — per [CLAUDE.md → Trust model](../../CLAUDE.md), we don't try to stop a friend from peeking. A determined player can still recover the answer key (e.g. by calling `candidate_words` from devtools with their own board's masks — it's granted to `authenticated` so the edge-function builder can use it; see [Why a SQL helper](#why-a-sql-helper-for-candidate_words)). The point of the pattern is a clean single source of truth where the *default* data path doesn't carry the secret, which is what makes the post-terminal reveal a deliberate, auditable transition rather than a flag the FE flips.

Same two-layer pattern as `psychicnum.games.target` (see [`psychicnum.md` → The hidden-target mechanic](psychicnum.md#the-hidden-target-mechanic)):

1. **Column-level grant** on the base table omits both hidden columns from the `authenticated` role's SELECT. A direct `SELECT required_words FROM freebee.games` returns `42501 permission denied`.
2. **`freebee.games_state` view** with `security_invoker = true`, exposing `required_words` through a `SECURITY DEFINER` helper (`_required_words_for`) that bypasses the column grant and applies a CASE on `common.games.is_terminal`. Pre-terminal: returns `null`. Post-terminal: returns the actual list.

The FE only ever reads from `games_state`, never from `games` directly.

### Why a seeds table?

A valid FreeBee board needs at least one pangram (the 7-distinct-letter word). Random 7-letter sets mostly *don't* contain a pangram, so generating "pick 7 random letters and check" wastes thousands of attempts. The flip: **start from known pangrams**. Scan the band-1 (universal) slice of `common.words` for every 7-distinct-letter word, dedupe by letter mask, store the masks. That gives ~2.1k seeds, each guaranteed to admit at least one *common* pangram.

To build a board, the edge function:
1. Samples one row (weighted by `has_rare_letters` ×3 to even out the natural skew toward `e`, `a`, `i`).
2. Picks a center from the 7 letters of the mask.
3. Reads candidate words via `freebee.candidate_words(puzzle_mask, center_bit, required_band, legal_band)` — a small SQL helper that pushes the bitmask intersection server-side (see [Why a SQL helper for candidate_words?](#why-a-sql-helper-for-candidate_words) below).
4. Optionally rejects if it shares >4 letters with the club's previous board (the diverse-builder overlap cap).

### Seed qualification: a common pangram + enough required words

A seed earns a row in `pangrams` only if it has **(1) a band-1 (universal) pangram** and **(2) ≥ 30 required words at the band-2 floor** (band ≤ 2, american, no slang, clean: slur 0 + crude 0):

- **Seed = band 1.** Every seed is the letter-set of a band-1 7-distinct-letter word, so every board's pangram is a word *everyone* knows. This avoids serving an obscure-only pangram (e.g. CALDRON) that a player would rather not have to dredge up — finding the pangram is core to the fun.
- **Count = required FLOOR (band ≤ 2).** `required_words_count` is how many required words fit the seed *at the band-2 floor*; the ≥ 30 gate refuses a sparse board. The `≥ 30` is a baked-in quality floor, *not* a player knob.

The in-play required band is now a **per-game setup choice** (`setup.required`, 2..6 — see `candidate_words`). Counting seeds at the band-2 FLOOR keeps board *selection* independent of that choice: a higher `required` only ADDS words, so a seed that passes the floor stays solvable at any choice. (The stored `required_words_count` is the floor count, not the per-game count — but the per-game board the edge function builds recomputes both at the chosen band.) ~2.1k seeds qualify.

(A future feature could let players pick the required/legal bands per game. Because the lists are nested — a higher band only ever *adds* words — a seed that clears the gates at the lowest offered band clears them at every higher one, so the seed pool wouldn't need per-level work; only the band the count is evaluated at would move.)

### Why a SQL helper for `candidate_words`?

[`freebee.candidate_words(puzzle_mask, center_bit, required_band, legal_band)`](../../supabase/migrations/20260617000000_freebee.sql) is a tiny `stable` `security invoker` function returning `(word, letter_mask, is_required)` for every `common.words` row in freebee's legal tier (band ≤ `legal_band`, len ≥ 4) whose mask is a subset of `puzzle_mask` and contains `center_bit`. `is_required` (= band ≤ `required_band` AND american AND NOT slang AND slur = 0 AND crude = 0) is computed in the SELECT — this is the single place freebee's slice of the shared list is defined. The two band parameters are the per-game `setup.required` / `setup.legal` choices, threaded in by the edge function (defaults 3 / 5).

It exists because the obvious-looking pattern — "fetch all legal words, filter the bitmask in JS" — silently truncates against PostgREST's `max_rows = 1000` cap. `common.words` has ~283k rows; the alphabetical first 1000 mostly start with `a` and don't represent the puzzle's candidate space at all, so `required_words_count` ends up below the ≥30 gate and the function returns 500. Pushing the filter into Postgres returns only the ~hundreds of actual candidates in one round-trip, well under any cap. (At freebee's selectivity it's a seq-scan-with-filter, ~15 ms — no index, the bitwise subset test isn't sargable anyway.)

### Play states

`common.games.play_state` carries freebee's lifecycle enum:

- **`playing`** — submissions accepted. The default.
- **`ended`** — terminal. Covers two outcome shapes: countdown expiry (`status.outcome='timeout'`) and manual end (`'manual'`). In compete, both still write `play_state='ended'` (no winner). In coop, these are the *only* paths to terminal.
- **`won_compete`** — terminal. Compete only: a player hit `setup.target_rank`. `status.outcome='won_compete'` + `status.winner_user_id`.

`is_terminal` is true for `ended` and `won_compete`.

### `status` jsonb

Drives `manifest.labelFor` for the club page's game-list label and (in compete) drives the live `OpponentStrip` via `GamePageCtx.status`.

- **Coop:** `{ mode: 'coop', outcome?, found_words_score, required_words_score, rank_idx, found_words_count, required_words_count }`. `outcome` is absent mid-game and present at terminal (`'timeout'` or `'manual'`). `found_words_count` counts ALL submissions (required + bonus); `found_words_score` includes bonus points. The displayed `found_words_count / required_words_count` can overshoot, and `found_words_score / required_words_score` can climb past 1.0 (rank_idx clamps at 6).
- **Compete:** `{ mode: 'compete', target_rank, leaderboard: [{user_id, found_words_score, rank_idx, found_words_count}, …], required_words_score, required_words_count, winner_user_id?, outcome? }`. The leaderboard array drives the FE's `OpponentStrip` — opponent visibility is rank-only by design (`found_words_score` + `found_words_count` are in the payload but the FE intentionally surfaces only `rank_idx`). At terminal: `winner_user_id` set on `won_compete`; `outcome` set on `'timeout'`/`'manual'`.

### Title formula

`"<CENTER>·<OUTER-SORTED>"` (e.g., `"E·ABCDFG"`). Center letter, dot separator, outer letters alphabetized + uppercased. Identifies a board at a glance in the club's history.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `freebee, common, public, extensions`.

### `freebee.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text, board jsonb) → table(id uuid)`

Called only by the `freebee-build-board` edge function in practice (it builds the board and passes it in). The positional `mode text` parameter (between `player_user_ids` and `board`) routes the gametype string to `'freebee_coop'`/`'freebee_compete'` and lands on `freebee.games.mode` for RLS branching. Validates everything end-to-end:

- `mode` ∈ `{'coop', 'compete'}`. Compete enforces ≥2 players (`array_length(player_user_ids, 1) >= 2`).
- `setup.mode` is **rejected** if present (P0001) — catches a stale FE that didn't strip it after the sibling-manifest split.
- `setup.target_rank` is required iff `mode='compete'`; absent iff `mode='coop'`. Range 0..6.
- `setup.required` (the goal-words band) defaults to 3, range **2..6**; `setup.legal` (the accepted-words band) defaults to 5, range **required..6** (legal must contain required, else P0001). These are the bands the edge function already baked into the board via `candidate_words`; create_game re-checks them as a server-authoritative belt to the FE's `freebeeLegalError` Start gate. (The board is already built, so this is a guard, not a re-selection.)
- `setup.timer` delegated to `common.validate_timer`.
- `board.outer_letters` is exactly 6 distinct lowercase ASCII letters excluding `s`; `board.center_letter` is one lowercase ASCII letter excluding `s` and not present in outer.
- `board.required_words_count ≥ 30` (mirrors the edge function's gate).
- `board.required_words` and `board.bonus_words` are arrays.

Builds the title (per the formula above), calls `common.create_game` with the `'freebee_<mode>'` gametype string, inserts the `freebee.games` detail row (with `mode` column), and seeds `common.update_state`. The seeded status shape differs by mode: coop carries `{found_words_score:0, required_words_score, rank_idx:0, found_words_count:0, required_words_count}`; compete carries `{target_rank, required_words_score, required_words_count, leaderboard:[]}` (numeric per-player fields land once the first `submit_word` runs).

### `freebee.submit_word(target_game uuid, word text) → jsonb`

Returns `{ "result": <enum>, "points": int }`. Returning the points (not just the enum) lets the FE show the score earned in the entry feedback — and call out a pangram — **without re-deriving the point/pangram rules on the client** (the server already computed them). `points` is 0 for every rejected result.

The main mid-game action. Validates the word in the freebee-ws order (chosen so the friendliest message wins when multiple things are wrong):

1. `tooShort` — length < 4
2. `badLetters` — uses a letter not on the board
3. `missingCenter` — doesn't include the center letter
4. `notAWord` — not in `required_words` and not in `bonus_words` (i.e. not legal)
5. `alreadyFound` — per mode rule (coop: any row with `(game_id, word)`; compete: row with `(game_id, user_id, word)`)
6. otherwise: `pangram` (uses all 7 letters — required OR bonus), else `accepted` (required word), else `bonus` (legal but not required). **Bonus scores normally** — length + pangram bonus, same as a required word; the `pangram` value takes precedence over the accepted/bonus split (which the FE renders identically anyway), so the entry feedback can flag it.

On accept: inserts `found_words` row, recomputes team/player score, calls `common.update_state` (in coop, every accept; in compete, until the caller hits `target_rank`) or `common.end_game` (compete target-rank-hit only — coop never auto-terminates from `submit_word`).

`SELECT … FOR UPDATE` on `freebee.games` serializes concurrent submissions. The PK on `found_words` is `(game_id, user_id, word)` — a same-player double-submit is also caught at the constraint level.

### `freebee.submit_timeout(target_game uuid) → void`

Countdown-expiry handler. Calls `common.end_game(target_game, 'ended', {outcome:'timeout', ...}, player_results)`. Idempotent — second call raises `P0001 'game is not in progress'`, which the FE swallows.

**Realtime touch at the tail**: `update freebee.games set club_handle = club_handle where id = target_game`. `submit_timeout` would otherwise never write to any `freebee` table (no word was submitted; `common.end_game` only writes to `common.games`), so the FE's `useGame` subscription on `freebee.games` would never wake up to refetch and reveal the wordlists. The self-set writes a WAL entry that Realtime picks up. See the "realtime touch" notes in [`20260617000000_freebee.sql`](../../supabase/migrations/20260617000000_freebee.sql) for the bug history.

### `freebee.end_game(target_game uuid) → void`

The "End game" menu item fires this. Same shape as `submit_timeout` but with `status.outcome = 'manual'`. Any current game player can call it.

The Realtime-touch pattern repeats — see `submit_timeout` above. Tested via the `ctid` change in `gameplay_test.sql`.

### Helper functions

- **`freebee._rank_idx(score int, total int) → int`** — integer-math implementation of the rank ladder. Mirrors `currentRankIndex` in [`ranks.ts`](../../src/freebee/lib/ranks.ts); a Vitest assertion pins the two implementations together.
- **`freebee._required_words_for(g uuid) → jsonb`** — the conditional-reveal helper that the `games_state` view calls for the `required_words` answer key. `SECURITY DEFINER` so it bypasses the column grant; the CASE on `common.games.is_terminal` enforces the reveal gate.
- **`freebee.candidate_words(puzzle_mask bigint, center_bit bigint, required_band int, legal_band int) → table(word text, letter_mask bigint, is_required boolean)`** — the bitmask-intersection lookup the edge function uses (see [Why a SQL helper](#why-a-sql-helper-for-candidate_words) above). The band args are the per-game `setup.required` / `setup.legal`.

## Edge function: `freebee-build-board`

[`supabase/functions/freebee-build-board/index.ts`](../../supabase/functions/freebee-build-board/index.ts) — the FE's `manifest.startGameInClub` invokes this. It runs as the caller (via the JWT in the Authorization header) for all PostgREST calls.

1. Reads `freebee.pangrams` in pages of 1000 (paginated to defeat `max_rows`); reads the club's most recent `freebee.games` row for the previous-board overlap cap.
2. Filters the pangram pool by overlap cap (≤4/7 letters shared with previous board).
3. Builds a weighted candidate array (rare-letter masks ×3).
4. Samples + applies ING dampening (1/3 accept on masks containing all of `{i, n, g}`).
5. Picks a center uniformly from the 7 letters.
6. Calls `freebee.candidate_words(puzzle_mask, center_bit, required_band, legal_band)` — passing the per-game `setup.required` / `setup.legal` (defaults 3 / 5) — and gets back the dictionary slice that fits this puzzle.
7. Computes points per required word (length + 10 if pangram), builds the `board` payload.
8. Calls `freebee.create_game(...)` over PostgREST — the RPC validates the board end-to-end and creates the game.
9. Returns `{ id }`.

The function logs one line per step in dev (`console.log` lands in `supabase functions serve` output), so when a board build fails the cause is on screen.

## Pangram seed import: `npm run freebee:import`

[`supabase/scripts/import-freebee-pangrams.ts`](../../supabase/scripts/import-freebee-pangrams.ts). It rebuilds `freebee.pangrams` from `common.words`: band-1 words seed the pangrams, and each seed's word-count is over the **required-FLOOR pool** (band ≤ 2, american, no slang, clean: slur 0 + crude 0 — the floor, so selection stays independent of the per-game `setup.required` choice). The word list itself is loaded separately by `npm run words:import` (see [common.md → The word list](../common.md#the-word-list-commonwords)) — **run that first**; this script reads what's already in the table.

**Script flow:**
1. Query `common.words` for the required-FLOOR pool's `(letter_mask, difficulty)`: `difficulty ≤ 2 AND american AND NOT slang AND slur = 0 AND crude = 0 AND len ≥ 4 AND no 's'` (band 2 = the floor; the per-game `setup.required` only adds words above it). (`letter_mask` is the table's generated column, so there's nothing to recompute.)
2. Candidate seeds = the band-1 subset (`difficulty = 1`) with exactly 7 distinct letters (`popcount(mask) = 7`) that satisfy `isValidPuzzleMask` (q→u when q is set, ≥2 vowels). Sourcing seeds from band 1 is what guarantees each board has a *common* pangram.
3. For each seed, count required-pool words whose mask is a subset (`wordMask & ~seedMask = 0`); keep seeds with ≥30. Tag `has_rare_letters`.
4. **Bulk-load `freebee.pangrams` via psql `COPY`** — `TRUNCATE` then insert, using [`lib/copyLoad.ts`](../../supabase/scripts/lib/copyLoad.ts). The TS does the mask/count computation; only the *load* is psql.

This currently yields ~2.1k seed rows.

**Reseed, not upsert.** The pangram pool is fully derived from `common.words`, so each run TRUNCATEs and reloads from scratch — there's nothing to preserve.

**Why COPY, not the REST API.** The loader connects directly to Postgres as the superuser and streams rows over one connection. This is what makes bulk loading to a *hosted* project fast (~1s) and reliable: the earlier supabase-js batch-upsert path choked on `TypeError: fetch failed` mid-import when the hosted API gateway closed reused keep-alive connections between batches.

**Connection:** `SUPABASE_DB_URL` (a Postgres connection string), defaulting to the local stack. Requires `psql` on PATH. The deploy script (`import-to-hosted.sh`) sets it to the hosted project's direct connection.

## Row-level security

| table | SELECT policy | INSERT/UPDATE/DELETE |
|---|---|---|
| `pangrams` | RLS off (public reference data) | INSERT only via the import script (`npm run freebee:import`) |
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
                          (coop: "X/Y pts · Z/W words"; compete: "race to Amazing" /
                          "winner at Amazing" / "time up · no winner at Amazing" —
                          mode itself shown by the card's <ModePill>, not prefixed).
                          submitTimeout shared.
  db.ts                   export const db = supabase.schema('freebee')
  theme.css               --freebee-hex / --freebee-accent / feedback colors. Loaded
                          with this gametype's chunk via the PlayArea.tsx import.
  logo.svg                Bee glyph (copied from freebee-ws).

  components/
    PlayArea.tsx          Two-column composition (input column left, side panel right).
                          Owns the typed word, the shuffle seed, the in-body feedback pill
                          timer (own word result), the submit_word dispatch, and the
                          End-game menu item registration. Wires usePeerFeedback to the
                          common header slot for peer/opponent events (aliased as
                          `headerFeedback` so it doesn't clash with the local pill state).
                          Compete-only: renders the OpponentStrip between RankBar
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
    Feedback.tsx          The IN-BODY pill, near the input: the player's OWN word result
                          (success / warning / error — tone type `WordResultTone`, NOT the
                          common FeedbackTone; it has a `warning` value the header lacks).
                          role="status" aria-live="polite". PlayArea drives the
                          show-and-clear timer. Peer/opponent events go to the HEADER slot
                          instead — see usePeerFeedback. Two distinct surfaces by design.
    RankBar.tsx           7 dots from Start to Genius, filled up to the current rank.
                          Per-dot hover tooltip with rank name + points threshold.
    Stats.tsx             2-cell grid: Score / Words. Tabular-nums so the digits
                          don't shift width as the score climbs. (Timer lives in
                          the GamePage header, not here.)
    WordList.tsx          Alphabetical 2-column flow. Per-finder color via
                          memberColor.colorVarFor. Pangram = font-weight: 700; bonus =
                          trailing dot via ::after; recently-found = underline (5s via
                          useRecentlyFound). Post-terminal: revealWords prop fills in
                          unfound required words in gray. In compete mode the foundWords
                          input is already caller-only (RLS branch (b) hides peers'
                          rows mid-game) — the list renders just the caller's finds
                          without an FE branch.
    SetupForm.tsx         The setup dialog body (lazy-loaded inside the common
                          SetupGameDialog wrapper). Reads `mode` from SetupBodyProps
                          (fed by the sibling-manifest's GameManifest.mode). Coop:
                          short paragraph + shared <TimerField>. Compete: adds a
                          target-rank radio (Solid..Genius, default Amazing) above
                          the timer. Both modes: a "Word difficulty" fieldset with
                          two shared <DifficultyField>s (Required words: band 2..6;
                          Legal/bonus words: band required..6) — the manifest's
                          `validate: freebeeLegalError` gates Start until legal ≥
                          required. Custom-letters fields still deferred.
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
    usePeerFeedback.ts    Fires HEADER feedback pills for other players' activity — the
                          complement to the in-body pill. coop: a peer found a good/pangram
                          word (found_words is club-wide). compete: an opponent climbed a
                          rank (their words are RLS-hidden, but rank rides
                          status.leaderboard). Both bootstrap on the first loaded render so
                          a reconnect doesn't replay a backlog; self-activity is excluded.

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
                          authority on "real" required pangrams is the server's
                          required_words.is_pangram flag.
    leaderboard.ts        LeaderboardEntry type + readLeaderboard(status): the compete
                          rank payload off common.games.status. Shared by the
                          OpponentStrip and usePeerFeedback.
```

### Routes & shell

Standard pupgames route: `/g/freebee_coop/<gameId>` or `/g/freebee_compete/<gameId>` (the gametype URL segment is the sibling-manifest's full string, not the `baseGametype`). Mounted by `App.tsx` via `<GamePage>` with `freebee`'s shared `PlayArea` as the render-prop child. `GamePage` owns the cross-cutting chrome (header / timer / pause overlay / chat / Back-to-club / common menu items). `PlayArea` owns everything per-game, including the `<GameOverModal>` itself — same pattern as wordknit / PsychicNum / tinyspy, since the verdict copy needs game-specific context.

### State flow for one submission

1. User types or clicks letters → `PlayArea` updates `word` state.
2. User hits Enter → `handleSubmit` calls `db.rpc('submit_word', {target_game, word})`.
3. RPC validates, inserts a `found_words` row, updates `common.games.status`, possibly fires the terminal flip.
4. Realtime UPDATE event on `freebee.found_words` reaches `useGame`'s `useRealtimeRefetch`; `load()` re-reads `games_state` + `found_words`.
5. `setGame({...})` + `setFoundWords(...)` re-render `PlayArea`.
6. The submission's `{ result, points }` drives the feedback pill — the `result` enum (`'pangram'` / `'accepted'` / `'bonus'` / `'tooShort'` / …) picks the tone + copy, and `points` appends "+Npts" for results that scored.
7. `useRecentlyFound` flags the new word as recent for 5s → `<WordList>` underlines it in the finder's color.

### "End game" menu wiring

[`useEffect(syncMenuItems)`](../../src/freebee/components/PlayArea.tsx) registers a single per-game menu item via `ctx.menu.setGameItems([{id, label, onClick, disabled}])`. Click → `window.confirm()` → `db.rpc('end_game', ...)`. The menu item is disabled when `isTerminal=true`. Cleanup on PlayArea unmount restores the empty per-game section.

### Terminal experience

When `isTerminal` flips true:
1. `useTerminalModal` opens the `<GameOverModal>` (won/lost color + verdict line + Back-to-club).
2. The input column's `<Feedback>` row swaps for a terminal indicator: `"Game over — <indicator copy>"` plus a Back-to-club button.
3. `<Actions>`' Delete + Enter disable; Shuffle stays clickable.
4. `games_state.required_words` materializes via the helper; `useGame.load()` refetches; `game.requiredWords` populates.
5. `<WordList revealWords={game.requiredWords}>` merges the unfound required words into the alphabetical render as gray rows.

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
| `game:${gameId}` (stable) | `useCommonGame` | Presence + manual-pause Broadcast + suspend Broadcast + postgres-changes on `common.games`. The compete OpponentStrip rides this channel — `submit_word` writes the updated `status.leaderboard` to `common.games.status`, which propagates here, and `useCommonGame` surfaces it through `GamePageCtx.status` to the PlayArea. |
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
| `tests/freebee/create_game_test.sql` | Auth, membership, coop + compete happy paths, gametype-string routing, mode arg validation, setup.mode rejected if present (loud catch for stale FE), target_rank-iff-compete + range + coop-must-omit, compete ≥2-player floor, word-difficulty band validation (required 2..6, legal required..6, plus an explicit non-default required=4/legal=6 happy path), board structure validation, title formula, per-mode status seeding. |
| `tests/freebee/gameplay_test.sql` | Coop `submit_word` result-enum branches incl. pangram +10 bonus (required AND bonus paths), bonus-words-score-normally assertions, soft-reject "no row inserted" check, coop duplicate semantics, coop-has-no-auto-terminal sanity (play_state stays 'playing' past required_words_count; score overshoots required_words_score; rank clamps at Genius), `submit_timeout` (ctid touch + idempotency + post-terminal games_state reveal), `freebee.end_game` (ctid touch, status.outcome='manual', auth, idempotency). |
| `tests/freebee/compete_test.sql` | Per-player duplicate rule (bea can re-find ada's word; ada can't re-find her own), mid-game leaderboard shape, first-to-target → won_compete (winner_user_id, {won:true}/{won:false} per-player results, opponents can't submit post-win), submit_timeout in compete (no winner, all {won:false}), end_game in compete (no winner, outcome=manual), RLS branches (a / b / c) per mode + terminal state. |

### Per-test fixtures

`tests/freebee/setup.psql` provides:
- `pg_temp.freebee_board()` — a valid 30-required-word + 3-bonus board jsonb. Letters: outer `'abcdfg'`, center `'e'`. Includes a synthetic 7-letter required pangram (`'abcdefg'`) for the required-pangram +10 path AND a synthetic 7-letter bonus pangram (`'gfedcba'`) for the bonus-pangram +10 path. Total: 50 required points across 30 words.
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
| Everything server-side — schema, column grants, RLS, the `games_state` view, hidden-wordlist helper (`_required_words_for`) + `candidate_words`, the RPCs (`create_game` / `submit_word` / `submit_timeout` / `end_game`), `_rank_idx`, the `submit_timeout` Realtime-touch, the `mode` column + mode-aware RLS, and the `freebee_coop`/`freebee_compete` gametype rows | [`supabase/migrations/20260617000000_freebee.sql`](../../supabase/migrations/20260617000000_freebee.sql) |
| Compete-specific FE rendering (OpponentStrip, mode-aware buildOver) | [`src/freebee/components/PlayArea.tsx`](../../src/freebee/components/PlayArea.tsx) |
| Target-rank picker + word-difficulty (required/legal band) fields in the setup dialog | [`src/freebee/components/SetupForm.tsx`](../../src/freebee/components/SetupForm.tsx); the shared dropdown is [`src/common/components/DifficultyField.tsx`](../../src/common/components/DifficultyField.tsx); the `legal ≥ required` Start gate is `freebeeLegalError` in [`src/freebee/lib/setup.ts`](../../src/freebee/lib/setup.ts) |
| How the word list is populated | `common.words` via [`supabase/scripts/import-words.ts`](../../supabase/scripts/import-words.ts) (read live from `~/src/gamelist/words.tsv`) — see [common.md](../common.md#the-word-list-commonwords) |
| How the pangram seed pool is built | [`supabase/scripts/import-freebee-pangrams.ts`](../../supabase/scripts/import-freebee-pangrams.ts) (derives `freebee.pangrams` from `common.words`) |
| The board-builder edge function | [`supabase/functions/freebee-build-board/index.ts`](../../supabase/functions/freebee-build-board/index.ts) |
| The play surface | [`src/freebee/components/PlayArea.tsx`](../../src/freebee/components/PlayArea.tsx) |
| The honeycomb layout (CSS lifted from freebee-ws) | [`src/freebee/components/Letters.module.css`](../../src/freebee/components/Letters.module.css) |
| The rank ladder math | [`src/freebee/lib/ranks.ts`](../../src/freebee/lib/ranks.ts) |
| The found-words list | [`src/freebee/components/WordList.tsx`](../../src/freebee/components/WordList.tsx) |
| The per-gametype data hook | [`src/freebee/hooks/useGame.ts`](../../src/freebee/hooks/useGame.ts) |

## Open / deferred

Tracked in [`deferred.md`](../deferred.md) → FreeBee. Today's open items:

- **Custom-letters puzzle** — edge-function parameter unused; setup-form field absent.
- ~~**Per-player attribution in the post-terminal reveal**~~ **DONE.** Post-terminal, every found word keeps its **finder's** color (a word more than one player found goes to the first finder by `found_at`); only the never-found required words go grey. (Earlier this merged peers' finds and missed words into one muted "everything that isn't mine" bucket.) A per-player leaderboard panel is still possible on top, but the attribution itself now ships.
