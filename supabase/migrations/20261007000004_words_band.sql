-- cs-unmet

-- ============================================================
-- common.words.difficulty becomes common.words.band
-- ============================================================
-- The 1–6 recognizability band every word game filters on. "Difficulty" fails
-- as its name (Joel, 2026-09-28 and 2026-10-07): a game can have two bands, a
-- higher band makes some games easier, and games have other knobs that set
-- how hard they are. Every setup key already says `*_band`; the column the
-- bands are values of now says it too, and its index and check follow.
--
-- Shape only: no row changes, here or in the seed pools below. The word list is loaded positionally
-- (`supabase/scripts/import-words.ts` names the columns in the TSV's order),
-- so the upstream file's `difficulty` header is untouched by this.

alter table common.words rename column difficulty to band;
alter index common.common_words_difficulty_idx rename to common_words_band_idx;
alter table common.words rename constraint words_difficulty_check to words_band_check;

-- The two seed pools carry a copy of the hardest word's band, under the same
-- old name; they follow (Joel, 2026-10-07). letterboxed's check follows too;
-- wordwheel's pool has none.
alter table letterboxed.seeds rename column difficulty to band;
alter index letterboxed.letterboxed_seeds_difficulty_idx rename to letterboxed_seeds_band_idx;
alter table letterboxed.seeds rename constraint seeds_difficulty_check to seeds_band_check;
alter table wordwheel.pangrams rename column difficulty to band;
alter index wordwheel.wordwheel_pangrams_difficulty_idx rename to wordwheel_pangrams_band_idx;
