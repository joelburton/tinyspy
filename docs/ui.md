# UI

Visual direction and design rationale for the frontend. The *what we render and why it looks that way* layer.

For the mechanics — CSS Modules, file co-location, `cls()`, what we don't use — see [`code-conventions.md → CSS Modules + theme`](code-conventions.md#css-modules--theme). This file picks up where that one stops.

Read this before:

- Adding a shared component to `common/`.
- Touching `common/theme.css` or a per-game `theme.css`.
- Designing the screens for a new gametype.

## Audience and platform: desktop-first

The play surface is a laptop or desktop browser. Some games are awkward on mobile by their nature (crosswords, Boggle on a phone); even the ones that *would* play fine on mobile are most fun with a keyboard and a wider canvas. So:

- **Default styles are written for desktop.** Mobile adjustments go in `@media (--mobile)` blocks that *override* the desktop rule, and only when something genuinely breaks. The opposite — mobile-first authoring, where the base rule is the phone and `@media (min-width: …)` overlays restore the desktop — once shipped in codenamesduet's three-column `PlayArea.module.css`, but that layout is gone and **the repo now has zero `min-width` media queries**; every one of its ~26 breakpoint blocks is a desktop-first override. Keep it that way: a `min-width` query in a diff is the signal that a rule got written backwards.
- **Mobile gets graceful degradation, not engineering.** Phone users should be able to read the page and use the app; we don't chase pixel-perfect mobile layouts.
- **The real mobile pass has begun.** It proceeds one screen at a time and is recorded in [`mobile.md`](mobile.md) — the single `56.25rem` (900px) desktop→mobile breakpoint, what's been made phone-safe so far, and how to verify no-scroll headless. Still desktop-first: mobile is a `max-width` exception that never changes the desktop layout.

## Layout stability

