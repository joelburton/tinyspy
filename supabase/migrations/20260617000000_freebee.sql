-- ============================================================
-- freebee — NYT-Spelling-Bee-style word finder (consolidated)
-- ============================================================
--
-- A honeycomb of 7 distinct letters (1 center + 6 outer); players
-- form words from those letters; each word must include the
-- center. Pangrams (words using all 7) earn a +10 bonus. The word
-- list is common.words (the categorized master list shared across
-- games); freebee filters it into a smaller REQUIRED set (the goal
-- shown to players: difficulty band <= 3, american, no slang, no
-- slurs) and a larger LEGAL set (band <= 5, the acceptance bar, no
-- other restriction). Words in legal but not required are BONUS:
-- accepted and scored, but not part of the displayed goal.
--
-- "freebee" is the codename. User-facing copy is "freebee"; SQL /
-- TypeScript / folder names are all `freebee`. Ported from the
-- standalone codebase at ~/freebee-ws; this monorepo replaces the
-- websocket / session / chat / presence machinery with Supabase
-- Realtime + the pupgames common shell.
--
-- This file is the squashed, build-from-scratch form of the
-- freebee schema: the full final state (schema, RLS, hidden-
-- wordlist pattern, RPCs) with coop + compete shipped as a
-- sibling-manifest pair (`freebee_coop` + `freebee_compete`
-- gametypes, a denormalized `mode` column on freebee.games, and a
-- `mode` arg on create_game). Same pattern psychicnum and wordknit
-- follow.
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- validate_timer). Per the removability invariant in
-- docs/common.md, common MUST NOT reference freebee back.
--
-- See docs/games/freebee.md for the full feature picture and the
-- rules-of-the-game spec.

-- ============================================================
-- Schema + usage grants
-- ============================================================

create schema if not exists freebee;
grant usage on schema freebee to authenticated;

-- The pangram import (supabase/scripts/import-freebee-pangrams.ts)
-- connects as the superuser (bypasses grants), so service_role only
-- needs schema USAGE for any incidental PostgREST access.
grant usage on schema freebee to service_role;

