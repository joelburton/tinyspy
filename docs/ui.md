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
- **A real mobile pass is a future project.** When the games stabilize visually, we'll do one. Locking it in now forces complexity on every component while we're still noodling shared chrome.

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
- **Mono-width digits for ticking values.** Timer in a `font-variant-numeric: tabular-nums` slot so `0:09 → 0:10` doesn't shift the header.
- **PauseOverlay is the canonical example.** Absolutely positioned over a frozen play surface; the layout underneath doesn't reflow when pause flips on or off. New chrome should follow the same pattern.

### The deliberate exception

In-grid **game-mechanic animations** that change the partition between game regions are allowed and expected. connections's category bands growing into the tile-grid space is the game's central dopamine; hiding that behind a fixed partition would be wrong. The rule is about *UI-state reflow* (a status banner changing height, a result banner appearing mid-page), not about *game-content reflow* (a board area transitioning between game states).

The distinction in one line: **if it's a side effect of state changing, fix the layout; if it's the state change you're celebrating, let it happen.**

The other exempt case is **loading state**: "Loading game…" doesn't have to occupy the same shape as the loaded play surface. It's a brief moment, the loaded shape often depends on game state that's not yet fetched, and the principle is about reflow *during play*, not at mount.

### Feedback pill

A uniformly-styled component that carries every game's transient and persistent feedback ("Invalid move," "Good guess!," "Waiting for clue from peer," "Tip: try yellow first"). One visual register across games — a connections "wrong guess" should look like a codenamesduet "clue invalid" should look like a future Boggle "not a word."

