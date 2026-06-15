-- ============================================================
-- Remove psychicnum.play_again + games.next_game_id
-- ============================================================
--
-- See the matching tinyspy migration for the full rationale; this
-- mirror the same decision for psychicnum. One creation path is
-- enough.
--
-- Note on grants: the baseline file column-level-grants SELECT to
-- authenticated on a list that includes next_game_id. Postgres
-- prunes per-column privileges when the column is dropped, so no
-- explicit re-grant is needed — the remaining columns keep their
-- existing SELECT privilege.

drop function if exists psychicnum.play_again(uuid);

alter table psychicnum.games drop column if exists next_game_id;
