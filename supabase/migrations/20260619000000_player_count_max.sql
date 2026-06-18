-- ============================================================
-- Player-count upper bound — enforce a hard max in create_game
-- ============================================================
--
-- Up to now, the three open-N gametypes (wordknit, psychicnum,
-- freebee) declared `numberOfPlayers: [1, null]` on the manifest
-- and had NO server-side max check — any club size, however
-- large, was allowed. That `null` upper bound was always going to
-- be uncomfortable as clubs grew (the realtime channel load,
-- chat surface, found-words attribution colors all assume a
-- bounded count), and ran the risk of a runaway "let's invite
-- everyone" club.
--
-- The manifests now declare `[1, 6]`. This migration brings the
-- server-side check into line — wordknit / psychicnum / freebee
-- create_game now reject more than 6 player_user_ids with P0001.
-- tinyspy already enforces exactly 2 in its existing baseline; no
-- change there.
--
-- ─── Shape of the change ────────────────────────────────
-- A `common.require_player_count_max(player_user_ids, max)` helper
-- centralizes the check. Each per-game `create_game` calls it
-- near the top, mirroring the pattern of common.require_club_member
-- + common.validate_timer. Per-game `create_game` bodies are
-- otherwise unchanged; CREATE OR REPLACE preserves all existing
-- validation + insert logic.
--
-- ─── Why 6? ─────────────────────────────────────────────
-- It's not a global rule baked into common — the source of truth
-- for each gametype's max stays the manifest field + the
-- create_game's hardcoded constant. 6 is just the number all
-- three open-N games settled on. A future game with its own cap
-- (say a Boggle variant capped at 4) would pass its own constant
-- to the helper; tinyspy stays at its inline 2-player check.

-- ============================================================
-- Helper
-- ============================================================

create or replace function common.require_player_count_max(
  player_user_ids uuid[],
  max_count int
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  if array_length(player_user_ids, 1) > max_count then
    raise exception 'player_user_ids has % entries (max %)',
                    array_length(player_user_ids, 1), max_count
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function common.require_player_count_max(uuid[], int) from public;
-- No grant to `authenticated` — only callable from other
-- SECURITY DEFINER RPCs in this database. Same pattern as
-- common.require_club_member / common.require_game_player.

-- ============================================================
-- wordknit.create_game — CREATE OR REPLACE with new max check
-- ============================================================
-- Body is otherwise unchanged from
-- 20260615000003_wordknit_baseline.sql; CREATE OR REPLACE rewrites
-- the function definition in place without touching existing
-- games.

create or replace function wordknit.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[]
)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  new_id uuid;
  s_puzzle_id uuid;
  puzzle_row wordknit.puzzles%rowtype;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
  first_two_tiles text;
  game_title text;
begin
  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` declaration in src/wordknit/manifest.ts.
  -- See docs/code-conventions.md → "Per-game player counts".
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup shape ────────────────────────────
  if (setup->>'puzzleId') is null then
    raise exception 'setup.puzzleId is required' using errcode = 'P0001';
  end if;
  begin
    s_puzzle_id := (setup->>'puzzleId')::uuid;
  exception when invalid_text_representation then
    raise exception 'setup.puzzleId must be a uuid'
      using errcode = 'P0001';
  end;

  perform common.validate_timer(setup->'timer');

  select * into puzzle_row from wordknit.puzzles
   where wordknit.puzzles.id = s_puzzle_id;
  if not found then
    raise exception 'puzzle not found' using errcode = 'P0002';
  end if;

  board_categories := puzzle_row.categories;

  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  select string_agg(t, '/' order by t) into first_two_tiles
    from (
      select unnest(tile_order) as t
      order by 1
      limit 2
    ) first2;
  game_title := format('#%s %s (%s)',
                       puzzle_row.source_id,
                       puzzle_row.nyt_date,
                       first_two_tiles);

  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  new_id := common.create_game(
    target_club, 'wordknit', player_user_ids, game_title, setup,
    setup
  );

  insert into wordknit.games (id, club_handle, puzzle_id, board)
  values (
    new_id,
    target_club,
    s_puzzle_id,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order))
  );

  return query select new_id;
end;
$$;

-- ============================================================
-- psychicnum.create_game: NOT replaced here.
-- ============================================================
-- The psychicnum baseline was reshaped for the coop/compete split
-- (now takes a `mode text` 4th param) and folds the player-count
-- check into the baseline directly. Re-creating it here with the
-- old 3-arg signature would leave us with a stale overload. So
-- the helper exists, but psychicnum's create_game is defined
-- only by the baseline migration.

-- ============================================================
-- freebee.create_game — CREATE OR REPLACE with new max check
-- ============================================================

create or replace function freebee.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  new_id uuid;
  s_mode text;
  s_target_rank int;
  b_outer text;
  b_center text;
  b_total_score int;
  b_total_words int;
  game_title text;
begin
  perform common.require_club_member(target_club);

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` declaration in src/freebee/manifest.ts.
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup.mode ─────────────────────────────
  s_mode := setup->>'mode';
  if s_mode is null then
    raise exception 'setup.mode is required' using errcode = 'P0001';
  end if;
  if s_mode not in ('coop', 'compete') then
    raise exception 'setup.mode must be coop or compete (got %)', s_mode
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.target_rank (compete only) ───────
  if s_mode = 'compete' then
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
    if setup ? 'target_rank' then
      raise exception 'setup.target_rank only allowed when mode=compete'
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Validate setup.timer ────────────────────────────
  perform common.validate_timer(setup->'timer');

  -- ─── Validate board structure ────────────────────────
  b_outer := board->>'outer_letters';
  b_center := board->>'center_letter';

  if b_outer is null or length(b_outer) <> 6 then
    raise exception 'board.outer_letters must be 6 characters (got %)',
                    coalesce(length(b_outer)::text, 'null')
      using errcode = 'P0001';
  end if;
  if b_outer !~ '^[a-rt-z]{6}$' then
    raise exception 'board.outer_letters must be 6 lowercase ASCII letters excluding s'
      using errcode = 'P0001';
  end if;
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

  b_total_score := (board->>'total_score')::int;
  b_total_words := (board->>'total_words')::int;
  if b_total_words < 30 then
    raise exception 'board.total_words must be ≥ 30 (got %); the edge function''s ≥30 gate must agree',
                    b_total_words
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(board->'scoring_words') <> 'array' then
    raise exception 'board.scoring_words must be an array'
      using errcode = 'P0001';
  end if;
  if jsonb_typeof(board->'legal_words') <> 'array' then
    raise exception 'board.legal_words must be an array'
      using errcode = 'P0001';
  end if;

  -- ─── Title ───────────────────────────────────────────
  select upper(b_center) || '·' || string_agg(upper(c), '' order by c)
    into game_title
    from unnest(string_to_array(b_outer, null)) c;

  new_id := common.create_game(
    target_club, 'freebee', player_user_ids, game_title, setup,
    setup
  );

  insert into freebee.games (
    id, club_handle, outer_letters, center_letter,
    total_score, total_words, scoring_words, legal_words
  )
  values (
    new_id,
    target_club,
    b_outer,
    b_center,
    b_total_score,
    b_total_words,
    board->'scoring_words',
    coalesce(
      array(select jsonb_array_elements_text(board->'legal_words')),
      array[]::text[]
    )
  );

  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object(
      'mode', s_mode,
      'score', 0,
      'total_score', b_total_score,
      'rank_idx', 0,
      'words_found', 0,
      'total_words', b_total_words
    )
  );

  return query select new_id;
end;
$$;
