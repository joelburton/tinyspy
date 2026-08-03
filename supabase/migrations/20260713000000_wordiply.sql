-- ============================================================
-- wordiply — Guardian-Wordiply-style base-word extender (WordWire)
-- ============================================================
--
-- The system picks a short BASE — a 2–4 letter COMBINATION OF LETTERS,
-- NOT necessarily a real word (e.g. 'ar', 'owl', 'part', 'za'). Players
-- get FIVE guesses; every guess must CONTAIN the base as a contiguous
-- substring, be LONGER than the base, and be a legal clean dictionary
-- word. Two readouts, no single combined score:
--   • length score — round(100 * yourLongestGuessLength / max_word_length),
--     where max_word_length is the longest legal word containing the base
--     (computed once at board-build time).
--   • letter count — the sum of the lengths of ALL your guesses.
-- The felt state DURING play is only "I found a 7-letter word" (each
-- guess shows its length); the length score, letter count, and the
-- longest possible word are revealed only at TERMINAL — but that's an FE
-- DISPLAY choice, not a security boundary (see below).
--
-- This is a targeted FORK of wordwheel/spellingbee (word-list games with
-- difficulty bands + an edge-function board builder) — see
-- docs/games/wordiply.md and 20260712000000_wordwheel.sql. The shape it
-- borrows: sibling coop/compete manifests over one schema, a trusting-
-- commit submit RPC (the FE validates against a shipped legal list, the
-- server records), the found-rows realtime pattern, timers/concede/
-- replay from common.
--
-- ───────────────────────────────────────────────────────────
-- Shipped-list + trusting-commit (per the friends-only trust model)
-- ───────────────────────────────────────────────────────────
-- Per Joel's trust model WE DON'T CARE ABOUT CHEATING, so the board
-- ships the whole legal matching-word list (all clean words containing
-- the base) AND the longest word(s) to the FE. That simplifies the build
-- (submit reuses the shared useWordSubmit engine, no per-guess round
-- trip) and none of it is column-hidden. The "scores + longest word only
-- at the end" rule is enforced in the FE render, not the schema.
--
-- The ONE real game-logic delta from wordwheel: substring containment
-- (position(base in word) > 0) instead of the bitmask-subset wheel test,
-- and a fixed 5-guess budget with a length-score comparator instead of an
-- unlimited-finds rank ladder.
--
-- "wordiply" is the codename; the brand is WordWire (FE only). SQL /
-- TypeScript / folder names are all `wordiply`.
--
-- Depends on `common` (clubs, profiles, games, game_players, words,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- reset_game, concede, require_club_member, require_game_player,
-- require_player_count_max, require_valid_mode, require_compete,
-- require_valid_timer). Per the removability invariant in docs/common.md,
-- common MUST NOT reference wordiply back.

-- ============================================================
-- Schema + usage grants
-- ============================================================

create schema if not exists wordiply;

-- ============================================================
-- The word reference lives in common.words
-- ============================================================
-- wordiply's word reference is the shared common.words master list. Its
-- slice — the "legal matching set" for a given base word — is computed
-- on the fly in wordiply.matching_words (below): clean (american, not
-- slang, slur = 0, crude = 0) up to the legal band, longer than the base,
-- and CONTAINING the base as a contiguous substring. The edge function
-- uses it to build max_word_length + longest_words + the shipped
-- legal_words list; submit_guess does NOT (it trusts the FE), so the
-- containment predicate has exactly one server consumer.

