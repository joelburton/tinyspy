# Code review — 2026-06-14

> ⚠️ **HISTORICAL ARTIFACT — DO NOT REVIEW AS CURRENT CODE.**
>
> **Reviewers (human and Claude): skip this file.** It's a dated
> snapshot of the codebase as of 2026-06-14, captured before the
> state-vocabulary refactor (phases 1–4, landed 2026-06-16). Every
> code snippet, column name, and architectural reference below is
> from the **pre-refactor** shape:
>
> - References to `is_active`, `status_summary`, `club_active_game`,
>   `'active'` / `'in_progress'` as play_state values, the
>   `clear_active_on_termination` trigger pattern, and
>   `manifest.fetchClubGames` are all **stale**. The current
>   vocabulary is `is_current_view`, `status` jsonb, `play_state` /
>   `is_terminal`, `common.set_current_view` / `unset_current_view`,
>   and `manifest.labelFor`. See [`states.md`](states.md) and
>   [`common.md`](common.md) for the current model.
> - The "queue items" / "follow-ups" / "open threads" in the body
>   are all closed long ago.
>
> The file is preserved as the historical record of what that
> review found and how it got framed. Do not edit the body, do
> not flag its contents as drift in any current review, and do
> not propagate any vocabulary from it into new code.
>
> ---
>
> **Original closing note (2026-06-14):** All eleven queue items in
> §1–§4 landed in `8f0c8af` (mechanical drift batch) and `8e0623e`
> (decision items + remaining cleanups). One follow-up convention
> from this work added to [`code-conventions.md`](code-conventions.md)
> in `933fa3c` ("extract a small helper over a deeply-nested ternary").
> HowToPlayModal wiring smoke-tested in a browser by Joel. The one
> open thread — the Netlify URL in `README.md` line 93 — was deferred
> to whenever the deploy gets renamed.

A read of the whole tree after the recent refactor round, against the prior set out
in [`CLAUDE.md`](../CLAUDE.md), [`code-conventions.md`](code-conventions.md),
and [`testing.md`](testing.md). Audience: Joel, then future-Joel.

Scope reviewed: every file under `src/`, every file under
`supabase/migrations/`, `supabase/tests/`, `supabase/functions/`, the
top-level configs (`package.json`, `eslint.config.js`, `vite.config.ts`,
`index.html`), and the existing `docs/`.

## Headline

The codebase is in good shape and the explanatory bar
([CLAUDE.md → Educational priority](../CLAUDE.md)) is clearly being met —
the docs/comments are doing the work they're supposed to do, and a reader
landing cold can follow what each piece is for and why. The notes below
are mostly about **drift since the last round**: stale references to
files/concepts that were squashed or removed, a few `lobby`-era leftovers
in tinyspy, and a handful of places where a comment promises something
the current code no longer does. Nothing here is a correctness bug.

Recommended order for picking these up: **§1 (drift) → §2 (dead code) →
§3 (small code cleanups)**. §4 and §5 are commentary, not action items.

## 1. Documentation / comment drift

These are concrete out-of-date references — discovered by following links
or grepping for symbols the docs claim exist.

### 1.1 `docs/cheatsheet.md` is partly pre-psychicnum

The cheatsheet still describes a tinyspy-only world:

