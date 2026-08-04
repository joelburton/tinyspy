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
grant insert, select on strands.puzzles to service_role;

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

  -- Coop ships first; the compete sibling isn't registered in
  -- common.gametypes yet, so reaching here with mode='compete' means a client
  -- built a request for a gametype that doesn't exist.
  if mode <> 'coop' then
    raise exception 'strands ships coop-first; compete is not available yet'
      using errcode = 'P0001';
  end if;

  -- Upper bound must agree with `numberOfPlayers: [1, 6]` in the manifest.
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup ──────────────────────────────────────
  if (setup->>'puzzleId') is null then
    raise exception 'setup.puzzleId is required' using errcode = 'P0001';
  end if;
  begin
    s_puzzle_id := (setup->>'puzzleId')::uuid;
  exception when invalid_text_representation then
    raise exception 'setup.puzzleId must be a uuid' using errcode = 'P0001';
  end;

  -- Defaults match the manifest's, so an older client that omits a knob still
  -- starts a sane game; the range checks then reject anything a curious client
  -- makes up. Ranges duplicate the table CHECKs deliberately — a named error
  -- beats a raw 23514 from the insert.
  v_band            := coalesce((setup->>'band')::int, 5);
  v_hint_cost       := coalesce((setup->>'hint_cost')::int, 3);
  v_min_word_length := coalesce((setup->>'min_word_length')::int, 4);

  if v_band < 1 or v_band > 6 then
    raise exception 'setup.band must be 1..6' using errcode = 'P0001';
  end if;
  if v_hint_cost < 1 or v_hint_cost > 10 then
    raise exception 'setup.hint_cost must be 1..10' using errcode = 'P0001';
  end if;
  if v_min_word_length < 3 or v_min_word_length > 8 then
    raise exception 'setup.min_word_length must be 3..8' using errcode = 'P0001';
  end if;

  perform common.require_valid_timer(setup->'timer');

  -- Load the puzzle. The FK would catch a bad id at INSERT, but "puzzle not
  -- found" is friendlier than a foreign-key violation.
  select * into puzzle_row from strands.puzzles
   where strands.puzzles.id = s_puzzle_id;
  if not found then
    raise exception 'puzzle not found' using errcode = 'P0002';
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

  -- Opt-in turn-by-turn coop. Free-for-all leaves the pointer null, which
  -- makes common._require_turn a no-op in submit_path.
  if setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'setup.first_turn_user_id must be one of the players'
        using errcode = 'P0001';
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

  -- Seed the club-list readout in the SAME shape submit_path maintains, so a
  -- game that nobody has moved in yet still lists as "Playing · 0/7 words"
  -- rather than a blank line.
  perform common.update_state(
    new_id,
    'playing',
    -- words_found ONLY. The TOTAL is part of the answer: knowing a board holds
    -- six words is real information about a puzzle whose whole content is
    -- shielded, and `status` is readable by the entire club. The server keeps
    -- computing the total internally for the terminal check; it just never
    -- publishes it.
    jsonb_build_object('mode', mode, 'words_found', 0)
  );

  return query select new_id;
end;
$$;

revoke execute on function strands.create_game(text, jsonb, uuid[], text) from public;
grant execute on function strands.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- strands._consumed_keys — cells locked by found theme words
-- ============================================================
-- "r,c" keys for every cell a found theme word occupies. Those tiles are
-- spent: they can't be traced again, which is coherent only because the hidden
-- words tile the board exactly (48 cells, each once — asserted at import).
create or replace function strands._consumed_keys(target_game uuid)
returns text[]
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select coalesce(array_agg(distinct (e->>0) || ',' || (e->>1)), '{}')
    from strands.guesses g,
         lateral jsonb_array_elements(g.path) e
   where g.game_id = target_game
     and g.result in ('theme', 'spangram');
