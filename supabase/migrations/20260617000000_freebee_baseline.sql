-- ============================================================
-- freebee — NYT-Spelling-Bee-style word finder (Phase 1: schema)
-- ============================================================
--
-- A honeycomb of 7 distinct letters (1 center + 6 outer); players
-- form words from those letters; each word must include the
-- center. Pangrams (words using all 7) earn a +10 bonus. The
-- shared dictionary is split into a smaller scoring set and a
-- larger legal-only set (bonus words).
--
-- "freebee" is the codename. User-facing copy is "freebee"; SQL /
-- TypeScript / folder names are all `freebee`. Ported from the
-- standalone codebase at ~/freebee-ws; this monorepo replaces the
-- websocket / session / chat / presence machinery with Supabase
-- Realtime + the pupgames common shell.
--
-- ┌─ Phase 1 scope (this migration) ───────────────────────┐
-- │ - Schema + grants + RLS + realtime publication         │
-- │ - Hidden-wordlist pattern (column-grant +              │
-- │   games_state view + _reveal_if_terminal helpers),     │
-- │   modeled on psychicnum's _target_for                  │
-- │ - RLS designed for COMPETE mode from day one (the      │
-- │   policy has the OR branches), even though v1 ships    │
-- │   co-op only                                           │
-- │ - Register `freebee` in common.gametypes               │
-- │                                                        │
-- │ NOT in this migration (later phases):                  │
-- │ - RPCs (create_game, submit_word, submit_timeout) —    │
-- │   Phase 2                                              │
-- │ - Edge function for board-build — Phase 2              │
-- │ - FE — Phases 3-5                                      │
-- └────────────────────────────────────────────────────────┘
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes). Per the removability invariant in
-- docs/common.md, common MUST NOT reference freebee back.
--
-- See docs/freebee.md for the full feature picture and the
-- rules-of-the-game spec.

-- ============================================================
-- Schema + usage grants
-- ============================================================

create schema if not exists freebee;
grant usage on schema freebee to authenticated;

-- The import script (supabase/scripts/import-freebee-
-- dictionary.ts) connects as service_role and needs USAGE on
-- the schema + INSERT on `dictionary` + `pangrams`.
grant usage on schema freebee to service_role;

-- ============================================================
-- freebee.dictionary — the global word reference
-- ============================================================
-- ~150k rows (after normalization: lowercase ASCII, ≥4 chars,
-- no 's'). One row per word, with two booleans capturing which
-- dictionary tier the word lives in:
--
--   in_scoring  Word is in the smaller, higher-quality SCOWL-50
--               set. Earns points and contributes to rank.
--   in_legal    Word is in the larger SCOWL-80 set (a superset
--               of scoring). Words with in_legal=true and
--               in_scoring=false are "bonus" words: accepted by
--               submit_word but worth 0 points and don't move
--               rank. The FE shows them with a `bonus` marker.
--
-- The `letter_mask` column is a 26-bit set: bit `n` is on iff
-- letter `'a' + n` appears in the word. Encoded once at import
-- time so submit_word and the edge function don't have to scan
-- each character. The expression
--
--     dictionary.letter_mask & ~puzzle_mask = 0
--
-- is true iff every letter of the word is in the puzzle — the
-- exact "uses only puzzle letters" test that scoring needs.
--
-- ───────────────────────────────────────────────────────────
-- Why not store words containing 's'? freebee's puzzle generator
-- never produces a board that contains 's' (the rule from the
-- original NYT game — 's' makes pluralization too easy and
-- inflates word counts). So no s-containing word can ever be a
-- legal submission. Filtering at import time saves storage and
-- speeds up every lookup. See `isValidPuzzleMask` in
-- ~/freebee-ws/server/game.js for the upstream rule's history.

create table freebee.dictionary (
  word         text primary key,        -- lowercase ASCII, ≥4 chars, no 's'
  letter_mask  bigint not null,         -- 26-bit set of letters used in `word`
  in_scoring   boolean not null,        -- in SCOWL-50: counts for score+rank
  in_legal     boolean not null         -- in SCOWL-80: accepted as bonus if not scoring
);

-- The hot lookup path is "given a puzzle mask, find every word
-- whose mask is a subset of it." The mask-only index supports a
-- pre-filter by bit-pattern (we still verify with `& ~mask = 0`
-- in the predicate, but the index narrows the candidate rows).
-- WHERE in_legal because in_legal=false rows never matter — a
-- non-legal word is not in the dictionary at all from the
-- game's POV.
create index freebee_dictionary_mask_idx
  on freebee.dictionary (letter_mask)
  where in_legal;

