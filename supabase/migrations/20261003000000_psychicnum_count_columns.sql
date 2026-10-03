-- cs-unmet

-- ============================================================
-- psychicnum: the two count columns take the page blobs' names
-- ============================================================
-- A blob key is its column, camelCased (docs/code-conventions.md →
-- TypeScript casing), and a count is `nFoo` (→ A few words may be
-- abbreviated): `n_found_secrets` → `nFoundSecrets`, `n_guesses_used` →
-- `nGuessesUsed`. A rename carries every row and its check constraint with
-- it; the values are already each player's own in both modes
-- (20260929000000_psychicnum_coop_guesses_per_player.sql). The page blobs are
-- rebuilt by hand after the deploy (`select
-- psychicnum._rebuild_data_cols_for_all()`), since a migration cannot call
-- what `supabase/sql/` defines.

alter table psychicnum.players
  rename column found_secrets_count to n_found_secrets;
alter table psychicnum.players
  rename constraint players_found_secrets_count_check to players_n_found_secrets_check;
alter table psychicnum.players
  rename column guesses_used to n_guesses_used;
alter table psychicnum.players
  rename constraint players_guesses_used_check to players_n_guesses_used_check;
