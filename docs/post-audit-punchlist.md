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

- [ ] The scrabble_coop `blocked` fixture row (`src/gameStatusLabels.test.ts:~227`,
  rendered as `Ended (no moves left) · 152 pts` with the stale "six scoreless
  turns" note) is unreachable — coop has no pass. Already recorded in
  deferred.md → scrabble as awaiting Joel's call (drop `COOP_END` + the row, or
  give coop a blocked end); listed here only so the fixture note isn't missed
  when that call happens.

## 4. Convention loose ends (decide, then act or record)

- [ ] **`_sync_title` convention vs three holdouts.** `common.sql:~280-283` now
  states the convention ("a rewriting gametype derives the title in one
  `_sync_title` helper called from every transition") but only waffle + wordle
  have the wrapper; scrabble assigns inline, stackdown assigns from a pure
  formatter, bananagrams writes a static id title. Either extend the shape or
  soften the comment / record the exception.

## 5. states-audit.md — needs an owner decision

`docs/states-audit.md` is substantially stale after the audit: still tabulates
`solved`/`solved_compete` (`:~160-196, ~797`), `winner_id` (`:~325, ~379, ~539`),
crosswords `outcome 'finished'` (`:~615`), `_finish_coop_won`/`_finish_compete_won`
(`:~614-616`), and boggle's "sole terminal is `ended`" (`:~30`). Left strictly
untouched here — it was declared Joel's-sprint material, though `fc4f92b` did
update it once since. **Decide: is it maintained (then it needs a real refresh
pass) or retired (then delete it and move anything durable)?** Nothing links to
it today.