-- ============================================================
-- freebee.pangrams — the board-seed pool
-- ============================================================
-- A valid freebee board needs to contain at least one pangram
-- (a word using all 7 distinct letters of the board). Random
-- 7-letter sets MOSTLY don't have a pangram in the dictionary —
-- so generating boards by "pick 7 random letters and check"
-- wastes thousands of attempts.
--
-- The flip: start from known pangrams. Scan the scoring
-- dictionary for every 7-distinct-letter word, dedupe by
-- letter-mask, store the resulting masks here. Each row is a
-- guaranteed-valid board seed: at least one pangram exists
-- (we found it during the scan), and we precompute the count
-- of scoring words that fit the mask for the ≥30-words gate.
--
-- The edge function (Phase 2) samples from this table — one
-- short query, no rejection loops over the full dictionary on
-- each board build. See docs/freebee.md → "Why a seeds table?"
-- for the longer explanation.
--
-- has_rare_letters drives the "diverse" builder's weighting:
-- masks containing any of {j, q, x, z} (very rare) or
-- {k, v, w, y} (somewhat rare) get duplicated in the sampler
-- so they're picked more often than their natural frequency
-- would warrant. Otherwise nearly every board would contain
-- only common letters (e, a, i, r, t, …). Precomputed once at
-- import time.

create table freebee.pangrams (
  mask              bigint primary key,    -- 7 bits set; a valid board seed
  scoring_words     int not null,          -- count of scoring words that fit this mask
  has_rare_letters  boolean not null       -- weighting tier for the diverse builder
);

-- Both reference tables: public reference data, no RLS, but
-- only `service_role` gets INSERT.
grant select on freebee.dictionary to authenticated;
grant select on freebee.pangrams   to authenticated;
-- service_role needs SELECT alongside INSERT — PostgREST inspects
-- the table catalog during request handling, and an upsert with
-- a missing select grant fails even when the request body doesn't
-- ask for returned rows. Matches the wordknit.puzzles grant shape.
grant insert, select on freebee.dictionary to service_role;
grant insert, select on freebee.pangrams   to service_role;

-- ============================================================
-- freebee.games — one row per playthrough
-- ============================================================
-- `id` is FK to `common.games(id)` — the canonical id is
-- generated by `common.create_game` and passed in (Phase 2).
-- ON DELETE CASCADE means a row here goes away if its
-- common.games parent is deleted (e.g., gametype unregistered).
--
-- club_id is denormalized from common.games.club_id so the RLS
-- policy can `is_club_member(club_id)` without a join. Safe —
-- club_id is set at create-game time and never changes.
--
-- ───────────────────────────────────────────────────────────
-- The "hidden wordlists" trick
-- ───────────────────────────────────────────────────────────
-- `scoring_words` and `legal_words` ARE the answer keys. They
-- must be hidden during play (otherwise devtools = puzzle
-- solved) but revealed post-terminal for the FE's end-of-game
-- "here are the words you missed" display.
--
-- Two layers, same pattern as psychicnum.games.target:
--   (1) Column-level grant on this base table omits both columns
--       from the `authenticated` role's SELECT. A direct
--       `SELECT scoring_words FROM freebee.games` returns
--       42501 permission denied for column scoring_words.
--   (2) `freebee.games_state` view (below) calls SECURITY
--       DEFINER helpers that bypass the column grant and apply
--       a CASE on common.games.is_terminal. Pre-terminal:
--       returns NULL. Post-terminal: returns the actual list.
--
-- The FE only ever reads from games_state, never from games
-- directly. See docs/freebee.md → "The hidden-wordlist
-- pattern" + docs/code-conventions.md → "SECURITY DEFINER
-- helper + security_invoker view" for the wider context.

create table freebee.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_id uuid not null references common.clubs(id) on delete cascade,
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
  -- means submit_word doesn't need to scan the dictionary on
  -- every guess to recompute "the max."
  total_score int not null,
  total_words int not null,             -- count of scoring words
  -- ─── Hidden columns (see "hidden wordlists" above) ───────
  -- scoring_words shape: jsonb array of
  --     { "word": text, "points": int, "is_pangram": bool }
  -- legal_words: text[] of bonus-only words (legal but not
  -- scoring). Both populated by create_game from the dictionary.
  scoring_words jsonb not null,
  legal_words text[] not null,
  created_at timestamptz not null default now()
);

create index freebee_games_club_id_idx on freebee.games (club_id);

-- Column-level grant: every column EXCEPT the two hidden ones.
-- The presence of any column-level grant on a table changes
-- the access semantics from "all columns visible" to "only
-- granted columns visible," so we have to enumerate the safe
-- ones explicitly. Per docs/code-conventions.md → "Avoid
-- SELECT *", explicit column lists are the convention anyway.
grant select
  (id, club_id, outer_letters, center_letter,
   total_score, total_words, created_at)
  on freebee.games to authenticated;

-- ============================================================
-- freebee.found_words — append-only log of accepted submissions
-- ============================================================
-- One row per (player, word). Carrying user_id from day one
-- (even though co-op v1 treats the team as the unit) makes
-- compete mode a non-event later: in compete each player
-- independently finds words, and the RLS policy below already
-- narrows by user_id during play.
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
-- The mode branching lives in submit_word (Phase 2); the PK
-- supports both shapes without a schema change.

