-- ============================================================
-- words: 25 rows per game, one per board position. revealed_as
-- is null until a guess reveals the cell.
-- ============================================================

create table public.words (
  game_id uuid not null references public.games(id) on delete cascade,
  position int not null check (position between 0 and 24),
  word text not null,
  revealed_by text check (revealed_by in ('A', 'B')),
  revealed_as text check (revealed_as in ('G', 'N', 'A')),
  primary key (game_id, position)
);

alter table public.words enable row level security;

create policy words_select on public.words
  for select to authenticated
  using (public.is_player_in_game(game_id));

-- No write policies — only the start_game / submit_guess RPCs write here.

grant select on public.words to authenticated;

alter publication supabase_realtime add table public.words;

-- ============================================================
-- start_game: picks 25 words, generates the Duet key card, flips
-- the game to active. Callable only by a player in the game.
-- ============================================================

create function public.start_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  picked_words text[];
  tiles jsonb[];
  a_view text[];
  b_view text[];
  i int;
  j int;
  tmp jsonb;
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

  -- Lock the games row to serialize concurrent start attempts.
  perform 1 from public.games where id = target_game for update;

  if not exists (
    select 1 from public.games where id = target_game and status = 'lobby'
  ) then
    raise exception 'game is not in lobby' using errcode = 'P0001';
  end if;

  if (select count(*) from public.game_players where game_id = target_game) <> 2 then
    raise exception 'need 2 players to start' using errcode = 'P0001';
  end if;

  -- Pick 25 random words.
  select array_agg(word) into picked_words
  from (select word from public.word_pool order by random() limit 25) sub;

  if array_length(picked_words, 1) <> 25 then
    raise exception 'word_pool must contain at least 25 words' using errcode = 'P0001';
  end if;

  -- Build the 25-tile Duet distribution:
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

  -- Split into per-player views.
  a_view := array[]::text[];
  b_view := array[]::text[];
  for i in 1..25 loop
    a_view := a_view || (tiles[i]->>'a');
    b_view := b_view || (tiles[i]->>'b');
  end loop;

  -- Insert words.
  for i in 0..24 loop
    insert into public.words (game_id, position, word)
    values (target_game, i, picked_words[i+1]);
  end loop;

  -- Store each player's key view (only that player can read it via RLS).
  update public.game_players
    set key_card = to_jsonb(a_view)
    where game_id = target_game and seat = 'A';

  update public.game_players
    set key_card = to_jsonb(b_view)
    where game_id = target_game and seat = 'B';

  -- Activate the game; A gives the first clue.
  update public.games
    set status = 'active', current_clue_giver = 'A'
    where id = target_game;
end;
$$;

revoke execute on function public.start_game(uuid) from public;
grant execute on function public.start_game(uuid) to authenticated;
