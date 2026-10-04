-- cs-blessed-spellingbee

-- ============================================================
-- spellingbee
-- ============================================================
-- What the frontend calls:
--
--   create_game      starts a game on a board the spellingbee-build-board
--                    edge function built
--   submit_word      records a word the page has already judged and scored
--   concede          a racer drops out of a compete game
--   stop_game        stops the game for everyone, with no result
--   submit_timeout   ends the game when the countdown runs out
--   replay_board     restarts the same board from scratch
--
-- What the spellingbee-build-board edge function calls:
--
--   candidate_words  every legal word a board's letters spell
--
-- What is particular to spellingbee (src/spellingbee/doc.md has the rest):
--   - Both word lists ship to the page, which judges and scores every word
--     itself; submit_word trusts what it sends (trusting-commit).
--   - Words are required (at `required_band`, clean and American) or bonus
--     (up to `legal_band`); both score, and the rank ladder
--     (common._rank_idx) is measured against the required points.
--   - Reaching `target_rank` wins at once: the team in coop, the first racer
--     in compete. A coop game without a target is an open hunt that only the
--     clock or a Stop ends, with no result.
--   - What a racer may see of a rival's finds mid-race is the page's rule
--     (the hook), applied to game_data; the tables carry no mode arm.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema spellingbee to authenticated;

-- The pangram import (supabase/scripts/import-spellingbee-pangrams.ts)
-- connects as the superuser (bypasses grants), so service_role only
-- needs schema USAGE for any incidental PostgREST access.
grant usage on schema spellingbee to service_role;

-- spellingbee.pangrams: public reference data. The edge function samples
-- seeds as the caller (authenticated SELECT).
grant select on spellingbee.pangrams to authenticated;

-- RLS is enabled on this table (20260813000000_rls_seed_tables.sql) so it can't
-- fail open, but the content is not secret and every authenticated player needs
-- all of it — so the policy is permissive. The GRANT above is the real gate;
-- this states the row-level answer instead of leaving it to RLS being off.
drop policy if exists pangrams_select on spellingbee.pangrams;
create policy pangrams_select on spellingbee.pangrams
  for select to authenticated
  using (true);

-- Column-level grant. Nothing is hidden (the FE judges every word against
-- the lists), so all columns are readable — but the column list stays
-- explicit per docs/code-conventions.md → "Avoid SELECT *".
grant select
  (game_id, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words,
   target_rank, required_band, legal_band)
  on spellingbee.games to authenticated;

grant select on spellingbee.found_words to authenticated;

-- Membership-gated read on games. Coop + compete behave identically here:
-- anyone in the club can see the game's header (letters, totals, lists).
drop policy if exists games_select on spellingbee.games;
create policy games_select on spellingbee.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Found words: any club member sees every row. Who may see a rival's finds
-- mid-race is the hook's rule (src/spellingbee/hooks/useGame.ts), applied to
-- `game_data`; nothing reads this table from the client.
drop policy if exists found_words_select on spellingbee.found_words;
create policy found_words_select on spellingbee.found_words
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = found_words.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the
-- security-definer RPCs below.

-- The view the frontend read before the page blobs. supabase/sql is
-- re-applied, not diffed, so the drop stays.
drop view if exists spellingbee.games_state;


drop function if exists spellingbee._rank_idx(int, int);
drop function if exists spellingbee._leaderboard(uuid, int);

