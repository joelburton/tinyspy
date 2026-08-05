# Keyboard shortcuts

Every key the app listens for, in one place: the shortcuts that work on **any**
play area, then the per-game board keys. Screen-reader support is out of scope
(see [CLAUDE.md](../CLAUDE.md)), but *keyboard* support very much is not —
crosswords is keyboard-first by design, and every word game takes physical keys.

## How a keystroke is routed

There is almost no `onKeyDown` on the board. A play surface has nothing
meaningful to focus, so games listen on `window` and share one dispatcher,
[`useGlobalKeyHandler`](../src/common/hooks/input/useGlobalKeyHandler.ts). Four
gates apply before a key ever reaches game code:

| gate | effect |
|---|---|
| **focused text field** | A focused `<input>` / `<textarea>` / `<select>` / contenteditable owns its keys outright — typing "hello" into chat never spells it onto the board. |
| **floating panel** | Focus inside `[data-floating-panel]` (a confirm dialog, Help, Setup) hands the keyboard to that panel, so its Enter and Tab work. |
| **modifier bail** | `Cmd` / `Ctrl` / `Alt` chords go to the browser untouched (`⌥` is the one deliberate exception — crosswords and the shell use it for real shortcuts). |
| **open menu** | An open `<Menu>` `stopPropagation()`s every key, so window listeners never see them. |

Two consequences worth knowing:

- **The blinking caret is honest.** The simulated caret in an `<EntryBox>` shows
  only while the game actually owns the keyboard
  ([`useGameHasKeyboard`](../src/common/hooks/input/useGameHasKeyboard.ts)) — it
  stops the moment chat takes focus.
- **Tab is not a navigation key on a board.** Thirteen of the fifteen games
  swallow it (see the per-game table); crosswords uses it for clue navigation
  and codenamesduet traps it inside the clue form.

## Global — everywhere in the app

