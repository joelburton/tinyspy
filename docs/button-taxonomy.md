# The button taxonomy — inverting the `<button>` default

**This is A PLAN, to be built and deleted.** Like
[keyboard-nav-plan.md](keyboard-nav-plan.md), it describes work we agreed to and
have not done. When it lands, the durable half (the kinds, the two feedback
rules) folds into [ui.md](ui.md) and this file goes away.

Everything here was designed in conversation on 2026-08-17/18 and then set aside
while the chrome tones were being chosen. Writing it down is what stops it being
re-derived from scratch.

## The problem

**The bare `<button>` element is currently the FILLED accent button.** That one
decision is behind most of the friction:

- **29 rules exist purely to undo it.** Every button that isn't a filled accent
  button — a list row, a chat bubble, a text link, a menu item, a game tile —
  opens by cancelling the background, the border and the padding it was handed.
  Their first three lines are an apology.
- **A blanket hover is unsafe, so nothing has one.** `theme.css` says so in a
  standing comment: *"Too many `<button>`s are non-button-buttons (board tiles,
  icon hit-targets) for a blanket background-changing hover to be safe… a future
  `.button` class can reintroduce a hover for genuine buttons."* The consequence
  is that the app's most-clicked control (Submit) is inert under the pointer
  while a definition dialog's button is not.
- **The filled tones' hover values are largely unused.** `--chrome-<tone>-fill-hover-color`
  exists for all four tones and only a handful of components read it — because
  there is no shared rule that could.

There are **102 bare `<button>`s** in `src/`.

## The fourteen kinds

Everything that reaches for `<button>` today:

| kind | what it is |
|---|---|
| `piece` | a game object you press — tiles, cards, hexes, cells |
| `key` | an on-screen keyboard cap (letters, ⌫, ENTER) |
| `action` | a purpose button: Submit, Hint, Reveal, End game, Restart, Peel |
| `form` | a dialog/form's commit + cancel pair |
| `trigger` | opens a floating thing: the Menu button, FilterSelect's trigger |
| `choice` | one of a mutually-exclusive set: ModeFilter, colour swatches, FilterSelect options, crosswords' source picker |
| `toggle` | a two-state switch drawn as a button: crosswords' pencil/check |
| `tab` | switches which view you're looking at: ClubPage's tabs |
| `row` | a whole list row that IS the control: StartGameButtons, a club in the home list, a Menu item, a crosswords puzzle row, a game card |
| `handle` | a small inline control inside content: the turn log's `#N` |
| `dismiss` | an icon-only ✕ or delete: the pill's close, the banner's exit, FloatingPanel's close, a Toast's close, a game card's delete |
| `textlink` | text that reads as prose or a link: LoginScreen's `.link-button`, DefinitionView's cross-reference and edit link |
| `surface` | an entire content block that is a button: ChatBubble, ScratchpadBubble |
| `float` | a control positioned over another surface: the chat FAB, Shuffle, Pause, InfoSwitch |

## The four families

Joel's grouping, which is the useful cut — it sorts by **what feedback the thing
should give**, not by what it does:

**"Accidental" — don't look like buttons and shouldn't act like them.** They may
have hover (rows and menus do), but it must be *surface* feedback rather than
button feedback: rows use `--page-surface-hover-color`, textlinks want an
underline, surfaces want whatever their content wants.

> `trigger` · `row` · `textlink` · `surface`

`surface` was originally filed under general buttons and moved here: **a chat
bubble is a message that happens to be clickable**, and if it grows button chrome
it stops being a message.

**"Game pieces" — don't look like buttons, have depth.**

> `piece`

**"Keyboard" — look a bit like buttons, have some depth.** Deliberately flatter
than a game piece, but they sit on a game surface so they are not chrome-flat
either: between a general button and a piece, which is exactly why
[tile-feedback.md](tile-feedback.md) puts keys on the piece side of the depth
rule and every other control on the chrome side.

> `key`

**"General buttons" — flat, but they should get some hover so they don't look
dead.**

> `action` · `form` · `choice` · `toggle` · `tab` · `handle` · `dismiss`

**`float` is not a kind at all** — it is a *placement modifier* on an `action` or
a `trigger`. It earns a line only because tile-feedback gives it a rule of its
own: a control floating over a **board** keeps its shadow, where chrome otherwise
gets none.

## The two feedback rules

### Pieces use DEPTH for hover and DARKENING for press

