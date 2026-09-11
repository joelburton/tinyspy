# Keyboard shortcuts

Every key the app listens for, in one place: the shortcuts that work on **any**
play area, then the per-game board keys. Screen-reader support is out of scope
(see [CLAUDE.md](../CLAUDE.md)), but *keyboard* support very much is not —
crosswords is keyboard-first by design, and every word game takes physical keys.

## How a keystroke is routed

There is almost no `onKeyDown` on the board. A play surface has nothing
meaningful to focus, so keys are read off `window`.

**Every key is an action** ([`common/actions`](../src/common/actions/doc.md)): a
surface binds an action, which is what gives it a key, a menu row and a button
at once, and ONE listener at the app root
([`useActionDispatcher`](../src/common/actions/dispatcher.ts)) fires whichever
bound action answers the keystroke. There is no second list of "which keys this
page wants" — the keys that work here are exactly the actions bound here, which
is what makes the generated key list in Help honest.

Two gates apply before any action is consulted:

| gate | effect |
|---|---|
| **focused text field** | A focused `<input>` / `<textarea>` / `<select>` / contenteditable owns its keys outright — typing "hello" into chat never spells it onto the board. An action opts out per its `inField`: the shell's `/ ? ~` reach chat from a game's own input, and crosswords' Tab works even in one. |
| **floating panel** | Focus inside `[data-floating-panel]` (a confirm dialog, Help, Setup) hands the keyboard to that panel, so its Enter and Tab work. Absolute — no action opts out. |

Then three passes, because a keystroke can mean three kinds of thing:
**watchers** (a wildcard that claims nothing — dismissing the last message runs
and lets the letter through), then **interceptors** (a wildcard that DOES claim,
which is a mode: a key with a past turn open means "back to the live board"),
then the **commands**, in the order the bindings mounted (a component mounted
with its page sits ahead of the page; one mounted later sits behind it — a
tiebreak, not a channel, since two live commands never share a chord). A hidden
or disabled binding is skipped rather than swallowing the key, so a sibling that
wants it gets it; when nothing takes it, a disabled binding that matched still
keeps it from the browser (Space with no legal peel does not scroll the page).
Anything matching nothing at all goes to the browser — which is what keeps
Cmd-R working.

**"Innermost first" is a fact about React, not a decision**, so when two
different commands are live and both answer one keystroke, the dispatcher says
so in the console (development only). Two actions may share a chord — End and
Concede share `⌥⌫`, Shuffle and Rotate share `⌥Z` — on the understanding that a
game offers one or the other; the warning is what notices when that stops being
true. Nothing static can catch this: whether two actions are on screen together
depends on what is mounted and on what each one's `describe` says at that
moment.

**A held key fires only an action that declares `repeat`.** The entry keys do —
letters, `⌫`, the arrows, Space, Tab, where repeating is the point — and the
`⌥` command chords do not, so holding `+` cannot start games at the OS repeat
rate.

**Tab is nobody's action — it belongs to a ring.** Every other key is a command
the dispatcher routes; Tab moves focus instead, so each surface declares the
ordered ring of stops it may visit ([`useTabRing`](../src/common/keyboard/useTabRing.ts))
and Tab never leaves it. A page lists its stops; a floating panel says "everything
inside me" and its ring is innermost while it is open; a board declares an empty
ring, which catches the key and moves nothing. Crosswords is the exception that
proves the shape — there Tab walks the clues, which is a MOVE, so it is an action
like any other.

`Cmd` chords match nothing, ever. `⌥` and `Ctrl` are ordinary modifiers an
action may ask for (`⌥` widely, `Ctrl` nowhere yet); a pattern key — "any
letter", "any arrow" — matches only an unmodified press, so `⌥L` is never a
letter someone is typing. An open `<Menu>` `stopPropagation()`s every key, so
the dispatcher never sees them either.

**Why the gates look like this** — see [ui.md → Real forms, and everything
else](ui.md#real-forms-and-everything-else). Both gates are that design rule in
code: the floating-panel gate *is* "this is a real form, the panel owns the
keyboard", and the focused-text-field gate is what makes category 3 (chat,
scratchpad, clue fields) work. Note the `<select>` in the first row is
almost vestigial outside real forms: gameplay and club-page dropdowns are
[`FilterSelect`](../src/common/lists/FilterSelect.tsx), which never
takes focus, so it never trips that gate at all.

