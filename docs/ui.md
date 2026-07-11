# UI

Visual direction and design rationale for the frontend. The *what we render and why it looks that way* layer.

For the mechanics — CSS Modules, file co-location, `cls()`, what we don't use — see [`code-conventions.md → CSS Modules + theme`](code-conventions.md#css-modules--theme). This file picks up where that one stops.

Read this before:

- Adding a shared component to `common/`.
- Touching `common/theme.css` or a per-game `theme.css`.
- Designing the screens for a new gametype.

## Audience and platform: desktop-first

The play surface is a laptop or desktop browser. Some games are awkward on mobile by their nature (crosswords, Boggle on a phone); even the ones that *would* play fine on mobile are most fun with a keyboard and a wider canvas. So:

- **Default styles are written for desktop.** Use `@media (max-width: …)` to add mobile adjustments only when something genuinely breaks. The opposite — mobile-first authoring with `@media (min-width: 1024px)` overlays — shipped some of the existing code ([`PlayArea.module.css`](../src/codenamesduet/components/PlayArea.module.css)'s three-column layout); fine to leave alone, but new code should be desktop-first.
- **Mobile gets graceful degradation, not engineering.** Phone users should be able to read the page and use the app; we don't chase pixel-perfect mobile layouts.
- **The real mobile pass has begun.** It proceeds one screen at a time and is recorded in [`mobile.md`](mobile.md) — the single `56.25rem` (900px) desktop→mobile breakpoint, what's been made phone-safe so far, and how to verify no-scroll headless. Still desktop-first: mobile is a `max-width` exception that never changes the desktop layout.

## Layout stability

**A game page's shape is allocated at mount, and that shape doesn't change during play.** State updates rotate content *within* slots; they don't resize, reposition, or reflow the slots themselves. Rare, content-rich moments (terminal result, error explanations, postgame celebrations) escape into modals rather than dedicating in-page space for the case where they're empty.

Closest existing model: NYT Connections. The grid is the grid from start to finish; the lives row is always there; the matched-band stripe at the top is always there. What changes is *which tiles are dark, which bands are bright, which copy is in the feedback slot.* The frame is fixed.

Why this matters here:

- **Future games eat all the space.** A crossword board needs every available pixel; an extra `min-height` on a "your turn / waiting for partner" banner that grows by 24px when state flips is 24px the grid doesn't get.
- **Reflow during play is jarring.** Tiles jumping because a status message above them gained a second line, or a result banner appearing mid-page and pushing everything down, breaks the "I'm playing a game" tone in a way "the layout is wrong" never quite does.

### Patterns this implies

- **Status-text rotation in a fixed slot.** "Your turn to give a clue," "Peer is giving a clue," "Clue: BIRD 3" all render into the same DOM region, sized at mount for the worst-case string. Empty / loading state ("No clue yet") is that same height too.
- **Always-present feedback slot.** "Already tried that," "Correct!," "Out of guesses." A dedicated slot that's the same height whether populated or empty. Content fades in and out; the slot stays. (See "Feedback pill" below.)
- **Scrollable regions for unbounded lists.** Guess history, clue history, chat. The outer container is fixed; the inner content scrolls. The game frame doesn't grow with the history.
- **Modal for rare-and-rich.** "You won!" / postgame summary / "Play again?" → modal that overlays the static layout. The play surface below stays visible in review mode; the modal carries the high-content celebration.
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
  variant?: 'fill' | 'outline'          // 'outline' (transient, default) = white bg + tone border;
                                        // 'fill' (permanent) = lightened-tone bg + tone border (reads *more* like its tone)
  dismiss:
    | { kind: 'timed'; ms?: number }   // self-dismiss after delay (default ~2200ms)
    | { kind: 'sticky' }                // persists until caller's next show()/clear()
    | { kind: 'closeable' }             // persists; user-dismissed via × on the pill
}

