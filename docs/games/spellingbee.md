# spellingbee

A NYT-Spelling-Bee-style word-finding game. The fourth registered gametype in this monorepo, ported from the standalone `~/spellingbee-ws` codebase (websocket + Node backend, rich React FE). The port preserves the gameplay loop and the honeycomb-board visual layout; the websocket / session / chat / presence machinery is replaced by Supabase Realtime + the PuzPuzPuz common shell.

"spellingbee" is the codename. User-facing copy is "spellingbee"; folder / schema / RPC names are all `spellingbee`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](../common.md). For testing conventions + persona shapes see [`testing.md`](../testing.md). For per-gametype comparisons see [`codenamesduet.md`](codenamesduet.md), [`psychicnum.md`](psychicnum.md), and [`connections.md`](connections.md).

**Manifest declarations.** Two-manifest family (sibling-pattern) — `spellingbeeCoopGame` (`gametype: 'spellingbee_coop'`, `mode: 'coop'`, `numberOfPlayers: [1, 6]`) and `spellingbeeCompeteGame` (`gametype: 'spellingbee_compete'`, `mode: 'compete'`, `numberOfPlayers: [2, 6]`). Both share `baseGametype: 'spellingbee'`, one schema, and one PlayArea / SetupForm / Help / useGame; the mode branches at render time on `game.mode` (denormalized from the gametype string at create_game time). See [Compete mode](#compete-mode) below for the per-mode behavior and [`psychicnum.md → The sibling-manifest pattern`](psychicnum.md#the-sibling-manifest-pattern) for the canonical pattern write-up.

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
- **Bonus words:** spellingbee slices the shared `common.words` list into two nested tiers — a smaller **required** set (band ≤ `setup.required`, american, no slang, clean: slur 0 + crude 0 — the goal shown to players) and a larger **legal** set (band ≤ `setup.legal`, no other restriction: the acceptance bar). Both bands are per-game setup choices (`required` 2..6 default 3; `legal` required..6 default 5); the rest of this section uses the defaults for concreteness. A word that's legal but NOT required is a **bonus** word (`bonus = legal − required`), accepted and **scored the same way as a required word** (length-based + pangram bonus). The difference is purely about what the player saw before they found it: bonus words are NOT counted in `required_words_count` and NOT included in the puzzle-quality gate (`≥30 required words`) or the rank-threshold *denominator* (`required_words_score`). So a player who finds a bonus pangram (rare-word knowledge!) can legitimately rocket past the displayed "max" score and even past the Genius rank. The `Words: X/Y` display lets `X` (`found_words_count`, all finds) overshoot `Y` (`required_words_count`) when bonus words are found, signaling the extra credit. Bonus contribution to score + rank is *intentional* — the design call is "we don't want players to feel bad for missing obscure words, but reward them if they find them." Matches `~/spellingbee-ws/server/sessions.js:988-990`.
- **Rank ladder:** as score climbs vs. the puzzle's maximum-possible score, the player passes through **Start → Good → Solid → Nice → Great → Amazing → Genius**. Genius unlocks at **70%** of the maximum. The ladder is mirrored on the FE in [`src/spellingbee/lib/ranks.ts`](../../src/spellingbee/lib/ranks.ts) and on the SQL side in `spellingbee._rank_idx` — both compute from the same constants, and a Vitest assertion checks they agree numerically across every score-vs-total combination.
- **Lifecycle:**
  - *Coop*: ends when (a) the countdown timer expires (`timer.kind = 'countdown'` only) or (b) any player chooses the **End game** menu item. **There's no auto-end on 100%-found** — players who exhaust the required set keep going, finding bonus words past the displayed `Y / required_words_count` and pushing the score past `required_words_score` (the rank clamps at Genius). Untimed and count-up games end only via (b). Matches `~/spellingbee-ws/server/sessions.js`'s `submitWord` (no terminal check past acceptance).
  - *Compete*: ends when (a) a player reaches the configured `target_rank` first (→ `play_state='won_compete'`, that player wins, others lose), (b) the countdown timer expires before any winner emerges (→ `play_state='ended'`, no winner), or (c) any player ends the game manually (→ `play_state='ended'`, no winner). Per-player elimination doesn't exist — players keep racing until terminal.

### Coop vs compete

**Coop**: all players see the same found-words list; whoever finds a word first claims it (their color marks the entry). The team score is everyone's points combined. The game ends when (a) the countdown timer expires (`outcome='timeout'`) or (b) any player chooses the **End game** menu item (`outcome='manual'`). No auto-end at 100%-found — past the required set, players climb the score with bonus words; rank clamps at Genius.

**Compete**: each player races independently on the same honeycomb. Per-player score, per-player found-words list (RLS hides peers' rows during play). **First to the setup-configured target rank wins** — the race ends instantly for everyone with `play_state='won_compete'`, the winner's `common.game_players.result = {won: true}`, opponents `{won: false}`. Timer expiry or manual end before any winner emerges → `play_state='ended'` with everyone `{won: false}` (a collective non-finish; no winner declared on a non-race outcome). Opponents see each other's RANK ONLY during play (via the `status.leaderboard` payload); guesses + matched-word lists stay private until terminal. See [Compete mode](#compete-mode) for the per-mode picks + schema details.

### What the game isn't

- **Not turn-based.** Any player can submit at any time. Submissions are atomic on the server.

### Parity with `~/spellingbee-ws`

The rules + scoring match `~/spellingbee-ws` (the standalone codebase this is ported from). One intentional difference: **compete winner determination** — this port pins `winner_user_id = caller` when the target-hitting `submit_word` lands. `~/spellingbee-ws` ends the session and then picks the highest-score player; in practice these match because the target-hitter just gained points and has the top score, but the local-pinned variant is more deterministic.

## Vocabulary

In addition to the cross-cutting terms in [`naming.md`](../naming.md):

| term | meaning |
|---|---|
| **board** | The 7 letters of one puzzle: 6 outer + 1 center. Determines which words are legal. |
| **pangram** | A word that uses all 7 distinct letters of the board. Every board has at least one (the seeds table is built from band-1 pangrams in `common.words`, so it's always a *common* word). Pangrams earn the +10 bonus on top of the length score and render bold in the found-words list. |
| **required word** | A word in spellingbee's smaller tier of `common.words` (band ≤ `setup.required`, default 3; american, not slang, clean: `slur = 0 AND crude = 0`). These are the goal shown to players — they earn points and contribute to rank, and their count/score are the "X / Y" denominators (`required_words_count` / `required_words_score`). |
| **legal word** | A word in spellingbee's larger tier (band ≤ `setup.legal`, default 5; no other restriction). This is the *superset* — it includes every required word plus the bonus ones. "Legal" is the acceptance bar (`submit_word` accepts a word iff it's legal); it's a concept, not a stored column. |
| **bonus word** | A word that's legal but not required (`bonus = legal − required`: a band above `setup.required` but ≤ `setup.legal`, or a band ≤ `setup.required` word that's non-american / slang / crude / a slur). Accepted by `submit_word` as `'bonus'`; **scores normally** (length-based + pangram bonus, same as a required word), but does NOT count toward the required goal. Recorded in `found_words` with `is_bonus = true` and shown with a trailing bullet in the WordList. Because the found score climbs without the required max climbing, finding bonus words can push you past the displayed-max score and even past Genius / past compete's target rank. |
| **found words** | The words you (coop: your team) have found — required *and* bonus. `found_words_count` / `found_words_score` are the live "X" numerators and can exceed the required "Y" denominators. |
| **rank** | The player's tier on the 7-step Start..Genius ladder, derived from `found_words_score / required_words_score` via `currentRankIndex`. Genius unlocks at 70% (`GENIUS_AT`). Same word `connections` uses for category difficulty, but the underlying concept is different and the scope (puzzle-wide vs per-category) disambiguates in context. |
| **letter mask** | A 26-bit integer encoding which letters a word/puzzle uses. Same encoding everywhere (TS, SQL, the generated `common.words.letter_mask` column): bit `n` is set iff letter `'a' + n` is present. Used for fast subset-of-puzzle checks (`(wordMask & ~puzzleMask) === 0`) instead of per-character scans. |
| **outcome** | The `status.outcome` enum value for terminal spellingbee games: `'timeout'` (countdown expired), `'manual'` (any player clicked the End-game menu item), `'won_compete'` (compete: a player hit `target_rank`), `'lost_compete'` (compete: timer / manual end with no winner — but actually this port writes `'timeout'`/`'manual'` with `mode='compete'` in the status to distinguish). The corresponding `play_state` is `'ended'` for everything except `'won_compete'` which uses `play_state='won_compete'`. |

## Scope: shipped vs. deferred

| feature | status | notes |
|---|---|---|
| **Coop mode** (shared found list) | **shipped** | The whole gameplay loop |
| **Honeycomb board with click + keyboard input** | shipped | CSS lifted from `~/spellingbee-ws/src/globals.css §7` (clip-path flat-top, nth-child positions) |
| **Shuffle / Delete / Enter actions** | shipped | Shuffle stays clickable when locked; hover rotates only the ⟲ glyph, not the button |
| **Pangram detection + bonus + visual marker** | shipped | |
| **Rank ladder + rank-bar UI with hover tooltips** | shipped | |
| **Found-words list** (column-major grid, fixed height, horizontal scroll past 3 columns; found words in their finder's color, missed required words grey, pangram bold, bonus bullet, recently-found underline) | shipped | |
| **Timer modes** (none / countup / countdown) + countdown-expiry termination | shipped | Via shared `<TimerField>` + `useGameTimer` |
| **Manual end-game** (menu item; confirms then writes terminal) | shipped | Per-game menu item; outcome = `'manual'` |
| **Pause-on-disconnect + manual pause** | shipped (via common) | Free from the common shell |
| **Chat** (incl. `!`-prefix force-open) | shipped (via common) | In `FloatingChat` |
| **Reveal the required wordlist on game end** | shipped | Client-side `required − found` at `isTerminal` (the list ships from game start; bonus words aren't revealed) |
| **`GameOverModal` + terminal indicator** | shipped | Verdict copy: "Genius!" (rank 6) or 'Stopped at rank "<name>"' (rank < 6 — covers both timeout and manual) |
| **Diverse board-builder** (rare-letter weighting, ING dampening, previous-board overlap cap) | shipped | The only builder; "default" strategy dropped |
| **Compete mode** (per-player found list, target-rank race, OpponentStrip, RLS-narrowed WordList) | **shipped** | Sibling-manifest pair; both modes live in the consolidated `20260617000000_spellingbee.sql`. See [Compete mode](#compete-mode). |
| **Custom-letters puzzle** (player-specified 6+1) | **deferred** | Edge-fn parameter unused; setup-form field absent. |
| **Click-to-define popover + word-lookup dialog** | **shipped (via common)** | Common feature, not spellingbee-specific. Clicking a `WordList` row opens `common/components/definitions/DefinitionPopover` anchored to that row; the `~` key opens `common/components/definitions/WordLookupDialog` to define any word — and `~` is now an **app-global** shortcut (`common/hooks/input/useAppShortcuts`), not wired here. Both are backed by the `supabase/functions/define` edge function. |
| **Sounds** | out of scope | spellingbee-ws doesn't have them either. |
| **Mid-session "new board" affordance** | out of scope | PuzPuzPuz path is exit-to-club → start new game. The "End game" menu item is the closest analog. |

## Compete mode

spellingbee's compete mode is a per-player race to a setup-configured target rank. Same honeycomb for everyone; private per-player progress; first to the target ends the race for everyone else.

### Sibling-manifest at a glance

| field | `spellingbeeCoopGame` | `spellingbeeCompeteGame` |
|---|---|---|
| `gametype` | `spellingbee_coop` | `spellingbee_compete` |
| `schema` | `spellingbee` | `spellingbee` |
| `baseGametype` | `spellingbee` | `spellingbee` |
| `mode` | `'coop'` | `'compete'` |
| `name` | `spellingbee` | `spellingbee` |
| `numberOfPlayers` | `[1, 6]` (solo OK) | `[2, 6]` (needs ≥1 opponent) |
| `setupForm.defaults` | `{ timer: countdown 10m }` | `{ timer: countdown 10m, target_rank: 5 }` |

Both manifests share the same `PlayArea`, `SetupForm`, `Help`, and `useGame`. The mode branches at render time on `game.mode` (read from `spellingbee.games_state.mode`, denormalized for RLS + RPC branching).

### Rules (compete)

- **Setup**: in addition to the timer, the start-game dialog asks for a **target rank** — one of Solid / Nice / Great / Amazing / Genius (RANKS indices 2..6 — Start and Good are excluded as trivially-won). Default is **Amazing (5)**.
- **Per-player score + word list**: each player's `submit_word` calls write into `spellingbee.found_words` with `user_id` set to caller. RLS hides peers' rows mid-game (caller sees only their own); the WordList renders just the caller's finds until the game ends (post-terminal it opens up — see the reveal bullet below).
- **First-to-target wins**: when caller's `_rank_idx(caller_score, required_words_score) >= target_rank`, `submit_word` flips `play_state` to `won_compete`, writes `status.winner_user_id = caller`, sets caller's `common.game_players.result = {won: true}` and every opponent's `= {won: false}`. The race ends for everyone instantly — opponents with sub-target ranks can no longer submit. **Bonus words count toward the rank** — a player who hits bonus pangrams can reach target faster than the displayed max-score implies (see [Rules → Bonus words](#rules)).
- **Timeout / manual end → no winner**: if the countdown timer fires or any player ends the game manually before any player hits target, terminal `play_state='ended'` with `outcome='timeout'` (or `'manual'`) and every player's `result = {won: false}`. Friends-agreed-to-stop is a valid outcome, not a "you lose" punishment.
- **Opponent visibility = rank only**: the `OpponentStrip` rendered between the RankBar and the Stats card shows each player's current rank (and the target). The exact score, words-found count, and guesses stay private. The strip reads from `common.games.status.leaderboard` (RLS-permissive — it's on the cross-cutting common row, not the per-game found_words).
- **Post-terminal reveal**: at `isTerminal` the WordList interleaves the required words nobody found (from the always-present `games_state.required_words`, computed FE-side as `required − found`) into the alphabetical list, rendered **medium grey**. Found words keep their **finder's** color throughout — and a word more than one player found (compete, once the `found_words` RLS `is_terminal` branch exposes every player's rows) is colored by the **first finder** (earliest `found_at`); `buildDisplayRows` dedups it to one row. The caller's own score/rank/stats stay caller-only across the terminal transition (`PlayArea` filters `found_words` to the caller in compete rather than leaning on the now-relaxed RLS).
- **Word lists shipped, not hidden**: both `required_words` + `bonus_words` ship to the FE from game start (the FE validates locally); the compete reveal of *peers' finds* is still gated by the `found_words` RLS `is_terminal` branch.

### Schema deltas (vs. the baseline coop-only setup)

The `spellingbee_compete` rework (folded into the single `20260617000000_spellingbee.sql` baseline, per the alpha "edit baseline migrations" convention — there is no separate compete migration file):

- Cascade-deletes the old `'spellingbee'` row from `common.gametypes` and inserts `'spellingbee_coop'` + `'spellingbee_compete'`; backfills `common.clubs_gametypes` for existing clubs.
- Adds `spellingbee.games.mode text not null check (mode in ('coop','compete'))` — denormalized from the gametype string. The column grant extends to include `mode` so the `security_invoker` view + the mode-aware RLS policy on `found_words` can read it.
- Re-exposes `spellingbee.games_state` with a `mode` column so the FE has the value on the same row it already reads.
- Recreates `found_words_select` to read mode off `spellingbee.games.mode` instead of `common.games.setup->>'mode'` (one fewer cross-schema reach per visibility check):
  ```sql
  using (
    exists (
      select 1 from spellingbee.games fg
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
- Rewrites `spellingbee.create_game` with a new positional `mode text` arg (slotted between `player_user_ids` and `board`). The new signature is `(target_club, setup, player_user_ids, mode, board)`. Setup is rejected with P0001 if it carries a `mode` field (catches stale FE deploys loudly).
- `spellingbee.submit_word` / `spellingbee.submit_timeout` / `spellingbee.end_game` all read mode off the just-locked `spellingbee.games` row instead of joining to `common.games.setup` — the branch logic itself was already in place from the original "designed for compete" phase.

The edge function `spellingbee-build-board` accepts `mode` as a top-level body field (falls back to the legacy `setup.mode` for one release of overlap) and forwards it to the new positional RPC arg. It also strips `setup.mode` from the forwarded payload as belt-and-braces.

## Schema: `spellingbee.*`

The word list itself is **not** a spellingbee table — it's the shared `common.words` master list (see [common.md → The word list](../common.md#the-word-list-commonwords)). spellingbee filters it on the fly in `candidate_words`. The only spellingbee-owned reference table is the pangram seed pool:

| table | purpose |
|---|---|
| `pangrams` | Precomputed seed pool. ~2.1k rows: one per unique 7-letter mask drawn from the **band-1 (universal)** slice of `common.words` that satisfies `isValidPuzzleMask` (q→u, ≥2 vowels). Drawing seeds from band 1 guarantees every board's pangram is a word everyone knows. Each row carries `required_words_count` (how many **required** words fit *at the band-2 floor* — band ≤ 2, american, no slang, clean (slur 0 + crude 0); ≥30 gate at sample time, independent of the per-game `setup.required` choice) and `has_rare_letters` (the diverse-builder weighting tier). The edge function samples from this table to seed a new board. Rebuilt by `npm run spellingbee:import` (after `words:import`). See [Why a seeds table?](#why-a-seeds-table). |
| `games` | One row per playthrough. `id` is FK to `common.games(id)`. Holds `mode` (`'coop'`/`'compete'`, denormalized from the gametype string for RLS branching), `outer_letters` (6 chars), `center_letter` (1 char), `required_words_score` and `required_words_count` (cached at create-game time), plus the two word lists `required_words` and `bonus_words` — both **jsonb** arrays of `{word, points, is_pangram}` (the bonus set = legal − required). **Both ship to the FE** (readable columns, exposed via `games_state`): the FE validates + scores every guess against required ∪ bonus locally, the same trusting-commit model as boggle. No column-grant gate, no terminal-reveal helper. |
| `found_words` | One row per `(player, word)`. Includes `points` (length-based + `+10` if pangram; bonus rows score normally too), `is_pangram` (true when the word's distinct-letter count = 7), `is_bonus` (true when the word is a bonus word — legal but not required). PK `(game_id, user_id, word)` — compete-friendly. Coop uniqueness across players is enforced inside `submit_word` via the per-game-id duplicate check. |

### The word lists ship to the FE (not hidden)

`required_words` + `bonus_words` are the board's answer key, and both ship to the FE from game start — the FE validates + scores every guess against required ∪ bonus locally (via the shared `useWordSubmit` hook) and submits trusting-commit. Per [CLAUDE.md → Trust model](../../CLAUDE.md) we don't withhold them (friends, not anti-cheat), so there's no column-grant gate and no `SECURITY DEFINER` reveal helper: the FE reads both lists straight off `games_state`, and the missed-words reveal is a **client-side** `required − found` computed at `isTerminal` (bonus words are never shown in the reveal — a FE display choice, not a server gate).

This is a deliberate convergence with boggle (which always shipped its lists). It replaced the earlier hidden-wordlist apparatus — a column-grant that omitted the two columns + a terminal-gated `_required_words_for` helper + a per-terminal "realtime touch" write to wake the FE. All of that is gone: `games_state` just selects both lists, and the FE's `useGame` loads the immutable header once (nothing to re-reveal). `candidate_words` stays a `SECURITY DEFINER`-free helper the edge-function builder uses at board-build time.

The `games_state` view remains (the FE's read path, `security_invoker = true` so `games_select` RLS still gates row visibility) — it just exposes `required_words` + `bonus_words` unconditionally now.

### Why a seeds table?

A valid spellingbee board needs at least one pangram (the 7-distinct-letter word). Random 7-letter sets mostly *don't* contain a pangram, so generating "pick 7 random letters and check" wastes thousands of attempts. The flip: **start from known pangrams**. Scan the band-1 (universal) slice of `common.words` for every 7-distinct-letter word, dedupe by letter mask, store the masks. That gives ~2.1k seeds, each guaranteed to admit at least one *common* pangram.

To build a board, the edge function:
1. Samples one row (weighted by `has_rare_letters` ×3 to even out the natural skew toward `e`, `a`, `i`).
2. Picks a center from the 7 letters of the mask.
3. Reads candidate words via `spellingbee.candidate_words(puzzle_mask, center_bit, required_band, legal_band)` — a small SQL helper that pushes the bitmask intersection server-side (see [Why a SQL helper for candidate_words?](#why-a-sql-helper-for-candidate_words) below).
4. Optionally rejects if it shares >4 letters with the club's previous board (the diverse-builder overlap cap).

### Seed qualification: a common pangram + enough required words

A seed earns a row in `pangrams` only if it has **(1) a band-1 (universal) pangram** and **(2) ≥ 30 required words at the band-2 floor** (band ≤ 2, american, no slang, clean: slur 0 + crude 0):

- **Seed = band 1.** Every seed is the letter-set of a band-1 7-distinct-letter word, so every board's pangram is a word *everyone* knows. This avoids serving an obscure-only pangram (e.g. CALDRON) that a player would rather not have to dredge up — finding the pangram is core to the fun.
- **Count = required FLOOR (band ≤ 2).** `required_words_count` is how many required words fit the seed *at the band-2 floor*; the ≥ 30 gate refuses a sparse board. The `≥ 30` is a baked-in quality floor, *not* a player knob.

The in-play required band is now a **per-game setup choice** (`setup.required`, 2..6 — see `candidate_words`). Counting seeds at the band-2 FLOOR keeps board *selection* independent of that choice: a higher `required` only ADDS words, so a seed that passes the floor stays solvable at any choice. (The stored `required_words_count` is the floor count, not the per-game count — but the per-game board the edge function builds recomputes both at the chosen band.) ~2.1k seeds qualify.

(A future feature could let players pick the required/legal bands per game. Because the lists are nested — a higher band only ever *adds* words — a seed that clears the gates at the lowest offered band clears them at every higher one, so the seed pool wouldn't need per-level work; only the band the count is evaluated at would move.)

### Why a SQL helper for `candidate_words`?

[`spellingbee.candidate_words(puzzle_mask, center_bit, required_band, legal_band)`](../../supabase/migrations/20260617000000_spellingbee.sql) is a tiny `stable` `security invoker` function returning `(word, letter_mask, is_required)` for every `common.words` row in spellingbee's legal tier (band ≤ `legal_band`, len ≥ 4) whose mask is a subset of `puzzle_mask` and contains `center_bit`. `is_required` (= band ≤ `required_band` AND american AND NOT slang AND slur = 0 AND crude = 0) is computed in the SELECT — this is the single place spellingbee's slice of the shared list is defined. The two band parameters are the per-game `setup.required` / `setup.legal` choices, threaded in by the edge function (defaults 3 / 5).

It exists because the obvious-looking pattern — "fetch all legal words, filter the bitmask in JS" — silently truncates against PostgREST's `max_rows = 1000` cap. `common.words` has ~283k rows; the alphabetical first 1000 mostly start with `a` and don't represent the puzzle's candidate space at all, so `required_words_count` ends up below the ≥30 gate and the function returns 500. Pushing the filter into Postgres returns only the ~hundreds of actual candidates in one round-trip, well under any cap. (At spellingbee's selectivity it's a seq-scan-with-filter, ~15 ms — no index, the bitwise subset test isn't sargable anyway.)

### Play states

`common.games.play_state` carries spellingbee's lifecycle enum:

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

All `security definer`, granted only to `authenticated`, search_path pinned to `spellingbee, common, public, extensions`.

### `spellingbee.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text, board jsonb) → table(id uuid)`

Called only by the `spellingbee-build-board` edge function in practice (it builds the board and passes it in). The positional `mode text` parameter (between `player_user_ids` and `board`) routes the gametype string to `'spellingbee_coop'`/`'spellingbee_compete'` and lands on `spellingbee.games.mode` for RLS branching. Validates everything end-to-end:

- `mode` ∈ `{'coop', 'compete'}`. Compete enforces ≥2 players (`array_length(player_user_ids, 1) >= 2`).
- `setup.mode` is **rejected** if present (P0001) — catches a stale FE that didn't strip it after the sibling-manifest split.
- `setup.target_rank` is required iff `mode='compete'`; absent iff `mode='coop'`. Range 0..6.
- `setup.required` (the goal-words band) defaults to 3, range **2..6**; `setup.legal` (the accepted-words band) defaults to 5, range **required..6** (legal must contain required, else P0001). These are the bands the edge function already baked into the board via `candidate_words`; create_game re-checks them as a server-authoritative belt to the FE's `legalError` Start gate. (The board is already built, so this is a guard, not a re-selection.)
- `setup.timer` delegated to `common.validate_timer`.
- `board.outer_letters` is exactly 6 distinct lowercase ASCII letters excluding `s`; `board.center_letter` is one lowercase ASCII letter excluding `s` and not present in outer.
- `board.required_words_count ≥ 30` (mirrors the edge function's gate).
- `board.required_words` and `board.bonus_words` are arrays.

Builds the title (per the formula above), calls `common.create_game` with the `'spellingbee_<mode>'` gametype string, inserts the `spellingbee.games` detail row (with `mode` column), and seeds `common.update_state`. The seeded status shape differs by mode: coop carries `{found_words_score:0, required_words_score, rank_idx:0, found_words_count:0, required_words_count}`; compete carries `{target_rank, required_words_score, required_words_count, leaderboard:[]}` (numeric per-player fields land once the first `submit_word` runs).

### `spellingbee.submit_word(target_game uuid, word text, points int, is_pangram boolean, is_bonus boolean) → jsonb`

**Trusting-commit** (like boggle — both word-list games share the FE `useWordSubmit` engine). Because the full legal list (`required_words ∪ bonus_words`) ships to the FE at game start, the client validates + scores every guess LOCALLY and only commits accepted words. So the server **trusts** `word` + `points` + `is_pangram` + `is_bonus` and does NOT re-derive letters / center / min-length / dictionary membership — it just enforces the live-game check, dedups, records, and recomputes aggregates / the compete win. Returns `{ "result": <enum>, "points": int }` (the returned points echo what the FE sent, 0 for a server-side reject like a dup).

The FE-side validation happens in `useWordSubmit` + `lib/` before the commit fires, in the spellingbee-ws order (friendliest message wins when several things are wrong):

1. `tooShort` — length < `minWordLength` (4)
2. `badLetters` / `missingCenter` — the reject reason from the legal-list lookup miss (`explainReject`)
3. `notAWord` — not in the shipped `required ∪ bonus` list
4. `alreadyFound` — deduped against `foundWords` (+ the in-flight `pendingRef`) per mode rule (coop: any `(game_id, word)`; compete: `(game_id, user_id, word)`)
5. otherwise accepted: the FE reads `points` + `isPangram` + `isBonus` straight off the shipped list entry and sends them. `pangram` (all 7 letters) is a display flourish; bonus words **score normally** (length + pangram bonus, same as a required word).

Server-side on the trusted commit: inserts `found_words` row, recomputes team/player score, calls `common.update_state` (in coop, every accept; in compete, until the caller hits `target_rank`) or `common.end_game` (compete target-rank-hit only — coop never auto-terminates from `submit_word`). It re-checks the dedup under the row lock as a race backstop, and rejects a conceded caller.

`SELECT … FOR UPDATE` on `spellingbee.games` serializes concurrent submissions. The PK on `found_words` is `(game_id, user_id, word)` — a same-player double-submit is also caught at the constraint level.

### `spellingbee.submit_timeout(target_game uuid) → void`

Countdown-expiry handler. Calls `common.end_game(target_game, 'ended', {outcome:'timeout', ...}, player_results)`. Idempotent — second call raises `P0001 'game is not in progress'`, which the FE swallows.

**Realtime touch at the tail**: `update spellingbee.games set club_handle = club_handle where id = target_game`. `submit_timeout` would otherwise never write to any `spellingbee` table (no word was submitted; `common.end_game` only writes to `common.games`), so the FE's `useGame` subscription on `spellingbee.games` would never wake up to refetch and reveal the wordlists. The self-set writes a WAL entry that Realtime picks up. See the "realtime touch" notes in [`20260617000000_spellingbee.sql`](../../supabase/migrations/20260617000000_spellingbee.sql) for the bug history.

### `spellingbee.end_game(target_game uuid) → void`

The "End game" menu item fires this. Same shape as `submit_timeout` but with `status.outcome = 'manual'`. Any current game player can call it. **Coop only in practice** — compete shows Concede, not End (see below).

The Realtime-touch pattern repeats — see `submit_timeout` above. Tested via the `ctid` change in `gameplay_test.sql`.

### `spellingbee.concede(target_game uuid) → void`

The compete-mode counterpart to `end_game`: a per-player "I quit, the others keep racing". spellingbee has no per-player elimination (you're only ever done by winning — first to `target_rank` — or by conceding), so this is a **thin wrapper over `common.concede`** with a compete-only guard: it marks the caller out and ends the game as a collective loss only when the last racer drops. The FE shows `<ConcedeGameButton>` in compete and `<EndGameButton>` in coop; the OpponentStrip marks a conceder "out" mid-game and reads "Quit at \<rank\>" vs "Lost at \<rank\>" vs "Won at \<rank\>" at terminal (via `playerOutcome` over `ctx.players[].conceded`/`result`). Full mechanism: [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP: `concede_test.sql`.

### Helper functions

- **`spellingbee._rank_idx(score int, total int) → int`** — integer-math implementation of the rank ladder. Mirrors `currentRankIndex` in [`ranks.ts`](../../src/spellingbee/lib/ranks.ts); a Vitest assertion pins the two implementations together.
- **`spellingbee.candidate_words(puzzle_mask bigint, center_bit bigint, required_band int, legal_band int) → table(word text, letter_mask bigint, is_required boolean)`** — the bitmask-intersection lookup the edge function uses (see [Why a SQL helper](#why-a-sql-helper-for-candidate_words) above). The band args are the per-game `setup.required` / `setup.legal`.

## Edge function: `spellingbee-build-board`

[`supabase/functions/spellingbee-build-board/index.ts`](../../supabase/functions/spellingbee-build-board/index.ts) — the FE's `manifest.startGameInClub` invokes this. It runs as the caller (via the JWT in the Authorization header) for all PostgREST calls.

1. Reads `spellingbee.pangrams` in pages of 1000 (paginated to defeat `max_rows`); reads the club's most recent `spellingbee.games` row for the previous-board overlap cap.
2. Filters the pangram pool by overlap cap (≤4/7 letters shared with previous board).
3. Builds a weighted candidate array (rare-letter masks ×3).
4. Samples + applies ING dampening (1/3 accept on masks containing all of `{i, n, g}`).
5. Picks a center uniformly from the 7 letters.
6. Calls `spellingbee.candidate_words(puzzle_mask, center_bit, required_band, legal_band)` — passing the per-game `setup.required` / `setup.legal` (defaults 3 / 5) — and gets back the dictionary slice that fits this puzzle.
7. Computes points per required word (length + 10 if pangram), builds the `board` payload.
8. Calls `spellingbee.create_game(...)` over PostgREST — the RPC validates the board end-to-end and creates the game.
9. Returns `{ id }`.

The function logs one line per step in dev (`console.log` lands in `supabase functions serve` output), so when a board build fails the cause is on screen.

## Pangram seed import: `npm run spellingbee:import`

[`supabase/scripts/import-spellingbee-pangrams.ts`](../../supabase/scripts/import-spellingbee-pangrams.ts). It rebuilds `spellingbee.pangrams` from `common.words`: band-1 words seed the pangrams, and each seed's word-count is over the **required-FLOOR pool** (band ≤ 2, american, no slang, clean: slur 0 + crude 0 — the floor, so selection stays independent of the per-game `setup.required` choice). The word list itself is loaded separately by `npm run words:import` (see [common.md → The word list](../common.md#the-word-list-commonwords)) — **run that first**; this script reads what's already in the table.

**Script flow:**
1. Query `common.words` for the required-FLOOR pool's `(letter_mask, difficulty)`: `difficulty ≤ 2 AND american AND NOT slang AND slur = 0 AND crude = 0 AND len ≥ 4 AND no 's'` (band 2 = the floor; the per-game `setup.required` only adds words above it). (`letter_mask` is the table's generated column, so there's nothing to recompute.)
2. Candidate seeds = the band-1 subset (`difficulty = 1`) with exactly 7 distinct letters (`popcount(mask) = 7`) that satisfy `isValidPuzzleMask` (q→u when q is set, ≥2 vowels). Sourcing seeds from band 1 is what guarantees each board has a *common* pangram.
3. For each seed, count required-pool words whose mask is a subset (`wordMask & ~seedMask = 0`); keep seeds with ≥30. Tag `has_rare_letters`.
4. **Bulk-load `spellingbee.pangrams` via psql `COPY`** — `TRUNCATE` then insert, using [`lib/copyLoad.ts`](../../supabase/scripts/lib/copyLoad.ts). The TS does the mask/count computation; only the *load* is psql.

This currently yields ~2.1k seed rows.

**Reseed, not upsert.** The pangram pool is fully derived from `common.words`, so each run TRUNCATEs and reloads from scratch — there's nothing to preserve.

**Why COPY, not the REST API.** The loader connects directly to Postgres as the superuser and streams rows over one connection. This is what makes bulk loading to a *hosted* project fast (~1s) and reliable: the earlier supabase-js batch-upsert path choked on `TypeError: fetch failed` mid-import when the hosted API gateway closed reused keep-alive connections between batches.

**Connection:** `SUPABASE_DB_URL` (a Postgres connection string), defaulting to the local stack. Requires `psql` on PATH. The deploy script (`import-to-hosted.sh`) sets it to the hosted project's direct connection.

## Row-level security

| table | SELECT policy | INSERT/UPDATE/DELETE |
|---|---|---|
| `pangrams` | RLS off (public reference data) | INSERT only via the import script (`npm run spellingbee:import`) |
| `games` | `common.is_club_member(club_handle)` | None — writes go through `spellingbee.create_game` |
| `found_words` | Mode-aware via the denormalized `spellingbee.games.mode`: club-membership AND (`fg.mode='coop'` OR `found_words.user_id=auth.uid()` OR `cg.is_terminal`). Coop hits branch (a); compete mid-game hits branch (b); compete post-terminal opens via branch (c). | None — writes go through `spellingbee.submit_word` |

**Realtime publication**: `spellingbee.games` and `spellingbee.found_words` are in `supabase_realtime` so the FE's `useGame` can subscribe to in-game state.

## Frontend

### Folder layout

```
src/spellingbee/
  manifest.ts             TWO GameManifest entries (spellingbeeCoopGame + spellingbeeCompeteGame)
                          sharing the lazy-loaded PlayArea / SetupForm / Help. Per-mode
                          differences are the gametype string, name, numberOfPlayers,
                          startGameInClub's forwarded mode arg, setupForm.defaults
                          (compete seeds target_rank=5), and labelFor's vocabulary
                          (coop: "X/Y pts · Z/W words"; compete: "race to Amazing" /
                          "winner at Amazing" / "time up · no winner at Amazing" —
                          mode itself shown by the card's <ModePill>, not prefixed).
                          submitTimeout shared.
  db.ts                   export const db = supabase.schema('spellingbee')
  theme.css               --spellingbee-hex / --spellingbee-accent / feedback colors. Loaded
                          with this gametype's chunk via the PlayArea.tsx import.
  logo.svg                Bee glyph (copied from spellingbee-ws).

  components/
    PlayArea.tsx          The thin two-column coordinator on the shared scaffold (.boardCol /
                          .infoCol). **Decomposed** into BoardCol + InfoCol (no-op verified; no
                          history viewer — a WordList isn't chronological). PlayArea keeps the
                          word-entry ENGINE — the shared `useWordSubmit` (the typed word, the
                          `submit_word` dispatch, the sticky own-move feedback, a shared
                          <FeedbackPill> dismissed on the next move, no timer) — in the
                          coordinator, because its feedback channel is ALSO written by InfoCol's
                          End / Concede; it passes the entry primitives (word / setWord / submit /
                          localFeedback / …) DOWN to BoardCol (a thin-input game, like
                          boggle/connections). Wires the common useGlobalFeedback to the header slot
                          for peer/opponent events. buildOver branches mode → terminal verdict
                          copy. Mounts GameOverModal via useTerminalModal on the isTerminal flip.
    BoardCol.tsx          The board column: the honeycomb <Letters> + a floating Shuffle over its
                          top-right + the below-board <EntryRow> (the typed-word input + capture
                          keyboard, whose <EntryBox> renders the per-character illegal-letter dim
                          via <TypedWord>). Owns the local outer-letter shuffle (per-player,
                          view-only, never persisted), a letter-click appending to the word, and
                          the Space=shuffle capture extra key (letters stored uppercase;
                          ArrowUp=recall / ArrowDown=clear are the shared built-ins).
    InfoCol.tsx           The info column: near-zero state, arranging the shared readouts in the
                          fixed order — RankBar + Stats (the "state" unit) lead, then — compete
                          only — the OpponentStrip (rank), then the action row (End / Concede),
                          then the Setup disclosure; the found-words WordList fills the rest.
                          Every mutation is a named callback up; PlayArea owns the RPCs.
    PlayArea.module.css   Per-game bits only (layout vars, hex board sizing, the below-board
                          slot). The two-column shell + readout classes are the shared
                          common/components/game/PlayArea.module.css. Desktop-first, no @media
                          reflow — per ui.md.
    Letters.tsx           The 7-hex honeycomb, rendered as .board > .grid (the board-column
                          convention — no tray; the hexes carry their own shape). Render
                          order: center → top → upper-right → lower-right → bottom →
                          lower-left → upper-left. Position via nth-child rules in
                          Letters.module.css.
    Letters.module.css    `clip-path: polygon(...)` flat-top hexes, absolute positioning,
                          per-position nth-child rules — the ~/spellingbee-ws §7 layout, but
                          RE-BASED to the flower's own top-left so .grid hugs its real
                          256×267 box and sits FLUSH at the top of the column (the source's
                          320×320 square left a ~37-unit blank band up top). Scales via `--u`
                          (set on .boardCol); hex shapes + relative positions unchanged.
    Letter.tsx            Single hex. onMouseDown preventDefault so a click doesn't steal
                          focus from the keyboard-handler attachment point.
    TypedWord.tsx         The current typed word, rendered as the children INSIDE the shared
                          <EntryBox> (which owns the box + blinking caret + placeholder).
                          One <span> per character so illegal letters (not in the puzzle's
                          allowed set) dim individually. No <input> — typing is captured by
                          useCaptureKeys in PlayArea.
                          (The Delete / Shuffle / Enter controls are no longer a per-game
                          Actions.tsx: they're the shared semantic buttons —
                          <DeleteButton> + <SubmitButton> flanking the EntryBox in the input
                          row, and a floating <ShuffleButton> over the board's top-right.)
                          (The own-move result pill is no longer a per-game Feedback.tsx:
                          it's the shared GenericFeedbackPill, sticky, rendered in the below-board
                          .localFeedback slot. success / warning / error are all in the common
                          FeedbackTone now, so the surface needs no game-specific tone type.
                          Peer/opponent events still go to the HEADER slot via the common
                          useGlobalFeedback — two distinct LOCATIONS for the same shared pill component.)
    RankBar.tsx           7 dots from Start to Genius, filled up to the current rank.
                          Per-dot hover tooltip with rank name + points threshold.
    Stats.tsx             2-cell grid: Score / Words. Tabular-nums so the digits
                          don't shift width as the score climbs. (Timer lives in
                          the GamePage header, not here.)
    (WordList)            The found-words list is now the SHARED
                          common/components/game/lists/WordList (used by spellingbee + boggle, so the
                          list looks identical across games). PlayArea builds its rows via
                          lib/displayRows.buildDisplayRows(foundWords, game.requiredWords)
                          and passes `reveal`. Per-finder color, pangram bold, bonus dot,
                          5s recently-found underline (the now-shared common/hooks/
                          useRecentlyFound), and the post-terminal grey reveal all live in
                          the common component. In compete the foundWords input is already
                          caller-only (RLS hides peers' rows mid-game).
    SetupForm.tsx         The setup dialog body (lazy-loaded inside the common
                          SetupGameDialog wrapper). Reads `mode` from SetupBodyProps
                          (fed by the sibling-manifest's GameManifest.mode). Coop:
                          short paragraph + shared <TimerField>. Compete: adds a
                          target-rank radio (Solid..Genius, default Amazing) above
                          the timer. Both modes: a "Word difficulty" fieldset with
                          two shared <DifficultyField>s (Required words: band 2..6;
                          Legal/bonus words: band required..6) — the manifest's
                          `validate: legalError` gates Start until legal ≥
                          required. Custom-letters fields still deferred.
    Help.tsx              Rules modal mounted from the common menu's Help item. Built on
                          the shared <FloatingPanel>. Implements the manifest's
                          help: ComponentType<{ onClose }> contract.

  hooks/
    useGame.ts            Per-gametype data hook. Pattern A (useRealtimeRefetch) with a
                          two-table subscription on spellingbee.{games, found_words}. Reads
                          from games_state so the post-terminal wordlist reveal Just Works
                          on the next refetch.
                          (Keyboard capture is the SHARED common/hooks/input/useCaptureKeys, called
                          from PlayArea — no longer a spellingbee-local hook.)
                          (useRecentlyFound is now SHARED: common/hooks/game/useRecentlyFound,
                          used inside the common WordList — no longer a spellingbee-local
                          hook. Tracks freshly-arrived words, each "recent" for 5s via
                          per-word setTimeouts in a ref, NOT effect cleanup.)
                          (Peer HEADER narration is now the SHARED
                          common/hooks/feedback/useGlobalFeedback, called from PlayArea — no
                          longer a spellingbee-local usePeerFeedback hook. It fires header pills
                          for other players' activity — the complement to the below-board
                          own-move pill. coop: a peer found a good/pangram word (found_words is
                          club-wide). compete: an opponent climbed a rank (RLS-hidden words, but
                          rank rides status.leaderboard). Each names the player with a leading
                          color disc; both bootstrap on the first loaded render so a reconnect
                          doesn't replay a backlog; self-activity is excluded.)

  lib/
    setup.ts              SpellingbeeSetup type (timer / target_rank? / custom_letters? /
                          custom_center?) + DEFAULT_SPELLINGBEE_SETUP_COOP +
                          DEFAULT_SPELLINGBEE_SETUP_COMPETE (compete seeds target_rank=5).
                          Mode is NOT on this type — it's locked at the gametype level.
    ranks.ts              Port of ~/spellingbee-ws/shared/ranks.js: RANKS, GENIUS_AT,
                          rankThreshold, rankPoints, currentRankIndex. Mirrored on the SQL
                          side by spellingbee._rank_idx (different numeric form, same answer
                          — Vitest verifies agreement at every score / total).
    letterMask.ts         26-bit letter mask helpers (letterMask, popcount26, isSubsetMask).
                          Used by TypedWord for per-character illegal-letter dimming.
    pangram.ts            isPangram (popcount26(letterMask(w)) === 7). UI cue only;
                          authority on "real" required pangrams is the server's
                          required_words.is_pangram flag.
    leaderboard.ts        LeaderboardEntry type + readLeaderboard(status): the compete
                          rank payload off common.games.status. Shared by the
                          OpponentStrip and the common useGlobalFeedback.
```

### Routes & shell

Standard PuzPuzPuz route: `/g/spellingbee_coop/<gameId>` or `/g/spellingbee_compete/<gameId>` (the gametype URL segment is the sibling-manifest's full string, not the `baseGametype`). Mounted by `App.tsx` via `<GamePage>` with `spellingbee`'s shared `PlayArea` as the render-prop child. `GamePage` owns the cross-cutting chrome (header / timer / pause overlay / chat / Back-to-club / common menu items). `PlayArea` owns everything per-game, including the `<GameOverModal>` itself — same pattern as connections / psychicnum / codenamesduet, since the verdict copy needs game-specific context.

### State flow for one submission

1. User types or clicks letters → `PlayArea` updates `word` state.
2. User hits Enter → `handleSubmit` calls `db.rpc('submit_word', {target_game, word})`.
3. RPC validates, inserts a `found_words` row, updates `common.games.status`, possibly fires the terminal flip.
4. Realtime UPDATE event on `spellingbee.found_words` reaches `useGame`'s `useRealtimeRefetch`; `load()` re-reads `games_state` + `found_words`.
5. `setGame({...})` + `setFoundWords(...)` re-render `PlayArea`.
6. The submission's `{ result, points }` drives the feedback pill — the `result` enum (`'pangram'` / `'accepted'` / `'bonus'` / `'tooShort'` / …) picks the tone + copy, and `points` appends "+Npts" for results that scored.
7. `useRecentlyFound` flags the new word as recent for 5s → `<WordList>` underlines it in the finder's color.

### "End game" menu wiring

[`useEffect(syncMenuItems)`](../../src/spellingbee/components/PlayArea.tsx) registers a single per-game menu item via `ctx.menu.setGameItems([{id, label, onClick, disabled}])`. Click → `window.confirm()` → `db.rpc('end_game', ...)`. The menu item is disabled when `isTerminal=true`. Cleanup on PlayArea unmount restores the empty per-game section.

### Terminal experience

When `isTerminal` flips true:
1. `useTerminalModal` opens the `<GameOverModal>` (won/lost color + verdict line + Back-to-club).
2. The below-board slot swaps the input row for a **permanent fill `<FeedbackPill>`** (outcome-colored) carrying `"Game over — <indicator copy>"`. Per the v3 rule, the terminal state shows in BOTH places — this local pill *and* the info-column action row's bold outcome line + compact Back-to-club button (the Back-to-club button is in the action row, not the below-board slot).
3. The input row's Delete + Submit buttons disable; the floating Shuffle stays clickable.
4. `game.requiredWords` is already present (both word lists ship from game start — see [The word lists ship to the FE](#the-word-lists-ship-to-the-fe-not-hidden)); the terminal reveal is the client-side `required − found`, no refetch needed.
5. `<WordList revealWords={game.requiredWords}>` merges the unfound required words into the alphabetical render as gray rows.

The verdict copy is computed by `buildOver({mode, playState, status, targetRankIdx, ...})`:

A rank embedded mid-sentence is wrapped by the `rankLabel` helper as `rank "<name>"` — a bare ladder word ("Stopped at Start") reads like a typo. The one exception is the standalone **"Genius!"** win, which keeps the bare iconic word (it's the celebratory exclamation, not embedded mid-sentence).

**Coop**:
- `rank >= 6` (Genius) → `outcome='won'`, verdict `"Genius! N/M points."`
- `rank < 6` → `outcome='won'`, verdict `'Stopped at rank "<name>" — N/M points.'` (covers both timeout and manual end since the player knows which one happened)

**Compete** (uses `targetRankIdx` read from `setup.target_rank` — the canonical, immutable source — not from `status.target_rank` which `submit_timeout`/`end_game` don't re-emit on terminal):
- `playState='won_compete'` + caller is winner → `outcome='won'`, verdict `'You won the race — reached rank "<name>"!'`
- `playState='won_compete'` + caller is NOT winner → `outcome='lost'`, verdict `'<winner-name> beat you to rank "<name>".'`
- `playState='ended'` + `outcome='timeout'` → `outcome='lost'`, verdict `'Time's up — no winner at rank "<name>".'`
- `playState='ended'` + `outcome='manual'` → `outcome='lost'`, verdict `'Game ended — no winner at rank "<name>".'`

### Realtime channels

| channel | who opens it | what rides on it |
|---|---|---|
| `game:${gameId}` (stable) | `useCommonGame` | Presence + manual-pause Broadcast + suspend Broadcast + postgres-changes on `common.games`. The compete OpponentStrip rides this channel — `submit_word` writes the updated `status.leaderboard` to `common.games.status`, which propagates here, and `useCommonGame` surfaces it through `GamePageCtx.status` to the PlayArea. |
| `spellingbee:${gameId}:${uuid}` | `useRealtimeRefetch` inside `useGame` | postgres-changes on `spellingbee.{games, found_words}`. UUID-suffixed because there's no peer-coordination state here — each tab gets its own room. |

See [`code-conventions.md` → Realtime data hooks](../code-conventions.md#realtime-data-hooks--two-patterns) for the pattern catalogue.

### Code-splitting

Same pattern as the other gametypes — the manifest's `PlayArea`, `setupForm.Component`, and `help` are all `React.lazy`. Three chunks ship under spellingbee; users who only play other games never download them.

## Tests

### pgTAP

| file | covers |
|---|---|
| `tests/spellingbee/schema_test.sql` | Both gametype rows registered, public reference reads, column-grant blocks SELECT of hidden columns, view exposes them conditionally pre/post-terminal. |
| `tests/spellingbee/rls_test.sql` | Coop branch (everyone sees all in club); outsider sees nothing; INSERT-grant rejections; compete-mode mid-game narrowing (only own rows); compete post-terminal opens reveal. |
| `tests/spellingbee/create_game_test.sql` | Auth, membership, coop + compete happy paths, gametype-string routing, mode arg validation, setup.mode rejected if present (loud catch for stale FE), target_rank-iff-compete + range + coop-must-omit, compete ≥2-player floor, word-difficulty band validation (required 2..6, legal required..6, plus an explicit non-default required=4/legal=6 happy path), board structure validation, title formula, per-mode status seeding. |
| `tests/spellingbee/gameplay_test.sql` | Coop `submit_word` result-enum branches incl. pangram +10 bonus (required AND bonus paths), bonus-words-score-normally assertions, soft-reject "no row inserted" check, coop duplicate semantics, coop-has-no-auto-terminal sanity (play_state stays 'playing' past required_words_count; score overshoots required_words_score; rank clamps at Genius), `submit_timeout` (ctid touch + idempotency + post-terminal games_state reveal), `spellingbee.end_game` (ctid touch, status.outcome='manual', auth, idempotency). |
| `tests/spellingbee/compete_test.sql` | Per-player duplicate rule (bea can re-find ada's word; ada can't re-find her own), mid-game leaderboard shape, first-to-target → won_compete (winner_user_id, {won:true}/{won:false} per-player results, opponents can't submit post-win), submit_timeout in compete (no winner, all {won:false}), end_game in compete (no winner, outcome=manual), RLS branches (a / b / c) per mode + terminal state. |

### Per-test fixtures

`tests/spellingbee/setup.psql` provides:
- `pg_temp.spellingbee_board()` — a valid 30-required-word + 3-bonus board jsonb. Letters: outer `'abcdfg'`, center `'e'`. Includes a synthetic 7-letter required pangram (`'abcdefg'`) for the required-pangram +10 path AND a synthetic 7-letter bonus pangram (`'gfedcba'`) for the bonus-pangram +10 path. Total: 50 required points across 30 words.
- `pg_temp.spellingbee_setup()` — no-timer setup blob (mode is now an RPC arg, not a setup field). Tests override timer / target_rank via `|| jsonb_build_object(...)` and pass `'coop'`/`'compete'` as the 4th positional arg to `spellingbee.create_game`.

### FE Vitest

| file | covers |
|---|---|
| `src/spellingbee/lib/ranks.test.ts` | Rank ladder boundary cases; integer-math agreement with `spellingbee._rank_idx`. |
| `src/spellingbee/lib/pangram.test.ts` | `isPangram` boundary cases (6/7/8 distinct, case-insensitive). |
| `src/spellingbee/lib/letterMask.test.ts` | `letterMask` round-trips, `popcount26`, `isSubsetMask`. |
| `src/spellingbee/lib/displayRows.test.ts` | Found-word dedup to the first finder, found-shadows-reveal, alphabetical merge → shared `WordListRow`s. |
| `src/common/hooks/game/useRecentlyFound.test.ts` | (shared) Initial-quiet, fresh-arrival, 5s expiry, staggered expiry per word, no-op rerender idempotency. |

## File locations

| asking… | look at… |
|---|---|
| Everything server-side — schema, column grants, RLS, the `games_state` view, `candidate_words`, the RPCs (`create_game` / `submit_word` / `submit_timeout` / `end_game`), `_rank_idx`, the `submit_timeout` Realtime-touch, the `mode` column + mode-aware RLS, and the `spellingbee_coop`/`spellingbee_compete` gametype rows | [`supabase/migrations/20260617000000_spellingbee.sql`](../../supabase/migrations/20260617000000_spellingbee.sql) |
| Compete-specific FE rendering (OpponentStrip, mode-aware buildOver) | [`src/spellingbee/components/PlayArea.tsx`](../../src/spellingbee/components/PlayArea.tsx) |
| Target-rank picker + word-difficulty (required/legal band) fields in the setup dialog | [`src/spellingbee/components/SetupForm.tsx`](../../src/spellingbee/components/SetupForm.tsx); the shared dropdown is [`src/common/components/fields/DifficultyField.tsx`](../../src/common/components/fields/DifficultyField.tsx); the `legal ≥ required` Start gate is `legalError` in [`src/spellingbee/lib/setup.ts`](../../src/spellingbee/lib/setup.ts) |
| How the word list is populated | `common.words` via [`supabase/scripts/import-words.ts`](../../supabase/scripts/import-words.ts) (read live from `~/src/gamelist/words.tsv`) — see [common.md](../common.md#the-word-list-commonwords) |
| How the pangram seed pool is built | [`supabase/scripts/import-spellingbee-pangrams.ts`](../../supabase/scripts/import-spellingbee-pangrams.ts) (derives `spellingbee.pangrams` from `common.words`) |
| The board-builder edge function | [`supabase/functions/spellingbee-build-board/index.ts`](../../supabase/functions/spellingbee-build-board/index.ts) |
| The play surface | [`src/spellingbee/components/PlayArea.tsx`](../../src/spellingbee/components/PlayArea.tsx) |
| The honeycomb layout (CSS lifted from spellingbee-ws) | [`src/spellingbee/components/Letters.module.css`](../../src/spellingbee/components/Letters.module.css) |
| The rank ladder math | [`src/spellingbee/lib/ranks.ts`](../../src/spellingbee/lib/ranks.ts) |
| The found-words list | the SHARED [`src/common/components/game/lists/WordList.tsx`](../../src/common/components/game/lists/WordList.tsx) (spellingbee builds its rows via [`src/spellingbee/lib/displayRows.ts`](../../src/spellingbee/lib/displayRows.ts)) |
| The per-gametype data hook | [`src/spellingbee/hooks/useGame.ts`](../../src/spellingbee/hooks/useGame.ts) |

## Printing the board (PDF)

spellingbee joins the printable games — a **"Print board (PDF)"** GamePage menu item that
hands you a paper record of the puzzle. It shows the 7-hex honeycomb (the flower) above the
found-words list (pangrams bold, bonus finds dotted; missed required words fold in at
terminal) — `src/spellingbee/pdf/printSpellingbeePdf.ts`. The shared clean-printable design
language + helpers live in [docs/pdf.md](../pdf.md).

## Open / deferred

Tracked in [`deferred.md`](../deferred.md) → spellingbee. Today's open items:

- **Custom-letters puzzle** — edge-function parameter unused; setup-form field absent.
- ~~**Per-player attribution in the post-terminal reveal**~~ **DONE.** Post-terminal, every found word keeps its **finder's** color (a word more than one player found goes to the first finder by `found_at`); only the never-found required words go grey. (Earlier this merged peers' finds and missed words into one muted "everything that isn't mine" bucket.) A per-player leaderboard panel is still possible on top, but the attribution itself now ships.
