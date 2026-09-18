-- cs-unmet

-- ============================================================
-- wordiply.guesses → wordiply.events
-- ============================================================
-- The key was already a bigint identity, so nothing is renumbered here.
--
--   the NAME      guesses → events, with its constraints, its index and its
--                 identity SEQUENCE — a sequence is named at creation and
--                 does not follow its table, so `guesses_id_seq` would have
--                 outlived the rename. The old policy is dropped rather than
--                 renamed (docs/supabase.md → Schema vs code).
--   `kind`        one value, 'guess', under a check constraint.
--   `took_turn`   the one game where this could not be read off the kind. A
--                 submit is one `guess` row whatever happens, and whether it
--                 cost the player their go depends on the REASON the server
--                 computed: a word that breaks the base rules (too short, or
--                 missing the base) spends the go, a word the dictionary does
--                 not have does not. That judgment is the RPC's, made once,
--                 and this is where it is written down.
--   `created_at`  guessed_at, under the name every events table uses.
--
-- `seq` GOES, and it was the five-slot board index — null on a reject, which
-- is the same fact as `valid` being false. The valid-shape constraint said so
-- twice (`seq is not null` beside `reason is null`); it now says it once.
-- What fills a slot is the row's position among the valid rows, which is what
-- the board has always drawn.

create temporary table _wordiply_before on commit drop as
  select count(*) as rows,
         count(*) filter (where valid) as accepted,
         count(*) filter (where reason in ('too_short', 'missing_base')) as costly,
         count(*) filter (where reason = 'not_a_word') as free
    from wordiply.guesses;

-- ── the name ────────────────────────────────────────────────
alter table wordiply.guesses rename to events;
alter table wordiply.events rename constraint guesses_pkey to events_pkey;
alter table wordiply.events rename constraint guesses_game_id_fkey to events_game_id_fkey;
alter table wordiply.events rename constraint guesses_user_id_fkey to events_user_id_fkey;
alter table wordiply.events rename constraint guesses_game_id_user_id_word_key
  to events_game_id_user_id_word_key;
alter sequence wordiply.guesses_id_seq rename to events_id_seq;
drop policy if exists guesses_select on wordiply.events;

-- ── created_at ──────────────────────────────────────────────
alter table wordiply.events rename column guessed_at to created_at;

-- ── kind ────────────────────────────────────────────────────
alter table wordiply.events add column kind text;
update wordiply.events set kind = 'guess';
alter table wordiply.events alter column kind set not null;
alter table wordiply.events add constraint events_kind_check check (kind in ('guess'));

-- ── took_turn ───────────────────────────────────────────────
-- `coalesce` because `reason` is NULL on an accepted row, and `null in (…)`
-- is NULL rather than false.
alter table wordiply.events add column took_turn boolean;
update wordiply.events
   set took_turn = valid or coalesce(reason in ('too_short', 'missing_base'), false);
alter table wordiply.events alter column took_turn set not null;
alter table wordiply.events alter column took_turn set default false;

-- ── seq, and the constraint that named it ───────────────────
alter table wordiply.events drop constraint guesses_valid_shape;
alter table wordiply.events drop column seq;
alter table wordiply.events add constraint events_valid_shape check (
  (valid and reason is null)
  or (not valid and reason in ('missing_base', 'too_short', 'not_a_word'))
);

-- ── the read index ──────────────────────────────────────────
drop index wordiply.wordiply_guesses_game_id_idx;
create index wordiply_events_game_id_id_idx on wordiply.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _wordiply_before;
  select count(*) as rows,
         count(*) filter (where valid) as accepted,
         count(*) filter (where took_turn) as turns,
         count(*) filter (where reason = 'not_a_word') as free
    into a from wordiply.events;

  if a.rows <> b.rows or a.accepted <> b.accepted or a.free <> b.free then
    raise exception 'wordiply.events: % rows / % accepted / % free before, % / % / % after',
      b.rows, b.accepted, b.free, a.rows, a.accepted, a.free;
  end if;
  if a.turns <> b.accepted + b.costly then
    raise exception 'wordiply.events: % accepted + % costly rejects should be % turns, got %',
      b.accepted, b.costly, b.accepted + b.costly, a.turns;
  end if;
  if exists (select 1 from wordiply.events where took_turn and reason = 'not_a_word') then
    raise exception 'wordiply.events: a dictionary miss was charged a turn';
  end if;
end $$;