The pill lives inside `<StatusSlot>` in the GamePage header (see [GamePage header](#gamepage-header) below). When feedback is active, the pill replaces the default `<PlayersStrip>` content; when cleared, the strip reappears.

**API on `GamePageCtx`:**

```ts
type FeedbackTone = 'success' | 'error' | 'neutral' | 'info'

type FeedbackMsg = {
  tone: FeedbackTone
  text: string
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

**Semantics:**

- Latest `show()` replaces whatever was there — no queue, no stack. Race-condition simple.
- `clear()` empties the slot regardless of dismiss mode.
- The state lives in `<GamePage>`; the auto-clear timer for `timed` mode is owned by `<GamePage>`, not the caller.
- **Pause transitions don't auto-clear feedback.** `<PauseOverlay>` covers the play surface, not the header; an active pill stays readable through a pause/resume cycle. If a specific feedback shouldn't survive a pause, the caller clears it explicitly.

### Modals for terminal results

Game-end "you won / you lost" UI lives in a shared modal (`common/components/GameOverModal.tsx`), not an in-page banner. The modal serves the principle and the future-bling expectation (animations, victory GIFs, larger postgame summaries) better than a static in-page section.

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

### Dialog buttons

macOS-style placement, consistent across every dialog / modal / confirm: the action row is **right-justified** (`justify-content: flex-end`), with the **default/primary action rightmost** and Cancel (the `secondary` button) to its left — so Cancel comes *first* in the DOM, the primary button *last*. Single-button dialogs (Help's "Got it", GameOverModal's "Back to club") right-justify the lone button. Each dialog owns a small `.actions` / `.buttonRow` flex rule, all sharing `gap: 0.75rem` and `min-width: 6rem` on the buttons. `PauseOverlay` is the deliberate exception — it's a page-context banner, not a modal, so its single Resume button centers.

**Back to club** — the one button that recurs across surfaces (every game's post-terminal indicator + the GameOverModal CTA) is the shared [`<BackToClubButton>`](../src/common/components/BackToClubButton.tsx), so the glyph (a `‹` U+2039 chevron, `aria-hidden` so screen readers just say "Back to club"), its spacing, and the label stay identical everywhere. `variant` only swaps the fill — `secondary` (outline) for the in-page indicators, `primary` for the modal CTA. The GamePage *menu* item is plain text, not this button.

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

The current theme is dark, with tokens at `:root` in [`common/theme.css`](../src/common/theme.css). Most games add a per-game theme file ([`codenamesduet/theme.css`](../src/codenamesduet/theme.css), [`wordle/theme.css`](../src/wordle/theme.css) the letter-feedback palette, [`stackdown/theme.css`](../src/stackdown/theme.css) the felt + tile ink, …) declaring additional tokens scoped to that game's gameplay surface.

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

### Light-mode pass (planned, not done)

The current dark theme is the test-pattern while visual direction is still moving. **Switch to light-mode as the default before adding the next non-toy game** — roughly one afternoon's work: invert the surface tokens in `common/theme.css`, retune `codenamesduet/theme.css` against the new background, drop `color-scheme: dark`. Doing this *before* a new game lands means the new game's palette is tuned against the real background from day one rather than being re-tuned later.

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

- **Chat.** Every `<GamePage>` mounts `<ClubChatPanel>`. The chat is per-club and persists across games; a new gametype gets it for free by mounting inside the common shell.
- **Pause.** Presence-pause + manual-pause are uniform via `useCommonGame` + `<PauseBoundary>`. No per-game wiring.
- **Timed / untimed setup choice.** Every game's setup form has a `<TimerField>` (None / Up / Down / MM:SS). Per-gametype default may differ (connections defaults to countdown 10:00; psychicnum and codenamesduet default to none), but the *option* is universal.
- **Help.** Every gametype's manifest declares a `help: ComponentType<{ onClose: () => void }>` — the rules / how-to-play modal opened from the "Help" item in the GamePage menu. codenamesduet's `Help.tsx` is the model; connections and psychicnum carry placeholder content until they earn real copy.
- **GamePage menu.** Click the logo to open a dropdown with common items (Help, Back to club) plus per-game items the PlayArea pushes via `ctx.menu`. See [GamePage menu](#gamepage-menu) below.
- **Back-to-club + suspend-confirm.** Opened from the "Back to club" item in the GamePage menu (or browser back). Non-terminal games show the suspend-confirm modal first; terminal is a single-click back. Owned by `<GamePage>`.

A new gametype that wants to omit one of these isn't building "a new gametype" — it's stepping outside the frame, and that's a CLAUDE.md-priors conversation, not a manifest field to toggle.

### GamePage header

A layout-static row that every game shares. Same shape, same affordances, same positions — only the contents inside `<StatusSlot>` and the timer's presence/value differ per game.

```
[logo] [chat] [status-slot]                    [pause] [timer-if-set]
```

**Left, left-justified:**

- **`<GameLogo gametype={…} />`** — square SVG (`src/<game>/logo.svg`). The logo is a menu trigger: click opens the GamePage menu (Help, Back to club, per-game items). See [GamePage menu](#gamepage-menu) below.
- **`<ChatBubble />`** — toggle for the floating chat panel. Same icon open or closed, but while **closed** it doubles as an unread indicator: the bubble fills with the latest unread sender's profile color, and a small count pill (top-left) shows how many messages arrived since this member last had the panel open. Opening clears it. The pill is **black**, not a player color — red and the other player hues are all valid profile colors, so a colored pill would read as "a sender" and could clash with the bubble's fill. Unread is tracked per-club via a localStorage `lastSeen` bookmark (`chatUnread.ts`), so it survives reloads and a never-opened panel shows the whole backlog as unread. Stays in place when chat is open per [Layout stability](#layout-stability).
- **`<StatusSlot />`** — default content is `<PlayersStrip>` (colored usernames, one per `player`). When `ctx.feedback.show()` has been called and isn't cleared yet, the slot renders `<FeedbackPill>` instead. The underlying roster updates whether or not the pill is showing; the strip reappears when feedback clears.

**Right, right-justified:**

- **`<PauseButton />`** — pause icon (two-bar style). Click fires `sendManualPause` from `useCommonGame`. Greyed-out (disabled) when the game is already paused; the resume affordance lives on `<PauseOverlay>`, not in the header. **Always present** — manual pause is universal, not timer-gated; even an untimed game wants the "moth is making tea" affordance.
- **Timer** — `{ displaySeconds, expired }` from `useCommonGame`. Rendered only when `commonGame.setup.timer.kind !== 'none'`. `font-variant-numeric: tabular-nums` so digits don't shift the right edge as values change.

**What's gone:** the game title. Identifying the game is the logo's job; the per-instance title (e.g. connections's puzzle date) still lives in the club-page listing where it has room to breathe.

**Why this lives in the common shell:** the consistency goal — a player switching from codenamesduet to connections shouldn't have to relearn the chrome. The header is implemented in `<GamePage>` (along with the chat + pause + suspend-confirm machinery it already owns); per-game `<PlayArea>` components render below it and don't see the header at all.

### GamePage menu

The logo is a menu trigger. Click opens a dropdown anchored below it; same trigger across games, same dropdown chrome, different items inside.

```
[logo ▼]   ← click
    │
    └─→  ┌──────────────────────┐
         │ Help                 │  ← common section
         │ Back to club         │
         ├──────────────────────┤  ← divider
         │ Hints                │  ← per-game items (connections)
         └──────────────────────┘
```

**Common section (top, always present):**

- **Help** — opens the per-game `manifest.help` modal.
- **Back to club** — single-click for terminal games; modal-then-suspend for non-terminal (the [`<SuspendConfirmDialog>`](../src/common/components/SuspendConfirmDialog.tsx) flow).

**Per-game section (below divider, dynamic):**

Items pushed by the per-gametype `<PlayArea>` via `ctx.menu.setGameItems([...])` — same pattern as `ctx.feedback`. Items can carry a state-dependent `disabled` flag ("Reveal cell" enabled only when a cell is selected); the array is replaced wholesale on each call. State lives in `<GamePage>`; PlayArea-unmount on pause clears the array, so during a pause the menu shows only the common section.

API on `GamePageCtx`:

```ts
type MenuItem = {
  id: string        // for React keying
  label: string
  onClick: () => void
  disabled?: boolean
}

menu: {
  setGameItems: (items: MenuItem[]) => void
}
```

**Pause behavior.** The menu is openable while paused (common items work normally — leaving to the club, reading the rules). Game-specific items vanish because PlayArea unmounts on pause; the cleanup return on the PlayArea's `setGameItems` effect clears them.

**Keyboard.** Enter / Space on the logo opens the menu and focuses the first enabled item. Arrow up / down navigate; Enter or Space activates; Esc closes and returns focus to the logo. Tab while the menu is open closes it and advances focus normally. Disabled items are skipped by arrow navigation.

**Z-index.** Menu sits at ~1500 — above the 500-tier modals (suspend-confirm, hint, setup; so a menu click can open one of these) and below chat at 10000 (chat stays available for "what does this option do?" Q&A during play).

**Layout stability.** The menu is a popover anchored to the trigger; it overlays the page without reflowing anything underneath. Per [Layout stability](#layout-stability).

**Reuse outside GamePage.** The `<Menu>` component is generic — trigger + sections + items + keyboard chrome, nothing game-specific. ClubPage adopts the same shape (see [ClubPage header](#clubpage-header) below) with a generic PuzPuzPuz logo as the trigger and items "Back to home," "Rename club," "Delete club."

### ClubPage header

The club page wears the same chrome the game page does. Same "no title in the header" rule — the logo carries identity at the header level; the canonical club name + handle live in the main content well below. No right-hand group — clubs have no timer, no pause.

```
[puzpuzpuz-logo] [chat-bubble] [status-slot]
```

- **`<PuzpuzpuzLogo />`** — a generic placeholder SVG at `src/common/puzpuzpuz.svg`, the same 4-dot-grid the per-game logos use. Wrapped by `<Menu>` exactly like the game logo: click opens the club menu.
- **`<ChatBubble />`** — the same shared component as GamePage. Both pages bubble open/close the same FloatingChat panel via the shared `chatOpenStore`.
- **`<StatusSlot />`** — same shared component. Default content is the `<PlayersStrip>` of club **members** (the variable name in club context, per [naming.md](naming.md#member)). **Here each member's dot is a live presence light:** ClubPage feeds the strip the `useClubPresence` roster as `presentUserIds`, so a member who's connected (on the club page or in any of the club's games) shows a filled color dot and an absent one an empty outline — at-a-glance "who's in the club right now." (On GamePage the strip gets no `presentUserIds`, so every dot is simply filled.) When `setFeedback(...)` fires (e.g. after a successful game delete), the strip is replaced by the `<FeedbackPill>` for the configured dismiss mode. One concrete pill today: a `timed` "`<title>` deleted" toast that fires on successful `delete_game`.

**ClubPage menu items:**

- **Back to home** — `navigate('/')`. Real link.
- **Rename club** — placeholder. Click pops a "Coming soon" `timed` feedback pill.
- **Delete club** — placeholder. Same.

**Layout.** ClubPage's header is layout-static and fills the full content width (respecting the body's outer padding, same as the GamePage header). The body below the header is a two-column flex row that takes the rest of the viewport height (per [Page-height fits the viewport](#page-height-fits-the-viewport)):

- **Left column** — the club name + handle, the active game card (when there is one), and the per-gametype Start buttons. Stacked content, no internal scroll. **Sibling-manifest families** (coop + compete variants of the same `baseGametype` — see [`common.md` → The sibling-manifest pattern](common.md#the-sibling-manifest-pattern)) render today as two independent buttons, sorted in registry order. Future treatment may group siblings as a single visual block (one logo + two side-by-side Start buttons labeled "coop" / "compete") — the `baseGametype` field on each manifest is the hook for that grouping.
- **Right column** — the "Other games" list as a fixed-size frame with internal `overflow-y: auto`. Suspended games carry their yellow corner flag; completed games sit alongside, muted. The friends can scroll back through history without the rest of the page moving.

The body Members list and the `/c/<handle>` URL line are gone — the header's `<PlayersStrip>` carries identity, and the URL is in the browser address bar already.

### Components

Same principle, applied to components.

**The chrome is shared.** Cards, banners, chat, login, the home page, the club page — these look the same regardless of which game is mounted. Current realization:

- `ClubChatPanel`, `PauseBoundary`, `PauseOverlay`, `SuspendConfirmDialog`, `TimerField`, `ClubGameCard`, `StartGameButtons` are shared. The route-level `<GamePage>` mounts the cross-cutting ones (chat, pause, suspend confirm, timer in header) so every game inherits them.
- `LoginScreen`, `HomePage`, `ClubPage`, `CreateClubPage` are shell-level, game-agnostic.
- `<UserMenu>` is mounted once at the App level (after the auth check), so it appears above every authenticated screen with zero per-page wiring. Fixed at the top-right of the viewport (in the body's empty 2rem padding zone above any page header); shows the current user's username + a small chevron, opens a dropdown for **user-focused** items only — **Edit profile** and **Log out**. **Never** carries club- or game-specific items; those belong on the ClubPage or GamePage menu off the logo. Hidden behind `<LoginScreen>` when there's no session.
- `<EditProfileDialog>` — the Edit-profile popup, a `<FloatingPanel>` (not a route) so the page underneath stays mounted and live. Held in App-level state next to `<UserMenu>`; the menu item flips it open. Today it edits one field — **player color**, via `<ColorChoiceList>` (below), defaulting to the current color. Saves via `common.update_profile_color`, then `setProfileColor` updates the shared profile store so the menu dot repaints at once. Username is shown but immutable in v1. Dialog buttons follow the [Dialog buttons](#dialog-buttons) convention.
- `<ColorChoiceList>` — the shared player-color picker: the 8-entry palette (`MEMBER_COLORS`) as a grid of swatches, each its actual color circle + capitalized name, the selected one ringed. Controlled (`value` / `onChange`). Used by both `<EditProfileDialog>` and the first-run `<ClaimHandleScreen>` (where it sits beside the username field, pre-selected from a deterministic FE hash of the username — `defaultColorFor` — so a new player isn't picking from a blank slate; the chosen color is sent to `claim_username`).
- `.card`, `.muted`, `.error`, `.link-button`, `.actions` are universal utility classes in `common/theme.css`.

**The game-mechanic UI is per-game.** The board, rules display, input affordance (clue form vs number input vs guess box) — each game owns these. That's what the per-game `components/` directory is for.

**Game-end UI** — `common/components/GameOverModal.tsx` is the shared component all three games render at terminal. Per-game PlayArea passes title + detail + outcome; `<GamePage>` provides `goToClub` for the "Back to club" button. Each game also renders a small "Game over: `<status>` [Back to club]" indicator in the slot where input/action UI lived during play, so the terminal state stays visible after the modal closes. See [Modals for terminal results](#modals-for-terminal-results) above for the full contract.

## Player identity = a colored disc

A member's palette color (`MEMBER_COLORS` via `colorVarFor`), rendered as a **filled circle**, is the canonical visual anchor for "this player." It already recurs across the app — the `<PlayersStrip>` presence dots, the `<ChatBubble>` unread fill, the `<ColorChoiceList>` swatches, and now the per-finder markers in the spellingbee / boggle `<WordList>`. Treat it as a convention, not a coincidence: when a surface needs to say *who*, reach for a colored disc.

Two rules keep the signal clean:

- **Identity rides the disc, never the text.** Don't encode a player by coloring a *word* — a colored disc is a far better color carrier (bigger area, no legibility/antialiasing fight), and it discriminates better between palette hues. Keep text legible/neutral and let the disc carry color. The payoff is that any space-constrained surface (think mobile, where there's no room for a name) can fall back to **circle-only** with zero loss — players have already been trained that the circle *is* the person. This is why the `<WordList>` redesign moved color off the word and onto a leading ●, with the word itself black.
- **Don't spend a colored circle on anything that isn't a player.** If a colored circle would read as "a player" where none is meant, pick a different shape or a non-palette color. Two existing instances of this discipline: the chat unread pill is **black**, not a player hue, so it doesn't read as a sender (see [GamePage header](#gamepage-header)); and the spellingbee rank ladder uses **squares**, not circles, for its tiers — a bright-yellow *circle* would muddy the "circle = player" signal, so rank tiers take a different shape (`RankBar.module.css`).

## Mode pills

A gametype's interaction `mode` (`'coop'` / `'compete'`, on the manifest) is **not** baked into its display `name` — it's shown at presentation time as a small colored pill via the shared [`<ModePill>`](../src/common/components/ModePill.tsx). So a coop + compete sibling pair carries the same `name` (e.g. both manifests say `wordle`), distinguished by the pill.

Rules:

- **Spelling.** The DB, code, and gametype strings spell it `coop`; the **UI says "Co-op"** (and "Compete"). The one place the FE text differs from the stored value — `MODE_LABEL` in [`lib/games.ts`](../src/common/lib/games.ts) owns the mapping.
- **Look.** An outlined chip — transparent background, with the border and text both in the mode color: co-op = teal, compete = purple (`--color-mode-*-text` in `theme.css`). Deliberately outside the won/lost/active outcome palette so a mode pill never reads as a result.
- **Solo clubs.** In a solo club (handle starts with `=`, one player) **no pill renders at all** — neither "Co-op" (no one to cooperate with) nor "Compete" (a solo member may have *enabled* a 2-player game like bananagrams, but "Compete" is meaningless with one player). Pass `soloClub` to `<ModePill>`; it returns `null`.
- **Where it shows.** Anywhere a gametype name appears next to its mode: the per-gametype Start buttons (`StartGameButtons`), the club's games list (`ClubGameCard`), and the club editor (`EditClubDialog`). The Start buttons + games list pass `soloClub` (so solo clubs show no pill); the editor **never** passes it, so it always shows the pill — it lists both siblings, and the pill is the only thing distinguishing two now-identically-named rows. The setup dialog confirms the mode in its title via `MODE_LABEL` (dropped in a solo club, matching the suppression).

Because the pill carries the mode, the per-game `labelFor` status strings (shown on the same card) **do not** repeat it: they're bare (`solved`, `ada won the race`, `racing…`), never `coop · …` / `compete · …`. When adding a game, keep mode out of `labelFor`.

## Explicitly deferred

- **Responsive mobile layouts** beyond graceful degradation.
- **User-selectable themes** (dark / light / pink picker). Foundation is there; mechanism + UI + persistence aren't.
- **Animations and transitions** beyond the existing `:hover` brightness on tiles.
- **A literal palette layer** (`--color-gray-100`, etc.). Overkill at ~15 tokens; revisit at ~50+.
- **Font-size tokens** (`--text-sm`, `--text-base`, …). Components pick raw rem values ad-hoc; standardize when the variety becomes noise.
- **Per-game UI testing** beyond what already exists. Manual smoke is the bar for now.
