-- cs-unmet

-- ============================================================
-- wordsy
-- ============================================================
-- What the frontend calls:
--
--   create_game     shuffles the deck and deals round 1
--   submit_word     a player's word for the round in play
--   submit_timeout  ends the round when its 30 seconds run out
--   concede         a player drops out
--   stop_game       stops the game for everyone, with no result
--   replay_board    the same deck, dealt again from round 1
--
-- What is particular to wordsy (plans/wordsy.md has the rest):
--   - A card is its deck number, 1–60, and the number says its letter and
--     its bonus (`_tile_letter`, `_tile_bonus`): 1–44 the common letters,
--     45–56 the red +1s, 57–60 the blue +2s. The deck is one frozen shuffle,
--     and `drawn` the numbers dealt so far.
--   - A card the rules of two refuse is SKIPPED, not discarded: it waits in
--     its place in the deck and is dealt when it fits (`_deal_tile`).
--   - A round has two ends. In the `timer` style the first submit starts a
--     30-second clock and the round ends at zero (`submit_timeout`); in the
--     `no-timer` style, and with the setup's `one_word`, it ends when everyone
--     still playing has submitted (`_is_one_word`) — with the timer, whichever
--     comes first.
--   - Between rounds the game waits: a round's end reveals its scoresheet,
--     and the next is dealt once everyone still playing has pressed "Start
--     round N" (`start_round`, `players.ready_for_num`).
--   - The clock is the game's one `common.timers` row, armed by the first
--     submit and put away at the round's end (`_arm_timer`, `_disarm_timer`);
--     shell_data carries its kind to the header.
--   - The last submit stands, except the round's first, which is frozen: that
--     player is the Fastest Wordsmith. In `no-timer`, and with `one_word`,
--     every submit is final.
--   - A game is seven rounds, the best five counted, or a short game's three,
--     the best two (`n_rounds`, `_n_best_rounds`).
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema wordsy to authenticated;

-- Column grant: everything EXCEPT `deck`, setgame's argument — the undealt
-- order is the secret, and nothing ever reveals it. `drawn` is granted: every
-- number in it has been faceup.
grant select (game_id, drawn, legal_band, round_style)
  on wordsy.games to authenticated;
drop policy if exists games_select on wordsy.games;
create policy games_select on wordsy.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on wordsy.players to authenticated;
drop policy if exists players_select on wordsy.players;
create policy players_select on wordsy.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on wordsy.rounds to authenticated;
drop policy if exists rounds_select on wordsy.rounds;
create policy rounds_select on wordsy.rounds
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = rounds.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Events are the reveal: every row is a word everyone has seen.
grant select on wordsy.events to authenticated;
drop policy if exists events_select on wordsy.events;
create policy events_select on wordsy.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- No grant on `round_words`: the page reads the blobs, and a word standing in
-- a round still open is nobody else's to read. RLS is on with no policy, so
-- the table answers nothing to a client.

-- ============================================================
-- The cards — a deck number's letter, bonus and slot value
-- ============================================================
-- The frontend's `lib/tiles.ts` writes the same mapping; a test pins the two on
-- all 60.

-- The letter on card `p_id`: B C D G L M N P R S T four each, then F H K V W
-- Y two each, then J Q X Z.
create or replace function wordsy._tile_letter(p_id smallint)
returns text
language sql
immutable
as $$
  select case
    when p_id <= 44 then substr('bcdglmnprst', (p_id - 1) / 4 + 1, 1)
    when p_id <= 56 then substr('fhkvwy', (p_id - 45) / 2 + 1, 1)
    else substr('jqxz', p_id - 56, 1)
  end;
$$;
revoke execute on function wordsy._tile_letter(smallint) from public;

-- The bonus printed on card `p_id`: 0 common, 1 red, 2 blue.
create or replace function wordsy._tile_bonus(p_id smallint)
returns int
language sql
immutable
as $$
  select case when p_id <= 44 then 0 when p_id <= 56 then 1 else 2 end;
$$;
revoke execute on function wordsy._tile_bonus(smallint) from public;

-- What slot `p_slot` (1–8) is worth: its column's value, 5 5 4 4 3 3 2 2.
create or replace function wordsy._slot_value(p_slot int)
returns int
language sql
immutable
as $$
  select 5 - (p_slot - 1) / 2;
$$;
revoke execute on function wordsy._slot_value(int) from public;

-- ============================================================
-- wordsy._score_word — a word against a table
-- ============================================================
-- For each distinct letter in the word, as many of that letter's faceup cards
-- as the word has of it, the highest-valued first, each worth its slot's
-- value plus its bonus. So two Bs against one B card score one B, and one C
-- against two C cards scores the better C. A letter with no card scores
-- nothing, and '' scores 0. The frontend's `scoreWord` mirrors it.
create or replace function wordsy._score_word(p_word text, p_tiles smallint[])
returns int
language sql
immutable
as $$
  select coalesce(sum(c.worth), 0)::int
    from (
      select wordsy._slot_value(slot::int) + wordsy._tile_bonus(id) as worth,
             row_number() over (
               partition by wordsy._tile_letter(id)
               order by wordsy._slot_value(slot::int) + wordsy._tile_bonus(id) desc
             ) as nth,
             w.n
        from unnest(p_tiles) with ordinality as t(id, slot)
        join (
          select ch, count(*) as n
            from regexp_split_to_table(p_word, '') as ch
           group by ch
        ) w on w.ch = wordsy._tile_letter(t.id)
    ) c
   where c.nth <= c.n;
