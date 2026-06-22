-- ============================================================
-- psychicnum schema — baseline
-- ============================================================
--
-- psychicnum is a tiny number-guessing game (target 1..10, hidden
-- server-side) that exists in two modes:
--
--   psychicnum_coop    — players share a single guess budget,
--                        see each other's guesses live, win OR
--                        lose together. First correct = team wins.
--                        Budget exhausted = team loses.
--
--   psychicnum_compete — players each have their own guess
--                        budget, can see opponents' remaining
--                        budget (but NOT their guesses or results),
--                        race to be first-correct. First correct
--                        = caller wins, everyone else loses
--                        immediately. All-exhausted or timer-
--                        expired = everyone loses.
--
-- Both modes share this one schema. The mode is denormalized onto
-- psychicnum.games.mode so RLS can branch without joining to
-- common.games every check. Schema-side gametype registration
-- inserts BOTH 'psychicnum_coop' and 'psychicnum_compete' rows
-- in common.gametypes.
--
-- The "family pair sharing a schema" pattern is canonical here.
-- See manifest.baseGametype + manifest.mode in src/common/lib/games.ts
-- for the FE side of the same idea. A future game that adds a
-- compete sibling (wordknit, freebee) follows this template:
--   - one schema, one folder
--   - two `common.gametypes` rows ('<base>_coop', '<base>_compete')
--   - mode-denormalized column on the game row for RLS branching
--   - one create_game RPC taking a `mode text` parameter
--
-- Educationally minimal: psychicnum is a deliberately tiny game,
-- and its coop/compete split is the smallest possible surface to
-- learn the pattern. Wordknit + freebee adoption can crib from
-- here directly.
--
-- What this still exercises that tinyspy doesn't:
--   - N-player, no turns (anyone-acts-any-time)
--   - A genuine server-side secret (the target), hidden from the
--     client even with devtools open via a column-level grant
--     that excludes `target` from authenticated SELECT
--   - The hidden-wordlist-style reveal pattern (target column
--     gated through a SECURITY DEFINER helper called inside a
--     security_invoker view)
--
-- Depends on `common` (clubs, profiles, games, game_players,
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
-- authenticated SELECT (see grants below). RPCs run as postgres
-- under SECURITY DEFINER and can read it freely; the FE only
-- learns it once the game is terminal, via the
-- `psychicnum.games_state` view + `_target_for` helper pattern.
--
-- `mode` is denormalized from `common.games.gametype`
-- ('psychicnum_coop' → mode='coop', etc.). The column lets the
-- RLS policy on `psychicnum.guesses` branch on mode without
-- joining to common.games on every visibility check. Read-only
-- after insert; no UPDATE policy.
--
-- Per-player guess budget lives on `psychicnum.players` (below).
-- The shared budget (coop) is "every player row has the same
-- value, and we decrement them all in lock-step"; the per-player
-- budget (compete) is "each row decrements independently." Same
-- shape, different RPC mechanics — see submit_guess.
--
-- club_handle stays on this row (denormalized from
-- common.games.club_handle) so the RLS policies can ask
-- is_club_member(club_handle) without a join.

create table psychicnum.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode text not null check (mode in ('coop', 'compete')),
  target int not null check (target between 1 and 10),
  created_at timestamptz not null default now()
);

create index psychicnum_games_club_handle_idx on psychicnum.games (club_handle);

