# Code review — 2026-07-01 (post-v3 sweep)

A whole-repo review taken right after the v3 convergence sweep finished (all ten
games on the shared two-column scaffold). The v3 goals were: (1) much more
consistent cross-game UI, (2) less per-game CSS/React by promoting shared things
into `common/`, (3) a consistent feature set (turn logs, word lists, keyboard
capture, click-to-define, …). This report scores the result against those goals
and lists what's left.

**Method.** Six parallel reviewers, each cross-checked against source; every
claim below carries a `file:line` and, for the correctness items, a concrete
triggering input. The highest-impact and any *contradicted* findings were
re-verified by hand (see the [Verification notes](#verification-notes)). Nothing
was edited — this is a findings report, not a change.

> Like [`audit-feedback.md`](audit-feedback.md), this is a **point-in-time
> snapshot**. Line numbers drift; re-confirm a finding before acting on it.
> When an item gets picked up, move it to [`deferred.md`](deferred.md) or delete
> it.

> **Status update — 2026-07-02.** The **feedback refactor** (branch
> `playarea-layout`, commits `7f160b4` → `2af0e4d`) has closed the review's
> highest-value cluster:
> - **§1.1 (peer-narration seed-timing) — ✅ RESOLVED**, and with it its
>   extraction target **§4.1 `usePeerEventFeedback` — ✅ RESOLVED** (shipped as
>   `common/hooks/useGlobalFeedback.ts`; `9b311aa`).
> - **§3.1 (below-board slot) — ◐ PARTLY DONE**: the slot structure + reserved
>   height are now shared/tokenized (`67f566c`); the per-game `--avail-h`
>   drift remains.
>
> Verified **still open** (the §1.1 work did *not* touch these, despite living
> nearby): **§1.2** (codenamesduet clue-draft loss), **GAP 1** (boggle peer
> feedback), and the §3.1 `--avail-h` derivation. Each item is annotated inline
> below. *(Unrelated to this review: a shared board-overflow bug on classic
> scrollbars / Safari+Firefox was fixed separately, `64b878a`+`7bc2a64`.)*

## Headline

The sweep **landed well**. The two-column shell, `.tile`/`.tileWord`, the
info-column readouts, `<TurnLog>`/`<WordList>`, `<FeedbackPill>`,
`<EntryRow>`+`useCaptureKeys`, the semantic buttons, `useCommonGame`,
`useRealtimeRefetch`, `GameOverModal`+`useTerminalModal`, `DifficultyField`/
`TimerField`/`StartGameButtons` are all genuinely shared, and most per-game files
are thin composers. Correctness is strong: the game-logic layer (433 tests) is
essentially clean; the one class of bug that recurred was **not** in the logic but
in one shared *pattern* — the "seen-set bootstrap" that narrates peer moves,
which three games seeded at the wrong moment. **(That pattern has since been
extracted to one correct `common/hooks/useGlobalFeedback.ts` and the bugs are
fixed — see the status update above and §1.1/§4.1.)**

The remaining work clusters into four seams the sweep didn't quite finish:

1. ~~**The peer-narration bootstrap** — same idea, three implementations, two of
   them buggy. Extract one correct `usePeerEventFeedback` and the bugs die with
   the duplication.~~ **✅ DONE** (`useGlobalFeedback`, `9b311aa`).
2. **The below-board slot + hug-board sizing** — copied CSS boilerplate with
   value drift (three reserved-height values, four copies of the width formula).
   *(Below-board slot: **◐ the reserved-height half is done**, `67f566c`; the
   `--avail-h` drift + the hug-board width formula remain.)*
3. **A batch of literal colors/radii** that duplicate existing tokens, plus a
   couple of near-miss color drifts.
4. **A few almost-universal features** with one or two games missing them
   (boggle peer feedback; wordle/connections click-to-define; wordle's
   hand-rolled capture).

---

## 1. Correctness

Ranked by severity. Ratings: **confirmed** (traced + reproducible), **likely**
(strong reasoning, not run), **smell** (works today, fragile).

### 1.1 Peer-narration seed-timing bugs — the recurring one

> **✅ RESOLVED — feedback refactor stage 3 (`9b311aa`).** All five bucket-A
> consumers (wordle coop+compete, psychicnum / connections / spellingbee /
> stackdown coop) now use the extracted `common/hooks/useGlobalFeedback.ts`,
> which **gates before seeding** (`if (!enabled) return` before the ref
> bootstrap) — so the backlog seeds from the real, populated first-load batch.
> The wordle backlog-replay and the psychicnum/connections dropped-first-guess
> bugs are both gone; verified by 7 regression tests in `useGlobalFeedback.test.ts`
> and by grep (the old `seenGuessesRef` / `guesses.length === 0`-before-seed
> stencils no longer exist). See [§4.1](#41-usepeereventfeedback--kills-the-11-bug).
> *Original finding preserved below for the record.*

Four capture/coop games narrate peer moves by diffing incoming rows against a
"seen" ref, seeding the ref silently on first load so history isn't replayed.
There are **three variants of this pattern and the seed timing is wrong in two
of them, in opposite directions.** This is both a correctness cluster and the
single best extraction target (see [§4.1](#41-usepeereventfeedback--kills-the-11-bug)).

- **[confirmed] wordle replays the entire coop guess backlog on load/remount.**
  `src/wordle/components/PlayArea.tsx:231` — `seenGuessesRef` seeds via
  `new Set(guesses.map(key))` the first time the effect runs, but `useGame`
  starts `guesses` at `[]` and fills it async, so the seed runs while `guesses`
  is still `[]` (seeds *empty*, returns). When the load resolves, the ref is
  non-null-but-empty and the loop fires a header pill for **every** backlog
  guess. `PauseBoundary` unmounts/remounts the PlayArea on every
  presence-pause/resume, and deep-linking into an in-progress coop game does the
  same, so this replays "teammate guessed CRANE / SLATE / …" bursts routinely.
  The sibling `announceOpponentSolve` (`:270`) is correct because it gates
  `if (game?.mode !== 'compete') return` **before** the null-seed.
  *Fix:* gate before seeding (`if (!game) return` at the top) — on the commit
  where `game` first becomes non-null, `guesses` is populated in the same
  setState batch, so the seed captures the real backlog.

- **[likely] psychicnum & connections silently drop the *first* peer guess of a
  fresh game.** `src/psychicnum/components/PlayArea.tsx:152` and the identical
  `src/connections/components/PlayArea.tsx:188` do `if (guesses.length === 0)
  return` *before* seeding, so in a fresh game (both players start empty) the ref
  stays `null` until the peer's first guess arrives — which then gets adopted as
  "seen" and **not announced**. Every later guess is fine; only the first is
  dropped. *Fix:* seed on the `loading → loaded` transition regardless of
  `guesses.length`.

- **Correct reference implementations:** `stackdown/hooks/usePeerFeedback.ts:64`
  and `spellingbee/hooks/usePeerFeedback.ts` both gate
  `if (loading || mode !== 'coop') return` before a `ready`-ref bootstrap, seed
  from the real backlog, and never replay on reconnect. These are the shape the
  other three should converge on.

### 1.2 codenamesduet: a rejected clue wipes the giver's typed word + count

**[confirmed — UX/state-loss]** `src/codenamesduet/components/PlayArea.tsx:368`.
The `belowBoard` slot renders the error flash *in place of* `<CluePanel>`, and
the `ClueForm` draft (`word`, `count`) lives as local state inside `CluePanel`.
On a server rejection, `flashAction('bad', …)` swaps the panel out for ~1.4s
then remounts it with **empty inputs** — the giver retypes the whole clue to fix
a typo. psychicnum/connections avoid this by rendering own-result pills *inside*
their entry row so the draft survives. *Fix:* pass an `errorText`/`pill` prop
into `CluePanel` (mirroring how psychicnum passes `pill` to `EntryRow`), or lift
the draft into `PlayArea`.

### 1.3 spellingbee: displayed rank threshold drifts from the real win-check

**[likely — display-only]** `src/spellingbee/lib/ranks.ts:47`. `rankPoints`
computes the "needs N pts" label via `Math.ceil(rankThreshold(i) * total)` in
IEEE-754 floats, while `currentRankIndex` and the SQL `_rank_idx` win-check both
use integer math — the file's own docstring says to keep them "in lockstep."
They disagree at boundary totals: at `total=108, i=5` (Amazing),
`0.5833… * 108 = 63.00000000000001 → ceil = 64`, but the bar fills Amazing and
the compete race is won at **63**. 34 totals in 1–2000 mismatch (all at the
Amazing tier). Gameplay and the bar fill are correct; only the printed tooltip
is off by one. *Fix:* integer math — `Math.ceil((i * 7 * total) / 60)`.

### 1.4 Smells (work today; worth a note)

- **[smell] scrabble compete: realtime-beats-RPC race mis-attributes my move.**
  `src/scrabble/components/PlayArea.tsx:266` + `:505`. `lastActionRef` is set only
  *after* `await db.rpc('play_word')` returns; if the postgres_changes refetch
  bumps `game.version` during that await, the version effect takes the opponent
  branch, flashes a spurious "conflict" pill, and leaks `lastActionRef` into the
  *next* (real opponent) bump → one wrong rack reorder. Low-likelihood (RPC
  usually returns first); coop unaffected. *Fix:* set `lastActionRef`/
  `pendingDrawRef` optimistically *before* the await, rolling back on reject.
- **[smell] bananagrams snapshot-on-unmount vs remount reload race.**
  `src/bananagrams/components/PlayerBoard.tsx:194`. The unmount `save_player_board`
  is fire-and-forget (not awaited) while the remount SELECT fires immediately, so
  a fast pause→resume can read a board stale by up to one 800ms debounce window
  and discard the last placements. Inherent to the FE-owns-board design and
  documented as acceptable — but it *is* a real lost-write window; note it in the
  game doc if not already there.
- **[smell] codenamesduet `handleGuess` has no in-flight guard** (`:251`) — unlike
  connections (`if (submitting) return`); a fast double-click fires `submit_guess`
  twice. Add `if (pendingPos !== null) return`.
- **[smell] boggle required-word double-submit** (`:133`) — the dup guard reads
  `foundWords` (only updated on refetch) and the path sets no `submitting` flag,
  so a double-tap shows two "+N" successes then the raw unique-violation error.
  Also a fulfilment-only `.then` leaves a network reject unhandled.
- **[smell] connections subscription effect over-deps on `session.user.id`**
  (`src/connections/hooks/useGame.ts:287`) — the id isn't read in the effect body;
  a token refresh needlessly tears down and rebuilds the stable-named broadcast
  room. Tighten to `[applySelection, gameId]`.
- **[smell] codenamesduet duplicate peer-key fetch** (`useBoard.ts`) — `load`
  already selects `key_card_a/b`; a separate `loadPeerKey` re-fetches the same row
  for the terminal reveal. One redundant round-trip.

### 1.5 Server-side, flagged not fixed (out of FE scope)

- **wordle coop `submit_guess`** computes `guess_index = shared_count + 1`; two
  truly-simultaneous coop submissions could insert two rows at the same index
  under different `user_id`s, and the FE would render two rows at one index. Lives
  in the RPC.
- **The Wordle/Waffle duplicate-letter green/yellow accounting** was the named
  prime suspect but lives in SQL, not TS. `wordle.compute_colors` was read
  directly and does the correct two-pass algorithm (greens first, a per-letter
  pool for yellows). The TS `wordle/lib/colors.ts` / `waffle/lib/waffle.ts` only
  map an already-computed code to a class. The **waffle** SQL mirror
  (`_wordle_colors` in the waffle migration) was not read — highest-value SQL to
  double-check if you want parity confirmed.

### 1.6 Verified-correct (checked closely, no bug)

scrabble scoring/premiums/blanks/bingo/opening-play; boggle solver + trace +
Qu/multiface/blank handling + score ladder; waffle `minSwaps` cycle-decomposition
+ solution assembly; stackdown no-trap invariant; connections `oneAway`; the
`common/lib/gridCursor` crossword math; bananagrams multiset/hand derivation +
bag validation; the spellingbee/boggle found-word dedup (earliest `found_at`,
found shadows reveal); codenamesduet outcome precedence + phase gating;
`memberColor` hash bounding; the shared hook machinery (`useCommonGame`
lifecycle, `useRealtimeRefetch` channel dedup, `useGameTimer` triple-guarded
timeout fire, `useTerminalModal` single-pop, `useResultFlash` cleanup); hook
ordering (all hooks before early returns in every PlayArea); ESLint `react-hooks`
is clean (0 warnings; the 4 inline disables are all justified).

**Low-confidence port note:** `src/boggle/lib/dice.ts` `5-orig` lists `DHHLOR`
twice — plausibly a real Big Boggle die, but worth a glance against upstream
`wsboggle/dice.py` per the verify-port-deviations prior.

---

## 2. Dead CSS

**9 genuinely dead items (high confidence), 0 orphaned files.** Safe to delete:

| item | location |
|---|---|
| `.commitPill` class | `scrabble/components/PlayArea.module.css:185` (name-collides with a local `const commitPill`, never applied) |
| `.cardList` | `common/theme.css:418` |
| `.divider` (global util) | `common/theme.css:424` (⚠ distinct from the live `Menu.module.css` `.divider` — confirm before deleting) |
| `.home-footer` | `common/theme.css:442` |
| `.dot-separator` | `common/theme.css:449` |
| `--color-error-soft-text` | `common/theme.css:48` |
| `--codenamesduet-assassin-soft-dim` | `codenamesduet/theme.css:40` |
| `--boggle-accent` | `boggle/theme.css:10` |
| `--stackdown-felt` | `stackdown/theme.css:8` |

**Confirm intent before deleting (palette-ramp completeness):** `--tile-4-border`,
`--tile-5`, `--tile-5-border` (`common/theme.css:178–179`) have no current
reference but complete a deliberate `--tile-1..5` + `-border` ramp whose comment
says a future theme supplies a new ramp. Not mechanical — ask.

**Do NOT delete (dynamically constructed — verified live):** `outcome_won/lost`
(`shared[\`outcome_${tone}\`]`), `barInner_*` (`styles[\`barInner_${outcome}\`]`),
Calendar `day_*`, the six `--color-member-*` (built via
`var(--color-member-${name})`, guarded by `cssTokens.test.ts`), and `--tile-4`
(stackdown depth ramp reaches index 4).

---

## 3. CSS consistency & duplication

The convergence largely succeeded; the drift is concentrated in four seams.
Ranked by leverage.

### 3.1 The `.belowBoard` slot — collapse + tokenize the height *(highest leverage)*

> **◐ MOSTLY DONE — feedback refactor stage 4 (`67f566c`).** The slot structure
> is now shared: `.belowBoard` (region) > `.moveArea` + `.localFeedback` +
> `.moveAreaOrLocalFeedback` (swap box) live in `common/components/PlayArea.module.css`,
> with the reserved height as tokens — `--local-feedback-min-height` /
> `--swap-box-min-height` (both default `2.75rem`), games overriding only where
> genuinely taller (codenamesduet `3rem`, scrabble `3.4rem`, bananagrams `2.5rem`).
> The three-way *accidental* drift is gone. **Still open:** the second paragraph
> below — the per-game `--avail-h` chrome-subtraction (`- 5rem` / `- 4.4rem` /
> `- 8.5rem` / `- 3.5rem`) is still hand-synced and NOT derived from the slot token.

The below-board local-feedback/entry slot is re-authored per game with the same
column-flex body, and its reserved height (which keeps the board from reflowing
when the pill swaps in) has drifted to **three values**:

- `2.75rem` — psychicnum:35, spellingbee:57, boggle:99, waffle:32, connections
  `.inputRow`:177 *(majority)*
- `3rem` — codenamesduet:44
- `3.4rem` — scrabble:59

boggle's and spellingbee's own comments cross-reference psychicnum, confirming
they're copies. *Recommend:* promote a shared `.belowBoard` (column flex +
centered + a `--belowboard-min-height` token defaulting to `2.75rem`) into
`common/components/PlayArea.module.css`; games keep only the genuinely-per-game
`width`/`margin-top`; scrabble/codenamesduet override the token only if their
taller controls truly need it. This is the same "promote when it recurs" move
already done for `.localFeedback`.

Related fragility: each square/height-bound game hardcodes a different
`--avail-h` chrome subtraction (`- 5rem`, `- 4.4rem`, `- 8.5rem`, `- 3.5rem`)
kept in sync with the slot height *by hand* (the comments say so). Deriving
`--avail-h` from the same token removes the manual-sync footgun.

### 3.2 The hug-board sizing formula — extract the arithmetic, keep the behavior

The rectangular hug width formula is **byte-identical** in four games
(`psychicnum/WordBoard.module.css:52`, `connections/PlayArea.module.css:76`,
`codenamesduet/BoardGrid.module.css:63`, `wordle/WordleGrid.module.css:28`):

```css
width: min(var(--avail-w),
  calc(var(--cols) * var(--max-tile-width) + (var(--cols) - 1) * var(--grid-gap)));
```

The square `--side` variant is likewise duplicated across waffle/boggle/scrabble/
stackdown. `docs/ui.md` deliberately keeps the *grid fill behavior* per-game
(psychicnum grows tiles; connections fixes their height) — but that lives in
`flex`/`grid-template-rows`, **not** in this width arithmetic, which is pure
boilerplate. *Recommend:* two shared helpers (`.hugWidthRect` / `.hugSquare`)
that read the per-game `--cols`/`--max-tile-*`/`--grid-gap` tokens; each game
composes one and keeps its own fill behavior.

### 3.3 Literal values that duplicate existing tokens

- **[high] Drag-drop placement green/red is an un-named shared token.** scrabble
  (`Board.module.css:60`) and bananagrams (`PlayerBoard.module.css:110,304`) both
  use `rgb(120,200,130)` valid / `rgb(210,110,110)` invalid, differing only in
  alpha, for the identical semantic. *Recommend:* `--color-drop-ok`/`--color-drop-no`
  in `common/`.
- **[med] Literal radii equal to tokens.** `4px`(=`--radius-sm`), `6px`(=`--radius-md`),
  `8px`(=`--radius-lg`) recur across ~12 sites (scrabble, wordle, codenamesduet,
  bananagrams, boggle, waffle). Mechanical sweep onto the tokens; leave the
  sub-grain `2px`/`3px` micro-radii and boggle's tuned `12px` tray.
- **[med] scrabble score green is a near-miss drift.** `PlayLog.module.css:27`
  `#2e7d52` vs the app's `--color-outcome-won-strong: #2e7d32` (differs only in the
  blue channel) — textbook accidental drift. Use the token unless the teal-lean is
  deliberate.
- **[low] tile shadow / popover elevation drift.** bananagrams tile shadow
  `rgba(0,0,0,0.2)` vs `--tile-shadow`'s `0.18`; `0 8px 24px rgba(0,0,0,0.18)`
  recurs in DefinitionPopover/Menu with a `0.12` variant in FloatingPanel — a
  de-facto `--shadow-popover`. Low urgency (all in `common/`).

### 3.4 Small shared behaviors re-authored

- **Click-to-define affordance** — `scrabble/PlayLog.module.css:38` and
  `stackdown/FoundWords.module.css:6` have byte-identical `.clickable`
  (`cursor:pointer; hover→underline`); `WordList.module.css:103` does the same a
  third way. *Recommend:* one shared `.definable`.
- **Turn-log word emphasis** — codenamesduet/connections/scrabble/waffle each
  re-declare `font-weight:700` + `letter-spacing` that shared `turnLog.primary`
  already provides (with 0.03 vs 0.04 drift). *Recommend:* compose it, keep only
  the color delta.

### 3.5 Per-game `theme.css` — generally healthy

8/10 are small and correctly scoped to game vocabulary (the `--boggle-tile:
var(--tile-3)` aliasing pattern is the intended one — leave it). Two low nits to
*confirm intent*: bananagrams `--mg-cursor: #4aa3ff` is generic chrome (zoom
slider/icons) using a different blue from `--color-accent` — probably should just
be the accent; stackdown `--stackdown-tile-ink: #2a2a2a` is an off-near-black
that could alias `--tile-text` (bananagrams' warm ink is deliberate — leave).
The many game-vocabulary color tokens (spellingbee hex, scrabble premiums,
codenamesduet roles, boggle accent) are protected by the two-vocabularies rule —
**do not collapse.**

---

## 4. Component / hook decomposition

The shared surface is right; these are **sharp, small extractions**, not a new
abstraction. Ranked by payoff. (The full agent report has ~14 items; the
high-value ones are here.)

### 4.1 `usePeerEventFeedback` — kills the §1.1 bug

> **✅ RESOLVED (`9b311aa`).** Shipped as **`common/hooks/useGlobalFeedback.ts`**
> `{ enabled, items, keyOf, messageFor, globalFeedback }` — the two refs +
> gate-before-seed bootstrap live there once. Both per-game
> `usePeerFeedback.ts` hooks (spellingbee, stackdown) were **deleted**, and the
> three inlined stencils (psychicnum, connections, wordle) migrated onto it.
> As predicted, spellingbee's compete rank-threshold effect stays hand-rolled
> (it's a delta detector, not a seen-set). *Original recommendation below.*

Consolidate the seen-set bootstrap: `spellingbee/hooks/usePeerFeedback.ts` +
`stackdown/hooks/usePeerFeedback.ts` share a bug-prone skeleton (seen-Set ref +
ready ref + bootstrap-and-bail + skip-seen/self loop), and three PlayAreas
(psychicnum, connections, wordle) inline the *same* stencil — two of them with
the §1.1 bug. A `common/hooks/usePeerEventFeedback.ts`:

```ts
usePeerEventFeedback({ enabled, items, keyOf, isSelf, onPeerItem })
```

owns the two refs + correct bootstrap; consumers keep only `keyOf` + the pill
body. Modest LOC savings but the real win is **fixing three bugs by having one
correct implementation.** Leave spellingbee's compete rank-threshold effect
hand-rolled (it's a delta detector, a genuinely different mechanism). **Do this
first — it's where correctness and decomposition converge.**

### 4.2 Mechanical PlayArea boilerplate (safe, ~345 lines across 10 games)

Each verified as near-identical in most/all PlayAreas; a normalization pass:

- **`timerLabel()`** — verbatim copy in 9 PlayAreas → `common/lib/timerLabel.ts`
  (~80 lines). Several copies even comment that they're copies.
- **`<TerminalModal over isTerminal onBackToClub>`** — the identical
  `useTerminalModal` + guarded `<GameOverModal>` tail in 10/10 → one line each
  (~70 lines); also removes the "call the hook before early returns" footgun.
- **`<InfoActionRow>`** — the `over ? (outcome line + BackToClub) : (buttons)`
  swap with `shared[\`outcome_${tone}\`]` in 10/10 (~90 lines); folds in
  stackdown's lone `over.status`-drifter and single-sources the `outcome_${tone}`
  contract.
- **`<EndOrConcedeButton compete>`** — the `isCompete ? Concede : End` ternary in
  7 games; **and see [§5 GAP 2](#5-cross-game-feature-gaps)** — spellingbee is
  wrong here.
- **`<SetupDisclosure>`** — the `<details><summary>Setup options</summary>`
  wrapper is structurally identical in 10/10.
- Prerequisite: normalize every `buildOver()` onto the single `TerminalCopy` type
  (9/10 already import it; spellingbee/stackdown drift the field names).

### 4.3 Convert scrabble + stackdown `useGame` to `useRealtimeRefetch`

Both hand-roll the Pattern-A subscription shape (dedup-suffixed channel → `.on`
loop → SUBSCRIBED-refetch → `removeChannel`) **while having no Broadcast** — the
exact thing the tested factory absorbs; both docstrings admit the shell is
vestigial (stackdown lost its Broadcast in the s16 private-word refactor). Local
reducer state stays put. ~35–40 lines + replaces two untested copies of the
StrictMode-dedup logic. **Do NOT touch connections** (justified Pattern B —
selection Broadcast on a stable-name channel).

### 4.4 `<SelectField>` — fixes live CSS drift

Four native `<select>`s live outside `DifficultyField` (boggle ×2, wordle,
psychicnum) and their CSS has **already drifted into three looks** — boggle's
`.select` comment literally says "Mirrors DifficultyField's .field." A shared
`<SelectField>` (with `DifficultyField` reframed as "a SelectField over the
difficulty bands") consolidates all four and deletes the drifted copies. ~60–70
lines and it fixes a real consistency bug.

### 4.5 Smaller extractions

- **`<RadioRow>`** — the `options.map(<label><input radio>)` group is byte-identical
  in 7 setup forms (`renderLabel` covers waffle's `(+N)` suffix). Reuses existing
  `.radioRow`/`.radio` CSS.
- **`<TurnLogActor>`** — the `<td className={who}><ActorTag …/></td>` who-column
  recurs in all 5 GameTurnLogs + scrabble PlayLog + stackdown FoundWords;
  psychicnum already wrapped it locally (`whoCell`) — evidence it wants to be
  shared.
- **`useFlash()`** — the identical green/yellow/red `setTimeout` flash effect
  appears 3× in scrabble and 2× in stackdown.

### 4.6 Oversized files to decompose (readability)

- **scrabble `PlayArea.tsx` — 875 lines, the top offender.** Server dispatch +
  drag + keyboard + optimistic reconciliation + flash in one component. Extract
  `useBoardCursorKeys` (~120), `useRackBoardDrag`+`lib/rackLayout.ts` (~180),
  `useCommitReconcile` (~40), `useFlash` (§4.5) → ~350–400 lines, input engine
  testable in isolation.
- **bananagrams `PlayerBoard.tsx` — 735 lines.** Never split render from logic.
  Decompose into *bananagrams-local* pieces (`<BananagramsBoard>`, `useZoomArena`,
  `usePlayerBoardPersistence`, `<HandCard>`) — no new common surface (the zoom
  arena / derived-hand / snapshot persistence are genuinely bananagrams-only).
- spellingbee (652): move the ~200-line `buildOver`+RESULT maps to `lib/results.ts`.
  connections (663): inherent complexity — leave.

### 4.7 Anti-recommendations (looks shareable — deliberately keep separate)

No `<PlayAreaShell>` render-prop (the CSS scaffold is the right seam; bananagrams
already delegates its whole shell to `<PlayerBoard>`); no React `<Tile>` component
(the `.tile` CSS is the seam; the 6 non-adopters diverge by design); per-game
GameTurnLog row anatomy stays per-game (the 7 differ substantively); stackdown
`WordEntry`/scrabble `Controls` stay off EntryBox (they don't type words);
connections `useGame` stays hand-rolled (Pattern B).

---

## 5. Cross-game feature gaps

Coverage is strong. Every game has Help, TimerField, pause-on-disconnect,
GameOver modal, and a peer display (codenamesduet excepted by design); every game
has exactly one of {turn log, word list} except bananagrams (deliberately
neither). Genuine gaps, ranked:

- **GAP 1 [high] — boggle is missing live peer-found feedback.** boggle is the
  structural twin of spellingbee (coop shared word list, compete private, both
  render `<WordList>`+`<OpponentStrip>`) but has no "● moth found APPLE" header
  announcement — teammates' finds appear silently. spellingbee and stackdown both
  have `usePeerFeedback`; boggle is the odd one out. *Low–medium effort* — port
  the hook (ideally the §4.1 shared one). boggle already exposes the same
  `foundWords` shape and `ctx.feedback`.
- **GAP 2 [med — verify intent] — spellingbee compete uses whole-table End
  instead of per-player Concede.** `spellingbee/components/PlayArea.tsx:464` uses
  `EndGameButton` in both modes; its `handleEndGame` terminates the race with
  everyone `{won:false}`. That's exactly the whole-table `end_game` that
  bananagrams v3 *retired* for a per-player concede (drop out = a real loss,
  others keep racing). In a timed word-race, one player quitting shouldn't end
  everyone's race. *Low effort* — but confirm it wasn't a deliberate "friends stop
  together" choice.
- **GAP 3 [med] — click-to-define missing on wordle and connections.** 6/10 games
  have it via `useDefinePopover`; wordle (guesses + answer) and connections (16
  real words + revealed categories) are real-word games where players want
  post-game lookups. Needs a non-conflicting attach point since both use
  interactive tiles (wordle's GameTurnLog rows; connections' revealed words).
- **GAP 4 [low] — wordle and bananagrams hand-roll their keyboard guard.**
  *(Corrected: an earlier reviewer claimed wordle uses the shared `useCaptureKeys`
  — verified false.)* `wordle/components/PlayArea.tsx:198` uses `useGlobalKeyHandler`
  and re-implements `useCaptureKeys`' modifier-bail/dismiss/Enter-Backspace-letter
  ordering by hand (its own comments admit the drift: "the EntryBox grabber had
  this exact gap before"). It's box-independent and could adopt `useCaptureKeys`
  directly (~20 lines, inherits Tab-swallow/arrow-recall, can't drift again).
  bananagrams' raw `window` keydown (`PlayerBoard.tsx:420`) genuinely can't use
  the single-token `EntryBox` (crossword cursor) but could ride `useGlobalKeyHandler`
  for drift-proof guarding.

**Deliberate omissions — confirmed from docs, do not re-flag:** bananagrams (no
turn log / no word list / compete-only / desktop-only carve-out); codenamesduet
(coop-only / no OpponentStrip — peer status in the global feedback area / no
DifficultyField / AI clue suggester is a one-off); connections (Calendar picker
instead of DifficultyField); psychicnum (no define — it's a toy slated for
removal); shuffle only where the tile set is permutable; turn-log-XOR-word-list
by design.

---

## Suggested sequencing

1. ~~**`usePeerEventFeedback`** (§4.1) — extract the correct hook, migrate all five
   consumers. Fixes §1.1 (wordle backlog replay + psychicnum/connections
   dropped-first-guess) as a side effect.~~ **✅ DONE (`9b311aa`).**
2. **Correctness one-offs** — §1.2 (codenamesduet clue-draft loss), §1.3
   (spellingbee `rankPoints` integer math), then the §1.4 smells as convenient.
3. ~~The `.belowBoard` slot + token (§3.1)~~ **✅ done (`67f566c`)**; still: the
   `--avail-h` derivation (§3.1 para 2) and the **hug-board formula** (§3.2) —
   the remaining highest-leverage CSS collapses.
4. **Dead-CSS sweep** (§2) — mechanical, after confirming the `--tile-*` ramp and
   the `Menu` `.divider` name-collision.
5. **Token sweep** (§3.3) — drop colors/radii, name `--color-drop-ok/no`.
6. **Mechanical PlayArea boilerplate** (§4.2) after normalizing `buildOver`→
   `TerminalCopy`; then `<SelectField>` (§4.4, fixes drift), `useRealtimeRefetch`
   conversions (§4.3), `<RadioRow>`/`<TurnLogActor>` (§4.5).
7. **Feature gaps** (§5) — boggle peer feedback (reuses step 1), the End→Concede
   fix, then click-to-define and wordle capture.
8. **Focused decompositions** (§4.6) — scrabble PlayArea, then bananagrams
   PlayerBoard; each its own scoped effort.

## Verification notes

Findings were produced by six parallel reviewers and cross-checked against
source. Hand-re-verified before writing:

- **wordle key handling** — two reviewers disagreed. Confirmed at
  `wordle/PlayArea.tsx:198`: it uses `useGlobalKeyHandler` (hand-rolled), **not**
  `useCaptureKeys`. §4.7-adjacent claims and GAP 4 reflect the verified truth.
- **wordle coop backlog replay** (§1.1) — confirmed the `seenGuessesRef` seed runs
  while `guesses` is still `[]`; the sibling solve-narration gates correctly.
- **spellingbee `rankPoints`** (§1.3) — confirmed the float `Math.ceil` path and
  the docstring's own "keep in lockstep" note vs the integer SQL win-check.

The correctness and features reviewers each ran the existing test suites / ESLint
(433 logic tests pass; `react-hooks` clean). CSS/dead-code findings are grep-proven.
