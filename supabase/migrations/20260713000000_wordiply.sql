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
-- require_player_count_max, validate_mode, require_compete,
-- validate_timer). Per the removability invariant in docs/common.md,
-- common MUST NOT reference wordiply back.

-- ============================================================
-- Schema + usage grants
-- ============================================================

create schema if not exists wordiply;
grant usage on schema wordiply to authenticated;
grant usage on schema wordiply to service_role;

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

-- All columns readable by club members (no hidden columns — see header).
-- Explicit list per docs/code-conventions.md → "Avoid SELECT *". `mode` is
-- included so the games_state view's g.mode + the guesses_select RLS
-- policy's fg.mode resolve for `authenticated`.
grant select
  (id, club_handle, mode, base, difficulty,
   max_word_length, longest_words, legal_words, created_at)
  on wordiply.games to authenticated;

-- ============================================================
-- wordiply.guesses — append-only log of accepted guesses
-- ============================================================
-- One row per accepted guess. Carries user_id from day one so compete is
-- a non-event (each player's five guesses are their own rows; the RLS
-- policy narrows by user_id during play). `length` is stored (=
-- char_length(word)) so the max/sum the scores need are trivial.
--
-- guess_index is 1..5 WITHIN THE TRACK — coop shares one 1..5 sequence
-- across the team; compete gives each player their own 1..5. It's
-- computed in submit_guess as (current track count + 1).
--
-- The backstop unique (game_id, user_id, word) catches a same-player
-- duplicate at the constraint level; MODE-AWARE dedup (coop dedups across
-- the whole team, compete per-user) can't be a partial index — it lives
-- in submit_guess (same as wordwheel.found_words).
create table wordiply.guesses (
  id          bigint generated always as identity primary key,
  game_id     uuid not null references wordiply.games(id) on delete cascade,
  user_id     uuid not null references common.profiles(user_id) on delete cascade,
  word        text not null,
  length      int not null,
  guess_index smallint not null,
  created_at  timestamptz not null default now(),
  unique (game_id, user_id, word)
);

create index wordiply_guesses_game_id_idx on wordiply.guesses (game_id);

grant select on wordiply.guesses to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table wordiply.games enable row level security;
alter table wordiply.guesses enable row level security;

