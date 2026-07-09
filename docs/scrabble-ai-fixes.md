# Scrabble move suggester — review findings (2026-07-08)

Review of the `scrabble-ai` branch (diff vs `main`, @ `5ca1a04`) against
[scrabble-ai.md](scrabble-ai.md). This is the **remediation worklist**; work
each item, then annotate it inline (the code-review-worklog convention).

**Overall verdict: high quality, faithful to the design doc.** The A&J
generator implements every subtlety the spec spelled out (emit guard,
non-anchor left-part invariants, forced prefixes, cross-pass dedup,
rated-terminal band checks inside cross-checks); the brute-force parity suite
is exactly the load-bearing test the plan demanded; all gates were green at
review time (`tsc -b`, 102 Vitest tests, pgTAP, real-edge-fn e2e). Nothing
below challenges the architecture — these are polish-tier.

Findings ranked most-severe first. Verdicts: **CONFIRMED** = reproduced or
proven against the code; **PLAUSIBLE** = the mechanism is real but the
scenario wasn't reproduced end-to-end.

## 1. Top-5 fills with duplicate word/score rows — CONFIRMED

`src/scrabble/lib/rank.ts:166` (the sort) / display in `InfoCol`.

`rankMoves` never dedups same-words/same-score variants. The generator
deliberately keeps an opening play's across form and its vertical transpose
as distinct moves (scrabble-ai.md S2 point 6 — correct for *generation*), and
positional shifts of the same word often score identically too. Verified
empirically: first-move rack `CATSERO` returns top-5 = COATS, COATS, TACO,
TACO, TACO — **2 distinct suggestions, not 5**.

**Fix shape:** dedup for *display* — after sorting, collapse rows whose
`(sorted formed-word list, score)` key matches one already taken, keep
filling until `topN` distinct rows (or the list runs out). Do it in
`rankMoves` (so the edge-fn log and the FE agree), not in InfoCol. Keep the
underlying move list complete — this is presentation dedup, the generator
must stay exhaustive. Add a first-move test asserting the top-5's word/score
keys are distinct.

**DONE (2026-07-08).** `rankMoves` now collapses by
`(sorted formed-word list, score)` after the sort/re-aim, filling to `topN`
distinct — `rank.ts`. Two tests in `rank.test.ts`: a deterministic
CAT-across-vs-transpose collapse, and the CATSERO first-move repro (asserts
the shown rows are distinct AND that raw generation really did carry dupes).
Generation untouched.

## 2. Suggestion rows survive as zombie controls after End game — CONFIRMED

`src/scrabble/components/PlayArea.tsx:237` (the `suggestView` derivation).

A `ready` list clears only when `game.version` moves past it — but
`scrabble.end_game` never bumps `version` (it only touches `club_handle` as a
realtime wake). So after End game, the five "Stage these tiles" rows keep
rendering on the terminal screen; clicking one silently no-ops
(`canPlaceRef` is false in `applySuggestedMove`). Dead interactive UI on a
finished game.

**Fix shape:** fold `isTerminal` into the derivation —
`suggest.status === 'ready' && (isTerminal || suggest.version !== game.version)
→ idle`. Stays render-derived (no clearing effect — the repo's
no-setState-in-effects rule). Don't fix it by bumping version in `end_game`;
the derivation is the right home and the version counter means "moves".
The e2e's quiet-clear assertion (play the suggestion → no staleness message)
must stay green.

**DONE (2026-07-08).** `suggestView` derivation now reads
`ready && (isTerminal || suggest.version !== game.version) → idle`
(`PlayArea.tsx`). Render-derived, no clearing effect; e2e green.

## 3. Fresh suggestions rejected when the FE's version lags — PLAUSIBLE

`src/scrabble/components/PlayArea.tsx:162` (the stale-on-arrival check).