| key | what it does |
|---|---|
| `` ` `` | **Stands in for Escape.** Re-dispatched as a synthetic Escape on the focused element, so every Esc handler in the app works on a keyboard with no physical Esc key (an iPad with an external keyboard). Cost: you can't type a literal backtick, including in chat. |

## Global — any page with chat and the logo menu (club page + play area)

From [`useAppShortcuts`](../src/common/hooks/input/useAppShortcuts.tsx). These
fire when nothing is focused **and** while a *game* input is focused
(codenamesduet's clue field, psychicnum's guess box — they opt in with
`data-game-input`), so you can hit `/` to chat without clicking away first. They
type literally in a non-game field (chat, a setup form, the scratchpad).

| key | what it does |
|---|---|
| `/` | Open club chat and focus its input. Already-open stays open and refocuses. |
| `?` | Open the logo / game menu. |
| `~` | Open the free-form **look up a word** dialog. |

## Global — any play area

From [`GamePage`](../src/common/components/game/GamePage.tsx). All of these bail
inside any editable field (so `⌥⌫` stays "delete word" while typing a clue),
ignore `Cmd`/`Ctrl`, and ignore auto-repeat — every one is a discrete command,
and holding `+` would otherwise start dozens of games.

| key | what it does |
|---|---|
| `⇧<` | **Back to club.** Terminal → straight there; solo mid-game → suspends silently; multiplayer mid-game → the suspend-confirm modal. Mirrors the menu item. |
| `+` | **New game** — dispatched through the game's own New game menu item, so it inherits that item's disabled state and its mid-game confirm. |
| `⌥+` | **New game from setup** — same fresh game, but stops at the setup dialog so you can change the options. Deliberately not a menu item; the power-user variant. Matched on the physical key, so `⌥=` and `⌥⇧=` both work. |
| `⌥⌫` | **End game**, or **Concede** in a compete game that offers both (the shortcut follows the mode's primary exit). Disabled at terminal / once conceded. |
| `Esc` | Close the topmost floating panel or dialog (Help, Setup, a confirm, the word-lookup card, the definition popover, the mobile info sheet, the celebration dialog). |
| *any key* | **Dismisses sticky local feedback** — your next keystroke is your next move. A terminal verdict pill is permanent and survives this. |
| *any key* | **Exits the turn-history viewer** back to the live board, and is consumed (so the same press doesn't also play a move). Games with a viewer: codenamesduet, connections, letterboxed, psychicnum, scrabble, stackdown, strands, waffle, wordle. Clicking anywhere exits too. |
| `Tab` | **Swallowed** on most boards — a play surface is not a form, and native Tab walks focus out to the header and then into the browser's URL bar. Exceptions: crosswords (clue navigation) and codenamesduet (trapped inside the clue form). |

## Menus, dialogs, and panels

| where | key | what it does |
|---|---|---|
| Menu trigger | `↓` | Open the menu and step into it. (`Enter` / `Space` toggle it natively.) |
| Open menu | `↑` `↓` | Move through enabled items (wraps at the ends). |
| Open menu | `Esc` | Close. |
| Open menu | `Tab` | Close and let focus advance normally. |
| Confirm dialog | `Enter` | Confirm — the confirm button auto-focuses. |
| Confirm dialog | `Esc` | Cancel. |
| Any floating panel | `Tab` / `⇧Tab` | Cycles focus **inside** the panel (focus trap). Chat and the scratchpad opt out of Esc-to-close. |
| Chat box | `Enter` | Send. |
| Chat box / scratchpad | `Tab` | **Hands the keyboard back to the game** — blurs the field rather than walking focus onto the page chrome. `⇧Tab` is left alone so the panel's ✕ stays reachable. |

## Club page and home page

| where | key | what it does |
|---|---|---|
| Home (club list) | `↑` `↓` | Move the cursor ring through clubs (clamped, no wrap). The list is focused on arrival, so no first Tab is needed. |
| Home | `Enter` | Open the club under the ring. |
| Home | `Tab` | Swallowed — arrows plus Enter are the whole keyboard story here. |
| Club page | `↑` `↓` / `Enter` | Same cursor-ring navigation in the start-a-game list and the games list. |
| Club page | `Tab` | Toggles between the two lists (overlays keep their native Tab). |
| Club page | `⇧<` | Back to home — the twin of the play area's `⇧<`. |
| Create club | `Esc` | Back to home. |

---

# Per-game board keys

Everything below is **on top of** the global set. "Type A–Z" means the shared
capture keyboard: there is no `<input>` to lose focus when you click a tile.

## bananagrams

A 2-D board cursor ([`useBoardCursorKeys`](../src/common/hooks/input/useBoardCursorKeys.ts),
shared with scrabble). Frozen once you've conceded.

| key | what it does |
|---|---|
| `←` `→` `↑` `↓` | Move the board cursor. |
| `A`–`Z` | Place that tile from your hand and advance. Typing over a filled cell **swaps** — the old tile derives back into the hand. A letter you don't hold flashes the hand red. |
| `⌫` | Return the tile under the cursor to the hand, then step back. |
| `Enter` or `Space` | **Peel.** No-ops when a peel isn't legal. A focused Peel button won't double-fire it. |

## boggle

| key | what it does |
|---|---|
| `A`–`Z` | Type into the word entry (stored uppercase, capped at 16). |
| `⌫` | Delete the last letter. |
| `Enter` | Submit the word. |
| `↑` | Recall your last submitted word (add an `S`, fix a typo). |
| `↓` | Clear the entry. |
| `Enter` / `Space` on a focused tile | Trace that tile. Tiles deliberately don't take focus on a tap, so this is rarely reached. |

Rotating the board is a click-only control.

## codenamesduet

The only game whose input is real `<input>` fields, so it's the only one with no
window-level board keys.

| key | what it does |
|---|---|
| `Tab` / `⇧Tab` | Toggle between the clue's count and word fields — and nowhere else. With two fields, both directions are the same toggle. |
| `Enter` | Submit the clue (the form's submit). |

## connections

| key | what it does |
|---|---|
| `Enter` | Submit the selected four **from anywhere on the board** — not just when a tile holds focus (macOS doesn't focus a button on click, which used to kill the whole click-four-then-Return flow). Harmless no-op with an incomplete selection. |
| `Space` on a focused tile | Toggle it (native button activation). A focused tile's `Enter` is suppressed so it can't toggle *and* submit. |

## crosswords

The keyboard-first port. `⌥` shortcuts are keyed on the **physical** key, so
macOS dead-keys (`⌥C` = ç) don't matter. At terminal the navigation keys keep
working — walking the revealed grid is part of the post-game — while every
writing key goes inert.

**Grid**

| key | what it does |
|---|---|
| `A`–`Z` | Fill the cursor cell and advance (a given cell is immutable — the cursor slides off it). |
| `⌫` | Two-step: clear the current cell in place; if already empty, retreat and clear the cell you land on. |
| `⇧⌫` | Clear the whole current word, then drop the cursor on its first editable cell. |
| `Space` | Advance one cell (same word-edge stop as a letter). |
| `⇧Space` | Read-only zoom **peek** at the current cell's fill. Doesn't take focus; any other key drops it. |
| `←` `→` `↑` `↓` | Move the cursor. |
| `⇧` + arrow | Jump to the word edge. |
| `Tab` / `⇧Tab` | Next / previous clue. |
| `⇧Enter` | Open the **rebus** (multi-character) overlay. Bare `Enter` is a deliberate no-op — solvers hit it reflexively at a word's end. |
| `#` | Jump-to-clue-number popup. Checked before the modifier bail so it works on layouts where `#` is `⇧3`. |
| `\|` | Cycle the cryptic word-break / hyphen mark on the cell's **right** edge (none → break → hyphen). The cursor doesn't move. |
| `_` | Same, on the **bottom** edge. |

**Actions** (each mirrors a menu item, which advertises the shortcut)

