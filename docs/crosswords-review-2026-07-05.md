# Crosswords (CrossPlay) build review — 2026-07-05

Review of the crosswords build, commits `29790b9..6d48c96` (stages 1–7 + fixes) on `main`,
implemented from `docs/crosswords-plan.md`. Dimensions reviewed: correctness (including port
fidelity vs `~/src/crossplay`, the authoritative source per the verify-port-deviations rule),
integration with `common/`, test coverage of risky areas, and docs/comment accuracy.

Method: five parallel review agents (SQL/RPC/pgTAP · port fidelity · FE/hooks/e2e · scratchpad ·
docs), each reading both this repo and the crossplay source. Every **major** finding below was
then hand-verified against the actual code by the reviewing session — none rests on an agent's
word alone.

**Gates at review time (all green):** `tsc -b` clean · eslint clean · Vitest 754/754 ·
pgTAP 1200/1200 (89 files, including the new crosswords + scratchpad suites).

## Verdict

The build is high quality. The verbatim-mandated ports are genuinely verbatim (cursor.ts with
all 37 tests, the `.puz`/`.ipuz` parsers, contentHash, the entire PDF module); the schema work
(replica-identity reasoning, `nulls not distinct`, column-grant shielding on both tables, the
win-race lock) is correct and excellently documented; the scratchpad landed as a genuinely
common, removability-clean feature; compete privacy is enforced in both the places it needs to
be (RLS on read + the `useCells` client drop).

Three things need real attention:

1. **C1 — the rebus first-letter rule diverges from crossplay**, and the divergence traces to
   the *plan's own amendment #13 misreading `ws.ts`*, so migration + pgTAP + docs all encode
   the wrong rule while claiming to mirror the source.
2. **C2 — a failed `set_cell` leaves a permanently-stale optimistic cell** in `useCells`
   (the version scheme makes refetch unable to repair it).
3. **T1 — the riskiest new code is the least tested**: `useCells` and `useScratchpad` have zero
   unit tests, and e2e never asserts the two headline multiplayer behaviors (coop letter sync
   between clients; compete grid privacy).

Everything else is minor/nit grade: a cluster of unplanned keyboard/rebus feature drops, three
self-healing scratchpad lock races, and a sweep of stale comments describing the superseded
NYT-writes-puzzles flow.

---

## 1 · Correctness

### C1 — MAJOR: first-letter acceptance is keyed on the wrong length (`_matches` vs `fillMatchesSolution`)

`supabase/migrations/20260706000000_crosswords.sql:195`:

```sql
where p_fill = s.ans
   or (jsonb_array_length(p_sols) > 1 and p_fill = left(s.ans, 1))
```

Crossplay, `~/src/crossplay/packages/server/src/ws.ts:513`:

```ts
for (const sol of sols) {
  if (fill === sol) return true;
  if (sol.length > 1 && fill === sol[0]) return true;
}
```

`sol` is a **string** — `sol.length > 1` means "this candidate answer is multi-char (a rebus)",
not "there are multiple candidates (Schrödinger)". Crossplay's docstring says so explicitly
("for length > 1 candidates … a long-standing NYT convention for rebus answers"), and its
`rebus.test.ts:172` pins it: fill `"I"` for the single-candidate solution `["INSECT"]` is
**correct**. In this port, that same fill is flagged wrong by check and blocks solve. Every NYT
rebus puzzle is affected.

Provenance matters here: **the build is not at fault** — plan amendment #13 ("first-letter
acceptance is Schrödinger-only") misread `ws.ts:513` (array length vs candidate-string length),
and the build faithfully implemented the amendment, pinned it in pgTAP
(`gameplay_test.sql` — `_matches('H','["HEART"]')` → false), and documented it in
`docs/games/crosswords.md` §3 *as mirrored from ws.ts*. Under the verify-port-deviations rule
the source + its tests are unambiguous, so this goes to Joel as a decision:

- **Match crossplay** (recommended): one-line fix — `length(s.ans) > 1` instead of
  `jsonb_array_length(p_sols) > 1` — plus flipping the pgTAP pin and the doc sentence, **or**
