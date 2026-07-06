# Crosswords review — 2026-07-06

A second-pass review of the crosswords game (brand **CrossPlay**), covering the five
feature commits that landed after the 2026-07-05 review and its remediation
(`bfce669` cryptic edge marks, `05b65ff` .puz/.ipuz upload, `4416c76` Show note,
`705de1b` + `1a4f454` AI Explain cryptic clue), plus a fresh whole-game pass on three
fronts: **correctness**, **test coverage**, and a **feature-gap sweep against
`~/src/crossplay`** (the source-as-spec).

Items already worked or documented as deliberate-leave in
[crosswords-review-2026-07-05.md](crosswords-review-2026-07-05.md) are not
re-reported. The earlier remediation was spot-re-verified as correctly in place
(C1 rebus rule, C2 useCells rollback, C8 cursor throttle, C6/C7 concede copy +
out-of-race pill).

**TL;DR:** the port is in very good shape. One real bug worth fixing (an uploaded
puzzle's solution can leak into the unshielded `setup` jsonb via a tab-switch, and
then self-perpetuates through the club's saved default), a matching test-coverage
hole on exactly that surface, and a short list of genuine crossplay feature gaps:
Clear board, the ⌥-shortcut namespace, first-visit help auto-open.

## 1. Correctness findings

### 1.1 MEDIUM — upload → tab-switch leaks the solution into unshielded `setup`, then self-perpetuates

`src/crosswords/manifest.ts:54` strips `board`/`filename` from the persisted setup
only when the **final** source is `'upload'`. But the SetupForm tab buttons
(`SetupForm.tsx:96`) spread the whole prior setup — `onChange({ ...s, source:
'library' })` — so a previously-parsed board survives a tab switch.

Failing scenario: open the Upload tab, parse a `.puz`/`.ipuz` (SetupForm stores the
parsed `{meta, solution}` in `setup.board`), change your mind, switch to Library,
pick a puzzle, hit Start. `setupToStore === s` verbatim, so the parsed board —
**full solution grid included** — is persisted:

- into `common.games.setup` (unshielded, club-readable), and
- into the club's `default_setup` (crosswords passes `setup - 'puzzle_id'` as the
  saved default, which keeps `board`).

Because the setup dialog seeds from the saved default, the blob then
**self-perpetuates**: every subsequent library-source create for that club re-persists
it until someone starts an upload or NYT game. That both spoils the uploaded puzzle
if the group later plays it, and stuffs a multi-hundred-KB jsonb blob into every
game row + the club default. It violates the invariant documented at
`manifest.ts:37` and in [games/crosswords.md](games/crosswords.md) §5.

The NYT path is safe — `crosswords-import-nyt` rebuilds the persisted setup as
`{timer}` only.

**Fix:** strip `board`/`filename` **unconditionally** in `startGameInClubFactory`
(one choke point); optionally also clear them on tab switch in SetupForm for
hygiene. See coverage gap 2.1 for the tests (and optional server guard) that pin it.

### 1.2 LOW — migration header still documents the pre-C1-fix (wrong) first-letter rule

`supabase/migrations/20260706000000_crosswords.sql:17–18` still says the bare
first letter is accepted "ONLY for Schrödinger cells (a solution array of length
> 1)" — the exact misreading the C1 remediation fixed. `_matches` (same file,
~line 195) now correctly keys on the candidate **string** length, and its docstring
+ the pgTAP pins agree; the remediation flipped the function docstring but missed
the file header, so the migration contradicts itself. Doc-only; reword the header
bullet to match the `_matches` docstring.

### 1.3 LOW — ipuz `saved` player fills are parsed but silently dropped (undocumented port divergence)

`src/crosswords/lib/parse/ipuz.ts:350–381` faithfully applies an ipuz `saved` grid
into the template's fills for non-given cells (crossplay used this to restore
progress). But here `create_game` pre-inserts `cells` rows with `fill = NULL`
(reading only `kind`/`given` from meta), and the Grid/PDF read template fill only
for given cells — so a partially-solved `.ipuz` imports with its progress invisibly
lost, while the dead fills still sit in the stored `meta` jsonb. Self-consistent
(solve/check never see them either), but an undocumented divergence from the
source-as-spec. Fix: either seed the `cells` insert from template fills, or strip
non-given fills at parse/convert time and note the drop in the game doc.

### 1.4 Checked and fine (so it's on record)

