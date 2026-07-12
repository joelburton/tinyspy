# Code review — 2026-07-12 (wordwheel · wordiply · crosswords delta · duplication)

Scope: the games added since the last whole-repo review (2026-07-04), reviewed for
**correctness** and for **duplication that should move to `common/`**:

- **wordwheel** (MooseWheel) — never reviewed. Full pass: FE, migration, edge fn, tests.
- **wordiply** (WordWire) — never reviewed. Full pass, same coverage.
- **crosswords** (CrossPlay) — delta only, `728a43a..HEAD` (the 2026-07-06 review was
  already worked): Guardian import, `<em>` clue emphasis, mobile view, confirm modals.
- **Cross-game duplication** — the three new games vs their siblings and `common/`.

Method: four parallel review agents (one per area), with the high/medium findings
hand-verified against the code afterwards. Findings marked **✅ verified** were
independently confirmed line-by-line; the rest were agent-verified with quoted code.
Items already in `docs/deferred.md` or `docs/games/crosswords.md` §9 are not repeated.

---

## Part 1 — Correctness

### HIGH

#### H1. ✅ wordiply: compete game gets permanently stuck in `playing` when a player concedes after the others have spent their 5 guesses

`supabase/migrations/20260713000000_wordiply.sql:863-872` (`submit_guess`) and
`:1066-1086` (`concede`).

The compete end condition — *every active (non-conceded) player has spent 5 guesses* —
is evaluated **only** inside `submit_guess`. `wordiply.concede` delegates to
`common.concede`, which ends the game only if the conceder was the **last**
non-conceded player. A player who has spent all 5 guesses is *done* but not
*conceded*, so they count as "still in the race" for `common.concede`'s check —
yet they can never submit again to re-fire the terminal check.

Repro: 2-player **untimed** compete. A submits all 5 guesses (game stays `playing`
because B is active with <5). B concedes. `common.concede` sees A still active →
returns. A has no guesses left; B can't act; no timer exists. The game is stuck in
`playing` forever — the only exits are `end_game` (the no-winner path, denying A the
win they earned) or `replay_board`. Same shape with 3+ players.

