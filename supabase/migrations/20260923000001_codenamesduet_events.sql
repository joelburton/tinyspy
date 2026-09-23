-- cs-met-codenamesduet

-- ============================================================
-- codenamesduet.clues + codenamesduet.guesses → codenamesduet.events
-- ============================================================
-- The game's log becomes the one table every other game's log is: named
-- `events`, keyed by a `bigint identity` whose order IS the order of play,
-- with `kind`, `took_turn` and `created_at` beside the game's own payload
-- (docs/supabase.md → Every game's log is `<game>.events`).
-- supabase/tests/common/events_skeleton_test.sql is the assertion.
--
-- Four kinds, what a player DOES: a `clue`, a `guess`, a `pass`, and a `hint`
-- — asking the AI for a clue. The two tables this replaces recorded only the
-- first two: a pass moved the turn pointer on `codenamesduet.games` and wrote
-- nothing, and a hint wrote nothing at all.
--
-- The payload columns are NAMED FOR THE KIND THAT OWNS THEM, and a CHECK ties
-- each kind to exactly its own. No column means one thing on one row and
-- another on the next.
--
-- The turn STATE does not move: `current_clue_giver`, `turn_number` and
-- `turns_remaining` stay on `codenamesduet.games`, because the finished-player
-- rule decides who clues next and the last event cannot say that. The board
-- stays denormalized on `codenamesduet.words`.
--
-- RECREATED, not renamed — two tables become one — so the new table is added
-- to the `supabase_realtime` publication here explicitly, and the old two
-- leave it by being dropped.

-- What the two tables held, to check the backfill against at the bottom.
create temporary table _codenamesduet_before on commit drop as
  select (select count(*) from codenamesduet.clues)   as clues,
         (select count(*) from codenamesduet.guesses) as guesses;

-- ── the table ───────────────────────────────────────────────
create table codenamesduet.events (
  -- the skeleton
  id              bigint generated always as identity primary key,
  game_id         uuid not null references codenamesduet.games(id) on delete cascade,
  user_id         uuid not null references common.profiles(user_id) on delete cascade,
  kind            text not null check (kind in ('clue', 'guess', 'pass', 'hint')),
  took_turn       boolean not null default false,
  created_at      timestamptz not null default now(),

  -- this game's payload
  -- Which turn the event belongs to; the log groups on it.
  turn_number     int  not null,
  -- The actor's seat. Derivable from `user_id` through the game row, but the
  -- key a guess is judged against, the turn fold and the PDF all think in
  -- seats, and a seat never changes after create_game.
  seat            text not null check (seat in ('A', 'B')),
  clue_word       text,
  clue_count      int  check (clue_count >= 0),
  guess_position  int  check (guess_position between 0 and 24),
  -- The label the guess turned over as, from the key it was judged against.
  guess_result    text check (guess_result in ('G', 'N', 'A')),

  -- Each kind carries exactly its own payload. A pass and a hint carry none:
  -- a hint's suggestion names the agents it targets, and stored where the
  -- partner's client can read it, it would spoil their guessing.
  constraint events_payload_by_kind check (
    case kind
      when 'clue'  then clue_word is not null and clue_count is not null
                        and guess_position is null and guess_result is null
      when 'guess' then guess_position is not null and guess_result is not null
                        and clue_word is null and clue_count is null
      else              clue_word is null and clue_count is null
                        and guess_position is null and guess_result is null
    end
  )
);

-- Every read of the log is "this game's rows, in order".
create index codenamesduet_events_game_id_id_idx on codenamesduet.events (game_id, id);

-- One clue per turn — what `clues`' unique constraint said. submit_clue asks
-- first, under the game row's lock, and says so in words; this is what holds
-- if it ever does not.
create unique index codenamesduet_events_one_clue_per_turn
  on codenamesduet.events (game_id, turn_number) where kind = 'clue';

alter table codenamesduet.events enable row level security;

-- noinspection SqlResolve
alter publication supabase_realtime add table codenamesduet.events;

-- ── the backfill ────────────────────────────────────────────
-- Inserted in the order things happened, so `order by id` is the true order:
-- by time, then clue before guess before pass at the same instant, then the
-- old uuid, which is arbitrary but stable.
--
-- `took_turn` is true exactly where `_end_turn` ran: a bystander in ordinary
-- play, and a pass. A turn is ordinary play while `turn_number` has not passed
-- the budget — the turn after the last one spent is sudden death.
--
-- PASSES ARE INFERRED — the one kind of row this backfill makes up, because
-- `pass_turn` never wrote one. A turn below the game's current one that ended
-- on anything but a bystander (no guesses, or the last guess an agent) was
-- passed: an agent does not end a turn, and nothing else ends one mid-game. The
-- game's current turn is excluded, because the move that ended the game — the
-- fifteenth agent, an assassin, a timeout, End — closes it. The pass's author
-- is the guesser, the seat opposite the clue's; its time was never recorded,
-- so it takes the turn's last recorded time and sorts after it.
insert into codenamesduet.events (
  game_id, user_id, kind, took_turn, created_at, turn_number, seat,
  clue_word, clue_count, guess_position, guess_result
)
select game_id, user_id, kind, took_turn, created_at, turn_number, seat,
       clue_word, clue_count, guess_position, guess_result
  from (
    select c.game_id,
           case c.by_seat when 'A' then g.user_a_id else g.user_b_id end as user_id,
           'clue' as kind, false as took_turn, c.submitted_at as created_at,
           c.turn_number, c.by_seat as seat,
           c.word as clue_word, c.count as clue_count,
           null::int as guess_position, null::text as guess_result,
           0 as kind_order, c.id::text as tiebreak
      from codenamesduet.clues c
      join codenamesduet.games g on g.id = c.game_id

    union all

    select gu.game_id,
           case gu.guesser_seat when 'A' then g.user_a_id else g.user_b_id end,
           'guess',
           gu.result = 'N' and gu.turn_number <= (cg.setup->>'turns')::int,
           gu.guessed_at, gu.turn_number, gu.guesser_seat,
           null, null, gu.position, gu.result,
           1, gu.id::text
      from codenamesduet.guesses gu
      join codenamesduet.games g on g.id = gu.game_id
      join common.games cg on cg.id = gu.game_id

    union all

    select c.game_id,
           case c.by_seat when 'A' then g.user_b_id else g.user_a_id end,
           'pass', true,
           greatest(c.submitted_at, coalesce(last_guess.guessed_at, c.submitted_at)),
           c.turn_number,
           case c.by_seat when 'A' then 'B' else 'A' end,
           null, null, null, null,
           2, c.id::text
      from codenamesduet.clues c
      join codenamesduet.games g on g.id = c.game_id
      left join lateral (
        select gu.result, gu.guessed_at
          from codenamesduet.guesses gu
         where gu.game_id = c.game_id and gu.turn_number = c.turn_number
         order by gu.guessed_at desc, gu.id desc
         limit 1
      ) last_guess on true
     where c.turn_number < g.turn_number
       and last_guess.result is distinct from 'N'
  ) s
 order by created_at, kind_order, tiebreak;

-- ── did it all land? ────────────────────────────────────────
do $$
declare
  b record;
  n_clues bigint; n_guesses bigint;
  bad_game uuid; spent bigint; ended int;
begin
  select * into b from _codenamesduet_before;
  select count(*) filter (where kind = 'clue'), count(*) filter (where kind = 'guess')
    into n_clues, n_guesses
    from codenamesduet.events;

  if n_clues <> b.clues or n_guesses <> b.guesses then
    raise exception 'codenamesduet.events: % clues / % guesses before, % / % after',
      b.clues, b.guesses, n_clues, n_guesses;
  end if;

  -- Every turn a game has left behind was ended by exactly one event that
  -- took a turn, so a game on turn N has N - 1 of them. This is the check a
  -- wrong pass inference fails.
  select g.id, count(e.id) filter (where e.took_turn), g.turn_number - 1
    into bad_game, spent, ended
    from codenamesduet.games g
    left join codenamesduet.events e on e.game_id = g.id
   group by g.id, g.turn_number
  having count(e.id) filter (where e.took_turn) <> g.turn_number - 1
   limit 1;
  if bad_game is not null then
    raise exception 'codenamesduet.events: game % has % turn-taking events for % ended turns',
      bad_game, spent, ended;
  end if;

  -- The ids follow time: no row numbered after a later one.
  if exists (
    select 1
      from codenamesduet.events a
      join codenamesduet.events z on z.game_id = a.game_id and z.id > a.id
     where z.created_at < a.created_at
  ) then
    raise exception 'codenamesduet.events: rows numbered out of the order they happened';
  end if;
end $$;

-- ── the two tables it replaces ──────────────────────────────
-- Their policies and publication membership go with them. The repeatable half
-- (supabase/sql/codenamesduet.sql) stops naming them in the same change.
drop table codenamesduet.clues;
drop table codenamesduet.guesses;