$$;
revoke execute on function wordsy._score_word(text, smallint[]) from public;

-- ============================================================
-- The words — legal and original
-- ============================================================

-- `p_word` may be entered at band `p_band`: the may-enter tier, band alone
-- (docs/word-list.md → Which words a game may use).
create or replace function wordsy._is_legal(p_word text, p_band int)
returns boolean
language sql
stable
as $$
  select exists (select 1 from common.words where word = p_word and band <= p_band);
$$;
revoke execute on function wordsy._is_legal(text, int) from public;

-- The lemma: fishes and fishing are fish; fishy and fisherman are themselves.
create or replace function wordsy._root_of(p_word text)
returns text
language sql
stable
as $$
  select coalesce((select root_word from common.words where word = p_word), p_word);
$$;
revoke execute on function wordsy._root_of(text) from public;

-- The word scored in an earlier round, anyone's, that shares `p_word`'s root;
-- null when there is none and `p_word` is original. A word twice in the same
-- round is not this: only finished rounds are in the log.
create or replace function wordsy._earlier_word_with_root(p_game_id uuid, p_word text)
returns text
language sql
stable
as $$
  select e.word
    from wordsy.events e
   where e.game_id = p_game_id
     and e.word <> ''
     and wordsy._root_of(e.word) = wordsy._root_of(p_word)
   order by e.id
   limit 1;
$$;
revoke execute on function wordsy._earlier_word_with_root(uuid, text) from public;

-- ============================================================
-- The deal
-- ============================================================

-- The next card for a slot: the first number in the deck not yet drawn whose
-- card keeps the rules of two against `p_table`, the cards that will share the
-- table with it (nulls are empty slots). At most two of a letter; at most two
-- rare cards, red and blue together. A card refused here stays in the deck,
-- in its place, for a later deal.
create or replace function wordsy._deal_tile(
  p_deck  smallint[],
  p_drawn smallint[],
  p_table smallint[]
)
returns smallint
language sql
immutable
as $$
  select d.id
    from unnest(p_deck) with ordinality as d(id, o)
   where not (d.id = any(p_drawn))
     and (select count(*) from unnest(p_table) t
           where t is not null and wordsy._tile_letter(t) = wordsy._tile_letter(d.id)) < 2
     and (wordsy._tile_bonus(d.id) = 0
          or (select count(*) from unnest(p_table) t
               where t is not null and wordsy._tile_bonus(t) > 0) < 2)
   order by d.o
   limit 1;
$$;
revoke execute on function wordsy._deal_tile(smallint[], smallint[], smallint[]) from public;

-- Deal round `p_num`: round 1 fills slots 8 down to 1, the rulebook's right
-- to left; a later round moves the last round's slots 1–4 into 5–8 and deals
-- slots 4 down to 1. Writes the round's row, the drawn numbers and the
-- game's title. `p_no_flip_user_id` holds No Flip this round;
-- `p_first_user_id` is the First Wordsmith in `no-timer`, null otherwise.
create or replace function wordsy._deal_round(
  p_game_id         uuid,
  p_num             int,
  p_no_flip_user_id uuid,
  p_first_user_id   uuid
)
returns void
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  g       wordsy.games%rowtype;
  v_tiles smallint[] := array_fill(null::smallint, array[8]);
  v_drawn smallint[];
  v_prev  smallint[];
  v_tile  smallint;
  v_slot  int;
begin
  select * into g from wordsy.games where game_id = p_game_id;
  v_drawn := g.drawn;

  if p_num > 1 then
    select tiles into v_prev from wordsy.rounds where game_id = p_game_id and num = p_num - 1;
    v_tiles[5:8] := v_prev[1:4];
  end if;

  for v_slot in reverse (case when p_num = 1 then 8 else 4 end) .. 1 loop
    v_tile := wordsy._deal_tile(g.deck, v_drawn, v_tiles);
    if v_tile is null then
      -- Seven rounds take 32 cards of 60, and eight faceup can block at most
      -- five letters, so a fitting card is always left.
      raise exception 'BUG: no card left to deal'
        using errcode = 'PN553', hint = 'fault', column = '_',
        detail = format('round %s, slot %s: no undrawn card keeps the rules of two', p_num, v_slot);
    end if;
    v_tiles[v_slot] := v_tile;
    v_drawn := v_drawn || v_tile;
  end loop;

  insert into wordsy.rounds (game_id, num, tiles, fastest_user_id, no_flip_user_id)
  values (p_game_id, p_num, v_tiles, p_first_user_id, p_no_flip_user_id);

  update wordsy.games set drawn = v_drawn where game_id = p_game_id;

  update common.games
     set title = format('Round %s of %s', p_num, g.n_rounds)
   where id = p_game_id;
end;
$$;
revoke execute on function wordsy._deal_round(uuid, int, uuid, uuid) from public;

-- ============================================================
-- The round clock — the game's one common.timers row
-- ============================================================
-- Armed by the round's first submit, put away at its end. Both zero the count,
-- so the next clock starts from its full 30 and a page mounting between rounds
-- seeds 0. The builder's next call carries the kind to the header through
-- shell_data (docs/common-schema.md → The game clock).

