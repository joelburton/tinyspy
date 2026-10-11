-- cs-unmet

-- ============================================================
-- wordsy — the pause between rounds
-- ============================================================
--
-- A round's end reveals its scoresheet, and the next round is dealt only once
-- everyone still playing has pressed "Start round N". `ready_for_num` is the
-- round a player last pressed for, so a press is counted only for the round
-- about to be dealt (`wordsy._is_everyone_ready`). Null until a first press;
-- Restart empties it.
--
-- No backfill: before this, every round's end dealt the next at once, so no
-- game is waiting between rounds.

alter table wordsy.players
  add column ready_for_num smallint check (ready_for_num between 2 and 7);
