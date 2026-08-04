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
grant select (id, source_id, puzzle_date) on strands.puzzles to authenticated;

drop policy if exists puzzles_select on strands.puzzles;
create policy puzzles_select on strands.puzzles
  for select to authenticated
  using (true);

-- The import CLI writes puzzles as the service_role (bypasses RLS; it is the
-- only writer — there is no INSERT grant to authenticated). It needs schema
-- USAGE plus full column access, including `solution`, to seed the library.
grant usage on schema strands to service_role;
grant insert, select on strands.puzzles to service_role;

-- ============================================================
-- strands.games
-- ============================================================
-- Everything EXCEPT `solution`. games_state re-exposes it conditionally via the
-- definer helper below. `active_hint_coords` IS granted: a spent hint is meant
-- to be seen, and it carries coordinates only — never the word — so the player
-- still has to work out the order.
grant select
  (id, club_handle, mode, puzzle_id, puzzle_date, board, clue,
   hint_points, hints_spent, active_hint_coords,
   min_word_length, hint_cost, band, created_at)
  on strands.games to authenticated;

-- Reading is club-gated; acting is player-gated in the RPCs.
drop policy if exists games_select on strands.games;
create policy games_select on strands.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- ============================================================
-- strands.guesses
-- ============================================================
-- Coop shows EVERY guess to EVERY player — that was a deliberate ruling, not an
-- oversight: the turn log is a shared record of what the team has tried, and
-- hiding a peer's rejected guesses would make the log lie about the session.
-- So there is no per-player split here. The compete sibling will add a
-- mode-aware policy with an `or cg.is_terminal` arm, the way the other compete
-- games do — which is also what keeps the shared turn-log picker's empty line
-- honest ("Hidden until game ends" vs "Nothing yet").
grant select on strands.guesses to authenticated;

drop policy if exists guesses_select on strands.guesses;
create policy guesses_select on strands.guesses
  for select to authenticated
  using (
    exists (
      select 1
        from strands.games sg
       where sg.id = strands.guesses.game_id
         and common.is_club_member(sg.club_handle)
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
         sg.hint_points,
         sg.hints_spent,
         sg.active_hint_coords,
         sg.min_word_length,
         sg.hint_cost,
         sg.band,
         sg.created_at,
         strands._solution_for(sg.id) as solution   -- NULL until revealed
    from strands.games sg;

grant select on strands.games_state to authenticated;
