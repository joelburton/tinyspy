# Docs cleanup punch list

A worked audit (2026-07-10) of CLAUDE.md + docs/*.md + docs/games/*.md found the
conflicts, duplication, staleness, and residue below. This file is the execution
punch list — work through it phase by phase, checking items off (`[x]`) as you go.
Delete this file when everything is done.

> **STATUS (2026-07-10): ALL PHASES A–G ARE COMPLETE.** A–F were committed as
> `7218f7e`; Phase G (this reorg) is done in the working tree. Phase F is a no-op
> (`states-audit.md` untouched). **This file can now be deleted.**
>
> Phase G outcomes: `common-layout.md`→`common-folders.md`;
> `playarea-decomposition.md`→**`playarea.md`** (now THE play-surface doc,
> absorbing ui.md's §PlayArea layout / Info-column readouts / Text entry / Turn
> log / Turn-history viewer / Board sizing; tiles stayed in ui.md as visual
> language); `design-decisions.md` **retired to a redirect stub** (unique rules
> merged into ui.md/playarea.md; Reconciliation items 2/3/5 verified done in
> code). **Docs-only leftover:** ~30 `src/` code comments still cite
> `design-decisions.md → X` — not edited (docs-only task); they resolve via the
> stub's mapping table. Also from A–F: scrabble suggester/opponent are now
> §11/§12; boggle "Deferred/future" is now §11.

## Ground rules (read first)

- **Verify before editing.** Every claim below was verified against the code on
  2026-07-10, but re-verify with grep/Read before changing a doc — line numbers
  are approximate and may have drifted.
- **Docs follow code, never the reverse.** When a doc contradicts the code, fix
  the doc to describe current reality. Do NOT change code to match a doc. The two
  exceptions are the "bug candidates" in Phase F — those get *recorded* in
  deferred.md, not fixed.
- **This is a docs-only task.** No source, migration, or test edits.
- **Brief pointers beat re-explanations.** A game doc mentions a common feature in
  one game-specific sentence + a link to the common doc. Keep CLAUDE.md's
  educational tone — the docs should still teach *why*.
- **No history.** Per CLAUDE.md: "how it used to work" is not useful. When
  trimming residue, keep any genuine lesson ("we tried X, it failed because Y")
  only if it guards against repeating the mistake; drop pure changelog.
- **Don't create a git branch; don't commit unless Joel asks.** Leave the working
  tree for him to review. Note: CLAUDE.md already has uncommitted edits — edit
  the working-tree version, don't revert it.
- **`docs/states-audit.md` is OFF LIMITS.** It's brand-new material for Joel's
  next sprint. Do not edit, trim, move, rename, extract from, or link-fix it in
  any way, and don't act on its contents (its bug findings are his to triage).
- Work one phase at a time; phases are ordered so earlier ones don't invalidate
  later ones.

---

## Phase A — flat contradictions (doc says X, code/other-doc says not-X)

Fix the doc to match the verified fact given.

### Brand names (verified against `src/*/manifest.ts` `const BRAND`)

- [ ] **waffle.md:9-16** — says brand = codename = "waffle" AND that they
  "deliberately diverge" (incoherent). Actual brand: **`SyrupSwap`**
  (`src/waffle/manifest.ts:83`). Same error at ~L326-327 ("the manifest `title`
  is the brand waffle") and ~L409. Rewrite the brand-vs-codename note to name
  SyrupSwap.
- [ ] **wordle.md:3** — "wordle is the user-facing brand". Actual: **`WordNerd`**
  (`src/wordle/manifest.ts:90`).
- [ ] **scrabble.md:9-13** — explains Scrabble-is-trademarked but never names the
  actual brand **`RackAttack`** (`src/scrabble/manifest.ts:89`).
- [ ] **stackdown.md:8-11** — parenthetical "(Unlike waffle/`waffle` and
  wordle/`wordle`, the two happen to be the same word)" is false twice over
  (SyrupSwap, WordNerd). Brand is `StackDown` — the note itself is fine, fix the
  comparison.

### Other doc-vs-code

- [ ] **ui.md:191-217** — "The current theme is dark" + "Light-mode pass
  (planned, not done)". Reality: `src/common/theme.css:310` has
  `color-scheme: light`; the light pass happened. Rewrite the "Theme" intro to
  present tense (light theme, dark deferred as a future user-selectable theme —
  the following "User-selectable themes (deferred)" subsection still holds).
- [ ] **wordle.md:62-67** — title formula says the static string `'wordle'`.
  Actual: `'New game'` (`supabase/migrations/20260625000000_wordle.sql:315-317`,
  with a comment "the brand is shown from the FE manifest, not stored").
- [ ] **pdf.md:148-149** — says crosswords' answer-key generator
  (`generateSolutionPdf`) was "dropped — the FE never holds the shielded
  solution". It was ported: `src/crosswords/pdf/solution.ts` exists, fed by the
  `crosswords.solution_for` RPC. crosswords.md §7 is correct; fix pdf.md.
- [ ] **pdf.md:9 vs deferred.md:113** — pdf.md says six games print (correct,
  incl. crosswords); deferred.md's print item still says five. Fix deferred.md.
- [ ] **scrabble.md:503-521** — turn viewer says "click any Moves-log row /
  navigate by clicking rows". Actual affordance is the `#N` handle
  (`src/scrabble/components/GameTurnLog.tsx` uses `<TurnLogNumber>`), and
  ui.md/playarea-decomposition.md document "NOT the whole row" as the shared
  convention. Fix scrabble.md (and shorten it to a pointer — see Phase C).
