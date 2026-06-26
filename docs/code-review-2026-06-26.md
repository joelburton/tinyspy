# Code review — 2026-06-26 (RackAttack landing + 24h sweep)

A focused review of the last 24h of work, with a lighter whole-tree pass for
context. The headline change is **RackAttack** (codename `scrabble`, the 9th
game); the window also includes substantial MonkeyGram additions (bag-size
choice, box-as-reserve, dump-to-box, legal-board check, countdown), WordNerd
answer-source + legal-guess bands, FreeBee player-pickable bands, StackDown
coop peer-feedback + 600-board library, and the app-global `~` word-lookup.

Five parallel agents each owned a dimension — **correctness**, **docs ↔
comments ↔ code**, **dead/shared CSS**, the **scrabble↔monkeygram shared-grid
question**, and **test coverage**. The two highest-stakes findings (§2.1 and
the trusting-commit verification) were confirmed by hand against the source
before write-up.

Bottom line: **no critical bugs.** RackAttack's scoring, geometry, version-CAS
concurrency, and rack RLS are correct and well-tested. The most important
finding is documentation, not code — the new `play.ts`/`board.ts` teaching
comments describe the *opposite* of the architecture that actually shipped.

---

## 0. Verification notes

- **§2.1 (play.ts comments contradict the architecture)** — verified by hand.
  `src/scrabble/lib/play.ts:7-10`, `:59-61`, `:198-199` and
  `src/scrabble/lib/board.ts:6-7` claim the server re-implements/mirrors the
  engine with a "cross-check test" and reference `scrabble._premium_at`. I
  confirmed against `supabase/migrations/20260627000000_scrabble.sql`: the
  function `_premium_at` does **not exist** (grep: not found); `play_word`
  *trusts* the FE's `placements`/`words`/`score` (migration header lines
  21-39 say so explicitly: "they are NOT the duplicated word/score logic").
  The comments are wrong, not the code.
- **Trusting-commit RLS / scoring** — spot-checked the migration directly: the
  `bag` and `rack` columns are excluded from the `authenticated` grant and
  revealed only through `security_invoker` views + definer helpers; opponent
  racks are NULL mid-game. Confirmed correct.
- **§2.2 (pass_turn signature)** — verified: SQL is
  `pass_turn(target_game uuid, base_version int)` (migration line 919); the
  doc heading omits `base_version` (`docs/games/scrabble.md:366`).

---

## Triage

| # | Sev | Area | Finding | Action |
|---|-----|------|---------|--------|
| 2.1 | **HIGH** | docs/comments | `play.ts`/`board.ts` comments describe a server that re-implements the engine + a cross-check test + `_premium_at` — none exist; the opposite of trusting-commit | rewrite 4 comments |
| 6.1 | **HIGH** | tests | Blank tiles (`?`) never exercised through SQL `play_word` — consume + persist `b:true` untested | add pgTAP case |
| 2.2 | MED | docs | `scrabble.md` §5.4 `pass_turn` missing `base_version`; §4.1 says `count`, schema is `tile_count`; `'forfeit'` kind omitted | doc edits |
| 2.3 | MED | comments | Stale inline comments in monkeygram/wordle migrations (pre-24h behavior) + monkeygram "NO validation" banner now false | edit 4 comment blocks |
| 5.1 | MED | sharing | Drag-gesture pointer plumbing is near-verbatim across scrabble↔monkeygram | extract `useDragGesture` (M) |
| 4.1 | MED | CSS | `.setup`/`.fieldset`/`.radioRow` copy-pasted across all 9 SetupForms | promote shared scaffold (M) |
| 4.2 | MED | CSS | Side-column log panel (PlayLog/SwapLog/GameLog/GuessHistory×2) is the same chrome | promote `<LogPanel>` shell (M) |
| 6.2 | MED | tests | `end_game_test.sql` vs `endgame_test.sql` — NOT a dup, but a naming footgun | rename one |
| 1.1 | MED | correctness | `consecutive_scoreless >= 6` flat threshold ignores player count (ends 4-player early) | optional: `2 * n_players` |
| 1.2 | MED | trust | `submit_timeout` does no server-side timer validation — any player can score-out | accept (trust model) or note |
| 4.3 | MED | CSS | scrabble `.letter`/`.value` glyph rules duplicated Board↔Rack (author-flagged "keep in sync") | consolidate within scrabble (S) |
| 3.1 | LOW | dead CSS | `waffle/SetupForm.module.css` `.select` orphaned after DifficultyField swap | delete |
| 3.2 | LOW | dead CSS | 14 unused `--*` theme custom properties (scrabble/tinyspy/wordknit/common) | delete |
| 6.3 | LOW | tests | scrabble cross-word dict-reject; scoreless-reset-on-play; exchange returns `?`; `usePeerFeedback` hook | add as convenient |
| 2.4 | LOW | comments | `monkeygram/lib/setup.ts:18` "Two choices" but type has 6+; wordle setup-shape comment stale | edit |

