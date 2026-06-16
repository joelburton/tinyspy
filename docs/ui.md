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
- **Back-to-club + suspend-confirm.** Non-terminal navigation-away opens the suspend modal; terminal is a single-click back. Owned by `<GamePage>`.

A new gametype that wants to omit one of these isn't building "a new gametype" — it's stepping outside the frame, and that's a CLAUDE.md-priors conversation, not a manifest field to toggle.

### Components

Same principle, applied to components.

**The chrome is shared.** Cards, banners, chat, login, the home page, the club page — these look the same regardless of which game is mounted. Current realization:

- `ClubChatPanel`, `PauseBoundary`, `PauseOverlay`, `SuspendConfirmDialog`, `TimerField`, `ClubGameCard`, `StartGameButtons` are shared. The route-level `<GamePage>` mounts the cross-cutting ones (chat, pause, suspend confirm, timer in header) so every game inherits them.
- `LoginScreen`, `HomePage`, `ClubPage`, `CreateClubPage` are shell-level, game-agnostic.
- `.card`, `.muted`, `.error`, `.link-button`, `.actions` are universal utility classes in `common/theme.css`.

**The game-mechanic UI is per-game.** The board, rules display, input affordance (clue form vs number input vs guess box) — each game owns these. That's what the per-game `components/` directory is for.

**The current grey zone: game-end banners.** Tinyspy has a styled [`GameOverBanner.tsx`](../src/tinyspy/components/GameOverBanner.tsx) with tone-tagged CSS (win / loss); psychic-num has a [`ResultBanner.tsx`](../src/psychicnum/components/ResultBanner.tsx) that's a bare `<section>` + `<h2>` with no styling; wordknit renders its terminal copy ("Solved!" / "Out of time.") inline in `PlayArea.tsx` with no banner component at all. Three games, three shapes. The right move when a fourth game would benefit (or when this drift gets visibly painful): extract `common/components/GameResultBanner.tsx` that all three consume, with `{ outcome, title, detail?, actions? }` props. Same component, per-game copy.

## Explicitly deferred

- **Responsive mobile layouts** beyond graceful degradation.
- **User-selectable themes** (dark / light / pink picker). Foundation is there; mechanism + UI + persistence aren't.
- **Animations and transitions** beyond the existing `:hover` brightness on tiles.
- **A literal palette layer** (`--color-gray-100`, etc.). Overkill at ~15 tokens; revisit at ~50+.
- **Font-size tokens** (`--text-sm`, `--text-base`, …). Components pick raw rem values ad-hoc; standardize when the variety becomes noise.
- **Per-game UI testing** beyond what already exists. Manual smoke is the bar for now.