-- ============================================================
-- spellingbee.candidate_words — edge-function board-build helper
-- ============================================================
--
-- Reason this exists: the edge function's "given a puzzle,
-- return every legal word that fits" query was being silently
-- truncated by PostgREST's `max_rows = 1000` cap when run against
-- the table directly. The fix: push the bitmask intersection into
-- Postgres via this small SQL function. It does the filter
-- server-side and returns only the candidate rows (typically a few
-- hundred, well under max_rows); the edge function reads back
-- through supabase.rpc(...) in one round-trip.
--
-- This is also where spellingbee's slice of the shared common.words
-- list is defined, on the 1..6 recognizability bands. Both bands are now a
-- per-game setup choice (`required_band` 1..6, `legal_band` required..6), threaded in by
-- the edge function:
--   - legal      difficulty <= p_legal_band  (returned at all = enterable). No
--                dialect / slang / crude / slur restriction — anything up
--                to the legal band counts if you play it.
--   - required   difficulty <= p_required_band AND american AND NOT slang AND
--                clean (slur = 0 AND crude = 0) — the is_required flag; counts
--                toward the displayed goal + rank denominator. Crude/slur
--                words are legal but never required. Words that are legal
--                but not required (above the required band, or band <=required
--                that's non-american / slang / crude / a slur) come back as
--                BONUS (is_required false): legal − required. Bonus words
--                still SCORE (length + pangram bonus); they just don't
--                count toward the required goal.
--   - length     len >= 4  (the Spelling-Bee minimum)
--
-- `s`-words need no explicit filter: a board never contains 's', so
-- the 's' bit is never in p_puzzle_mask and any 's'-word fails the
-- subset test below for free.
--
-- `p_puzzle_mask` is the board's seven letters and `p_center_bit` its center,
-- as common.words.letter_mask bits. The function is `security invoker` +
-- `stable`:
--   - invoker so it runs with the caller's access to common.words
--     (public reference data: a SELECT grant, and RLS on with a permissive
--     policy) — no privilege escalation.
--   - stable so a single SELECT can call it once per row of its
--     enclosing query without repeated re-execution.

drop function if exists spellingbee.candidate_words(bigint, bigint, int, int);
create or replace function spellingbee.candidate_words(
  p_puzzle_mask bigint,
  p_center_bit bigint,
  p_required_band int,
  p_legal_band int
)
returns table(word text, letter_mask bigint, is_required boolean)
language sql
stable
security invoker
set search_path = spellingbee, common, public, extensions
as $$
  select w.word,
         w.letter_mask,
         (w.difficulty <= p_required_band and w.american and not w.slang
            and w.slur = 0 and w.crude = 0)
           as is_required
    from common.words w
   where w.len >= 4
     and w.difficulty <= p_legal_band
     -- Subset of puzzle: every letter bit of the word must be
     -- present in the puzzle's bitmask (reads the generated
     -- common.words.letter_mask). Not sargable, so this is a
     -- seq-scan-with-filter — fine at a few calls per board build.
     and (w.letter_mask & ~p_puzzle_mask) = 0
     -- Must contain the center letter — the spellingbee rule.
     and (w.letter_mask & p_center_bit) <> 0;
$$;

revoke execute on function spellingbee.candidate_words(bigint, bigint, int, int) from public;
grant execute on function spellingbee.candidate_words(bigint, bigint, int, int) to authenticated;

-- The name this had while it wrote the statuses; supabase/sql is re-applied,
-- not diffed.
drop function if exists spellingbee._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- spellingbee's own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- spellingbee's facts on top; the pieces below build each part, so
-- `select game_data from common.games` shows the page what it gets. wordwheel's
-- builders are these, line for line: the two bee games share one blob shape
-- (src/shared/bee-games/doc.md).
--
--   game_data, spellingbee's part:
--     puzzle: {tiles, centerLetter, outerLetters,  frozen at create_game: the board's tiles,
--              words, nReqdWords, reqdWordsScore,  the center first — a tile is {id, letter,
--              sameBandsAndHaveNoBonus}            center}, its id its place as text — the
--                                                  letters as the row stores them, every legal
--                                                  word scored ({word, points, pangram,
--                                                  bonus}; a bonus word is legal but not
--                                                  required), the required set's count and
--                                                  score, and sameBandsAndHaveNoBonus: the two bands
--                                                  are equal, so the bonus words are only what
--                                                  the cleanliness filter removed and are never
--                                                  revealed
--     team: {nFoundWords, foundWordsScore,        what the team shares, over every row, and the
--            rankIdx, targetRankIdx}              rank it set out for; null in compete
--                                                 (plans/team-facts.md)
--     foundWords: [{userId, word, points,         every found word, in the order found, with
--                   pangram, bonus, at}, …]       its finder; what a racer may see of a rival
--                                                 mid-race is the hook's rule
--     players: [player, …]                        the common player, plus:
--       nFoundWords                               this player's own finds, bonus included
--       foundWordsScore                           their points, bonus included
--       rankIdx                                   their rank on the ladder (common._rank_idx)
--       targetRankIdx                             the rank that wins; the same on every player
--
--   summary_data, spellingbee's part (the common part names and dates the
--   game and carries its ending; the winner is `ending.winner`):
--     team: {nFoundWords, foundWordsScore, rankIdx, targetRankIdx}   the same group; null in compete
--     nReqdWords, reqdWordsScore, targetRankIdx

