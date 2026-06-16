# Code review — 2026-06-16 (global pass)

A fresh whole-tree review — not focused on recent change surface. Four
parallel agents covered correctness, test coverage, comment/docstring
quality, and cross-cutting consistency. Higher-stakes findings were
verified before write-up; a few agent claims that didn't survive
verification are NOT included (called out at the end of §1).

## Headline

The codebase is in solid shape on every axis. Correctness gaps are
minor and most have one-line fixes; test coverage matches what
[`testing.md`](testing.md) claims it should be; docstrings clear the
[Educational-priority](../CLAUDE.md) bar; cross-game inconsistency is
mostly absent except for a few places where the three `useGame` hooks
have drifted in patterns worth converging.

The biggest follow-up is **§4 (hook convergence)** because it sets the
pattern Boggle inherits. Read order: §1 → §4 → §2 → §3.

A second small set of items (vocab drift in code comments, dead
`load()` call, etc.) was raised by the post-refactor sweep that
preceded this review — those still stand and aren't repeated here.

## 1. Correctness

### 1.1 `set_current_view` comment is wrong about which branch the coalesce protects

[`supabase/migrations/20260615000000_common_baseline.sql:1010–1014`](../supabase/migrations/20260615000000_common_baseline.sql).
The comment says the `coalesce(idle_since, now())` covers "re-mount of
an already-current game." It doesn't — the WHERE clause at line 1021
(`is_current_view = false`) skips the UPDATE entirely on an
already-current row. The coalesce actually covers the rarer case
where a game is being mounted for the first time and was never
vacated (`idle_since` still NULL because it was never stamped). The
arithmetic is still safe; only the comment is wrong.

**Fix:** rewrite to "covers a game whose `idle_since` was never
stamped (first mount of a never-current game) — the result is
`now - now = 0` and the +0 is harmless." One-line edit, no code
change.

### 1.2 `set_current_view` / `unset_current_view` error path is fire-and-forget *(fragile)*

[`src/common/hooks/useCommonGame.ts:330–337, 363–370`](../src/common/hooks/useCommonGame.ts).
Both RPC calls swallow errors to `console.error`. The hook comment
explicitly says "the RPC's `is_current_view = true` guard makes a
stale-fire harmless," so the design relies on idempotency — which it
has. But if a real network error keeps the FE thinking the current
pointer is set when it isn't (or vice versa), no user-facing surface
tells anyone.

Acceptable for alpha; worth a one-line comment at the call site
naming "we tolerate this because…" so the next reader doesn't think
it's an oversight.

### 1.3 `useSession` profile-verify failure-mode is permissive *(fragile)*

[`src/common/hooks/useSession.ts:51–56`](../src/common/hooks/useSession.ts).
On profile-verify failure during session restore, the code degrades
gracefully and continues. This is right for transient errors mid-game
but wrong for startup: a corrupted DB or RLS bug at startup looks
identical to "no profile yet."

Friends-only alpha makes this low-priority; flagging because it's the
kind of thing that bites later when a real auth path lands.

### 1.4 Wordknit's combined-channel postgres_changes pattern is wasteful but not wrong *(fragile)*

[`src/wordknit/hooks/useGame.ts:196`](../src/wordknit/hooks/useGame.ts).
The channel name `wordknit:${gameId}` is stable (no UUID suffix)
because the selection broadcast needs a shared room across peers. But
the same channel also hosts two `postgres_changes` subscriptions
(`games`, `guesses`). StrictMode's double-mount triggers
`removeChannel` + recreate, which is fine; but the broader concern is
that future Boggle-style games may copy this pattern and end up with
`postgres_changes` events queued during the broadcast room's
reconnect.

Not a current bug — `supabase-js` deduplicates handler registrations
— but worth a comment naming the design choice so a porter doesn't
conflate the two concerns. See §4.3 for the convergence
recommendation for Boggle.

### 1.5 What's *not* included

The correctness agent raised three more items that didn't survive
verification:

- **"Two-peers-leave race on `unset_current_view`"** — already
  documented in the code at
  [`useCommonGame.ts:354–358`](../src/common/hooks/useCommonGame.ts)
  as a known acceptable gap with stated mitigation.
- **"Idempotency invariant violation on greens_found"** — the agent's
  own write-up concluded "no action needed."
