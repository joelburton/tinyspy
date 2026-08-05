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

**Database-touching items are indexed in [`db-work-2.md`](db-work-2.md)** — a whole-docs sweep (every game's `## Deferred`, not just this file), kept while migrations are still free under the alpha prior. Delete it when it empties.

*(An earlier queue lived in `db-work.md` (deleted) from 2026-08-02 to 2026-08-03,
while the alpha prior made migrations free. It emptied — the solution-reveal
flag shipped, the profile-hardening and `default_setup` items were settled as
standing rules rather than work, and the last pgTAP gaps were closed — so the
file is gone; `db-work-2.md` is its successor with a wider net.)*

*(A future pass may split `## Deferred` further into "useful now" vs "far-future idea" — game-by-game, when each is next opened.)*

## Per-game registers

Only these games have open items today; the rest have none.

| game | |
|---|---|
| [bananagrams](games/bananagrams.md#deferred) | the peel pill's peer case · won't-do: touch input, replay |
| [boggle](games/boggle.md#12-wont-do) | won't-do only: word-list freshness via Storage, a "check board" helper |
| [codenamesduet](games/codenamesduet.md#wont-do) | won't-do only: missions, tile `aria-label`s |
| [connections](games/connections.md#deferred) | per-tile match animations |
| [crosswords](games/crosswords.md#9-deferred) | the fullest register — ⌥M, `fetch-nyt-range`, NYT dedup, the library picker bound before the bulk import, the scratchpad lock races, standing schema flags, unpinned tests |
| [letterboxed](games/letterboxed.md#deferred) | rare-letter seed weighting · won't-do: trimming the seed table (measured — 55 MB against a 500 MB tier) |
| [psychicnum](games/psychicnum.md#wont-do) | won't-do only: anti-spam, a livelier `.infoState` |
| [wordwheel](games/wordwheel.md#deferred) | the `Letters`/`Wheel` CSS fold (owns the spellingbee pair's ledger) · `s`-heavy seeds |

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- ~~**Setup-shape evolution strategy for `clubs_gametypes.default_setup`.**~~ **Decided (2026-08-03): YAGNI.** The saved-defaults blob is stored verbatim, so a *renamed* setup field would silently reset a club's preferences (the dialog shows the new field's default; the stale key is dropped on next save). We're not going to rename one — the roster is complete and the setups are settled — so the versioning machinery it was reserving isn't worth building. If it ever happens, the answer is one line in the same migration that ships the shape change: clear the incompatible `default_setup` rows and let the friends re-pick once. Adds, drops and narrowed types already behave (the FE merges manifest defaults under the blob; strict validators reject loudly on Start and the next save heals the row).
- ~~**Auto-propagating a newly-registered gametype to existing clubs.**~~ **Decided (2026-08-02): won't do.** The roster is complete, so the case that motivated it — a gametype registered after a club exists — is now the rare one, and it already has two answers: the "Edit club" dialog, and a per-game backfill in that game's migration (bananagrams does this). Neither is worth a standing auto-propagation mechanism.
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See the inline `// Fragile:` comments at `useCommonGame.ts`.
- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See the `// Fragile:` comment at `useSession.ts`.
- **Retire the `-bg` half of the outcome vocabulary with `color-mix`.** `common/theme.css` pairs each outcome tier with a `-border` and a `-bg`; `won-bg`, `lost-bg`, `active-bg` are used by Calendar (and ClubGameCard's delete-confirm pill for `lost-bg`). The open idea is to derive those from the `-border` token via `color-mix` and drop the hand-picked `-bg` values entirely. *(The narrower half of this item is done: `near-bg` was dead — and its comment falsely credited connections's one-away flash, which actually reads `-border` + `-strong` — so it's deleted. `current-bg` stays: it's a deliberate vocabulary-completeness slot, now recorded in `VOCABULARY_COMPLETENESS` in [`src/cssTokens.test.ts`](../src/cssTokens.test.ts), which is where that policy is enforced rather than argued.)*
- **Member-color borders beyond dots — the `-edge` question.** The paired `--color-member-NAME-border` tokens + the shared `<Dot>` shipped 2026-07-07 (docs/ui.md → Player identity = a colored disc). What's still open: raw member colors also sit directly on the page background in **tile-selection frames** (connections peers), **crosswords peer-cursor frames**, and **chat name labels** — a light-yellow player has the same contrast problem there that the dot border solved. When those bite, decide whether the border token generalizes into an `-edge` ("this color legible against the body background") vocabulary, and whether name labels should switch to the border shade outright.
- **Below-board `--avail-h` chrome-subtraction isn't tokenized** (carried over from the 2026-07-01 review §3.1). The below-board slot *structure* + reserved height were shared/tokenized, but each game still hand-subtracts its own chrome height in the board/`.wrap` `--avail-h` (`- 5rem` / `- 4.4rem` / `- 8.5rem` / `- 3.5rem`) rather than deriving it from the slot token — hand-synced and drift-prone. Derive it from the slot token when convenient. *(A broader CSS pass may re-examine this — flagged so it isn't lost.)*
- **Literal radii → tokenize by *semantic intent*** (2026-07-01 review §3.3 — deferred to Joel). `4px` / `6px` / `8px` recur across ~16 sites equal to `--radius-sm` / `-md` / `-lg`. This is explicitly **NOT a mechanical `4px→-sm` swap** — each site should be tokenized by what it *is* (a card → `lg`, a panel → `md`, a tile → `sm`), a human judgment; leave the sub-grain `2px` / `3px` micro-radii and boggle's tuned `12px` tray. Two related low-priority leftovers noted in the same review: bananagrams `.dumpHot` green is still a literal (a distinct dump-zone-arming affordance), and a de-facto `--shadow-popover` elevation (`0 8px 24px rgba(0,0,0,0.18)` in DefinitionPopover/Menu, a `0.12` variant in FloatingPanel) could be minted.

## Terminal results (whole-app)

The shipped treatment is [`ui.md → Terminal results`](ui.md#terminal-results--the-moment-vs-the-record); these are the pieces of it deliberately left undone.

- **A dramatic LOSS dialog.** `useCelebration` is tone-agnostic ("pop X on the flip"), so the same primitive could carry an inverted moment: dark backdrop instead of confetti, the culprit as the centerpiece, a low sting instead of the tada jingle. The heuristic that decides who gets one: **only when the game authors a dramatic *event*.** codenamesduet's assassin is *the* case — there's a culprit, a moment, a story. Attrition losses (waffle running out of swaps, wordle out of guesses) have none, and stay in the red pill. Not built for any game today; losses are uniformly quiet.
- ~~**Hide-the-solution-on-loss beyond waffle + wordle.**~~ **Done 2026-08-03** — stackdown, psychicnum, and codenamesduet now gate their reveal, each offering it as a terminal button *and* a menu item; crosswords already did. Shipped with the eye pair (amber bare-eye `SpoilerButton` for one item mid-game, red boxed-eye `RevealButton` for the whole solution at game-over) and, the same day, the common `common.games.solution_revealed` flag + `common.reveal_solution` RPC that all seven hiding games now read (strands arrived with the gate built in) ([common.md → Revealing the solution](common.md#revealing-the-solution)). Deliberately NOT extended to: the word-list games (spellingbee / boggle / wordwheel — "the solution" is a dictionary, and the missed-word list IS the post-game artifact), **connections** and **wordiply** (both hold the answer client-side by explicit architectural decision, so hiding it is theater), and bananagrams / scrabble (no answer to hide). See [ui.md → Terminal results](ui.md#terminal-results--the-moment-vs-the-record) for the two rules that decide the details.
- ~~**Crosswords replay.**~~ **Decided 2026-07-31: won't do — reversed 2026-08-03, and shipped.** The argument against was that a crossword can't surprise you twice once the answers have been read. What that missed is that crosswords already *had* the feature under another name: **Clear board** wiped the fill and kept the grid, i.e. a restart with a different label and one missing power (it couldn't un-terminal a finished puzzle). So the choice wasn't "add a replay" but "keep two names for one act" — see [ui.md → Restart](ui.md#terminal-results--the-moment-vs-the-record). codenamesduet and bananagrams got one the same day, for the reasons recorded there.
- ~~**Keeping a prior attempt's turn log across a replay.**~~ **Decided (2026-08-02): won't do.** `common.reset_game` wipes the log and will keep wiping it. Preserving it means an attempt/generation column on every game's log table plus `reset_game` changes — `common` and all fifteen games — to serve a comparison nobody has asked for. A replay is a fresh attempt, not a diffable branch.

## Wordlist markers (spellingbee + boggle)

The shared `WordList` (used by both spellingbee and boggle) now leads each row with a **circle marker** carrying finder attribution — a filled ● in the finder's color for found words, a hollow ○ in light grey for post-terminal misses — with the word text itself plain black. Rationale worth keeping: a solid disc is a far better color carrier than thin colored text (bigger area, no legibility/antialiasing fight), which **decouples identity from legibility** and relaxes the member palette — colors no longer have to survive as thin text, only as a ~12px disc. The deferred ideas that fall out of having a marker vocabulary:

- **◐ (U+25D0) "multiple players found this word," in the first-finder's color.** A visual "others got this too" cue. Honesty constraint: compete finds are private mid-game (RLS gates `found_words` to your own rows until terminal), so ◐ can only truthfully appear **post-terminal in compete**, though it could be **live in coop**. Not built — just the marker reserved.
- **⦻ (U+29BB) "scored zero because multiple players found it."** Reserved, but it only ever ships with the dupes-cancel scoring mode it labels — which is now a [far-future](#far-future) question, not a queued one.
- ~~**Filter dropdown on the WordList.**~~ **Done 2026-08-04** — shipped as **two** selects rather than one, because the axes are independent: **KIND** (Legal / Required / Bonus) and **WHO** (All / Found / Missed / each player by handle). A single flat list couldn't express "leah's bonus words", and picking `Bonus` would have silently discarded a `leah` selection. `Missed` stayed *inside* the WHO enumeration rather than splitting into a third select — a missed word has no finder, so `Missed × leah` is a contradiction. The honesty constraint held as predicted but landed as *option derivation* instead of wording: an option that would be dishonest simply isn't offered (per-player only in coop or compete-post-terminal; Found/Missed only once a missed row exists), so unlike the turn log's picker there's no "hidden until the game ends" empty line to write. Shipped alongside it: the terminal reveal now covers **both** shipped lists, so missed **bonus** words show too (the interesting-vocabulary payoff), and found rows carry `finderIds` so filtering to yourself can't hide a word someone else found a second earlier. See [playarea.md → Word list](playarea.md#word-list). The per-player options are NOT yet self-labeled with their color dot — a `<select>` can't hold one; that would need a custom listbox, and it isn't worth one here.

## Feedback channels (local vs group)

The channel-qualified feedback split shipped — **local** feedback is `useLocalFeedback` (a near-input `<GenericFeedbackPill>`, validity tones, never a player color) and **group/peer** feedback is `useGlobalFeedback` → the header `<StatusSlot>` (the actor's color disc), two separate channels so neither clobbers the other. The naming convention (`Global`/`Local`/`Generic`, never bare "feedback") lives in [code-conventions.md](code-conventions.md).

- **One follow-up remains:** unify the *turn-outcome* vocabulary across games — deliberately deferred. Concretely, the two channels name the same idea differently: `TurnOutcome` (TurnLog) is `good` / `bad` / `partial` / `neutral`, while the feedback pill's tone vocabulary uses `near` for what the log calls `partial` (connections maps its one-away to `partial`; the pill calls that tone `near`).


## Mobile

Carried over from the 2026-07-10 mobile-FE review (that review doc has since been retired; its live items are these). The design + what shipped are documented in [`mobile.md`](mobile.md); these are the pieces deliberately left, plus two on-device checks still owed.

- **InfoSheet: full dialog behaviour (focus management + tap-outside).** The mobile info-sheet already has the *cheap* half of dialog semantics — the open sheet is a `role="dialog"` + `aria-modal` that **Escape** dismisses, and the closed sheet is `visibility: hidden` so a keyboard user can't Tab into the off-canvas column. **Still deferred:** move focus *into* the sheet when it opens and restore it to the trigger on close, trap Tab within the sheet while open, and dismiss by tapping the backdrop outside it. These are a deliberate cut for a friends-only, touch-first alpha — on a phone you tap the ✕; the only place the rest matters is the supported keyboard-tablet class. Fix direction: a focus ref moved on open/close + an `inert` (or a focus-trap) on the rest of the page while open, and a backdrop element that closes on tap. Lives in [`InfoSheet.tsx`](../src/common/components/game/InfoSheet.tsx).
- **`--phone-l`'s landscape arm catches short *desktop* windows.** `--phone-l` is `(orientation: landscape) and (max-height: 27.5rem)` with **no pointer condition**, and it's OR'd into `--phone`. So a desktop browser window dragged shorter than ~440px (docked half-screen) gets the phone treatment: page padding collapses to `0.25rem`, and — the odd part — every `FloatingPanel` becomes a full-screen sheet via the `!important` geometry override *while staying draggable/resizable in JS* (the drag-disable keys off `--touch`/`pointer: coarse`, which a desktop mouse doesn't match). Dragging then updates react-rnd's inline transform that the CSS immediately overrides — nothing moves, cursors lie. It's a CSS/JS disagreement about "what a phone is": the CSS sheet keys off `--phone` (shape) while the drag-disable keys off `--touch` (pointer). Harmless in practice — **no real device matches phone-l-without-touch; only weird desktop windows do** — which is why it's recorded rather than fixed. Cheapest fix if it ever annoys: add `(pointer: coarse)` to the `--phone-l` arm in **both** [`breakpoints.css`](../src/common/breakpoints.css) **and** [`usePhone.ts`](../src/common/hooks/ui/usePhone.ts) (the hand-synced pair), accepting that this makes `--phone` no longer purely shape-based.
- **Ungated `:hover` on tappable board elements, in three games.** A touchscreen keeps `:hover` on the last-tapped element until you tap somewhere else, so a hover-only style sits there after every move looking like state. strands' tiles had this (a dimmed letter after each submission) and were fixed during its on-device pass by wrapping the rule in `@media (hover: hover)` — the same gate, for the same reason, as the tooltip bubble ([`ui.md`](ui.md) → Tooltips). The same ungated pattern is in [`stackdown/Board.module.css`](../src/stackdown/components/Board.module.css), [`spellingbee/Letters.module.css`](../src/spellingbee/components/Letters.module.css) and [`wordwheel/Wheel.module.css`](../src/wordwheel/components/Wheel.module.css); not touched, because that pass was scoped to strands. Cheap when someone's in there: wrap each rule in the gate and re-check on a phone.
- **The game shell is 1px taller than the viewport on desktop.** Every game page reports `scrollHeight` 901 against a 900px viewport — a scrollbar sliver, and the never-scroll invariant is meant to be absolute. Not a game's doing: the club page is clean, and wordle / waffle / boggle / strands are all identically 1px over. The arithmetic is `--game-chrome-height: 5rem` (80px) against the real chrome, which measures 65px of header + gap plus the 16px of `body` vertical padding = 81px. Left alone because `--game-chrome-height` feeds **every** game's board-sizing formula, so correcting it resizes all fifteen boards and wants its own pass with screenshots rather than a drive-by. Fix direction: either make the constant honest and re-check each game's below-board reserve, or have the shell measure its own chrome.
- **Two shipped mobile changes still owe an on-device check** (code-complete; only the real-device verification is outstanding, and neither is reproducible in headless Playwright):
  - **`viewport-fit=cover` safe-area regression sweep.** [`index.html`](../index.html) now sets `viewport-fit=cover` so `env(safe-area-inset-*)` resolves non-zero (FloatingPanel's phone-sheet notch insets were previously inert). With `cover` the browser stops letterboxing, so **every** full-bleed surface owns its own safe-area padding — verify on a notched phone that the game header, club page, toasts, and celebration dialog don't slip under the notch or the home indicator.
  - **`touch-action: manipulation` zoom suppression.** Added to every tap-heavy surface (shared `.tile`, keyboard keys, stackdown tiles, boggle path-tracing, spellingbee hive) to defeat iOS double-tap-to-zoom + the ~300ms tap delay. Confirm on a real iOS device that rapid taps no longer zoom — Playwright's touch synthesis can't reproduce Safari's gesture heuristics.

## Printing to PDF — which games get it

The per-game table (all fifteen, ✅/❌) now leads [`pdf.md`](pdf.md#which-games-print) —
that's the one place to check or update. What's a *decision* rather than a status:

**Nothing outstanding — all fifteen games print.** waffle and wordle were a
permanent exclusion until 2026-08-02; the 4-state tile encoding
([`pdf.md`](pdf.md#backgrounds-are-white)) removed what actually blocked them, which
was their green/yellow/grey feedback flattening to one grey in mono.

## To discuss

- **Leaving "alpha": stop editing baseline migrations, start appending new ones.**
  [`CLAUDE.md`](../CLAUDE.md) names this trigger already — *"prefer editing baseline
  migrations rather than appending a new migration. Once the game is out of alpha stage,
  we'll switch to deployed and will not edit old migration files."* We're approaching it:
  the roster is complete and the remaining known work is FE copy rather than schema.
  Flipping the switch is what ends **trashing the database on every deploy** (`db-reset`
  wipes everything today, which is fine only because nothing is worth keeping).
  **Settled (2026-08-02): the baselines do NOT get squashed.** They stay one file per
  game plus one for `common`, frozen as-is, and new work appends. A single squashed v1
  would be a wall of SQL you have to read end-to-end to understand how one game works;
  the per-game split is what makes each game's schema, RPCs, and RLS legible in one
  sitting — the same removability property the FE has (docs/common.md).

  **Most of the sting is now gone (2026-08-03): the schema-vs-code split shipped.**
  Each game's SQL is two files — `supabase/migrations/<ts>_<game>.sql` for shape,
  `supabase/sql/<game>.sql` for functions/views/policies/grants — and the second is
  re-applied in full on every deploy, so it is edited in place *forever, alpha or
  not* ([supabase.md → Schema vs code](supabase.md#schema-vs-code)). That's roughly
  two-thirds of each game's SQL by line count. Leaving alpha therefore only changes
  what happens to **shape** changes, which are rare now that the roster is complete.

  **Still to decide together:** what counts as "out of alpha"; how `gmake db-reset` +
  `gmake db-data` + `seed.dev.sql` change for a database that must survive; and
  whether the friends get one last "everything resets" warning before the freeze.
  Until then, the alpha prior in CLAUDE.md still holds — keep editing the schema
  migrations in place too.

## Tooling

- ~~**pgTAP coverage gaps around the replay RPCs**~~ **Closed 2026-08-03.** Mid-game restart is now asserted where it actually bites — scrabble's `version` bump, with a stale-move rejection proving an in-flight client is invalidated — and the coop `target_rank` carry (plus an explicit `null`) is pinned in both spellingbee and wordwheel. The three games that gained a replay the same day arrived with their own `replay_test.sql`.

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Boggle compete "dupes-cancel" scoring.** The *authentic* paper Boggle rule: a word found by more than one player scores zero for everyone. Boggle deliberately does the opposite today — the `boggle.found_words` PK is `(game_id, user_id, word)`, dedup is per-player, so two players who independently find the same word both keep it. **Far future because the question is whether we want the rule at all** (2026-08-03), not how to build it; the build is a scoring change in `submit_word` / `_finish` plus a setup flag, and it's what would license the **⦻ marker** in the shared `WordList` ([Wordlist markers](#wordlist-markers-spellingbee--boggle)). If it's ever picked up, the thing to decide first is the honesty problem: compete finds are private mid-game (RLS scopes `found_words` to you until terminal), so a word can't show as cancelled while you play — you'd see it accepted and watch it zero out at scoring. Either that reveal *is* the fun, or the mode should hide the running score.
- **Per-club / per-user stats schema.** Solo clubs are the planned anchor for per-user stats; the schema isn't built and there's no UI surface. Far future for the same reason as leaderboards below: nobody has asked, so the shape (which stats, per-club vs global, live-aggregated vs written on `end_game`) would be invented rather than derived from a want. Full entry in [`common.md → Deferred / open`](common.md#deferred--open).
- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC. The roster is now deep enough that "compare across games" is meaningful — so the blocker isn't the game count any more, it's that nobody's asked for it. Still far-future: the RPC *shape* stays TBD until there's a concrete want (which stat, per-club vs global, achievements vs raw scores).
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
