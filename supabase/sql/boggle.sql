-- cs-unmet

-- ============================================================
-- boggle
-- ============================================================
-- What the frontend calls:
--
--   create_game     starts a game on a board the boggle-build-board edge
--                   function rolled
--   submit_word     records a word the frontend has already checked and
--                   scored
--   concede         a racer drops out of a compete game
--   stop_game       stops the game for everyone, with no result
--   submit_timeout  ends the game when the countdown runs out
--   replay_board    restarts the same board from scratch
--
-- What is particular to boggle (docs/games/boggle.md has the rest):
--   - The board and both word lists are built outside SQL, by an edge
--     function, and shipped to the frontend whole: it checks and scores each
--     word itself, and submit_word trusts what it sends (trusting-commit).
--   - Words are required (at the setup's band) or bonus (up to the legal
--     band). Only required points count toward a target.
--   - A game may have a target, a share of the required points. Reaching it
--     wins at once (the team in coop, the crosser in compete). Without one, a
--     compete race is ranked by score when the clock stops, and a coop game
--     is an exercise with no result.
--   - What a racer may see of a rival's finds mid-race is the page's rule,
--     applied to game_data; the tables carry no mode arm.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema boggle to authenticated;

-- All columns are readable by club members (RLS gates the rows). No
-- column-level grant: unlike spellingbee, required_words is intentionally
-- visible — the frontend checks words against it.
grant select on boggle.games to authenticated;

grant select on boggle.found_words to authenticated;

-- Anyone in the club can read the game (board + required list included).
drop policy if exists games_select on boggle.games;
create policy games_select on boggle.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Found words: any club member sees every row. Who may see a rival's finds
-- mid-race is the page's rule, applied to `game_data`; nothing reads this
-- table from the client.
drop policy if exists found_words_select on boggle.found_words;
create policy found_words_select on boggle.found_words
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = found_words.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

drop function if exists boggle._refresh_status(uuid);

drop function if exists boggle._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- boggle's own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- boggle's facts on top; the pieces below build each part, so
-- `select game_data from common.games` shows the page what it gets.
--
--   game_data, boggle's part:
--     puzzle: {tiles, boardSideSize,              frozen at create_game: the board's tiles in
--              minWordLength, words,              row order — a tile is {id, letters}, its id
--              nReqdWords, reqdWordsScore,        its cell's index as text, its letters null
--              nBonusWords, bonusWordsScore}      for a blank — every legal word scored
--                                                 ({word, points, bonus}; a bonus word is
--                                                 legal but not required), and each list's
--                                                 count and score
--     team: {the six counts}                      what the team shares, over every row; null
--                                                 in compete (plans/team-facts.md)
--     foundWords: [{userId, word, points,         every found word, in the order found, with
--                   bonus, at}, …]                its finder; what a racer may see of a rival
--                                                 mid-race is the page's rule
--     players: [player, …]                        the common player, plus their own six counts
--
--   the six counts: nFoundWords and foundWordsScore over every find, and
--   nFoundReqdWords, foundReqdWordsScore, nFoundBonusWords and
--   foundBonusWordsScore split by list. A target counts the required points
--   alone; the strip and a race with no target count them all.
--
--   summary_data, boggle's part (the common part names and dates the game and
--   carries its ending; the winner is `ending.winner`):
--     team                the same group; null in compete
--     targetWinPercent    the share of the required points that wins; null for none
--     topScore            compete's best score among those who did not concede;
--                         null in coop, and until the game ends

-- A stored word list, as the page draws it, in the same order: `{word,
-- points}`, flagged with the list it came from — a bonus word is legal but not
-- required.
create or replace function boggle._make_json_words(p_words jsonb, p_bonus boolean)
returns jsonb
language sql
immutable
set search_path = boggle, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'word',   w.word ->> 'word',
           'points', (w.word ->> 'points')::int,
           'bonus',  p_bonus) order by w.ord), '[]'::jsonb)
    from jsonb_array_elements(p_words) with ordinality as w(word, ord);
$$;

revoke execute on function boggle._make_json_words(jsonb, boolean) from public;