Two consequences worth knowing:

- **The blinking caret is honest.** The simulated caret in an `<EntryBox>` shows
  only while the game actually owns the keyboard
  ([`useGameHasKeyboard`](../src/common/game-page/useGameHasKeyboard.ts)) — it
  stops the moment chat takes focus.
- **Tab is not a navigation key on a board.** Every play surface declares the
  ring of stops Tab may visit ([`useTabRing`](../src/common/keyboard/useTabRing.ts)),
  and a board's is empty — the key is caught and consumed rather than left to
  walk out to the browser. The two with somewhere for it to go are
  codenamesduet, whose clue form declares its two fields, and crosswords, where
  Tab is a move rather than navigation.

## Global — everywhere in the app

| key | what it does |
|---|---|
| `` ` `` | **Stands in for Escape.** Re-dispatched as a synthetic Escape on the focused element, so every Esc handler in the app works on a keyboard with no physical Esc key (an iPad with an external keyboard). Cost: you can't type a literal backtick, including in chat. |

## Global — any page with chat and the logo menu (club page + play area)

Bound at the app root by
[`AppActionsHost`](../src/common/actions/AppActionsHost.tsx). These fire when
nothing is focused **and** while a *game* input is focused (codenamesduet's clue
field, psychicnum's guess box — they opt in with `data-game-input`), so you can
hit `/` to chat without clicking away first. They type literally in a non-game
field (chat, a setup form, the scratchpad). `/` is bound everywhere but answers
`hidden` on a page with no chat panel mounted — the home page — so the key does
nothing there and the row is not drawn.

| key | what it does |
|---|---|
| `/` | Open club chat and focus its input. Already-open stays open and refocuses. |
| `?` | Open the logo / game menu. |
| `~` | Open the free-form **look up a word** dialog. |
| `⌥~` | Toggle the **anagram finder** — enter letters, get every word of exactly that length. Lowercase letters float, `?` is a wildcard, an UPPERCASE letter is pinned to its position (`Acer` → acer + acre, never race). Matched on the physical key (`e.code === 'Backquote'` + Option + Shift): on macOS the chord is the dead-key accent composer, so `e.key` is `'Dead'` — the `⌥+`/`Equal` trick again. `⌥\``, without the shift, is a different chord and is unbound. |

## Global — any play area

Each is an action. `<` and `⌥+` are bound by
[`GamePage`](../src/common/game-page/GamePage.tsx); `+`, `⌥⌫` and the rest are
bound by the game that offers them, which is why a game without one simply
doesn't answer that key. All bail inside any editable field (so `⌥⌫` stays
"delete word" while typing a clue), ignore `Cmd`, and ignore auto-repeat —
every one is a discrete command, and holding `+` would otherwise start dozens
of games.

| key | what it does |
|---|---|
| `<` | **Back to club.** Terminal → straight there; solo mid-game → suspends silently; multiplayer mid-game → the suspend-confirm modal. Mirrors the menu item. |
| `+` | **New game** — the game's own action, so it carries that action's availability and its mid-game confirm wherever it is shown. |
| `⌥+` | **New game from setup** — same fresh game, but stops at the setup dialog so you can change the options. Deliberately not a menu item; the power-user variant. Matched on the physical key (`Equal` + Option + Shift), since Option changes the character; `⌥=` is a different chord and is unbound. |
| `⌥⌫` | **End game**, or **Concede** in a race — the two share the chord and are never both available, so the mode picks which one answers. In a race that can also stop the whole table, Concede's question carries both endings rather than a second key existing. Disabled at terminal, and Concede once you have conceded — after which, in a race that offers the whole-table stop, End appears on its own. |
| `Esc` | Close the topmost floating panel or dialog (Help, Setup, a confirm, the word-lookup card, the definition popover, the mobile info sheet, the celebration dialog). |
| *any key* | **Dismisses sticky local feedback** — your next keystroke is your next move. A terminal verdict pill is permanent and survives this. |
| *any key* | **Exits the turn-history viewer** back to the live board, and is consumed (so the same press doesn't also play a move). Every game with a turn log has the viewer. Clicking anywhere exits too. |
| `Tab` | **Caught and consumed** on most boards — the play surface declares an empty ring (`useTabRing([])`), because a board is not a form and native Tab walks focus out to the header and then into the browser's URL bar. Exceptions: crosswords (clue navigation) and codenamesduet (its clue form's two fields are the ring). |

