# UI Redesign Decisions

Finalized rules from the UI/UX convergence pass (psychicnum, connections,
codenamesduet, spellingbee). This is **not a new direction** — it clarifies and
nails down decisions already in flight in [`ui.md`](ui.md), and locks the
vocabulary where we'd been loose. Where a name here differs from what's in the
code today, the [Reconciliation](#reconciliation-with-the-code) section at the
bottom lists what has to change.

## Game versions (v1 / v2 / v3)

A shorthand for where each game sits in the redesign, so we stay straight as we
sweep:

- **v1** — the original layout (every game before this redesign).
- **v2** — the shared-layout redesign: **psychicnum, connections, codenamesduet,
  spellingbee.** The new two-column scaffold, tiles, info column, capture entry.
- **v3** — conforms to the finalized rules in *this document*. This is the target
  as we realign each game.

The four v2 games are **not** automatically v3 — the [Reconciliation](#reconciliation-with-the-code)
items (local-feedback-as-pill, the `near` tone, the `variant` repurpose) are what
move them v2 → v3. The other six games go v1 → v3.

## Terms

We use two role phrases consistently. They name *where feedback appears*, not a
component:

- **global feedback area** — the feedback slot in the GamePage header. Its
  component is the existing **`StatusSlot`** (it normally shows the
  `<PlayersStrip>` and swaps in the feedback pill when there's feedback — so it
  isn't *only* a feedback area, which is why we don't rename it). Use this for
  feedback *about peers / opponents / chat* — **not** for feedback to the player
  about their own moves.
- **local feedback area** — the feedback slot in the board column, almost always
  in the `belowBoard` region under the board. Use this for feedback to the player
  about *their own* move.

Stop calling the global one the "header feedback area" or similar — it's the
**global feedback area**.

Both areas render the same component, the **`<FeedbackPill>`** (see below).

## Feedback

**Local and global feedback look the same.** Both render a `<FeedbackPill>` with
identical CSS — we'd been inconsistent (local feedback was a different
full-width bar); it converges on the pill.

- The **global feedback area** shows the pill **left-justified**.
- The **local feedback area** shows the pill **centered**.

### Tones

A pill carries a **tone** that drives its style (usually the color, but a tone may
influence more). The tone set is **semantic**, chosen to be a useful vocabulary
even if some tones share a color for now:

| tone | meaning |
|---|---|
| `neutral` | plain, no valence |
| `success` | the player's action succeeded / a good outcome |
| `error` | the player's action failed / a bad outcome |
| `warning` | "important, not good or bad" — "you already guessed that word," "Moth asked for a hint" |
| `info` | informational, no valence (distinct from neutral if/when we want it) |
| `near` | a near-miss — connections' "one away" |

Some of these map to the same color today (e.g. `warning` and `near` are both
amber-ish; `info` may equal `neutral`). Keep the names distinct anyway — the
point is a stable, semantic set we can re-color independently later.

### Dismissal modes

Every pill has one of three dismissal modes:

- **`timed`** — vanishes after *N* ms.
- **`sticky`** — stays until game logic clears it (typically when the next move
  starts; game-dependent).
- **`closeable`** — shows a close-`×`; the player dismisses it.

### Transient vs permanent

Most feedback is **transient**. A few cases are **permanent** — they stay until
the game replaces them:

- The **terminal message** shown when the game ends. Once shown it doesn't
  change and can't be manually dismissed.
- An **end-game mode** the player can only leave by winning/losing. The example
  is codenamesduet's **sudden death**: once in it, you stay until the game ends
  (so it's "permanent" until the terminal message replaces it).

**Permanent feedback looks *more* like its tone, not less.** A transient pill is
**outline-style**: white background, tone-colored border. A permanent pill is
**fill-style**: a *lightened* tone background **plus** the tone-colored border —
so a permanent `error` (light-red fill + red border) reads as more emphatically
"error" than a transient one (white fill + red border). The fill is the
permanence signal.

### Mentioning other players

In the **global feedback area** we're often talking about another player. When a
player is named, put their **player-color circle** to the left of their username:
"● Moth found APPLE." (This is the colored-disc identity convention — see
[`ui.md → Player identity`](ui.md#player-identity--a-colored-disc), and the shared
`<ActorTag>`.) This does **not** apply to the **local feedback area**, which is
about the player's own move and shouldn't be naming other players.

### Same info in more than one place is fine

The same fact often appears in several places **on purpose** — e.g. sudden death
shows in the info-column `.outcome` line *and* the `.infoHelp` explanation *and*
the local feedback area. That redundancy is intentional; don't "fix" it.

## Board column (`.boardCol`)

The board column shows the game board and the place the player enters moves and
gets feedback on them. **The board is top-aligned, not vertically centered.**

### The board (`.board`)

The board itself is the `.board` element. It **sometimes** has a border and/or
background — boggle conventionally looks like a wooden tray — but **many games
have neither** (and therefore no padding). Border/background/padding are the
`.board`'s job, not the grid's.

### The grid (`.grid`)

Inside the board is usually a **grid** — the place where tiles are laid out. Most
games arrange tiles in a square/rectangle (boggle, scrabble, connections), but a
"grid" need not be graph-paper-regular: spellingbee's hex cluster is still a grid
in this sense — *the place where tiles are laid out*. **The grid has no border,
background, padding, or margin** — all of that belongs to the `.board`.

### Tiles (`.tile`)

Games have **tiles**. In the real-world game they may literally be tiles
(scrabble), cards (codenamesduet), or cubes (boggle) — **we always call them
tiles.** A tile has mild **depth**: a subtle drop shadow and slightly-rounded
corners. There's a **standard tile color** used by default, except where a game
deliberately decides otherwise (codenamesduet).

**Decided tiles.** A tile is **decided** once it's locked in and can't change; a
decided tile usually takes a new background color to show it. Examples:

- **codenamesduet** — tiles lock after a turn (with the special case that a
  neutral tile can still be clicked by the player who hasn't yet revealed it).
- **psychicnum** — correct guesses go green, misses red.
- **connections** — when a turn finds a category, those tiles are decided, recolor,
  and merge into one wide category tile.
- **scrabble** — once a move is accepted, those tiles are decided.

Some games have **draggable** tiles; a decided tile can't be dragged.

### Below the board (`belowBoard`)

Everything under the board is the **`belowBoard`** region. It contains:

- The **local feedback area** — a **fixed-height, fixed-width** slot. It occupies
  the same space whether or not there's feedback to show, so the board never
  reflows when feedback appears or clears.
- A **`GameEntryArea`** — shown *when there's no feedback occupying the slot* —
  where the player makes a move. This is the move-controls row (`.inputRow`). It's
  game-specific:
  - **psychicnum** — the word entry.
  - **spellingbee** — the word entry plus submit / delete buttons.
  - **codenamesduet** — present **only** while the player is acting: the clue
    textboxes while authoring a clue, or the "end turn" button while guessing.
    While waiting for the other player, there's **no** `GameEntryArea`.

Some games put other things in `belowBoard`; many don't.

## Move entry: `EntryBox`

For games where the player types a word (psychicnum, spellingbee, boggle, …) we do
**not** use a real `<input type=text>`. We use the shared **`<EntryBox>`** plus the
**`useGlobalKeyHandler`** hook (captures keystrokes off the window) and
**`useGameHasKeyboard`** (gates capture so it never fights the chat input). Why
capture instead of an input: these are board-first games, and a focused `<input>`
blurs the instant you click a tile, silently stopping typing.

Rules:

- It catches **alphabetic** keystrokes (not non-alpha) and shows them in the
  display, **centered**.
- Entered text renders **bold, all-caps, with slight letter-spacing.**
- There's a **simulated blinking caret**, shown **only when the player has typed
  something** *and* the game owns the keyboard. An empty box shows a **grey
  centered placeholder** instead (e.g. "Click a tile or type") — **not** all-caps.
  (This is already enforced in the shared `EntryBox`; it's not a per-game choice.)
- **Backspace** deletes a character. Some games also offer delete buttons.
- **Enter** triggers the game's submit-move button.
- **Up-arrow** recalls the previously-entered word; **down-arrow** clears it.
- After a word is submitted, the field clears.

**Free-text / phrase entry is the exception** (codenamesduet's clue — arbitrary
words, spaces, mid-string editing): that stays a real `<input>`, where native
cursor/selection earns its keep. The rule: *single token → capture (`EntryBox`);
free text → `<input>`.*

## Info column (`.infoCol`)

The info column sits to the right of the board column and shows extra information.
**Anything critical to playing lives in the board column, not here** — so a
narrow/mobile screen that drops the info column can still play the game.

Contents, in order:

- **Game status info (`.infoState`)** — core live state: words found, score, etc.
- **Opponent strip (`<OpponentStrip>`)** — a horizontal list of opponents in the
  "● Moth" style, each with short game-dependent status. (Fixed-seat 2-player
  games like codenamesduet show peer status in the **global feedback area**
  instead, so they may not carry an opponent strip — use the strip when there's a
  meaningful per-opponent metric.)
- **Action buttons (`.infoActions` → `.terminalActions`)** — a button row that
  changes with game state:
  - **non-terminal**: get-hint, reveal-answer, end-game, etc.
  - **terminal**: a short game-ended message ("Out of time," "Joel won," "You
    lose") plus the back-to-club button.
- **Help (`.infoHelp`)** — subtle grey text explaining *how to make a move*, not
  how to play (the Help modal teaches the game). It's mostly static, so people
  stop reading it after the first time — which is fine. **When the UI genuinely
  changes mid-game**, make it *loud* so they notice: codenamesduet's sudden death
  flips the mode, and we explain the new UI here with a prominent bold-red
  "**SUDDEN DEATH:** …" message.
- **Setup info (`.infoSetup`)** — a disclosure that reveals a bulleted list of the
  **setup options** the game was created with. It holds only setup choices —
  nothing that changes during play. **Layout-stability exception:** our rules say
  not to grow things beyond their allotted space, but we *suspend* that rule for
  this disclosure when it's opened.
- **Turn log / word list** — exactly one of:
  - **turn log (`<TurnLog>`)** — a table of turns with what happened each turn.
    Most games have this.
  - **word list (`<WordList>`)** — a side-scrolling list of found words.
    spellingbee and boggle have this.

  No game has both; some games have neither. Whichever is present **grows
  downward to fill the remaining column height.**

## Reconciliation with the code

Where these rules differ from the code as of this writing — the work to make code
match the doc:

1. **Local feedback → pill.** Today local own-move feedback is `<ResultFlash>`, a
   full-width bar that replaces the input row. The rule above makes it a
   `<FeedbackPill>` (same component/CSS as global, centered) in a fixed-size local
   feedback slot. Affects all four redesigned games.
2. **Tone set.** `FeedbackTone` should be
   `success | error | warning | neutral | info | near`. `near` is new; confirm the
   pill renders a style for **every** tone (`warning` currently has no style
   branch in `FeedbackPill.tsx`).
3. **Transient vs permanent = outline vs fill.** The existing `variant: 'fill' |
   'outline'` prop currently means *local-validation vs peer-identity*; repurpose
   it (or add a `permanent` flag) so **transient = outline** (white bg + colored
   border) and **permanent = fill** (lightened-tone bg + colored border). Peer
   identity stays carried by the **dot**, independent of fill/outline.
4. **Names already correct in code, just locked here:** `StatusSlot` (global
   feedback area), `EntryBox` + `useGlobalKeyHandler` + `useGameHasKeyboard` (move
   entry — *not* "WordInput"), `.infoCol` / `.infoState` / `.infoActions` /
   `.infoHelp` / `.infoSetup`, `<OpponentStrip>`, `<TurnLog>`, `<WordList>`,
   `closeable` (not "manual") dismissal.
5. **`belowBoard`.** spellingbee already names this region `.belowBoard`;
   generalize it as the standard container, with `.inputRow` as the move-controls
   row (the `GameEntryArea`) inside it.

A few statements in [`ui.md`](ui.md) now lag this doc — local feedback described
as the `<ResultFlash>` bar, the tone names, and the caret prose (which omits the
non-empty condition the code already enforces). Reconcile `ui.md` to match when we
do the implementation pass.