The header comment on `wordiply.concede` ("the active set is exactly 'not conceded'
and generic common.concede handles everything") is the exact false assumption: the
active set is "not conceded **and** not out of guesses."

Fix shape: after `common.concede` returns with the game still `playing`, re-run the
all-active-done check and call `_finish_compete(target_game, 'complete', true)`.
Neither `gameplay_test` nor `terminal_test` covers concede-after-opponent-finished —
add that case.

### MEDIUM

#### M1. ✅ wordiply: co-winners get an arbitrary `winner_user_id`, so the other co-winner is shown a loss banner

`supabase/migrations/20260713000000_wordiply.sql:710` (`_finish_compete`),
`src/wordiply/components/PlayArea.tsx:341-361` (`buildOver`),
`src/wordiply/manifest.ts` (`competeLabel`).

The spec (docs/games/wordiply.md, status jsonb: `winner_user_id … // null on
co-winners`; comparator rule 4: "all tied-at-top marked won") says ties yield
co-winners. The migration instead always picks one:

```sql
(select f.user_id from flagged f where f.won order by f.finished_at nulls last limit 1)
```

— earliest `finished_at` wins the slot even in an **untimed** game, where the time
tiebreak explicitly must not apply. `player_results`/`leaderboard` correctly mark
both `won = true`, but the FE verdict is driven solely by `winner_user_id`:
`buildOver` compares `winnerId === selfId` and shows the non-picked co-winner
`"<name> won with N%."` with `tone: 'lost'` — while that player's own
`game_players.result` says they won. `competeLabel`'s `leaderboard.find((e) => e.won)`
similarly names an arbitrary first winner in the club list.

`winner_test.sql` asserts `count(won) = 2` on the tie scenario but never asserts
`winner_user_id is null` — and its header comment contradicts the doc.

Fix shape: null out `winner_uid` when more than one row is flagged won; make
`buildOver` fall back to the caller's own leaderboard `won` flag with co-winner copy;
pin with a pgTAP assertion.

#### M2. wordiply: the compete terminal "full reveal" is fetched but never rendered

`src/wordiply/components/PlayArea.tsx:91-97`, `src/wordiply/components/InfoCol.tsx`.

Spec §6 promises "full reveal at terminal" in compete. The server side is all built:
the RLS terminal branch opens opponents' rows, and three RPCs perform an explicit
realtime touch whose *stated purpose* (migration comments at `:946`, `:993`, `:1079`)
is "so peers refetch the now-visible opponents' guesses." The rows do land in
`useGame().guesses` — and then nothing shows them: `PlayArea` filters the board to
self in compete (correctly — "must NOT crowd my board"), and `InfoCol`'s terminal
OpponentStrip shows only `outcome · N%`. Opponents' actual words appear nowhere.

Either the reveal UI is unbuilt (likely, given the server machinery) or spec §6
overpromises — decide which; today the terminal touches serve no visible purpose.

#### M3. ✅ wordwheel: compete timeout/manual end wipes `target_rank` + `leaderboard` from status → "no winner at Start" labels and an all-"Lost at Start" OpponentStrip

`supabase/migrations/20260712000000_wordwheel.sql:1213-1220` (`submit_timeout`) and
`:1352-1359` (`end_game`); readers at `src/wordwheel/manifest.ts:186` and
`src/wordwheel/components/InfoCol.tsx` (via `readLeaderboard`).

`common.end_game` **replaces** status wholesale. The compete timeout/manual branches
pass only `{outcome, mode}` — dropping the `target_rank` and `leaderboard` the
mid-game status carried. Two readers then misreport:

1. `manifest.ts` compete label: `(s.target_rank ?? 0)` → `RANKS[0]` → the club card
   reads `time up · no winner at Start` instead of `… at Amazing`.
2. `InfoCol`'s terminal OpponentStrip: `readLeaderboard(status)` → `[]` → every peer
   falls back to rank 0 → "Lost at Start" / "Quit at Start" regardless of the rank
   they reached (self is fine — locally computed).

`PlayArea.tsx:446-452` already documents that status is the wrong source at these
terminals and works around it for `buildOver` — the manifest and the strip just never
got the same treatment. The per-player `rank_idx` **is** written into
`game_players.result`, and found_words RLS opens at terminal, so the data exists.

**Inherited verbatim from spellingbee** (same payloads, same `?? 0` fallback) — fix
both siblings together. Simplest fix: include `target_rank` (from setup) and a final
`leaderboard` in both compete terminal payloads, matching what `submit_word`'s win
path already emits.

#### M4. crosswords: on mobile, check/reveal feedback renders behind the full-width info sheet

`src/crosswords/components/PlayArea.tsx:734` (the `slotPill` render slot) +
`src/common/components/game/InfoSheet.module.css` (`.wide { width: 100% }`).

The local-feedback slot is exclusively the active-clue bar on the main view. On
mobile, the Check/Reveal controls live *inside* the InfoSheet, which crosswords opens
`wide` (full device width) — covering the grid and the active-clue bar. Tap
"Check word" in the sheet → the response pill fires in the slot *behind* the sheet;
a timed pill (e.g. `PENCIL_SKIPPED_MSG`) can expire before the sheet is closed, so
the notice is silently lost. Mechanism verified in code; not device-verified (same
caveat as the two on-device checks already owed in docs/mobile.md).

Fix shape: while the sheet is open, either surface local feedback inside the sheet or
auto-close the sheet on a control action.

### LOW

#### wordwheel

- **L1. "New game" from a custom-letters game silently recreates the identical
  board.** `src/wordwheel/components/PlayArea.tsx:305-328` forwards `ctx.setup`
  verbatim; the game's own setup still contains `custom_center`/`custom_letters`
  (create_game strips them only from the saved *club default*), so the edge fn takes
  the custom path and rebuilds the same nine letters — same title, same word lists,
  with everyone's answer knowledge intact. The handler's own comment promises a "new
  board." Inherited from spellingbee — fix both (strip the custom fields in
  `handleNewGame`, or in the edge fn when building "new game from setup").
