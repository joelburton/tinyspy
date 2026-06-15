-- ============================================================
-- psychicnum schema — baseline (squashed)
-- ============================================================
--
-- Squashed from three originally-separate migrations:
--
--   2026-06-12  psychicnum_baseline             — schema, tables,
--                                                  RLS + column-grant
--                                                  hiding `target`, RPCs
--                                                  (1-arg create_game,
--                                                  submit_guess, play_again,
--                                                  reveal_target,
--                                                  termination trigger)
--   2026-06-14  psychicnum_remove_play_again    — drops play_again RPC +
--                                                  games.next_game_id
--   2026-06-14  psychicnum_setup                — adds games.setup jsonb,
--                                                  widens guesses_remaining
--                                                  check to 0..9, replaces
--                                                  create_game with the
--                                                  2-arg version
--
-- Squashing collapses the alter/drop/replace dances into a single
-- forward definition. Git history holds the originals.
--
-- Psychic Num is a tiny cooperative number-guessing game: pick a
-- random target 1..10, hidden server-side; any club member can
-- guess at any time; first correct guess wins; running out of
-- guesses loses. Deliberately minimal — it exercises the
-- multi-game architecture (per-game schema, per-game theme,
-- per-game chunk split, column-level secrecy) with the absolute
-- minimum game-logic surface, so the patterns are legible
-- compared to tinyspy's richer shape.
--
-- What this exercises that tinyspy doesn't:
--   - N-player, no turns (anyone-acts-any-time)
--   - A genuine server-side secret (the target), hidden from the
--     client even with devtools open via a column-level grant
--     that excludes `target` from authenticated SELECT
--   - A different status enum (active/won/lost — no sudden_death,
--     no multi-axis loss reasons)
--
-- The static-starting-state vocabulary calls for a "boards" table
-- in some games (boggle's dice, crosswords' grid). Psychic Num's
-- only static datum is the target number — too small to warrant
-- its own table, so it co-locates onto the game row, matching how
-- tinyspy keeps its words alongside the game.
--
-- Depends on `common` (clubs, profiles, club_active_game,
-- is_club_member, gametypes). Per the removability invariant,
-- common MUST NOT reference psychicnum back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists psychicnum;
grant usage on schema psychicnum to authenticated;

-- ============================================================
-- psychicnum.games — one row per playing
-- ============================================================
-- `target` is the secret 1..10; column-grant excludes it from
-- authenticated SELECT (see grants below). RPCs run as the
-- postgres role under security definer and can read it freely;
-- the FE only learns it via the reveal_target RPC after the game
-- ends.
--
-- `setup jsonb` is the frozen-at-create-time player choices —
-- today just `{ "guesses": 3 | 5 | 7 | 9 }`. Persisted because the
-- mutable `guesses_remaining` counter decrements during play, so
-- after the game ends the counter at 0 doesn't tell you what the
-- starting budget was. The `setup` column preserves intent for
-- end-of-game review.
--
-- The `guesses_remaining between 0 and 9` constraint matches the
-- max allowed setup.guesses value.

create table psychicnum.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'won', 'lost')),
  target int not null check (target between 1 and 10),
  guesses_remaining int not null default 7
    check (guesses_remaining between 0 and 9),
  winner_id uuid references common.profiles(user_id) on delete set null,
  setup jsonb not null,
  created_at timestamptz not null default now()
);

create index psychicnum_games_club_id_idx on psychicnum.games (club_id);

-- ============================================================
-- psychicnum.guesses — append-only log
-- ============================================================
-- Used both for "show the history" in the UI and for the
-- guesses_remaining counter (though we update the counter on
-- psychicnum.games inline rather than recomputing from this log,
-- to keep submit_guess cheap and to support a column-level RLS
-- story).

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
-- RLS
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
-- Grants — `target` is column-excluded
-- ============================================================
-- Default `grant select` would include `target`, defeating the
-- "backend-authoritative secret" property. Column-list grant
-- whitelists every column EXCEPT `target`. The RPCs run as the
-- postgres role (security definer) and can read `target`
-- freely; the authenticated role cannot.
--
-- After game termination, players reveal `target` via the
-- `reveal_target` RPC (see below), which gate-checks the
-- terminal-status precondition.