- keep the stricter rule as a deliberate re-decision, and fix the "mirrored from ws.ts" claims
  in `crosswords.md` §3 and the `_matches` docstring (they are currently false either way).

Note the two rules only agree today by coincidence on Schrödinger cells; the plan's prose and
the amendment both need a correction note so the misreading doesn't propagate.

### C2 — MAJOR: failed `set_cell` leaves an unrepairable stale optimistic cell

`src/crosswords/hooks/useCells.ts:139–173`. The optimistic apply keeps the cell's *current*
version; on RPC error the function returns `{ error }` with **no revert** (PlayArea just shows a
pill). Because both the CDC apply and the `load()` merge are strict `next.version >
cur.version`, a later refetch — even the SUBSCRIBED reconnect refetch — carries the *same*
version the stale cell already holds and is dropped. The wrong letter is stuck until another
player writes that cell (coop) or a full remount; in compete (private grid) it sticks
indefinitely, silently diverging from the server.

Fix shape: snapshot the pre-optimistic state and re-apply it on error, or make the explicit
`load()` path authoritative (apply on `>=`, or replace rather than merge). Hand-verified.

### C3 — MINOR: scratchpad lock protocol has three related races (crossplay's arbitration was dropped without substitutes)

`src/common/hooks/scratchpad/useScratchpad.ts`. All three self-heal within seconds and cannot
corrupt the DB, but each can visibly eat or revert a friend's in-flight sentence:

- **C3a — no "am I the editor" guard on CDC apply** (`applyBody`, :70–75): any newer CDC row
  lands straight in the textarea. Crossplay guards exactly this (`ScratchpadPanel.tsx`:
  "When we DO hold it, we ignore incoming text"). If the CDC event outruns the flush RPC
  response, the editor's keystrokes typed during the flush RTT visibly revert (caret jumps to
  end), then self-heal on the next flush. This is the highest-value fix (~3 lines) and looks
  like an omission, not a decision. Hand-verified.
- **C3b — no claim tiebreak** (:108–113): simultaneous first keystrokes → each client adopts
  the *other's* claim → both read-only for up to ~4s (`STALE_MS`), with neither heartbeating.
  And since `common.set_scratchpad` has no lock check (documented as FE-only), the loser's
  in-flight debounced flush still lands and, being a whole-body higher-version write,
  CDC-clobbers the winner's text via C3a. Crossplay's server arbitrates both (reject-within-
  grace, drop non-holder edits).
- **C3c — late joiners see no lock state for ≤1s** (no snapshot-on-join; Broadcast has no
  history): typing in that window silently steals the lock from an actively-typing holder.
  Crossplay sends `scratchpadState` incl. `lockedBy` to every new socket.

Also in this area, minor: the takeover-grace semantics differ from both crossplay and the plan
(grace anchored to last *claim broadcast* — refreshed by the 1s heartbeat — rather than last
*edit*, so "Take over" can never appear against a connected holder; defensible serverless
design, but undocumented as a deviation), and flush failures are **silently swallowed**
(`:158–169` — no log, no retry; notes typed in the last 300ms before the game turns terminal
are shown locally and lost on reload; against the keep-logs ethos at least a `console.warn` is
owed).

### C4 — MINOR: unplanned keyboard/rebus feature drops (undocumented port deviations)

The verbatim surfaces are faithful, but the interactive layer silently dropped a cluster the
plan didn't sanction (none are in `deferred.md` or the game doc):

