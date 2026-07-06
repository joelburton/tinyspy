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
  // use an AI-powered helper (e.g. codenamesduet's Claude clue suggester). The
  // sparkles glyph is the near-universal "AI / magic" idiom — kept DISTINCT from
  // IconHint's lightbulb so "ask the AI" reads differently from "give me a hint".
  Sparkles as IconAI,
  Eye as IconReveal, // reveal the answer
  Flag as IconEnd, // end the game (manual stop)
  // submit a game move/guess/clue — an UP-pointing triangle: it "sends" the move
  // up to the other players (boards put YOU at the bottom, others above), and
  // keeps the RIGHT-pointing play triangle free for the play/resume idiom. Only
  // for sending a move — not the setup dialog or other form submits.
  Triangle as IconSubmit,
  // end the current turn without making (another) move — a stop-sign octagon.
  // Distinct from IconEnd's flag (end the whole GAME): this ends just your turn
  // and hands play on. codenamesduet's "Pass" is the first user.
  Octagon as IconEndTurn,
  Eraser as IconClear, // clear the current selection
  // swap/exchange tiles for new ones — the two-way horizontal arrows are the
  // near-universal "exchange" idiom (scrabble's "Swap"). Distinct from
  // IconShuffle's single rotate glyph (reorder my OWN tiles, no server trade).
  ArrowLeftRight as IconExchange,
  Delete as IconDelete, // delete the last typed character (the backspace key glyph)
  RotateCw as IconShuffle, // reshuffle my own tiles for a fresh look
  // bananagrams' "Peel" — draw a fresh round of tiles (or, when the bunch is
  // dry, go out and win). The banana glyph is on-the-nose for the Bananagrams
  // lineage (bananagrams) and reads as its own distinct action, not a
  // generic submit. Local to the PeelButton — no other game peels.
  Banana as IconPeel,
  // share your in-progress move with coop teammates (scrabble's "show a move" —
  // broadcasts your staged tiles for the team to preview read-only). The share
  // node-graph glyph is the near-universal "send this to others" idiom.
  Share as IconShare,
  ChevronLeft as IconBack, // back to club
  // NB: pause is NOT here — lucide's Pause is two outlined rounded rects, not
  // the familiar solid two-bars mark, so PauseButton draws its own glyph.
  // zoom the view to fit / frame everything (bananagrams' "Center + fit"). The
  // four-corners fullscreen glyph is the near-universal "fit to view" idiom.
  Fullscreen as IconZoomFit,
  // The <StrikeMarks> meter (a status row, not a button): a bounded "N of M used"
  // counter filling left-to-right — a USED mark is a red square-X, an OPEN slot a
  // dashed square. Squares (not circles) so they never read as the player-identity
  // disc (docs/ui.md → Player identity = a colored disc). First used by
  // connections' mistakes; reusable for any limited-attempts counter.
  SquareX as IconStrikeUsed,
  SquareDashed as IconStrikeOpen,
} from 'lucide-react'