create or replace function wordsy._arm_timer(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordsy, common, public, extensions
as $$
  update common.timers
     set kind = 'countdown', countdown_seconds_at_setup = 30, ticks = 0, last_tick = now()
   where game_id = p_game_id;
$$;
revoke execute on function wordsy._arm_timer(uuid) from public;

create or replace function wordsy._disarm_timer(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordsy, common, public, extensions
as $$
  update common.timers
     set kind = 'none', countdown_seconds_at_setup = null, ticks = 0, last_tick = now()
   where game_id = p_game_id;
$$;
revoke execute on function wordsy._disarm_timer(uuid) from public;

-- ============================================================
-- The totals
-- ============================================================

-- How many rounds' word scores count: the best five of seven, the rulebook's;
-- the best two of a short game's three.
create or replace function wordsy._n_best_rounds(p_n_rounds int)
returns int
language sql
immutable
as $$
  select case when p_n_rounds = 3 then 2 else 5 end;
$$;
revoke execute on function wordsy._n_best_rounds(int) from public;

-- Each player's total so far — the best word scores (`_n_best_rounds`) plus
-- every bonus — and how many bonuses they have, summed off the log.
create or replace function wordsy._player_totals(p_game_id uuid)
returns table (user_id uuid, total int, n_bonuses int)
language sql
stable
as $$
  select p.user_id,
         (coalesce((select sum(best.score)
                      from (select e.score from wordsy.events e
                             where e.game_id = p_game_id and e.user_id = p.user_id
                             order by e.score desc
                             limit wordsy._n_best_rounds(g.n_rounds)) best), 0)
          + coalesce((select sum(e.bonus) from wordsy.events e
                       where e.game_id = p_game_id and e.user_id = p.user_id), 0))::int,
         (select count(*) from wordsy.events e
           where e.game_id = p_game_id and e.user_id = p.user_id and e.bonus > 0)::int
    from wordsy.players p
    join wordsy.games g on g.game_id = p.game_id
   where p.game_id = p_game_id;
$$;
revoke execute on function wordsy._player_totals(uuid) from public;

-- Every submit is final and a round ends once everyone still playing has
-- submitted: always in the no-timer style, and in the timer style when the
-- setup's `one_word` says so — where the clock can still end it first.
create or replace function wordsy._is_one_word(g wordsy.games)
returns boolean
language sql
immutable
as $$
  select g.round_style = 'no-timer' or g.one_word;
$$;
revoke execute on function wordsy._is_one_word(wordsy.games) from public;

-- Everyone still playing has a word in for round `p_num`.
create or replace function wordsy._is_everyone_in(p_game_id uuid, p_num int)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from common.game_players gp
     where gp.game_id = p_game_id and gp.player_ended_at is null
       and not exists (select 1 from wordsy.round_words rw
                        where rw.game_id = p_game_id and rw.num = p_num
                          and rw.user_id = gp.user_id));
$$;
revoke execute on function wordsy._is_everyone_in(uuid, int) from public;

-- The players still playing: not conceded, game not over.
create or replace function wordsy._n_still_playing(p_game_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int from common.game_players
   where game_id = p_game_id and player_ended_at is null;
$$;
revoke execute on function wordsy._n_still_playing(uuid) from public;

-- ============================================================
-- wordsy._finish — the last round's end is the game's
-- ============================================================
-- Ranked by total among the players who did not concede and scored above
-- zero, ties sharing the rank (docs/win-lose.md → co-winners). Ended by the
-- last player to submit, or by nobody when the clock ran out.
create or replace function wordsy._finish(p_game_id uuid, p_ended_by_user_id uuid)
returns void
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  v_rankings jsonb;
begin
  select coalesce(jsonb_object_agg(ranked.user_id::text, ranked.ranking), '{}'::jsonb)
    into v_rankings
    from (
      select t.user_id, rank() over (order by t.total desc) as ranking
        from wordsy._player_totals(p_game_id) t
        join common.game_players gp
          on gp.game_id = p_game_id and gp.user_id = t.user_id
       where gp.player_ended_reason is distinct from 'conceded'
         and t.total > 0
    ) ranked;

  perform common._end_game(
    p_game_id, 'resource_exhausted', 'rounds_played', p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;
revoke execute on function wordsy._finish(uuid, uuid) from public;

-- ============================================================
-- wordsy._end_round — reveal and score
-- ============================================================
-- The one end every round reaches: `submit_timeout` in `timer`, the last
-- submit or a concede in `no-timer` or a `one_word` game. Each player still
-- playing is scored on their standing word, or on no word ('', 0), and the
-- rows are written in the order the words came in, the Fastest's first. Every standing word was checked
-- at its submit and no earlier round changes after it ends, so nothing is
-- re-checked here.
--
-- The bonuses, for round r: beat 1 / 2 / 3 and fastest 2 / 3 / 4 for rounds
-- 1–3 / 4–6 / 7. A player whose score is strictly above the Fastest's gets
-- beat. The Fastest gets fastest when the opponents at or below their score
-- reach min(3, opponents), the opponents being the others still playing
-- (plans/wordsy.md, decision 10). A Fastest who has conceded gives nobody a
-- bonus. In `no-timer` the First Wordsmith stands in for the Fastest.
--
-- Then the last round ends the game. Any other round waits, its scoresheet
-- on every page, until everyone still playing has pressed "Start round N"
-- (`start_round`, which deals it with `_deal_next_round`).
create or replace function wordsy._end_round(p_game_id uuid, p_ended_by_user_id uuid)
returns void
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  g          wordsy.games%rowtype;
  r          wordsy.rounds%rowtype;
  v_beat     int;
  v_fastest  int;
begin
  select * into g from wordsy.games where game_id = p_game_id;
  select * into r from wordsy.rounds
   where game_id = p_game_id and ended_at is null;

  v_beat    := case when r.num <= 3 then 1 when r.num <= 6 then 2 else 3 end;
  v_fastest := v_beat + 1;

  with scored as (
    select cp.ord, cp.id as user_id, rw.submitted_at,
           coalesce(rw.word, '') as word,
           wordsy._score_word(coalesce(rw.word, ''), r.tiles) as score
      from common._make_json_players(p_game_id) cp
      left join wordsy.round_words rw
        on rw.game_id = p_game_id and rw.num = r.num and rw.user_id = cp.id
     where (cp.player ->> 'stillPlaying')::boolean
  ),
  fastest as (
    select s.score from scored s where s.user_id = r.fastest_user_id
  )
  insert into wordsy.events (game_id, user_id, kind, took_turn, num, word, score, bonus)
  select p_game_id, s.user_id, 'word', true, r.num, s.word, s.score,
         case
           when not exists (select 1 from fastest) then 0
           when s.user_id = r.fastest_user_id then
             case when (select count(*) from scored o
                         where o.user_id <> s.user_id and o.score <= s.score)
                       >= least(3, (select count(*) from scored o where o.user_id <> s.user_id))
                  then v_fastest else 0 end
           when s.score > (select f.score from fastest f) then v_beat
           else 0
         end
    from scored s
   -- The reveal's order, which the log and the scoresheet keep: the Fastest
   -- (or First Wordsmith) first, the word everyone is measured against, then
   -- the rest as their standing words came in, then no word, in seat order.
   order by s.user_id is distinct from r.fastest_user_id, s.submitted_at nulls last, s.ord;

  update wordsy.rounds set ended_at = now()
   where game_id = p_game_id and num = r.num;

  perform wordsy._disarm_timer(p_game_id);

  if r.num = g.n_rounds then
    perform wordsy._finish(p_game_id, p_ended_by_user_id);
  end if;
end;
$$;
revoke execute on function wordsy._end_round(uuid, uuid) from public;

-- Everyone still playing has pressed "Start round `p_num`".
create or replace function wordsy._is_everyone_ready(p_game_id uuid, p_num int)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from common.game_players gp
      join wordsy.players p on p.game_id = gp.game_id and p.user_id = gp.user_id
     where gp.game_id = p_game_id and gp.player_ended_at is null
       and p.ready_for_num is distinct from p_num);
$$;
revoke execute on function wordsy._is_everyone_ready(uuid, int) from public;

-- Deal the round after the last one ended. Its Fastest takes No Flip unless
-- two or fewer are still playing (decision 19), and in `no-timer` the next
-- First Wordsmith is the player still playing with the fewest bonuses, ties to
-- the next seat after the last round's.
create or replace function wordsy._deal_next_round(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  g          wordsy.games%rowtype;
  r          wordsy.rounds%rowtype;
  v_n_seats  int;
  v_cur_ord  int;
  v_no_flip  uuid;
  v_first    uuid;
begin
  select * into g from wordsy.games where game_id = p_game_id;
  select * into r from wordsy.rounds
   where game_id = p_game_id order by num desc limit 1;

  if g.round_style = 'timer' then
    if wordsy._n_still_playing(p_game_id) > 2
       and exists (select 1 from common.game_players
                    where game_id = p_game_id and user_id = r.fastest_user_id
                      and player_ended_at is null) then
      v_no_flip := r.fastest_user_id;
    end if;
  else
    select count(*) into v_n_seats from common.game_players where game_id = p_game_id;
    select cp.ord into v_cur_ord
      from common._make_json_players(p_game_id) cp where cp.id = r.fastest_user_id;
    select cp.id into v_first
      from common._make_json_players(p_game_id) cp
      join wordsy._player_totals(p_game_id) t on t.user_id = cp.id
     where (cp.player ->> 'stillPlaying')::boolean
     order by t.n_bonuses, (cp.ord - v_cur_ord - 1 + v_n_seats) % v_n_seats
     limit 1;
  end if;

  perform wordsy._deal_round(p_game_id, r.num + 1, v_no_flip, v_first);
end;
$$;
revoke execute on function wordsy._deal_next_round(uuid) from public;

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- wordsy's own. `game_data` is the common part (supabase/sql/common.sql → The
-- page blobs' common parts) with wordsy's on top.
--
-- One blob serves every seat, so each player's standing word is in it while
-- the round is open; the game's `useGame` drops a rival's (plans/seat-view.md
-- → The security line is `useGame`). The deck's order is the one thing left
-- out; only its count is here.
--
-- `static_game_data` is the common part alone: the table changes every round.
--
--   game_data, wordsy's part:
--     team                                 null: compete only, so no team
--     nRounds                              7, or a short game's 3
--     nBestRounds                          how many rounds' words count: 5, or 2
--     nTilesInDeck                         60 less the cards dealt
--     rounds: [round, …]                   every round dealt, the one in play last
--     events: [{id, userId, kind, num, word, score, bonus, tookTurn, at}, …]
--                                          every finished round's words; per round
--                                          the Fastest's first, then as they came
--                                          in, no word last; word '' for none
--     players: [player, …]                 the common player, plus:
--       total                              the best rounds + bonuses, so far
--       nBonuses                           how many bonuses
--       roundScores: [int | null × nRounds] score + bonus per finished round;
--                                          null for a round not played
--       hasSubmitted                       this round
--       word                               this round's standing word, or null
--       isWordFrozen                       this round's word can no longer change
--       isReadyForNextRound                between rounds, pressed "Start round N"
--
--   round:
--     num                                  1..nRounds
--     tiles: [{id, letter, bonus, slot, value}, …]   slot order; id the deck number as text
--     fastest                              user id | null: the Fastest (or First) Wordsmith
--     noFlipHolder                         user id | null
--     isTimerRunning                       timer style, the clock started, the round open
--     ended
--
--   summary_data, wordsy's part:
--     team                                 null: compete only
--     nRoundsPlayed
--     winnerTotal                          the total the winners share; null until the end
--     nRounds
--     legalBand
--     roundStyle
--     oneWord

-- A round's eight cards, in slot order.
create or replace function wordsy._make_json_tiles(p_tiles smallint[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',     t.id::text,
           'letter', wordsy._tile_letter(t.id),
           'bonus',  wordsy._tile_bonus(t.id),
           'slot',   t.slot,
           'value',  wordsy._slot_value(t.slot::int)) order by t.slot), '[]'::jsonb)
    from unnest(p_tiles) with ordinality as t(id, slot);
$$;
revoke execute on function wordsy._make_json_tiles(smallint[]) from public;

-- Every round dealt, in order.
create or replace function wordsy._make_json_rounds(p_game_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'num',            r.num,
           'tiles',          wordsy._make_json_tiles(r.tiles),
           'fastest',        r.fastest_user_id,
           'noFlipHolder',   r.no_flip_user_id,
           'isTimerRunning', g.round_style = 'timer'
                             and r.timer_started_at is not null and r.ended_at is null,
           'ended',          r.ended_at is not null) order by r.num), '[]'::jsonb)
    from wordsy.rounds r
    join wordsy.games g on g.game_id = r.game_id
   where r.game_id = p_game_id;
