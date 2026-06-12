-- ============================================================
-- Turn tracking: games gain turn_number (starts at 1, ticks on end-turn).
-- ============================================================

alter table public.games
  add column turn_number int not null default 1;

-- ============================================================
-- clues: one row per submitted clue. At most one clue per turn,
-- enforced by the unique (game_id, turn_number) constraint.
-- ============================================================

create table public.clues (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn_number int not null,
  by_seat text not null check (by_seat in ('A', 'B')),
  word text not null,
  count int not null check (count >= 0),
  submitted_at timestamptz not null default now(),
  unique (game_id, turn_number)
);

alter table public.clues enable row level security;

create policy clues_select on public.clues
  for select to authenticated
  using (public.is_player_in_game(game_id));

grant select on public.clues to authenticated;

alter publication supabase_realtime add table public.clues;

-- ============================================================
-- _end_turn: shared helper. Decrements the token, increments
-- turn_number, swaps clue_giver, drops into sudden_death at 0.
-- ============================================================

create function public._end_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
  giver text;
begin
  select turns_remaining, current_clue_giver
    into remaining, giver
    from public.games where id = target_game for update;

  if remaining <= 1 then
    update public.games
      set turns_remaining = 0,
          turn_number = turn_number + 1,
          status = 'sudden_death',
          current_clue_giver = case giver when 'A' then 'B' else 'A' end
      where id = target_game;
  else
    update public.games
      set turns_remaining = remaining - 1,
          turn_number = turn_number + 1,
          current_clue_giver = case giver when 'A' then 'B' else 'A' end
      where id = target_game;
  end if;
end;
$$;

revoke execute on function public._end_turn(uuid) from public;

-- ============================================================
-- submit_clue: current clue-giver, clue phase, active state only.
-- ============================================================

create function public.submit_clue(target_game uuid, word text, count int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  giver text;
  game_status text;
  current_turn int;
  caller_seat text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select status, current_clue_giver, turn_number
    into game_status, giver, current_turn
    from public.games where id = target_game for update;

  if game_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if game_status <> 'active' then
    raise exception 'clues only allowed during active play' using errcode = 'P0001';
  end if;

  select seat into caller_seat from public.game_players
    where game_id = target_game and user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if caller_seat <> giver then
    raise exception 'not your turn to give a clue' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.clues
    where game_id = target_game and turn_number = current_turn
  ) then
    raise exception 'a clue has already been submitted this turn' using errcode = 'P0001';
  end if;

  insert into public.clues (game_id, turn_number, by_seat, word, count)
  values (target_game, current_turn, caller_seat, word, count);
end;
$$;

revoke execute on function public.submit_clue(uuid, text, int) from public;
grant execute on function public.submit_clue(uuid, text, int) to authenticated;

-- ============================================================
-- submit_guess: the non-clue-giver in guess phase (active), or
-- either player in sudden_death (no turn enforcement). Reveals the
-- word using the *clue-giver's* key view, applies effect, and
-- updates game state.
-- ============================================================

create function public.submit_guess(target_game uuid, target_position int)
returns text  -- returns the revealed label ('G' | 'N' | 'A') for caller convenience
language plpgsql
security definer
set search_path = public
as $$
declare
  game_status text;
  giver text;
  current_turn int;
  caller_seat text;
  key_owner_seat text;  -- whose key view determines this reveal
  key_card jsonb;
  revealed_label text;
  green_total int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if target_position < 0 or target_position > 24 then
    raise exception 'position must be 0..24' using errcode = 'P0001';
  end if;

  select status, current_clue_giver, turn_number
    into game_status, giver, current_turn
    from public.games where id = target_game for update;

  if game_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if game_status not in ('active', 'sudden_death') then
    raise exception 'game is not in a guessable state' using errcode = 'P0001';
  end if;

  select seat into caller_seat from public.game_players
    where game_id = target_game and user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if game_status = 'active' then
    -- Need a clue submitted for the current turn, and caller must be the guesser.
    if caller_seat = giver then
      raise exception 'you are the clue-giver this turn' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.clues
      where game_id = target_game and turn_number = current_turn
    ) then
      raise exception 'waiting for clue this turn' using errcode = 'P0001';
    end if;
    -- The clue-giver's key view decides the reveal label.
    key_owner_seat := giver;
  else
    -- sudden_death: no clues, no turn enforcement; either player may guess.
    -- Label still comes from the *other* player's key view, which is also the
    -- view of whoever gave the most recent clue. Use the "opposite seat" rule:
    -- the partner's key view labels this guess.
    key_owner_seat := case caller_seat when 'A' then 'B' else 'A' end;
  end if;

  -- Reject re-revealing an already-revealed cell.
  if exists (
    select 1 from public.words
    where game_id = target_game and position = target_position and revealed_as is not null
  ) then
    raise exception 'cell already revealed' using errcode = 'P0001';
  end if;

  -- Look up the label from the key owner's view.
  select gp.key_card into key_card from public.game_players gp
    where gp.game_id = target_game and gp.seat = key_owner_seat;

  revealed_label := key_card ->> target_position;

  -- Apply the reveal.
  update public.words
    set revealed_as = revealed_label,
        revealed_by = caller_seat
    where game_id = target_game and position = target_position;

  -- Branch on label + state.
  if revealed_label = 'A' then
    update public.games set status = 'lost_assassin', current_clue_giver = null
      where id = target_game;
    return revealed_label;
  end if;

  if game_status = 'sudden_death' and revealed_label <> 'G' then
    -- Any non-green in sudden death ends the game.
    update public.games set status = 'lost_clock', current_clue_giver = null
      where id = target_game;
    return revealed_label;
  end if;

  if revealed_label = 'G' then
    -- Win check: 15 green agents found total.
    select count(*) into green_total from public.words
      where game_id = target_game and revealed_as = 'G';
    if green_total >= 15 then
      update public.games set status = 'won', current_clue_giver = null
        where id = target_game;
    end if;
    -- Otherwise the guesser stays in their turn.
    return revealed_label;
  end if;

  -- Neutral during active play: turn ends.
  perform public._end_turn(target_game);
  return revealed_label;
end;
$$;

revoke execute on function public.submit_guess(uuid, int) from public;
grant execute on function public.submit_guess(uuid, int) to authenticated;

-- ============================================================
-- pass_turn: voluntary end-of-turn during active play.
-- ============================================================

create function public.pass_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  game_status text;
  giver text;
  current_turn int;
  caller_seat text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select status, current_clue_giver, turn_number
    into game_status, giver, current_turn
    from public.games where id = target_game for update;

  if game_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if game_status <> 'active' then
    raise exception 'can only pass during active play' using errcode = 'P0001';
  end if;

  select seat into caller_seat from public.game_players
    where game_id = target_game and user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if caller_seat = giver then
    raise exception 'clue-giver cannot pass — submit a clue first' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.clues
    where game_id = target_game and turn_number = current_turn
  ) then
    raise exception 'waiting for clue this turn' using errcode = 'P0001';
  end if;

  perform public._end_turn(target_game);
end;
$$;

revoke execute on function public.pass_turn(uuid) from public;
grant execute on function public.pass_turn(uuid) to authenticated;