-- The board's tiles in row order (plans/seat-view.md → A tile is an instance
-- the builder writes): a tile is {id, letters}, its id its cell's index as
-- text. The stored board packs a two-letter tile as one digit and a blank as
-- `0` (src/boggle/lib/dice.ts); a tile carries its letters in the data's case,
-- and a blank's are null.
create or replace function boggle._make_json_tiles(g boggle.games)
returns jsonb
language sql
immutable
set search_path = boggle, common, public, extensions
as $$
  select jsonb_agg(jsonb_build_object(
           'id',      (f.ord - 1)::text,
           'letters', case f.face
                        when '0' then null when '1' then 'qu' when '2' then 'in'
                        when '3' then 'th' when '4' then 'er' when '5' then 'he'
                        when '6' then 'an' else lower(f.face)
                      end) order by f.ord)
    from unnest(string_to_array(g.board, null)) with ordinality as f(face, ord);
$$;

revoke execute on function boggle._make_json_tiles(boggle.games) from public;

-- The puzzle, as create_game froze it onto the game's row.
create or replace function boggle._make_json_puzzle(g boggle.games)
returns jsonb
language sql
immutable
set search_path = boggle, common, public, extensions
as $$
  select jsonb_build_object(
    'tiles',           boggle._make_json_tiles(g),
    'boardSideSize',   g.board_side_size,
    'minWordLength',   g.min_word_length,
    'words',           boggle._make_json_words(g.required_words, false)
                       || boggle._make_json_words(g.bonus_words, true),
    'nReqdWords',      g.n_reqd_words,
    'reqdWordsScore',  g.reqd_words_score,
    'nBonusWords',     jsonb_array_length(g.bonus_words),
    'bonusWordsScore', (select coalesce(sum((b ->> 'points')::int), 0)
                          from jsonb_array_elements(g.bonus_words) b));
$$;

revoke execute on function boggle._make_json_puzzle(boggle.games) from public;

-- The six counts over one player's finds, or over everyone's when
-- `p_user_id` is null: every find, then the required and bonus finds apart.
create or replace function boggle._make_json_found_counts(p_game_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
set search_path = boggle, common, public, extensions
as $$
  select jsonb_build_object(
           'nFoundWords',          count(fw.word),
           'foundWordsScore',      coalesce(sum(fw.points), 0),
           'nFoundReqdWords',      count(fw.word) filter (where not fw.is_bonus),
           'foundReqdWordsScore',  coalesce(sum(fw.points) filter (where not fw.is_bonus), 0),
           'nFoundBonusWords',     count(fw.word) filter (where fw.is_bonus),
           'foundBonusWordsScore', coalesce(sum(fw.points) filter (where fw.is_bonus), 0))
    from boggle.found_words fw
   where fw.game_id = p_game_id
     and (p_user_id is null or fw.user_id = p_user_id);
$$;

revoke execute on function boggle._make_json_found_counts(uuid, uuid) from public;

-- What the team shares: the six counts over every row. Null in compete, where
-- there is no team (plans/team-facts.md).
create or replace function boggle._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = boggle, common, public, extensions
as $$
  select case when cg.mode = 'coop' then boggle._make_json_found_counts(p_game_id, null) end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function boggle._make_json_team(uuid) from public;

-- Every found word, in the order found, each with its finder. Every player's
-- rows are here; what a racer may see of a rival mid-race is the page's rule.
create or replace function boggle._make_json_found_words(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = boggle, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'userId', fw.user_id,
           'word',   fw.word,
           'points', fw.points,
           'bonus',  fw.is_bonus,
           'at',     fw.found_at) order by fw.found_at, fw.word), '[]'::jsonb)
    from boggle.found_words fw
   where fw.game_id = p_game_id;
$$;

revoke execute on function boggle._make_json_found_words(uuid) from public;

-- Every player as boggle's game_data shows them: the common player, with the
-- six counts over their own finds.
create or replace function boggle._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = boggle, common, public, extensions
as $$
  select jsonb_agg(cp.player || boggle._make_json_found_counts(p_game_id, cp.id) order by cp.ord)
    from common._make_json_players(p_game_id) cp;