$$;
revoke execute on function wordsy._make_json_rounds(uuid) from public;

-- The log, in the order it was written.
create or replace function wordsy._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',       e.id,
           'userId',   e.user_id,
           'kind',     e.kind,
           'num',      e.num,
           'word',     e.word,
           'score',    e.score,
           'bonus',    e.bonus,
           'tookTurn', e.took_turn,
           'at',       e.created_at) order by e.id), '[]'::jsonb)
    from wordsy.events e
   where e.game_id = p_game_id;
$$;
revoke execute on function wordsy._make_json_events(uuid) from public;

-- Every player as wordsy's game_data shows them: the common player, with their
-- totals and this round's word.
create or replace function wordsy._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
as $$
  with open_round as (
    select r.num, r.fastest_user_id, wordsy._is_one_word(g) as is_one_word
      from wordsy.rounds r
      join wordsy.games g on g.game_id = r.game_id
     where r.game_id = p_game_id and r.ended_at is null
  )
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'total',        t.total,
             'nBonuses',     t.n_bonuses,
             'roundScores',  (select jsonb_agg(
                                       (select e.score + e.bonus from wordsy.events e
                                         where e.game_id = p_game_id and e.user_id = cp.id
                                           and e.num = n)
                                       order by n)
                                from generate_series(1, (select n_rounds from wordsy.games
                                                         where game_id = p_game_id)) n),
             'hasSubmitted', rw.word is not null,
             'word',         rw.word,
             'isWordFrozen', rw.word is not null
                             and (o.is_one_word or o.fastest_user_id = cp.id),
             'isReadyForNextRound', coalesce(o.num is null
                                    and wp.ready_for_num = (select max(num) + 1 from wordsy.rounds
                                                             where game_id = p_game_id), false))
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join wordsy._player_totals(p_game_id) t on t.user_id = cp.id
    join wordsy.players wp on wp.game_id = p_game_id and wp.user_id = cp.id
    left join open_round o on true
    left join wordsy.round_words rw
      on rw.game_id = p_game_id and rw.num = o.num and rw.user_id = cp.id;