- **"`unset_current_view` doesn't check game exists"** — verified
  false: the explicit `raise 'game not found'` IS present at
  [`common_baseline.sql:1049–1051`](../supabase/migrations/20260615000000_common_baseline.sql).

Recording these so a future reviewer doesn't re-raise them.

## 2. Test coverage

Measured against [`testing.md`](testing.md)'s explicit
"what we test / don't test" line. Coverage is good and matches the
doc's claim.

### Solid

- Every public RPC across all four schemas has at least one
  happy-path test and at least one rejection-path test.
- RLS isolation tested per-schema (non-member-sees-zero plus mutation
  rejection).
- The idle-accumulator invariant is pinned with deterministic
  time-shift assertions
  ([`games_test.sql:514–545`](../supabase/tests/common/games_test.sql))
  — exactly the kind of test that catches regression on a tricky
  invariant.
- Pure FE derivations (`derivePhase`, `evaluate`, `peerColor`,
  `playerCountFits`) all have full-matrix tests.
- `useGameTimer` covers mode × pause × expiry.
- Router (`usePath` / `navigate`) tested.

### Gaps worth filling

| gap | one-line justification |
|---|---|
| **No concurrent-callers test for `set_current_view`** | The partial unique index is the canonical concurrency primitive; a single `set_current_view` from each of two clients in the same txn should pass deterministic-result asserts. An untested invariant erodes silently. |
| **No explicit seat-allocation assertion in tinyspy** | `create_game_test.sql` verifies the key-card distribution but not "two `game_players` rows, distinct seats, distinct user_ids." If `tinyspy.create_game` ever miscoded the seat literal, board UX would degrade silently. ~5 lines. |
| **No direct test of `handle_new_user`** | Tested indirectly (clubs_gametypes auto-populate), but the trigger has three responsibilities (profile row, solo club, clubs_gametypes seeds). One direct test asserting all three on a fresh user would pin the contract. |
| **No FE test for `useCommonGame`** | The hook is the cross-cutting state-management linchpin (presence, pause, view-state writes, idle accumulator). Even a tight test of "pause derivation given (presentUserIds, members)" would lift the safety floor. |

### Gaps that don't matter