- **L2. `fetchPangrams` pagination has no `.order()`.**
  `supabase/functions/wordwheel-build-board/index.ts:364-382` pages 37 windows of
  1000 with `.range()` and no ORDER BY; Postgres gives no cross-statement ordering
  guarantee, so seeds can be skipped or double-counted across pages (sampling-
  distribution distortion only, never a wrong board). Spellingbee has the same loop
  but only ~3 pages. Add `.order('letters')`.
- **L3. Migration comment drift.** `20260712000000_wordwheel.sql:120-123` says
  `has_rare_letters` covers `{j q x z}+{k v w y}`; the import script and doc use
  `{j q x z k v w y b f h}`. Also `:591` "Relaxes the ≥30 gate" (wordwheel's gate is
  ≥15) and the edge fn's `target_club: uuid` header comment (it's a text handle).
- **Observations (flagged, not fixed):** `handleConcede`/`handleReplay` still use
  `window.confirm` while `handleEndGame` moved to the shared ConfirmDialog whose
  comment says it "replaces window.confirm"; `Help.tsx:42` "every board has at least
  one pangram" is untrue for custom boards; `replay_board` takes no `FOR UPDATE`
  (tiny mid-confirm race window, self-healing — same shape as spellingbee).

#### wordiply

- **L4. Coop rejoin can replay the guess backlog as a burst of feedback pills.**
  `src/wordiply/components/PlayArea.tsx:214-233`: `useGlobalFeedback`'s seen-set
  seeds when `enabled` flips true (the *header* fetch), but the guesses list arrives
  via a separate fetch — if the header resolves first, the seed captures `[]` and
  every past teammate guess fires a "X played WORD" pill on mount. Also the seen-set
  keys survive `replay_board`, silently muting a re-played word's narration.
  **wordwheel has the identical two-fetch structure** — if fixed, fix both (or fix
  in `useGlobalFeedback` itself: don't seed until the rows query has resolved once).
- **L5. `replay_board` takes no row lock and no play_state check.**
  `20260713000000_wordiply.sql:1009-1051` — every other mutating RPC starts with
  `FOR UPDATE`; a concurrent `submit_guess` can strand a committed 5th guess on the
  "fresh" board (`guesses_used: 0` with one `guess_index = 5` row). Human-scale
  window is tiny (replay requires a confirm).
- **L6. `compareCompetitors` is a dead mirror.** `src/wordiply/lib/scoring.ts:46` —
  doc §1 and the file docstring claim "the FE mirrors [the server comparator] for
  live display," but nothing outside its test calls it; the FE reads the
  server-resolved `winner_user_id`/`leaderboard`. Dead mirrors drift silently from
  `_finish_compete`: either wire it (terminal leaderboard ordering) or fix both
  claims.

#### crosswords (delta)

- **L7. Guardian "latest puzzle" scrape takes the first URL-shaped match on the
  series page and never verifies the series.**
  `supabase/functions/crosswords-import-guardian/index.ts:110` —
  `/\/crosswords\/[a-z-]+\/\d+/` can match crossword-blog or other-series links in
  nav/promo modules before the first series card, and nothing checks the fetched
  puzzle's `crosswordType` against the requested series (→ 502, or silently a
  different series' puzzle). Cheap hardening: anchor the regex to the requested
  series slug and assert `crosswordType` after fetch.
- **L8. Typing leaks to the grid when focus escapes an open confirm modal.**
  `src/crosswords/hooks/useGridKeyboard.ts:~100` — the `[data-floating-panel]` guard
  is focus-based; clicking the backdrop (a plain div, no handler) moves focus to
  `<body>`, after which letter keys fill cells behind the End/suspend confirm — the
  same class of bug the modal was introduced to fix.
- **L9. `htmlToText` decodes entities after the tag pass.**
  `src/crosswords/lib/clueHtml.ts:35-44` — literal escaped markup in a clue
  (`&lt;em&gt;word&lt;/em&gt;` as *text*) decodes into a live `<em>` that then
  renders as italics (clue's literal text lost); `&amp;lt;` double-decodes; and the
  numeric-entity decode uses `String.fromCharCode` (mangles astral code points)
  while the Guardian edge fn correctly uses `fromCodePoint` — the two decoders
  disagree. Faithful port of crossplay's ordering; no XSS (verified: no
  `dangerouslySetInnerHTML` anywhere, `parseClueRuns` output renders as React text,
  only bare attribute-less `<em>` survives the strip).
- **L10. Guardian converter silently overwrites crossing-cell solution conflicts.**
  `src/crosswords/lib/guardian.ts:129` — if across/down entries disagree at a
  crossing (corrupt feed), the later write wins and the puzzle ships unsolvable; a
  throw → 422 would surface it at import time.
- **L11. Guardian `meta.id` contains slashes** (`crosswords/quick/17529`) which flow
  into `.ipuz`/PDF download filenames (`guardian.ts:140`; browsers sanitize to
  underscores — cosmetic).
- **L12. Tapping a clue in the mobile info sheet doesn't close the sheet**, so the
  moved cursor stays hidden behind it (`onClueClick` never calls `infoSheet.close()`).
  Possibly deliberate (browse-many-clues); undocumented either way.
- **L13. A fully-solved uploaded .ipuz starts `playing` and never reaches terminal
  until someone retypes a cell** (`20260706000000_crosswords.sql:479-486` — the
  solve check lives only in `set_cell`). Self-healing curiosity.

### Checked and clean (condensed coverage notes)

- **wordwheel multiset semantics agree across all four implementations** (edge fn
  `fitsTiles`, FE `wordFitsWheel`, `TypedWord` per-char dim, `Wheel` tile-spend);
  centre spent first / freed last; pangram ⇔ 9-letter *and* fits (a non-fitting
  9-letter word never ships). An exhaustive FE-vs-SQL rank-formula sweep (totals
  1..3000) found 0 mismatches. `submit_word` locking/dedup/win-freeze, RLS
  three-branch policy, realtime publication of **both** tables (schema_test-guarded),
  create_game validation, and the import script's submask enumeration all check out.
- **wordiply**: base containment/length/dedup guards agree FE↔server; the 5th-slot
  coop race serializes on `FOR UPDATE` (the loser gets a clean error, never a 6th
  row); length-score math FE↔SQL agrees incl. clamps; **mid-game information hiding
  holds on the wire** (RLS + status carries no score fields before terminal + title
  is the bare base); the comparator's *ordering* is correct (M1 is only the
  winner-slot pick); realtime publication of both tables asserted.