-- ============================================================
-- psychicnum.players — per-player budget tracking
-- ============================================================
-- Created at game-start time: one row per player_user_ids entry,
-- with `guesses_remaining` seeded from `setup.guesses`.
--
-- In coop mode: every row shares the same value (and decrements
-- in lock-step with every guess). The shape is symmetric across
-- modes — a coop row's "remaining" just happens to equal the
-- next row's "remaining" because they decrement together.
--
-- In compete mode: each row decrements independently when its
-- owner submits.
--
-- Per-player outcome (won/lost) doesn't live here — it's
-- written to `common.game_players.result` at game-end (via
-- common.end_game's player_results param), which already has
-- the right shape for "all gametypes need a per-player outcome
-- jsonb." Storing it twice (here + game_players) would just be
-- duplicate writes. The FE reads game_players.result.

create table psychicnum.players (
  game_id uuid not null references psychicnum.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  guesses_remaining int not null
    check (guesses_remaining between 0 and 9),
  primary key (game_id, user_id)
);

create index psychicnum_players_game_id_idx on psychicnum.players (game_id);

-- ============================================================
-- psychicnum.guesses — append-only log
-- ============================================================
-- Used both for "show the history" in the UI and for tests'
-- post-condition checks. The per-player budget update happens on
-- psychicnum.players directly (not derived from a count(*) over
-- this table) so submit_guess stays cheap.

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

alter table psychicnum.games   enable row level security;
alter table psychicnum.players enable row level security;
alter table psychicnum.guesses enable row level security;

-- Games: any club member sees the row. (`target` is additionally
-- column-hidden, regardless of policy.)
create policy games_select on psychicnum.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Players: club-wide visibility in BOTH modes. The compete-mode
-- requirement is "opponents see my budget but not my guesses" —
-- so the budget column on this table is intentionally public to
-- the club. Same policy shape for both modes; no branching.
create policy players_select on psychicnum.players
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- Guesses: branch on the parent game's mode.
--   coop    — every club member sees every guess (default).
--   compete — each player sees only their own guesses; opponents'
--             guess values + correctness are private.
--
-- The branching reads `g.mode` from the parent psychicnum.games
-- row — denormalized expressly to avoid joining common.games on
-- every guess select.
create policy guesses_select on psychicnum.guesses
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
         and (g.mode = 'coop' or guesses.user_id = auth.uid())
    )
  );

-- ============================================================
-- Grants — `target` is column-excluded
-- ============================================================
-- Same column-level grant pattern as before: every column on
-- psychicnum.games EXCEPT `target`. The hidden-target view
-- below is the only authenticated read path for `target`.

grant select
  (id, club_handle, mode, created_at)
  on psychicnum.games to authenticated;

grant select on psychicnum.players to authenticated;
grant select on psychicnum.guesses to authenticated;

-- ============================================================
-- psychicnum.games_state — FE-ready read view
-- ============================================================
-- One read for "the gametype-specific fields of this game,
-- including the target IFF the game is terminal."
--
-- Mode-agnostic: the target reveal gates on
-- common.games.is_terminal, which becomes true at game-end in
-- BOTH modes. Coop end (team won/lost) and compete end (someone
-- won, or everyone lost) both write is_terminal=true via
-- common.end_game, so both surfaces flip the reveal at the
-- right moment.
--
-- play_state itself lives on common.games and is read by the FE
-- via useCommonGame — this view does NOT include it.

create function psychicnum._target_for(g_id uuid)
returns int
language sql
stable
security definer
set search_path = psychicnum, common, public, extensions
as $$
  select case when c.is_terminal then p.target else null end
    from psychicnum.games p
    join common.games c on c.id = p.id
   where p.id = g_id
$$;

revoke execute on function psychicnum._target_for(uuid) from public;
grant execute on function psychicnum._target_for(uuid) to authenticated;

create view psychicnum.games_state
  with (security_invoker = true)
as
  select
    id,
    club_handle,
    mode,
    created_at,
    psychicnum._target_for(id) as target
  from psychicnum.games;

