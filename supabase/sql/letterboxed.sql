-- ============================================================
-- letterboxed — behavior (SnakeBox)
-- ============================================================
-- Functions, views, policies and grants. Re-applied IN FULL on every
-- deploy, so edits here are always in-place — this file never becomes a
-- migration. The tables live in
-- supabase/migrations/20260805000000_letterboxed.sql; read its header
-- first for the rules and the shape decisions.
--
-- THE ONE THING TO KNOW BEFORE READING: game state is a single CHAIN of
-- words per player (in coop every player's row holds the same chain,
-- kept in lock-step). Every rule below is a question about that array —
-- what may be appended, what the last element's last letter is, how
-- many distinct letters the whole thing covers.
--
-- See docs/letterboxed-plan.md (working) → docs/games/letterboxed.md.

-- ============================================================
-- Schema + table grants
-- ============================================================

grant usage on schema letterboxed to authenticated;

-- The seed import (supabase/scripts/import-letterboxed-seeds.ts)
-- connects as the superuser (bypasses grants), so service_role only
-- needs schema USAGE for any incidental PostgREST access.
grant usage on schema letterboxed to service_role;

-- letterboxed.seeds: public reference data, no policy needed beyond the
-- grant. The board builder samples seeds as the caller.
grant select on letterboxed.seeds to authenticated;

-- Everything on the game row is readable, including playable_words (the
-- FE needs it to run the hint search locally) and solution. Explicit
-- column list per docs/code-conventions.md → "Avoid SELECT *".
grant select
  (id, club_handle, mode, sides, playable_words, solution,
   max_words, legal_band, created_at)
  on letterboxed.games to authenticated;

-- COLUMN-LEVEL GRANT, and `chain` is deliberately absent. In compete a
-- rival may see how MANY words you have played, never which — so the
-- array is unreadable on the base table and reaches the FE only through
-- players_state, which masks it per mode (see _chain_for below).
grant select
  (game_id, user_id, hints_used, solved, solved_at)
  on letterboxed.players to authenticated;

grant select on letterboxed.events to authenticated;

-- ============================================================
-- RLS policies
-- ============================================================

-- Membership-gated read on games. Coop + compete behave identically:
-- anyone in the club sees the board. There is nothing to hide — the
-- board's whole playable word list ships to the FE by design.
drop policy if exists games_select on letterboxed.games;
create policy games_select on letterboxed.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- players rows are visible to the whole club in both modes; it is the
-- CHAIN COLUMN that compete hides, and the column grant above does
-- that. Keeping the rows visible is what lets a compete player see a
-- rival's word count and hint count — the two numbers the race is
-- allowed to publish.
drop policy if exists players_select on letterboxed.players;
create policy players_select on letterboxed.players
  for select to authenticated
  using (
    exists (
      select 1 from letterboxed.games lg
       where lg.id = players.game_id
         and common.is_club_member(lg.club_handle)
    )
  );

