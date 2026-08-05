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
  // The two eyes, and the difference between them is load-bearing:
  //
  //   IconSpoiler (bare Eye)  — mid-game "just tell me THIS one": stackdown's
  //     next word, psychicnum's answer word. One item, while the game is live.
  //   IconReveal (boxed View) — post-game "show me the whole solution". The box
  //     is the magnitude signal: same eye, but framed, so it reads as MORE
  //     without needing a caption (and still reads as more in greyscale).
  //
  // Keep them adjacent here — the pair only works if both stay in the eye
  // family. A spoiler is NOT IconHint's lightbulb: a hint points AT the answer,
  // a spoiler hands it over.
  Eye as IconSpoiler,
  View as IconReveal,
  // check my own work against the rules — bananagrams' "Check words". NOT an
  // eye: it reveals nothing, it marks what's already on screen as failing a
  // rule the player could have applied themselves. The spell-check glyph (a
  // tick over text) is the near-universal idiom for exactly that.
  SpellCheck as IconWordCheck,
  // End the GAME: an octagon with an X — the stop sign, crossed out. It sits
  // next to IconEndTurn's plain octagon (Pass / end just your turn) on purpose:
  // one family, "stop", with the X marking the bigger stop. Both are visible at
  // once in scrabble (Pass in the board controls, End in the info column), so
  // they also differ by tone — Pass is amber, End is destructive red.
  //
  // It was the flag until 2026-08-03, which it now shares with nothing:
  // Concede kept the flag (below), and two red flag buttons in the same row
  // read as the same act.
  OctagonX as IconEnd,
  // Concede — drop out of a race while it continues without you. The white
  // flag: surrender, one player, not a stop for the table. Distinct from
  // IconEnd since bananagrams shows BOTH in one row.
  Flag as IconConcede,
  // submit a game move/guess/clue — an UP-pointing triangle: it "sends" the move
  // up to the other players (boards put YOU at the bottom, others above), and
  // keeps the RIGHT-pointing play triangle free for the play/resume idiom. Only
  // for sending a move — not the setup dialog or other form submits.
  Triangle as IconSubmit,
  // end the current turn without making (another) move — a stop-sign octagon.
  // The plain half of the octagon pair (see IconEnd above): this stops just your
  // turn and hands play on, so it carries no X and wears amber rather than red.
  // codenamesduet's "Pass" is the first user.
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
  // restart THIS board from scratch (waffle's replay-board). The skip-back
  // "jump to the start" transport glyph: it rewinds to the beginning of the
  // same board, distinct from IconShuffle's rotate (rearrange, new look).
  SkipBack as IconRestart,
  // take back the LAST MOVE, leaving the rest of the game standing
  // (letterboxed's "Undo" — pop the last word off the chain). The curved
  // back-arrow is the universal undo idiom, and it reads as one step where
  // IconRestart's rewind-to-start reads as all of them.
  Undo2 as IconUndo,
  // start a FRESH follow-up game (same setup, new board + id — waffle's
  // "New game"). The square-plus "create new" glyph: adds a NEW thing,
  // distinct from IconRestart's rewind-the-same-thing.
  SquarePlus as IconNewGame,
  // open the game's rules/help — the "?" the setup dialog's HelpButton shows.
  // The circled question mark is the near-universal "help / what is this?" idiom.
  CircleQuestionMark as IconHelp,
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
  // ── Word-outcome marks: a turn-log row's verdict, as a GLYPH ──────────────
  // First used by strands' turn log, and deliberately named for the OUTCOME
  // rather than for that game ("the best find" / "a find" / "accepted" /
  // "rejected"), so any word game's log can reuse the same four.
  //
  // They exist because colour alone can't carry this everywhere it needs to go:
  // the log is printed to PDF in three shades of grey (docs/pdf.md), where a
  // purple word and a gold word are the same ink. A glyph survives that, and it
  // gives the row a fixed left column so the words still line up.
  //
  // The ladder is deliberate — trophy > star > check — so the three ACCEPTED
  // marks read as ranked at a glance rather than merely different.
  Trophy as IconBestFind, // the spangram: the one word that names the theme
  Star as IconThemeFind, // an ordinary theme word
  Check as IconWordOk, // a valid word that isn't part of the puzzle
  X as IconWordNo, // rejected — too short, unknown, or already counted
  // The mobile page switch (GamePage header). A right-hand panel opening /
  // closing IS the gesture — the info column slides in from the right — so the
  // pair says what a bare chevron couldn't: which panel, and which way.
  PanelRightOpen as IconInfoPanelOpen, // show the info page
  PanelRightClose as IconInfoPanelClose, // back to the board
} from 'lucide-react'