-- Membership-gated read on games (both modes identical: anyone in the
-- club sees the game header — base word, bands, the length bar's target).
create policy games_select on wordiply.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- guesses RLS is the load-bearing piece for compete. Reads mode off
-- wordiply.games.mode (denormalized). Three OR branches inside the
-- EXISTS, in evaluation order:
--   (1) mode='coop' — everyone in the club sees every guess.
--   (2) user_id = auth.uid() — you always see your own guesses (in
--       compete mid-game, this is your private board).
--   (3) is_terminal — once the game ends, everyone sees everyone's
--       guesses (the compete reveal; harmless in coop).
-- Mirrors wordwheel.found_words_select.
create policy guesses_select on wordiply.guesses
  for select to authenticated
  using (
    exists (
      select 1 from wordiply.games fg
       join common.games cg on cg.id = fg.id
       where fg.id = guesses.game_id
         and common.is_club_member(fg.club_handle)
         and (
               fg.mode = 'coop'
            or guesses.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the RPCs below.

-- ============================================================
-- games_state view
-- ============================================================
-- The FE's read path for a wordiply game header. security_invoker so RLS
-- on the base table evaluates as the caller (games_select gates row
-- visibility). Exposes every column — nothing is terminal-gated (the
-- "reveal at terminal" is an FE display choice).
create view wordiply.games_state with (security_invoker = true) as
select
  g.id,
  g.club_handle,
  g.mode,
  g.base,
  g.difficulty,
  g.max_word_length,
  g.longest_words,
  g.legal_words,
  g.created_at
  from wordiply.games g;

grant select on wordiply.games_state to authenticated;

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

-- ============================================================
-- wordiply._length_score — the length-bar percentage
-- ============================================================
-- round(100 * longest / max_len), integer-clamped to [0, 100]. Kept as a
-- function so the FE's port (lib/scoring.ts) can match it bit-for-bit —
-- determinism, not performance. max_len <= 0 (degenerate board) → 0.
create function wordiply._length_score(longest int, max_len int)
returns int
language sql
immutable
set search_path = wordiply, common, public, extensions
as $$
  select case
           when max_len <= 0 then 0
           else least(100, round(100.0 * longest / max_len)::int)
         end;
$$;

revoke execute on function wordiply._length_score(int, int) from public;
grant execute on function wordiply._length_score(int, int) to authenticated;

-- ============================================================
-- wordiply.matching_words — edge-function board-build helper
-- ============================================================
-- Every clean legal word that CONTAINS the base word as a contiguous
-- substring and is longer than it. The edge function reads this back via
-- supabase.rpc(...) to compute max_word_length, the longest_words, the
-- shipped legal_words list, and the playability gate. This is the ONE
-- place the "what counts as a legal guess" predicate lives.
--
-- Word LENGTH is deliberately NOT capped — a long best word like
-- 'compartmentalizations' (for 'part') is a legitimate, satisfying target.
-- The lever that keeps a board sane is a MAX-CHILDREN gate in the edge
-- function: a base with tens of thousands of matches ('in', 'an') is a
-- non-puzzle (and a huge payload), so those are rejected. Good bases are
-- typically 3–4 letters, or an UNCOMMON 2-letter one ('za', 'rw'); the
-- match-count band is what selects them.
--
-- The legal band here is the CLEAN band (american, not slang, no
-- slur/crude) — stricter than wordwheel's permissive legal side — because
-- this set also determines the longest word, and we don't want a slur to
-- be the answer.
--
-- security invoker + stable: invoker so it runs with the caller's access
-- to common.words (public reference data, RLS off); stable so a single
-- SELECT can call it without repeated re-execution.
create function wordiply.matching_words(base text, legal_band int)
returns table(word text, len int)
language sql
stable
security invoker
set search_path = wordiply, common, public, extensions
as $$
  select w.word, w.len
    from common.words w
   where w.difficulty <= legal_band
     and w.american
     and not w.slang
     and w.slur = 0
     and w.crude = 0
     and w.len > char_length(base)
     -- Contiguous-substring containment — the wordiply rule (position()
     -- instead of wordwheel's bitmask subset). Not sargable → seq scan,
     -- fine at a few calls per board build.
     and position(base in w.word) > 0;
$$;

revoke execute on function wordiply.matching_words(text, int) from public;
grant execute on function wordiply.matching_words(text, int) to authenticated;

-- ============================================================
-- wordiply.candidate_bases — sample base fragments for the builder
-- ============================================================
-- The base is a 2–4 letter COMBINATION, not a word, so we can't just pick
-- one from the dictionary. Instead we sample real (common) SOURCE WORDS
-- and hand back every 2–4 letter contiguous substring — a fragment that,
-- by construction, appears in ≥1 real word so it always has children. The
-- edge function then tries these fragments through try_base() until one
-- clears the child-count gate. Sourcing from COMMON words (source_band,
-- ~3) keeps the base natural/recognizable regardless of the legal band.
--
-- volatile (random()); security invoker (reads common.words as the caller).
create function wordiply.candidate_bases(source_band int, n int)
returns table(base text)
language sql
volatile
security invoker
set search_path = wordiply, common, public, extensions
as $$
  select frag from (
    select distinct substring(w.word from i for l) as frag
      from (
        select word from common.words
         where american and not slang and slur = 0 and crude = 0
           and difficulty <= source_band
           and len between 4 and 9
         order by random()
         limit n
      ) w,
      generate_series(1, 9) i,
      generate_series(2, 4) l
     where i + l - 1 <= length(w.word)
  ) frags
  order by random()
  limit n;
$$;

revoke execute on function wordiply.candidate_bases(int, int) from public;
grant execute on function wordiply.candidate_bases(int, int) to authenticated;

-- ============================================================
-- wordiply.try_base — gate + build a board for ONE candidate base
-- ============================================================
-- Given a candidate fragment, returns the board bits (max_word_length,
-- longest_words, legal_words) IFF it clears the gate:
--   • child count within [min_children, max_children] — the max bound is
--     what throws out over-generous fragments ('in', 'an', 'ar' have tens
--     of thousands of children → a non-puzzle + a huge payload)
--   • max_word_length ≥ base length + min_headroom — there must be a
--     meaningfully longer word to reach for
-- Returns ZERO rows when the gate fails, so a rejected fragment costs a
-- single common.words scan and transfers nothing (the jsonb aggregation
-- runs only for a passing row). longest_words is the (≤3) words at the max
-- length; legal_words is the full shipped list. One round-trip per tried
-- fragment; the first non-empty result wins in the edge function.
create function wordiply.try_base(
  base text,
  legal_band int,
  min_children int,
  max_children int,
  min_headroom int
)
returns table(max_word_length int, longest_words jsonb, legal_words jsonb)
language sql
stable
security invoker
set search_path = wordiply, common, public, extensions
as $$
  with m as (
    select word, len from wordiply.matching_words(base, legal_band)
  ),
  agg as (
    select count(*)::int as c, coalesce(max(len), 0)::int as mx from m
  )
  select
    agg.mx,
    (select jsonb_agg(word)
       from (select word from m where len = agg.mx order by word limit 3) t),
    (select jsonb_agg(word) from m)
  from agg
  where agg.c between min_children and max_children
    and agg.mx >= char_length(base) + min_headroom;
$$;

revoke execute on function wordiply.try_base(text, int, int, int, int) from public;
grant execute on function wordiply.try_base(text, int, int, int, int) to authenticated;

-- ============================================================
-- wordiply.create_game — mode is a positional arg
-- ============================================================
-- Setup shape (server validates):
--   {
--     "difficulty": 1..6,   -- dictionary band the legal child words are drawn from (default 5)
--     "timer": ( {kind:'none'} | {kind:'countup'} | {kind:'countdown',seconds:int} )
--   }
-- `mode` ('coop' | 'compete') is a positional argument. setup.mode is
-- REJECTED if present (catch a stale FE). There is NO target_rank —
-- wordiply is not a race-to-rank — so setup.target_rank is rejected too.
--
-- Board shape (built by the wordiply-build-board edge function):
--   {
--     "base":            "ar",              -- 2–4 letters (NOT a dictionary word)
--     "max_word_length":  9,
--     "longest_words":   ["hangars", ...],  -- top few at the max length
--     "legal_words":     ["arc","cars", ...] -- the full shipped legal list
--   }
-- Board content is taken at face value (the edge fn computed it under the
-- caller's JWT); the RPC sanity-checks STRUCTURE.
--
-- Title formula: just "<BASE>" (uppercased) — e.g. "AR". Deliberately NOT
-- "<BASE> · best <N>": the club-page title is visible before/during play, and
-- the longest-word length is secret until terminal, so it must not leak here.
create function wordiply.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  new_id uuid;
  s_difficulty int;
  b_base text;
  b_base_len int;
  b_max_word_length int;
  game_title text;
  effective_gametype text;
  init_status jsonb;
begin
  perform common.require_club_member(target_club);

  -- ─── Validate mode + player-count ────────────────────────
  perform common.validate_mode(mode);
  if mode = 'compete' then
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Reject deprecated / inapplicable setup fields ───────
  if setup ? 'mode' then
    raise exception 'setup.mode is no longer valid; mode is now a top-level argument'
      using errcode = 'P0001';
  end if;
  if setup ? 'target_rank' then
    raise exception 'setup.target_rank is not a wordiply setting'
      using errcode = 'P0001';
  end if;

  -- ─── Validate the dictionary band ────────────────────────
  s_difficulty := coalesce((setup->>'difficulty')::int, 5);
  if s_difficulty < 1 or s_difficulty > 6 then
    raise exception 'setup.difficulty must be 1..6 (got %)', s_difficulty
      using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Board structure validation ──────────────────────────
  b_base := board->>'base';
  if b_base is null or b_base !~ '^[a-z]{2,4}$' then
    raise exception 'board.base must be 2–4 lowercase ASCII letters (got %)',
      coalesce(b_base, 'null') using errcode = 'P0001';
  end if;
  b_base_len := char_length(b_base);

  b_max_word_length := (board->>'max_word_length')::int;
  -- Headroom gate: the best word must beat the base by at least 2 letters,
  -- or there's nothing to reach for. (The edge fn targets +3; this is the
  -- looser server floor a misbehaving builder can't sneak past.)
  if b_max_word_length is null or b_max_word_length < b_base_len + 2 then
    raise exception 'board.max_word_length must be ≥ base length + 2 (got %)',
      coalesce(b_max_word_length::text, 'null') using errcode = 'P0001';
  end if;

  if jsonb_typeof(board->'longest_words') <> 'array'
     or jsonb_array_length(board->'longest_words') < 1 then
    raise exception 'board.longest_words must be a non-empty array'
      using errcode = 'P0001';
  end if;
  if jsonb_typeof(board->'legal_words') <> 'array'
     or jsonb_array_length(board->'legal_words') < 1 then
    raise exception 'board.legal_words must be a non-empty array'
      using errcode = 'P0001';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  game_title := upper(b_base);

  effective_gametype := 'wordiply_' || mode;

  -- ─── Coordinate with common.create_game ──────────────────
  -- Inserts common.games (is_current_view=true, play_state='playing'),
  -- validates players are club members, inserts common.game_players,
  -- returns the canonical id. Persist the whole setup as the club's next
  -- default (bands + timer are things a friend group settles on).
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup, setup
  );

  -- ─── Insert the per-gametype row ─────────────────────────
  insert into wordiply.games (
    id, club_handle, mode, base, difficulty,
    max_word_length, longest_words, legal_words
  )
  values (
    new_id, target_club, mode, b_base, s_difficulty,
    b_max_word_length, board->'longest_words', board->'legal_words'
  );

  -- ─── Seed common.games.status for the club-page label ────
  -- MID-GAME the label shows only guesses used (scores are terminal-only),
  -- so the seed carries the base word + bar target + a zeroed guess count
  -- (coop) / per-player leaderboard (compete). length_score / letter_count
  -- are written at terminal.
  if mode = 'coop' then
    init_status := jsonb_build_object(
      'mode', 'coop',
      'base', b_base,
      'max_word_length', b_max_word_length,
      'guesses_used', 0
    );
  else
    init_status := jsonb_build_object(
      'mode', 'compete',
      'base', b_base,
      'max_word_length', b_max_word_length,
      'leaderboard', (
        select coalesce(
          jsonb_agg(jsonb_build_object('user_id', uid, 'guesses_used', 0)),
          '[]'::jsonb)
        from unnest(player_user_ids) uid
      )
    );
  end if;
  perform common.update_state(new_id, 'playing', init_status);

  return query select new_id;
end;
$$;

revoke execute on function wordiply.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function wordiply.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- wordiply._finish_coop — coop terminal transition
-- ============================================================
-- Internal helper (not granted to authenticated — only the definer RPCs
-- below call it). Computes the team's length score + letter count from
-- the shared guesses and ends the game with the given outcome label
-- ('complete' | 'timeout' | 'manual'). This is where the terminal scores
-- (hidden until now on the FE) are finally written to status.
create function wordiply._finish_coop(target_game uuid, outcome_label text)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  g_row wordiply.games%rowtype;
  team_longest int;
  team_letters int;
  team_guesses int;
  ls int;
  player_results jsonb;
begin
  select * into g_row from wordiply.games where id = target_game;

  select coalesce(max(length), 0), coalesce(sum(length), 0), count(*)
    into team_longest, team_letters, team_guesses
    from wordiply.guesses where game_id = target_game;

  ls := wordiply._length_score(team_longest, g_row.max_word_length);

  select jsonb_object_agg(user_id::text, jsonb_build_object('finished', true))
    into player_results
    from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object(
      'mode', 'coop',
      'base', g_row.base,
      'max_word_length', g_row.max_word_length,
      'outcome', outcome_label,
      'length_score', ls,
      'letter_count', team_letters,
      'longest', team_longest,
      'guesses_used', team_guesses
    ),
    player_results
  );
end;
$$;

revoke execute on function wordiply._finish_coop(uuid, text) from public;

-- ============================================================
-- wordiply._finish_compete — compete terminal transition + comparator
-- ============================================================
-- Internal helper. Resolves the compete result via the lexicographic
-- comparator (there is no scalar "final score"):
--   1. higher length score wins
--   2. tie → higher letter count wins
--   3. still tied AND the game is timed → earlier finish (min finished_at)
--   4. still tied → co-winners (every tied-at-top player marked won)
-- A conceded player can't win (they're losers with won=false).
--
-- pick_winner=false is the "players agreed to stop" path (manual compete
-- end_game): everyone marked won=false, terminal_state 'ended', no winner.
-- The FE's compareCompetitors in lib/scoring.ts MUST match this order.
create function wordiply._finish_compete(
  target_game uuid,
  outcome_label text,
  pick_winner boolean
)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  g_row wordiply.games%rowtype;
  timed boolean;
  status_leaderboard jsonb;
  player_results jsonb;
  winner_uid uuid;
  terminal_state text;
begin
  select * into g_row from wordiply.games where id = target_game;
  timed := coalesce(
    (select setup->'timer'->>'kind' from common.games where id = target_game),
    'none') <> 'none';
  terminal_state := case when pick_winner then 'won_compete' else 'ended' end;

  with scored as (
    select gp.user_id,
           gp.conceded,
           coalesce(max(gg.length), 0) as longest,
           coalesce(sum(gg.length), 0) as letter_count,
           count(gg.id) as guesses_used,
           max(gg.created_at) as finished_at
      from common.game_players gp
      left join wordiply.guesses gg
        on gg.game_id = target_game and gg.user_id = gp.user_id
     where gp.game_id = target_game
     group by gp.user_id, gp.conceded
  ),
  withscore as (
    select s.*, wordiply._length_score(s.longest, g_row.max_word_length) as length_score
      from scored s
  ),
  -- best (length_score, letter_count) among non-conceded players, then the
  -- earliest finish among those tied at the top.
  best as (
    select max(length_score) as bls from withscore where not conceded
  ),
  best2 as (
    select max(w.letter_count) as blc
      from withscore w, best b
     where not w.conceded and w.length_score = b.bls
  ),
  besttime as (
    select min(w.finished_at) as bt
      from withscore w, best b, best2 b2
     where not w.conceded and w.length_score = b.bls and w.letter_count = b2.blc
  ),
  flagged as (
    select w.*,
           (pick_winner
            and not w.conceded
            and w.length_score = b.bls
            and w.letter_count = b2.blc
            and (not timed or w.finished_at is not distinct from bt.bt)) as won
      from withscore w, best b, best2 b2, besttime bt
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id,
      'length_score', length_score,
      'letter_count', letter_count,
      'guesses_used', guesses_used,
      'finished_at', finished_at,
      'won', won
    ) order by length_score desc, letter_count desc), '[]'::jsonb),
    coalesce(jsonb_object_agg(user_id::text, jsonb_build_object(
      'won', won,
      'length_score', length_score,
      'letter_count', letter_count
    )), '{}'::jsonb),
    -- winner_user_id names a SINGLE winner; on co-winners (a tie the timed
    -- tiebreak didn't resolve, or an untimed tie) it is null — every tied
    -- player is already marked won=true in the leaderboard + player_results,
    -- and the FE reads its own won flag for the co-winner banner. Picking one
    -- arbitrary tied player here would tell the others they lost.
    (select case when count(*) = 1 then (array_agg(f.user_id))[1] end
       from flagged f where f.won)
  into status_leaderboard, player_results, winner_uid
  from flagged;

  perform common.end_game(
    target_game, terminal_state,
    jsonb_build_object(
      'mode', 'compete',
      'base', g_row.base,
      'max_word_length', g_row.max_word_length,
      'outcome', outcome_label,
      'winner_user_id', winner_uid,
      'leaderboard', status_leaderboard
    ),
    player_results
  );
end;
$$;

revoke execute on function wordiply._finish_compete(uuid, text, boolean) from public;

-- ============================================================
-- wordiply.submit_guess — the only mid-game action (trusting-commit)
-- ============================================================
-- The FE validated the word against the board's shipped legal list, so
-- this TRUSTS dictionary legality and only:
--   1. gates the live game (playing / player / not conceded / budget)
--   2. re-checks the two FREE guards (no dictionary lookup): the word is
--      longer than the base and CONTAINS the base — these catch a stale
--      FE and cost nothing
--   3. mode-aware dedup
--   4. records the guess, updates status, and checks the end condition
--      (coop: team's 5th guess; compete: every active player has spent 5).
-- Because the FE validates locally, an INVALID guess never reaches here
-- (it never consumes a line) — a guard miss returns {ok:false, reason}
-- and records nothing.
--
-- Returns {ok:true, length, guesses_used, is_terminal, ...}. `length` is
-- the ONE live readout; length_score + letter_count are added to the
-- response ONLY when is_terminal (scores are terminal-only — see the
-- migration header).
create function wordiply.submit_guess(target_game uuid, word text)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordiply.games%rowtype;
  current_play_state text;
  base_len int;
  w_lower text;
  track_count int;      -- guesses already in this track (pre-insert)
  ins_length int;
  dup_count int;
  all_done boolean;
  used_now int;
  letters_now int;
  longest_now int;
  is_term boolean;
  result jsonb;
begin
  -- Lock the gametype row; mode rides along.
  select * into g_row from wordiply.games
   where wordiply.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;

  base_len := char_length(g_row.base);
  w_lower := lower(coalesce(word, ''));

  -- ─── Budget (mode-aware; the FE gates, so this only fires on a race) ─
  if g_row.mode = 'coop' then
    select count(*) into track_count from wordiply.guesses where game_id = target_game;
  else
    select count(*) into track_count
      from wordiply.guesses where game_id = target_game and user_id = caller_id;
  end if;
  if track_count >= 5 then
    raise exception 'no guesses remaining' using errcode = 'P0001';
  end if;

  -- ─── Free guards (no dictionary lookup) ──────────────────
  if char_length(w_lower) <= base_len then
    return jsonb_build_object('ok', false, 'reason', 'too_short');
  end if;
  if position(g_row.base in w_lower) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_base');
  end if;

  -- ─── Mode-aware dedup (alias fw — `word` is also the param name) ──
  if g_row.mode = 'coop' then
    select count(*) into dup_count
      from wordiply.guesses fw where fw.game_id = target_game and fw.word = w_lower;
  else
    select count(*) into dup_count
      from wordiply.guesses fw
     where fw.game_id = target_game and fw.user_id = caller_id and fw.word = w_lower;
  end if;
  if dup_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  -- ─── Insert (trusted word) ───────────────────────────────
  ins_length := char_length(w_lower);
  insert into wordiply.guesses (game_id, user_id, word, length, guess_index)
    values (target_game, caller_id, w_lower, ins_length, track_count + 1);

  -- ─── Recompute status + terminal check ───────────────────
  if g_row.mode = 'coop' then
    if track_count + 1 >= 5 then
      perform wordiply._finish_coop(target_game, 'complete');
    else
      perform common.update_state(target_game, 'playing',
        jsonb_build_object(
          'mode', 'coop',
          'base', g_row.base,
          'max_word_length', g_row.max_word_length,
          'guesses_used', track_count + 1));
    end if;
  else
    -- Refresh the per-player guesses_used leaderboard (the club-label +
    -- OpponentStrip mid-game readout; no scores leak early).
    perform common.update_state(target_game, 'playing',
      jsonb_build_object(
        'mode', 'compete',
        'base', g_row.base,
        'max_word_length', g_row.max_word_length,
        'leaderboard', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'user_id', gp.user_id,
                   'guesses_used', (select count(*) from wordiply.guesses gg
                                     where gg.game_id = target_game and gg.user_id = gp.user_id)
                 )), '[]'::jsonb)
            from common.game_players gp where gp.game_id = target_game
        )));

    -- Terminal when every ACTIVE (non-conceded) player has spent 5.
    select bool_and(used >= 5) into all_done from (
      select (select count(*) from wordiply.guesses gg
               where gg.game_id = target_game and gg.user_id = gp.user_id) as used
        from common.game_players gp
       where gp.game_id = target_game and not gp.conceded
    ) t;
    if coalesce(all_done, false) then
      perform wordiply._finish_compete(target_game, 'complete', true);
    end if;
  end if;

  -- ─── Build the response ──────────────────────────────────
  -- The caller's track totals (coop: team; compete: this player).
  select count(*), coalesce(sum(length), 0), coalesce(max(length), 0)
    into used_now, letters_now, longest_now
    from wordiply.guesses
   where game_id = target_game and (g_row.mode = 'coop' or user_id = caller_id);

  is_term := (select play_state from common.games where id = target_game) <> 'playing';

  result := jsonb_build_object(
    'ok', true,
    'length', ins_length,
    'guesses_used', used_now,
    'is_terminal', is_term
  );
  -- Scores are terminal-only: attach them to the response only once the
  -- game is over (the FE won't render them before then anyway).
  if is_term then
    result := result || jsonb_build_object(
      'length_score', wordiply._length_score(longest_now, g_row.max_word_length),
      'letter_count', letters_now
    );
  end if;
  return result;
end;
$$;

revoke execute on function wordiply.submit_guess(uuid, text) from public;
grant execute on function wordiply.submit_guess(uuid, text) to authenticated;

-- ============================================================
-- wordiply.submit_timeout — countdown expired → terminal
-- ============================================================
-- Fired by the FE when the count-down hits 0. Multiple peers may race the
-- expiry; SELECT ... FOR UPDATE serializes them and the post-lock
-- play_state check rejects everyone after the first (P0001, swallowed by
-- the FE). Coop → ended/timeout with the team score. Compete → resolve
-- the comparator on CURRENT scores (whoever leads wins) → won_compete/
-- timeout. Ends with a guesses realtime touch so compete peers refetch
-- the now-RLS-visible opponents' guesses.
create function wordiply.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  g_row wordiply.games%rowtype;
  current_play_state text;
begin
  select * into g_row from wordiply.games
   where wordiply.games.id = target_game
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
    perform wordiply._finish_coop(target_game, 'timeout');
  else
    perform wordiply._finish_compete(target_game, 'timeout', true);
  end if;

  -- Realtime touch so peers refetch the now-visible opponents' guesses.
  update wordiply.guesses set user_id = user_id where game_id = target_game;
end;
$$;

revoke execute on function wordiply.submit_timeout(uuid) from public;
grant execute on function wordiply.submit_timeout(uuid) to authenticated;

-- ============================================================
-- wordiply.end_game — manual "we're done" stop
-- ============================================================
-- Coop's neutral mutual stop (the "End game" menu item): ends with the
-- team score, outcome='manual'. In compete this is the "players agreed to
-- stop" path — per-player scores, NO winner (compete's per-player drop is
-- concede, not this). Any game player may fire it; idempotent (a second
-- click / a race with the timer raises P0001, swallowed by the FE).
create function wordiply.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  g_row wordiply.games%rowtype;
  current_play_state text;
