# Crosswords review — remediation worklog (2026-07-05)

Execution plan derived from [`crosswords-review-2026-07-05.md`](crosswords-review-2026-07-05.md).
The review is the analysis; this file is the ordered work. Each stage is a self-contained,
committable unit. Check items off as they land; keep the decision record at the top honest.

**Decisions locked in (Joel, 2026-07-05):**

- **C1 → match crossplay.** First-letter acceptance keys on answer *length* (rebus), not
  candidate *count* (Schrödinger). Our port had it wrong; fix the code to mirror `ws.ts`.
- **C5 → defer / dead-RLS.** Compete stays single-grid; the terminal RLS opening is recorded
  as unused-for-now. No FE feature work.
- **C4 → port the full cluster.** All dropped keyboard/rebus features get ported (not deferred),
  including crossplay's rebus-legibility mitigations and the peer-fill flash.

**Gate on every stage:** `npx tsc -b` clean · eslint clean · Vitest green · `npm run test:db`
green (pgTAP) · e2e where touched. (Reset caveat: after `npm run db:reset`, run `npm run import`
or the puzzle/word libs are empty — see the db-reset-needs-import memory.)

---

## Stage 1 — C1 + C2 + their tests (the correctness core) — ✅ DONE 2026-07-05

Land the two MAJOR correctness fixes together with the tests that pin them, since the tests
are the proof the fixes are right. **All gates green: `tsc -b` · eslint · Vitest 759/759
(+5) · crosswords pgTAP (flipped pin passes) · 2 new e2e pass.**

### 1a · C1 — rebus first-letter rule → match crossplay ✅
- [x] `20260706000000_crosswords.sql` `_matches` — first-letter branch now `length(s.ans) > 1`
      (per-candidate rebus, mirrors `ws.ts:513` `sol.length > 1`), + rewrote the docstring to
      explain length-keyed-not-count-keyed.
- [x] Flipped the pgTAP pin in `gameplay_test.sql`: `_matches('H','["HEART"]')` → **true** now
      (single-candidate rebus accepts first letter); added an `'HE'` → false case (only bare
      first letter or full string) and kept the Schrödinger case. plan(18)→plan(19).
- [x] `docs/games/crosswords.md` §3 — rewrote the "First-letter acceptance" bullet to the real
      length-keyed rule, with the amendment-#13-misread note.
- [x] `_matches` docstring in the migration — corrected.
- [x] `docs/crosswords-plan.md` — struck through amendment #13 + the "Match semantics" bullet
      with dated CORRECTION notes explaining the `sol.length` misread.

### 1b · C2 — failed `set_cell` must not strand a stale optimistic cell ✅
- [x] `src/crosswords/hooks/useCells.ts` — snapshot the pre-optimistic cell (`prevCell`) and
      roll back on RPC error, **version-guarded** so a newer write (higher version) that lands
      mid-RPC survives the rollback. Documented in both the setCell comment and the hook
      docstring. (Chose the rollback over `load()`-authoritative: it repairs instantly + at the
      source, rather than waiting for a refetch.)
- [x] The rollback closes the hole at the source (a failed write never strands a same-version
      cell), so no refetch is needed to heal it — pinned by the unit test.

### 1c · T1 tests for the above ✅
- [x] **`useCells` unit suite** — new `src/crosswords/hooks/useCells.test.ts` (5 tests):
      newer-wins CDC apply (+ echo absorption), optimistic echo + version adoption, C2 rollback,
      the mid-RPC-newer-write guard, and the compete `isMine` drop.
- [x] **Two-client coop cell-sync e2e** — extended the peer-cursor test: Alice types 'c' at
      (0,0), Bob's shared grid shows `data-fill='C'`.
- [x] **Compete-privacy e2e** — new test: two compete clients; Alice fills her grid, Bob's
      private cell stays `data-fill=''` after a 1.5s leak window.

---

## Stage 2 — scratchpad race guard + docs debt — ✅ DONE 2026-07-05

