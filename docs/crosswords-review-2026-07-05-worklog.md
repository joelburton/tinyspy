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

## Stage 4 — quick wins + C5 defer + remaining nits — ✅ DONE 2026-07-05

**Gates green: `tsc -b` · eslint · Vitest 762 · crosswords pgTAP (now 23+13+10 = win/gameplay/
concede plans grew with the T2 pins) · 7 crosswords e2e. Terminal reflow verified headless.**

- [x] **C6** — `buildOver`'s `lost` verdict → "Everyone conceded." (crosswords has no timer; the
      only path to `lost` is all remaining compete players conceding).
- [x] **C7** — a conceded compete player now sees `outOfRacePill` in the below-board slot (derived
      `slotPill`: active local pill wins, else conceded indicator, else the active clue).
- [x] **C5 defer** — recorded in `design-decisions.md` (new C5 note) + fixed `crosswords.md`'s
      RLS wording to say the terminal opening is intentionally-unused FE surface.
- [x] **C8** — `usePeerCursors` cursor broadcast throttled to 80ms leading+trailing
      (`CURSOR_THROTTLE_MS`); the trailing send always carries the latest cell.
- [x] **C9 nits** — `set_cell` now enforces `^[A-Z]{1,8}$` (rejects `"1"`); `check_cells` gained
      the `conceded` guard (reveal is coop-only, N/A); `create_game` strips `puzzle_id` from
      `saved_default`; `useCells` channel gained `channelDedupSuffix()`; `reveal_cells` skips an
      empty solution array. (Left the `_maybe_finish` read-committed-race comment — friend-scale
      ≈ 0; not worth the noise.)
- [x] **T2 pgTAP** — pinned: non-letter `set_cell` rejected; revealed cell stays editable + keeps
      the flag; reveal clears pencil; **compete win-race** (post-terminal `set_cell` rejected +
      winner stands, win_test); conceded player can't `check_cells` (concede_test). (Skipped the
      Schrödinger end-to-end + inline-board-missing-meta pins — lower value; noted.)
- [x] **D4** — fixed the misleading realtime comments: the publication note + the representative
      "Realtime touch" comment now say plainly that **no FE subscribes to `crosswords.games`**
      today, so the entry + the four self-updates are latent no-ops. Left the touches in place
      (don't-remove-unprompted) — see flag below.
- [x] **D5** — `pdf.md` (six games + landed), `cheatsheet.md` (`crosswords:import` + `npm run
      import`), `common-layout.md` (scratchpad added to `panels/` + `hooks/scratchpad/` +
      `lib/scratchpad/`), `usePeerCursors` "enabled is constant" comment corrected, and the
      scratchpad got a **real architecture home** in `common.md` (crosswords.md now points there,
      not the struck-through deferred entry).
- [x] **Terminal reflow check** — VERIFIED no reflow. The board cell size is computed from
      `100dvh` (a constant) and `.boardSlot` spans all three grid rows (`grid-row: 1 / 4`), so the
      strip's toolRow↔BackToClub swap can't resize the board. Headless measure: cell 60→60px.

> **Flags for Joel (deliberately not changed):**
> - The four `crosswords.games` "Realtime touch" self-updates + the publication entry are dead
>   today (no FE subscriber). Comments now say so; drop them if you want the migration leaner.
> - **Terminal navigation** (C9): at terminal the keyboard is disabled but mouse clicks still
>   move the cursor (you can click around the revealed grid but not arrow). Minor UX
>   inconsistency — a decision (fully freeze vs fully allow arrowing), not a bug. Left as-is.

---

## Not doing (recorded decisions)

- **C5 compete terminal grids** — not building; single-grid stays, RLS opening documented as
  unused-for-now (Stage 4, `design-decisions.md`).
- **Scratchpad lock races C3b/C3c** — deferred (`deferred.md` → crosswords); self-heal, can't
  corrupt the DB.
- Anything in the review marked "confirmed accurate" — no action.

---

## All stages complete (2026-07-05)

Every ranked review finding is worked or recorded-as-deliberate. Stages 1–3 committed
(`7adc54f`, `4ee1aea`; header removal `e5073ab`); Stage 4 pending commit. Two standing flags for
Joel above (the `nyt` vestigial constraint value in Stage 2's flag block, the dead realtime
touches + terminal-navigation here).