Per [`testing.md → What we don't test`](testing.md#what-we-dont-test):

- LoginScreen 6-digit code path — E2E-only feature; manual smoke is
  the policy.
- `useClubChat` / per-game `useGame` realtime plumbing — declared
  smoke-test territory.
- Component composition (BoardGrid, TileGrid, PlayArea) — input →
  output is tested where it's pure; integration is smoke-tested.

## 3. Comments & docstrings

The [Educational-priority](../CLAUDE.md) bar is being met. The
architectural seams (registry pattern, manifest interface,
PauseBoundary unmount discipline, idle accumulator, persona
conventions) all have substantive teaching docstrings. SQL migrations
have generous column comments. No "added for issue #42" or "increment
counter" rot.

### Refinements

- **`useCommonGame` top docstring** doesn't explain *why* the channel
  name must be stable (the partial-unique-index ⇄ shared-presence
  interaction). A reader can follow the code but not derive the
  invariant. Lift one sentence: "Channel name is stable across peers
  so presence sets merge — this is the FE-side meeting place for the
  one-current-view-per-club invariant the DB-side partial unique index
  enforces."
- **[`useGameTimer.ts:74–83`](../src/common/hooks/useGameTimer.ts)**
  — the `idleSeconds = 0` default has a *why* worth naming: "solo
  games render correctly without having to thread 0 explicitly."
- **Per-game `*/lib/setup.ts`** types (`TinyspySetup`,
  `WordknitSetup`) lack docstrings on the contract with their RPC. A
  short comment naming what the form produces vs. what `create_game`
  consumes would help when porting.
- **[`src/common/components/ClubChatPanel.tsx`](../src/common/components/ClubChatPanel.tsx)**
  — file-level docstring missing. Add one line naming "owns per-club
  chat; persists across game switches; renders into the right-rail
  slot on ClubPage."

### Standards worth pointing at

Use these as the model when writing the next ones:

- File headers on
  [`src/common/lib/router.ts`](../src/common/lib/router.ts) and
  [`src/common/components/PauseBoundary.tsx`](../src/common/components/PauseBoundary.tsx).
- Schema-level comment block at the top of
  [`20260615000000_common_baseline.sql`](../supabase/migrations/20260615000000_common_baseline.sql).
- The pgTAP
  [`_shared/setup.psql`](../supabase/tests/_shared/setup.psql) persona
  convention block — a new test author can write their first test
  from that comment alone.

## 4. Cross-cutting consistency

This is where I'd spend the most attention before Boggle. The three
games share an architecture but have accumulated drifts in their
`useGame` hooks that will multiply if Boggle picks the wrong template.

### 4.1 Mount-time fetch orchestration

| game | shape |
|---|---|
| tinyspy | three hooks (game, board, clues), each with own channel + own SUBSCRIBED-refetch |
| psychicnum | one hook, one channel, two tables, one `load()` with `Promise.all`, SUBSCRIBED refetch |
| wordknit | one hook, one channel, two tables + broadcast, **`load()` called twice on mount** (lines 213 and 218 — once in SUBSCRIBED callback, once unconditionally) |

The right form is **psychicnum's pattern.** One channel, one
`load()`, SUBSCRIBED-refetch covers the reconnect case. Wordknit
needs the redundant `load()` at line 218 removed. Tinyspy's
three-hook split is probably deliberate (matches the decomposed
component split) and shouldn't be forced into one hook — but a
comment naming the split as deliberate would prevent a future
"consolidate" instinct.

### 4.2 Not-found handling asymmetry

[`tinyspy/hooks/useGame.ts:78–80`](../src/tinyspy/hooks/useGame.ts)
doesn't `setGame(null)` on not-found; psychicnum and wordknit do.
This means if a tinyspy game is server-deleted while the hook is
mounted, components render stale state. One-line fix.

### 4.3 Channel-name discipline

| game | postgres_changes channel | broadcast |
|---|---|---|
| tinyspy | `tinyspy:${gameId}:${uuid}` (per-tab) | none |
| psychicnum | `psychicnum:${gameId}:${uuid}` (per-tab) | none |
| wordknit | `wordknit:${gameId}` (stable) | same channel |

Two recommendations:

1. **Add a comment at
   [`useGame.ts:192–195`](../src/wordknit/hooks/useGame.ts)**
   anchoring the "stable channel because broadcast needs the room"
   rationale (the comment names this but doesn't explain why the
   alternative would be wrong).
2. **For Boggle**, if it uses broadcast: split into a stable
   broadcast channel + a UUID-suffixed postgres_changes channel. The
   two concerns shouldn't share a connection: postgres_changes don't
   need to merge across peers; conflating channels makes reconnect
   semantics harder to reason about.

### 4.4 Profile-fetch shape (legitimate variance)

tinyspy fetches profiles in `useGame` (fixed-2-seat columns);
psychicnum and wordknit get the roster from `GamePageCtx`. This is
legitimate game-shape variance, not drift. **No action — but worth
recording in [`code-conventions.md`](code-conventions.md)** as the
decision rule: fixed-seat games fetch their own roster; N-player
games read from `GamePageCtx`.

## 5. What's right (preserve these)

Synthesizing across all four agents:

- **Partial unique index** for "one current view per club" — atomic,
  minimal, no separate pointer table.
- **Idle-accumulator** with deterministic time-shift test coverage.
- **SECURITY DEFINER layering** — internal helpers revoked from
  public, FE-callable RPCs granted to authenticated. Clean separation.
- **EXISTS-subquery RLS** across schemas avoids the cross-schema FK
  embedding gotcha; consistent across all three games.
- **PauseBoundary structural unmount** — teaches "ask 'should this
  survive a pause?'" by enforcing it.
- **`useSyncExternalStore`** for the wall-clock timer — the right
  primitive, well-commented.
- **Lazy-loaded `Root` + `setupForm` per manifest** — code-split per
  game without manual chunking.
- **psychicnum's column-grant + view + SECURITY DEFINER reveal
  pattern** for hidden state — the canonical template if Boggle has
  hidden tiles.
- **Persona conventions in pgTAP** — UUIDs encode names, failure
  output is legible, fixtures are dense.
- **Server-authoritative-for-cleanliness** stance is held
  consistently — the edge function gates on `get_clue_context` RPC
  before calling Claude.

## 6. Suggested follow-up order

See [`code-review-2026-06-16-plan.md`](code-review-2026-06-16-plan.md)
for the breakdown into landable PRs and the fragility-documentation
plan.
