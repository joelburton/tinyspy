-- ============================================================
-- Tables
-- ============================================================

create table public.games (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'sudden_death', 'won', 'lost_assassin', 'lost_clock')),
  turns_remaining int not null default 9,
  current_clue_giver text check (current_clue_giver in ('A', 'B')),
  created_at timestamptz not null default now()
);

create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  -- FK to profiles (not auth.users) so PostgREST can auto-embed display_name.
  -- profiles cascades from auth.users, so user delete still cleans up.
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  seat text not null check (seat in ('A', 'B')),
  key_card jsonb,
  joined_at timestamptz not null default now(),
  primary key (game_id, seat),
  unique (game_id, user_id)
);

create table public.word_pool (
  word text primary key
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.word_pool enable row level security;

-- Helper: prevents RLS infinite recursion when game_players self-references.
-- security definer skips RLS inside the function body.
create function public.is_player_in_game(target_game uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.game_players
    where game_id = target_game and user_id = auth.uid()
  );
$$;

create policy games_select on public.games
  for select to authenticated
  using (public.is_player_in_game(id));

create policy game_players_select on public.game_players
  for select to authenticated
  using (public.is_player_in_game(game_id));

-- No insert/update/delete policies on any table. All writes go through RPCs.
-- word_pool has no select policy either — only security definer RPCs read it.

grant select on public.games to authenticated;
grant select on public.game_players to authenticated;

-- ============================================================
-- Join code generator
-- ============================================================

create function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no O/0, no I/1/l
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where join_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function public.generate_join_code() from public;

-- ============================================================
-- RPCs
-- ============================================================

create function public.create_game()
returns table(id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  new_code := public.generate_join_code();

  insert into public.games (join_code) values (new_code)
  returning games.id into new_id;

  insert into public.game_players (game_id, user_id, seat)
  values (new_id, auth.uid(), 'A');

  return query select new_id as id, new_code as join_code;
end;
$$;

revoke execute on function public.create_game() from public;
grant execute on function public.create_game() to authenticated;

create function public.join_game(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_status text;
  upper_code text := upper(code);
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select id, status into target_id, target_status
  from public.games where join_code = upper_code;

  if target_id is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Idempotent: already a player → just return the id.
  if exists (
    select 1 from public.game_players
    where game_id = target_id and user_id = auth.uid()
  ) then
    return target_id;
  end if;

  if target_status != 'lobby' then
    raise exception 'game already started' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.game_players where game_id = target_id and seat = 'B'
  ) then
    raise exception 'game is full' using errcode = 'P0001';
  end if;

  insert into public.game_players (game_id, user_id, seat)
  values (target_id, auth.uid(), 'B');

  return target_id;
end;
$$;

revoke execute on function public.join_game(text) from public;
grant execute on function public.join_game(text) to authenticated;

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