-- ============================================================
-- The word reference lives in common.words
-- ============================================================
-- freebee's word reference is the shared common.words master list,
-- not a freebee table — every word game filters the same
-- categorized source. freebee's slice is computed on the fly in
-- freebee.candidate_words (below): legal = difficulty <= 5,
-- required = difficulty <= 3 AND american AND NOT slang AND NOT slur,
-- len >= 4. The `letter_mask & ~puzzle_mask = 0` subset
-- test (every letter of the word is in the puzzle) reads the
-- generated common.words.letter_mask column — same bit convention.
--
-- No freebee-specific index on common.words: the candidate_words
-- filter (difficulty/dialect/len) selects ~a third of the table, a
-- selectivity at which Postgres prefers a seq-scan-with-filter over
-- a btree anyway (the bitwise subset test isn't sargable). It runs
-- in tens of ms, a handful of times per board build. See
-- candidate_words for the measured rationale.

-- ============================================================
-- freebee.pangrams — the board-seed pool
-- ============================================================
-- A valid freebee board needs to contain at least one pangram
-- (a word using all 7 distinct letters of the board). Random
-- 7-letter sets MOSTLY don't have a pangram in the word list —
-- so generating boards by "pick 7 random letters and check"
-- wastes thousands of attempts.
--
-- The flip: start from known pangrams. Scan the band-1 (universal)
-- slice of common.words for every 7-distinct-letter word, dedupe by
-- letter-mask, store the resulting masks here. Drawing the seed from
-- band 1 guarantees every board has a COMMON, findable pangram (the
-- whole point — no obscure-only pangrams like CALDRON). For each seed
-- we precompute `required_words_count` = how many REQUIRED words
-- (band <= 3, american, no slang, no slur) fit it, and keep only
-- seeds with >= 30 so no board is thin. See
-- import-freebee-pangrams.ts and docs/games/freebee.md.
--
-- The edge function samples from this table — one short query, no
-- rejection loops over the whole word list on each board build.
-- See docs/games/freebee.md → "Why a seeds table?" for the longer
-- explanation. Rebuilt by import-freebee-pangrams.ts (after
-- words:import has loaded common.words).
--
-- has_rare_letters drives the "diverse" builder's weighting:
-- masks containing any of {j, q, x, z} (very rare) or
-- {k, v, w, y} (somewhat rare) get duplicated in the sampler
-- so they're picked more often than their natural frequency
-- would warrant. Otherwise nearly every board would contain
-- only common letters (e, a, i, r, t, …). Precomputed once at
-- import time.

create table freebee.pangrams (
  mask                 bigint primary key,    -- 7 bits set; a valid board seed
  required_words_count int not null,          -- count of required words that fit this mask
  has_rare_letters     boolean not null       -- weighting tier for the diverse builder
);

-- freebee.pangrams: public reference data, no RLS. The edge
-- function samples seeds as the caller (authenticated SELECT). The
-- pangram import connects as the superuser and bypasses grants, so
-- no service_role INSERT is needed.
grant select on freebee.pangrams to authenticated;

-- ============================================================
-- freebee.games — one row per playthrough
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
-- Same shape as psychicnum.games.mode and wordknit.games.mode.
--
-- ───────────────────────────────────────────────────────────
-- The "terminal-gated wordlists" pattern
-- ───────────────────────────────────────────────────────────
-- `required_words` and `bonus_words` ARE the answer keys. The
-- normal play data path (the games_state view the FE reads)
-- returns `required_words` as NULL during play and the real list
-- post-terminal, so the end-of-game "here are the words you
-- missed" display works without the FE ever holding the answer
-- mid-game. (`bonus_words` is only read server-side, for
-- validation — see the games_state view below.)
--
-- This is NOT an anti-cheat boundary. A determined friend can
-- still recover the answer key — e.g. by calling the
-- candidate_words RPC from devtools with their own board's masks
-- (it's granted to `authenticated` so the edge-function board
-- builder can use it under the caller's JWT). Per
-- CLAUDE.md → Trust model, we don't try to stop that: the goal
-- is a clean single source of truth where the *default* data
-- path doesn't carry the secret, not a guarantee that the secret
-- is unreachable. Keeping it off the normal path is what makes
-- the post-terminal reveal a deliberate, auditable transition.
--
-- Two layers, same pattern as psychicnum.games.target:
--   (1) Column-level grant on this base table omits both columns
--       from the `authenticated` role's SELECT. A direct
--       `SELECT required_words FROM freebee.games` returns
--       42501 permission denied for column required_words.
--   (2) `freebee.games_state` view (below) calls SECURITY
--       DEFINER helpers that bypass the column grant and apply
--       a CASE on common.games.is_terminal. Pre-terminal:
--       returns NULL. Post-terminal: returns the actual list.
--
-- The FE only ever reads from games_state, never from games
-- directly. See docs/games/freebee.md → "The hidden-wordlist
-- pattern" + docs/code-conventions.md → "SECURITY DEFINER
-- helper + security_invoker view" for the wider context.

create table freebee.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- 6 distinct lowercase outer letters, no order significance
  -- on the SQL side (the FE shuffles for display). char(6) is
  -- a width assertion — wider/narrower strings raise a type
  -- error at insert time, catching bad input early.
  outer_letters char(6) not null,
  -- The mandatory center letter (the yellow hex). Single
  -- lowercase character.
  center_letter char(1) not null,
  -- Cached at create-game time from the wordlists. Pure
  -- function of the puzzle so we could recompute, but caching
  -- means submit_word doesn't need to scan the word list on
  -- every guess to recompute "the max."
  required_words_score int not null,
  required_words_count int not null,             -- count of required words
  -- ─── Hidden columns (see "hidden wordlists" above) ───────
  -- required_words shape: jsonb array of
  --     { "word": text, "points": int, "is_pangram": bool }
  -- bonus_words: text[] of the bonus set (legal − required) —
  -- accepted and scored, but not part of the required goal.
  -- Both built by the edge function (via candidate_words over
  -- common.words) and handed to create_game.
  required_words jsonb not null,
  bonus_words text[] not null,
  created_at timestamptz not null default now(),
  -- Sibling-manifest mode axis. CHECK constrains it to the two
  -- valid values; the gametype string ('freebee_coop' /
  -- 'freebee_compete') and this column agree by construction in
  -- create_game.
  mode text not null check (mode in ('coop', 'compete'))
);

create index freebee_games_club_handle_idx on freebee.games (club_handle);

-- Column-level grant: every column EXCEPT the two hidden ones.
-- The presence of any column-level grant on a table changes
-- the access semantics from "all columns visible" to "only
-- granted columns visible," so we have to enumerate the safe
-- ones explicitly. `mode` is included so the security_invoker
-- games_state view's `g.mode` reference and the found_words_select
-- RLS policy's `fg.mode` subquery resolve for `authenticated`
-- (both evaluate in the caller's context). Per
-- docs/code-conventions.md → "Avoid SELECT *", explicit column
-- lists are the convention anyway.
grant select
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, created_at)
  on freebee.games to authenticated;

-- ============================================================
-- freebee.found_words — append-only log of accepted submissions
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

create table freebee.found_words (
  game_id    uuid not null
    references freebee.games(id) on delete cascade,
  user_id    uuid not null
    references common.profiles(user_id) on delete cascade,
  word       text not null,
  points     int not null,               -- length-based (+10 pangram); bonus words score too
  is_pangram boolean not null,
  is_bonus   boolean not null,           -- in the bonus set (legal − required); shown with a dot
  found_at   timestamptz not null default now(),
  primary key (game_id, user_id, word)
);

create index freebee_found_words_game_id_idx
  on freebee.found_words (game_id);

grant select on freebee.found_words to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table freebee.games enable row level security;
alter table freebee.found_words enable row level security;

-- Membership-gated read on games. Co-op + compete behave
-- identically here: anyone in the club can see the game's
-- header (letters, totals, etc.). The wordlists are gated
-- separately at the column level + games_state view.
create policy games_select on freebee.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- found_words RLS is the load-bearing piece for compete. Reads
-- the mode off freebee.games.mode directly (denormalized), so
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
-- wordknit.guesses_select shape.
create policy found_words_select on freebee.found_words
  for select to authenticated
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
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the
-- security-definer RPCs below.

-- ============================================================
-- Hidden-wordlist helper + games_state view
-- ============================================================
-- One SECURITY DEFINER helper for the hidden `required_words`
-- answer key. It reads the column directly (running as `postgres`
-- bypasses the column grant) and applies a CASE on
-- common.games.is_terminal: pre-terminal returns NULL; post-
-- terminal returns the actual list — the end-of-game reveal.
--
-- `bonus_words` is NOT revealed: unfound bonus words are never
-- shown to players, so the view doesn't expose it. The column
-- exists only for server-side validation in submit_word.
--
-- The helper is revoked from `public` and granted only to
-- `authenticated` so the games_state view (which runs with the
-- caller's identity under security_invoker=true) can call it.
-- See docs/code-conventions.md → "SECURITY DEFINER helper +
-- security_invoker view" for the recipe.

create function freebee._required_words_for(g uuid)
returns jsonb
language sql
security definer
stable
set search_path = freebee, common, public, extensions
as $$
  select case when c.is_terminal then p.required_words end
    from freebee.games p
    join common.games c on c.id = p.id
   where p.id = g;
$$;

revoke execute on function freebee._required_words_for(uuid) from public;
-- Grant EXECUTE to authenticated so the games_state view (which
-- runs with the caller's identity under security_invoker=true)
-- can call into the helper. Its SECURITY DEFINER property switches
-- identity to postgres *inside* the call — that's the bit that
-- lets it read the column-grant-blocked `required_words` column.
grant execute on function freebee._required_words_for(uuid) to authenticated;

-- The view. `security_invoker = true` means RLS on the base
-- table evaluates as the caller (so games_select still gates
-- row visibility). Column exposure is gated by the helper's
-- CASE. Net effect: a single FE query returns the game row
-- (including `mode` for the FE's coop/compete rendering) with
-- `required_words` populated post-terminal, NULL during play.
-- This view is the FE's only read path on freebee games — the
-- base table's column grant blocks the hidden answer key for
-- `authenticated`.

create view freebee.games_state with (security_invoker = true) as
select
  g.id,
  g.club_handle,
  g.mode,
  g.outer_letters,
  g.center_letter,
  g.required_words_score,
  g.required_words_count,
  g.created_at,
  freebee._required_words_for(g.id) as required_words
  from freebee.games g;

grant select on freebee.games_state to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- found_words is the high-traffic table: every accepted
-- submission appends a row that every connected peer's
-- useGame hook refetches on. games is published because the
-- terminal flip — when required_words materializes through the
-- view — is something the FE wants to react to (refetch
-- games_state to pick up the reveal). The flip itself happens
-- on common.games (already published), but useGame
-- subscribes to freebee tables; the touch-update on
-- freebee.games inside the terminal RPCs (submit_word's coop
-- status update, submit_timeout / end_game's self-set) makes
-- the refetch fire.

alter publication supabase_realtime add table freebee.games;
alter publication supabase_realtime add table freebee.found_words;

-- ============================================================
-- Register freebee with common.gametypes
-- ============================================================
-- Sibling-manifest pair: coop and compete are two distinct
-- gametype rows sharing this one schema. create_club seeds new
-- clubs with both; create_game routes to one via the mode arg.

insert into common.gametypes (gametype, min_players) values
  ('freebee_coop', 1),
  ('freebee_compete', 2)
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

create function freebee._rank_idx(score int, total int)
returns int
language sql
immutable
set search_path = freebee, common, public, extensions
as $$
  select case
           when total <= 0 then 0
           else least(6, (score * 60) / (total * 7))
         end;
$$;

revoke execute on function freebee._rank_idx(int, int) from public;
grant execute on function freebee._rank_idx(int, int) to authenticated;

-- ============================================================
-- freebee.candidate_words — edge-function board-build helper
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
-- This is also where freebee's slice of the shared common.words
-- list is defined, on the 1..6 recognizability bands:
--   - legal      difficulty <= 5  (returned at all = enterable). No
--                dialect / slang / slur restriction — anything up to
--                band 5 counts if you play it.
--   - required   difficulty <= 3 AND american AND NOT slang AND NOT
--                slur  (the is_required flag; counts toward the
--                displayed goal + rank denominator). Slurs are legal
--                but never required — the golden rule. Words that are
--                legal but not required (band 4-5, or band <=3 that's
--                non-american / slang / a slur) come back as BONUS
--                (is_required false): legal − required. Bonus words
--                still SCORE (length + pangram bonus); they just don't
--                count toward the required goal.
--   - length     len >= 4  (the Spelling-Bee minimum)
-- The required/legal bands become a per-game user choice later; for
-- now they're the locked defaults (see docs/games/freebee.md).
--
-- `s`-words need no explicit filter: a board never contains 's', so
-- the 's' bit is never in puzzle_mask and any 's'-word fails the
-- subset test below for free.
--
-- The function is `security invoker` + `stable`:
--   - invoker so it runs with the caller's access to common.words
--     (public reference data, RLS off) — no privilege escalation.
--   - stable so a single SELECT can call it once per row of its
--     enclosing query without repeated re-execution.

create function freebee.candidate_words(
  puzzle_mask bigint,
  center_bit bigint
)
returns table(word text, letter_mask bigint, is_required boolean)
language sql
stable
security invoker
set search_path = freebee, common, public, extensions
as $$
  select w.word,
         w.letter_mask,
         (w.difficulty <= 3 and w.american and not w.slang and not w.slur)
           as is_required
    from common.words w
   where w.len >= 4
     and w.difficulty <= 5
     -- Subset of puzzle: every letter bit of the word must be
     -- present in the puzzle's bitmask (reads the generated
     -- common.words.letter_mask). Not sargable, so this is a
     -- seq-scan-with-filter — fine at a few calls per board build.
     and (w.letter_mask & ~puzzle_mask) = 0
     -- Must contain the center letter — the freebee rule.
     and (w.letter_mask & center_bit) <> 0;
$$;

revoke execute on function freebee.candidate_words(bigint, bigint) from public;
grant execute on function freebee.candidate_words(bigint, bigint) to authenticated;

-- ============================================================
-- freebee.create_game — mode is a positional arg
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
-- setup field — it routes the gametype string ('freebee_' ||
-- mode) and drives the per-mode player-count floor. setup.mode is
-- REJECTED if present (catch a confused FE that still embeds it).
--
-- Board shape (built by the freebee-build-board edge function):
--   {
--     "outer_letters": "abcdef",            -- 6 distinct lowercase
--     "center_letter": "g",                 -- 1 lowercase
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
-- The center letter, dot, then the 6 outer letters alphabetized.
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
--   - board.outer_letters must be 6 distinct lowercase ASCII
--     letters (not 's')
--   - board.center_letter must be 1 lowercase ASCII letter
--     (not 's', and not present among outer_letters)
--   - board.required_words_count must be ≥ 30 (the puzzle-quality gate
--     the edge function already applies; recheck here so a
--     misbehaving builder can't sneak a degenerate puzzle past)
--   - board.required_words / board.bonus_words must be arrays

create function freebee.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  new_id uuid;
  s_target_rank int;
  b_outer text;
  b_center text;
  b_required_words_score int;
  b_required_words_count int;
  game_title text;
  effective_gametype text;
begin
  perform common.require_club_member(target_club);

  -- ─── Validate mode + player-count ────────────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this is the
    -- server-side catch. Matches psychicnum + wordknit.
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

  perform common.validate_timer(setup->'timer');

  -- ─── Board structure validation ──────────────────────────
  b_outer := board->>'outer_letters';
  b_center := board->>'center_letter';

  if b_outer is null or length(b_outer) <> 6 then
    raise exception 'board.outer_letters must be 6 characters (got %)',
                    coalesce(length(b_outer)::text, 'null')
      using errcode = 'P0001';
  end if;
  if b_outer !~ '^[a-rt-z]{6}$' then
    -- ^[a-rt-z]{6}$ = lowercase ASCII letters minus 's' (which
    -- the puzzle rule excludes). A regex is more compact than
    -- enumerating the alphabet, and the failure message names
    -- the intent.
    raise exception 'board.outer_letters must be 6 lowercase ASCII letters excluding s'
      using errcode = 'P0001';
  end if;
  -- 6 DISTINCT: cardinality of the deduplicated character set.
  if cardinality(string_to_array(b_outer, null)) <>
     cardinality(array(select distinct unnest(string_to_array(b_outer, null)))) then
    raise exception 'board.outer_letters must be 6 distinct letters'
      using errcode = 'P0001';
  end if;

  if b_center is null or length(b_center) <> 1 then
    raise exception 'board.center_letter must be 1 character'
      using errcode = 'P0001';
  end if;
  if b_center !~ '^[a-rt-z]$' then
    raise exception 'board.center_letter must be a lowercase ASCII letter excluding s'
      using errcode = 'P0001';
  end if;
  if position(b_center in b_outer) > 0 then
    raise exception 'board.center_letter must not appear in board.outer_letters'
      using errcode = 'P0001';
  end if;

  b_required_words_score := (board->>'required_words_score')::int;
  b_required_words_count := (board->>'required_words_count')::int;
  if b_required_words_count < 30 then
    raise exception 'board.required_words_count must be ≥ 30 (got %); the edge function''s ≥30 gate must agree',
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
  effective_gametype := 'freebee_' || mode;

  -- ─── Coordinate with common.create_game ──────────────────
  -- Inserts common.games (is_current_view=true, play_state=
  -- 'playing'), validates player_user_ids are all in
  -- clubs_members, inserts common.game_players. Returns the
  -- canonical id we'll FK from.
  --
  -- Saved-default arg: persist the whole setup as the club's
  -- next default. target_rank + timer are all things a friend
  -- group settles on; no point asking again next time.
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup,
    setup
  );

  -- ─── Insert the per-gametype row, now with mode ──────────
  insert into freebee.games (
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
    -- jsonb-array → text[] coercion: extract each element as
    -- text, aggregate to array. NULL safety: empty arrays
    -- still produce text[] of length 0 (not null), so the
    -- column's NOT NULL constraint is satisfied.
    coalesce(
      array(select jsonb_array_elements_text(board->'bonus_words')),
      array[]::text[]
    )
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

revoke execute on function freebee.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function freebee.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- freebee.submit_word
-- ============================================================
-- The only mid-game action. Validates the word in the order
-- freebee-ws uses (chosen so each rejection gives the friendliest
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
-- Mode comes off freebee.games.mode (which we already lock with
-- FOR UPDATE) — one fewer cross-schema read per submission than
-- digging into common.games.setup.
--
-- Returns jsonb `{ result, points }` rather than a bare result enum,
-- so the FE can show points earned (and call out a pangram) in the
-- entry feedback WITHOUT re-deriving the point/pangram rules on the
-- client. The `result` vocabulary gains `'pangram'` (a required OR
-- bonus word using all 7 letters; takes precedence over the
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
-- SELECT … FOR UPDATE on the freebee.games row serializes
-- concurrent submissions. The PK on found_words is the
-- (game_id, user_id, word) triple, so a same-player double-
-- submit of the same word is also caught at the constraint
-- level if the lock somehow missed it.

create function freebee.submit_word(
  target_game uuid,
  word text
)
returns jsonb
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row freebee.games%rowtype;
  current_play_state text;
  current_target_rank int;
  w_lower text;
  w_mask bigint;
  puzzle_mask bigint;
  center_bit bigint;
  i int;
  required_entry jsonb;
  word_points int;
  word_is_pangram boolean;
  word_is_bonus boolean;
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
  select * into g_row from freebee.games
   where freebee.games.id = target_game
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

  -- ─── Normalize + letter-mask the input word ──────────────
  w_lower := lower(coalesce(word, ''));

  -- (1) tooShort
  if length(w_lower) < 4 then
    return jsonb_build_object('result', 'tooShort', 'points', 0);
  end if;

  -- Compute the word's letter_mask. Loop over each character;
  -- bail out non-letters early (those automatically lead to
  -- badLetters since the puzzle's mask is letters-only).
  w_mask := 0;
  for i in 1..length(w_lower) loop
    declare
      ch text := substr(w_lower, i, 1);
      code int := ascii(ch);
    begin
      if code < 97 or code > 122 then
        return jsonb_build_object('result', 'badLetters', 'points', 0);
      end if;
      w_mask := w_mask | (1::bigint << (code - 97));
    end;
  end loop;

  -- Compute the puzzle mask (union of outer + center) and the
  -- center bit. Cheap — 7 bit-ORs in PL/pgSQL.
  puzzle_mask := 0;
  for i in 1..length(g_row.outer_letters) loop
    puzzle_mask := puzzle_mask
                 | (1::bigint << (ascii(substr(g_row.outer_letters, i, 1)) - 97));
  end loop;
  center_bit := 1::bigint << (ascii(g_row.center_letter) - 97);
  puzzle_mask := puzzle_mask | center_bit;

  -- (2) badLetters
  if (w_mask & ~puzzle_mask) <> 0 then
    return jsonb_build_object('result', 'badLetters', 'points', 0);
  end if;

  -- (3) missingCenter
  if (w_mask & center_bit) = 0 then
    return jsonb_build_object('result', 'missingCenter', 'points', 0);
  end if;

  -- (4) notAWord — look up in cached lists. The required-words
  -- lookup gives us back points + is_pangram for the insert.
  word_is_bonus := false;
  word_points := 0;
  word_is_pangram := false;

  select rw into required_entry
    from jsonb_array_elements(g_row.required_words) rw
   where rw->>'word' = w_lower
   limit 1;

  if found then
    word_points := (required_entry->>'points')::int;
    word_is_pangram := (required_entry->>'is_pangram')::boolean;
  elsif w_lower = any(g_row.bonus_words) then
    -- Bonus words score the SAME as required words: length-based
    -- (1 pt for 4-letter, length pts for ≥5), plus the +10 pangram
    -- bonus when distinct(letters) = 7. This matches freebee-ws's
    -- `scoreWord(w)` semantics (server/game.js:4-8). A bonus word
    -- is legal but not in the required set; it still counts toward
    -- found_words_count and found_words_score (so the "X / Y words"
    -- numerator can overshoot Y), it just doesn't move the required
    -- goal (required_words_count / required_words_score).
    --
    -- Pangram detection by the word's OWN mask popcount, not a
    -- precomputed flag — bonus words have no required-words entry to
    -- read it from, and freebee-ws likewise reads it from the word
    -- at submit time (sessions.js:989: `new Set(w).size===7`).
    word_is_bonus := true;
    word_is_pangram := (
      select count(distinct c) = 7
        from regexp_split_to_table(w_lower, '') c
    );
    if length(w_lower) = 4 then
      word_points := 1;
    else
      word_points := length(w_lower);
    end if;
    if word_is_pangram then
      word_points := word_points + 10;
    end if;
  else
    return jsonb_build_object('result', 'notAWord', 'points', 0);
  end if;

  -- (5) alreadyFound (per mode rule, reading off g_row.mode)
  -- Table alias `fw` is mandatory: the function parameter is
  -- also named `word`, and PL/pgSQL's column-resolution rule
  -- raises "column reference word is ambiguous" without the
  -- alias even though we mean `w_lower` below.
  if g_row.mode = 'coop' then
    select count(*) into duplicate_count
      from freebee.found_words fw
     where fw.game_id = target_game and fw.word = w_lower;
  else
    select count(*) into duplicate_count
      from freebee.found_words fw
     where fw.game_id = target_game
       and fw.user_id = caller_id
       and fw.word = w_lower;
  end if;
  if duplicate_count > 0 then
    return jsonb_build_object('result', 'alreadyFound', 'points', 0);
  end if;

  -- ─── Insert the row ──────────────────────────────────────
  insert into freebee.found_words
    (game_id, user_id, word, points, is_pangram, is_bonus)
  values
    (target_game, caller_id, w_lower, word_points, word_is_pangram, word_is_bonus);

  -- ─── Recompute aggregates + status (no terminal in coop) ─
  -- Coop submissions never end the game — coop only ends via
  -- timer expiry or the manual End-game menu item. Players can
  -- keep finding bonus words past the displayed `Y / required_words_count`
  -- denominator and the score can overshoot `required_words_score` (the
  -- freebee-ws design — see the bonus-scoring write-up above).
  if g_row.mode = 'coop' then
    select coalesce(sum(points), 0),
           count(*)
      into team_score, team_found_words_count
      from freebee.found_words
     where game_id = target_game;
    team_rank_idx := freebee._rank_idx(team_score, g_row.required_words_score);

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
    -- freebee-ws "found.length" stat. The target-rank check
    -- below uses caller_score (which already includes bonus
    -- points after the bonus-scoring fix in the validation
    -- block above), so a player who finds bonus pangrams can
    -- legitimately rocket past target faster than the displayed
    -- max score would suggest.
    select coalesce(sum(points), 0),
           count(*)
      into caller_score, caller_found_words_count
      from freebee.found_words
     where game_id = target_game and user_id = caller_id;
    caller_rank_idx := freebee._rank_idx(caller_score, g_row.required_words_score);

    if caller_rank_idx >= current_target_rank then
      -- Compete win: caller hit the target rank first. Freeze the
      -- leaderboard at the moment of victory.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', p.user_id,
                 'found_words_score', coalesce(p.found_words_score, 0),
                 'rank_idx', freebee._rank_idx(coalesce(p.found_words_score, 0), g_row.required_words_score),
                 'found_words_count', coalesce(p.found_words_count, 0)
               )
             )
        into player_results
        from (
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as found_words_score,
                 -- All rows (required + bonus) to mirror freebee-ws's
                 -- found.length stat surfaced in the leaderboard
                 -- display. Scoring-only count would diverge from
                 -- what the player sees in their own Stats card.
                 count(fw.word)::int as found_words_count
            from common.game_players gp
            left join freebee.found_words fw
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
                 'rank_idx', freebee._rank_idx(p.found_words_score, g_row.required_words_score),
                 'found_words_count', p.found_words_count
               )
             )
        into player_results
        from (
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as found_words_score,
                 -- All rows (required + bonus) to mirror freebee-ws's
                 -- found.length stat surfaced in the leaderboard
                 -- display. Scoring-only count would diverge from
                 -- what the player sees in their own Stats card.
                 count(fw.word)::int as found_words_count
            from common.game_players gp
            left join freebee.found_words fw
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

  -- A pangram (required OR bonus) reports as 'pangram' so the FE can call it
  -- out; otherwise the accepted/bonus split (which the FE renders identically).
  -- `points` is the authoritative value already stored on the row.
  return jsonb_build_object(
    'result',
    case
      when word_is_pangram then 'pangram'
      when word_is_bonus then 'bonus'
      else 'accepted'
    end,
    'points', word_points
  );
end;
$$;

revoke execute on function freebee.submit_word(uuid, text) from public;
grant execute on function freebee.submit_word(uuid, text) to authenticated;

-- ============================================================
-- freebee.submit_timeout
-- ============================================================
-- Fired by the FE when the count-down timer hits 0. Flips the
-- game to 'ended' with outcome='timeout'. Multiple peers may
-- race the expiry; the SELECT ... FOR UPDATE serializes them
-- and the post-lock play_state check rejects everyone after
-- the first with P0001 (which the FE swallows silently).
--
-- Mode comes off freebee.games.mode. This is identical in shape
-- to wordknit / psychicnum's submit_timeout, just with freebee's
-- status payload.
--
-- ───────────────────────────────────────────────────────────
-- The Realtime touch at the bottom
-- ───────────────────────────────────────────────────────────
-- common.end_game flips common.games.play_state='ended' and
-- is_terminal=true. The FE's useCommonGame hook (subscribed to
-- common.games) sees that and enters review mode. BUT the FE's
-- per-gametype useGame hook subscribes to freebee.{games,
-- found_words} and reads from games_state for the required_words
-- reveal. submit_timeout writes no found_words row
-- (no submission happened), so without a write to a freebee table
-- no Realtime event fires on the freebee channel, useGame never
-- refetches, and game.requiredWords stays at its pre-terminal null.
--
-- Fix: a no-op UPDATE on freebee.games after the terminal flip.
-- `set club_handle = club_handle` changes no column, but Postgres
-- MVCC still writes a new row version (Realtime watches WAL, not
-- changed-column diffs), so the subscriber wakes up and refetches
-- games_state — which now sees is_terminal=true and returns the
-- populated wordlists. (submit_word's 100%-found path doesn't need
-- this because its found_words INSERT already fires the event.)

create function freebee.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  g_row freebee.games%rowtype;
  current_play_state text;
  team_score int;
  team_found_words_count int;
  player_results jsonb;
begin
  select * into g_row from freebee.games
   where freebee.games.id = target_game
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
    -- live Stats card (freebee-ws semantics — see submit_word
    -- for the rationale).
    select coalesce(sum(points), 0),
           count(*)
      into team_score, team_found_words_count
      from freebee.found_words
     where game_id = target_game;

    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'finished', true,
               'team_score', team_score,
               'team_rank_idx',
                 freebee._rank_idx(team_score, g_row.required_words_score)
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
        'rank_idx', freebee._rank_idx(team_score, g_row.required_words_score),
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
               'rank_idx', freebee._rank_idx(p.found_words_score, g_row.required_words_score)
             )
           )
      into player_results
      from (
        select gp.user_id,
               coalesce(sum(fw.points), 0)::int as found_words_score
          from common.game_players gp
          left join freebee.found_words fw
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

  -- Realtime touch — see the file header for the full
  -- explanation. The self-set is a no-op semantically but
  -- produces a WAL entry Realtime picks up, waking the FE's
  -- useGame subscription so it refetches games_state and sees
  -- the now-revealed required_words.
  update freebee.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function freebee.submit_timeout(uuid) from public;
grant execute on function freebee.submit_timeout(uuid) to authenticated;

-- ============================================================
-- freebee.end_game — manual stop
-- ============================================================
--
-- Unlike tinyspy / psychicnum / wordknit, freebee has no
-- intrinsic "you lost" or "you won" terminal state in coop: the
-- only automatic terminals are the compete first-to-target-rank
-- (handled inside submit_word as outcome='won_compete') and the
-- countdown timer expiring (handled by submit_timeout with
-- outcome='timeout'). For all other cases the friends are
-- expected to play until they're satisfied with their rank and
-- then explicitly stop the game.
--
-- This RPC is that explicit stop. The FE's GamePage menu has an
-- "End game" item (per-game, declared by freebee's PlayArea via
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
-- The Realtime touch on freebee.games is the same trick
-- documented in submit_timeout — needed because common.end_game
-- writes to common.games but the FE's useGame subscribes to
-- freebee.games + freebee.found_words.

create function freebee.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  g_row freebee.games%rowtype;
  current_play_state text;
  team_score int;
  team_found_words_count int;
  player_results jsonb;
begin
  select * into g_row from freebee.games
   where freebee.games.id = target_game
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
    -- All-rows count for display, matching freebee-ws.
    select coalesce(sum(points), 0),
           count(*)
      into team_score, team_found_words_count
      from freebee.found_words
     where game_id = target_game;

    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'finished', true,
               'team_score', team_score,
               'team_rank_idx',
                 freebee._rank_idx(team_score, g_row.required_words_score)
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
        'rank_idx', freebee._rank_idx(team_score, g_row.required_words_score),
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
               'rank_idx', freebee._rank_idx(p.found_words_score, g_row.required_words_score)
             )
           )
      into player_results
      from (
        select gp.user_id,
               coalesce(sum(fw.points), 0)::int as found_words_score
          from common.game_players gp
          left join freebee.found_words fw
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

  -- Realtime touch — same trick as submit_timeout. common.end_game
  -- writes to common.games; we need a write on freebee.games so
  -- the FE's freebee-channel useGame subscription wakes up and
  -- refetches games_state. The self-set is a no-op semantically
  -- but produces a WAL entry Realtime picks up.
  update freebee.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function freebee.end_game(uuid) from public;
grant execute on function freebee.end_game(uuid) to authenticated;
