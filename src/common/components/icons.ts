/**
 * Semantic icon registry — the ONE place that maps an action to its Lucide
 * glyph, so "hint = lightbulb" lives here instead of being re-decided at every
 * call site. Components import the semantic name (`<IconHint />`), never Lucide
 * directly; change a glyph here and every game's button follows.
 *
 * This is the code form of the icon map in docs/ui.md → "Button iconography".
 * Names are PascalCase because they render as JSX (`<IconHint />`) — a lowercase
 * alias would be parsed as a DOM tag, not a component. They're the same Lucide
 * components, so they take the same props (`size`, `aria-hidden`, …). The set
 * grows as more buttons adopt it.
 */
export {
  Lightbulb as IconHint, // get a hint (a clue toward the answer)
  Eye as IconReveal, // reveal the answer
  Flag as IconEnd, // end the game (manual stop)
  // submit a game move/guess/clue — an UP-pointing triangle: it "sends" the move
  // up to the other players (boards put YOU at the bottom, others above), and
  // keeps the RIGHT-pointing play triangle free for the play/resume idiom. Only
  // for sending a move — not the setup dialog or other form submits.
  Triangle as IconSubmit,
  Eraser as IconClear, // clear the current selection
  Delete as IconDelete, // delete the last typed character (the backspace key glyph)
  RotateCw as IconShuffle, // reshuffle my own tiles for a fresh look
  ChevronLeft as IconBack, // back to club
  Pause as IconPause, // pause the game
} from 'lucide-react'