- [ ] **boggle.md:341-342** — "Typed only — no click-to-trace." Tap-to-trace
  exists (`src/boggle/components/BoardCol.tsx:104`; mobile.md documents it as
  touch-e2e-verified).
- [ ] **wordle.md:80** and **boggle.md:362** — both claim End game is NOT a
  GamePage menu item. Both games wire End/Concede through `buildGameMenu`
  (`wordle/components/PlayArea.tsx:189-196`, `boggle/components/PlayArea.tsx:210-211`),
  and common.md §Manual end says every game surfaces it in BOTH the action row
  and the menu. Fix both docs.
- [ ] **psychicnum.md:282** — says End shows "both modes" and psychicnum
  "does NOT register a per-game menu item", citing `useEndGameMenu`. That hook
  doesn't exist anywhere in `src/` (verified). Code: compete renders
  `<ConcedeGameButton>` (`src/psychicnum/components/InfoCol.tsx:106-108`) and
  PlayArea registers a menu via `buildGameMenu`
  (`src/psychicnum/components/PlayArea.tsx:129-130`). Also conflicts with
  psychicnum.md:133-134 ("compete: Concede, not End"), which is correct.
- [ ] **spellingbee.md:139** — describes a legacy `setup.mode` fallback "for one
  release of overlap" in `spellingbee-build-board`. Zero `setup.mode` hits in
  `supabase/functions/spellingbee-build-board/index.ts` (verified). Delete the
  claim.
- [ ] **spellingbee.md:526** — pgTAP table's `schema_test.sql` row claims
  "column-grant blocks SELECT of hidden columns, view exposes them conditionally".
  The actual test asserts the opposite ("The word lists are NOT hidden" —
  `supabase/tests/spellingbee/schema_test.sql:16,137-140`), matching the doc's
  own §"The word lists ship to the FE". Fix the table row.
- [ ] **spellingbee.md:60** — outcome-vocab row lists `'lost_compete'` then says
  the port never writes it. Drop `'lost_compete'` from the row.
- [ ] **scrabble.md:124 and :314** — "compete 2–4 players" contradicts §13
  (~L841-843: `min_players` is 1, you can race the AI alone) and the manifest
  (`numberOfPlayers: [1, 4]`). Fix §2.4/§5.1; ALSO add one sentence to
  **common.md's sibling-manifest section** noting scrabble as the exception to
  "a compete manifest declares `[2, max]`" (AI opponent fills the seat).
- [ ] **wordle.md:76** — names `lib/localPill.ts`; the builders were promoted to
  `src/common/lib/game/localPills.ts` (wordle imports `stickyPill` etc. from
  there). Fix the path.
- [ ] **crosswords.md §4 RPC table (~L117-127)** — omits `crosswords.solution_for`
  (migration ~L872), which §7/§9 lean on. Add a row.
- [ ] **common.md:549** — "no E2E in this project". There are ~36 specs in `e2e/`
  + `npm run test:e2e`. Fix (testing.md §E2E is the reference).
- [ ] **common.md:477** — "Psychic-num doesn't [have a theme.css] (deliberately
  styling-free)". `src/psychicnum/theme.css` exists. Fix.
- [ ] **common.md:407** — `GamePageCtx` listed as `{ session, gameId, members,
  playState, isTerminal, timer }`. Read the actual type in
  `src/common/lib/games.ts` (it now carries at least `status`, `feedback`,
  `menu`, `goToClub`, `players`) and update — or replace the inline list with a
  pointer to the type.
