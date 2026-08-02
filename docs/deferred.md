# Deferred work

Things we've chosen not to do *yet*, with a reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

## Where an item goes

**This file holds only cross-cutting work** — `common/`, the shell, the theme, tooling, and whole-app design questions.

**A deferral that lives inside one game lives in that game's doc**, under a `## Deferred` heading. Work tends to happen game-by-game, so the item should be in the file you already have open. The sorting key is **which file you'd edit to do the work**, not which game surfaces it: the `WordList` marker ideas below are filed here, not under spellingbee/boggle, because the code is in `common/`.

Two headings, and the distinction matters:

| heading | meaning |
|---|---|
| `## Deferred` | Real work, not done yet. Someone may pick it up. |
| `## Won't do` | **Decided against.** Kept *only* so reviews and future sessions don't re-propose it. Brief — the decision, the date, one line of why. Not a queue. |

Don't put a won't-do under "Deferred," or it reads as a backlog item forever. Games with neither kind of item get neither heading.

When an item gets picked up, delete it. When a new "we'll do this later" decision happens, add it to the right place.

*(A future pass may split `## Deferred` further into "useful now" vs "far-future idea" — game-by-game, when each is next opened.)*

## Per-game registers

Only these games have open items today; the rest have none.

| game | |
|---|---|
| [bananagrams](games/bananagrams.md#deferred) | the peel pill's peer case · won't-do: touch input, replay |
| [boggle](games/boggle.md#11-deferred) | word-list freshness via Storage · dupes-cancel scoring · a "check board" helper |
| [codenamesduet](games/codenamesduet.md#deferred) | PDF print · won't-do: missions, tile `aria-label`s |
| [connections](games/connections.md#deferred) | per-tile match animations · PDF print |
| [crosswords](games/crosswords.md#9-deferred) | the fullest register — ⌥M, `fetch-nyt-range`, NYT dedup, the library picker bound before the bulk import, the scratchpad lock races, standing schema flags, unpinned tests |
| [psychicnum](games/psychicnum.md#wont-do) | won't-do only: anti-spam, a livelier `.infoState` |
| [stackdown](games/stackdown.md#6-deferred) | PDF print |
| [wordiply](games/wordiply.md#10-open-decisions) | §10's item 9 (PDF print). §10 is a build-time *decision log*, not a deferral register — left as-is |
| [wordwheel](games/wordwheel.md#deferred) | the `Letters`/`Wheel` CSS fold (owns the spellingbee pair's ledger) · the ≥15 quality gate · `s`-heavy seeds |

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- **Setup-shape evolution strategy for `clubs_gametypes.default_setup`.** Today's saved-defaults storage is "whatever the per-game `create_game` validates today, persisted verbatim." If a future code change reshapes a setup field — renames it, narrows the value type, drops it, adds a new required field — clubs with a saved default from before the change can land in an unhappy state: their saved blob is missing or wrong, and the dialog seeds the form with stale data. Today the FE merges manifest defaults under the saved blob, so missing fields fill in cleanly; the per-game `create_game` validator rejects malformed shapes loudly on Start (the user re-picks). Removed fields stay in the blob until next save (no harm — extras ignored by validators that accept-extras, or rejected by strict validators with a clear message). Wholesale-renamed fields are the breakage case: the dialog shows defaults for the new field, the stale field is silently dropped on next save. **For now, the simplest policy applies**: per-game `create_game` validates strictly; users land on errors when their saved default is incompatible; they re-pick once and the next save heals the row. When a real setup-evolution event happens, formalize: either (a) gametype-version stamp on the saved blob + per-version up-migration on read, or (b) explicit `default_setup` clear-on-incompatible-change in the migration that ships the shape change. Until then: don't reshape setup fields without thinking about the saved defaults in flight.
- **Auto-propagating a newly-registered gametype to existing clubs** — full entry in [`common.md → Deferred / open`](common.md#deferred--open).
- **Per-club / per-user stats schema** — full entry in [`common.md → Deferred / open`](common.md#deferred--open).
- **Profile column hardening via `common.profiles_public` view.** If profile data ever grows sensitive (real names, email-derived metadata, settings), revoke direct SELECT on `common.profiles` from `authenticated` and expose a view exposing only the safe columns. See the comment on the existing `profiles_select_authenticated` policy in the baseline migration.
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See the inline `// Fragile:` comments at `useCommonGame.ts`.
- **Stable-name Realtime channel reuse on a fast remount.** A fast unmount→remount of a stable-name channel (`game:${gameId}`, the club-presence channels) can, per `@supabase/realtime-js` 2.108.1, hand the new mount a still-tearing-down instance whose `SUBSCRIBED` never fires (StrictMode double-mount; club↔game navigation inside the unsubscribe RTT) — so no presence track / `set_current_view` / postgres-changes until the next reconnect. **Empirically not user-visible today** (StrictMode dev + green cross-client e2e), so deferred; it's timing, not guarantee. Fix direction: await the prior `removeChannel` promise before re-creating a same-name channel (a small module-level teardown registry). The related self-echo comment at `src/common/hooks/game/useCommonGame.ts:475–478` (claims Realtime echoes broadcasts to the sender; the default is `broadcast: { self: false }`, the code works because it applies locally anyway) can be corrected at the same time.
- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See the `// Fragile:` comment at `useSession.ts`.
- **Retire the `-bg` half of the outcome vocabulary with `color-mix`.** `common/theme.css` pairs each outcome tier with a `-border` and a `-bg`; `won-bg`, `lost-bg`, `active-bg` are used by Calendar (and ClubGameCard's delete-confirm pill for `lost-bg`). The open idea is to derive those from the `-border` token via `color-mix` and drop the hand-picked `-bg` values entirely. *(The narrower half of this item is done: `near-bg` was dead — and its comment falsely credited connections's one-away flash, which actually reads `-border` + `-strong` — so it's deleted. `current-bg` stays: it's a deliberate vocabulary-completeness slot, now recorded in `VOCABULARY_COMPLETENESS` in [`src/cssTokens.test.ts`](../src/cssTokens.test.ts), which is where that policy is enforced rather than argued.)*
- **Promote the turn-log "whose guesses" player-picker to `common/`.** wordle's `GameTurnLog` has a small understated header dropdown (via the shared `<TurnLog headerAction>` slot) that switches whose turns the log shows — the full shipped behavior is documented in [wordle.md → GameTurnLog](games/wordle.md). It's **almost certainly not wordle-specific** (most turn-log games will want it), but **don't extract yet** (only one consumer); when a second game wants it, lift the picker + per-player filtering into a shared component/hook (the `headerAction` slot is already shared). Likely **unifies with the WordList "filter dropdown"** under [Wordlist markers](#wordlist-markers-spellingbee--boggle) — the same "per-player select that filters a chronological/alphabetical list" idea on a different surface, with the same post-terminal-only honesty constraint for compete.
- **Member-color borders beyond dots — the `-edge` question.** The paired `--color-member-NAME-border` tokens + the shared `<Dot>` shipped 2026-07-07 (docs/ui.md → Player identity = a colored disc). What's still open: raw member colors also sit directly on the page background in **tile-selection frames** (connections peers), **crosswords peer-cursor frames**, and **chat name labels** — a light-yellow player has the same contrast problem there that the dot border solved. When those bite, decide whether the border token generalizes into an `-edge` ("this color legible against the body background") vocabulary, and whether name labels should switch to the border shade outright.
- **Below-board `--avail-h` chrome-subtraction isn't tokenized** (carried over from the 2026-07-01 review §3.1). The below-board slot *structure* + reserved height were shared/tokenized, but each game still hand-subtracts its own chrome height in the board/`.wrap` `--avail-h` (`- 5rem` / `- 4.4rem` / `- 8.5rem` / `- 3.5rem`) rather than deriving it from the slot token — hand-synced and drift-prone. Derive it from the slot token when convenient. *(A broader CSS pass may re-examine this — flagged so it isn't lost.)*
- **Literal radii → tokenize by *semantic intent*** (2026-07-01 review §3.3 — deferred to Joel). `4px` / `6px` / `8px` recur across ~16 sites equal to `--radius-sm` / `-md` / `-lg`. This is explicitly **NOT a mechanical `4px→-sm` swap** — each site should be tokenized by what it *is* (a card → `lg`, a panel → `md`, a tile → `sm`), a human judgment; leave the sub-grain `2px` / `3px` micro-radii and boggle's tuned `12px` tray. Two related low-priority leftovers noted in the same review: bananagrams `.dumpHot` green is still a literal (a distinct dump-zone-arming affordance), and a de-facto `--shadow-popover` elevation (`0 8px 24px rgba(0,0,0,0.18)` in DefinitionPopover/Menu, a `0.12` variant in FloatingPanel) could be minted.

## Terminal results (whole-app)

The shipped treatment is [`ui.md → Terminal results`](ui.md#terminal-results--the-moment-vs-the-record); these are the pieces of it deliberately left undone.

- **A dramatic LOSS dialog.** `useCelebration` is tone-agnostic ("pop X on the flip"), so the same primitive could carry an inverted moment: dark backdrop instead of confetti, the culprit as the centerpiece, a low sting instead of the tada jingle. The heuristic that decides who gets one: **only when the game authors a dramatic *event*.** codenamesduet's assassin is *the* case — there's a culprit, a moment, a story. Attrition losses (waffle running out of swaps, wordle out of guesses) have none, and stay in the red pill. Not built for any game today; losses are uniformly quiet.
- **Hide-the-solution-on-loss beyond waffle + wordle.** The other hidden-solution games still reveal at terminal regardless of outcome: stackdown's six words, crosswords' grid, connections' unmatched categories, psychicnum's ringed secrets. The argument for extending it is that it protects the replay's value as much as the emotional beat — force-reveal and a second attempt is theater. Each needs the same two pieces waffle/wordle have: an `answerShown`-style gate (won OR explicitly revealed) and a terminal `RevealButton` as the local display toggle. Not applicable to the word-list games (spellingbee, boggle, wordwheel), where "the solution" isn't a single answer.
- ~~**Crosswords replay.**~~ **Decided (2026-07-31): won't do**, joining codenamesduet and bananagrams as a deliberate opt-out. Re-solving a grid whose answers you've just read isn't a do-over, a different line, or an optimization — the three players Restart exists for (ui.md → Restart) all need a puzzle that can surprise you twice, and a crossword can't. Building it would also mean a new `replay_board` RPC, where the other twelve games already had one. Someone who wants a fresh grid mid-game has **Clear board**; someone who wants another puzzle has **New game**, which opens the setup so they can pick one.
- **Keeping a prior attempt's turn log across a replay.** `common.reset_game` wipes the log, which is exactly the artifact the line-explorer wants to compare the new attempt against ("would a different opening have mattered?"). Probably overkill until someone actually asks for the comparison; noted so the cost of replay stays visible.

## Wordlist markers (spellingbee + boggle)

The shared `WordList` (used by both spellingbee and boggle) now leads each row with a **circle marker** carrying finder attribution — a filled ● in the finder's color for found words, a hollow ○ in light grey for post-terminal misses — with the word text itself plain black. Rationale worth keeping: a solid disc is a far better color carrier than thin colored text (bigger area, no legibility/antialiasing fight), which **decouples identity from legibility** and relaxes the member palette — colors no longer have to survive as thin text, only as a ~12px disc. The deferred ideas that fall out of having a marker vocabulary:

- **◐ (U+25D0) "multiple players found this word," in the first-finder's color.** A visual "others got this too" cue. Honesty constraint: compete finds are private mid-game (RLS gates `found_words` to your own rows until terminal), so ◐ can only truthfully appear **post-terminal in compete**, though it could be **live in coop**. Not built — just the marker reserved.
- **⦻ (U+29BB) "scored zero because multiple players found it."** This is the *authentic* Boggle rule (shared words cancel), and boggle compete today deliberately does the **opposite**: the `boggle.found_words` PK is `(game_id, user_id, word)` and dedup is per-player, so two players independently keep the same word and both score it. So ⦻ isn't just a marker — it rides along with an **optional shared-word-cancellation scoring mode** (a scoring-model change in `submit_word` / `_finish`). The marker's value is exactly that it makes the otherwise-confusing paper rule legible. Build only if we add that scoring mode.
- **Filter dropdown on the WordList.** A small select to narrow the displayed words: `all words`, `missed`, `everyone`, `me`, and one entry per other player by username (`moth`, `leah`, …). There are real moments you want to focus — "what did we miss?", "what did Leah get?" — that the full alphabetical wall buries. Pure FE: filters the rows the list already has (found rows + the post-terminal reveal), nothing new from the server. Same honesty constraint as the markers above: `missed` and per-player options only mean anything **post-terminal in compete** (mid-game RLS shows you only your own finds), so the per-player entries should appear only when the data is actually visible (coop, or compete post-terminal). The finder-color circles make the per-player options self-labeling — each name can carry its color dot.

## Feedback channels (local vs group)

The channel-qualified feedback split shipped — **local** feedback is `useLocalFeedback` (a near-input `<GenericFeedbackPill>`, validity tones, never a player color) and **group/peer** feedback is `useGlobalFeedback` → the header `<StatusSlot>` (the actor's color disc), two separate channels so neither clobbers the other. The naming convention (`Global`/`Local`/`Generic`, never bare "feedback") lives in [code-conventions.md](code-conventions.md).

- **One follow-up remains:** unify the *turn-outcome* vocabulary (TurnLog `good` / `bad` / `near` / `neutral` / `partial`) across games — deliberately deferred.

## CSS — looked at and deliberately left

From the 2026-07-13 CSS audit, which was worked to completion and retired (2026-08-01). Its
durable output lives in [`code-conventions.md → CSS Modules + theme`](code-conventions.md#css-modules--theme)
(the CSS checklist + the z-index ladder), [`src/cssTokens.test.ts`](../src/cssTokens.test.ts)
(both token guards + the vocabulary-completeness allowlist), and the per-game docs. These are
the things it examined and decided **not** to change — recorded so a future sweep doesn't
re-file them as findings:

- **Duplication that shouldn't be shared.** The `.loading` / `.empty` shapes (loading is an
  explicitly exempted moment), the dashed empty-slot idiom (three different jobs in three
  games), the bespoke light modals, and the small-caps micro-label (which folds into the
  already-deferred font-size-token item rather than standing alone).
- **Deliberate per-game differences that look like drift.** The square-board `--side` math
  ("NOT identical enough to share", per the scaffold comment), the absence of a shared
  `--info-col-width` default (each game declares its own on purpose), the two-reds
  distinction, the per-game vocabulary palettes, the bananagrams + crosswords layout
  exceptions, and the `.boardCol` debug tint (intentional — keep it).
- **`Letters.module.css` / `Wheel.module.css`** — the spellingbee/wordwheel pair is
  deliberately not folded; the reasoning moved to [`wordwheel.md → Deferred`](games/wordwheel.md#deferred).
- **scrabble's `BlankPicker` at `z-index: 50`** — a full-screen fixed modal below the 500
  panel tier; recorded in the z-index ladder as a known anomaly rather than bumped blind.

## Mobile

Carried over from the 2026-07-10 mobile-FE review (that review doc has since been retired; its live items are these). The design + what shipped are documented in [`mobile.md`](mobile.md); these are the pieces deliberately left, plus two on-device checks still owed.

- **InfoSheet: full dialog behaviour (focus management + tap-outside).** The mobile info-sheet already has the *cheap* half of dialog semantics — the open sheet is a `role="dialog"` + `aria-modal` that **Escape** dismisses, and the closed sheet is `visibility: hidden` so a keyboard user can't Tab into the off-canvas column. **Still deferred:** move focus *into* the sheet when it opens and restore it to the trigger on close, trap Tab within the sheet while open, and dismiss by tapping the backdrop outside it. These are a deliberate cut for a friends-only, touch-first alpha — on a phone you tap the ✕; the only place the rest matters is the supported keyboard-tablet class. Fix direction: a focus ref moved on open/close + an `inert` (or a focus-trap) on the rest of the page while open, and a backdrop element that closes on tap. Lives in [`InfoSheet.tsx`](../src/common/components/game/InfoSheet.tsx).
- **`--phone-l`'s landscape arm catches short *desktop* windows.** `--phone-l` is `(orientation: landscape) and (max-height: 27.5rem)` with **no pointer condition**, and it's OR'd into `--phone`. So a desktop browser window dragged shorter than ~440px (docked half-screen) gets the phone treatment: page padding collapses to `0.25rem`, and — the odd part — every `FloatingPanel` becomes a full-screen sheet via the `!important` geometry override *while staying draggable/resizable in JS* (the drag-disable keys off `--touch`/`pointer: coarse`, which a desktop mouse doesn't match). Dragging then updates react-rnd's inline transform that the CSS immediately overrides — nothing moves, cursors lie. It's a CSS/JS disagreement about "what a phone is": the CSS sheet keys off `--phone` (shape) while the drag-disable keys off `--touch` (pointer). Harmless in practice — **no real device matches phone-l-without-touch; only weird desktop windows do** — which is why it's recorded rather than fixed. Cheapest fix if it ever annoys: add `(pointer: coarse)` to the `--phone-l` arm in **both** [`breakpoints.css`](../src/common/breakpoints.css) **and** [`usePhone.ts`](../src/common/hooks/ui/usePhone.ts) (the hand-synced pair), accepting that this makes `--phone` no longer purely shape-based.
- **Two shipped mobile changes still owe an on-device check** (code-complete; only the real-device verification is outstanding, and neither is reproducible in headless Playwright):
  - **`viewport-fit=cover` safe-area regression sweep.** [`index.html`](../index.html) now sets `viewport-fit=cover` so `env(safe-area-inset-*)` resolves non-zero (FloatingPanel's phone-sheet notch insets were previously inert). With `cover` the browser stops letterboxing, so **every** full-bleed surface owns its own safe-area padding — verify on a notched phone that the game header, club page, toasts, and celebration dialog don't slip under the notch or the home indicator.
  - **`touch-action: manipulation` zoom suppression.** Added to every tap-heavy surface (shared `.tile`, keyboard keys, stackdown tiles, boggle path-tracing, spellingbee hive) to defeat iOS double-tap-to-zoom + the ~300ms tap delay. Confirm on a real iOS device that rapid taps no longer zoom — Playwright's touch synthesis can't reproduce Safari's gesture heuristics.

## Printing to PDF — which games get it

The per-game table (all thirteen, ✅/❌) now leads [`pdf.md`](pdf.md#which-games-print) —
that's the one place to check or update. What's a *decision* rather than a status:

**waffle and wordle are permanently excluded** (a "won't do", not a deferral): both are
turn-by-turn *board progressions* where a single static snapshot can't represent the
game — you'd need a board snapshot per turn for it to mean anything on paper, which a
one-page printout isn't. waffle is a sequence of tile *swaps*, so a lone end-board
doesn't capture the solve; wordle *is* the guess-by-guess progression.

**Still open** (would fit the existing helpers cleanly, no snapshot problem): codenamesduet,
connections, stackdown, wordiply. Each carries the item in its own `## Deferred` section.

## To discuss

- **Leaving "alpha": stop editing baseline migrations, start appending new ones.**
  [`CLAUDE.md`](../CLAUDE.md) names this trigger already — *"prefer editing baseline
  migrations rather than appending a new migration. Once the game is out of alpha stage,
  we'll switch to deployed and will not edit old migration files."* We're approaching it:
  the roster is complete and the remaining known work is FE copy rather than schema.
  Flipping the switch is what ends **trashing the database on every deploy** (`db:reset`
  wipes everything today, which is fine only because nothing is worth keeping).
  **Decide together:** what counts as "out of alpha"; whether the 14 baseline migrations
  get squashed into a clean v1 first or frozen as-is; how `db:reset` + `npm run import` +
  `seed.dev.sql` change for a database that must survive; and whether the friends get one
  last "everything resets" warning before the freeze. Until then, the alpha prior in
  CLAUDE.md still holds — keep editing baselines.

## Tooling

- **pgTAP coverage gaps around the replay RPCs** (2026-07-31 review). Two thin spots left, neither a bug: mid-game restart (as opposed to at-terminal) is asserted only implicitly, and only in scrabble; and a coop `target_rank` carried through a restart is untested in spellingbee/wordwheel (`coop_target_test` never restarts, `restart_test` never sets a coop target), as is an explicit `"target_rank": null` in coop. Worth tightening next time those files are open. *(Two other spots closed 2026-08-02: the non-player rejections now pin `42501` in all ten `replay_test.sql` instead of `NULL, NULL` — which passed on any error — and wordiply gained the dedicated `replay_test.sql` it was missing.)*

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC. The roster is now deep enough that "compare across games" is meaningful — so the blocker isn't the game count any more, it's that nobody's asked for it. Still far-future: the RPC *shape* stays TBD until there's a concrete want (which stat, per-club vs global, achievements vs raw scores).
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