- **crosswords delta**: no `dangerouslySetInnerHTML`; external Guardian/NYT HTML
  cannot reach the DOM as markup; **Guardian solutions stay server-side**
  (column-grant shielding preserved end-to-end, edge fn returns `{id}` only);
  converter geometry/length/Prize-refusal validation solid; NYT overlay import
  bounds-checked; mobile `useInfoSheet` breakpoint reset correct; confirm-modal
  keyboard ownership works (modulo L8); ⌥-shortcut remap wired end-to-end.

---

## Part 2 — Duplication → `common/`

Ordered by value. Quantification method: `sed`-rename the codename
(`wordwheel→spellingbee`) then diff — "0 delta" means byte-identical except the name.

### D1. Edge-function request-parse block + `create_game` tail — now **5 copies** (HIGH value, log-policy gated)

Two copy-pasted blocks in the board builders:

- The parse/validate block (`target_club`/`setup`/`mode`/`player_user_ids`/auth
  header, with per-line `reject:` logs): `spellingbee-build-board:440-476`,
  `wordwheel-build-board:453-489`, `wordiply-build-board:175-211`,
  `waffle-build-board:95-135`, plus a log-free copy in `boggle-build-board:57-72`
  (~35 lines each, ~95% identical).
- The `create_game` call + logging tail: 4 inline copies while
  `_shared/startGame.ts:invokeCreateGame` exists and only boggle uses it.