begin
  select * into g_row from wordiply.games
   where wordiply.games.id = target_game
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
    perform wordiply._finish_coop(target_game, 'manual');
  else
    perform wordiply._finish_compete(target_game, 'manual', false);
  end if;

  update wordiply.guesses set user_id = user_id where game_id = target_game;
end;
$$;

revoke execute on function wordiply.end_game(uuid) from public;
grant execute on function wordiply.end_game(uuid) to authenticated;

-- ============================================================
-- wordiply.replay_board — restart this board from scratch
-- ============================================================
-- Same base word, same word lists, wipe the guesses, un-terminal the row
-- with the exact initial status create_game seeds (mode-branched). Any
-- game player may call it, mid-game or after game-over. The realtime touch
-- on games is load-bearing: replay only DELETEs guesses rows and realtime
-- filters don't reliably match DELETEs, so the no-op games write is what
-- wakes every client to refetch the now-empty list.
create function wordiply.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  g_row wordiply.games%rowtype;
  new_status jsonb;
begin
  perform common.require_game_player(target_game);
  -- Lock the games row (as every other mutating RPC does) so a concurrent
  -- submit_guess can't interleave: without it, a submit committing during the
  -- delete→reset window could strand a guess on the "fresh" board (a row with
  -- guesses_used claiming 0). The lock serializes them.
  select * into g_row from wordiply.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  delete from wordiply.guesses where game_id = target_game;

  if g_row.mode = 'coop' then
    new_status := jsonb_build_object(
      'mode', 'coop',
      'base', g_row.base,
      'max_word_length', g_row.max_word_length,
      'guesses_used', 0
    );
  else
    new_status := jsonb_build_object(
      'mode', 'compete',
      'base', g_row.base,
      'max_word_length', g_row.max_word_length,
      'leaderboard', (
        select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'guesses_used', 0)),
                        '[]'::jsonb)
          from common.game_players where game_id = target_game
      )
    );
  end if;

  perform common.reset_game(target_game, new_status);

  -- Realtime touch — wakes useGame's games subscription.
  update wordiply.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function wordiply.replay_board(uuid) from public;
