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
            or events.user_id = (select auth.uid())
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
-- NOTHING IS GATED, deliberately: `solution` is not held back to
-- terminal even though the FE only renders it there. Gating would guard
-- nothing — playable_words ships from game start (the hint search needs
-- it locally), and any two-word solution is a breadth-first search away
-- from that list. The seeded pair is stored because it is the GETTABLE
-- one, not because it is secret.

-- The one COMPUTED column: `clean_words` is the must-reach
-- SUBSET of playable_words, computed on read rather than stored.
--
-- Stored playable_words is the ACCEPT list (band only — see
-- candidate_words), and the hint search must not suggest out of it: a
-- hint puts a word on screen, which is the must-reach tier. So the FE
-- needs both, and the question is where the second list comes from.
--
-- Computing it here rather than storing a second column buys two things.
-- It needs no DDL, so the game's shape migration stays applied-and-
-- untouched (editing one in place never reaches prod — see CLAUDE.md).
-- And it tracks the DICTIONARY: re-flag a word as a slur in the editor
-- and hints stop offering it immediately, on boards built months ago,
-- with nothing to regenerate.
--
-- The cost is one indexed join per game load, over the 580-6,600 words a
-- board carries. That load happens ONCE per game by design (the board
-- header is immutable, so useGame fetches it a single time), which is
-- what makes a join affordable here and nowhere near the move loop.
drop view if exists letterboxed.games_state;
create view letterboxed.games_state with (security_invoker = true) as
select
  g.id,
  g.club_handle,
  g.mode,
  g.sides,
  g.playable_words,
  (select coalesce(jsonb_agg(w.word), '[]'::jsonb)
     from jsonb_array_elements_text(g.playable_words) as pw(word)
     join common.words w on w.word = pw.word
    where w.american and w.british
      and w.crude = 0 and w.slur = 0 and not w.slang) as clean_words,
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
-- board's playable_words by omission. (The builder's isPlayable would
-- reject them anyway — a letter shares a side with itself — so this is
-- deliberate belt-and-braces, not the load-bearing check.)
--
-- ─── Why the regex sits behind a MATERIALIZED fence ───
-- `(.)\1` is a BACKREFERENCE, which puts Postgres on its slower
-- backtracking regex engine, and it is the least selective qual here: it
-- removes 24% of the dictionary where the bitmask test removes 95%. Left
-- to its own estimates the planner ordered it THIRD, ahead of the mask
-- test, so it ran on essentially all 283k rows. Measured on one board at
-- band 5 (10,201 rows out, warm cache, repeated calls):
--
--   regex ordered first (what the planner chose)    71 ms
--   regex after the mask test (this shape)          25 ms
--   regex dropped entirely                          23 ms
--
-- The fence buys ~46 ms per build attempt — and ~370 ms on the 8-attempt
-- re-roll path, the one a player is already waiting through. It also
-- prices the belt-and-braces above honestly: behind the fence the regex
-- costs ~2 ms, so keeping it is nearly free; in front of it, it cost 3x
-- the rest of the query.
-- AS MATERIALIZED is a documented guarantee (PG12+, which is also when
-- CTEs stopped being fences by default): the CTE is evaluated once and
-- the outer qual cannot be pushed into it. The `offset 0` trick would
-- work today by riding an implementation detail — a subquery carrying
-- LIMIT/OFFSET isn't pulled up — but nothing documents that, and a
-- planner that folded away a zero offset would silently undo this with
-- no diff and no error. The ordering fact is permanent (most expensive
-- qual, least selective), so it's worth stating rather than hoping the
-- estimates land right.
--
-- ─── The two tiers (docs/common.md → the word list's filter rule) ───
-- The WHERE gates on band and on the board's shape ALONE. Purity rides
-- along as `is_clean` instead, exactly the way spellingbee returns
-- `is_required` — because the two tiers answer different questions:
--
--   may-enter  — a word the player CHOOSES to type. Band only: crude,
--                slur, slang and dialect all unrestricted. This is the
--                board's accept list.
--   must-reach — a word the GAME puts in front of a player: the seeded
--                solution, and anything the hint search can suggest.
--                Clean, so we never hand someone a slur they didn't ask
--                for.
--
-- This function used to apply the must-reach filter in its WHERE, which
-- collapsed the tiers into one list and made the clean set do duty as
-- the accept list too — so a band-1 word like BITCH (slur = 1) was
-- refused from a human's own keyboard. The asymmetry is the point.
-- The return type gained `is_clean`, and Postgres won't let a replace
-- change a function's return type — so this file drops first. It stays:
-- supabase/sql/ is re-applied IN FULL on every deploy, and a database
-- still carrying the one-column version has to be able to catch up.
drop function if exists letterboxed.candidate_words(bigint, int);
create or replace function letterboxed.candidate_words(
  board_mask bigint,
  max_band int
)
returns table(word text, is_clean boolean)
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  with fits as materialized (
    select w.word,
           (w.american and w.british
              and w.crude = 0 and w.slur = 0 and not w.slang) as is_clean
      from common.words w
     where w.difficulty <= max_band
       and w.len >= 3
       and (w.letter_mask & ~board_mask) = 0
  )
  select f.word, f.is_clean
    from fits f
   where f.word !~ '(.)\1';
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
-- letterboxed.seed_for — the seed for ONE named letter set
-- ============================================================
-- pick_seed's counterpart for a PLAYER-CHOSEN board (setup.custom_sides,
-- "play the board my friend sent me"). The board arrives as twelve
-- letters in side order; sorted, those twelve ARE letterboxed.seeds'
-- primary key, so recovering the pair that solves them is one index
-- lookup.
--
-- THE POINT OF THE LOOKUP is not to police the player — it is to get
-- `solution`, which letterboxed.games requires and which the terminal
-- reveal, the PDF and create_game's winnability check all read. A custom
-- board that found its pair is indistinguishable from a rolled one
-- everywhere downstream: par is still 2, the reveal still works.
--
-- A board this game BUILT is always here, by construction — the builder
-- got its twelve letters from a row of this very table, and partitioning
-- only reorders them. So the re-share case cannot miss. A miss means a
-- typo, or a board from somewhere else (an NYT puzzle, say) whose twelve
-- letters have no band <= 2 pair in our dictionary.
--
-- SECURITY DEFINER for the same reason pick_seed is: RLS is enabled on
-- letterboxed.seeds with no select policy, so the table's `grant select
-- to authenticated` alone yields zero rows. Reading the pool has to go
-- through a definer function.
--
-- The parameter is NOT called `letters`: that is the column's name, and
-- PL/pgSQL would have to guess which one `where letters = letters` meant.
-- (This one is `language sql`, but the naming rule is worth keeping
-- uniform — see the note on common.create_game's `saved_default`.)
create or replace function letterboxed.seed_for(board_letters text)
returns table(letters text, word_a text, word_b text, difficulty int)
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select s.letters::text, s.word_a, s.word_b, s.difficulty
    from letterboxed.seeds s
   where s.letters = board_letters;
$$;

revoke execute on function letterboxed.seed_for(text) from public;
grant execute on function letterboxed.seed_for(text) to authenticated;

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
-- letterboxed._end_game — REMOVED 2026-08-15
-- ============================================================
-- It wrapped common.end_game for one reason: the shared rule revealed the
-- solution on any winning play_state, and that premise ("you can only win by
-- producing the solution, so it's already in front of you") is false here — a
-- letterboxed win covers the twelve letters with ANY chain inside the cap,
-- while the seeded pair is a different, usually much shorter answer nobody
-- saw. The wrapper put the flag back the way it found it.
--
-- There is no flag now: revealing is a local, per-player display toggle in the
-- FE (docs/ui.md → Terminal results), and no game autoreveals. Every terminal
-- transition below calls common.end_game directly again.
--
-- The drop is explicit because supabase/sql is re-applied, not diffed: deleting
-- the definition alone would leave the old function sitting in every database
-- that ever ran it, prod included.
drop function if exists letterboxed._end_game(uuid, text, jsonb, jsonb);

-- ============================================================
-- letterboxed.create_game — mode is a positional arg
-- ============================================================
-- Setup shape (server validates):
--   { "extra_words": 0..5  (default 3) — how many words ABOVE PAR the
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
--
--       A PLAYER-CHOSEN BOARD DOES NOT CHANGE THIS. The builder proves
--       par 2 for a typed board the same way it guarantees it for a
--       rolled one — by finding the seeded pair for those twelve letters
--       and checking it stays playable under the typed partition — so
--       there is still no board here whose par is anything but 2.
--     "legal_band": 1..6   (default 5) — how obscure an accepted word
--       may be. NOTE THE DIRECTION: higher = EASIER.
--     "coop_style": 'free' | 'turns',
--     "first_turn_user_id": uuid (required when coop_style='turns'),
--     "custom_sides": the twelve letters of a typed board, in side order
--       (optional; absent = the edge function rolled one). Cross-checked
--       against board.sides below, then stripped from the club default.
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
      raise exception 'too-few-players|'
        using errcode = 'P0001',
      detail = 'compete needs >= 2 players';
    end if;
  end if;

  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup ──────────────────────────────────────
  s_extra_words := coalesce((setup->>'extra_words')::int, 3);
  if s_extra_words < 0 or s_extra_words > 5 then
    raise exception 'bad-extra-words|%|', s_extra_words
      using errcode = 'P0001',
      detail = 'setup.extra_words must be 0..5';
  end if;
  -- PAR = 2 on every board this pipeline builds (see the header). Resolved
  -- here rather than stored as a `par` column, which would be a constant
  -- column; `max_words` is what every rule downstream actually reads.
  s_max_words := 2 + s_extra_words;

  s_legal_band := coalesce((setup->>'legal_band')::int, 5);
  if s_legal_band < 1 or s_legal_band > 6 then
    raise exception 'bad-legal-band|%|', s_legal_band
      using errcode = 'P0001',
      detail = 'setup.legal_band must be 1..6';
  end if;

  perform common.require_valid_timer(setup->'timer');

  -- ─── Validate the board ──────────────────────────────────
  b_sides := board->>'sides';
  if b_sides is null or b_sides !~ '^[a-z]{12}$' then
    raise exception 'bad-sides|%|',
                    coalesce(b_sides, 'null')
      using errcode = 'P0001',
      detail = 'board.sides must be 12 lowercase ASCII letters';
  end if;
  -- Letter Boxed never repeats a letter: the board is a SET of twelve.
  if (select count(distinct c) from regexp_split_to_table(b_sides, '') c) <> 12 then
    raise exception 'repeated-side-letter|%|', b_sides
      using errcode = 'P0001',
      detail = 'board.sides must be twelve DISTINCT letters';
  end if;

  -- A PLAYER-CHOSEN board must be the board they get, character for
  -- character. The edge function is supposed to pass `setup.custom_sides`
  -- straight through as `board.sides` (it skips partitionSides entirely),
  -- and this is what makes that a checked promise rather than a comment:
  -- the whole feature is "play the exact board my friend sent me", so a
  -- builder bug that quietly re-partitioned it would hand back a puzzle
  -- that looks right and isn't. Same cross-check wordiply makes on its
  -- custom base.
  if setup->>'custom_sides' is not null
     and setup->>'custom_sides' <> b_sides then
    raise exception 'custom-board-mismatch|%|%|',
                    setup->>'custom_sides', b_sides
      using errcode = 'P0001',
      detail = 'board.sides must equal setup.custom_sides exactly';
  end if;

  if jsonb_typeof(board->'playable_words') <> 'array' then
    raise exception 'bad-playable-words|'
      using errcode = 'P0001',
      detail = 'board.playable_words must be a jsonb array';
  end if;
  b_words := board->'playable_words';
  -- The richness floor. A board with too few findable words is a
  -- miserable puzzle rather than a hard one; the builder re-rolls
  -- instead of shipping it, and this is the server-side catch. The
  -- measured 25th percentile is 210+ at every band, so this trims only
  -- the thin tail — the edge function's gate must agree.
  --
  -- IT DOES NOT APPLY TO A PLAYER-CHOSEN BOARD, and the edge function
  -- skips its own floor to match (the two are documented as having to
  -- agree, so they move together). This gate exists to stop a ROLLED
  -- board being thin — nobody asked for that board, so it has to be
  -- worth playing sight-unseen. You typed this one; how rich it is, is
  -- your business. Same relaxation spellingbee and wordiply make for
  -- their custom boards.
  if setup->>'custom_sides' is null and jsonb_array_length(b_words) < 150 then
    raise exception 'too-few-playable-words|%|',
                    jsonb_array_length(b_words)
      using errcode = 'P0001',
      detail = 'board.playable_words must hold >= 150; the edge function''s gate must agree';
  end if;

  -- ─── The winnability invariant ───────────────────────────
  -- Everything above says the board is well-formed. This says it can be
  -- SOLVED, which is the promise the seed pipeline exists to keep.
  b_solution := array(select jsonb_array_elements_text(board->'solution'));
  if cardinality(b_solution) <> 2 then
    raise exception 'bad-solution-length|'
      using errcode = 'P0001',
      detail = 'board.solution must hold exactly 2 words';
  end if;
  sol_a := b_solution[1];
  sol_b := b_solution[2];

  if not (b_words ? sol_a) or not (b_words ? sol_b) then
    raise exception 'solution-unplayable|'
      using errcode = 'P0001',
      detail = 'both solution words must appear in playable_words';
  end if;
  if right(sol_a, 1) <> left(sol_b, 1) then
    raise exception 'solution-unchained|%|%|%|%|',
                    sol_a, right(sol_a, 1), sol_b, left(sol_b, 1)
      using errcode = 'P0001',
      detail = 'board.solution must chain: word_a''s last letter is word_b''s first';
  end if;
  if letterboxed._covered(b_solution) <> 12 then
    raise exception 'solution-uncovered|%|',
                    letterboxed._covered(b_solution)
      using errcode = 'P0001',
      detail = 'board.solution must cover all twelve letters';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  -- The board itself, grouped by side: "ABC-DEF-GHI-JKL". Nothing here
  -- is secret, so unlike wordle the title needs no re-sync as the game
  -- progresses — the board never changes.
  --
  -- DASHES, not the middot this used to print, because the title is now
  -- one of the places a player READS A BOARD OFF to retype it (the info
  -- column's Board row and the PDF are the others, both via
  -- lib/customBoard.ts → formatSides). Three renderings of one string
  -- was drift; the setup dialog strips separators anyway, so either
  -- would paste, but only one of them is what the app itself writes.
  game_title := upper(substr(b_sides, 1, 3)) || '-' || upper(substr(b_sides, 4, 3))
             || '-' || upper(substr(b_sides, 7, 3)) || '-' || upper(substr(b_sides, 10, 3));

  effective_gametype := 'letterboxed_' || mode;

  -- ─── Coordinate with common.create_game ──────────────────
  -- Inserts common.games (is_current_view=true, play_state='playing'),
  -- validates player_user_ids are all in clubs_members, inserts
  -- common.game_players. Returns the canonical id we FK from.
  --
  -- saved_default strips the per-GAME picks: who goes first (not a club
  -- preference — coop_style itself rides along), and the typed board.
  --
  -- custom_sides especially: a board is an INSTANCE, not a preference.
  -- Left in the club's default_setup it would prefill the next dialog,
  -- and every later Start would silently rebuild this same board until
  -- somebody noticed the field was populated and cleared it. Same reason
  -- boggle strips custom_board and spellingbee strips custom_letters.
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup,
    setup - 'first_turn_user_id' - 'custom_sides'
  );

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_word
  -- and undo_word gate each move. Free-for-all / compete leave the
  -- pointer null (inert). Runs after common.create_game seeds
  -- game_players.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'bad-first-turn|'
        using errcode = 'P0001',
      detail = 'setup.first_turn_user_id must be one of the players';
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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'already-ended|' using errcode = 'P0001',
      detail = 'common.games.play_state is terminal';
  end if;

  -- A conceded player's chain is frozen. The FE already disables the board
  -- on myConceded, so this fires only on a race (a submit in flight when
  -- the concede commits, or a stale second tab) — but without it a
  -- conceder could keep appending and even cover the twelve, and the solve
  -- branch below would crown them. A drop-out forfeits (strands' ruling).
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  -- No-op when the game isn't turn-based (the pointer is null).
  perform common._require_turn(target_game, caller_id);

  v_word := lower(trim(submitted));
  if v_word !~ '^[a-z]{3,}$' then
    raise exception 'word-too-short|'
      using errcode = 'P0001',
      detail = 'a word must be at least three letters';
  end if;

  -- One membership test covers the dictionary, the board's letters AND
  -- the same-side rule: playable_words is exactly the set of words that
  -- satisfy all three, computed once when the board was built.
  if not (g_row.playable_words ? v_word) then
    raise exception 'unplayable-board|%|', upper(v_word)
      using errcode = 'P0001',
      detail = 'word is absent from playable_words (dictionary, letters or side rule)';
  end if;

  -- In coop every row holds the same chain, so the caller's own row is
  -- always the right one to read.
  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = target_game and p.user_id = caller_id
   for update;

  if cardinality(v_chain) >= g_row.max_words then
    raise exception 'chain-full|%|',
                    g_row.max_words
      using errcode = 'P0001',
      detail = 'the chain is already at max_words';
  end if;

  if v_word = any(v_chain) then
    raise exception 'already-in-chain|%|', upper(v_word)
      using errcode = 'P0001',
      detail = 'a repeat is a no-op loop';
  end if;

  if cardinality(v_chain) > 0 then
    v_tail := right(v_chain[cardinality(v_chain)], 1);
    if left(v_word, 1) <> v_tail then
      raise exception 'wrong-tail|%|', upper(v_tail)
        using errcode = 'P0001',
      detail = 'the next word must start with the chain tail''s last letter';
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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'already-ended|' using errcode = 'P0001',
      detail = 'common.games.play_state is terminal';
  end if;

  -- Same guard as submit_word: a conceded player's chain is frozen.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  perform common._require_turn(target_game, caller_id);

  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = target_game and p.user_id = caller_id
   for update;

  if coalesce(cardinality(v_chain), 0) = 0 then
    raise exception 'nothing-to-undo|' using errcode = 'P0001',
      detail = 'the chain is empty';
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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'already-ended|' using errcode = 'P0001',
      detail = 'common.games.play_state is terminal';
  end if;

  -- Same guard as submit_word: a conceded player's chain is frozen.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  if (select current_turn_user_id from common.games where id = target_game) is not null then
    raise exception 'clear-not-in-turns|'
      using errcode = 'P0001',
      detail = 'turn-by-turn coop offers undo, not clear';
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
-- letterboxed.log_help — record that help was taken
-- ============================================================
-- The suggestion itself is computed ON THE FE: it holds playable_words,
-- so a breadth-first search over (letters-used, tail-letter) finds a
-- word on a shortest path to covering all twelve in ~40 lines of
-- TypeScript. The server's only job is to remember that help was taken,
-- so the turn log agrees with what happened.
--
-- `kind` separates the two rungs: 'hint' gave the word's SHAPE, 'spoiler'
-- gave the word. The log is the only record of either, which is why they
-- are distinguishable there rather than merged into one counter.
--
-- Trusting the client here costs nothing: help is unpenalized, and
-- COOP-ONLY. In compete either rung would be a win button — "first past
-- the bar" makes the fastest clicker the winner — so the mode check
-- below is a real rule, not bookkeeping.
drop function if exists letterboxed.log_hint(uuid, text);
create or replace function letterboxed.log_help(target_game uuid, word_shown text, kind text)
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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
  end if;
  if g_row.mode <> 'coop' then
    raise exception 'help-not-in-compete|' using errcode = 'P0001',
      detail = 'hint/spoiler would be a win button in a race';
  end if;
  if kind not in ('hint', 'spoiler') then
    raise exception 'bad-help-kind|%|', kind using errcode = 'P0001',
      detail = 'log_help kind must be hint or spoiler';
  end if;
  if (select is_terminal from common.games where id = target_game) then
    raise exception 'already-ended|' using errcode = 'P0001',
      detail = 'common.games.play_state is terminal';
  end if;

  -- Per-PLAYER, even in coop where the chain is shared: this counts who
  -- asked for help, not what the team's position is. Nothing RENDERS it —
  -- the turn log is what players read — but it stays as the cheap
  -- per-player tally the log would otherwise have to be folded to get.
  update letterboxed.players
     set hints_used = hints_used + 1
   where game_id = target_game and user_id = caller_id;

  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = target_game and p.user_id = caller_id;

  insert into letterboxed.events (game_id, user_id, kind, word, letters_covered)
  values (target_game, caller_id, log_help.kind, lower(trim(word_shown)),
          letterboxed._covered(v_chain));
end;
$$;

revoke execute on function letterboxed.log_help(uuid, text, text) from public;
grant execute on function letterboxed.log_help(uuid, text, text) to authenticated;

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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
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
  -- resolution reveals nothing the leaderboard hadn't. Conceded players
  -- are out of the running — a drop-out forfeits, however much they had
  -- covered when they left (the wordiply ruling: listed, but can't win).
  -- best_* can't come back null: an all-conceded game is already terminal
  -- (common.concede ends it), so the early is_terminal return fired.
  select letterboxed._covered(p.chain), coalesce(cardinality(p.chain), 0)
    into best_covered, best_words
    from letterboxed.players p
    join common.game_players gp
      on gp.game_id = p.game_id and gp.user_id = p.user_id
   where p.game_id = target_game and not gp.conceded
   order by letterboxed._covered(p.chain) desc,
            coalesce(cardinality(p.chain), 0) asc
   limit 1;

  -- Co-winners when the top pair ties exactly — the wordiply comparator
  -- shape, which prefers a shared win to an arbitrary one.
  select jsonb_object_agg(
           p.user_id::text,
           jsonb_build_object(
             'won', not gp.conceded
                and letterboxed._covered(p.chain) = best_covered
                and coalesce(cardinality(p.chain), 0) = best_words))
    into player_results
    from letterboxed.players p
    join common.game_players gp
      on gp.game_id = p.game_id and gp.user_id = p.user_id
   where p.game_id = target_game;

  -- The blob's leaderboard carries the same rows _leaderboard would, PLUS
  -- the per-row verdict. That flag is what the FE reads for "did I win" —
  -- co-winners mean there is no single winner_id to trust, and among tied
  -- rows the display order is arbitrary, so leaderboard[0] is not it.
  perform common.end_game(
    target_game, 'won_compete',
    jsonb_build_object('mode', 'compete', 'solved', false, 'timed_out', true,
                       'best_letters_covered', best_covered,
                       'leaderboard',
                       (select coalesce(jsonb_agg(
                          jsonb_build_object(
                            'user_id', p.user_id,
                            'username', pr.username,
                            'words_used', coalesce(cardinality(p.chain), 0),
                            'letters_covered', letterboxed._covered(p.chain),
                            'won', not gp.conceded
                               and letterboxed._covered(p.chain) = best_covered
                               and coalesce(cardinality(p.chain), 0) = best_words)
                          order by letterboxed._covered(p.chain) desc,
                                   coalesce(cardinality(p.chain), 0) asc),
                          '[]'::jsonb)
                          from letterboxed.players p
                          join common.game_players gp
                            on gp.game_id = p.game_id and gp.user_id = p.user_id
                          join common.profiles pr on pr.user_id = p.user_id
                         where p.game_id = target_game)),
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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
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
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no letterboxed.games row for target_game';
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