| key | what it does |
|---|---|
| `⌥P` | Toggle pencil mode. |
| `⌥C` / `⌥⇧C` | Check letter / check word. (Check puzzle is menu-only.) |
| `⌥R` / `⌥⇧R` | Reveal letter / reveal word — **coop only**. |
| `⌥N` | Show the setter's note (when the puzzle carries one). |
| `⌥X` | Explain this clue (the AI explainer). |
| `⌥S` | Open the scratchpad. |

**Rebus overlay**: `Enter` commits and advances · `Tab` / `⇧Tab` commit and jump
to the next / previous clue · `Esc` cancels (so does clicking away).
**Number-jump popup**: `Enter` goes · `Esc` closes.

## letterboxed

The entry accepts **board letters only** — `charFor` swallows any letter not on
the square, and an appended letter that can't legally follow the one before it
(same side of the box) is refused at the keystroke rather than rejected on
submit. Once the chain has a word, the entry seeds itself with the **carried-over
first letter** (the previous word's tail), which isn't yours to delete.

| key | what it does |
|---|---|
| `A`–`Z` | Type into the entry — but only the twelve board letters land, and only where the side rule allows. Clicking board letters feeds the same word (clicking the word's current last letter again submits). |
| `⌫` | Delete the last typed letter — **stops at the carried-over seed letter**. |
| `Enter` | Submit the word. |

No `↑`/`↓` recall — a submitted word goes into the chain, not away, so there is
nothing to re-edit. Taking a word back is the × on the chain strip (a click
control).

## psychicnum

| key | what it does |
|---|---|
| `A`–`Z` | Type a guess word (clicking a board tile fills the same entry). |
| `⌫` / `Enter` | Delete / submit. |
| `↑` `↓` | Recall your last guess / clear the entry. |

The entry is inert while viewing history (so the keystroke goes to the viewer
instead) and when it isn't your turn.

## scrabble

The other board-cursor game (bananagrams' twin).

| key | what it does |
|---|---|
| `←` `→` `↑` `↓` | Move the board cursor. Committed tiles are locked — only staged ones are editable. |
| `A`–`Z` | Stage that tile from your rack at the cursor. |
| `⌫` | Remove the tile behind the cursor / the last staged one. |
| `Enter` | Play the staged word (only when it's a legal, committable play). A focused Submit button won't double-fire it. |

The first keystroke while a past turn — or a teammate's shared move — is on the
board exits back to live.

## spellingbee

| key | what it does |
|---|---|
| `A`–`Z` | Type into the entry (stored uppercase). |
| `⌫` / `Enter` | Delete / submit. |
| `↑` `↓` | Recall your last word / clear the entry. |
| `Space` | **Shuffle the hive** — a fresh visual scan. Works even mid-submit (it's a view-only key). |
| `Enter` / `Space` on a focused letter | Type that letter. Tiles don't take focus on a tap, so this is rarely reached. |

## stackdown

No text entry — a letter names a *tile*, not a character.

| key | what it does |
|---|---|
| `A`–`Z` | Play the matching exposed tile — but only if **exactly one** exposed tile bears that letter (the word is the selection order, so an ambiguous letter can't pick for you). Zero matches → an error pill; more than one → the candidates flash and you're asked to click one. |
| `⌫` | Return the most recently picked tile. |

## strands

No text entry at all: the board repeats letters, so a typed string can't
identify a path. Only the keys that act *on* a trace.

| key | what it does |
|---|---|
| `⌫` | Drop the last tile from the trace — a misclick costs one key, not the whole word. |
| `Enter` | Submit the trace (the keyboard twin of re-clicking the last tile). |

## waffle

No board keyboard — swapping is a drag/click gesture. Keys do only the two
universal things: dismiss feedback, and exit the turn-history viewer.

## wordle

| key | what it does |
|---|---|
| `A`–`Z` | Type the guess (capped at 5 — letters land on the **board**, not an entry box). |
| `⌫` / `Enter` | Delete / submit. |

The on-screen QWERTY keyboard drives exactly the same pending guess. There is
**no** `↑`/`↓` history here — that's an EntryBox affordance and wordle isn't one.
Capture freezes while viewing history so a keystroke returns you to live instead
of typing behind the banner.

## wordiply

| key | what it does |
|---|---|
| `A`–`Z` | Type the guess (capped at 28). |
| `⌫` / `Enter` | Delete / submit. |
| `↑` `↓` | Recall your last guess / clear — handy here, since the next guess is often the last one plus a letter. |

Shares the on-screen `GuessKeyboard` with wordle (untinted — wordiply has no
per-letter feedback).

## wordwheel

Same shape as spellingbee, its fork parent.

| key | what it does |
|---|---|
| `A`–`Z` | Type into the entry (stored uppercase). |
| `⌫` / `Enter` | Delete / submit. `Enter` is **inert** when the typed word can't be spelled from the wheel's tiles — editing stays live so you can fix it, rather than the word submitting and coming back "not a word". |
| `↑` `↓` | Recall your last word / clear the entry. |
| `Space` | Shuffle the wheel. |
| `Enter` / `Space` on a focused tile | Type that letter. |
