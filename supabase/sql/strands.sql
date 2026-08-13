-- ============================================================
-- strands — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies and grants for strands. Everything here is
-- drop-and-recreate safe, so this file is **re-applied in full on every
-- deploy** (`gmake db-sql`) — it is the CURRENT definition, not a delta. Edit
-- it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260804000000_strands.sql` — tables, constraints,
-- indexes, the Realtime publication and the gametype seed row.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
--
-- THE SHIELD. strands hides its answer key, unlike connections which hands the
-- board to the FE. The mechanism is waffle's / crosswords': a COLUMN GRANT that
-- omits `solution`, plus a SECURITY DEFINER helper that hands it back once the
-- game is over. The rationale — that a dictionary lookup forces a server round
-- trip anyway, so classifying server-side costs nothing extra — is written up in
-- the migration header and docs/strands-plan.md §3.
-- ============================================================

grant usage on schema strands to authenticated;

-- ============================================================
-- strands.puzzles — the archive
-- ============================================================
-- The setup form's date picker lists what's available, and that is ALL an
-- ordinary player may read: not the board, not the clue, and certainly not the
-- solution. Withholding the board is not about cheating (you see it the moment
-- you start) — it just keeps "browse the archive" from becoming "study tomorrow's
-- puzzle". The presence of ANY column grant flips the table to "only granted
-- columns visible", so the safe ones are enumerated and the rest are hidden by
-- omission.
--
-- REVOKE FIRST, and this is load-bearing rather than tidy. Grants are ADDITIVE,
-- so a table-wide `grant select` that ever reached this database — a stray psql
-- line, a bad migration — would NOT be undone by re-applying this file: the
-- column grants below would simply be added alongside it, and `solution` would
-- stay readable. Since supabase/sql/ is meant to be the authoritative CURRENT
-- definition, the shield has to start by clearing whatever came before.
-- (Discovered by planting exactly that break and finding the file couldn't heal
-- it.)
revoke select on strands.puzzles from authenticated;
grant select (id, source_id, puzzle_date) on strands.puzzles to authenticated;

drop policy if exists puzzles_select on strands.puzzles;
create policy puzzles_select on strands.puzzles
  for select to authenticated
  using (true);

-- The import CLI writes puzzles as the service_role (bypasses RLS; it is the
-- only writer — there is no INSERT grant to authenticated). It needs schema
-- USAGE plus full column access, including `solution`, to seed the library.
grant usage on schema strands to service_role;
-- update too: the importer upserts, and a re-fetch may carry a corrected
-- puzzle that should refresh its row in place.
grant insert, update, select on strands.puzzles to service_role;

-- ============================================================
-- strands.games
-- ============================================================
-- Everything EXCEPT `solution`. games_state re-exposes it conditionally via the
-- definer helper below. `active_hint_coords` IS granted: a spent hint is meant
-- to be seen, and it carries coordinates only — never the word — so the player
-- still has to work out the order.
-- Revoke first — see the note on strands.puzzles above. This is what makes the
-- file self-healing: whatever SELECT privilege exists on strands.games, after
-- this pair it is exactly the columns listed and nothing else.
revoke select on strands.games from authenticated;
grant select
  (id, club_handle, mode, puzzle_id, puzzle_date, board, clue,
   min_word_length, hint_cost, band, created_at)
  on strands.games to authenticated;

-- Reading is club-gated; acting is player-gated in the RPCs.
drop policy if exists games_select on strands.games;
create policy games_select on strands.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- ============================================================
-- strands.players
-- ============================================================
-- What a rival may see mid-game is exactly ONE number: `hints_spent`. That is
-- the compete ranking metric, so it makes the race legible — "she's on nine
-- words, I'd better hurry" is tension; "she's used two hints" is the actual
-- contest. And it says nothing about the PUZZLE, which is the line that
-- matters here.
--
-- Everything else on the row is withheld from opponents mid-game:
--
--   hint_points        — the bar's fill is a proxy for how many valid words a
--                        rival has found, so publishing it would leak sideways
--                        exactly what the events RLS is hiding.
--   active_hint_coords — a rival's revealed word is part of the answer.
--
-- `solved` / `solved_at` ARE public. They're race status, not puzzle content —
-- knowing someone has finished tells you the bar you have to clear, which is
-- the same kind of fact as their hint count.
revoke select on strands.players from authenticated;
grant select (game_id, user_id, hints_spent, solved, solved_at)
  on strands.players to authenticated;

drop policy if exists players_select on strands.players;
create policy players_select on strands.players
  for select to authenticated
  using (
    exists (
      select 1 from strands.games sg
       where sg.id = strands.players.game_id
         and common.is_club_member(sg.club_handle)
    )
  );

-- ── The withheld columns, handed back where they're allowed ──
-- Definer, so it can read past the column grant; the security_invoker view
-- below calls it as the CALLER, so auth.uid() is the real one.
--
-- Visible when the row is YOURS, when the game is COOP (the pool is shared
-- there — that's the whole mode), or once the game is over.
create or replace function strands._player_state_visible(g_id uuid, row_user uuid)
returns boolean
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select sg.mode = 'coop' or row_user = auth.uid() or cg.is_terminal
    from strands.games sg
    join common.games cg on cg.id = sg.id
   where sg.id = g_id;
$$;
revoke execute on function strands._player_state_visible(uuid, uuid) from public;

create or replace function strands._hint_points_for(g_id uuid, row_user uuid)
returns int
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select case when strands._player_state_visible(g_id, row_user)
              then sp.hint_points else null end
    from strands.players sp
   where sp.game_id = g_id and sp.user_id = row_user;
$$;
revoke execute on function strands._hint_points_for(uuid, uuid) from public;
-- The security_invoker view calls these AS THE CALLER, so authenticated needs
-- EXECUTE — the definer body is what reads past the column grant, not the
-- caller's own rights. (Missed at first: revoking from public without granting
-- to authenticated makes the view itself unusable.)
grant execute on function strands._hint_points_for(uuid, uuid) to authenticated;

create or replace function strands._active_hint_for(g_id uuid, row_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select case when strands._player_state_visible(g_id, row_user)
              then sp.active_hint_coords else null end
    from strands.players sp
   where sp.game_id = g_id and sp.user_id = row_user;
$$;
revoke execute on function strands._active_hint_for(uuid, uuid) from public;
grant execute on function strands._active_hint_for(uuid, uuid) to authenticated;

drop view if exists strands.players_state;
create view strands.players_state with (security_invoker = true) as
  select sp.game_id,
         sp.user_id,
         sp.hints_spent,
         sp.solved,
         sp.solved_at,
         strands._hint_points_for(sp.game_id, sp.user_id) as hint_points,
         strands._active_hint_for(sp.game_id, sp.user_id) as active_hint_coords
    from strands.players sp;

grant select on strands.players_state to authenticated;

-- ============================================================
-- strands.events
-- ============================================================
-- Mode-aware, in three OR branches under one club-membership gate — the shape
-- wordwheel/spellingbee use:
--
--   coop            everyone in the club sees every event. A deliberate ruling:
--                   the turn log is the team's shared record of what has been
--                   tried, and hiding a peer's rejects would make it lie.
--   own rows        you always see your own (compete's board is yours).
--   is_terminal     the post-game reveal, so the log can be compared afterwards.
--
-- The compete arm is what keeps WORD COUNTS private: an opponent's finds are
-- their business until the race is over. It's also what makes the shared
-- turn-log picker's empty line honest — "Hidden until game ends" rather than
-- "Nothing yet".
--
-- HINT rows ride the same three branches, and want no fourth: a hint is shared
-- in coop (the pool is the team's), private in compete until terminal (where
-- hints_spent was already public via players_state anyway). The one thing this
-- does disclose that nothing else did is the location of a hinted word NOBODY
-- went on to find, visible at terminal before an opt-in solution reveal — a
-- deliberate, narrow acceptance, not an oversight. Everything else it exposes
-- (a found word's coords) the theme/spangram rows already opened at terminal.
grant select on strands.events to authenticated;

drop policy if exists events_select on strands.events;
create policy events_select on strands.events
  for select to authenticated
  using (
    exists (
      select 1
        from strands.games sg
        join common.games cg on cg.id = sg.id
       where sg.id = strands.events.game_id
         and common.is_club_member(sg.club_handle)
         and (
           sg.mode = 'coop'
           or strands.events.user_id = (select auth.uid())
           or cg.is_terminal
         )
    )
  );

-- ============================================================
-- The shield: solution exposure
-- ============================================================
-- Runs as definer so it can read the grant-hidden `solution` column; the
-- security_invoker view below calls it as the CALLER, so auth.uid() is real and
-- base-table RLS still decides which rows are visible.
--
-- Gated on `common.games.solution_revealed` — the one common answer to "may the
-- players see the answer?" — rather than on is_terminal directly. end_game sets
-- it on a win (you produced the solution to get there), and the shared
-- reveal_solution RPC sets it when players ask at a terminal loss. Reading the
-- flag instead of re-deriving the rule keeps strands consistent with the other
-- twelve games for free.
create or replace function strands._solution_for(g_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select case when cg.solution_revealed then sg.solution else null end
    from strands.games sg
    join common.games cg on cg.id = sg.id
   where sg.id = g_id;
$$;
revoke execute on function strands._solution_for(uuid) from public;
grant execute on function strands._solution_for(uuid) to authenticated;

-- ============================================================
-- Read view
-- ============================================================
-- The FE reads `games_state`, never `games` — one place decides what a client
-- may see. `solution` is NULL for the whole game and fills in at the reveal.
drop view if exists strands.games_state;
create view strands.games_state with (security_invoker = true) as
  select sg.id,
         sg.club_handle,
         sg.mode,
         sg.puzzle_id,
         sg.puzzle_date,
         sg.board,
         sg.clue,
         sg.min_word_length,
         sg.hint_cost,
         sg.band,
         sg.created_at,
         strands._solution_for(sg.id) as solution   -- NULL until revealed
    from strands.games sg;

grant select on strands.games_state to authenticated;

-- ============================================================
-- strands.club_game_status — which dates has this club played?
-- ============================================================
-- The connections shape (see connections.club_game_status for the full
-- rationale): "for this club and mode, which puzzle-dates already have a
-- game?" New game reads it to advance to the next UNPLAYED date rather than
-- re-dealing a board the club has seen. security_invoker, so both tables'
-- RLS gate visibility; nothing shielded is exposed (dates and states only).
drop view if exists strands.club_game_status;
create view strands.club_game_status with (security_invoker = true) as
select
  cg.id          as game_id,
  cg.club_handle as club_handle,
  cg.play_state  as play_state,
  cg.is_terminal as is_terminal,
  sg.mode        as mode,
  sg.puzzle_date as puzzle_date
from strands.games sg
join common.games cg on cg.id = sg.id
where cg.gametype in ('strands_coop', 'strands_compete');

grant select on strands.club_game_status to authenticated;

-- ============================================================
-- strands.create_game — start a new game in a club
-- ============================================================
-- Setup shape (server-validated):
--   { puzzleId: uuid,            -- which archived puzzle (the date picker)
--     band: 1..6,                -- dictionary ceiling for HINT words
--     hint_cost: 1..10,          -- valid words per hint (NYT plays 3)
--     min_word_length: 3..8,     -- shortest word that can earn a point
--     timer: <the common shape>,
--     coop_style: 'free' | 'turns',
--     first_turn_user_id: uuid } -- required iff coop_style = 'turns'
--
-- Everything needed to PLAY and to IDENTIFY the game is copied onto the row
-- (board, clue, solution, puzzle_date), leaving puzzle_id a soft,
-- provenance-only FK — the library-puzzle rule in docs/common.md. The archive
-- can be pruned or re-imported without touching a game in flight.
--
-- The three knobs are stored explicitly rather than read back out of
-- common.games.setup on every move: they're immutable after this call, and the
-- move RPC reads all three on every submission.
create or replace function strands.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  new_id             uuid;
  s_puzzle_id        uuid;
  puzzle_row         strands.puzzles%rowtype;
  v_band             int;
  v_hint_cost        int;
  v_min_word_length  int;
  game_title         text;
  effective_gametype text;
  first_turn         uuid;
begin
  perform common.require_valid_mode(mode);

  -- Compete needs an opposing PLAYER. The manifest hides its Start button in a
  -- one-player club; this is the server-side catch.
  if mode = 'compete' and coalesce(array_length(player_user_ids, 1), 0) < 2 then
    raise exception 'too-few-players|' using errcode = 'P0001',
      detail = 'compete needs >= 2 players';
  end if;

  -- Upper bound must agree with `numberOfPlayers` in the manifest.
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup ──────────────────────────────────────
  if (setup->>'puzzleId') is null then
    raise exception 'missing-puzzle-id|' using errcode = 'P0001',
      detail = 'setup.puzzleId absent';
  end if;
  begin
    s_puzzle_id := (setup->>'puzzleId')::uuid;
  exception when invalid_text_representation then
    raise exception 'bad-puzzle-id|' using errcode = 'P0001',
      detail = 'setup.puzzleId is not a uuid';
  end;

  -- Defaults match the manifest's, so an older client that omits a knob still
  -- starts a sane game; the range checks then reject anything a curious client
  -- makes up. Ranges duplicate the table CHECKs deliberately — a named error
  -- beats a raw 23514 from the insert.
  v_band            := coalesce((setup->>'band')::int, 5);
  v_hint_cost       := coalesce((setup->>'hint_cost')::int, 3);
  v_min_word_length := coalesce((setup->>'min_word_length')::int, 4);

  if v_band < 1 or v_band > 6 then
    raise exception 'bad-band|' using errcode = 'P0001',
      detail = 'setup.band must be 1..6';
  end if;
  if v_hint_cost < 1 or v_hint_cost > 10 then
    raise exception 'bad-hint-cost|' using errcode = 'P0001',
      detail = 'setup.hint_cost must be 1..10';
  end if;
  if v_min_word_length < 3 or v_min_word_length > 8 then
    raise exception 'bad-min-word-length|' using errcode = 'P0001',
      detail = 'setup.min_word_length must be 3..8';
  end if;

  perform common.require_valid_timer(setup->'timer');

  -- Load the puzzle. The FK would catch a bad id at INSERT, but "puzzle not
  -- found" is friendlier than a foreign-key violation.
  select * into puzzle_row from strands.puzzles
   where strands.puzzles.id = s_puzzle_id;
  if not found then
    raise exception 'no-puzzle|' using errcode = 'P0002',
      detail = 'no strands.puzzles row for that id; run the puzzle import';
  end if;

  -- Title = "<date>: <clue>", e.g. "2025-06-15: Here's to him!". The clue is
  -- the theme PROMPT, not the answer — it's on screen from the first second —
  -- so putting it in the club-list title spoils nothing and makes one game
  -- tell itself apart from another far better than a bare date would.
  game_title := format('%s: %s', puzzle_row.puzzle_date, puzzle_row.clue);

  effective_gametype := 'strands_' || mode;

  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title,
    setup,
    -- saved_default strips the per-GAME picks: which puzzle (a date you choose
    -- each time, not a standing preference) and who opens a turn game. The
    -- knobs and coop_style ride, since those are how this club likes to play.
    setup - 'puzzleId' - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn COOP. Compete never rotates — everyone races at once —
  -- and free-for-all leaves the pointer null, making common._require_turn a
  -- no-op in submit_path.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    begin
      first_turn := (setup->>'first_turn_user_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'bad-first-turn|' using errcode = 'P0001',
      detail = 'setup.first_turn_user_id is not a uuid';
    end;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'bad-first-turn|'
        using errcode = 'P0001',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into strands.games (
    id, club_handle, mode, puzzle_id, puzzle_date, board, clue, solution,
    min_word_length, hint_cost, band
  )
  values (
    new_id, target_club, mode, s_puzzle_id, puzzle_row.puzzle_date,
    puzzle_row.board, puzzle_row.clue, puzzle_row.solution,
    v_min_word_length, v_hint_cost, v_band
  );

  -- One row per player. In coop these move in lock-step (the pool is shared);
  -- in compete each is its own race.
  insert into strands.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  -- Seed the club-list readout in the SAME shape submit_path maintains, so a
  -- game nobody has moved in yet still lists as "Playing · 0 words".
  perform common.update_state(
    new_id,
    'playing',
    -- words_found ONLY. The TOTAL is part of the answer: knowing a board holds
    -- six words is real information about a puzzle whose whole content is
    -- shielded, and `status` is readable by the entire club. The server keeps
    -- computing the total internally for the terminal check; it just never
    -- publishes it.
    -- Compete publishes NOTHING mid-game: `status` is club-readable, so a
    -- word count there would hand every rival the progress the events RLS is
    -- keeping private. Coop shares everything, so its count is safe.
    case when mode = 'coop'
         then jsonb_build_object('mode', mode, 'words_found', 0)
         else jsonb_build_object('mode', mode)
    end
  );

  return query select new_id;
end;
$$;

revoke execute on function strands.create_game(text, jsonb, uuid[], text) from public;
grant execute on function strands.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- strands._path_key — a path's PLACEMENT, order-independent
-- ============================================================
-- The sorted set of cells a path covers, as "r,c" text. Two paths with the same
-- key occupy exactly the same tiles, whatever order they were traced in.
--
-- THIS EXISTS BECAUSE ORDERED COMPARISON WAS WRONG. A word with a repeated
-- letter can have two interchangeable tiles, and then more than one legal trace
-- spells the same word over the identical cells. Real case (2026-08-02,
-- "Eyes on the prize"): INTENTION runs through two N's at [5,1] and [6,1], each
-- adjacent to both of the other's neighbours —
--
--   I[5,0] N[6,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[5,1]
--   I[5,0] N[5,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[6,1]
--
-- — the same nine tiles, differing only in which N was touched first. Matching
-- the stored coord ARRAY rejected the first as "not a theme word" and scored it
-- as an ordinary dictionary find, which is simply wrong: the player had found
-- the word, in its place. What identifies a find is WHICH TILES it consumes,
-- and the word those tiles spell — never the order they were visited in.
create or replace function strands._path_key(coords jsonb)
returns text[]
language sql
immutable
as $$
  select array_agg((e->>0) || ',' || (e->>1) order by (e->>0)::int, (e->>1)::int)
    from jsonb_array_elements(coords) e;
$$;

-- ============================================================
-- strands._consumed_keys — cells locked by found theme words
-- ============================================================
-- "r,c" keys for every cell a found theme word occupies. Those tiles are
-- spent: they can't be traced again, which is coherent only because the hidden
-- words tile the board exactly (48 cells, each once — asserted at import).
--
-- WHOSE finds count depends on the mode, and this is the one place that
-- difference lives: coop shares one board, so anyone's find locks the tiles for
-- everyone; compete gives each player their own progress over the same letters,
-- so only your own finds lock yours.
create or replace function strands._consumed_keys(target_game uuid, for_user uuid)
returns text[]
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select coalesce(array_agg(distinct (e->>0) || ',' || (e->>1)), '{}')
    from strands.events g
    join strands.games sg on sg.id = g.game_id,
         lateral jsonb_array_elements(g.path) e
   where g.game_id = target_game
     and g.result in ('theme', 'spangram')
     and (sg.mode = 'coop' or g.user_id = for_user);
$$;
revoke execute on function strands._consumed_keys(uuid, uuid) from public;

-- ============================================================
-- strands._maybe_finish_compete — is anyone still racing?
-- ============================================================
-- A compete game ends when NO player is still racing — racing meaning not
-- solved and not conceded. Called from submit_path (a solve may have been the
-- last one), from concede (a drop-out may leave nobody), and by the timeout.
-- Returns true when it ended the game.
--
-- THE WINNER, and why it can't be decided any earlier: whoever SOLVED using
-- the fewest hints, earliest solve breaking a tie. A player still going might
-- yet finish on fewer hints than the current best, so "first to solve" would
-- crown the wrong person — which is exactly why solving goes LOCALLY terminal
-- instead of ending the game.
--
-- Nobody solved → a collective loss. `outcome` names which way it happened,
-- because "everyone gave up" and "the clock beat us" read very differently in
-- the club list.
create or replace function strands._maybe_finish_compete(
  target_game uuid,
  timed_out boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  best_hints     int;
  player_results jsonb;
  any_solved     boolean;
begin
  -- Still someone racing? Then it isn't over (unless the clock says so).
  if not timed_out and exists (
    select 1
      from strands.players sp
      join common.game_players gp
        on gp.game_id = sp.game_id and gp.user_id = sp.user_id
     where sp.game_id = target_game
       and not sp.solved
       and not gp.conceded
  ) then
    return false;
  end if;

  -- A drop-out forfeits: conceded players are excluded from the ranking even
  -- if a solved row exists for them (belt to submit_path's conceded guard —
  -- and the ruling for the odd case of a player who solved and THEN conceded).
  select min(sp.hints_spent) into best_hints
    from strands.players sp
    join common.game_players gp
      on gp.game_id = sp.game_id and gp.user_id = sp.user_id
   where sp.game_id = target_game and sp.solved and not gp.conceded;
  any_solved := best_hints is not null;

  if any_solved then
    -- Fewest hints, then earliest solve. Ties on BOTH are co-winners rather
    -- than an arbitrary pick — vanishingly unlikely with timestamptz, but a
    -- tie-break that silently invents an order is worse than one that admits
    -- the tie.
    with ranked as (
      select sp.user_id,
             sp.solved and not gp.conceded
               and sp.hints_spent = best_hints
               and sp.solved_at = (
                 select min(s2.solved_at)
                   from strands.players s2
                   join common.game_players g2
                     on g2.game_id = s2.game_id and g2.user_id = s2.user_id
                  where s2.game_id = target_game and s2.solved
                    and not g2.conceded
                    and s2.hints_spent = best_hints
               ) as won
        from strands.players sp
        join common.game_players gp
          on gp.game_id = sp.game_id and gp.user_id = sp.user_id
       where sp.game_id = target_game
    )
    select jsonb_object_agg(user_id::text, jsonb_build_object('won', won))
      into player_results from ranked;

    perform common.end_game(
      target_game, 'won_compete',
      jsonb_build_object('outcome', 'solved', 'best_hints', best_hints),
      player_results);
  else
    select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
      into player_results
      from common.game_players where game_id = target_game;

    perform common.end_game(
      target_game, 'lost_compete',
      jsonb_build_object(
        'outcome',
        case
          when timed_out then 'timeout'
          when not exists (select 1 from common.game_players gp
                            where gp.game_id = target_game and not gp.conceded)
            then 'conceded'
          else 'unsolved'
        end),
      player_results);
  end if;

  return true;
end;
$$;

revoke execute on function strands._maybe_finish_compete(uuid, boolean) from public;

-- ============================================================
-- strands.submit_path — trace a word (THE move RPC)
-- ============================================================
-- Takes the traced path ([[r,c], …]) and classifies it. Returns jsonb:
--   { result, word, hint_points, hint_cost, words_found, terminal,
--     hint_cleared }
--
-- Note what is NOT returned: the word TOTAL. It's part of the answer — knowing
-- a board holds six words is real information about a shielded puzzle — so the
-- server computes it for the terminal check and keeps it. The client learns the
-- game is over from `terminal` / common.games, not by counting to a number it
-- was told.
--
-- result ∈ theme | spangram | hint_word | duplicate | too_short | invalid
--
-- CLASSIFICATION ORDER is a rule, not an implementation detail. The theme
-- check runs FIRST and unconditionally, before any length gate: 4-letter theme
-- words are common (33 of 148 sampled), so a club that raises min_word_length
-- to 5 would otherwise have real answers rejected as "too short".
--
-- HARD vs SOFT rejects. A structurally impossible path (off-board,
-- non-adjacent, self-crossing) RAISES: the FE's reducer cannot produce one, so
-- it means a broken or hostile client, and logging it would pollute a turn log
-- that players read. A path through a SPENT tile also raises, but with one
-- honest route in: a coop submit in flight while a peer's find lands can cross
-- tiles the sender didn't yet see consumed. That window is realtime-lag sized,
-- the raise's message reads fine in the error pill, and nothing commits — so
-- it stays a raise rather than earning a logged soft-reject. A word that is
-- merely wrong — too short, unknown, already counted — is a legitimate move,
-- so it returns softly and IS logged.
--
-- The `for update` lock serializes concurrent coop submissions against the
-- shared hint bar and the found set.
create or replace function strands.submit_path(
  target_game uuid,
  path jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  caller_id      uuid;
  g_row          strands.games%rowtype;
  play           text;
  n              int;
  rs             int[];
  cs             int[];
  consumed       text[];
  norm_path      jsonb;
  v_word         text;
  i              int;
  v_result       text;
  is_spangram    boolean := false;
  matched        boolean := false;
  v_points       int;
  v_found        int;
  v_total        int;
  hint_cleared   int := 0;
  did_end        boolean := false;
  v_solved       boolean := false;
  player_results jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from strands.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no strands.games row for target_game';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- A conceded player is out of the race — no more traces. The FE freezes the
  -- board on myConceded, so this only fires on a race (a submit in flight when
  -- the concede commits, or a stale second tab). Without it a conceder could
  -- complete the win condition and be recorded the winner.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  -- Turn-order gate (no-op for free-for-all). Before classification, so an
  -- out-of-turn trace is refused outright rather than quietly scored.
  perform common._require_turn(target_game, caller_id);

  -- ─── Structural validation (hard rejects) ────────────────
  if path is null or jsonb_typeof(path) <> 'array' then
    raise exception 'bad-path|' using errcode = 'P0001',
      detail = 'path must be a json array';
  end if;
  n := jsonb_array_length(path);
  if n < 1 then
    raise exception 'bad-path|' using errcode = 'P0001',
      detail = 'path must have at least one cell';
  end if;

  -- Every element must be a two-number [row, col] BEFORE the casts below, so a
  -- malformed cell gets this designed error rather than a raw cast failure
  -- (jsonb has no integer type of its own, so integer-ness is "equals its own
  -- floor"; the ::numeric::int cast then accepts an integral 2.0 as 2, which
  -- is what the normalization comment further down promises).
  if exists (
    select 1 from jsonb_array_elements(path) e
     where jsonb_typeof(e) <> 'array'
        or jsonb_array_length(e) <> 2
        or jsonb_typeof(e->0) <> 'number'
        or jsonb_typeof(e->1) <> 'number'
        or (e->>0)::numeric <> floor((e->>0)::numeric)
        or (e->>1)::numeric <> floor((e->>1)::numeric)
  ) then
    raise exception 'bad-path-cell|' using errcode = 'P0001',
      detail = 'each path cell must be [row, col]';
  end if;

  select array_agg(((e->>0)::numeric)::int order by ord),
         array_agg(((e->>1)::numeric)::int order by ord)
    into rs, cs
    from jsonb_array_elements(path) with ordinality as t(e, ord);

  consumed := strands._consumed_keys(target_game, caller_id);

  for i in 1..n loop
    if rs[i] < 0 or rs[i] > 7 or cs[i] < 0 or cs[i] > 5 then
      raise exception 'path-off-board|%|', i - 1 using errcode = 'P0001',
      detail = 'a path cell is outside the 8x6 board';
    end if;
    if (rs[i] || ',' || cs[i]) = any (consumed) then
      raise exception 'path-crosses-found|' using errcode = 'P0001',
      detail = 'a path cell belongs to an already-found word';
    end if;
    if i > 1 then
      -- 8-way adjacency: diagonals count. Same rule as
      -- src/strands/lib/board.ts `adjacent` and the puzzle importer's.
      if abs(rs[i] - rs[i-1]) > 1 or abs(cs[i] - cs[i-1]) > 1
         or (rs[i] = rs[i-1] and cs[i] = cs[i-1]) then
        raise exception 'path-not-adjacent|%|%|', i - 2, i - 1
          using errcode = 'P0001',
      detail = 'consecutive path cells must be 8-way adjacent';
      end if;
      -- No revisiting: a trace may not cross itself.
      if exists (select 1 from generate_series(1, i - 1) k
                  where rs[k] = rs[i] and cs[k] = cs[i]) then
        raise exception 'path-revisits|' using errcode = 'P0001',
      detail = 'a path may not use a cell twice';
      end if;
    end if;
  end loop;

  -- The word this path spells, read off the frozen board.
  v_word := '';
  for i in 1..n loop
    v_word := v_word || substr(g_row.board[rs[i] + 1], cs[i] + 1, 1);
  end loop;

  -- Canonical form for comparison against the stored coords: rebuilt from the
  -- parsed ints so a client sending 2.0 or extra whitespace can't dodge a match.
  select jsonb_agg(jsonb_build_array(r, c) order by ord)
    into norm_path
    from unnest(rs, cs) with ordinality as t(r, c, ord);

  -- ─── 1. A theme word? Matched by PLACEMENT + WORD ────────
  -- Two conditions, and both are needed:
  --
  --   the CELLS  — a find is identified by which tiles it consumes, compared
  --                order-independently (see _path_key: a repeated letter can
  --                make two traces cover the same tiles);
  --   the WORD   — so that tracing those same tiles in an order spelling
  --                something else isn't a find.
  --
  -- String alone would misclassify: theme words often appear in an ordinary
  -- dictionary too (in one sampled puzzle, all 8 did). Cells alone would accept
  -- a scramble. Together they're exact.
  if strands._path_key(g_row.solution->'spangram'->'coords') = strands._path_key(norm_path)
     and g_row.solution->'spangram'->>'word' = v_word then
    matched := true;
    is_spangram := true;
    v_result := 'spangram';
  elsif exists (
    select 1 from jsonb_array_elements(g_row.solution->'themeWords') tw
     where strands._path_key(tw->'coords') = strands._path_key(norm_path)
       and tw->>'word' = v_word
  ) then
    matched := true;
    v_result := 'theme';
  end if;

  -- ─── 2..4. Not a theme word: length, dedup, dictionary ───
  if not matched then
    if n < g_row.min_word_length then
      v_result := 'too_short';
    elsif exists (
      -- Credited-once, scoped like the board: coop shares its credit, compete
      -- keeps each player's own — otherwise your rival finding ADAPT would
      -- silently deny you the point.
      select 1 from strands.events gu
       where gu.game_id = target_game
         and gu.word = v_word
         and gu.result = 'hint_word'
         and (g_row.mode = 'coop' or gu.user_id = caller_id)
    ) then
      v_result := 'duplicate';
    elsif exists (
      -- The MAY-ENTER tier (docs/common.md): difficulty alone gates a word the
      -- player CHOSE to type. No slur / crude / slang / dialect filter — we
      -- don't put those in front of you, and we don't stop you typing one.
      select 1 from common.words w
       where w.word = lower(v_word)
         and w.difficulty <= g_row.band
    ) then
      v_result := 'hint_word';
    else
      v_result := 'invalid';
    end if;
  end if;

  -- `kind` spelled out rather than left to its default: the table holds hints
  -- too, so which kind this row is belongs at the call site.
  insert into strands.events (game_id, user_id, kind, word, path, result)
  values (target_game, caller_id, 'guess', v_word, norm_path, v_result);

  -- ─── Counters ────────────────────────────────────────────
  if v_result = 'hint_word' then
    -- The bar CAPS at hint_cost: points earned while a hint sits unspent are
    -- lost. A deliberate rule, not an overflow bug — the full bar is the
    -- signal, which is why nothing warns about it.
    --
    -- COOP moves every row in lock-step (one shared pool); COMPETE moves only
    -- the earner's. Same statement, one predicate apart — which is why the
    -- economy lives on `players` in both modes rather than being forked.
    update strands.players sp
       set hint_points = least(sp.hint_points + 1, g_row.hint_cost)
     where sp.game_id = target_game
       and (g_row.mode = 'coop' or sp.user_id = caller_id);
  end if;
  select sp.hint_points into v_points
    from strands.players sp
   where sp.game_id = target_game and sp.user_id = caller_id;

  if matched then
    -- A spent hint retires the moment its word is found — for whoever was
    -- looking at it (everyone in coop, just you in compete).
    -- By PLACEMENT, for the same reason as the match above: the hint stores the
    -- canonical coords, and a player who traced the word the other way round
    -- would otherwise be left staring at a hint for a word they'd just found.
    update strands.players sp
       set active_hint_coords = null
     where sp.game_id = target_game
       and strands._path_key(sp.active_hint_coords) = strands._path_key(norm_path)
       and (g_row.mode = 'coop' or sp.user_id = caller_id);
    -- FOUND is PL/pgSQL's "did the last statement touch a row?" — spelled out
    -- rather than assigned straight through, because reading `hint_cleared :=
    -- found` gives no clue that `found` is a special variable.
    get diagnostics hint_cleared = row_count;
  end if;

  -- Progress is the CALLER's in compete, the team's in coop — the same scope
  -- the board itself uses.
  select count(*) into v_found
    from strands.events gu
   where gu.game_id = target_game
     and gu.result in ('theme', 'spangram')
     and (g_row.mode = 'coop' or gu.user_id = caller_id);
  v_total := jsonb_array_length(g_row.solution->'themeWords') + 1;

  -- ─── Solving ─────────────────────────────────────────────
  -- "Every theme word found" and "every cell used" are the same statement,
  -- because the hidden words tile the board exactly. Counting words is the
  -- cheaper half of that identity.
  v_solved := matched and v_found >= v_total;

  if v_solved and g_row.mode = 'coop' then
    -- Coop: solving IS the end. Everyone wins together.
    select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
      into player_results
      from common.game_players where game_id = target_game;

    perform common.end_game(
      target_game, 'won',
      jsonb_build_object('outcome', 'solved', 'words_found', v_found),
      player_results);
    did_end := true;

  elsif v_solved then
    -- Compete: solving ends YOUR race, not THE race. The winner is whoever
    -- solved on the fewest hints, and a player still going could yet beat you
    -- — so the board goes locally terminal and _maybe_finish_compete decides
    -- whether anyone is left.
    update strands.players
       set solved = true, solved_at = now()
     where game_id = target_game and user_id = caller_id;
    did_end := strands._maybe_finish_compete(target_game);

  else
    -- Compete publishes no progress mid-game (see create_game): `status` is
    -- club-readable, and a word count there would leak what the events RLS is
    -- protecting.
    if g_row.mode = 'coop' then
      perform common.update_state(
        target_game, 'playing', jsonb_build_object('words_found', v_found));
    end if;

    -- Turn-order advances only on an ACCEPTED move. A rejected trace (too
    -- short, unknown, already counted) is a misfire, not a turn — the same
    -- call the other turn games make for their soft rejects. No-op in compete,
    -- whose pointer is null.
    if v_result in ('theme', 'spangram', 'hint_word') then
      perform common._advance_turn(target_game);
    end if;
  end if;

  return jsonb_build_object(
    'result', v_result,
    'word', v_word,
    'isSpangram', is_spangram,
    'hint_points', v_points,
    'hint_cost', g_row.hint_cost,
    'words_found', v_found,
    'hint_cleared', hint_cleared > 0,
    'terminal', did_end
  );
end;
$$;

revoke execute on function strands.submit_path(uuid, jsonb) from public;
grant execute on function strands.submit_path(uuid, jsonb) to authenticated;

-- ============================================================
-- strands.spend_hint — cash the bar for a revealed word
-- ============================================================
-- Picks a RANDOM unfound theme word and publishes its COORDS (never its word:
-- a hint rings the tiles and leaves the player to work out the order).
--
-- Server-side by necessity, not preference: the coop hint pool is SHARED, so
-- every player must see the same revealed word. A client-side pick would show
-- three players three different hints for one spent token.
--
-- NOT turn-gated. Spending is a team decision about a team resource, not a
-- move, so it neither requires nor consumes a turn in a turn-order game.
create or replace function strands.spend_hint(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     strands.games%rowtype;
  p_row     strands.players%rowtype;
  play      text;
  coords    jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from strands.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no strands.games row for target_game';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- Same guard as submit_path: a conceded player has no race left to hint.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  select * into p_row from strands.players
   where game_id = target_game and user_id = caller_id;
  if p_row.solved then
    raise exception 'already-solved|' using errcode = 'P0001',
      detail = 'this player has already consumed the board';
  end if;

  if p_row.hint_points < g_row.hint_cost then
    raise exception 'not-enough-hint-points|' using errcode = 'P0001',
      detail = 'the hint bar is not full';
  end if;

  -- An unspent hint blocks a second one: the board can only ring one word at a
  -- time without becoming unreadable, and the bar is capped anyway.
  if p_row.active_hint_coords is not null then
    raise exception 'hint-already-showing|' using errcode = 'P0001',
      detail = 'one theme word is already ringed';
  end if;

  -- A word already found is not worth revealing. WHOSE finds count is the
  -- board's own rule — shared in coop, your own in compete.
  select tw->'coords' into coords
    from jsonb_array_elements(
           g_row.solution->'themeWords' || jsonb_build_array(g_row.solution->'spangram')
         ) tw
   where not exists (
     -- Again by PLACEMENT: comparing stored arrays would think a word found via
     -- the other equivalent trace was still unfound, and cheerfully hint at it.
     select 1 from strands.events gu
      where gu.game_id = target_game
        and gu.result in ('theme', 'spangram')
        and strands._path_key(gu.path) = strands._path_key(tw->'coords')
        and (g_row.mode = 'coop' or gu.user_id = caller_id)
   )
   order by random()
   limit 1;

  if coords is null then
    -- Defensive: a board with everything found should already be terminal.
    raise exception 'nothing-to-hint|' using errcode = 'P0001',
      detail = 'every theme word is already found';
  end if;

  -- Coop shares the pool, so the spend AND the reveal land on every row — one
  -- token bought one hint for the team. Compete charges only the spender.
  update strands.players sp
     set active_hint_coords = coords,
         hint_points = 0,
         hints_spent = sp.hints_spent + 1
   where sp.game_id = target_game
     and (g_row.mode = 'coop' or sp.user_id = caller_id);

  -- Log it. Deliberately ONE row attributed to the caller, NOT one per player
  -- the way the counters above fan out in coop: a shared pool still has a
  -- single person who decided to cash it, and the turn log records what
  -- happened, not who it happened to.
  --
  -- `path` carries the same canonical coords the players row just took, so the
  -- history viewer can re-ring the hint exactly as it looked when spent — the
  -- reason this is stored at all. `word` stays null: a hint has never said its
  -- word, and putting it here would say it in the one place that outlives the
  -- reveal being retired.
  insert into strands.events (game_id, user_id, kind, path)
  values (target_game, caller_id, 'hint', coords);

  return jsonb_build_object('coords', coords, 'hint_points', 0);
end;
$$;

revoke execute on function strands.spend_hint(uuid) from public;
grant execute on function strands.spend_hint(uuid) to authenticated;

-- ============================================================
-- strands.end_game — the manual, neutral stop
-- ============================================================
-- Any player may end it: a group decision, not an owner's. Neutral by design —
-- the friends agreed to stop, so nobody won and nobody lost
-- (status.outcome = 'manual', matching the shared endedCopy on the FE).
--
-- hides_solution = true for this gametype, so common.end_game deliberately
-- does NOT reveal the answer here; the players ask for it with the shared
-- RevealButton (common.reveal_solution) if they want it.
create or replace function strands.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  play           text;
  v_found        int;
  player_results jsonb;
begin
  perform common.require_game_player(target_game);

  perform 1 from strands.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no strands.games row for target_game';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    -- Idempotency: a second click, or one racing a win, raises and the FE
    -- swallows it the same way the other games do.
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  select count(*) into v_found
    from strands.events
   where game_id = target_game and result in ('theme', 'spangram');

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  -- `ended` in BOTH modes, and neutral in both: the friends agreed to stop, so
  -- nobody won. Compete does NOT crown the best solver here — a race called off
  -- early didn't finish, and handing the trophy to whoever was ahead would
  -- reward stopping at the right moment.
  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual', 'words_found', v_found),
    player_results);
end;
$$;

revoke execute on function strands.end_game(uuid) from public;
grant execute on function strands.end_game(uuid) to authenticated;

-- ============================================================
-- strands.concede — drop out of a compete race
-- ============================================================
-- Compete only: a coop team has nobody to keep racing, so it stops with
-- end_game instead.
--
-- NOT common.concede, which ends a game as a collective loss the moment the
-- last player drops. strands can't use that: a table where two players quit and
-- a third had already SOLVED must end with that solver winning, not with
-- everyone losing. So it's the documented split — common._set_conceded for the
-- guarded flag flip, then this gametype's own finisher to decide the outcome.
create or replace function strands.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  g_mode text;
begin
  -- FOR UPDATE: serialize against submit_path (and end_game), which lock this
  -- same row. Without it a last solve and a last concede run on disjoint locks
  -- (submit_path on strands.games, _set_conceded on common.games), each
  -- snapshots the other as "still racing", and BOTH finishers decline — the
  -- game sticks in `playing` with nobody left to end it. Lock order is
  -- strands.games → common.games on every path, so no deadlock.
  select mode into g_mode from strands.games where id = target_game for update;
  if g_mode is null then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no strands.games row for target_game';
  end if;
  if g_mode <> 'compete' then
    raise exception 'concede-not-in-coop|' using errcode = 'P0001',
      detail = 'coop ends the whole table instead';
  end if;

  perform common._set_conceded(target_game);
  perform strands._maybe_finish_compete(target_game);
end;
$$;

revoke execute on function strands.concede(uuid) from public;
grant execute on function strands.concede(uuid) to authenticated;

-- ============================================================
-- strands.replay_board — run this puzzle back
-- ============================================================
-- Same board, everything the players did wiped: the event log, the found
-- words (which live IN that log), the hint bar, the spend count, and any
-- showing hint. Callable mid-game or from a finished one — it's a restart, not
-- a terminal action.
--
-- The solution re-hides itself: _solution_for reads
-- common.games.solution_revealed, which common.reset_game clears.
create or replace function strands.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  g_row strands.games%rowtype;
begin
  perform common.require_game_player(target_game);

  -- FOR UPDATE: a replay racing a submission must not interleave with it, or
  -- the reset could land on a half-applied move — a stray log row in the
  -- "fresh" game, or an in-flight winning move re-terminalling the board that
  -- was just reset.
  select * into g_row from strands.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no strands.games row for target_game';
  end if;

  delete from strands.events where game_id = target_game;

  update strands.players
     set hint_points = 0,
         hints_spent = 0,
         active_hint_coords = null,
         solved = false,
         solved_at = null
   where game_id = target_game;

  -- Turn-order coop: rewind to the original opener. Matches no row in a
  -- free-for-all game, whose pointer is null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  -- The same status shape create_game seeds, mode for mode — a restart must be
  -- indistinguishable from a fresh game, including compete's silence.
  perform common.reset_game(
    target_game,
    case when g_row.mode = 'coop'
         then jsonb_build_object('mode', g_row.mode, 'words_found', 0)
         else jsonb_build_object('mode', g_row.mode)
    end
  );
end;
$$;

revoke execute on function strands.replay_board(uuid) from public;
grant execute on function strands.replay_board(uuid) to authenticated;

-- ============================================================
-- strands.submit_timeout — the countdown expiring
-- ============================================================
-- Fired by every connected client when its local countdown hits 0, so several
-- calls arrive at roughly the same instant. The row lock serializes them:
-- whichever commits first terminalizes, and the rest see a non-playing game and
-- raise P0001, which the FE swallows as "a peer beat us to it".
--
-- The clock is a LOSS here, per the roster's one test (docs/states.md): you
-- lose if the game had a REACHABLE END and you didn't reach it. strands has one
-- — find every theme word — so it sits with wordle and connections rather than
-- with an untargeted word hunt, where the clock is merely how a session stops.
create or replace function strands.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  g_row          strands.games%rowtype;
  play           text;
  v_found        int;
  player_results jsonb;
begin
  perform common.require_game_player(target_game);

  select * into g_row from strands.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no strands.games row for target_game';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  if g_row.mode = 'compete' then
    -- The clock stops the race wherever it stands, and the ranking is applied
    -- to whoever HAD solved. A player mid-board simply didn't finish — the
    -- winner is still "solved, on the fewest hints", never "got furthest".
    perform strands._maybe_finish_compete(target_game, true);
    return;
  end if;

  select count(*) into v_found
    from strands.events
   where game_id = target_game and result in ('theme', 'spangram');

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'lost',
    jsonb_build_object('outcome', 'timeout', 'words_found', v_found),
    player_results);
end;
$$;

revoke execute on function strands.submit_timeout(uuid) from public;
grant execute on function strands.submit_timeout(uuid) to authenticated;
