# Post-audit punch list — residue from verifying the pre-freeze audit

2026-08-02. A full verification pass over the worked pre-freeze audit
(`fa02f28`…`b06c319`) confirmed the audit was done properly: every Tier A–E item
landed (several with better-than-proposed resolutions, ratified in naming.md /
states.md), all gates green on a fresh `db:reset` + `import` (tsc, eslint,
1187 vitest, 1879 pgTAP, 135 e2e, `report:labels` no drift), and the thirteen
game docs were brought current in the same pass (`666f426`).

What's left is this list: small code-side residue found *during* verification and
deliberately not fixed alongside the docs. Working doc, same convention as the
audit itself — **work an item → delete it; delete the file when empty** (durable
decisions go to states.md / naming.md / the per-game docs).

Line numbers are as-verified on 2026-08-02 and may drift.

---

## 2. Test gaps

- [ ] `supabase/tests/scrabble/concede_test.sql:~57-63` asserts only
  `winner_user_id is null` — never `play_state = 'lost_compete'` — on the ONE
  all-conceded path that's hand-rolled rather than delegated to `common.concede`
  (`scrabble.sql:~636-647`).
- [ ] `supabase/tests/common/games_test.sql:~269,288,295` uses `'solved'` as its
  arbitrary sample play_state — the exact string the roster just retired.
  Harmless (play_state is free text there), but confusing to a future grep.
- [ ] `docs/states.md:~110` states a checkable invariant — no `outcome` value may
  also be a play_state value — that holds today by inspection only. A small
  pgTAP or vitest sweep over the vocabularies would pin it.
- [ ] The scrabble_coop `blocked` fixture row (`src/gameStatusLabels.test.ts:~227`,
  rendered as `Ended (no moves left) · 152 pts` with the stale "six scoreless
  turns" note) is unreachable — coop has no pass. Already recorded in
  deferred.md → scrabble as awaiting Joel's call (drop `COOP_END` + the row, or
  give coop a blocked end); listed here only so the fixture note isn't missed
  when that call happens.

## 3. Stale comments (comment-only edits, no behavior)

The removed `setup.mode` guard is still claimed in five places:

- [ ] `supabase/migrations/20260617000000_spellingbee.sql:~482`
- [ ] `supabase/migrations/20260712000000_wordwheel.sql:~526`
- [ ] `supabase/migrations/20260713000000_wordiply.sql:~407` (only the `mode`
  half is wrong — the adjacent `target_rank` rejection is real)
- [ ] `supabase/migrations/20260615000000_common.sql:~1062` ("create_game rejects
  setup.mode")
- [ ] `src/wordiply/lib/setup.ts:~9-12` (docstring claims the loud P0001)

Retired vocabulary lingering in comments:

- [ ] `codenamesduet.sql:~851` — says `outcome='lost_timeout'`; the code writes
  `'timeout'`.
- [ ] `connections.sql:~1207-1208` — contrasts `manual` with `'lost_timeout'` /
  `'lost_compete_timeout'`, values the file no longer writes.
- [ ] `connections.sql:~449-450` — the create_game header still describes the old
  `"#<source_id> <puzzle_date> (<TILE1>/<TILE2>)"` title shape.
- [ ] `spellingbee.sql:~1098` — the submit_timeout header says compete expiry is
  `'ended'`; the body writes `lost_compete` (`:~1231`).
- [ ] `spellingbee.sql:~1269` — claims the compete win is `outcome='won_compete'`;
  actual outcome is `'target'` (play_state carries `won_compete`).
- [ ] `wordwheel.sql:~1313` — same `outcome='won_compete'` claim.
- [ ] `wordiply.sql:~967` — "Coop → ended/timeout"; the coop clock is `lost` now.
- [ ] `supabase/tests/wordiply/terminal_test.sql:~9` — header says coop timeout →
  `ended`; the assertions (correctly) expect `lost`.
- [ ] `crosswords.sql:~906` — end_game comment says "NEUTRAL 'finished'"; the
  write at `:~938` is `'manual'`.
- [ ] `crosswords.sql:~964-966` — claims crosswords has no timer / `timerMode
  'none'` so submit_timeout is never invoked; the setup form offers the shared
  `<TimerField>` and `timeout_test.sql` exercises the path.
- [ ] `psychicnum.sql:~239-241` — column-grant comments name a `target` column;
  the excluded column is `secrets`.
- [ ] `src/boggle/components/PlayArea.tsx:~495` — comment says
  `status.winner_id` / the code reads `winner_user_id`.
- [ ] `src/scrabble/components/PlayArea.tsx:~687` — comment says "no human
  `winner` uuid"; the key is `winner_user_id`.
- [ ] `supabase/tests/codenamesduet/setup.psql:~21-23` — header says "three
  shared helpers"; the file defines four (`codenamesduet_players` joined later).

## 4. Convention loose ends (decide, then act or record)

- [ ] **`_sync_title` convention vs three holdouts.** `common.sql:~280-283` now
  states the convention ("a rewriting gametype derives the title in one
  `_sync_title` helper called from every transition") but only waffle + wordle
  have the wrapper; scrabble assigns inline, stackdown assigns from a pure
  formatter, bananagrams writes a static id title. Either extend the shape or
  soften the comment / record the exception.
- [ ] **`p_owner` vs `p_owner_id`.** The audit standardized common's scratchpad
  param to `p_owner_id`, but `crosswords._is_solved` / `_maybe_finish` still
  take `p_owner` (`crosswords.sql:~236, ~342`) against a column named
  `owner_id`.
- [ ] **The `g_id` vs `target_game` split is deliberate but unrecorded.**
  Commit `161488f` settled it (shim helpers = `g_id`, client-facing RPCs =
  `target_game`), but `naming.md:~268` documents only `target_game`. One
  sentence in naming.md closes it.
- [ ] `naming.md:~47` — the prose codename list still enumerates eleven games;
  `wordwheel` and `wordiply` are in the table two lines below but missing from
  the sentence.
- [ ] `docs/game-status-labels.md:~14-15` (hand-written prose, outside the
  generated block) — "five gametypes rewrite the title" double-counts waffle
  and overstates stackdown (coop only rewrites; compete holds `'New game'`).
  Actual rewriters: bananagrams (create only), wordle, waffle, stackdown-coop,
  scrabble.

## 5. states-audit.md — needs an owner decision

`docs/states-audit.md` is substantially stale after the audit: still tabulates
`solved`/`solved_compete` (`:~160-196, ~797`), `winner_id` (`:~325, ~379, ~539`),
crosswords `outcome 'finished'` (`:~615`), `_finish_coop_won`/`_finish_compete_won`
(`:~614-616`), and boggle's "sole terminal is `ended`" (`:~30`). Left strictly
untouched here — it was declared Joel's-sprint material, though `fc4f92b` did
update it once since. **Decide: is it maintained (then it needs a real refresh
pass) or retired (then delete it and move anything durable)?** Nothing links to
it today.
