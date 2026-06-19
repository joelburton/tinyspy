-- ============================================================
-- freebee — sibling-manifest split (compete mode lands on the FE)
-- ============================================================
--
-- freebee's RPCs already branched on `setup.mode` end-to-end
-- (create_game validation, submit_word duplicate rule + terminal,
-- submit_timeout + end_game per-mode terminal, RLS on
-- found_words). The Phase-1 baseline shipped that as
-- "designed-for-compete-on-the-FE-later" — coop was the only mode
-- the manifest ever set.
--
-- This migration migrates the mechanism for *communicating* mode
-- from "setup.mode field in the setup blob" to the canonical
-- sibling-manifest pattern (one schema, two `common.gametypes`
-- rows, mode-denormalized column on the gametype row, mode arg
-- on create_game). Same pattern psychicnum and wordknit follow.
--
-- ┌─ The compete UX picks (from the plan conversation) ────┐
-- │ - First-to-target-rank wins; race ends instantly.      │
-- │ - Timeout / manual-end → everyone {won:false} (no      │
-- │   winner). Already implemented in submit_timeout +     │
-- │   end_game; this migration just moves the mode source. │
-- │ - Opponent visibility: rank only via the leaderboard   │
-- │   in `common.games.status` (server already writes it). │
-- │ - WordList during play: caller-only (RLS already       │
-- │   enforces; no behavior change here).                  │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ What this migration does (smaller than wordknit's) ───┐
-- │ - Cascade-delete the old 'freebee' gametype row;       │
-- │   insert 'freebee_coop' + 'freebee_compete';           │
-- │   backfill clubs_gametypes for existing clubs.         │
-- │ - Add freebee.games.mode (denormalized), NOT NULL,     │
-- │   CHECK in {coop, compete}. (Safe because the cascade  │
-- │   above emptied the table — no existing-row backfill   │
-- │   needed.)                                             │
-- │ - Swap found_words_select RLS to read off              │
-- │   freebee.games.mode instead of common.games.setup     │
-- │   ->>'mode' — single-table read for the mode branch.   │
-- │ - Recreate create_game with new signature: mode is a   │
-- │   positional arg, no longer extracted from setup;      │
-- │   compete now has a 2-player floor; setup.mode is      │
-- │   rejected if present (catch a confused FE).           │
-- │ - submit_word / submit_timeout / end_game: read mode   │
-- │   from freebee.games.mode (one-table query) rather     │
-- │   than from common.games.setup.                        │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ Alpha-software latitude ──────────────────────────────┐
-- │ Same as the wordknit_compete migration: the cascade    │
-- │ wipes existing freebee games from the dev DB. Per      │
-- │ CLAUDE.md alpha policy, that's the accepted cost.      │
-- └────────────────────────────────────────────────────────┘

-- ============================================================
-- 1. Swap the gametype registration
-- ============================================================
-- common.games.gametype FKs to common.gametypes ON DELETE CASCADE,
-- so dropping 'freebee' cascades to every freebee game row +
-- freebee.found_words + common.clubs_gametypes entries.

delete from common.gametypes where gametype = 'freebee';

insert into common.gametypes (gametype) values
  ('freebee_coop'),
  ('freebee_compete')
on conflict do nothing;

-- Backfill clubs_gametypes for every existing club. (create_club
-- handles this for new clubs; existing clubs need the two new
-- rows since the cascade above removed their 'freebee' entry.)
insert into common.clubs_gametypes (club_handle, gametype)
select handle, 'freebee_coop' from common.clubs
on conflict do nothing;

insert into common.clubs_gametypes (club_handle, gametype)
select handle, 'freebee_compete' from common.clubs
on conflict do nothing;

-- ============================================================
-- 2. Tear down what's about to be replaced
-- ============================================================
-- Drop the four RPCs and the found_words RLS policy. Drop order
-- matters only for the RLS policy (it references the table; the
-- table itself stays).

drop function if exists freebee.create_game(text, jsonb, uuid[], jsonb);
drop function if exists freebee.submit_word(uuid, text);
drop function if exists freebee.submit_timeout(uuid);
drop function if exists freebee.end_game(uuid);

drop policy if exists found_words_select on freebee.found_words;

-- ============================================================
-- 3. Add the denormalized mode column
-- ============================================================
-- Cascade above emptied freebee.games, so we can add a NOT NULL
-- column without a backfill default. Same shape as
-- psychicnum.games.mode and wordknit.games.mode.

alter table freebee.games
  add column mode text not null
    check (mode in ('coop', 'compete'));

-- The baseline migration's column-level grant on freebee.games
-- enumerated every safe column (the hidden-wordlist pattern needs
-- the grant present at all so scoring_words / legal_words are
-- excluded). Adding `mode` to the table requires extending that
-- grant — otherwise the security_invoker view's `g.mode`
-- reference fails for `authenticated`, and the new
-- found_words_select RLS policy's `fg.mode` subquery does too
-- (RLS USING expressions evaluate in the caller's context).
grant select (mode) on freebee.games to authenticated;

-- ============================================================
-- 3b. Re-expose freebee.games_state with the new `mode` column
-- ============================================================
-- The view is the FE's only read path on freebee games (the base
-- table's column grant blocks scoring_words/legal_words for
-- `authenticated`). The baseline view's column list pre-dates the
-- mode denormalization, so the FE has no way to learn the gametype
-- mode without it. DROP+CREATE rather than CREATE OR REPLACE
-- because adding a column changes the view's signature.

drop view if exists freebee.games_state;

create view freebee.games_state with (security_invoker = true) as
select
  g.id,
  g.club_handle,
  g.mode,
  g.outer_letters,
  g.center_letter,
  g.total_score,
  g.total_words,
  g.created_at,
  freebee._scoring_words_for(g.id) as scoring_words,
  freebee._legal_words_for(g.id)   as legal_words
  from freebee.games g;

grant select on freebee.games_state to authenticated;

-- ============================================================
-- 4. Recreate the found_words SELECT policy (mode-aware via the
--    denormalized column)
-- ============================================================
-- Old policy read mode via `cg.setup->>'mode'`. That worked but
-- meant a join to common.games on every guess visibility check.
-- The new policy reads off freebee.games.mode directly — same
-- mode-aware shape, one fewer join. Mirrors the
-- wordknit.guesses_select rewrite.
--
-- Three OR branches inside the EXISTS:
--   - coop: any club member sees any found_words row.
--   - compete mid-game: only the row owner sees their own.
--   - compete post-terminal: all rows become visible to all club
--     members, supporting an "everyone's finds revealed at game
--     end" UX. (FE v1 doesn't surface peer finds even when
--     visible — see freebee.md → Compete mode for the rationale;
--     this is left open at the RLS layer for a future expansion.)

