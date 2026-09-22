-- cs-unmet

-- ============================================================
-- waffle.events.colors — the board's feedback after each swap
-- ============================================================
-- A swap row records two positions and the two letters that were on them. It
-- does not record what the board then looked like, and it does not record the
-- colors — so the turn-history viewer rebuilds both in the browser, and
-- coloring needs the answer. That is why `waffle._solution_for` hands the
-- solution to the COOP client during play, which its own comment says.
--
-- Storing the colors takes that secret off the client. It is also what wordle
-- has always done (`wordle.events.colors char(5)`, written by submit_guess), so
-- this makes the two games agree rather than inventing anything.
--
-- SHAPE here; the writer is behavior and lives in `supabase/sql/waffle.sql`,
-- which is re-applied in full on every deploy. Nothing there can reach rows
-- already written, which is what the backfill below is for.
--
-- The stored string is the one every part of waffle already speaks: 25
-- characters, one per cell — 'g' right letter right spot, 'y' in the word wrong
-- spot, 'x' not in the word, '.' a hole. `char(25)`, matching `scramble` and
-- `solution` on waffle.games.

alter table waffle.events add column colors char(25);

-- ── The coloring, for this migration only ───────────────────
-- A MIGRATION MAY NOT CALL `supabase/sql/`. That file holds behavior and is
-- applied AFTER every migration — on a `db reset` and, more to the point, in
-- `db-rehearse`, where production's rows are restored `--data-only` (no
-- functions) and the held-back migrations run before `supabase/sql/` does. So
-- `waffle.board_colors` does not exist at this moment on any database where
-- this file runs, however permanently it exists on the deployed one.
--
-- Hence a copy, in `pg_temp`: it lives for this session and no longer, so it
-- cannot drift into the app or be mistaken for a second implementation. It is
-- frozen history, which is what a migration is. The live functions are
-- `common.wordle_colors`, `waffle._color_rank` and `waffle.board_colors`, and
-- these are them verbatim.

create function pg_temp._wordle_colors(guess text, answer text)
returns text
language plpgsql
immutable
as $$
declare
  n    int := length(guess);
  res  text[] := array_fill('x'::text, array[n]);
  pool int[]  := array_fill(0, array[26]);
  i    int;
  gc   text;
  ac   text;
  idx  int;
begin
  guess  := lower(guess);
  answer := lower(answer);
  for i in 1..n loop
    gc := substr(guess, i, 1);
    ac := substr(answer, i, 1);
    if gc = ac then
      res[i] := 'g';
    else
      idx := ascii(ac) - 96;
      if idx between 1 and 26 then
        pool[idx] := pool[idx] + 1;
      end if;
    end if;
  end loop;
  for i in 1..n loop
    if res[i] <> 'g' then
      idx := ascii(substr(guess, i, 1)) - 96;
      if idx between 1 and 26 and pool[idx] > 0 then
        res[i]    := 'y';
        pool[idx] := pool[idx] - 1;
      end if;
    end if;
  end loop;
  return array_to_string(res, '');
end;
$$;

create function pg_temp._color_rank(c text)
returns int
language sql
immutable
as $$
  select case c when 'g' then 3 when 'y' then 2 when 'x' then 1 else 0 end;
$$;

create function pg_temp._board_colors(board text, solution text)
returns text
language plpgsql
immutable
as $$
declare
  words int[][] := array[
    array[1, 2, 3, 4, 5],
    array[11, 12, 13, 14, 15],
    array[21, 22, 23, 24, 25],
    array[1, 6, 11, 16, 21],
    array[3, 8, 13, 18, 23],
    array[5, 10, 15, 20, 25]
  ];
  res  text[] := array_fill('.'::text, array[25]);
  w    int;
  k    int;
  cell int;
  bw   text;
  sw   text;
  wc   text;
  col  text;