grant select on psychicnum.games_state to authenticated;
revoke insert, update, delete on psychicnum.games_state from authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Three tables broadcast so the FE can subscribe to:
--   - games   — terminal-state flip (used to re-fetch the view
--                with target now revealed)
--   - players — guesses_remaining decrement (drives the budget
--                strip's live update + own-budget UI in compete)
--   - guesses — new entry (in coop everyone sees; in compete
--                the receiver's RLS hides others' entries, but
--                the postgres-changes payload still arrives —
--                FE filters defensively too)

alter publication supabase_realtime add table psychicnum.games;
alter publication supabase_realtime add table psychicnum.players;
alter publication supabase_realtime add table psychicnum.guesses;

-- ============================================================
-- psychicnum.create_game(target_club, setup, player_user_ids, mode)
-- ============================================================
-- One RPC for both modes. The `mode` parameter:
--   - chooses which gametype string is written to common.games
--     ('psychicnum_coop' or 'psychicnum_compete')
--   - is stored on psychicnum.games.mode for RLS branching
--   - is validated by a CHECK constraint regardless
--
-- Setup shape (same in both modes):
--   { "guesses": 3 | 5 | 7 | 9,
--     "timer":   { "kind": "none" | "countup" }
--             |  { "kind": "countdown", "seconds": 1..3600 } }
--
-- guesses meaning:
--   - coop: shared budget (every player row gets the same
--     initial value; decrement all on every guess).
--   - compete: per-player budget (every player row gets the
--     same initial value; only the guesser's row decrements).
--
-- Player-count check: compete needs 2+ players (one-player
-- compete is "racing yourself" — degenerate, hidden by the FE
-- manifest's numberOfPlayers range, also enforced here defensively).
-- Coop allows 1..6.

create function psychicnum.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  new_id uuid;
  s_guesses int;
  s_target int;
  game_title text;
  effective_gametype text;
begin
  -- ─── Validate mode + player-count ───────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. A solo race is just a
    -- coop game with a timer. FE manifest hides the compete
    -- button in 1-player clubs; this guard is the server-side
    -- catch.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/psychicnum/manifest.ts. See
  -- docs/code-conventions.md → "Per-game player counts".
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup shape ────────────────────────────
  if (setup->>'guesses') is null then
    raise exception 'setup.guesses is required' using errcode = 'P0001';
  end if;
  s_guesses := (setup->>'guesses')::int;
  if s_guesses not in (3, 5, 7, 9) then
    raise exception 'setup.guesses must be 3, 5, 7, or 9 (got %)', s_guesses
      using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  s_target := 1 + floor(random() * 10)::int;

  -- The title is purely a human-readable label for the game row;
  -- it must NOT carry the target (that would put the secret in the
  -- club-wide-readable common.games.title). Use a random short
  -- numeric id so games are distinguishable in lists without
  -- leaking anything. The column-level grant on
  -- psychicnum.games.target stays the canonical "true server-side
  -- secret" — title is just a label.
  game_title := '#' || lpad((floor(random() * 1000000))::int::text, 6, '0');

  effective_gametype := 'psychicnum_' || mode;

  -- Common-side coordination — see common.create_game for the
  -- full responsibilities (auth, membership, vacate prior
  -- current-view game, insert common.games + game_players,
  -- return canonical id).
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids,
    game_title,
    setup,
    setup
  );

  -- Insert the gametype-specific row.
  insert into psychicnum.games (id, club_handle, mode, target)
  values (new_id, target_club, mode, s_target);

  -- One player row per player_user_ids entry, all seeded with
  -- the same initial guess budget. Coop will decrement all of
  -- them in lock-step; compete decrements each independently.
  insert into psychicnum.players (game_id, user_id, guesses_remaining)
  select new_id, uid, s_guesses
    from unnest(player_user_ids) as uid;

  return query select new_id;
end;
$$;

revoke execute on function psychicnum.create_game(text, jsonb, uuid[], text) from public;
grant execute on function psychicnum.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- psychicnum.submit_guess — the only mid-game action
-- ============================================================
-- Returns one of: 'correct' (caller won; game terminal),
-- 'wrong' (game continues), 'lost' (the guess that exhausted
-- the last available budget anywhere in the game).
--
-- Mode branching:
--
--   coop:
--     - Caller's budget must be > 0 (everyone shares; if anyone
--       has 0 then everyone does — game would already be terminal).
--     - Decrement every player_row's guesses_remaining by 1.
--     - If correct: end_game('won'), all players' result = won:true.
--     - If wrong AND all rows now at 0: end_game('lost'), all
--       players' result = won:false.
--     - If wrong: update_state and return 'wrong'.
--
--   compete:
--     - Caller's row's budget must be > 0 (P0001 if not).
--     - Decrement ONLY the caller's row.
--     - If correct: end_game('won_compete'), caller result=
--       won:true, everyone else result=won:false. Game ends
--       for everyone.
--     - If wrong AND every player row is now at 0: end_game(
--       'lost_compete'), all results = won:false.
--     - Else: update_state and return 'wrong'.
--
-- Concurrency: SELECT FOR UPDATE on the game row serializes
-- concurrent compete submits. Two simultaneous correct guesses
-- in compete: first transaction commits with that player as
-- winner; second sees play_state != 'playing' on the second
-- read and raises 'game is not active'.

create function psychicnum.submit_guess(target_game uuid, guess int)
returns text
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  g psychicnum.games%rowtype;
  current_play_state text;
  initial_guesses int;
  is_correct boolean;
  caller_remaining int;
  total_remaining int;
  player_results jsonb;
  winner_name text;
  terminal_state text;
  terminal_outcome text;
begin
  if guess is null or guess < 1 or guess > 10 then
    raise exception 'guess must be between 1 and 10' using errcode = 'P0001';
  end if;

  -- Lock the gametype row for serialization of concurrent submits.
  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate.
  caller_id := common.require_game_player(target_game);

  select play_state, (setup->>'guesses')::int
    into current_play_state, initial_guesses
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  -- Per-mode budget check on the caller's row.
  select guesses_remaining into caller_remaining
    from psychicnum.players
   where game_id = target_game and user_id = caller_id;
  if caller_remaining is null then
    -- Shouldn't happen — require_game_player passed, so the row
    -- exists. Defensive.
    raise exception 'no budget row for caller' using errcode = 'P0002';
  end if;
  if caller_remaining <= 0 then
    raise exception 'no guesses remaining' using errcode = 'P0001';
  end if;

  is_correct := (guess = g.target);

  insert into psychicnum.guesses (game_id, user_id, number, was_correct)
  values (target_game, caller_id, guess, is_correct);

  -- ─── Budget decrement: coop = everyone, compete = caller ─
  if g.mode = 'coop' then
    update psychicnum.players
       set guesses_remaining = guesses_remaining - 1
     where game_id = target_game;
  else
    update psychicnum.players
       set guesses_remaining = guesses_remaining - 1
     where game_id = target_game and user_id = caller_id;
  end if;

  -- Total remaining budget across the whole game. Drives the
  -- "all-exhausted" terminal branch in both modes (coop: equal
  -- to N × current value of any row; compete: sum of independent
  -- counters).
  select sum(guesses_remaining) into total_remaining
    from psychicnum.players
   where game_id = target_game;

  -- ─── Correct guess: caller wins; game terminal in both modes ─
  if is_correct then
    -- Frozen-username for the listing label.
    select username into winner_name
      from common.profiles where user_id = caller_id;

    if g.mode = 'coop' then
      -- Team win.
      select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'won';
      terminal_outcome := 'won';
    else
      -- Compete: caller wins, everyone else loses.
      select jsonb_object_agg(
               user_id::text,
               case when user_id = caller_id
                    then '{"won": true}'::jsonb
                    else '{"won": false}'::jsonb
               end)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'won_compete';
      terminal_outcome := 'won_compete';
    end if;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'guesses_used', initial_guesses - caller_remaining + 1,
        'winner_username', winner_name
      ),
      player_results
    );
    return 'correct';
  end if;

  -- ─── Wrong guess + every player at 0 = collective loss ───
  if total_remaining <= 0 then
    if g.mode = 'coop' then
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'lost';
      terminal_outcome := 'lost';
    else
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'lost_compete';
      terminal_outcome := 'lost_compete';
    end if;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'guesses_used', initial_guesses
      ),
      player_results
    );
    return 'lost';
  end if;

  -- ─── Wrong guess, game continues ─────────────────────────
  -- For the listing label, surface (coop) the shared remaining
  -- value, or (compete) the caller's own remaining value.
  perform common.update_state(
    target_game,
    'playing',
    jsonb_build_object('guesses_remaining',
      case when g.mode = 'coop'
           then caller_remaining - 1
           else total_remaining
      end)
  );
  return 'wrong';