$$;
revoke execute on function wordsy._make_json_players(uuid) from public;

-- The whole game_data blob.
create or replace function wordsy._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'team',         null,
           'nRounds',      g.n_rounds,
           'nBestRounds',  wordsy._n_best_rounds(g.n_rounds),
           'nTilesInDeck', 60 - cardinality(g.drawn),
           'rounds',       wordsy._make_json_rounds(p_game_id),
           'events',       wordsy._make_json_events(p_game_id),
           'players',      wordsy._make_json_players(p_game_id))
    from wordsy.games g
   where g.game_id = p_game_id;
$$;
revoke execute on function wordsy._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function wordsy._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',          null,
    'nRoundsPlayed', (select count(*)::int from wordsy.rounds r
                       where r.game_id = p_game_id and r.ended_at is not null),
    'winnerTotal',   (select max(t.total)
                        from wordsy._player_totals(p_game_id) t
                        join common.game_players gp
                          on gp.game_id = p_game_id and gp.user_id = t.user_id
                       where gp.final_ranking = 1),
    'nRounds',       g.n_rounds,
    'legalBand',     g.legal_band,
    'roundStyle',    g.round_style,
    'oneWord',       g.one_word)
    from wordsy.games g
   where g.game_id = p_game_id;
$$;
revoke execute on function wordsy._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- wordsy._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds `game_data`, `summary_data` and `shell_data` from wordsy's own
-- tables, each whole. Every RPC calls it after a move; it is also the repair
-- for one game by hand. `p_update_status_changed_at` is false from a rebuild,
-- so a rebuild never re-dates a game.
create or replace function wordsy._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = wordsy._make_json_game_data(p_game_id),
         summary_data = wordsy._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;
