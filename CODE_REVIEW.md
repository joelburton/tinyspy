# Code review — v1 baseline

Findings from the pre-deploy review, 2026-06-12. Severity is "would I block a PR on this", not "is this a real bug" — most of these are intentional trade-offs or hygiene rather than defects.

Items marked **[fixed]** were addressed in the review pass; the others are tracked here for future revisit. See git log for the actual changes.

---

## 🔴 Should fix before deploy

### 1. TypeScript strict mode is OFF · **[fixed]**

`tsconfig.app.json` had `"noUnusedLocals"` + `"noUnusedParameters"` + `"noFallthroughCasesInSwitch"` but not `"strict": true`. The codebase happens to be careful, but the safety net (`strictNullChecks`, `noImplicitAny`, etc.) wasn't on. Enabled in the fix pass; any fallout was addressed.

### 2. Mailpit URL leaks into the production UI · **[fixed]**

`LoginScreen`'s "check your email" screen always showed `http://localhost:54324` as a hint. Gated on `import.meta.env.DEV` so it only renders in local dev.

### 3. `<a href="#">` for log-out · **[fixed]**

`HomeScreen`'s log-out triggers a default navigation in addition to the `onClick` (no `preventDefault`). Switched to `<button className="link-button">`.

---

## 🟡 Subtle issues worth fixing

### 4. `useSession` fires `verifyAndSet` twice on initial load · **[fixed]**

Both `getSession().then(...)` and `onAuthStateChange`'s `INITIAL_SESSION` event ran for the same restored session, costing two parallel `profiles` queries. Dropped the `getSession()` call; the `INITIAL_SESSION` event covers it.

### 5. SQL parameter named `count` shadows the aggregate function · **[fixed]**

In `submit_clue(target_game uuid, word text, count int)` and the `clues.count` column. Worked due to plpgsql context-sensitive resolution, but a footgun for future edits. Renamed the parameter to `clue_count` (column kept its name). Client call site updated.

### 6. Hooks re-fetch on every realtime event · **[documented]**

`useGame`, `useBoard`, `useClues` all do "any change → refetch everything". Fine at this scale (handful of events per turn), wasteful at scale. Documented in a comment in `useGame.ts`; the pattern is consistent across hooks.

### 7. `mySeat as 'A' | 'B' | undefined` overcasts in BoardScreen · **[fixed]**

`players.find(…)?.seat` is already that type via the `Player` definition. Cast removed.

---

## 🟢 Idiomatic + polish (deferred)

### 8. `BoardScreen.tsx` is 300+ lines

Hosts six components (`BoardScreen`, `GameOverBanner`, `CluePanel`, `ClueForm`, `PassButton`, `GameLog`). Each is small but the file is dense. Worth splitting `CluePanel`, `ClueForm`, `PassButton`, `GameLog` out when it next gets touched. Pure code organization — no behavior change.

### 9. No "copy invite link" on lobby

User has to grab the URL from the address bar to share. A small button calling `navigator.clipboard.writeText(...)` would be ~10 lines.

### 10. No "resend magic link" on LoginScreen

Once `status === 'sent'`, no affordance to retry. Add a "send a new link" button on that screen.

### 11. ClueForm count max is 15

The practical max is 9 (one per agent on your view). Narrowing to 9 gives a small UX hint. Currently `min=0 max=15`.

### 12. Tile accessibility gap

Tiles are `<button>`s ✓ but have no `aria-label` describing reveal state. Screen-reader users get only the word. Add `aria-label={\`${word}\${revealed ? \`, revealed as \${labelName(revealed_as)}\` : ''}\`}`.

---

## ⚪ Trade-offs to acknowledge

### 13. `key_card` leak in `game_players` SELECT policy · **[documented]**

Any in-game player can technically `select key_card from game_players where seat = '<opponent>'` and see the partner's full key view. Client convention hides it; RLS does not. Acceptable for trusted-friends play. Comment added on the policy explaining the choice and how to tighten if needed (own-row policy + roster view).

### 14. `profiles_select_authenticated using (true)` is broad · **[documented]**

Any signed-in user can list any profile row. Acceptable at our scale; required for showing opponent display names. Comment added on the policy explaining the trade-off and the per-game-membership tightening path.

### 15. No rate-limiting on RPCs

A rapid-click "attacker" would hit `for update` locks and contend, not actually break anything. Supabase has built-in per-IP rate limits in prod that cover the basic case. Defer until friends abuse it.

### 16. No cheat-guard on `submit_clue.word` matching a board word

You can submit `STEEL 1` as a clue when `STEEL` is on the board. Partner sees the clue and knows it's cheating; trust friends. One-line check in `submit_clue` would close this.

### 17. Out-of-order `load()` races

Five events in quick succession → five parallel queries → last to resolve wins, not necessarily the latest event. Vanishingly unlikely for a turn-based game.

---

## 🔵 Documentation gaps

### 18. `key_card` jsonb shape not documented · **[documented]**

Comment added on the `game_players.key_card` column: "jsonb array of 25 elements, each 'G' | 'N' | 'A'".

### 19. "Clue-giver's view labels the reveal" rule not called out · **[documented]**

Most subtle thing in `submit_guess`. Comment block added above the `key_owner_seat :=` assignment explaining the rule and the sudden-death variant.

### 20. Unique-channel-name workaround documented in `useGame.ts` only

`useBoard` and `useClues` use the same pattern without explanation. Skipped in this pass — the comment in `useGame.ts` is enough as the canonical explanation.

### 21. "Why server-authoritative" rationale lives in README only

A one-line comment on each RPC ("all writes go through this RPC; no direct INSERT policy") would help — partially implied by the migration's structural comments. Skipped.

---

## Test coverage

Zero unit/integration tests. Tracked separately as the next milestone after the review pass.

## How to use this file

When the codebase grows or you want a "what corners were cut" overview, reread this. The deferred items are good first issues; the trade-offs are deliberate choices to verify against actual usage before changing.