$$;

revoke execute on function boggle._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with boggle's puzzle, team, log
-- and players on top.
create or replace function boggle._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = boggle, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',     boggle._make_json_puzzle(g),
           'team',       boggle._make_json_team(p_game_id),
           'foundWords', boggle._make_json_found_words(p_game_id),
           'players',    boggle._make_json_players(p_game_id))
    from boggle.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function boggle._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one. A
-- conceder's banked score never counts toward the top score.
create or replace function boggle._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = boggle, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
           'team',             boggle._make_json_team(p_game_id),
           'targetWinPercent', g.target_win_percent,
           'topScore',         case when cg.mode = 'compete' and cg.ended_at is not null then (
                                 select coalesce(max(t.score), 0)
                                   from (select fw.user_id, sum(fw.points) as score
                                           from boggle.found_words fw
                                          where fw.game_id = p_game_id
                                          group by fw.user_id) t
                                   join common.game_players gp
                                     on gp.game_id = p_game_id and gp.user_id = t.user_id
                                  where gp.player_ended_reason is distinct from 'conceded') end)
    from boggle.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;

revoke execute on function boggle._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- boggle._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from boggle's own tables, assigning
-- each whole. Every RPC calls it after a move, so the blobs carry what the
-- move left; it is also the repair for one game by hand. Every key is always
-- present, null when it has no value; the shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function boggle._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = boggle._make_json_game_data(p_game_id),
         summary_data = boggle._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function boggle._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- boggle._rebuild_data_cols_for_all — every boggle game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every boggle game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function boggle._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('boggle_coop', 'boggle_compete')
  loop
    perform boggle._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function boggle._rebuild_data_cols_for_all() from public;

drop function if exists boggle.create_game(text, jsonb, uuid[], text, jsonb);

-- ============================================================
-- boggle.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Starts a game on `p_board`, rolled (or typed) by the boggle-build-board
-- edge function: { board, n, required_words, bonus_words,
-- n_reqd_words, reqd_words_score }. Validates the setup and the
-- board's structure, writes the common header, the game row (the setup's
-- band and target copied to their columns) and the page blobs.
create or replace function boggle.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text,
  p_board jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  game_title text;
  s_min_word_length int;
  s_band int;
  s_legal_band int;
  s_ladder text;
  s_win_percent int;
  b_board text;
  b_n int;
  b_required_count int;
  b_required_score int;
  -- A player-typed board (setup.custom_board non-empty) — the board came from
  -- the dialog, not the roll loop. Changes what we demand of it, and keeps it
  -- out of the club's saved default.
  is_custom_board boolean;
