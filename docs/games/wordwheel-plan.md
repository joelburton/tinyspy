# Word Wheel — build plan

A **plan**, not shipped code. Word Wheel is a Guardian word game that is
**spellingbee with three real changes**; the plan's job is to name exactly what
differs and confirm everything else is reuse. Read
[spellingbee.md](spellingbee.md) alongside this — most of the machinery is
lifted from there wholesale.

- **Codename:** `wordwheel` (one lowercase token, no mid-caps — see
  [[feedback_codename_brand_naming]]). Schema `wordwheel`; gametypes
  `wordwheel_coop` / `wordwheel_compete`.
- **Brand:** **MooseWheel** — the display name, lives only in the manifest
  `BRAND` const (codenames stay lowercase in code + prose).

## 1. What it is

A central letter plus **eight** surrounding letters (nine total). Find words
that:

1. **use the centre letter** (every word must), and
2. are built only from the nine wheel letters, **each used at most once**.

Score by length; a word using **all nine** letters is the pangram. It's the
classic newspaper "word wheel"; mechanically it's spellingbee with a
tile-supply constraint instead of spellingbee's unlimited letter reuse.

## 2. How it differs from spellingbee — the whole story

| | spellingbee (FreeBee) | **word wheel** |
|---|---|---|
| Letters | 1 centre + **6** outer (7) | 1 centre + **8** outer (9) |
| Letter reuse | **unlimited** — a word may repeat any wheel letter (NANNY from {n,a,y,…}) | **each letter once** — the nine tiles are the supply |
| Board shape | 7-hex honeycomb | **circles**: a big centre circle + 8 in a ring |
| Pangram | uses all 7 letters, **+10** | uses all 9 letters, **+15** |
| Board seed | a 7-letter word that IS a pangram (`spellingbee.pangrams`) | a **9-letter isogram** that IS the pangram, **difficulty-tagged** (`wordwheel.pangrams`) |
| Enumeration | **set** bitmask subset (letter *presence*) | **multiset** subset (all-distinct words only) |
| Everything else | — | **identical** |

"Everything else identical" is load-bearing and literal: the rank ladder,
the required/bonus word-list split, the trusting-commit `useWordSubmit` submit
path, `found_words` schema + RLS, coop/compete sibling pair, `submit_word` /
`submit_timeout` / `end_game` / `concede` / `replay_board` / "New game", the
`WordList` / `RankBar` / `Stats` / `OpponentStrip` info column, the
mobile info-sheet, and the print PDF all port over with only names changed.

### 2a. The one algorithm change: multiset enumeration

This is the crux. spellingbee's `candidate_words` accepts a word when its
letter **set** is a subset of the puzzle's 7 letters:

```sql
(w.letter_mask & ~puzzle_mask) = 0   -- word's letters ⊆ puzzle letters (PRESENCE only)
and (w.letter_mask & center_bit) <> 0
```

`common.words.letter_mask` is a 26-bit **presence** mask, so this ignores
multiplicity — which is *precisely* why spellingbee allows reuse (MAMMAL passes
a {m,a,l} board).

Word Wheel keeps the same subset + centre checks over a **nine-letter** puzzle
mask, and adds one filter: **the word has no repeated letters.** With nine
*distinct* wheel letters, "use each tile once" is equivalent to "the word's
letters are all distinct AND ⊆ the wheel." A word is all-distinct iff
`length(word) == popcount(letter_mask)`. So:

- **SQL (`wordwheel.candidate_words`):** the spellingbee query **plus**
  `and length(w.word) = <popcount(letter_mask)>`. Postgres has no built-in
  popcount; either add a generated `common.words.distinct_letters int`
  (= `popcount(letter_mask)`, cheapest — one column, set at import) and compare
  `w.len = w.distinct_letters`, or compute popcount in the edge function's
  post-filter (the builder already has `popcount26`). **Recommendation:** the
  edge-fn post-filter — zero schema change to `common.words`, and the builder
  already holds every candidate row.
