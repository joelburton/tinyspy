-- ============================================================
-- RLS on the reference / seed tables
-- ============================================================
-- Five tables shipped with RLS disabled, which Supabase's security advisor
-- rightly flags. None was actually exposed — each is gated by its GRANTS, not
-- by RLS — but "protected because nobody granted anything" fails open the day
-- someone grants something, and five permanent CRITICALs are how a real
-- finding hides in the noise. (The real one alongside these was a hand-made
-- `public.uses` view, dropped separately; it isn't in this repo.)
--
-- Two shapes here, and the difference is deliberate:
--
--   * The four READ-ONLY reference tables (`common.words` and the three
--     board-seed tables) already grant `authenticated: SELECT` and hold
--     nothing secret — the dictionary is queried straight from the FE
--     (codenamesduet's board build, the dictionary editor), connections ships
--     its categories to the client by design, and spellingbee/wordwheel ship
--     both word lists for trusting-commit. They get a permissive
--     `using (true)` policy in their `supabase/sql/` file: same access as
--     today, but stated rather than incidental. A constant-true qual folds
--     away in the planner, so even the 283k-row `common.words` scans are
--     unaffected.
--
--   * `stackdown.boards` gets **no policy at all**, on purpose. It has NO
--     grants to `anon` or `authenticated` today, and it holds `words` — the
--     six solution words in play order. RLS on with zero policies means a
--     future GRANT can't quietly open it: reads still fail closed. The
--     definer RPCs that legitimately read it are unaffected (a function owner
--     bypasses RLS), as is the board importer (`service_role` has BYPASSRLS).
--
-- Why a NEW migration rather than editing the per-game ones in place: those
-- are already applied, and `supabase db push` skips applied migrations, so an
-- in-place edit would never reach production — see CLAUDE.md → "In-place
-- migration edits now cost a PROD RESET".

alter table common.words           enable row level security;
alter table connections.puzzles    enable row level security;
alter table spellingbee.pangrams   enable row level security;
alter table wordwheel.pangrams     enable row level security;

-- Deny-by-default: no policy accompanies this one. See the header.
alter table stackdown.boards       enable row level security;
