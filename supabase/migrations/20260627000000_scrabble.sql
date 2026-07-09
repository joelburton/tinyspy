-- ============================================================
-- scrabble — a Scrabble-style word game
-- ============================================================
--
-- Players build interlocking words from lettered tiles on the standard
-- 15×15 premium-square board, drawing from a shared 100-tile bag.
--
-- "scrabble" is the codename used in SQL, TypeScript, and folder names.
-- The user-facing brand lives only in the FE manifest (see
-- docs/naming.md for the codename-vs-brand split).
--
-- Coop + compete ship as a sibling-manifest pair (`scrabble_coop` +
-- `scrabble_compete`, a denormalized `mode` column, a `mode` arg on
-- create_game) — the pattern waffle/wordle/spellingbee follow.
--   - Compete (2..4): classic turn-based Scrabble. Private per-player
--     racks + scores; only the player whose turn it is may act; highest
--     final score wins.
--   - Coop (1..4, solo OK): ONE shared rack / board / bag / score, NO
--     turn rotation — any player commits a word at any time, planning
--     over chat. The team maximizes its score.
--
-- THE ARCHITECTURE THAT SHAPES THIS FILE — a *trusting* commit, not a
-- server-side re-validation. The intricate logic (placement geometry,
-- reading the main word + every cross-word, scoring with premiums) lives
-- ONCE, in the TS `src/scrabble/lib/play.ts`, where the board already is.
-- The FE evaluates a play instantly (live score + highlighting) and, on
-- submit, hands the server the placements it made, the words it read off,
-- and the score it computed. Per the trust model (players are friends; we
-- don't defend against cheating) the server TRUSTS those and does only the
-- things it alone can:
--   1. check the words against the dictionary (`common.words` is here),
--   2. draw replacement tiles from the HIDDEN bag (fairness without trust),
--   3. keep the books (apply tiles, advance turn, detect end, score-out).
-- Concurrency (esp. coop's shared rack) is handled by OPTIMISTIC
-- CONCURRENCY: `games.version` is a move counter, the FE submits the
-- `base_version` it read, and the commit compare-and-sets under the row
-- lock — a mismatch is rejected `stale` and the FE recomputes. Two cheap
-- integrity guards (placements on empty squares; consumed tiles really in
-- the rack) keep the board/bag accounting honest against a *buggy* client;
-- they are NOT the duplicated word/score logic. See docs/games/scrabble.md
-- §6 for the full reasoning.
--
-- Depends on `common` (clubs, profiles, games, game_players, words,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- validate_timer). Per the removability invariant, common MUST NOT
-- reference scrabble back.

-- ============================================================
-- Schema + usage grant
-- ============================================================
create schema if not exists scrabble;
grant usage on schema scrabble to authenticated;

-- ============================================================
-- Tile constants (the SQL half — mirrors src/scrabble/lib/board.ts)
-- ============================================================
-- Only the BAG distribution and the LETTER VALUES live SQL-side: the bag
-- builder uses the distribution, and final scoring (leftover-rack
-- subtraction) needs the values. The premium grid + word-extraction +
-- per-word scoring do NOT — those are the FE's job (see header).

-- The standard 100-tile English bag, as a flat text[] (`?` = blank ×2).
create function scrabble._new_bag()
returns text[]
language sql
immutable
as $$
  select array_agg(d.tile)
    from (values
      ('?', 2),
      ('E',12),('A', 9),('I', 9),('O', 8),('N', 6),('R', 6),('T', 6),
      ('L', 4),('S', 4),('U', 4),('D', 4),('G', 3),
      ('B', 2),('C', 2),('M', 2),('P', 2),
      ('F', 2),('H', 2),('V', 2),('W', 2),('Y', 2),
      ('K', 1),('J', 1),('X', 1),('Q', 1),('Z', 1)
    ) as d(tile, cnt),
    lateral generate_series(1, d.cnt) g;
$$;

-- Point value of a tile glyph. Blanks (`?`) — and anything non-letter —
-- score 0. Used only for leftover-rack scoring at game end.
create function scrabble._tile_value(ch text)
returns int
language sql
immutable
as $$
  select case upper(ch)
    when 'A' then 1 when 'E' then 1 when 'I' then 1 when 'O' then 1
    when 'U' then 1 when 'L' then 1 when 'N' then 1 when 'S' then 1
    when 'T' then 1 when 'R' then 1
    when 'D' then 2 when 'G' then 2
    when 'B' then 3 when 'C' then 3 when 'M' then 3 when 'P' then 3
    when 'F' then 4 when 'H' then 4 when 'V' then 4 when 'W' then 4
    when 'Y' then 4
    when 'K' then 5
    when 'J' then 8 when 'X' then 8
    when 'Q' then 10 when 'Z' then 10
    else 0
  end;
$$;

-- Remove one occurrence of each tile in `p_remove` from `p_rack`, raising
-- P0001 if a tile isn't there. This is BOTH the "tiles really in the rack"
-- integrity guard AND the consume step — a play whose tiles aren't in the
-- acting rack is rejected here before anything is written.
create function scrabble._remove_tiles(p_rack text[], p_remove text[])
returns text[]
language plpgsql
immutable
as $$
declare
  r   text[] := coalesce(p_rack, '{}');
  t   text;
  pos int;
begin
  foreach t in array p_remove loop
    pos := array_position(r, t);
    if pos is null then
      raise exception 'tile % is not in the rack', t using errcode = 'P0001';
    end if;
    -- splice element `pos` out (works at either end and down to empty)
    r := r[1:pos-1] || r[pos+1:];
  end loop;
  return r;
end;
$$;

-- ============================================================
-- scrabble.games — one row per game
-- ============================================================
-- `board` is the public 15×15 state (a flat 225-element jsonb array; each
-- cell is null or {"l": "Q", "b": false} — `b` = came-from-a-blank, scores
-- 0). `bag` is the HIDDEN remaining draw order (column-excluded; only its
-- COUNT is ever exposed). `version` is the optimistic-concurrency move
-- counter. The coop/compete column asymmetry is deliberate (see §4.2):
-- coop SHARES its rack + score on this row; compete PARTITIONS them onto
-- scrabble.players, and tracks whose turn it is + a scoreless-turn counter
-- for the blocked-game end.
create table scrabble.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode        text not null check (mode in ('coop', 'compete')),
  -- The dictionary acceptance bands (both 1..6): a word is legal iff its
  -- common.words.difficulty <= the band for its length — `dict_2` gates
  -- 2-letter words, `dict_3plus` gates everything 3+ (2-letter words are a
  -- thin, separate vocabulary, like bananagrams). Unlike most games these IS
  -- the bar, not just a puzzle knob — see docs §3.3.
  dict_2      int  not null check (dict_2 between 1 and 6),
  dict_3plus  int  not null check (dict_3plus between 1 and 6),
  board       jsonb not null,                  -- PUBLIC: 225-cell array
  bag         text[] not null,                 -- HIDDEN: remaining draw order
  version     int  not null default 0,         -- optimistic-concurrency counter
  -- Coop-only (null in compete): the shared team rack + score.
  shared_rack text[],
  team_score  int,
  -- Compete-only (null in coop): whose turn (by SEAT, not user — a seat may be
  -- an AI, which has no profile), and the blocked-end counter.
  current_seat          int,
  consecutive_scoreless int not null default 0,
  created_at  timestamptz not null default now()
);

create index scrabble_games_club_handle_idx on scrabble.games (club_handle);

-- Column grant: everything EXCEPT the hidden `bag`. (Enumerating the safe
-- columns is what flips the table from all-visible to granted-only.)
-- (The dictionary bands are server-only config — not granted / not in the
-- view; the FE never validates words.)
grant select
  (id, club_handle, mode, board, version,
   shared_rack, team_score, current_seat, consecutive_scoreless, created_at)
  on scrabble.games to authenticated;

alter table scrabble.games enable row level security;
create policy games_select on scrabble.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- ============================================================
-- scrabble.players — per-player seat / score / rack
-- ============================================================
-- `seat` is the turn order (compete) AND the identity key — a seat may be an
-- AI PLAYER (docs/scrabble-ai-strength.md), which has no profile, so `user_id`
-- is nullable and the PK is (game_id, seat), not (game_id, user_id). Exactly
-- one of `user_id` / `ai_level` is set: a human seat carries `user_id` (and
-- `ai_level` null); an AI seat carries `ai_level` (a LEVELS name from policy.ts)
-- and a null user_id. AI is scrabble-local — it is NOT in common.game_players
-- or common.profiles, so presence-pause and the club roster naturally ignore
-- it. `score` + `rack` are per-seat in COMPETE; in COOP they're null (the rack +
-- score live on games; coop has no AI). `rack` is HIDDEN: a player sees only
-- their own mid-game, everyone's once the game ends (the leftover-tile reveal).
create table scrabble.players (
  game_id uuid not null references scrabble.games(id) on delete cascade,
  user_id uuid references common.profiles(user_id) on delete cascade,
  seat    int  not null,
  score   int,                      -- compete per-seat; null in coop
  rack    text[],                   -- HIDDEN; compete per-seat; null in coop
  ai_level text,                    -- AI seat: a LEVELS name; null for a human
  primary key (game_id, seat),
  -- Exactly one of user_id / ai_level (a seat is human XOR AI).
  constraint players_human_xor_ai check ((user_id is null) <> (ai_level is null)),
  -- A human is seated at most once (nulls — AI seats — are exempt).
  unique (game_id, user_id)
);

