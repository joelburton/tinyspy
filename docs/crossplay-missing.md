# CrossPlay parity audit — what's missing

A complete feature-parity audit of `~/src/crossplay` (Joel's Fastify + WebSocket +
SQLite crossword app) against the `crosswords` game here (`src/crosswords/`) plus
the shared `common/` layer it opts into. The question for every crossplay feature:
is it (a) already covered by a `common/` feature, (b) already present in
`crosswords/`, or (c) missing — including anything we deliberately deferred?

**Method.** Independent whole-file inventories of both codebases (every keyboard
handler, every menu item, every dialog, every setting, every CLI script), then
cross-checked against `docs/games/crosswords.md` and `docs/deferred.md`.

## Verdict

Parity is **very high**. The gameplay surface — grid, cursor/word navigation,
rebus, Schrödinger, cryptic edge marks, check/reveal/clear, peer cursors +
fill-flash, shared-note "read together", scratchpad, AI explain-clue, print PDF,
`.puz`/`.ipuz` upload + NYT-by-date + library sourcing, saved-fill restore,
collapse-rebuses, Download-as-.ipuz, and the full ⌥-shortcut set — is **fully
ported**. Even crossplay chrome that doesn't port 1:1 (auth, home page, share,
library find-or-create, the `!`-important chat message, URL linkify, unread
badge) is **covered by the PupGames shell / `common/`**.

What remains falls into four buckets:

1. **Genuine gaps not previously written down** — small, mostly cosmetic (§1).
2. **Already-documented deferrals** — tracked in `deferred.md` / `crosswords.md`
   §9, listed here for a complete register (§2).
3. **Deliberate divergences** — where the Supabase/friends-only model
   intentionally does something different (§3).
4. **Replaced by the shell architecture** — crossplay chrome with no 1:1 port,
   by design (§5, appendix).

The full keyboard-shortcut parity table is §4.

---

> **✅ Update (2026-07-09).** All four §1 gaps + both actioned §2 items below
> have shipped (6 commits, `7c360db`…`5bece30`, tip green: tsc/eslint/910
> vitest). Rows kept for the record with their outcome; only the still-deferred
> §2 items (⌥M, fetch-nyt-range, NYT dedup, chat panel drag, scratchpad races,
> first-visit help) and the by-design divergences (§3) remain.

## 1. Genuine gaps (not previously documented)

These surfaced in this audit and were **not** in `deferred.md` / `crosswords.md`
§9. All minor; **all now done.**