feedback: {
  show: (msg: FeedbackMsg) => void
  clear: () => void
}
```

**Dismiss modes — when to use each:**

- **`timed`** for transient acknowledgment that auto-fades. connections's "Already tried that," "Wrong guess." The default workhorse.
- **`sticky`** for state-driven info the game itself will clear. codenamesduet's "Waiting for clue from peer" persists until the clue arrives, at which point the per-game hook calls `show()` again with new content (or `clear()`) — caller-controlled lifetime.
- **`closeable`** for user-acknowledged content. Persistent tips, instructional banners, warnings the player should see-and-dismiss. Renders a `×` button on the pill.

**Transient vs permanent (`variant`).** Every pill's **whole border is the tone color** (saturated `--color-outcome-*-strong`) — a thick **left bar** (like the turn-log outcome bars) plus thin sides in the *same* color, uniform width on every pill. (A pale-grey side border read as no border, so the sides carry the tone too; `neutral` has no tone, so its border is a visible dark grey.) The `variant` axis only changes the **background**: most feedback is *transient* and uses the default `outline` — a plain white background. *Permanent* feedback — the terminal message, or an end-game mode like codenamesduet's sudden death — uses `fill`: a **lightened-tone background**, so a permanent `error` (light-red fill) reads as *more* emphatically "error" than a transient one (white fill). The fill is the permanence signal. **Peer identity is independent of this axis:** a message about another player ("● leah found APPLE") carries a leading `dot` in their player color regardless of fill/outline — the dot, never the fill, says *who* (the `dot`-carries-identity rule from [Player identity = a colored disc](#player-identity--a-colored-disc)).

**Tone follows the event, not the viewer's stake.** One event reads as **one tone everywhere**, regardless of whether it helps or hurts the viewer. A *found word is green* in **both** modes: coop (a teammate found one) and compete (an opponent found one — adverse to me, but still "they found a word"). We do **not** recolor by competitive stake. Otherwise the player maintains two color-meanings for the same event — green-means-found in coop, something-else in compete — which is hard to learn and easy to misread; the identity `dot` already says *who*, so the tone is free to say only *what happened*.

**Semantics:**

- Latest `show()` replaces whatever was there — no queue, no stack. Race-condition simple.
- `clear()` empties the slot regardless of dismiss mode.
- The state lives in `<GamePage>`; the auto-clear timer for `timed` mode is owned by `<GamePage>`, not the caller.
- **Pause transitions don't auto-clear feedback.** `<PauseOverlay>` covers the play surface, not the header; an active pill stays readable through a pause/resume cycle. If a specific feedback shouldn't survive a pause, the caller clears it explicitly.

### Toasts

A **toast** is a bottom-right **announcement** — a *different surface* from the feedback pill above, for a different job. Feedback is about *your* action, near your eyes (the input, or the header for peer moves); a toast is a *club/game event you should notice wherever you are on the page* — a friend added you to a game, a friend is setting up the next one. Toasts **stack vertically** (newest nearest the corner), sit **above everything including the chat panel** (z-index 12000), and each carries an **✕** plus an optional single **action button** (e.g. "Join"). There are no validity tones here — a toast is neutral chrome with a tone accent stripe; it's an announcement, not a verdict.

One shared store + one host: any code calls `showToast(spec)` / `dismissToast(id)` (`lib/toast/toastStore.ts`), and the single `<ToastHost>` (`components/toasts/`, portaled to `<body>`, mounted once in `App.tsx`) renders the stack. The host is capped to the viewport and scrolls internally, so a flood of toasts never scrolls the *page* (the [page-never-scrolls](#page-height-fits-the-viewport) invariant). Consumers today: game invitations (`useGameInvitations`, now headless) and the "…is setting up a new … game" club heads-up (`useClubSetupPresence`). See [common-folders.md](common-folders.md) for the file homes.

### Modals for terminal results

Game-end "you won / you lost" UI lives in a shared modal (`common/components/game/terminal/GameOverModal.tsx`), not an in-page banner. The modal serves the principle and the future-bling expectation (animations, victory GIFs, larger postgame summaries) better than a static in-page section.

The page underneath stays in *review mode*: the final board, revealed unmatched categories (connections), both key cards (codenamesduet), the winning number (psychicnum). The modal carries the moment-of-result; the page stays available for "let me look at the board for a sec."

**Auto-pop on terminal.** Each game's PlayArea opens the modal in two cases:

1. **Navigate into an already-terminal game** (from ClubPage's "Other games" list) — initial `useState(isTerminal)` pops it on first render.
2. **Mid-play transition** to terminal — the same player who just made the last move sees the modal pop immediately; peers see it via realtime as their `isTerminal` flips and the watching effect fires.

**No reopen after close.** Once the player dismisses the modal, it's gone for the session. The PlayArea is in review mode; the user has already seen the verdict. No "Show summary" affordance — the modal isn't worth seeing twice.

**No backdrop.** Matches the Help / chat / hint modals — the user can click the board to start reviewing immediately without first dismissing the modal.

**Back-to-club skips suspend-confirm.** Terminal game = no progress to lose. The modal's "Back to club" button and each PlayArea's terminal indicator both call the same `goToClub: () => void` on `GamePageCtx`, which `<GamePage>` wires to direct navigation. The GamePage menu's "Back to club" item already does the terminal-direct-nav branch; same logic is now exposed for downstream consumers.

**PlayArea terminal indicator.** After the modal closes (or for users who never opened it because they were already in review), the slot where input/action UI lived shows a small "Game over: `<status>` [Back to club]" indicator. The status word matches the modal's title in lowercase. Per-game (the indicator's slot location differs across games), but always carries the same two pieces of information.

**Component shape** (deliberately bare — the modal stays focused on the moment-of-result; everything else lives on the PlayArea):

```ts
type Props = {
  outcome: 'won' | 'lost'   // drives the subtle tonal accent bar
  verdict: string           // centered large body text — "You win!",
                            // "You lost: out of guesses", etc.
  onClose: () => void
  onBackToClub: () => void
}
```

The FloatingPanel title bar is always `"Game over"`. The `verdict` is the centered large-font line in the body — the important per-status copy that the user actually reads. **No detail prop.** Anything a player might review (revealed tiles, matched categories, the secret number, mistake count) is already visible on the PlayArea; the modal doesn't repeat it.

The per-game PlayArea picks the right verdict per status (play_state + timer.expired + game data) and passes it down.

**The celebration variant.** `common/components/game/CelebrationDialog.tsx` (confetti glyphs + optional jingle, ported from crossplay) is the festive alternative a game can pop **instead of** the GameOverModal for a win. Its trigger contract is the *inverse* of the GameOverModal's: the `useCelebration` hook pops it **only when the win lands mid-session** (the `playState` flip arriving via realtime — so the whole group celebrates together), never on mounting an already-won game (that's review, not winning), and it re-arms if the game un-terminals (replay-board). **Waffle and wordle** take this treatment — each skips the GameOverModal entirely (the verdict is carried in-page by the below-board pill + the action-row outcome line) and celebrates coop solves. Gate it on `playState === 'won'` alone — synchronously available from ctx and coop-only by the states vocabulary; gating on async-loaded game data fakes a mid-session flip on every mount of a won game. The wider adoption plan is [celebration-ideas.md](celebration-ideas.md).

### Dialog buttons

macOS-style placement, consistent across every dialog / modal / confirm: the action row is **right-justified** (`justify-content: flex-end`), with the **default/primary action rightmost** and Cancel (the `secondary` button) to its left — so Cancel comes *first* in the DOM, the primary button *last*. Single-button dialogs (Help's "Got it", GameOverModal's "Back to club") right-justify the lone button. Each dialog owns a small `.actions` / `.buttonRow` flex rule, all sharing `gap: 0.75rem` and `min-width: 6rem` on the buttons. `PauseOverlay` is the deliberate exception — it's a page-context banner, not a modal, so its buttons center.

The **setup dialog** (`<SetupGameDialog>`) extends this: an icon-only [`<HelpButton>`](../src/common/components/buttons/HelpButton.tsx) (`IconHelp`) is pinned to the **far left** of the footer (`justify-content: space-between`), with the Cancel/Start pair keeping the standard right group. Clicking it opens the game's Help as its own `<FloatingPanel>` *on top of* the setup dialog (which stays open behind it) — so you can read the rules mid-setup, unlike the in-game menu's Help. The icon-only Help button is excluded from the `min-width: 6rem` floor (that floor is only for the two text buttons). Setup fields that recap a value (Timer everywhere; spellingbee's Dictionaries + Custom letters) sit behind a shared [`<SetupSection>`](../src/common/components/setup/SetupSection.tsx) disclosure whose summary shows the current value (`Timer: none`, `Dictionaries: 3 (Familiar) / 5 (Obscure)`, `Custom letters: A-CHIROT`), closed by default.

**Back to club** — the one button that recurs across surfaces (every game's post-terminal indicator + the GameOverModal CTA) is the shared [`<BackToClubButton>`](../src/common/components/buttons/BackToClubButton.tsx), so the glyph (a `‹` U+2039 chevron, `aria-hidden` so screen readers just say "Back to club"), its spacing, and the label stay identical everywhere. `variant` only swaps the fill — both the in-page terminal indicators and the modal CTA now use `primary` (filled accent); `secondary` (outline) is the component default, used elsewhere (e.g. the pause overlay's "Suspend and return to club"). The GamePage *menu* item is plain text, not this button.

### Existing offenders to retrofit

Not a big-bang refactor — these get fixed game-by-game as we work through the UI sweep:

- **codenamesduet turn-state messaging.** Audit needed — does "your turn to write a clue" occupy the same space as "waiting for peer's clue" and "peer gave you: BIRD 3"?
- **Guess / clue history scroll containment.** Verify each is a scrollable region inside a fixed outer, not a grow-with-content list.

## Page-height fits the viewport

**A page's height equals the viewport's height — content scrolls within fixed sub-frames, not by scrolling the page itself.** Same intent as native apps and the games we replace (NYT Connections in the browser, Wordle, Boggle on a phone): the chrome stays put; growth-prone surfaces (chat, guess history, club's games list) absorb height inside their own frames via `overflow-y: auto`.

Why this matters:

- **Chrome stays predictable.** Headers, status slots, action rows live where the user expects them at all times — accidentally scrolling the page can't hide them.
- **Game surfaces don't get clipped.** A crossword grid pushed half-off-screen because the user nudged a trackpad is broken UX. The page can't scroll; only the parts that *should* scroll do.
- **Pairs with [Layout stability](#layout-stability).** Together: shape doesn't change during play (Layout stability), AND shape never grows past the viewport (this rule). State updates rotate content within slots; long lists scroll within sub-frames; the document itself never moves.

### Rolling out

Game-by-game and page-by-page, not a global `body { overflow: hidden }` bomb. Pages that already fit naturally don't need work; pages that overflow get a refactor when we sweep them.

Today this principle binds on:

- **ClubPage** — fits the viewport via `height: calc(100vh - body padding)`; the "Other games" list is a fixed-size frame with internal scroll. See [ClubPage header](#clubpage-header) below.

Future targets:

- GamePage (already mostly fits; needs a sweep for long terminal-state result lists).
- Each per-game PlayArea — crosswords + future word-grid games are the most demanding.

### Patterns that follow from it

- **Internal scroll on growth-prone lists.** Chat history, guess log, clue list, game roster. The container has a fixed height (often via `flex: 1; min-height: 0` inside a column-flex parent that's bounded); `overflow-y: auto` makes it scroll.
- **Two-column layouts above a certain content threshold.** When vertical space runs out, split sideways instead of letting one column grow. ClubPage's "active + start" vs "other games" is the canonical example.
- **Modals for rare-and-rich.** When a page genuinely needs more space than the viewport offers and columns don't help, reach for a modal before letting the page grow. Same intuition as [Modals for terminal results](#modals-for-terminal-results) above.

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

### User-selectable themes (deferred)

Dark / light / pink / etc. as a *user setting* is deferred. The foundation is there — CSS vars at `:root`, semantic names — but the switching mechanism (a `[data-theme]` selector, `prefers-color-scheme`, a per-user setting in `common.profiles`) is YAGNI until somebody actually wants it. Don't pre-engineer.

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

**Shortcut hints.** A `MenuItem` may carry an optional `shortcut` string (e.g. `'⌥C'`) rendered right-aligned + muted. Two are shell-global (work on any game, dispatching to the game's own menu items / actions): **⌥⌫** fires End/Concede (finds the `end-game`/`concede` item and clicks it), **⇧<** fires Back to club. Both bail inside any editable field, so ⌥Backspace stays "delete word" while typing.

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

**Focus.** The game menu is given `returnFocusOnClose={false}` (Menu.tsx), so closing it blurs the trigger and lets focus fall to `<body>` — a keyboard-first board (crosswords) resumes reading arrows instead of a focused logo swallowing them / reopening the menu. `Menu` also `stopPropagation`s its own keydowns so arrowing through the menu never doubles as a board move. Non-game menus (UserMenu) keep the standard Esc-restores-focus a11y.

**Overflow.** A long menu (crosswords lists ~20 items) never grows the page: the popover is capped at `max-height: calc(100vh - 5rem)` and scrolls internally.

**Pause behavior.** The menu is openable while paused. Game sections vanish because PlayArea unmounts on pause; the cleanup return on the PlayArea's `setGameSections` effect clears them (`setGameSections([])`), so a paused menu is empty until resume.

**Keyboard.** Enter / Space on the logo opens the menu and focuses the first enabled item. Arrow up / down navigate; Enter or Space activates; Esc closes. Tab while the menu is open closes it and advances focus normally. Disabled items are skipped by arrow navigation.

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

- **Left column** — the club name + handle, the active game card (when there is one), and the per-gametype Start buttons. Stacked content, no internal scroll. **Sibling-manifest families** (coop + compete variants of the same `baseGametype` — see [`common.md` → The sibling-manifest pattern](common.md#the-sibling-manifest-pattern)) render today as two independent buttons, sorted in registry order. Future treatment may group siblings as a single visual block (one logo + two side-by-side Start buttons labeled "coop" / "compete") — the `baseGametype` field on each manifest is the hook for that grouping.
- **Right column** — the "Other games" list as a fixed-size frame with internal `overflow-y: auto`. Suspended games carry their yellow corner flag; completed games sit alongside, muted. The friends can scroll back through history without the rest of the page moving.

The body Members list and the `/c/<handle>` URL line are gone — the header's `<PlayersStrip>` carries identity, and the URL is in the browser address bar already.

**Keyboard navigation.** The page has exactly TWO keyboard tab stops: the
start-a-new-game list and the completed/shelved list (the containers
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

### Components

Same principle, applied to components.

**The chrome is shared.** Cards, banners, chat, login, the home page, the club page — these look the same regardless of which game is mounted. Current realization:

- `FloatingChat`, `PauseBoundary`, `PauseOverlay`, `SuspendConfirmDialog`, `TimerField`, `ClubGameCard`, `StartGameButtons` are shared. The route-level `<GamePage>` mounts the cross-cutting ones (chat, pause, suspend confirm, timer in header) so every game inherits them.
- `LoginScreen`, `HomePage`, `ClubPage`, `CreateClubPage` are shell-level, game-agnostic.
- `<UserMenu>` is mounted once at the App level (after the auth check), so it appears above every authenticated screen with zero per-page wiring. Fixed at the top-right of the viewport, overlapping the right end of the page header row (the GamePage header's right group reserves margin for it); shows just the user's profile-color dot + a small chevron (no username — the chip stays tiny), opens a dropdown for **user-focused** items only — **Edit profile** and **Log out**. **Never** carries club- or game-specific items; those belong on the ClubPage or GamePage menu off the logo. Hidden behind `<LoginScreen>` when there's no session.
- `<EditProfileDialog>` — the Edit-profile popup, a `<FloatingPanel>` (not a route) so the page underneath stays mounted and live. Held in App-level state next to `<UserMenu>`; the menu item flips it open. Today it edits one field — **player color**, via `<ColorChoiceList>` (below), defaulting to the current color. Saves via `common.update_profile_color`, then `setProfileColor` updates the shared profile store so the menu dot repaints at once. Username is shown but immutable in v1. Dialog buttons follow the [Dialog buttons](#dialog-buttons) convention.
- `<FloatingPanel>` — the shared draggable / resizable / closeable popover (react-rnd) behind `<EditProfileDialog>`, the `<GameOverModal>`, and codenamesduet's AI clue-suggestion dialog. **Gotcha worth knowing: react-rnd positions the panel from its element's *static flow position*** — a panel mounted deep inside a flex column inherits that column's offset, so it can render far from where you expect. codenamesduet's clue-suggestion dialog first mounted ~180px *below* the viewport because it sat deep in the board column. **Mount a `<FloatingPanel>` high in the tree** — at the PlayArea `.layout` level (beside `<GameOverModal>`) or App level — never nested inside the play surface. The codenamesduet e2e guard (`e2e/codenamesduet.e2e.ts`) asserts the suggestion panel renders fully on-screen, pinning this.
- `<ColorChoiceList>` — the shared player-color picker: the 8-entry palette (`MEMBER_COLORS`) as a grid of swatches, each its actual color circle + capitalized name, the selected one ringed. Controlled (`value` / `onChange`). Used by both `<EditProfileDialog>` and the first-run `<ClaimHandleScreen>` (where it sits beside the username field, pre-selected from a deterministic FE hash of the username — `defaultColorFor` — so a new player isn't picking from a blank slate; the chosen color is sent to `claim_username`).
- `.card`, `.muted`, `.error`, `.link-button`, `.actions` are universal utility classes in `common/theme.css`.

**The game-mechanic UI is per-game.** The board, rules display, input affordance (clue form vs number input vs guess box) — each game owns these. That's what the per-game `components/` directory is for.

**Game-end UI** — `common/components/game/terminal/GameOverModal.tsx` is the shared component games render at terminal (waffle and wordle opt out — they carry the verdict in-page and celebrate coop solves with `CelebrationDialog`; see [Modals for terminal results](#modals-for-terminal-results)). Per-game PlayArea passes title + detail + outcome; `<GamePage>` provides `goToClub` for the "Back to club" button. Each game also renders a small "Game over: `<status>` [Back to club]" indicator in the slot where input/action UI lived during play, so the terminal state stays visible after the modal closes. See [Modals for terminal results](#modals-for-terminal-results) above for the full contract.

## Player identity = a colored disc

A member's palette color (`MEMBER_COLORS` via `colorVarFor`), rendered as a **filled circle**, is the canonical visual anchor for "this player." It already recurs across the app — the `<PlayersStrip>` presence dots, the `<ChatBubble>` unread fill, the `<ColorChoiceList>` swatches, and now the per-finder markers in the spellingbee / boggle `<WordList>`. Treat it as a convention, not a coincidence: when a surface needs to say *who*, reach for a colored disc.

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
readouts, text entry (capture, not `<input>`), the turn log, the turn-history
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
eleven games are v3**, with bananagrams and crosswords the two documented layout
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
| Back to club | `ChevronLeft` | Swap tiles | `ArrowLeftRight` |
| Submit a move | `Triangle` (points up) | Recall | `Undo2` |
| Get hint | `Lightbulb` | Dump | `ArrowLeftRight` |
| Use AI (e.g. clue suggester) | `Sparkles` | Pause | `Pause` |
| Get answer / reveal | `Eye` | Peel | `Banana` (`IconPeel`) |
| End game | `Flag` | Zoom to fit | `Fullscreen` (`IconZoomFit`) |
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

**Rollout.** Complete — **all eleven games are v3**, so every game-move / end /
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
(`EndGameButton`) is the neutral mutual "we're done" for solo / coop; **Concede**
(`ConcedeGameButton`) is "I give up, you win" for compete. Same flag glyph + `error`
tone today, kept separate so they can diverge later (a concede should hand the
opponent the win).

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