$$;
revoke execute on function strands._consumed_keys(uuid) from public;

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
-- non-adjacent, self-crossing, through a spent tile) RAISES: the FE's reducer
-- cannot produce one, so it means a broken or hostile client, and logging it
-- would pollute a turn log that players read. A word that is merely wrong —
-- too short, unknown, already counted — is a legitimate move, so it returns
-- softly and IS logged.
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
  hint_cleared   boolean := false;
  did_end        boolean := false;
  player_results jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from strands.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Turn-order gate (no-op for free-for-all). Before classification, so an
  -- out-of-turn trace is refused outright rather than quietly scored.
  perform common._require_turn(target_game, caller_id);

  -- ─── Structural validation (hard rejects) ────────────────
  if path is null or jsonb_typeof(path) <> 'array' then
    raise exception 'path must be a json array' using errcode = 'P0001';
  end if;
  n := jsonb_array_length(path);
  if n < 1 then
    raise exception 'path must have at least one cell' using errcode = 'P0001';
  end if;

  select array_agg((e->>0)::int order by ord), array_agg((e->>1)::int order by ord)
    into rs, cs
    from jsonb_array_elements(path) with ordinality as t(e, ord);

  if array_length(rs, 1) is distinct from n or rs @> array[null]::int[] then
    raise exception 'each path cell must be [row, col]' using errcode = 'P0001';
  end if;

  consumed := strands._consumed_keys(target_game);

  for i in 1..n loop
    if rs[i] < 0 or rs[i] > 7 or cs[i] < 0 or cs[i] > 5 then
      raise exception 'path cell % is off the board', i - 1 using errcode = 'P0001';
    end if;
    if (rs[i] || ',' || cs[i]) = any (consumed) then
      raise exception 'path crosses an already-found word' using errcode = 'P0001';
    end if;
    if i > 1 then
      -- 8-way adjacency: diagonals count. Same rule as
      -- src/strands/lib/board.ts `adjacent` and the puzzle importer's.
      if abs(rs[i] - rs[i-1]) > 1 or abs(cs[i] - cs[i-1]) > 1
         or (rs[i] = rs[i-1] and cs[i] = cs[i-1]) then
        raise exception 'path cells % and % are not adjacent', i - 2, i - 1
          using errcode = 'P0001';
      end if;
      -- No revisiting: a trace may not cross itself.
      if exists (select 1 from generate_series(1, i - 1) k
                  where rs[k] = rs[i] and cs[k] = cs[i]) then
        raise exception 'path revisits a cell' using errcode = 'P0001';
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

  -- ─── 1. A theme word? Matched BY PATH, not by string ─────
  -- Theme words often appear in an ordinary dictionary too (in one sampled
  -- puzzle, all 8 did), so string matching would misclassify. The path is
  -- unambiguous — and it also means tracing the right letters through the
  -- wrong cells is not a find.
  if g_row.solution->'spangram'->'coords' = norm_path then
    matched := true;
    is_spangram := true;
    v_result := 'spangram';
  elsif exists (
    select 1 from jsonb_array_elements(g_row.solution->'themeWords') tw
     where tw->'coords' = norm_path
  ) then
    matched := true;
    v_result := 'theme';
  end if;

  -- ─── 2..4. Not a theme word: length, dedup, dictionary ───
  if not matched then
    if n < g_row.min_word_length then
      v_result := 'too_short';
    elsif exists (
      select 1 from strands.guesses gu
       where gu.game_id = target_game
         and gu.word = v_word
         and gu.result = 'hint_word'
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

  insert into strands.guesses (game_id, user_id, word, path, result)
  values (target_game, caller_id, v_word, norm_path, v_result);

  -- ─── Counters ────────────────────────────────────────────
  if v_result = 'hint_word' then
    -- The bar CAPS at hint_cost: points earned while a hint sits unspent are
    -- lost. A deliberate rule, not an overflow bug — the full bar is the
    -- signal, which is why nothing warns about it.
    update strands.games
       set hint_points = least(hint_points + 1, hint_cost)
     where id = target_game
     returning hint_points into v_points;
  else
    v_points := g_row.hint_points;
  end if;

  if matched then
    -- A spent hint retires the moment its word is found.
    if g_row.active_hint_coords is not null and g_row.active_hint_coords = norm_path then
      update strands.games set active_hint_coords = null where id = target_game;
      hint_cleared := true;
    end if;
  end if;

  select count(*) into v_found
    from strands.guesses
   where game_id = target_game and result in ('theme', 'spangram');
  v_total := jsonb_array_length(g_row.solution->'themeWords') + 1;

  -- ─── Terminal: the board is consumed ─────────────────────
  -- "Every theme word found" and "every cell used" are the same statement,
  -- because the hidden words tile the board exactly. Counting words is the
  -- cheaper half of that identity.
  if matched and v_found >= v_total then
    select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
      into player_results
      from common.game_players where game_id = target_game;

    perform common.end_game(
      target_game, 'won',
      jsonb_build_object('outcome', 'solved', 'words_found', v_found),
      player_results);
    did_end := true;
  else
    perform common.update_state(
      target_game, 'playing', jsonb_build_object('words_found', v_found));

    -- Turn-order advances only on an ACCEPTED move. A rejected trace (too
    -- short, unknown, already counted) is a misfire, not a turn — the same
    -- call the other turn games make for their soft rejects.
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
    'hint_cleared', hint_cleared,
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
  g_row  strands.games%rowtype;
  play   text;
  coords jsonb;
begin
  perform common.require_game_player(target_game);

  select * into g_row from strands.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.hint_points < g_row.hint_cost then
    raise exception 'not enough hint points' using errcode = 'P0001';
  end if;

  -- An unspent hint blocks a second one: the board can only ring one word at a
  -- time without becoming unreadable, and the bar is capped anyway.
  if g_row.active_hint_coords is not null then
    raise exception 'a hint is already showing' using errcode = 'P0001';
  end if;

  select tw->'coords' into coords
    from jsonb_array_elements(
           g_row.solution->'themeWords' || jsonb_build_array(g_row.solution->'spangram')
         ) tw
   where not exists (
     select 1 from strands.guesses gu
      where gu.game_id = target_game
        and gu.result in ('theme', 'spangram')
        and gu.path = tw->'coords'
   )
   order by random()
   limit 1;

  if coords is null then
    -- Defensive: every word found should have ended the game already.
    raise exception 'nothing left to hint' using errcode = 'P0001';
  end if;

  update strands.games
     set active_hint_coords = coords,
         hint_points = 0,
         hints_spent = hints_spent + 1
   where id = target_game;

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
  v_total        int;
  player_results jsonb;
begin
  perform common.require_game_player(target_game);

  perform 1 from strands.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    -- Idempotency: a second click, or one racing a win, raises and the FE
    -- swallows it the same way the other games do.
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select count(*) into v_found
    from strands.guesses
   where game_id = target_game and result in ('theme', 'spangram');
  select jsonb_array_length(solution->'themeWords') + 1 into v_total
    from strands.games where id = target_game;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual', 'words_found', v_found),
    player_results);
end;
$$;

revoke execute on function strands.end_game(uuid) from public;
grant execute on function strands.end_game(uuid) to authenticated;

-- ============================================================
-- strands.replay_board — run this puzzle back
-- ============================================================
-- Same board, everything the players did wiped: the guess log, the found
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
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  delete from strands.guesses where game_id = target_game;

  update strands.games
     set hint_points = 0,
         hints_spent = 0,
         active_hint_coords = null
   where id = target_game;

  -- Turn-order coop: rewind to the original opener. Matches no row in a
  -- free-for-all game, whose pointer is null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  -- The same status shape create_game seeds — a restart must be
  -- indistinguishable from a fresh game.
  perform common.reset_game(
    target_game,
    jsonb_build_object('mode', g_row.mode, 'words_found', 0)
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
  play           text;
  v_found        int;
  v_total        int;
  player_results jsonb;
begin
  perform common.require_game_player(target_game);

  perform 1 from strands.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into play from common.games where id = target_game;
  if play <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select count(*) into v_found
    from strands.guesses
   where game_id = target_game and result in ('theme', 'spangram');
  select jsonb_array_length(solution->'themeWords') + 1 into v_total
    from strands.games where id = target_game;

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