revoke execute on function wordsy._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- wordsy._write_static_game_data — one game's static blob, written
-- ============================================================
-- `create_game` calls this once, and `_rebuild_data_cols_for_all` for a shape
-- change. wordsy adds nothing to the common part.
create or replace function wordsy._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordsy, common, public, extensions
as $$
  update common.games
     set static_game_data = common._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;
revoke execute on function wordsy._write_static_game_data(uuid) from public;

-- ============================================================
-- wordsy._rebuild_data_cols_for_all — every wordsy game's, rebuilt
-- ============================================================
-- For a shape change: both builders over every wordsy game without re-dating
-- any, answering how many it rewrote. Run by hand as postgres (`gmake
-- db-psql`); no client calls it, so it has no grant and wears the `_`.
create or replace function wordsy._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype = 'wordsy_compete'
  loop
    perform wordsy._write_static_game_data(v_game_id);
    perform wordsy._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function wordsy._rebuild_data_cols_for_all() from public;

-- ============================================================
-- wordsy.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Setup shape: { "timer": {"kind": "none"},
--                "legal_band": 1..6,
--                "round_style": 'timer' | 'no-timer',
--                "n_rounds": 7 | 3,
--                "one_word": true | false }.
--
-- The timer is fixed at none: the round's 30 seconds are the game's own clock,
-- armed and put away each round, so there is no whole-game timer to choose.
-- Compete only until a coop sibling exists. The deck is shuffled inline and
-- round 1 dealt before anyone sees the table; in `no-timer` its First
-- Wordsmith is drawn at random.
create or replace function wordsy.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text
)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  new_id        uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_legal_band  int;
  s_round_style text;
  s_n_rounds    int;
  s_one_word    boolean;
  v_first       uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in the game's manifest ([2, 6]).
  perform common._require_player_count_max(p_player_user_ids, 6);

  perform common._require_valid_mode(p_mode);
  if p_mode <> 'compete' then
    raise exception 'BUG: FlipWord in coop'
      using errcode = 'PN545', hint = 'fault', column = '_',
      detail = 'wordsy is compete only';
  end if;
  if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
    -- The club page and the players picker refuse one, so this is the
    -- server-side catch.
    raise exception 'BUG: race with fewer than two players'
      using errcode = 'PN546', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
  end if;

  -- ─── Validate the setup ──────────────────────────────────
  -- No defaults: the setup form always sends every key.
  s_legal_band := (p_setup->>'legal_band')::int;
  if s_legal_band is null or s_legal_band < 1 or s_legal_band > 6 then
    raise exception 'BUG: legal band of %', s_legal_band
      using errcode = 'PN543', hint = 'fault', column = '_',
      detail = 'setup.legal_band must be 1..6';
  end if;
  s_round_style := p_setup->>'round_style';
  if s_round_style is null or s_round_style not in ('timer', 'no-timer') then
    raise exception 'BUG: round style of %', s_round_style
      using errcode = 'PN544', hint = 'fault', column = '_',
      detail = 'setup.round_style must be timer or no-timer';
  end if;
  s_n_rounds := (p_setup->>'n_rounds')::int;
  if s_n_rounds is null or s_n_rounds not in (3, 7) then
    raise exception 'BUG: game of % rounds', s_n_rounds
      using errcode = 'PN554', hint = 'fault', column = '_',
      detail = 'setup.n_rounds must be 3 or 7';
  end if;
  if jsonb_typeof(p_setup->'one_word') is distinct from 'boolean' then
    raise exception 'BUG: one_word of %', p_setup->'one_word'
      using errcode = 'PN555', hint = 'fault', column = '_',
      detail = 'setup.one_word must be true or false';
  end if;
  s_one_word := (p_setup->>'one_word')::boolean;

  perform common._require_valid_timer(p_setup->'timer');
  if p_setup->'timer'->>'kind' <> 'none' then
    raise exception 'BUG: FlipWord with a whole-game timer'
      using errcode = 'PN547', hint = 'fault', column = '_',
      detail = 'setup.timer is fixed at none; the round timer is the game''s own';
  end if;

  new_id := common._create_game(
    -- `_deal_round` writes the real title.
    p_club_handle, 'wordsy_' || p_mode, p_mode, p_player_user_ids,
    format('Round 1 of %s', s_n_rounds),
    p_setup,
    p_setup
  );

  insert into wordsy.games (game_id, deck, legal_band, round_style, n_rounds, one_word)
  select new_id, array_agg(n::smallint order by random()), s_legal_band, s_round_style,
         s_n_rounds, s_one_word
    from generate_series(1, 60) n;

  insert into wordsy.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  if s_round_style = 'no-timer' then
    v_first := p_player_user_ids[1 + floor(random() * array_length(p_player_user_ids, 1))::int];
  end if;
  perform wordsy._deal_round(new_id, 1, null, v_first);

  perform wordsy._write_static_game_data(new_id);
  perform wordsy._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function wordsy.create_game(text, jsonb, uuid[], text) from public;
