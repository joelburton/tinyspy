-- ============================================================
-- wordknit: timer moves from manifest field to setup config
-- ============================================================
--
-- The wordknit timer used to be a hardcoded manifest field
-- (`timerMode: { kind: 'countdown', seconds: 600 }`). It's now
-- a player-configurable setup choice, stored on
-- `wordknit.games.config`'s new `timer` field. This migration
-- updates `wordknit.create_game` to validate the new shape.
--
-- Config shape (extended):
--   {
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": <int 1..3600> }
--     )
--   }
--
-- Validation rules:
--   - config.timer.kind must be one of 'none' / 'countup' /
--     'countdown'
--   - When kind = 'countdown', config.timer.seconds must be an
--     integer between 1 (no zero-length games) and 3600 (1
--     hour cap — Joel's call; longer games would be a
--     different product entirely)
--
-- The submit_timeout RPC stays unchanged — it just flips status
-- to 'lost' regardless of which mode the game was in (the FE
-- only fires it for countdown, by construction).

create or replace function wordknit.create_game(target_club uuid, config jsonb)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
  board_groups jsonb;
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

  -- ─── Validate config.timer shape ──────────────────────
  -- Missing-vs-bad split for clear error messages (same
  -- pattern as tinyspy / psychic-num config validation).
  timer_obj := config->'timer';
  if timer_obj is null then
    raise exception 'config.timer is required' using errcode = 'P0001';
  end if;

  timer_kind := timer_obj->>'kind';
  if timer_kind not in ('none', 'countup', 'countdown') then
    raise exception
      'config.timer.kind must be none, countup, or countdown (got %)',
      coalesce(timer_kind, '<null>')
      using errcode = 'P0001';
  end if;

  if timer_kind = 'countdown' then
    if (timer_obj->>'seconds') is null then
      raise exception 'config.timer.seconds is required for countdown'
        using errcode = 'P0001';
    end if;
    timer_seconds := (timer_obj->>'seconds')::int;
    if timer_seconds < 1 or timer_seconds > 3600 then
      raise exception
        'config.timer.seconds must be 1..3600 (got %)',
        timer_seconds
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Pick board + shuffle (unchanged from baseline) ───
  -- Hardcoded POC board. See the baseline migration for the
  -- in-depth rationale.
  board_groups := $json$[
    {"level": 0, "group": "Words starting with A",
     "members": ["ALPHA","ANGEL","APPLE","ARROW"]},
    {"level": 1, "group": "Words starting with B",
     "members": ["BANANA","BIRCH","BREAD","BRICK"]},
    {"level": 2, "group": "Words starting with C",
     "members": ["CASTLE","CIRCLE","CLOUD","CROWN"]},
    {"level": 3, "group": "Words starting with D",
     "members": ["DAGGER","DELTA","DIAMOND","DRAGON"]}
  ]$json$::jsonb;

  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_groups) g,
         jsonb_array_elements_text(g->'members') t;

  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  insert into wordknit.games (club_id, board, config)
  values (
    target_club,
    jsonb_build_object('groups', board_groups,
                       'tileOrder', to_jsonb(tile_order)),
    config
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