- Pangram = `popcount(letter_mask) == 9` (⟺ a 9-letter all-distinct word).

Everything downstream is unchanged: the board still ships `required_words` +
`bonus_words` as `{ word, points, is_pangram }`, and the FE still just checks
list membership + dedup and scores locally. **The "used once" rule never
reaches the client** — it's fully absorbed into which words the builder emits.

## 3. Schema (`wordwheel.*`) — mirror spellingbee

Copy `supabase/migrations/20260617000000_spellingbee.sql` structure into a new
`wordwheel` migration, changing:

- **`wordwheel.games`** — same columns as `spellingbee.games` except
  `outer_letters char(8)` (not `char(6)`). Keep `center_letter char(1)`,
  `required_words` / `bonus_words` jsonb, `required_words_count`,
  `required_words_score`, `mode`, the column-grant + RLS.
- **`wordwheel.found_words`** — identical to `spellingbee.found_words`
  (`game_id, user_id, word, points, is_pangram, is_bonus, found_at`, same PK,
  same coop/compete-aware RLS). Realtime on `wordwheel.{games, found_words}`
  (the `games` subscription is needed for `replay_board`'s DELETE-wake touch —
  see spellingbee.md's replay note).
- **`wordwheel.pangrams`** — the board-seed table (name kept parallel to
  `spellingbee.pangrams`): one row per **9-letter isogram** word (all nine
  letters distinct — it IS the board's pangram). Columns:
  - `word text`, `letter_mask bigint` — the isogram + its presence mask.
  - `has_rare_letters boolean` — carry spellingbee's sampling boost.
  - **`difficulty int`** — the difficulty band of the 9-letter word itself.
    **This replaces spellingbee's "pangram must be band-1" rule.** spellingbee
    forces a band-1 (universal) pangram so it's always gettable; that leaves
    Word Wheel only **~400** band-1 nine-letter isograms — too few. Instead we
    tag each seed with its difficulty and let the builder pick a pangram
    **matching the game's required band** (`difficulty <= required_band`), so a
    harder game draws from a larger pool and the pangram stays gettable at the
    chosen difficulty.
  - **`word_counts jsonb`** — a **read-only precomputed** count of findable
    words on this wheel, bucketed by difficulty band: a 6-element array
    `[n1..n6]` where `nk` = the number of **required-quality** words (spellingbee's
    `is_required` predicate — `american AND not slang AND slur = 0 AND crude =
    0`) at difficulty *exactly* band `k`. The required set for a game at required
    band `R` is then `sum(word_counts[1..R])` — mirroring spellingbee's required
    definition. Counts are **centre-agnostic** (every all-distinct sub-word of
    the nine letters, length ≥ 4, any letter as notional centre) — a slight
    over-count vs the real per-centre count, but fine as the richness proxy a
    future **"board must have ≥ N words" gate** would filter on (no build-time
    rescan). Decisions: [§8](#8-decisions).

  Public reference data, no RLS, `grant select … to authenticated`. Seeded
  offline (§5).
- **RPCs** — `create_game`, `submit_word`, `submit_timeout`, `end_game`,
  `concede`, `replay_board` are line-for-line spellingbee with the schema
  renamed and the pangram bonus 10 → 15 anywhere a score is recomputed
  server-side (create_game caches `required_words_score`; submit_word trusts
  the shipped points, so the bonus only lives in the builder + create_game's
  validation — confirm where spellingbee re-derives, if anywhere, and match).
  Keep `_rank_idx` verbatim (ranks are unchanged).

## 4. Scoring + ranks

- **Length score is IDENTICAL to spellingbee:** `word.length === 4 ? 1 :
  word.length` (4-letter = 1pt; 5+ = one point per letter). So `lengthScore`
  ports unchanged.
- **Pangram bonus: +15** (spellingbee's is +10) — the *only* scoring number
  that changes. A 9-letter pangram scores `9 + 15 = 24`.
- **Ranks: reuse `src/spellingbee/lib/ranks.ts` verbatim** (Start…Genius,
  70% Genius threshold, the integer `rankPoints`). Either import it directly
  from the spellingbee folder or, cleaner, promote it to
  `src/common/lib/game/ranks.ts` since two games now share it (flag: the
  removability invariant — a `common/` home is fine, a cross-game
  `import '../spellingbee/…'` is not). The SQL `_rank_idx` is unchanged.

## 5. Board builder — `wordwheel-build-board` edge function

Port `spellingbee-build-board`, changing only the seed pool and the candidate
filter:

1. **Seed pool:** sample a row from `wordwheel.pangrams`, **restricted to
   `difficulty <= required_band`** (the §3 difficulty tag — this is what makes
   the pool scale with the game's difficulty instead of being stuck at ~400
   band-1 seeds). Then keep the diverse-builder heuristics (previous-board
   overlap cap, rare-letter weighting; ING dampening optional — reassess for
   9-letter masks). If a future "≥ N words" gate is added, filter the pool on
   `word_counts` here too.
2. **Centre:** pick uniformly from the nine mask letters.
3. **Enumerate:** call `wordwheel.candidate_words(puzzle_mask, center_bit,
   required_band, legal_band)` (the subset+centre query), then **post-filter to
   all-distinct words** (`popcount(letter_mask) === word.length`) — the §2a
   change. Partition required vs bonus exactly as spellingbee does.
4. **Score:** `lengthScore(word) + (isPangram ? 15 : 0)`; `isPangram =
   popcount === 9`.
5. `wordwheel.create_game(target_club, setup, players, mode, board)`.

**Offline seed import** — `wordwheel:import` (mirror
`import-spellingbee-pangrams.ts`): scan `common.words` for 9-letter isograms
(`len === popcount(letter_mask)`), and for each write `word`, `letter_mask`,
`has_rare_letters`, its **`difficulty`**, and the **`word_counts`** array (§3) —
a per-band bucket of the words findable on that wheel. Computing `word_counts`
is an O(pangrams × wordlist) offline batch (a mask-subset scan per seed) — heavy
but one-time and offline, so acceptable. After `db:reset`, `wordwheel:import`
joins the `npm run import` chain (empty until run — same as spellingbee,
[[project_db_reset_needs_import]]).

## 6. Frontend (`src/wordwheel/`) — mirror spellingbee, swap the board

The **only** new UI is the wheel. Everything else — `PlayArea` (the coordinator
+ `useWordSubmit` + `useGlobalFeedback` peer narration + the menu with
Replay/New game + End/Concede), `InfoCol` (RankBar → Stats → OpponentStrip →
icon-only action row → SetupDisclosure → WordList), `BoardCol` (the below-board
capture + own-move pill), `SetupForm`, `Help`, the mobile info-sheet, the print
PDF — is a rename-only port of the spellingbee equivalents.

- **`Wheel` component** (replaces `Letters`/`Letter`/`honeycomb.ts`): one inline
  `<svg>` with **circles**, not hex polygons — a big centre `<circle>` + eight
  in a ring. Reuse the click-to-append + tap-flash + `Shuffle`-the-outer-eight
  interaction verbatim (only the geometry changes). Positions: centre at the
  middle, eight outers evenly on a circle (`angle = i * 45°`). Keep the SVG
  approach (bordered tiles + a future PDF export path), as spellingbee's doc
  notes.
- **Colours:** centre circle = a **moderately-saturated red**; outer circles =
  the **standard tile colour** (`--color-tile*` / spellingbee's outer fill).
  Add a `--wordwheel-center` token (a mid-sat red, e.g. around
  `oklch(0.62 0.15 25)` — tune against the theme; **not** a pure/alarm red).
  Centre letter renders larger than the outer letters (bigger circle + larger
  font-size), matching the physical wheel.
- Input is unchanged: the shared capture (`useCaptureKeys`) drives type-a-word;
  clicking a circle appends its letter; Enter submits. No board divergence for
  mobile — the wheel is an SVG that scales with the column like the honeycomb.

## 7. Tests

Mirror spellingbee's coverage:

- **pgTAP** (`tests/wordwheel/`): `create_game` (validation, 8 outer letters,
  required/bonus split), `submit_word` (coop dedup, compete independence, the
  target-rank win), `candidate_words` — **the new one to write carefully**:
  a word with a repeated letter is REJECTED even when its letter set ⊆ the
  wheel (the multiset rule); a distinct-letter subset word including the centre
  is accepted; the 9-letter isogram scores `length + 15`. Plus `end_game`,
  `concede`, `replay_board` (clock zero + found-words wiped, like the twins).
- **Vitest**: the `Wheel` render (8 outer + 1 centre, centre larger/red), the
  shared `lengthScore`, the ranks (reuse spellingbee's suite), the PlayArea
  smoke + icon-only action rows (mirror spellingbee's).
- **e2e**: mirror `spellingbee.e2e.ts` — a real board via the edge function,
  find a word (score advances), reject a non-legal word, **and a
  repeated-letter word rejected** (the differentiator).

## 8. Decisions

Resolved with Joel (2026-07-11):

- **`word_counts` counts required-quality words, per band** — same definition as
  spellingbee's required set (`american AND not slang AND slur = 0 AND crude =
  0`); see §3.
- **Counts are centre-agnostic** — a richness proxy, not per-centre (§3).
- **Centre is chosen uniformly** among the nine letters at build time — "see how
  it plays," revisit only if boards read thin.

**Settled / deferred:**

- **Distinct-letter wheels only.** The seed is a 9-letter isogram, so all nine
  tiles are distinct → "use each once" ⟺ "word has no repeated letter." A
  **repeated-letter wheel** (two E-tiles ⇒ E usable twice) would need a true
  per-letter count check and a non-isogram seed pool — materially more complex,
  and the newspaper wheel is effectively always distinct. **Deferred** unless
  explicitly wanted.
- **min word length = 4**, inherited from `candidate_words`' `len >= 4`
  (matches "1 point for 4-letter words"). Not a setting.
- **Pangram-required guarantee:** the seed *is* a 9-letter isogram, so every
  board has ≥1 pangram by construction.
- **Seed-pool size is now handled** by the difficulty tag (§3): ~400 seeds at
  band 1, growing as the required band rises, so a game at a normal difficulty
  draws from an ample pool. (This retires the earlier "measure the pool first"
  risk — the measurement is *done* at import time, per band, via `word_counts`.)
- **Rank/scoring reuse home:** promote `ranks.ts` + `lengthScore` to `common/`
  vs import from spellingbee — decide when building (favour `common/`).

## 9. Effort estimate

**Low-to-moderate, and lower than boggle/spellingbee were** — it's a targeted
fork of a shipped game, not new architecture. The bulk is mechanical
rename-porting; the genuinely new work is small and well-isolated:

- The **multiset filter** (§2a) — a few lines in the builder + one pgTAP test.
- The **`Wheel` SVG** (§6) — circles-in-a-ring geometry + the red-centre token;
  the interaction is copied.
- The **`wordwheel.pangrams` seed + import** (§5) — a copy of the pangram
  import with the isogram predicate, plus the per-seed `difficulty` +
  `word_counts` precompute (an offline batch).

Rough shape: a schema+RPC migration day (mostly copy-rename), a builder+seed
day (the `word_counts` precompute is the heaviest new piece), a FE day (the
wheel + the rename port), plus tests — call it ~3 focused days. The former
seed-pool risk is retired by the difficulty-tagged seeds (§3).
