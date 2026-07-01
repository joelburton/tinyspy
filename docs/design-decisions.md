# UI Redesign Decisions

Finalized rules from the UI/UX convergence pass (psychicnum, connections,
codenamesduet, spellingbee). This is **not a new direction** — it clarifies and
nails down decisions already in flight in [`ui.md`](ui.md), and locks the
vocabulary where we'd been loose. Where a name here differs from what's in the
code today, the [Reconciliation](#reconciliation-with-the-code) section at the
bottom lists what has to change.

## Game versions (v1 → v3)

A shorthand for where each game sits, so we stay straight as we sweep. **v3 is the
highest version — the standard this document defines.** (Some older notes called
it "v4" after an interim "v3" cut that no longer exists; there is no v4 — v3 *is*
the spec as it stands.)

- **v1** — the original layout (every game before the redesign). Today:
  **bananagrams**.
- **v2** — the shared-layout redesign: the two-column scaffold, tiles, info
  column, capture entry. An intermediate stage games pass through on the way to
  v3 — the shared layout, but not yet the full rule set below. **No game sits
  here now;** spellingbee was the last and has converted to v3.
- **v3** — conforms to this document **as it stands** — the full set of rules,
  including everything learned converting psychicnum: semantic buttons + tones,
  the feedback-pill tone border + bar, opponent-strip identity discs + metric
  labels, the terminal-look for locally-terminal states, sticky local feedback,
  natural-width action buttons. **psychicnum is the first v3 game — the
  reference;** **connections**, **codenamesduet**, **waffle**, **spellingbee**,
  **wordle**, **boggle**, **scrabble**, and **stackdown** follow. The remaining
  game (bananagrams) converts v1 → v3 next, following this doc + the
  [Reconciliation](#reconciliation-with-the-code) checklist.

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

A pill carries a **tone** that drives its style. **The whole border is the tone
color** — the left side a thick **bar** (like the turn-log outcome bars, easy to
read at a glance), the other three sides a uniform thin border in the *same*
color. Only the bar's thickness is special; the color wraps the pill. Widths are
uniform on every pill (2px sides + a thicker left bar — no per-tone or
per-local/global differences); a pale-grey side border read as no border at all,
so it had to carry the tone too. (`neutral` has no tone, so its border is a
visible dark grey.) The tone set is **semantic**, chosen to be a useful vocabulary
even if some tones share a color for now:

| tone | meaning |
|---|---|
| `neutral` | plain, no valence |
| `success` | the player's action succeeded / a good outcome |
| `error` | the player's action failed / a bad outcome |
| `warning` | "important, not good or bad" — "you already guessed that word," "moth asked for a hint" |
| `info` | informational, no valence (distinct from neutral if/when we want it) |
| `near` | a near-miss — connections' "one away" |

Some of these map to the same color today (e.g. `warning` and `near` are both
amber-ish; `info` may equal `neutral`). Keep the names distinct anyway — the
point is a stable, semantic set we can re-color independently later.

### Tone follows the event, not the viewer's stake

One event reads as **one tone everywhere**, regardless of whether it helps or
hurts the viewer. A *found word is green* in **both** modes: coop (a teammate
found one) and compete (an opponent found one — adverse to me, but still "they
found a word"). We do **not** recolor by competitive stake (e.g. red/amber
because an opponent scoring is bad for me).

Why: otherwise the player maintains two color-meanings for the same event —
green-means-found in coop, something-else in compete — which is hard to learn and
easy to misread. The identity `dot` already says *who*; the tone says *what
happened*, not *what it means for me*. (It also keeps green-for-correct reusable
if we ever surface, say, an opponent's turn log in compete.)

### Dismissal modes

Every pill has one of three dismissal modes:

- **`timed`** — vanishes after *N* ms.
- **`sticky`** — stays until game logic clears it (typically when the next move
  starts; game-dependent).
- **`closeable`** — shows a close-`×`; the player dismisses it.

**Local feedback defaults to `sticky`, not `timed`.** A local message reports the
result of the player's *own* move — important, and they may be looking elsewhere
on the board when it lands, so it shouldn't vanish on a timer they might miss.
Instead it persists until their **next move** dismisses it. Concretely in
psychicnum, a non-permanent local pill clears when the player **clicks a tile or
types a character into the EntryBox**. Reserve `timed` for low-stakes
acknowledgments. (Permanent local feedback — the terminal message — never
auto-dismisses at all; see [Transient vs permanent](#transient-vs-permanent).)

### Transient vs permanent

Most feedback is **transient**. A few cases are **permanent** — they stay until
the game replaces them:

- The **terminal message** shown when the game ends. Once shown it doesn't
  change and can't be manually dismissed.
- An **end-game mode** the player can only leave by winning/losing. The example
  is codenamesduet's **sudden death**: once in it, you stay until the game ends
  (so it's "permanent" until the terminal message replaces it).

**Permanent feedback looks *more* like its tone, not less.** Both share the same
tone-colored left bar + thin neutral sides; what differs is the **background**. A
transient pill is **outline-style**: a plain white background. A permanent pill is
**fill-style**: a *lightened* tone background — so a permanent `error` (light-red
fill) reads as more emphatically "error" than a transient one (white fill). The
background tint is the permanence signal.

### Mentioning other players

In the **global feedback area** we're often talking about another player. When a
player is named, put their **player-color circle** to the left of their username:
"● moth found APPLE." (This is the colored-disc identity convention — see
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

## Move entry: `EntryRow`

For games where the player types a word (psychicnum, spellingbee, boggle, …) we do
**not** use a real `<input type=text>`. They all render the shared
**`<EntryRow>`** (`common/components/EntryRow.tsx`) — one component bundling the
entire entry control so it looks + behaves identically everywhere: an icon-only
`<DeleteButton>` + the chrome-less **`<EntryBox>`** (display + caret, flex-filling
the row) + an icon-only `<SubmitButton>`, the **`useCaptureKeys`** keyboard (key
handling off the window via `useGlobalKeyHandler`, gated by `useGameHasKeyboard` so
it never fights the chat input), and the own-move/terminal **pill swap** (pass a
`pill` and it replaces the controls in the same slot, without unmounting, so a
keystroke still dismisses it). Why capture instead of an input: these are
board-first games, and a focused `<input>` blurs the instant you click a tile,
silently stopping typing. **Both icon buttons are always present, always icon-only**
— a game never hand-rolls or omits them. The host supplies only the capture values
+ which `pill` to show; a new word game gets the entry for free.

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
  (Both are **universal** — built into `useCaptureKeys`, so every capture game has
  them identically. A game passes `recall` (its last-submitted value) for up-arrow;
  down-arrow always clears.)
- The box **stretches to fill** the row between the flanking buttons (the shared
  `EntryBox` default — `flex: 1`), so there's always room for the longest word (the
  16-char cap) and the typed text centers in it.
- After a word is submitted, the field clears.
- Entry is **length-capped** (~16 chars — no real word is longer, and it keeps
  the text from overrunning the box). The text **size** is a per-game knob
  (`--entrybox-font-size`, default in `theme.css`) so a board-first game can go
  larger without affecting others.

The **universal** rules above — alpha-only capture, Backspace, Enter-when-non-empty,
the `Tab` swallow, the modifier bail, the length cap, and clearing the next-move
feedback — are **owned by `useCaptureKeys`** (`common/hooks/useCaptureKeys.ts`), so
they're identical across games and can't drift. A game supplies only *what may be
entered* (`charFor` — letters vs digits + the stored case, via the exported
`asciiLetters` helper) and any extra keys (`onExtraKey`). See
[`ui.md → Text entry`](ui.md#text-entry--capture-not-input).

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
- **Opponent strip (`<OpponentStrip>`)** — a horizontal list of opponents, each
  `● name: value`. Three rules: identity rides a **leading color disc**, not a
  colored name (the disc rule); every strip carries a **metric-label prefix**
  ("Found:", "Score:", "Turns left:") so the bare numbers aren't ambiguous; and
  the metric **value is full text color** (it's the key data — don't mute it). A
  whole `● name: value` unit never wraps mid-entry (the strip wraps between
  entries and grows vertically for many players). (Fixed-seat 2-player games like
  codenamesduet show peer status in the **global feedback area** instead, so they
  may not carry a strip — use it when there's a meaningful per-opponent metric.)
- **Action buttons (`.infoActions` → `.terminalActions`)** — a button row with
  three states:
  - **playing**: get-hint, reveal-answer, end/concede, etc. (natural-width — see
    [Action buttons](#action-buttons)).
  - **terminal** (game over): a short outcome message ("Out of time," "Ada won,"
    "You lose") + the back-to-club button.
  - **locally terminal** — the game continues but *this* player can't act (out of
    guesses, waiting): reuse the **terminal look** (a bold status line like
    "Waiting for others" + their End/Concede on the right). Being unable to act is
    basically terminal *for them*, so show it that way rather than as a quietly
    changed help line.

  **Terminal + locally-terminal always show in BOTH the action row and the local
  feedback area** — the action row's outcome/status line *and* a pill in the
  below-board local feedback slot. This is not redundancy to trim; it's the rule.
  (The two read differently: the action row is terse + carries the button; the
  local feedback pill can be fuller — "You're out — the rest are still racing.")
- **Help (`.infoHelp`)** — subtle grey text explaining *how to make a move*, not
  how to play (the Help modal teaches the game). Shown **only while the player can
  act on it**, and it **never silently swaps text**: a mid-game state that matters
  (out of guesses, sudden death) is announced *loudly* — the action row's terminal
  look, or codenamesduet's prominent bold-red "**SUDDEN DEATH:** …" — not a
  quietly-changed help line people won't notice.
- **Setup info (`.infoSetup`)** — a disclosure that reveals a bulleted list of the
  **setup options** the game was created with. It holds only setup choices —
  nothing that changes during play. **Layout-stability exception:** our rules say
  not to grow things beyond their allotted space, but we *suspend* that rule for
  this disclosure when it's opened.
- **Turn log / word list** — exactly one of:
  - **turn log (`<TurnLog>`)** — a table of turns with what happened each turn.
    Most games have this.
  - **word list (`<WordList>`)** — the shared `common/components/WordList`: a
    side-scrolling list of found words (heading over a bordered scroll-box card,
    column-major grid, finder-color discs, click-to-define). spellingbee and boggle
    use it; each builds its rows via its own `lib/displayRows` → `WordListRow[]`.

  No game has both; some games have neither. Whichever is present **grows
  downward to fill the remaining column height.**

## Action buttons

Game action buttons (Hint, Reveal, End, Submit, Delete, …) are **semantic
components** from `common/components/buttons/` — never a hand-rolled `<button
className="secondary icon-button">` in a game. Each component bakes in its glyph,
weight, and tone, so the same action looks identical across games and can't drift.

**The rule: games use the semantic button components. Need a button with no
semantic component yet? STOP and talk — we'll probably create one** (a one-line
wrapper around `<ActionButton>`). Don't invent a one-off button in a game's
PlayArea.

A button has **two axes** (`ActionButton`):

- **weight** — `primary` (the filled-accent *main* action: Submit) vs `secondary`
  (the outline everything else builds on).
- **tone** — the **same semantic vocabulary + palette as the feedback pills**
  (`neutral | success | error | warning | info | near`), coloring a secondary
  button's border + text + icon. So a `warning` button is the exact dark amber of
  a `warning` pill; an `error` button the dark red of an `error` pill — one
  palette across surfaces. (Implemented by re-setting the control-color tokens,
  so it composes with `button.secondary` regardless of stylesheet order.)

Today's toned buttons: **Hint / Reveal = `warning`** (dark amber — "important,
not good or bad"), **End game = `error`** (dark red — destructive), **Submit =
`primary`** (filled accent), **Clear / Delete = `neutral`**.

**End vs Concede.** Distinct components for distinct actions: **End** (`EndGameButton`)
is the neutral mutual "we're done" for solo / coop; **Concede** (`ConcedeGameButton`)
is "I give up, you win" for compete. Same flag glyph + `error` tone today, but kept
separate so they can diverge later (a concede should hand the opponent the win).

**Natural width, not stretched.** Action-row buttons size to their own icon +
label (`flex: 0 0 auto`), left-aligned with a consistent gap — they do **not**
stretch to equal widths or reach the column's right edge. Equalizing widths
clipped a longer label's icon, and unequal widths actually *aid* recognition (the
brain picks out "Hint is the short one"). A tidy right edge is worth less than
seeing each button whole.

## Reconciliation with the code

Where these rules differ from the code as of this writing — the work to make code
match the doc:

1. **Local feedback → pill.** Today local own-move feedback is `<ResultFlash>`, a
   full-width bar that replaces the input row. The rule above makes it a
   `<FeedbackPill>` (same component/CSS as global, centered) in a fixed-size local
   feedback slot. Affects all four redesigned games.
2. **Tone set.** `FeedbackTone` should be
   `success | error | warning | neutral | info | near`. `near` is the only tone
   missing today (`warning` is already styled in `FeedbackPill.module.css`); add
   `near` to the type + a `.near` / `.outline.near` rule when a game needs it
   (connections' "one away").
3. **Transient vs permanent = outline vs fill.** The existing `variant: 'fill' |
   'outline'` prop currently means *local-validation vs peer-identity*; repurpose
   it (or add a `permanent` flag) so **transient = outline** (white bg + colored
   border) and **permanent = fill** (lightened-tone bg + colored border). Peer
   identity stays carried by the **dot**, independent of fill/outline.
4. **Names already correct in code, just locked here:** `StatusSlot` (global
   feedback area), `EntryBox` + `useCaptureKeys` (built on `useGlobalKeyHandler`) +
   `useGameHasKeyboard` (move entry — *not* "WordInput"), `.infoCol` / `.infoState` / `.infoActions` /
   `.infoHelp` / `.infoSetup`, `<OpponentStrip>`, `<TurnLog>`, `<WordList>`,
   `closeable` (not "manual") dismissal.
5. **`belowBoard`.** spellingbee already names this region `.belowBoard`;
   generalize it as the standard container, with `.inputRow` as the move-controls
   row (the `GameEntryArea`) inside it.
6. **Semantic buttons — part of every v2 → v3 conversion.** Replace a game's
   inline action `<button>`s with the semantic components from
   `common/components/buttons/` (`HintButton`, `RevealButton`, `EndGameButton`,
   …), creating a missing one rather than hand-rolling (see [Action
   buttons](#action-buttons)). psychicnum is migrated; the other games convert as
   they reach v3.
7. **Turn log — the game owns its rows; `<TurnLogItem>` is retired.** The shared
   `<TurnLog>` is now the **panel only** (heading, scroll box, `<table>`); it makes
   no assumption about row shape, because row anatomy genuinely differs game to
   game (column count, multi-`<tr>` turns, an inline mini-board…). A converted game
   renders its **own `<tr>` rows** inside `<TurnLog>`, composing the shared atoms:
   **`<TurnLogBar outcome rowSpan?>`** (the optional outcome-bar cell — most games
   include it, but a row needn't) + the content classes (`.meta` / `.who` /
   `.primary` / `.actor` / `.dot`) + **`.turnLogDivider`** on the first `<tr>` of
   each turn (the between-turns line; `:first-child` suppresses it on the first
   turn, so apply it unconditionally). The only shared contract is "a turn-log item
   is a `<tr>` in the table." psychicnum, connections, and codenamesduet render
   their own rows now (codenamesduet's is a two-`<tr>` turn with a `rowSpan`ned
   bar), as does waffle (a single-`<tr>` swap row). **`<TurnLogItem>` has been
   deleted** — waffle was its last caller, and converting it off the wrapper left
   no callers. A future game that needs a turn log renders its own `<tr>` rows the
   same way; there is no wrapper to fall back on.

A few statements in [`ui.md`](ui.md) now lag this doc — local feedback described
as the `<ResultFlash>` bar, the tone names, and the caret prose (which omits the
non-empty condition the code already enforces). Reconcile `ui.md` to match when we
do the implementation pass.

### Conversion gotchas (learned converting codenamesduet)

Two mistakes that are easy to carry over from a v1/v2 layout — check for them
explicitly on every conversion:

1. **Get the `.infoCol` order right — don't eyeball it.** The
   [Info column](#info-column-infocol) section documents the exact order its
   pieces must appear in: **state → opponent strip → action buttons → help →
   setup disclosure → turn log / word list**. codenamesduet had drifted to
   setup-first with help and actions swapped. Read that section and reorder to
   match; a v2 layout's order is *not* a reliable guide.

2. **Use the turn log's real table structure — don't condense a row into one
   cell.** A `<TurnLog>` row is a `<tr>`; pieces that should line up as **columns
   across rows** must be real `<td>`s — and a multi-line turn is a **second
   `<tr>`** (with a `rowSpan`ned bar), not a stacked div. Do **not** collapse the
   whole row into a single `<td>` and rebuild the columns inside it with
   flexbox/grid, **and** don't stack two lines in one cell: both defeat the table
   (its whole job is columns lining up across rows) and were exactly the
   codenamesduet *and* connections bugs we unwound (connections first kept a
   `verdict | who` flex sub-line + the tiles in one cell — now a two-`<tr>` turn).
   A *lone* `<td>` (often `colSpan`) is right only when the row's content is
   genuinely **one piece** (a phrase like psychicnum's `Hint: <clue>`), never a way
   to fit two pieces side by side. The test: "should this piece line up with the
   same piece one row down?" → if yes, it's a column, give it a `<td>`.

   **The typical columns of a turn-log entry** (compose from the shared classes —
   full detail in [Turn log](ui.md#turn-log)):
   - **outcome bar** — `<TurnLogBar outcome rowSpan?>` (col 0; `rowSpan`s the whole
     entry when it's multi-row). Optional, but most games have it.
   - **meta** — `turnLog.meta`: a turn number / small note. Muted, shrinks, no
     spaces so it never wraps. Optional.
   - **main** — `turnLog.main`: the entry's headline content (the verdict, the
     clue, …). Exactly **one** per entry; it's `width: 100%`, so it absorbs the
     row's slack and is least likely to wrap. Put it where the gap should land —
     typically the **last content cell before `who`**, so the slack sits between
     the content and the actor.
   - **other** — `turnLog.other`: any additional content column (psychicnum's word
     beside its result). Sized-to-fit, one line. **Sizing only, no emphasis** —
     compose a look on top (`cls(turnLog.other, turnLog.primary)` for a bold word).
   - **who** — `turnLog.who`: the actor, via `<ActorTag>`. Right-aligned, shrinks
     to "name ●". It does **not** absorb slack (that's `.main`'s job) — a
     `width: 100%` here steals it and wraps a sibling (the connections "Not a
     match" bug).

   A multi-row entry tags its first row `turnLog.entryHead` and continuation rows
   `turnLog.entryCont` (the shared CSS hugs them together) — explicit classes the
   component sets, since it knows the row kinds. See [Turn log](ui.md#turn-log).
