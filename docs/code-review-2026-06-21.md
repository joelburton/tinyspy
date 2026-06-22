# Code review — 2026-06-21 (whole-tree pass)

A fresh whole-tree review covering **correctness**, **docs ↔ comments ↔ code
alignment**, **test coverage**, **cross-game consistency**, and **dead
code / unused CSS**. Six parallel agents each owned one dimension; the
highest-stakes and any contradictory findings were verified by hand
before write-up (see [§0 Verification notes](#0-verification-notes)).
This run covers all six games (tinyspy, psychicnum, wordknit, freebee,
monkeygram, waffle) plus `src/common/`.

## Resolution summary — what shipped (2026-06-21)

The review was worked end-to-end in the same session. **Every substantive
finding is resolved**; each section below carries an inline resolution
note, and the triage table strikes through what's done. Current state
after the work: **666 pgTAP + 259 Vitest green**, `tsc --noEmit` clean,
eslint clean apart from 5 pre-existing intentional items in untouched
files. What shipped, by theme:

- **Correctness (§1) — all resolved.** psychicnum compete target moved out
  of `common.games.title` into a random `#NNNNNN` id (§1.2); waffle added
  to `EXPOSED_SCHEMAS` so prod exposes the schema (§1.3); ClubPage no
  longer auto-navs members into a *terminal* game (§1.6); monkeygram
  board→dump made a legal move with consistent board-clearing (§1.7).
  §1.1 (freebee answer-key RPC) and §1.4 (`submit_timeout` on
  non-countdown) were **reclassified as non-issues** under the trust model
  — the fix there was correcting the docs/comments that overstated them.
- **New feature that fell out of §1.8:** a uniform manual **`end_game`**
  across every gametype (was freebee-only), documented as an architectural
  pattern in [`common.md`](common.md), with a per-game `end_game_test.sql`
  (+50 pgTAP).
- **Consistency (§4.1–4.3) — all resolved.** Extracted the shared
  [`OpponentStrip`](../src/common/components/OpponentStrip.tsx) +
  [`orderSelfFirst`](../src/common/lib/peers.ts) (four games unified; §4.1
  + §4.2); freebee's feedback split into own-word (in-body) vs
  peer/opponent (header `usePeerFeedback`), killing the `FeedbackTone`
  collision (§4.3).
- **Docs drift (§2) + archaeology (§3) — all resolved.** Wrong RPC
  signatures, the phantom `freebee.dictionary` table, the monkeygram PK,
  the `declare_done` / `Root.tsx` / slice-2 / `*_baseline.sql` ghosts, and
  assorted stale path/field references all corrected to current reality.

**Deliberately not done:** the **§4.4 Low** cosmetic nits (the `labelFor`
idiom spread, redundant Help "Got it" buttons, an optional `OptionRadioRow`
extraction) — genuine "align someday" polish, not bugs or inaccuracies,
left recorded for whenever convenient. The **§5 test-coverage** and **§6
dead-code** findings remain as written (a few were addressed incidentally —
e.g. waffle/monkeygram gained `end_game` tests — but the gaps they name,
like monkeygram's missing RLS test, still stand).

Everything below is the **original review as written** (point-in-time),
now annotated with resolutions.

## Headline

The tree is in good shape. All 616 pgTAP + 259 Vitest tests pass; `tsc
--noEmit` is clean; the server-authoritative + hidden-secret patterns
are correctly applied in five of six games. The findings cluster into
three themes worth acting on, in priority order:

1. **Two real "this contradicts its own stated invariant" backend leaks**
   (§1.1 freebee answer-key RPC, §1.2 psychicnum compete target-in-title)
   and **one real production deploy gap** (§1.3 waffle missing from
   `EXPOSED_SCHEMAS`). These are the only items I'd call must-fix.
2. **The "opponent progress strip" concept is implemented four separate
   ways with four different names** (§4.1) — the single clearest
   violation of the repo's own "same concept → same name/component" rule,
   and the highest-value refactor. freebee's parallel feedback system +
   colliding `FeedbackTone` type (§4.3) is the runner-up.
3. **Pervasive stale "v1 / declare_done / slice-2 / 10-minute-timer"
   archaeology** in comments and game docs (§3) — explicitly the kind of
   "how it used to work" commentary CLAUDE.md says it does *not* want,
   concentrated in monkeygram and waffle.

Suggested read order: §1 → §4 → §3 → §2 → §5 → §6.

## 0. Verification notes

Two cross-agent contradictions were resolved by hand:

- **pgTAP "not provisioned" — NOT a finding.** One agent reported
  `npm run test:db` failing for a missing `plan()` function. I re-ran it:
  **616/616 pass, Result: PASS**. That was a transient artifact in that
  agent's sandbox, not a repo issue. Dropped.
- **freebee `candidate_words` leak — CONFIRMED.** `revoke … from public;
  grant execute … to authenticated;`
  ([freebee.sql:498-499](../supabase/migrations/20260617000000_freebee.sql))
  with the function read under the caller's JWT. Real.
- **waffle missing from `EXPOSED_SCHEMAS` — CONFIRMED.**
  [`import-to-hosted.sh:220`](../import-to-hosted.sh) lists
  `common,tinyspy,psychicnum,wordknit,freebee,monkeygram` — no `waffle`.
- **psychicnum timer — RESOLVED.** `{ kind: 'countdown', seconds: 15 }`
  is the *intended* value (not a leftover). The fix was to the docstring,
  which redundantly restated a "10-minute count-down" — that specific
  duration was both wrong and the kind of obvious-from-the-code detail a
  docstring shouldn't carry, so it was removed rather than corrected.
  ([`setup.ts:38-40`](../src/psychicnum/lib/setup.ts))

## Triage table

| # | Finding | Severity | Kind |
|---|---|---|---|
| 1.1 | ~~freebee `candidate_words` hands any player the full answer key~~ — **resolved**: not a defect under the trust model; doc/comment reframed (it overstated airtightness) | ~~High~~ Resolved | Docs |
| 1.2 | ~~psychicnum compete target leaks via `common.games.title`~~ — **fixed**: title is now a random `#NNNNNN` id | ~~High~~ Resolved | Correctness |
| 1.3 | ~~waffle absent from `EXPOSED_SCHEMAS` (PostgREST won't expose it in prod)~~ — **fixed**: added `waffle` to the list | ~~High~~ Resolved | Deploy |
| 1.4 | ~~`submit_timeout` callable on non-countdown games (4 games)~~ — **dismissed**: only reachable via a manual devtools RPC call (trust-model case we don't defend); FE never fires it without a countdown. Manual end-game uses a separate `end_game` RPC | ~~Medium~~ Not a concern | Correctness |
| 1.5 | monkeygram stuck on "Dealing tiles…" when board row absent | Medium | Correctness |
| 1.6 | ~~ClubPage auto-navs members into terminal current games on stray UPDATE~~ — **fixed**: skip-terminal guard on the auto-nav | ~~Medium~~ Resolved | Correctness |
| 1.7 | ~~monkeygram `dump` can remove a *placed* tile (board/holdings desync)~~ — **resolved**: mis-framed; board→dump is a legal move, now implemented in the FE with consistent board-clearing | ~~Medium~~ Resolved | Correctness |
| 1.8 | ~~Compete + non-countdown timer + idle player = game never terminates~~ — **fixed**: every gametype now has a manual `end_game` (uniform pattern, documented in common.md) | ~~Medium~~ Resolved | Correctness |
| 4.1 | Opponent/progress strip — 4 names, 4 structures, 1 concept | High | Consistency |
| 4.3 | ~~freebee parallel feedback system + colliding `FeedbackTone` type~~ — **resolved**: two surfaces are intentional (in-body = own word, header = peer/opponent via new `usePeerFeedback`); type renamed `WordResultTone` | ~~High~~ Resolved | Consistency |
| 3.* | Stale "v1/declare_done/slice-2/10-min-timer" archaeology | Medium | Docs |
| 2.* | Doc drift: wrong RPC sigs, phantom tables, undocumented shipped features | Medium-High | Docs |

---

## 1. Correctness

### 1.1 freebee `candidate_words` answer key — RESOLVED (reclassified as a docs fix)

**Resolution (2026-06-21):** Not a defect. Under
[CLAUDE.md → Trust model](../CLAUDE.md), an open answer key is fine — we
don't try to stop friends peeking via devtools. The real problem was that
the migration comment and [`freebee.md`](games/freebee.md) framed the
column-hiding as an anti-cheat guarantee ("devtools = puzzle solved" is
prevented), which the open `candidate_words` RPC contradicts. Both have
been reframed: the terminal-gating exists to keep the secret off the
*default* data path (clean single source of truth + a deliberate,
auditable post-terminal reveal), explicitly **not** as a boundary against
peeking. The RPC stays granted to `authenticated`. Original finding below
for the record.

[`freebee.sql:472-499`](../supabase/migrations/20260617000000_freebee.sql).
`freebee.candidate_words(puzzle_mask, center_bit)` is `security invoker`,
reads `common.words`, and is `grant execute … to authenticated`. A player
already sees their board's outer + center letters (deliberately not
hidden), so they can compute both masks in two lines of JS and call this
RPC from devtools to get back **every scoring + legal word with the
`in_scoring` flag** — the whole solution. This bypasses the
`_scoring_words_for` / `_legal_words_for` + `security_invoker` view
machinery and directly contradicts the migration's and
[`freebee.md:152`](games/freebee.md)'s claim that "devtools = puzzle
solved" is prevented.

Fix: restrict the RPC to `service_role` (the board-build edge function
can use an elevated client) and revoke from `authenticated`; **or** amend
the docs to drop the airtight-hiding claim. The inconsistency to resolve
is that the trust model tolerates such leaks elsewhere — but here the
code/doc frame it as a guaranteed invariant.

### 1.2 psychicnum compete target leaks via `common.games.title` — FIXED

**Resolution (2026-06-21):** Fixed. The title no longer references the
target; `create_game` now generates a random short numeric id
(`#NNNNNN`) as the human-readable label, so the secret never lands in the
club-wide-readable `common.games.title`. The column-grant on
`psychicnum.games.target` remains the canonical server-side secret, now
with nothing undercutting it. Test + doc updated. Original finding below.

[`psychicnum.sql:352-365`](../supabase/migrations/20260615000002_psychicnum.sql)
writes `s_target::text` as the game title; `common.games.title` is
club-wide readable and granted to `authenticated`
([common.sql:579-581](../supabase/migrations/20260615000000_common.sql)).
A compete opponent can `select title` mid-game and read the secret
number, defeating the `_target_for` apparatus in exactly the mode where
the secret is competitively load-bearing. The "toy game, deliberate leak"
rationale was written for **coop** (shared secret) and is silently wrong
for **compete**. Fix: non-revealing title for compete games, or a
deliberately documented decision for compete specifically. (psychicnum is
slated for post-beta removal, so this may be wontfix — but it should be a
*choice*, not an accident.)

### 1.3 waffle missing from `EXPOSED_SCHEMAS` — FIXED

**Resolution (2026-06-21):** Fixed. Added `waffle` to `EXPOSED_SCHEMAS` in
[`import-to-hosted.sh:220`](../import-to-hosted.sh) — it was the only place
per-game schemas are enumerated, and waffle's puzzle import (`8d`) already
existed later in the script, so this was the sole gap. Original finding
below.

[`import-to-hosted.sh:220`](../import-to-hosted.sh). The production import
script's `EXPOSED_SCHEMAS` omits `waffle`, so PostgREST would not expose
the `waffle` schema in the hosted environment even though the rest of the
script imports waffle puzzles. [`waffle.md:230`](games/waffle.md) claims
waffle is wired into this script.

### 1.4 `submit_timeout` callable on non-countdown games — DISMISSED (trust model)

**Resolution (2026-06-21):** Not a concern. `submit_timeout` has exactly
one caller — `GamePage`'s `fireTimeoutOnExpiry` effect
([`GamePage.tsx:162-177`](../src/common/components/GamePage.tsx)), gated on
`timer.expired`, which only becomes true for a `countdown` timer. So the
FE never fires it on a `none`/`countup` game. The manual "end the game
now" feature (freebee's "I've found the words I want, stop") is a
*separate* RPC, `freebee.end_game`
([`PlayArea.tsx:341`](../src/freebee/components/PlayArea.tsx)) wrapping
`common.end_game` — unrelated to the timer. The only way to hit
`submit_timeout` on a non-countdown game is a hand-rolled devtools RPC
call, i.e. a friend deliberately griefing the game — exactly the case
[CLAUDE.md → Trust model](../CLAUDE.md) says we don't defend against. A
`timer.kind = 'countdown'` guard would be harmless but buys nothing real;
left out. Original finding below.

wordknit, waffle, freebee, psychicnum all expose `submit_timeout` to
`authenticated` and end the game for everyone, but none check that
`setup.timer.kind = 'countdown'`. Any player can call it on a `none` /
`countup` game and force a collective timeout-loss the clock could never
have caused — a destructive shared-state write gated only by membership.
(wordknit [`:938`](../supabase/migrations/20260615000003_wordknit.sql),
waffle [`:702`](../supabase/migrations/20260624000000_waffle.sql),
psychicnum [`:632`](../supabase/migrations/20260615000002_psychicnum.sql),
freebee `submit_timeout`.)

### 1.5 monkeygram stuck on "Dealing tiles…" when the board row is absent — Medium

[`monkeygram/hooks/useGame.ts:43,52`](../src/monkeygram/hooks/useGame.ts).
`load()` does `if (!mounted() || !data) return` — on null `data` it bails
**without** setting state. `loading` is derived as `initialBoard === null`,
which only leaves null when a row is found, so a missing `player_boards`
row (realtime race before the RPC materializes it, or a `db:reset`
mid-session) leaves PlayArea stuck on `<p>Dealing tiles…</p>` forever.
Every other game's `useGame` handles not-found explicitly. Fix: set a
distinct "loaded/not-found" state instead of relying on `initialBoard`.

### 1.6 ClubPage auto-navs members into a *terminal* current game on a stray UPDATE — FIXED

**Resolution (2026-06-21):** Fixed with the skip-terminal guard — the
auto-nav now bails on `!row.is_current_view || row.is_terminal`
([`ClubPage.tsx`](../src/common/components/ClubPage.tsx)), so auto-follow
applies only to *active* play; reviewing a finished game stays opt-in. The
two real stray-UPDATE sources were: the `end_game` terminal transition
(flips `is_terminal` but leaves `is_current_view = true`), and
`set_current_view` re-asserting current-view when a peer re-opens a
finished game to review. `is_terminal` was added to the `GameRow` Pick (the
realtime payload already carries every column). Original finding below.

[`ClubPage.tsx:464-474`](../src/common/components/ClubPage.tsx). The
`subscribeToClubGames` handler navigates **every** club-page member into a
game on any INSERT/UPDATE whose `new.is_current_view === true` and whose
path differs. A terminal game keeps `is_current_view = true` while someone
reviews it (per [states.md](states.md)), so any UPDATE to that row that
preserves `is_current_view` would yank a member who deliberately sat on
the club page into the finished game. Latent today (terminal rows rarely
UPDATE) but it's "client trusts the realtime payload too much." Fix:
auto-nav only on a genuine transition (`payload.old.is_current_view !==
payload.new.is_current_view`), or skip auto-nav for `is_terminal` rows.

### 1.7 monkeygram `dump` of a placed tile — RESOLVED (was mis-framed)

**Resolution (2026-06-21):** The premise was wrong. Dumping a tile dragged
off the **board** is a *legal move*, not something to block — the original
finding read the server in isolation and assumed the FE could leave a
dumped letter on the board. In fact the FE drop handler only ever dumped
`source.kind === 'hand'` tiles, so a board tile dragged to the dump zone
was silently ignored — a **missing move**, not a desync. Fixed in the FE
([`PlayerBoard.tsx`](../src/monkeygram/components/PlayerBoard.tsx)
`finishDrag`): a board-sourced tile dropped on the dump zone now clears its
cell (`boardToHand`) *and* calls `onDump`, so `board` loses the letter in
lock-step with the server removing it from `tiles` — no desync. The dump
slot now arms/lights for board tiles too. Server `dump` is unchanged and
correct (the letter is in `tiles` whether placed or in hand). Original
finding below.

[`monkeygram.sql:644-659`](../supabase/migrations/20260623000000_monkeygram.sql).
The hold-check uses `position(tile in caller_tiles)` against the full
`tiles` string (hand + placed), so dumping a letter currently placed on
the board removes it from `tiles` while it stays rendered on `board`,
breaking the "every board letter is a held tile" invariant; the derived
hand (`tiles − placed`) goes wrong.

### 1.8 Compete + non-countdown timer + idle player → game never terminates — FIXED

**Resolution (2026-06-21):** Fixed by giving **every** gametype a manual
`end_game` (previously only freebee had one). Any player can now stop a
stuck game from the GamePage menu, regardless of mode or timer. The
pattern is uniform across all six games and documented as an architectural
convention in [common.md → "Manual end"](common.md). RPCs:
tinyspy/psychicnum/wordknit/waffle/monkeygram each gained
`<schema>.end_game(target_game uuid)`; each PlayArea gained an "End game"
menu item + neutral terminal rendering; each has a new
`end_game_test.sql` (50 new pgTAP assertions, all passing). The stale
waffle.md "swap budget guarantees termination" claim was the symptom of
this gap. Original finding below.

wordknit [`:861`](../supabase/migrations/20260615000003_wordknit.sql),
waffle [`:643`](../supabase/migrations/20260624000000_waffle.sql). Compete
terminal detection fires only when a player completes or exhausts their
budget/swaps. A connected-but-idle player who gives up leaves
`play_state='playing'` forever when there's no countdown — and a `none` /
`countup` compete game is fully valid. Presence-pause only covers
*disconnected* players. [`waffle.md`](games/waffle.md) wrongly claims "the
finite swap budget guarantees termination." Consider a concede/abandon
action, or require compete to carry a countdown.

### Lower-severity correctness (verified, not bugs today)

- **`common.update_state` unconditionally clears `is_terminal`**
  ([common.sql:1083-1086](../supabase/migrations/20260615000000_common.sql)) —
  no guard on current value; would resurrect a terminated game if ever
  mis-ordered. Latent footgun; guard with `where id = … and is_terminal =
  false`.
- **tinyspy duplicate `player_user_ids`** → opaque PK error instead of the
  friendly `user_a_id <> user_b_id` CHECK (dead code, PK aborts first).
  Add an explicit distinct-players check
  ([tinyspy.sql:392-407](../supabase/migrations/20260615000001_tinyspy.sql)).
- **freebee `create_game` board gate is shallow**
  ([freebee.sql:679-694](../supabase/migrations/20260617000000_freebee.sql)) —
  checks `total_words >= 30` but never `jsonb_array_length(scoring_words)
  = total_words`, so `{total_words:30, scoring_words:[]}` passes and
  creates an unsolvable puzzle, despite the gate's comment.
- **Several `submit_*` RPCs lock/read state before `require_game_player`**
  (authorize-after-lock) — harmless under the trust model, but
  inconsistent house pattern; standardize on authorize-then-lock.
- **GamePage timeout-loss effect re-runs on every realtime refetch**
  ([GamePage.tsx:162-177](../src/common/components/GamePage.tsx)) — correct
  today via `submittedTimeoutRef`, but narrow the dep to
  `commonGame?.ended_at` to make intent explicit.
- **wordknit `joinWordKnitRoom` deps include unused `session.user.id`**
  ([wordknit/hooks/useGame.ts:280](../src/wordknit/hooks/useGame.ts)) —
  would needlessly rebuild the stable-name broadcast channel on token
  refresh. Drop it.
- **Pause flickers `true` on the roster-load → presence-sync gap**
  ([useCommonGame.ts](../src/common/hooks/useCommonGame.ts) +
  [pause.ts](../src/common/lib/pause.ts)) — self-correcting overlay flash
  on every multiplayer entry/resume; treat empty presence as "unknown"
  not "everyone missing" if observed.

---

## 2. Docs ↔ code drift

> **RESOLVED (2026-06-21).** Every drift listed below was verified against
> current code and fixed: tinyspy `create_game` signature + RLS predicate,
> monkeygram games PK (`id`) + `club_handle`/`created_at` columns, the
> phantom `freebee.dictionary` table, freebee click-to-define documented as
> shipped (+ the self-contradicting `WordList.tsx` docstring), psychicnum
> three-table subscription + `player_user_ids` param, wordknit hint-dialog
> reveal behavior + folder-layout omissions, waffle pgTAP test list +
> `_player_colors_for` helper name, `common.md` `shortDescription` (was
> `blurb`), naming.md gametype examples (+ monkeygram/waffle and the
> wordknit/freebee `_coop`/`_compete` split), and the `wordknit:import`
> FE string. Findings retained below as the record.

Both prior reviews ([06-14](code-review-2026-06-14.md),
[06-16](code-review-2026-06-16.md)) were **verified genuinely resolved** —
no "claimed-fixed-but-not" cases. New drift below; highest severity first.

**High:**
- **freebee click-to-define is shipped but documented as deferred.**
  [`WordList.tsx:7,127-151`](../src/freebee/components/WordList.tsx) renders
  `DefinitionPopover` and there's a `supabase/functions/define/` edge fn,
  but [`freebee.md:80,494`](games/freebee.md) call it deferred/non-interactive
  — and [`WordList.tsx:74-81`](../src/freebee/components/WordList.tsx)'s own
  docstring says "No definition popover in Phase 4 … rows are
  non-interactive," contradicting the code right below it.
- **freebee phantom `dictionary` table.** [`freebee.md:289`](games/freebee.md)
  RLS table lists `freebee.dictionary`, which doesn't exist (the word list
  is `common.words`; the only freebee reference table is `pangrams`).
- **tinyspy wrong RPC signature + RLS.** [`tinyspy.md:138`](games/tinyspy.md)
  documents `create_game(target_club text)`; actual is `(target_club,
  setup jsonb, player_user_ids uuid[])`. [`tinyspy.md:210`](games/tinyspy.md)
  says SELECT gates on `is_player_in_game`; migration gates on
  `is_club_member` (club-wide) and the doc self-contradicts at `:206`.
- **monkeygram wrong PK name.** [`monkeygram.md:157`](games/monkeygram.md)
  documents the `games` PK as `game_id`; migration is `id` (child tables
  use `game_id`). Also omits the load-bearing `club_handle` column.

**Medium (doc completeness / stale signatures):**
- psychicnum subscribes to three tables (`games, players, guesses`), doc
  [`:358`](games/psychicnum.md) says two; RPC param is `player_user_ids`,
  doc [`:20`](games/psychicnum.md) says `players`.
- wordknit hint dialog gates each category behind a "Reveal" button; doc
  [`:68`](games/wordknit.md) says it "lists each category's first word."
  Folder layout [`:279-323`](games/wordknit.md) omits ~9 shipped files.
- waffle pgTAP test list [`:254-259`](games/waffle.md) cites non-existent
  `swap_test`/`rls_test`/`schema_test` and omits the real
  `gameplay_test`/`timeout_test`. Helper named `_colors_for` in docs;
  actual is `_player_colors_for`.
- `common.md` registry table documents the manifest field as `blurb`;
  actual `GameManifest` field is `shortDescription`
  ([games.ts:269](../src/common/lib/games.ts)).
- naming.md gametype example lists omit monkeygram + waffle
  ([naming.md:23,217-218](naming.md)).

**Incidental code-string bugs found during the doc pass:**
- [`wordknit/components/SetupForm.tsx:162`](../src/wordknit/components/SetupForm.tsx)
  tells users to run `npm run puzzles:import`; the real script is
  `wordknit:import`.

---

## 3. Stale / archaeological comments (CLAUDE.md says: don't want these)

> **RESOLVED (2026-06-21).** All listed archaeology was verified against
> current code and rewritten to describe the *current* design (not deleted
> wholesale — teaching value preserved): monkeygram's `declare_done` →
> `peel`/`end_game` (in code, the squashed-migration header, manifest, the
> "v1 Done button" Help copy, and the doc); waffle's "slice-2 / timer lands
> later" framing (both shipped); tinyspy's phantom `Root.tsx`/`TinySpyRoot`
> + non-existent migration filenames + the `game_players.key_card` pointer
> (real: `tinyspy.games.key_card_a/_b`); wordknit's `*_wordknit_baseline.sql`
> + `docs/wordknit.md` path pointers; plus the two `theme.css` "imported
> from Root.tsx" notes and three `common/` `docs/wordknit.md` path refs
> caught in the sweep. The "10-minute timer" docstrings were already
> resolved earlier. Findings retained below as the record.

CLAUDE.md's Educational-priority section explicitly rejects "how it used
to work" commentary. The biggest concentration in the tree:

- **monkeygram `declare_done`** is described as a shipped-then-replaced RPC
  "in its own migration" across [`monkeygram.md:185,140,204`](games/monkeygram.md),
  the migration header, and [`manifest.ts:72`](../src/monkeygram/manifest.ts).
  It **does not exist** — replaced by `peel`, and the migration is a single
  squashed file (contradicting the header's "RPCs land in their own
  migrations" narrative). `Help.tsx` still describes a "Done" button (actual
  is "Peel! 🍌") and a game without the peel/dump loop.
- **waffle "slice-2 / compete-lands-later" framing.**
  [`manifest.ts:14-16`](../src/waffle/manifest.ts) and
  [`setup.ts:27-30`](../src/waffle/lib/setup.ts) say compete and the timer
  ship in a later slice; both are fully built and wired.
  [`SetupForm.tsx:11-13`](../src/waffle/components/SetupForm.tsx) docstring
  says "one choice plus the timer" but renders two fieldsets.
- **tinyspy** [`manifest.ts:23-26`](../src/tinyspy/manifest.ts) references a
  non-existent `Root.tsx`/`TinySpyRoot` and non-existent migration
  filenames; [`labels.ts:10`](../src/tinyspy/lib/labels.ts) points to a
  `game_players.key_card` table/column that doesn't exist.
- **wordknit** [`board.ts:7-8`](../src/wordknit/lib/board.ts) points to a
  `*_wordknit_baseline.sql` file (doesn't exist) and `docs/wordknit.md`
  (actual path `docs/games/wordknit.md`).
- **The "10-minute default timer" docstrings** in psychicnum / wordknit /
  freebee `setup.ts` all claimed 10 minutes — **all resolved**. The fix
  followed a docstring principle (state the contract / shape / purpose,
  don't echo the literal value the reader can already see): the
  value-narrating timer sentences were removed rather than corrected, and
  the docstrings now describe purpose only (why `puzzleId` starts empty,
  why coop omits `target_rank`, what `target_rank: 5` means). Actual
  defaults are `seconds: 15` (psychicnum, intended) and `{ kind: 'none' }`
  (wordknit, freebee).

---

## 4. Cross-game consistency (the headline refactor area)

### 4.1 The "opponent / progress strip" — one concept, four implementations — RESOLVED

**Resolution (2026-06-21):** Extracted
[`common/components/OpponentStrip.tsx`](../src/common/components/OpponentStrip.tsx)
— the inline strip now shared by **four** games (waffle, wordknit,
freebee, and psychicnum's budget strip, which the review's table missed).
It owns ordering, the colored You/username label, the `·` separators, and
the CSS; each game passes a `metricFor(player, isSelf) => ReactNode` for
the one cell that differs (swaps+✓/✗ · mistake dots · rank · budget), plus
an optional `leading` slot (freebee's "target:" row). The four bespoke
strips and their duplicated CSS are deleted. **monkeygram's `PeersStrip`
was deliberately left** — its vertical dot-list sorted by who's closest to
done is a genuinely different shape (closer to `PlayersStrip`), and forcing
it through the shared component would have meant `layout`/`order`/`marker`
config-soup. Behavior-preserving; `tsc`/eslint/Vitest green. Original
finding below.

A horizontal strip showing each player with a per-player progress metric
appears in four games, each built differently:

| Game | Name | File or inline | Self shown? | Sort |
|---|---|---|---|---|
| monkeygram | `PeersStrip` | own file + CSS module | no | by `unplaced` asc |
| waffle | `OpponentStrip` | own file, no CSS module | yes | self-first, then alpha |
| wordknit | `OpponentMistakesStrip` | inline in PlayArea | yes | self-first, then alpha |
| freebee | `OpponentRanksStrip` | inline in PlayArea | yes | self-first, then alpha |

Four names, four structures, inconsistent self-inclusion and markup
vocabulary — and there's already a `common/components/PlayersStrip.tsx`
(the header roster) that none of them parallel in naming. This is the
clearest violation of naming.md's "consistency for the same concept is
non-negotiable." **Recommendation:** extract
`common/components/OpponentStrip.tsx` taking `{ players, selfId,
renderMetric, order }`, where each game supplies only the metric cell
(MistakeDots / rank name / swap count / tiles-left) via a render prop.

### 4.2 The "self-first, then peers by username" sort is copy-pasted 4× — RESOLVED (with 4.1)

**Resolution (2026-06-21):** Extracted to
[`common/lib/peers.ts → orderSelfFirst`](../src/common/lib/peers.ts), which
the shared `OpponentStrip` (§4.1) now owns — the four copies are gone.
Original finding below.

[`waffle/OpponentStrip.tsx:19`](../src/waffle/components/OpponentStrip.tsx),
[`wordknit/PlayArea.tsx:372`](../src/wordknit/components/PlayArea.tsx),
[`freebee/PlayArea.tsx:534`](../src/freebee/components/PlayArea.tsx),
[`psychicnum/PlayArea.tsx:168`](../src/psychicnum/components/PlayArea.tsx) —
identical logic, three carry the same verbatim comment (a paste tell).
Extract `common/lib/peers.ts → orderSelfFirst(players, selfId)`; the
shared strip from §4.1 would own it.

### 4.3 freebee feedback system + colliding `FeedbackTone` — RESOLVED

**Resolution (2026-06-21):** Resolved, but the diagnosis evolved: the two
feedback surfaces are *intentional*, not redundant. freebee keeps the
in-body pill for the player's **own** word result (its placement near the
input is the point), and now also uses the **common header slot** for
peer/opponent events — the previously-unused `ctx.feedback`. New
[`usePeerFeedback`](../src/freebee/hooks/usePeerFeedback.ts) fires header
pills for: coop — a peer found a good/pangram word (found_words is
club-wide); compete — an opponent climbed a rank (their words are
RLS-hidden, but rank rides `status.leaderboard`); both bootstrap on the
first loaded render so a reconnect doesn't replay a backlog, and
self-activity is excluded. The leaderboard parse was extracted to
[`lib/leaderboard.ts`](../src/freebee/lib/leaderboard.ts) (shared by the
strip + the hook). The name collision is gone: freebee's local type is
renamed `WordResultTone` (it legitimately carries a `warning` tone the
common palette lacks). Original finding below.

Every other game routes transient feedback through the common header slot
(`ctx.feedback.show({ tone, text, dismiss })`,
[`FeedbackPill.tsx`](../src/common/components/FeedbackPill.tsx)). freebee
keeps a parallel system:
[`freebee/components/Feedback.tsx`](../src/freebee/components/Feedback.tsx)
rendered inside PlayArea, driven by local `useState` + a manual
`setTimeout` — duplicating exactly what the common API's `dismiss: { kind:
'timed', ms }` already does. Worse,
[`Feedback.tsx:4`](../src/freebee/components/Feedback.tsx) declares
`FeedbackTone = 'success' | 'warning' | 'error'` — same name as the common
`FeedbackTone = 'success' | 'error' | 'neutral' | 'info'`
([games.ts:87](../src/common/lib/games.ts)) but **different members**. Two
types, one name, one concept. Fix: import the common type; decide whether
the in-body pill placement is a real shared need (promote to `common/`) or
should move to the header (delete `Feedback.tsx`).

### 4.4 Lower-impact consistency items

- **`manifest.labelFor` — five idioms.** waffle's `labelFor(modeLabel)`
  factory is the cleanest; the four coop/compete sibling games all build
  the same "`<modeLabel> · <state copy>`" shape differently. Adopt waffle's
  factory as the sibling standard (or document one idiom in
  code-conventions.md).
- **End-of-game reveal UI** is named inconsistently (waffle
  `SolutionReveal` vs inline branches elsewhere). The *data* pattern is
  consistent and correct; only the UI naming drifts. Optional: a
  consistent `*Reveal` sub-component or `revealed` prop.
- **SetupForm option-row markup** is hand-rolled 5× with drifted CSS
  values (legend weight, `.radio` gap, `.setup` gap `16px` vs `1rem`).
  Extract `common/components/OptionRadioRow.tsx`. Low-risk cosmetic.
- **Help "Got it" buttons** — four games add a redundant bottom button on
  top of FloatingPanel's X; two don't. Standardize.

**Verified correct (no action):** `db.ts` shape across all six;
sibling-manifest pattern; useGame Pattern A/B chosen correctly per game;
`Player = Member` alias convention; wordknit/freebee/waffle rank-vs-tier
helpers are *genuinely different concepts* sharing a word (naming.md
already documents this — do **not** merge).

---

## 5. Test coverage

Suite is healthy (616 pgTAP + 259 Vitest, all green) and conventions
(`_shared/setup.psql`, persona helpers, SQLSTATE assertions) are uniform.
Every coop/compete sibling has both modes tested at the DB layer. Gaps:

- **monkeygram has no `rls_test.sql`** (High) — the only multiplayer game
  without one. `player_boards_select` (`user_id = auth.uid()`) — *the*
  visibility mechanic — is never asserted from a non-owner's perspective
  (existing tests `reset role` to superuser). Add: bea cannot read ada's
  board; `pool` column not selectable by `authenticated`.
- **waffle `create_game` validation branches are entirely untested**
  (Medium) — bad `mode`, `extra_swaps` out of 0..15, `difficulty` not in
  {35,50,60}, non-member rejection. All 7 existing assertions are
  happy-path `is(...)`, zero `throws_ok`.
- **waffle has no RLS test** (Medium) — non-member access to
  `games`/`players`/`players_state` view is unverified; the
  `security_invoker` view + column-grant pattern is exactly the kind of
  interaction that leaks silently.
- **wordknit coop post-terminal guard untested** (Medium) — the
  `play_state <> 'playing'` guard in `submit_guess` is exercised only on
  the compete side.
- **No `useGame.ts` hook has a Vitest test** in any game (Low-Medium) —
  wordknit's 397-line hook is the standout. `tinyspy/useBoard.test.ts` is
  the only hook test and shows the pattern is cheap.
- **monkeygram's 639-line `PlayerBoard.tsx`** (keyboard cursor, FE hand
  derivation) has no FE test (Medium) — extract the pure logic and test it.
- **Asymmetry** (informational): pgTAP assertion counts are freebee 137,
  tinyspy 94, wordknit 88, psychicnum 62, waffle 53, monkeygram 41.
  monkeygram offsets its low count with the only game-specific e2e suite;
  **waffle is the least-covered overall** (thin pgTAP, no RLS test, no
  validation tests, no e2e). psychicnum's low count is acceptable (toy,
  slated for removal). Prioritize waffle hardening.

---

## 6. Dead code & unused CSS

The tree is remarkably clean; most apparent hits were false positives
(dynamic `styles[expr]` class keys, string-dispatched edge functions,
intentional convention exports). Confirmed real:

- **Unused global classes in [`common/theme.css`](../src/common/theme.css):**
  `.cardList` (258), `.dot-separator` (289), `.home-footer` (282) — no
  `className` reference anywhere. `.cardList`'s comment claims ClubPage
  uses it, but ClubPage uses CSS-module classes. Delete all three (and the
  line-13 comment listing).
- **Unused exported functions in
  [`monkeygram/lib/board.ts`](../src/monkeygram/lib/board.ts):** `inBounds`
  (22), `removeCharAt` (35) — never imported. Delete.
- **Unused CSS custom properties:** `common/theme.css`
  `--color-outcome-current-bg`, `--color-outcome-near-bg` (the `-border`
  siblings *are* used); the entire `tinyspy/theme.css` `--tinyspy-*-soft` /
  `-bright` cluster (~9 vars, looks like an unwired palette);
  `wordknit/theme.css` `--wordknit-rank-{0..3}-text` (the base
  `--wordknit-rank-N` are used via `RANK_TOKEN`; only `-text` are dead).
- **Superfluous `export` keywords** (harmless, not dead): `DefinitionResult`,
  `TableSubscription`, `RealtimeLoad`, `GameSetupForm`, `PlayerRow`,
  `PAR_MIN`/`PAR_MAX`/`makeScramble`. Optional tightening.

**Verified NOT dead (keep):** all CSS-module classes (dynamic-key usage);
`--color-member-*` (built via `var(--color-member-${name})`); the 3 edge
functions (string-dispatched); `monkeygram-ui/` (gitignored, documented
throwaway prototype); `waffle-samples.txt` + `sample-waffle-puzzles.ts`
(wired to `waffle:sample`); per-game `Player` aliases; `src/types/db.ts`
(generated); all npm deps.

---

## Appendix: methodology

Six parallel review agents, one per dimension (cross-game consistency, FE
correctness, backend/SQL correctness, docs alignment, test coverage, dead
code). Each read CLAUDE.md + relevant docs first and produced file:line
findings without editing. High-stakes and contradictory claims were
hand-verified before inclusion (see §0). `tsc --noEmit`, `npm run test`,
and `npm run test:db` were all run during the review and pass.
