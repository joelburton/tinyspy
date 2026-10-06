-- cs-blessed-wordle

-- ============================================================
-- wordle
-- ============================================================
-- What the frontend calls:
--
--   create_game     picks a hidden five-letter word and starts the game
--   submit_guess    guesses a word; a legal guess is colored against the
--                   answer and spends one of the budget
--   concede         a racer drops out of a compete game
--   stop_game       stops the game for everyone, with no result
--   submit_timeout  ends the game when the countdown runs out
--   replay_board    restarts the same word from scratch
--
-- What the frontend reads is none of this schema's tables: `_rebuild_data_cols`
-- writes the page blobs onto `common.games` after every move (plans/seat-view.md
-- → The page is written, not assembled) — `game_data`, `summary_data`, and
-- `shell_data` through common — and `create_game` writes `static_game_data`
-- once (plans/static-game-data.md); the page reads those.
--
-- What is particular to wordle (src/wordle/doc.md has the rest):
--   - The answer is hidden by a column grant: no client can select `target`,
--     and `game_data` carries it only once the game has ended.
--   - A guess that isn't a word, or repeats one, costs nothing: it is an `ok`
--     that names the refusal, and no row is written.
--   - Coop shares one board and one budget. A compete race plays out: each
--     racer plays their own board until they solve, run out, or concede, and
--     the ranking is fewest guesses, then earliest solve. A timeout ranks
--     whoever had solved.
--   - The title is a readout (`_sync_title`): coop's latest guess; compete
--     keeps a placeholder until the race ends, since guesses are private.
--   - What a racer may see of a rival mid-race — not their guesses, not their
--     board — is the hook's rule (src/wordle/hooks/useGame.ts), not a
--     policy's: the blob carries everything, the hook withholds.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema wordle to authenticated;

-- Column-level grant: everything EXCEPT `target`, the secret, and
-- `legal_band`, which only submit_guess reads. The presence of any column
-- grant flips the table from "all columns visible" to "only granted columns,"
-- so we enumerate the safe ones. `game_data` (`_make_json_puzzle`) is the only
-- path a client has to the target, and it carries it only once the game has
-- ended.
grant select
  (game_id, max_guesses)
  on wordle.games to authenticated;
-- Read gating: any club member can read any of the club's games
-- (viewing is club-gated; acting is player-gated in the RPCs).
drop policy if exists games_select on wordle.games;
create policy games_select on wordle.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on wordle.players to authenticated;
-- Club-member-wide read in both modes; nothing on the client reads it.
drop policy if exists players_select on wordle.players;
create policy players_select on wordle.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on wordle.events to authenticated;
-- Guesses: any club member sees every row. Who may see a rival's guesses
-- mid-race is the hook's rule (src/wordle/hooks/useGame.ts), applied to
-- `game_data`; nothing reads this table from the client.
drop policy if exists events_select on wordle.events;
create policy events_select on wordle.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- The view the frontend read before the page blobs, and the definer it read
-- the target through. supabase/sql is re-applied, not diffed, so the drops
-- stay.
drop view if exists wordle.games_state;
drop function if exists wordle._target_for(uuid);

drop function if exists wordle._sync_title(uuid);

