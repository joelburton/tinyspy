-- ============================================================
-- FreeBee — RPCs (Phase 2)
-- ============================================================
--
-- Builds on the Phase-1 schema. Three security-definer RPCs:
--
--   freebee.create_game      Accepts a pre-computed board (built
--                            by the freebee-build-board edge
--                            function) plus setup; coordinates
--                            with common.create_game; inserts
--                            the freebee.games detail row.
--
--   freebee.submit_word      The only mid-game action. Validates
--                            the word against puzzle letters +
--                            center, looks it up in the cached
--                            scoring/legal lists, checks
--                            duplicates per setup.mode, inserts
--                            the found_words row, recomputes
--                            status, transitions terminal on
--                            100%-found (coop) or target-rank-hit
--                            (compete).
--
--   freebee.submit_timeout   Countdown-expiry handler.
--                            Idempotent.
--
-- Plus one small helper:
--
--   freebee._rank_idx        Pure integer math: given (score,
--                            total) returns the rank 0..6.
--                            Mirrored in src/freebee/lib/ranks.ts
--                            (Phase 4) so FE rendering and DB
--                            label computation agree.
--
-- ───────────────────────────────────────────────────────────
-- Designed-for-compete from day one
-- ───────────────────────────────────────────────────────────
-- v1 ships coop only on the FE, but every RPC fully handles
-- compete mode at the DB level. The duplicate-check rule, score
-- aggregation, target-rank end condition, and status-jsonb
-- shape all branch on setup.mode. Adding compete to the FE
-- later is a UI-only change.
--
-- See docs/freebee.md → "Designing for compete" for the wider
-- rationale.

-- ============================================================
-- _rank_idx — the rank ladder (0..6) as integer math
-- ============================================================
-- 7 named ranks: Start(0), Good(1), Solid(2), Nice(3), Great(4),
-- Amazing(5), Genius(6). Each one unlocks at i/6 * 0.70 of the
-- max score; Genius at 70%. The formula:
--
--   threshold_i = i / 6 * 0.7
--   rank(score, total) = max i such that score >= threshold_i * total
--                      = floor(score * 6 / (total * 0.7))
--                      = floor(score * 60 / (total * 7))      (×100/×100 to remove the decimal)
--
-- LEAST(6, ...) caps the result — a 100%-of-max score yields
-- score*60/(total*7) ≈ 8.57, so we clamp.
--
-- Why integer math: avoiding floating point makes the result
-- bit-for-bit reproducible across implementations (the FE port
-- of this in ranks.ts uses the same expression). Numerical
-- correctness, not performance — the savings here are
-- nanoseconds, but the determinism matters.

create function freebee._rank_idx(score int, total int)
returns int
language sql
immutable
set search_path = freebee, common, public, extensions
as $$
  select case
           when total <= 0 then 0
           else least(6, (score * 60) / (total * 7))
         end;
$$;

revoke execute on function freebee._rank_idx(int, int) from public;
grant execute on function freebee._rank_idx(int, int) to authenticated;

