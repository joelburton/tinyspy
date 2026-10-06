-- cs-fixed-outcome-fix

-- ============================================================
-- letterboxed
-- ============================================================
-- What the frontend calls:
--
--   create_game          starts a game on a board the letterboxed-build-board
--                        edge function built
--   submit_word          appends a word to the chain
--   undo_word            takes the last word back
--   clear_chain          empties the chain, keeping the board
--   log_hint_or_spoiler  records that a coop hint or spoiler was shown
--   concede              a racer drops out of a compete game
--   stop_game            stops the game for everyone, with no result
--   submit_timeout       ends the game when the countdown runs out
--   replay_board         the same board with every chain empty
--
-- What the letterboxed-build-board edge function calls:
--
--   candidate_words      the dictionary words a board's letters can spell
--   pick_seed            a random seed pair for a board
--   seed_for             the seed pair for a typed board's twelve letters
--
-- What the frontend reads is none of this schema's tables: `_rebuild_data_cols`
-- writes the page blobs onto `common.games` after every move (plans/seat-view.md
-- → The page is written, not assembled) — `game_data`, `summary_data`, and
-- `shell_data` through common — and `create_game` writes `static_game_data`
-- once; the page reads those.
--
-- What is particular to letterboxed (docs/games/letterboxed.md has the rest):
--   - A player's state is a single CHAIN of words (in coop every player's row
--     holds the same chain, kept in lock-step). Every rule below is a
--     question about that array — what may be appended, what the last
--     word's last letter is, how many distinct letters the whole thing
--     covers.
--   - Covering all twelve letters within `max_words` wins at once: the team
--     in coop, the first racer in compete. Undo refunds, so a player can't
--     run out; a timeout is the only other ending.
--   - In compete a rival may see how many words you have played and how much
--     of the board you have covered, never which words until the game ends.
--     That is the hook's rule (src/letterboxed/hooks/useGame.ts), not a
--     policy's: the blob carries every chain, the hook withholds.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema letterboxed to authenticated;

-- The seed import (supabase/scripts/import-letterboxed-seeds.ts)
-- connects as the superuser (bypasses grants), so service_role only
-- needs schema USAGE for any incidental PostgREST access.
grant usage on schema letterboxed to service_role;

-- letterboxed.seeds: public reference data, no policy needed beyond the
-- grant. The board builder samples seeds as the caller.
grant select on letterboxed.seeds to authenticated;

-- Everything on the game row is readable. Nothing reads this table from the
-- client: the page reads the board from `game_data`. Explicit column list per
-- docs/code-conventions.md → "Avoid SELECT *".
grant select
  (game_id, sides, words, solution, max_words, legal_band)
  on letterboxed.games to authenticated;

-- COLUMN-LEVEL GRANT, and `chain` is deliberately absent. In compete a
-- rival may see how MANY words you have played, never which — so the
-- array stays off any client read. The page reads every chain from
-- `game_data`, where the hook withholds a rival's mid-race.
grant select
  (game_id, user_id, hints_used)
  on letterboxed.players to authenticated;

grant select on letterboxed.events to authenticated;

-- Membership-gated read on games. Coop + compete behave identically:
-- anyone in the club sees the board. There is nothing to hide — the
-- board's whole legal word list ships to the page by design.
drop policy if exists games_select on letterboxed.games;
create policy games_select on letterboxed.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Row visibility is club-member-wide; nothing reads this table from the
-- client.
drop policy if exists players_select on letterboxed.players;
create policy players_select on letterboxed.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- The event log: any club member sees every row. In compete the log IS the
-- private data (every row names a word), so who may see a rival's rows
-- mid-race is the hook's rule (src/letterboxed/hooks/useGame.ts), applied to
-- `game_data`; nothing reads this table from the client.
drop policy if exists events_select on letterboxed.events;
create policy events_select on letterboxed.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the
-- security-definer RPCs below.

drop function if exists letterboxed._covered(text[]);

-- ============================================================
-- letterboxed._covered — how many of the twelve letters a chain touches
-- ============================================================
-- The win condition, and the compete timeout's ranking metric, both
-- reduce to this number. Every chain word is legal by construction,
-- so all of its letters are on the board — which makes "letters
-- covered" simply the count of distinct characters in the concatenated
-- chain, with no need to consult the board at all.
--
-- An empty chain concatenates to '', which regexp_split_to_table
-- returns as one empty row; the WHERE drops it so the answer is 0
-- rather than 1.
create or replace function letterboxed._covered(p_chain text[])
returns int
language sql
immutable
as $$
  select coalesce(count(distinct c), 0)::int
    from regexp_split_to_table(array_to_string(p_chain, ''), '') c
   where c <> '';
$$;

revoke execute on function letterboxed._covered(text[]) from public;
grant execute on function letterboxed._covered(text[]) to authenticated;

-- The two views the frontend read before the page blobs, and the definers they
-- read the hidden chain through. supabase/sql is re-applied, not diffed, so
-- the drops stay.
drop view if exists letterboxed.players_state;
drop view if exists letterboxed.games_state;
drop function if exists letterboxed._chain_for(uuid, uuid);
drop function if exists letterboxed._word_count_for(uuid, uuid);
drop function if exists letterboxed._covered_for(uuid, uuid);

drop function if exists letterboxed.candidate_words(bigint, int);

-- ============================================================
-- letterboxed.candidate_words — the board's word pool, pre-adjacency
-- ============================================================
-- What the board builder calls to get every word whose LETTERS fit the
-- twelve (`p_board_mask`), up to band `p_max_band`. The side-adjacency rule
-- ("no two consecutive letters from one side") is NOT applied here: it
-- depends on the partition, which the builder is still choosing, and
-- expressing a per-character walk in SQL would be far uglier than the
-- two-line loop the builder already runs in TypeScript. So SQL does the
-- sargable half and TS does the rest.
--
-- `p_board_mask & ~...` is the same bitwise subset test spellingbee runs
-- against the generated common.words.letter_mask column: a word fits
-- when it introduces no letter the board lacks.
--
-- Words with a DOUBLED LETTER are excluded here too. They can never be
-- legal on any board (a repeated letter is trivially same-side), and
-- dropping them in SQL keeps the builder from shipping them into a
-- board's words by omission. (The builder's isPlayable would
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
-- ─── The two tiers (docs/word-list.md → Which words a game may use) ───
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
-- The asymmetry is the point: a band-1 word like BITCH (slur = 1) is the
-- player's to type, and never one the game offers.
create or replace function letterboxed.candidate_words(
  p_board_mask bigint,
  p_max_band int
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
     where w.difficulty <= p_max_band
       and w.len >= 3
       and (w.letter_mask & ~p_board_mask) = 0
  )
  select f.word, f.is_clean
    from fits f
   where f.word !~ '(.)\1';