grant execute on function wordsy.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- wordsy.submit_word — a player's word for the round in play
-- ============================================================
-- The word stands when it is legal at the game's band and original (no earlier
-- round scored a word with its root), and it replaces the player's earlier
-- word this round. Two refusals only the server can judge come back `ok`, as
-- verdicts with nothing recorded: `notAWord`, and `alreadyPlayed` with the
-- earlier word. The earlier standing word, if any, is left as it was.
--
-- The races, which the page gates first: the caller's word is frozen (they
-- are the round's Fastest, or any earlier submit in `no-timer` or a
-- `one_word` game), and the
-- caller holds No Flip while nobody has submitted and more than two are
-- still playing.
--
-- A standing word in a `timer` round with no Fastest yet makes the caller the
-- Fastest and arms the clock. In `no-timer` and a `one_word` game, the submit
-- that leaves everyone still playing with a word ends the round.
--
-- The `ok` carries { result, earlier, timer_started, round_ended,
-- game_ended }, `result` ∈ submitted | notAWord | alreadyPlayed. No outcome
-- and no message: what each is worth, and its words, is the frontend's
-- lib/answer.ts.
create or replace function wordsy.submit_word(p_game_id uuid, p_word text)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  caller_id         uuid;
  g                 wordsy.games%rowtype;
  r                 wordsy.rounds%rowtype;
  norm              text;
  v_earlier         text;
  out_timer_started boolean := false;
  out_round_ended   boolean := false;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first, and locked: two submits and the buzzer serialize, so the
  -- first submit to commit is the Fastest.
  select * into g from wordsy.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordsy');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  norm := lower(trim(coalesce(p_word, '')));
  if norm !~ '^[a-z]{1,45}$' then
    -- The entry takes letters only and refuses an empty submit.
    raise exception 'BUG: word that was not 1 to 45 letters'
      using errcode = 'PN548', hint = 'fault', column = '_',
      detail = format('word must match ^[a-z]{1,45}$; got %L', norm);
  end if;

  select * into r from wordsy.rounds where game_id = p_game_id and ended_at is null;

  -- ─── Races: the page disables the entry first ────────────
  if r.num is null then
    raise exception 'That round is over'
      using errcode = 'PN557', hint = 'race', column = '_',
      detail = 'no round is in play: the next waits for everyone to start it';
  end if;

  if (g.round_style = 'timer' and r.fastest_user_id = caller_id)
     or (wordsy._is_one_word(g) and exists (
           select 1 from wordsy.round_words
            where game_id = p_game_id and num = r.num and user_id = caller_id)) then
    raise exception 'Your word is in'
      using errcode = 'PN549', hint = 'race', column = '_',
      detail = 'this round''s word is frozen for the caller';
  end if;

  if g.round_style = 'timer' and r.fastest_user_id is null
     and r.no_flip_user_id = caller_id
     and wordsy._n_still_playing(p_game_id) > 2 then
    raise exception 'You hold No Flip — wait for someone else to submit'
      using errcode = 'PN550', hint = 'race', column = '_',
      detail = 'the No Flip holder may not start the round''s clock';
  end if;

  -- ─── Verdicts: nothing recorded ──────────────────────────
  if not wordsy._is_legal(norm, g.legal_band) then
    return common._ok_envelope(jsonb_build_object(
      'result', 'notAWord', 'earlier', null,
      'timer_started', false, 'round_ended', false, 'game_ended', false));
  end if;

  v_earlier := wordsy._earlier_word_with_root(p_game_id, norm);
  if v_earlier is not null then
    return common._ok_envelope(jsonb_build_object(
      'result', 'alreadyPlayed', 'earlier', v_earlier,
      'timer_started', false, 'round_ended', false, 'game_ended', false));
  end if;

  -- ─── The word stands ─────────────────────────────────────
  -- The moment itself, not the transaction's start: the reveal is ordered by
  -- it (`_end_round`).
  insert into wordsy.round_words (game_id, num, user_id, word, submitted_at)
  values (p_game_id, r.num, caller_id, norm, clock_timestamp())
  on conflict (game_id, num, user_id)
  do update set word = excluded.word, submitted_at = excluded.submitted_at;

  if g.round_style = 'timer' and r.fastest_user_id is null then
    update wordsy.rounds
       set fastest_user_id = caller_id, timer_started_at = now()
     where game_id = p_game_id and num = r.num;
    perform wordsy._arm_timer(p_game_id);
    out_timer_started := true;
  end if;
  -- One word a round: the last player in ends it, the clock or no clock.
  if wordsy._is_one_word(g) and wordsy._is_everyone_in(p_game_id, r.num) then
    perform wordsy._end_round(p_game_id, caller_id);
    out_round_ended := true;
  end if;

  perform wordsy._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object(
    'result', 'submitted', 'earlier', null,
    'timer_started', out_timer_started,
    'round_ended', out_round_ended,
    'game_ended', (select ended_at is not null from common.games where id = p_game_id)));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function wordsy.submit_word(uuid, text) from public;
grant execute on function wordsy.submit_word(uuid, text) to authenticated;

