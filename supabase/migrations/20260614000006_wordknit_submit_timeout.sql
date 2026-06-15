-- ============================================================
-- wordknit.submit_timeout — countdown expiry handler
-- ============================================================
--
-- Fired by the FE when the count-down timer hits 0. Sets the
-- game's status to 'lost' (same terminal status as 4-mistakes-
-- losing — the cause doesn't change the outcome shape, just the
-- copy in the loss banner; the FE can distinguish by looking at
-- the mistakes count vs. the absence of mistakes).
--
-- Concurrency: multiple clients may fire submit_timeout at the
-- same instant because each client's local timer hits 0 around
-- the same wall-clock moment. The `SELECT ... FOR UPDATE` lock
-- serializes them; whichever transaction commits first flips
-- status to 'lost'; subsequent calls see status != 'in_progress'
-- and raise P0001. The FE swallows that "already lost" rejection
-- silently — it just means a peer beat us to the punch, and
-- realtime will propagate the loss to all clients.
--
-- The termination trigger (clear_active_on_termination, set up
-- in the wordknit baseline) clears common.club_active_game when
-- status flips terminal, same as the existing 4-mistakes-lose
-- and 4-groups-solved paths.

create function wordknit.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordknit.games%rowtype;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

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

  update wordknit.games set status = 'lost'
   where wordknit.games.id = target_game;
end;
$$;

revoke execute on function wordknit.submit_timeout(uuid) from public;
grant execute on function wordknit.submit_timeout(uuid) to authenticated;