$$;

revoke execute on function letterboxed.candidate_words(bigint, int) from public;
grant execute on function letterboxed.candidate_words(bigint, int) to authenticated;

drop function if exists letterboxed.pick_seed(int);

-- ============================================================
-- letterboxed.pick_seed — one random board seed
-- ============================================================
-- `order by random() limit 1` over ~458k rows is a full scan, and that
-- is fine: it runs ONCE per game, takes tens of milliseconds, and the
-- alternatives (sampling by a random key, tablesample) all skew the
-- distribution in exchange for a saving nobody will feel.
--
-- WHY p_max_band EXISTS even though the importer already caps seeds at
-- band 2: the seeded pair has to be LEGAL in the game being built, or
-- the guaranteed two-word solution isn't in the board's words and
-- create_game's winnability check rejects the board. So the builder
-- passes least(legal_band, 2) — a game played at legal_band 1 draws
-- only from band-1 seeds (222k of them, still ample).
--
-- No previous-board overlap cap, unlike wordwheel's builder: with
-- 458k seeds over C(26,12) possible letter sets, a club would have to
-- play for years to notice a repeat.
create or replace function letterboxed.pick_seed(p_max_band int)
returns table(letters text, word_a text, word_b text, difficulty int)
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select s.letters::text, s.word_a, s.word_b, s.difficulty
    from letterboxed.seeds s
   where s.difficulty <= p_max_band
   order by random()
   limit 1;
$$;

revoke execute on function letterboxed.pick_seed(int) from public;
grant execute on function letterboxed.pick_seed(int) to authenticated;

drop function if exists letterboxed.seed_for(text);

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
-- `solution`, which letterboxed.games requires and which the end-of-game
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
create or replace function letterboxed.seed_for(p_board_letters text)
returns table(letters text, word_a text, word_b text, difficulty int)
language sql
stable
security definer
set search_path = letterboxed, common, public, extensions
as $$
  select s.letters::text, s.word_a, s.word_b, s.difficulty
    from letterboxed.seeds s
   where s.letters = p_board_letters;
$$;

revoke execute on function letterboxed.seed_for(text) from public;
grant execute on function letterboxed.seed_for(text) to authenticated;

drop function if exists letterboxed._leaderboard(uuid);
drop function if exists letterboxed._sync_status(uuid);
drop function if exists letterboxed._end_game(uuid, text, jsonb, jsonb);

-- The statuses' writer, from before the page blobs; supabase/sql is
-- re-applied, not diffed, so the drop stays.
drop function if exists letterboxed._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- letterboxed's own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- letterboxed's facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
-- `static_game_data` is what nothing after `create_game` changes, written once
-- by `_write_static_game_data`; the page hands it to `useGame`, which merges
-- each key back into its place in `game_data`.
--
--   static_game_data, letterboxed's part:
--     puzzle: {tiles, words, uncleanWords, nParWords}
--                                          the board, frozen at create; a tile is
--                                          {id, letter, side}, its id the letter;
--                                          `words` every word the board accepts,
--                                          `uncleanWords` the few of them a hint may
--                                          not offer
--
--   game_data, letterboxed's part:
--     puzzle: {solution}                   the seeded pair, null until the game ends
--     team: {nWordsUsed, nCoveredLetters, nHintsUsed, nSpoilersUsed, maxWords, board}
--                                          the team's facts, once: the one chain and
--                                          its counts, the hints and spoilers summed;
--                                          null in compete (docs/common-schema.md → A player's facts)
--     events: [{id, userId, kind, word, nCoveredLetters, tookTurn, at}, …]
--                                          every move and every hint or spoiler,
--                                          every player's; what a racer may see of a
--                                          rival mid-race is the hook's rule
--     players: [player, …]                 the common player, plus this player's own facts:
--       maxWords                           the cap, the same on every player
--       nHintsUsed, nSpoilersUsed          off the log
--       nWordsUsed, nCoveredLetters        a racer's chain's; null in coop, whose
--                                          one chain is `team`'s
--       board: {words}                     a racer's own chain; null in coop
--
--   summary_data, letterboxed's part (the common part names and dates the game
--   and carries its ending; the winner is `ending.winner`):
--     team: {nWordsUsed, nCoveredLetters}  the coop chain's counts; null in compete
--     maxWords
--     band                                 the dictionary band, `legal_band`
--     nBestCoveredLetters                  compete's best chain so far; null in coop
--     nWinnerWords                         compete's winner's chain, once a racer
--                                          has solved; null otherwise
--     nWinnerCoveredLetters                compete's winner's letters, on a solve or
--                                          a timeout; null otherwise

-- Par on every board this pipeline builds: the seeded pair (see create_game).
create or replace function letterboxed._n_par_words()
returns int
language sql
immutable
as $$
  select 2;
$$;

revoke execute on function letterboxed._n_par_words() from public;

-- The box's twelve tiles, in side order: each letter is its own id, since a
-- board never repeats one, and `side` is 0–3.
create or replace function letterboxed._make_json_tiles(p_sides text)
returns jsonb
language sql
immutable
set search_path = letterboxed, common, public, extensions
as $$
  select jsonb_agg(jsonb_build_object(
           'id',     substr(p_sides, i, 1),
           'letter', substr(p_sides, i, 1),
           'side',   (i - 1) / 3) order by i)
    from generate_series(1, 12) i;
$$;

revoke execute on function letterboxed._make_json_tiles(text) from public;

