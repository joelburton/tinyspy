# Keyboard shortcuts

Keyboard support matters here even though screen readers are out of scope
(see [CLAUDE.md](../CLAUDE.md)): crosswords is keyboard-first, every word game
takes physical keys, and the shell has keys of its own.

## Every key the app answers

```
gmake dev-keys
```

prints them, read from the code rather than written down: everywhere, the home
page, the club page, every game page, every game, then each game and the shared
folders with the games that use them. In the app itself, the key list at the
bottom of every Help panel is the same rows, for the page you are on.

It can, because **every key is listed somewhere**, in one of two kinds:

- **An action** — a command the page offers, wherever focus is: New game,
  Shuffle, typing a letter. Its keys are an entry of `ACTIONS` in
  [`common/actions/registry.ts`](../src/common/actions/registry.ts), and a
  surface offers it by binding it
  ([`common/actions`](../src/common/actions/doc.md)).
- **A key group** — keys that belong to whatever has focus or is open: a
  selection list's arrows, a ring's Tab, Escape closing a panel, an open menu's
  walk. Its keys are a key group of `COMPONENT_KEYGROUPS` in
  [`common/keyboard/componentKeyGroups.ts`](../src/common/keyboard/componentKeyGroups.ts),
  and the component matches against that group rather than comparing `e.key`
  itself ([`common/keyboard`](../src/common/keyboard/doc.md)).

[`scripts/list-keys.ts`](../scripts/list-keys.ts) greps for both kinds of id,
and the `componentKeyGroups` guard holds every hand-written key handler to an
action or a key group, so a key cannot work without being listed.

A listed key is one a surface CAN answer. Whether an action does at a given
moment is its `describe()` — a coop-only action hides in a race, an entry's
keys go disabled while a past turn is open. A component key marked "not in
Help" works only inside something Help cannot be open beside, like an open menu
or crosswords' rebus box. Each game's `doc.md` says what is particular to its
keys.

## How a keystroke is routed

One listener at the app root fires whichever bound action answers a keystroke,
after two gates: a focused text field keeps its keys unless the action opts out,
and focus inside a floating panel hands the keyboard to the panel. The gates,
Tab rings, backtick and the key groups are
[`common/keyboard/doc.md`](../src/common/keyboard/doc.md); the three passes a
keystroke makes, chords, `repeat`, and what a disabled binding does with its key
are [`common/actions/doc.md`](../src/common/actions/doc.md).