-- A word as the page draws it: the stored `{word, points, is_pangram}`, camel,
-- flagged with the band it came from — a bonus word is legal but not required.
create or replace function spellingbee._make_json_word(p_word jsonb, p_bonus boolean)
returns jsonb
language sql
immutable
set search_path = spellingbee, common, public, extensions
as $$
  select jsonb_build_object(
    'word',    p_word ->> 'word',
    'points',  (p_word ->> 'points')::int,
    'pangram', coalesce((p_word ->> 'is_pangram')::boolean, false),
    'bonus',   p_bonus);
$$;

revoke execute on function spellingbee._make_json_word(jsonb, boolean) from public;

-- A stored word list, as the page draws it, in the same order, every word
-- flagged the same way.
create or replace function spellingbee._make_json_words(p_words jsonb, p_bonus boolean)
returns jsonb
language sql
immutable
set search_path = spellingbee, common, public, extensions
as $$
  select coalesce(jsonb_agg(spellingbee._make_json_word(w.word, p_bonus) order by w.ord), '[]'::jsonb)
    from jsonb_array_elements(p_words) with ordinality as w(word, ord);
$$;

revoke execute on function spellingbee._make_json_words(jsonb, boolean) from public;

-- The board's tiles, the center first (plans/seat-view.md → A tile is an
-- instance the builder writes): a tile is {id, letter, center}, and its id is
-- its place as text, since a letter may repeat on a wheel.
create or replace function spellingbee._make_json_tiles(g spellingbee.games)
returns jsonb
language sql
immutable
set search_path = spellingbee, common, public, extensions
as $$
  select jsonb_build_array(jsonb_build_object('id', '0', 'letter', g.center_letter::text, 'center', true))
         || coalesce((select jsonb_agg(jsonb_build_object('id', l.ord::text, 'letter', l.letter, 'center', false)
                                       order by l.ord)
                        from unnest(string_to_array(g.outer_letters::text, null)) with ordinality as l(letter, ord)),
                     '[]'::jsonb);
$$;

revoke execute on function spellingbee._make_json_tiles(spellingbee.games) from public;

-- The puzzle, as create_game froze it onto the game's row.
create or replace function spellingbee._make_json_puzzle(g spellingbee.games)
returns jsonb
language sql
immutable
set search_path = spellingbee, common, public, extensions
as $$
  select jsonb_build_object(
    'tiles',          spellingbee._make_json_tiles(g),
    'centerLetter',   g.center_letter::text,
    'outerLetters',   g.outer_letters::text,
    'words',          spellingbee._make_json_words(g.required_words, false)
                      || spellingbee._make_json_words(g.bonus_words, true),
    'nReqdWords',     g.required_words_count,
    'reqdWordsScore', g.required_words_score,
    'sameBandsAndHaveNoBonus', g.legal_band = g.required_band);
$$;

revoke execute on function spellingbee._make_json_puzzle(spellingbee.games) from public;

-- What the team shares: every row's count and points, the rank that score
-- reaches on the ladder, and the rank the team set out for (null for coop's
-- open hunt). Null in compete, where there is no team (plans/team-facts.md).
create or replace function spellingbee._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = spellingbee, common, public, extensions
as $$
  select case when cg.mode = 'coop' then (
           select jsonb_build_object(
             'nFoundWords',     count(fw.word),
             'foundWordsScore', coalesce(sum(fw.points), 0),
             'rankIdx',         common._rank_idx(coalesce(sum(fw.points), 0)::int, g.required_words_score),
             'targetRankIdx',   g.target_rank)
             from spellingbee.games g
             left join spellingbee.found_words fw on fw.game_id = g.game_id
            where g.game_id = p_game_id
            group by g.required_words_score, g.target_rank)
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function spellingbee._make_json_team(uuid) from public;

-- Every found word, in the order found, each with its finder. Every player's
-- rows are here; what a racer may see of a rival mid-race is the hook's rule.
create or replace function spellingbee._make_json_found_words(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = spellingbee, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'userId',    fw.user_id,
           'word',      fw.word,
           'points',    fw.points,
           'pangram',   fw.is_pangram,
           'bonus',     fw.is_bonus,
           'at',        fw.found_at) order by fw.found_at, fw.word), '[]'::jsonb)
    from spellingbee.found_words fw
   where fw.game_id = p_game_id;
$$;

revoke execute on function spellingbee._make_json_found_words(uuid) from public;