-- ============================================================
-- wordle._sync_title — recompute the club-list title from state
-- ============================================================
-- The title is a READOUT, not a fixed name (the scrabble/stackdown pattern):
--
--   won              → the winning guess, i.e. the answer "SLATE"
--   coop, mid-game    → the most recent guess "CRANE"
--   coop, no guesses  → "New game"
--   compete, mid-race → "New compete"
--
-- Compete gets no mid-game readout on purpose: guesses are private until the
-- end-of-game reveal (the hook's seat rule), and the title is club-wide
-- readable, so publishing the latest guess would hand a racing opponent your
-- letters. Compete holds its placeholder for the whole race —
-- and since that's the label a club list actually sits on, it says which kind
-- of game is sitting there (the same choice waffle compete makes).
--
-- Derived rather than assigned, so it's correct after ANY transition —
-- a guess, a timeout, a Stop, a concede that finishes the race, or a
-- replay that rewinds the board (which must un-tell the answer). Every one of
-- those calls this instead of remembering its own formula.
create or replace function wordle._sync_title(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordle, common, public, extensions
as $$
  update common.games cg
     set title = case
           -- The title NEVER spells the answer of its own accord — not on
           -- the game's end, which would spoil every lost game the players may
           -- still replay blind, and not on anybody's reveal, which is a LOCAL
           -- per-player display toggle (docs/ui.md → Terminal results) that a
           -- club-wide title cannot follow: it would tell Moth the word because
           -- Joel looked. A win still titles "SLATE", because the winning guess
           -- IS the answer and the branches below read the most recent guess.
           --
           -- The most recent guess — a readout of what's been DONE,
           -- which is already on the board in front of the players.
           when cg.mode = 'coop' then coalesce(
             (select upper(gx.word::text)
                from wordle.events gx
               where gx.game_id = p_game_id
               order by gx.id desc
               limit 1),
             'New game')
           -- Compete stays deliberately blank WHILE PLAYING: a leader's guess
           -- would leak their progress to the club list. Once the race is over
           -- there's nothing left to protect, so it reads like coop's.
           when cg.ended_at is not null then coalesce(
             (select upper(gx.word::text)
                from wordle.events gx
               where gx.game_id = p_game_id
               order by gx.id desc
               limit 1),
             'New compete')
           else 'New compete'
         end
   where cg.id = p_game_id;
$$;

revoke execute on function wordle._sync_title(uuid) from public;

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- wordle's own, each builder bearing its column's name (the three verbs are
-- supabase/sql/common.sql → The page blobs' common parts). `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- wordle's facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
-- `static_game_data` is what nothing after `create_game` changes, written once
-- by `_write_static_game_data`; the page hands it to `useGame`, which merges
-- each key back into its place in `game_data` (plans/static-game-data.md).
-- wordle's is the common part alone: its puzzle is only the answer, which
-- waits for the game's end.
--
--   game_data, wordle's part:
--     puzzle: {target}                     null until the game ends
--     team: {nGuessesUsed}                  what the team shares, summed over the rows;
--                                          null in compete, where there is no team
--                                          (plans/team-facts.md)
--     events: [{id, userId, word, colors, correct, at}, …]
--                                          every player's; what a racer may see
--                                          of a rival mid-race is the hook's rule
--     players: [player, …]                 the common player, plus:
--       maxGuesses                         the same on every player
--       nGuessesUsed                        this player's own, in every mode
--       tieBrokenByClock                   compete, once ranked: the earlier solve, not the
--                                          count, placed this solver against the winner (the
--                                          winner's too, when another solver matched their
--                                          count); null in coop and until the end
--       board: {rows: [{word, colors}, …]} what this seat's tiles show: one board in
--                                          coop, each racer's own in compete
--
--   summary_data, wordle's part (the common part names and dates the game and
--   carries its ending; the winner is `ending.winner`):
--     team: {nGuessesUsed}                  the same group; null in compete, whose
--                                          summary shows no progress
--     maxGuesses
--     answerBand                           the setup's
--     nWinnerGuesses                   compete's, once the race is won; null in coop
--
-- The statuses (`game_status`, `player_status`, `clubpage_info`) are not
-- written: nothing reads wordle's any more. The columns stay until a
-- migration retires them for every game.

-- The answer, once the game has ended.
create or replace function wordle._make_json_puzzle(wg wordle.games, p_ended boolean)
returns jsonb
language sql
immutable
set search_path = wordle, common, public, extensions
as $$
  select jsonb_build_object(
    'target', case when p_ended then wg.target::text end);
$$;

revoke execute on function wordle._make_json_puzzle(wordle.games, boolean) from public;

-- The log: every accepted guess, in the order of play.
create or replace function wordle._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordle, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',      e.id,
           'userId',  e.user_id,
           'word',    e.word::text,
           'colors',  e.colors::text,
           'correct', e.is_correct,
           'at',      e.created_at) order by e.id), '[]'::jsonb)
    from wordle.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function wordle._make_json_events(uuid) from public;

-- What one seat's tiles show: its guess rows, each word with its colors, in
-- the order of play. In coop every seat shows the team's guesses; in compete,
-- the seat's own.
create or replace function wordle._make_json_board(p_game_id uuid, p_user_id uuid, p_mode text)
returns jsonb
language sql
stable
set search_path = wordle, common, public, extensions
as $$
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
              'word',   e.word::text,
              'colors', e.colors::text) order by e.id), '[]'::jsonb))
    from wordle.events e
   where e.game_id = p_game_id
     and (p_mode = 'coop' or e.user_id = p_user_id);
$$;

revoke execute on function wordle._make_json_board(uuid, uuid, text) from public;

-- What the team shares: the guesses summed over every row. Each row holds its
-- player's own, so the sum counts every guess once. Null in compete, where
-- there is no team (plans/team-facts.md).
create or replace function wordle._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordle, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'nGuessesUsed', (select sum(n_guesses_used) from wordle.players where game_id = p_game_id))
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function wordle._make_json_team(uuid) from public;

-- Every player as wordle's game_data shows them: the common player, with the
-- budget, their own count, the clock's tie-break and this seat's board.
create or replace function wordle._make_json_players(p_game_id uuid)
returns jsonb
language plpgsql
stable
set search_path = wordle, common, public, extensions
as $$
declare
  v_mode text;
  v_max_guesses int;
  -- Compete's winner, once ranked, and their count: `_finish_compete` ranks
  -- solvers by guesses, then the earlier solve, so a solver on the winner's
  -- count was placed against the winner by the clock.
  v_winner_id uuid;
  v_winner_used int;