- **Schemas overview table** ([cheatsheet.md:87](cheatsheet.md#schemas-overview))
  lists `common`, `tinyspy`, `public` — no `psychicnum` row.
- **Tables section** ([cheatsheet.md:109](cheatsheet.md#tinyspy)) has
  `### common.*` and `### tinyspy.*` headings but no `### psychicnum.*`
  section. The two `psychicnum` tables (`games`, `guesses`) are missing.
- **Postgres functions table** lists only `common.*` and `tinyspy.*` RPCs.
  None of `psychicnum.create_game / submit_guess / play_again /
  reveal_target / clear_active_on_termination` appears.
- **"What does the server-side do" key file row**
  ([cheatsheet.md:177](cheatsheet.md#key-files-for-code-reading)) names
  migrations that no longer exist as separate files — `_username`,
  `_clubs`, `_tinyspy_to_clubs` were squashed into the two baselines.
- **Migration link "The TinySpy rulebook in code form"** points at
  `docs/duet-rules.md`, which doesn't exist. The rules now live in
  `docs/tinyspy.md` (the "The rules" section).

Recommendation: a single pass through `cheatsheet.md` adding psychicnum
peers wherever tinyspy appears, plus updating the migration-narrative row
to say "two baselines, one per schema." This is the file most likely to
mislead a new reader, so it's worth the half-hour.

### 1.2 Migration baselines reference docs that don't exist

`supabase/migrations/20260615000001_tinyspy_baseline.sql`:

- **line 14** — `See docs/duet-rules.md for the rules` → should be
  `docs/tinyspy.md`. Same swap as cheatsheet 1.1.
- **line 163** — the policy comment for `game_players_select` ends with
  `Deliberately deferred for v1 — see CODE_REVIEW.md item 13.`
  `CODE_REVIEW.md` was retired in commit `c696b68` ("two still-live items
  carried forward"). The right pointer now is
  `docs/deferred.md → TinySpy → "Harden \`game_players_select\`"`.

### 1.3 `supabase/seed.sql` references a missing migration

```
-- The Duet word list now lives in a migration (20260612000001_seed_word_pool.sql)
-- so it ships to hosted projects via `supabase db push`. …
```

There is no `_seed_word_pool` migration today — the word list got merged
into `20260615000001_tinyspy_baseline.sql` (lines 892–1282, the `INSERT
INTO tinyspy.word_pool VALUES …` block). Fix: rename the referenced file
to `20260615000001_tinyspy_baseline.sql`.

### 1.4 README + package.json have rename leftovers

The rebrand to "PupGames" landed for the UI (`index.html` title, the
`LoginScreen` H1) but didn't sweep the README/package metadata:

- `README.md:1` — `# TinySpy + friends` → consider `# PupGames` (or
  whatever the long-form is) to match `index.html`'s `<title>`.
- `README.md:93` — `Deployed at <https://tinyspy.netlify.app>`. If
  Netlify was renamed alongside the UI rebrand, this URL is wrong; if
  not, that's the actual public address — leave it but note the
  disconnect to your future self.
- `package.json:2` — `"name": "codenames-duet"`. Doesn't affect runtime
  (the package isn't published) but reads as a stale label in `npm`
  output. Trivial rename.

If "PupGames" is still tentative, ignore this whole subsection — pick the
name when ready and sweep once.

## 2. Stale code from the lobby-era / pre-clubs refactor

### 2.1 `'lobby'` is still in `GameStatus` ([phase.ts:13](../src/tinyspy/lib/phase.ts))

```ts
export type GameStatus =
  | 'lobby'           // ← no longer reachable
  | 'active'
  | 'sudden_death'
  | 'won'
  | 'lost_assassin'
  | 'lost_clock'
```

The schema's check constraint (`tinyspy.games.status in ('active',
'sudden_death', 'won', 'lost_assassin', 'lost_clock')` in
`tinyspy_baseline.sql:46`) doesn't permit `'lobby'`, and
[`tinyspy.md`](games/tinyspy.md#status-enum) explicitly calls this out:
*"There is no `lobby` status — under the club model, both members are
seated at game-creation time…"*. The type should drop it. `derivePhase`'s
matrix doesn't have a `lobby` branch either, so removing the literal is
zero-impact.

### 2.2 `InGame` helper in [Root.tsx](../src/tinyspy/Root.tsx) is now a one-line wrapper

The docstring on `InGame` (lines 46–50) reads:

> Internal helper that loads the game and renders BoardScreen. Used to
> also branch to LobbyScreen on status='lobby'; that state doesn't exist
> under the clubs model so the only thing this does now is handle the
> loading and not-found states cleanly.

The helper is doing exactly that — a `useGame` call, a loading branch, a
not-found branch, and a render. Two options:

- **Keep `InGame`, drop the historical paragraph.** Mention only that
  it's the loading/not-found gate.
- **Inline it back into `TinySpyRoot`** (~10 lines, same shape as
  `PsychicNumRoot`). The outer `enterGame`/`leaveGame` closure stays
  identical and the two-function split stops paying for itself.

Either is fine. The "inline" option is closer to the psychicnum Root
and matches the [naming.md big idea](naming.md#the-big-idea) — the
shape isn't game-specific.

### 2.3 Stale test comment about `setPeerKey`

[`useBoard.test.ts:139–141`](../src/tinyspy/hooks/useBoard.test.ts):

```ts
rerender({ revealPeer: false })
// Synchronous in the effect: when revealPeer is false the hook calls
// setPeerKey(null) immediately. No fetch to wait on.
await waitFor(() => expect(result.current.peerKey).toBeNull())
```

The current `useBoard` doesn't call `setPeerKey(null)` anywhere — the
peer key is **derived** at render time (`peerKey = revealPeer &&
fetchedFor === \`${gameId}:${userId}\` ? fetchedPeerKey : null`,
[`useBoard.ts:49–50`](../src/tinyspy/hooks/useBoard.ts)). The test still
passes (the derived value flips to null synchronously on the next
render), but the comment will mislead the next reader. Rewrite to
something like:

```ts
// peerKey is a derived value (revealPeer && fetchedFor === …):
// flipping revealPeer to false makes it evaluate to null on the next
// render, no clear-state action needed.
```

## 3. Small code cleanups

These are quality-of-life items; none affects behavior.

### 3.1 Dead component: `HowToPlayModal` ([HowToPlayModal.tsx](../src/tinyspy/components/HowToPlayModal.tsx))

`grep -r HowToPlayModal src/` returns only the file itself — no consumer.
The component is a working `<dialog>` rules summary; it just isn't
wired into anything. Either:

- **Mount it from `BoardScreen`** behind a "How to play" button (which
  arguably should exist anyway — there's no in-game rules surface
  today), or
- **Delete the file + module.css.** ~80 lines plus styles.

If you're keeping it for a planned wiring, add a one-line `// TODO:
mount from BoardScreen header` so a stranger doesn't think it's
abandoned.

### 3.2 `CreateClubPage`'s eslint-disable is doubled and clumsy

[`CreateClubPage.tsx:32–35`](../src/common/components/CreateClubPage.tsx):

```ts
 * eslint-disable-next-line @typescript-eslint/no-unused-vars
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CreateClubPage({ session: _session }: Props) {
```

The `eslint-disable-next-line` baked into the JSDoc (line 32) does
nothing — JSDoc isn't an ESLint directive — and the comment "above" the
function on line 34 is the one actually doing work. **But** the rename
to `_session` should already satisfy `no-unused-vars` (ESLint's default
config exempts `_`-prefixed args). Try removing **both** the line-32
note and the line-34 disable. If lint still complains, keep just line 34
clean. The JSDoc line should go either way.

### 3.3 `ClubPage`'s realtime payload cast loses typing

[`ClubPage.tsx:183`](../src/common/components/ClubPage.tsx):

```ts
const row = payload.new as { game_id: string; gametype: string }
```

A `Database['common']['Tables']['club_active_game']['Row']` Pick would
read better and survive a column rename:

```ts
type ActiveGameRow = Pick<
  Database['common']['Tables']['club_active_game']['Row'],
  'game_id' | 'gametype'
>
const row = payload.new as ActiveGameRow
```

Same shape, same `as`, but the field set is anchored to the schema.

### 3.4 `psychicnum` manifest's `statusLabel` ternary nest

[`psychicnum/manifest.ts:81–87`](../src/psychicnum/manifest.ts) nests
three conditionals to build the per-row label string. It reads, but a
small helper would make a quick eye-scan easier:

```ts
function labelFor(g: GameRow): string {
  if (g.status === 'active') {
    return `${g.guesses_remaining} ${g.guesses_remaining === 1 ? 'guess' : 'guesses'} left`
  }
  if (g.status === 'won') {
    const name = g.winner_id ? winnerName[g.winner_id] ?? 'someone' : 'someone'
    return `won — ${name} guessed it`
  }
  return 'lost'
}
```

This change is also one of the [deferred.md items](deferred.md#psychicnum) —
when `winner_id` gets ripped out, the `won` branch collapses to
`'won'` and the helper disappears.

## 4. Things the docs don't quite cover

Items present in the code that aren't yet documented in `docs/`. None is
unnecessary; they all earn their keep. The action is to **add a
sentence to the doc**, not to change the code.

### 4.1 `useSession`'s profile-verify is half-documented

The docstring on [`useSession`](../src/common/hooks/useSession.ts) explains
**that** we verify a profile row exists; [`common.md`'s auth
section](common.md#auth--magic-links) describes the magic-link flow but
not the verify hop. The "stale JWT after `db reset`" scenario is real
and worth a callout in `common.md` (the hook's docstring already has the
prose — promote one sentence up to common.md so it shows up in the
doc index).

### 4.2 `LoginScreen` accepts the 6-digit code path

The change landed in commit `c928230` but isn't reflected in `common.md`,
which still implies magic-link-only. The component's own docstring is
thorough — the doc-side fix is one line in `common.md → Auth & magic
links`:

> Sign-in accepts either the magic-link click **or** the 6-digit code
> from the same email (useful when the email is opened on a different
> device).

### 4.3 The "post-game peer-key reveal" pattern

`useBoard` + `BoardScreen` do something nontrivial: hide the partner's
key during play, fetch it lazily on game-over, render both views as
stripes. [`tinyspy.md`](games/tinyspy.md) mentions the
hardened-vs-by-convention split for `game_players_select` but doesn't
describe the post-game reveal UX. One paragraph under "Frontend" with a
pointer to the `peerKey` derivation in `useBoard.ts` would land it.

### 4.4 The `winner_id` decision in `psychicnum`

`psychicnum.md → Open items` already names this as "overspec'd." The
note there is good. No action — flagging only because a reader of the
schema will hit `winner_id` and wonder before reaching `psychicnum.md`.

## 5. What's *right* (worth not breaking)

These are the patterns I'd lean into when adding the next game (Boggle).
Calling them out so the next refactor doesn't accidentally erode them.

- **Per-effect-run unique channel names** — every realtime hook
  appends `crypto.randomUUID()` to its channel name. This is the thing
  that makes StrictMode safe and survives reconnects cleanly.
- **`SUBSCRIBED`-refetch in every realtime hook** — the
  "missed-events-on-reconnect" gap is the kind of bug that's invisible
  until a flaky network shows up. Glad it's the default.
- **`select('id, col, …')` everywhere with a matching `Pick<…>` type** —
  the lock between the column-list string and the narrowed type is doing
  real work; the addition of a column won't silently flow to the FE.
  Currently consistent across every consumer I read.
- **`docs/testing.md`'s persona convention is paying off** — every test
  I read was easy to follow because "who is ada?" never required a
  sidecar lookup. The fixture UUID pattern (`ada11111-…`) makes failure
  output legible too.
- **Server-authoritative for cleanliness, not anti-cheat** — the
  `psychicnum` column-level grant on `target` is the right kind of
  hardening (small, principled), and the doc explicitly says why we
  don't go further. The line between "single source of truth" and
  "anti-cheat" is held well.
- **The "what doesn't belong" exclusions in `code-conventions.md` are
  being honored** — I didn't see any "added for issue #42" or
  "increment counter" comments in the source.

## 6. Test coverage check vs `docs/testing.md`

Against the [pgTAP vs Vitest split](testing.md#decide-where-a-test-goes):

| Category | Coverage |
|---|---|
| RPC happy/sad paths (`tinyspy`, `psychicnum`, `common`) | Solid — every RPC has a test file, each rejection path is asserted. |
| RLS isolation (per-table, per-schema) | Solid — `rls_test.sql` for each game covers `dee sees zero rows` for every game-scoped table plus mutation-RPC rejection. |
| Triggers (`clear_active_on_termination`, `handle_new_user`) | Covered indirectly — `psychicnum/gameplay_test.sql` asserts the `club_active_game` row goes away on termination; `clubs_test.sql` asserts solo clubs materialize. Direct trigger tests aren't separate, but the observable behavior is checked. |
| Check constraints (`messages.content` 1–1000) | Covered via `send_message`'s rejection paths in `chat_test.sql`. |
| Key-card distribution | Tested in `tinyspy/create_game_test.sql` with the `array_agg(… order by a_label, b_label)` shape `testing.md` recommends. |
| Pure FE derivations (`derivePhase`) | Full matrix in `phase.test.ts`. |
| FE hook state machines (`useSession`, `useBoard`) | Both have tests. The `peerKey` toggle is the highest-value branch and is covered. |
| Router | `usePath` + `navigate` contract tested. |
| Component rendering (`GameLog`) | One canonical example; aligned with testing.md's "input → output" stance. |

Gaps that **don't** matter (per [`testing.md → What we don't test`](testing.md#what-we-dont-test)):

- No E2E browser tests. Acknowledged.
- No CSS / visual regression. Acknowledged.

Gaps that *might* matter:

- **No FE test for `useClubChat`.** The hook is structurally identical
  to `useGame` (fetch + realtime + `SUBSCRIBED`-refetch), but the
  "stale-message-after-reconnect" scenario isn't asserted anywhere. Low
  priority — same gap as not testing `useGame`/`useClues` directly,
  and the pattern is unit-tested via `useBoard.test.ts`.
- **No FE test for the `psychicnum` `useGame`.** Same reasoning — the
  shape mirrors tinyspy's, and the server tests cover the state-machine
  side.

If `testing.md`'s "deliberate gaps" list grows, both of these are
candidates to add explicitly.

## 7. Suggested follow-up order

If you want a single thing to do this week: **§1.1 (cheatsheet sweep)**.
That's the file a stranger or future-Joel hits first, and the drift is
the most user-facing.

If you want a single PR's worth of cleanup: **§1 + §2.1 + §2.3** —
small, mechanical, no behavior change, ~30 lines net removed.