end;
$$;

revoke execute on function psychicnum.submit_guess(uuid, int) from public;
grant execute on function psychicnum.submit_guess(uuid, int) to authenticated;

-- ============================================================
-- psychicnum.submit_timeout — countdown expired
-- ============================================================
-- Timer expiry: everyone loses, regardless of mode. In coop it's
-- the same "team lost" message. In compete, even though players
-- were racing, the clock ran out before anyone won — collective
-- loss is the only honest outcome.
--
-- Terminal play_state is the per-mode value ('lost' for coop,
-- 'lost_compete' for compete) so the FE's GameOverModal can
-- show mode-appropriate copy.
--
-- Idempotency: the `play_state <> 'playing'` guard means a
-- second concurrent fire from another tab raises P0001; the
-- FE swallows.

create function psychicnum.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  g psychicnum.games%rowtype;
  current_play_state text;
  initial_guesses int;
  player_results jsonb;
  terminal_state text;
  terminal_outcome text;
begin
  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state, (setup->>'guesses')::int
    into current_play_state, initial_guesses
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  if g.mode = 'coop' then
    terminal_state := 'lost';
    terminal_outcome := 'lost_timeout';
  else
    terminal_state := 'lost_compete';
    terminal_outcome := 'lost_compete_timeout';
  end if;

  perform common.end_game(
    target_game,
    terminal_state,
    jsonb_build_object(
      'outcome', terminal_outcome,
      'guesses_used', initial_guesses - (
        select coalesce(sum(guesses_remaining), 0)::int / greatest(
          (select count(*)::int from psychicnum.players where game_id = target_game),
          1)
          from psychicnum.players where game_id = target_game)
    ),
    player_results
  );
