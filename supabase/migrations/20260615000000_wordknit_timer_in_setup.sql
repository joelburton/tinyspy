-- ============================================================
-- wordknit: timer moves from manifest field to setup payload
-- ============================================================
--
-- The wordknit timer used to be a hardcoded manifest field
-- (`timerMode: { kind: 'countdown', seconds: 600 }`). It's now
-- a player-configurable setup choice, stored on
-- `wordknit.games.setup`'s new `timer` field. This migration
-- updates `wordknit.create_game` to validate the new shape.
--
-- Setup shape (extended):
--   {
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": <int 1..3600> }
--     )
--   }
--
-- Validation rules:
--   - setup.timer.kind must be one of 'none' / 'countup' /
--     'countdown'
--   - When kind = 'countdown', setup.timer.seconds must be an
--     integer between 1 (no zero-length games) and 3600 (1
--     hour cap — Joel's call; longer games would be a
--     different product entirely)
--
-- The submit_timeout RPC stays unchanged — it just flips status
-- to 'lost' regardless of which mode the game was in (the FE
-- only fires it for countdown, by construction).
--
-- Note for the future squash: this CREATE OR REPLACE body is a
-- near-duplicate of what now lives in the baseline migration
-- (because the rename refactor brought the new-board-shape
-- forward into baseline). When we squash wordknit's migrations,
-- this file and baseline collapse into a single baseline with
-- one definition of create_game. Until then we keep this CREATE
-- OR REPLACE in sync with baseline so the apply-order
-- (baseline → timer) lands on the right body.

create or replace function wordknit.create_game(target_club uuid, setup jsonb)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
  timer_obj jsonb;
  timer_kind text;
  timer_seconds int;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from common.club_members
     where club_id = target_club and user_id = caller_id
  ) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  -- No member-count check — wordknit plays with any club size.
  -- Must agree with the `numberOfPlayers: [1, null]` declaration
  -- in src/wordknit/manifest.ts.

  -- ─── Validate setup.timer shape ──────────────────────
  -- Missing-vs-bad split for clear error messages (same
  -- pattern as tinyspy / psychic-num setup validation).
  timer_obj := setup->'timer';
  if timer_obj is null then
    raise exception 'setup.timer is required' using errcode = 'P0001';
  end if;

  timer_kind := timer_obj->>'kind';
  if timer_kind not in ('none', 'countup', 'countdown') then
    raise exception
      'setup.timer.kind must be none, countup, or countdown (got %)',
      coalesce(timer_kind, '<null>')
      using errcode = 'P0001';
  end if;

  if timer_kind = 'countdown' then
    if (timer_obj->>'seconds') is null then
      raise exception 'setup.timer.seconds is required for countdown'
        using errcode = 'P0001';
    end if;
    timer_seconds := (timer_obj->>'seconds')::int;
    if timer_seconds < 1 or timer_seconds > 3600 then
      raise exception
        'setup.timer.seconds must be 1..3600 (got %)',
        timer_seconds
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Pick board + shuffle (unchanged from baseline) ───
  -- Hardcoded POC board. See the baseline migration for the
  -- in-depth rationale. Ranks 0..3 map to NYT yellow/green/
  -- blue/purple in the FE's theme.css.
  board_categories := $json$[
    {"rank": 0, "name": "Words starting with A",
     "tiles": ["ALPHA","ANGEL","APPLE","ARROW"]},
    {"rank": 1, "name": "Words starting with B",
     "tiles": ["BANANA","BIRCH","BREAD","BRICK"]},
    {"rank": 2, "name": "Words starting with C",
     "tiles": ["CASTLE","CIRCLE","CLOUD","CROWN"]},
    {"rank": 3, "name": "Words starting with D",
     "tiles": ["DAGGER","DELTA","DIAMOND","DRAGON"]}
  ]$json$::jsonb;

  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  insert into wordknit.games (club_id, board, setup)
  values (
    target_club,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order)),
    setup
  )
  returning games.id into new_id;

  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'wordknit', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;
