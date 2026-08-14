-- ============================================================
-- Indexes for connections/strands `next_puzzle_for_club`
-- ============================================================
-- Both games' setup dialogs lost their date pickers: the server now derives
-- the next puzzle none of the players being seated has played. That query is
-- an anti-join whose inner side is "games on this puzzle_date played by any
-- of these users", and it runs on every setup-dialog open AND every game
-- creation.
--
-- The join is on `puzzle_date`, NOT `puzzle_id` — the FK is soft
-- (`on delete set null`) so a re-import can orphan it, while the
-- denormalized date is the durable identity. connections had an index on
-- `puzzle_id` and `club_handle` but none on the date; strands had neither.
--
-- The other half of the join, `common.game_players.user_id`, is already
-- indexed (common_game_players_user_id_idx).
--
-- Forward migration rather than an edit to the games' baselines: those are
-- applied on prod, and `supabase db push` skips applied migrations — see
-- 20260813000002 for the full note.

create index if not exists connections_games_puzzle_date_idx
  on connections.games (puzzle_date)
  where puzzle_date is not null;

create index if not exists strands_games_puzzle_date_idx
  on strands.games (puzzle_date)
  where puzzle_date is not null;
