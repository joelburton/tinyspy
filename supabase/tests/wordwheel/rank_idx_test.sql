-- cs-blessed-rank-ladder

-- ============================================================
-- Test: common._rank_idx — the rank ladder as integer math
-- ============================================================
-- Pure function (no auth). What matters is not that it returns a number but
-- that it returns the SAME number the frontend's bar shows, at every rank
-- boundary — because this expression decides a compete win while the bar
-- decides what the player believes. The two are written differently on
-- purpose (float thresholds there, one integer division here), so the
-- boundaries are what has to be pinned: the numbers below are exactly what
-- `rankPoints(i, 108)` returns in `src/shared/rank-ladder/rankLadder.ts`.
--
-- Total 108 because that is the case `rankLadder.ts` names: `rankThreshold(5)
-- * 108` is 63.00000000000001 in floating point, and its `Math.ceil` turns
-- that into 64 — a whole point off. That trap is in the frontend's
-- threshold-from-rank direction, not in this function; searched for a
-- (score, total) where a float form of THIS expression disagrees with the
-- integer form and found none in 4,004,000 pairs. So integer math here is
-- determinism rather than a fix for an observed bug, and the assertions below
-- earn their place by pinning the LADDER — the clamp, the guard, and each
-- boundary the frontend has to match.

begin;
set search_path = wordwheel, common, public, extensions;
\ir ../_shared/setup.psql

select plan(11);

-- The guard. A board with no required score has no ladder to climb; 0 is
-- Start, not an error and not a division by zero.
select is(common._rank_idx(0, 0), 0, 'total 0 → Start (no division)');
select is(common._rank_idx(50, 0), 0, 'total 0 with a score → still Start');
select is(common._rank_idx(0, 108), 0, 'score 0 → Start');

-- Each rank's boundary, both sides. The score below is the last score that
-- does NOT unlock the rank; the score at it is the first that does — which is
-- what `rankPoints(i, total)` returns on the frontend.
select is(common._rank_idx(12, 108), 0, '12/108 → still Start');
select is(common._rank_idx(13, 108), 1, '13/108 → Good unlocks');
select is(common._rank_idx(25, 108), 1, '25/108 → still Good');
select is(common._rank_idx(26, 108), 2, '26/108 → Solid unlocks');
select is(common._rank_idx(37, 108), 2, '37/108 → still Solid');
select is(common._rank_idx(38, 108), 3, '38/108 → Nice unlocks');

-- The float trap itself: 63 is exactly (5/6)*0.7*108, and it must unlock
-- Amazing rather than falling a point short.
select is(common._rank_idx(63, 108), 5, '63/108 → Amazing unlocks exactly at the threshold');

-- The clamp. A full clear of the required set scores far past the 70% Genius
-- mark — 108/108 gives 60*108/(108*7) ≈ 8.57 — so the result is capped rather
-- than running off the end of a 7-tier ladder.
select is(common._rank_idx(108, 108), 6, 'a full clear clamps to Genius, not 8');

select * from finish();
rollback;