-- ============================================================
-- wordiply.games — one row per playthrough
-- ============================================================
-- `id` FKs common.games(id) (the canonical id create_game generates).
-- club_handle is denormalized so RLS can is_club_member() without a join.
-- `mode` ('coop' | 'compete') is the sibling-manifest axis, denormalized
-- onto the gametype row so submit_guess / submit_timeout / end_game and
-- the guesses RLS policy read it with a single-table query.
--
-- Nothing here is column-hidden. Because we don't care about cheating,
-- longest_words + legal_words + max_word_length are all readable by club
-- members from game start; the FE gates DISPLAY of the scores + the
-- longest word to terminal.
create table wordiply.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode text not null check (mode in ('coop', 'compete')),
  -- The base players must extend: a 2–4 letter COMBINATION (not a
  -- dictionary word — it's just letters). char_length gives base_len
  -- wherever the guess rules need it.
  base text not null check (base ~ '^[a-z]{2,4}$'),
  -- The dictionary band this board's legal child words are drawn from
  -- (for the setup disclosure + replay). One band — the base itself has
  -- no difficulty (it's not a word).
  difficulty smallint not null,
  -- The length-score denominator: the longest legal word containing the
  -- base. PUBLIC — it's the bar's target, a hint, never the answer.
  max_word_length int not null,
  -- The actual longest matching word(s), capped (~top 3). Public (the FE
  -- only RENDERS it at terminal). jsonb array of text.
  longest_words jsonb not null,
  -- The full clean legal matching-word list shipped to the FE for local
  -- trusting-commit validation. jsonb array of text.
  legal_words jsonb not null,
  created_at timestamptz not null default now()
);

create index wordiply_games_club_handle_idx on wordiply.games (club_handle);

-- ============================================================
-- wordiply.guesses — the TURN LOG (accepted and rejected alike)
-- ============================================================
-- One row per submitted guess, valid or not. This table is the log of
-- TURNS, not of scored words — the same shape psychicnum.guesses
-- (`is_correct`) and connections.guesses (`result`) use, and everything
-- that computes a SCORE filters `where valid`.
--
-- Why rejects are stored at all (2026-08-02):
--   1. In coop the reject pill is local, so three players independently try
--      the same non-word and nobody can see it happened. Cross-player memory
--      is the thing that can't be done client-side.
--   2. In turn-by-turn coop a STRUCTURAL reject ends your turn, which only
--      means anything if it's a recorded move.
--
-- `valid` / `reason`:
--   valid = true   → reason null. A real, scoring guess.
--   valid = false  → reason says which guard caught it:
--     'missing_base' / 'too_short' — the server's own free guards. A RULES
--        error, so it ends the caller's turn in turn-order coop.
--     'not_a_word'  — the FE's verdict against the board's shipped legal
--        list (trusting-commit: the server has no dictionary here, and we
--        already trust the FE when it says a word IS legal). Does NOT end
--        the turn — the miss may be the word list's fault or a typo, and
--        wordiply's whole incentive is to reach for long words.
-- A reject spends NO budget in either case: it can cost your go, never one
-- of the five guesses.
--
-- seq is the ACCEPTED-guess index, 1..5 within the track — coop shares one
-- 1..5 across the team; compete gives each player their own. It's null on a
-- rejected row: rejects don't occupy a board slot, and letting them advance
-- seq would put row 7 on a five-row board. The turn LOG orders by
-- guessed_at, which needs no integer.
--
-- The backstop unique (game_id, user_id, word) catches a same-player
-- duplicate at the constraint level — now including "you already tried that
-- and it was rejected", which is feature (1) falling out for free. MODE-AWARE
-- dedup (coop dedups across the whole team, compete per-user) can't be a
-- partial index — it lives in submit_guess (same as wordwheel.found_words).
create table wordiply.guesses (
  id          bigint generated always as identity primary key,
  game_id     uuid not null references wordiply.games(id) on delete cascade,
  user_id     uuid not null references common.profiles(user_id) on delete cascade,
  word        text not null,
  length      int not null,
  valid       boolean not null default true,
  reason      text,
  seq smallint,
  guessed_at  timestamptz not null default now(),
  unique (game_id, user_id, word),
  -- The pair can't drift: a valid row has no reason and owns a board slot;
  -- a rejected row names its guard and owns none.
  constraint guesses_valid_shape check (
    (valid and reason is null and seq is not null)
    or (not valid and reason in ('missing_base', 'too_short', 'not_a_word') and seq is null)
  )
);

create index wordiply_guesses_game_id_idx on wordiply.guesses (game_id);

-- ============================================================
-- RLS
-- ============================================================

alter table wordiply.games enable row level security;
alter table wordiply.guesses enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- BOTH guesses and games are published, and BOTH must be — useGame
-- subscribes to postgres_changes on each:
--   - guesses is the live data: every accepted guess appends a row peers
--     refetch on.
--   - games carries no mid-play changes, BUT replay_board does a no-op
--     UPDATE on it as a realtime "touch": replay only DELETEs guesses
--     rows, and postgres_changes filters don't reliably match DELETEs, so
--     the games write is what wakes every client to refetch the now-empty
--     list.
-- Publishing games is NOT optional: Realtime rejects the WHOLE
-- subscription at JOIN time if ANY bound table isn't in the publication,
-- so an unpublished games table would kill guesses delivery too (live
-- updates die silently). wordiply's schema_test asserts both memberships.
alter publication supabase_realtime add table wordiply.games;
alter publication supabase_realtime add table wordiply.guesses;

-- ============================================================
-- Register wordiply with common.gametypes
-- ============================================================
-- Sibling-manifest pair: coop and compete are two gametype rows sharing
-- this one schema. create_club seeds new clubs with both; create_game
-- routes to one via the mode arg.
insert into common.gametypes (gametype, min_players) values
  ('wordiply_coop', 1),
  ('wordiply_compete', 2)
on conflict do nothing;