- **`#` jump-to-number** — explicitly plan-enumerated ("letters, Backspace, Space, arrows, Tab,
  rebus entry, `#` jump — Port", plan line 78); no handler, no component, no mention anywhere.
  The biggest of these.
- **Shift+Backspace** (clear current word, `PuzzleView.tsx:1013`).
- **Shift+Space rebus peek** — compounding: the collapse-rebus toggle was *planned*-dropped,
  so the port keeps rebus support but has dropped **both** of crossplay's rebus-legibility
  mitigations (an 8-char rebus renders at the 0.22em font floor).
- **Rebus overlay is 1 cell wide** vs crossplay's 3-cell centered/clamped box
  (`Board.tsx:74–92`); long rebus entry is cramped in a 1em box.
- **Rebus Tab silently cancels**: crossplay's RebusInput commits on Tab (commit-and-jump); the
  port only commits on Enter, so Tab → native focus move → `onBlur` → the typed rebus is
  discarded.
- **`recentFills` peer-fill flash** (3s color flash when a teammate fills a cell) — in coop
  free-for-all this is the "who just typed that?" signal, a sibling of the peer cursors the
  plan did require.

Each needs either a port or a one-line entry in `deferred.md` recording the drop.

### C5 — MINOR: compete terminal never shows opponents' grids

The RLS policy deliberately opens opponents' rows at terminal (`cells_select`, pinned in
`rls_test.sql`), but the FE never uses it: `useCells` always filters to own owner and PlayArea
renders one grid. Decision 4 in the plan covers *mid-game* only. Either dead RLS surface or a
missing feature — needs a decision recorded (and `crosswords.md`'s "until terminal" wording
currently implies visibility that the UI never delivers).

### C6 — MINOR: all-concede compete shows "Time's up." (crosswords has no timer)

`PlayArea.tsx:411–412` maps `play_state = 'lost'` to `verdict: "Time's up."`. That branch is
reachable: `common.concede`'s last-active-conceder path ends the game with `'lost'`
(`20260615000000_common.sql:1565`), and crosswords is always `timer: {kind:'none'}`. Copy
should say everyone conceded. Hand-verified.

### C7 — MINOR: conceded compete player gets no locally-terminal messaging

