-- ============================================================
-- tinyspy: per-game setup config (turns + first clue-giver)
-- ============================================================
--
-- Adds a `config jsonb` column on tinyspy.games and reshapes
-- create_game to accept (target_club, config) — the two-arg
-- signature replaces the one-arg signature this same file drops
-- below.
--
-- Config shape:
--   {
--     "turns": 9 | 10 | 11,
--     "firstClueGiverUserId": "<uuid of one of the two club members>"
--   }
--
-- The two options:
--   - turns: starting timer-token count. The Duet rulebook's
--     mission/campaign mode uses {9, 10, 11} for the
--     progressively-easier difficulties; we constrain to those
--     three exact values so the player choice maps to rulebook
--     reality.
--   - firstClueGiverUserId: which club member gives the first
--     clue. Under the previous one-arg shape the caller of
--     create_game (whoever clicked "Start") was always seat A,
--     which made the assignment arbitrary in the worst way —
--     down to UI race conditions, not player choice. Now the
--     dialog asks, and the chosen user is seated as A (since
--     A always opens the game).
--
-- Why a jsonb column rather than discrete columns
-- (`starting_turns int`, `first_clue_giver uuid`, ...): the
-- mutable counter `turns_remaining` decrements during play.
-- Looking at a finished game later, the counter at 0 doesn't
-- tell you whether the game started with 9, 10, or 11 — the
-- original intent is gone. A typed-by-the-game jsonb column
-- preserves intent for end-of-game review (and a future
-- "this game was played with 11 turns" badge) without
-- per-feature column churn. Future games that add their own
-- options reuse the same `config jsonb` shape — see
-- docs/common.md.
--
-- Mutable counters (`turns_remaining`) still exist and are
-- initialized from config at create-game time. Config captures
-- intent; counters track state.
--
-- Validation is server-side: create_game inspects the jsonb
-- shape and rejects malformed payloads. The FE's TinyspyConfig
-- type is advisory only — a curious client could fire any
-- payload, and the server is the only thing protecting state
-- correctness.

-- ─── The config column ──────────────────────────────────
-- Existing rows (legacy games left over from local dev resets,
-- if any) get '{}'::jsonb, which doesn't match the new shape
-- but doesn't break anything either — the new RPC is the only
-- code that interprets the column, and only games it inserts
-- have meaningful content.
alter table tinyspy.games add column config jsonb not null default '{}'::jsonb;
alter table tinyspy.games alter column config drop default;

-- ─── Replace the create_game RPC ────────────────────────
-- The signature changes (added jsonb param), so we drop the
-- one-arg version explicitly rather than relying on
-- `create or replace` (which only replaces same-signature
-- definitions). The new version validates, then runs the
-- familiar key-card distribution.
drop function if exists tinyspy.create_game(uuid);

create function tinyspy.create_game(target_club uuid, config jsonb)
returns table(id uuid)
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  caller_id uuid;
  other_id uuid;
  member_count int;
  new_id uuid;
  picked_words text[];
  tiles jsonb[];
  a_view text[];
  b_view text[];
  j int;
  tmp jsonb;
  cfg_turns int;
  cfg_first uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Caller must be a member of the target club.
  if not exists (
    select 1 from common.club_members
    where club_id = target_club and user_id = caller_id
  ) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  -- Tinyspy needs exactly 2 club members.
  select count(*) into member_count
    from common.club_members where club_id = target_club;
  if member_count <> 2 then
    raise exception 'tinyspy requires a 2-member club (this club has %)', member_count
      using errcode = 'P0001';
  end if;

  -- Find the other member.
  select user_id into other_id
    from common.club_members
   where club_id = target_club and user_id <> caller_id
   limit 1;

  -- ─── Validate config shape ────────────────────────────
  -- Pulled out as int / uuid casts so a wrong type fails fast
  -- with a clearer message than "key not found." We don't trust
  -- the FE for any of this — the dialog narrows TypeScript types
  -- to the same shape, but a curious client could send anything.
  cfg_turns := (config->>'turns')::int;
  if cfg_turns is null or cfg_turns not in (9, 10, 11) then
    raise exception 'config.turns must be 9, 10, or 11 (got %)', config->>'turns'
      using errcode = 'P0001';
  end if;

  -- A non-uuid text raises invalid_text_representation; catch it
  -- so the error message names the field instead of the raw cast
  -- failure.
  begin
    cfg_first := (config->>'firstClueGiverUserId')::uuid;
  exception when invalid_text_representation then
    raise exception 'config.firstClueGiverUserId must be a uuid'
      using errcode = 'P0001';
  end;
  if cfg_first is null then
    raise exception 'config.firstClueGiverUserId is required'
      using errcode = 'P0001';
  end if;
  if cfg_first not in (caller_id, other_id) then
    raise exception 'config.firstClueGiverUserId must be a club member'
      using errcode = 'P0001';
  end if;

  -- ─── Pick 25 words ────────────────────────────────────
  select array_agg(word) into picked_words
    from (select word from tinyspy.word_pool order by random() limit 25) sub;
  if array_length(picked_words, 1) <> 25 then
    raise exception 'word_pool must contain at least 25 words'
      using errcode = 'P0001';
  end if;

  -- ─── Duet key-card distribution ───────────────────────
  -- Joint distribution (25 cells total):
  --   G/G:3  G/N:5  G/A:1
  --   N/G:5  N/N:7  N/A:1
  --   A/G:1  A/N:1  A/A:1
  tiles := array[]::jsonb[];
  for i in 1..3 loop tiles := tiles || jsonb_build_object('a','G','b','G'); end loop;
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','G','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','G','b','A');
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','N','b','G'); end loop;
  for i in 1..7 loop tiles := tiles || jsonb_build_object('a','N','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','N','b','A');
  tiles := tiles || jsonb_build_object('a','A','b','G');
  tiles := tiles || jsonb_build_object('a','A','b','N');
  tiles := tiles || jsonb_build_object('a','A','b','A');

  -- Fisher-Yates shuffle.
  for i in reverse 25..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tiles[i];
    tiles[i] := tiles[j];
    tiles[j] := tmp;
  end loop;

  a_view := array[]::text[];
  b_view := array[]::text[];
  for i in 1..25 loop
    a_view := a_view || (tiles[i]->>'a');
    b_view := b_view || (tiles[i]->>'b');
  end loop;

  -- Insert the game row. turns_remaining is seeded from
  -- cfg_turns; config itself is persisted so future review can
  -- see the starting setup.
  insert into tinyspy.games (
    club_id, status, current_clue_giver, turns_remaining, config
  ) values (
    target_club, 'active', 'A', cfg_turns, config
  )
  returning games.id into new_id;

  -- Seat the chosen first-clue-giver as A; the other member
  -- gets seat B.
  insert into tinyspy.game_players (game_id, user_id, seat, key_card) values
    (new_id, cfg_first, 'A', to_jsonb(a_view)),
    (
      new_id,
      case cfg_first when caller_id then other_id else caller_id end,
      'B',
      to_jsonb(b_view)
    );

  -- Insert the 25 words.
  for i in 0..24 loop
    insert into tinyspy.words (game_id, position, word)
    values (new_id, i, picked_words[i+1]);
  end loop;

  -- Upsert into club_active_game — auto-pauses any prior active
  -- game in this club by overwriting the pointer.
  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'tinyspy', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function tinyspy.create_game(uuid, jsonb) from public;
grant execute on function tinyspy.create_game(uuid, jsonb) to authenticated;
