-- ============================================================
-- Wordknit — Connections-style word-grouping puzzle (POC)
-- ============================================================
--
-- A 4×4 board of 16 words split into 4 hidden groups of 4. Players
-- select 4 tiles, submit, and try to identify a group. Correct
-- guesses reveal the group as a colored band; wrong/oneAway guesses
-- cost a mistake. 4 mistakes lose; finding all 4 groups wins.
--
-- "Wordknit" is the codename for the gametype (analogous to how
-- "Tinyspy" is the codename for Codenames Duet). The user-facing
-- copy can use whatever phrasing reads best; SQL / TypeScript /
-- folder names are all `wordknit`.
--
-- ┌─ POC scope ────────────────────────────────────────────┐
-- │ - Hardcoded 4-group board (words starting with A/B/C/D)│
-- │ - 4-mistake-lose, oneAway feedback, dup-doesn't-count  │
-- │ - Reveal-on-loss: the FE reads board.groups directly,  │
-- │   no separate RPC needed (see "FE-knows" note below)   │
-- │ - Realtime via Postgres Changes for game/guesses/      │
-- │   found_groups + Broadcast for shared selection +      │
-- │   Presence for "is everyone here" gate                 │
-- │ - No: hint, scratchpad, peer animations, calendar,     │
-- │   share dialog, "play next," shuffle, dup-banner stale │
-- │   detection, puzzle archive, paywall                   │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ The "FE-knows-the-answer" design decision ────────────┐
-- │ Unlike tinyspy and psychic-num — where the server      │
-- │ holds a secret and validates moves against it — the    │
-- │ wordknit board (groups + tile order) is publicly       │
-- │ readable. The FE has the answer key and evaluates      │
-- │ guesses locally. The submit_guess RPC trusts the FE's  │
-- │ verdict (correct / oneAway / wrong + matched_level)    │
-- │ and just records it, applying atomicity for shared     │
-- │ state (mistakes counter, found_groups idempotency      │
-- │ via PK).                                               │
-- │                                                        │
-- │ Why: the evaluator is a small pure function (~15 lines │
-- │ of TS), nothing on the board is genuinely secret in    │
-- │ this codebase's deployment, and the friends-only audi- │
-- │ ence per CLAUDE.md doesn't justify column-grant +      │
-- │ PL/pgSQL evaluation infrastructure. Psychic-num's      │
-- │ column-grant pattern is documented as the canonical    │
-- │ "true server-side secret" example; reading that file   │
-- │ is enough — repeating the pattern here for a non-      │
-- │ secret game would be educational noise.                │
-- │                                                        │
-- │ If this game ever ships beyond friends, the migration  │
-- │ to flip back is: hide `board` via column-level grant,  │
-- │ add a server-side evaluator in PL/pgSQL, drop the FE's │
-- │ `result` / `matched_level` parameters from             │
-- │ submit_guess.                                          │
-- └────────────────────────────────────────────────────────┘
--
-- Depends on `common` (clubs, profiles, club_active_game,
-- is_club_member, gametypes). Per the removability invariant in
-- docs/common.md, common MUST NOT reference wordknit back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists wordknit;
grant usage on schema wordknit to authenticated;

-- ============================================================
-- wordknit.games
-- ============================================================
-- One row per playthrough. `board` is jsonb with shape
--   {
--     "groups":    [{level: 0..3, group: text, members: text[4]}, ...4],
--     "tileOrder": [text, text, ...16]
--   }
-- The whole board is publicly readable (see the "FE-knows" note
-- in the file header). Mutable state (mistakes, status) lives in
-- normal columns so it can be partial-updated atomically.

create table wordknit.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'solved', 'lost')),
  mistakes int not null default 0
    check (mistakes between 0 and 4),
  board jsonb not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create index wordknit_games_club_id_idx on wordknit.games (club_id);

-- ============================================================
-- wordknit.guesses — append-only log
-- ============================================================
-- One row per submit. `matched_level` is non-null iff result =
-- 'correct'. Duplicate submissions (same 4-tile set) are filtered
-- on the FE side (the client has full game state including the
-- guess log), so the RPC just records what it's told.

create table wordknit.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references wordknit.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  tiles text[] not null,
  result text not null check (result in ('correct', 'oneAway', 'wrong')),
  matched_level int check (matched_level between 0 and 3),
  guessed_at timestamptz not null default now()
);

