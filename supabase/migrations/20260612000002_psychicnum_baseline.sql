-- ============================================================
-- Psychic Num — a tiny cooperative number-guessing game
-- ============================================================
--
-- Gameplay (intentionally minimal):
--   1. Game creation picks a random target 1..10, hidden server-side.
--   2. Any club member can guess at any time — no turns, no
--      seat assignment. All members play together against the
--      shared 7-guess budget.
--   3. First correct guess → game ends, status='won', that
--      guesser is the winner.
--   4. After 7 wrong guesses (across all members) → status='lost'.
--
-- This game is deliberately a toy. It exists to exercise the
-- multi-game architecture (manifest registry, schema-per-game,
-- per-game RLS, per-game theme, per-game chunk split) with the
-- absolute minimum game-logic surface, so the patterns are
-- legible and easy to compare against tinyspy's richer shape.
-- It is also a stand-in for "the second game" until something
-- substantial (Boggle) lands.
--
-- What this exercises that tinyspy doesn't:
--   - N-player, no turns (anyone-acts-any-time)
--   - A genuine server-side secret (the target), hidden from the
--     client even with devtools open via a column-level grant
--     that excludes `target` from authenticated SELECT
--   - A different status enum (active/won/lost — no sudden_death,
--     no multi-axis loss reasons)
--   - A different theme color scheme (lazy-loaded with the chunk)
--
-- The static-starting-state vocabulary calls for a "boards" table
-- in some games (boggle's dice, crosswords' grid). Psychic Num's
-- only static datum is the target number — too small to warrant
-- its own table, so it co-locates onto the game row, matching how
-- tinyspy keeps its words + key-cards alongside the game.
--
-- This is the psychicnum schema's baseline migration. Per the
-- alpha-software prior in CLAUDE.md, schema changes after this
-- file are written as new timestamped migrations, not as edits
-- to this file.
-- ============================================================

-- ============================================================
-- 1. Schema + usage grant
-- ============================================================

create schema psychicnum;
grant usage on schema psychicnum to authenticated;

-- ============================================================
-- 2. Tables
-- ============================================================

-- psychicnum.games — one row per playing.
-- `target` is the secret; see grants below for how it's hidden
-- from authenticated SELECT.
-- `next_game_id` mirrors tinyspy's idempotent-play_again pattern.
create table psychicnum.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'won', 'lost')),
  target int not null check (target between 1 and 10),
  guesses_remaining int not null default 7
    check (guesses_remaining between 0 and 7),
  winner_id uuid references common.profiles(user_id) on delete set null,
  next_game_id uuid references psychicnum.games(id) on delete set null,
  created_at timestamptz not null default now()
);

create index psychicnum_games_club_id_idx on psychicnum.games (club_id);

-- psychicnum.guesses — append-only log of every guess made.
-- Used both for "show the history" in the UI and for the
-- guesses_remaining counter (though we update the counter
-- on psychicnum.games inline rather than recomputing from
-- this log, to keep submit_guess cheap and to support a
-- column-level RLS story).
create table psychicnum.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references psychicnum.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  number int not null check (number between 1 and 10),
  was_correct boolean not null,
  guessed_at timestamptz not null default now()
);

create index psychicnum_guesses_game_id_idx on psychicnum.guesses (game_id);

-- ============================================================
-- 3. Row-level security
-- ============================================================
-- Club members can SELECT both tables. Writes never happen
-- directly — they go through the security-definer RPCs below.

alter table psychicnum.games enable row level security;
alter table psychicnum.guesses enable row level security;

-- A member of the club that owns this game can see the row.
-- (The `target` column is *additionally* hidden by a column-level
-- grant; see the grants section below.)
create policy games_select on psychicnum.games
  for select to authenticated
  using (common.is_club_member(club_id));

-- Guesses inherit visibility from their parent game.
create policy guesses_select on psychicnum.guesses
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_id)
    )
  );

-- ============================================================
-- 4. Grants — `target` is column-excluded
-- ============================================================
-- Default `grant select` would include `target`, defeating the
-- "backend-authoritative secret" property. Column-list grant
-- whitelists every column EXCEPT `target`. The RPCs run as the
-- `postgres` role (security definer) and can read `target`
-- freely; the authenticated role cannot.
--
-- After game termination, players reveal `target` via the
-- `reveal_target` RPC (see below), which gate-checks the
-- terminal-status precondition.

grant select
  (id, club_id, status, guesses_remaining, winner_id, next_game_id, created_at)
  on psychicnum.games to authenticated;

grant select on psychicnum.guesses to authenticated;

-- ============================================================
-- 5. Realtime
-- ============================================================
-- Both tables broadcast so the FE can subscribe to:
--   - games:    status flips (won/lost), guesses_remaining decrement
--   - guesses:  new entries (someone in your club guessed)

alter publication supabase_realtime add table psychicnum.games;
alter publication supabase_realtime add table psychicnum.guesses;