| # | Feature | crossplay | here | Outcome |
|---|---|---|---|---|
| G1 | **Solve celebration — confetti + audio jingle** | `SolvedDialog.tsx` pops confetti glyphs (🎉🎊✨🥳🎈⭐) and plays `/audio/tada.mp3` (best-effort, swallowed if autoplay-blocked) on solve. | `common/…/terminal/TerminalModal.tsx` shows verdict copy + action row, **no confetti, no audio**. | ✅ **DONE** — added `common/…/game/CelebrationDialog.tsx` (generic, themed, +`/audio/tada.mp3`), **unused for now** — ready for a game's terminal flow to adopt. |
| G2 | **"Check skips pencil cells" one-time notice** | `ws.ts` broadcasts a one-time info message when a checked scope contained pencil fills, explaining why some cells weren't flagged. | Check skips pencil server-side (correct — `crosswords.md` §3), but there is **no explanatory message**. | ✅ **DONE** — timed "Check skips pencil marks." info pill after a check whose scope held a pencilled fill (FE-only). |
| G3 | **Backtick-as-Escape accessibility affordance** | `App.tsx` re-dispatches `` ` `` as a synthetic Escape for keyboards lacking an Esc key (iPad + external keyboard). | Not present. | ✅ **DONE** — `common/…/input/useBacktickEscape.ts`, mounted app-wide (not crosswords-only). |
| G4 | **`make-sunday-fixture` generator** | `scripts/make-sunday-fixture.mjs` generates a synthetic 21×21 puzzle exercising every supported feature, for visual testing. | The output fixtures are committed but the generator script itself wasn't ported. | ✅ **DONE** — ported to `supabase/scripts/crosswords/make-sunday-fixture.mjs` (both `.puz` + `.ipuz`); `npm run crosswords:make-fixture` reproduces the committed fixtures byte-for-byte. |

> **Corrected during review:** an earlier draft listed crossplay's **chat preview
> toast** (`ChatPreview.tsx` — a 3s message preview over the board) as a gap. It is
> **not** a gap — `common/…/hooks/chat/useChatFeedback.tsx` (wired into both
> `GamePage` and `ClubPage`) pops every new chat message into the **global feedback
> pill** as `● HANDLE: text` in the sender's color (80-char truncation, 2s
> auto-clear, shown to everyone but the sender). That's richer than crossplay's
> anonymous over-board toast. See §5.

---

## 2. Already-deferred (for a complete register)

These are real crossplay features we chose not to port; each already has a home in
`docs/deferred.md → crosswords` or `docs/games/crosswords.md §9`. Repeated here so
this document is the single complete parity picture.

| Feature | crossplay | Status here | Reference |
|---|---|---|---|
| **⌥M — open the menu** | `⌥M` toggles the title dropdown. | Deferred. Low value: the shell has no programmatic "open menu", and **`?` already opens the menu** here (and the logo click), so ⌥M's purpose is largely covered. | deferred.md → crosswords; crosswords.md §7 |
| **Answer-key PDF (`generateSolutionPdf`)** | Print offers both a puzzle PDF and a filled **solution** PDF (with cryptic wordplay). | ✅ **DONE** — `pdf/solution.ts` + a gated "Print answer key (PDF)" menu item (coop any time; compete at terminal). | crosswords.md §7 |
| **NYT overlay-PNG analysis** | `nyt.ts` decodes theme circles-on-shaded + author word-break bars from the raster overlay PNG on themed puzzles. | ✅ **DONE** — pure `nytOverlay.ts` detector (pinned to real NYT overlay fixtures) + `npm:pngjs` decode in the edge fn. | crosswords.md §5 |
| **`fetch-nyt-range` bulk CLI** | `scripts/fetch-nyt-range.ts` downloads a date range of NYT dailies to `.ipuz`. | Deferred — blocked on the `NYT_COOKIE_JAR` secret. Workaround: run crossplay's script, then `crosswords:import`. | deferred.md; crosswords.md §9 |
| **NYT dedup** | — | Deferred. Inline NYT games aren't stored, so re-fetching a date makes a new game (fine; NYT was never in the library). | crosswords.md §9 |
| **Draggable/resizable *chat* panel** | Chat is a full drag+resize panel with a persisted rect (`crossplay.chatRect`). | Note + Scratchpad **are** on the draggable `FloatingPanel` here; **chat (`FloatingChat`) is still fixed-position**. | deferred.md → Common ("Draggable + resizable chat panel") |
| **Scratchpad lock races C3b / C3c** | Server arbitrates the takeover lock. | Deferred — serverless design self-heals within seconds; can't corrupt the DB. | deferred.md → crosswords |
| **First-visit help auto-open** | Help auto-opens on first board visit (`seen_help_at` / localStorage). | Skipped in the port (review M3). Help is one keystroke (`?`) or the menu. | crosswords.md (build notes) |

---

## 3. Deliberate divergences (by design)

Not gaps — cases where the Supabase + friends-only model intentionally differs.
Listed so the divergence is a recorded decision.

- **NYT cookie: per-user setting → single server secret.** crossplay's
  `SettingsDialog` lets each user paste their own `dump-nyt-cookies` blob to fetch
  from *their* NYT account. Here it's one server-side `NYT_COOKIE_JAR` on the
  `crosswords-import-nyt` edge function — friends share one key. (The other half of
  crossplay's Settings, the **player-color picker**, **is** covered — by
  `common/…/account/EditProfileDialog` + `update_profile_color`.)
- **AI explain: "Show reasoning" toggle dropped.** crossplay's `ExplainPopover`
  can reveal the model's scratchpad reasoning. Here `ExplainDialog` deliberately
  **never returns native thinking to the client** (see its header comment) — only
  the finished explanation. Intentional.
- **`?` opens the menu, not Help directly.** crossplay's `?` opens the Help
  dialog; here `?` opens the game menu (whose first item is Help). One extra click
  to reach Help. Minor, arguably fine — flag if you want `?`→Help parity.
- **Anonymous play / `?name=` / public board links → account + club only.**
  crossplay lets anyone with a board URL play + chat anonymously as `Rando<NN>`.
  This repo is friends-only, no spectators, no anon (`CLAUDE.md` → "friends, not
  strangers"). N/A by design.
- **Connection banner / auto-reconnect / heartbeat / SIGTERM-drain persistence →
  Supabase Realtime + presence-pause.** crossplay hand-rolls a connection-status
  banner, exponential-backoff reconnect, a 30s heartbeat, and a 15s debounced
  save with a hard-crash loss window. Here every keystroke is a `set_cell` RPC
  (no loss window), and disconnect is handled by **presence-pause**
  (`PauseBoundary`) — which crossplay itself *lacks*. This is a codenames upgrade,
  not a gap.
- **Narrow / "tablet-with-keyboard" responsive mode not ported.** crossplay
  collapses the side clue lists into a strip below the grid at narrow widths. Here
  the layout is the fixed desktop board/clue-columns grid (a documented v3 layout
  exception), no media queries — consistent with desktop-keyboard-only scope.

---

## 4. Keyboard-shortcut parity (the explicit ask)

Every crossplay key handler and its status here. **All board/grid gameplay keys
have parity.**

### Board / grid (parity: complete)

| Key | crossplay | here | Status |
|---|---|---|---|
| A–Z letter (fill + advance, skip givens) | ✅ | `useGridKeyboard.ts` | ✅ parity |
| Backspace (two-step: clear-in-place, then retreat+clear) | ✅ | ✅ | ✅ |
| Shift+Backspace (clear whole word) | ✅ | ✅ | ✅ |
| Space (advance) | ✅ | ✅ | ✅ |
| Shift+Space (read-only zoom-peek) | ✅ | ✅ | ✅ |
| Arrows (move / rotate direction) | ✅ | ✅ | ✅ |
| Shift+Arrows (jump to word edge) | ✅ | ✅ | ✅ |
| Tab / Shift+Tab (next / prev clue) | ✅ | ✅ | ✅ |
| Enter (deliberate no-op) | ✅ | ✅ | ✅ |
| Shift+Enter (open rebus overlay) | ✅ | ✅ | ✅ |
| `#` (jump-to-number popup) | ✅ | ✅ | ✅ |
| `\|` / `_` (cycle right / bottom cryptic edge mark) | ✅ | ✅ | ✅ |
| Rebus overlay: Enter / Tab / Shift+Tab / Esc | ✅ | `Grid.tsx` RebusInput | ✅ |
| Number popup: Enter / Esc | ✅ | `NumberJumpDialog.tsx` | ✅ |