**docs/deferred.md → Tooling already records exactly this fold** (for
waffle+spellingbee, gated on the keep-logs policy) — wordwheel and wordiply have
since added two more copies, strengthening the already-deferred item. Proposal:
`_shared/startGame.ts` gains `parseBuildBoardRequest(req, fnName)` with the reject
logs inside (keyed by `fnName`), and `invokeCreateGame` grows the diagnostic logs so
all five adopt it. Needs Joel's call on the log lines per the keep-logs prior.

### D2. ✅ The wordwheel↔spellingbee zero-delta module set (HIGH value, mechanical)

Verified by diff — six file pairs are **byte-identical after codename rename**:

| file pair | lines | post-rename delta |
|---|---|---|
| `hooks/useGame.ts` | 139 | 0 |
| `lib/ranks.ts` (+ test) | 72 (+161) | 0 (test: comments only) |
| `lib/displayRows.ts` (+ test) | 48 (+71) | 0 |
| `lib/leaderboard.ts` | 26 | 0 |
| `components/RankBar.tsx` (+ css) | 53 (+109) | 0 (css: theme-token names only) |
| `components/Stats.tsx` (+ css) | 47 | 0 (css: token names only) |

~450 source + ~320 test lines duplicated; the pair is *required* to stay in lockstep
(same rank ladder as the byte-identical `_rank_idx` SQL). Proposal (per the
common-folders taxonomy):

- `common/lib/game/ranks.ts` (`RANKS` + `rankIdx`), `…/foundWordsDisplayRows.ts`
  (`buildDisplayRows` + `RevealWord`), `…/leaderboard.ts` (`readLeaderboard`),
  `…/letterMask.ts` (code-identical too; keep wordwheel's better multiset-caveat
  comment).
- `common/components/game/RankBar` + `Stats` — take the accent as a generic token the
  game's `theme.css` aliases (`--rankbar-accent: var(--wordwheel-accent)`). The UI is
  pixel-identical today, so no cosmetic decision is needed; the per-game token
  *values* stay per-game.
