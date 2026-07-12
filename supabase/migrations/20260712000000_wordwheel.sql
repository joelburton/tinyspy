-- ============================================================
-- wordwheel — Guardian-Word-Wheel-style word finder (MooseWheel)
-- ============================================================
--
-- A wheel of NINE distinct letters (1 centre + 8 outer); players
-- form words from those letters, EACH TILE USED ONCE (the key
-- difference from spellingbee, which allows letter reuse), and every
-- word must include the centre. The pangram — a word using all nine —
-- earns a +15 bonus. The word list is common.words (the categorized
-- master list shared across games); wordwheel filters it into a
-- smaller REQUIRED set (the goal shown to players: difficulty band
-- <= 3, american, no slang, no slurs) and a larger LEGAL set (band
-- <= 5, the acceptance bar). Words in legal but not required are
-- BONUS: accepted and scored, but not part of the displayed goal.
--
-- This is a targeted FORK of spellingbee (see spellingbee.sql +
-- docs/games/wordwheel-plan.md). The "used once" rule lives entirely
-- in the board builder (which words ship) + the FE's membership check
-- — submit_word here TRUSTS the shipped list, exactly as spellingbee
-- does. So most of this file is a rename-port; the real changes are:
-- 8 outer letters (char(8)), the difficulty-tagged pangrams seed
-- table (above), and the +15 pangram bonus (in the edge builder).
--
-- "wordwheel" is the codename; the brand is MooseWheel (FE only). SQL
-- / TypeScript / folder names are all `wordwheel`.
--
-- This file is the squashed, build-from-scratch form of the
-- wordwheel schema: the full final state (schema, RLS, the
-- FE-shipped word lists, RPCs) with coop + compete shipped as a
-- sibling-manifest pair (`wordwheel_coop` + `wordwheel_compete`
-- gametypes, a denormalized `mode` column on wordwheel.games, and a
-- `mode` arg on create_game). Same pattern psychicnum and connections
-- follow.
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- validate_timer). Per the removability invariant in
-- docs/common.md, common MUST NOT reference wordwheel back.
--
-- See docs/games/wordwheel.md for the full feature picture and the
-- rules-of-the-game spec.

-- ============================================================
-- Schema + usage grants
-- ============================================================

create schema if not exists wordwheel;
grant usage on schema wordwheel to authenticated;

-- The pangram import (supabase/scripts/import-wordwheel-pangrams.ts)
-- connects as the superuser (bypasses grants), so service_role only
-- needs schema USAGE for any incidental PostgREST access.
grant usage on schema wordwheel to service_role;

-- ============================================================
-- The word reference lives in common.words
-- ============================================================
-- wordwheel's word reference is the shared common.words master list,
-- not a wordwheel table — every word game filters the same
-- categorized source. wordwheel's slice is computed on the fly in
-- wordwheel.candidate_words (below): legal = difficulty <= 5,
-- required = difficulty <= 3 AND american AND NOT slang AND clean
-- (slur = 0 AND crude = 0), len >= 4. The `letter_mask & ~puzzle_mask = 0` subset
-- test (every letter of the word is in the puzzle) reads the
-- generated common.words.letter_mask column — same bit convention.
--
-- No wordwheel-specific index on common.words: the candidate_words
-- filter (difficulty/dialect/len) selects ~a third of the table, a
-- selectivity at which Postgres prefers a seq-scan-with-filter over
-- a btree anyway (the bitwise subset test isn't sargable). It runs
-- in tens of ms, a handful of times per board build. See
-- candidate_words for the measured rationale.

-- ============================================================
-- wordwheel.pangrams — the board-seed pool
-- ============================================================
-- A valid wordwheel board is a set of NINE distinct letters that
-- contains a pangram — a word using all nine, each once (the wheel's
-- own "target" word). Random 9-letter sets almost never have such a
-- word, so — like spellingbee — we seed from KNOWN nine-letter
-- isograms (all-distinct-letter words) rather than reject-loop.
--
-- The import scans common.words for every 9-letter isogram
-- (len == popcount(letter_mask)), dedupes by letter-mask (anagrams
-- share a mask ⇒ one board), and stores each mask here.
--
-- WHERE THIS DIFFERS FROM spellingbee: spellingbee forces a BAND-1
-- pangram so it's always gettable, which leaves word wheel only ~400
-- nine-letter isograms — too few. Instead we tag each seed with its
-- `difficulty` (the min difficulty band of any isogram with this
-- mask) and let the builder pick a seed matching the game's REQUIRED
-- band (difficulty <= required_band). Harder games draw from a larger
-- pool; the pangram stays gettable at the chosen difficulty.
--
-- `word_counts` is a read-only precompute: a 6-element jsonb array
-- [n1..n6] where nk = the number of REQUIRED-quality words (american,
-- not slang, slur 0, crude 0) at difficulty EXACTLY band k that are
-- findable on this wheel — CENTRE-AGNOSTIC (every all-distinct
-- sub-word of the nine letters, len >= 4; a real board fixes one
-- centre, so this slightly over-counts, but it's a richness proxy).
-- A future "board must have >= N words" gate can filter seeds on this
-- with no build-time rescan. See import-wordwheel-pangrams.ts +
-- docs/games/wordwheel-plan.md.
--
-- has_rare_letters drives the "diverse" builder's weighting: masks
-- containing any of {j, q, x, z} (very rare) or {k, v, w, y}
-- (somewhat rare) get duplicated in the sampler so rare letters get
-- fair representation. Precomputed once at import time.

create table wordwheel.pangrams (
  mask             bigint primary key,   -- 9 bits set; the wheel's letter set
  difficulty       int not null,         -- min difficulty band of a 9-letter isogram with this mask
  word_counts      jsonb not null,       -- [n1..n6]: required words findable at each band (centre-agnostic)
  has_rare_letters boolean not null      -- weighting tier for the diverse builder
);

create index wordwheel_pangrams_difficulty_idx on wordwheel.pangrams (difficulty);

-- wordwheel.pangrams: public reference data, no RLS. The edge
-- function samples seeds as the caller (authenticated SELECT). The
-- pangram import connects as the superuser and bypasses grants, so
-- no service_role INSERT is needed.
grant select on wordwheel.pangrams to authenticated;

-- ============================================================
-- wordwheel.games — one row per playthrough
-- ============================================================
-- `id` is FK to `common.games(id)` — the canonical id is
-- generated by `common.create_game` and passed in.
-- ON DELETE CASCADE means a row here goes away if its
-- common.games parent is deleted (e.g., gametype unregistered).
--
-- club_handle is denormalized from common.games.club_handle so the RLS
-- policy can `is_club_member(club_handle)` without a join. Safe —
-- club_handle is set at create-game time and never changes.
--
-- `mode` is the sibling-manifest mode axis ('coop' | 'compete'),
-- denormalized onto the gametype row so submit_word / submit_timeout
-- / end_game and the found_words RLS policy can read it with a
-- single-table query instead of digging into common.games.setup.
-- Same shape as psychicnum.games.mode and connections.games.mode.
--
-- ───────────────────────────────────────────────────────────
-- The word lists ship to the FE (not hidden)
-- ───────────────────────────────────────────────────────────
-- `required_words` and `bonus_words` are the board's answer key,
-- and they ship to the FE from game start. The FE validates +
-- scores every guess against required ∪ bonus locally (via the
-- shared `useWordSubmit` hook) and submits trusting-commit, the
-- same model as boggle. The trust model doesn't withhold them
-- (friends, not anti-cheat), so there's no column-grant gate and
-- no terminal-reveal helper: the FE reads both lists straight off
-- `games_state`, and the missed-words reveal is a client-side
-- `required − found` computed at terminal (bonus words are never
-- shown in the reveal, but that's a FE display choice, not a gate).
-- See docs/games/wordwheel.md.

create table wordwheel.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- 8 distinct lowercase outer letters, no order significance
  -- on the SQL side (the FE shuffles for display). char(8) is
  -- a width assertion — wider/narrower strings raise a type
  -- error at insert time, catching bad input early.
  outer_letters char(8) not null,
  -- The mandatory center letter (the red centre circle). Single
  -- lowercase character.
  center_letter char(1) not null,
  -- Cached at create-game time from the wordlists. Pure
  -- function of the puzzle so we could recompute, but caching
  -- means submit_word doesn't need to scan the word list on
  -- every guess to recompute "the max."
  required_words_score int not null,
  required_words_count int not null,             -- count of required words
  -- ─── The two word lists shipped to the FE ────────────────
  -- Both jsonb arrays of { "word": text, "points": int, "is_pangram": bool }.
  -- The FE validates + scores a guess against required ∪ bonus locally (no server
  -- round-trip), so both carry points + the pangram flag. Built by the edge
  -- function (via candidate_words over common.words) and handed to create_game.
  --   required_words: the displayed goal set (drives the rank ladder + the
  --     missed-words reveal, which is required-only).
  --   bonus_words: the legal − required set (accepted + scored, not the goal).
  -- Neither is hidden — the trust model doesn't withhold them (friends, not
  -- anti-cheat); see docs/games/wordwheel.md.
  required_words jsonb not null,
  bonus_words jsonb not null,
  created_at timestamptz not null default now(),
  -- Sibling-manifest mode axis. CHECK constrains it to the two
  -- valid values; the gametype string ('wordwheel_coop' /
  -- 'wordwheel_compete') and this column agree by construction in
  -- create_game.
  mode text not null check (mode in ('coop', 'compete'))
);

create index wordwheel_games_club_handle_idx on wordwheel.games (club_handle);

-- Column-level grant. The word lists are no longer hidden (the FE needs them to
-- validate guesses locally), so all columns are readable — but we keep the
-- explicit column list per docs/code-conventions.md → "Avoid SELECT *". `mode` is
-- included so the games_state view's `g.mode` and the found_words_select RLS
-- policy's `fg.mode` resolve for `authenticated` (both run in the caller's context).
grant select
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, created_at,
   required_words, bonus_words)
  on wordwheel.games to authenticated;