`myConceded` only disables input; the shared `outOfRacePill` ("You conceded — the rest are
still racing.") used by waffle/wordle/connections/psychicnum is not wired up. After conceding,
buttons grey out and the keyboard dies with no explanation — the one genuinely missing item
from the plan's mandatory-elements checklist. Hand-verified.

### C8 — MINOR: peer-cursor broadcast is unthrottled

`usePeerCursors.ts:66–74` sends one Broadcast per cursor change (arrow-key auto-repeat = a
message per repeat). Crossplay deliberately throttles to ~80ms leading+trailing
(`PuzzleView.tsx:99, 468`). Undocumented deviation, and it compounds the plan's own
Realtime-quota watch-item.

### C9 — smaller correctness notes

- **`set_cell` accepts any characters** (only `upper()` + length ≤ 8); crossplay enforces
  `^[A-Z]{1,8}$` (`ws.ts:215`). A fill like `"1"` persists and renders. Also `''` clears the
  cell where crossplay rejects it — benign, real, unflagged.
- **`check_cells`/`reveal_cells` skip the `conceded` guard** that `set_cell` has — a conceded
  compete player can still run checks. Inconsistent sibling-mutator guard set; low stakes.
- **`saved_default` persists `puzzle_id`** (`create_game` passes `setup` verbatim as the club
  default). A specific puzzle is a per-game choice, not a club preference — same category as
  codenamesduet's `firstClueGiverUserId`, which is deliberately stripped. Should be stripped.
- **Coop read-committed solve races** (both nit-grade, friend-scale probability ≈ 0, crossplay
  avoided them by being single-threaded): (a) two players filling the last two empty cells
  simultaneously can each miss the solved state — neither transaction sees the other's
  uncommitted write, and no further keystroke would re-trigger the check (a re-type heals it);
  (b) conversely a fill + a concurrent clear can terminate a not-actually-complete grid.
  Worth a comment in `_maybe_finish` at most.
- **`reveal_cells` on an empty solution array** would write `fill = null, revealed = true`;
  crossplay's `revealAt` skips `sols.length === 0`. Never occurs with real puzzles.
- **`set_scratchpad` allows writing the shared (`owner null`) pad in a compete game** (no mode
  awareness, no conceded guard) — a theoretical cross-opponent channel the FE never exposes;
  fine under the trust model, noted because the table comment states the compete-privacy
  rationale.
- **`useCells` channel name lacks the `channelDedupSuffix()`** the Pattern-A convention
  requires (`crosswords:cells:${gameId}`, postgres-changes-only) — the exact StrictMode
  double-mount footgun `channelDedup.ts` exists for, and `main.tsx` does run StrictMode.
- **Same-cell rapid typing** can transiently flicker an older letter back (RPC-A's version
  adoption beats optimistic-B until RPC-B resolves); converges to server order. A per-cell
  in-flight guard or a comment would do.
- **Terminal strip may reflow**: `{!isTerminal && <toolRow>}` / `{isTerminal && <BackToClub>}`
  swap in a non-height-reserved `.strip` row, and the tool row's buttons are compacted while
  `BackToClubButton` is full-size. Flagged per the no-reflow rule but **not verified with a
  headless render** — needs a screenshot check before calling it either way.
- **NYT nits**: `htmlToText` regex drift (`/gi`, `[\d\s]+` vs `[0-9 ]+`); `nytAuthor` returns
  editor alone when constructors is empty (quiet bugfix vs crossplay's `" / Ed"`); `meta.id`
  falls back to `'nyt'` instead of the print date the edge function has in hand; the edge-fn
  cookie parsing silently filters what crossplay's `parseStoredCookieJar` throws on.
- **Terminal navigation is half-alive**: keyboard fully disabled at terminal but mouse clicks
  still move the cursor; you can't arrow around the revealed solution.

---

## 2 · Integration with common/

Mostly exemplary; the misses are small.

**Used well:** `useLocalFeedback` + `stickyPill`/`terminalPill` exactly per contract;
`GenericFeedbackPill` in the reserved clue bar (nowrap + ellipsis — the 3-line slot genuinely
cannot grow, so the plan's fixed-height promise holds); `TerminalModal` + `endedCopy`;
`EndGameButton`/`ConcedeGameButton`/`BackToClubButton`; `invokeStartGameEdgeFn` +
`makeRpcDispatcher`; `isNonGameField`; concede via the standard `common.concede` wrapper;
print via `menu.setGameItems` with a click-time ref snapshot (avoids per-keystroke menu
rebuilds). The scratchpad is a real common feature: `GameScratchpad` sits on `FloatingPanel` +
`useDraggablePanel` (persisted per-game rect), `scratchpadOpenStore` mirrors `chatOpenStore`,
GamePage gates it purely off the manifest field, and **zero `crosswords` references exist under
`src/common/`** — the removability invariant holds.

**Misses / notes:**

- `outOfRacePill` not used (C7).
- `useGridKeyboard` hand-rolls the ref-dispatch + window-listener + field-bail plumbing that
  `useGlobalKeyHandler` provides. The bypass is *defensible* (it needs the Tab-in-field
  carve-out and `isNonGameField`), but the docstring doesn't say why it skipped the common
  primitive — one sentence owed. (`useCaptureKeys` is genuinely the wrong shape here.)
- `useGame` being a one-shot fetch (not `useRealtimeRefetch`) is a *justified* deviation from
  the plan's sketch, documented in its docstring — but see D4: migration comments still
  describe `crosswords.games` subscribers that don't exist.
- Hardcoded colors in `PlayArea.module.css` (`#444`) and `Grid.module.css` (`#fff`/`#333`/
  `#111`/`#fffbe6`) alongside theme tokens — arguably the ported crossplay paper look, but
  undocumented as such. `.wrap` uses `100vh` while the cell math and design-decisions.md say
  `100dvh` (desktop-only, cosmetic).

**Settled question:** the 72c4f0d removal of the state readout + setup recap **is documented as
deliberate** ("Per Joel", recorded in `design-decisions.md:291–292` as "omitted for now, to be
reintroduced elsewhere") — a sanctioned deviation, not a checklist violation.

---

## 3 · Test coverage of risky areas

### T1 — MAJOR: the reconciliation/privacy layer has no tests at any level

- **`useCells` has zero unit tests** — the plan explicitly called it "new, separately-tested
  code". Newer-wins, echo adoption, the error path (C2), and the compete `isMine` drop are
  all unpinned.
- **The compete privacy drop is untested at every level.** pgTAP pins the RLS *read*, but the
  FE client-drop is precisely the thing RLS does not cover (the plan's pressure-test point 12),
  and no e2e has two compete clients asserting Bob never sees Alice's fills.
- **No e2e asserts coop cell sync between two clients** — the core CDC direct-apply path
  (Alice types, Bob sees the letter). The existing peer-cursor test already has two clients on
  one board; the assertion is ~two lines away.
- **`useScratchpad` (the raciest code in the feature) and `scratchpadOpenStore` have zero unit
  tests** — notable because the store's model, `chatOpenStore`, has a test file. e2e covers
  coop sync + lock display only; the take-over flow, lock expiry, compete pad privacy, and
  terminal read-only are unexercised.

### T2 — pgTAP gaps (suite is otherwise solid; ~500 lines ≈ boggle, against a larger surface)

Pinned and correct: shielding negative tests on **both** tables, `games_state` NULL-until-
terminal, pencil-skipped-by-check + pencil-counts-toward-solve (the subtlest ws.ts behavior,
pinned on both sides), uppercase/version/8-char/given guards, coop + compete RLS pre/post
terminal, both win paths, concede suite, both create paths, all six scratchpad pins.

Missing pins, riskiest first:

| behavior | status |
|---|---|
| rebus first-letter rule | **pinned WRONG** (C1 — the pin enforces the misread rule) |
| compete win race: post-terminal `set_cell` rejected; second solver can't overwrite winner | NO (plan said "pin in pgTAP"; the lock logic is correct but nothing holds it) |
| `set_cell` on a revealed cell allowed + preserves `revealed` (a named plan correction) | NO |
| reveal clears `wrong`/`pencil`; reveal completing the grid triggers the coop win | NO |
| any end-to-end Schrödinger play (fixture exists in `setup.psql`, only used for given-exclusion) | NO |
| scratchpad play-state guard ("guards: membership + play state + limit" — only ⅔ tested) | NO |
| inline `board` missing meta/solution rejected; fill-clear resets pencil; player-max guard | NO |

### T3 — e2e

Covered: coop solve→terminal, check/reveal/give-up-reveal (good), compete first-correct-wins,
print download, cross-client peer cursor, no-page-scroll regression, scratchpad coop sync +
lock. Gaps beyond T1: concede flow (→ C6's verdict copy is also unexercised), rebus entry,
pencil, Backspace two-step.

---

## 4 · Docs & code comments

### D1 — the plan-mandated `useRealtimeRefetch` carve-out was never added

`src/common/hooks/realtime/useRealtimeRefetch.ts:86–104` still lists exactly two "When NOT to
use" cases. The plan (line 421–423) explicitly required adding the `useCells` direct-apply as
the third "so the factory doc stays the honest map." It isn't there; the factory doc now
understates the repo's realtime patterns. Hand-verified.

### D2 — two plan-mandated `deferred.md` entries were lost

- Cryptic apparatus (edge marks / collapse-rebus / AI "Explain") — plan says "Note in
  deferred.md"; survives only in `crosswords.md` §9, not the register.
- **FE upload-your-own `.puz`/`.ipuz` — documented nowhere.** Not deferred.md, not crosswords.md.
  This decision is fully lost.
- (The scratchpad item itself was correctly struck through with an accurate SHIPPED summary.)
- Nit: the plan's "generateSolutionPdf … or terminal-gated later" option is recorded nowhere.

### D3 — stale pre-6ee20a6 comments (the NYT-writes-puzzles design) — one themed sweep

Commit 6ee20a6 changed NYT import to create the game inline (no `puzzles` row); the game doc
is consistent about it everywhere, but five comment sites weren't updated:

- `supabase/functions/crosswords-import-nyt/index.ts:2–4` — opening sentence says "imports it
  into `crosswords.puzzles`", contradicting lines 11–14 of the *same docstring* (which are
  correct).
- Migration `:26, :29–31, :56–57` — "curated / NYT puzzle library"; "`source` keeps NYT-fetched
  puzzles out of the listing" (nothing writes `source='nyt'` now — the check-constraint value
  is dead); "the import CLI + the NYT edge function write puzzles as the service_role" (the
  edge fn writes no puzzles and uses the caller's JWT).
- `src/crosswords/manifest.ts:14–16` — "The NYT-by-date path … lands in a later stage" (it
  landed, directly below).
- `docs/games/crosswords.md` §6 + `src/crosswords/lib/contentHash.ts:10–12` — claim the edge
  function hashes with `crypto.subtle` ("identical hashes"); no edge function hashes at all
  post-6ee20a6. Same file's header cross-reference likewise stale.

### D4 — migration comments describe nonexistent realtime subscribers

`20260706000000_crosswords.sql:162` ("FE subscribes to the game row") and the four "Realtime
touch … wakes FE subscribers of crosswords.games" no-op self-updates: no FE code subscribes to
`crosswords.games` (`useGame` is a documented one-shot; status flows via `common.games`).
Behavior unaffected. Per don't-remove-unprompted: flagging, not prescribing — either fix the
comments or drop the touches, Joel's call.

### D5 — smaller doc staleness

- `docs/pdf.md` intro: "five games printing today" (six) / "will land in puzpuzpuz" (landed) —
  internally inconsistent with its own body-family-3 section (which is accurate and properly
  marked do-not-"fix").
- `docs/cheatsheet.md`: missing `crosswords:import` (pre-existing: `stackdown:import` and the
  aggregate `npm run import` are also absent).
- `docs/common-layout.md`: `components/panels/` PURPOSE ("generic floating/popup chrome") now
  also houses `GameScratchpad`/`ScratchpadBubble`; `hooks/scratchpad/` and `lib/scratchpad/`
  are absent from the taxonomy entirely.
- The shipped scratchpad's only architecture writeup is the struck-through `deferred.md` entry
  (whose own charter says picked-up items get *deleted*); `crosswords.md` points there as the
  reference and `docs/common.md` has zero scratchpad coverage. Placement smell — it deserves a
  real home.
- `Help.tsx` covers navigation only; Shift+Enter rebus (undiscoverable without it), pencil, and
  check/reveal are absent, while `crosswords.md` §"FE" claims Help has the "full keyboard map".
- `usePeerCursors.ts:31–32` comment: "`enabled` is constant for a game's lifetime" — false
  (PlayArea defaults `mode` to `'coop'` until `useGame` resolves); harmless in behavior
  (nothing broadcasts while `cursor` is null, and `useCells`' owner-filtered load + `isMine`
  drop make the transient safe — verified), but the comment overstates.

### Confirmed accurate (for calibration)

`docs/games/crosswords.md` is otherwise thoroughly accurate (schema shapes, RPC table incl.
guards, RLS wording, `games_state` mechanism, NYT-inline consistency, file inventory — every
named path exists, "36 tests" exact); the CLAUDE.md row is fully accurate; the
design-decisions.md exception writeup exists, records element placements, and reflects the
post-72c4f0d state; pdf.md's body-family-3 section is accurate and properly marked deliberate;
`'ended'`/`'finished'` needed no states.md addition (existing vocabulary, correctly consumed by
`terminalCopy`/`labelFor`); `useCells`' and `cursor.ts`' own docstrings are accurate in every
particular; package.json scripts and config.toml registration all as documented.

---

## Suggested priority

1. **C1** — decide the rebus first-letter rule (recommend: match crossplay; one-line SQL fix +
   flip the pgTAP pin + fix the doc claim, and correct plan amendment #13 with a note).
2. **C2** — roll back the optimistic cell on `set_cell` failure (or make refetch authoritative).
3. **T1** — the four missing high-value tests: `useCells` unit suite, two-client coop-sync e2e
   assertion, compete-privacy e2e, `useScratchpad` unit suite.
4. **C3a** — the 3-line `isHolder` guard on scratchpad CDC apply (then C3b/C3c as appetite
   allows).
5. **D1 + D2 + D3** — the docs debt: factory-docstring carve-out, the two lost deferred.md
   entries, the pre-6ee20a6 comment sweep (one themed pass: edge fn, migration, manifest,
   crosswords.md §6, contentHash.ts).
6. **C4** — port or formally defer the dropped keyboard/rebus features (`#` jump first — it was
   plan-required).
7. **C5–C9, T2, D4–D5** — as convenient; none block play.
