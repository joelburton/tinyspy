-- ============================================================
-- spellingbee — NYT-Spelling-Bee-style word finder (consolidated)
-- ============================================================
--
-- A honeycomb of 7 distinct letters (1 center + 6 outer); players
-- form words from those letters; each word must include the
-- center. Pangrams (words using all 7) earn a +10 bonus. The word
-- list is common.words (the categorized master list shared across
-- games); spellingbee filters it into a smaller REQUIRED set (the goal
-- shown to players: difficulty band <= 3, american, no slang, no
-- slurs) and a larger LEGAL set (band <= 5, the acceptance bar, no
-- other restriction). Words in legal but not required are BONUS:
-- accepted and scored, but not part of the displayed goal.
--
-- "spellingbee" is the codename. User-facing copy is "spellingbee"; SQL /
-- TypeScript / folder names are all `spellingbee`. Ported from the
-- standalone codebase at ~/spellingbee-ws; this monorepo replaces the
-- websocket / session / chat / presence machinery with Supabase
-- Realtime + the PuzPuzPuz common shell.
--
-- This file is the squashed, build-from-scratch form of the
-- spellingbee schema: the full final state (schema, RLS, the
-- FE-shipped word lists, RPCs) with coop + compete shipped as a
-- sibling-manifest pair (`spellingbee_coop` + `spellingbee_compete`
-- gametypes, a denormalized `mode` column on spellingbee.games, and a
-- `mode` arg on create_game). Same pattern psychicnum and connections
-- follow.
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- require_valid_timer). Per the removability invariant in
-- docs/common.md, common MUST NOT reference spellingbee back.
--
-- See docs/games/spellingbee.md for the full feature picture and the
-- rules-of-the-game spec.

-- ============================================================
-- Schema + usage grants
-- ============================================================

create schema if not exists spellingbee;

-- ============================================================
-- The word reference lives in common.words
-- ============================================================
-- spellingbee's word reference is the shared common.words master list,
-- not a spellingbee table — every word game filters the same
-- categorized source. spellingbee's slice is computed on the fly in
-- spellingbee.candidate_words (below): legal = difficulty <= 5,
-- required = difficulty <= 3 AND american AND NOT slang AND clean
-- (slur = 0 AND crude = 0), len >= 4. The `letter_mask & ~puzzle_mask = 0` subset
-- test (every letter of the word is in the puzzle) reads the
-- generated common.words.letter_mask column — same bit convention.
--
-- No spellingbee-specific index on common.words: the candidate_words
-- filter (difficulty/dialect/len) selects ~a third of the table, a
-- selectivity at which Postgres prefers a seq-scan-with-filter over
-- a btree anyway (the bitwise subset test isn't sargable). It runs
-- in tens of ms, a handful of times per board build. See
-- candidate_words for the measured rationale.

-- ============================================================
-- spellingbee.pangrams — the board-seed pool
-- ============================================================
-- A valid spellingbee board needs to contain at least one pangram
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
-- (band <= 3, american, no slang, clean: slur 0 + crude 0) fit it, and keep only
-- seeds with >= 30 so no board is thin. See
-- import-spellingbee-pangrams.ts and docs/games/spellingbee.md.
--
-- The edge function samples from this table — one short query, no
-- rejection loops over the whole word list on each board build.
-- See docs/games/spellingbee.md → "Why a seeds table?" for the longer
-- explanation. Rebuilt by import-spellingbee-pangrams.ts (after
-- words:import has loaded common.words).
--
-- has_rare_letters drives the "diverse" builder's weighting:
-- masks containing any of {j, q, x, z} (very rare) or
-- {k, v, w, y} (somewhat rare) get duplicated in the sampler
-- so they're picked more often than their natural frequency
-- would warrant. Otherwise nearly every board would contain
-- only common letters (e, a, i, r, t, …). Precomputed once at
-- import time.

create table spellingbee.pangrams (
  mask                 bigint primary key,    -- 7 bits set; a valid board seed
  required_words_count int not null,          -- count of required words that fit this mask
  has_rare_letters     boolean not null       -- weighting tier for the diverse builder
);

-- ============================================================
-- spellingbee.games — one row per playthrough
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
-- See docs/games/spellingbee.md.

create table spellingbee.games (
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
  -- ─── The two word lists shipped to the FE ────────────────
  -- Both jsonb arrays of { "word": text, "points": int, "is_pangram": bool }.
  -- The FE validates + scores a guess against required ∪ bonus locally (no server
  -- round-trip), so both carry points + the pangram flag. Built by the edge
  -- function (via candidate_words over common.words) and handed to create_game.
  --   required_words: the displayed goal set (drives the rank ladder + the
  --     missed-words reveal, which is required-only).
  --   bonus_words: the legal − required set (accepted + scored, not the goal).
  -- Neither is hidden — the trust model doesn't withhold them (friends, not
  -- anti-cheat); see docs/games/spellingbee.md.
  required_words jsonb not null,
  bonus_words jsonb not null,
  created_at timestamptz not null default now(),
  -- Sibling-manifest mode axis. CHECK constrains it to the two
  -- valid values; the gametype string ('spellingbee_coop' /
  -- 'spellingbee_compete') and this column agree by construction in
  -- create_game.
  mode text not null check (mode in ('coop', 'compete'))
);