end;
$$;

revoke execute on function psychicnum.submit_timeout(uuid) from public;
grant execute on function psychicnum.submit_timeout(uuid) to authenticated;

-- ============================================================
-- psychicnum.end_game — manual stop
-- ============================================================
--
-- psychicnum is a deliberately minimal toy, but it carries the
-- same manual "End game" affordance every other game has, for
-- consistency: any friend in the game can decide the group is
-- done and stop it. (The Zoom-call answer to "we're bored, let's
-- move on" — see CLAUDE.md's audience note.)
--
-- Unlike submit_timeout, which uses the per-mode terminal vocab
-- ('lost' / 'lost_compete') because timing out genuinely is a
-- loss, a *manual* stop is neither a win nor a loss — the friends
-- simply agreed to stop. So this writes the UNIFORM terminal
-- play_state 'ended' (the same value freebee/the other games use
-- for their manual stops) with status.outcome='manual'. The FE
-- has explicit 'ended' branches that render this neutrally (green
-- "Game ended", not the red "you lost" treatment).
--
-- Per-player result is the bare `{"won": false}` for everyone —
-- psychicnum tracks no per-player score or rank, so there's
-- nothing richer to record. Nobody won; nobody is singled out.
--
-- The same shape across both modes; only g.mode is echoed into
-- status so the labelFor / modal can stay mode-aware if it wants.
--
-- The Realtime touch at the end is the same trick documented in
-- the other games' end_game: common.end_game writes to
-- common.games, but the FE's useGame subscribes to
-- psychicnum.games (filtered id=eq.gameId). A no-op self-set on
-- psychicnum.games produces a WAL entry Realtime picks up, so the
-- FE refetches and the post-terminal number reveal updates.

create function psychicnum.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  g_row psychicnum.games%rowtype;
  current_play_state text;
  player_results jsonb;
begin
  select * into g_row from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a concurrent click + a
    -- timer expiry / winning guess in another tab) raises this;
    -- the FE swallows it the same way it does for submit_timeout's
    -- "already terminal" race.
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Manual stop has no winner — every player gets {won:false}.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    'ended',
    jsonb_build_object('outcome', 'manual', 'mode', g_row.mode),
    player_results
  );

  -- Realtime touch — wake the psychicnum.games subscription.
  update psychicnum.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function psychicnum.end_game(uuid) from public;
grant execute on function psychicnum.end_game(uuid) to authenticated;

-- ============================================================
-- Register psychicnum with common.gametypes — both modes
-- ============================================================
-- Two rows: coop and compete. Same schema serves both; the FE
-- manifests carry the per-mode display + behavior; the
-- create_game RPC routes on mode.

insert into common.gametypes (gametype, min_players) values
  ('psychicnum_coop', 1),
  ('psychicnum_compete', 2)
on conflict do nothing;