- `useGame`: either a shared factory (`makeFoundWordsUseGame({db, schema})` with the
  per-game `hooks/useGame.ts` becoming a 5-line re-export, preserving the "every game
  has a useGame" convention) — or leave it as the documented "same name, per-game
  body" seam. The factory is the recommendation; the per-game file remains the
  escape hatch if wordwheel grows a column.

**Caution:** boggle's `displayRows` and `Stats` are *deliberately different*
(per-player duplicate finds in compete — the documented anti-Boggle-rule choice;
4-cell Stats) — boggle stays out of this extraction.

### D3. The end/concede/replay/new-game handler quartet — 6 copies (MEDIUM value)

`handleEndGame`/`handleConcede`/`handleReplay`/`handleNewGame` + the `actionsRef`
wiring effect, ~50-65 lines each, in the PlayAreas of spellingbee, wordwheel,
wordiply, boggle, waffle, wordle. End/concede bodies are byte-identical modulo the
schema-scoped `db`; replay differs only in the confirm sentence; newGame only in
edge-fn name + gametype prefix. Proposal:
`common/hooks/game/useStandardGameActions.ts` taking
`{db, gameId, isTerminal, myConceded, replayConfirm, newGame: {edgeFn, …}}` and
returning the four handlers. Keep the replay-confirm wording a **required param**
(it's a deliberate per-game sentence). Fixing L1 (custom-letters strip) inside the
shared hook would fix spellingbee and wordwheel at once. Main win: game #14 gets it
free.

### D4. wordwheel's big components are 85–98% spellingbee — needs a recorded decision (MEDIUM)

`PlayArea.tsx` (673 lines, 40-line delta — the multiset logic + 🦌), `InfoCol.tsx`
(195 lines, **3-line** delta), `BoardCol.tsx` (41-line delta), `SetupForm.tsx` +
`lib/setup.ts` (39/35-line deltas). Not a mechanical extraction — two honest options:

- **(a) Accept the fork** for these five files (docs' rule 2, "same name, per-game
  body") and extract only D2. Cost to name: every future spellingbee fix must be
  hand-mirrored into wordwheel.
- **(b) A parameterized "hive-family" PlayArea/InfoCol** taking the board component +
  letter-legality strategy (set vs multiset) as props. High churn, and it couples two
  games that are already diverging (wordwheel grew `unique_letters`); the multiset
  behavior is exactly where the game's identity lives.

Recommendation: do D2 first, take (a) for now, and **record the decision in
docs/games/wordwheel.md** either way so the copies stop reading as accidental.
(`InfoCol` alone, at a 3-line delta, is safely parameterizable via an
`extraSetupItems` prop if partial extraction is wanted.)

### D5. useGame "header-once + rows-refetch" shape — 4 games (LOW-MEDIUM)

spellingbee/wordwheel (identical — covered by D2), wordiply (124 lines), boggle
(124 lines) all repeat: one-shot immutable-header fetch → `useRealtimeRefetch` →
ordered rows refetch; only schema/columns/row-type/order vary. The channel mechanics
are already shared in `useRealtimeRefetch`, so the residual duplication is ~40 lines
of fetch-and-cast per game. Only worth it if D2's factory happens and wants a second
customer; the per-game column casts are where new columns land, so indirection has a
real cost. If extracted, the load-bearing replay-TOUCH / realtime-DELETE teaching
comment should live once in the shared hook.

### D6. Migration SQL scaffolding — leave, and record why (LOW)

`wordwheel.sql` is 84% identical to `spellingbee.sql` post-rename (all 234 changed
lines verified as real game logic); wordiply shares the RPC skeleton. No extraction:
a shared `common._rank_idx` would violate the schema-per-game removability invariant
for a 10-line immutable function, the publication invariant is already guarded
per-game by each `schema_test.sql`, and migration-as-spec duplication is the
documented porting pattern.

### Looked at, not worth extracting

- `wordwheel/pdf/printWordwheelPdf.ts` correctly composes `common/pdf`; the
  board-draw callback is the intended per-game seam.
- `TypedWord` (set-dim vs count-spend) *is* the multiset delta — leave.
- `Wheel`/`Tile` vs `Letters`/`Letter`: different geometry by design.
- wordiply `GuessBoard` vs wordle `Board`: superficially similar, genuinely different
  renderers; the shared piece (`GuessKeyboard`) is already extracted.
- `Help.tsx`, `theme.css`, `manifest.ts`, `db.ts`: the documented per-game seams.
- crosswords: no meaningful sibling duplication — its big files are port-specific and
  documented as such.

Already shared and correctly consumed by all three new games (no action):
`useRealtimeRefetch`, `useWordSubmit`, `useCaptureKeys`, `GuessKeyboard`, `WordList`,
`buildGameMenu`, `makeRpcDispatcher`/`invokeStartGameEdgeFn`, the confirm helpers,
the setup field components, `common/pdf`, `_shared/http.ts`, `_shared/startGame.ts`
(`callerClient`).

---

## Suggested working order

1. **H1** (stuck compete game — small SQL fix + a pgTAP case).
2. **M1** (co-winner banner — SQL one-liner + `buildOver` fallback + pgTAP pin).
3. **M3** (wordwheel/spellingbee terminal status payloads — fix both siblings).
4. **M2** decision: build the wordiply terminal reveal UI or amend spec §6.
5. **M4** + L8/L12: the crosswords mobile-sheet/feedback/focus trio (one sitting).
6. **D2** extraction (mechanical, test-preserving), then **D1** (after the log call),
   then **D3** (fold L1's fix into it), then the D4 decision recorded in
   wordwheel.md.
7. The remaining LOWs as batch cleanup; L3's comment fixes are one commit.