create index spellingbee_games_club_handle_idx on spellingbee.games (club_handle);

-- ============================================================
-- spellingbee.found_words — append-only log of accepted submissions
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

create table spellingbee.found_words (
  game_id    uuid not null
    references spellingbee.games(id) on delete cascade,
  user_id    uuid not null
    references common.profiles(user_id) on delete cascade,
  word       text not null,
  points     int not null,               -- length-based (+10 pangram); bonus words score too
  is_pangram boolean not null,
  is_bonus   boolean not null,           -- in the bonus set (legal − required); shown with a dot
  found_at   timestamptz not null default now(),
  primary key (game_id, user_id, word)
);

create index spellingbee_found_words_game_id_idx
  on spellingbee.found_words (game_id);

-- ============================================================
-- RLS
-- ============================================================

alter table spellingbee.games enable row level security;
alter table spellingbee.found_words enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- BOTH found_words and games are published, and BOTH must be — useGame
-- subscribes to postgres_changes on each:
--   - found_words is the live data: every accepted submission appends a row that
--     peers' useGame hooks refetch on.
--   - games carries no mid-play column changes, BUT replay_board does a no-op
--     UPDATE on it as a realtime "touch": replay only DELETEs found_words rows,
--     and postgres_changes filters don't reliably match DELETEs, so the games
--     write is what wakes every client to refetch the now-empty list.
--
-- Publishing games is NOT optional cleanup: Realtime authorizes a channel's
-- postgres_changes bindings at JOIN time and rejects the WHOLE subscription if
-- ANY bound table isn't in the publication. So a games subscription against an
-- unpublished games table kills found_words delivery too — live updates die
-- silently (writes persist, only a manual refresh shows them). spellingbee's
-- schema_test asserts both memberships to guard against a dropped line.
-- (This bit us as a regression once the Realtime image began enforcing that
-- rule; before, an unpublished-table binding was ignored and found_words still
-- flowed. boggle published both from the start; spellingbee had only found_words.)

alter publication supabase_realtime add table spellingbee.games;
alter publication supabase_realtime add table spellingbee.found_words;

-- ============================================================
-- Register spellingbee with common.gametypes
-- ============================================================
-- Sibling-manifest pair: coop and compete are two distinct
-- gametype rows sharing this one schema. create_club seeds new
-- clubs with both; create_game routes to one via the mode arg.

insert into common.gametypes (gametype, min_players) values
  ('spellingbee_coop', 1),
  ('spellingbee_compete', 2)
on conflict do nothing;
