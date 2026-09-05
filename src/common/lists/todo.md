# lists — todo

## Bugs

## Soon

- **Empty state** — the "nothing here yet" line inside a list's frame, written
  separately by `WordList.empty` and `TurnLog.turnLogEmpty`. One pattern; the
  frame is always drawn and the empty state sits inside it (docs/ui.md →
  Selection lists).
- **`FilterSelect`'s club-page override inverts.** The club page undoes six of
  the component's seven decisions for one instance. The component should
  state the ROOMY default and the info column should tighten it, once, via
  its own scoped tokens — docs/naming.md → tuned / justified / locked has why.

## Someday

## Maybe

- A two-line density variant of the list row, when it has a consumer.