create policy found_words_select on freebee.found_words
  for select to authenticated
  using (
    exists (
      select 1 from freebee.games fg
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

-- ============================================================
-- 5. freebee.create_game — mode is now a positional arg
-- ============================================================
-- The big shape change: `mode` becomes a positional parameter,
-- routing the gametype string and validating the per-mode
-- player-count floor. setup.mode is REJECTED if present (catch
-- a confused FE that didn't strip it after the migration).
--
-- Everything else (puzzle board structure validation, title
-- formula, common.create_game coordination, freebee.games insert,
-- status seeding) stays as the prior version had it — mode is
-- the only meaningful delta.

create function freebee.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  new_id uuid;
  s_target_rank int;
  b_outer text;
  b_center text;
  b_total_score int;
  b_total_words int;
  game_title text;
  effective_gametype text;
begin
  perform common.require_club_member(target_club);

  -- ─── Validate mode + player-count ────────────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this is the
    -- server-side catch. Matches psychicnum + wordknit.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Reject the now-deprecated setup.mode field ──────────
  -- After this migration the gametype string + the mode arg are
  -- the only sources of truth. A stale FE that still embeds
  -- setup.mode lands here so the misconfig is loud, not silent
  -- (silent acceptance would have the dialog appear to work while
  -- the RLS-and-RPC mode logic ran on the new arg only).
  if setup ? 'mode' then
    raise exception 'setup.mode is no longer valid; mode is now a top-level argument'
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.target_rank (compete only) ───────────
  -- Required when mode=compete; absent when mode=coop. Same rule
  -- as before, just keyed off the arg rather than setup.mode.
  if mode = 'compete' then
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
    -- coop: target_rank must NOT be present.
    if setup ? 'target_rank' then
      raise exception 'setup.target_rank only allowed when mode=compete'
        using errcode = 'P0001';
    end if;
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Board structure validation (unchanged) ──────────────
  b_outer := board->>'outer_letters';
  b_center := board->>'center_letter';

  if b_outer is null or length(b_outer) <> 6 then
    raise exception 'board.outer_letters must be 6 characters (got %)',
                    coalesce(length(b_outer)::text, 'null')
      using errcode = 'P0001';
  end if;
  if b_outer !~ '^[a-rt-z]{6}$' then
    raise exception 'board.outer_letters must be 6 lowercase ASCII letters excluding s'
      using errcode = 'P0001';
  end if;
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

  -- ─── Title (unchanged) ───────────────────────────────────
  select upper(b_center) || '·' || string_agg(upper(c), '' order by c)
    into game_title
    from unnest(string_to_array(b_outer, null)) c;

  -- Mode-suffixed gametype string for common.games.gametype.
  effective_gametype := 'freebee_' || mode;

  -- ─── Coordinate with common.create_game ──────────────────
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup,
    setup
  );

  -- ─── Insert the per-gametype row, now with mode ──────────
  insert into freebee.games (
    id, club_handle, mode, outer_letters, center_letter,
    total_score, total_words, scoring_words, legal_words
  )
  values (
    new_id,
    target_club,
    mode,
    b_outer,
    b_center,
    b_total_score,
    b_total_words,
    board->'scoring_words',
    coalesce(
      array(select jsonb_array_elements_text(board->'legal_words')),
      array[]::text[]
    )
  );

  -- ─── Seed common.games.status for the club-page label ────
  -- Coop label needs score / total_score / rank_idx / words_found
  -- / total_words. Compete label only needs target_rank +
  -- total_words (the leaderboard is built on first submission).
  if mode = 'coop' then
    perform common.update_state(
      new_id,
      'playing',
      jsonb_build_object(
        'mode', 'coop',
        'score', 0,
        'total_score', b_total_score,
        'rank_idx', 0,
        'words_found', 0,
        'total_words', b_total_words
      )
    );
  else
    perform common.update_state(
      new_id,
      'playing',
      jsonb_build_object(
        'mode', 'compete',
        'target_rank', s_target_rank,
        'total_score', b_total_score,
        'total_words', b_total_words,
        'leaderboard', '[]'::jsonb
      )
    );
  end if;

  return query select new_id;
end;
$$;

revoke execute on function freebee.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function freebee.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- 6. freebee.submit_word — read mode from freebee.games.mode
-- ============================================================
-- The signature is unchanged ((target_game, word) → text) and the
-- logic is identical to the prior version. The only delta: mode
-- comes off freebee.games (which we already lock with FOR UPDATE)
-- instead of off common.games.setup. One fewer cross-schema read
-- per submission.

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

  team_score int;
  team_words_found int;     -- count of ALL rows; for the status display
  team_rank_idx int;
  caller_score int;
  caller_words_found int;   -- caller's all-rows count (display + leaderboard)
  caller_rank_idx int;
  player_results jsonb;
begin
  -- Lock the gametype row. Mode is on it (post-migration), so we
  -- pick it up "for free" in the same SELECT.
  select * into g_row from freebee.games
   where freebee.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  -- target_rank still lives on setup (it's per-game config, not a
  -- gametype-axis); play_state still lives on common.games.
  select play_state, (setup->>'target_rank')::int
    into current_play_state, current_target_rank
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Normalize + letter-mask the input word ──────────────
  w_lower := lower(coalesce(word, ''));

  -- (1) tooShort
  if length(w_lower) < 4 then
    return 'tooShort';
  end if;

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

  -- (4) notAWord
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
    -- Bonus words score the SAME as scoring words: length-based
    -- (1 pt for 4-letter, length pts for ≥5), plus the +10
    -- pangram bonus when distinct(letters) = 7. This matches
    -- freebee-ws's `scoreWord(w)` semantics (server/game.js:4-8)
    -- — bonus words are "the rare ones we didn't surface in the
    -- scoring set" but they earn points the same way. The
    -- count toward `words_found` differs (only scoring contribute
    -- to the "X/Y words" display denominator), but the score
    -- climb is identical.
    --
    -- Pangram detection by the word's OWN mask popcount, not the
    -- precomputed scoring-entry flag — bonus entries have no
    -- precomputed flag and freebee-ws likewise reads it from the
    -- word at submit time (sessions.js:989: `new Set(w).size===7`).
    word_is_bonus := true;
    word_is_pangram := (
      select count(distinct c) = 7
        from regexp_split_to_table(w_lower, '') c
    );
    if length(w_lower) = 4 then
      word_points := 1;
    else
      word_points := length(w_lower);
    end if;
    if word_is_pangram then
      word_points := word_points + 10;
    end if;
  else
    return 'notAWord';
  end if;

  -- (5) alreadyFound (per mode rule, reading off g_row.mode)
  if g_row.mode = 'coop' then
    select count(*) into duplicate_count
      from freebee.found_words fw
     where fw.game_id = target_game and fw.word = w_lower;
  else
    select count(*) into duplicate_count
      from freebee.found_words fw
     where fw.game_id = target_game
       and fw.user_id = caller_id
       and fw.word = w_lower;
  end if;
  if duplicate_count > 0 then
    return 'alreadyFound';
  end if;

  -- ─── Insert the row ──────────────────────────────────────
  insert into freebee.found_words
    (game_id, user_id, word, points, is_pangram, is_bonus)
  values
    (target_game, caller_id, w_lower, word_points, word_is_pangram, word_is_bonus);

  -- ─── Recompute aggregates + status (no terminal in coop) ─
  -- Coop submissions never end the game — coop only ends via
  -- timer expiry or the manual End-game menu item. Players can
  -- keep finding bonus words past the displayed `Y / total_words`
  -- denominator and the score can overshoot `total_score` (the
  -- freebee-ws design — see the file-header comment for the
  -- bonus-scoring write-up).
  if g_row.mode = 'coop' then
    select coalesce(sum(points), 0),
           count(*)
      into team_score, team_words_found
      from freebee.found_words
     where game_id = target_game;
    team_rank_idx := freebee._rank_idx(team_score, g_row.total_score);

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

  else
    -- compete: per-player aggregates. caller_words_found counts
    -- ALL of caller's rows (scoring + bonus) — matches the
    -- freebee-ws "found.length" stat. The target-rank check
    -- below uses caller_score (which already includes bonus
    -- points after the bonus-scoring fix in the validation
    -- block above), so a player who finds bonus pangrams can
    -- legitimately rocket past target faster than the displayed
    -- max score would suggest.
    select coalesce(sum(points), 0),
           count(*)
      into caller_score, caller_words_found
      from freebee.found_words
     where game_id = target_game and user_id = caller_id;
    caller_rank_idx := freebee._rank_idx(caller_score, g_row.total_score);

    if caller_rank_idx >= current_target_rank then
      -- Compete win: caller hit the target rank first. Freeze the
      -- leaderboard at the moment of victory.
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
          select gp.user_id,
                 coalesce(sum(fw.points), 0)::int as score,
                 -- All rows (scoring + bonus) to mirror freebee-ws's
                 -- found.length stat surfaced in the leaderboard
                 -- display. Scoring-only count would diverge from
                 -- what the player sees in their own Stats card.
                 count(fw.word)::int as words_found
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
        -- Re-key the leaderboard into the per-player {won, score,
        -- rank_idx} shape that common.end_game expects.
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
                 -- All rows (scoring + bonus) to mirror freebee-ws's
                 -- found.length stat surfaced in the leaderboard
                 -- display. Scoring-only count would diverge from
                 -- what the player sees in their own Stats card.
                 count(fw.word)::int as words_found
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
-- 7. freebee.submit_timeout — read mode from freebee.games.mode
-- ============================================================

create function freebee.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  g_row freebee.games%rowtype;
  current_play_state text;
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

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    -- Status display uses the ALL-rows count to match the
    -- live Stats card (freebee-ws semantics — see submit_word
    -- for the rationale).
    select coalesce(sum(points), 0),
           count(*)
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
    -- compete: leaderboard at timeout, no winner.
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,
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

  -- Realtime touch — same trick as before. common.end_game writes
  -- to common.games; we need a write on freebee.games so the FE's
  -- freebee-channel useGame subscription wakes up and refetches
  -- games_state. The self-set is a no-op semantically but produces
  -- a WAL entry Realtime picks up.
  update freebee.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function freebee.submit_timeout(uuid) from public;
grant execute on function freebee.submit_timeout(uuid) to authenticated;

-- ============================================================
-- 8. freebee.end_game — read mode from freebee.games.mode
-- ============================================================
-- The "End game" menu item handler. Same shape as submit_timeout
-- but with status.outcome='manual'.

create function freebee.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  g_row freebee.games%rowtype;
  current_play_state text;
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

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    -- All-rows count for display, matching freebee-ws.
    select coalesce(sum(points), 0),
           count(*)
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
        'outcome', 'manual',
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
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,
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
        'outcome', 'manual',
        'mode', 'compete'
      ),
      player_results
    );
  end if;

  update freebee.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function freebee.end_game(uuid) from public;
grant execute on function freebee.end_game(uuid) to authenticated;