begin
  select cg.mode, wg.max_guesses
    into v_mode, v_max_guesses
    from wordle.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;

  if v_mode = 'compete' then
    select gp.user_id, wp.n_guesses_used
      into v_winner_id, v_winner_used
      from common.game_players gp
      join wordle.players wp on wp.game_id = gp.game_id and wp.user_id = gp.user_id
     where gp.game_id = p_game_id and gp.final_ranking = 1
     order by gp.solved_at
     limit 1;
  end if;

  return (
    select jsonb_agg(
             cp.player || jsonb_build_object(
               'maxGuesses',       v_max_guesses,
               'nGuessesUsed',      wp.n_guesses_used,
               'tieBrokenByClock',
                 case when v_winner_id is null then null
                      else gp.solved_at is not null
                           and wp.n_guesses_used = v_winner_used
                           and exists (
                             select 1
                               from common.game_players other
                               join wordle.players other_wp
                                 on other_wp.game_id = other.game_id
                                and other_wp.user_id = other.user_id
                              where other.game_id = p_game_id
                                and other.user_id <> gp.user_id
                                and other.solved_at is not null
                                and other_wp.n_guesses_used = v_winner_used)
                 end,
               'board',            wordle._make_json_board(p_game_id, cp.id, v_mode))
             order by cp.ord)
      from common._make_json_players(p_game_id) cp
      join wordle.players wp on wp.game_id = p_game_id and wp.user_id = cp.id
      join common.game_players gp on gp.game_id = p_game_id and gp.user_id = cp.id
  );
end;
$$;

revoke execute on function wordle._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with wordle's puzzle, team, log
-- and players on top.
create or replace function wordle._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordle, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  wordle._make_json_puzzle(wg, cg.ended_at is not null),
           'team',    wordle._make_json_team(p_game_id),
           'events',  wordle._make_json_events(p_game_id),
           'players', wordle._make_json_players(p_game_id))
    from wordle.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;
$$;

revoke execute on function wordle._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function wordle._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = wordle, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',               wordle._make_json_team(p_game_id),
    'maxGuesses',         wg.max_guesses,
    'answerBand',         coalesce((cg.setup->>'answer_band')::int, 0),
    'nWinnerGuesses', case when cg.mode = 'compete' then
                            (select wp.n_guesses_used
                               from common.game_players gp
                               join wordle.players wp
                                 on wp.game_id = gp.game_id and wp.user_id = gp.user_id
                              where gp.game_id = p_game_id and gp.final_ranking = 1
                              order by gp.solved_at
                              limit 1)
                          end)
    from wordle.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;
$$;

revoke execute on function wordle._make_json_summary_data(uuid, timestamptz) from public;

-- The name this had while it wrote the statuses; supabase/sql is re-applied,
-- not diffed.
drop function if exists wordle._write_statuses(uuid, boolean);

-- ============================================================
-- wordle._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from wordle's own tables, assigning
-- each whole. Every RPC calls it after a move, after `_sync_title`, so the
-- blobs carry the title the move left; it is also the repair for one game by
-- hand. Every key is always present, null when it has no value; the shapes
-- are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function wordle._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = wordle._make_json_game_data(p_game_id),
         summary_data = wordle._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function wordle._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- wordle._write_static_game_data — one game's static blob, written
-- ============================================================
-- Writes `static_game_data`, which nothing after create changes, so no move
-- writes it: `create_game` calls this once, and `_rebuild_data_cols_for_all`
-- for a shape change. wordle adds nothing to the common part.
create or replace function wordle._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordle, common, public, extensions
as $$
  update common.games
     set static_game_data = common._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;

revoke execute on function wordle._write_static_game_data(uuid) from public;

