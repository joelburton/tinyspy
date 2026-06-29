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

> **⚠️ The #1 offender — conditionally removing a flow element on state change.** Writing `{showInput && <CommitRow/>}` / `{isTerminal ? … : <EntryRow/>}` so the input/commit/entry row is *removed* at terminal looks harmless, but the board above is usually `flex: 1` — so when the row vanishes, **the board grows into the freed space.** That's a reflow on a state change, the exact thing this section forbids.
>
> **Mechanical check, every time you write `{cond && <X>}` or a state ternary in a PlayArea:** does `<X>` take layout space, and is a sibling grow-to-fill (the board)? If yes, **don't remove it** — keep it mounted and (a) toggle `visibility: hidden` (exact height kept even under wrapping — connections' `.commitFrozen`), or (b) rotate the *content* in a fixed-height slot (psychicnum swaps the entry for the terminal reveal in the same slot), or (c) give the slot a mount-time `min-height`. The board's bottom boundary (the input/commit row) is where this bites most.
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
type FeedbackTone = 'success' | 'error' | 'warning' | 'neutral' | 'info'
//                                       ▲ amber — "important, but not good/bad"
//                                         (a hint asked for, an opponent's progress)

type FeedbackMsg = {
  tone: FeedbackTone
  text: string
  dot?: string                          // leading player-color disc (from colorVarFor) — identity anchor for peer messages
  variant?: 'fill' | 'outline'          // 'fill' (default) tints bg by tone; 'outline' colors only the border (no fill)
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

**Fill vs outline (`variant`).** Local validation ("not a word") uses the default `fill` — a tone-tinted background. **Group/peer (identity) messages** ("● leah found APPLE") set `variant: 'outline'` + a `dot`: a tinted fill would fight the leading player-color disc, so outline colors only the *border*, in the green/red/amber **outcome** palette (the same colors the per-game board uses — so "correct" reads green, "not it" red, a hint amber, across surfaces). The outline border uses the saturated `--color-outcome-*-strong` (800-level) tier so it stays legible as a bare 2px border on the white surface (the pastel `-border` tones look pale outline-only). This is the `dot`-carries-identity rule from [Player identity = a colored disc](#player-identity--a-colored-disc) applied to the header slot.

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
- `<FloatingPanel>` — the shared draggable / resizable / closeable popover (react-rnd) behind `<EditProfileDialog>`, the `<GameOverModal>`, and codenamesduet's AI clue-suggestion dialog. **Gotcha worth knowing: react-rnd positions the panel from its element's *static flow position*** — a panel mounted deep inside a flex column inherits that column's offset, so it can render far from where you expect. codenamesduet's clue-suggestion dialog first mounted ~180px *below* the viewport because it sat deep in the board column. **Mount a `<FloatingPanel>` high in the tree** — at the PlayArea `.layout` level (beside `<GameOverModal>`) or App level — never nested inside the play surface. The codenamesduet e2e guard (`e2e/codenamesduet.e2e.ts`) asserts the suggestion panel renders fully on-screen, pinning this.
- `<ColorChoiceList>` — the shared player-color picker: the 8-entry palette (`MEMBER_COLORS`) as a grid of swatches, each its actual color circle + capitalized name, the selected one ringed. Controlled (`value` / `onChange`). Used by both `<EditProfileDialog>` and the first-run `<ClaimHandleScreen>` (where it sits beside the username field, pre-selected from a deterministic FE hash of the username — `defaultColorFor` — so a new player isn't picking from a blank slate; the chosen color is sent to `claim_username`).
- `.card`, `.muted`, `.error`, `.link-button`, `.actions` are universal utility classes in `common/theme.css`.

**The game-mechanic UI is per-game.** The board, rules display, input affordance (clue form vs number input vs guess box) — each game owns these. That's what the per-game `components/` directory is for.

**Game-end UI** — `common/components/GameOverModal.tsx` is the shared component all three games render at terminal. Per-game PlayArea passes title + detail + outcome; `<GamePage>` provides `goToClub` for the "Back to club" button. Each game also renders a small "Game over: `<status>` [Back to club]" indicator in the slot where input/action UI lived during play, so the terminal state stays visible after the modal closes. See [Modals for terminal results](#modals-for-terminal-results) above for the full contract.

## Player identity = a colored disc

A member's palette color (`MEMBER_COLORS` via `colorVarFor`), rendered as a **filled circle**, is the canonical visual anchor for "this player." It already recurs across the app — the `<PlayersStrip>` presence dots, the `<ChatBubble>` unread fill, the `<ColorChoiceList>` swatches, and now the per-finder markers in the spellingbee / boggle `<WordList>`. Treat it as a convention, not a coincidence: when a surface needs to say *who*, reach for a colored disc.

**The name + disc cluster is `<ActorTag>`** (`common/components/ActorTag`): a person's name followed by their identity disc, the "who did this" marker the turn logs drop beside each row. Pass it the resolved member (`<ActorTag actor={players.find(…)} />`); it owns the fallback name + the disc color, so the cluster looks identical wherever it appears. (Reach for it before re-rolling a name-span + ● by hand. Note that several older logs still encode the actor by *coloring the name text* instead — a deliberate-or-not divergence from the disc rule below, tracked as a consistency follow-up.)

Two rules keep the signal clean:

- **Identity rides the disc, never the text.** Don't encode a player by coloring a *word* — a colored disc is a far better color carrier (bigger area, no legibility/antialiasing fight), and it discriminates better between palette hues. Keep text legible/neutral and let the disc carry color. The payoff is that any space-constrained surface (think mobile, where there's no room for a name) can fall back to **circle-only** with zero loss — players have already been trained that the circle *is* the person. This is why the `<WordList>` redesign moved color off the word and onto a leading ●, with the word itself black.
- **Don't spend a colored circle on anything that isn't a player.** If a colored circle would read as "a player" where none is meant, pick a different shape or a non-palette color. Two existing instances of this discipline: the chat unread pill is **black**, not a player hue, so it doesn't read as a sender (see [GamePage header](#gamepage-header)); and the spellingbee rank ladder uses **squares**, not circles, for its tiers — a bright-yellow *circle* would muddy the "circle = player" signal, so rank tiers take a different shape (`RankBar.module.css`).

## Interactive tile states

Board tiles a player can act on (psychicnum's word tiles, connections's category
tiles; the pattern every game's tiles share) converge on **one look**, driven
entirely by the `--tile-*` tokens in [`common/theme.css`](../src/common/theme.css)
and the shared `.tile` / `.tileWord` classes in
[`common/components/playArea.module.css`](../src/common/components/playArea.module.css).
A player who learns the board in one game reads it in the next.

- **Resting** — a warm **beige** fill (`--tile-bg`, the NYT-Connections idiom
  kept as the *one* shared tile color), a tan border a step darker
  (`--tile-border`), near-black ink (`--tile-text`), and a small drop shadow
  (`--tile-shadow`) so a tile reads as a physical tile.
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
inner padding): now that the tiles carry their own beige fill and depth, an outer
frame is redundant, and connections' full-width bands want to sit edge-to-edge
anyway. The grid fills its column edge-to-edge. (A tray remains available as a
per-game option if a future board wants one.)

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

## PlayArea layout

The shape every game's play surface converges on. Validated on **psychicnum**,
then **connections** — so the scaffold + readout classes are
**promoted to [`common/components/playArea.module.css`](../src/common/components/playArea.module.css)**
(a CSS-only module imported the way `setupForm.module.css` is, composed with a
thin per-game module via `cls()`). **codenamesduet** is now the third adopter and
the rule-of-three stress test: it's the structural odd-one-out — turn-based, one
clue then several guesses, per-viewer keycard overlays, and a real free-text
`<input>` rather than capture-entry — so fitting it onto the *same* shell proves
the pieces are general, not just "what the two similar games happened to share."
Other games keep their old shells until we reach them.

**The contract:**

- **No whole-page scroll.** The play area fills the viewport —
  `height: calc(100vh - var(--game-chrome-height))` — and only inner regions
  (the turn log / word list, chat) scroll. The chrome token covers the body
  padding (1rem) + the header + the header→play-area gap; see [Page-height fits the viewport](#page-height-fits-the-viewport).
- **Two columns, no chrome around them.** A **board column** (`.boardCol`, left)
  and an **info column** (`.infoCol`, right). No border / margin / padding around
  the play area or around either column — the *only* thing between them is a
  single thin **divider**: a `border-left` (`--color-divider`) on the info
  column's inner edge, with symmetric breathing room (the layout `gap` on the
  board side, the info column's `padding-left` on the other).
- **Info column = fixed width, never grows during play** (the *one* fixed column;
  the board grows, this doesn't). Holds the four **info readouts** (see
  [Info-column readouts](#info-column-readouts) below) above the **turn log**
  (chronological, one entry per turn) or **word list** (alphabetical found-words;
  boggle/spellingbee). It's the **mobile-secondary** column — on small screens it
  may collapse to a popup — so anything *critical to playing* goes in the board
  column instead. (That's why the word/number **entry** lives below the board,
  not here — and it's the capture model, not an `<input>`; see
  [Text entry](#text-entry--capture-not-input).)
- **Board column HUGS its board.** The four redesigned games converge on one
  model: `.boardCol` is `flex: 0 0 auto` and only as wide as its board, which
  grows to fill *up to* a per-game max tile size (see [Board sizing](#board-sizing)).
  **Fill is the no-cap case** — with no cap the board grows to the full available
  width, so a capless game still reads as "fills." The column is **top-aligned**
  (`justify-content: flex-start`) — the board at the top — and anything stacked
  below (the entry row, or the terminal reveal) stretches to the board width.
  (scrabble + boggle still use the older viewport-math shrink-wrap; deferred.)
- **`align-items: stretch`** makes both columns full-height (the divider spans;
  the log scrolls inside). The board-column + info-column pair is narrower than the
  play area, so `justify-content: center` centers them with equal outer margins.

**Locked names:** board column / `.boardCol`, info column / `.infoCol`, the
divider, **turn log** (`<TurnLog>` — chronological, outcome-bar entries) vs
**word list** (`<WordList>` — alphabetical, circle markers). Tiles follow
[Interactive tile states](#interactive-tile-states); identity uses
[a colored disc](#player-identity--a-colored-disc); feedback splits
[local vs group](deferred.md#feedback-channels-local-vs-group).

**Shared vs per-game:** the shell + readout classes now live in the shared
`common/components/playArea.module.css` (a CSS-only scaffold, like
`setupForm.module.css` — no behavior, so a stylesheet rather than a component).
What stays in each game's own module: the board **grid** (psychicnum grows tiles
to fill; connections fixes their height — same purpose, different behavior), any
result/semantic tile fills, the board tray frame, and game-specific readout
copy. `<TurnLog>` *is* a shared component (it has behavior); the two-column shell
is just shared CSS. The shared **`.tile`** chrome lives in the same module.

### Info-column readouts

The non-log part of the info column converges on **four recurring kinds of
info**, each a **named class** (not raw `muted`) so it reads the same across
games and can promote to a common stylesheet. Validated on psychicnum; reuse
these names when a new game's info column needs the same.

| class | what it is | style | terminal? |
|---|---|---|---|
| **`.infoSetup`** | the choices made at game *creation* (psychicnum: tiles / secrets / difficulty) | full text color; behind a `<details>` disclosure ("Setup options"), collapsed by default | **shown** (still useful in review) |
| **`.infoState`** | the important *live* state (psychicnum: "0/3 found · 2/9 guesses used") | full text color, bold figures | **shown** |
| **`.infoHelp`** | UI instructions ("Click or type a word and hit submit") | **muted** | **hidden** |
| **`.infoActions`** | the action-button row | — | **swaps** (see below) |

- **Setup is the one allowed growth-during-play.** It's a closable `<details>`,
  so opening it grows the column but it *reclaims* the space — the rationale
  that earns the exception to [Layout stability](#layout-stability): "what did I
  pick at setup? — but I don't want it taking room the whole game."
- **Action row = turn/game-altering actions only.** Hint, Reveal, End (all
  change the game/turn). A control that's *purely visual and about the board
  itself* does **not** go here — psychicnum's **Shuffle** (reorders the same
  tiles, changes nothing about the game) **floats over the board** (top-right)
  instead, and stays live even at terminal ("could I have found that with a
  reshuffle?"). The test: changes game state/turn → action row; board-only view
  aid → on the board.
- **Terminal swap.** Setup + state stay; help hides; the action row replaces the
  play buttons with a **bold, outcome-colored result line** (won = green / lost =
  red / manual-end = neutral, via the `--color-outcome-*-strong` tones) + a
  **compact** back-to-club button (`<BackToClubButton compact>` → just "‹ club").

Now shared in `common/components/playArea.module.css` (promoted when connections
became the second adopter) — `.infoSetup` / `.infoState` / `.infoHelp` /
`.infoActions` / `.terminalActions` / `.helperButton` / `.outcome_*`. connections
fills them with: setup = puzzle words / categories / mistakes / timer; state =
"N/4 categories found"; help = "Pick 4 tiles…"; actions = **Hints** + **End**
buttons (both moved off the GamePage menu into the action row). codenamesduet
fills them with: setup = turn cap + first clue-giver; state = "{green}/15 agents ·
turn {n}/{cap}"; help = the current phase instruction — and in **sudden death** a
leading red **SUDDEN DEATH:** before the explanation; actions = **End** (also off
the menu). codenamesduet's *move* controls are deliberately **not** here — the
clue form / active clue + Pass / waiting line live in the below-board input row
(critical-to-playing belongs in the board column; see
[Text entry](#text-entry--capture-not-input)).

## Text entry — capture, not `<input>`

For **single-token entry** (a word, a number — psychicnum, and the path
boggle/spellingbee should converge on), the play surface does **not** use a real
`<input>`. These are board-first games: the board is where the eyes and clicks
go, and a focused `<input>` loses focus the instant you click a board tile, so
typing silently stops. Instead we **capture keystrokes off the window** (the
shared `useGlobalKeyHandler`) and show the pending value in a read-only display
box (the shared **`<EntryBox>`**), so there's no focus to lose — typing and
tile-clicks both feed one pending value, and clicking anywhere never interrupts
entry.

**Free-text / phrase entry** (codenamesduet's clue — arbitrary words, spaces,
mid-string editing) is the exception: it stays a real `<input data-game-input>`,
where native cursor/selection/editing earns its keep. The rule: *single token →
capture; free text → `<input>`.*

The contract for the capture model:

- **Simulated caret = honesty.** `<EntryBox>` draws a blinking caret to say "type
  here" (recovering the one thing a real input's cursor gave). It blinks **only
  while the game owns the keyboard** — gated on `useGameHasKeyboard` (no
  `<input>`/`<textarea>`/`<select>`/contenteditable focused), the *same*
  condition under which `useGlobalKeyHandler` routes keys to the game. So **caret
  visible ⟺ keystrokes land in the game**; it never duels with the chat box's
  cursor.
- **No tabbing between controls.** While the entry is live, `Tab` is swallowed —
  these games are navigated by clicks + typing, not by tabbing focus between
  buttons, and a caret blinking on the board while focus sits on some button reads
  as two cursors. (Focused text fields like chat keep their own `Tab`.)
- **Modified keystrokes pass through.** Bail before capturing anything when a
  `metaKey`/`ctrlKey`/`altKey` modifier is held, so `Cmd-R`, `Ctrl-Tab`, etc. stay
  the browser's.
- **What can be entered is per-game** (digits vs letters vs length caps); the
  shared pieces are the display + caret + focus-gating. The Backspace/Enter/Tab
  key boilerplate is a candidate to lift into a shared helper once a second game
  adopts `<EntryBox>`.

**Own-result flash — the shared `<ResultFlash>`.** The player's own last move
flashes a result for the *local* half of the feedback split (see [Feedback
pill](#feedback-pill) for the *group* half): "Correct!" / "Incorrect" / "One
away!" or a validation error, in the green/red/amber outcome palette. It's the
shared **`<ResultFlash tone label />`** (`common/components/ResultFlash`), which
**replaces the whole input bar** for ~1.4s — psychicnum swaps it in for the
entry + Submit row, connections for the Clear/Submit commit row, so the two read
identically. The host reserves the bar height (its input row's `min-height`) so
the swap never reflows the board, and owns the flash's lifetime (a timer, cleared
early when the player starts the next move — the next keystroke for psychicnum, a
tile click for connections). The capture-input games keep their `<form>` mounted
under the flash so the key handler keeps capturing while it shows. (`tone: 'near'`
— the one-away amber — is connections-only; psychicnum has no near-miss state.)

**Terminal reveal goes where the entry was.** When the game ends, render the
reveal ("The words were …") in the slot the entry vacated — *below* the
top-anchored board, never as a heading above it (a heading shifts the board down
on state change — [Layout stability](#layout-stability)). It lands where the
player was already looking and explains why the entry is gone.

**Locked names for the input row.** The row below the board and its parts use
one vocabulary across games (each still in the game's *own* module — same names,
not yet a shared stylesheet): **`.inputRow`** (the reserved-height row that holds
the move controls — psychicnum's word entry + Submit, connections' Clear /
Submit), **`.inputButton`** (a Lucide-icon + label button in it; `min-width:
7rem`, centered), and **`.inputMessage`** (what fills the row when the controls
are gone — the terminal reveal, or an "out of guesses / you're out" waiting
line). Reuse these when a new game grows the same row. The **`.inputMessage`**
text presentation is canonical across games — **muted, `1.15rem`, normal weight**
(`<strong>` rises to full text color for key tokens) — a *calm, secondary* line,
since the loud verdict lives in the GameOverModal + the bold info-column
`.outcome`. (Its box differs by placement: a padded board-column child in
psychicnum, a `flex: 1` span in the `.inputRow` in connections — same text, the
box fits where it sits.)

## Turn log

The shared **`<TurnLog>`** + **`<TurnLogItem outcome>`** (`common/components/TurnLog.tsx`)
is a game's per-turn history — one **item** per turn (= per guess for most games; a
TinySpy turn can span several guesses, so the row is an "item"/"turn", never a
"guess" in the shared vocabulary). It's the chronological counterpart to the
alphabetical `<WordList>` (spellingbee/boggle); a game has whichever fits.

- **It's a `<table>`.** Rows are `<tr>`s and each game supplies its own `<td>`
  cells, so the pieces line up in **columns across rows** (the number column, the
  who column, etc. all align) — which a flex/grid-of-rows can't do, and which is
  the point once rows carry several pieces of info. `<TurnLogItem>` prepends the
  shared outcome-bar cell; the game passes the rest.
- **Class vocabulary.** The structure is `turnLog`-prefixed (`.turnLog` /
  `.turnLogBox` / `.turnLogItem` / `.turnLogBar`); `.turnLog` carries the shared
  `flex: 1` column-fill so a consumer needs no `className` for the common case.
  The small composable **content classes** (`.primary` / `.meta` / `.who`) keep
  bare names — read as `turnLog.primary` at the call site, already namespaced by
  the import alias. (The actor name + identity disc is the shared
  [`<ActorTag>`](#player-identity--a-colored-disc), not a TurnLog class.)
- **Scroll box.** Heading over an *evident* bordered, fixed-height box (a 2px
  frame, not a hairline, so it reads as scrollable) that stays the same height
  whether empty or full and auto-snaps to the newest row; the table scrolls
  inside it.
- **Outcome bar — every entry, every game.** The first cell holds a colored bar
  (`good` / `bad` / `partial` / `neutral` → the shared `--color-outcome-*`
  palette, so a "bad" turn reads the same everywhere). It's a real `<span>`, not
  a styled empty cell: **an empty table cell collapses (its `width` is ignored)
  and has no content box to paint**, so neither a cell background nor
  `background-clip: content-box` shows anything — the span is what makes it
  reliable. The cell's padding does the spacing — `padding-left` is the bar's
  left margin, `padding-right` the gap to the next cell, and the vertical padding
  insets the bar (so adjacent rows' bars don't touch and read as individual
  segments). The bar tracks the row height.
- **Flat rows, not cards.** No per-row border or margin — rows are separated by a
  single horizontal **divider line** (the cells' shared `border-bottom`), which
  spans the full width (reaches the left edge) and, with symmetric cell padding,
  sits centered between rows. No vertical borders between cells.
- **Content library, not ad-hoc.** Cell *content* is game-specific, but games
  compose it from `TurnLog.module.css`'s content classes — `.primary` (the lead
  value), `.meta` (minor/de-emphasized info), `.who` (a right-aligned cell that
  absorbs the row's slack so the discs line up on the right) — plus the shared
  [`<ActorTag>`](#player-identity--a-colored-disc) for the actor (name + identity
  disc), so similar pieces look the same across games. The set grows as new
  shapes recur; reach for an existing class/component before inventing one.

psychicnum, connections, and codenamesduet all use `<TurnLog>` — codenamesduet's
`GameTurnLog` is the **multi-guess** case the "item, not guess" vocabulary was
named for: one item spans a clue + its several guesses (its outcome bar is
derived per turn in `codenamesduet/lib/turnOutcome.ts`). The older `HistoryPanel`
predecessor it replaced has been **deleted** (it had no other consumers — scrabble's
framed `PlayLog` is separate and unaffected). A connections row stacks the four
guessed tiles + a verdict sub-line in one cell while the turn-number and who
columns still align across rows.

## Board sizing

A game board grows as large as the space allows. The **four redesigned games**
(psychicnum, connections, codenamesduet, waffle) share **one model: the board
column HUGS its board.** The column is only as wide as the board, and the
board+info pair centers (`justify-content: center` on `.layout`). **"Fill" is
just the no-cap case of hug** — with no max tile size the board grows to the full
available width, so a capless game reads exactly like the old fill model. (Each
of the four exposes a max-tile-size knob; psychicnum caps, the others ship
uncapped today — so connections/codenamesduet/waffle still *look* like they fill,
but they're on the hug structure.) scrabble + boggle are still on the older
viewport-math shrink-wrap form ([below](#the-older-shrink-wrap-form-scrabble--boggle)); migrating them is deferred.

### The shared scaffold

In `common/components/PlayArea.module.css`:
- **`.boardCol { flex: 0 0 auto }`** — hugs its board (was `flex: 1` fill).
- **`.layout`** defines **`--avail-w`** = `calc(100vw - var(--info-col-width) -
  var(--layout-gap) - 2 * var(--page-padding))` — the width left beside the fixed
  info column, built from shared tokens (so a change to the info-column width, the
  layout gap, or the page padding flows through to every board automatically).
  This is the *input* to each game's board width — see [Why the width is
  computed](#why-the-width-is-computed) for why it can't just flex.

### Each game's board

A board computes a **definite width** and hugs it; its **height flex-fills** the
column, capped:

```css
.grid  { width: min(var(--avail-w),
                     calc(var(--cols) * var(--max-tile-width, 999rem)
                          + (var(--cols) - 1) * var(--grid-gap))); }
.board { flex: 1 1 0;            /* fills the column height; grid's 1fr rows fill it */
         max-height: calc(var(--rows) * var(--max-tile-height, 999rem)
                          + (var(--rows) - 1) * var(--grid-gap)); }
```

The grid is `repeat(var(--cols), 1fr) / repeat(var(--rows), 1fr)` with a fixed
`var(--grid-gap)`, so tiles divide the definite size evenly with **constant gaps**
(capping a tile no longer stretches the spacing). `--cols`/`--rows` are per game —
static in CSS where the board shape is fixed (codenamesduet/waffle 5×5), or set
inline where they vary (psychicnum `ceil(√N)`; connections `bands + tile-rows`,
set on `.board` in `Board.tsx`).

**The tinker knobs.** Each game's board module carries a `─── TINKER HERE ───`
block with **`--max-tile-width`**, **`--max-tile-height`**, and **`--grid-gap`**
(rem). **Comment a cap line out → that axis is uncapped** (the `999rem` fallback
wins, so the board fills the available space on that axis). The knob lives
wherever the game keeps its board CSS — psychicnum `WordBoard.module.css`,
connections `PlayArea.module.css`, codenamesduet `BoardGrid.module.css`, waffle
`WaffleGrid.module.css` (a known inconsistency — consolidating them onto `.layout`
is a possible follow-up).

**`--info-col-width` is game-specific** — set per game on its `.layout` (the
shared scaffold has **no default**, so each game must declare it), since the right
column's needs differ (psychicnum narrow; spellingbee wide when it converts). It
feeds both the shared `.infoCol` width and `--avail-w`. The value is a **rem**:
"fixed-width" means `flex: 0 0` (never grows/shrinks), *not* a pixel lock.

**Waffle is the square variant.** A square is bounded by *both* dimensions, so it
can't size by width alone: `side = min(var(--avail-w), var(--avail-h), <cap>)`,
where **`--avail-h`** = `calc(100vh - var(--game-chrome-height) - <its
below-board slot>)` is the vertical counterpart of `--avail-w` (only waffle needs
it — the rectangular games flex-fill height). Its `.board` is `flex: 0 0 auto`
(the grid is definite in both dims) and its tinker knob is a single
**`--max-tile-size`** (square → one cap, not separate width/height). A solved
connections category is still **"one long tile"** (`grid-column: 1 / -1`) — a band
spanning all columns at the same row height/padding/depth as a tile.

### Why the width is computed

A shrink-wrapped flex column can only hug a child whose width is *already known*.
A square's width comes from its height; a `flex:1` / `container-type: size`
board's width comes from the column — both circular, so the column **collapses**.
Computing the width from the viewport (`--avail-w`, plus `--avail-h` for waffle)
breaks the cycle. (This is exactly why the container-query square waffle used
before couldn't be hugged: the size container collapsed in a hugging column.)

**Single-glyph vs word tiles** is unchanged: scale a single glyph (a digit, an
A-game letter) with the tile via `cqmin`/`cqi`; multi-char content auto-fits via
`cqi` + `--len` (see [Tile content](#tile-content-letter-vs-word-a-vs-b-games)).

### The older shrink-wrap form (scrabble + boggle)

scrabble + boggle still **drive the column width from the board** (the precursor
to the hug model above): the board has a **definite viewport size** and the column
shrink-wraps to it, the pair centered.
`min(calc((100vh - var(--game-chrome-height) - <below>) * cols/rows), calc(100vw - <side+gaps>), <maxTile>*cols + gap*(cols-1))`.
The viewport offsets there aren't accidental brittleness — subtracting the sibling
column + chrome is *inherent* to hugging. Migrating them onto the shared scaffold
(which now expresses the same idea via `--avail-w`) is deferred.

## Mode pills

A gametype's interaction `mode` (`'coop'` / `'compete'`, on the manifest) is **not** baked into its display `name` — it's shown at presentation time as a small colored pill via the shared [`<ModePill>`](../src/common/components/ModePill.tsx). So a coop + compete sibling pair carries the same `name` (e.g. both manifests say `wordle`), distinguished by the pill.

Rules:

- **Spelling.** The DB, code, and gametype strings spell it `coop`; the **UI says "Co-op"** (and "Compete"). The one place the FE text differs from the stored value — `MODE_LABEL` in [`lib/games.ts`](../src/common/lib/games.ts) owns the mapping.
- **Look.** An outlined chip — transparent background, with the border and text both in the mode color: co-op = teal, compete = purple (`--color-mode-*-text` in `theme.css`). Deliberately outside the won/lost/active outcome palette so a mode pill never reads as a result.
- **Solo clubs.** In a solo club (handle starts with `=`, one player) **no pill renders at all** — neither "Co-op" (no one to cooperate with) nor "Compete" (a solo member may have *enabled* a 2-player game like bananagrams, but "Compete" is meaningless with one player). Pass `soloClub` to `<ModePill>`; it returns `null`.
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
| Get hint | `Lightbulb` | Trash / dump | `Recycle` |
| Get answer / reveal | `Eye` | Pause | `Pause` |
| End game | `Flag` | Peel | **`🍌` kept** (see below) |
| Clear selection | `Eraser` | | |

**Conventions:**

- **The icon is decorative; the button carries the label** (visible text, or
  `aria-label`/`title` on icon-only buttons). So the icon is `aria-hidden`.
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

**The one deliberate exception:** bananagrams's **Peel** stays `🍌` for now — it's
MonkeyGrams brand flavor, not generic chrome; revisit when we reach bananagrams.

**Rollout.** Shared components (`PauseButton`, `ShuffleButton`,
`BackToClubButton`), psychicnum (Submit, Hint, Reveal, End), and connections
(Submit, Clear, Hints, End, floating Shuffle) are migrated; everything else moves
game-by-game (don't retrofit per-game buttons ad hoc). In both psychicnum and
connections, **End** is now an info-column action-row *button* (with the `Flag`
icon), not a GamePage-menu item. Still on their old glyphs / pending: the chat
bubble, the `×` close, the `✓`/`✗` marks, and any End game that's still a menu
item elsewhere (wiring icons into `<Menu>` items is a separate decision).

## Explicitly deferred

- **Responsive mobile layouts** beyond graceful degradation.
- **User-selectable themes** (dark / light / pink picker). Foundation is there; mechanism + UI + persistence aren't.
- **Animations and transitions** beyond the existing `:hover` brightness on tiles.
- **A literal palette layer** (`--color-gray-100`, etc.). Overkill at ~15 tokens; revisit at ~50+.
- **Font-size tokens** (`--text-sm`, `--text-base`, …). Components pick raw rem values ad-hoc; standardize when the variety becomes noise.
- **Promoting the board `.board` wrapper + `.grid` base into the shared
  `playArea.module.css`.** Today psychicnum's `WordBoard.module.css` and
  connections' `PlayArea.module.css` carry a byte-identical `.board` wrapper
  (`flex: 1 1 0; min-height: 0; display: flex; flex-direction: column`) and a
  near-identical `.grid` base (the per-game bits being the track definition + the
  `--tile-font-*` knobs). Tempting to share now, but both current boards are the
  same shape (a grid of equal tiles filling the column) — so the "shared" shape
  would just be *these two*, and a genuinely different board (scrabble's 15×15
  premium board, boggle's dice grid, a future crossword) is what reveals the real
  abstraction. **Defer until a structurally different board exists**, then extract
  what's actually common rather than guessing. (The per-game `.board` comments
  already name this as the future single place a framed board would live.)
- **Per-game UI testing** beyond what already exists. Manual smoke is the bar for now.