-- ============================================================
-- wordwheel.found_words — append-only log of accepted submissions
-- ============================================================
-- One row per (player, word). Carrying user_id from day one
-- (even though co-op treats the team as the unit) makes compete
-- mode a non-event: in compete each player independently finds
-- words, and the RLS policy below already narrows by user_id
-- during play.
--
-- PK is the triple (game_id, user_id, word). This shape:
--   - In coop: submit_word checks "does any row exist with
--     this game_id and word" before insert — if yes, reject
--     as alreadyFound; if no, insert with caller's user_id
--     as the finder.
--   - In compete: submit_word only checks
--     "(game_id, caller_user_id, word)" — two different
--     players can claim the same word independently.
--
-- The mode branching lives in submit_word; the PK supports both
-- shapes without a schema change.

create table wordwheel.found_words (
  game_id    uuid not null
    references wordwheel.games(id) on delete cascade,
  user_id    uuid not null
    references common.profiles(user_id) on delete cascade,
  word       text not null,
  points     int not null,               -- length-based (+15 pangram); bonus words score too
  is_pangram boolean not null,
  is_bonus   boolean not null,           -- in the bonus set (legal − required); shown with a dot
  found_at   timestamptz not null default now(),
  primary key (game_id, user_id, word)
);

create index wordwheel_found_words_game_id_idx
  on wordwheel.found_words (game_id);

grant select on wordwheel.found_words to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table wordwheel.games enable row level security;
alter table wordwheel.found_words enable row level security;