-- ============================================================
-- wordle._rebuild_data_cols_for_all — every wordle game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_write_static_game_data` and `_rebuild_data_cols` over every wordle game
-- without re-dating any, and answers how many it rewrote. Run by hand as
-- postgres (`gmake db-psql`); no client calls it, so it has no grant and wears
-- the `_`.
create or replace function wordle._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('wordle_coop', 'wordle_compete')
  loop
    perform wordle._write_static_game_data(v_game_id);
    perform wordle._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function wordle._rebuild_data_cols_for_all() from public;

drop function if exists wordle.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- wordle.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Picks a hidden target per `answer_band` (always clean — see the pick below),
-- seeds one players row per player, and starts the game. `p_mode` ('coop' |
-- 'compete') routes the gametype string and the working-state semantics.
--
-- Setup shape (server validates):
--   { "max_guesses": 5..8 (default 6),
--     "answer_band": 0..6 (0 = curated Wordle answer list; 1..6 =
--       that difficulty band of common.words),
--     "legal_band": 1..6 (the band a typed guess must exist in to
--       count; default 4; must reach the answer's hardest band),
--     "timer": (none | countup | countdown{seconds}),
--     "coop_style": 'free-for-all' | 'turns' (coop only),
--     "first_turn_user_id": a player (with 'turns'; stripped from the
--       club's saved default) }
create or replace function wordle.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text
)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  new_id          uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_max_guesses   int;
  s_answer_band int;
  s_legal_band   int;
  s_answer_max    int;
  v_target        char(5);
  first_turn      uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in src/wordle/manifest.ts.
  perform common._require_player_count_max(p_player_user_ids, 6);

  perform common._require_valid_mode(p_mode);

  if p_mode = 'compete' then
    -- Compete needs an opposing PLAYER. A solo race is just a coop game with
    -- a timer. The club page hides a gametype the roster cannot fill and the
    -- players picker refuses a short one; this guard is the server-side catch.
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN498', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
    end if;
  end if;

  -- ─── Validate setup.max_guesses ──────────────────────────
  s_max_guesses := coalesce((p_setup->>'max_guesses')::int, 6);
  if s_max_guesses < 5 or s_max_guesses > 8 then
    raise exception 'BUG: guess budget of %', s_max_guesses
      using errcode = 'PN053', hint = 'fault', column = '_',
      detail = 'setup.max_guesses must be 5..8';
  end if;

  -- ─── Validate the word bands ─────────────────────────────
  -- answer_band: 0 = the curated Wordle list, 1..6 = a difficulty band.
  -- legal_band: 1..6. A guess must be able to spell any possible answer, so
  -- legal_band must reach the answer's hardest band — 2 for the Wordle list
  -- (0 is not a real band, but every word on the list is at band 2 or
  -- easier), else answer_band. The frontend's `answerMaxBand` (lib/setup.ts)
  -- holds the full explanation.
  s_answer_band := coalesce((p_setup->>'answer_band')::int, 0);
  if s_answer_band < 0 or s_answer_band > 6 then
    raise exception 'BUG: answer band of %', s_answer_band
      using errcode = 'PN054', hint = 'fault', column = '_',
      detail = 'setup.answer_band must be 0..6';
  end if;
  s_legal_band := coalesce((p_setup->>'legal_band')::int, 4);
  if s_legal_band < 1 or s_legal_band > 6 then
    raise exception 'BUG: legal-guess band of %', s_legal_band
      using errcode = 'PN055', hint = 'fault', column = '_',
      detail = 'setup.legal_band must be 1..6';
  end if;
  s_answer_max := case when s_answer_band = 0 then 2 else s_answer_band end;
  if s_legal_band < s_answer_max then
    -- A CROSS-FIELD rule: every answer has to be a legal guess, so the legal
    -- band is raised to meet the answer band rather than the answer band
    -- lowered to meet it. The setup form floors the control at `answerMaxBand`
    -- and the manifest gates Start on the same rule, so no value the form
    -- offers reaches this — a fault, naming no field, like the checks above.
    raise exception 'BUG: legal-guess band below the answer band'
      using errcode = 'PN056', hint = 'fault', column = '_',
      detail = 'legal_band must be >= the answer band';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Pick a random target ────────────────────────────────
  -- BOTH branches use the app-wide CLEAN filter — `slur = 0 AND crude = 0 AND
  -- american AND NOT slang` — because the target is a word every player is
  -- required to arrive at, which is the rule's whole domain (docs/word-list.md →
  -- Which words a game may use). The permissive half of that rule governs
  -- GUESSES, not the answer: submit_guess deliberately filters on difficulty
  -- alone, so you may still type a slur at the board, it just won't be right.
  --
  -- answer_band 0: the curated 5-letter NYT answers. Clean-filtering the
  -- curated list is a deliberate small divergence from the original: it drops
  -- the list's slurs and non-American spellings, which is the point, and also
  -- the words the `slang` tag catches for a slang SENSE (ONION, OWNER, GOOSE),
  -- which is the part of the trade we're accepting rather than the part we want.
  -- 1..6: any clean 5-letter word of that band or easier (a higher band can be
  -- obscure).
  if s_answer_band = 0 then
    select word into v_target
      from common.words
     where wordle and len = 5
       and slur = 0 and crude = 0 and american and not slang
     order by random() limit 1;
  else
    select word into v_target
      from common.words
     where len = 5 and difficulty <= s_answer_band
       and slur = 0 and crude = 0 and american and not slang
     order by random() limit 1;
  end if;
  if v_target is null then
    -- FAULT: can't pick an answer because no clean 5-letter words in PG. The
    -- bands are cumulative (`difficulty <= n`), so no `answer_band` empties
    -- the pool on its own — every source fails together.
    raise exception 'BUG: Too few words on server to pick an answer'
      using errcode = 'PN057', hint = 'fault', column = '_',
      detail = 'common.words has no clean 5-letter answer candidates; run gmake all-words';
  end if;

  new_id := common._create_game(
    -- The starting value of common.games.title (the club card heading); play
    -- rewrites it — see wordle._sync_title, which owns both placeholders.
    -- Compete says 'New compete' because it KEEPS the placeholder for the whole
    -- race (its guesses are private), so the label may as well say which kind
    -- of game is sitting there. The brand is shown from the FE manifest, not
    -- stored.
    -- The saved default strips first_turn_user_id (the turn-order "who goes
    -- first" pick is a per-game choice, not a per-club preference; coop_style
    -- rides).
    p_club_handle, 'wordle_' || p_mode, p_mode, p_player_user_ids,
    case p_mode when 'coop' then 'New game' else 'New compete' end, p_setup,
    p_setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the common
  -- rotation so submit_guess gates each guess. Free-for-all / compete leave the
  -- pointer null (inert). Runs after common._create_game seeds game_players.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN058', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into wordle.games (game_id, target, max_guesses, legal_band)
  values (new_id, v_target, s_max_guesses, s_legal_band);

  insert into wordle.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  perform wordle._write_static_game_data(new_id);
  perform wordle._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. The name is here even
  -- though this is the only `ok` — a call site cannot assert a case the payload
  -- does not carry, and without it the branch would match by being `ok` and draw
  -- a second answer as this one.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- One block, and it has never heard of any specific condition: it reads the
-- SQLSTATE, re-raises anything that isn't ours, and lets the raise itself carry
-- the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function wordle.create_game(text, jsonb, uuid[], text) from public;
grant execute on function wordle.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists wordle._finish_compete(uuid, boolean);

-- ============================================================
-- wordle._finish_compete — end a compete game, whatever ended it
-- ============================================================
-- The ONE place a race's ending is ranked. Two callers pass the act that
-- ended it — _maybe_finish_compete the last racer's (a solve, a spent
-- budget, a concession), submit_timeout the clock — and neither ranks
-- anything itself.
--
-- The ranking (docs/win-lose.md → final-ranking): every player who solved,
-- by fewest guesses, then earliest solve; ties on both share a ranking. A
-- player who didn't solve — out of guesses, conceded, or still going at the
-- timeout — is unranked. Nobody solved is a collective loss.
create or replace function wordle._finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  v_rankings jsonb;
begin
  select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
    into v_rankings
    from (
      select gp.user_id,
             rank() over (order by wp.n_guesses_used, gp.solved_at) as ranking
        from wordle.players wp
        join common.game_players gp
          on gp.game_id = wp.game_id and gp.user_id = wp.user_id
       where wp.game_id = p_game_id and gp.solved_at is not null
    ) ranked;

  perform common._end_game(
    p_game_id, p_reason, p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;

revoke execute on function wordle._finish_compete(uuid, text, text, uuid) from public;

drop function if exists wordle._maybe_finish_compete(uuid);

-- ============================================================
-- wordle._maybe_finish_compete — end the compete game if it's over
-- ============================================================
-- A compete game ends when NO player is still racing — every one has ended,
-- by solving, running out of guesses, or conceding. Shared by submit_guess
-- (a guess can be the last move) and wordle.concede (a drop-out can be — if
-- everyone else already finished, the concede is what empties the racing
-- set). The act passed is the last racer's, and becomes the game's reason
-- (plans/common-tables.md → The game's reason is the act that ended the game).
-- Everyone conceding is `common._concede`'s ending, so this skips a game
-- that has already ended.
--
-- Returns true when it ended the game (submit_guess surfaces this as its
-- `game_ended` flag), false when someone is still racing.
create or replace function wordle._maybe_finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
begin
  if (select ended_at from common.games where id = p_game_id) is not null then
    return false;
  end if;

  if exists (
    select 1 from common.game_players
     where game_id = p_game_id and player_ended_at is null
  ) then
    return false;
  end if;

  perform wordle._finish_compete(p_game_id, p_reason, p_reason_detail, p_ended_by_user_id);
  return true;
end;
$$;

revoke execute on function wordle._maybe_finish_compete(uuid, text, text, uuid) from public;

drop function if exists wordle.submit_guess(uuid, text);

-- ============================================================
-- wordle.submit_guess — the core move
-- ============================================================
-- Submit a 5-letter guess. Soft rejections (an `ok`: no guess consumed,
-- no row written) are the word already guessed on this board
-- ('duplicate') and the word not in the legal slice ('notAWord'). A
-- valid, fresh word is colored, logged, and counts against the budget. Hard
-- rejections (raised): not a player, the game has ended, out of turn in a
-- turn-order coop game, a malformed entry (PN256 — the client refuses a
-- short word before it calls), the caller already solved, or out of
-- guesses.
--
-- The endings it can reach: coop solves (`reached_goal`/'solved', the team
-- ranked 1) or runs out (`resource_exhausted`/'exhausted'); a compete guess
-- that solves or spends the caller's last guess ends that player, and ends
-- the race if nobody is left racing.
--
-- The `for update` lock on the games row serializes concurrent coop
-- guesses against the shared budget.
--
-- The `ok` carries { result, colors, n_guesses_used, solved, game_ended } —
-- `n_guesses_used` being the count against the budget, the team's in coop —
-- `result` ∈ correct | incorrect | notAWord | duplicate — the FACT, and
-- nothing about how it reads. No outcome and no message on any of the
-- four: what each is worth, and the words the two soft rejects show, is
-- decided once in the frontend's lib/answer.ts (docs/outcomes.md → How a
-- game does it), and gameplay_test.sql pins the nulls.
create or replace function wordle.submit_guess(
  p_game_id uuid,
  p_guess   text
)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  caller_id          uuid;
  g_row              wordle.games%rowtype;
  v_mode             text;
  v_ended_at         timestamptz;
  norm               text;
  caller_used        int;
  -- The count against the budget before this guess: the team's in coop, the
  -- caller's own in compete.
  v_used             int;
  caller_solved      boolean;
  is_dup             boolean;
  v_colors           char(5);
  did_solve          boolean;
  new_used           int;
  out_game_ended     boolean := false;
  v_rankings         jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may have deleted the game, and the delete takes
  -- every membership with it, so the membership gate would answer "You are
  -- not in this game" to a player who was (docs/envelopes.md → a missing game
  -- row is PN485).
  select * into g_row from wordle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordle');
  end if;

  caller_id := common._require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    -- A race: a teammate ended it, or the clock ran out, while this guess was
    -- in flight.
    perform common._raise_game_over();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and compete; raises 'not your turn' otherwise. Placed
  -- before the soft-rejects so an out-of-turn guess is rejected outright.
  perform common._require_turn(p_game_id, caller_id);

  -- A conceded player is out of the race — no more guesses. The FE hides the
  -- entry once you concede, so this only fires on a race (a guess in flight
  -- when the concede commits, or a stale second tab). Without it a conceder
  -- could solve and be recorded the winner. Coop never concedes, so it is a
  -- no-op there.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- ─── Malformed entry: a fault ────────────────────────────
  -- Not a soft reject: `doSubmit` refuses a short word before it calls, so a
  -- malformed one arriving means a broken client.
  norm := lower(trim(coalesce(p_guess, '')));
  if norm !~ '^[a-z]{5}$' then
    raise exception 'BUG: guess that was not five letters'
      using errcode = 'PN256', hint = 'fault', column = '_',
      detail = format('guess must match ^[a-z]{5}$; got %L', norm);
  end if;

  -- Each row counts its own player's guesses, in both modes; the budget is
  -- spent by their sum in coop and by the caller's own in compete.
  select n_guesses_used into caller_used
    from wordle.players
   where game_id = p_game_id and user_id = caller_id;
  if v_mode = 'coop' then
    select sum(n_guesses_used) into v_used
      from wordle.players
     where game_id = p_game_id;
  else
    v_used := caller_used;
  end if;
  select solved_at is not null into caller_solved
    from common.game_players
   where game_id = p_game_id and user_id = caller_id;
  if caller_solved then
    -- A fault, in both modes, for the same reason as the budget guard below.
    -- COOP: solving ENDS the game, so a later guess meets the ended check
    -- above and reads "Game over" — this is unreachable there.
    -- COMPETE: it is your own row, and the board stays locked until that row
    -- lands, so getting here means a broken client or a stale second tab.
    raise exception 'Already solved'
      using errcode = 'PN257', hint = 'fault', column = '_',
      detail = 'this player has already found the answer';
  end if;
  if v_used >= g_row.max_guesses then
    -- COMPETE-ONLY in practice, and a fault. Spending the last COOP guess ends
    -- the game, so a coop player who guesses again meets the ended check
    -- above and reads "Game over"; only compete keeps playing with an exhausted
    -- player at the table. There the budget is the caller's own and the board
    -- stays locked until their row lands, so reaching this means a broken
    -- client or a stale second tab.
    raise exception 'No guesses left'
      using errcode = 'PN259', hint = 'fault', column = '_',
      detail = 'this player''s guess budget is spent';
  end if;

  -- ─── Soft reject: duplicate (no burn) ────────────────────
  -- Coop: anyone's earlier guess on the shared board. Compete: the
  -- caller's own earlier guesses.
  if v_mode = 'coop' then
    select exists (
      select 1 from wordle.events gx
       where gx.game_id = p_game_id and gx.word = norm
    ) into is_dup;
  else
    select exists (
      select 1 from wordle.events gx
       where gx.game_id = p_game_id and gx.user_id = caller_id and gx.word = norm
    ) into is_dup;
  end if;
  if is_dup then
    -- `ok`: a game-rule refusal is the rules being applied, and nothing was
    -- burned. `result` names the case; the frontend picks its branch by it and
    -- says the words.
    return common._ok_envelope(
      jsonb_build_object('result', 'duplicate', 'n_guesses_used', v_used,
                         'solved', false, 'game_ended', false));
  end if;

  -- ─── Soft reject: not in the legal word slice (no burn) ──
  -- Legal guess = a real 5-letter word of difficulty ≤ the game's legal_band
  -- band (setup choice). No dialect / slur / slang filter (Wordle is permissive
  -- on guesses — only the difficulty band gates them).
  --
  -- THE ANSWER IS CHECKED FIRST, before the dictionary: the band is read LIVE
  -- from common.words, and the target was banded at game creation — so a word
  -- edit (or an upstream re-band + reimport) can move the answer above
  -- legal_band mid-game. Gate-then-compare would make that an UNWINNABLE
  -- game, typing the actual answer returning notAWord. A solved game must
  -- never hear "not a word", whatever the dictionary says today
  -- (banded_answer_test.sql).
  if norm <> lower(g_row.target) and not exists (
    select 1 from common.words
     where word = norm and len = 5 and difficulty <= g_row.legal_band
  ) then
    return common._ok_envelope(
      jsonb_build_object('result', 'notAWord', 'n_guesses_used', v_used,
                         'solved', false, 'game_ended', false));
  end if;

  -- ─── Accept: color, log, count, resolve ──────────────────
  v_colors  := common._wordle_colors(norm, g_row.target);
  did_solve := (norm = lower(g_row.target));
  new_used  := v_used + 1;

  -- `took_turn` is a literal, not a branch: only an ACCEPTED guess reaches
  -- here (both soft rejects returned above without writing), and an accepted
  -- guess spends a go in either mode — the solving one included.
  insert into wordle.events
    (game_id, user_id, word, colors, is_correct, kind, took_turn)
  values
    (p_game_id, caller_id, norm, v_colors, did_solve, 'guess', true);

  -- The guess counts on the guesser's own row, in both modes; coop's shared
  -- budget is the rows' sum (`new_used`).
  update wordle.players
     set n_guesses_used = n_guesses_used + 1
   where game_id = p_game_id and user_id = caller_id;

  if v_mode = 'coop' then
    if did_solve then
      -- The team solves, so every teammate solved at this guess.
      update common.game_players
         set solved_at = now()
       where game_id = p_game_id;
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
      perform common._end_game(
        p_game_id, 'reached_goal', 'solved', caller_id,
        p_is_no_result => false,
        p_final_rankings => v_rankings
      );
      out_game_ended := true;
    elsif new_used >= g_row.max_guesses then
      perform common._end_game(
        p_game_id, 'resource_exhausted', 'exhausted', caller_id,
        p_is_no_result => false,
        p_final_rankings => '{}'::jsonb
      );
      out_game_ended := true;
    else
      -- Turn-order: an accepted, non-final coop guess hands the turn to the
      -- next player (no-op for free-for-all).
      perform common._advance_turn(p_game_id);
    end if;
  else
    -- Solved, or out of guesses: either way this racer has ended while the
    -- others play their boards out, so the common roster has to hear about it
    -- — a player nothing is waiting for must not hold the presence-pause open.
    if did_solve then
      update common.game_players
         set solved_at = now()
       where game_id = p_game_id and user_id = caller_id;
      -- `neutral`: fewer guesses may yet beat it (`announce-when-ended`).
      perform common._set_player_ended(p_game_id, caller_id, 'reached_goal', 'solved', 'neutral');
      out_game_ended := wordle._maybe_finish_compete(p_game_id, 'reached_goal', 'solved', caller_id);
    elsif new_used >= g_row.max_guesses then
      -- Eliminated: `lost` at once (`loses-by-move-budget`).
      perform common._set_player_ended(p_game_id, caller_id, 'resource_exhausted', 'exhausted', 'lost');
      out_game_ended := wordle._maybe_finish_compete(p_game_id, 'resource_exhausted', 'exhausted', caller_id);
    end if;
  end if;

  -- Club-list title: coop reads the guess just made, and a race that just
  -- ended opens its readout. Runs after the endings so it sees the settled
  -- `ended_at`.
  perform wordle._sync_title(p_game_id);
  perform wordle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- The fact alone. What an accepted guess shows is composed from the colors
  -- and the board, and what it is worth is lib/answer.ts's for the row this
  -- wrote.
  return common._ok_envelope(
    jsonb_build_object(
      'result',       case when did_solve then 'correct' else 'incorrect' end,
      'colors',       v_colors,
      'n_guesses_used', new_used,
      'solved',       did_solve,
      'game_ended',   out_game_ended
    ));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordle.submit_guess(uuid, text) from public;
grant execute on function wordle.submit_guess(uuid, text) to authenticated;

drop function if exists wordle.concede(uuid);

-- ============================================================
-- wordle.concede — a racer drops out of a compete game
-- ============================================================
-- The per-player quit (compete only — coop is a team, so it ends via the
-- shared Stop, never a concede). wordle is an ELIMINATION game (a player
-- can be done without the table ending): `common._concede` records the
-- concession and ends the game if everyone has conceded; otherwise the race
-- ends here if every other racer has already solved or run out, with the
-- concession as the act that ended it. The conceder takes a real loss; the
-- others keep racing.
create or replace function wordle.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Lock this game's wordle.games row FIRST so the concession serializes
  -- against a concurrent submit_guess (which also locks this row before
  -- common.games). Without it the two don't serialize, each reads the other's
  -- uncommitted "still racing" state (READ COMMITTED), both decline to end the
  -- game, and it wedges. Same lock order as the move path (no deadlock).
  perform 1 from wordle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordle');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform wordle._maybe_finish_compete(p_game_id, 'conceded', 'conceded', caller_id);
  -- A concede can be the move that empties the racing set, ending the game —
  -- in which case the race's readout opens (compete's title holds its
  -- placeholder only while the race runs).
  perform wordle._sync_title(p_game_id);

  perform wordle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function wordle.concede(uuid) from public;
grant execute on function wordle.concede(uuid) to authenticated;

drop function if exists wordle.submit_timeout(uuid);

-- ============================================================
-- wordle.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by the FE when a countdown hits 0 (every player races to call it);
-- a second call finds the game ended and answers the game-over race. Coop:
-- not solved → lost, nobody ranked. Compete: the race ends as it stands,
-- ranking whoever had solved (_finish_compete's rule) — a timeout that
-- ranks by goal. Who ended it is the turn-holder in turn-order coop, nobody
-- otherwise.
create or replace function wordle.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_mode        text;
  v_ended_at    timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from wordle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordle');
  end if;

  perform common._require_game_player(p_game_id);

  select mode, ended_at, current_turn_user_id
    into v_mode, v_ended_at, v_turn_holder
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  if v_mode = 'coop' then
    perform common._end_game(
      p_game_id, 'timeout', 'timeout', v_turn_holder,
      p_is_no_result => false,
      p_final_rankings => '{}'::jsonb
    );
  else
    perform wordle._finish_compete(p_game_id, 'timeout', 'timeout', null);
  end if;

  -- The game is over either way — the title re-reads the latest guess, which
  -- compete publishes only now.
  perform wordle._sync_title(p_game_id);

  perform wordle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function wordle.submit_timeout(uuid) from public;
grant execute on function wordle.submit_timeout(uuid) to authenticated;

drop function if exists wordle.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists wordle.end_game(uuid);

-- ============================================================
-- wordle.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode. It is
-- neutral: nobody won, nobody lost (docs/common-schema.md → Stop).
create or replace function wordle.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning move waits for it and then reads the
  -- game as over, rather than overwriting the win (docs/common-schema.md →
  -- Stop, step 1).
  perform 1 from wordle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordle');
  end if;

  perform common._stop(p_game_id);

  -- The game has ended, so a race's readout opens (see _sync_title — the
  -- title never spells an answer nobody guessed).
  perform wordle._sync_title(p_game_id);

  perform wordle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function wordle.stop_game(uuid) from public;
grant execute on function wordle.stop_game(uuid) to authenticated;

drop function if exists wordle.replay_board(uuid);

-- ============================================================
-- wordle.replay_board — restart this game from scratch
-- ============================================================
-- The Restart action: reset the working state on the SAME game row. The
-- frozen puzzle (target / max_guesses / legal_band) stays — the same word,
-- played again; everything the players did is wiped. Any game player may
-- call it, from a finished game OR mid-game (no ended check — it's a
-- restart). Both modes reset ALL players (a group "run it back", per the
-- friends trust model).
--
-- Resets the wordle-specific working state (players zeroed, the guess log
-- cleared), then hands the common-layer reset to common._reset_game (the
-- ending, each player's ending, solve and result). The target re-hides on
-- its own: `game_data` carries it only while common.games.ended_at is set,
-- which reset_game clears before the rebuild.
create or replace function wordle.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  perform 1 from wordle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordle');
  end if;

  -- The row check comes BEFORE the membership gate, and the order is the whole
  -- point: `delete_game` takes this row, `common.games` and every
  -- `game_players` row together, so a caller whose game was just deleted has no
  -- membership left either. Gate-first told them "You are not in this game",
  -- which is both wrong and unhelpful — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update wordle.players
     set n_guesses_used = 0
   where game_id = p_game_id;

  delete from wordle.events where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  -- Back to "New game": the guess log is empty and reset_game cleared the
  -- ending, so the title must stop advertising the answer (the whole point
  -- of a replay is that the word is a secret again).
  perform wordle._sync_title(p_game_id);

  perform wordle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function wordle.replay_board(uuid) from public;
grant execute on function wordle.replay_board(uuid) to authenticated;