-- The accepted words a hint may not offer: those that fail the must-reach
-- filter (docs/word-list.md → Which words a game may use), or that the
-- dictionary no longer holds. Read against `common.words` at every rebuild, so
-- a word re-flagged in the editor leaves the hints on old boards too.
--
-- Dropped first: a parameter's name cannot change in place.
drop function if exists letterboxed._make_json_unclean_words(jsonb);
create or replace function letterboxed._make_json_unclean_words(p_words jsonb)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select coalesce(jsonb_agg(lw.word order by lw.ord), '[]'::jsonb)
    from jsonb_array_elements_text(p_words) with ordinality lw(word, ord)
   where not exists (
           select 1 from common.words w
            where w.word = lw.word
              and w.american and w.british
              and w.crude = 0 and w.slur = 0 and not w.slang);
$$;

revoke execute on function letterboxed._make_json_unclean_words(jsonb) from public;

-- The puzzle's part of game_data: the seeded pair once the game has ended. The
-- board is static (`_make_json_static_game_data`).
create or replace function letterboxed._make_json_puzzle(lg letterboxed.games, p_ended boolean)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select jsonb_build_object(
    'solution', case when p_ended then to_jsonb(lg.solution) end);
$$;

revoke execute on function letterboxed._make_json_puzzle(letterboxed.games, boolean) from public;

-- The log: every row, in the order of play.
create or replace function letterboxed._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',              e.id,
           'userId',          e.user_id,
           'kind',            e.kind,
           'word',            e.word,
           'nCoveredLetters', e.n_covered_letters,
           'tookTurn',        e.took_turn,
           'at',              e.created_at) order by e.id), '[]'::jsonb)
    from letterboxed.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function letterboxed._make_json_events(uuid) from public;

-- A chain's facts: its two counts and the chain itself.
create or replace function letterboxed._make_json_chain(p_chain text[])
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select jsonb_build_object(
           'nWordsUsed',      cardinality(p_chain),
           'nCoveredLetters', letterboxed._covered(p_chain),
           'board',           jsonb_build_object('words', to_jsonb(p_chain)));
$$;

revoke execute on function letterboxed._make_json_chain(text[]) from public;

