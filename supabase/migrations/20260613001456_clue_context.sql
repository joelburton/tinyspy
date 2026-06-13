-- ============================================================
-- get_clue_context: read-only RPC returning the data the
-- "suggest a clue" Edge Function needs to ask Anthropic.
-- ============================================================
--
-- Returns a single jsonb with:
--   greens:         text[]  — caller's unrevealed green agents
--   neutrals:       text[]  — caller's unrevealed neutrals (avoid)
--   assassin:       text    — caller's unrevealed assassin (avoid),
--                              or null if it's already revealed
--   previous_clues: array of {word, count, by_seat, turn_number}
--
-- Authorization: caller must be the current clue-giver of an active
-- (or sudden-death) game. We do the check here so the Edge Function
-- can stay a thin orchestrator; it gets back either a clean context
-- or a clean rejection.

create function public.get_clue_context(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  caller_seat text;
  game_status text;
  current_giver text;
  caller_key jsonb;
  ctx jsonb;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Pull seat + game state in one shot.
  select gp.seat, g.status, g.current_clue_giver, gp.key_card
    into caller_seat, game_status, current_giver, caller_key
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.game_id = target_game and gp.user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if game_status not in ('active', 'sudden_death') then
    raise exception 'no suggestions outside of active play' using errcode = 'P0001';
  end if;

  if caller_seat is distinct from current_giver then
    raise exception 'only the current clue-giver can request a suggestion'
      using errcode = 'P0001';
  end if;

  -- Build the context object. Each of the three category lookups uses the
  -- caller's key view (caller_key) indexed by w.position. `->>` returns
  -- the label as text ('G' | 'N' | 'A').
  select jsonb_build_object(
    'greens', coalesce((
      select jsonb_agg(w.word order by w.position)
      from public.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'G'
    ), '[]'::jsonb),
    'neutrals', coalesce((
      select jsonb_agg(w.word order by w.position)
      from public.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'N'
    ), '[]'::jsonb),
    'assassin', (
      select w.word
      from public.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'A'
      limit 1
    ),
    'previous_clues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'word', c.word,
          'count', c.count,
          'by_seat', c.by_seat,
          'turn_number', c.turn_number
        ) order by c.turn_number
      )
      from public.clues c
      where c.game_id = target_game
    ), '[]'::jsonb)
  ) into ctx;

  return ctx;
end;
$$;

revoke execute on function public.get_clue_context(uuid) from public;
grant execute on function public.get_clue_context(uuid) to authenticated;