**Gates green: `tsc -b` · eslint · Vitest 762/762 (+3) · scratchpad e2e still passes
(holder-guard didn't break coop sync).**

### 2a · C3a — the missing "am I the editor" guard ✅
- [x] `useScratchpad.ts` — the CDC handler now skips `applyBody` when I hold the shared lock
      (`if (shared && holderRef.current?.userId === myId) return`), mirroring crossplay's
      `if (!isHolder) setDraft(text)`. Teaching comment explains why dropping the event is safe
      (my next flush re-propagates; version bumps monotonically).
- [x] Flush-failure logging — `flush`'s `.then` now destructures `error` and `console.warn`s a
      `[scratchpad] flush failed:` line instead of silently swallowing.
- [x] C3b/C3c — NOT built (both self-heal, can't corrupt DB); recorded in `deferred.md` under
      the new `## crosswords` section.
- [x] **`useScratchpad` unit suite** — new `useScratchpad.test.ts` (3 tests): body newer-wins,
      the C3a holder-guard, and the takeover lock lifecycle (foreign claim → read-only → grace
      → staleness, driven with fake timers). (Left `scratchpadOpenStore` untested — trivial
      store, skipped for now.)

### 2b · D1/D2/D3 — one themed docs pass ✅
- [x] **D1** — `useRealtimeRefetch.ts` gained the third "When NOT to use" case: crosswords'
      `useCells` high-frequency per-row direct-apply.
- [x] **D2** — new `## crosswords` section in `deferred.md`: FE upload-your-own `.puz`/`.ipuz`,
      cryptic apparatus, `generateSolutionPdf` answer-key, and the C3b/C3c lock races.
- [x] **D3** — stale-comment sweep done: edge-fn header, migration `puzzles` table + service_role
      comments (noted the `'nyt'` check value is now vestigial — see flag below), `manifest.ts`,
      `contentHash.ts`, and `crosswords.md` §6. All now say the NYT path is inline/self-contained
      and does not write `puzzles` or hash.

> **Flag for Joel (not done — schema change, not a comment):** `crosswords.puzzles.source`'s
> check constraint still allows `'nyt'`, but nothing writes it anymore (NYT games are inline).
> The value is vestigial. Left in place; drop it from the `check (source in (...))` if you want
> the schema to state the truth. Comment now says it's vestigial either way.

---

## Stage 3 — C4 port: the full keyboard/rebus cluster — ✅ DONE 2026-07-05

Ported each against crossplay as the spec. **Gates green: `tsc -b` · eslint · Vitest 762 · all
7 crosswords e2e pass (+1 new keyboard test). Rebus box + peek visually verified headless.**

- [x] **`#` jump-to-number** — new `NumberJumpDialog.tsx` (+ CSS, repo theme tokens); keyboard
      `#` handler opens it; `onSubmit` uses `findCellByNumber` → moves the cursor. PlayArea
      `suspended`s the board keyboard while any modal is open.
- [x] **Shift+Backspace** — clears every fillable non-given cell in the current word, then drops
      the cursor on the word's first editable cell (`useGridKeyboard`).
- [x] **Shift+Space rebus peek** — read-only zoom-peek of the current cell's fill; dismissed by
      every other handled key (`clearPeek`). Renders in the same overlay box as the input.
- [x] **Rebus overlay → 3-cell centered/clamped box** — `overlayStyle` (ported `rebusWrapStyle`,
      `REBUS_WIDTH_EM=3`); the class only carries stacking now. Squeezed committed rebuses stay
      readable via the peek.
- [x] **Rebus commit-on-Tab** — `RebusInput` grew a `RebusPostCommit` (`advance`/`jumpNext`/
      `jumpPrev`); Tab commits + jumps clue, Enter commits + advances, Esc/blur cancels.
- [x] **`recentFills` peer-fill flash** — `usePeerCursors` now also broadcasts each coop fill on
      its channel (the cells CDC carries no writer color) → teammates flash the cell in the
      writer's color for 5s (`RECENT_FILL_MS`, matching crossplay's timer). Self-fills ignored.
- [x] `Help.tsx` — documents the full key set (Shift+Backspace, Shift+Space, `#`, rebus
      Enter/Tab, pencil, check/reveal); `crosswords.md` §7 keyboard list updated to match.
- [x] e2e: new "keyboard: rebus, pencil, backspace two-step, and `#` jump" test (added
      `data-cursor` + `data-pencil` cell hooks). Coop fill sync already covered.

---

## Stage 4 — quick wins + C5 defer + remaining nits

Small, cheap, none block play. Batch as convenient.

- [ ] **C6** — `PlayArea.tsx:411–412`: `play_state='lost'` maps to "Time's up." but crosswords
      has no timer; the all-concede path reaches it. Copy → "everyone conceded" (or similar).
- [ ] **C7** — wire the shared `outOfRacePill` ("You conceded — the rest are still racing.") for
      a conceded compete player; today input just greys out with no explanation.
- [ ] **C5 defer** — record in `design-decisions.md` (and fix `crosswords.md`'s "until terminal"
      wording): compete stays single-grid; the terminal `cells_select` RLS opening is
      unused-for-now, kept intentionally.
- [ ] **C8** — throttle `usePeerCursors.ts:66–74` to ~80ms leading+trailing (crossplay
      `PuzzleView.tsx:99,468`); arrow auto-repeat currently sends one Broadcast per repeat.
      Compounds the plan's Realtime-quota watch-item.
- [ ] **C9 correctness nits** (pick the real ones): `set_cell` char validation `^[A-Z]{1,8}$`
      (rejects `"1"`, `''`); add the `conceded` guard to `check_cells`/`reveal_cells` for
      sibling-consistency; strip `puzzle_id` from `saved_default` in `create_game` (a per-game
      choice, not a club preference — same as codenamesduet's `firstClueGiverUserId`);
      `useCells` channel name needs `channelDedupSuffix()` (StrictMode double-mount footgun);
      `reveal_cells` empty-solution skip; a `_maybe_finish` comment on the coop read-committed
      solve race.
- [ ] **T2 pgTAP gap-fills** (riskiest first): compete win-race (post-terminal `set_cell`
      rejected; second solver can't overwrite winner — plan said "pin in pgTAP"); `set_cell` on
      a revealed cell allowed + preserves `revealed`; reveal clears `wrong`/`pencil` + reveal
      completing the grid triggers coop win; an end-to-end Schrödinger play; scratchpad
      play-state guard; inline-`board` missing-meta/solution rejection.
- [ ] **D4** — migration comments describe nonexistent `crosswords.games` realtime subscribers
      (`:162` + the four "Realtime touch … wakes FE subscribers" no-op self-updates). Either fix
      the comments or drop the touches — flag to Joel per don't-remove-unprompted.
- [ ] **D5 doc staleness** — `docs/pdf.md` intro ("five games"→six; "will land"→landed);
      `docs/cheatsheet.md` missing `crosswords:import`; `docs/common-layout.md` missing
      `hooks/scratchpad/` + `lib/scratchpad/` + the `panels/` scratchpad additions; give the
      shipped scratchpad a real architecture home (not the struck-through deferred.md entry);
      `usePeerCursors.ts:31–32` "enabled is constant" overstatement.
- [ ] **Terminal reflow check** (C9) — `{!isTerminal && <toolRow>}` / `{isTerminal &&
      <BackToClub>}` swap in a non-height-reserved `.strip`; verify with a headless render
      before calling it (per the no-reflow + verify-layout-headless rules).
- [ ] **Terminal navigation** (C9) — keyboard disabled at terminal but mouse clicks still move
      the cursor; decide whether to fully freeze or fully allow arrowing the revealed solution.

---

## Not doing (recorded decisions)

- **C5 compete terminal grids** — not building; single-grid stays, RLS opening documented as
  unused-for-now (Stage 4).
- Anything in the review marked "confirmed accurate" — no action.