-- ============================================================
-- wordsy.submit_timeout — the round's clock ran out
-- ============================================================
-- Fired by every connected client when the round's countdown reaches zero;
-- the first ends the round (`_end_round`, nobody as who ended it), the rest
-- find no clock running and answer a race. The server's own count must have
-- reached the 30 seconds, so a client still holding last round's zero cannot
-- end a round that has just begun.
create or replace function wordsy.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  t wordsy.rounds%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from wordsy.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordsy');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  select * into t from wordsy.rounds where game_id = p_game_id and ended_at is null;
  if t.timer_started_at is null then
    raise exception 'That round is already over'
      using errcode = 'PN551', hint = 'race', column = '_',
      detail = 'no round clock is running';
  end if;

  if (select ticks < countdown_seconds_at_setup from common.timers
       where game_id = p_game_id) then
    raise exception 'The clock is still running'
      using errcode = 'PN552', hint = 'race', column = '_',
      detail = 'common.timers.ticks is short of the round''s seconds';
  end if;

  perform wordsy._end_round(p_game_id, null);

  perform wordsy._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function wordsy.submit_timeout(uuid) from public;
grant execute on function wordsy.submit_timeout(uuid) to authenticated;

-- ============================================================
-- wordsy.start_round — "Start round N", between rounds
-- ============================================================
-- The caller is ready for the next round; the press that leaves everyone
-- still playing ready deals it. Pressing twice is harmless. A round already
-- in play is a race (PN556): the last press dealt it while this one was on
-- its way.
--
-- The `ok` carries { result }, `result` ∈ ready | started.
create or replace function wordsy.start_round(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  caller_id uuid;
  v_next    int;
  v_started boolean := false;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from wordsy.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordsy');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  if exists (select 1 from wordsy.rounds where game_id = p_game_id and ended_at is null) then
    raise exception 'That round has started'
      using errcode = 'PN556', hint = 'race', column = '_',
      detail = 'a round is in play';
  end if;

  v_next := (select max(num) + 1 from wordsy.rounds where game_id = p_game_id);
  update wordsy.players set ready_for_num = v_next
   where game_id = p_game_id and user_id = caller_id;

  if wordsy._is_everyone_ready(p_game_id, v_next) then
    perform wordsy._deal_next_round(p_game_id);
    v_started := true;
  end if;

  perform wordsy._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object(
    'result', case when v_started then 'started' else 'ready' end));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function wordsy.start_round(uuid) from public;
grant execute on function wordsy.start_round(uuid) to authenticated;

-- ============================================================
-- wordsy.stop_game — the Stop
-- ============================================================
-- Both styles, with no result (docs/common-schema.md → Stop); the round clock
-- is put away.
create or replace function wordsy.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from wordsy.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordsy');
  end if;

  perform common._stop(p_game_id);
  perform wordsy._disarm_timer(p_game_id);

  perform wordsy._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function wordsy.stop_game(uuid) from public;
grant execute on function wordsy.stop_game(uuid) to authenticated;

-- ============================================================
-- wordsy.concede — a player drops out
-- ============================================================
-- A conceder keeps their finished rounds; later rounds have no row for them,
-- they are no opponent for the bonuses, and they are not ranked. Everyone
-- conceding ends the game as a loss for all (`common._concede`). In
-- `no-timer` and a `one_word` game, a concede by the last player yet to
-- submit ends the round; between rounds, a concede by the last player yet to
-- press Start deals the next.
create or replace function wordsy.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  caller_id uuid;
  g         wordsy.games%rowtype;
  v_num     int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select * into g from wordsy.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordsy');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform wordsy._disarm_timer(p_game_id);
  elsif not exists (select 1 from wordsy.rounds
                     where game_id = p_game_id and ended_at is null) then
    -- Between rounds: the last player yet to start the next one starts it.
    v_num := (select max(num) + 1 from wordsy.rounds where game_id = p_game_id);
    if wordsy._is_everyone_ready(p_game_id, v_num) then
      perform wordsy._deal_next_round(p_game_id);
    end if;
  elsif wordsy._is_one_word(g) then
    select num into v_num from wordsy.rounds where game_id = p_game_id and ended_at is null;
    if wordsy._is_everyone_in(p_game_id, v_num) then
      perform wordsy._end_round(p_game_id, caller_id);
    end if;
  end if;

  perform wordsy._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function wordsy.concede(uuid) from public;
grant execute on function wordsy.concede(uuid) to authenticated;

-- ============================================================
-- wordsy.replay_board — the same deck, from round 1
-- ============================================================
-- The "Restart" game-menu item. The deck is kept and `drawn` emptied, so the
-- deal replays the same seven tables; the rounds, their words and the log go,
-- and the clock is put away. In `no-timer` the First Wordsmith is drawn
-- again. Any player may call it, mid-game or after the end.
create or replace function wordsy.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordsy, common, public, extensions
as $$
declare
  g       wordsy.games%rowtype;
  v_first uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select * into g from wordsy.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordsy');
  end if;

  perform common._require_game_player(p_game_id);

  delete from wordsy.events where game_id = p_game_id;
  delete from wordsy.rounds where game_id = p_game_id;
  update wordsy.games set drawn = '{}' where game_id = p_game_id;
  update wordsy.players set ready_for_num = null where game_id = p_game_id;

  perform common._reset_game(p_game_id);
  perform wordsy._disarm_timer(p_game_id);

  if g.round_style = 'no-timer' then
    select user_id into v_first from wordsy.players
     where game_id = p_game_id order by random() limit 1;
  end if;
  perform wordsy._deal_round(p_game_id, 1, null, v_first);

  perform wordsy._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function wordsy.replay_board(uuid) from public;
grant execute on function wordsy.replay_board(uuid) to authenticated;