## Menus, dialogs, and panels

| where | key | what it does |
|---|---|---|
| Menu trigger | `↓` | Open the menu and step into it. (`Enter` / `Space` toggle it natively.) |
| Open menu | `↑` `↓` | Move through enabled items (wraps at the ends). |
| Open menu | `→` | Open the focused row's submenu. |
| Open menu | `←` | Step back out of a submenu. |
| Open menu | `Esc` | Unwind one level: out of a submenu first, then close the menu. |
| Open menu | `Tab` | Close the menu, and the key is consumed — the popover stops its own keys, so no ring hears this press and a native Tab would leave the page. The next press is the surface's ring's. |
| Confirm dialog | `Enter` | Confirm — the confirm button auto-focuses. |
| Confirm dialog | `Esc` | Cancel. |
| Any floating panel | `Tab` / `⇧Tab` | **Every family keeps Tab**: the panel is a ring of its own controls — the titlebar ✕, the fields, the buttons — and an open panel's ring is innermost, so Tab cycles them and never reaches the page behind. The exception is the way OUT: in chat's and the scratchpad's text fields Tab steps back to the page's ring by blurring the field, which is how the game gets the keyboard back (`⇧Tab` there stays the panel's, so the ✕ is reachable). `Esc` closes the panel focus is in, else the topmost open one; only the fault modal swallows it. |
| Chat box | `Enter` | Send. |
| Chat box / scratchpad | `Tab` | **Steps out of the panel's ring into the page's** — blurs the field, which is how the game gets the keyboard back. `⇧Tab` stays the panel's ring, so its ✕ is reachable. |

## Club page and home page

Both pages navigate by `<SelectionList>` (docs/ui.md → Selection lists), so the
keys are the same on each; only how many lists there are differs. The row ring
is hidden until a movement key asks for it — a mouse user never sees one — and
ui.md's key table has the column for what each key does while it is hidden.

| where | key | what it does |
|---|---|---|
| Either page | `↑` `↓` | Move the cursor ring through the rows (clamped, no wrap). The first press only reveals the ring on the resting row; the next one moves it. The first list is focused on arrival, so no first Tab is needed. |
| Either page | `Enter` | Open / start what the ring is on. Inert while the ring is hidden — it neither acts nor reveals, so an arrow is the way in. A row that can't be chosen (a game the club's member count doesn't fit) takes the ring but declines Enter. |
| Either page | `Home` `End` | Jump to the first / last row, revealing the ring in the same press. |
| Either page | `PageUp` `PageDown` | Move by one visible page, measured from the list's own height. Like an arrow, the first press only reveals. |
| Either page | `Space` | **Nothing** — moving a cursor must not consent to an action. It is caught all the same, so it can't scroll the list out from under the ring. |
| Either page | `Tab` | Moves to the page's next list — cycling the club page's two, always landing on the one list at home. This is also the way BACK after clicking some blank part of the page, which blurs the list. While an overlay is open its own ring is innermost, so Tab is the overlay's. |
| Club page | `<` | Back to home — the twin of the play area's `<`. |
| Create club | `Esc` | Back to home. |

---

# Per-game board keys

Everything below is **on top of** the global set. "Type A–Z" means the shared
capture keyboard: there is no `<input>` to lose focus when you click a tile.

## bananagrams

A 2-D board cursor ([`useBoardCursorKeys`](../src/shared/board-cursor/useBoardCursorKeys.ts),
shared with scrabble). Frozen once you've conceded.

| key | what it does |
|---|---|
| `←` `→` `↑` `↓` | Move the board cursor. |
| `A`–`Z` | Place that tile from your hand and advance. Typing over a filled cell **swaps** — the old tile derives back into the hand. A letter you don't hold flashes the hand red. |
| `⌫` | Return the tile under the cursor to the hand, then step back. |
| `Enter` or `Space` | **Peel.** Both keys come with `act-peel`, which is also the Peel button — so the key is gray exactly when the button is, and a peel waits until every held tile is placed. |
| `⌥Z` | Shuffle the hand — a local reorder, never a move. |

## boggle

| key | what it does |
|---|---|
| `A`–`Z` | Type into the word entry (stored uppercase, capped at 16). |
| `⌫` | Delete the last letter. |
| `Enter` | Submit the word. |
| `↑` | Recall your last submitted word (add an `S`, fix a typo). |
| `↓` | Clear the entry. |
| `⌥Z` | Rotate the board 90° — a fresh visual scan of the same letters, local to you and live at terminal. The ⟲ pill over the board's top-right does the same thing. |

Boggle tiles are pointer-only (no `tabIndex`, no `role`), so no keystroke traces
a tile — tapping does.

## codenamesduet

The only game whose input is real `<input>` fields, so it's the only one with no
window-level board keys.

| key | what it does |
|---|---|
| `Tab` / `⇧Tab` | Toggle between the clue's count and word fields — the form declares them as its ring, so Tab goes nowhere else. With two fields, both directions are the same toggle. |
| `Enter` | Submit the clue — **the form's own submit**, not a bound action. A keystroke aimed at a focused field never reaches the key dispatcher, so the form keeps its Enter the way any form does, and the Submit button stays a `type="submit"`. The commands beside it (Pass & End Turn, the AI clue) ARE actions; a submit button is not one. |

## connections

| key | what it does |
|---|---|
| `Enter` | Submit the selected four **from anywhere on the board** — not just when a tile holds focus (macOS doesn't focus a button on click, which used to kill the whole click-four-then-Return flow). Gray with an incomplete selection, so it fires nothing. |
| `⌫` | Clear the selection — and the clear BROADCASTS, so a teammate's board drops it too. |
| `⌥Z` | **Shuffle the tiles** — a fresh visual scan of the same sixteen, never a move (the selection survives it). The ⟲ pill over the board does the same thing. |

All three are hidden while a past turn is open in the history viewer, so a
keystroke there means "back to live" rather than a move. Board tiles are not
focus targets in any game, so no keystroke reaches one.

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
| `#` | Jump-to-clue-number popup. Written as the CHARACTER, so it works on layouts where `#` is `⇧3` — shift was already spent making it. |
| `\|` | Cycle the cryptic word-break / hyphen mark on the cell's **right** edge (none → break → hyphen). The cursor doesn't move. |
| `_` | Same, on the **bottom** edge. |

**Actions** (each is the same bound action as its menu row and its square in the
tool bar, which is why all three agree about what it is called and when it works)

| key | what it does |
|---|---|
| `⌥P` | Switch between pen and pencil. |
| `⌥C` / `⌥⇧C` | Check letter / check word. (Check grid is menu- and bar-only.) |
| `⌥R` / `⌥⇧R` | Reveal letter / reveal word — **coop only**. Reveal grid asks first. |
| `⌥N` | Show the setter's note (when the puzzle carries one). |
| `⌥X` | Explain this clue (the AI explainer). |
| `⌥S` | Open the scratchpad — the header mark's key, not crosswords' own. |

**Rebus overlay**: `Enter` commits and advances · `Tab` / `⇧Tab` commit and jump
to the next / previous clue · `Esc` cancels (so does clicking away).
**Number-jump popup**: `Enter` goes · `Esc` closes.

Both are focused inputs that answer Tab themselves rather than declaring a ring
— the exception's exception. Everywhere else a focused field is a stop in some
surface's ring; here Tab is still a move, the way it is on the grid behind them.

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

## setgame

**No text entry at all.** A claim is three cards, so there is nothing to type
INTO — the letters are addresses, not characters. So it binds `act-toggle-card`
(a pattern action, handed whichever letter fired it) rather than the shared
`useCaptureKeys`, which accumulates a value.

Every card carries a letter, laid out on a **fixed 3 × 7 grid** of which only
the dealt columns show:

```
A  B  C  D | E  F  G
H  I  J  K | L  M  N
O  P  Q  R | S  T  U
```

Reading is left-to-right, and a letter **never changes which card it means** —
that is what the fixed grid buys. Numbering across the CURRENT width would
re-letter eight of twelve cards the moment a deal added a column (which happens
in two games out of three), and a player typing from muscle memory would
silently claim a card they never looked at. The cost is non-contiguous rows —
row two starts at H — which nobody has to know, since a letter is an address to
read off a card rather than a sequence to recite.

| key | what it does |
|---|---|
| `A`–`U` | Toggle that card's selection. The third selected card submits the claim; a third that doesn't complete a set is refused on the spot, with no round trip. |
| `⌫` | Clear the whole selection. |
| `Tab` | **Caught and consumed** by the page's empty ring. Nothing on this surface takes focus — the cards are clickable, never focusable — so a Tab that did anything would only move a focus ring somewhere unusable. |

The letters are **hidden on mobile**: no keyboard to use them with, and the row
they occupy is height the board needs.

Two states where a letter does nothing else, and both are the actions saying so
rather than a branch in a handler: **while a past turn is open in the history
viewer**, the card keys hide themselves, so the press reaches the viewer's own
any-key exit and returns to the live board (the same press must not also toggle
a card on a board you have only just got back); and **when it isn't your turn**
in turn-by-turn coop, where the board is inert and visibly faded.

## psychicnum

| key | what it does |
|---|---|
| `A`–`Z` | Type a guess word (clicking a board tile fills the same entry). |
| `⌫` / `Enter` | Delete / submit. |
| `↑` `↓` | Recall your last guess / clear the entry. |
| `⌥Z` | **Shuffle the words** — a fresh visual scan of the same board, never a move. |

The entry is inert while viewing history (so the keystroke goes to the viewer
instead) and when it isn't your turn. Shuffle is the exception on purpose: it's a
BOARD key, not an entry key, and it is bound by the board column rather than the
entry — psychicnum unmounts the entry when you can't guess, and the round Shuffle
button stays live in every one of those states (terminal included). A key that
disagreed with its own button is the bug that split them.

## scrabble

The other board-cursor game (bananagrams' twin).

| key | what it does |
|---|---|
| `←` `→` `↑` `↓` | Move the board cursor. Committed tiles are locked — only staged ones are editable. |
| `A`–`Z` | Stage that tile from your rack at the cursor. |
| `⌫` | Remove the tile behind the cursor / the last staged one. |
| `Enter` | Play the staged word. Gray until there are tiles staged AND it's your turn, which is the same answer the Submit button reads — so the key and the button are never live at different moments. |
| `⌥Z` | Shuffle the rack — a local reorder, never a move, and live at terminal. The ⟲ pill over the rack does the same thing. |

The first keystroke while a past turn — or a teammate's shared move — is on the
board exits back to live: that is the viewer's own any-key action, which the
dispatcher runs ahead of the board's keys.

## spellingbee

| key | what it does |
|---|---|
| `A`–`Z` | Type into the entry (stored uppercase). |
| `⌫` / `Enter` | Delete / submit. |
| `↑` `↓` | Recall your last word / clear the entry. |
| `⌥Z` | **Shuffle the hive** — a fresh visual scan of the same letters, local to you and live at terminal (a harmless rearrange). The ⟲ pill over the hive's top-right does the same thing. |

Hive letters are pointer-only (no `tabIndex`, no `role`), so no keystroke types a
letter from one — clicking does.

## stackdown

No text entry — a letter names a *tile*, not a character, so it binds
`act-pick-tile` (a pattern action, handed whichever letter fired it) rather than
the shared capture keyboard.

| key | what it does |
|---|---|
| `A`–`Z` | Play the matching exposed tile — but only if **exactly one** exposed tile bears that letter (the word is the selection order, so an ambiguous letter can't pick for you). Zero matches → an error pill; more than one → the candidates flash and you're asked to click one. |
| `⌫` | Return the most recently picked tile. The ⌫ button left of the word slots does the same thing (and is how you do it on a phone). |
| `Enter` | Submit the word. A word is exactly five tiles, so below five it is **gray rather than absent** — the same answer the Submit button reads, so neither explains itself. Filling the fifth slot does NOT submit: the word waits for you, so a wrong fifth tile is recoverable. |

All three go DISABLED rather than hidden while the board is frozen or a past
turn is open, which is what keeps the ⌫ / Submit buttons in their slot — and a
disabled action doesn't swallow its key, so the press still reaches the viewer's
any-key exit.

## strands

No typed WORDS: the board repeats letters, so a typed *string* can't identify a
path. But a typed **letter** can, once it's resolved against the cells that could
actually come next — which is what the `A`–`Z` row below does. The old rule is
refined, not reversed: the disambiguation that used to be "click the letter you
meant" now happens per keystroke, and falls back to clicking exactly when it must.

| key | what it does |
|---|---|
| `A`–`Z` | Extend the trace with the matching cell. Which cells are eligible depends on where you are: with **nothing traced**, any unused cell on the board (usually several — so this is usually a click); **mid-word**, only the ≤8 neighbors of the last cell, minus the ones already used (usually exactly one — so the rest of a word usually just types). Several matches → they ring **red** for a beat and wait for a click, with no pill: this row *is* the entry area, so a pill would hide the word to say what the board says better. No match → an error pill, since that's a mistake rather than a choice. An unmatched letter never restarts the trace elsewhere the way a far *click* does. |
| `⌫` | Drop the last tile from the trace — a misclick costs one key, not the whole word. Same as the ⌫ button left of the word. |
| `Enter` | Submit the trace — one of only TWO ways, with the submit button right of the word. Re-clicking the last tile used to be a third; it was removed on 2026-08-14 for firing on misclicks, and now takes that letter back instead. |

⌫ and Enter go GRAY rather than absent with nothing traced or on a frozen board,
so the row never reflows — and a disabled action leaves its key for whoever else
wants it, which is how a keystroke reaches the history viewer's any-key exit.

## waffle

No board keyboard — swapping is a drag/click gesture. Keys do only the two
universal things: dismiss feedback, and exit the turn-history viewer.

## wordle

| key | what it does |
|---|---|
| `A`–`Z` | Type the guess (capped at 5 — letters land on the **board**, not an entry box). |
| `⌫` / `Enter` | Delete / submit. |

The on-screen QWERTY keyboard drives exactly the same pending guess: its Enter
and ⌫ caps ARE the two bound actions the physical keys answer to, so a cap and
its key can't disagree about whether the move is available. The 26 letter caps
stay plain buttons — a letter cap is a key, not a command, and the one action
behind them is the pattern that is handed whichever letter fired it.

There is **no** `↑`/`↓` history here — that's an EntryBox affordance and wordle
isn't one. Capture freezes while viewing history so a keystroke returns you to
live instead of typing behind the banner.

## wordiply

| key | what it does |
|---|---|
| `A`–`Z` | Type the guess (capped at 28). |
| `⌫` / `Enter` | Delete / submit. |
| `↑` `↓` | Recall your last guess / clear — handy here, since the next guess is often the last one plus a letter. |

Shares the on-screen `GuessKeyboard` with wordle (untinted — wordiply has no
per-letter feedback), so its Enter and ⌫ caps are the same two bound actions
these keys answer to.

## wordwheel

Same shape as spellingbee, its fork parent.

| key | what it does |
|---|---|
| `A`–`Z` | Type into the entry (stored uppercase). |
| `⌫` / `Enter` | Delete / submit. `Enter` is **inert** when the typed word can't be spelled from the wheel's tiles — editing stays live so you can fix it, rather than the word submitting and coming back "not a word". |
| `↑` `↓` | Recall your last word / clear the entry. |
| `⌥Z` | Shuffle the wheel — the same key spellingbee's hive takes, local to you and live at terminal. The ⟲ pill over the wheel does the same thing. |

Wheel tiles are pointer-only (no `tabIndex`, no `role`), so no keystroke types a
letter from one — clicking does.