grant execute on function wordiply.replay_board(uuid) to authenticated;

-- ============================================================
-- wordiply.concede — a player drops out of a compete race
-- ============================================================
-- wordiply has no independent per-player "eliminated" state: a player leaves
-- the race by conceding OR by spending all 5 of their guesses. common.concede
-- marks the caller out and, if that was the last NON-CONCEDED player, ends the
-- game as a collective loss — but it counts a finished-but-not-conceded player
-- as "still active". So a concede can leave every remaining active player out
-- of guesses with nobody able to submit and re-fire submit_guess's end check,
-- hanging the game in `playing` forever. We therefore repeat that end check
-- here after conceding. Gated to compete — coop is a team (it ends via the
-- shared End, never a concede).
create function wordiply.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from wordiply.games where id = target_game));
  perform common.concede(target_game);

  -- If common.concede didn't end the game (the conceder wasn't the last
  -- active player), the remaining active players may nonetheless ALL be out
  -- of guesses now — the same terminal condition submit_guess checks after a
  -- 5th guess. Re-run it here so the race resolves (picking a winner among the
  -- finishers) instead of stalling with no one left able to act.
  if (select play_state from common.games where id = target_game) = 'playing'
     and coalesce((
       select bool_and(used >= 5) from (
         select (select count(*) from wordiply.guesses gg
                  where gg.game_id = target_game and gg.user_id = gp.user_id) as used
           from common.game_players gp
          where gp.game_id = target_game and not gp.conceded
       ) t
     ), false)
  then
    perform wordiply._finish_compete(target_game, 'complete', true);
  end if;

  -- If the game is now terminal — via common.concede's last-racer path OR the
  -- all-finishers check above — wake the guesses subscription so remaining
  -- clients refetch the now-visible opponents' guesses (common.* and
  -- _finish_compete both write only common.games, not wordiply.guesses).
  if (select play_state from common.games where id = target_game) <> 'playing' then
    update wordiply.guesses set user_id = user_id where game_id = target_game;
  end if;
end;
$$;

revoke execute on function wordiply.concede(uuid) from public;
grant execute on function wordiply.concede(uuid) to authenticated;
