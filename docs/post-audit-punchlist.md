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

## Awaiting Joel's call

- [ ] The scrabble_coop `blocked` fixture row (`src/gameStatusLabels.test.ts:~227`,
  rendered as `Ended (no moves left) · 152 pts` with the stale "six scoreless
  turns" note) is unreachable — coop has no pass. Already recorded in
  deferred.md → scrabble as awaiting Joel's call (drop `COOP_END` + the row, or
  give coop a blocked end); listed here only so the fixture note isn't missed
  when that call happens.

(states-audit.md: RETIRED — Joel ruled it "hopelessly historical" 2026-08-02;
deleted. Its territory is covered by states.md + game-status-labels.md + the
per-game docs.)