`useCells` CDC newer-wins / rollback / echo logic (incl. the mid-RPC-race guard and
StrictMode channel dedup); `_matches` / `_is_solved` / first-solver `FOR UPDATE`
lock; `reveal_solved_word` leak-safety (letters only for already-solved words,
givens honored via template, probing unsolved cells gets `solved=false`);
`crosswords-explain-clue` error taxonomy + the `1a4f454` truncation fix
(`max_tokens: 8192`, `effort: 'medium'`); `crosswords-import-nyt` (setup rebuilt as
`{timer}` only — stale FE fields can't leak through this path); both parsers
structurally diff-identical to crossplay (`Buffer`→`Uint8Array`, dropped
`writeIpuz`); `cursor.ts` verbatim; the PDF stack (verbatim port incl. mark
rendering, pencil styling); keyboard chord ordering (`#` before the alt-bail,
`|`/`_` after, given-cell no-op); RLS/column grants (solution omitted on both
tables, `games_state` security_invoker over definer `_solution_for`);
`enumerationFor` parity with crossplay's `buildEnumeration`; `nextMarkState`
null/undefined normalization; `set_cell`/`set_mark` RETURNING-after-BEFORE-trigger
version semantics; the CLI import's `ON CONFLICT DO NOTHING` upsert.

One shrug: `_solution_for` is callable by any authenticated user with a game UUID
(no membership check) but only returns at terminal — negligible under the
friends-only trust model.

## 2. Test-coverage recommendations

Current state: **132 Vitest tests + ~80 pgTAP assertions, all passing.**
`lib/cursor` (37 tests), `lib/nyt` (14), the ipuz rejection matrix (27), and
`hooks/useCells` (7, written to the prior review's flagged behaviors) are genuinely
thorough. Prioritized gaps:

1. **Pin the setup-leak surface** (pairs with finding 1.1). pgTAP: call
   `create_game` with a setup containing a `board` key and assert
   `common.games.status` and the saved default don't contain it — ideally alongside
   a small server-side guard/strip in `create_game` (it already has a
   `setup ? 'mode'` guard one line above; a `setup - 'board'` or a `P0001` reject
   is one line). Vitest: mock `db.rpc`, drive `startGameInClub` with an
   upload-then-library setup, assert the persisted setup lacks `board`/`filename`
   and the board rides as the top-level arg. Turns the invariant from a comment
   into a test.
2. **`reveal_solved_word`** — the branchiest new security-relevant RPC has the
   thinnest coverage (4 assertions, all coop, no givens). Add: a word containing a
   given cell (fixture `h-given` exists); compete mode (solver gets the answer,
   non-solver gets `solved=false` for the same cells — the "safe in compete"
   claim); non-player → `throws_ok 42501`; the `note` round-trip the ExplainDialog
   contract depends on; and pin the degenerate empty-`p_cells` case (currently
   `solved=true, answer=''`, saved only by the edge fn's falsy-check).
3. **A `PlayArea.test.tsx`** — all ten other games have one (render smoke
   coop/compete/terminal, concede/End wiring, input gating); crosswords is the only
   exception. Highest-value assertions: coop shows End / compete shows Concede,
   Reveal absent in compete, terminal grid renders revealed answers without
   crashing, keyboard bails inside chat inputs (`isNonGameField`). Folding a few
   `useGridKeyboard` cases in (two-step Backspace, Shift+Backspace clear-word,
   `|`/`_` → `set_mark` with the right side + next state, modifier bail) covers the
   keyboard hook for free.
4. **Rebus/Schrödinger end-to-end in SQL** — `_matches` is unit-tested directly,
   but no pgTAP fixture puzzle has a multi-char or multi-candidate solution, so
   `set_cell → _is_solved → win` with a rebus fill (full string and bare
   first-letter both completing a solve; `check_cells` on a first-letter fill) is
   never exercised at the game level. One fixture puzzle in `setup.psql` + ~4
   assertions.
5. **Smaller:**
   - `importFile.ts` error paths — the throw contract SetupForm's catch depends on
     (unsupported `.ipuz` → rejects with the parser's message) + `meta.id`
     slugification (`"My Puzzle (1).ipuz"` → `my-puzzle-1`, empty → `puzzle`).
   - `enumerationFor` — a mixed break+hyphen word (`(2,3-2)` exercises the
     separator-indexing loop, the likeliest off-by-one) and a given-cell-gap case.
   - `games_select` / `puzzles_select` row-RLS — one assertion each; only `cells`
     RLS is pinned today (all four quadrants, which is good — this is the other
     half of the shielding story).

Not recommended: edge-function runtime tests (repo convention is curl/e2e —
codenamesduet-suggest-clue is likewise untested) and dialog component tests
(NoteDialog/ExplainDialog/NumberJumpDialog — consistent with every sibling).

Tooling nit for the record: `vitest --reporter=basic` no longer exists in vitest 4
(hard-errors); nothing in the crosswords docs references it.

## 3. Feature gaps vs crossplay

### 3.1 MISSING — genuine gaps, by player value

| # | gap | in crossplay | porting sketch |
|---|---|---|---|
| M1 | **Clear board** | Menu "Clear" → server restores the board to its initial snapshot (givens preserved) | One `clear_board` RPC (blank the caller's grid's cells + flags — shared grid in coop, own in compete; usual membership/play-state/conceded guards) + a menu item, probably with a confirm. Decide whether `revealed` flags survive (crossplay resets to initial → gone). |
| M2 | **⌥-letter shortcuts** | ⌥P pen/pencil, ⌥C/⌥⇧C check word/puzzle, ⌥R/⌥⇧R reveal word/puzzle, ⌥N note, ⌥S scratchpad, ⌥X explain, ⌥M menu — keyed on `e.code` to dodge Mac dead-keys | Small: an Alt branch in `useGridKeyboard` before the current alt-bail (`useGridKeyboard.ts:92`), wired to the existing Controls/menu handlers. Notable because the port's documented identity is keyboard-first. |
| M3 | **First-visit help auto-open** | HelpDialog opens on first board load; dismissal remembered per-user/browser | localStorage flag + open the manifest Help on first crosswords GamePage mount. Rebus (⇧Enter/⇧Space) is undiscoverable without it. Could be a common-shell feature. |
| M4 | **Download .ipuz export** | Menu item saves the board's ipuz (solution included) | Awkward here — the FE never holds the solution, so a faithful export needs a terminal-gated path via `games_state.solution`. Only really valuable for NYT-inline games, which otherwise can't be kept. |
| M5 | **`fetch-nyt-range` bulk CLI** | Downloads a date range of NYT dailies as `.ipuz` files feeding the import CLI | Small Node script reusing the port's pure `lib/nyt.ts`, writing into `supabase/data/crosswords/`. Workaround today: run crossplay's script, then `crosswords:import`. |
| M6 | **Chat URL linkify** | `client/src/linkify.tsx` renders URLs in chat as links | A common-chat feature (would benefit all games), not crosswords-specific. |
| M7 | **Author tooling**: `set-puz-note.mjs`, `puz-to-ipuz.ts` | `set-puz-note` patches a note into a note-less `.puz` — relevant since the port's cryptic gating (edge marks help, Explain menu item) keys off "puzzle has a note" | Trivial copies; also usable directly from the crossplay checkout, so near-zero urgency. |

### 3.2 PARTIAL — ported but reduced; needs a conscious yes/no

Neither of the first two has a recorded rationale:

- **Show note is local-only.** Crossplay's `showNotes` message opened the
  NoteDialog on *every* peer ("hey, read the setter's note together");
  [games/crosswords.md](games/crosswords.md) says "minus its broadcast sync" but
  not why. Port = one Broadcast event on the existing peer channel.
- **Reveals don't flash in the actor's color.** The peer fill-flash
  (`broadcastFill`, `PlayArea.tsx:125`) fires only on typed fills; `reveal_cells`
  results arrive via CDC colorless. Crossplay's `reveal` carried `senderColor`.
  Coop-only cosmetics; fix = broadcast the revealed coords too.
- **Per-user NYT credentials → one shared `NYT_COOKIE_JAR` secret.** Crossplay let
  each user paste their own cookie jar in SettingsDialog. The shared-secret shape
  is documented in crosswords.md §5 — listed here to confirm it's intended, not
  just convenient.
- **Menu action surface**: crossplay's title menu carried
  pencil/check/reveal/rebus/clear/download/print/notes/scratchpad/help with
  shortcut hints; the port's game menu has 3 items with check/reveal/pencil
  relocated to the Controls bar. Equivalent-relocation, arguably better; the *net*
  losses are exactly M1/M2/M4 + the deferred rebus-collapse.

### 3.3 DELIBERATE / N-A (verified, not gaps)

Documented exclusions: rebus "collapse" toggle (deferred.md), answer-key PDF
`generateSolutionPdf` (deferred.md, "could be terminal-gated later"), NYT
overlay-PNG analysis, NYT dedup / NYT-into-library, compete-terminal opponent
grids (C5 defer), scratchpad lock races C3b/C3c, mobile/narrow-window mode (the
documented desktop/keyboard-only v3 exception).

Infrastructure replaced by the codenames architecture: accounts / sessions /
invite codes / lobby / library-and-game lists with fill-percent badges /
ShareDialog / per-board chat + identities / SettingsDialog / SolvedDialog (→
common `TerminalModal`) / FeedbackBar (→ common feedback) / reconnect-heartbeat
machinery (→ Supabase Realtime) / `import-puzzle.ts` (→ `crosswords:import`) /
the separate print route (→ menu item; the puzzle PDF itself is fully ported).

## 4. Suggested order of work

1. Fix the setup-leak bug (1.1) + its tests and optional server guard (2.1) — one
   unconditional strip plus a couple of assertions.
2. Reword the migration header comment (1.2).
3. `reveal_solved_word` pgTAP expansion (2.2) and the rebus end-to-end fixture (2.4).
4. Decide on Clear board (M1) and the ⌥ shortcuts (M2); decide the two
   rationale-less reductions (note broadcast, reveal flash).
5. `PlayArea.test.tsx` (2.3) and the remaining small test gaps (2.5).
6. Document or fix the ipuz `saved`-fills drop (1.3).