A piece should not darken on hover, and the reason is that **the darken is
already spent on press**. The shared tile does three things in sequence: resting
on the page, lifted under the pointer (shadow 2px→6px, tile rises 2px), pushed
down under a finger (`scale(0.96)` + `brightness(0.92)` + shadow back to
contact). If hover darkened too, press would have nothing left to say — and it
would open the can of new colours Joel flagged.

There is a second reason the press owns the darken, and it is the load-bearing
one: **`prefers-reduced-motion` drops the shrink, and touch has no hover at
all.** On a phone with reduced motion the darken is the *only* feedback a tap
gets. It cannot be moved to hover.

**One documented escape**, already hit twice: where depth demonstrably can't read
— spellingbee's and wordwheel's packed hexes, and the keyboard's near-white cap —
a fill change is allowed *in addition*. Both are cases where the shadow has no
surface to cast onto.

### General buttons use COLOUR only — no motion, no shadow

Not conservatism: it is the load-bearing half of *depth belongs to game pieces,
not chrome*. If a button lifts, the thing distinguishing a control from a piece
is gone, and "a control that looks like a tile is a bug" stops being enforceable.

It needs **no new colours** — the tone sweep already minted all of them:

- filled → `--chrome-<tone>-fill-hover-color`
- outline → `--chrome-<tone>-wash-color`

## The change: invert the default

```
button        neutral: font, cursor, radius — no fill, no border, no padding
.button       a general button — flat, colour-only hover
              × primary | secondary   × the four tones
.tile         a piece (exists)
.key          a keycap (exists, module-local)
```

**What "neutral" means, since two of those look like chrome and aren't.** They
are browser defaults that any reset has to overrule:

- **`font: inherit`** — a `<button>` does *not* inherit the page's font. The UA
  gives it its own (~13.33px system UI on macOS/Chrome). Invisible on a chunky
  filled button; glaring on a `textlink`, a `row` or a chat `surface`, where the
  button's text is supposed to *be* the surrounding prose.
- **`cursor: pointer`** — the UA default for a button is `default`, an arrow, not
  a hand. Links get the hand for free; buttons never have.

Invert the default and everything falls out: **accidental kinds get a neutral
element for free** and stop apologising in their first three lines; **general
buttons opt in** and can finally have the hover that comment has been promising;
**pieces and keys are already separate** and stay that way.

### The measured caveat: `border-radius` stays in the base

Checking what silently inherits parts of the reset:

| property | rules relying on the base | verdict |
|---|---|---|
| `padding` | 7, mostly false positives (a `<div>` dot, two keyframe blocks, pieces that size themselves) | safe to drop |
| `border` | 1 | safe to drop |
| **`border-radius`** | **19** rules undo the fill but never declare a radius | **keep in the base** |

Those 19 are living on the base's `--radius-md`. On a transparent element that is
invisible — until something paints a background, which is exactly what a `row` or
a menu `item` does on hover. Drop it and up to 19 hover states get square
corners. A radius on an element with no fill and no border is genuinely inert, so
it costs nothing to leave and removes the one class of silent breakage:

```css
button { font: inherit; color: inherit; cursor: pointer; border-radius: var(--radius-md); }
```

Everything that *is* chrome — fill, border, padding — moves to `.button`.

## Migration

The buttons that **rely on** the filled default today are exactly the `form` and
`action` kinds — roughly 10–15 sites (`ActionButton` itself, LoginScreen,
ClaimHandleScreen, CreateClubPage, EditProfileDialog, EditClubDialog,
SetupGameDialog, ConfirmDialog, FaultDialog). Each needs `.button primary`;
`ActionButton` covers most of them in one place.

**Net visual delta: zero, if the migration is complete.** The 29 undo-rules are
pure subtraction, and the buttons relying on the filled default say so explicitly
instead of getting it by accident. The real gain is hover.

**The risk worth naming:** while it is half-done, an un-migrated button looks
*unstyled* rather than wrong-coloured. Very visible — but it means this lands in
**one commit with a pass over all 102**, not incrementally.

## Open questions

- Should the `--secondary-*` slot tokens be renamed `--tone-*`? Raised, never
  settled. `.secondary` is a treatment and the slot holds a tone, so the current
  name describes the caller rather than the contents.
- The chat and scratchpad bubbles were tried with a `1px solid var(--control-border-color)`
  border and Joel preferred them **without**. They stay borderless — recorded so
  it isn't re-proposed.
- `dismiss` is icon-only and appears on toasts, pills, banners and panels with
  four different implementations. Worth checking whether it wants a shared
  component rather than a shared class.