create index wordknit_guesses_game_id_idx on wordknit.guesses (game_id);

-- ============================================================
-- wordknit.found_groups — append-only list of solved groups
-- ============================================================
-- PK on (game_id, level) is load-bearing: it provides the
-- idempotency / race protection for "two players both submit the
-- same correct group simultaneously" — the second INSERT raises
-- unique_violation, which submit_guess catches and treats as
-- "already found, no-op."

create table wordknit.found_groups (
  game_id uuid not null references wordknit.games(id) on delete cascade,
  level int not null check (level between 0 and 3),
  group_name text not null,
  members text[] not null,
  found_at timestamptz not null default now(),
  primary key (game_id, level)
);

-- ============================================================
-- RLS
-- ============================================================
-- Same shape as psychic-num: SELECT gated on club membership,
-- no INSERT/UPDATE/DELETE policies (writes go through the
-- security-definer RPCs).

alter table wordknit.games enable row level security;
alter table wordknit.guesses enable row level security;
alter table wordknit.found_groups enable row level security;

create policy games_select on wordknit.games
  for select to authenticated
  using (common.is_club_member(club_id));

create policy guesses_select on wordknit.guesses
  for select to authenticated
  using (
    exists (
      select 1 from wordknit.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_id)
    )
  );

create policy found_groups_select on wordknit.found_groups
  for select to authenticated
  using (
    exists (
      select 1 from wordknit.games g
       where g.id = found_groups.game_id
         and common.is_club_member(g.club_id)
    )
  );

grant select on wordknit.games to authenticated;
grant select on wordknit.guesses to authenticated;
grant select on wordknit.found_groups to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Three tables broadcast so the FE can subscribe to:
--   games          status flips, mistakes increments
--   guesses        new guess submissions
--   found_groups   new bands to render

alter publication supabase_realtime add table wordknit.games;
alter publication supabase_realtime add table wordknit.guesses;
alter publication supabase_realtime add table wordknit.found_groups;

-- ============================================================
-- wordknit.create_game — start a new game in a club
-- ============================================================
-- POC: builds a hardcoded 4-group board (words starting with
-- A/B/C/D, four each) and a shuffled tile order. Future work
-- will swap the body for a date-picker + puzzle-database lookup;
-- the manifest's setup dialog already gestures at this with a
-- placeholder message.

create function wordknit.create_game(target_club uuid, config jsonb)
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
  -- in src/wordknit/manifest.ts. See docs/code-conventions.md →
  -- "Per-game player counts" for the cross-reference convention.

  -- Hardcoded POC board. Levels 0..3 map to NYT yellow/green/
  -- blue/purple in the FE's theme.css. The groups are obvious
  -- ("words starting with A") to keep the POC trivially solvable
  -- while we shake out the wiring.
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

  -- Extract all 16 tiles and Fisher-Yates shuffle for the
  -- display order.
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

  -- Upsert into club_active_game — auto-pauses any prior active
  -- game for this club by overwriting the pointer.
  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'wordknit', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function wordknit.create_game(uuid, jsonb) from public;
grant execute on function wordknit.create_game(uuid, jsonb) to authenticated;

-- ============================================================
-- wordknit.submit_guess — record a submission
-- ============================================================
-- The FE-knows model: the caller has already evaluated the guess
-- (using the public `board.groups`) and tells us the result and,
-- when result='correct', the matched group level. We:
--
--   1. validate authorization + game state
--   2. light-validate the payload shape (4 tiles, valid result enum,
--      level present iff correct)
--   3. for 'correct': insert into found_groups (PK serves as the
--      race idempotency check), record the guess, check win
--   4. for 'wrong' / 'oneAway': record the guess, mistakes++,
--      check loss
--
-- The SELECT FOR UPDATE on the games row serializes concurrent
-- submissions: two players both clicking Submit at the same instant
-- both land on the same row lock, the first commits, the second
-- sees the updated state (status or mistakes) before its writes.