-- ============================================================
-- freebee.create_game
-- ============================================================
--
-- Setup shape (server validates):
--   {
--     "mode": "coop" | "compete",
--     "target_rank": 0..6,                  -- compete only
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": int }
--     )
--   }
--
-- Board shape (built by the freebee-build-board edge function):
--   {
--     "outer_letters": "abcdef",            -- 6 distinct lowercase
--     "center_letter": "g",                 -- 1 lowercase
--     "total_score":   int,
--     "total_words":   int,
--     "scoring_words": [
--       { "word": text, "points": int, "is_pangram": bool },
--       …
--     ],
--     "legal_words":   [text, …]            -- bonus-only words
--   }
--
-- The board's wordlists are taken at face value: they were
-- computed by the edge function from the freebee.dictionary
-- table (which the edge function reads via the caller's JWT,
-- so the RLS / grant gates still applied). The RPC just sanity-
-- checks structure, not content.
--
-- Title formula:  "<CENTER>·<OUTER-SORTED>"  e.g.,  "E·CABDNO".
-- The center letter, dot, then the 6 outer letters alphabetized.
-- Identifies a board at a glance in the club's history list.
--
-- Reject reasons (all 'P0001' unless noted):
--   - 42501 not authenticated
--   - 42501 not a member of this club
--   - setup.mode is required / must be 'coop' or 'compete'
--   - setup.target_rank is required when mode='compete' /
--     must be 0..6
--   - timer shape errors (delegated to common.validate_timer)
--   - board.outer_letters must be 6 distinct lowercase ASCII
--     letters (not 's')
--   - board.center_letter must be 1 lowercase ASCII letter
--     (not 's', and not present among outer_letters)
--   - board.total_words must be ≥ 30 (the puzzle-quality gate
--     the edge function already applies; recheck here so a
--     misbehaving builder can't sneak a degenerate puzzle past)
--   - board.scoring_words / board.legal_words must be arrays

create function freebee.create_game(
  target_club uuid,
  setup jsonb,
  player_user_ids uuid[],
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  new_id uuid;
  s_mode text;
  s_target_rank int;
  b_outer text;
  b_center text;
  b_total_score int;
  b_total_words int;
  game_title text;
begin
  -- Membership gate. The edge function also calls this RPC
  -- under the caller's JWT, so the membership check fires once
  -- here as the entry point of the chain.
  perform common.require_club_member(target_club);

  -- ─── Validate setup.mode ─────────────────────────────
  s_mode := setup->>'mode';
  if s_mode is null then
    raise exception 'setup.mode is required' using errcode = 'P0001';
  end if;
  if s_mode not in ('coop', 'compete') then
    raise exception 'setup.mode must be coop or compete (got %)', s_mode
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.target_rank (compete only) ───────
  if s_mode = 'compete' then
    if (setup->>'target_rank') is null then
      raise exception 'setup.target_rank is required when mode=compete'
        using errcode = 'P0001';
    end if;
    begin
      s_target_rank := (setup->>'target_rank')::int;
    exception when invalid_text_representation then
      raise exception 'setup.target_rank must be an integer'
        using errcode = 'P0001';
    end;
    if s_target_rank < 0 or s_target_rank > 6 then
      raise exception 'setup.target_rank must be 0..6 (got %)', s_target_rank
        using errcode = 'P0001';
    end if;
  else
    -- coop: target_rank must NOT be present (catch a confused
    -- FE that forgets to strip it when switching from compete).
    if setup ? 'target_rank' then
      raise exception 'setup.target_rank only allowed when mode=compete'
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Validate setup.timer ────────────────────────────
  perform common.validate_timer(setup->'timer');

  -- ─── Validate board structure ────────────────────────
  b_outer := board->>'outer_letters';
  b_center := board->>'center_letter';

  if b_outer is null or length(b_outer) <> 6 then
    raise exception 'board.outer_letters must be 6 characters (got %)',
                    coalesce(length(b_outer)::text, 'null')
      using errcode = 'P0001';
  end if;
  if b_outer !~ '^[a-rt-z]{6}$' then
    -- ^[a-rt-z]{6}$ = lowercase ASCII letters minus 's' (which
    -- the puzzle rule excludes). A regex is more compact than
    -- enumerating the alphabet, and the failure message names
    -- the intent.
    raise exception 'board.outer_letters must be 6 lowercase ASCII letters excluding s'
      using errcode = 'P0001';
  end if;
  -- 6 DISTINCT: cardinality of the deduplicated character set.
  if cardinality(string_to_array(b_outer, null)) <>
     cardinality(array(select distinct unnest(string_to_array(b_outer, null)))) then
    raise exception 'board.outer_letters must be 6 distinct letters'
      using errcode = 'P0001';
  end if;

  if b_center is null or length(b_center) <> 1 then
    raise exception 'board.center_letter must be 1 character'
      using errcode = 'P0001';
  end if;
  if b_center !~ '^[a-rt-z]$' then
    raise exception 'board.center_letter must be a lowercase ASCII letter excluding s'
      using errcode = 'P0001';
  end if;
  if position(b_center in b_outer) > 0 then
    raise exception 'board.center_letter must not appear in board.outer_letters'
      using errcode = 'P0001';
  end if;

  b_total_score := (board->>'total_score')::int;
  b_total_words := (board->>'total_words')::int;
  if b_total_words < 30 then
    raise exception 'board.total_words must be ≥ 30 (got %); the edge function''s ≥30 gate must agree',
                    b_total_words
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(board->'scoring_words') <> 'array' then
    raise exception 'board.scoring_words must be an array'
      using errcode = 'P0001';
  end if;
  if jsonb_typeof(board->'legal_words') <> 'array' then
    raise exception 'board.legal_words must be an array'
      using errcode = 'P0001';
  end if;

  -- ─── Title ───────────────────────────────────────────
  -- Outer letters alphabetized, uppercased, dot-prefixed by the
  -- uppercased center. Sort via array_agg + ORDER BY since
  -- string_agg without unnest is awkward here.
  select upper(b_center) || '·' || string_agg(upper(c), '' order by c)
    into game_title
    from unnest(string_to_array(b_outer, null)) c;

  -- ─── Coordinate with common.create_game ──────────────
  -- Inserts common.games (is_current_view=true, play_state=
  -- 'playing'), validates player_user_ids are all in
  -- clubs_members, inserts common.game_players. Returns the
  -- canonical id we'll FK from.
  --
  -- Saved-default arg: persist the whole setup as the club's
  -- next default. Mode + target_rank + timer are all things a
  -- friend group settles on; no point asking again next time.
  new_id := common.create_game(
    target_club, 'freebee', player_user_ids, game_title, setup,
    setup
  );

  -- ─── Insert the per-gametype row ─────────────────────
  insert into freebee.games (
    id, club_id, outer_letters, center_letter,
    total_score, total_words, scoring_words, legal_words
  )
  values (
    new_id,
    target_club,
    b_outer,
    b_center,
    b_total_score,
    b_total_words,
    board->'scoring_words',
    -- jsonb-array → text[] coercion: extract each element as
    -- text, aggregate to array. NULL safety: empty arrays
    -- still produce text[] of length 0 (not null), so the
    -- column's NOT NULL constraint is satisfied.
    coalesce(
      array(select jsonb_array_elements_text(board->'legal_words')),
      array[]::text[]
    )
  );

  -- ─── Seed common.games.status for the club-page label ─
  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object(
      'mode', s_mode,
      'score', 0,
      'total_score', b_total_score,
      'rank_idx', 0,
      'words_found', 0,
      'total_words', b_total_words
    )
  );

  return query select new_id;
end;
$$;

revoke execute on function freebee.create_game(uuid, jsonb, uuid[], jsonb) from public;
grant execute on function freebee.create_game(uuid, jsonb, uuid[], jsonb) to authenticated;

-- ============================================================
-- freebee.submit_word
-- ============================================================
-- The only mid-game action. Validates the word in the order
-- freebee-ws uses (chosen so each rejection gives the friendliest
-- feedback when multiple things are wrong):
--
--   1. tooShort         length < 4
--   2. badLetters       uses a letter that isn't on the board
--   3. missingCenter    doesn't include the center letter
--   4. notAWord         not in scoring_words and not in legal_words
--   5. alreadyFound     per mode rule (see below)
--   6. accepted / bonus
--
-- "Per mode rule":
--   - coop:    duplicate iff ANY row exists with this game_id
--              and word (anyone can find a word; once found
--              by anyone, it's locked).
--   - compete: duplicate iff a row exists with this game_id,
--              user_id=caller, word (each player has their
--              own list; finding a word someone else has
--              found is still a fresh point for you).
--
-- Returns one of:
--   'accepted'       — scoring word, points added to caller's
--                      / team's tally
--   'bonus'          — legal-but-not-scoring word, 0 points
--                      but recorded for the FE's bonus list
--   'tooShort' | 'badLetters' | 'missingCenter' | 'notAWord'
--                    — soft rejections, no row inserted
--   'alreadyFound'   — duplicate per mode rule
--
-- Throws (hard rejections):
--   42501 not authenticated, not a game player
--   P0001 'game is not in progress'  (post-terminal call)
--
-- ───────────────────────────────────────────────────────────
-- Concurrency
-- ───────────────────────────────────────────────────────────
-- SELECT … FOR UPDATE on the freebee.games row serializes
-- concurrent submissions. The PK on found_words is the
-- (game_id, user_id, word) triple, so a same-player double-
-- submit of the same word is also caught at the constraint
-- level if the lock somehow missed it.

create function freebee.submit_word(
  target_game uuid,
  word text
)
returns text
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row freebee.games%rowtype;
  s_mode text;
  current_play_state text;
  current_target_rank int;
  w_lower text;
  w_mask bigint;
  puzzle_mask bigint;
  center_bit bigint;
  i int;
  scoring_entry jsonb;
  word_points int;
  word_is_pangram boolean;
  word_is_bonus boolean;
  duplicate_count int;

  -- Aggregates for post-insert status / terminal calc.
  team_score int;
  team_words_found int;
  team_rank_idx int;
  caller_score int;
  caller_words_found int;
  caller_rank_idx int;
  player_results jsonb;
begin
  -- Lock the gametype row. We use it as the serialization
  -- anchor; subsequent reads of found_words against this game
  -- see all committed prior submissions.
  select * into g_row from freebee.games
   where freebee.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state, setup->>'mode', (setup->>'target_rank')::int
    into current_play_state, s_mode, current_target_rank
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Normalize + letter-mask the input word ──────────
  w_lower := lower(coalesce(word, ''));

  -- (1) tooShort
  if length(w_lower) < 4 then
    return 'tooShort';
  end if;

  -- Compute the word's letter_mask. Loop over each character;
  -- bail out non-letters early (those automatically lead to
  -- badLetters since the puzzle's mask is letters-only).
  w_mask := 0;
  for i in 1..length(w_lower) loop
    declare
      ch text := substr(w_lower, i, 1);
      code int := ascii(ch);
    begin
      if code < 97 or code > 122 then
        return 'badLetters';
      end if;
      w_mask := w_mask | (1::bigint << (code - 97));
    end;
  end loop;

  -- Compute the puzzle mask (union of outer + center) and the
  -- center bit. Cheap — 7 bit-ORs in PL/pgSQL.
  puzzle_mask := 0;
  for i in 1..length(g_row.outer_letters) loop
    puzzle_mask := puzzle_mask
                 | (1::bigint << (ascii(substr(g_row.outer_letters, i, 1)) - 97));
  end loop;
  center_bit := 1::bigint << (ascii(g_row.center_letter) - 97);
  puzzle_mask := puzzle_mask | center_bit;

  -- (2) badLetters
  if (w_mask & ~puzzle_mask) <> 0 then
    return 'badLetters';
  end if;

  -- (3) missingCenter
  if (w_mask & center_bit) = 0 then
    return 'missingCenter';
  end if;

  -- (4) notAWord — look up in cached lists. Scoring lookup
  -- gives us back points + is_pangram for the insert.
  word_is_bonus := false;
  word_points := 0;
  word_is_pangram := false;

  select sw into scoring_entry
    from jsonb_array_elements(g_row.scoring_words) sw
   where sw->>'word' = w_lower
   limit 1;

  if found then
    word_points := (scoring_entry->>'points')::int;
    word_is_pangram := (scoring_entry->>'is_pangram')::boolean;
  elsif w_lower = any(g_row.legal_words) then
    word_is_bonus := true;
    -- bonus: points stay 0
  else
    return 'notAWord';
  end if;

  -- (5) alreadyFound (per mode rule)
  -- Table alias `fw` is mandatory: the function parameter is
  -- also named `word`, and PL/pgSQL's column-resolution rule
  -- raises "column reference word is ambiguous" without the
  -- alias even though we mean `w_lower` below.
  if s_mode = 'coop' then
    select count(*) into duplicate_count
      from freebee.found_words fw
     where fw.game_id = target_game and fw.word = w_lower;
  else
    -- compete
    select count(*) into duplicate_count
      from freebee.found_words fw
     where fw.game_id = target_game
       and fw.user_id = caller_id
       and fw.word = w_lower;
  end if;
  if duplicate_count > 0 then
    return 'alreadyFound';
  end if;

  -- ─── Insert the row ──────────────────────────────────
  insert into freebee.found_words
    (game_id, user_id, word, points, is_pangram, is_bonus)
  values
    (target_game, caller_id, w_lower, word_points, word_is_pangram, word_is_bonus);

  -- ─── Recompute aggregates + status; check terminal ───
  if s_mode = 'coop' then
    -- Team totals across all players, scoring words only.
    select coalesce(sum(points), 0),
           count(*) filter (where not is_bonus)
      into team_score, team_words_found
      from freebee.found_words
     where game_id = target_game;
    team_rank_idx := freebee._rank_idx(team_score, g_row.total_score);

    if team_words_found >= g_row.total_words then
      -- 100% of scoring words found → terminal 'ended'
      -- (outcome=completed). Build player_results: every player
      -- in common.game_players gets a copy of the team result.
      select jsonb_object_agg(
               user_id::text,
               jsonb_build_object(
                 'finished', true,
                 'team_score', team_score,
                 'team_rank_idx', team_rank_idx
               )
             )
        into player_results
        from common.game_players
       where game_id = target_game;

      perform common.end_game(
        target_game, 'ended',
        jsonb_build_object(
          'outcome', 'completed',
          'mode', 'coop',
          'score', team_score,
          'total_score', g_row.total_score,
          'rank_idx', team_rank_idx,
          'words_found', team_words_found,
          'total_words', g_row.total_words
        ),
        player_results
      );
      -- The FE refetches games_state (which now reveals
      -- scoring_words / legal_words) on the terminal flip.
    else
      perform common.update_state(
        target_game, 'playing',
        jsonb_build_object(
          'mode', 'coop',
          'score', team_score,
          'total_score', g_row.total_score,
          'rank_idx', team_rank_idx,
          'words_found', team_words_found,
          'total_words', g_row.total_words
        )
      );
    end if;

  else
    -- compete: per-player aggregates.
    select coalesce(sum(points), 0),
           count(*) filter (where not is_bonus)
      into caller_score, caller_words_found
      from freebee.found_words
     where game_id = target_game and user_id = caller_id;
    caller_rank_idx := freebee._rank_idx(caller_score, g_row.total_score);

    if caller_rank_idx >= current_target_rank then
      -- Compete win: caller hit the target rank first. Freeze
      -- the leaderboard at the moment of victory.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', p.user_id,
                 'score', coalesce(p.score, 0),
                 'rank_idx', freebee._rank_idx(coalesce(p.score, 0), g_row.total_score),
                 'words_found', coalesce(p.words_found, 0)
               )
             )
        into player_results
        from (
          -- ::int casts on the sum / count results so the values
          -- flow back into the int-typed `_rank_idx(int, int)`
          -- function below without a type-mismatch error.
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as score,
                 count(fw.word) filter (where not fw.is_bonus)::int as words_found
            from common.game_players gp
            left join freebee.found_words fw
                   on fw.game_id = target_game and fw.user_id = gp.user_id
           where gp.game_id = target_game
           group by gp.user_id
        ) p;

      perform common.end_game(
        target_game, 'won_compete',
        jsonb_build_object(
          'outcome', 'won_compete',
          'mode', 'compete',
          'winner_user_id', caller_id,
          'target_rank', current_target_rank,
          'leaderboard', player_results
        ),
        -- player_results for common.end_game is keyed by user_id.
        -- Re-key the leaderboard for that purpose.
        (select jsonb_object_agg(
                  (entry->>'user_id'),
                  jsonb_build_object(
                    'won', (entry->>'user_id')::uuid = caller_id,
                    'score', (entry->>'score')::int,
                    'rank_idx', (entry->>'rank_idx')::int
                  )
                )
           from jsonb_array_elements(player_results) entry)
      );
    else
      -- Build the full leaderboard for the status label.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', p.user_id,
                 'score', p.score,
                 'rank_idx', freebee._rank_idx(p.score, g_row.total_score),
                 'words_found', p.words_found
               )
             )
        into player_results
        from (
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as score,
                 count(fw.word) filter (where not fw.is_bonus)::int as words_found
            from common.game_players gp
            left join freebee.found_words fw
                   on fw.game_id = target_game and fw.user_id = gp.user_id
           where gp.game_id = target_game
           group by gp.user_id
        ) p;

      perform common.update_state(
        target_game, 'playing',
        jsonb_build_object(
          'mode', 'compete',
          'target_rank', current_target_rank,
          'leaderboard', player_results,
          'total_score', g_row.total_score,
          'total_words', g_row.total_words
        )
      );
    end if;
  end if;

  if word_is_bonus then
    return 'bonus';
  end if;
  return 'accepted';
