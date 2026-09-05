# icons

One file that re-exports Lucide's icon components under names that say what they
MEAN, so a component asks for `<IconHint />` and never for a lightbulb. The icon
language itself — why Lucide, how the game menu teaches each glyph — is
[ui.md → Button iconography](../../../docs/ui.md#button-iconography); this folder
is the mapping.

## Design

An icon is a word the app uses without spelling it out, and the same picture has
to mean the same thing on every surface a player sees. That is hard to hold
together if each component picks its own glyph: two buttons for the same action
drift apart, the game menu's legend teaches a picture the board does not use,
and changing what "hint" looks like means finding every place that drew a
lightbulb. So the app has exactly one place where a meaning is turned into a
picture, and that is this folder.

Everything else follows from that. A component imports the meaning, not the
drawing, which is why one Lucide glyph can be exported under several names — a
verdict mark, a remove-this-item control and a close-this-surface control may all
be the same ✕, and they stay three names because they are three ideas. The
reverse is never allowed: two meanings never share a name. And nothing outside
this file imports `lucide-react`, because a glyph chosen at a call site is a
glyph that will drift.

Choosing a glyph is not an isolated decision either. Two icons that can appear in
the same row have to read as different at a glance, and two that mean nearby
things should read as a family. That argument is only checkable when the
neighbors are visible, so the exports are grouped by what a glyph is for and the
reasoning sits beside each export in `icons.ts` — next to the thing it is about,
where the next person to change it will see what it was chosen against.

The registry deliberately stops at the picture. It carries no size, color or
weight: an icon inherits `currentColor` and is sized by whatever draws it, so a
button, a menu row and a bare readout can each size a glyph the way their own
surface needs. Nor does an icon ever carry a control's name — that lives in the
label, the tooltip, and the menu row that teaches the glyph. An icon-only button
is still a named button.

## Details

- **The grouping**, in `icons.ts`: a move the player makes · the app handing
  something over · a mark that is no control at all · the shell around the
  board. A new export goes with its group rather than at the end.
- **One family crosses a group boundary on purpose** — the ✕ that marks a
  verdict, the ✕ that removes an item, and the ✕ that closes a surface stay
  adjacent across the marks/shell line, because those three are only legible
  against each other.
- **The one thing another file may take from Lucide is the `LucideIcon` type**,
  which is how a menu row and a button agree on what an icon is.
- **What is not an icon stays out.** A board's own artwork (a wheel, a card, a
  letter grid) is drawn where the board lives, and a mark Lucide draws wrong for
  our purpose is hand-drawn beside the single control that needs it. The
  registry is for glyphs that stand for an action or a verdict and can appear on
  more than one surface.