begin
  perform common._require_club_member(p_club_handle);

  -- ─── Mode + player-count ─────────────────────────────────
  perform common._require_valid_mode(p_mode);
  if p_mode = 'compete' and coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
    raise exception 'BUG: race with fewer than two players'
      using errcode = 'PN136', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
  end if;
  perform common._require_player_count_max(p_player_user_ids, 8);

  -- ─── Setup validation ────────────────────────────────────
  perform common._require_valid_timer(p_setup->'timer');

  s_min_word_length := coalesce((p_setup->>'min_word_length')::int, 3);
  if s_min_word_length < 3 or s_min_word_length > 9 then
    raise exception 'BUG: minimum word length of %', s_min_word_length
      using errcode = 'PN137', hint = 'fault', column = '_',
      detail = 'setup.min_word_length must be 3..9';
  end if;

  s_band := (p_setup->>'band')::int;
  if s_band is null or s_band < 1 or s_band > 6 then
    raise exception 'BUG: required difficulty of ''%''', p_setup->>'band'
      using errcode = 'PN138', hint = 'fault', column = '_',
      detail = 'setup.band must be 1..6';
  end if;

  -- The legal (bonus) band is the difficulty ceiling for words that aren't on
  -- the required list but still score. It must be at least the required band
  -- (every required word is, by definition, also legal) and at most 6.
  s_legal_band := (p_setup->>'legal_band')::int;
  if s_legal_band is null or s_legal_band < s_band or s_legal_band > 6 then
    raise exception 'BUG: legal-word difficulty of ''%''', p_setup->>'legal_band'
      using errcode = 'PN139', hint = 'fault', column = '_',
      detail = 'setup.legal_band must be between band and 6';
  end if;

  s_ladder := p_setup->>'scoring_ladder';
  if s_ladder is null or s_ladder not in ('flat', 'basic', 'fib', 'big') then
    raise exception 'BUG: scoring ladder of ''%''', s_ladder
      using errcode = 'PN140', hint = 'fault', column = '_',
      detail = 'scoring_ladder must be flat, basic, fib or big';
  end if;

  if coalesce(p_setup->>'dice_set', '') = '' then
    raise exception 'BUG: game with no dice set'
      using errcode = 'PN141', hint = 'fault', column = '_',
      detail = 'setup.dice_set absent';
  end if;

  -- win_percent: NULL/absent = "no target"; otherwise 50..100 in steps of 5.
  -- The score bar a player/team must reach to win (see submit_word).
  s_win_percent := (p_setup->>'win_percent')::int;   -- NULL when absent or JSON null
  if s_win_percent is not null
     and (s_win_percent < 50 or s_win_percent > 100 or s_win_percent % 5 <> 0) then
    raise exception 'BUG: win target of %', s_win_percent
      using errcode = 'PN142', hint = 'fault', column = '_',
      detail = 'win_percent must be 50..100 in steps of 5, or null';
  end if;

  -- ─── Board validation (built by the edge function) ───────
  b_board := p_board->>'board';
  b_n := (p_board->>'n')::int;
  if b_board is null or b_n is null or b_n < 4 or b_n > 6 then
    raise exception 'BUG: generated board was unreadable'
      using errcode = 'PN143', hint = 'fault', column = '_',
      detail = 'board.board / board.n missing or malformed';
  end if;
  if length(b_board) <> b_n * b_n then
    raise exception 'BUG: generated board had % tiles where % were wanted', length(b_board), b_n * b_n
      using errcode = 'PN144', hint = 'fault', column = '_',
      detail = 'board length must be n squared';
  end if;
  if jsonb_typeof(p_board->'required_words') <> 'array' then
    raise exception 'BUG: generated board arrived with no word list'
      using errcode = 'PN145', hint = 'fault', column = '_',
      detail = 'board.required_words must be a jsonb array';
  end if;
  -- bonus_words is optional (empty when legal_band == band); if present it must
  -- be an array of the same { word, points } shape.
  if p_board ? 'bonus_words' and jsonb_typeof(p_board->'bonus_words') <> 'array' then
    raise exception 'BUG: generated board arrived with a malformed bonus list'
      using errcode = 'PN146', hint = 'fault', column = '_',
      detail = 'board.bonus_words must be a jsonb array';
  end if;
  b_required_count := (p_board->>'n_reqd_words')::int;
  b_required_score := (p_board->>'reqd_words_score')::int;

  -- A player-typed board (setup.custom_board non-empty) skipped the roll loop
  -- entirely, so nothing measured it. It must still have SOMETHING to find:
  -- `win_percent` is a share of the required-words score, so a board with none
  -- makes the threshold 0 and the first bonus word wins the game. The edge
  -- function checks this too; rechecked here so a misbehaving builder can't
  -- sneak a degenerate board past. (Rolled boards are governed by their own
  -- constraints, which are the player's to set — including none.)
  is_custom_board := coalesce(p_setup->>'custom_board', '') <> '';
  if is_custom_board and coalesce(b_required_count, 0) < 1 then
    raise exception 'No words for those letters at that difficulty'
      using errcode = 'PN147', hint = 'form-validation', column = 'custom_board',
      detail = 'the typed board produces no words at that band';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  -- Brand ("MothCubes") lives only in the manifest; the stored title is the
  -- board's size and its top row — "4×4 ABQuD" — which both sizes a game and
  -- makes two same-size games tellable apart. The board is shown to every
  -- player, so nothing is leaked.
  --
  -- The stored board packs a multiface die as a single digit (1=Qu 2=In 3=Th
  -- 4=Er 5=He 6=An, 0=blank — see src/boggle/lib/dice.ts), so the title
  -- expands them to the faces a player actually sees on the tile.
  select b_n || '×' || b_n || ' ' || string_agg(
           case substr(b_board, i, 1)
             when '0' then '?'  when '1' then 'Qu' when '2' then 'In'
             when '3' then 'Th' when '4' then 'Er' when '5' then 'He'
             when '6' then 'An' else upper(substr(b_board, i, 1))
           end, '' order by i)
    into game_title
    from generate_series(1, b_n) i;

  -- ─── common.games header (saves setup as the club default) ─
  -- The saved default: the whole setup, MINUS the one-off custom board. A
  -- hand-typed board is a "here, try these letters" for one game, not the club's
  -- new baseline, so the next dialog opens with the field blank and rolls again
  -- (freebee + word wheel strip their custom letters the same way).
  new_id := common._create_game(
    p_club_handle, 'boggle_' || p_mode, p_mode, p_player_user_ids, game_title, p_setup,
    p_setup - 'custom_board'
  );

  insert into boggle.games (
    game_id, board, board_side_size, min_word_length, required_band, legal_band,
    required_words, bonus_words, n_reqd_words, reqd_words_score,
    target_win_percent
  )
  values (
    new_id, b_board, b_n, s_min_word_length, s_band, s_legal_band,
    p_board->'required_words', coalesce(p_board->'bonus_words', '[]'::jsonb),
    b_required_count, b_required_score, s_win_percent
  );

  perform boggle._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. REQUIRED, not
  -- decorative: it is the only thing a call site can filter the `ok` on, and
  -- without it the branch would match by merely being `ok` and would draw a
  -- second answer as this one. It travels through `boggle-build-board`
  -- untouched — `invokeCreateGame` forwards this envelope verbatim — so naming
  -- it here reaches both call sites.
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

revoke execute on function boggle.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function boggle.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

drop function if exists boggle._finish(uuid, text, uuid);

-- ============================================================
-- boggle._finish — end the game on a target or the clock
-- ============================================================
-- The two endings boggle decides for itself (a Stop is common._stop's, and
-- everyone conceding is common._concede's). `p_reason_detail` is 'target'
-- (a target was reached, by `p_ended_by_user_id`) or 'timeout'. Rankings
-- (docs/win-lose.md):
--
--   target, coop      the team, every player ranked 1
--   target, compete   the crosser alone ranked 1: the race ends when decided,
--                     so the rest are short of the goal
--   timeout, a target set    nobody reached the bar, however high the
--                            scores: nobody ranked, everyone lost
--   timeout, no target, compete   a score race: every player who didn't
--                                 concede and scored is ranked by score,
--                                 ties sharing; nobody scored → nobody ranked
--   timeout, no target, coop      an exercise with no result: neutral
--
-- A target reached is a solve, stamped on `common.game_players.solved_at`:
-- every teammate in coop, the crosser alone in compete.
create or replace function boggle._finish(
  p_game_id uuid,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_mode text;
  v_target int;
  v_rankings jsonb := '{}'::jsonb;
  v_no_result boolean := false;
begin
  select cg.mode, bg.target_win_percent into v_mode, v_target
    from boggle.games bg join common.games cg on cg.id = bg.game_id
   where bg.game_id = p_game_id;

  if p_reason_detail = 'target' then
    if v_mode = 'coop' then
      update common.game_players set solved_at = now() where game_id = p_game_id;
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    else
      update common.game_players set solved_at = now()
       where game_id = p_game_id and user_id = p_ended_by_user_id;
      v_rankings := jsonb_build_object(p_ended_by_user_id::text, 1);
    end if;
  elsif v_target is null then
    if v_mode = 'coop' then
      v_no_result := true;
    else
      select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
        into v_rankings
        from (
          select t.user_id, rank() over (order by t.sc desc) as ranking
            from (
              select fw.user_id, sum(fw.points) as sc
                from boggle.found_words fw
               where fw.game_id = p_game_id
               group by fw.user_id
            ) t
            join common.game_players gp
              on gp.game_id = p_game_id and gp.user_id = t.user_id
           where gp.player_ended_reason is distinct from 'conceded'
             and t.sc > 0
        ) ranked;
    end if;
  end if;

  perform common._end_game(
    p_game_id,
    case when p_reason_detail = 'target' then 'reached_goal' else 'timeout' end,
    p_reason_detail, p_ended_by_user_id,
    p_is_no_result => v_no_result,
    p_final_rankings => v_rankings
  );
end;
$$;

revoke execute on function boggle._finish(uuid, text, uuid) from public;

drop function if exists boggle.submit_word(uuid, text, int, boolean);

-- ============================================================
-- boggle.submit_word — record a word (trusting-commit)
-- ============================================================
-- The FE validated the word against the board's shipped legal list (required ∪
-- bonus) and scored it, so this trusts `p_word` + `p_points` + `p_is_bonus`
-- and only does the things the FE can't: enforce the game is live, dedup,
-- record, and end the game on a target. No word-content or dictionary check.
--
-- Two ok answers, each carrying the points the row was written with:
--   { result: 'accepted', points } | { result: 'bonus', points }
-- Neither a duplicate nor a submit into an ended game is among them: neither
-- records the word, so both REFUSE (PN359, and the shared game-over race)
-- rather than answering.
create or replace function boggle.submit_word(
  p_game_id uuid,
  p_word text,
  p_points int,
  p_is_bonus boolean
)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  caller_id uuid;
  v_mode text;
  v_ended_at timestamptz;
  w_lower text;
  dup_count int;
  g_win_percent int;
  g_req_score int;
  threshold int;
  total_score int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so two finds, a find and a concession, or a find
  -- and the clock serialize. A friend deleted the game while this call was in
  -- flight: the shared race, asked before the membership gate, which the
  -- delete took with it.
  select target_win_percent, reqd_words_score into g_win_percent, g_req_score
    from boggle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('boggle');
  end if;

  caller_id := common._require_game_player(p_game_id);

  select mode, ended_at into v_mode, v_ended_at from common.games where id = p_game_id;
  -- A RACE, refused rather than answered ok: the word is NOT recorded here, so
  -- an ok answer would leave useWordSubmit's optimistic `+N` pill standing over
  -- a word that never landed.
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — no more words. The FE hides the
  -- board from a conceder, so this only fires on a race (a submit in flight
  -- when the concession commits, or a stale second tab). A refusal, like the
  -- one above, is what releases the optimistically-accepted word.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  w_lower := lower(coalesce(p_word, ''));

  -- Dedup, mode-aware: coop = whole team, compete = this player.
  if v_mode = 'coop' then
    select count(*) into dup_count from boggle.found_words fw
      where fw.game_id = p_game_id and fw.word = w_lower;
  else
    select count(*) into dup_count from boggle.found_words fw
      where fw.game_id = p_game_id and fw.user_id = caller_id and fw.word = w_lower;
  end if;
  if dup_count > 0 then
    -- A RACE, not an answer: `useFoundWordSubmit` dedups locally and returns
    -- BEFORE committing, so reaching this means its `foundWords` was stale — a
    -- teammate found the word between the render and the submit (coop), or the
    -- caller's own row had not landed yet (compete, a second tab). Nothing was
    -- recorded, so this REFUSES; it is not a verdict on a move.
    -- The MESSAGE is the whole line, `WORD — already found`, matching the
    -- frontend's `already_found` answer exactly (src/boggle/lib/answer.ts,
    -- bonus dot included). This rejection is
    -- the only one that can arrive by BOTH routes — caught locally, or lost as
    -- a race — and the two must not read differently, so the server composes
    -- the same string rather than a sentence of its own. The phrase is
    -- deliberately written twice (Joel, 2026-09-01): it is not going to change,
    -- and machinery to share it would cost more than it saves.
    raise exception '% — already found', upper(w_lower) || case when coalesce(p_is_bonus, false) then ' •' else '' end
      using errcode = 'PN359', hint = 'race', column = '_',
      detail = 'the word is already in found_words under this mode''s dedup rule';
  end if;

  insert into boggle.found_words (game_id, user_id, word, points, is_bonus)
    values (p_game_id, caller_id, w_lower, coalesce(p_points, 0), coalesce(p_is_bonus, false));

  -- Win-on-target: if this game has a score bar and the caller (compete) or the
  -- team (coop) has now reached it, END the game with a win. The threshold is
  -- win_percent% of the required-words score, measured against the score of the
  -- REQUIRED words found ONLY — bonus points do NOT count (so 100% means every
  -- required word, and 50% means required finds worth half the required total).
  -- In compete this is a RACE — the player who just crossed wins immediately;
  -- the ended check above makes a near-simultaneous second crosser the
  -- game-over race.
  if g_win_percent is not null then
    threshold := ceil(g_win_percent::numeric / 100 * g_req_score)::int;
    select coalesce(sum(fw.points), 0) into total_score
      from boggle.found_words fw
     where fw.game_id = p_game_id and not fw.is_bonus
       and (v_mode = 'coop' or fw.user_id = caller_id);
    if total_score >= threshold then
      perform boggle._finish(p_game_id, 'target', caller_id);
    end if;
  end if;

  perform boggle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object(
    'result', case when coalesce(p_is_bonus, false) then 'bonus' else 'accepted' end,
    'points', coalesce(p_points, 0)));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function boggle.submit_word(uuid, text, int, boolean) from public;
