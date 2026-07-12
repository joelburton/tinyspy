# Deferred work

Things we explicitly chose NOT to do, with a one-line reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

When an item gets picked up, delete it from this file. When a new "we'll do this later" decision happens, add it here so future-us doesn't lose track.

For per-feature deep context on each item, follow the link into the relevant feature doc — `codenamesduet.md`'s "Open items," `psychicnum.md`'s "Open items / known scope-creep," `common.md`'s "Deferred / open."

## codenamesduet

The codenamesduet deferrals — **mission / campaign mode** and a **tile `aria-label` for screen readers** — have their full entries in [`codenamesduet.md → Open items`](games/codenamesduet.md#open-items).

## psychicnum

- **Make the game-status readout (`.infoState`) more visually interesting.** The
  info-column game-status area (`.infoState` — "N/3 found · M/9 guesses used") is
  plain and boring. Give it more visual life: spellingbee's info column (its
  rank ladder / stats treatment) is a good reference for what "interesting" looks
  like. Cross-game concern (the `.infoState` class is shared), but psychicnum is
  where it's most noticeably flat. Deferred from the psychicnum v2 → v3 pass.
- **The budget-exhausting *correct* guess flashes "Incorrect" for a beat.**
  `submit_guess` returns `'lost'` for the guess
  that takes the budget to zero regardless of hit/miss, and `BoardCol` maps
  anything but `'won'`/`'correct'` to the red "Incorrect" pill — so a last guess
  that *finds* a secret briefly shows "Incorrect" while its tile turns green,
  then the terminal pill replaces it. Cosmetic/transient. Fix when convenient:
  return a richer value (`'lost_correct'`) from the RPC, or branch the pill on
  the local board check (the guessed word is a now-green secret).

