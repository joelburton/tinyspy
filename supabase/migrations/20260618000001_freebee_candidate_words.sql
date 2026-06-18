-- ============================================================
-- FreeBee — candidate_words helper (Phase 2 follow-up)
-- ============================================================
--
-- Reason this migration exists: the edge function's
-- "given a puzzle, return every dictionary word that fits"
-- query was being silently truncated by PostgREST's
-- `max_rows = 1000` cap. The dictionary has ~46k rows; even
-- after the `in_legal=true` filter PostgREST applied to the
-- table-side query, paginating in batches of 1000 across the
-- full set is a lot of round-trips for a once-per-game-creation
-- operation.
--
-- The fix: push the bitmask intersection into Postgres via a
-- small SQL function. The function does the filter server-side
-- and returns only the candidate rows (typically a few hundred,
-- well under max_rows). The edge function reads back through
-- supabase.rpc(...) in one round-trip.
--
-- The function is `security invoker` + `stable`:
--   - invoker so RLS on freebee.dictionary applies as the
--     caller. Dictionary has RLS off (public reference data),
--     but principle-of-least-surprise: the function inherits
--     whatever access the caller has, no privilege escalation.
--   - stable so a single SELECT can call it once per row of
--     its enclosing query without repeated re-execution.

create function freebee.candidate_words(
  puzzle_mask bigint,
  center_bit bigint
)
returns table(word text, letter_mask bigint, in_scoring boolean)
language sql
stable
security invoker
set search_path = freebee, public, extensions
as $$
  select word, letter_mask, in_scoring
    from freebee.dictionary
   where in_legal
     -- Subset of puzzle: every letter bit of the word must be
     -- present in the puzzle's bitmask. Uses the partial
     -- index `freebee_dictionary_mask_idx` on letter_mask
     -- where in_legal — Postgres won't push the bitwise
     -- predicate into the index, but the index narrows the
     -- candidate row set first.
     and (letter_mask & ~puzzle_mask) = 0
     -- Must contain the center letter — the FreeBee rule.
     and (letter_mask & center_bit) <> 0;
$$;

revoke execute on function freebee.candidate_words(bigint, bigint) from public;
grant execute on function freebee.candidate_words(bigint, bigint) to authenticated;