### ⌥-letter shortcuts (parity: complete except ⌥M)

| Key | Action | crossplay | here | Status |
|---|---|---|---|---|
| ⌥P | pen/pencil | ✅ | ✅ | ✅ |
| ⌥C / ⌥⇧C | check letter / word | ✅ | ✅ | ✅ |
| ⌥R / ⌥⇧R | reveal letter / word (coop) | ✅ | ✅ | ✅ |
| ⌥N | show note | ✅ | ✅ | ✅ |
| ⌥X | explain cryptic clue | ✅ | ✅ | ✅ |
| ⌥S | scratchpad | ✅ | ✅ | ✅ |
| ⌥M | open menu | ✅ | ❌ | **Deferred** (§2). `?` opens the menu here, so mostly covered. |

Both keep check/reveal **puzzle**-scope menu-only (no shortcut) — matching.

### App/shell keys

| Key | Action | crossplay | here | Status |
|---|---|---|---|---|
| `/` | open chat + focus input | ✅ (`PuzzleView`) | ✅ (`common/…/useAppShortcuts`) | ✅ parity |
| `?` | Help (crossplay) / menu (here) | ✅ Help | ✅ menu | ◐ divergent (§3) |
| `~` | look up any word | ❌ | ✅ (codenames-added) | ➕ extra here |
| Esc | close topmost modal / chat | ✅ | ✅ (dialogs own it) | ✅ |
| ⌥⌫ | End / Concede game | ✅ (as End game) | ✅ (`GamePage` global) | ✅ |
| ⇧< | Back to club | ✅ (as "back to main") | ✅ (`GamePage` global) | ✅ |
| `` ` `` | Escape stand-in (Esc-less keyboards) | ✅ (`App.tsx`) | ❌ | **Gap G4** |
| Menu arrows / Home / End / Enter | menu traversal | ✅ | ✅ (`common/…/Menu`) | ✅ |

---

## 5. Covered by the shell — the crossplay chrome that doesn't port 1:1

For completeness: these crossplay features have **no direct crosswords analogue**
because the PupGames club/registry shell replaces that whole layer. None are gaps.

| crossplay | Covered here by |
|---|---|
| Landing page, login/signup, **invite-code registration** | `common/` auth (magic links) + club invitations |
| Home page hero, **"Your games"** list (relative-time, fill-%, "live" badge, "playing with") | Club page + registry (`common/…/club/*`) |
| **Library find-or-create** + "you have a game on this puzzle" flag | Library picker in `SetupForm` → `create_game` copies the template |
| **Share dialog** (add co-player by handle) | Club membership + `useGameInvitations` join-popup |
| **UserMenu** (Settings / Log out) | `common/…/account/UserMenu` + `EditProfileDialog` |
| Player-**color picker** (in Settings) | `common/…/account/EditProfileDialog` + `update_profile_color` |
| `!`-prefix **important chat message** (bold + force-open) | `common/…/chat/ChatBody` + `FloatingChat` |
| Chat **URL linkify** | `common/…/linkify` |
| Chat **unread badge** + sender color | `common/…/chat/ChatBubble` |
| Chat **preview toast** (incoming message shown over the board) | `common/…/hooks/chat/useChatFeedback` → the global feedback pill (`● HANDLE: text`, sender color, 2s) |
| **Presence roster** (dots + names + "you") | `common/…/game/PlayersStrip` |
| Peer-**join feedback** (debounced) | `common/` presence feedback |
| Site icon / favicon, SPA router, dev console dump, prefs-column groundwork | PupGames branding / routing / infra |
| Author CLI: import, `puz-to-ipuz`, `set-note` | Ported → `supabase/scripts/crosswords/` |

---

## 6. Fully-ported crosswords features (the bulk — confirmed present)

Grid render (irregular / hidden / circled / shaded / numbered) · pure `cursor.ts`
navigation (36 tests) · two-tier clue highlight (active + crossing) with
auto-scroll · pen/pencil · **rebus** (≤8, shrink-to-fit) + **collapse-rebuses**
toggle · **Schrödinger** multi-answer + **rebus first-letter acceptance** ·
**cryptic edge marks** (`\|`/`_`, `set_mark`) + derived **enumeration** ·
**Shift+Space peek** · check/reveal letter·word·puzzle · **clear board** ·
terminal **"Reveal board"** answer key · **live per-cell CDC** (newer-wins,
optimistic echo) · **peer cursors + fill-flash** + coop **"read the note
together"** broadcast · **compete privacy** (RLS-on-read + client-drop) ·
**scratchpad** (shared-coop / private-compete, takeover lock) · **AI explain
cryptic clue** (leak-safe `reveal_solved_word`, 409-gated) · **Print / Save as
PDF** (verbatim jsPDF port) · **Download as .ipuz** (`solution_for` RPC) · setup
sources **Library / NYT-by-date / Upload** + client-side `.puz`/`.ipuz` parse +
**saved-fill restore** · coop End-game / compete per-player Concede.

---

*Bottom line:* parity is complete for everything actioned. The four §1 gaps and
the two actioned §2 items (answer-key PDF, NYT overlay) all shipped 2026-07-09;
what remains is either a deliberate deferral (⌥M, fetch-nyt-range, NYT dedup,
draggable chat panel, scratchpad lock races, first-visit help — §2) or a
by-design divergence (§3).