-- The hints and spoilers taken, off the log: one player's, or every player's
-- when `p_user_id` is null — the team's.
create or replace function letterboxed._make_json_asks(p_game_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select jsonb_build_object(
           'nHintsUsed',    count(*) filter (where e.kind = 'hint'),
           'nSpoilersUsed', count(*) filter (where e.kind = 'spoiler'))
    from letterboxed.events e
   where e.game_id = p_game_id
     and (p_user_id is null or e.user_id = p_user_id);
$$;

revoke execute on function letterboxed._make_json_asks(uuid, uuid) from public;

-- The coop chain's two counts, read off any coop row since every row holds the
-- chain. Null in compete, where there is no team.
create or replace function letterboxed._make_json_team_counts(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select case when cg.mode = 'coop' then (
           select jsonb_build_object(
                    'nWordsUsed',      cardinality(lp.chain),
                    'nCoveredLetters', letterboxed._covered(lp.chain))
             from letterboxed.players lp
            where lp.game_id = p_game_id
            order by lp.user_id
            limit 1)
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function letterboxed._make_json_team_counts(uuid) from public;

-- The team's facts, sent once: the one chain, read off any coop row since
-- every row holds it, with its counts; the hints and spoilers summed; the cap.
-- Null in compete, where there is no team (docs/common-schema.md → A player's
-- facts).
create or replace function letterboxed._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select (select letterboxed._make_json_chain(lp.chain)
            from letterboxed.players lp
           where lp.game_id = p_game_id
           order by lp.user_id
           limit 1)
         || letterboxed._make_json_asks(p_game_id, null)
         || jsonb_build_object('maxWords', lg.max_words)
    from letterboxed.games lg
    join common.games cg on cg.id = lg.game_id
   where lg.game_id = p_game_id
     and cg.mode = 'coop';
$$;

revoke execute on function letterboxed._make_json_team(uuid) from public;

-- Every player as letterboxed's game_data shows them: the common player, with
-- their own facts — the cap, the hints and spoilers they took, and in compete
-- their chain and its counts.
create or replace function letterboxed._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select jsonb_agg(
           cp.player
             || jsonb_build_object('maxWords', lg.max_words)
             || letterboxed._make_json_asks(p_game_id, cp.id)
             -- Coop's one chain is sent once, in `team`.
             || case when cg.mode = 'compete' then letterboxed._make_json_chain(lp.chain)
                else '{"nWordsUsed": null, "nCoveredLetters": null, "board": null}'::jsonb end
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join letterboxed.players lp on lp.game_id = p_game_id and lp.user_id = cp.id
    join letterboxed.games lg on lg.game_id = p_game_id
    join common.games cg on cg.id = p_game_id;
$$;

revoke execute on function letterboxed._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with letterboxed's puzzle, team,
-- log and players on top.
create or replace function letterboxed._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  letterboxed._make_json_puzzle(lg, cg.ended_at is not null),
           'team',    letterboxed._make_json_team(p_game_id),
           'events',  letterboxed._make_json_events(p_game_id),
           'players', letterboxed._make_json_players(p_game_id))
    from letterboxed.games lg
    join common.games cg on cg.id = lg.game_id
   where lg.game_id = p_game_id;
$$;

revoke execute on function letterboxed._make_json_game_data(uuid) from public;

-- The whole static_game_data blob: the common part, with the board on top —
-- its tiles, its words, the ones a hint may not offer, and its par. Nothing in
-- it changes after create_game.
create or replace function letterboxed._make_json_static_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  select common._make_json_static_game_data(p_game_id) || jsonb_build_object(
           'puzzle', jsonb_build_object(
             'tiles',        letterboxed._make_json_tiles(lg.sides),
             'words',        lg.words,
             'uncleanWords', letterboxed._make_json_unclean_words(lg.words),
             'nParWords',    letterboxed._n_par_words()))
    from letterboxed.games lg
   where lg.game_id = p_game_id;
$$;

revoke execute on function letterboxed._make_json_static_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one. The
-- winner is the one `ending.winner` names (common._make_json_ending), so a
-- timeout's tied winners read the same racer in both.
create or replace function letterboxed._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = letterboxed, common, public, extensions
as $$
  with winner as (
    select gp.solved_at, lp.chain
      from common.game_players gp
      join letterboxed.players lp on lp.game_id = gp.game_id and lp.user_id = gp.user_id
      join common.games cg on cg.id = gp.game_id
     where gp.game_id = p_game_id and gp.final_ranking = 1 and cg.mode = 'compete'
     order by gp.turn_seat, gp.user_id
     limit 1
  )
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',                  letterboxed._make_json_team_counts(p_game_id),
    'maxWords',              lg.max_words,
    'band',                  lg.legal_band,
    'nBestCoveredLetters',   case when cg.mode = 'compete' then
                               (select max(letterboxed._covered(lp.chain))
                                  from letterboxed.players lp where lp.game_id = p_game_id)
                             end,
    'nWinnerWords',          (select cardinality(w.chain) from winner w where w.solved_at is not null),
    'nWinnerCoveredLetters', (select letterboxed._covered(w.chain) from winner w))
    from letterboxed.games lg
    join common.games cg on cg.id = lg.game_id
   where lg.game_id = p_game_id;
$$;

revoke execute on function letterboxed._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- letterboxed._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from letterboxed's own tables,
-- assigning each whole. Every RPC calls it after a move; it is also the repair
-- for one game by hand. Every key is always present, null when it has no
-- value, except a coop player's two chain counts, which are the team's; the
-- shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function letterboxed._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = letterboxed._make_json_game_data(p_game_id),
         summary_data = letterboxed._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function letterboxed._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- letterboxed._write_static_game_data — one game's static blob, written
-- ============================================================
-- Writes `static_game_data`, which nothing after create changes, so no move
-- writes it: `create_game` calls this once, and `_rebuild_data_cols_for_all`
-- for a shape change.
create or replace function letterboxed._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = letterboxed, common, public, extensions
as $$
  update common.games
     set static_game_data = letterboxed._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;

revoke execute on function letterboxed._write_static_game_data(uuid) from public;

-- ============================================================
-- letterboxed._rebuild_data_cols_for_all — every letterboxed game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_write_static_game_data` and `_rebuild_data_cols` over every letterboxed
-- game without re-dating any, and answers how many it rewrote. Run by hand as
-- postgres (`gmake db-psql`); no client calls it, so it has no grant and wears
-- the `_`.
create or replace function letterboxed._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('letterboxed_coop', 'letterboxed_compete')
  loop
    perform letterboxed._write_static_game_data(v_game_id);
    perform letterboxed._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function letterboxed._rebuild_data_cols_for_all() from public;

drop function if exists letterboxed.create_game(text, jsonb, uuid[], text, jsonb);

-- ============================================================
-- letterboxed.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Setup shape (server validates):
--   { "extra_words": 0..8  (default 3) — how many words ABOVE PAR the
--       chain may run to. Stored resolved as `max_words = PAR +
--       extra_words`, the shape waffle uses for `max_swaps = par +
--       extra_swaps`.
--
--       PAR IS THE CONSTANT 2, not a computed column, because every board
--       this pipeline can build is solvable in exactly two words (the
--       builder partitions the twelve letters so the seeded pair stays
--       legal — see the migration). It is expressed as par + slack
--       anyway because that is the number players can actually reason
--       about: "solve it in 5" says nothing on its own, while "par is 2,
--       you get 3 spare" says exactly how much room you have.
--
--       A PLAYER-CHOSEN BOARD DOES NOT CHANGE THIS. The builder proves
--       par 2 for a typed board the same way it guarantees it for a
--       rolled one — by finding the seeded pair for those twelve letters
--       and checking it stays legal under the typed partition — so
--       there is still no board here whose par is anything but 2.
--     "legal_band": 1..6   (default 5) — how obscure an accepted word
--       may be. NOTE THE DIRECTION: higher = EASIER.
--     "coop_style": 'free' | 'turns',
--     "first_turn_user_id": uuid (required when coop_style='turns'),
--     "custom_sides": the twelve letters of a typed board, in side order
--       (optional; absent = the edge function rolled one). Cross-checked
--       against p_board's sides below, then stripped from the club default.
--     "timer": … }
--
-- `p_board` comes from the letterboxed-build-board edge function:
--   { "sides": 12 letters in side order,
--     "words": [ … ],   every word that can be played on the board
--     "solution": [word_a, word_b] }
--
-- The board validation below is unusually thorough, and on purpose: it
-- is the ONLY place that checks the game is winnable at all. If the
-- seeded pair doesn't chain, doesn't cover the twelve, or isn't in the
-- legal list, the players get a board with no guaranteed solution
-- and no way to know it.
--
-- EVERY refusal is a fault, which is unusual: the two settings this reads
-- are bounded by their own controls, and everything else it checks is a
-- board the player never composed. The one thing they can type — a custom
-- board — has its shape gated by the dialog and its SOLVABILITY judged by
-- the edge function, so by the time a board reaches here there is nothing
-- left that is theirs to have got wrong.
create or replace function letterboxed.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text,
  p_board jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
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
begin
  perform common._require_club_member(p_club_handle);

  -- ─── Validate mode + player count ────────────────────────
  perform common._require_valid_mode(p_mode);

  if p_mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this is the server-side
    -- catch.
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN199', hint = 'fault', column = '_',
        detail = 'compete needs >= 2 players';
    end if;
  end if;

  perform common._require_player_count_max(p_player_user_ids, 6);

  -- ─── Validate setup ──────────────────────────────────────
  s_extra_words := coalesce((p_setup->>'extra_words')::int, 3);
  -- A sane range, not the form's menu: which counts are offered is the setup
  -- form's choice. 8 keeps `max_words` inside its column check (2..10).
  if s_extra_words < 0 or s_extra_words > 8 then
    raise exception 'BUG: spare-word count of %', s_extra_words
      using errcode = 'PN200', hint = 'fault', column = '_',
      detail = 'setup.extra_words must be 0..8';
  end if;
  -- PAR = 2 on every board this pipeline builds (see above). Resolved here
  -- rather than stored as a `par` column, which would be a constant column;
  -- `max_words` is what every rule downstream actually reads.
  s_max_words := letterboxed._n_par_words() + s_extra_words;

  s_legal_band := coalesce((p_setup->>'legal_band')::int, 5);
  if s_legal_band < 1 or s_legal_band > 6 then
    raise exception 'BUG: dictionary of %', s_legal_band
      using errcode = 'PN201', hint = 'fault', column = '_',
      detail = 'setup.legal_band must be 1..6';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Validate the board ──────────────────────────────────
  b_sides := p_board->>'sides';
  if b_sides is null or b_sides !~ '^[a-z]{12}$' then
    raise exception 'BUG: board of ''%''',
      coalesce(b_sides, 'nothing')
      using errcode = 'PN202', hint = 'fault', column = '_',
      detail = 'board.sides must be 12 lowercase ASCII letters';
  end if;
  -- Letter Boxed never repeats a letter: the board is a SET of twelve.
  if (select count(distinct c) from regexp_split_to_table(b_sides, '') c) <> 12 then
    raise exception 'BUG: board repeating a letter: ''%''', b_sides
      using errcode = 'PN203', hint = 'fault', column = '_',
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
  if p_setup->>'custom_sides' is not null
     and p_setup->>'custom_sides' <> b_sides then
    raise exception 'BUG: you asked for ''%'' and the board built was ''%''',
      p_setup->>'custom_sides', b_sides
      using errcode = 'PN204', hint = 'fault', column = '_',
      detail = 'board.sides must equal setup.custom_sides exactly';
  end if;

  if jsonb_typeof(p_board->'words') <> 'array' then
    raise exception 'BUG: generated board arrived with no word list'
      using errcode = 'PN205', hint = 'fault', column = '_',
      detail = 'board.words must be a jsonb array';
  end if;
  b_words := p_board->'words';
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
  if p_setup->>'custom_sides' is null and jsonb_array_length(b_words) < 150 then
    raise exception 'BUG: generated board had only % words to find',
      jsonb_array_length(b_words)
      using errcode = 'PN206', hint = 'fault', column = '_',
      detail = 'board.words must hold >= 150; the edge function''s gate must agree';
  end if;

  -- ─── The winnability invariant ───────────────────────────
  -- Everything above says the board is well-formed. This says it can be
  -- SOLVED, which is the promise the seed pipeline exists to keep.
  b_solution := array(select jsonb_array_elements_text(p_board->'solution'));
  if cardinality(b_solution) <> 2 then
    raise exception 'BUG: generated board came with the wrong number of solution words'
      using errcode = 'PN207', hint = 'fault', column = '_',
      detail = 'board.solution must hold exactly 2 words';
  end if;
  sol_a := b_solution[1];
  sol_b := b_solution[2];

  if not (b_words ? sol_a) or not (b_words ? sol_b) then
    raise exception 'BUG: generated board''s solution uses words it does not allow'
      using errcode = 'PN208', hint = 'fault', column = '_',
      detail = 'both solution words must appear in board.words';
  end if;
  if right(sol_a, 1) <> left(sol_b, 1) then
    raise exception 'BUG: generated board''s solution does not chain: ''%'' ends in % and ''%'' starts with %',
      sol_a, right(sol_a, 1), sol_b, left(sol_b, 1)
      using errcode = 'PN209', hint = 'fault', column = '_',
      detail = 'board.solution must chain: word_a''s last letter is word_b''s first';
  end if;
  if letterboxed._covered(b_solution) <> 12 then
    raise exception 'BUG: generated board''s solution covers only % of the twelve letters',
      letterboxed._covered(b_solution)
      using errcode = 'PN210', hint = 'fault', column = '_',
      detail = 'board.solution must cover all twelve letters';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  -- The board itself, grouped by side: "ABC-DEF-GHI-JKL". Nothing here
  -- is secret, so unlike wordle the title needs no re-sync as the game
  -- progresses — the board never changes. Dashes, because the title is one
  -- of the places a player READS A BOARD OFF to retype it (the info
  -- column's Board row and the PDF are the others, both via
  -- lib/customBoard.ts → formatSides), and the three should match.
  game_title := upper(substr(b_sides, 1, 3)) || '-' || upper(substr(b_sides, 4, 3))
             || '-' || upper(substr(b_sides, 7, 3)) || '-' || upper(substr(b_sides, 10, 3));

  -- The saved default strips the per-GAME picks: who goes first (not a club
  -- preference — coop_style itself rides along), and the typed board. A
  -- board is an INSTANCE, not a preference: left in the club's default it
  -- would prefill the next dialog, and every later Start would silently
  -- rebuild this same board until somebody noticed the field was populated
  -- and cleared it. Same reason boggle strips custom_board and spellingbee
  -- strips custom_letters.
  new_id := common._create_game(
    p_club_handle, 'letterboxed_' || p_mode, p_mode, p_player_user_ids, game_title, p_setup,
    p_setup - 'first_turn_user_id' - 'custom_sides'
  );

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_word
  -- and undo_word gate each move. Free-for-all / compete leave the
  -- pointer null (inert). Runs after common._create_game seeds
  -- game_players.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN211', hint = 'fault', column = '_',
        detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into letterboxed.games (
    game_id, sides, words, solution, max_words, legal_band
  )
  values (
    new_id, b_sides, b_words, b_solution, s_max_words, s_legal_band
  );

  insert into letterboxed.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  perform letterboxed._write_static_game_data(new_id);
  perform letterboxed._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. It is the only thing a
  -- call site can filter the `ok` on, and it reaches both — the edge function
  -- relays this envelope untouched.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- The boundary. It reads the SQLSTATE, re-raises anything that isn't ours, and
-- lets the raise itself carry the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function letterboxed.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function letterboxed.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

drop function if exists letterboxed._require_chain_move(uuid);

-- ============================================================
-- letterboxed._require_chain_move — the gate every chain move shares
-- ============================================================
-- Locks the game row, so moves on one game serialize (two players submitting
-- off the same tail in free-for-all coop: only one may win, and the loser is
-- told the chain moved), and refuses a move into a deleted game (asked
-- before the membership gate, which the delete took with it), an ended one,
-- or from a player who has conceded — whose chain is frozen, or a conceder
-- could keep appending and even cover the twelve. Returns the caller.
create or replace function letterboxed._require_chain_move(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
begin
  perform 1 from letterboxed.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('letterboxed');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: a teammate solved it or ended it, or the timer ran out, while
    -- this move was in flight.
    perform common._raise_game_over();
  end if;

  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  return caller_id;
end;
$$;

revoke execute on function letterboxed._require_chain_move(uuid) from public;

drop function if exists letterboxed.submit_word(uuid, text);

-- ============================================================
-- letterboxed.submit_word — append a word to the chain
-- ============================================================
-- The whole rulebook, in order. Everything before the append is a
-- rejection reason the FE renders in the feedback pill; the wording of
-- each raise is what the player reads.
--
-- A chain covering all twelve ends the game reached_goal / solved, the
-- player who played the word as who ended it: coop's whole team ranked 1
-- and solved, compete's solver alone — the bar is "cover the twelve within
-- the cap", and being first past it is the whole race, so the rest are
-- short of the goal.
create or replace function letterboxed.submit_word(p_game_id uuid, p_word text)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  g letterboxed.games%rowtype;
  v_mode text;
  v_chain text[];
  v_word text;
  v_tail text;
  v_covered int;
  v_rankings jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  caller_id := letterboxed._require_chain_move(p_game_id);
  select * into g from letterboxed.games where game_id = p_game_id;
  select mode into v_mode from common.games where id = p_game_id;

  -- No-op when the game isn't turn-based (the pointer is null).
  perform common._require_turn(p_game_id, caller_id);

  -- ─── The five shape checks, and the split that runs through them ───
  -- `lib/board.ts`'s `rejectReason` checks all five before every submit, so
  -- reaching any of them means the frontend's answer and the server's differ.
  -- WHY they differ is what decides the severity, and it turns on what each
  -- check reads:
  --
  --   * The word and the board are FIXED — the frontend holds the legal
  --     words and applies the dictionary, the letters and the same-side rule
  --     itself. Nothing can change under it, so a disagreement means a broken
  --     client: wordiply's `fe_legal` ruling (PN367) arriving in another game.
  --   * The CHAIN is shared, and coop is free-for-all. A teammate's word lands
  --     between your local check and your submit, and the three checks that
  --     read the chain — its length, its contents, its tail — flip underneath
  --     you. Those are races: you made a legal move and lost it.
  --
  -- The racing three keep `rejectReason`'s exact words, so the same rule
  -- arriving by the other route is not described differently.
  v_word := lower(trim(p_word));
  if v_word !~ '^[a-z]{3,}$' then
    raise exception 'BUG: a word under three letters'
      using errcode = 'PN399', hint = 'fault', column = '_',
      detail = 'a word must be at least three letters';
  end if;

  -- One membership test covers the dictionary, the board's letters AND
  -- the same-side rule: `words` is exactly the set of words that
  -- satisfy all three, computed once when the board was built.
  if not (g.words ? v_word) then
    raise exception 'BUG: a word this board cannot play'
      using errcode = 'PN403', hint = 'fault', column = '_',
      detail = format('%L is absent from the board''s words (dictionary, letters or side rule)', v_word);
  end if;

  -- In coop every row holds the same chain, so the caller's own row is
  -- always the right one to read.
  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = p_game_id and p.user_id = caller_id;

  if cardinality(v_chain) >= g.max_words then
    raise exception 'Chain is full'
      using errcode = 'PN401', hint = 'race', column = '_',
      detail = format('the chain is already at max_words (%s)', g.max_words);
  end if;

  if v_word = any(v_chain) then
    raise exception 'Already played'
      using errcode = 'PN402', hint = 'race', column = '_',
      detail = format('%L is a repeat, which is a no-op loop', v_word);
  end if;

  if cardinality(v_chain) > 0 then
    v_tail := right(v_chain[cardinality(v_chain)], 1);
    if left(v_word, 1) <> v_tail then
      raise exception 'Must start with %', upper(v_tail)
        using errcode = 'PN400', hint = 'race', column = '_',
        detail = 'the next word must start with the chain tail''s last letter';
    end if;
  end if;

  -- ─── Append ──────────────────────────────────────────────
  -- The mode difference is this WHERE clause and nothing else: coop
  -- moves every row in lock-step, compete moves only the actor's.
  update letterboxed.players
     set chain = chain || v_word
   where game_id = p_game_id
     and (v_mode = 'coop' or user_id = caller_id);

  v_chain := v_chain || v_word;
  v_covered := letterboxed._covered(v_chain);

  insert into letterboxed.events (game_id, user_id, kind, word, n_covered_letters, took_turn)
  values (p_game_id, caller_id, 'word', v_word, v_covered, true);

  -- ─── Did that finish it? ─────────────────────────────────
  if v_covered = 12 then
    update common.game_players
       set solved_at = now()
     where game_id = p_game_id
       and (v_mode = 'coop' or user_id = caller_id);

    if v_mode = 'coop' then
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    else
      v_rankings := jsonb_build_object(caller_id::text, 1);
    end if;

    perform common._end_game(
      p_game_id, 'reached_goal', 'solved', caller_id,
      p_is_no_result => false,
      p_final_rankings => v_rankings
    );
    perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

    -- `result` NAMES the ending, and is all the answer carries: what the
    -- word did, the page reads from the blobs, and how it reads — the outcome
    -- and the words — is the frontend's lib/answer.ts (docs/outcomes.md → How
    -- a game does it).
    return common._ok_envelope(jsonb_build_object('result', 'solved'));
  end if;

  -- Still going: hand the turn on (no-op in a free-for-all game).
  perform common._advance_turn(p_game_id);
  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object('result', 'accepted'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.submit_word(uuid, text) from public;
grant execute on function letterboxed.submit_word(uuid, text) to authenticated;

drop function if exists letterboxed.undo_word(uuid);

-- ============================================================
-- letterboxed.undo_word — take the last word back
-- ============================================================
-- A first-class move, not an error path: a chain can DEAD-END (the tail
-- letter may have no legal continuation), so backing out has to be
-- available or a game becomes unwinnable by accident.
--
-- It REFUNDS against max_words. That is what makes the cap a shape
-- constraint on the solution — "your chain may be at most N words" —
-- rather than a budget you can exhaust. You cannot lose here; you can
-- only be beaten, or run out the timer.
--
-- IN TURN-BY-TURN COOP THE UNDO COSTS YOUR TURN (the _advance_turn at
-- the end fires for undo exactly as it does for a played word). A free
-- undo would make the chain meaningless. It also gives the mode its
-- best dynamic: undoing doesn't help YOU — you retreat and the NEXT
-- player inherits the better position, so it reads as a sacrifice.
--
-- How an undo reads — news, not a verdict — is the frontend's lib/answer.ts.
create or replace function letterboxed.undo_word(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  v_mode text;
  v_chain text[];
  v_popped text;
  v_covered int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  caller_id := letterboxed._require_chain_move(p_game_id);
  select mode into v_mode from common.games where id = p_game_id;

  perform common._require_turn(p_game_id, caller_id);

  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = p_game_id and p.user_id = caller_id;

  if coalesce(cardinality(v_chain), 0) = 0 then
    -- A race, and the caller's own: the × renders only on a non-empty chain,
    -- but the button unlocks on this RPC's reply while the shortened chain
    -- arrives by subscription — so a fast second click outruns its own row.
    raise exception 'Nothing to undo'
      using errcode = 'PN407', hint = 'race', column = '_',
      detail = 'the chain is empty';
  end if;

  v_popped := v_chain[cardinality(v_chain)];
  v_chain := v_chain[1:cardinality(v_chain) - 1];

  update letterboxed.players set chain = v_chain
   where game_id = p_game_id
     and (v_mode = 'coop' or user_id = caller_id);

  v_covered := letterboxed._covered(v_chain);
  -- An undo spends a go, which is exactly what stops it being a free reroll —
  -- and why turn-by-turn coop can offer it at all.
  insert into letterboxed.events (game_id, user_id, kind, word, n_covered_letters, took_turn)
  values (p_game_id, caller_id, 'undo', v_popped, v_covered, true);

  perform common._advance_turn(p_game_id);
  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- The case alone, as submit_word's: how it reads is lib/answer.ts's.
  return common._ok_envelope(jsonb_build_object('result', 'undone'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.undo_word(uuid) from public;
grant execute on function letterboxed.undo_word(uuid) to authenticated;

drop function if exists letterboxed.clear_chain(uuid);

-- ============================================================
-- letterboxed.clear_chain — abandon the attempt, keep the board
-- ============================================================
-- The bigger hammer (crosswords' "Clear board"), and NOT OFFERED IN
-- TURN-BY-TURN COOP. If both actions cost one turn, clearing four words
-- would be strictly cheaper per word than undoing one, which inverts
-- the pricing undo_word establishes. Repeated undo already reaches the
-- empty chain there, one turn at a time — which is the right speed, if
-- a group genuinely needs to start over they should feel it.
--
-- How a clear reads — news about the chain, not a verdict — is the frontend's
-- lib/answer.ts.
create or replace function letterboxed.clear_chain(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  caller_id := letterboxed._require_chain_move(p_game_id);

  if (select current_turn_user_id from common.games where id = p_game_id) is not null then
    -- A fault, not a refusal: whether a game runs turn-by-turn is fixed when it
    -- is created and never changes, so no unbroken client would offer the
    -- action here. Connections' `hint-in-compete` is the same shape, and
    -- docs/envelopes.md names it as the example of one.
    raise exception 'BUG: a clear in turn-by-turn coop'
      using errcode = 'PN411', hint = 'fault', column = '_',
      detail = 'turn-by-turn coop offers undo, not clear';
  end if;

  update letterboxed.players set chain = '{}'
   where game_id = p_game_id
     and ((select mode from common.games where id = p_game_id) = 'coop'
          or user_id = caller_id);

  insert into letterboxed.events (game_id, user_id, kind, word, n_covered_letters, took_turn)
  values (p_game_id, caller_id, 'clear', null, 0, true);

  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- The case alone, as submit_word's: how it reads is lib/answer.ts's.
  return common._ok_envelope(jsonb_build_object('result', 'cleared'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.clear_chain(uuid) from public;
grant execute on function letterboxed.clear_chain(uuid) to authenticated;

drop function if exists letterboxed.log_hint(uuid, text);
drop function if exists letterboxed.log_help(uuid, text, text);
drop function if exists letterboxed.log_hint_or_spoiler(uuid, text, text);

-- ============================================================
-- letterboxed.log_hint_or_spoiler — record that a rung was taken
-- ============================================================
-- The suggestion itself is computed ON THE FE: it holds the board's words,
-- so a breadth-first search over (letters-used, tail-letter) finds a
-- word on a shortest path to covering all twelve in ~40 lines of
-- TypeScript. The server's only job is to remember that a hint or a
-- spoiler was taken (`p_kind`), and which word it showed (`p_word_shown`),
-- so the event log agrees with what happened.
--
-- `p_kind` separates the two rungs: 'hint' gave the word's SHAPE,
-- 'spoiler' gave the word. The log is the only record of either, which is
-- why they are distinguishable there rather than merged into one counter.
--
-- Trusting the client here costs nothing: neither rung is penalized, and
-- both are COOP-ONLY. In compete either would be a win button — "first past
-- the bar" makes the fastest clicker the winner — so the mode check
-- below is a real rule, not bookkeeping.
--
-- No outcome: the FE has already shown the hint or the word itself, in its
-- own pill, and this answer only says the log agrees. Its job is to be a
-- not-ok when the log does NOT agree.
create or replace function letterboxed.log_hint_or_spoiler(
  p_game_id uuid, p_word_shown text, p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  caller_id uuid;
  v_chain text[];
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  caller_id := letterboxed._require_chain_move(p_game_id);

  if (select mode from common.games where id = p_game_id) <> 'coop' then
    -- A fault: the mode is fixed at create_game and the FE renders neither
    -- rung's button in compete, so this arriving means a broken client.
    raise exception 'BUG: a hint or spoiler in a compete game'
      using errcode = 'PN414', hint = 'fault', column = '_',
      detail = 'hint/spoiler would be a win button in a race';
  end if;
  if p_kind not in ('hint', 'spoiler') then
    raise exception 'BUG: a rung of an unknown kind'
      using errcode = 'PN415', hint = 'fault', column = '_',
      detail = format('log_hint_or_spoiler kind must be hint or spoiler; got %L', p_kind);
  end if;

  -- Per-PLAYER, even in coop where the chain is shared: this counts who
  -- took a rung, not what the team's position is. It counts hints and
  -- spoilers together, and nothing reads it: the page blobs count the two
  -- apart, off the log (`_make_json_players`).
  update letterboxed.players
     set hints_used = hints_used + 1
   where game_id = p_game_id and user_id = caller_id;

  select p.chain into v_chain
    from letterboxed.players p
   where p.game_id = p_game_id and p.user_id = caller_id;

  -- Neither rung takes a turn: both are coop-only asks rather than moves.
  insert into letterboxed.events (game_id, user_id, kind, word, n_covered_letters, took_turn)
  values (p_game_id, caller_id, p_kind, lower(trim(p_word_shown)),
          letterboxed._covered(v_chain), false);

  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object(
    'result', 'logged',
    'kind', p_kind,
    'word', lower(trim(p_word_shown))));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.log_hint_or_spoiler(uuid, text, text) from public;
grant execute on function letterboxed.log_hint_or_spoiler(uuid, text, text) to authenticated;

drop function if exists letterboxed.submit_timeout(uuid);

-- ============================================================
-- letterboxed.submit_timeout — the timer ran out
-- ============================================================
-- Fired by every connected client when a countdown hits 0; the first ends
-- the game, the rest find it ended and answer the game-over race.
-- letterboxed has no turn order in a race, and a coop game's turn pointer
-- names whoever held the turn.
--
-- The two modes part company here, deliberately:
--
--   coop     a loss. There is one chain and it didn't reach twelve; there
--            is nothing to rank.
--   compete  a race ranked by progress (docs/win-lose.md): every racer
--            who didn't concede and covered anything is ranked by letters
--            covered, then by the shorter chain, ties sharing a rank.
--            "I got ten of the twelve" is a real result, so a timed race
--            produces an answer rather than crowning nobody. A drop-out
--            forfeits, however much they had covered when they left; a
--            race where nobody covered anything ranks nobody.
create or replace function letterboxed.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_mode text;
  v_rankings jsonb := '{}'::jsonb;
begin
  perform 1 from letterboxed.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('letterboxed');
  end if;

  -- Row check before the membership gate: `delete_game` takes this row,
  -- `common.games` and every `game_players` row together, so a caller whose
  -- game was just deleted has no membership left either.
  perform common._require_game_player(p_game_id);
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  select mode into v_mode from common.games where id = p_game_id;

  if v_mode = 'compete' then
    select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
      into v_rankings
      from (
        select p.user_id,
               rank() over (order by letterboxed._covered(p.chain) desc,
                                     coalesce(cardinality(p.chain), 0) asc) as ranking
          from letterboxed.players p
          join common.game_players gp
            on gp.game_id = p.game_id and gp.user_id = p.user_id
         where p.game_id = p_game_id
           and gp.player_ended_reason is distinct from 'conceded'
           and letterboxed._covered(p.chain) > 0
      ) ranked;
  end if;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout',
    (select current_turn_user_id from common.games where id = p_game_id),
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );

  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.submit_timeout(uuid) from public;
grant execute on function letterboxed.submit_timeout(uuid) to authenticated;

drop function if exists letterboxed.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists letterboxed.end_game(uuid);

-- ============================================================
-- letterboxed.stop_game — "we've played as much as we want"
-- ============================================================
-- Any player stops the game for the whole table, in either mode, with no
-- result (docs/common-schema.md → Stop). That is the difference from
-- submit_timeout: the timer running out on a race is a RESULT (compete
-- ranks on coverage), but a group agreeing to stop is a group agreeing not
-- to have one. Calling that a loss would tell them their own decision beat
-- them.
create or replace function letterboxed.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning word waits for it and then reads the
  -- game as over. The row check comes before the membership gate — see
  -- submit_timeout.
  perform 1 from letterboxed.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('letterboxed');
  end if;

  perform common._stop(p_game_id);

  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.stop_game(uuid) from public;
grant execute on function letterboxed.stop_game(uuid) to authenticated;

drop function if exists letterboxed.concede(uuid);

-- ============================================================
-- letterboxed.concede — drop out of a compete race
-- ============================================================
-- letterboxed is NOT an elimination game: undo refunds, so the only way a
-- racer stops racing but conceding is by winning, which ends the game. So
-- `common._concede` decides it all: it marks the caller out, and ends the
-- game as a loss for everyone once no racer is left. Compete only — coop's
-- chain is shared, and ending it is the Stop.
create or replace function letterboxed.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from letterboxed.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('letterboxed');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'conceded'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.concede(uuid) from public;
grant execute on function letterboxed.concede(uuid) to authenticated;

drop function if exists letterboxed.replay_board(uuid);

-- ============================================================
-- letterboxed.replay_board — same twelve letters, empty chain
-- ============================================================
-- The cheapest replay on the roster: the board is immutable data, so
-- there is nothing to rebuild — clear the chains, the hint counts and the
-- log, and let common._reset_game clear the ending and rewind the turn
-- pointer. Nothing is re-revealed either (nothing was hidden), so unlike
-- wordle there is no title to re-sync.
--
-- Any game player may call it, mid-game or after the game ends.
create or replace function letterboxed.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = letterboxed, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the
  -- move RPCs lock the same row), or the reset could land on a
  -- half-applied move — a stray log row in the "fresh" game, or an
  -- in-flight game-ENDING move ending the board just reset.
  perform 1 from letterboxed.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('letterboxed');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update letterboxed.players
     set chain = '{}', hints_used = 0
   where game_id = p_game_id;

  delete from letterboxed.events where game_id = p_game_id;

  update common.game_players set solved_at = null where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform letterboxed._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'replayed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function letterboxed.replay_board(uuid) from public;
grant execute on function letterboxed.replay_board(uuid) to authenticated;