create index scrabble_players_game_id_idx on scrabble.players (game_id);

-- Everything except the hidden `rack` (ai_level is public — the FE labels AI seats).
grant select (game_id, user_id, seat, score, ai_level) on scrabble.players to authenticated;

alter table scrabble.players enable row level security;
create policy players_select on scrabble.players
  for select to authenticated
  using (
    exists (
      select 1 from scrabble.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- scrabble.plays — the durable move log
-- ============================================================
-- One row per move, a single per-game sequence. `kind`: 'word' (carries
-- `placements`/`words`/`score`), 'exchange' (`tile_count` returned),
-- 'pass', or 'forfeit' (a coop game ended with tiles still in hand — the
-- leftover-tile value is logged as a NEGATIVE `score`; see end_game).
-- PUBLIC in both modes — every played word is already on the shared public
-- board, so there's nothing to hide here. Only racks + the bag are secret.
create table scrabble.plays (
  game_id    uuid not null references scrabble.games(id) on delete cascade,
  -- The actor: `user_id` for a human seat, null for an AI seat; `seat` is
  -- always set and is the real attribution key (the FE labels an AI seat
  -- "AI 1"…). Coop plays are attributed to the acting human (seat 0-based too).
  user_id    uuid references common.profiles(user_id) on delete cascade,
  seat       int  not null,
  seq        int  not null,
  kind       text not null check (kind in ('word', 'exchange', 'pass', 'forfeit')),
  placements jsonb,                 -- kind='word'
  words      text[],                -- kind='word'
  score      int,                   -- kind='word' (gained) / 'forfeit' (lost, negative)
  tile_count int,                   -- kind='exchange' / 'forfeit'
  played_at  timestamptz not null default now(),
  primary key (game_id, seq)
);

create index scrabble_plays_game_id_idx on scrabble.plays (game_id);

grant select on scrabble.plays to authenticated;

alter table scrabble.plays enable row level security;
create policy plays_select on scrabble.plays
  for select to authenticated
  using (
    exists (
      select 1 from scrabble.games g
       where g.id = plays.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the RPCs below.

-- Realtime: the FE's useGame subscribes to all three.
alter publication supabase_realtime add table scrabble.games;
alter publication supabase_realtime add table scrabble.players;
alter publication supabase_realtime add table scrabble.plays;

-- ============================================================
-- Hidden-state helpers (SECURITY DEFINER) + read views
-- ============================================================
-- The bag's COUNT is public (you can count tiles in real Scrabble); its
-- contents never are. Definer so it can read the grant-hidden column; the
-- security_invoker view calls it as the caller, base-table RLS gates rows.
create function scrabble._bag_count_for(g_id uuid)
returns int
language sql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
  select coalesce(array_length(bag, 1), 0) from scrabble.games where id = g_id;
$$;

revoke execute on function scrabble._bag_count_for(uuid) from public;
grant execute on function scrabble._bag_count_for(uuid) to authenticated;

-- A seat's rack: revealed to its owner (the human at that seat) always, to
-- everyone once the game is terminal (the end-of-game leftover-tile reveal),
-- hidden otherwise. Keyed by SEAT, not user, so an AI seat (null user_id) also
-- reveals its leftovers at terminal (never to a "self" mid-game — nobody owns
-- it). `pl.user_id = auth.uid()` is null-safe: an AI seat's null user never
-- equals the caller, so it stays hidden until is_terminal.
create function scrabble._rack_for(g_id uuid, p_seat int)
returns text[]
language sql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
  select case
           when cg.is_terminal or pl.user_id = auth.uid() then pl.rack
           else null
         end
    from scrabble.players pl
    join common.games cg on cg.id = pl.game_id
   where pl.game_id = g_id and pl.seat = p_seat;
$$;

revoke execute on function scrabble._rack_for(uuid, int) from public;
grant execute on function scrabble._rack_for(uuid, int) to authenticated;

-- A seat's tile COUNT is always public ("Bea: 7 tiles" / "AI 1: 7 tiles").
create function scrabble._rack_count_for(g_id uuid, p_seat int)
returns int
language sql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
  select coalesce(array_length(rack, 1), 0)
    from scrabble.players where game_id = g_id and seat = p_seat;
$$;

revoke execute on function scrabble._rack_count_for(uuid, int) from public;
grant execute on function scrabble._rack_count_for(uuid, int) to authenticated;

-- The seat a human occupies in this game (null if not seated). The turn-check
-- key: the human move RPCs compare the caller's seat to games.current_seat.
create function scrabble._seat_of(g_id uuid, p_user uuid)
returns int
language sql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
  select seat from scrabble.players where game_id = g_id and user_id = p_user;
$$;

revoke execute on function scrabble._seat_of(uuid, uuid) from public;

-- games_state: the FE's read shape. Same granted columns + bag_count.
create view scrabble.games_state with (security_invoker = true) as
  select g.id,
         g.club_handle,
         g.mode,
         g.board,
         g.version,
         g.shared_rack,
         g.team_score,
         g.current_seat,
         g.consecutive_scoreless,
         g.created_at,
         scrabble._bag_count_for(g.id) as bag_count
    from scrabble.games g;

grant select on scrabble.games_state to authenticated;

-- players_state: seat/score/ai_level + conditional rack + always-on rack_count.
create view scrabble.players_state with (security_invoker = true) as
  select p.game_id,
         p.user_id,
         p.seat,
         p.score,
         p.ai_level,
         scrabble._rack_for(p.game_id, p.seat)       as rack,
         scrabble._rack_count_for(p.game_id, p.seat) as rack_count
    from scrabble.players p;

grant select on scrabble.players_state to authenticated;

-- ============================================================
-- Internal game helpers (definer; not client-callable)
-- ============================================================
-- These run inside the move RPCs (which already hold the games row lock).
-- Definer + no grant: callable only from other definer RPCs in this DB.

-- The status jsonb the club-list label reads (manifest.labelFor). Coop:
-- the team score + tiles left. Compete: the per-player leaderboard (scores
-- aren't hidden — the public board reveals them) + whose turn + tiles left.
create function scrabble._status(g_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g scrabble.games%rowtype;
begin
  select * into g from scrabble.games where id = g_id;
  if g.mode = 'coop' then
    return jsonb_build_object(
      'mode', 'coop',
      'team_score', g.team_score,
      'bag_count', coalesce(array_length(g.bag, 1), 0)
    );
  else
    return jsonb_build_object(
      'mode', 'compete',
      'current_seat', g.current_seat,
      'bag_count', coalesce(array_length(g.bag, 1), 0),
      'leaderboard', coalesce((
        select jsonb_agg(jsonb_build_object(
                           'seat', p.seat, 'user_id', p.user_id,
                           'ai_level', p.ai_level, 'score', p.score)
                         order by p.score desc, p.seat)
          from scrabble.players p where p.game_id = g_id
      ), '[]'::jsonb)
    );
  end if;
end;
$$;

-- The club-list title: the first three words played, uppercased — so a game
-- is recognizable at a glance (the board is public, so no spoiler concern in
-- either mode). NULL until the first word is played.
create function scrabble._title(g_id uuid)
returns text
language sql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
  select string_agg(upper(p.words[1]), ' · ' order by p.seq)
    from (
      select seq, words
        from scrabble.plays
       where game_id = g_id and kind = 'word' and words is not null
       order by seq
       limit 3
    ) p;
$$;

revoke execute on function scrabble._title(uuid) from public;

-- Advance compete's turn pointer to the next seat (wraps around).
create function scrabble._advance_turn(g_id uuid)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  n_players int;
  cur_seat  int;
  next_seat int;
  i         int;
begin
  select count(*) into n_players from scrabble.players where game_id = g_id;
  select current_seat into cur_seat from scrabble.games where id = g_id;
  -- Walk forward to the next seat whose occupant hasn't CONCEDED — a drop-out is
  -- skipped in the turn order (with no conceders this is just seat+1). Humans
  -- track concede in common.game_players; an AI seat has no game_players row
  -- (LEFT JOIN → gp null → never conceded, it plays every turn it's dealt). We
  -- never loop forever: scrabble.concede ends the game before the last active
  -- player is gone, so at least one non-conceded seat always exists here.
  next_seat := null;
  for i in 1..n_players loop
    select p.seat into next_seat
      from scrabble.players p
      left join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = g_id
       and p.seat = (cur_seat + i) % n_players
       and not coalesce(gp.conceded, false);
    exit when next_seat is not null;
  end loop;
  if next_seat is not null then
    update scrabble.games set current_seat = next_seat where id = g_id;
  end if;
end;
$$;

-- Tally final scores and end the game. `outcome` ∈ complete | timeout |
-- blocked (NOT manual — manual end is neutral, see scrabble.end_game).
-- `out_seat` is the seat that emptied its rack (going out), or null; only that
-- seat collects the going-out bonus.
--   Coop: team_score -= leftover(shared_rack); always a neutral 'won'
--         (no opponent → never a loss, even on timeout).
--   Compete: each score -= own leftover; the out-player += everyone's
--         leftovers; highest score wins ('won_compete'), ties → co-winners.
create function scrabble._finish(g_id uuid, outcome text, out_seat int)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_mode         text;
  v_team_final   int;
  v_total_left   int;
  v_max          int;
  v_winners      int;
  v_winner_seat  int;
  v_winner_user  uuid;
  v_winner_name  text;
  player_results jsonb;
  v_status       jsonb;
begin
  select mode into v_mode from scrabble.games where id = g_id;

  if v_mode = 'coop' then
    update scrabble.games
       set team_score = team_score
             - coalesce((select sum(scrabble._tile_value(t))
                           from unnest(shared_rack) t), 0)
     where id = g_id
     returning team_score into v_team_final;

    select jsonb_object_agg(user_id::text, jsonb_build_object('won', true))
      into player_results
      from common.game_players where game_id = g_id;

    v_status := jsonb_build_object('mode', 'coop', 'outcome', outcome,
                                   'team_score', v_team_final);
    -- Coop is never a "loss"; a completed game is a green score report.
    perform common.end_game(g_id, 'won', v_status, player_results);
  else
    -- Subtract each player's own leftover tiles.
    update scrabble.players p
       set score = p.score
             - coalesce((select sum(scrabble._tile_value(t))
                           from unnest(p.rack) t), 0)
     where p.game_id = g_id;

    -- The going-out seat collects the sum of everyone's leftover tiles.
    -- (Their own rack is empty, so this is the opponents' leftovers.)
    if out_seat is not null then
      select coalesce(sum(scrabble._tile_value(t)), 0)
        into v_total_left
        from scrabble.players p, unnest(p.rack) t
       where p.game_id = g_id;
      update scrabble.players
         set score = score + v_total_left
       where game_id = g_id and seat = out_seat;
    end if;

    -- Winner = highest score among NON-conceded seats — a drop-out forfeits any
    -- win regardless of the score they'd banked. Humans track concede in
    -- game_players; an AI seat has no gp row (LEFT JOIN → never conceded), and
    -- an AI can win. v_max is NULL if everyone conceded (won:false for all).
    select max(p.score) into v_max
      from scrabble.players p
      left join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = g_id and not coalesce(gp.conceded, false);
    select count(*) into v_winners
      from scrabble.players p
      left join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = g_id and not coalesce(gp.conceded, false) and p.score = v_max;
    -- A unique top score names a winner SEAT (human or AI); a tie → co-winners
    -- (winner_seat null, each top-scorer flagged {won:true}).
    if v_winners = 1 then
      select p.seat, p.user_id into v_winner_seat, v_winner_user
        from scrabble.players p
        left join common.game_players gp
          on gp.game_id = p.game_id and gp.user_id = p.user_id
       where p.game_id = g_id and not coalesce(gp.conceded, false) and p.score = v_max;
    end if;

    -- player_results feeds common.game_players.result — HUMANS ONLY (an AI has
    -- no game_players row; its outcome rides in the status leaderboard). The
    -- inner join drops AI seats. A human is {won} iff they hold the top score
    -- and didn't concede, so a lone AI winner makes every human {won:false}.
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object('won', not gp.conceded and p.score = v_max, 'score', p.score))
      into player_results
      from scrabble.players p
      join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = g_id;

    -- The winner's display name (NULL on a tie / all-conceded): a human's
    -- username, or "AI k" for an AI winner (k = its 1-based position among the
    -- AI seats, in seat order — matches the FE's AI labels).
    if v_winner_seat is not null then
      if v_winner_user is not null then
        select username into v_winner_name from common.profiles where user_id = v_winner_user;
      else
        select 'AI ' || count(*) into v_winner_name
          from scrabble.players
         where game_id = g_id and ai_level is not null and seat <= v_winner_seat;
      end if;
    end if;

    v_status := jsonb_build_object(
      'mode', 'compete', 'outcome', outcome,
      'winner', v_winner_user,        -- a HUMAN winner's uuid; null if AI won / tie
      'winner_seat', v_winner_seat,   -- the winning seat (human or AI); null on tie
      'winner_username', v_winner_name,
      'leaderboard', (select jsonb_agg(
                               jsonb_build_object('seat', seat, 'user_id', user_id,
                                                  'ai_level', ai_level, 'score', score)
                               order by score desc, seat)
                        from scrabble.players where game_id = g_id));

    -- v_max is NULL only when there are zero non-conceded players — i.e.
    -- everyone conceded (the last-active-player concede path calls _finish
    -- with outcome='conceded'). That's a collective loss with no eligible
    -- winner, so end 'lost' rather than 'won_compete': otherwise the FE's
    -- null-winner branch renders a phantom "It's a tie — co-winners!". The
    -- other common-concede games end this same path as 'lost'/'conceded'.
    if v_max is null then
      perform common.end_game(g_id, 'lost', v_status, player_results);
    else
      perform common.end_game(g_id, 'won_compete', v_status, player_results);
    end if;
  end if;
end;
$$;

-- ============================================================
-- Register the gametypes
-- ============================================================
insert into common.gametypes (gametype, min_players) values
  ('scrabble_coop', 1),
  ('scrabble_compete', 2)
on conflict do nothing;

-- ============================================================
-- scrabble.create_game — mode is a positional arg
-- ============================================================
-- Setup shape (server validates):
--   { "dict_2": 1..6 (default 3), "dict_3plus": 1..6 (default 3),
--     "timer": (none | countup | countdown{seconds}) }
-- Builds + shuffles the 100-tile bag, deals 7-tile racks (per-player in
-- compete, one shared rack in coop), picks a random first player (compete),
-- and seeds an empty board.
create function scrabble.create_game(
  target_club     text,
  setup           jsonb,
  player_user_ids uuid[],
  mode            text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  new_id        uuid;
  s_dict_2      int;
  s_dict_3plus  int;
  v_bag         text[];
  v_empty_board jsonb;
  v_first_seat  int;
  uid           uuid;
  v_seat        int := 0;
  v_drawn       text[];
  v_ai_count    int;
  v_ai_level    text;
  v_ai_band     int;
  v_total       int;
  v_i           int;
begin
  perform common.require_club_member(target_club);
  -- Up to 4 players; compete needs at least 2 (a 1-player race is degenerate).
  perform common.require_player_count_max(player_user_ids, 4);
  if array_length(player_user_ids, 1) is null then
    raise exception 'a game needs at least one player' using errcode = 'P0001';
  end if;

  perform common.validate_mode(mode);

  s_dict_2     := coalesce((setup->>'dict_2')::int, 3);
  s_dict_3plus := coalesce((setup->>'dict_3plus')::int, 3);
  if s_dict_2 < 1 or s_dict_2 > 6 then
    raise exception 'setup.dict_2 must be 1..6 (got %)', s_dict_2 using errcode = 'P0001';
  end if;
  if s_dict_3plus < 1 or s_dict_3plus > 6 then
    raise exception 'setup.dict_3plus must be 1..6 (got %)', s_dict_3plus using errcode = 'P0001';
  end if;

  -- AI players (compete only; docs/scrabble-ai-strength.md). 0..3 AI seats, all
  -- at the single `ai_level`; they're scrabble-local (never in
  -- common.game_players / profiles) and seated AFTER the humans.
  v_ai_count := coalesce((setup->>'ai_count')::int, 0);
  if v_ai_count < 0 or v_ai_count > 3 then
    raise exception 'setup.ai_count must be 0..3 (got %)', v_ai_count using errcode = 'P0001';
  end if;
  if v_ai_count > 0 and mode <> 'compete' then
    raise exception 'AI players are a compete-mode feature' using errcode = 'P0001';
  end if;
  if v_ai_count > 0 then
    v_ai_level := setup->>'ai_level';
    -- The AI band is the level's vocabCap (policy.ts LEVELS): beginner 1,
    -- casual 2, intermediate 4, strong/best full (6).
    v_ai_band := case v_ai_level
                   when 'beginner' then 1 when 'casual' then 2
                   when 'intermediate' then 4 when 'strong' then 6 when 'best' then 6
                   else null end;
    if v_ai_band is null then
      raise exception 'unknown ai_level %', coalesce(v_ai_level, '(null)') using errcode = 'P0001';
    end if;
    -- The game's dictionary must be at least as wide as the AI knows, else it
    -- can't play at its tuned strength (docs/scrabble-ai-strength.md band rule).
    if s_dict_2 < v_ai_band or s_dict_3plus < v_ai_band then
      raise exception 'dictionary bands must be >= the AI band (% for level %)',
        v_ai_band, v_ai_level using errcode = 'P0001';
    end if;
  end if;

  -- Player counts: >=1 human always (the empty-array guard above); the TOTAL
  -- (humans + AI) is 2..4 in compete.
  v_total := array_length(player_user_ids, 1) + v_ai_count;
  if mode = 'compete' and v_total < 2 then
    raise exception 'compete mode requires at least 2 players (humans + AI)' using errcode = 'P0001';
  end if;
  if v_total > 4 then
    raise exception 'at most 4 players (humans + AI), got %', v_total using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  -- Shuffle the bag (the only per-game randomness).
  select array_agg(t order by random()) into v_bag
    from unnest(scrabble._new_bag()) t;

  -- An empty board: 225 JSON nulls.
  select jsonb_agg(null::jsonb) into v_empty_board from generate_series(1, 225);

  new_id := common.create_game(
    target_club, 'scrabble_' || mode, player_user_ids, 'New game', setup, setup);

  if mode = 'compete' then
    -- Random first seat among ALL seats (humans 0..h-1, then AI) — an AI may open.
    v_first_seat := floor(random() * v_total)::int;
    insert into scrabble.games
      (id, club_handle, mode, dict_2, dict_3plus, board, bag, current_seat)
    values (new_id, target_club, mode, s_dict_2, s_dict_3plus, v_empty_board, v_bag, v_first_seat);

    -- Deal 7 tiles to each human seat (0..h-1), threading the bag down.
    foreach uid in array player_user_ids loop
      v_drawn := v_bag[1:7];
      v_bag   := v_bag[8:];
      insert into scrabble.players (game_id, user_id, seat, score, rack)
      values (new_id, uid, v_seat, 0, v_drawn);
      v_seat := v_seat + 1;
    end loop;
    -- Then the AI seats (h..h+a-1): same 7-tile deal, carrying the level, no user.
    for v_i in 1..v_ai_count loop
      v_drawn := v_bag[1:7];
      v_bag   := v_bag[8:];
      insert into scrabble.players (game_id, user_id, seat, score, rack, ai_level)
      values (new_id, null, v_seat, 0, v_drawn, v_ai_level);
      v_seat := v_seat + 1;
    end loop;
    -- Qualify the column: `returns table(id uuid)` puts an `id` in scope too.
    update scrabble.games gm set bag = v_bag where gm.id = new_id;
  else
    -- Coop: one shared rack, one team score; seat is positional only.
    v_drawn := v_bag[1:7];
    v_bag   := v_bag[8:];
    insert into scrabble.games
      (id, club_handle, mode, dict_2, dict_3plus, board, bag, shared_rack, team_score)
    values (new_id, target_club, mode, s_dict_2, s_dict_3plus, v_empty_board, v_bag, v_drawn, 0);

    foreach uid in array player_user_ids loop
      insert into scrabble.players (game_id, user_id, seat) values (new_id, uid, v_seat);
      v_seat := v_seat + 1;
    end loop;
  end if;

  perform common.update_state(new_id, 'playing', scrabble._status(new_id));
  return query select new_id;
end;
$$;

revoke execute on function scrabble.create_game(text, jsonb, uuid[], text) from public;
grant execute on function scrabble.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- scrabble.play_word — the core move (a trusting commit)
-- ============================================================
-- The FE validated geometry + computed `words` and `score` (lib/play.ts).
-- `base_version` = the games.version the FE read; `placements` =
-- [{x,y,letter,blank}] (letter is the played letter — a blank's declared
-- letter). The server: version-CAS → turn check → integrity guards →
-- dictionary check (the only validation it does) → apply + draw + score +
-- log + advance + end-check.
--
-- Returns jsonb:
--   { result:'stale',   version }                      -- someone moved first
--   { result:'invalid', bad_words }                    -- a word fails the band (free reject)
--   { result:'accepted', drawn, version, terminal }    -- committed
create function scrabble.play_word(
  target_game  uuid,
  base_version int,
  placements   jsonb,
  words        text[],
  score        int
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id    uuid;
  v_seat       int;      -- the caller's seat (turn key + play attribution)
  g            scrabble.games%rowtype;
  play_state   text;
  v_rack       text[];   -- the acting rack (compete: caller's; coop: shared)
  v_board      jsonb;
  v_consumed   text[] := '{}';
  v_nplay      int := 0;
  rec          jsonb;
  v_x int; v_y int; v_letter text; v_blank boolean; v_idx int;
  bad_words    text[];
  v_ndraw      int;
  v_drawn      text[];
  v_new_rack   text[];
  v_seq        int;
  v_terminal   boolean := false;
  v_went_out   boolean;
begin
  caller_id := common.require_game_player(target_game);
  v_seat    := scrabble._seat_of(target_game, caller_id);

  select * into g from scrabble.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select g2.play_state into play_state from common.games g2 where g2.id = target_game;
  if play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Optimistic-concurrency gate ─────────────────────────
  if g.version <> base_version then
    return jsonb_build_object('result', 'stale', 'version', g.version);
  end if;

  -- ─── Turn check (compete only) ───────────────────────────
  -- By SEAT (current_seat), so the same gate works whoever occupies it.
  if g.mode = 'compete' and v_seat is distinct from g.current_seat then
    raise exception 'not your turn' using errcode = 'P0001';
  end if;

  if coalesce(array_length(words, 1), 0) = 0 then
    raise exception 'a play must form at least one word' using errcode = 'P0001';
  end if;

  v_rack  := case when g.mode = 'coop' then g.shared_rack
                  else (select rack from scrabble.players
                         where game_id = target_game and user_id = caller_id) end;
  v_board := g.board;

  -- ─── Integrity guards: apply placements to a LOCAL board ──
  -- (in-bounds, on an empty square, no two on the same square) and
  -- collect the consumed tile glyphs. Nothing is persisted yet.
  for rec in select jsonb_array_elements(placements) loop
    v_x := (rec->>'x')::int;
    v_y := (rec->>'y')::int;
    v_letter := upper(rec->>'letter');
    v_blank  := coalesce((rec->>'blank')::boolean, false);
    if v_x < 0 or v_x > 14 or v_y < 0 or v_y > 14 then
      raise exception 'placement out of bounds' using errcode = 'P0001';
    end if;
    v_idx := v_y * 15 + v_x;
    if jsonb_typeof(v_board -> v_idx) = 'object' then
      raise exception 'square % is already occupied', v_idx using errcode = 'P0001';
    end if;
    v_consumed := v_consumed || (case when v_blank then '?' else v_letter end);
    v_board := jsonb_set(v_board, array[v_idx::text],
                         jsonb_build_object('l', v_letter, 'b', v_blank));
    v_nplay := v_nplay + 1;
  end loop;

  -- Consume the tiles from the rack (raises P0001 if any aren't there).
  v_rack := scrabble._remove_tiles(v_rack, v_consumed);

  -- ─── Dictionary check (the only server-side validation) ──
  -- Legal iff difficulty <= the band for the word's LENGTH (dict_2 for
  -- 2-letter words, dict_3plus for 3+) AND valid in american OR british
  -- (permissive — both `color` and `colour` are legal). Words are stored
  -- lowercase; the FE's words are uppercase board letters.
  select array_agg(w) into bad_words
    from unnest(words) w
   where not exists (
     select 1 from common.words cw
      where cw.word = lower(w)
        and cw.difficulty <= (case when length(w) = 2 then g.dict_2 else g.dict_3plus end)
        and (cw.american or cw.british)
   );
  if array_length(bad_words, 1) > 0 then
    -- Free reject: nothing written, no version bump, no log.
    return jsonb_build_object('result', 'invalid', 'bad_words', to_jsonb(bad_words));
  end if;

  -- ─── Commit ──────────────────────────────────────────────
  -- Draw replacements from the HIDDEN bag (server-owned randomness).
  v_ndraw := least(v_nplay, coalesce(array_length(g.bag, 1), 0));
  v_drawn := g.bag[1:v_ndraw];
  v_new_rack := v_rack || v_drawn;

  v_seq := coalesce((select max(seq) from scrabble.plays where game_id = target_game), 0) + 1;
  insert into scrabble.plays (game_id, user_id, seat, seq, kind, placements, words, score)
  values (target_game, caller_id, v_seat, v_seq, 'word', placements, words, score);

  if g.mode = 'coop' then
    update scrabble.games
       set board = v_board,
           bag = g.bag[v_ndraw+1:],
           shared_rack = v_new_rack,
           team_score = team_score + play_word.score,
           version = version + 1,
           consecutive_scoreless = 0
     where id = target_game;
  else
    update scrabble.games
       set board = v_board,
           bag = g.bag[v_ndraw+1:],
           version = version + 1,
           consecutive_scoreless = 0
     where id = target_game;
    -- Alias the table so `pl.score` (column) and `play_word.score` (param)
    -- are both unambiguous.
    update scrabble.players pl
       set rack = v_new_rack, score = pl.score + play_word.score
     where pl.game_id = target_game and pl.user_id = caller_id;
  end if;

  -- Title = the first three words played (recognizable in the club list).
  update common.games gm
     set title = coalesce(scrabble._title(target_game), gm.title)
   where gm.id = target_game;

  -- ─── End check: going out (bag empty AND acting rack empty) ──
  v_went_out := coalesce(array_length(g.bag, 1), 0) = v_ndraw  -- bag now empty
                and coalesce(array_length(v_new_rack, 1), 0) = 0;
  if v_went_out then
    v_terminal := true;
    perform scrabble._finish(
      target_game, 'complete',
      case when g.mode = 'compete' then v_seat else null end);
  else
    if g.mode = 'compete' then
      perform scrabble._advance_turn(target_game);
    end if;
    perform common.update_state(target_game, 'playing', scrabble._status(target_game));
  end if;

  return jsonb_build_object(
    'result', 'accepted',
    'drawn', to_jsonb(v_drawn),
    'version', g.version + 1,
    'terminal', v_terminal);
end;
$$;

revoke execute on function scrabble.play_word(uuid, int, jsonb, text[], int) from public;
grant execute on function scrabble.play_word(uuid, int, jsonb, text[], int) to authenticated;

-- ============================================================
-- scrabble.exchange_tiles — swap rack tiles back into the bag
-- ============================================================
-- Return `rack_tiles` (glyphs; `?` for a blank) to the bag, reshuffle, and
-- redraw the same count. Requires the bag to hold ≥ 7 tiles (standard
-- rule). Compete: costs the turn + counts as a scoreless turn (toward the
-- blocked-game end). Coop: just a rack refresh.
create function scrabble.exchange_tiles(
  target_game  uuid,
  base_version int,
  rack_tiles   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id  uuid;
  v_seat     int;
  g          scrabble.games%rowtype;
  play_state text;
  v_rack     text[];
  v_bag      text[];
  v_n        int;
  v_drawn    text[];
  v_seq      int;
  v_terminal boolean := false;
begin
  caller_id := common.require_game_player(target_game);
  v_seat    := scrabble._seat_of(target_game, caller_id);

  select * into g from scrabble.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select g2.play_state into play_state from common.games g2 where g2.id = target_game;
  if play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g.version <> base_version then
    return jsonb_build_object('result', 'stale', 'version', g.version);
  end if;
  if g.mode = 'compete' and v_seat is distinct from g.current_seat then
    raise exception 'not your turn' using errcode = 'P0001';
  end if;

  v_n := coalesce(array_length(rack_tiles, 1), 0);
  if v_n = 0 then
    raise exception 'choose at least one tile to exchange' using errcode = 'P0001';
  end if;
  if coalesce(array_length(g.bag, 1), 0) < 7 then
    raise exception 'not enough tiles in the bag to exchange' using errcode = 'P0001';
  end if;

  v_rack := case when g.mode = 'coop' then g.shared_rack
                 else (select rack from scrabble.players
                        where game_id = target_game and user_id = caller_id) end;

  -- Remove the chosen tiles (guards they're in the rack), return them to
  -- the bag, reshuffle the whole bag, redraw the same count.
  v_rack := scrabble._remove_tiles(v_rack, rack_tiles);
  select array_agg(t order by random()) into v_bag
    from unnest(g.bag || rack_tiles) t;
  v_drawn := v_bag[1:v_n];
  v_bag   := v_bag[v_n+1:];
  v_rack  := v_rack || v_drawn;

  v_seq := coalesce((select max(seq) from scrabble.plays where game_id = target_game), 0) + 1;
  insert into scrabble.plays (game_id, user_id, seat, seq, kind, tile_count)
  values (target_game, caller_id, v_seat, v_seq, 'exchange', v_n);

  if g.mode = 'coop' then
    update scrabble.games set shared_rack = v_rack, bag = v_bag, version = version + 1
     where id = target_game;
  else
    update scrabble.players set rack = v_rack
     where game_id = target_game and user_id = caller_id;
    update scrabble.games
       set bag = v_bag, version = version + 1,
           consecutive_scoreless = consecutive_scoreless + 1
     where id = target_game;
    -- Blocked game: 6 consecutive scoreless turns and nobody can move.
    if g.consecutive_scoreless + 1 >= 6 then
      v_terminal := true;
      perform scrabble._finish(target_game, 'blocked', null);
    else
      perform scrabble._advance_turn(target_game);
    end if;
  end if;

  if not v_terminal then
    perform common.update_state(target_game, 'playing', scrabble._status(target_game));
  end if;

  return jsonb_build_object('result', 'exchanged', 'drawn', to_jsonb(v_drawn),
                            'version', g.version + 1, 'terminal', v_terminal);
end;
$$;

revoke execute on function scrabble.exchange_tiles(uuid, int, text[]) from public;
grant execute on function scrabble.exchange_tiles(uuid, int, text[]) to authenticated;

-- ============================================================
-- scrabble.pass_turn — forfeit a turn (compete only)
-- ============================================================
-- Coop has no turns, so passing is meaningless there (the coop "we're
-- stuck" path is exchange or End game). Counts as a scoreless turn.
create function scrabble.pass_turn(target_game uuid, base_version int)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id  uuid;
  v_seat     int;
  g          scrabble.games%rowtype;
  play_state text;
  v_seq      int;
  v_terminal boolean := false;
begin
  caller_id := common.require_game_player(target_game);
  v_seat    := scrabble._seat_of(target_game, caller_id);

  select * into g from scrabble.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if g.mode <> 'compete' then
    raise exception 'passing only applies in compete mode' using errcode = 'P0001';
  end if;

  select g2.play_state into play_state from common.games g2 where g2.id = target_game;
  if play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g.version <> base_version then
    return jsonb_build_object('result', 'stale', 'version', g.version);
  end if;
  if v_seat is distinct from g.current_seat then
    raise exception 'not your turn' using errcode = 'P0001';
  end if;

  v_seq := coalesce((select max(seq) from scrabble.plays where game_id = target_game), 0) + 1;
  insert into scrabble.plays (game_id, user_id, seat, seq, kind)
  values (target_game, caller_id, v_seat, v_seq, 'pass');

  update scrabble.games
     set version = version + 1,
         consecutive_scoreless = consecutive_scoreless + 1
   where id = target_game;

  if g.consecutive_scoreless + 1 >= 6 then
    v_terminal := true;
    perform scrabble._finish(target_game, 'blocked', null);
  else
    perform scrabble._advance_turn(target_game);
    perform common.update_state(target_game, 'playing', scrabble._status(target_game));
  end if;

  return jsonb_build_object('result', 'passed', 'version', g.version + 1,
                            'terminal', v_terminal);
end;
$$;

revoke execute on function scrabble.pass_turn(uuid, int) from public;
grant execute on function scrabble.pass_turn(uuid, int) to authenticated;

-- ============================================================
-- scrabble.concede — a player drops out of a compete game
-- ============================================================
-- Turn-based, so concede is more than a flag: the conceder is removed
-- from the turn order (_advance_turn skips them), forfeits any win
-- (_finish picks the winner among non-conceded players), and if it was
-- their turn we hand off so the game isn't stuck. When the LAST active
-- player concedes the game ends — final scoring with nobody eligible to
-- win (a collective loss). Compete only (coop has no turns / no race).
create function scrabble.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id  uuid;
  v_active   int;
  is_current boolean;
begin
  perform common.require_compete((select mode from scrabble.games where id = target_game));

  -- Lock the game row so a concede can't race a move / another concede.
  perform 1 from scrabble.games where id = target_game for update;
  caller_id := common._set_conceded(target_game);

  -- Any non-conceded players still in it?
  select count(*) into v_active
    from scrabble.players p
    join common.game_players gp
      on gp.game_id = p.game_id and gp.user_id = p.user_id
   where p.game_id = target_game and not gp.conceded;

  if v_active = 0 then
    -- The last active player conceded → final scoring, nobody eligible to
    -- win (collective loss). _finish excludes conceders, so winner is null.
    perform scrabble._finish(target_game, 'conceded', null);
    return;
  end if;

  -- Others are still playing. If it was the conceder's turn, hand off to the
  -- next non-conceded seat (else the game would stall on a drop-out).
  select (current_seat = scrabble._seat_of(target_game, caller_id)) into is_current
    from scrabble.games where id = target_game;
  if is_current then
    perform scrabble._advance_turn(target_game);
  end if;
  -- Bump version so optimistic-concurrency readers refetch, and mirror state.
  update scrabble.games set version = version + 1 where id = target_game;
  perform common.update_state(target_game, 'playing', scrabble._status(target_game));
end;
$$;

revoke execute on function scrabble.concede(uuid) from public;
grant execute on function scrabble.concede(uuid) to authenticated;

-- ============================================================
-- scrabble.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by the FE when a countdown hits 0. Runs final scoring (NOT
-- neutral) — a Scrabble score is real, so the leader wins (the deliberate
-- deviation from the roster's "timeout = no winner"; see docs §2.7). Coop:
-- a gentle score report. Idempotent on the play_state check.
create function scrabble.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  play_state text;
begin
  -- Lock the gametype row first so concurrent timeout calls serialize.
  -- On countdown expiry EVERY connected client races to call this (by
  -- design, see GamePage). Without the lock both see 'playing' (MVCC)
  -- and both run _finish, which is NOT idempotent — it does
  -- `score = score - Σ tile_value(rack)`, so the leftover-rack penalty
  -- gets subtracted twice and can even flip the winner. The lock makes
  -- the loser of the race wait, then re-read the now-terminal state and
  -- raise below. Mirrors every other scrabble mutation + bananagrams.
  perform 1 from scrabble.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  perform common.require_game_player(target_game);

  select g2.play_state into play_state from common.games g2 where g2.id = target_game;
  if play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Nobody went out — just score the leftover racks and crown the leader.
  perform scrabble._finish(target_game, 'timeout', null);

  -- Realtime touch so the FE's scrabble.* subscription wakes to reveal the
  -- final racks (common.end_game writes only common.games).
  update scrabble.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function scrabble.submit_timeout(uuid) from public;
grant execute on function scrabble.submit_timeout(uuid) to authenticated;

-- ============================================================
-- scrabble.end_game — the "we're done" action
-- ============================================================
-- COOP deviates from the uniform neutral stop: ending with tiles still in
-- hand FORFEITS their value from the team score (so a solo/coop team is
-- pushed to find plays for its last tiles rather than just stopping — the
-- same leftover-tile penalty a natural end applies). It runs final scoring
-- (play_state 'won', the adjusted team score) and logs a 'forfeit' row with
-- the lost value as a negative score. COMPETE keeps the uniform neutral
-- terminal ('ended', everyone {won:false}, no scoring). Idempotent.
create function scrabble.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id      uuid;
  v_seat         int;
  g              scrabble.games%rowtype;
  cur_state      text;
  player_results jsonb;
  v_leftover     int;
  v_seq          int;
begin
  caller_id := common.require_game_player(target_game);
  v_seat    := scrabble._seat_of(target_game, caller_id);

  select * into g from scrabble.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select g2.play_state into cur_state from common.games g2 where g2.id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g.mode = 'coop' then
    -- Log the leftover-tile value lost (negative), then score it out.
    v_leftover := coalesce((select sum(scrabble._tile_value(t))
                              from unnest(g.shared_rack) t), 0);
    if v_leftover > 0 then
      v_seq := coalesce((select max(seq) from scrabble.plays where game_id = target_game), 0) + 1;
      insert into scrabble.plays (game_id, user_id, seat, seq, kind, score, tile_count)
      values (target_game, caller_id, v_seat, v_seq, 'forfeit', -v_leftover,
              coalesce(array_length(g.shared_rack, 1), 0));
    end if;
    perform scrabble._finish(target_game, 'manual', null);
  else
    select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
      into player_results
      from common.game_players where game_id = target_game;
    perform common.end_game(
      target_game, 'ended', jsonb_build_object('outcome', 'manual'), player_results);
  end if;

  -- Realtime touch (see submit_timeout) — wakes the games subscription so the
  -- FE reveals the final racks even on the compete neutral path.
  update scrabble.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function scrabble.end_game(uuid) from public;
grant execute on function scrabble.end_game(uuid) to authenticated;

-- ============================================================
-- scrabble.get_suggest_context — read-only RPC for the move suggester
-- ============================================================
-- The `scrabble-suggest-move` Edge Function (docs/scrabble-ai.md) needs the
-- dictionary bands to generate only game-legal moves — but dict_2/dict_3plus
-- are deliberately EXCLUDED from the column grant on scrabble.games (they're
-- server-only config; the FE never validates words — §3.3 above). This
-- SECURITY DEFINER RPC is the one sanctioned door, the exact shape of
-- codenamesduet.get_clue_context: membership is the authorization, and the
-- feature gate ("suggestions are a coop feature") lives HERE, not in the
-- edge function — the client can't ask for hints under the wrong gate.
--
-- One SELECT returns an atomic, mutually consistent snapshot: a teammate's
-- concurrent play can't tear board from rack, and `version` rides along so
-- the FE can detect a suggestion that went stale in flight (coop has no
-- turns, so that race is real).

create function scrabble.get_suggest_context(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g scrabble.games%rowtype;
  current_play_state text;
begin
  -- Membership is the FIRST gate: a non-member gets the same "not your game"
  -- regardless of whether the game exists, so they can't probe game IDs. (Moot
  -- under the friends trust model, but membership-is-the-first-gate is the
  -- house convention — docs/scrabble-ai-fixes.md §8.)
  perform common.require_game_player(target_game);

  select * into g from scrabble.games where id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'no suggestions outside of active play' using errcode = 'P0001';
  end if;

  -- Compete hints are a house-rules question, deliberately deferred
  -- (docs/scrabble-ai.md "Deferred") — and in compete the rack is private,
  -- so this gate is also what keeps the suggester from becoming a
  -- rack-reading side channel.
  if g.mode <> 'coop' then
    raise exception 'suggestions are a coop-mode feature' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'board', g.board,
    'rack', to_jsonb(g.shared_rack),
    'dict_2', g.dict_2,
    'dict_3plus', g.dict_3plus,
    'version', g.version
  );
end;
$$;

revoke execute on function scrabble.get_suggest_context(uuid) from public;
grant execute on function scrabble.get_suggest_context(uuid) to authenticated;
