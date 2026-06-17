# UI

Visual direction and design rationale for the frontend. The *what we render and why it looks that way* layer.

For the mechanics — CSS Modules, file co-location, `cls()`, what we don't use — see [`code-conventions.md → CSS Modules + theme`](code-conventions.md#css-modules--theme). This file picks up where that one stops.

Read this before:

- Adding a shared component to `common/`.
- Touching `common/theme.css` or a per-game `theme.css`.
- Designing the screens for a new gametype.

## Audience and platform: desktop-first

The play surface is a laptop or desktop browser. Some games are awkward on mobile by their nature (crosswords, Boggle on a phone); even the ones that *would* play fine on mobile are most fun with a keyboard and a wider canvas. So:

- **Default styles are written for desktop.** Use `@media (max-width: …)` to add mobile adjustments only when something genuinely breaks. The opposite — mobile-first authoring with `@media (min-width: 1024px)` overlays — shipped some of the existing code ([`BoardScreen.module.css`](../src/tinyspy/components/BoardScreen.module.css)'s three-column layout); fine to leave alone, but new code should be desktop-first.
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

In-grid **game-mechanic animations** that change the partition between game regions are allowed and expected. Wordknit's category bands growing into the tile-grid space is the game's central dopamine; hiding that behind a fixed partition would be wrong. The rule is about *UI-state reflow* (a status banner changing height, a result banner appearing mid-page), not about *game-content reflow* (a board area transitioning between game states).

The distinction in one line: **if it's a side effect of state changing, fix the layout; if it's the state change you're celebrating, let it happen.**

The other exempt case is **loading state**: "Loading game…" doesn't have to occupy the same shape as the loaded play surface. It's a brief moment, the loaded shape often depends on game state that's not yet fetched, and the principle is about reflow *during play*, not at mount.

### Feedback pill

A uniformly-styled component that carries every game's transient and persistent feedback ("Invalid move," "Good guess!," "Waiting for clue from peer," "Tip: try yellow first"). One visual register across games — a Wordknit "wrong guess" should look like a Tinyspy "clue invalid" should look like a future Boggle "not a word."

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

- **`timed`** for transient acknowledgment that auto-fades. Wordknit's "Already tried that," "Wrong guess." The default workhorse.
- **`sticky`** for state-driven info the game itself will clear. Tinyspy's "Waiting for clue from peer" persists until the clue arrives, at which point the per-game hook calls `show()` again with new content (or `clear()`) — caller-controlled lifetime.
- **`closeable`** for user-acknowledged content. Persistent tips, instructional banners, warnings the player should see-and-dismiss. Renders a `×` button on the pill.

**Semantics:**

- Latest `show()` replaces whatever was there — no queue, no stack. Race-condition simple.
- `clear()` empties the slot regardless of dismiss mode.
- The state lives in `<GamePage>`; the auto-clear timer for `timed` mode is owned by `<GamePage>`, not the caller.
- **Pause transitions don't auto-clear feedback.** `<PauseOverlay>` covers the play surface, not the header; an active pill stays readable through a pause/resume cycle. If a specific feedback shouldn't survive a pause, the caller clears it explicitly.

### Modals for terminal results

Game-end "you won / you lost" UI moves to a modal, not an in-page banner. This **replaces** the previously-noted plan for a shared inline `GameResultBanner` (see [Components](#components) below) — a modal serves the principle and the future-bling expectation (animations, victory GIFs, larger postgame summaries) better than a static in-page section.

The page underneath stays in *review mode*: the final board, revealed unmatched categories (wordknit), both key cards (tinyspy), the winning number (psychicnum). The modal carries the moment-of-result; the page stays available for "let me look at the board for a sec."

### Existing offenders to retrofit

Not a big-bang refactor — these get fixed game-by-game as we work through the UI sweep:

- **Result banners across all three games.** Tinyspy's `GameOverBanner.tsx`, psychic-num's `ResultBanner.tsx`, wordknit's inline terminal copy in `PlayArea.tsx` — all move to a shared `GameOverModal`.
- **Tinyspy turn-state messaging.** Audit needed — does "your turn to write a clue" occupy the same space as "waiting for peer's clue" and "peer gave you: BIRD 3"?
- **Guess / clue history scroll containment.** Verify each is a scrollable region inside a fixed outer, not a grow-with-content list.

## Theme: one global theme today

The current theme is dark, with tokens at `:root` in [`common/theme.css`](../src/common/theme.css). Per-game theme files (currently just [`tinyspy/theme.css`](../src/tinyspy/theme.css)) declare additional tokens scoped to that game's gameplay surface.

### Tokens are semantic, not literal

Within each file, token names describe the *role* of the value, not the value itself:

| good (semantic) | bad (literal) |
|---|---|
| `--color-bg`, `--color-surface`, `--color-text` | `--color-near-black`, `--color-light-gray` |
| `--color-accent`, `--color-error` | `--color-blue`, `--color-red` |
| `--tinyspy-agent`, `--tinyspy-assassin` | `--tinyspy-green`, `--tinyspy-red` |

The reason: when (not if) we add a second theme, every literal name becomes a lie — "the green is actually pink in pink mode" reads wrong. Semantic names cascade cleanly through theme swaps.

This rule applies *within each namespace separately*. `--tinyspy-agent` is a tinyspy token whose name says "agent" because that's what it means inside tinyspy. It is **not** a step toward a cross-game `--color-agent` concept; see [Two vocabularies](#two-vocabularies) for why.

### Light-mode pass (planned, not done)

The current dark theme is the test-pattern while visual direction is still moving. **Switch to light-mode as the default before adding the next non-toy game** — roughly one afternoon's work: invert the surface tokens in `common/theme.css`, retune `tinyspy/theme.css` against the new background, drop `color-scheme: dark`. Doing this *before* a new game lands means the new game's palette is tuned against the real background from day one rather than being re-tuned later.

### User-selectable themes (deferred)

Dark / light / pink / etc. as a *user setting* is deferred. The foundation is there — CSS vars at `:root`, semantic names — but the switching mechanism (a `[data-theme]` selector, `prefers-color-scheme`, a per-user setting in `common.profiles`) is YAGNI until somebody actually wants it. Don't pre-engineer.

## Two vocabularies

A token or class goes one of two places, and the two don't mix.

### UI-state vocabulary — global

Concepts about the *frame*, not the game. These earn global tokens / classes because consistency is the whole point — a player shouldn't have to relearn what a won-banner looks like per game:

- `.outcome-won`, `.outcome-lost`, `.outcome-tie` — game-end banner styles.
- `.error` — already global; validation feedback, RPC errors.
- (Future) presence states, transient toast feedback, etc.

A "you won" banner in tinyspy should be visually indistinguishable from a "you won" banner in Boggle. That's the *point*.

Most of these don't exist yet — psychicnum and tinyspy each render their game-end screens differently today, which is one of the things to fix as global UI-state tokens / classes emerge.

### Game vocabulary — per-game

Concepts that belong to the game's rules and ontology:

- Tinyspy's **agent / neutral / assassin**.
- A future Boggle's **valid word / great word / not a word**.
- Connections's **four difficulty colors** (yellow → green → blue → purple, themed by the game itself).

These stay namespaced to the game's `theme.css` and **don't get collapsed**, even when two games happen to have a concept that *feels* "positive" or "negative."

### The error to avoid

Promoting a per-game concept to a global token because two games happen to share a visual register. Calling tinyspy-agent and boggle-great-word both `--color-good` looks tidy on the surface and breaks the moment a third game's "good" wants to lean a different direction — at which point you either un-alias (admit the abstraction was wrong) or pollute the global token with game-specific exceptions.

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
- **Timed / untimed setup choice.** Every game's setup form has a `<TimerField>` (None / Up / Down / MM:SS). Per-gametype default may differ (wordknit defaults to countdown 10:00; psychic-num and tinyspy default to none), but the *option* is universal.
- **Help.** Every gametype's manifest declares a `help: ComponentType<{ onClose: () => void }>` — the rules / how-to-play modal opened from the "Help" item in the GamePage menu. Tinyspy's `HowToPlayModal` is the model; wordknit and psychic-num carry placeholder content until they earn real copy.
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
- **`<ChatBubble />`** — toggle for the floating chat panel. Same icon regardless of open / closed state (we'll refine later). Stays in place when chat is open per [Layout stability](#layout-stability).
- **`<StatusSlot />`** — default content is `<PlayersStrip>` (colored usernames, one per `player`). When `ctx.feedback.show()` has been called and isn't cleared yet, the slot renders `<FeedbackPill>` instead. The underlying roster updates whether or not the pill is showing; the strip reappears when feedback clears.

**Right, right-justified:**

- **`<PauseButton />`** — pause icon (two-bar style). Click fires `sendManualPause` from `useCommonGame`. Greyed-out (disabled) when the game is already paused; the resume affordance lives on `<PauseOverlay>`, not in the header. **Always present** — manual pause is universal, not timer-gated; even an untimed game wants the "moth is making tea" affordance.
- **Timer** — `{ displaySeconds, expired }` from `useCommonGame`. Rendered only when `commonGame.setup.timer.kind !== 'none'`. `font-variant-numeric: tabular-nums` so digits don't shift the right edge as values change.

**What's gone:** the game title. Identifying the game is the logo's job; the per-instance title (e.g. wordknit's puzzle date) still lives in the club-page listing where it has room to breathe.

**Why this lives in the common shell:** the consistency goal — a player switching from Tinyspy to Wordknit shouldn't have to relearn the chrome. The header is implemented in `<GamePage>` (along with the chat + pause + suspend-confirm machinery it already owns); per-game `<PlayArea>` components render below it and don't see the header at all.

### GamePage menu

The logo is a menu trigger. Click opens a dropdown anchored below it; same trigger across games, same dropdown chrome, different items inside.

```
[logo ▼]   ← click
    │
    └─→  ┌──────────────────────┐
         │ Help                 │  ← common section
         │ Back to club         │
         ├──────────────────────┤  ← divider
         │ Hints                │  ← per-game items (wordknit)
         └──────────────────────┘
```

**Common section (top, always present):**

- **Help** — opens the per-game `manifest.help` modal.
- **Back to club** — fires the same suspend-confirm logic the old direct logo-click did. Single-click for terminal games; modal-then-suspend for non-terminal.

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

**Reuse outside GamePage.** The `<Menu>` component is generic — trigger + sections + items + keyboard chrome, nothing game-specific. ClubPage adopts the same shape (see [ClubPage header](#clubpage-header) below) with a generic pupgames logo as the trigger and items "Back to home," "Rename club," "Delete club."

### ClubPage header

The club page wears the same chrome the game page does, slightly rearranged: the club's name takes the visual slot the game's title doesn't have on GamePage (where identity is carried by the per-game logo). No right-hand group — clubs have no timer, no pause.

```
[pupgames-logo] [Club Name] [chat-bubble] [status-slot]
```

- **`<PupgamesLogo />`** — a generic placeholder SVG at `src/common/pupgames.svg`, the same 4-dot-grid the per-game logos use. Wrapped by `<Menu>` exactly like the game logo: click opens the club menu.
- **Club name** — plain text, the canonical identity for the page. Drops out of the visual register the moment the user enters a game (where the per-game logo takes over).
- **`<ChatBubble />`** — the same shared component as GamePage. Both pages bubble open/close the same FloatingChat panel via the shared `chatOpenStore`.
- **`<StatusSlot />`** — same shared component. Default content is the `<PlayersStrip>` of club **members** (the variable name in club context, per [naming.md](naming.md#member)). When `setFeedback(...)` fires (e.g. after a successful game delete), the strip is replaced by the `<FeedbackPill>` for the configured dismiss mode. One concrete pill today: a `timed` "`<title>` deleted" toast that fires on successful `delete_game`.

**ClubPage menu items:**

- **Back to home** — `navigate('/')`. Real link.
- **Rename club** — placeholder. Click pops a "Coming soon" `timed` feedback pill.
- **Delete club** — placeholder. Same.

**Layout.** ClubPage's header is layout-static and fills the full content width (respecting the body's outer padding, same as the GamePage header). The main content well below the header keeps its existing `.card` constraint (max-width 480px, centered). The previous "whole page is one card" wrapping gave way to a frame with a header + a main card so the header has room to breathe.

### Components

Same principle, applied to components.

**The chrome is shared.** Cards, banners, chat, login, the home page, the club page — these look the same regardless of which game is mounted. Current realization:

- `ClubChatPanel`, `PauseBoundary`, `PauseOverlay`, `SuspendConfirmDialog`, `TimerField`, `ClubGameCard`, `StartGameButtons` are shared. The route-level `<GamePage>` mounts the cross-cutting ones (chat, pause, suspend confirm, timer in header) so every game inherits them.
- `LoginScreen`, `HomePage`, `ClubPage`, `CreateClubPage` are shell-level, game-agnostic.
- `.card`, `.muted`, `.error`, `.link-button`, `.actions` are universal utility classes in `common/theme.css`.

**The game-mechanic UI is per-game.** The board, rules display, input affordance (clue form vs number input vs guess box) — each game owns these. That's what the per-game `components/` directory is for.

**The current grey zone: game-end UI.** Tinyspy has a styled [`GameOverBanner.tsx`](../src/tinyspy/components/GameOverBanner.tsx) with tone-tagged CSS (win / loss); psychic-num has a [`ResultBanner.tsx`](../src/psychicnum/components/ResultBanner.tsx) that's a bare `<section>` + `<h2>` with no styling; wordknit renders its terminal copy ("Solved!" / "Out of time.") inline in `PlayArea.tsx` with no banner component at all. Three games, three shapes. Per [Layout stability → Modals for terminal results](#modals-for-terminal-results) above, these all collapse into one shared `common/components/GameOverModal.tsx` rather than an inline banner — `{ outcome, title, detail?, actions? }` props, same component, per-game copy. The page underneath stays in review mode.

## Explicitly deferred

- **Responsive mobile layouts** beyond graceful degradation.
- **User-selectable themes** (dark / light / pink picker). Foundation is there; mechanism + UI + persistence aren't.
- **Animations and transitions** beyond the existing `:hover` brightness on tiles.
- **A literal palette layer** (`--color-gray-100`, etc.). Overkill at ~15 tokens; revisit at ~50+.
- **Font-size tokens** (`--text-sm`, `--text-base`, …). Components pick raw rem values ad-hoc; standardize when the variety becomes noise.
- **Per-game UI testing** beyond what already exists. Manual smoke is the bar for now.