-- Every player as spellingbee's game_data shows them: the common player, with
-- their own finds, points and rank, and the rank that wins — the game's one
-- target, the same on every player.
create or replace function spellingbee._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = spellingbee, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'nFoundWords',     t.n_found,
             'foundWordsScore', t.score,
             'rankIdx',         common._rank_idx(t.score, g.required_words_score),
             'targetRankIdx',   g.target_rank)
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join spellingbee.games g on g.game_id = p_game_id
    cross join lateral (
      select count(fw.word)::int as n_found, coalesce(sum(fw.points), 0)::int as score
        from spellingbee.found_words fw
       where fw.game_id = p_game_id and fw.user_id = cp.id) t;
$$;

revoke execute on function spellingbee._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with spellingbee's puzzle, team,
-- log and players on top.
create or replace function spellingbee._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = spellingbee, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',     spellingbee._make_json_puzzle(g),
           'team',       spellingbee._make_json_team(p_game_id),
           'foundWords', spellingbee._make_json_found_words(p_game_id),
           'players',    spellingbee._make_json_players(p_game_id))
    from spellingbee.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function spellingbee._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function spellingbee._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = spellingbee, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
           'team',           spellingbee._make_json_team(p_game_id),
           'nReqdWords',     g.required_words_count,
           'reqdWordsScore', g.required_words_score,
           'targetRankIdx',  g.target_rank)
    from spellingbee.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function spellingbee._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- spellingbee._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from spellingbee's own tables,
-- assigning each whole. Every RPC calls it after a move, so the blobs carry what the move left; it is also the repair
-- for one game by hand. Every key is always present, null when it has no
-- value; the shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function spellingbee._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = spellingbee._make_json_game_data(p_game_id),
         summary_data = spellingbee._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function spellingbee._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- spellingbee._rebuild_data_cols_for_all — every spellingbee game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every spellingbee game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function spellingbee._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('spellingbee_coop', 'spellingbee_compete')
  loop
    perform spellingbee._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function spellingbee._rebuild_data_cols_for_all() from public;

drop function if exists spellingbee.create_game(text, jsonb, uuid[], text, jsonb);