grant select
  (id, club_id, status, guesses_remaining, winner_id, setup, created_at)
  on psychicnum.games to authenticated;

grant select on psychicnum.guesses to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Both tables broadcast so the FE can subscribe to:
--   - games:    status flips (won/lost), guesses_remaining decrement
--   - guesses:  new entries (someone in your club guessed)

alter publication supabase_realtime add table psychicnum.games;
alter publication supabase_realtime add table psychicnum.guesses;

-- ============================================================
-- psychicnum.create_game(target_club, setup) — start a new game
-- ============================================================
-- Validates the setup shape, picks a random target 1–10, inserts
-- the game row in `active` with `guesses_remaining` initialized
-- from `setup.guesses`, upserts common.club_active_game pointing
-- at it.
--
-- Setup shape: { "guesses": 3 | 5 | 7 | 9 }
--
-- No member-count check — psychic-num plays with any club size.
-- Must agree with the `numberOfPlayers: [1, null]` declaration
-- in src/psychicnum/manifest.ts. See docs/code-conventions.md →
-- "Per-game player counts" for the cross-reference convention.

create function psychicnum.create_game(target_club uuid, setup jsonb)
returns table(id uuid)
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
  s_guesses int;
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

  -- ─── Validate setup shape ────────────────────────────
  -- One option, four allowed values. We don't trust the FE for
  -- any of this — the dialog narrows TypeScript to the same set,
  -- but a curious client could send anything.
  --
  -- Missing-vs-bad-value split so each rejection has a clean
  -- message. Otherwise PL/pgSQL's % placeholder substitutes NULL
  -- as the empty string and we'd raise "...must be 3, 5, 7, or 9
  -- (got )" — readable, but confusingly empty in the parens.
  if (setup->>'guesses') is null then
    raise exception 'setup.guesses is required' using errcode = 'P0001';
  end if;
  s_guesses := (setup->>'guesses')::int;
  if s_guesses not in (3, 5, 7, 9) then
    raise exception 'setup.guesses must be 3, 5, 7, or 9 (got %)', s_guesses
      using errcode = 'P0001';
  end if;

  -- Insert the game row. guesses_remaining seeds from s_guesses;
  -- setup itself is persisted for game-review surfaces. target is
  -- the random 1..10 secret, hidden by the column-level grant.
  insert into psychicnum.games (club_id, target, guesses_remaining, setup)
  values (
    target_club,
    1 + floor(random() * 10)::int,
    s_guesses,
    setup
  )
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

revoke execute on function psychicnum.create_game(uuid, jsonb) from public;
grant execute on function psychicnum.create_game(uuid, jsonb) to authenticated;

-- ============================================================
-- psychicnum.submit_guess — the only mid-game action
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
-- The club_active_game row is cleared by the termination trigger
-- (below), not inline here.

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
-- psychicnum.clear_active_on_termination — trigger
-- ============================================================
-- Mirrors tinyspy.clear_active_on_termination. When a game's
-- status flips from 'active' to 'won' or 'lost', delete the
-- matching club_active_game row so the club has no active
-- pointer — the FE then shows the game in 'completed' instead
-- of 'active' on the club page.
--
-- security definer because the calling RPC runs as authenticated
-- and that role has no grant to delete from
-- common.club_active_game.

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
-- psychicnum.reveal_target — surfaces the secret after game end
-- ============================================================
-- The `target` column is hidden from authenticated SELECT via
-- column-level grant (see the grants section). Players need to
-- see the number after a loss ("the number was 7"); this RPC is
-- the gated path. Rejects while the game is still active so a
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

-- ============================================================
-- Register psychicnum with common.gametypes
-- ============================================================

insert into common.gametypes (gametype) values ('psychicnum')
on conflict do nothing;