begin
  board    := lower(board);
  solution := lower(solution);
  for w in 1..6 loop
    bw := '';
    sw := '';
    for k in 1..5 loop
      cell := words[w][k];
      bw := bw || substr(board, cell, 1);
      sw := sw || substr(solution, cell, 1);
    end loop;
    wc := pg_temp._wordle_colors(bw, sw);
    for k in 1..5 loop
      cell := words[w][k];
      col  := substr(wc, k, 1);
      if pg_temp._color_rank(col) > pg_temp._color_rank(res[cell]) then
        res[cell] := col;
      end if;
    end loop;
  end loop;
  return array_to_string(res, '');
end;
$$;

-- ── The backfill ────────────────────────────────────────────
-- Everything it needs is already stored: the scramble, the solution, and the
-- log. Replay each board forward from the scramble and color each state.
--
-- WHOSE BOARD depends on the mode, and getting this wrong writes plausible,
-- wrong colors into every compete game:
--   coop    — one shared board, so the sequence is every event in the game.
--   compete — a board per player, so the sequence is that player's events only.
--             Every compete player starts from the SAME scramble.
-- `board_key` is null in coop precisely so the partition collapses to one.
--
-- Ordered by `id`, which is what the log is ordered by everywhere else (it
-- replaced the per-player `seq` for exactly that reason).
create temporary table _replay on commit drop as
with recursive ordered as (
  select e.id, e.game_id, e.pos_a, e.pos_b, e.letter_a, e.letter_b,
         g.scramble::text as scramble,
         g.solution::text as solution,
         case when g.mode = 'coop' then null else e.user_id end as board_key,
         row_number() over (
           partition by e.game_id,
                        case when g.mode = 'coop' then null else e.user_id end
           order by e.id
         ) as n
    from waffle.events e
    join waffle.games g on g.id = e.game_id
),
replay as (
  -- The first swap of each board, applied to the scramble. After a swap pos_a
  -- holds what was on pos_b and vice versa, which is what the stored letters
  -- already say; overlay is 1-based.
  select o.id, o.game_id, o.board_key, o.n, o.solution,
         o.pos_a, o.letter_a,
         o.scramble as before_board,
         overlay(overlay(o.scramble placing o.letter_b from o.pos_a + 1 for 1)
                 placing o.letter_a from o.pos_b + 1 for 1) as board
    from ordered o
   where o.n = 1
  union all
  select o.id, o.game_id, o.board_key, o.n, o.solution,
         o.pos_a, o.letter_a,
         r.board as before_board,
         overlay(overlay(r.board placing o.letter_b from o.pos_a + 1 for 1)
                 placing o.letter_a from o.pos_b + 1 for 1)
    from replay r
    join ordered o
      on o.game_id = r.game_id
     -- `is not distinct from` because coop's board_key is null on both sides.
     and o.board_key is not distinct from r.board_key
     and o.n = r.n + 1
)
select id, before_board, board, solution, pos_a, letter_a from replay;

-- ── The log has to agree with the scramble ──────────────────
-- `letter_a` is what was on `pos_a` BEFORE the swap, so the replayed board must
-- already hold it there. If it ever doesn't, the log and the scramble disagree
-- and every colored board after that point is fiction — so raise rather than
-- write one. Free, because the log stored the letters for its own reasons.
do $$
declare
  bad int;
begin
  select count(*) into bad
    from _replay
   where substr(before_board, pos_a + 1, 1) <> letter_a;
  if bad > 0 then
    raise exception 'waffle event colors backfill: % row(s) disagree with the scramble', bad;
  end if;
end;
$$;

update waffle.events e
   set colors = pg_temp._board_colors(r.board, r.solution)
  from _replay r
 where r.id = e.id;

-- ── Every row, or the column is a lie ───────────────────────
-- A null here means a swap the replay never reached — an event whose game is
-- missing, or a gap in the ordering. `set not null` would catch it too; this
-- says which rows and how many first.
do $$
declare
  missing int;
begin
  select count(*) into missing from waffle.events where colors is null;
  if missing > 0 then
    raise exception 'waffle event colors backfill: % row(s) left uncolored', missing;
  end if;
end;
$$;

alter table waffle.events alter column colors set not null;