-- ============================================================
-- spellingbee.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Setup shape (server validates):
--   {
--     "target_rank": 0..6 | null,           -- compete: required (the race's
--                                           --   finish line). coop: OPTIONAL —
--                                           --   reach it together and you WIN;
--                                           --   null/absent = open-ended hunt.
--     "required_band": 1..6 (default 3), "legal_band": required..6 (default 5),
--     "custom_letters", "custom_center": a player-picked board (optional),
--     "timer": (none | countup | countdown{seconds})
--   }
-- `target_rank` and the two bands are copied to their columns.
--
-- Board shape (built by the spellingbee-build-board edge function):
--   {
--     "outer_letters": "abcdef",            -- 6 distinct lowercase
--     "center_letter": "g",                 -- 1 lowercase
--     "required_words_score":   int,
--     "required_words_count":   int,
--     "required_words": [ { "word": text, "points": int, "is_pangram": bool }, … ],
--     "bonus_words":   [ { "word", "points", "is_pangram" }, … ]  -- legal − required
--   }
--
-- The board's word lists are taken at face value: they were computed by the
-- edge function from common.words (via candidate_words, read under the
-- caller's JWT). This checks structure, not content — and the ≥ 30
-- required-word quality gate the edge function also applies, so a
-- misbehaving builder can't sneak a degenerate puzzle past; a custom board
-- (the player picked the letters) relaxes it to ≥ 1.
--
-- Title: "<CENTER>·<OUTER-SORTED>", e.g. "E·ABCDNO" — identifies a board at a
-- glance in the club's history list.
create or replace function spellingbee.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text,
  p_board jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_target_rank int;
  s_required int;
  s_legal int;
  b_outer text;
  b_center text;
  b_required_words_score int;
  b_required_words_count int;
  game_title text;
  -- A player-specified letter set (setup.custom_letters non-empty) — the board
  -- was built from the player's own letters, not a random seed. Relaxes the
  -- ≥30 gate.
  is_custom_board boolean;
begin
  perform common._require_club_member(p_club_handle);

  -- ─── Validate mode + player-count ────────────────────────
  perform common._require_valid_mode(p_mode);

  if p_mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this is the
    -- server-side catch.
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN156', hint = 'fault', column = '_',
        detail = 'compete needs >= 2 players';
    end if;
  end if;

  perform common._require_player_count_max(p_player_user_ids, 6);

  -- ─── Validate setup.target_rank (BOTH modes) ─────────────
  -- compete: REQUIRED — it's the finish line of the race.
  -- coop:    OPTIONAL — present means "reach this rank together and you WIN"
  --          (the game ends the moment the TEAM rank reaches it); absent/null
  --          means the open-ended word hunt that only ends on the clock or the
  --          Stop button. Absent and explicit null are the same thing, so a FE
  --          that always sends the key can send null for "none".
  if p_mode = 'compete' and (p_setup->>'target_rank') is null then
    raise exception 'BUG: race with no target rank'
      using errcode = 'PN157', hint = 'fault', column = '_',
      detail = 'compete needs a target_rank';
  end if;
  if (p_setup->>'target_rank') is not null then
    begin
      s_target_rank := (p_setup->>'target_rank')::int;
    exception when invalid_text_representation then
      raise exception 'BUG: target rank that is not a number'
        using errcode = 'PN158', hint = 'fault', column = '_',
        detail = 'setup.target_rank must be an integer';
    end;
    if s_target_rank < 0 or s_target_rank > 6 then
      raise exception 'BUG: target rank of %', s_target_rank
        using errcode = 'PN159', hint = 'fault', column = '_',
        detail = 'setup.target_rank must be 0..6';
    end if;
  end if;

  -- ─── Validate the word bands ─────────────────────────────
  -- required_band: the band the displayed/required goal words are drawn from
  -- (1..6; band 1 is the floor the board pool was selected at). legal_band: how
  -- obscure an accepted word may be (required_band..6, so the legal set always
  -- contains the required set). Both optional — default to the classic 3 / 5.
  -- The edge function builds the board's word lists from these; create_game is
  -- the authority on the shape.
  begin
    s_required := coalesce((p_setup->>'required_band')::int, 3);
  exception when invalid_text_representation then
    raise exception 'BUG: required difficulty that is not a number'
      using errcode = 'PN499', hint = 'fault', column = '_',
      detail = 'setup.required_band must be an integer 1..6';
  end;
  if s_required < 1 or s_required > 6 then
    raise exception 'BUG: required difficulty of %', s_required
      using errcode = 'PN160', hint = 'fault', column = '_',
      detail = 'setup.required_band must be 1..6';
  end if;
  begin
    s_legal := coalesce((p_setup->>'legal_band')::int, 5);
  exception when invalid_text_representation then
    raise exception 'BUG: legal difficulty that is not a number'
      using errcode = 'PN500', hint = 'fault', column = '_',
      detail = 'setup.legal_band must be an integer between required_band and 6';
  end;
  if s_legal < s_required or s_legal > 6 then
    raise exception 'BUG: legal difficulty of % with required at %', s_legal, s_required
      using errcode = 'PN161', hint = 'fault', column = '_',
      detail = 'setup.legal_band must be between required_band and 6';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Board structure validation ──────────────────────────
  b_outer := p_board->>'outer_letters';
  b_center := p_board->>'center_letter';

  if b_outer is null or length(b_outer) <> 6 then
    raise exception 'BUG: board with % outer letters',
      coalesce(length(b_outer)::text, 'no')
      using errcode = 'PN162', hint = 'fault', column = '_',
      detail = 'board.outer_letters must be 6 characters';
  end if;
  if b_outer !~ '^[a-rt-z]{6}$' then
    -- ^[a-rt-z]{6}$ = lowercase ASCII letters minus 's' (which
    -- the puzzle rule excludes). A regex is more compact than
    -- enumerating the alphabet, and the failure message names
    -- the intent.
    raise exception 'BUG: outer letters the puzzle cannot use'
      using errcode = 'PN163', hint = 'fault', column = '_',
      detail = 'outer letters must be lowercase ASCII, not s';
  end if;
  -- 6 DISTINCT: cardinality of the deduplicated character set.
  if cardinality(string_to_array(b_outer, null)) <>
     cardinality(array(select distinct unnest(string_to_array(b_outer, null)))) then
    raise exception 'BUG: board with a repeated letter'
      using errcode = 'PN164', hint = 'fault', column = '_',
      detail = 'board.outer_letters must be distinct';
  end if;

  if b_center is null or length(b_center) <> 1 then
    raise exception 'BUG: board whose center is not one letter'
      using errcode = 'PN165', hint = 'fault', column = '_',
      detail = 'board.center_letter must be exactly 1 character';
  end if;
  if b_center !~ '^[a-rt-z]$' then
    raise exception 'BUG: center letter the puzzle cannot use'
      using errcode = 'PN166', hint = 'fault', column = '_',
      detail = 'center must be a lowercase ASCII letter, not s';
  end if;
  if position(b_center in b_outer) > 0 then
    raise exception 'BUG: board whose center is also an outer letter'
      using errcode = 'PN167', hint = 'fault', column = '_',
      detail = 'center_letter duplicated in outer_letters';
  end if;

  b_required_words_score := (p_board->>'required_words_score')::int;
  b_required_words_count := (p_board->>'required_words_count')::int;
  -- Custom (player-specified) letters skip the ≥30 quality gate — the player
  -- chose these letters, so we build whatever puzzle they yield. It must still
  -- have ≥1 required word, or the rank ladder is degenerate (Genius at 0 pts).
  -- Random boards keep the ≥30 gate the edge function's builder targets.
  is_custom_board := coalesce(p_setup->>'custom_letters', '') <> '';
  if is_custom_board then
    if b_required_words_count < 1 then
      raise exception 'No words for those letters at that difficulty'
        using errcode = 'PN168', hint = 'form-validation', column = 'custom_letters',
        detail = 'the chosen letters produce an empty required set at that band';
    end if;
  elsif b_required_words_count < 30 then
    raise exception 'BUG: generated board had only % words to find', b_required_words_count
      using errcode = 'PN169', hint = 'fault', column = '_',
      detail = 'required_words_count must be >= 30; the edge function''s gate must agree';
  end if;

  if jsonb_typeof(p_board->'required_words') <> 'array' then
    raise exception 'BUG: generated board arrived with no word list'
      using errcode = 'PN170', hint = 'fault', column = '_',
      detail = 'board.required_words must be a jsonb array';
  end if;
  if jsonb_typeof(p_board->'bonus_words') <> 'array' then
    raise exception 'BUG: generated board arrived with a malformed bonus list'
      using errcode = 'PN171', hint = 'fault', column = '_',
      detail = 'board.bonus_words must be a jsonb array';
  end if;

  -- ─── Title ───────────────────────────────────────────────
  -- Outer letters alphabetized, uppercased, dot-prefixed by the uppercased
  -- center.
  select upper(b_center) || '·' || string_agg(upper(c), '' order by c)
    into game_title
    from unnest(string_to_array(b_outer, null)) c;

  -- The saved default: the whole setup, as the club's next default — the
  -- target rank, the two bands and the timer are things a friend group
  -- settles on. BUT strip the one-off custom letters: a hand-picked board is
  -- a one-time choice, so the NEXT game starts from a random board again.
  new_id := common._create_game(
    p_club_handle, 'spellingbee_' || p_mode, p_mode, p_player_user_ids, game_title, p_setup,
    p_setup - 'custom_letters' - 'custom_center'
  );

  insert into spellingbee.games (
    game_id, outer_letters, center_letter,
    required_words_score, required_words_count, required_words, bonus_words,
    target_rank, required_band, legal_band
  )
  values (
    new_id, b_outer, b_center,
    b_required_words_score, b_required_words_count,
    p_board->'required_words', coalesce(p_board->'bonus_words', '[]'::jsonb),
    s_target_rank, s_required, s_legal
  );

  perform spellingbee._rebuild_data_cols(new_id, p_update_status_changed_at => true);

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

revoke execute on function spellingbee.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function spellingbee.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

drop function if exists spellingbee.submit_word(uuid, text, int, boolean, boolean);

-- ============================================================
-- spellingbee.submit_word — record a word (trusting-commit)
-- ============================================================
-- The only mid-game action, and it is TRUSTING-COMMIT: the word arrives
-- already judged. The legality checks — too short, a letter off the board,
-- the center letter missing, not on the board's list — all run on the FE
-- (src/spellingbee/lib/answer.ts and the shared word-hunt engine), so a
-- refused word never reaches this function. What is left here is the
-- duplicate, REFUSED per mode rule as a RACE rather than an answer, the
-- accepted word itself, and the target check:
--
--   - coop:    duplicate iff ANY row has this word (once found by anyone,
--              it's locked); the team's score reaching `target_rank` wins
--              for everyone (reached_goal / target, the team ranked 1)
--   - compete: duplicate iff the CALLER has this word; the caller's score
--              reaching `target_rank` wins the race — the race ends when
--              decided, so the caller alone is ranked 1
--
-- A score counts every find, bonus included, so a player who finds bonus
-- pangrams can reach the target faster than the displayed max suggests.
--
-- The `ok` carries `{ result, points }`, so the FE can show points earned
-- (and call out a pangram) WITHOUT re-deriving the point/pangram rules.
-- `result` is `accepted` / `bonus` / `pangram` — a pangram being a required
-- OR bonus word using all 7 letters, which takes precedence — or `won`, the
-- word that reached the target rank. The envelope carries no outcome: the
-- pill is shown from the FE's own table before this call is made
-- (docs/envelopes.md → Who writes the words, per answer).
--
-- Refused (each a not-ok envelope, each a race): a game deleted out from
-- under the word, a game that has ended, a caller who has conceded, and the
-- duplicate; a non-player is refused by _require_game_player. The game row's
-- lock serializes concurrent submissions.
create or replace function spellingbee.submit_word(
  p_game_id uuid,
  p_word text,
  p_points int,
  p_is_pangram boolean,
  p_is_bonus boolean
)
returns jsonb
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  caller_id uuid;
  g spellingbee.games%rowtype;
  v_mode text;
  w_lower text;
  v_score int;
  v_rankings jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select * into g from spellingbee.games where game_id = p_game_id for update;
  -- A friend deleted the game while this word was in flight: the shared race,
  -- asked before the membership gate, which the delete took with it.
  if not found then
    perform common._raise_game_deleted('spellingbee');
  end if;

  caller_id := common._require_game_player(p_game_id);

  -- A RACE: entry is gated on the game being live, but the timer can expire
  -- or a rival can reach the target rank while this submission is in flight.
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — no more words. The FE gates on
  -- this too, so it only fires on a race (a submit in flight when the
  -- concession commits, or a stale second tab). Without it a conceder could
  -- reach the target rank and be recorded the winner.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  select mode into v_mode from common.games where id = p_game_id;
  w_lower := lower(coalesce(p_word, ''));

  if exists (
    select 1 from spellingbee.found_words fw
     where fw.game_id = p_game_id and fw.word = w_lower
       and (v_mode = 'coop' or fw.user_id = caller_id)
  ) then
    -- A RACE, not an answer: `useFoundWordSubmit` dedups locally and returns
    -- BEFORE committing, so reaching this means its `foundWords` was stale — a
    -- teammate found the word between the render and the submit (coop), or the
    -- caller's own row had not landed yet (compete, a second tab). Nothing was
    -- recorded, so this REFUSES; it is not a verdict on a move.
    -- The MESSAGE is the whole line, `WORD — already found`, matching the
    -- frontend's `already_found` answer exactly (src/spellingbee/lib/answer.ts,
    -- bonus dot included). This rejection is the only one that can arrive by
    -- BOTH routes — caught locally, or lost as a race — and the two must not
    -- read differently, so the server composes the same string rather than a
    -- sentence of its own. The phrase is deliberately written twice: it is not
    -- going to change, and machinery to share it would cost more than it saves.
    raise exception '% — already found', upper(w_lower) || case when coalesce(p_is_bonus, false) then ' •' else '' end
      using errcode = 'PN360', hint = 'race', column = '_',
      detail = 'the word is already in found_words under this mode''s dedup rule';
  end if;

  insert into spellingbee.found_words
    (game_id, user_id, word, points, is_pangram, is_bonus)
  values
    (p_game_id, caller_id, w_lower,
     coalesce(p_points, 0), coalesce(p_is_pangram, false), coalesce(p_is_bonus, false));

  -- ─── Did that reach the target? ──────────────────────────
  -- `_rank_idx` is monotonic in the score, so this fires exactly once: the
  -- first word that crosses the line ends the game, and every later
  -- submit_word finds the game over. A coop game with no target is an open
  -- hunt that only the clock or a Stop ends.
  if g.target_rank is not null then
    select coalesce(sum(fw.points), 0) into v_score
      from spellingbee.found_words fw
     where fw.game_id = p_game_id
       and (v_mode = 'coop' or fw.user_id = caller_id);

    if common._rank_idx(v_score, g.required_words_score) >= g.target_rank then
      if v_mode = 'coop' then
        -- The team solves, so every teammate solved at this word.
        update common.game_players set solved_at = now() where game_id = p_game_id;
        select jsonb_object_agg(user_id::text, 1) into v_rankings
          from common.game_players where game_id = p_game_id;
      else
        update common.game_players set solved_at = now()
         where game_id = p_game_id and user_id = caller_id;
        v_rankings := jsonb_build_object(caller_id::text, 1);
      end if;

      perform common._end_game(
        p_game_id, 'reached_goal', 'target', caller_id,
        p_is_no_result => false,
        p_final_rankings => v_rankings
      );
      perform spellingbee._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
      -- Its OWN answer, in both modes: "this word ended the game and you won"
      -- is one case, so it gets one name.
      return common._ok_envelope(jsonb_build_object(
        'result', 'won', 'points', coalesce(p_points, 0)));
    end if;
  end if;

  perform spellingbee._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object(
    'result',
    case
      when coalesce(p_is_pangram, false) then 'pangram'
      when coalesce(p_is_bonus, false) then 'bonus'
      else 'accepted'
    end,
    'points', coalesce(p_points, 0)
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

revoke execute on function spellingbee.submit_word(uuid, text, int, boolean, boolean) from public;
grant execute on function spellingbee.submit_word(uuid, text, int, boolean, boolean) to authenticated;

drop function if exists spellingbee.submit_timeout(uuid);

-- ============================================================
-- spellingbee.submit_timeout — countdown expiry
-- ============================================================
-- Fired by every connected client when a countdown hits 0; the first ends the
-- game, the rest find it ended and answer the game-over race. Nobody reached
-- the target, so nobody is ranked:
--
--   - a game with a target (compete always; coop when it set one) — a loss:
--     the clock beat everyone to the rank, the same rule boggle applies to
--     its score target
--   - a coop game with no target — no result: there was nothing to fail at
--
-- spellingbee has no turn order, so nobody is recorded as ending it.
create or replace function spellingbee.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g spellingbee.games%rowtype;
begin
  select * into g from spellingbee.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('spellingbee');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout', null,
    p_is_no_result => g.target_rank is null,
    p_final_rankings => '{}'::jsonb
  );

  perform spellingbee._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function spellingbee.submit_timeout(uuid) from public;
grant execute on function spellingbee.submit_timeout(uuid) to authenticated;

drop function if exists spellingbee.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists spellingbee.end_game(uuid);

-- ============================================================
-- spellingbee.stop_game — the Stop
-- ============================================================
-- The only automatic endings are a target rank reached (inside submit_word)
-- and the countdown expiring (submit_timeout). A coop hunt with no target,
-- and any game the friends are done with, is stopped explicitly — this RPC.
-- Neutral even when a target was set and missed: the friends chose to stop,
-- which isn't losing (docs/common-schema.md → Stop).
create or replace function spellingbee.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning word waits for it and then reads the
  -- game as over. The row check comes before the membership gate — see
  -- replay_board.
  perform 1 from spellingbee.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('spellingbee');
  end if;

  perform common._stop(p_game_id);

  perform spellingbee._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function spellingbee.stop_game(uuid) from public;
grant execute on function spellingbee.stop_game(uuid) to authenticated;

drop function if exists spellingbee.replay_board(uuid);

-- ============================================================
-- spellingbee.replay_board — restart this board from scratch
-- ============================================================
-- The Restart action — a menu row all game, a button at the end. Restarts the
-- SAME board — same letters, word lists and target — for everyone: the
-- found-words log (the game's only working state) is cleared, and
-- common._reset_game clears the ending and zeroes the shared clock. Any game
-- player may call it, mid-game or after the game ends (no ended check — it's
-- a restart).
create or replace function spellingbee.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  perform 1 from spellingbee.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('spellingbee');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  delete from spellingbee.found_words where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform spellingbee._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function spellingbee.replay_board(uuid) from public;
grant execute on function spellingbee.replay_board(uuid) to authenticated;

drop function if exists spellingbee.concede(uuid);

-- ============================================================
-- spellingbee.concede — a racer drops out of a compete game
-- ============================================================
-- spellingbee has no other way for a player to end but winning — first to
-- the target rank — which ends the game, so `common._concede` decides it all:
-- it records the concession, and when that was the last racer, ends the game
-- as a loss for everyone. Compete only — coop is a team, and ends via the
-- shared Stop.
create or replace function spellingbee.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = spellingbee, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from spellingbee.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('spellingbee');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform spellingbee._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function spellingbee.concede(uuid) from public;
grant execute on function spellingbee.concede(uuid) to authenticated;