-- Membership-gated read on games. Co-op + compete behave
-- identically here: anyone in the club can see the game's
-- header (letters, totals, etc.). The wordlists are gated
-- separately at the column level + games_state view.
create policy games_select on wordwheel.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- found_words RLS is the load-bearing piece for compete. Reads
-- the mode off wordwheel.games.mode directly (denormalized), so
-- the visibility check is a single join to common.games for the
-- is_terminal branch rather than digging into setup. Three OR
-- branches inside the EXISTS, in evaluation order:
--
--   (1) mode='coop' — everyone in the club sees everyone's
--       finds.
--   (2) user_id = auth.uid() — you always see your own finds.
--       In compete mid-game, this is your private list.
--   (3) is_terminal — once the game ends, everyone sees
--       everyone's finds (the "what I missed" reveal in
--       compete; harmless in coop since (1) already covered it).
--
-- Club membership is the outer gate; the mode/visibility
-- discrimination is the inner condition. Mirrors the
-- connections.guesses_select shape.
create policy found_words_select on wordwheel.found_words
  for select to authenticated
  using (
    exists (
      select 1 from wordwheel.games fg
       join common.games cg on cg.id = fg.id
       where fg.id = found_words.game_id
         and common.is_club_member(fg.club_handle)
         and (
               fg.mode = 'coop'
            or found_words.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the
-- security-definer RPCs below.

-- ============================================================
-- games_state view
-- ============================================================
-- The FE's read path for a wordwheel game header. `security_invoker = true` so
-- RLS on the base table evaluates as the caller (games_select still gates row
-- visibility). The word lists are no longer hidden — required_words + bonus_words
-- ship to the FE from game start so it can validate + score guesses locally — so
-- the view exposes both directly (no terminal-gated reveal helper anymore; the
-- missed-words reveal is a client-side `required − found` computed at terminal).

create view wordwheel.games_state with (security_invoker = true) as
select
  g.id,
  g.club_handle,
  g.mode,
  g.outer_letters,
  g.center_letter,
  g.required_words_score,
  g.required_words_count,
  g.created_at,
  g.required_words,
  g.bonus_words
  from wordwheel.games g;

grant select on wordwheel.games_state to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Only found_words is published: it's the sole thing that changes during play
-- (every accepted submission appends a row that peers' useGame hooks refetch on).
-- wordwheel.games is immutable for the life of the game — the header + word
-- lists never change and the terminal flip lives on common.games (already
-- published, and the FE's isTerminal flows from there) — so useGame loads it
-- once and there's nothing to subscribe to.

alter publication supabase_realtime add table wordwheel.found_words;

-- ============================================================
-- Register wordwheel with common.gametypes
-- ============================================================
-- Sibling-manifest pair: coop and compete are two distinct
-- gametype rows sharing this one schema. create_club seeds new
-- clubs with both; create_game routes to one via the mode arg.

insert into common.gametypes (gametype, min_players) values
  ('wordwheel_coop', 1),
  ('wordwheel_compete', 2)
on conflict do nothing;

-- ============================================================
-- _rank_idx — the rank ladder (0..6) as integer math
-- ============================================================
-- 7 named ranks: Start(0), Good(1), Solid(2), Nice(3), Great(4),
-- Amazing(5), Genius(6). Each one unlocks at i/6 * 0.70 of the
-- max score; Genius at 70%. The formula:
--
--   threshold_i = i / 6 * 0.7
--   rank(score, total) = max i such that score >= threshold_i * total
--                      = floor(score * 6 / (total * 0.7))
--                      = floor(score * 60 / (total * 7))      (×100/×100 to remove the decimal)
--
-- LEAST(6, ...) caps the result — a 100%-of-max score yields
-- score*60/(total*7) ≈ 8.57, so we clamp.
--
-- Why integer math: avoiding floating point makes the result
-- bit-for-bit reproducible across implementations (the FE port
-- of this in ranks.ts uses the same expression). Numerical
-- correctness, not performance — the savings here are
-- nanoseconds, but the determinism matters.

create function wordwheel._rank_idx(score int, total int)
returns int
language sql
immutable
set search_path = wordwheel, common, public, extensions
as $$
  select case
           when total <= 0 then 0
           else least(6, (score * 60) / (total * 7))
         end;
$$;

revoke execute on function wordwheel._rank_idx(int, int) from public;
grant execute on function wordwheel._rank_idx(int, int) to authenticated;

-- ============================================================
-- wordwheel.candidate_words — edge-function board-build helper
-- ============================================================
--
-- Reason this exists: the edge function's "given a puzzle,
-- return every legal word that fits" query was being silently
-- truncated by PostgREST's `max_rows = 1000` cap when run against
-- the table directly. The fix: push the bitmask intersection into
-- Postgres via this small SQL function. It does the filter
-- server-side and returns only the candidate rows (typically a few
-- hundred, well under max_rows); the edge function reads back
-- through supabase.rpc(...) in one round-trip.
--
-- This is also where wordwheel's slice of the shared common.words
-- list is defined, on the 1..6 recognizability bands. Both bands are now a
-- per-game setup choice (`required` 1..6, `legal` required..6), threaded in by
-- the edge function:
--   - legal      difficulty <= legal_band  (returned at all = enterable). No
--                dialect / slang / crude / slur restriction — anything up
--                to the legal band counts if you play it.
--   - required   difficulty <= required_band AND american AND NOT slang AND
--                clean (slur = 0 AND crude = 0) — the is_required flag; counts
--                toward the displayed goal + rank denominator. Crude/slur
--                words are legal but never required. Words that are legal
--                but not required (above the required band, or band <=required
--                that's non-american / slang / crude / a slur) come back as
--                BONUS (is_required false): legal − required. Bonus words
--                still SCORE (length + pangram bonus); they just don't
--                count toward the required goal.
--   - length     len >= 4  (the Spelling-Bee minimum)
--
-- Unlike spellingbee, wordwheel does NOT special-case 's': each tile
-- is used ONCE per word, so 's' can't pluralize explosively the way it
-- does when letters may repeat. A board can contain 's', and 's'-words
-- are ordinary candidates — no exclusion here.
--
-- Note this returns the pure SUBSET set (word letters ⊆ puzzle
-- letters + centre). It does NOT enforce the "each tile once"
-- (isogram) rule — that post-filter (popcount(letter_mask) = len)
-- lives in the edge function, where the mask popcount is cheap. A
-- word like "sees" is a subset of a wheel containing s + e but reuses
-- letters, so the edge builder drops it. See wordwheel-build-board.
--
-- The function is `security invoker` + `stable`:
--   - invoker so it runs with the caller's access to common.words
--     (public reference data, RLS off) — no privilege escalation.
--   - stable so a single SELECT can call it once per row of its
--     enclosing query without repeated re-execution.

create function wordwheel.candidate_words(
  puzzle_mask bigint,
  center_bit bigint,
  required_band int,
  legal_band int
)
returns table(word text, letter_mask bigint, is_required boolean)
language sql
stable
security invoker
set search_path = wordwheel, common, public, extensions
as $$
  select w.word,
         w.letter_mask,
         (w.difficulty <= required_band and w.american and not w.slang
            and w.slur = 0 and w.crude = 0)
           as is_required
    from common.words w
   where w.len >= 4
     and w.difficulty <= legal_band
     -- Subset of puzzle: every letter bit of the word must be
     -- present in the puzzle's bitmask (reads the generated
     -- common.words.letter_mask). Not sargable, so this is a
     -- seq-scan-with-filter — fine at a few calls per board build.
     and (w.letter_mask & ~puzzle_mask) = 0
     -- Must contain the center letter — the wordwheel rule.
     and (w.letter_mask & center_bit) <> 0;
$$;

revoke execute on function wordwheel.candidate_words(bigint, bigint, int, int) from public;
grant execute on function wordwheel.candidate_words(bigint, bigint, int, int) to authenticated;

-- ============================================================
-- wordwheel.create_game — mode is a positional arg
-- ============================================================
--
-- Setup shape (server validates):
--   {
--     "target_rank": 0..6,                  -- compete only
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": int }
--     )
--   }
--
-- `mode` ('coop' | 'compete') is a positional argument, not a
-- setup field — it routes the gametype string ('wordwheel_' ||
-- mode) and drives the per-mode player-count floor. setup.mode is
-- REJECTED if present (catch a confused FE that still embeds it).
--
-- Board shape (built by the wordwheel-build-board edge function):
--   {
--     "outer_letters": "abcdefgh",          -- 8 distinct lowercase
--     "center_letter": "i",                 -- 1 lowercase
--     "required_words_score":   int,
--     "required_words_count":   int,
--     "required_words": [
--       { "word": text, "points": int, "is_pangram": bool },
--       …
--     ],
--     "bonus_words":   [text, …]            -- the bonus set (legal − required)
--   }
--
-- The board's wordlists are taken at face value: they were
-- computed by the edge function from common.words (via the
-- candidate_words RPC, read under the caller's JWT, so the grant
-- gates still applied). The RPC just sanity-checks structure, not
-- content.
--
-- Title formula:  "<CENTER>·<OUTER-SORTED>"  e.g.,  "E·CABDNO".
-- The center letter, dot, then the 8 outer letters alphabetized.
-- Identifies a board at a glance in the club's history list.
--
-- Reject reasons (all 'P0001' unless noted):
--   - 42501 not authenticated
--   - 42501 not a member of this club
--   - mode must be 'coop' or 'compete'
--   - compete mode requires at least 2 players
--   - more than 6 players (require_player_count_max)
--   - setup.mode is no longer valid (mode is the positional arg)
--   - setup.target_rank is required when mode='compete' /
--     must be 0..6 / only allowed when mode='compete'
--   - timer shape errors (delegated to common.validate_timer)
--   - board.outer_letters must be 8 distinct lowercase ASCII
--     letters ('s' is allowed — see the candidate_words note)
--   - board.center_letter must be 1 lowercase ASCII letter
--     (not present among outer_letters; 's' is allowed)
--   - board.required_words_count must be ≥ 15 (the puzzle-quality gate
--     the edge function already applies; recheck here so a
--     misbehaving builder can't sneak a degenerate puzzle past) —
--     EXCEPT for a custom board (setup.custom_letters set), where the
--     player picked the letters and the gate relaxes to ≥ 1
--   - board.required_words / board.bonus_words must be arrays

create function wordwheel.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordwheel, common, public, extensions
as $$
declare
  new_id uuid;
  s_target_rank int;
  s_required int;
  s_legal int;
  b_outer text;
  b_center text;
  b_required_words_score int;
  b_required_words_count int;
  game_title text;
  effective_gametype text;
  -- A player-specified letter set (setup.custom_letters non-empty) — the board was
  -- built from the player's own letters, not a random seed. Relaxes the ≥30 gate.
  is_custom_board boolean;
begin
  perform common.require_club_member(target_club);

  -- ─── Validate mode + player-count ────────────────────────
  perform common.validate_mode(mode);

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this is the
    -- server-side catch. Matches psychicnum + connections.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Reject the now-deprecated setup.mode field ──────────
  -- The gametype string + the mode arg are the only sources of
  -- truth. A stale FE that still embeds setup.mode lands here so
  -- the misconfig is loud, not silent (silent acceptance would
  -- have the dialog appear to work while the RLS-and-RPC mode
  -- logic ran on the new arg only).
  if setup ? 'mode' then
    raise exception 'setup.mode is no longer valid; mode is now a top-level argument'
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.target_rank (compete only) ───────────
  -- Required when mode=compete; absent when mode=coop.
  if mode = 'compete' then
    if (setup->>'target_rank') is null then
      raise exception 'setup.target_rank is required when mode=compete'
        using errcode = 'P0001';
    end if;
    begin
      s_target_rank := (setup->>'target_rank')::int;
    exception when invalid_text_representation then
      raise exception 'setup.target_rank must be an integer'
        using errcode = 'P0001';
    end;
    if s_target_rank < 0 or s_target_rank > 6 then
      raise exception 'setup.target_rank must be 0..6 (got %)', s_target_rank
        using errcode = 'P0001';
    end if;
  else
    -- coop: target_rank must NOT be present.
    if setup ? 'target_rank' then
      raise exception 'setup.target_rank only allowed when mode=compete'
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Validate the word bands ─────────────────────────────
  -- required: the band the displayed/required goal words are drawn from (1..6;
  -- band 1 is the floor the board pool was selected at). legal: how obscure an
  -- accepted word may be (required..6, so the legal set always contains the
  -- required set). Both optional — default to the classic 3 / 5. The edge
  -- function builds the board's word lists from these; create_game is the
  -- authority on the shape.
  s_required := coalesce((setup->>'required')::int, 3);
  if s_required < 1 or s_required > 6 then
    raise exception 'setup.required must be 1..6 (got %)', s_required
      using errcode = 'P0001';
  end if;
  s_legal := coalesce((setup->>'legal')::int, 5);
  if s_legal < s_required or s_legal > 6 then
    raise exception 'setup.legal (%) must be between required (%) and 6',
      s_legal, s_required using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Board structure validation ──────────────────────────
  b_outer := board->>'outer_letters';
  b_center := board->>'center_letter';

  if b_outer is null or length(b_outer) <> 8 then
    raise exception 'board.outer_letters must be 8 characters (got %)',
                    coalesce(length(b_outer)::text, 'null')
      using errcode = 'P0001';
  end if;
  -- Any 8 lowercase ASCII letters. Unlike spellingbee, word wheel does NOT
  -- exclude 's': spellingbee bars it because 's' is always reusable there and
  -- would let you pluralize almost any word; word wheel uses each tile ONCE,
  -- so 's' is just one more ordinary letter (as the classic wheel has it).
  if b_outer !~ '^[a-z]{8}$' then
    raise exception 'board.outer_letters must be 8 lowercase ASCII letters'
      using errcode = 'P0001';
  end if;
  -- 8 DISTINCT: cardinality of the deduplicated character set.
  if cardinality(string_to_array(b_outer, null)) <>
     cardinality(array(select distinct unnest(string_to_array(b_outer, null)))) then
    raise exception 'board.outer_letters must be 8 distinct letters'
      using errcode = 'P0001';
  end if;

  if b_center is null or length(b_center) <> 1 then
    raise exception 'board.center_letter must be 1 character'
      using errcode = 'P0001';
  end if;
  if b_center !~ '^[a-z]$' then
    raise exception 'board.center_letter must be a lowercase ASCII letter'
      using errcode = 'P0001';
  end if;
  if position(b_center in b_outer) > 0 then
    raise exception 'board.center_letter must not appear in board.outer_letters'
      using errcode = 'P0001';
  end if;

  b_required_words_score := (board->>'required_words_score')::int;
  b_required_words_count := (board->>'required_words_count')::int;
  -- Custom (player-specified) letters skip the ≥15 quality gate — the player
  -- chose these letters, so we build whatever puzzle they yield. It must still
  -- have ≥1 required word, or the rank ladder is degenerate (Genius at 0 pts).
  -- Random boards keep the ≥15 gate the edge function's builder targets.
  is_custom_board := coalesce(setup->>'custom_letters', '') <> '';
  if is_custom_board then
    if b_required_words_count < 1 then
      raise exception 'those custom letters yield no required words; pick different letters or a lower required band'
        using errcode = 'P0001';
    end if;
  elsif b_required_words_count < 15 then
    -- PROVISIONAL threshold: a 9-letter wheel with each tile used ONCE yields
    -- far fewer words than a spellingbee board (which allows reuse), so the
    -- ≥15 floor is lower than spellingbee's ≥30. Tune against the seed data's
    -- word_counts once the import has run; the edge function's builder must
    -- target the same number.
    raise exception 'board.required_words_count must be ≥ 15 (got %); the edge function''s gate must agree',
                    b_required_words_count
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(board->'required_words') <> 'array' then
    raise exception 'board.required_words must be an array'
      using errcode = 'P0001';
  end if;
  if jsonb_typeof(board->'bonus_words') <> 'array' then
    raise exception 'board.bonus_words must be an array'
      using errcode = 'P0001';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  -- Outer letters alphabetized, uppercased, dot-prefixed by the
  -- uppercased center.
  select upper(b_center) || '·' || string_agg(upper(c), '' order by c)
    into game_title
    from unnest(string_to_array(b_outer, null)) c;

  -- Mode-suffixed gametype string for common.games.gametype.
  effective_gametype := 'wordwheel_' || mode;

  -- ─── Coordinate with common.create_game ──────────────────
  -- Inserts common.games (is_current_view=true, play_state=
  -- 'playing'), validates player_user_ids are all in
  -- clubs_members, inserts common.game_players. Returns the
  -- canonical id we'll FK from.
  --
  -- Saved-default arg: persist the whole setup as the club's
  -- next default. target_rank + timer are all things a friend
  -- group settles on; no point asking again next time. BUT strip the
  -- one-off custom letters — a hand-picked board is a one-time choice, so the
  -- NEXT game should start from a random board again (the SetupForm shows the
  -- custom fields blank).
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup,
    setup - 'custom_letters' - 'custom_center'
  );

  -- ─── Insert the per-gametype row, now with mode ──────────
  insert into wordwheel.games (
    id, club_handle, mode, outer_letters, center_letter,
    required_words_score, required_words_count, required_words, bonus_words
  )
  values (
    new_id,
    target_club,
    mode,
    b_outer,
    b_center,
    b_required_words_score,
    b_required_words_count,
    board->'required_words',
    -- bonus_words is a jsonb array of { word, points, is_pangram } now (same
    -- shape as required_words) — stored directly so the FE can score bonus finds.
    coalesce(board->'bonus_words', '[]'::jsonb)
  );

  -- ─── Seed common.games.status for the club-page label ────
  -- Coop label needs found_words_score / required_words_score /
  -- rank_idx / found_words_count / required_words_count. Compete
  -- label only needs target_rank + required_words_count (the
  -- leaderboard is built on first submission).
  if mode = 'coop' then
    perform common.update_state(
      new_id,
      'playing',
      jsonb_build_object(
        'mode', 'coop',
        'found_words_score', 0,
        'required_words_score', b_required_words_score,
        'rank_idx', 0,
        'found_words_count', 0,
        'required_words_count', b_required_words_count
      )
    );
  else
    perform common.update_state(
      new_id,
      'playing',
      jsonb_build_object(
        'mode', 'compete',
        'target_rank', s_target_rank,
        'required_words_score', b_required_words_score,
        'required_words_count', b_required_words_count,
        'leaderboard', '[]'::jsonb
      )
    );
  end if;

  return query select new_id;
end;
$$;

revoke execute on function wordwheel.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function wordwheel.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- wordwheel.submit_word
-- ============================================================
-- The only mid-game action. Validates the word in the order
-- wordwheel-ws uses (chosen so each rejection gives the friendliest
-- feedback when multiple things are wrong):
--
--   1. tooShort         length < 4
--   2. badLetters       uses a letter that isn't on the board
--   3. missingCenter    doesn't include the center letter
--   4. notAWord         not in required_words and not in bonus_words (i.e. not legal)
--   5. alreadyFound     per mode rule (see below)
--   6. accepted / bonus / pangram
--
-- "Per mode rule":
--   - coop:    duplicate iff ANY row exists with this game_id
--              and word (anyone can find a word; once found
--              by anyone, it's locked).
--   - compete: duplicate iff a row exists with this game_id,
--              user_id=caller, word (each player has their
--              own list; finding a word someone else has
--              found is still a fresh point for you).
--
-- Mode comes off wordwheel.games.mode (which we already lock with
-- FOR UPDATE) — one fewer cross-schema read per submission than
-- digging into common.games.setup.
--
-- Returns jsonb `{ result, points }` rather than a bare result enum,
-- so the FE can show points earned (and call out a pangram) in the
-- entry feedback WITHOUT re-deriving the point/pangram rules on the
-- client. The `result` vocabulary gains `'pangram'` (a required OR
-- bonus word using all 9 letters; takes precedence over the
-- accepted/bonus distinction, which the FE doesn't surface anyway).
-- Rejected results (notAWord, tooShort, …) carry `points: 0`.
--
-- Throws (hard rejections):
--   42501 not authenticated, not a game player
--   P0001 'game is not in progress'  (post-terminal call)
--   P0002 'game not found'
--
-- ───────────────────────────────────────────────────────────
-- Concurrency
-- ───────────────────────────────────────────────────────────
-- SELECT … FOR UPDATE on the wordwheel.games row serializes
-- concurrent submissions. The PK on found_words is the
-- (game_id, user_id, word) triple, so a same-player double-
-- submit of the same word is also caught at the constraint
-- level if the lock somehow missed it.

-- Trusting-commit: the FE validated the word against the board's shipped legal
-- list (required ∪ bonus) and scored it, so this trusts word + points +
-- is_pangram + is_bonus and only enforces the live-game check, dedups, records,
-- and recomputes aggregates / the compete win. It does NOT re-validate letters /
-- center / min length / dictionary membership. (See docs/games/wordwheel.md.)
create function wordwheel.submit_word(
  target_game uuid,
  word text,
  points int,
  is_pangram boolean,
  is_bonus boolean
)
returns jsonb
language plpgsql
security definer
set search_path = wordwheel, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordwheel.games%rowtype;
  current_play_state text;
  current_target_rank int;
  w_lower text;
  duplicate_count int;

  team_score int;
  team_found_words_count int;     -- count of ALL rows; for the status display
  team_rank_idx int;
  caller_score int;
  caller_found_words_count int;   -- caller's all-rows count (display + leaderboard)
  caller_rank_idx int;
  player_results jsonb;
begin
  -- Lock the gametype row. Mode is on it, so we pick it up "for
  -- free" in the same SELECT.
  select * into g_row from wordwheel.games
   where wordwheel.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  -- target_rank still lives on setup (it's per-game config, not a
  -- gametype-axis); play_state still lives on common.games.
  select play_state, (setup->>'target_rank')::int
    into current_play_state, current_target_rank
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- A conceded player is out of the race — no more words. The FE gates
  -- on myConceded, so this only fires on a race (a submit in flight when
  -- concede commits, or a stale second tab). Without it a conceder could
  -- reach the target rank and be recorded the winner.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;

  -- Normalize for storage + dedup (the FE already validated legality).
  w_lower := lower(coalesce(word, ''));

  -- alreadyFound (per mode rule, reading off g_row.mode). Table alias `fw` is
  -- mandatory: the function parameter is also named `word`, and PL/pgSQL's
  -- column-resolution rule raises "column reference word is ambiguous" without
  -- the alias even though we mean `w_lower` below.
  if g_row.mode = 'coop' then
    select count(*) into duplicate_count
      from wordwheel.found_words fw
     where fw.game_id = target_game and fw.word = w_lower;
  else
    select count(*) into duplicate_count
      from wordwheel.found_words fw
     where fw.game_id = target_game
       and fw.user_id = caller_id
       and fw.word = w_lower;
  end if;
  if duplicate_count > 0 then
    return jsonb_build_object('result', 'alreadyFound', 'points', 0);
  end if;

  -- ─── Insert the row (trusted word + points + flags) ──────
  insert into wordwheel.found_words
    (game_id, user_id, word, points, is_pangram, is_bonus)
  values
    (target_game, caller_id, w_lower,
     coalesce(points, 0), coalesce(is_pangram, false), coalesce(is_bonus, false));

  -- ─── Recompute aggregates + status (no terminal in coop) ─
  -- Coop submissions never end the game — coop only ends via
  -- timer expiry or the manual End-game menu item. Players can
  -- keep finding bonus words past the displayed `Y / required_words_count`
  -- denominator and the score can overshoot `required_words_score` (the
  -- wordwheel-ws design — see the bonus-scoring write-up above).
  if g_row.mode = 'coop' then
    -- Alias `fw` so `points` resolves to the column, not the same-named function
    -- parameter (PL/pgSQL would otherwise raise "column reference is ambiguous").
    select coalesce(sum(fw.points), 0),
           count(*)
      into team_score, team_found_words_count
      from wordwheel.found_words fw
     where fw.game_id = target_game;
    team_rank_idx := wordwheel._rank_idx(team_score, g_row.required_words_score);

    perform common.update_state(
      target_game, 'playing',
      jsonb_build_object(
        'mode', 'coop',
        'found_words_score', team_score,
        'required_words_score', g_row.required_words_score,
        'rank_idx', team_rank_idx,
        'found_words_count', team_found_words_count,
        'required_words_count', g_row.required_words_count
      )
    );

  else
    -- compete: per-player aggregates. caller_found_words_count counts
    -- ALL of caller's rows (required + bonus) — matches the
    -- wordwheel-ws "found.length" stat. The target-rank check
    -- below uses caller_score (which already includes bonus
    -- points after the bonus-scoring fix in the validation
    -- block above), so a player who finds bonus pangrams can
    -- legitimately rocket past target faster than the displayed
    -- max score would suggest.
    select coalesce(sum(fw.points), 0),
           count(*)
      into caller_score, caller_found_words_count
      from wordwheel.found_words fw
     where fw.game_id = target_game and fw.user_id = caller_id;
    caller_rank_idx := wordwheel._rank_idx(caller_score, g_row.required_words_score);

    if caller_rank_idx >= current_target_rank then
      -- Compete win: caller hit the target rank first. Freeze the
      -- leaderboard at the moment of victory.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', p.user_id,
                 'found_words_score', coalesce(p.found_words_score, 0),
                 'rank_idx', wordwheel._rank_idx(coalesce(p.found_words_score, 0), g_row.required_words_score),
                 'found_words_count', coalesce(p.found_words_count, 0)
               )
             )
        into player_results
        from (
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as found_words_score,
                 -- All rows (required + bonus) to mirror wordwheel-ws's
                 -- found.length stat surfaced in the leaderboard
                 -- display. Scoring-only count would diverge from
                 -- what the player sees in their own Stats card.
                 count(fw.word)::int as found_words_count
            from common.game_players gp
            left join wordwheel.found_words fw
                   on fw.game_id = target_game and fw.user_id = gp.user_id
           where gp.game_id = target_game
           group by gp.user_id
        ) p;

      perform common.end_game(
        target_game, 'won_compete',
        jsonb_build_object(
          'outcome', 'won_compete',
          'mode', 'compete',
          'winner_user_id', caller_id,
          'target_rank', current_target_rank,
          'leaderboard', player_results
        ),
        -- Re-key the leaderboard into the per-player {won, score,
        -- rank_idx} shape that common.end_game expects.
        (select jsonb_object_agg(
                  (entry->>'user_id'),
                  jsonb_build_object(
                    'won', (entry->>'user_id')::uuid = caller_id,
                    'found_words_score', (entry->>'found_words_score')::int,
                    'rank_idx', (entry->>'rank_idx')::int
                  )
                )
           from jsonb_array_elements(player_results) entry)
      );
    else
      -- Build the full leaderboard for the status label.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', p.user_id,
                 'found_words_score', p.found_words_score,
                 'rank_idx', wordwheel._rank_idx(p.found_words_score, g_row.required_words_score),
                 'found_words_count', p.found_words_count
               )
             )
        into player_results
        from (
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as found_words_score,
                 -- All rows (required + bonus) to mirror wordwheel-ws's
                 -- found.length stat surfaced in the leaderboard
                 -- display. Scoring-only count would diverge from
                 -- what the player sees in their own Stats card.
                 count(fw.word)::int as found_words_count
            from common.game_players gp
            left join wordwheel.found_words fw
                   on fw.game_id = target_game and fw.user_id = gp.user_id
           where gp.game_id = target_game
           group by gp.user_id
        ) p;

      perform common.update_state(
        target_game, 'playing',
        jsonb_build_object(
          'mode', 'compete',
          'target_rank', current_target_rank,
          'leaderboard', player_results,
          'required_words_score', g_row.required_words_score,
          'required_words_count', g_row.required_words_count
        )
      );
    end if;
  end if;

  -- Echo back a classification (the FE drives its own optimistic feedback, so this
  -- is mostly for tests / debugging). `points` is the trusted value on the row.
  return jsonb_build_object(
    'result',
    case
      when coalesce(is_pangram, false) then 'pangram'
      when coalesce(is_bonus, false) then 'bonus'
      else 'accepted'
    end,
    'points', coalesce(points, 0)
  );
end;
$$;

revoke execute on function wordwheel.submit_word(uuid, text, int, boolean, boolean) from public;
grant execute on function wordwheel.submit_word(uuid, text, int, boolean, boolean) to authenticated;

-- ============================================================
-- wordwheel.submit_timeout
-- ============================================================
-- Fired by the FE when the count-down timer hits 0. Flips the
-- game to 'ended' with outcome='timeout'. Multiple peers may
-- race the expiry; the SELECT ... FOR UPDATE serializes them
-- and the post-lock play_state check rejects everyone after
-- the first with P0001 (which the FE swallows silently).
--
-- Mode comes off wordwheel.games.mode. This is identical in shape
-- to connections / psychicnum's submit_timeout, just with wordwheel's
-- status payload.
-- common.end_game flips common.games to ended/terminal; the FE's useCommonGame
-- hook (subscribed to common.games) sees that and enters review mode.
--
-- A wordwheel-table "realtime touch" on found_words IS needed for compete:
-- opponents' found_words rows are RLS-hidden during play and become SELECT-able
-- only at terminal, and the FE's useGame subscribes to found_words alone. On a
-- non-submit_word terminal (timeout here) no found_words event fires on its own,
-- so peers never refetch and every opponent find renders as a grey "missed" row.
-- A no-op self-update fires the WAL events. (The header word lists ship at game
-- start, so THAT needs no touch — but the per-player finds do.)

create function wordwheel.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordwheel, common, public, extensions
as $$
declare
  g_row wordwheel.games%rowtype;
  current_play_state text;
  team_score int;
  team_found_words_count int;
  player_results jsonb;
begin
  select * into g_row from wordwheel.games
   where wordwheel.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    -- Status display uses the ALL-rows count to match the
    -- live Stats card (wordwheel-ws semantics — see submit_word
    -- for the rationale).
    select coalesce(sum(points), 0),
           count(*)
      into team_score, team_found_words_count
      from wordwheel.found_words
     where game_id = target_game;

    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'finished', true,
               'team_score', team_score,
               'team_rank_idx',
                 wordwheel._rank_idx(team_score, g_row.required_words_score)
             )
           )
      into player_results
      from common.game_players
     where game_id = target_game;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'timeout',
        'mode', 'coop',
        'found_words_score', team_score,
        'required_words_score', g_row.required_words_score,
        'rank_idx', wordwheel._rank_idx(team_score, g_row.required_words_score),
        'found_words_count', team_found_words_count,
        'required_words_count', g_row.required_words_count
      ),
      player_results
    );
  else
    -- compete: leaderboard at timeout, no winner.
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,                       -- timeout = no winner
               'found_words_score', p.found_words_score,
               'rank_idx', wordwheel._rank_idx(p.found_words_score, g_row.required_words_score)
             )
           )
      into player_results
      from (
        select gp.user_id,
               coalesce(sum(fw.points), 0)::int as found_words_score
          from common.game_players gp
          left join wordwheel.found_words fw
                 on fw.game_id = target_game and fw.user_id = gp.user_id
         where gp.game_id = target_game
         group by gp.user_id
      ) p;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'timeout',
        'mode', 'compete'
      ),
      player_results
    );
  end if;

  -- Realtime touch on found_words so peers refetch and the now-RLS-visible
  -- opponents' finds appear (see header). Harmless in coop (teammates already
  -- see each other's words live); load-bearing in compete.
  update wordwheel.found_words set user_id = user_id where game_id = target_game;