---

## 1. Correctness

RackAttack is in good shape. Scoring (letter values, premium stacking,
blank-on-premium = 0, the +50 bingo), word extraction (main + every
cross-word), geometry gates (center-cover, connectivity, contiguity, no gaps),
the `version` optimistic-concurrency CAS (`select … for update` + version
compare; no lost-update window), bag/blank threading, and rack RLS are all
correct and covered. The three items below are **rules deviations / trust
surfaces, not bugs**, and all are defensible under the documented
friends/alpha/trusting-commit posture.

### 1.1 — `consecutive_scoreless >= 6` is a flat threshold (MED rules / LOW practice)

`supabase/migrations/20260627000000_scrabble.sql` (blocked-end check, ~line
894/963). Real Scrabble ends when *all players pass twice in a row* —
`2 × n_players` scoreless turns. The flat `6` is stricter than the rule for 2
players (harmless) but *looser* for 4 (ends after 1.5 rounds instead of 2).
Low-stakes; fix only if rule-accuracy matters: use `2 * n_players`.

### 1.2 — `submit_timeout` has no server-side timer validation (MED trust surface)

The RPC runs full competitive scoring and crowns a winner, but doesn't verify
the countdown actually expired — any single compete player can trigger it from
devtools. This matches the documented trust model (friends, not anti-cheat),
exactly like the §1.4 finding from the 2026-06-21 review. **Recommend: accept,
but make sure the comment says "any player may end; the timer is an FE
affordance" rather than implying server enforcement.**

### 1.3 — The real trust-model gap: server can't re-derive words from placements (MED, by design)

