-- ============================================================
-- boggle — MothCubes: find words by tracing adjacent letter tiles.
-- ============================================================
-- Coop + compete sibling pair (one schema, mode column). Modeled on
-- spellingbee, with two deliberate simplifications (see docs/games/boggle.md):
--
--   1. NO hidden-solution view. The required-word list is shipped to the FE
--      (the trust model doesn't withhold it for anti-cheat), so `required_words`
--      is a normal readable column — no column-grant exclusion, no
--      `games_state` security_invoker view, no `_required_words_for`. The
--      missed-words reveal is computed client-side (`required − found`).
--   2. Trusting-commit submit. The FE traces the word on the board itself and
--      only submits traceable words; `submit_word` does the one check the FE
--      can't (is the word a real dictionary word, for bonus guesses) + dedup +
--      record. Required-ness is a membership test against `required_words`;
--      bonus points are trusted from the FE (scrabble precedent).
--
-- The board is generated on demand by the `boggle-build-board` edge function
-- (pure-TS trie solver, see src/boggle/lib/), which calls create_game here.

create schema if not exists boggle;
grant usage on schema boggle to authenticated;

-- ============================================================
-- boggle.games — one row per game, FK'd to the common.games header.
-- ============================================================
create table boggle.games (
  id uuid primary key references common.games(id) on delete cascade,
  -- Denormalized from common.games so RLS policies check membership without a
  -- join, and so the FE reads the whole board in one schema('boggle') query.
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode text not null check (mode in ('coop', 'compete')),
  -- The rolled board: a row-major raw-face string (A–Z, a multiface digit 1–6,
  -- or 0 for a blank tile) of length n². The FE expands faces for display.
  board text not null,
  n int not null check (n between 4 and 6),
  -- Denormalized setup bits the submit RPC needs (rest of setup lives in
  -- common.games.setup): the minimum length a guess must reach, and the
  -- difficulty band for LEGAL (bonus) guesses. A typed word counts as a bonus
  -- when it's in common.words at difficulty <= legal_band — with NO
  -- dialect/slur/crude/slang filter (legal words filter on difficulty ONLY).
  -- Distinct from the *required* band: required words are the clean,
  -- difficulty<=band words the board generator guarantees are findable; the
  -- legal band is the (usually wider) net of what else a player may discover.
  min_word_length int not null,
  legal_band int not null check (legal_band between 1 and 6),
  -- The required-word list this board is judged against: a jsonb array of
  -- { "word": text, "points": int }. READABLE by club members (not hidden) —
  -- the FE classifies guesses + renders the missed-words reveal from it.
  required_words jsonb not null,
  required_words_count int not null,
  required_words_score int not null,
  created_at timestamptz not null default now()
);

create index boggle_games_club_handle_idx on boggle.games (club_handle);

-- All columns are readable by club members (RLS gates the rows). No
-- column-level grant: unlike spellingbee, required_words is intentionally
-- visible — see the header note.
grant select on boggle.games to authenticated;

-- ============================================================
-- boggle.found_words — append-only log of accepted submissions.
-- ============================================================
-- PK (game_id, user_id, word): coop dedups on (game_id, word) so the team
-- finds each word once; compete dedups on (game_id, user_id, word) so two
-- players can independently claim the same word. The branching is in
-- submit_word; the PK supports both.
create table boggle.found_words (
  game_id  uuid not null references boggle.games(id) on delete cascade,
  user_id  uuid not null references common.profiles(user_id) on delete cascade,
  word     text not null,
  points   int not null,
  is_bonus boolean not null,        -- legal but outside the required set; shown with a dot
  found_at timestamptz not null default now(),
  primary key (game_id, user_id, word)
);

create index boggle_found_words_game_id_idx on boggle.found_words (game_id);

grant select on boggle.found_words to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table boggle.games enable row level security;
alter table boggle.found_words enable row level security;

-- Anyone in the club can read the game (board + required list included).
create policy games_select on boggle.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Found-words visibility, mode-aware (the load-bearing piece for compete):
--   (1) coop          — everyone in the club sees everyone's finds.
--   (2) your own       — you always see your finds (private in compete mid-game).
--   (3) is_terminal    — once the game ends, everyone sees everything.
create policy found_words_select on boggle.found_words
  for select to authenticated
  using (
    exists (
      select 1 from boggle.games fg
       join common.games cg on cg.id = fg.id
       where fg.id = found_words.game_id
         and common.is_club_member(fg.club_handle)
         and (
               fg.mode = 'coop'
            or found_words.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the security-definer
-- RPCs below.

-- ============================================================
-- Gametype registration + realtime
-- ============================================================
insert into common.gametypes (gametype, min_players) values
  ('boggle_coop', 1),
  ('boggle_compete', 2)
on conflict do nothing;

alter publication supabase_realtime add table boggle.games;
alter publication supabase_realtime add table boggle.found_words;

-- ============================================================
-- create_game — called by the boggle-build-board edge function.
-- ============================================================
create function boggle.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  new_id uuid;
  game_title text;
  effective_gametype text;
  s_min_word_length int;
  s_band int;
  s_legal_band int;
  s_ladder text;
  b_board text;
  b_n int;
  b_required_count int;
  b_required_score int;
begin
  perform common.require_club_member(target_club);

  -- ─── Mode + player-count ─────────────────────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode using errcode = 'P0001';
  end if;
  if mode = 'compete' and coalesce(array_length(player_user_ids, 1), 0) < 2 then
    raise exception 'compete mode requires at least 2 players' using errcode = 'P0001';
  end if;
  perform common.require_player_count_max(player_user_ids, 8);
  if setup ? 'mode' then
    raise exception 'setup.mode is no longer valid; mode is a top-level argument'
      using errcode = 'P0001';
  end if;

  -- ─── Setup validation ────────────────────────────────────
  perform common.validate_timer(setup->'timer');

  s_min_word_length := coalesce((setup->>'min_word_length')::int, 3);
  if s_min_word_length < 3 or s_min_word_length > 9 then
    raise exception 'setup.min_word_length must be 3..9 (got %)', s_min_word_length
      using errcode = 'P0001';
  end if;

  s_band := (setup->>'band')::int;
  if s_band is null or s_band < 1 or s_band > 6 then
    raise exception 'setup.band must be 1..6 (got %)', setup->>'band' using errcode = 'P0001';
  end if;

  -- The legal (bonus) band is the difficulty ceiling for words that aren't on
  -- the required list but still score. It must be at least the required band
  -- (every required word is, by definition, also legal) and at most 6.
  s_legal_band := (setup->>'legal_band')::int;
  if s_legal_band is null or s_legal_band < s_band or s_legal_band > 6 then
    raise exception 'setup.legal_band must be band..6 (got %)', setup->>'legal_band'
      using errcode = 'P0001';
  end if;

  s_ladder := setup->>'scoring_ladder';
  if s_ladder is null or s_ladder not in ('flat', 'basic', 'fib', 'big') then
    raise exception 'setup.scoring_ladder must be flat|basic|fib|big (got %)', s_ladder
      using errcode = 'P0001';
  end if;

  if coalesce(setup->>'dice_set', '') = '' then
    raise exception 'setup.dice_set is required' using errcode = 'P0001';
  end if;

  -- ─── Board validation (built by the edge function) ───────
  b_board := board->>'board';
  b_n := (board->>'n')::int;
  if b_board is null or b_n is null or b_n < 4 or b_n > 6 then
    raise exception 'board.board / board.n invalid' using errcode = 'P0001';
  end if;
  if length(b_board) <> b_n * b_n then
    raise exception 'board length % != n² (% )', length(b_board), b_n * b_n using errcode = 'P0001';
  end if;
  if jsonb_typeof(board->'required_words') <> 'array' then
    raise exception 'board.required_words must be an array' using errcode = 'P0001';
  end if;
  b_required_count := (board->>'required_words_count')::int;
  b_required_score := (board->>'required_words_score')::int;

  -- ─── Title + gametype ────────────────────────────────────
  -- Brand ("MothCubes") lives only in the manifest; the stored title is a
  -- neutral descriptor (the real-game name + size).
  game_title := 'Boggle ' || b_n || '×' || b_n;
  effective_gametype := 'boggle_' || mode;

  -- ─── common.games header (saves setup as the club default) ─
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup, setup
  );

  insert into boggle.games (
    id, club_handle, mode, board, n, min_word_length, legal_band,
    required_words, required_words_count, required_words_score
  )
  values (
    new_id, target_club, mode, b_board, b_n, s_min_word_length, s_legal_band,
    board->'required_words', b_required_count, b_required_score
  );

  -- ─── Seed common.games.status for the club-page label ────
  if mode = 'coop' then
    perform common.update_state(new_id, 'playing', jsonb_build_object(
      'mode', 'coop', 'found_words_count', 0, 'score', 0,
      'required_words_count', b_required_count, 'required_words_score', b_required_score
    ));
  else
    perform common.update_state(new_id, 'playing', jsonb_build_object(
      'mode', 'compete', 'leaderboard', '[]'::jsonb,
      'required_words_count', b_required_count, 'required_words_score', b_required_score
    ));
  end if;

  return query select new_id;
end;
$$;

revoke execute on function boggle.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function boggle.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- _refresh_status — recompute the club-page label after a find.
-- ============================================================
create function boggle._refresh_status(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_mode text;
  g_req_count int;
  g_req_score int;
  fc int;
  fs int;
  lb jsonb;
begin
  select mode, required_words_count, required_words_score
    into g_mode, g_req_count, g_req_score
    from boggle.games where id = target_game;

  if g_mode = 'coop' then
    select count(*), coalesce(sum(points), 0) into fc, fs
      from boggle.found_words where game_id = target_game;
    perform common.update_state(target_game, 'playing', jsonb_build_object(
      'mode', 'coop', 'found_words_count', fc, 'score', fs,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    ));
  else
    select coalesce(jsonb_agg(row order by score desc), '[]'::jsonb) into lb
      from (
        select jsonb_build_object('user_id', user_id, 'count', count(*), 'score', sum(points)) as row,
               sum(points) as score
          from boggle.found_words where game_id = target_game
         group by user_id
      ) t;
    perform common.update_state(target_game, 'playing', jsonb_build_object(
      'mode', 'compete', 'leaderboard', lb,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    ));
  end if;
end;
$$;

revoke execute on function boggle._refresh_status(uuid) from public;

-- ============================================================
-- submit_word — record a guess (trusting-commit; see header).
-- ============================================================
create function boggle.submit_word(
  target_game uuid,
  word text,
  points int
)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  caller_id uuid;
  g_mode text;
  g_minlen int;
  g_legal_band int;
  g_required jsonb;
  g_playstate text;
  w_lower text;
  dup_count int;
  required_entry jsonb;
  is_bonus boolean;
  pts int;
begin
  caller_id := common.require_game_player(target_game);

  select bg.mode, bg.min_word_length, bg.legal_band, bg.required_words, cg.play_state
    into g_mode, g_minlen, g_legal_band, g_required, g_playstate
    from boggle.games bg join common.games cg on cg.id = bg.id
   where bg.id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if g_playstate <> 'playing' then
    return jsonb_build_object('result', 'gameOver', 'points', 0);
  end if;

  w_lower := lower(coalesce(word, ''));
  if w_lower !~ '^[a-z]+$' then
    return jsonb_build_object('result', 'invalid', 'points', 0);
  end if;
  if length(w_lower) < g_minlen then
    return jsonb_build_object('result', 'tooShort', 'points', 0);
  end if;

  -- Dedup, mode-aware: coop = whole team, compete = this player. Alias the table
  -- so `word` resolves to the column, not the same-named function parameter.
  if g_mode = 'coop' then
    select count(*) into dup_count from boggle.found_words fw
      where fw.game_id = target_game and fw.word = w_lower;
  else
    select count(*) into dup_count from boggle.found_words fw
      where fw.game_id = target_game and fw.user_id = caller_id and fw.word = w_lower;
  end if;
  if dup_count > 0 then
    return jsonb_build_object('result', 'alreadyFound', 'points', 0);
  end if;

  -- Classify: required (membership in this board's list) vs bonus (a word in
  -- common.words within the legal band) vs not-a-word. The legal-band check
  -- filters on difficulty ONLY — any dialect/slur/crude/slang qualifies, since
  -- bonus words are the wide net of "real words a player might dig up."
  -- Traceability is trusted from the FE.
  select rw into required_entry
    from jsonb_array_elements(g_required) rw
   where rw->>'word' = w_lower
   limit 1;
  if found then
    is_bonus := false;
    pts := (required_entry->>'points')::int;       -- authoritative stored points
  elsif exists (
    select 1 from common.words cw
     where cw.word = w_lower and cw.difficulty <= g_legal_band
  ) then
    is_bonus := true;
    pts := coalesce(points, 0);                     -- FE-supplied (trusted) bonus points
  else
    return jsonb_build_object('result', 'notAWord', 'points', 0);
  end if;

  insert into boggle.found_words (game_id, user_id, word, points, is_bonus)
    values (target_game, caller_id, w_lower, pts, is_bonus);

  perform boggle._refresh_status(target_game);

  return jsonb_build_object('result', case when is_bonus then 'bonus' else 'accepted' end, 'points', pts);
end;
$$;

revoke execute on function boggle.submit_word(uuid, text, int) from public;
grant execute on function boggle.submit_word(uuid, text, int) to authenticated;

-- ============================================================
-- _finalize / end_game / submit_timeout — terminal transitions.
-- ============================================================
-- Boggle has no win-on-target during play; the game ends when a player ends it
-- or the timer expires. Coop has no individual winner (the team's total is the
-- score); compete ranks players by score (ties share the win).
create function boggle._finalize(target_game uuid, outcome text)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_mode text;
  g_req_count int;
  g_req_score int;
  fc int;
  fs int;
  max_score int;
  lb jsonb;
  results jsonb;
  final_status jsonb;
begin
  select mode, required_words_count, required_words_score
    into g_mode, g_req_count, g_req_score
    from boggle.games where id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if g_mode = 'coop' then
    select count(*), coalesce(sum(points), 0) into fc, fs
      from boggle.found_words where game_id = target_game;
    final_status := jsonb_build_object(
      'mode', 'coop', 'outcome', outcome,
      'found_words_count', fc, 'score', fs,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    );
    results := null; -- coop is a team effort; no per-player result
  else
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'count', cnt, 'score', sc)
                              order by sc desc), '[]'::jsonb),
           coalesce(max(sc), 0)
      into lb, max_score
      from (
        select user_id, count(*) as cnt, sum(points) as sc
          from boggle.found_words where game_id = target_game group by user_id
      ) t;
    final_status := jsonb_build_object(
      'mode', 'compete', 'outcome', outcome, 'leaderboard', lb,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    );
    -- Per-player result: win if you tied or beat the top score (a player who
    -- found nothing scores 0 and loses unless 0 is the max).
    select coalesce(jsonb_object_agg(p.user_id::text,
             jsonb_build_object('won', coalesce(t.sc, 0) >= max_score,
                                'score', coalesce(t.sc, 0))), '{}'::jsonb)
      into results
      from common.game_players p
      left join (
        select user_id, sum(points) as sc
          from boggle.found_words where game_id = target_game group by user_id
      ) t on t.user_id = p.user_id
     where p.game_id = target_game;
  end if;

  perform common.end_game(target_game, 'ended', final_status, results);
end;
$$;

revoke execute on function boggle._finalize(uuid, text) from public;

create function boggle.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_playstate text;
begin
  perform common.require_game_player(target_game);
  select play_state into g_playstate from common.games where id = target_game;
  if g_playstate is distinct from 'playing' then
    return; -- already over; idempotent
  end if;
  perform boggle._finalize(target_game, 'manual');
end;
$$;

revoke execute on function boggle.end_game(uuid) from public;
grant execute on function boggle.end_game(uuid) to authenticated;

create function boggle.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_playstate text;
begin
  perform common.require_game_player(target_game);
  select play_state into g_playstate from common.games where id = target_game;
  if g_playstate is distinct from 'playing' then
    return;
  end if;
  perform boggle._finalize(target_game, 'timeout');
end;
$$;

revoke execute on function boggle.submit_timeout(uuid) from public;
grant execute on function boggle.submit_timeout(uuid) to authenticated;