create table freebee.found_words (
  game_id    uuid not null
    references freebee.games(id) on delete cascade,
  user_id    uuid not null
    references common.profiles(user_id) on delete cascade,
  word       text not null,
  points     int not null,               -- 0 if is_bonus, else word-length-based
  is_pangram boolean not null,
  is_bonus   boolean not null,           -- legal-but-not-scoring: 0 points
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
  using (common.is_club_member(club_id));

-- found_words RLS is the load-bearing piece for compete.
-- WRITTEN FOR BOTH MODES FROM DAY ONE — see docs/freebee.md →
-- "Designing for compete." Three OR branches, in evaluation
-- order:
--
--   (1) mode='coop' — everyone in the club sees everyone's
--       finds. v1 only ever hits this branch.
--   (2) user_id = auth.uid() — you always see your own finds.
--       In compete mid-game, this is your private list.
--   (3) is_terminal — once the game ends, everyone sees
--       everyone's finds (the "what I missed" reveal in
--       compete; harmless in coop since (1) already covered it).
--
-- Club membership is the outer gate; the mode/visibility
-- discrimination is the inner condition.
create policy found_words_select on freebee.found_words
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = found_words.game_id
         and common.is_club_member(cg.club_id)
         and (
              cg.setup->>'mode' = 'coop'
           or found_words.user_id = auth.uid()
           or cg.is_terminal
            )
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the
-- security-definer RPCs (Phase 2).

-- ============================================================
-- Hidden-wordlist helpers + games_state view
-- ============================================================
-- Two SECURITY DEFINER helpers, one per hidden column. Each
-- reads the column directly (running as `postgres` bypasses
-- the column grant) and applies the same CASE on
-- common.games.is_terminal: pre-terminal returns NULL; post-
-- terminal returns the actual value.
--
-- Both helpers are revoked from `public` and granted nothing
-- to `authenticated` — they're callable only from within the
-- view (which itself runs as `authenticated` and chains into
-- the helper's `postgres` identity via SECURITY DEFINER).
-- See docs/code-conventions.md → "SECURITY DEFINER helper +
-- security_invoker view" for the recipe.

create function freebee._scoring_words_for(g uuid)
returns jsonb
language sql
security definer
stable
set search_path = freebee, common, public, extensions
as $$
  select case when c.is_terminal then p.scoring_words end
    from freebee.games p
    join common.games c on c.id = p.id
   where p.id = g;
$$;

create function freebee._legal_words_for(g uuid)
returns text[]
language sql
security definer
stable
set search_path = freebee, common, public, extensions
as $$
  select case when c.is_terminal then p.legal_words end
    from freebee.games p
    join common.games c on c.id = p.id
   where p.id = g;
$$;

revoke execute on function freebee._scoring_words_for(uuid) from public;
revoke execute on function freebee._legal_words_for(uuid)   from public;
-- Grant EXECUTE to authenticated so the games_state view (which
-- runs with the caller's identity under security_invoker=true)
-- can call into these helpers. The helpers' SECURITY DEFINER
-- property switches identity to postgres *inside* the call —
-- that's the bit that lets them read the column-grant-blocked
-- scoring_words / legal_words columns.
grant execute on function freebee._scoring_words_for(uuid) to authenticated;
grant execute on function freebee._legal_words_for(uuid)   to authenticated;

-- The view. `security_invoker = true` means RLS on the base
-- table evaluates as the caller (so games_select still gates
-- row visibility). Column exposure is gated by the helper's
-- CASE. Net effect: a single FE query returns the game row
-- with `scoring_words` and `legal_words` populated post-
-- terminal, NULL during play.

create view freebee.games_state with (security_invoker = true) as
select
  g.id,
  g.club_id,
  g.outer_letters,
  g.center_letter,
  g.total_score,
  g.total_words,
  g.created_at,
  freebee._scoring_words_for(g.id) as scoring_words,
  freebee._legal_words_for(g.id)   as legal_words
  from freebee.games g;

grant select on freebee.games_state to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- found_words is the high-traffic table: every accepted
-- submission appends a row that every connected peer's
-- useGame hook refetches on. games is published because the
-- terminal flip — when scoring_words materializes through the
-- view — is something the FE wants to react to (refetch
-- games_state to pick up the reveal). The flip itself happens
-- on common.games (already published), but useGame
-- subscribes to freebee tables; a touch-update on
-- freebee.games inside submit_word's terminal path (Phase 2)
-- will make the refetch fire.

alter publication supabase_realtime add table freebee.games;
alter publication supabase_realtime add table freebee.found_words;

-- ============================================================
-- Register freebee with common.gametypes
-- ============================================================

insert into common.gametypes (gametype) values ('freebee')
on conflict do nothing;
