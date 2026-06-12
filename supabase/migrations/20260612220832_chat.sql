-- ============================================================
-- In-game chat
-- ============================================================
-- A simple message log scoped to a single game. Players see each
-- other's messages live via Realtime. Writes go through the
-- send_message RPC (no direct INSERT policy) so the seat membership
-- + length checks happen server-side.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  -- FK to profiles (matching the pattern from game_players) so the
  -- PostgREST embed `profiles(display_name)` works for the rendered
  -- "name: message" lines.
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 1000),
  sent_at timestamptz not null default now()
);

create index messages_game_id_sent_at_idx
  on public.messages (game_id, sent_at);

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_player_in_game(game_id));

-- No insert policy — all writes go through send_message.
grant select on public.messages to authenticated;

alter publication supabase_realtime add table public.messages;

-- ============================================================
-- send_message: only seated players, non-empty trimmed content.
-- ============================================================

create function public.send_message(target_game uuid, content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := trim(content);
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.game_players
    where game_id = target_game and user_id = auth.uid()
  ) then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if length(trimmed) = 0 then
    raise exception 'message must not be empty' using errcode = 'P0001';
  end if;

  if length(trimmed) > 1000 then
    raise exception 'message too long (max 1000 chars)' using errcode = 'P0001';
  end if;

  insert into public.messages (game_id, user_id, content)
  values (target_game, auth.uid(), trimmed);
end;
$$;

revoke execute on function public.send_message(uuid, text) from public;
grant execute on function public.send_message(uuid, text) to authenticated;
