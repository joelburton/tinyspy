-- ============================================================
-- One-shot: widen existing letterboxed boards' accept list
-- ============================================================
--
-- Context (2026-08-10). letterboxed shipped with ONE word list, built with the
-- must-reach purity filter, and that list is also the ACCEPT list — so typing
-- BITCH (band 1, `slur = 1`) was refused from a player's own keyboard. The fix
-- moves purity out of `candidate_words`' WHERE into an `is_clean` flag, and the
-- games_state view computes the clean subset back out (docs/common.md → the
-- word list's filter rule).
--
-- But `playable_words` is computed ONCE, at build time, and stored. So the fix
-- only reaches boards built after it deploys: a game already in flight keeps
-- refusing words its players may legitimately type. This backfills those.
--
-- ─── Run it with ────────────────────────────────────────────
--   gmake db-psql ENV=prod < supabase/scripts/backfill-letterboxed-accept-list.sql
--
-- AFTER deploying the SQL half — it calls the two-column `candidate_words`, so
-- against an old database it fails loudly rather than doing something partial.
--
-- ─── Why it is not in supabase/sql/ ─────────────────────────
-- That directory is re-applied IN FULL on every deploy. This is a data
-- migration, not code, and it has no business running again on every push —
-- even though (see below) it would be harmless if it did.
--
-- ─── Safety ─────────────────────────────────────────────────
-- ADDITIVE and IDEMPOTENT. The new list is the union of the stored one with a
-- fresh recompute, so:
--   - no word is ever REMOVED — a word already sitting in someone's chain
--     cannot vanish under them, even if the dictionary moved since the board
--     was built;
--   - running it twice changes nothing.
-- It cannot affect hints either: `clean_words` is computed as playable_words
-- INTERSECT the clean predicate, so widening the stored list leaves the
-- must-reach tier exactly where it was. And the >= 150 richness gate is a
-- create-time check, so nothing re-validates.

begin;

-- The side-adjacency rule ("no two consecutive letters from one side"), in SQL.
-- side(letter) = its index in `sides` div 3, since sides stores the twelve in
-- side order, three at a time.
--
-- This duplicates `buildPlayableWords` in the edge function's board.ts, which is
-- why it is pg_temp and dies with the session: a PERMANENT second definition of
-- the rule is exactly the drift this repo avoids. It was checked against five
-- real boards before use — recomputing their clean half reproduced what the
-- TypeScript builder had stored, word for word (840/840, 720/720, 660/660,
-- 1845/1845, 659/659).
create function pg_temp.side_ok(w text, sides text) returns boolean
language sql immutable as $$
  select coalesce(bool_and(
           (strpos(sides, substr(w, i,   1)) - 1) / 3
        <> (strpos(sides, substr(w, i+1, 1)) - 1) / 3), true)
    from generate_series(1, length(w) - 1) i;
$$;

\echo '── before'
select count(*) as boards,
       sum(jsonb_array_length(playable_words)) as total_words
  from letterboxed.games;

update letterboxed.games g
   set playable_words = (
     select jsonb_agg(distinct u.w)
       from (
         select jsonb_array_elements_text(g.playable_words) as w
         union
         select c.word
           from letterboxed.candidate_words(
                  common.word_letter_mask(g.sides), g.legal_band) c
          where pg_temp.side_ok(c.word, g.sides)
       ) u
   );

\echo '── after'
select count(*) as boards,
       sum(jsonb_array_length(playable_words)) as total_words
  from letterboxed.games;

commit;