end;
$$;

revoke execute on function freebee.submit_word(uuid, text) from public;
grant execute on function freebee.submit_word(uuid, text) to authenticated;

-- ============================================================
-- freebee.submit_timeout
-- ============================================================
-- Fired by the FE when the count-down timer hits 0. Flips the
-- game to 'ended' with outcome='timeout'. Multiple peers may
-- race the expiry; the SELECT ... FOR UPDATE serializes them
-- and the post-lock play_state check rejects everyone after
-- the first with P0001 (which the FE swallows silently).
--
-- This is identical in shape to wordknit / psychic-num's
-- submit_timeout, just with freebee's status payload.

create function freebee.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  g_row freebee.games%rowtype;
  current_play_state text;
  s_mode text;
  team_score int;
  team_words_found int;
  player_results jsonb;
begin
  select * into g_row from freebee.games
   where freebee.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state, setup->>'mode' into current_play_state, s_mode
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if s_mode = 'coop' then
    select coalesce(sum(points), 0),
           count(*) filter (where not is_bonus)
      into team_score, team_words_found
      from freebee.found_words
     where game_id = target_game;

    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'finished', true,
               'team_score', team_score,
               'team_rank_idx',
                 freebee._rank_idx(team_score, g_row.total_score)
             )
           )
      into player_results
      from common.game_players
     where game_id = target_game;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'timeout',
        'mode', 'coop',
        'score', team_score,
        'total_score', g_row.total_score,
        'rank_idx', freebee._rank_idx(team_score, g_row.total_score),
        'words_found', team_words_found,
        'total_words', g_row.total_words
      ),
      player_results
    );
  else
    -- compete: leaderboard at timeout
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,                       -- timeout = no winner
               'score', p.score,
               'rank_idx', freebee._rank_idx(p.score, g_row.total_score)
             )
           )
      into player_results
      from (
        select gp.user_id,
               coalesce(sum(fw.points), 0)::int as score
          from common.game_players gp
          left join freebee.found_words fw
                 on fw.game_id = target_game and fw.user_id = gp.user_id
         where gp.game_id = target_game
         group by gp.user_id
      ) p;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'timeout',
        'mode', 'compete'
      ),
      player_results
    );
  end if;
end;
$$;

revoke execute on function freebee.submit_timeout(uuid) from public;
grant execute on function freebee.submit_timeout(uuid) to authenticated;