-- events is the turn log, and in compete it IS the private data (every
-- row names a word). Three OR branches inside the EXISTS, in evaluation
-- order — the same shape wordwheel.found_words_select uses:
--
--   (1) mode='coop'          — one shared chain; everyone sees the log.
--   (2) user_id = auth.uid() — you always see your own moves.
--   (3) is_terminal          — the race is over; open it to everyone so
--                              the terminal can show how it was solved.
drop policy if exists events_select on letterboxed.events;
create policy events_select on letterboxed.events
  for select to authenticated
  using (
    exists (
      select 1 from letterboxed.games lg
       join common.games cg on cg.id = lg.id
       where lg.id = events.game_id
         and common.is_club_member(lg.club_handle)
         and (
               lg.mode = 'coop'
            or events.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the
-- security-definer RPCs below.

-- ============================================================
-- letterboxed._covered — how many of the twelve letters a chain touches
-- ============================================================
-- The win condition, and the compete timeout's ranking metric, both
-- reduce to this number. Every chain word is playable by construction,
-- so all of its letters are on the board — which makes "letters
-- covered" simply the count of distinct characters in the concatenated
-- chain, with no need to consult the board at all.
--
-- An empty chain concatenates to '', which regexp_split_to_table
-- returns as one empty row; the WHERE drops it so the answer is 0
-- rather than 1.
create or replace function letterboxed._covered(chain text[])
returns int
language sql
immutable
as $$
  select coalesce(count(distinct c), 0)::int
    from regexp_split_to_table(array_to_string(chain, ''), '') c
   where c <> '';
$$;

revoke execute on function letterboxed._covered(text[]) from public;
grant execute on function letterboxed._covered(text[]) to authenticated;

-- ============================================================
-- letterboxed._chain_for — the per-mode chain reveal
-- ============================================================
-- Runs as definer so it can read the grant-hidden `chain` column; the
-- security_invoker view calls it as the caller (so auth.uid() is real)
-- and base-table RLS gates which rows are reachable at all.
--
-- Visible when: the game is coop (one shared chain, no secret), or the
-- row is yours, or the game is terminal (the reveal). Otherwise NULL —
-- which is precisely a compete rival's mid-race view.
create or replace function letterboxed._chain_for(g_id uuid, u_id uuid)
returns text[]
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select case
           when lg.mode = 'coop' or lp.user_id = auth.uid() or cg.is_terminal
           then lp.chain
           else null
         end
    from letterboxed.players lp
    join letterboxed.games lg on lg.id = lp.game_id
    join common.games cg on cg.id = lg.id
   where lp.game_id = g_id and lp.user_id = u_id
     and common.is_club_member(lg.club_handle);
$$;

revoke execute on function letterboxed._chain_for(uuid, uuid) from public;
grant execute on function letterboxed._chain_for(uuid, uuid) to authenticated;

-- ============================================================
-- letterboxed._word_count_for / _covered_for — the public numbers
-- ============================================================
-- These exist because of how security_invoker views work: such a view
-- can only read columns the CALLER may read, and `chain` is blocked by
-- the column grant. So players_state cannot compute cardinality(chain)
-- itself — the arithmetic has to happen inside a definer function.
--
-- They return SCALARS, never the array, and that distinction is the
-- whole design: a rival is entitled to know how many words you have
-- played and how much of the board you have covered (it is what the
-- compete leaderboard shows) but not which words got you there. A
-- definer helper that returned the chain itself would be a hole
-- straight through _chain_for's mask, since anyone could call it
-- directly rather than through the view.
--
-- Both re-check club membership rather than leaning on the view's RLS:
-- a definer function bypasses RLS on its own tables, so a direct call
-- would otherwise answer for any game in any club.
create or replace function letterboxed._word_count_for(g_id uuid, u_id uuid)
returns int
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select coalesce(cardinality(lp.chain), 0)
    from letterboxed.players lp
    join letterboxed.games lg on lg.id = lp.game_id
   where lp.game_id = g_id and lp.user_id = u_id
     and common.is_club_member(lg.club_handle);
$$;

revoke execute on function letterboxed._word_count_for(uuid, uuid) from public;
grant execute on function letterboxed._word_count_for(uuid, uuid) to authenticated;

create or replace function letterboxed._covered_for(g_id uuid, u_id uuid)
returns int
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select letterboxed._covered(lp.chain)
    from letterboxed.players lp
    join letterboxed.games lg on lg.id = lp.game_id
   where lp.game_id = g_id and lp.user_id = u_id
     and common.is_club_member(lg.club_handle);
$$;

revoke execute on function letterboxed._covered_for(uuid, uuid) from public;
grant execute on function letterboxed._covered_for(uuid, uuid) to authenticated;

-- ============================================================
-- games_state view
-- ============================================================
-- The FE's read path for a letterboxed game header. `security_invoker =
-- true` so RLS on the base table evaluates as the caller.
--
-- A PURE PASS-THROUGH, deliberately: `solution` is not gated to
-- terminal even though the FE only renders it there. Gating would guard
-- nothing — playable_words ships from game start (the hint search needs
-- it locally), and any two-word solution is a breadth-first search away
-- from that list. The seeded pair is stored because it is the GETTABLE
-- one, not because it is secret. Every game's FE reads
-- `<schema>.games_state`, so the uniform seam is worth keeping even
-- when the view adds only `security_invoker`.

drop view if exists letterboxed.games_state;
create view letterboxed.games_state with (security_invoker = true) as
select
  g.id,
  g.club_handle,
  g.mode,
  g.sides,
  g.playable_words,
  g.solution,
  g.max_words,
  g.legal_band,
  g.created_at
  from letterboxed.games g;

grant select on letterboxed.games_state to authenticated;

-- ============================================================
-- players_state view
-- ============================================================
-- Per-player readouts. `word_count` and `letters_covered` are computed
-- from the chain rather than exposing it, so they are safe to publish
-- in compete: they say how you are DOING without saying anything about
-- which words you found. `chain` itself comes through _chain_for and is
-- NULL for a rival mid-race.

drop view if exists letterboxed.players_state;
create view letterboxed.players_state with (security_invoker = true) as
select
  p.game_id,
  p.user_id,
  p.hints_used,
  p.solved,
  p.solved_at,
  letterboxed._chain_for(p.game_id, p.user_id)      as chain,
  letterboxed._word_count_for(p.game_id, p.user_id) as word_count,
  letterboxed._covered_for(p.game_id, p.user_id)    as letters_covered
  from letterboxed.players p;

grant select on letterboxed.players_state to authenticated;

-- ============================================================
-- letterboxed.candidate_words — the board's word pool, pre-adjacency
-- ============================================================
-- What the board builder calls to get every word whose LETTERS fit the
-- twelve. The side-adjacency rule ("no two consecutive letters from one
-- side") is NOT applied here: it depends on the partition, which the
-- builder is still choosing, and expressing a per-character walk in SQL
-- would be far uglier than the two-line loop the builder already runs
-- in TypeScript. So SQL does the sargable half and TS does the rest.
--
-- `board_mask & ~...` is the same bitwise subset test spellingbee runs
-- against the generated common.words.letter_mask column: a word fits
-- when it introduces no letter the board lacks.
--
-- Words with a DOUBLED LETTER are excluded here too. They can never be
-- playable on any board (a repeated letter is trivially same-side), and
-- dropping them in SQL keeps the builder from shipping them into a
-- board's playable_words by omission.
create or replace function letterboxed.candidate_words(
  board_mask bigint,
  max_band int
)
returns table(word text)
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select w.word
    from common.words w
   where w.difficulty <= max_band
     and w.american and w.british
     and w.crude = 0 and w.slur = 0 and not w.slang
     and w.len >= 3
     and (w.letter_mask & ~board_mask) = 0
     and w.word !~ '(.)\1';
$$;

revoke execute on function letterboxed.candidate_words(bigint, int) from public;
grant execute on function letterboxed.candidate_words(bigint, int) to authenticated;

-- ============================================================
-- letterboxed.pick_seed — one random board seed
-- ============================================================
-- `order by random() limit 1` over ~458k rows is a full scan, and that
-- is fine: it runs ONCE per game, takes tens of milliseconds, and the
-- alternatives (sampling by a random key, tablesample) all skew the
-- distribution in exchange for a saving nobody will feel.
--
-- WHY max_band EXISTS even though the importer already caps seeds at
-- band 2: the seeded pair has to be LEGAL in the game being built, or
-- the guaranteed two-word solution isn't in playable_words and
-- create_game's winnability check rejects the board. So the builder
-- passes least(legal_band, 2) — a game played at legal_band 1 draws
-- only from band-1 seeds (222k of them, still ample).
--
-- No previous-board overlap cap, unlike wordwheel's builder: with
-- 458k seeds over C(26,12) possible letter sets, a club would have to
-- play for years to notice a repeat.
create or replace function letterboxed.pick_seed(max_band int)
returns table(letters text, word_a text, word_b text, difficulty int)
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select s.letters::text, s.word_a, s.word_b, s.difficulty
    from letterboxed.seeds s
   where s.difficulty <= max_band
   order by random()
   limit 1;
$$;

revoke execute on function letterboxed.pick_seed(int) from public;
grant execute on function letterboxed.pick_seed(int) to authenticated;

-- ============================================================
-- letterboxed._leaderboard — compete's public standings
-- ============================================================
-- The two numbers a race may reveal, per player, ordered best-first.
-- Extracted because BOTH the mid-game _sync_status and every compete
-- TERMINAL need it: common.games.status MERGES, so a terminal that
-- didn't restate the leaderboard would leave the second-to-last move's
-- version sitting under the final one.
--
-- Usernames are cached into the blob rather than joined at read time
-- (docs/code-conventions.md) — a renamed handle going stale on a
-- finished game is not worth a second query.
create or replace function letterboxed._leaderboard(g_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', pr.username,
        'words_used', coalesce(cardinality(p.chain), 0),
        'letters_covered', letterboxed._covered(p.chain)
      )
      order by letterboxed._covered(p.chain) desc,
               coalesce(cardinality(p.chain), 0) asc
    ),
    '[]'::jsonb)
    from letterboxed.players p
    join common.profiles pr on pr.user_id = p.user_id
   where p.game_id = g_id;
$$;

revoke execute on function letterboxed._leaderboard(uuid) from public;

-- ============================================================
-- letterboxed._sync_status — mirror the readouts into common.games
-- ============================================================
-- DERIVED rather than assigned, the wordle._sync_title pattern: every
-- mid-game transition (a word, an undo, a clear, a hint) calls this
-- instead of remembering its own formula, so the club-page label is
-- correct after any of them.
--
-- Coop publishes the shared progress. Compete publishes a leaderboard
-- of the two numbers a race may reveal — words used and letters covered
-- — and deliberately not the words themselves. Usernames are cached
-- into the blob rather than joined at read time (see
-- docs/code-conventions.md; a renamed handle going stale on an
-- in-progress game is not worth a second query).
--
-- Terminal transitions do NOT call this: common.update_state forces
-- is_terminal false. They build their own blob and call common.end_game.
create or replace function letterboxed._sync_status(g_id uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  g_row letterboxed.games;
  any_chain text[];
begin
  select * into g_row from letterboxed.games where id = g_id;

  if g_row.mode = 'coop' then
    -- Every coop row carries the same chain, so any one of them answers.
    select p.chain into any_chain
      from letterboxed.players p where p.game_id = g_id limit 1;

    perform common.update_state(
      g_id,
      'playing',
      jsonb_build_object(
        'mode', 'coop',
        'max_words', g_row.max_words,
        'words_used', coalesce(cardinality(any_chain), 0),
        'letters_covered', letterboxed._covered(coalesce(any_chain, '{}'))
      )
    );
  else
    perform common.update_state(
      g_id,
      'playing',
      jsonb_build_object(
        'mode', 'compete',
        'max_words', g_row.max_words,
        'leaderboard', letterboxed._leaderboard(g_id)
      )
    );
  end if;
end;
$$;

revoke execute on function letterboxed._sync_status(uuid) from public;

-- ============================================================
-- letterboxed.create_game — mode is a positional arg
-- ============================================================
-- Setup shape (server validates):
--   { "extra_words": 0..4  (default 3) — how many words ABOVE PAR the
--       chain may run to. Stored resolved as `max_words = PAR +
--       extra_words`, the shape waffle uses for `max_swaps = par +
--       extra_swaps`.
--
--       PAR IS THE CONSTANT 2, not a computed column, because every board
--       this pipeline can build is solvable in exactly two words (the
--       builder partitions the twelve letters so the seeded pair stays
--       playable — see the migration). It is expressed as par + slack
--       anyway because that is the number players can actually reason
--       about: "solve it in 5" says nothing on its own, while "par is 2,
--       you get 3 spare" says exactly how much room you have.
--     "legal_band": 1..6   (default 5) — how obscure an accepted word
--       may be. NOTE THE DIRECTION: higher = EASIER.
--     "coop_style": 'free' | 'turns',
--     "first_turn_user_id": uuid (required when coop_style='turns'),
--     "timer": … }
--
-- `board` comes from the letterboxed-build-board edge function:
--   { "sides": 12 letters in side order,
--     "playable_words": [ … ],
--     "solution": [word_a, word_b] }
--
-- The board validation below is unusually thorough, and on purpose: it
-- is the ONLY place that checks the game is winnable at all. If the
-- seeded pair doesn't chain, doesn't cover the twelve, or isn't in the
-- playable list, the players get a board with no guaranteed solution
-- and no way to know it.
create or replace function letterboxed.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  new_id uuid;
  s_max_words int;
  s_extra_words int;
  s_legal_band int;
  first_turn uuid;
  b_sides text;
  b_words jsonb;
  b_solution text[];
  sol_a text;
  sol_b text;
  game_title text;
  effective_gametype text;
begin
  perform common.require_club_member(target_club);

  -- ─── Validate mode + player count ────────────────────────
  perform common.require_valid_mode(mode);

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this is the server-side
    -- catch. Matches psychicnum + connections.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup ──────────────────────────────────────
  s_extra_words := coalesce((setup->>'extra_words')::int, 3);
  if s_extra_words < 0 or s_extra_words > 4 then
    raise exception 'setup.extra_words must be 0..4 (got %)', s_extra_words
      using errcode = 'P0001';
  end if;
  -- PAR = 2 on every board this pipeline builds (see the header). Resolved
  -- here rather than stored as a `par` column, which would be a constant
  -- column; `max_words` is what every rule downstream actually reads.
  s_max_words := 2 + s_extra_words;

  s_legal_band := coalesce((setup->>'legal_band')::int, 5);
  if s_legal_band < 1 or s_legal_band > 6 then
    raise exception 'setup.legal_band must be 1..6 (got %)', s_legal_band
      using errcode = 'P0001';
  end if;

  perform common.require_valid_timer(setup->'timer');

  -- ─── Validate the board ──────────────────────────────────
  b_sides := board->>'sides';
  if b_sides is null or b_sides !~ '^[a-z]{12}$' then
    raise exception 'board.sides must be 12 lowercase ASCII letters (got %)',
                    coalesce(b_sides, 'null')
      using errcode = 'P0001';
  end if;
  -- Letter Boxed never repeats a letter: the board is a SET of twelve.
  if (select count(distinct c) from regexp_split_to_table(b_sides, '') c) <> 12 then
    raise exception 'board.sides must be twelve DISTINCT letters (got %)', b_sides
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(board->'playable_words') <> 'array' then
    raise exception 'board.playable_words must be an array'
      using errcode = 'P0001';
  end if;
  b_words := board->'playable_words';
  -- The richness floor. A board with too few findable words is a
  -- miserable puzzle rather than a hard one; the builder re-rolls
  -- instead of shipping it, and this is the server-side catch. The
  -- measured 25th percentile is 210+ at every band, so this trims only
  -- the thin tail — the edge function's gate must agree.
  if jsonb_array_length(b_words) < 150 then
    raise exception 'board.playable_words must hold >= 150 words (got %); the edge function''s gate must agree',
                    jsonb_array_length(b_words)
      using errcode = 'P0001';
  end if;

  -- ─── The winnability invariant ───────────────────────────
  -- Everything above says the board is well-formed. This says it can be
  -- SOLVED, which is the promise the seed pipeline exists to keep.
  b_solution := array(select jsonb_array_elements_text(board->'solution'));
  if cardinality(b_solution) <> 2 then
    raise exception 'board.solution must hold exactly 2 words'
      using errcode = 'P0001';
  end if;
  sol_a := b_solution[1];
  sol_b := b_solution[2];

  if not (b_words ? sol_a) or not (b_words ? sol_b) then
    raise exception 'board.solution words must both appear in playable_words'
      using errcode = 'P0001';
  end if;
  if right(sol_a, 1) <> left(sol_b, 1) then
    raise exception 'board.solution must chain: %% ends in "%", %% starts with "%"',
                    right(sol_a, 1), left(sol_b, 1)
      using errcode = 'P0001';
  end if;
  if letterboxed._covered(b_solution) <> 12 then
    raise exception 'board.solution must cover all twelve letters (covers %)',
                    letterboxed._covered(b_solution)
      using errcode = 'P0001';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  -- The board itself, grouped by side: "ABC·DEF·GHI·JKL". Nothing here
  -- is secret, so unlike wordle the title needs no re-sync as the game
  -- progresses — the board never changes.
  game_title := upper(substr(b_sides, 1, 3)) || '·' || upper(substr(b_sides, 4, 3))
             || '·' || upper(substr(b_sides, 7, 3)) || '·' || upper(substr(b_sides, 10, 3));

  effective_gametype := 'letterboxed_' || mode;

  -- ─── Coordinate with common.create_game ──────────────────
  -- Inserts common.games (is_current_view=true, play_state='playing'),
  -- validates player_user_ids are all in clubs_members, inserts
  -- common.game_players. Returns the canonical id we FK from.
  --
  -- saved_default strips first_turn_user_id — "who goes first" is a
  -- per-game pick, not a club preference (coop_style rides along).
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup,
    setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_word
  -- and undo_word gate each move. Free-for-all / compete leave the
  -- pointer null (inert). Runs after common.create_game seeds
  -- game_players.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'setup.first_turn_user_id must be one of the players'
        using errcode = 'P0001';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into letterboxed.games (
    id, club_handle, mode, sides, playable_words, solution, max_words, legal_band
  )
  values (
    new_id, target_club, mode, b_sides, b_words, b_solution, s_max_words, s_legal_band
  );

  insert into letterboxed.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) uid;

  perform letterboxed._sync_status(new_id);

  return query select new_id;
end;
$$;

revoke execute on function letterboxed.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function letterboxed.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- letterboxed.submit_word — append a word to the chain
-- ============================================================
-- The whole rulebook, in order. Everything before the append is a
-- rejection reason the FE renders in the feedback pill; the wording of
-- each raise is what the player reads.
--
-- WHY THE ROW LOCK. In free-for-all coop two players can submit off the
-- same tail at the same instant. Only one may win, and the loser must
-- be told the chain moved rather than have their word appended to a
-- tail it doesn't follow. Locking the game row serializes appends per
-- game, so the tail read below is always current.
create or replace function letterboxed.submit_word(target_game uuid, submitted text)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row letterboxed.games;
  v_chain text[];
  v_word text;
  v_tail text;
  v_covered int;
  winner_results jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from letterboxed.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'game already ended' using errcode = 'P0001';
  end if;

  -- No-op when the game isn't turn-based (the pointer is null).
  perform common._require_turn(target_game, caller_id);

  v_word := lower(trim(submitted));
  if v_word !~ '^[a-z]{3,}$' then
    raise exception 'a word must be at least three letters'
      using errcode = 'P0001';
  end if;

  -- One membership test covers the dictionary, the board's letters AND
  -- the same-side rule: playable_words is exactly the set of words that
  -- satisfy all three, computed once when the board was built.
  if not (g_row.playable_words ? v_word) then
    raise exception '% cannot be played on this board', upper(v_word)
      using errcode = 'P0001';
  end if;

  -- In coop every row holds the same chain, so the caller's own row is
  -- always the right one to read.
  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = target_game and p.user_id = caller_id
   for update;

  if cardinality(v_chain) >= g_row.max_words then
    raise exception 'the chain is full at % words — undo to try another route',
                    g_row.max_words
      using errcode = 'P0001';
  end if;

  if v_word = any(v_chain) then
    raise exception '% is already in the chain', upper(v_word)
      using errcode = 'P0001';
  end if;

  if cardinality(v_chain) > 0 then
    v_tail := right(v_chain[cardinality(v_chain)], 1);
    if left(v_word, 1) <> v_tail then
      raise exception 'the next word must start with %', upper(v_tail)
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Append ──────────────────────────────────────────────
  -- The mode difference is this WHERE clause and nothing else: coop
  -- moves every row in lock-step, compete moves only the actor's.
  if g_row.mode = 'coop' then
    update letterboxed.players
       set chain = chain || v_word
     where game_id = target_game;
  else
    update letterboxed.players
       set chain = chain || v_word
     where game_id = target_game and user_id = caller_id;
  end if;

  v_chain := v_chain || v_word;
  v_covered := letterboxed._covered(v_chain);

  insert into letterboxed.events (game_id, user_id, kind, word, letters_covered)
  values (target_game, caller_id, 'played', v_word, v_covered);

  -- ─── Did that finish it? ─────────────────────────────────
  if v_covered = 12 then
    update letterboxed.players
       set solved = true, solved_at = now()
     where game_id = target_game
       and (g_row.mode = 'coop' or user_id = caller_id);

    if g_row.mode = 'coop' then
      -- One chain, one outcome: everybody wins together.
      select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
        into winner_results
        from common.game_players where game_id = target_game;
      perform common.end_game(
        target_game, 'won',
        -- status MERGES (see common.end_game), so every value the terminal
        -- asserts must be spelled out here — a missing letters_covered
        -- would leave the previous move's count showing under the win.
        jsonb_build_object('mode', 'coop', 'solved', true,
                           'words_used', cardinality(v_chain),
                           'letters_covered', 12,
                           'max_words', g_row.max_words),
        winner_results
      );
    else
      -- Compete ends on the FIRST solve — the bar is "cover the twelve
      -- within the cap", and being first past it is the whole race.
      -- (This is why the cap replaced "fewest words": a metric you can
      -- keep grinding at has no finish line.)
      select jsonb_object_agg(
               gp.user_id::text,
               jsonb_build_object('won', gp.user_id = caller_id))
        into winner_results
        from common.game_players gp where gp.game_id = target_game;
      perform common.end_game(
        target_game, 'won_compete',
        jsonb_build_object('mode', 'compete', 'solved', true,
                           'winner_id', caller_id,
                           -- Cached, not joined: the club listing renders this
                           -- blob on its own. A handle renamed later going
                           -- stale on a finished game beats a second query.
                           'winner_username', (select pr.username from common.profiles pr
                                                where pr.user_id = caller_id),
                           'words_used', cardinality(v_chain),
                           'letters_covered', 12,
                           'max_words', g_row.max_words,
                           'leaderboard', letterboxed._leaderboard(target_game)),
        winner_results
      );
    end if;

    return jsonb_build_object('accepted', true, 'letters_covered', 12, 'solved', true);
  end if;

  -- Still going: hand the turn on (no-op in a free-for-all game).
  perform common._advance_turn(target_game);
  perform letterboxed._sync_status(target_game);

  return jsonb_build_object(
    'accepted', true, 'letters_covered', v_covered, 'solved', false);
end;
$$;

revoke execute on function letterboxed.submit_word(uuid, text) from public;
grant execute on function letterboxed.submit_word(uuid, text) to authenticated;

-- ============================================================
-- letterboxed.undo_word — take the last word back
-- ============================================================
-- A first-class move, not an error path: a chain can DEAD-END (the tail
-- letter may have no playable continuation), so backing out has to be
-- available or a game becomes unwinnable by accident.
--
-- It REFUNDS against max_words. That is what makes the cap a shape
-- constraint on the solution — "your chain may be at most N words" —
-- rather than a budget you can exhaust. You cannot lose here; you can
-- only be beaten, or run out the clock.
--
-- IN TURN-BY-TURN COOP THE UNDO COSTS YOUR TURN (the _advance_turn at
-- the end fires for undo exactly as it does for a played word). A free
-- undo would make the chain meaningless. It also gives the mode its
-- best dynamic: undoing doesn't help YOU — you retreat and the NEXT
-- player inherits the better position, so it reads as a sacrifice.
create or replace function letterboxed.undo_word(target_game uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row letterboxed.games;
  v_chain text[];
  v_popped text;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from letterboxed.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'game already ended' using errcode = 'P0001';
  end if;

  perform common._require_turn(target_game, caller_id);

  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = target_game and p.user_id = caller_id
   for update;

  if coalesce(cardinality(v_chain), 0) = 0 then
    raise exception 'there is nothing to undo' using errcode = 'P0001';
  end if;

  v_popped := v_chain[cardinality(v_chain)];
  v_chain := v_chain[1:cardinality(v_chain) - 1];

  if g_row.mode = 'coop' then
    update letterboxed.players set chain = v_chain where game_id = target_game;
  else
    update letterboxed.players set chain = v_chain
     where game_id = target_game and user_id = caller_id;
  end if;

  insert into letterboxed.events (game_id, user_id, kind, word, letters_covered)
  values (target_game, caller_id, 'undone', v_popped, letterboxed._covered(v_chain));

  perform common._advance_turn(target_game);
  perform letterboxed._sync_status(target_game);
end;
$$;

revoke execute on function letterboxed.undo_word(uuid) from public;
grant execute on function letterboxed.undo_word(uuid) to authenticated;

-- ============================================================
-- letterboxed.clear_chain — abandon the attempt, keep the board
-- ============================================================
-- The bigger hammer (crosswords' "Clear board"), and NOT OFFERED IN
-- TURN-BY-TURN COOP. If both actions cost one turn, clearing four words
-- would be strictly cheaper per word than undoing one, which inverts
-- the pricing undo_word establishes. Repeated undo already reaches the
-- empty chain there, one turn at a time — which is the right speed, if
-- a group genuinely needs to start over they should feel it.
create or replace function letterboxed.clear_chain(target_game uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row letterboxed.games;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from letterboxed.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'game already ended' using errcode = 'P0001';
  end if;

  if (select current_turn_user_id from common.games where id = target_game) is not null then
    raise exception 'clear is not available in turn-by-turn co-op — undo instead'
      using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    update letterboxed.players set chain = '{}' where game_id = target_game;
  else
    update letterboxed.players set chain = '{}'
     where game_id = target_game and user_id = caller_id;
  end if;

  insert into letterboxed.events (game_id, user_id, kind, word, letters_covered)
  values (target_game, caller_id, 'cleared', null, 0);

  perform letterboxed._sync_status(target_game);
end;
$$;

revoke execute on function letterboxed.clear_chain(uuid) from public;
grant execute on function letterboxed.clear_chain(uuid) to authenticated;

-- ============================================================
-- letterboxed.log_hint — record that a hint was taken
-- ============================================================
-- The hint itself is computed ON THE FE: it holds playable_words, so a
-- breadth-first search over (letters-used, tail-letter) finds a word on
-- a shortest path to covering all twelve in ~40 lines of TypeScript.
-- The server's only job is to remember that help was taken, so the
-- counter and the turn log agree with what happened.
--
-- Trusting the client here costs nothing: hints are unpenalized, and
-- COOP-ONLY. In compete an optimal suggestion would be a win button —
-- "first past the bar" makes the fastest clicker the winner — so the
-- mode check below is a real rule, not bookkeeping.
create or replace function letterboxed.log_hint(target_game uuid, suggested text)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row letterboxed.games;
  v_chain text[];
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from letterboxed.games where id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if g_row.mode <> 'coop' then
    raise exception 'hints are not available in compete' using errcode = 'P0001';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'game already ended' using errcode = 'P0001';
  end if;

  -- Per-PLAYER, even in coop where the chain is shared: this counts who
  -- asked for help, not what the team's position is.
  update letterboxed.players
     set hints_used = hints_used + 1
   where game_id = target_game and user_id = caller_id;

  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = target_game and p.user_id = caller_id;

  insert into letterboxed.events (game_id, user_id, kind, word, letters_covered)
  values (target_game, caller_id, 'hint', lower(trim(suggested)),
          letterboxed._covered(v_chain));
end;
$$;

revoke execute on function letterboxed.log_hint(uuid, text) from public;
grant execute on function letterboxed.log_hint(uuid, text) to authenticated;

-- ============================================================
-- letterboxed.submit_timeout — the clock ran out
-- ============================================================
-- The two modes part company here, deliberately.
--
-- COOP is a loss. There is one chain and it didn't reach twelve; there
-- is nothing to rank.
--
-- COMPETE resolves on MOST LETTERS COVERED, then fewest words, then
-- co-winners. A partial chain is genuinely rankable — "I got ten of the
-- twelve" is a real result — so a timed race always produces an
-- answer rather than crowning nobody. That puts letterboxed with
-- boggle / scrabble / wordiply, which also resolve from standing.
create or replace function letterboxed.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  g_row letterboxed.games;
  best_covered int;
  best_words int;
  player_results jsonb;
begin
  perform common.require_game_player(target_game);

  select * into g_row from letterboxed.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    return;   -- already over; a late timer tick is a no-op
  end if;

  if g_row.mode = 'coop' then
    select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
      into player_results
      from common.game_players where game_id = target_game;
    perform common.end_game(
      target_game, 'lost',
      jsonb_build_object(
        'mode', 'coop', 'solved', false, 'timed_out', true,
        'letters_covered', (select letterboxed._covered(p.chain)
                              from letterboxed.players p
                             where p.game_id = target_game limit 1)),
      player_results
    );
    return;
  end if;

  -- Compete: rank on coverage, breaking ties on a shorter chain. Both
  -- numbers were already public during the race (players_state), so the
  -- resolution reveals nothing the leaderboard hadn't.
  select letterboxed._covered(p.chain), coalesce(cardinality(p.chain), 0)
    into best_covered, best_words
    from letterboxed.players p
   where p.game_id = target_game
   order by letterboxed._covered(p.chain) desc,
            coalesce(cardinality(p.chain), 0) asc
   limit 1;

  -- Co-winners when the top pair ties exactly — the wordiply comparator
  -- shape, which prefers a shared win to an arbitrary one.
  select jsonb_object_agg(
           p.user_id::text,
           jsonb_build_object(
             'won', letterboxed._covered(p.chain) = best_covered
                and coalesce(cardinality(p.chain), 0) = best_words))
    into player_results
    from letterboxed.players p
   where p.game_id = target_game;

  perform common.end_game(
    target_game, 'won_compete',
    jsonb_build_object('mode', 'compete', 'solved', false, 'timed_out', true,
                       'best_letters_covered', best_covered,
                       'leaderboard', letterboxed._leaderboard(target_game)),
    player_results
  );
end;
$$;

revoke execute on function letterboxed.submit_timeout(uuid) from public;
grant execute on function letterboxed.submit_timeout(uuid) to authenticated;

-- ============================================================
-- letterboxed.end_game — "we've played as much as we want"
-- ============================================================
-- The player-callable stop, uniform across the roster (see
-- docs/common.md → the stop-the-game RPC). It writes `ended` in BOTH
-- modes — the roster's neutral terminal — and that is the difference
-- from submit_timeout: the clock running out on a race is a RESULT
-- (compete resolves on coverage), but a group agreeing to stop is a
-- group agreeing not to have one. Calling that `lost` would tell them
-- their own decision beat them.
create or replace function letterboxed.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  g_row letterboxed.games;
  player_results jsonb;
begin
  perform common.require_game_player(target_game);

  select * into g_row from letterboxed.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    return;
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game,
    'ended',
    jsonb_build_object('mode', g_row.mode, 'solved', false, 'stopped', true)
      || case when g_row.mode = 'coop'
              then jsonb_build_object(
                     'letters_covered', (select letterboxed._covered(p.chain)
                                           from letterboxed.players p
                                          where p.game_id = target_game limit 1))
              else jsonb_build_object('leaderboard', letterboxed._leaderboard(target_game))
         end,
    player_results
  );
end;
$$;

revoke execute on function letterboxed.end_game(uuid) from public;
grant execute on function letterboxed.end_game(uuid) to authenticated;

-- ============================================================
-- letterboxed.concede — drop out of a compete race
-- ============================================================
-- A one-line wrapper over the generic helper, which is the right one
-- here because letterboxed is NOT an elimination game: undo refunds, so
-- the only way a non-conceded player stops racing is by winning (which
-- already ends the game). common.concede marks the caller out and ends
-- the game as a collective loss iff no non-conceded player remains, and
-- names that terminal `lost_compete` from the gametype's suffix.
create or replace function letterboxed.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
begin
  perform common.concede(target_game);
end;
$$;

revoke execute on function letterboxed.concede(uuid) from public;
grant execute on function letterboxed.concede(uuid) to authenticated;

-- ============================================================
-- letterboxed.replay_board — same twelve letters, empty chain
-- ============================================================
-- The cheapest replay on the roster: the board is immutable data, so
-- there is nothing to rebuild — clear the chains, drop the log, rewind
-- the turn pointer. Nothing is re-revealed either (nothing was hidden),
-- so unlike wordle there is no title to re-sync.
create or replace function letterboxed.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  g_row letterboxed.games;
begin
  perform common.require_game_player(target_game);

  -- FOR UPDATE: a replay racing a move must not interleave with it (the
  -- move RPCs lock the same row), or the reset could land on a
  -- half-applied move — a stray log row in the "fresh" game, or an
  -- in-flight game-ENDING move re-terminalling the board just reset.
  select * into g_row from letterboxed.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  update letterboxed.players
     set chain = '{}', hints_used = 0, solved = false, solved_at = null
   where game_id = target_game;

  delete from letterboxed.events where game_id = target_game;

  -- Turn-order coop: rewind to the original opener. Matches no row (so
  -- it's a no-op) in a free-for-all game, whose pointer is null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  -- reset_game ASSIGNS status (it does not merge, unlike update_state /
  -- end_game), so this blob must state everything a fresh game's does —
  -- see docs/supabase.md. Reusing _sync_status would be wrong here: it
  -- writes play_state 'playing' via update_state without clearing
  -- is_terminal / ended_at, which is reset_game's job.
  perform common.reset_game(
    target_game,
    case g_row.mode
      when 'coop' then jsonb_build_object(
        'mode', 'coop', 'max_words', g_row.max_words,
        'words_used', 0, 'letters_covered', 0)
      else jsonb_build_object(
        'mode', 'compete', 'max_words', g_row.max_words,
        'leaderboard', '[]'::jsonb)
    end
  );
end;
$$;

revoke execute on function letterboxed.replay_board(uuid) from public;
grant execute on function letterboxed.replay_board(uuid) to authenticated;