create function wordknit.submit_guess(
  target_game uuid,
  tiles text[],
  result text,
  matched_level int default null
)
returns void
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordknit.games%rowtype;
  group_obj jsonb;
  members_arr text[];
  found_count int;
  new_mistakes int;
  new_status text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Lock the game row for atomic mistakes++ and status flips.
  select * into g_row from wordknit.games
   where wordknit.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if not common.is_club_member(g_row.club_id) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  if g_row.status <> 'in_progress' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Light payload validation ─────────────────────────
  -- Server-side checks for shape, not for rule correctness — the
  -- FE is trusted to apply the rules under the friends-only
  -- trust model (see CLAUDE.md). These guards catch malformed
  -- payloads (lengths, enum values) so the data we persist is at
  -- least well-typed.
  if tiles is null or array_length(tiles, 1) <> 4 then
    raise exception 'must submit exactly 4 tiles (got %)',
                    coalesce(array_length(tiles, 1), 0)
      using errcode = 'P0001';
  end if;

  if result not in ('correct', 'oneAway', 'wrong') then
    raise exception 'result must be correct, oneAway, or wrong (got %)', result
      using errcode = 'P0001';
  end if;

  if result = 'correct' then
    if matched_level is null or matched_level not between 0 and 3 then
      raise exception 'matched_level must be 0..3 when result is correct'
        using errcode = 'P0001';
    end if;

    -- Find the group at the claimed level. (We could re-validate
    -- the tiles match this group's members here, but per the
    -- FE-knows model we don't — see the file-header note.)
    select e into group_obj
      from jsonb_array_elements(g_row.board->'groups') as e
     where (e->>'level')::int = matched_level
     limit 1;

    if group_obj is null then
      raise exception 'matched_level % not found in board', matched_level
        using errcode = 'P0001';
    end if;

    members_arr := array(
      select jsonb_array_elements_text(group_obj->'members')
    );

    -- Idempotent on (game_id, level): if two players race the same
    -- correct guess, the second INSERT raises unique_violation; we
    -- catch it and bail without erroring out to the second caller.
    -- (They saw the same correct visual; recording it once is
    -- enough.) We also skip the guess log + win check in that case,
    -- since the first caller's transaction did both.
    begin
      insert into wordknit.found_groups (game_id, level, group_name, members)
      values (target_game, matched_level, group_obj->>'group', members_arr);
    exception when unique_violation then
      return;
    end;

    insert into wordknit.guesses (game_id, user_id, tiles, result, matched_level)
    values (target_game, caller_id, tiles, result, matched_level);

    -- Win check: 4 groups found ⇒ solved.
    select count(*) into found_count
      from wordknit.found_groups
     where game_id = target_game;
    if found_count >= 4 then
      update wordknit.games set status = 'solved'
       where wordknit.games.id = target_game;
    end if;

    return;
  end if;

  -- Wrong / oneAway: cost a mistake.
  new_mistakes := g_row.mistakes + 1;
  new_status := case
    when new_mistakes >= 4 then 'lost'
    else 'in_progress'
  end;

  insert into wordknit.guesses (game_id, user_id, tiles, result, matched_level)
  values (target_game, caller_id, tiles, result, null);

  update wordknit.games
    set mistakes = new_mistakes,
        status = new_status
   where wordknit.games.id = target_game;
end;
$$;

revoke execute on function wordknit.submit_guess(uuid, text[], text, int) from public;
grant execute on function wordknit.submit_guess(uuid, text[], text, int) to authenticated;

-- ============================================================
-- wordknit.clear_active_on_termination — trigger function
-- ============================================================
-- Fires when wordknit.games.status flips from 'in_progress' to
-- terminal. Deletes the matching common.club_active_game row so
-- the club's UI moves the game from Active to Completed. Same
-- pattern as tinyspy / psychic-num.

create function wordknit.clear_active_on_termination()
returns trigger
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
begin
  if new.status in ('solved', 'lost')
     and old.status = 'in_progress' then
    delete from common.club_active_game
     where club_id = new.club_id
       and gametype = 'wordknit'
       and game_id = new.id;
  end if;
  return new;
end;
$$;

create trigger clear_active_on_termination
  after update of status on wordknit.games
  for each row execute function wordknit.clear_active_on_termination();

-- ============================================================
-- Register the gametype with common.gametypes
-- ============================================================
-- Per the convention in 20260614000004_common_club_game_kinds.sql,
-- every gametype's baseline registers itself with an
-- ON CONFLICT DO NOTHING INSERT. handle_new_user / create_club
-- then populate club_game_kinds for new clubs with every
-- registered gametype.

insert into common.gametypes (gametype) values ('wordknit')
on conflict do nothing;