grant execute on function boggle.submit_word(uuid, text, int, boolean) to authenticated;

drop function if exists boggle.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists boggle.end_game(uuid);

-- ============================================================
-- boggle.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode. It is
-- neutral: nobody won, nobody lost (docs/common-schema.md → Stop).
create or replace function boggle.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either.
  perform 1 from boggle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('boggle');
  end if;

  perform common._stop(p_game_id);

  perform boggle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function boggle.stop_game(uuid) from public;
grant execute on function boggle.stop_game(uuid) to authenticated;

drop function if exists boggle.replay_board(uuid);

-- ============================================================
-- boggle.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item / terminal Restart. Restarts the SAME
-- board — same faces + word lists — for everyone: the found-words log (the
-- game's only working state) is cleared, and common._reset_game clears the
-- ending, each player's ending and result, and zeroes the shared clock. Any
-- game player may call it, mid-game or after the game ends (no ended check
-- — it's a restart).
create or replace function boggle.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  perform 1 from boggle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('boggle');
  end if;

  -- The row check comes BEFORE the membership gate, and the order is the whole
  -- point: `delete_game` takes this row, `common.games` and every
  -- `game_players` row together, so a caller whose game was just deleted has no
  -- membership left either. Gate-first told them "You are not in this game",
  -- which is both wrong and unhelpful — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  delete from boggle.found_words where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform boggle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function boggle.replay_board(uuid) from public;
grant execute on function boggle.replay_board(uuid) to authenticated;

drop function if exists boggle.concede(uuid);

-- ============================================================
-- boggle.concede — a racer drops out of a compete game
-- ============================================================
-- boggle compete is a timed hunt with no way for a player to end but
-- conceding, so `common._concede` decides it all: it records the concession
-- and, if that was the last racer, ends the game as a collective loss.
-- Compete only (coop ends via the shared Stop).
create or replace function boggle.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from boggle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('boggle');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform boggle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function boggle.concede(uuid) from public;
grant execute on function boggle.concede(uuid) to authenticated;

drop function if exists boggle.submit_timeout(uuid);

-- ============================================================
-- boggle.submit_timeout — countdown expiry
-- ============================================================
-- Fired by every connected client when a countdown hits 0; the first ends
-- the game (`_finish`'s timeout rankings), the rest find it ended and answer
-- the game-over race. boggle has no turn order, so nobody is recorded as
-- ending it.
create or replace function boggle.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Row check before the gate — see stop_game above.
  perform 1 from boggle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('boggle');
  end if;

  perform common._require_game_player(p_game_id);
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform boggle._finish(p_game_id, 'timeout', null);

  perform boggle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function boggle.submit_timeout(uuid) from public;
grant execute on function boggle.submit_timeout(uuid) to authenticated;