**A game page's shape is allocated at mount, and that shape doesn't change during play.** State updates rotate content *within* slots; they don't resize, reposition, or reflow the slots themselves. Rare, content-rich moments (error explanations, the win celebration) escape into modals rather than dedicating in-page space for the case where they're empty; the terminal verdict rotates into slots the page already reserves (see [Terminal results](#terminal-results--the-moment-vs-the-record)).

Closest existing model: NYT Connections. The grid is the grid from start to finish; the lives row is always there; the matched-band stripe at the top is always there. What changes is *which tiles are dark, which bands are bright, which copy is in the feedback slot.* The frame is fixed.

Why this matters here:

- **Future games eat all the space.** A crossword board needs every available pixel; an extra `min-height` on a "your turn / waiting for partner" banner that grows by 24px when state flips is 24px the grid doesn't get.
- **Reflow during play is jarring.** Tiles jumping because a status message above them gained a second line, or a result banner appearing mid-page and pushing everything down, breaks the "I'm playing a game" tone in a way "the layout is wrong" never quite does.

### Patterns this implies

- **Status-text rotation in a fixed slot.** "Your turn to give a clue," "Peer is giving a clue," "Clue: BIRD 3" all render into the same DOM region, sized at mount for the worst-case string. Empty / loading state ("No clue yet") is that same height too.
- **Always-present feedback slot.** "Already tried that," "Correct!," "Out of guesses." A dedicated slot that's the same height whether populated or empty. Content fades in and out; the slot stays. (See "Feedback pill" below.)
- **Scrollable regions for unbounded lists.** Guess history, clue history, chat. The outer container is fixed; the inner content scrolls. The game frame doesn't grow with the history.
- **Modal for rare-and-rich.** The win *moment* → the `<CelebrationDialog>` overlaying the static layout; the *record* (the verdict, the replay/new-game actions) rotates into reserved in-page slots instead — see [Terminal results](#terminal-results--the-moment-vs-the-record). The play surface stays visible in review mode either way.
- **Disabled in place, not removed.** The clue-input field is always rendered; greyed out when it's not your turn. Same shape, different state.

> **⚠️ The #1 offender — conditionally removing a flow element on state change.** Writing `{showInput && <CommitRow/>}` / `{isTerminal ? … : <EntryRow/>}` so the input/commit/entry row is *removed* at terminal looks harmless, but the board above is usually `flex: 1` — so when the row vanishes, **the board grows into the freed space.** That's a reflow on a state change, the exact thing this section forbids.
>
> **Mechanical check, every time you write `{cond && <X>}` or a state ternary in a PlayArea:** does `<X>` take layout space, and is a sibling grow-to-fill (the board)? If yes, **don't remove it** — keep it mounted and (a) toggle `visibility: hidden` (exact height kept even under wrapping — connections' `.commitFrozen`), or (b) rotate the *content* in a fixed-height slot (psychicnum swaps the entry for the terminal reveal in the same slot), or (c) give the slot a mount-time `min-height`. The board's bottom boundary (the input/commit row) is where this bites most.
- **Mono-width digits for ticking values.** Timer in a `font-variant-numeric: tabular-nums` slot so `0:09 → 0:10` doesn't shift the header.
- **PauseOverlay is the canonical example.** PauseBoundary renders the play area OR the overlay in the same slot (never both), so the surrounding chrome doesn't reflow when pause flips on or off. New chrome should follow the same pattern.

### The deliberate exception

In-grid **game-mechanic animations** that change the partition between game regions are allowed and expected. connections's category bands growing into the tile-grid space is the game's central dopamine; hiding that behind a fixed partition would be wrong. The rule is about *UI-state reflow* (a status banner changing height, a result banner appearing mid-page), not about *game-content reflow* (a board area transitioning between game states).

The distinction in one line: **if it's a side effect of state changing, fix the layout; if it's the state change you're celebrating, let it happen.**

The other exempt case is **loading state**: "Loading game…" doesn't have to occupy the same shape as the loaded play surface. It's a brief moment, the loaded shape often depends on game state that's not yet fetched, and the principle is about reflow *during play*, not at mount.

### Feedback pill

A uniformly-styled component that carries every game's transient and permanent feedback ("Invalid move," "Good guess!," "Waiting for clue from peer," "Tip: try yellow first"). One visual register across games — a connections "wrong guess" should look like a codenamesduet "clue invalid" should look like a future Boggle "not a word."

The **same pill serves both feedback areas** — two role phrases we use consistently, naming *where feedback appears*: the **global feedback area** — `<StatusSlot>` in the GamePage header (see [GamePage header](#gamepage-header) below), left-justified, for peer/opponent/chat feedback (not the player's own moves) — and the **local feedback area** — a fixed-height slot in the `belowBoard` region, centered, for feedback about the player's *own* move. In the header, an active pill replaces the default `<PlayersStrip>` content; when cleared, the strip reappears.

**API on `GamePageCtx`:**

```ts
type FeedbackTone = 'success' | 'error' | 'warning' | 'neutral' | 'info' | 'near'
//                                       ▲ amber — "important, but not good/bad"
//                                         (a hint asked for, an opponent's progress);
//                                         'near' = a near-miss (connections' "one away"),
//                                         amber-adjacent — may share warning's color for now.
//   A deliberately semantic set: some tones collapse to one color today, but the
//   names stay distinct so we can re-color them independently later.

type FeedbackMsg = {
  tone: FeedbackTone
  text: string
  dot?: string                          // leading player-color disc (from colorVarFor) — identity anchor for peer messages
  mode:                                 // what KIND of message — decides both behaviour AND look
    | { kind: 'sticky' }                // until replaced, or the player acts (key / tile / tap the pill)
    | { kind: 'timed'; ms?: number }    // self-dismisses after the delay; a tap kills it early
    | { kind: 'manual' }                // the × is the ONLY way out
    | { kind: 'permanent' }             // a standing condition; only a later pill REPLACES it
}

feedback: {
  show: (msg: FeedbackMsg) => void
  clear: () => void
}
```

**Dismiss modes — when to use each:**

- **`timed`** for transient acknowledgment that auto-fades. connections's "Already tried that," "Wrong guess." The default workhorse.
- **`sticky`** for "make sure they see this" — an own-move result like "Not a word". Stays until something replaces it or the player acts: a keystroke, a tile click, or a tap on the pill.
- **`manual`** for the rare message the player should actively acknowledge, where a stray keystroke mustn't wipe it — stackdown's revealed-word spoiler, which has to linger while they hunt for the tiles. The `×` is the only way out. (Named `manual`, not `closeable`: every mode but `permanent` can be closed, so `closeable` didn't distinguish it from anything.)
- **`permanent`** for a standing CONDITION rather than a message: the terminal verdict, "Conceded — race continues", codenamesduet's sudden death. Nothing dismisses it — a later pill **replaces** it, which is how out-of-race gives way to the final verdict.

**One field, because the alternative leaked.** This used to be two — a `variant` for appearance beside a `dismiss` for behaviour — whose product allowed six states for four real meanings. "Permanent" had no name; it was spelled `variant: 'fill'` + `sticky`, so *whether a pill could be dismissed* had to be read off a styling prop. Two bugs came straight out of that: the out-of-race pill was filed as `sticky` (so a keystroke wiped the only statement of the player's own status), and eight transient messages wore the permanent background by forgetting to say `outline`. Appearance now follows the mode, and neither mistake is expressible.

**Tapping the pill dismisses it** — the `sticky` and `timed` modes. This isn't a new interaction: the rule was always *"your next action clears the feedback"* (a keystroke via `useCaptureKeys`, a tile click via the game's own handler), and tapping the message **is** an action. On touch that rule had one fewer way to fire — there is no next keystroke — so a player who read "Not a word" and tapped it got nothing, and had to start the next word to clear it (found on a phone playing letterboxed). Both feedback areas behave the same way, local and global, because a rule the player has to learn twice isn't a rule.

Two exclusions, both deliberate. **`manual` keeps its `×` as the only target** — its whole point is see-and-acknowledge, and a body that swallowed the gesture would make the `×` look decorative. **`permanent` isn't dismissable at all**: it's a condition, not a message you've finished reading, and nothing would bring it back. The pill is a plain click target, never a `role="button"`: a game can show a hundred of these and none of them should become tab stops; `cursor: pointer` tells a mouse user what the tap teaches by working. Pinned by [`GenericFeedbackPill.test.tsx`](../src/common/components/feedback/GenericFeedbackPill.test.tsx) (both exclusions, both directions) and [`letterboxed.e2e.ts`](../e2e/letterboxed.e2e.ts) at phone size.

**Transient vs permanent (the look, which now follows `mode`).** Every pill's **whole border is the tone color** (saturated `--color-outcome-*-strong`) — a thick **left bar** (like the turn-log outcome bars) plus thin sides in the *same* color, uniform width on every pill. (A pale-grey side border read as no border, so the sides carry the tone too; `neutral` has no tone, so its border is a visible dark grey.) The mode only changes the **background**: `sticky` / `timed` / `manual` are *messages* and get a plain white background. `permanent` — the terminal verdict, out-of-race, an end-game mode like codenamesduet's sudden death — gets a **lightened-tone background**, so a permanent `error` (light-red fill) reads as *more* emphatically "error" than a transient one (white fill). The fill is the permanence signal. **Peer identity is independent of it:** a message about another player ("● leah found APPLE") carries a leading `dot` in their player color whatever its mode — the dot, never the fill, says *who* (the `dot`-carries-identity rule from [Player identity = a colored disc](#player-identity--a-colored-disc)).

**Tone follows the event, not the viewer's stake.** One event reads as **one tone everywhere**, regardless of whether it helps or hurts the viewer. A *found word is green* in **both** modes: coop (a teammate found one) and compete (an opponent found one — adverse to me, but still "they found a word"). We do **not** recolor by competitive stake. Otherwise the player maintains two color-meanings for the same event — green-means-found in coop, something-else in compete — which is hard to learn and easy to misread; the identity `dot` already says *who*, so the tone is free to say only *what happened*.

**Semantics:**

- Latest `show()` replaces whatever was there — no queue, no stack. Race-condition simple.
- `clear()` empties the slot regardless of dismiss mode.
- The state lives in `<GamePage>`; the auto-clear timer for `timed` mode is owned by `<GamePage>`, not the caller.
- **Pause transitions don't auto-clear feedback.** `<PauseOverlay>` covers the play surface, not the header; an active pill stays readable through a pause/resume cycle. If a specific feedback shouldn't survive a pause, the caller clears it explicitly.

#### Faults — the one thing that is NOT a pill: the fault MODAL

A **fault** is a failure nobody planned for: a bug, or a request that never
reached the server. It renders as a blocking **modal** (`<FaultDialog>`, one
host mounted in App.tsx) — dimmed backdrop, nothing outside it interactable —
deliberately unlike every normal message. The phone-line shape test got even
easier: *"did a box pop up?"* separates **"the game refused my move"** from
**"the app is broken"** before anyone reads a word.

Three lines (Joel's spec, 2026-08-13):

1. **"Error"**, red.
2. **The message** — the classifier's words: `ERROR_COPY`'s sentence when the
   key has copy on a fault surface, the raw `action|key|detail|` otherwise,
   the transport line (`word: Server; try refresh`) when nothing answered.
3. **The diagnostics**, small and muted — everything we know (action,
   fe-error-key, SQLSTATE, HTTP status, DETAIL, raw text, timestamp): the
   SAME string the `[db]` console line carries, from one shared builder
   (`faultBits` in serverError.ts), so screen and log can never drift.

Dismissal: the Close button or Esc — backdrop clicks are deliberately inert
(see-and-acknowledge). One fault at a time; each fault is its own modal
(no batching); the queue caps at 5 and silently drops overflow from the UI —
every dropped fault still has its `[db]` line, since the classifier logs
before routing.

**The one rule:** *every failure that classifies as fault/transport pops the
modal, on every surface; expected rejections, validation, and answers stay
where they are.* Mechanics:

- **Nothing authors a fault by hand.** `GenericFeedbackMsg.fault` (+ its
  `diagnostics`) is set only inside
  [`serverError.ts`](../src/common/lib/game/serverError.ts) — by
  `failureMessage` when no copy exists for what came back, and by
  `faultMessage` on a fault surface (in-game New game, where nothing that
  comes back is gameplay) — see
  [supabase.md → Server errors](supabase.md#server-errors-the-server-raises-a-key-typescript-owns-the-words).
- **Routing lives at the sink chokepoints**, not per game:
  `useLocalFeedback.show` and the GamePage global slot send `fault: true`
  messages to the fault store instead of slot state, so no game wires
  anything and `GenericFeedbackPill` has no fault branch (guarded by
  `faultStore.test.ts` — a fault can never reach a slot). The reserved
  below-board slot simply never shows one.
- **Form/panel surfaces** use `formFailureText`: an expected rejection
  returns its sentence for the surface's own red line (the setup dialog's
  validation, the club-name rules, the AI panels' "the model declined —
  try again"); a fault pops the modal and the surface resets. The two page
  LOADS in ClubPage stay in-page — a page that failed to load has nothing to
  render behind a modal, so its own error state is the right surface.
- **Look and words are independent axes.** The surface decides pill vs
  fault; the copy table decides only the words — a fault surface wears the
  copy's sentence when one exists, always `error`-toned (a fault is never
  news), always logged.
- **Testing the look:** real faults are bugs or dead networks, so
  `window.pupfault()` (registered by FaultDialog) pops a canned one from the
  browser console — `pupfault('text', 'diagnostics')` to shape your own. For
  a genuine one: DevTools → Network → Offline, then any action.

### Toasts

A **toast** is a bottom-right **announcement** — a *different surface* from the feedback pill above, for a different job. Feedback is about *your* action, near your eyes (the input, or the header for peer moves); a toast is a *club/game event you should notice wherever you are on the page* — a friend added you to a game, a friend is setting up the next one. Toasts **stack vertically** (newest nearest the corner), sit **above everything including the chat panel** (z-index 12000), and each carries an **✕** plus an optional single **action button** (e.g. "Join"). There are no validity tones here — a toast is neutral chrome with a tone accent stripe; it's an announcement, not a verdict.

One shared store + one host: any code calls `showToast(spec)` / `dismissToast(id)` (`lib/toast/toastStore.ts`), and the single `<ToastHost>` (`components/toasts/`, portaled to `<body>`, mounted once in `App.tsx`) renders the stack. The host is capped to the viewport and scrolls internally, so a flood of toasts never scrolls the *page* (the [page-never-scrolls](#page-height-fits-the-viewport) invariant). Consumers today: game invitations (`useGameInvitations`, now headless) and the "…is setting up a new … game" club heads-up (`useClubSetupPresence`). See [common-folders.md](common-folders.md) for the file homes.

### Terminal results — the moment vs the record

Game-end UI splits along one line: **the moment** (a win worth marking, which happens once and then is gone) and **the record** (what the page says about a finished game, every time anyone opens it). The record lives **in-page**; the moment is the only thing that gets a modal.

**The record — two surfaces, one copy object.** Every game's `buildOver()` returns a [`TerminalCopy`](../src/common/lib/game/terminalCopy.ts) — `{ verdict, message, tone }` — so the two surfaces can't drift:

- `verdict` → the **below-board pill**, occupying the slot the input/action UI used during play. Terse, leading with the outcome word, no trailing period: it's a one-line ellipsising LABEL (~48 chars on a phone), not prose. "Won: fewest guesses" / "Lost: out of time" / "Game ended".
- `message` → the **info-column outcome line** in `<TerminalActionRow>`. Shorter still: "You won!" / "Out of guesses" / "Game over".
- `tone` (`won` / `lost` / `neutral`) colors both. The neutral manual-end copy is shared outright (`endedCopy()`) — the friends agreed to stop, so nobody won and nobody lost.

**`<TerminalActionRow>`** (`common/components/game/terminal/`) is the shared info-column game-over row: the outcome line, then any per-game terminal actions as children, then a primary Back-to-Club. Most games pass `iconOnly` so the row survives a ~22rem column (`RestartButton` + `RevealButton` + `NewGameButton` + Back-to-Club is four items in a `nowrap` row — see [Button iconography](#button-iconography)). Its neutral twin **`<LocalTerminalRow>`** covers *locally* terminal states — a compete player who conceded or ran out while the others race on — so dropping out reads as loudly as a real ending without claiming the game is over.

Neither replaces the page: it stays in *review mode* (the final board, connections' revealed categories, and — once asked for — codenamesduet's partner key card or psychicnum's ringed secrets; see [Don't reveal the solution on a loss](#terminal-results--the-moment-vs-the-record) below). And per [Layout stability](#layout-stability), the terminal row **rotates into a reserved slot** — it never adds or removes a flow element, which would let the `flex: 1` board grow.

**Back-to-club skips suspend-confirm.** Terminal game = no progress to lose. The row's button calls `goToClub: () => void` off `GamePageCtx`, which `<GamePage>` wires to direct navigation (the same terminal branch the menu's "Back to club" item takes).

**The moment — `<CelebrationDialog>`.** `common/components/game/CelebrationDialog.tsx` (confetti glyphs + a jingle, ported from crossplay) is **the only modal a terminal game pops**, and only for a win. `useCelebration(won)` has three rules: never on mount (opening an already-won game is review, not winning), pop when `won` flips true mid-session (the flip lands on every client via the common realtime refetch, so the group celebrates together), one-shot until re-armed by a flip back to false (replay-board un-terminals the game, so win → restart → win celebrates again).

**Gate it only on values that are correct on the FIRST render** — the `common.games` row (`playState`, `status.*`) plus the roster, all of which `<GamePage>` awaits before rendering a PlayArea. Anything fetched by the game's own hook is null while it loads, so the fetch landing fakes a false→true flip and pops confetti at someone merely reviewing a finished game. (Caught live by an e2e; unit tests with synchronous mocks miss it.)

**Which win counts is per-game.** Most games celebrate the coop win (`playState === 'won'`; coop-only by the states vocabulary, since compete writes `won_compete`). Scrabble and bananagrams celebrate the **compete** win instead — they can afford the self-vs-other test on first render, and bananagrams' coop has no win at all. letterboxed celebrates **both**: the coop cover and compete's first-past-the-bar (including a timed-out race's co-winners, read off the leaderboard's per-row `won` flags). Fourteen of fifteen games celebrate; wordiply has no win state to celebrate (its verdict leads with `Ended:`).

**Losses stay quiet, deliberately.** Celebrate wins loudly; let losses land through the red pill. The asymmetry is the point — a consolation modal is a modal you have to dismiss on your way to feeling bad.

**Nothing reveals the solution on its own.** Ten games hide their answer until a player asks — **waffle** (the grid), **wordle** (the word), **stackdown** (the six words), **psychicnum** (the three secrets), **crosswords** (the author's grid), **codenamesduet** (the partner's key card), **strands** (where the words hide, plus the words themselves), **letterboxed** (the seeded two-word solution), **connections** (the categories nobody got) and **wordiply** (the best possible word) — and that includes **on a win**. Force-reveal at the end and the replay becomes theater: you already know where the tree ends, and `replay_board` re-runs the *same* board in most of these. Under the friends-only trust model nothing needs re-shielding; the server unshields at terminal, so "is it on screen?" is purely a **display** question.

Three properties, and each one is a decision (`common/hooks/game/useSolutionReveal.ts` holds all three):

- **Personal.** My looking doesn't open the answer on a partner who is still turning the loss over. It used to be a shared flag — one player pressed Reveal and every board opened — which reads generous and plays badly: a post-mortem is people thinking out loud, and one impatient click ended everyone else's thinking. Each player now looks when they're ready.
- **Temporary.** The same control puts it away: `RevealButton` takes `revealed` and swaps to `EyeOff` / *Hide*. This is the one that mattered most. For the games whose reveal **rewrites the board** — crosswords (fills the grid), strands (draws the unfound words), waffle (swaps in the solved grid), connections (bands replace the tiles) — a permanent reveal destroyed the only record of *how far the players actually got*. Now the board they finished with is always one click back.
- **Unpersisted.** No RPC, no column, nothing on realtime, nothing to un-write on a replay, and a reload lands back on the board as it ended. What each game *does* still owe is dropping the local reveal in its `onRestarted` — a replay of the same board must start blind, and no server flag remembers that for it any more.

**A game you SOLVED starts revealed.** Six of the ten have a **clear win** — you can only reach the end by producing the answer — so asking the solver to press Reveal is asking them to uncover what they're looking at: **strands** (the theme words tile the board exactly, so solving consumes every cell), **psychicnum** (finding all three IS the win, and a found secret is already green), **stackdown** (you played all six words), **waffle** (your solved grid IS the solution), **connections** (each match resolves into a band, so all four are up), **wordle** (you typed it). Their Reveal goes **inert with "Solution already shown"** — present, never absent, so the row keeps its shape against a game that ended some other way. It keeps the **plain View eye, not EyeOff**: both readings are technically true (you can't hide what the win put there, and you can't show what's already shown), but a solver never pressed Reveal, so there is no "on" state for a struck-through eye to be the "off" of — it reads as a state they don't recognise.

For three of them it's a real convenience rather than a no-op: stackdown's six words, strands' `Words:` line and wordle's answer line are the same answer gathered as **click-to-define text**, which the board itself doesn't give you. For waffle, connections and psychicnum the only visible change is the control going quiet.

**The predicate is "did I SOLVE it", never "was the game won".** They come apart in compete: wordle writes `won_compete` when *someone* wins, and the racer three guesses off never produced the word — starting them revealed would hand over the answer unasked, the exact thing the personal reveal exists to prevent. Each game passes its own per-player solved bit to `useSolutionReveal({ impliedBy })`. It also gets strands compete right for free: that race deliberately doesn't end on first solve, so a player who solved but lost on hint count still consumed their board and still starts shown.

Two implementation notes that are easy to get wrong, both recorded in the hook: the default must be **derived, never a `useState` initializer** (the per-player rows it reads are empty on the first render, and a game can be won mid-session), and **Restart calls `reset()`, not `hide()`** — hiding records an explicit "no" that outranks the implied default, so solving the replayed board would leave the answer stubbornly hidden.

The four games without a clear win keep asking: **letterboxed** (a win is any covering chain, not the seeded pair), **crosswords** (rebuses and quantum clues mean your grid may legitimately differ from the author's), **wordiply** (winning never means you found the best word), **codenamesduet** (a win contacts all fifteen agents, but the partner's card still names which of *your* tiles were bystanders).

**Three games carry no reveal control at all**: boggle, spellingbee and wordwheel show their missed-word list at terminal, because the word list's KIND filter (*found* / *missed*) already **is** that control — a Reveal button would be a second, confusing way to switch between the same two lists. If we ever wanted them to withhold it, the change is that filter's **default**, not a new control. Games with no solution (bananagrams, scrabble) have nothing to show.

**The reveal is terminal-only**, and that part is still enforced by the server: each gametype's shield hands the solution over at `is_terminal` — ended for *everyone* — so a compete player who conceded, was eliminated, or finished early can't pull the answer while the others are still playing. There is no per-game "am I locally done?" reasoning anywhere in the path. Where a game shows a locally-terminal row, it keeps the control visible but disabled, tooltipped **"Can't reveal until all end"**: the row must not change shape when the last racer finishes, and "not yet" beats a control that vanished. That's also why the button never disables itself once used — it toggles instead.

**Every gated game offers the reveal twice** — a `RevealButton` in the terminal action row *and* a game-menu item, both wearing the same two faces — so a player who's scrolled past the row, or who is on the mobile layout where the info column is off-canvas, can still get to it.

**Showing the answer means the whole answer.** crosswords learned this one late: its reveal filled the blanks but left a wrong letter standing, which is a half-corrected grid rather than the solution. The author's letter now replaces the player's in every cell, greyed — grey meaning "this letter is the author's, not yours", so the key doubles as a diff — and Hide brings their fill, marks and all, straight back. Overwriting what's on screen is only safe *because* it comes back.

**The club-list title follows the same rule**: a title that spells the answer spoils the game from the outside, which is exactly what wordle's `_sync_title` did until 2026-08-02. It can't key on the reveal either — that's one player's private click, and the title is club-wide — so every game's title-writer names only what the players actually earned (wordle: the last guess, which on a win *is* the answer; stackdown: the words they cleared; waffle: the best board's correct words; psychicnum + codenamesduet: board words, never the key).

**codenamesduet is gated for a different reason**, and it's the clearest illustration of why the reveal is personal. It has no replay to protect (its board *is* the secret). The seconds right after an assassin are the post-mortem — "wait, I was about to pick APPLE" — and that conversation only happens while the partner's card is still covered. When the reveal was shared, one player opening the card ended the other's half of that conversation mid-sentence.

**Restart** (`RestartButton` + the per-game `<gametype>.replay_board` RPC on top of `common.reset_game`) serves three different players: the do-over (we lost, let us finish), the line-explorer (same puzzle, different tree), and the optimizer (I won, but I want to beat my swap count) — so it shows at *any* terminal, not just losses. Two accepted costs: replay wipes the win (the game sits "unwon" until re-solved) and wipes the previous attempt's turn log.

**All fifteen games have it.** The three that once didn't (restored 2026-08-03) were each opted out for a good local reason, and each reason lost to the same argument — a player who can't find Restart where every other game puts it concludes the app is broken, not that this game is special:

- **codenamesduet** — its board *is* the secret, so a replay keeps the key cards and you know where the assassin is. Kept anyway, as an explicit **mulligan**: a first-guess assassin ends a game nobody got to play, and "let's just run it back" is what the friends actually say. Someone wanting a blind board has New game, one item down.
- **bananagrams** — no shared puzzle, so a restart deals what New game would. Kept anyway because of the missing-affordance problem above, and built as a *real* reset (same row, same hands re-dealt from the immutable `bunch_seed`) rather than an alias, so the club list doesn't grow an entry.
- **crosswords** — "can't surprise you twice once the answers have been read" (decided 2026-07-31, reversed 2026-08-03). It turned out to already *have* the feature under another name: **Clear board** wiped the fill and kept the grid. That's a restart with a different label and one missing power — it couldn't un-terminal a finished puzzle. Clear board is gone; Restart is the one name and one path.

**Two surfaces, one rule.** The `RestartButton` shows **only at terminal**, so mid-game boards aren't cluttered with an action nobody's reaching for. The **game-menu item is always there** — that's where a mid-game restart lives — and mid-game it asks `RESTART_CONFIRM` first ("This clears everyone's progress and starts the same board again — you can't undo it"). At terminal it goes straight through, because there's nothing left to lose. No `replay_board` guards on `play_state`: it's a restart, and the confirm is the protection.

### Confirm modals — never `window.confirm`

In-game confirmations go through the shared
[`<ConfirmDialog>`](../src/common/components/panels/ConfirmDialog.tsx) — a
true MODAL on the FloatingPanel shell: `backdrop` blocks every pointer action
on the board underneath, focus is trapped, the confirm button autoFocuses
(Enter confirms), Esc cancels, and the game key-captures bail inside
`[data-floating-panel]`. The confirm button always **names the act** ("End
game", "Suspend") — never a bare "OK". For the imperative form handlers want,
[`useConfirmDialog`](../src/common/hooks/ui/useConfirmDialog.tsx) is
`window.confirm` with a promise: `if (!(await confirm({...}))) return`, plus a
`{confirmDialog}` node to render.

Three standing users:

- **End game** — ALWAYS confirmed, in every game and every entry point (the
  info-row button, the menu item, the pause overlay's escape hatch), even
  solo/coop: ending is terminal for the whole group and irreversible. One
  canonical copy object (`END_GAME_CONFIRM`) so the question reads identically
  everywhere.
- **New game** — confirmed only while a game is IN PROGRESS (at terminal
  there's nothing to interrupt, so it goes straight through). `NEW_GAME_CONFIRM`
  is the shared copy, asked inside each game's own `handleNewGame`, so every
  entry point inherits it: the terminal button, the menu item, and the `+`
  shortcut. **⌥+** (new game from setup) asks it separately, in GamePage — it
  never reaches a game's handler, since it hands off to ClubPage's setup dialog
  instead of dealing a board. **Its copy reassures rather than warns**, because starting a new
  game does *not* end this one — `create_game` clears the club's current-view
  flag and the old game stays resumable from the club page ("shelved, not
  lost"). Phrasing it like End game's "you can't undo it" would be false. The
  point is that an accidental `+` doesn't read as *I just lost my game*.
- **Suspend / Back-to-club** — confirmed only when there are PEERS to
  surprise. Three shapes (see
  [states.md → Leaving the game page](states.md#leaving-the-game-page--terminal-vs-non-terminal)):
  terminal → direct navigation, no dialog, no broadcast; solo mid-game →
  suspend immediately, no dialog; multiplayer mid-game → the
  `SuspendConfirmDialog` (a wrapper over ConfirmDialog).

One `window.confirm` is left — **concede** — and it migrates when it's next
touched. The others have gone as their features were worked: replay mid-game
now asks `RESTART_CONFIRM` through the modal (2026-08-03), reveal mid-game no
longer exists (End the game, then Reveal), and Clear board became Restart.

### Dialog buttons

macOS-style placement, consistent across every dialog / modal / confirm: the action row is **right-justified** (`justify-content: flex-end`), with the **default/primary action rightmost** and Cancel (the `secondary` button) to its left — so Cancel comes *first* in the DOM, the primary button *last*. Single-button dialogs (Help's "Got it", the `<CelebrationDialog>`'s "Nice!") right-justify the lone button. Each dialog owns a small `.actions` / `.buttonRow` flex rule, all sharing `gap: 0.75rem` and `min-width: 6rem` on the buttons. `PauseOverlay` is the deliberate exception — it's a page-context banner, not a modal, so its buttons center.

The **setup dialog** (`<SetupGameDialog>`) extends this: an icon-only [`<HelpButton>`](../src/common/components/buttons/HelpButton.tsx) (`IconHelp`) is pinned to the **far left** of the footer (`justify-content: space-between`), with the Cancel/Start pair keeping the standard right group. Clicking it opens the game's Help as its own `<FloatingPanel>` *on top of* the setup dialog (which stays open behind it) — so you can read the rules mid-setup, unlike the in-game menu's Help. The icon-only Help button is excluded from the `min-width: 6rem` floor (that floor is only for the two text buttons). Setup fields that recap a value (Timer everywhere; spellingbee's Dictionaries + Custom letters) sit behind a shared [`<SetupSection>`](../src/common/components/setup/SetupSection.tsx) disclosure whose summary shows the current value (`Timer: none`, `Dictionaries: 3 (Familiar) / 5 (Obscure)`, `Custom letters: A-CHIROT`), closed by default.

**Back to club** — the one button that recurs across surfaces (**every** game's terminal row, icon-only + `primary`, via `<TerminalActionRow>` — crosswords' hand-rolled terminal row matches it; plus the *playing* action row in the seven entry-row games, where the row has space for it. The other six reach the club through the game menu's Back-to-club item (⇧<), which is the universal route in every game) is the shared [`<BackToClubButton>`](../src/common/components/buttons/BackToClubButton.tsx), so the glyph (a `‹` U+2039 chevron, `aria-hidden` so screen readers just say "Back to club"), its spacing, and the label stay identical everywhere. `variant` only swaps the fill — the terminal row uses `primary` (filled accent, usually `iconOnly` to fit the row); `secondary` (outline) is the component default, used elsewhere (e.g. the pause overlay's "Suspend and return to club"). The GamePage *menu* item is plain text, not this button.

### Existing offenders to retrofit

Not a big-bang refactor — these get fixed game-by-game as we work through the UI sweep:

- **codenamesduet turn-state messaging.** Audit needed — does "your turn to write a clue" occupy the same space as "waiting for peer's clue" and "peer gave you: BIRD 3"?
- **Guess / clue history scroll containment.** Verify each is a scrollable region inside a fixed outer, not a grow-with-content list.

## Real forms, and everything else

**The rule is about who owns the keyboard.** In a real form the *focused element*
owns it, so focus is meaningful, a focus ring is an honest signal, and Tab is
the right way to move. Everywhere else the *app* owns the keyboard, focus is a
liability rather than a state worth showing, and a ring is a lie about where
your next keystroke will land. That's the same invariant `useGameHasKeyboard`
encodes — *caret visible ⟺ keys reach the game* — and a real form is precisely
where keys deliberately don't reach the game.

Three categories:

**1. Real forms** — things a player *fills out*. The setup dialog (including
crosswords' date / series / upload tab), the profile form, claim-a-username, the
get-magic-link and login-with-code forms, and the confirm dialogs
(`ConfirmDialog`, `SuspendConfirmDialog`, `FaultDialog` — nobody "fills them
out", but the panel owns the keyboard and its buttons need visible focus).

These may use Tab between elements, native `<select>`s, focus rings, and take
RETURN / ESCAPE to submit / cancel alongside their buttons.

The boundary is already machine-readable: **`data-floating-panel`**.
`useGlobalKeyHandler` declines inside it, and `useFocusTrap` / `useSwallowTab`
hang off the same marker — which is how the setup dialog can be a real form
while floating over a live game with no special-casing. An audit can start as a
grep.

**2. Not forms** — the home page, the club page (its filters and its game list),
and the whole game surface: boards, info panels, turn logs, word lists, mode
pills.

No general Tab navigation, and **no focus rings**. SPACE and ENTER are trapped
for specific meanings rather than the browser's "act on the focused thing".
Dropdowns here are **`<FilterSelect>`**, never a native `<select>` — see that
component for why a native one can't be made to behave (short version: it takes
focus to open its popup, and no event reliably tells you when to give the
keyboard back).

**3. Focused text entry inside a non-form surface** — the club chat box, the
game scratchpad, codenamesduet's number + clue fields.

These legitimately take focus and own the keyboard *while focused*, but they
aren't forms: no Tab-to-everywhere, no form semantics. TAB and ESCAPE are
trapped, and the interesting part is the **way out** —
`handOffKeyboardOnTab` blurs on Tab to hand the keyboard back to the game
(Shift-Tab is left alone so a panel's ✕ stays reachable). codenamesduet's two
clue fields are the case where Tab moves between exactly two controls, and
nowhere else.

**Keyboard-only users are not a constraint here** (see
[CLAUDE.md](../CLAUDE.md) → audience): the population is known, and nobody
navigates the app by keyboard alone. Making an uncommon control
non-keyboard-reachable is an acceptable trade for one control vocabulary across
the app. This is *not* the same as dropping keyboard support — the boards are
keyboard-first by design, and category 3 exists precisely to keep typing working.

## Page-height fits the viewport

**A page's height equals the viewport's height — content scrolls within fixed sub-frames, not by scrolling the page itself.** Same intent as native apps and the games we replace (NYT Connections in the browser, Wordle, Boggle on a phone): the chrome stays put; growth-prone surfaces (chat, guess history, club's games list) absorb height inside their own frames via `overflow-y: auto`.

Why this matters:

- **Chrome stays predictable.** Headers, status slots, action rows live where the user expects them at all times — accidentally scrolling the page can't hide them.
- **Game surfaces don't get clipped.** A crossword grid pushed half-off-screen because the user nudged a trackpad is broken UX. The page can't scroll; only the parts that *should* scroll do.
- **Pairs with [Layout stability](#layout-stability).** Together: shape doesn't change during play (Layout stability), AND shape never grows past the viewport (this rule). State updates rotate content within slots; long lists scroll within sub-frames; the document itself never moves.

### Rolling out

Game-by-game and page-by-page, not a global `body { overflow: hidden }` bomb. Pages that already fit naturally don't need work; pages that overflow get a refactor when we sweep them.

Today this principle binds on:

- **ClubPage** — fits the viewport via `height: calc(100vh - body padding)`; the "Your games" list is a fixed-size frame with internal scroll. See [ClubPage header](#clubpage-header) below.
- **HomePage** — same bound, but as a **`max-height`** rather than a `height`, and the distinction is worth copying for any centered-card page. Home's body is a `.card` sized to its content, so a fixed height would stretch it to the full viewport and strand a two-club list at the top of a tall empty box. A max-height leaves the ordinary case looking exactly as it did and only binds when the clubs would otherwise scroll the page — at which point the club list scrolls instead. Getting there needs the whole ancestor chain to relay the bound (`.frame` → `.card` → the section → the `<ul>`, each a flex column with `min-height: 0`); the fixed furniture above the list takes `flex-shrink: 0`, or the wordmark — a `width: 100%` `<img>` — absorbs the squeeze by getting shorter.

Future targets:

- GamePage (already mostly fits; needs a sweep for long terminal-state result lists).
- Each per-game PlayArea — crosswords + future word-grid games are the most demanding.

### Patterns that follow from it

- **Internal scroll on growth-prone lists.** Chat history, guess log, clue list, game roster. The container has a fixed height (often via `flex: 1; min-height: 0` inside a column-flex parent that's bounded); `overflow-y: auto` makes it scroll.
- **Two-column layouts above a certain content threshold.** When vertical space runs out, split sideways instead of letting one column grow. ClubPage's "active + start" vs "other games" is the canonical example.
- **Modals for rare-and-rich.** When a page genuinely needs more space than the viewport offers and columns don't help, reach for a modal before letting the page grow. Note the counter-example: a terminal verdict is neither rare nor rich, so it stays in-page ([Terminal results](#terminal-results--the-moment-vs-the-record)) — a modal is for the *moment*, not the record.

## Theme: one global theme today

The current theme is light (`color-scheme: light`, `--color-bg: #fafafa` / `--color-surface: #ffffff`), with tokens at `:root` in [`common/theme.css`](../src/common/theme.css). Most games add a per-game theme file ([`codenamesduet/theme.css`](../src/codenamesduet/theme.css), [`wordle/theme.css`](../src/wordle/theme.css) the letter-feedback palette, [`stackdown/theme.css`](../src/stackdown/theme.css) the felt + tile ink, …) declaring additional tokens scoped to that game's gameplay surface.

### Tokens are semantic, not literal

Within each file, token names describe the *role* of the value, not the value itself:

| good (semantic) | bad (literal) |
|---|---|
| `--color-bg`, `--color-surface`, `--color-text` | `--color-near-black`, `--color-light-gray` |
| `--color-accent`, `--color-error` | `--color-blue`, `--color-red` |
| `--codenamesduet-agent`, `--codenamesduet-assassin` | `--codenamesduet-green`, `--codenamesduet-red` |

The reason: when (not if) we add a second theme, every literal name becomes a lie — "the green is actually pink in pink mode" reads wrong. Semantic names cascade cleanly through theme swaps.

This rule applies *within each namespace separately*. `--codenamesduet-agent` is a codenamesduet token whose name says "agent" because that's what it means inside codenamesduet. It is **not** a step toward a cross-game `--color-agent` concept; see [Two vocabularies](#two-vocabularies) for why.

### No `var()` fallbacks

Reference tokens as `var(--color-surface)`, never `var(--color-surface, #fff)`. We own the entire custom-property namespace, so a fallback can't guard against a third-party theme not setting the token — it can only *mask* one of our own bugs: a typo, or a rename that didn't land everywhere. Worse, the fallback silently drifts (we found `var(--color-text, #1a1a1b)` against a real token of `#1a1a1a`), so the day the token *does* fail to resolve you get a subtly-wrong colour, not a visible failure.

The safety net is build-time, not a fallback: [`src/cssTokens.test.ts`](../src/cssTokens.test.ts) fails if any `var(--x)` references a token that isn't defined in a stylesheet or set inline from a component. That's the "make missing tokens obnoxious-pink" instinct done one better — it screams in CI before the bug can ship, instead of hoping someone looks at the affected pixel. A missing token is always a bug here; treat the test going red as a real failure, not noise.

### Light theme is the default

The theme is light: `common/theme.css` sets the surface tokens light and declares `color-scheme: light`, and each game's palette is tuned against that background. A dark theme is not a separate near-term task — it folds into the user-selectable-themes work below (dark becomes one selectable option, not a global re-swap).

### User-selectable themes (deferred, with the column reserved)

Dark / light / pink / etc. as a *user setting* is still deferred: there are no alternate themes, no picker on the profile form, and no switching mechanism (a `[data-theme]` selector, `prefers-color-scheme`). The foundation that does exist is the CSS side — vars at `:root`, semantic names — plus, since 2026-08-03, **`common.profiles.theme`**: a reserved free-form `text` column, nullable, unread by anything.

Reserving a column while deferring the feature is deliberate and worth distinguishing from pre-engineering. It costs one line and no behaviour, and it means the *shape* of the setting ("a per-user string on the profile") isn't being invented later under whatever pressure prompts the theming work. NULL means "no preference — use the app default", which is what every row says today; don't seed a magic default name, and constrain the column (a CHECK or an enum) once real theme names exist.

Everything else about the feature stays YAGNI. **Don't pre-engineer the mechanism.**

## Two vocabularies

A token or class goes one of two places, and the two don't mix.

### UI-state vocabulary — global

Concepts about the *frame*, not the game. These earn global tokens / classes because consistency is the whole point — a player shouldn't have to relearn what a won-banner looks like per game:

- `.outcome-won`, `.outcome-lost`, `.outcome-tie` — game-end banner styles.
- `.error` — already global; validation feedback, RPC errors.
- (Future) presence states, transient toast feedback, etc.

A "you won" banner in codenamesduet should be visually indistinguishable from a "you won" banner in Boggle. That's the *point*.

Most of these don't exist yet — psychicnum and codenamesduet each render their game-end screens differently today, which is one of the things to fix as global UI-state tokens / classes emerge.

### Game vocabulary — per-game

Concepts that belong to the game's rules and ontology:

- codenamesduet's **agent / neutral / assassin**.
- A future Boggle's **valid word / great word / not a word**.
- Connections's **four difficulty colors** (yellow → green → blue → purple, themed by the game itself).

These stay namespaced to the game's `theme.css` and **don't get collapsed**, even when two games happen to have a concept that *feels* "positive" or "negative."

### The error to avoid

Promoting a per-game concept to a global token because two games happen to share a visual register. Calling codenamesduet-agent and boggle-great-word both `--color-good` looks tidy on the surface and breaks the moment a third game's "good" wants to lean a different direction — at which point you either un-alias (admit the abstraction was wrong) or pollute the global token with game-specific exceptions.

The asymmetry: walking a per-game token *up* to global later (when the recurrence is real) is easy; walking a global token *back down* to per-game is hard, because consumers everywhere depend on it.

### Promotion rule

A token (or class) earns promotion to global when **both**:

1. Two or more games already use it, AND
2. It would be *wrong or confusing* if the two games differed.

"Both games happen to use green here" doesn't qualify. "Both games are showing the player they won" does. Default per-game; promote only on evidence.

## Consistency across games

Players should be able to **switch between games without relearning the frame**. The chrome reads the same; only the play surface changes. This is the consistency goal that justifies extracting shared components even when only two games use them today.

**The tool for checking it is [the screenshot gallery](testing.md#the-screenshot-gallery)** — `gmake gallery` puts every game into every state and photographs it into one scrollable contact sheet, so "do these fifteen games look like one app?" becomes a question you can actually answer by looking. Drift is invisible one game at a time and obvious in a column: reach for it before and after any visual pass, and when a change touches shared chrome. It's not a test and asserts nothing (bar one guard) — the reading is yours.

### What every game has

These aren't optional capabilities a gametype opts into — they're part of the shared frame, and every game must support them:

- **Chat.** Every `<GamePage>` mounts `<FloatingChat>`. The chat is per-club and persists across games; a new gametype gets it for free by mounting inside the common shell.
- **Pause.** Presence-pause + manual-pause are uniform via `useCommonGame` + `<PauseBoundary>`. No per-game wiring.
- **Timed / untimed setup choice.** Every game's setup form has a `<TimerField>` (None / Up / Down / MM:SS). Per-gametype default may differ (connections defaults to countdown 10:00; psychicnum and codenamesduet default to none), but the *option* is universal.
- **Help.** Every gametype's manifest declares a `help: ComponentType<{ onClose: () => void }>` — the rules / how-to-play modal opened from the "Help" item in the GamePage menu. codenamesduet's `Help.tsx` is the model; connections and psychicnum carry placeholder content until they earn real copy.
- **GamePage menu.** Click the logo to open a dropdown with common items (Help, Back to club) plus per-game items the PlayArea pushes via `ctx.menu`. See [GamePage menu](#gamepage-menu) below.
- **Back-to-club + suspend-confirm.** Opened from the "Back to club" item in the GamePage menu (or browser back). Non-terminal games show the suspend-confirm modal first; terminal is a single-click back. Owned by `<GamePage>`.

A new gametype that wants to omit one of these isn't building "a new gametype" — it's stepping outside the frame, and that's a CLAUDE.md-priors conversation, not a manifest field to toggle.

### GamePage header

A layout-static row that every game shares. Same shape, same affordances, same positions — only the contents inside `<StatusSlot>` and the timer's presence/value differ per game.

```
[logo] [chat scratchpad] [status-slot]         [pause] [timer-if-set]
```

**Left, left-justified:**

- **`<GameLogo gametype={…} />`** — square SVG (`src/<game>/logo.svg`). The logo is a menu trigger: click opens the GamePage menu (Help, Back to club, per-game items). See [GamePage menu](#gamepage-menu) below.
- **`<ChatBubble />`** — toggle for the floating chat panel. Same icon open or closed, but while **closed** it doubles as an unread indicator: the bubble fills with the latest unread sender's profile color, and a small count pill (top-left) shows how many messages arrived since this member last had the panel open. Opening clears it. The pill is **black**, not a player color — red and the other player hues are all valid profile colors, so a colored pill would read as "a sender" and could clash with the bubble's fill. Unread is tracked per-club via a localStorage `lastSeen` bookmark (`chatUnread.ts`), so it survives reloads and a never-opened panel shows the whole backlog as unread. Stays in place when chat is open per [Layout stability](#layout-stability).
- **`<ScratchpadBubble />`** — toggle for the floating scratchpad panel, rendered only when the game's manifest opts in (`scratchpad.enabled`). Grouped tight against the chat bubble (`.panelToggles`, a smaller gap than the header's) — the two are related in purpose (each toggles a floating panel), and the closeness signals the pairing.
- **`<StatusSlot />`** — default content is `<PlayersStrip>` (colored usernames, one per `player`). When `ctx.feedback.show()` has been called and isn't cleared yet, the slot renders `<FeedbackPill>` instead. The underlying roster updates whether or not the pill is showing; the strip reappears when feedback clears.

**Right, right-justified:**

- **`<PauseButton />`** — pause icon (two-bar style). Click fires `sendManualPause` from `useCommonGame`. Greyed-out (disabled) when the game is already paused; the resume affordance lives on `<PauseOverlay>`, not in the header. **Always present** — manual pause is universal, not timer-gated; even an untimed game wants the "moth is making tea" affordance.
- **Timer** — `{ displaySeconds, expired }` from `useCommonGame`. Rendered only when `commonGame.setup.timer.kind !== 'none'`. `font-variant-numeric: tabular-nums` so digits don't shift the right edge as values change.

**What's gone:** the game title. Identifying the game is the logo's job; the per-instance title (e.g. connections's puzzle date) still lives in the club-page listing where it has room to breathe.

**Why this lives in the common shell:** the consistency goal — a player switching from codenamesduet to connections shouldn't have to relearn the chrome. The header is implemented in `<GamePage>` (along with the chat + pause + suspend-confirm machinery it already owns); per-game `<PlayArea>` components render below it and don't see the header at all.

### GamePage menu

The logo is a menu trigger. Click opens a dropdown anchored below it; same trigger across games, same dropdown chrome, different items inside.

**Each game owns its WHOLE menu.** The shell no longer injects a fixed common section — a rich game like crosswords needs Help at the top, several divided game sections, and Back-to-club at the bottom, which the old "one common section + one game slot" model couldn't express. Instead the `<PlayArea>` pushes the entire section list via `ctx.menu.setGameSections([...])`, and the shell exposes the two actions a game can't build itself — `ctx.menu.openHelp()` and `ctx.menu.requestBackToClub()` (the terminal-vs-suspend "Back to club" logic).

```
[logo ▼]   ← click
    │
    └─→  ┌──────────────────────┐
         │ Help                 │
         ├──────────────────────┤
         │ …game sections…      │
         ├──────────────────────┤
         │ End game / Concede ⌥⌫│
         │ Back to club       ⇧<│
         └──────────────────────┘
```

**The `buildGameMenu` helper** ([common/lib/game/gameMenu.ts](../src/common/lib/game/gameMenu.ts)) assembles the standard framing so games don't duplicate it: a **Help** section at the top, the game's own `extra` sections in the middle, and a tail with **End game** (coop) / **Concede game** (compete, id `concede`) + **Back to club**. The end/concede item dispatches through the game's own handler (each game's `db` is schema-typed, so the RPC stays at the call site); Help/Back use the shell actions. Most games call it in one line with `extra: [{ items: [printItem] }]` (or `[]`); crosswords passes its full check/reveal/clear section list.

**Shortcut hints.** A `MenuItem` may carry an optional `shortcut` string (e.g. `'⌥C'`) rendered right-aligned + muted. Three are shell-global (work on any game, dispatching to the game's own menu items / actions): **⌥⌫** fires End/Concede (finds the `end-game`/`concede` item and clicks it), **+** fires New game (finds the `new-game` item — `NEW_GAME_ID`), **⇧<** fires Back to club. All bail inside any editable field, so ⌥Backspace stays "delete word" while typing.

Dispatching through the *menu item* rather than a callback is what makes `+` work on **every** game that offers New game — including one whose only affordance is the menu, with no button on screen — and it inherits the item's `disabled` state for free. New game isn't built by `buildGameMenu` (the board each game deals is its own), so the shared id is the contract between the games and the shell.

**⌥+ — "new game from setup"** is the one shortcut with **no menu item**: the power-user variant of `+`. Where `+` reuses this game's setup verbatim, `⌥+` stops at the setup dialog so you can change the options first. It asks the same `NEW_GAME_CONFIRM` mid-play, then hands off to `/c/<club>?new=<gametype>` — the setup dialog lives on ClubPage, and that's the same route crosswords' own New game uses. Cancelling the dialog simply leaves you on the club page. It matches on `e.code === 'Equal'`, not `e.key`, because Option changes the character a key emits (⌥= is `≠` on a Mac) — the same reason ⌥⌫ matches `code`; that also makes ⌥= and ⌥⇧= both work, so the shift is optional.

**⇧< means "up a level", not "back to club" specifically** — the ClubPage menu's *Back to home* item carries the same shortcut, taking you from a club to the club list. One key, one meaning, wherever you are. (ClubPage's handler additionally bails inside an open dialog / menu / floating panel — navigating out from under an open setup dialog would be its own bug. GamePage's older twin bails only on editable fields; worth aligning next time that file is open.)

API on `GamePageCtx`:

```ts
type MenuItem = {
  id: string        // for React keying
  label: string
  onClick: () => void
  disabled?: boolean
  shortcut?: string // right-aligned hint, e.g. "⌥C" (display only)
}
type MenuSection = { items: MenuItem[] }

menu: {
  setGameSections: (sections: MenuSection[]) => void
  openHelp: () => void      // opens the manifest Help modal
  requestBackToClub: () => void   // Back to club (terminal-nav or suspend-confirm)
}
```

**Stability.** `setGameSections` is a `setState`, so a PlayArea's menu-building effect must NOT re-run every render (that loops). Keep its deps to stable values; route any late-declared or unstable item handlers (typically End/Concede) through a stable ref populated in a separate effect — the crosswords `actionsRef` pattern. The shell's menu actions (`openHelp` / `requestBackToClub`) have stable identity.

**Focus.** The game menu is given `returnFocusOnClose={false}` (Menu.tsx), so closing it blurs the trigger and lets focus fall to `<body>` — a keyboard-first board (crosswords) resumes reading arrows instead of a focused logo swallowing them / reopening the menu. `Menu` also `stopPropagation`s its own keydowns so arrowing through the menu never doubles as a board move. Non-game menus (ClubPage's, HomePage's) keep the standard Esc-restores-focus a11y.

**Overflow.** A long menu (crosswords lists ~20 items) never grows the page: the popover is capped at `max-height: calc(100vh - 5rem)` and scrolls internally.

**Pause behavior.** The menu is openable while paused. Game sections vanish because PlayArea unmounts on pause; the cleanup return on the PlayArea's `setGameSections` effect clears them (`setGameSections([])`), so a paused menu is empty until resume.

**Keyboard.** Enter / Space on the logo opens the menu and focuses the first enabled item. Arrow up / down navigate; Enter or Space activates; Esc closes. Tab while the menu is open closes it and advances focus normally. Disabled items are skipped by arrow navigation.

**Submenus** are a two-shape hybrid, one level deep. A row with `items` instead of `onClick` ([`MenuSubmenu`](../src/common/lib/games.ts)) opens:

- **desktop — a flyout** beside the parent row, parent left lit so it's clear which panel belongs to it;
- **mobile — a drill-down** that replaces the list, headed by a `‹ <parent>` row.

The split is by viewport because a flyout has nowhere to go on a phone: the popover already runs to its `max-width` cap there, so a second panel beside it would only ever land on top of the first. Both shapes share **one** piece of state, because in both an open submenu takes over keyboard navigation entirely — so the flat-index model survives and Back is modelled as a nav row rather than special-cased. `ArrowRight`/Enter opens, `ArrowLeft`/Escape steps back out (focus returning to the parent row), and **Escape unwinds one level at a time** rather than dismissing the whole menu. Opening is by **click, not hover** — hover-open fires as you arrow past a row and means nothing on a touchscreen laptop.

Two consequences worth knowing. The flyout is `position: fixed`, not absolutely positioned inside the popover: `.popover` is `overflow-y: auto`, and the spec computes `overflow-x` to `auto` alongside it, so an absolutely-positioned child would be **clipped** at the popover's edge instead of overflowing. Scrolling the parent list therefore closes the flyout rather than letting it detach (crosswords' ~20-item menu really does scroll). And a submenu parent has no `onClick`, so the shell's `+` / `⌥⌫` shortcut dispatchers call `item.onClick?.()` — a real guard, not appeasement.

**Z-index.** Menu sits at ~1500 — above the 500-tier modals (suspend-confirm, hint, setup; so a menu click can open one of these) and below chat at 10000 (chat stays available for "what does this option do?" Q&A during play).

**Layout stability.** The menu is a popover anchored to the trigger; it overlays the page without reflowing anything underneath. Per [Layout stability](#layout-stability).

**Reuse outside GamePage.** The `<Menu>` component is generic — trigger + sections + items + keyboard chrome, nothing game-specific. ClubPage adopts the same shape (see [ClubPage header](#clubpage-header) below) with a generic PuzPuzPuz logo as the trigger and items "Help" (a placeholder `<ClubHelp>` modal, so the club menu has the same Help affordance games do — also what `?` reaches), "Back to home," "Rename club," "Delete club."

### ClubPage header

The club page wears the same chrome the game page does. Same "no title in the header" rule — the logo carries identity at the header level; the canonical club name + handle live in the main content well below. No right-hand group — clubs have no timer, no pause.

```
[puzpuzpuz-logo] [chat-bubble] [status-slot]
```

- **`<PuzpuzpuzLogo />`** — a generic placeholder SVG at `src/common/puzpuzpuz.svg`, the same 4-dot-grid the per-game logos use. Wrapped by `<Menu>` exactly like the game logo: click opens the club menu.
- **`<ChatBubble />`** — the same shared component as GamePage. Both pages bubble open/close the same FloatingChat panel via the shared `chatOpenStore`.
- **`<StatusSlot />`** — same shared component. Default content is the `<PlayersStrip>` of club **members** (the variable name in club context, per [naming.md](naming.md#member)). **Here each member's dot is a live presence light:** ClubPage feeds the strip the `useClubPresence` roster as `presentUserIds`, so a member who's connected (on the club page or in any of the club's games) shows a filled color dot and an absent one an empty outline — at-a-glance "who's in the club right now." (On GamePage the strip gets no `presentUserIds`, so every dot is simply filled.) When `setFeedback(...)` fires (e.g. after a successful game delete), the strip is replaced by the `<FeedbackPill>` for the configured dismiss mode. One concrete pill today: a `timed` "`<title>` deleted" toast that fires on successful `delete_game`.

**ClubPage menu items:**

- **Help** — opens the placeholder `<ClubHelp>` modal (parity with the GamePage menu's Help; also what the `?` shortcut reaches on the club page).
- **Back to home** — `navigate('/')`. Real link.
- **Rename club** — placeholder. Click pops a "Coming soon" `timed` feedback pill.
- **Delete club** — placeholder. Same.

**Layout.** ClubPage's header is layout-static and fills the full content width (respecting the body's outer padding, same as the GamePage header). The body below the header is a two-column flex row that takes the rest of the viewport height (per [Page-height fits the viewport](#page-height-fits-the-viewport)):

- **Left column** — the club name + handle, the active game card (when there is one), and the per-gametype Start buttons, alphabetical by brand. The buttons are a **dense list**, not a stack of cards: one hairline rule between rows, no per-row border or radius, tight padding. (They *were* outline cards — a treatment that read well at three games and badly at thirteen, where each row's border plus its gap left the frame showing barely half the roster. Picking a game is scanning, and a scan-list wants rules, not boxes. The frame around the list still carries the card chrome, so the block reads as one panel.) Hover tints the row rather than lighting a border — lighting only an underline would read as highlighting the row below. **Sibling-manifest families** (coop + compete variants of the same `baseGametype` — see [`common.md` → The sibling-manifest pattern](common.md#the-sibling-manifest-pattern)) render today as two independent rows, adjacent in the alphabetical order (coop first within the tie). Future treatment may group siblings as a single visual block (one logo + two side-by-side Start buttons labeled "coop" / "compete") — the `baseGametype` field on each manifest is the hook for that grouping.
- **Right column** — the **"Your games (N)"** list as a fixed-size frame with internal `overflow-y: auto`, so the friends can scroll back through history without the rest of the page moving. It holds **every game the club has**, the current one included: that game also gets the callout above the start list, but withholding it here made the club's one live game the single thing missing from the list of its games (and put it out of the gametype filter's reach). Same **dense-row** treatment as the start list, and `ClubGameCard` splits what used to be one axis into two: `variant` picks the register (a bottom-ruled row in this list, or the bordered `standalone` callout), and `state` drives **only the corner flag** — orange for the current game, yellow for a shelved one, none for a finished one. That flag is the whole signal: terminal rows are not dimmed, nor set in a smaller or lighter face. Each extra channel repeating "this one's done" cost something real — the fade dulled the logo and status colors, which carry information, and the type changes gave the list three different row heights, which reads as noise rather than hierarchy. Every row in both panels shares one type spec (`1rem`/600 title over a `0.85rem` muted line, no gap between them), so a row is the same object whichever panel it's in. Only the callout is scaled up, and only a step: a `1.25rem` title and an even `0.9rem` of padding — the rows' horizontal inset on all four sides, so its logo and text sit on the lists' vertical line and the box is no taller than its contents need. (It was `1.5rem`, which wrapped the longer algorithmic titles — connections' three words, scrabble's opening three — onto a second line and moved its height around. Its border and its position at the top of the column carry the prominence; the type doesn't have to.) Neither frame carries padding; the rows supply their own, so the space above the first item equals the space between any two and the rules run the panel's full width.

The body Members list and the `/c/<handle>` URL line are gone — the header's `<PlayersStrip>` carries identity, and the URL is in the browser address bar already.

**Filtering the two lists.** Each column's heading is a row: the `h3` on the left, that list's filter on the right ([`ModeFilter`](../src/common/components/club/ModeFilter.tsx) / [`GametypeFilter`](../src/common/components/club/GametypeFilter.tsx), sharing `clubFilters.module.css` so the paired controls can't drift). Both are pure FE state over data already in hand — nothing refetches — but they **persist differently**, because they mean different things. The mode filter is a standing taste ("I'm here to play compete games") that narrows a *menu of things you could start*, hiding nothing that exists, so re-picking it every visit is friction: it sticks, via [`useStickyChoice`](../src/common/hooks/ui/useStickyChoice.ts) in localStorage, keyed by user (across clubs — the taste is yours, not the club's). The gametype filter is **not** persisted: it narrows a list of the club's *real games*, so a remembered one hides games that are still there, and a club page that opened already filtered from last week would read as "where did our games go?"

- **Start a new game → by mode.** Three `aria-pressed` toggle buttons, `All | Co-op | Compete`, mirroring the mobile tab bar's shape one size down. They decline focus on mousedown, exactly like the start buttons below them, so narrowing the list doesn't blank the keyboard cursor you were about to arrow with. **A solo club gets no mode filter at all** — mode is noise with one player, the same call [`<ModePill>`](#mode-pills) makes when it drops the "Co-op" badge there, and a filter for a distinction the page isn't drawing is worse than the space it frees. (ClubPage still pins the effective mode to `all` there, so nothing can be left filtered by a control that isn't on screen; on mobile the filter row itself is skipped, since an empty one would still claim the frame's gap.)
- **Your games → by gametype family.** A compact `<select>`, one choice per `baseGametype` **present in the list** (so a choice can never empty it), labelled with the brand and sorted by it. **Siblings collapse:** one "WordNerd" covers `wordle_coop` *and* `wordle_compete` — the friends think in games, not manifest entries, and the mode axis already has its own filter on the other column. A native select rather than more buttons because this is a list of up to fifteen, not a switch. It can't decline focus the way the mode buttons do (a select needs the press to open its popup), so it borrows the games list's focus — and ClubPage hands it straight back on `change`, which makes the detour a round trip: narrow the list, keep arrowing it.

The heading's count and the keyboard cursors both read the **visible** list, so a filtered-out game is unreachable by arrow keys too. Guarded by [`club-filters.e2e.ts`](../e2e/club-filters.e2e.ts).

**Keyboard navigation.** The page has exactly TWO keyboard tab stops: the
start-a-new-game list and the "Your games" list (the containers
themselves, `tabIndex=0`). **Focus starts on the start list on load** (no
first Tab needed), and a window-level handler swallows every other Tab on
the page — focus toggles between the two lists and can't wander into other
controls, which are deliberately mouse-only. Within the focused list, Up/Down
move a per-list cursor (clamped at the ends, no wrap; kept scrolled into the
frame's view) and Enter acts on the item under it: a start button opens its
SetupGameDialog (a doesn't-fit gametype no-ops, like a click), a game card
navigates into the game. Visuals: the focused list's border warms to the
accent and the cursor item wears a 2px accent ring; the ring hides when the
list isn't focused. Overlays keep native keys — a text field, the menu
dropdown (`role="menu"`), or any floating panel (`data-floating-panel`) is
exempt from the Tab-swallow, and while one of ClubPage's dialogs is up the
list handlers go inert — and the global shortcuts (`/`, `?`, `~`) work
unchanged. The active-game card is mouse-only for now (it's not one of the
two lists) — and for that reason its prominence border is a dark NEUTRAL,
not the accent: since this feature, a blue ring means "the keyboard cursor
is here", and the active card must not impersonate it. Guarded by
[`club-keyboard.e2e.ts`](../e2e/club-keyboard.e2e.ts).

**A click selects, the same as an arrow key.** Clicking a start button or a game
card moves the cursor onto it, so the mouse and the keyboard never disagree about
which item is "selected". It matters most on the start list, which is the one
place a click leaves you on the page: click a game, cancel its setup dialog, and
the ring is on the game you clicked with the next arrow key stepping from there —
before this it stayed wherever it had last been, and the next arrow key jumped
somewhere unrelated. (This works only because those buttons decline focus on
mousedown, so the container keeps focus and the ring stays visible.)

**The same idiom on the club-list page.** `/` (the [`HomePage`](../src/common/components/home/HomePage.tsx)
clubs list) navigates identically: the `<ul>` holds focus, which lands there on
arrival, Up/Down move a clamped no-wrap cursor, and Enter opens the club under
the ring — the same 2px accent ring, so "blue ring = the keyboard cursor is
here" holds across both pages. **Tab does nothing** (`useSwallowTab`), as on the
game boards: arrows + Enter are the whole keyboard story, and native Tab only
led away from it — onto the header menu, then out into the browser's URL bar.
The accepted cost is that `+ New club` isn't keyboard-reachable from this page;
an open `<Menu>` is unaffected, since it `stopPropagation()`s its own keys and
Tab still closes it. The rows stay ordinary links, so clicking is unchanged.
The solo club sorts first, and the cursor indexes one flattened display-ordered
array — the rows render from that same array, so ring and row can't disagree.
Clicking a row selects it too, for symmetry with ClubPage — though since every
row here navigates away, that's an invariant rather than something you'd notice.
Guarded by [`home-keyboard.e2e.ts`](../e2e/home-keyboard.e2e.ts).

### Components

Same principle, applied to components.

**The chrome is shared.** Cards, banners, chat, login, the home page, the club page — these look the same regardless of which game is mounted. Current realization:

- `FloatingChat`, `PauseBoundary`, `PauseOverlay`, `SuspendConfirmDialog`, `TimerField`, `ClubGameCard`, `StartGameButtons` are shared. The route-level `<GamePage>` mounts the cross-cutting ones (chat, pause, suspend confirm, timer in header) so every game inherits them.
- `LoginScreen`, `HomePage`, `ClubPage`, `CreateClubPage` are shell-level, game-agnostic.
- **The account submenu** ([`useAccountMenuSection`](../src/common/hooks/account/useAccountMenuSection.ts)) is the last section of every page's own menu — GamePage's, ClubPage's, and HomePage's. One row labelled with the **username**, opening **Profile** and **Log out**.
  - **It used to be a `<UserMenu>`**: a fixed profile-colour dot pinned to the viewport's top-right on every authenticated screen. That chip forced the GamePage header to carry `margin-right: 2rem` of permanently reserved width for it to overlap — dead space at every viewport, and exactly the width the mobile game header needs for feedback. Folding the items into the menu that was already there reclaimed all of it and **removed** a control rather than adding one.
  - **Still user-focused only.** It carries no club- or game-specific items; the two mental models stay separate, now by *nesting* rather than by a second menu. Correspondingly, a game menu never puts game actions inside it.
  - **The label is the username, not "Account"** — the dot it replaced answered "who am I signed in as" at a glance, and a generic label would drop that fact. (The colour itself is still on screen wherever identity matters: the players strip, the club member list, a turn log's actor column.)
  - **HomePage gained a header for this** — the square site logo hard against the page's top-left opening the page menu, thin rule beneath, the same strip ClubPage and GamePage carry (measured: the trigger lands at the same x/y as ClubPage's). It is PAGE chrome, outside home's centered `.card`: a first version put it inside, where it inherited the card's 2rem padding and border and so read as content, lining up with nothing else in the app. It had no menu at all before, which made home the one authenticated screen with no route to Profile or Log out once the fixed chip went away. A first attempt hung the menu off the **wordmark**; that reads badly (a hero image isn't a control, and the disclosure chevron had nowhere to sit on a 400px-wide PNG), so the wordmark went back to being artwork. The header is also where a future Help or other non-user item goes — home has nowhere else to put one.
- **`useAppShortcuts` takes `{ chat: false }`** for a page with no chat panel mounted. Chat is club-scoped, so on HomePage `/` would flip the shared open flag and show nothing — a key that silently does nothing is worse than one that isn't bound, because the next person debugging it starts from "chat is broken" rather than "chat isn't here". Unbound, `/` is left to the browser's find-in-page. `?` and `~` are page-independent and stay on.
- `<EditProfileDialog>` — the Edit-profile popup, a `<FloatingPanel>` (not a route) so the page underneath stays mounted and live. Mounted at App level and opened from the account submenu of whichever page menu is on screen — so the flag crosses subtrees and lives in a tiny store ([`editProfileStore`](../src/common/lib/account/editProfileStore.ts)) rather than in App's own state. It stays mounted high in the tree deliberately: react-rnd positions a `<FloatingPanel>` from its static flow position, so mounting it inside a page's flex column lands it far from where you expect (see the FloatingPanel gotcha below). Today it edits one field — **player color**, via `<ColorChoiceList>` (below), defaulting to the current color. Saves via `common.update_profile_color`, then `setProfileColor` updates the shared profile store so the menu dot repaints at once. Username is shown but immutable in v1. Dialog buttons follow the [Dialog buttons](#dialog-buttons) convention.
- `<FloatingPanel>` — the shared draggable / resizable / closeable popover (react-rnd) behind `<EditProfileDialog>`, `<ConfirmDialog>`, `<SetupGameDialog>`, the help panels, and codenamesduet's AI clue-suggestion dialog. **Gotcha worth knowing: react-rnd positions the panel from its element's *static flow position*** — a panel mounted deep inside a flex column inherits that column's offset, so it can render far from where you expect. codenamesduet's clue-suggestion dialog first mounted ~180px *below* the viewport because it sat deep in the board column. **Mount a `<FloatingPanel>` high in the tree** — at the PlayArea `.layout` level or App level — never nested inside the play surface. The codenamesduet e2e guard (`e2e/codenamesduet.e2e.ts`) asserts the suggestion panel renders fully on-screen, pinning this.
- `<ColorChoiceList>` — the shared player-color picker: the 8-entry palette (`MEMBER_COLORS`) as a grid of swatches, each its actual color circle + capitalized name, the selected one ringed. Controlled (`value` / `onChange`). Used by both `<EditProfileDialog>` and the first-run `<ClaimHandleScreen>` (where it sits beside the username field, pre-selected from a deterministic FE hash of the username — `defaultColorFor` — so a new player isn't picking from a blank slate; the chosen color is sent to `claim_username`).
- `.card`, `.muted`, `.error`, `.link-button`, `.actions` are universal utility classes in `common/theme.css`.

**The game-mechanic UI is per-game.** The board, rules display, input affordance (clue form vs number input vs guess box) — each game owns these. That's what the per-game `components/` directory is for.

**Game-end UI** — `common/components/game/terminal/` holds the two shared info-column rows every game renders at terminal: `<TerminalActionRow>` (outcome line + per-game actions + Back-to-Club) and its neutral twin `<LocalTerminalRow>` (a compete player who dropped out while the others race on). The verdict itself is in-page — the below-board pill — and the one modal in play is `<CelebrationDialog>`, popped only at the moment of a win. `<GamePage>` provides `goToClub` for the Back-to-Club button. See [Terminal results](#terminal-results--the-moment-vs-the-record) above for the full contract.

## Player identity = a colored disc

A member's palette color (`MEMBER_COLORS` via `colorVarFor`), rendered as a **filled circle**, is the canonical visual anchor for "this player." It already recurs across the app — the `<PlayersStrip>` presence dots, the `<ChatBubble>` unread fill, the `<ColorChoiceList>` swatches, the per-finder markers in the spellingbee / boggle `<WordList>`, and the HomePage greeting ("● joel — welcome!"), which is the one place the disc says *you* rather than *someone else*: home is the last screen before a club, and inside a game the disc is how a player finds themselves. Treat it as a convention, not a coincidence: when a surface needs to say *who*, reach for a colored disc.

**The disc is one shared component: `<Dot>`** (`common/components/text/Dot`). It draws the fill PLUS the color's paired **`-border` ring** (`--color-member-NAME-border`, resolved via `borderVarFor` — OKLCH-darkened companions defined next to each fill in theme.css). The ring is what lets a light fill (yellow) read against the page background, and it's why identity discs are never unicode `●` glyphs: a glyph can't wear a border, and its size/baseline drift by font. `<Dot hollow>` is the "nobody" variant — an empty outline for an away member (PlayersStrip presence) or an unfound word (WordList reveal). Size/ring-width/hollow-ring-color tune per site via `--dot-size` / `--dot-border-width` / `--dot-ring` on a caller class. Feedback pills take the actor's color **name** in `GenericFeedbackMsg.dot` and render it with `<Dot>` themselves.

**The name + disc cluster is `<ActorTag>`** (`common/components/game/lists/ActorTag`): a person's name followed by their identity disc, the "who did this" marker the turn logs drop beside each row. Pass it the resolved member (`<ActorTag actor={players.find(…)} />`); it owns the fallback name + the disc color, so the cluster looks identical wherever it appears. (Reach for it before re-rolling a name-span + ● by hand. Note that several older logs still encode the actor by *coloring the name text* instead — a deliberate-or-not divergence from the disc rule below, tracked as a consistency follow-up.)

Two rules keep the signal clean:

- **Identity rides the disc, never the text.** Don't encode a player by coloring a *word* — a colored disc is a far better color carrier (bigger area, no legibility/antialiasing fight), and it discriminates better between palette hues. Keep text legible/neutral and let the disc carry color. The payoff is that any space-constrained surface (think mobile, where there's no room for a name) can fall back to **circle-only** with zero loss — players have already been trained that the circle *is* the person. This is why the `<WordList>` redesign moved color off the word and onto a leading ●, with the word itself black.
- **Don't spend a colored circle on anything that isn't a player.** If a colored circle would read as "a player" where none is meant, pick a different shape or a non-palette color. Two existing instances of this discipline: the chat unread pill is **black**, not a player hue, so it doesn't read as a sender (see [GamePage header](#gamepage-header)); and the spellingbee rank ladder uses **squares**, not circles, for its tiers — a bright-yellow *circle* would muddy the "circle = player" signal, so rank tiers take a different shape (`RankBar.module.css`).

## Interactive tile states

Board tiles a player can act on (psychicnum's word tiles, connections's category
tiles; the pattern every game's tiles share) converge on **one look**, driven
entirely by the `--tile-*` tokens in [`common/theme.css`](../src/common/theme.css)
and the shared `.tile` / `.tileWord` classes in
[`common/components/game/PlayArea.module.css`](../src/common/components/game/PlayArea.module.css).
A player who learns the board in one game reads it in the next.

- **Resting** — a warm fill from the shared **tile ramp** (`--tile-bg`, which
  aliases `--tile-3`, the normal shade — see [The warm tile ramp](#the-warm-tile-ramp)),
  a matching border a step darker (`--tile-border` = `--tile-3-border`), near-black
  ink (`--tile-text`), and a small drop shadow (`--tile-shadow`) so a tile reads as
  a physical tile.
- **Hover** — a **dark** ring (`box-shadow: 0 0 0 2px var(--tile-selected-bg)`,
  composed with the resting shadow). Not accent-blue, not a fill change.
- **Selected** — a **dark fill** with light ink (`--tile-selected-bg` /
  `--tile-selected-text`): the recognizable "I picked this" state, shared by
  both games (single-select in psychicnum, multi-select in connections).

> **This reverses the earlier rule** ("accent-blue rings, never a fill change").
> The NYT dark-fill select reads more clearly than a ring, and going dark-fill
> for *both* games let them share their entire tile CSS. Hover stays a ring (so
> it composes on top of any fill) but goes dark to match.

The hover ring is a box-shadow in the inter-tile gap, so it never shifts layout.
Crucially, **every state that changes a tile's color does so by re-setting the
`--tile-*` tokens on the element** (or drawing an inset frame) — *not* by trying
to out-cascade the shared `.tile` rule. `.tile` reads only the tokens for its
colors, so a `.selected` / result / peer override that re-sets a token always
wins, regardless of which stylesheet loaded last. (This is what makes the shared
base safe to compose with per-game modules.)

**Resting depth, no board frame.** Tiles read as physical tiles via the
token-driven border + `--tile-shadow` — that's enough on its own. Neither
psychicnum nor connections wraps the grid in a "tray" frame (a heavier border +
inner padding): now that the tiles carry their own warm fill and depth, an outer
frame is redundant, and connections' full-width bands want to sit edge-to-edge
anyway. The grid fills its column edge-to-edge. (A tray remains available as a
per-game option if a future board wants one.)

## The warm tile ramp

Tile colors come from **one warm (slightly-yellow) family** in
[`common/theme.css`](../src/common/theme.css) — five shades on a hand-tuned
lightness ramp (lightest → darkest), each with a matching `-border`, plus two
extras. **Default to this ramp for any game's tiles**; diverge only with a real
reason (below).

| token | role |
|---|---|
| `--tile-1` … `--tile-5` (+ `-border`) | the ramp, lightest → darkest |
| `--tile-3` = `--tile-bg` | **the normal tile** — what most games use at rest |
| `--tile-disabled` (+ `-border`) | a darker shade **past** the ramp, for "disabled / missing / spent" (e.g. a scrabble rack tile already on the board) |
| `--tile-attention` | a **translucent warm-yellow OVERLAY** — stack it over any shade (`background: linear-gradient(var(--tile-attention), var(--tile-attention)), <fill>`) to mark a tile "lighter + more yellow" without leaving the family (scrabble's just-placed / turn-viewer tiles) |
| `--grid-cursor` | the shared keyboard/crossword **entry-cursor** ring (orange-brown, deliberately not red/blue since scrabble's premium squares use those) — scrabble, bananagrams |

**Who uses what:** most games take `--tile-3` via the shared `.tile`'s `--tile-bg`
(psychicnum, connections, boggle, scrabble — decided/result states then override by
re-setting the tokens). **stackdown** shades its stack by depth off shades **1–4**
(top = 1, deepest = 4). Legitimate divergences: **wordle** and **waffle** always
colour tiles by the wordle result palette (green/yellow/gray), so they never show a
ramp shade; **codenamesduet** uses its role colors (agent green / neutral tan /
assassin red) with the ramp only for unpicked cards; **spellingbee** uses `--tile-2`
for its hexes + an accent-yellow center. If a game's tiles are always meaning-coded
(wordle), that's the reason to skip the ramp — otherwise reach for it.

The ramp is **hand-tuned, not algorithmic** — a deliberate choice so an individual
shade can be nudged. When a new theme lands (dark mode …), it supplies a fresh ramp
tuned against its background (borders derive as "a darker shade of the fill", which
inverts cleanly); the semantic token names make it a one-file swap.

**The decided tile — a permanent result fill.** A tile is *decided* once its
outcome is known and fixed (psychicnum: a submitted guess — green = a secret, red
= a miss; connections: a tile placed into a solved category — it becomes part of
that category's colored band). A decided tile colors **permanently** by re-setting
`--tile-bg` / `--tile-border`, dropping any spent/dim/grey treatment — the color
*is* the "already decided" signal and a record of what's found vs ruled out. It's
mutually exclusive with the selected dark-fill (a decided tile is `disabled`, so
it's never both).

The fill is the game's **result palette at full saturation**, not a washed-out
pastel — the decided color should obviously carry the *same message* as the
game's other outcome signals. So psychicnum's decided tiles use the saturated
`--color-outcome-*-border` green/red (the exact tone the TurnLog outcome bars
use), and connections' use the four saturated rank colors of the bands. (An
earlier psychicnum used the pale `--color-outcome-*-bg` tier, which read as a
different, weaker signal than its own guess outcomes — fixed.)

A *transient* flash (a brief pop on a just-made move) is a different thing —
prefer the permanent fill when the result is durable.

**Override the resting fill when it collides with a result color.** The beige
resting fill (the default for an untouched tile everywhere) assumes a game's
*result* colors read as distinct from it. codenamesduet is the one deliberate
exception: its neutral (bystander) result is a warm tan (`#b4986e`) close enough
to the beige that an unrevealed beige tile would read as "guessed neutral," so it
sets never-revealed tiles to a lighter, greyer warm off-white (`#f4f1ec`) — still
in the tile-color family, just clearly distinct from the tan. Default everywhere
else stays the shared beige; deviate only when a result color forces it. See
[codenamesduet.md → Board tile colors](games/codenamesduet.md#board-tile-colors).

**Peer-identity frame.** In a shared-selection game (connections coop), a
*teammate's* selected tile is the resting beige + an inset ring in their member
color (drawn inline), while the player's *own* selection is the dark fill. So the
fill says "mine," the colored edge says "whose" — the
[colored-disc identity rule](#player-identity--a-colored-disc) applied to a tile
edge.

### Tile content: letter vs word (A vs B games)

Two kinds of tile, by what they carry:

- **A — one letter per tile** (boggle, waffle, wordle, scrabble, spellingbee,
  bananagrams). A fixed character; sizing is uniform.
- **B — multi-character content per tile** (codenamesduet, psychicnum,
  connections). The content varies in length, so a fixed font can't fit every
  tile.

**For B games, auto-fit the font to the tile** — pure CSS, no JS measuring (it
reacts to the tile's real size, so it composes with the layout-constraint
system). The heuristic lives **once**, in the shared `.tileWord`: the tile is a
`container-type: inline-size` query container and the label is
`font-size: clamp(var(--tile-font-min), calc(100cqi / (var(--len) *
var(--tile-font-factor))), var(--tile-font-max))`, where `--len` is the content's
character count (set inline by the board component) and `100cqi` is the tile's
inner width. Each game tunes the **three knobs** by setting
`--tile-font-{min,factor,max}` on *its* grid: **`factor`** ≈ width-per-char in
`em` for the bold-uppercase glyphs (~0.9 — raise to shrink, lower to enlarge);
**`min`** the floor so long content stays legible; **`max`** the ceiling so short
content doesn't go cartoonish (the band between is where length differences
*show* — too low a max makes every word clamp to one size). `container-type:
inline-size` is font-fitting infrastructure, layout-safe — it doesn't change the
tile's size.

## The play surface → playarea.md

The play-surface reference — the two-column PlayArea layout, the info-column
readouts, text entry (capture, not `<input>`), the turn log, the word list (its
two-axis KIND/WHO filter + the both-lists terminal reveal), the turn-history
viewer, and board sizing — lives in **[playarea.md](playarea.md)**, which also
documents how each game's PlayArea is decomposed into `BoardCol` / `InfoCol`. This
doc keeps the visual language around it: theme/tokens, tiles + the warm ramp, page
chrome, modals/dialogs/toasts, mode pills, and iconography.

### Game versions (v1 → v3)

**v3 is the current standard — the full rule set this doc + playarea.md define**
(semantic buttons + tones, the feedback-pill tone border + bar, opponent-strip
identity discs + metric labels, the terminal look for locally-terminal states,
sticky local feedback, natural-width action buttons). v1 was the original per-game
layout; v2 the intermediate shared-layout scaffold. **The sweep is complete — all
fifteen games are v3**, with bananagrams and crosswords the two documented layout
exceptions (their own board layouts; see their game docs). There is no v4. A game
doc calling a game "v3" means "conforms to this standard."

## Mode pills

A gametype's interaction `mode` (`'coop'` / `'compete'`, on the manifest) is **not** baked into its display `name` — it's shown at presentation time as a small colored pill via the shared [`<ModePill>`](../src/common/components/game/ModePill.tsx). So a coop + compete sibling pair carries the same `name` (e.g. both manifests say `wordle`), distinguished by the pill.

Rules:

- **Spelling.** The DB, code, and gametype strings spell it `coop`; the **UI says "Co-op"** (and "Compete"). The one place the FE text differs from the stored value — `MODE_LABEL` in [`lib/games.ts`](../src/common/lib/games.ts) owns the mapping.
- **Look.** An outlined chip — transparent background, with the border and text both in the mode color: co-op = teal, compete = purple (`--color-mode-*-text` in `theme.css`). Deliberately outside the won/lost/active outcome palette so a mode pill never reads as a result.
- **Solo clubs.** In a solo club (handle starts with `=`, one player) **no pill renders** — neither "Co-op" (no one to cooperate with) nor "Compete" — **with one exception**: a compete variant whose manifest declares **`aiOpponent: true`** (scrabble — solo play seats an autonomous AI opponent) shows an **"AI Compete"** pill, because there IS someone to beat. A compete variant *without* an AI (bananagrams) is "compete for 1" — a race with nobody to beat, effectively coop — so it stays pill-less. The flag lives on the manifest so the club UI never has to know about specific games (the removability invariant); pass `soloClub` + the manifest's `aiOpponent` to `<ModePill>`.
- **Where it shows.** Anywhere a gametype name appears next to its mode: the per-gametype Start buttons (`StartGameButtons`), the club's games list (`ClubGameCard`), and the club editor (`EditClubDialog`). The Start buttons + games list pass `soloClub` (so solo clubs show no pill); the editor **never** passes it, so it always shows the pill — it lists both siblings, and the pill is the only thing distinguishing two now-identically-named rows. The setup dialog confirms the mode in its title via `MODE_LABEL` (dropped in a solo club, matching the suppression).

Because the pill carries the mode, the per-game `labelFor` status strings (shown on the same card) **do not** repeat it: they're bare (`solved`, `ada won the race`, `racing…`), never `coop · …` / `compete · …`. When adding a game, keep mode out of `labelFor`.

## Button iconography

Recurring action buttons share an **icon language** so a player learns a glyph
once and reads it everywhere ([Consistency across games](#consistency-across-games)).

**We use [Lucide](https://lucide.dev) SVG icon components (`lucide-react`) — not
an icon font, not color emoji.** Why:

- **Not an icon font.** Fonts put glyphs at private-use codepoints (a11y/SEO
  hacks), ship a whole file or need subsetting, and can FOUT. The dated approach.
- **Not color emoji** (`💡 🔑 ♻️ 🏁`). They render *differently per platform* and
  as **color stickers** that clash with our monochrome line-art — and many
  icons we need (hint, answer) have no good monochrome unicode at all.
- **Lucide SVG components** are tree-shakeable (import per icon, only ship what
  you use), monochrome line-art that inherits `currentColor` and scales with
  `size`, one consistent 2px stroke — and it's the same *form* we already use
  for the logos / chat bubble, just finished.

**The map lives in code** as the semantic icon registry `common/components/icons.ts`
— each action re-exported under a semantic name (`Lightbulb as IconHint`, …), so
components import `<IconHint />` and never `lucide-react` directly. Change a glyph
once there and every button follows. Today's full set of direct importers is the
registry itself; psychicnum + connections + the shared `ShuffleButton` /
`BackToClubButton` / `PauseButton` consume it (other games adopt it as they grow
icon buttons).

**The map** (decided; roll out game-by-game):

| button | Lucide | button | Lucide |
|---|---|---|---|
| Rotate / shuffle | `RotateCw` | Pass | `SkipForward` |
| Up one level (back to club) | `ChevronLeft` | Swap tiles | `ArrowLeftRight` |
| Submit a move | `Triangle` (points up) | Recall | `Undo2` |
| Get hint | `Lightbulb` | Dump | `ArrowLeftRight` |
| Use AI (e.g. clue suggester) | `Sparkles` | Pause | `Pause` |
| Spoiler — one item, mid-game | `Eye` (`IconSpoiler`) | Peel | `Banana` (`IconPeel`) |
| Check my own work against the rules | `SpellCheck` (`IconWordCheck`) | | |

**The menu is the legend.** Icon-only buttons carry their names in hover
tooltips, and a touch device has no hover — `TooltipHost` disables the hover
path there outright, because a tap's synthetic hover leaves a stuck bubble. So
the glyphs had no legend on the surface with the least room for words. The fix
is [`MenuItem.icon`](../src/common/lib/games.ts): the game menu already spells
these actions out (Restart, New game, Reveal answer, Hint, Spoiler, End game,
Concede, Back to club, Print), so each row shows its glyph beside its name.
A button whose glyph isn't in the menu yet gets a row **added** — that's how
hint + spoiler reached letterboxed, psychicnum and stackdown, and how
letterboxed got the Reveal solution row its terminal button had been missing.
A greyed row still teaches, so a row is disabled rather than dropped when the
action isn't available — the exception being an action the mode never offers at
all (letterboxed's help ladder in compete, crosswords' Reveal submenu), where
naming a glyph the surface never shows would teach a lie. The pairing is taught
once, at the point of need, and reads in all fifteen games afterwards — for no
board space and no per-tap cost, which is what rules out a tap-to-reveal on the
buttons themselves (it would tax every future tap to answer a first-encounter
question) and a Help-page legend (nobody opens it at the moment of doubt).

Two rules keep it honest. **Icons come from the semantic registry**, never
`lucide-react` directly — the registry is the one place a glyph is chosen, so
the menu can never teach a symbol the button doesn't use; `MenuItem.icon` is
typed `LucideIcon`, the same type `ActionButton.icon` takes. And **the gutter is
reserved per menu**: once any row has an icon every row gets the slot, so labels
share one column instead of going ragged — while a menu with no icons at all
(nothing in it maps to the language) gains no indent for a feature it doesn't
use. The disc and the glyph SHARE that slot: an account row names a person, an
action names a deed, and no row is both. Which rows get one: everything with a
button glyph, plus Print — a printer is instantly scannable in a list of words,
and if a print button ever appears it has already been taught. Pinned by
[`Menu.test.tsx`](../src/common/components/panels/Menu.test.tsx).

**Four glyphs are self-evident and are exempt.** Not every icon-only button
needs a menu row: some glyphs are read correctly by anyone who has used a
computer, and a row for them would pad every menu to teach nothing.

| exempt glyph | where |
|---|---|
| Shuffle / rotate (`IconShuffle`) | boggle, connections, psychicnum, scrabble, spellingbee, wordwheel, bananagrams |
| Pause | the `GamePage` header, every game |
| Delete / backspace (`IconDelete`) | the shared `EntryRow` |
| Submit — the up-arrow (`IconSubmit`) | `EntryRow`, and each game's commit button |

The test is whether the glyph is a *convention* — a backspace arrow and a pause
bar mean the same thing in every app the friends already use — not whether it's
merely *guessable*. A lightbulb is guessable; whether it hands you a clue or the
answer is exactly what the menu row settles, so hint and spoiler are not exempt.
The rest of the audited list (scrabble's commit row, the phone-only icon-only
buttons, crosswords' lettered squares) is **still open** — not exempt, not yet
paired.

**Long-press names a button on touch.** Holding an icon-only control opens the
same bubble hover would. Nothing is lost by claiming the gesture — a button has
no text to select — and it costs nothing to anyone who already knows the glyph.
**The load-bearing detail: the press must swallow the click that follows it.**
Lifting after a long press still fires `click`, so without that, holding a
button to learn it says "End game" would *end the game* — verified in a real
browser, where removing the suppression opens the confirm dialog. The bubble is
dismissed by the next touch (there's no pointer-leave to end it — a stuck bubble
is the failure the old blanket gate avoided), a drag cancels it as a scroll, and
`contextmenu` is suppressed on tooltip targets so Android's own menu doesn't
open over it.

**The two platforms need two different suppressions**, which is worth knowing
before someone consolidates them. Android's long-press menu arrives as a
`contextmenu` event, so `TooltipHost` calls `preventDefault()` on it. iOS
Safari's callout (Copy / Look Up / Share) does **not** — Safari fires no
`contextmenu` for a long press — so the JS half can't touch it; it takes
`-webkit-touch-callout: none` (plus `user-select: none`, since the callout is
the text-selection UI in another hat) on `[data-tooltip]` in `theme.css`.
Without it the bubble still opens on an iPhone, with the system menu sitting on
top of it. No desktop browser reproduces this, headless or not, so the CSS rule
is guarded by reading the stylesheet. Pinned by
[`TooltipHost.test.tsx`](../src/common/components/tooltips/TooltipHost.test.tsx)
and [`tooltip-longpress.e2e.ts`](../e2e/tooltip-longpress.e2e.ts).

**One glyph names a direction, not a thing: `IconBack`.** Every other entry
above names the action or the object; the chevron names "up one level" (game →
club, and club → home behind `⇧<`). Two reasons it stays that way, both worth
knowing before someone "fixes" it into a `House` and a `Users`:

- **The ups never co-occur**, so it can't be ambiguous — from a game the only
  way up is its club, from a club it's home, and no screen offers both. That's
  what separates it from the arrow-like cluster (`IconRestart` / `IconUndo` /
  `IconShuffle`), which *had* to be told apart because they share an action row.
- **It's the only thing that teaches `⇧<`.** The button draws the glyph without
  printing the key; the menu item prints the key without drawing the glyph. The
  chevron looking like `<` is what ties them together, and a destination glyph
  would quietly spend that.

If a screen ever does offer both ups at once, prefer adding the **word** ("<
Club" / "< Home") over swapping the glyph, so the mnemonic survives.
| Reveal — the whole solution, at game-over | `View` (`IconReveal`) | | |
| End game | `OctagonX` (`IconEnd`) | Zoom to fit | `Fullscreen` (`IconZoomFit`) |
| Concede | `Flag` (`IconConcede`) | | |
| Clear selection | `Eraser` | Help / rules | `CircleQuestionMark` (`IconHelp`) |
| Restart board | `SkipBack` (`IconRestart`) | New game (fresh board + id) | `SquarePlus` (`IconNewGame`) |

**Conventions:**

- **The icon is decorative; the button carries the label** (visible text, or
  `aria-label` on icon-only buttons). So the icon is `aria-hidden`.
- **Styled tooltips, not the native `title`.** Some browsers delay the native
  bubble so long users never see it, so buttons carry a `data-tooltip`
  attribute and the single **`<TooltipHost>`**
  (`common/components/tooltips/`, mounted once in App.tsx like ToastHost)
  draws a small dark bubble after a ~400ms beat (about a third of the native
  delay; also on `:focus-visible` keyboard focus; hover is gated on
  `(hover: hover)` so a touch tap doesn't leave a stuck bubble; hides
  instantly on leave/blur/press/scroll). `ActionButton` wires
  `tooltip ?? label` automatically — every purpose button has a tooltip by
  default, and a caller passes `tooltip` to say something richer than the
  label; ShuffleButton / PauseButton / BackToClubButton carry theirs
  directly. The attribute is usable on ANY element as other spots want
  tooltips later. The host measures and **clamps the bubble to the
  viewport** — above the anchor by default, flipped below near the top edge
  (no per-button placement flags), x pinned inside the edges — and the body
  portal escapes `overflow: hidden` ancestors. (An earlier pure-CSS `::after`
  version couldn't see the viewport and clipped at the edges; that's why this
  is a JS host.) The bubble is `aria-hidden` — the accessible name stays on
  the button itself. One known trade: disabled buttons don't fire mouse
  events, so their tooltips don't show.
- **Sizing:** ~`size={15-16}` for an icon beside a text label, ~`size={20-24}`
  for an icon-only pill.
- **The icon-and-label shape is the global `.icon-button` class** (`theme.css`):
  `display: inline-flex; align-items: center; justify-content: center; gap:
  0.4em` — defined once, composed via `cls()` the way `secondary` is, so a button
  is `cls('icon-button', styles.someModifier)` (or `cls('secondary',
  'icon-button', …)`). It's pure shape — fill/border come from the base `<button>`
  or `secondary`, width from a per-button modifier (`.inputButton`'s `min-width`,
  `.helperButton`'s flex-grow). **Not** for icon-only pills (`ShuffleButton`,
  `PauseButton`) — those are a separate round, fixed-size, label-less shape that
  styles itself.
- **Decided picks worth noting:** **Submit-a-move = `Triangle`, pointing UP.**
  A move-submit "sends" the move up to the other players (our boards put YOU at
  the bottom, others above — codenamesduet's keycards literally so), and pointing
  up keeps the RIGHT-pointing play triangle reserved for the play/resume idiom.
  Same triangle family, direction = meaning. This is ONLY for sending a game
  move/guess/clue — NOT the setup dialog or other form submits. **Shuffle/rotate
  = `RotateCw`** (read clearer than the crossing-arrows `Shuffle`, and spins
  nicely on the existing hover-spin).

**Peel** (bananagrams) is now the semantic **`PeelButton`** (primary weight,
`IconPeel` = Lucide `Banana` — on-brand for MonkeyGrams and reads as its own
action, not a generic submit). The `🍌` emoji survives only in the **feedback
pill** copy ("🍌 Peel! You drew 1 tile"), not the button. **`ZoomFitButton`**
(`IconZoomFit` = `Fullscreen`) is bananagrams's zoom-to-fit — a plain square
icon-only button. bananagrams's **dump** uses `ArrowLeftRight` (`IconExchange`),
the same exchange glyph as scrabble's tile swap, in both the dump zone and the
dump feedback pill (`FeedbackMsg.text` is a `ReactNode`, so a pill can lead with
an inline icon).

**Rollout.** Complete — **all fifteen games are v3**, so every game-move / end /
hint / reveal / concede is now a semantic component from
`common/components/buttons/`, and **End (or Concede)** is an info-column
action-row *button*, never a GamePage-menu item. The roster of semantic buttons:
`SubmitButton` · `SubmitWithScore` · `DeleteButton` · `ClearButton` ·
`HintButton` · `RevealButton` · `AIButton` · `EndGameButton` ·
`ConcedeGameButton` · `EndTurnButton` · `PassButton` · `ExchangeButton` ·
`PeelButton` · plus the label-less pills `ShuffleButton` / `PauseButton` /
`BackToClubButton` / `ZoomFitButton`. Still on their old glyphs / pending: the
chat bubble, the `×` close, and the `✓`/`✗` marks.

**Two axes + natural width.** A semantic button composes from `ActionButton`'s two
axes: **weight** (`primary` = the filled-accent main action like Submit; `secondary`
= the outline everything else builds on) and **tone** (the same `neutral | success |
error | warning | info | near` vocabulary + palette as the feedback pills — a
`warning` button is the exact amber of a `warning` pill). Today: Hint / Reveal =
`warning`, End = `error`, Submit = `primary`, Clear / Delete = `neutral`. Action-row
buttons size to their **own icon + label** (`flex: 0 0 auto`), left-aligned — they do
**not** stretch to equal widths or the column's right edge: equalizing widths clipped
a longer label's icon, and unequal widths actually *aid* recognition ("Hint is the
short one"). Need a button with no semantic component yet? **Create one** (a one-line
wrapper around `<ActionButton>`) — never hand-roll a one-off `<button>` in a game.

**End vs Concede** are distinct components for distinct actions: **End**
(`EndGameButton`) is the neutral mutual "we're done" that stops the game for
everyone; **Concede** (`ConcedeGameButton`) is one player dropping out of a race
that continues without them. They were near-identical buttons — same flag, same
red — on the assumption that a game shows one *or* the other. **bananagrams
shows both at once** (its compete row has End alongside Concede), where two red
flags read as the same act twice, so they diverged 2026-08-03:

- **End** took `OctagonX` — the stop sign, crossed out — putting it in a family
  with `IconEndTurn`'s plain octagon (Pass ends just your turn; the X marks the
  bigger stop). Both are on screen together in scrabble, and they also differ by
  tone: Pass is amber, End is red.
- **Concede** kept the **flag**: surrender, one player, not a stop for the table.

They still share the `error` red — both are irreversible — and stay separate
components so they can diverge further (a concede should hand the opponent the
win).

**End's label is the full "End game"**, not a bare "End". Most games render it
icon-only, where the label *is* the accessible name and the tooltip, and "End"
alone doesn't say end what. It also stopped substring-matching the pause
overlay's "Susp**end** and return to club", which an e2e had been working around
with `exact: true`.

## Explicitly deferred

- **Responsive mobile layouts** beyond graceful degradation.
- **User-selectable themes** (dark / light / pink picker). Foundation is there; mechanism + UI + persistence aren't.
- **Animations and transitions** beyond the existing `:hover` brightness on tiles.
- **A literal palette layer** (`--color-gray-100`, etc.). Overkill at ~15 tokens; revisit at ~50+.
- **Font-size tokens** (`--text-sm`, `--text-base`, …). Components pick raw rem values ad-hoc; standardize when the variety becomes noise.
- **Promoting the board `.board` wrapper + `.grid` base into the shared
  `PlayArea.module.css`.** Today psychicnum's `Board.module.css` and
  connections' `PlayArea.module.css` carry a byte-identical `.board` wrapper
  (`flex: 1 1 0; min-height: 0; display: flex; flex-direction: column`) and a
  near-identical `.grid` base (the per-game bits being the track definition + the
  `--tile-font-*` knobs). Tempting to share now, but both current boards are the
  same shape (a grid of equal tiles filling the column). The deferral condition —
  "wait until a structurally different board exists" — **has since been met**:
  scrabble's 15×15 premium board, boggle's dice grid, and crosswords' grid are all
  live and genuinely different shapes. So this is now a **judgment call, not a
  blocked item**: the promotion could be done, extracting what's actually common
  across the real range of boards rather than guessing — but it hasn't been, and
  there's no forcing reason to. (The per-game `.board` comments already name this
  as the future single place a framed board would live.)
- **Per-game UI testing** beyond what already exists. Manual smoke is the bar for now.