end;
$$;

revoke execute on function wordwheel.submit_timeout(uuid) from public;
grant execute on function wordwheel.submit_timeout(uuid) to authenticated;

-- ============================================================
-- wordwheel.end_game — manual stop
-- ============================================================
--
-- Unlike codenamesduet / psychicnum / connections, wordwheel has no
-- intrinsic "you lost" or "you won" terminal state in coop: the
-- only automatic terminals are the compete first-to-target-rank
-- (handled inside submit_word as outcome='won_compete') and the
-- countdown timer expiring (handled by submit_timeout with
-- outcome='timeout'). For all other cases the friends are
-- expected to play until they're satisfied with their rank and
-- then explicitly stop the game.
--
-- This RPC is that explicit stop. The FE's GamePage menu has an
-- "End game" item (per-game, declared by wordwheel's PlayArea via
-- ctx.menu.setGameItems) that fires this. Distinct from suspend
-- (which leaves play_state='playing' and is the path "back to
-- club" + start-a-new-game takes): end_game writes a terminal
-- play_state='ended' with status.outcome='manual', so the game
-- appears in the club's "completed" section forever after and the
-- GameOverModal pops.
--
-- Same shape as submit_timeout, with two differences:
--   - status.outcome='manual' (vs 'timeout')
--   - any game player can fire it (vs the FE's timer-driven
--     dispatch)
-- Ends with a found_words realtime touch, same as submit_timeout: the compete
-- opponents'-finds reveal is RLS-gated on terminal and useGame subscribes to
-- found_words alone, so a manual end needs the no-op self-update to wake peers.

create function wordwheel.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordwheel, common, public, extensions
as $$
declare
  g_row wordwheel.games%rowtype;
  current_play_state text;
  team_score int;
  team_found_words_count int;
  player_results jsonb;
begin
  select * into g_row from wordwheel.games
   where wordwheel.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a concurrent click + timer
    -- expiry) raises this and the FE swallows it the same way
    -- it does for submit_timeout's "already terminal" race.
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    -- All-rows count for display, matching wordwheel-ws.
    select coalesce(sum(points), 0),
           count(*)
      into team_score, team_found_words_count
      from wordwheel.found_words
     where game_id = target_game;

    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'finished', true,
               'team_score', team_score,
               'team_rank_idx',
                 wordwheel._rank_idx(team_score, g_row.required_words_score)
             )
           )
      into player_results
      from common.game_players
     where game_id = target_game;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'manual',
        'mode', 'coop',
        'found_words_score', team_score,
        'required_words_score', g_row.required_words_score,
        'rank_idx', wordwheel._rank_idx(team_score, g_row.required_words_score),
        'found_words_count', team_found_words_count,
        'required_words_count', g_row.required_words_count
      ),
      player_results
    );
  else
    -- compete: per-player aggregates, no winner (the players
    -- agreed to stop). Same shape as submit_timeout's compete
    -- branch.
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,
               'found_words_score', p.found_words_score,
               'rank_idx', wordwheel._rank_idx(p.found_words_score, g_row.required_words_score)
             )
           )
      into player_results
      from (
        select gp.user_id,
               coalesce(sum(fw.points), 0)::int as found_words_score
          from common.game_players gp
          left join wordwheel.found_words fw
                 on fw.game_id = target_game and fw.user_id = gp.user_id
         where gp.game_id = target_game
         group by gp.user_id
      ) p;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'manual',
        'mode', 'compete'
      ),
      player_results
    );
  end if;

  -- Realtime touch on found_words so compete peers refetch the now-RLS-visible
  -- opponents' finds (see submit_timeout's header for the full rationale).
  update wordwheel.found_words set user_id = user_id where game_id = target_game;