- [ ] **README.md:63** — quick start says `db:reset` "seeds the word list". It
  doesn't; `npm run import` is required (cheatsheet.md:19 has it right). Add the
  import step to the quick start.
- [ ] **README.md:85,111 + cheatsheet.md:23** — deploy description omits the
  `boggle:wordlist && scrabble:wordlist` prebuild steps (see `package.json`
  `deploy`). Fix both.
- [ ] **testing.md:37-38 vs :206-229** — "What we don't test" still lists
  Playwright E2E as a deliberate gap while §"E2E smoke tests" documents the
  existing suite. Remove/replace the stale bullet.
- [ ] **cheatsheet.md:114 vs testing.md:134** — `throws_ok` message matching:
  cheatsheet says substring; testing.md says EXACT (correct — use `throws_like`
  for partial). Fix the cheatsheet.
- [ ] **common-layout.md:118** — says `common/lib/games.ts` is "the game REGISTRY
  (manifests + GameManifest type)". Wrong: manifests live in `src/games.ts` (the
  ONE file allowed to import games — common.md:14); `common/lib/games.ts` holds
  the `GameManifest` type + helpers (`MODE_LABEL`, `playerCountFits`,
  `GamePageCtx`). As written it describes a layering violation. Fix the comment
  line in the tree.

---

## Phase B — the ten→eleven sweep (stale counts + "future" framing)

Crosswords shipped; eleven games are live, all v3. One mechanical pass:

- [ ] **CLAUDE.md:~97** — "ten are live today" + game list omits crosswords.
  (Note: CLAUDE.md has uncommitted edits — edit the working-tree version.)
  Also soften "Most upcoming games are ports" framing if the queue is empty.