Open scope-creep notes also live in [`psychicnum.md → Open items`](games/psychicnum.md#open-items).

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- **Setup-shape evolution strategy for `clubs_gametypes.default_setup`.** Today's saved-defaults storage is "whatever the per-game `create_game` validates today, persisted verbatim." If a future code change reshapes a setup field — renames it, narrows the value type, drops it, adds a new required field — clubs with a saved default from before the change can land in an unhappy state: their saved blob is missing or wrong, and the dialog seeds the form with stale data. Today the FE merges manifest defaults under the saved blob, so missing fields fill in cleanly; the per-game `create_game` validator rejects malformed shapes loudly on Start (the user re-picks). Removed fields stay in the blob until next save (no harm — extras ignored by validators that accept-extras, or rejected by strict validators with a clear message). Wholesale-renamed fields are the breakage case: the dialog shows defaults for the new field, the stale field is silently dropped on next save. **For now, the simplest policy applies**: per-game `create_game` validates strictly; users land on errors when their saved default is incompatible; they re-pick once and the next save heals the row. When a real setup-evolution event happens, formalize: either (a) gametype-version stamp on the saved blob + per-version up-migration on read, or (b) explicit `default_setup` clear-on-incompatible-change in the migration that ships the shape change. Until then: don't reshape setup fields without thinking about the saved defaults in flight.
- **Auto-propagating a newly-registered gametype to existing clubs** — full entry in [`common.md → Deferred / open`](common.md#deferred--open).
- **Per-club / per-user stats schema** — full entry in [`common.md → Deferred / open`](common.md#deferred--open).
- **Profile column hardening via `common.profiles_public` view.** If profile data ever grows sensitive (real names, email-derived metadata, settings), revoke direct SELECT on `common.profiles` from `authenticated` and expose a view exposing only the safe columns. See the comment on the existing `profiles_select_authenticated` policy in the baseline migration.
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See the inline `// Fragile:` comments at `useCommonGame.ts`.
- **Stable-name Realtime channel reuse on a fast remount.** A fast unmount→remount of a stable-name channel (`game:${gameId}`, the club-presence channels) can, per `@supabase/realtime-js` 2.108.1, hand the new mount a still-tearing-down instance whose `SUBSCRIBED` never fires (StrictMode double-mount; club↔game navigation inside the unsubscribe RTT) — so no presence track / `set_current_view` / postgres-changes until the next reconnect. **Empirically not user-visible today** (StrictMode dev + green cross-client e2e), so deferred; it's timing, not guarantee. Fix direction: await the prior `removeChannel` promise before re-creating a same-name channel (a small module-level teardown registry). The related self-echo comment at `src/common/hooks/game/useCommonGame.ts:475–478` (claims Realtime echoes broadcasts to the sender; the default is `broadcast: { self: false }`, the code works because it applies locally anyway) can be corrected at the same time.
- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See the `// Fragile:` comment at `useSession.ts`.
- **Drop the unused outcome `-bg` tokens (actionable now).** `common/theme.css` defines five `-border` / `-bg` outcome-token pairs (won / lost / active / near / current). `near-bg` and `current-bg` have **zero callers** (verified across the full roster); `won-bg`, `lost-bg`, `active-bg` are used by Calendar (and ClubGameCard's delete-confirm pill for `lost-bg`). They were kept for vocabulary parity while the roster filled in — the roster is complete now, so `near-bg` / `current-bg` can be dropped (and consider deriving the rest with `color-mix` against the `-border` token to retire the `-bg` half of the vocabulary entirely).
- **Promote the turn-log "whose guesses" player-picker to `common/`.** wordle's `GameTurnLog` has a small understated header dropdown (via the shared `<TurnLog headerAction>` slot) that switches whose turns the log shows — the full shipped behavior is documented in [wordle.md → GameTurnLog](games/wordle.md). It's **almost certainly not wordle-specific** (most turn-log games will want it), but **don't extract yet** (only one consumer); when a second game wants it, lift the picker + per-player filtering into a shared component/hook (the `headerAction` slot is already shared). Likely **unifies with the WordList "filter dropdown"** under [Wordlist markers](#wordlist-markers-spellingbee--boggle) — the same "per-player select that filters a chronological/alphabetical list" idea on a different surface, with the same post-terminal-only honesty constraint for compete.
- **Member-color borders beyond dots — the `-edge` question.** The paired `--color-member-NAME-border` tokens + the shared `<Dot>` shipped 2026-07-07 (docs/ui.md → Player identity = a colored disc). What's still open: raw member colors also sit directly on the page background in **tile-selection frames** (connections peers), **crosswords peer-cursor frames**, and **chat name labels** — a light-yellow player has the same contrast problem there that the dot border solved. When those bite, decide whether the border token generalizes into an `-edge` ("this color legible against the body background") vocabulary, and whether name labels should switch to the border shade outright.
- **Below-board `--avail-h` chrome-subtraction isn't tokenized** (carried over from the 2026-07-01 review §3.1). The below-board slot *structure* + reserved height were shared/tokenized, but each game still hand-subtracts its own chrome height in the board/`.wrap` `--avail-h` (`- 5rem` / `- 4.4rem` / `- 8.5rem` / `- 3.5rem`) rather than deriving it from the slot token — hand-synced and drift-prone. Derive it from the slot token when convenient. *(A broader CSS pass may re-examine this — flagged so it isn't lost.)*
- **Literal radii → tokenize by *semantic intent*** (2026-07-01 review §3.3 — deferred to Joel). `4px` / `6px` / `8px` recur across ~16 sites equal to `--radius-sm` / `-md` / `-lg`. This is explicitly **NOT a mechanical `4px→-sm` swap** — each site should be tokenized by what it *is* (a card → `lg`, a panel → `md`, a tile → `sm`), a human judgment; leave the sub-grain `2px` / `3px` micro-radii and boggle's tuned `12px` tray. Two related low-priority leftovers noted in the same review: bananagrams `.dumpHot` green is still a literal (a distinct dump-zone-arming affordance), and a de-facto `--shadow-popover` elevation (`0 8px 24px rgba(0,0,0,0.18)` in DefinitionPopover/Menu, a `0.12` variant in FloatingPanel) could be minted.

## connections

The connections deferrals — **per-tile rise-and-fade animations** on category match, and **scheduled puzzle import** (the manual `npm run connections:import` graduating to a GitHub Action / scheduled Edge Function) — have their full entries in [`connections.md → Future work`](games/connections.md#future-work).

## spellingbee

No outstanding deferred items today (see [`spellingbee.md → Open / deferred`](games/spellingbee.md#open--deferred) for context).

## waffle (waffle)

No outstanding deferred items today.

## bananagrams (bananagrams)

- **The "🍌 Peel! You drew N" local pill fires for a *peer's* peel too.** A peer peeling grows the caller's own `tiles` (everyone draws on a peel), so the caller's draw-announcement watcher reads it as a draw and shows the peel pill even though the caller didn't peel. Reads slightly oddly ("I didn't peel, why the pill?"). Cosmetic — the tile counts are always correct. Joel hasn't decided whether to reword the peer case (e.g. "🍌 <name> peeled — you drew N") or leave it. Low priority.

## crosswords (crosswords)

The crosswords deferred register now lives in its game doc:
[docs/games/crosswords.md → §9 Deferred / future](games/crosswords.md#9-deferred--future).
The build-plan + code-review docs were retired into that file, so §9 is the single
home for crosswords deferrals — ⌥M, `fetch-nyt-range`, NYT dedup, the scratchpad
lock races (C3b/C3c), the standing schema/migration flags (vestigial `'nyt'`
constraint, dead `crosswords.games` realtime touches, half-frozen terminal cursor),
and the known unpinned tests.

## Wordlist markers (spellingbee + boggle)

The shared `WordList` (used by both spellingbee and boggle) now leads each row with a **circle marker** carrying finder attribution — a filled ● in the finder's color for found words, a hollow ○ in light grey for post-terminal misses — with the word text itself plain black. Rationale worth keeping: a solid disc is a far better color carrier than thin colored text (bigger area, no legibility/antialiasing fight), which **decouples identity from legibility** and relaxes the member palette — colors no longer have to survive as thin text, only as a ~12px disc. The deferred ideas that fall out of having a marker vocabulary:

- **◐ (U+25D0) "multiple players found this word," in the first-finder's color.** A visual "others got this too" cue. Honesty constraint: compete finds are private mid-game (RLS gates `found_words` to your own rows until terminal), so ◐ can only truthfully appear **post-terminal in compete**, though it could be **live in coop**. Not built — just the marker reserved.
- **⦻ (U+29BB) "scored zero because multiple players found it."** This is the *authentic* Boggle rule (shared words cancel), and boggle compete today deliberately does the **opposite**: the `boggle.found_words` PK is `(game_id, user_id, word)` and dedup is per-player, so two players independently keep the same word and both score it. So ⦻ isn't just a marker — it rides along with an **optional shared-word-cancellation scoring mode** (a scoring-model change in `submit_word` / `_finish`). The marker's value is exactly that it makes the otherwise-confusing paper rule legible. Build only if we add that scoring mode.
- **Filter dropdown on the WordList.** A small select to narrow the displayed words: `all words`, `missed`, `everyone`, `me`, and one entry per other player by username (`moth`, `leah`, …). There are real moments you want to focus — "what did we miss?", "what did Leah get?" — that the full alphabetical wall buries. Pure FE: filters the rows the list already has (found rows + the post-terminal reveal), nothing new from the server. Same honesty constraint as the markers above: `missed` and per-player options only mean anything **post-terminal in compete** (mid-game RLS shows you only your own finds), so the per-player entries should appear only when the data is actually visible (coop, or compete post-terminal). The finder-color circles make the per-player options self-labeling — each name can carry its color dot.

## Feedback channels (local vs group)

The channel-qualified feedback split shipped — **local** feedback is `useLocalFeedback` (a near-input `<GenericFeedbackPill>`, validity tones, never a player color) and **group/peer** feedback is `useGlobalFeedback` → the header `<StatusSlot>` (the actor's color disc), two separate channels so neither clobbers the other. The naming convention (`Global`/`Local`/`Generic`, never bare "feedback") lives in [code-conventions.md](code-conventions.md).

- **One follow-up remains:** unify the *turn-outcome* vocabulary (TurnLog `good` / `bad` / `near` / `neutral` / `partial`) across games — deliberately deferred.

## Mobile

Carried over from the 2026-07-10 mobile-FE review (that review doc has since been retired; its live items are these). The design + what shipped are documented in [`mobile.md`](mobile.md); these are the pieces deliberately left, plus two on-device checks still owed.

- **InfoSheet: full dialog behaviour (focus management + tap-outside).** The mobile info-sheet already has the *cheap* half of dialog semantics — the open sheet is a `role="dialog"` + `aria-modal` that **Escape** dismisses, and the closed sheet is `visibility: hidden` so a keyboard user can't Tab into the off-canvas column. **Still deferred:** move focus *into* the sheet when it opens and restore it to the trigger on close, trap Tab within the sheet while open, and dismiss by tapping the backdrop outside it. These are a deliberate cut for a friends-only, touch-first alpha — on a phone you tap the ✕; the only place the rest matters is the supported keyboard-tablet class. Fix direction: a focus ref moved on open/close + an `inert` (or a focus-trap) on the rest of the page while open, and a backdrop element that closes on tap. Lives in [`InfoSheet.tsx`](../src/common/components/game/InfoSheet.tsx).
- **`--phone-l`'s landscape arm catches short *desktop* windows.** `--phone-l` is `(orientation: landscape) and (max-height: 27.5rem)` with **no pointer condition**, and it's OR'd into `--phone`. So a desktop browser window dragged shorter than ~440px (docked half-screen) gets the phone treatment: page padding collapses to `0.25rem`, and — the odd part — every `FloatingPanel` becomes a full-screen sheet via the `!important` geometry override *while staying draggable/resizable in JS* (the drag-disable keys off `--touch`/`pointer: coarse`, which a desktop mouse doesn't match). Dragging then updates react-rnd's inline transform that the CSS immediately overrides — nothing moves, cursors lie. It's a CSS/JS disagreement about "what a phone is": the CSS sheet keys off `--phone` (shape) while the drag-disable keys off `--touch` (pointer). Harmless in practice — **no real device matches phone-l-without-touch; only weird desktop windows do** — which is why it's recorded rather than fixed. Cheapest fix if it ever annoys: add `(pointer: coarse)` to the `--phone-l` arm in **both** [`breakpoints.css`](../src/common/breakpoints.css) **and** [`usePhone.ts`](../src/common/hooks/ui/usePhone.ts) (the hand-synced pair), accepting that this makes `--phone` no longer purely shape-based.
- **Two shipped mobile changes still owe an on-device check** (code-complete; only the real-device verification is outstanding, and neither is reproducible in headless Playwright):
  - **`viewport-fit=cover` safe-area regression sweep.** [`index.html`](../index.html) now sets `viewport-fit=cover` so `env(safe-area-inset-*)` resolves non-zero (FloatingPanel's phone-sheet notch insets were previously inert). With `cover` the browser stops letterboxing, so **every** full-bleed surface owns its own safe-area padding — verify on a notched phone that the game header, club page, toasts, and celebration dialog don't slip under the notch or the home indicator.
  - **`touch-action: manipulation` zoom suppression.** Added to every tap-heavy surface (shared `.tile`, keyboard keys, stackdown tiles, boggle path-tracing, spellingbee hive) to defeat iOS double-tap-to-zoom + the ~300ms tap delay. Confirm on a real iOS device that rapid taps no longer zoom — Playwright's touch synthesis can't reproduce Safari's gesture heuristics.

## Printing to PDF — which games get it

Print-to-PDF is a per-game opt-in (see [`pdf.md`](pdf.md)). **Six games print today:**
scrabble, psychicnum, boggle, spellingbee, bananagrams, crosswords.

**Two games are deliberately excluded** (a permanent "won't do", not a deferral): both
are turn-by-turn *board progressions* where a single static snapshot can't represent the
game — you'd need a board snapshot per turn for it to mean anything on paper, which a
one-page printout isn't.

- **waffle** — the game is a sequence of tile *swaps*; a lone end-board doesn't capture
  the solve.
- **wordle** — the game *is* the guess-by-guess progression; a single board can't stand
  in for it.

**Still open** (would fit the existing helpers cleanly, no snapshot problem): codenamesduet
and connections (turn-log / word-list families) and stackdown.

## Tooling

- **Fold waffle + spellingbee's create_game tails into `_shared/startGame.ts`'s `invokeCreateGame`.** The board-builder edge functions now share `callerClient` (all three) + `invokeCreateGame` (boggle) from `supabase/functions/_shared/startGame.ts`. waffle + spellingbee still call `create_game` inline because their tails carry bespoke diagnostic `console.log`s (`'create_game RPC error:'`, `'success: id=…'`) that `invokeCreateGame` doesn't emit — and per the keep-logs prior we don't silently drop diagnostics. To finish the extraction: decide whether `invokeCreateGame` should log internally (keyed by schema) so all three can adopt it, or add an optional logger hook; then repoint both. Small, log-policy-gated — ask Joel before changing those log lines.
- **Generate ESLint `GAMETYPES` from `src/games.ts`.** Currently the games list is hand-maintained in two places (`src/games.ts` + `eslint.config.js`). A tiny script could derive the ESLint list from the registry. Now worth doing: with eleven games registered the dup has already drifted **silently** — a stretch where five games were missing from `GAMETYPES` left their cross-game imports unguarded, and nothing failed (a game simply absent from the forbidden list produces no lint error). So the old "a missed update is obvious" assumption was wrong; deriving from the registry is the real fix (the list was manually re-synced in the meantime).

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC. The roster is now deep enough that "compare across games" is meaningful — so the blocker isn't the game count any more, it's that nobody's asked for it. Still far-future: the RPC *shape* stays TBD until there's a concrete want (which stat, per-club vs global, achievements vs raw scores).
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