The check compares the edge function's version (fresh, straight from the DB
snapshot) against `versionRef` (the FE's realtime copy, which can lag). If a
teammate's move hasn't reached the FE yet when the response arrives, the
response's version is **newer** — the hints answer the *current* board, but
the FE discards them with "Board changed — ask again." Re-asking loops the
same way until the CDC refetch lands. Self-heals, but the message actively
lies in that window.

**Fix shape (judgment call — cheapest honest option):** only treat the
response as stale when `payload.version < versionRef.current` is impossible
(it can't be — the server is the source), so the real cases are:
`payload.version === versionRef.current` → show; otherwise the FE is behind —
either (a) show the hints anyway and let the render-derived staleness clear
them if the FE's catch-up reveals a *different* version, or (b) keep the
current rejection but reword to something true ("Syncing — try again in a
moment"). Option (a) is better UX: the hints are correct for the board the
player is *about* to see. Joel decides.

**DONE (2026-07-08) — Joel chose option (a).** Dropped the stale-on-arrival
rejection entirely; `handleSuggest` always sets `ready`. The now-dead
`versionRef` + its effect are removed. The `suggestView` derivation (§2) is
the single staleness authority: it shows the list exactly when
`suggest.version === game.version` and hides it otherwise, so a lagging FE
displays the hints the moment it catches up to the board they answer, and a
genuinely superseded answer never surfaces. The false "Board changed — ask
again." message is gone (the e2e guard against it now holds trivially).

## 4. `LEAVE_TILE.S` is a dead constant — CONFIRMED

`src/scrabble/lib/rank.ts:93`.

`leaveValue`'s S branch hardcodes `value += 8 + LEAVE_EXTRA_S * (n - 1)`.
The module header declares the named weights "ARE the tunable surface"
(they're the strength-slider hooks), but tuning `LEAVE_TILE.S` changes
nothing — the literal `8` wins, silently, and `rank.test.ts` asserts against
the same literal so no test would catch the drift.

**Fix:** `value += LEAVE_TILE.S + LEAVE_EXTRA_S * (n - 1)` — one line. Keep
the test asserting the *behavior* (an S-holding leave's value), which now
follows the constant.

**DONE (2026-07-08).** One-line change in `rank.ts`; behavior-neutral today
(`LEAVE_TILE.S` is `8`), so the existing `rank.test.ts` assertions stay green
— the constant is now genuinely load-bearing.

## 5. Third copy of the read-once edge-fn error unwrap — CONFIRMED

`src/scrabble/components/PlayArea.tsx:144` (`handleSuggest`'s error branch).

`common/lib/game/manifestRpcs.ts` says the subtle unwrap (error.context is a
`Response` readable **once**, with a JSON-shape fallback) should "exist
exactly once" in `invokeStartGameEdgeFn` — yet `handleSuggest` copies it
verbatim (its comment even names the source), and
`crosswords/components/PlayArea.tsx` carries a third copy. A future fix
(non-JSON 500 body, changed supabase-js error shape) lands in one copy and
the other flows keep showing the generic "Edge Function returned a non-2xx
status code".

**Fix shape:** extract the error→message unwrap from `invokeStartGameEdgeFn`
into an exported helper in `manifestRpcs.ts` (or a
`common/lib/supabase/` home if that reads better — consult
[common-layout.md](common-layout.md)); call it from all three sites.
Crosswords is out of this branch's scope — fix scrabble + common here, and
flag the crosswords call site rather than touching it (the focused-scope
rule), unless Joel says otherwise.

**DONE (2026-07-08).** Extracted `unwrapEdgeFnError(error)` into
`src/common/lib/supabase/edgeFnError.ts` (the supabase-client home per
common-layout.md). `invokeStartGameEdgeFn` and scrabble's `handleSuggest`
both call it. **FLAGGED, not touched:** `crosswords/components/PlayArea.tsx`
(~line 302) still hand-rolls the same read-once unwrap — a one-line swap to
`unwrapEdgeFnError` when crosswords is in scope.

## 6. Third hand-rolled mulberry32 — CONFIRMED

`src/scrabble/lib/suggest.test.ts:341`.

`src/boggle/lib/generate.ts` exports one, `generate-stackdown-boards.ts` has
another, and the parity suite now hand-rolls a third. Scrabble *can't* import
boggle's (the per-game removability invariant forbids cross-game imports) —
which is exactly the extract-early signal.

**Fix shape:** promote mulberry32 to a `common/lib/util/` home; the scrabble
test consumes it now. Migrating boggle + the stackdown script onto it is
nice-to-have, not required for this branch (focused scope again — flag,
don't churn).

**DONE (2026-07-08).** `src/common/lib/util/mulberry32.ts` created;
`suggest.test.ts` imports it (inline copy deleted). **FLAGGED, not touched:**
`src/boggle/lib/generate.ts` and `supabase/scripts/generate-stackdown-boards.ts`
each still hand-roll their own — nice-to-have migrations onto the shared one.

## 7. `buildTrie` ratings can silently erase words — PLAUSIBLE (API guard, not a live bug)

`src/common/lib/game/trie.ts:57`.

The extraction dropped the old guarantee that every accepted word gets a
truthy terminal. With `ratings` supplied, `eow[node] = ratings[i]` verbatim:
a ratings array shorter than `words` (`undefined` → 0 in the `Uint8Array`),
a 0, or a multiple of 256 makes the word a non-word — the suggester's
`isLegal` then disagrees with `play_word` and it can claim "No legal moves"
while legal plays exist. **Not reachable today** (`common.words` constrains
difficulty to 1..6 NOT NULL; `dict.ts` builds the arrays in lockstep) — this
is a removed guard at the shared-API level.

**Fix shape:** validate in `buildTrie` — throw (or clamp-with-comment) when a
rating is missing or outside 1..255. It's shared `common/` surface now;
future consumers won't know the invariant. One small test.

**DONE (2026-07-08).** `buildTrie` now throws
`rating for "<word>" must be an integer 1..255` when a supplied rating is
missing/non-integer/out of range, checked only for accepted words (a word
skipped for non-a–z chars writes no terminal, so its rating is never
consulted). Test added to `trie.test.ts`.

## 8. (nit, below threshold) RPC checks existence before membership

`supabase/migrations/20260627000000_scrabble.sql`, `get_suggest_context`.

The row select (raising `P0002` "game not found") runs before
`common.require_game_player`, so a non-member can distinguish "no such game"
from "not your game". Meaningless under the friends trust model — recorded
only so the ordering choice is deliberate, not accidental. Fix only if
touching the function anyway (move `require_game_player` first, matching
membership-is-the-first-gate).

**DONE (2026-07-08).** Reordered in the baseline migration
`20260627000000_scrabble.sql`: `require_game_player` now runs before the
existence `SELECT`. `db:reset` + `import` clean; the get_suggest_context
pgTAP suite (and all 1255 pgTAP tests) green.

---

After working the list: gates (`npx tsc -b`, Vitest, pgTAP, the
scrabble-suggest e2e) + annotate each item here with what was done, then
update [scrabble-ai.md](scrabble-ai.md)'s status line if anything
architectural shifted (nothing above should).

**ALL 8 ITEMS DONE (2026-07-08).** Gates all green: `tsc -b` clean, eslint
clean on the touched files, Vitest 845/845, pgTAP 1255/1255, scrabble-suggest
e2e green. Nothing architectural shifted, so `scrabble-ai.md`'s status line is
untouched. Two out-of-scope follow-ups flagged for later (both nice-to-have,
neither on this branch): the crosswords copy of the edge-fn error unwrap (§5)
and the boggle + stackdown-script copies of mulberry32 (§6).