-- ============================================================
-- 6. create_game — start a new game in a club
-- ============================================================
-- Pre-check: caller is a club member. No minimum-member check —
-- psychic-num plays fine with any membership count (a solo club's
-- single member can play it themselves; v1 doesn't surface that as
-- a UI affordance, but the game logic doesn't care).
--
-- Effects:
--   - inserts a row with a random target 1..10
--   - upserts common.club_active_game pointing at it, which
--     auto-pauses whatever was previously active for the club
--     (per the v1 active-game-per-club invariant)

create function psychicnum.create_game(target_club uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
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

  insert into psychicnum.games (club_id, target)
  values (target_club, 1 + floor(random() * 10)::int)
  returning games.id into new_id;

  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'psychicnum', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function psychicnum.create_game(uuid) from public;
grant execute on function psychicnum.create_game(uuid) to authenticated;

-- ============================================================
-- 7. submit_guess — the only mid-game action
-- ============================================================
-- Returns one of: 'correct' (caller won), 'wrong' (game
-- continues), 'lost' (caller's wrong guess used the last token).
--
-- Concurrency: the SELECT ... FOR UPDATE on the game row
-- serializes simultaneous calls. With "first correct guess wins"
-- semantics, if two players guess the target at the same instant,
-- whichever transaction commits first is the winner; the second
-- one sees status != 'active' and raises 'game is not active'.
--
-- Duplicate guesses are allowed — anyone can guess any number,
-- even one already-wrongly-guessed. A dumb move in a dumb game.
--
-- The club_active_game row is cleared by a trigger on
-- psychicnum.games (see section 9), not inline here.

create function psychicnum.submit_guess(target_game uuid, guess int)
returns text
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  g psychicnum.games%rowtype;
  is_correct boolean;
  remaining int;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if guess is null or guess < 1 or guess > 10 then
    raise exception 'guess must be between 1 and 10' using errcode = 'P0001';
  end if;

  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if not common.is_club_member(g.club_id) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  if g.status <> 'active' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  is_correct := (guess = g.target);

  insert into psychicnum.guesses (game_id, user_id, number, was_correct)
  values (target_game, caller_id, guess, is_correct);

  if is_correct then
    update psychicnum.games
       set status = 'won',
           winner_id = caller_id,
           guesses_remaining = guesses_remaining - 1
     where psychicnum.games.id = target_game;
    return 'correct';
  end if;

  remaining := g.guesses_remaining - 1;

  if remaining <= 0 then
    update psychicnum.games
       set status = 'lost',
           guesses_remaining = 0
     where psychicnum.games.id = target_game;
    return 'lost';
  end if;

  update psychicnum.games
     set guesses_remaining = remaining
   where psychicnum.games.id = target_game;
  return 'wrong';
end;
$$;

revoke execute on function psychicnum.submit_guess(uuid, int) from public;
grant execute on function psychicnum.submit_guess(uuid, int) to authenticated;

-- ============================================================
-- 8. play_again — successor-game shortcut
-- ============================================================
-- Mirrors tinyspy.play_again's contract:
--   - rejects if the previous game hasn't ended
--   - rejects if the caller isn't a club member of the previous game
--   - creates a fresh game in the same club, returns its id
--   - idempotent via prev.next_game_id: whichever caller arrives
--     first creates; a later call from the same prev_game gets
--     back the same successor id rather than a duplicate game

create function psychicnum.play_again(prev_game uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  prev psychicnum.games%rowtype;
  successor_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select * into prev from psychicnum.games
   where psychicnum.games.id = prev_game
   for update;
  if not found then
    raise exception 'previous game not found' using errcode = 'P0002';
  end if;

  if not common.is_club_member(prev.club_id) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  if prev.status = 'active' then
    raise exception 'previous game has not ended' using errcode = 'P0001';
  end if;

  if prev.next_game_id is not null then
    return query select prev.next_game_id;
    return;
  end if;

  insert into psychicnum.games (club_id, target)
  values (prev.club_id, 1 + floor(random() * 10)::int)
  returning games.id into successor_id;

  update psychicnum.games
     set next_game_id = successor_id
   where psychicnum.games.id = prev_game;

  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (prev.club_id, 'psychicnum', successor_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select successor_id;
end;
$$;

revoke execute on function psychicnum.play_again(uuid) from public;
grant execute on function psychicnum.play_again(uuid) to authenticated;

-- ============================================================
-- 9. Trigger: clear club_active_game on termination
-- ============================================================
-- Mirrors tinyspy.clear_active_on_termination. When a game's
-- status flips from 'active' to 'won' or 'lost', delete the
-- matching club_active_game row so the club has no active
-- pointer — the FE then shows the game in 'completed' instead
-- of 'active' on the club page.
--
-- security definer because the calling RPC runs as authenticated
-- and that role has no grant to delete from common.club_active_game.

create function psychicnum.clear_active_on_termination()
returns trigger
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
begin
  if new.status in ('won', 'lost')
     and old.status = 'active' then
    delete from common.club_active_game
     where club_id = new.club_id
       and gametype = 'psychicnum'
       and game_id = new.id;
  end if;
  return new;
end;
$$;

create trigger clear_active_on_termination
  after update of status on psychicnum.games
  for each row execute function psychicnum.clear_active_on_termination();

-- ============================================================
-- 10. reveal_target — surfaces the secret after game end
-- ============================================================
-- The `target` column is hidden from authenticated SELECT via
-- column-level grant (see section 4). Players need to see the
-- number after a loss ("the number was 7"); this RPC is the
-- gated path. Rejects while the game is still active so a
-- curious client can't peek mid-game.

create function psychicnum.reveal_target(target_game uuid)
returns int
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  g psychicnum.games%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select * into g from psychicnum.games
   where psychicnum.games.id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if not common.is_club_member(g.club_id) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  if g.status = 'active' then
    raise exception 'game is still active' using errcode = 'P0001';
  end if;

  return g.target;
end;
$$;

revoke execute on function psychicnum.reveal_target(uuid) from public;
grant execute on function psychicnum.reveal_target(uuid) to authenticated;