end;
$$;

revoke execute on function wordwheel.end_game(uuid) from public;
grant execute on function wordwheel.end_game(uuid) to authenticated;

-- ============================================================
-- wordwheel.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item / terminal RestartButton (the waffle
-- feature — docs/celebration-ideas.md). Restarts the SAME board — same
-- letters + word lists — for everyone: the found-words log (the game's
-- only working state) is cleared, and common.reset_game un-terminals the
-- row with the same initial status create_game seeds (mode-branched; the
-- compete target_rank re-read from the frozen common.games.setup) and
-- zeroes the shared clock. Any game player may call it, mid-game or after
-- game-over (no play_state guard — it's a restart).
--
-- The realtime touch at the end is LOAD-BEARING here (unlike waffle,
-- whose players UPDATE wakes its hook for free): replay only DELETEs
-- found_words rows, and realtime filters don't reliably match DELETE
-- events — so useGame also subscribes to wordwheel.games, and this
-- no-op write is what wakes every client to refetch the now-empty list.
create function wordwheel.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordwheel, common, public, extensions
as $$
declare
  g_row wordwheel.games;
  s_target_rank int;
  new_status jsonb;
begin
  perform common.require_game_player(target_game);
  select * into g_row from wordwheel.games where id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  delete from wordwheel.found_words where game_id = target_game;

  -- The fresh initial status — the exact shapes create_game seeds.
  if g_row.mode = 'coop' then
    new_status := jsonb_build_object(
      'mode', 'coop',
      'found_words_score', 0,
      'required_words_score', g_row.required_words_score,
      'rank_idx', 0,
      'found_words_count', 0,
      'required_words_count', g_row.required_words_count
    );
  else
    select (setup->>'target_rank')::int into s_target_rank
      from common.games where id = target_game;
    new_status := jsonb_build_object(
      'mode', 'compete',
      'target_rank', s_target_rank,
      'required_words_score', g_row.required_words_score,
      'required_words_count', g_row.required_words_count,
      'leaderboard', '[]'::jsonb
    );
  end if;

  perform common.reset_game(target_game, new_status);

  -- Realtime touch (see the header) — wakes useGame's games subscription.
  update wordwheel.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function wordwheel.replay_board(uuid) from public;
grant execute on function wordwheel.replay_board(uuid) to authenticated;

-- ============================================================
-- wordwheel.concede — a player drops out of a compete race
-- ============================================================
-- wordwheel has NO independent per-player "eliminated" state (a
-- player is only ever done by winning — first to the target rank —
-- which ends the game, or by conceding), so the active set is exactly
-- "not conceded" and the generic common.concede handles everything:
-- mark the caller out, and if that was the last racer, end the game
-- as a collective loss. This wrapper just keeps the FE uniform (every
-- game calls its own-schema `concede`) and gates concede to compete —
-- coop is a team, it ends via the shared End, never a concede.
create function wordwheel.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordwheel, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from wordwheel.games where id = target_game));
  perform common.concede(target_game);

  -- If that was the last racer, common.concede ended the game. Wake the
  -- found_words subscription (same reveal as submit_timeout/end_game) so the
  -- remaining clients refetch the now-RLS-visible opponents' finds. common.*
  -- writes only common.games, so without this the reveal never loads.
  if (select play_state from common.games where id = target_game) <> 'playing' then
    update wordwheel.found_words set user_id = user_id where game_id = target_game;
  end if;
end;
$$;

revoke execute on function wordwheel.concede(uuid) from public;
grant execute on function wordwheel.concede(uuid) to authenticated;
