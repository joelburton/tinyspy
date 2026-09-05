# icons

The glyph registry: one file that re-exports Lucide icon components under
semantic names, so a component asks for `<IconHint />` and never for a
lightbulb. It is the code form of the icon language in
[ui.md → Button iconography](../../../docs/ui.md#button-iconography), which
says why Lucide and how the game menu teaches each glyph; this folder is only
the mapping.

## Design

- **A name says what the glyph MEANS, never what it looks like.** A component
  imports the meaning (`IconSubmit`, `IconConcede`), the registry decides the
  picture, and a meaning changes its picture in one place. So one Lucide glyph
  may be exported several times when it carries several meanings — a verdict
  mark, a remove-this-item action and a close-this-surface control can all be
  the same ✕ and still be three names — and the reverse never happens: two
  meanings never share a name.
- **Nothing imports `lucide-react` but this file.** A glyph chosen at a call
  site is a glyph that drifts, and the menu's legend can only match the button
  if both draw from the same place. The one thing another file may take from
  Lucide is the `LucideIcon` TYPE, which is how a menu row and a button agree
  on what an icon is.
- **A glyph is chosen against its neighbors, and the comment beside the
  export is where that choice is argued.** Two glyphs that can appear in the
  same row must read as different at a glance, and two that mean nearby things
  should read as a family (the eyes, the octagons, the arrows). The reason a
  glyph is what it is lives next to it in `icons.ts`, not in a doc, so the
  next person changing one sees what it was chosen against.
- **The exports are grouped by what a glyph is FOR, and a family sits together
  inside its group.** A move the player makes · the app handing something over ·
  a mark that is no control at all · the shell around the board. This follows
  from the rule above: an argument about neighbors is only checkable when the
  neighbors are on screen, so a new export goes where its group is rather than
  at the end. One family crosses a boundary on purpose — the ✕ that marks a
  verdict, the ✕ that removes an item and the ✕ that closes a surface stay
  adjacent across the marks/shell line, because the three are only legible
  against each other.
- **The registry carries no size, color or weight; the surface does.** An icon
  inherits `currentColor` and is sized by whatever draws it — a standard button
  sizes it in CSS from the button's own font size, a menu row passes the gutter
  size, and a bare glyph in a readout says its own. A call site never sets the
  look of a glyph for the whole app, because the registry has no way to and
  should not.
- **An icon never carries the name.** The control's name lives in its label
  or tooltip, and in the menu row that teaches the glyph; the picture is
  decoration on top of that. An icon-only button is still a named button.
- **What is NOT an icon stays out.** A board's own artwork (a wheel, a card, a
  letter grid) is drawn where the board lives, and a mark Lucide draws wrong for
  our purpose is hand-drawn beside the one control that needs it. The registry
  is for glyphs that stand for an action or a verdict and can appear on more
  than one surface.