- [ ] **CLAUDE.md doc table** — add rows for `docs/features.md` and
  `docs/design-decisions.md` (or, if Phase G retires design-decisions.md first,
  just features.md). Update the pdf.md row: it says "two body families"; pdf.md
  now documents three (crosswords' ported printer) + the `wordListBody.ts`
  module. Update "codenamesduet's clue suggester is the current example" — AI
  features now include scrabble's suggester + opponent and crosswords'
  clue explainer.
- [ ] **README.md:5,150** — "Crosswords and other games slot in next" /
  "Ten games are live" → eleven, crosswords live. Directory sketch (~L38-39)
  omits `crosswords/`.
- [ ] **ui.md** — three "all ten games" claims: §PlayArea layout ("all ten games
  are on it"), §Text entry local-feedback paragraph ("All ten games share
  this"), §Button iconography Rollout ("all ten games are v3") → eleven.
- [ ] **design-decisions.md:10-31** — "all ten games are v3"; crosswords missing
  from the v3 roster (it IS listed later as a layout exception). *Skip if
  Phase G retires this file — but carry the fix into the merged text.*
- [ ] **naming.md** — the worst offender (it's the orientation glossary):
  brand table (~L47-55) lacks crosswords/CrossPlay; codename list (~L44) lacks
  crosswords; gametype examples (~L23, ~L250) stop at scrabble_compete (add
  boggle_*/crosswords_*); "future boggle" / "a hypothetical boggle" (~L13, 87,
  94) and "future crosswords" (~L88) → present tense.
- [ ] **states.md:50** — "spellingbee's eventual compete variant will follow…
  connections's compete will use 'solved_compete'" → both shipped; present
  tense.
- [ ] **testing.md:152-175** — "Per-gametype test setup (future)" +
  "codenamesduet has one… psychicnum below threshold". Nine games have
  `supabase/tests/<game>/setup.psql`. Rewrite as the established norm.
- [ ] **code-conventions.md:290** — "~7–8 games" stated as current fact → match
  CLAUDE.md's "original target, exceeded" framing. **:79-86** — baseline
  migration listing stops at bananagrams (6 of 12); either complete it or make
  it explicitly illustrative ("e.g."). **:103** — "the three open-N games
  (connections, psychicnum, spellingbee)" — the open-N set is most of the
  roster now.
- [ ] **connections.md:477** — pause rollout list frozen at 6 gametypes (21
  registered). Replace the enumeration with "every registered gametype".
- [ ] **psychicnum.md:3** — "connections and spellingbee will follow" → they did,
  plus six more families. **:69** — "slated for removal after beta — once the
  roster has filled in" — the condition is met; reword to reflect whatever is
  true now (still slated? ask Joel only if the sentence must change meaning;
  otherwise just drop the stale condition).
- [ ] **common.md:499** — word list "shared by every word game (spellingbee
  today; Boggle, bananagrams…, crosswords later)" → all live.
- [ ] **connections.md:58** — literal placeholder link
  `https://github.com/joelburton/...`. Fix or drop.
- [ ] **connections.md:75** — scratchpad "tracked under common/architecture" as
  deferred → it's a built common opt-in feature (`GameManifest.scratchpad`);
  connections just hasn't opted in. Reword.
- [ ] Roster ordinals — "the seventh registered gametype" (wordle.md:3), "the
  9th" (scrabble.md:20), "the 10th" (boggle.md:19): delete (build-order trivia).
- [ ] **ui.md §Explicitly deferred** — the "promote `.board`/`.grid` into shared
  PlayArea.module.css… defer until a structurally different board exists" item:
  the condition has been met (scrabble/boggle/crosswords). Don't do the
  promotion — just update the item to say the condition is met and it's now a
  judgment call (or move it to deferred.md).

---

## Phase C — canonical-home moves + dedup

Principle: each concept has ONE canonical write-up; everything else is a
one-sentence game-specific note + link.

- [ ] **Pause: connections.md:~451-477 → states.md.** The ~27-line
  "Pause (presence-driven + manual)" section (incl. the "Paused vs suspended"
  subsection) duplicates states.md nearly point-for-point. Diff the two; fold
  anything states.md lacks INTO states.md; shrink connections.md to its one
  game-specific fact (selections are cleaned by unmount) + pointer.
- [ ] **Timer: connections.md:~479-495 → common.md §Idle accounting.** Same
  treatment. Then re-point the cross-references: codenamesduet.md:~242 and
  psychicnum.md:~305 say "see connections.md → Timer" — point them at common.md.
- [ ] **Sibling-manifest pattern: canonical = common.md §The sibling-manifest
  pattern.** psychicnum.md:7-27 carries a competing full write-up, and
  connections.md:28 + spellingbee.md:9 call psychicnum.md "the canonical
  write-up". Shrink psychicnum.md to its per-mode specifics + pointer;
  re-point connections/spellingbee at common.md.
- [ ] **`end_game` realtime-touch trick: canonical = common.md §Manual end
  (step 6).** Re-derived at length in codenamesduet.md:~210-218,
  connections.md:~215-223, psychicnum.md:~280-288, spellingbee.md:~252-262.
  Each game doc keeps only "which table it touches" + pointer.
- [ ] **`create_game` common-half narration** — codenamesduet.md:~154,
  connections.md:~182, psychicnum.md:~210 each re-narrate what
  `common.create_game` does (header insert, is_current_view, vacate prior).
  Shrink to pointers at common.md §Game-RPC helpers.
- [ ] **History-viewer mechanics** — shared mechanics (frame/banner/#N
  handle/three exits) are documented in ui.md §Turn-history viewer +
  playarea-decomposition.md. Long re-tellings in stackdown.md:~329-340,
  wordle.md:~76-77, scrabble.md:~503-521 shrink to each game's snapshot
  semantics + pointer. (scrabble's also has the Phase A row-click fix.)
- [ ] **stackdown.md:~228-236** — re-explains the hidden-solution column-grant +
  `security_invoker` view pattern; code-conventions.md owns it. One sentence +
  pointer.
- [ ] **wordle player-picker spec duplicated** — wordle.md:~75 and deferred.md:~54
  each carry the full behavioral spec. Keep the full spec in ONE place
  (wordle.md, since it's shipped behavior) and make deferred.md's
  promote-to-common item point at it.
- [ ] **crosswords compete decision C5 stated three times** — crosswords.md §2
  (~L85-89), crosswords.md §9 (~L367-370), design-decisions.md §Info column
  blockquote. Keep the §9 register entry as canonical; shrink the others to
  pointers. (If Phase G retires design-decisions.md, its copy goes away with the
  merge.)
- [ ] **cheatsheet.md:~86-163** — reproduces testing.md's pgTAP assertion table,
  skeleton, SQLSTATE table, persona list nearly verbatim (this is where the
  `throws_ok` contradiction crept in). Keep the skeleton + copy-paste UUIDs in
  the cheatsheet; replace the assertion-semantics table with a pointer to
  testing.md.
- [ ] **cheatsheet.md npm-script table** — add the real scripts it's missing:
  `test:e2e`, `stackdown:import` (part of the `import` chain), and if easy
  `boggle:wordlist` / `scrabble:selfplay` / `crosswords:*`. Verify against
  package.json.
- [ ] **Rotted doc-index copies** — README.md:~136-146 and naming.md:~284-297
  each carry a stale partial copy of CLAUDE.md's doc table. Reduce both to a
  one-liner pointing at CLAUDE.md's table.
- [ ] **states.md:29** — embeds the bananagrams-specific "has no endGame —
  per-player concede replaced it" exception. Generalize to "a gametype may have
  no endGame" + pointer to bananagrams.md.
- [ ] **Code-splitting sections ×4** — codenamesduet.md:~453, connections.md:~497,
  psychicnum.md:~439, spellingbee.md:~516 are near-identical. Put the pattern
  once (common.md, near the manifest/lazy-PlayArea text) and shrink the four.

---

## Phase D — historical / plan residue (delete or rewrite to present tense)

- [ ] **waffle.md — full present-tense rewrite pass.** Still reads as its scoping
  doc: "build it first" (~L84), "Build this test-first" (~L102-107),
  "Per [Joel, 2026-06-20]" (~L53), "defer" language (~L391-392), and the
  "Decisions (settled 2026-06-21)" meeting log (~L407-421). Keep the design
  rationale; drop the imperative/plan framing and the meeting-log structure.
  (Do together with its Phase A brand fix.)
- [ ] **spellingbee.md §"Schema deltas (vs. the baseline coop-only setup)"
  (~L113-139)** — describes the compete rework as a diff against a baseline that
  no longer exists. Delete; §Schema + §RLS already give the current shape.
  Also ~L155 "It replaced the earlier hidden-wordlist apparatus… All of that is
  gone" — trim the archaeology.
- [ ] **bananagrams.md** — status block (~L3-18) v1→v2→v3 narration; §"From v1
  to v2 — what held, what changed" (~L253-263) retrospective table; §"The UX
  prototype (bananagrams-ui/)" (~L274-289) documents a gitignored throwaway
  (its one durable takeaway — fixed arena beats growing board — is already at
  ~L91-93). Trim all three to present-tense facts.
- [ ] **scrabble.md §11 (~L688-725)** — "Resolved decisions" + "Post-build
  additions" restate §§2-5 in when-it-landed framing. Fold any fact not already
  in §§2-5 into place; delete the rest.
- [ ] **boggle.md §11 (~L439-460)** — same shape, same treatment.
- [ ] **connections.md v3 blockquote (~L287-298)** and **waffle.md equivalent
  (~L308-322)** — conversion changelogs that end by declaring their own doc
  stale ("trust design-decisions.md"). Fix the affected subsections to be
  current, then delete the blockquotes.
- [ ] **crosswords.md dead citations** — "(review M3)", "(M5)", "(M2)",
  "plan decision 7", "the plan's pressure-test", and the amendment-#13
  correction narrative (~L102-104) cite retired docs. Keep the facts; drop the
  dead keys. **wordle.md:51** "(code-review §4.6)" likewise.
- [ ] **stackdown.md:~145-147** — narrates removed code ("`_is_word` was
  removed"). Delete. (KEEP the §2.4 regression story — that one is a genuine
  teaching example.)
- [ ] **codenamesduet.md:~512** — "The prior `labels.ts → labelName` was deleted
  with the turn-log rewrite" — keep the open item, drop the deletion history.

---

## Phase E — deferred.md tidy (verified item-by-item 2026-07-10)

The register's own policy is delete-on-done. Apply it:

- [ ] **Delete 4 items that are DONE in code but unmarked:**
  - L45 username picker — `ClaimHandleScreen` IS the picker (pre-fill, regex,
    collision error); the item describes a pre-claim-flow world.
  - L49 draggable/resizable chat — shipped (`FloatingChat.tsx` on
    `FloatingPanel` + `useDraggablePanel` + persisted rect).
  - L72 surface `status` through GamePageCtx — shipped
    (`src/common/lib/games.ts:87`; spellingbee `buildOver` branches on it).
  - L133 stale e2e fixtures — fixed 2026-07-09 (`e2e/bananagrams.e2e.ts` uses
    `data-x/y` + keyboard; `e2e/boggle.e2e.ts` types via keyboard). If the
    "webkit+firefox installed" note is worth keeping, move it to testing.md.
- [ ] **Delete the 7 struck-through done items still lingering:** L42, L46, L50,
  L53, L102 (currently 9 lines kept "for the record"), plus the two struck items
  in the spellingbee section (L70, L71).
- [ ] **Refresh 2 expired wait-conditions:**
  - L52 `-bg` outcome-token re-audit — "once all ~7 planned games are in" is
    long met; `near-bg`/`current-bg` (theme.css:120,136) have zero callers.
    Reword as actionable-now.
  - L139 cross-game leaderboards — "until we have a second non-toy game" is
    long met. Reword the condition honestly (it's still far-future).
- [ ] **Fix small staleness:** L48's `useCommonGame.ts:466-470` ref (now
  ~475-478); hook paths predating the common reorg (`useCommonGame.ts` →
  `src/common/hooks/game/`).
- [ ] **De-dup dual-listed items** (each currently verbatim in deferred.md AND a
  game doc, so ticking one off requires remembering two places): codenamesduet
  mission-mode + aria-label, connections scheduled-import + rise-and-fade,
  common.md's per-club-stats + auto-propagate, boggle ⦻ scoring. Pick ONE home
  per item — recommended: deferred.md keeps the full entry; the game doc keeps a
  one-line pointer (this is the pattern crosswords.md §9 already uses, in the
  other direction — either direction is fine, just make it one-full-one-pointer).

---

## Phase F — docs/states-audit.md: DO NOT TOUCH

There is no work in this phase. `docs/states-audit.md` is deliberately excluded
from this cleanup — it's fresh material for Joel's next sprint. Leave it exactly
as-is (no edits, no extraction into states.md or game docs, no deferred.md items
sourced from it, no rename/move/delete).

---

## Phase G — FE docs reorganization ⚠️ larger structural change

**Joel has seen this recommendation but strike/adjust if he says otherwise.**
The minimal version is the first two bullets alone (retire design-decisions.md +
the two renames); the ui.md split is the fuller version.

- [ ] **Retire design-decisions.md into ui.md.** All eleven games are v3, so the
  convergence-pass spec's job is done. Before deleting:
  - Merge the rules that live ONLY there into ui.md: the exact info-column order
    (state → opponent strip → actions → help → setup → log) + the
    locally-terminal look; "tone follows the event, not the viewer's stake";
    action-button natural-width + End-vs-Concede; the global/local
    feedback-area terms; the two conversion gotchas; the board/grid/tile/
    belowBoard vocabulary where ui.md doesn't already state it.
  - Audit Reconciliation items 2 (`near` tone), 3 (`variant` repurpose), 5
    (`belowBoard` generalization) against the code; record each as done (drop)
    or still-open (→ deferred.md).
  - Condense the v1→v3 versioning section to a two-line note in ui.md ("v3 =
    this doc; the sweep is complete; bananagrams + crosswords are documented
    layout exceptions").
  - Fix every inbound reference (`grep -rn "design-decisions" docs/ CLAUDE.md
    src/` — ui.md, connections.md, waffle.md, crosswords.md, memory files
    reference it) to point at the merged ui.md sections.
- [ ] **Rename common-layout.md → common-folders.md** ("layout" collides with
  the visual-layout vocabulary). `git mv`, then fix inbound links
  (`grep -rn "common-layout" docs/ CLAUDE.md src/`). Its Phase A registry-claim
  fix rides along.
- [ ] **Rename playarea-decomposition.md → playarea.md** and make it THE
  play-surface doc: move ui.md's play-surface reference sections into it —
  §PlayArea layout, §Info-column readouts, §Text entry (capture), §Turn log,
  §Turn-history viewer, §Board sizing, §Interactive tile states + §The warm tile
  ramp (judgment call: tiles could stay in ui.md as visual language; pick one
  and leave a pointer). ui.md keeps: principles (desktop-first, layout
  stability, page-height), theme/tokens/two-vocabularies, identity disc,
  consistency + GamePage/ClubPage chrome, modals/dialogs/toasts/feedback pill,
  mode pills, iconography. Fix inbound links both ways.
- [ ] **Update CLAUDE.md's doc table** for the new shape, and describe common.md
  as the *architecture* layer (schema/RPCs/RLS/routing/registry) so it stops
  reading as a UI doc. mobile.md stays as-is.

---

## Verification

After each phase: `grep` for the strings you changed to catch missed inbound
references. After Phase G: `npx tsc -b` is irrelevant (docs only) but run
`grep -rn "design-decisions\|common-layout\|playarea-decomposition" docs/
CLAUDE.md src/ e2e/` to confirm no dangling links. Nothing here should touch
code, migrations, or tests.