`play_word` validates each *submitted* word against the dictionary but never
checks that the submitted `words` actually correspond to the `placements` +
board. A buggy (not malicious) FE that omits a cross-word would plant an
illegal cross-word on the **shared** board — and unlike score-fudging, that
corrupts board legality for everyone. This is the single biggest "what the
server can't catch." It is **acceptable per the trust model**; flagging only so
the decision is explicit. If board integrity ever matters more than the trust
model implies, a cheap server-side re-extraction (the geometry already lives in
`play.ts` and could be ported) closes it — but that would re-introduce exactly
the SQL duplication the architecture deliberately avoids. **Recommend: leave;
document the tradeoff in `scrabble.md` §6 (it's partially there already).**

---

## 2. Docs ↔ comments ↔ code

The prose game docs (`scrabble.md`, `monkeygram.md`, `wordle.md`, `freebee.md`,
`stackdown.md` bodies), CLAUDE.md's doc-index/roster, and README are **current
and correct** — all 9 games listed, counts right. The drift is concentrated in
**inline code/migration comments** that describe pre-24h behavior.

### 2.1 — HIGH: `play.ts`/`board.ts` comments describe the opposite of the shipped architecture

`src/scrabble/lib/play.ts:7-10` calls `play.ts` "the authoritative spec the
server **re-implements** in `scrabble.play_word` … kept in lockstep by a
**cross-check test**, the way `freebee.ranks.ts` mirrors `freebee._rank_idx`."
`:59-61` ("Mirrors the checks in `scrabble.play_word`; the server repeats all
of this") and `:198-199` ("The server's `play_word` computes the same
numbers") repeat the claim. `src/scrabble/lib/board.ts:6-7` references
`scrabble._premium_at`, which doesn't exist.

This is the inverse of what shipped. The migration header (lines 21-39) and
`scrabble.md` (§6, line 544: "No TS↔SQL mirror test — there's no SQL scoring to
mirror") are explicit that the server **trusts** the FE's numbers and does
*not* recompute geometry/words/score. These are exactly the teaching comments
this repo prizes — which makes a comment that teaches the wrong mental model
actively harmful. **Fix:** rewrite all four to the trusting-commit model
(`play.ts` is the sole source of geometry+scoring; the server trusts, doesn't
mirror; no cross-check test; drop the `freebee.ranks.ts` analogy and the
`_premium_at` reference — the only real SQL mirror is the bag distribution +
`_tile_value`).

### 2.2 — MED: `scrabble.md` signature/column errors

- `docs/games/scrabble.md:366` — `pass_turn(target_game)` should be
  `pass_turn(target_game, base_version int)`; the §5.4 body should mention the
  stale-guard + `{result, version, terminal}` return (currently silent on it).
- `docs/games/scrabble.md:263` — the `'exchange'` play column is documented as
  `count`; the schema column is `tile_count` (migration line 228). The §4.1
  table also omits the `'forfeit'` kind (described elsewhere, missing here).

### 2.3 — MED: stale migration banners (pre-24h behavior)

- `supabase/migrations/20260623000000_monkeygram.sql:16-17` — "There is **NO**
  word/connectivity validation (we trust the friends)" directly contradicts
  `_win_blockers` (always-on connectivity + opt-in words), now called by
  `peel`. Replace with the actual rule.
- `…monkeygram.sql:247-253` — `create_game` setup-shape comment lists only
  `{hand_size, timer}` with a "placeholder timer" note; it now reads
  `bag_size/check_words/dict_2/dict_3plus/dump_to_box` and the timer is real.
- `supabase/migrations/20260625000000_wordle.sql:27-29` and `:282-288` —
  header + create_game comment say the target is *always* a random answer-list
  word and guesses validate against a fixed `≤ 4` slice; both are now
  configurable (`answer_source` 0..6, `legal_guess` band). `wordle.md` itself
  is correct.

### 2.4 — LOW

- `src/monkeygram/lib/setup.ts:18` — docstring says "Two choices" but the type
  now has 6+ fields. `src/scrabble/lib/board.ts:9` also rolls into §2.1's fix.

---

## 3. Dead CSS

Sweep matched class selectors against real `styles.X` / `styles['X']` accesses
(dynamic `styles[var]` lookups were verified live, not flagged).

### 3.1 — `.select` orphan (delete)

`src/waffle/components/SetupForm.module.css:34` — `.select` styled the native
`<select>` replaced by the shared `DifficultyField` in `2a4bd9b`. No reference
remains. Safe delete.

### 3.2 — Unused theme custom properties (delete, 14)

Defined but never consumed in any `var()` or JS string:
- `src/scrabble/theme.css:9` — `--scrabble-cell-line`
- `src/common/theme.css:82,89` — `--color-outcome-near-bg`,
  `--color-outcome-current-bg`
- `src/wordknit/theme.css:31-34` — `--wordknit-rank-0-text`…`-3-text` (the
  non-`-text` variants ARE used via `rankColors.ts`)
- `src/tinyspy/theme.css:28,29,35,38,47,48,49` — seven `--tinyspy-*-soft*` /
  `*-bg` vars

No other dead classes found — most apparent orphans (`.DL/.DW/.TL/.TW`,
wordle/waffle color classes, `.won/.lost/.coop/.compete`, member colors) are
live via dynamic lookups and were confirmed.

---

## 4. Shareable CSS / components

This repo values **clarity over DRY** (CLAUDE.md), so these are filtered to
genuine same-thing duplication, not coincidental similarity.

### 4.1 — SetupForm scaffolding (promote, M)

`.setup` is byte-identical across all 9 `components/SetupForm.module.css`;
`.fieldset` identical in 7 (±0.15rem padding); `.radioRow`/`.radio` repeat in
6. `common/` already owns `SetupGameDialog`, `DifficultyField`, `TimerField`,
so the seam exists. Promote a shared setup CSS module or `<Fieldset>` /
`<RadioRow>` primitive.

### 4.2 — Side-column log panel (promote, M)

`scrabble/PlayLog`, `waffle/SwapLog`, `tinyspy/GameLog`,
`wordknit/GuessHistory`, `psychicnum/GuessHistory` all implement the same
chrome: a `.heading` over a scrolling flex-column `.list`
(`overflow-y:auto; min-height:0`) of bordered card rows. The waffle/tinyspy CSS
comments *already cross-reference each other* ("Mirrors the GuessHistory
card pattern from psychicnum/wordknit"). The row *content* legitimately
differs per game; the panel shell does not. Promote a `<LogPanel>` /
`.logList` shell; games supply the row body.

### 4.3 — scrabble Board↔Rack glyph CSS (consolidate within scrabble, S)

`src/scrabble/components/Rack.module.css:51-65` and `Board.module.css:103-122`
carry identical `.letter`/`.value` glyph layout, with author comments on both
sides saying "MUST stay in sync." This is the most acute duplication in the new
code — and it's *intra*-game. Pull into one shared glyph rule (`composes:` or a
`tileGlyph.module.css`).

### Leave alone (coincidental, not the same thing)

- **Cross-game tile squares** (scrabble/monkeygram/stackdown/wordle/freebee) —
  share only a trivial "flex-center + bold + border" baseline; mechanics
  (point values, hex positioning, cqi vs px sizing, feedback states) genuinely
  differ.
- **Player-status strips / `.dot`** — the shared piece is ~3 lines and each
  strip diverges; `common/` already has `PlayersStrip`/`OpponentStrip`.
- **freebee `Feedback` vs common `FeedbackPill`** — same pill *shape*,
  different role (in-body auto-timeout vs header pill with close/truncation).
  Borderline; not a clean drop-in today.

---

## 5. The scrabble ↔ monkeygram shared-grid question (your specific ask)

Both grids grew from the same template (scrabble's docstrings say "mirrors
MonkeyGram exactly"). I compared them line by line. **There is exactly one
extraction that pays for itself; the rest would fight the games' real
differences.**

### 5.1 — `useDragGesture` hook — the clear win (extract, M)

The pointer state machine is near-**verbatim** in both:
- `cellAtPoint`/`overXAtPoint`: `monkeygram/PlayerBoard.tsx:72-83` ≈
  `scrabble/PlayArea.tsx:38-45` (only `data-row/col` vs `data-x/y`).
- `onGestureMove` (DRAG_THRESHOLD=4, `Math.hypot` promotion, body
  `*-dragging` class, `setDrag`/`setHover`): `PlayerBoard.tsx:327-345` ≈
  `PlayArea.tsx:303-314`.
- The `window.addEventListener('pointermove'/'pointerup')` effect
  (`PlayerBoard.tsx:365-372` ≈ `PlayArea.tsx:335-342`) is **byte-identical**.
- `onGestureUp` / `onCellPointerDown` share shape.

What differs is only the **drop semantics** (`finishDrag`) and the `source`
union — both already isolated into a callback. Extraction shape: a
`src/common/hooks/useDragGesture.ts` owning the `gestureRef`,
threshold-promotion, window listeners, `drag`/`hover` state, and body-class
toggle, parameterized by `{ dragClass, cellAtPoint, onDrop(source,x,y),
onTap(...) }`. Low-risk; the seam is clean. **Recommend doing this.**

### 5.2 — Cursor reducer — marginal (extract only if touching it, S)

Arrow-key rotate/move + Backspace step-back is the same algorithm
(`PlayerBoard.tsx:463-474` ≈ `PlayArea.tsx:391-402`; `clamp` is literally
duplicated). But it's ~15 lines and the surrounding `typeLetter` is where the
games genuinely diverge (monkeygram: multiset hand check + swap-on-filled;
scrabble: rack-slot + blank fallback + skip-committed + stage-into-array).
At most extract a pure `moveCursor(cursor, key, max)` / `stepBack` into
`common/lib`. **Do NOT build a `useGridCursor` that owns placement** — it would
force two unlike rule engines through one interface and obscure both.

### 5.3 — Grid container / sizing — do NOT share

Opposite strategies: monkeygram is a **fixed-px, JS-zoom, scrollable 25×25
arena** (`gridTemplateColumns: repeat(25, ${cell}px)`, `fontSize: cell *
SCALE`); scrabble is a **`1fr`-cell, `aspect-ratio:1`, container-query-fit
15×15 board** (`cqmin`/`cqi` glyph scaling, no JS sizing). A shared `<TileGrid>`
would need a prop explosion to span both. The only shareable slice is the
~15-line cursor-ring CSS (`.cursor/.cursorH/.cursorV`, already visually
identical and comment-cross-referenced) — optional, low value.

| candidate | same algorithm? | extract | effort | worth it? |
|---|---|---|---|---|
| drag-gesture plumbing | yes, near-verbatim | `useDragGesture` hook | M | **yes** |
| cursor reducer (arrows/backspace) | yes | pure `moveCursor`/`stepBack` | S | marginal |
| `typeLetter` / placement | no (rules diverge) | — | — | no |
| grid container + sizing | no (px-zoom vs cq-fit) | — | — | no |
| cursor-ring CSS | yes | shared CSS | S | optional |
| tile component | no (value/blank vs plain) | — | — | no (but §4.3 intra-scrabble) |

---

## 6. Test coverage

Strong overall. RackAttack ships a thorough pure-engine suite
(`play.test.ts`: center-cover, single-tile reject, diagonal/gap/no-connect,
main + cross-words, premium-per-word, blank-on-premium=0, +50 bingo;
`board.test.ts`: distribution=100, premium counts, 180° symmetry) and a broad
pgTAP suite (`create_game`, `play_word` guards, `exchange_pass`, RLS hidden-bag
+ own-only rack + terminal reveal). MonkeyGram's new `legal_check_test.sql` and
`submit_timeout_test.sql` are high quality. Gaps:

### 6.1 — HIGH: blank tiles never exercised through SQL `play_word`

No scrabble pgTAP test sends a `"blank":true` placement. The server path is
non-trivial: `_remove_tiles` must consume `?` (not the declared letter,
migration line 720) and the board jsonb must persist `{"l":"Q","b":true}`. The
lib test covers blank *scoring*; the server consume/persist path is untested.
Add a `play_word` case: rigged rack with `?`, play a blank-as-letter word,
assert the rack loses `?` and the cell has `b:true`. (Also untested:
`exchange_tiles` returning a `?` to the bag.)

### 6.2 — MED: `end_game_test.sql` vs `endgame_test.sql` naming footgun

These are **not** duplicates — `end_game_test.sql` covers manual `end_game` +
`submit_timeout`; `endgame_test.sql` covers the automatic `_finish` paths
(going-out, blocked-6, leftover transfer, tie co-winners). Both are
intentional and well-targeted. But the one-character difference is a future
trap. Rename to something like `manual_end_test.sql` / `auto_finish_test.sql`.

### 6.3 — LOW

- scrabble: cross-word dictionary reject not asserted server-side (tests reject
  a bad *main* word only); `consecutive_scoreless` reset on a scoring play not
  asserted; `exchange_tiles` returning `?` untested.
- wordle: `legal_guess` band is covered (`legal_guess_test.sql`); the
  `answer_source` setting is only used as a fixture, never directly asserted —
  add a target-source assertion (or confirm `create_game_test.sql` covers it).
- `src/stackdown/hooks/usePeerFeedback.ts` (new, 108 lines) has no `renderHook`
  test. The repo does test hooks (`useRecentlyFound.test.ts`,
  `common/hooks/*.test.ts`); the bootstrap-ref / per-kind pill text / flash
  callback are worth a test. Low severity (presentational coop narration).

---

## 7. Recommended plan

Ordered by value/effort. Items 1–3 are quick and high-leverage; do them first.

1. **Fix the §2.1 comments (HIGH, ~15 min).** Rewrite the four
   `play.ts`/`board.ts` comments to the trusting-commit model. This is the most
   important finding — a teaching comment teaching the wrong model. While there,
   the §2.2 `scrabble.md` signature/column edits and §2.3/§2.4 stale banners.

2. **Add the blank-tile `play_word` pgTAP case (§6.1, HIGH, ~30 min).** Core
   rule, completely untested server-side. Bundle the §6.3 cheap assertions
   (cross-word reject, scoreless-reset, exchange `?`) while in the file.

3. **Delete dead CSS (§3, LOW, ~10 min).** `.select` + 14 unused custom
   properties. Trivial, keeps the surface honest.

4. **Rename the `end*game*_test.sql` pair (§6.2, ~5 min).**

5. **Extract `useDragGesture` (§5.1, M, ~half day).** The one shared-grid win.
   Pull the pointer-listener boilerplate + threshold/tap-vs-drag state machine
   into `common/hooks/`; leave `finishDrag`/`typeLetter`/grid-sizing per-game.
   Do **not** chase a `useGridCursor` or shared `<TileGrid>` (§5.2/§5.3) — the
   games' placement rules and sizing strategies genuinely differ.

6. **Promote shared CSS (§4.1 SetupForm scaffold, §4.2 LogPanel shell; M
   each).** Both are real same-thing duplication across 5–9 games with the
   seam already established in `common/`. Consolidate scrabble's Board↔Rack
   glyph CSS (§4.3, S) at the same time.

7. **Decisions to confirm (no code unless you want it):**
   - §1.1 `consecutive_scoreless`: flat 6 vs `2 * n_players`. Probably leave.
   - §1.2/§1.3 trust surfaces (`submit_timeout` no timer check; server doesn't
     re-derive words): **accept under the trust model**, but make the comments
     say so plainly rather than implying enforcement.

What's explicitly **not** worth doing: forcing a shared tile component or grid
container across games (§4 "leave alone", §5.3), or re-introducing SQL-side
scoring to close §1.3 — both fight the deliberate design.
