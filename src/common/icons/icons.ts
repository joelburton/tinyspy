// cs-blessed-icons

/**
 * Semantic icon registry — the ONE place that maps an action to its Lucide
 * glyph, so "hint = lightbulb" lives here instead of being re-decided at every
 * call site. Components import the semantic name (`<IconHint />`), never Lucide
 * directly; change a glyph here and every game's button follows.
 *
 * This file IS the map — no doc repeats it. docs/ui.md → "Button iconography"
 * holds the icon language around it (why Lucide at all, how the game menu
 * teaches each glyph, which glyphs are self-evident enough to need no menu row),
 * and the folder's doc.md holds the rules a name and a comment here follow.
 *
 * Names are PascalCase because they render as JSX (`<IconHint />`) — a lowercase
 * alias would be parsed as a DOM tag, not a component. They're the same Lucide
 * components, so they take the same props (`size`, `aria-hidden`, …).
 *
 * The exports are grouped by what a glyph is FOR — a move the player makes, the
 * app handing something over, a mark that is no control at all, the shell around
 * the board — and a family sits together inside its group (the octagons, the
 * eyes, the arrows). That's because a glyph is chosen against its NEIGHBORS: the
 * argument in each comment is only checkable if the glyphs it argues with are in
 * view. The three ✕ aliases are the one chain that crosses a group boundary,
 * since a verdict and a dismissal genuinely belong to different groups.
 */
import { createElement, type ComponentType } from 'react'
import { ChevronLeft, type LucideProps } from 'lucide-react'

/**
 * What a glyph from this registry IS — the type a surface uses to say "hand me
 * an icon from the registry".
 *
 * Lucide's own `LucideIcon` looks like the answer and is the wrong one: it
 * describes a forwardRef component lucide built, and `IconBack` is a component
 * of ours. A surface typed against lucide's shape silently stops accepting half
 * this file the day any other glyph needs a default of its own.
 */
export type AppIcon = ComponentType<LucideProps>

export {
  // ── Game actions: what a player does on a board ────────────────────────────

  // submit a game move/guess/clue — an UP-pointing triangle: it "sends" the move
  // up to the other players (boards put YOU at the bottom, others above), and
  // keeps the RIGHT-pointing play triangle free for the play/resume idiom. Only
  // for sending a move — not the setup dialog or other form submits.
  Triangle as IconSubmit,
  // clear the current selection
  Eraser as IconClear,
  // delete the last typed character (the backspace key glyph)
  Delete as IconDelete,
  // take back the LAST MOVE, leaving the rest of the game standing
  // (letterboxed's "Undo" — pop the last word off the chain). The curved
  // back-arrow is the universal undo idiom, and it reads as one step where
  // IconRestart's rewind-to-start reads as all of them.
  Undo2 as IconUndo,
  // swap/exchange tiles for new ones — the two-way horizontal arrows are the
  // near-universal "exchange" idiom (`act-exchange`, labeled "Swap"). Distinct
  // from IconShuffle's single rotate glyph (reorder my OWN tiles, no server
  // trade).
  ArrowLeftRight as IconExchange,
  // reshuffle my own tiles for a fresh look
  RotateCw as IconShuffle,
  // bananagrams' "Peel" — draw a fresh round of tiles (or, when the bunch is
  // dry, go out and win). The banana glyph is on-the-nose for the Bananagrams
  // lineage (bananagrams) and reads as its own distinct action, not a
  // generic submit. Local to `act-peel` — no other game peels.
  Banana as IconPeel,
  // share your in-progress move with coop teammates (scrabble's "show a move" —
  // broadcasts your staged tiles for the team to preview read-only). The share
  // node-graph glyph is the near-universal "send this to others" idiom.
  Share as IconShare,
  // zoom the view to fit / frame everything (bananagrams' "Center + fit"). The
  // four-corners fullscreen glyph is the near-universal "fit to view" idiom.
  Fullscreen as IconZoomFit,
  // end the current turn without making (another) move — a stop-sign octagon.
  // It stops just your turn and hands play on, so it wears amber rather than
  // red. Worn by both `act-end-turn` and `act-pass`.
  Octagon as IconEndTurn,
  // STOP PLAYING — worn by `act-end-game` and `act-concede` alike, since a game
  // offers one or the other and never both at once (a race that can also stop
  // the whole table asks about it inside Concede's question).
  //
  // The white flag, which reads as "I'm out" at a glance. Not a crossed-out
  // octagon: that beside `IconEndTurn`'s plain octagon — both on screen in
  // scrabble — is a difference nobody can see at 24px.
  Flag as IconConcede,
  // restart THIS board from scratch — `act-restart`, in every game's menu. The
  // skip-back "jump to the start" transport glyph: it rewinds to the beginning
  // of the same board, distinct from IconShuffle's rotate (rearrange, new look).
  SkipBack as IconRestart,
  // start a FRESH follow-up game, same setup but a new board + id —
  // `act-new-game`, in every game's menu. The square-plus "create new" glyph:
  // adds a NEW thing, distinct from IconRestart's rewind-the-same-thing.
  SquarePlus as IconNewGame,

  // ── Help: the app handing the player something ─────────────────────────────

  // get a hint (a clue toward the answer)
  Lightbulb as IconHint,
  // use an AI-powered helper (e.g. codenamesduet's Claude clue suggester). The
  // sparkles glyph is the near-universal "AI / magic" idiom — kept DISTINCT from
  // IconHint's lightbulb so "ask the AI" reads differently from "give me a hint".
  Sparkles as IconAI,
  // The three eyes, and the differences between them are load-bearing:
  //
  //   IconSpoiler (bare Eye)  — mid-game "just tell me THIS one": one item,
  //     while the game is live. Worn by `act-spoiler`.
  //   IconRevealSolution (boxed View) — post-game "show me the whole solution".
  //     The box is the magnitude signal: same eye, but framed, so it reads as
  //     MORE without needing a caption (and still reads as more in grayscale).
  //   IconHideSolution (EyeOff) — the SAME button as IconRevealSolution, showing
  //     its other face. The reveal is a local, reversible view (docs/ui.md →
  //     Terminal results), so the control that opened the solution is the one
  //     that puts it away, and the struck-through eye is the universal "stop
  //     showing me this". Deliberately NOT boxed: the box says "this is the
  //     whole solution", which is the thing you're leaving.
  //
  // Keep them adjacent here — the set only works if all three stay in the eye
  // family. A spoiler is NOT IconHint's lightbulb: a hint points AT the answer,
  // a spoiler hands it over.
  Eye as IconSpoiler,
  View as IconRevealSolution,
  EyeOff as IconHideSolution,
  // check my own work against the rules — bananagrams' "Check words". NOT an
  // eye: it reveals nothing, it marks what's already on screen as failing a
  // rule the player could have applied themselves. The spell-check glyph (a
  // tick over text) is the near-universal idiom for exactly that.
  SpellCheck as IconWordCheck,

  // ── Marks: a verdict or a count, not a control ─────────────────────────────

  // The <StrikeMarks> meter (a status row, not a button): a bounded "N of M used"
  // counter filling left-to-right — a USED mark is a red square-X, an OPEN slot a
  // dashed square. Squares (not circles) so they never read as the player-identity
  // disc (docs/ui.md → Player identity = a colored disc). First used by
  // connections' mistakes; reusable for any limited-attempts counter.
  SquareX as IconStrikeUsed,
  SquareDashed as IconStrikeOpen,
  // Word-outcome marks: a turn-log row's verdict, as a GLYPH. First used by
  // strands' turn log, and deliberately named for the OUTCOME rather than for
  // that game ("the best find" / "a find" / "accepted" / "rejected"), so any
  // word game's log can reuse the same four.
  //
  // They exist because color alone can't carry this everywhere it needs to go:
  // the log is printed to PDF in three shades of gray (docs/pdf.md), where a
  // purple word and a gold word are the same ink. A glyph survives that, and it
  // gives the row a fixed left column so the words still line up.
  //
  // The ladder is deliberate — trophy > star > check — so the three ACCEPTED
  // marks read as ranked at a glance rather than merely different.
  Trophy as IconBestFind, // the spangram: the one word that names the theme
  Star as IconThemeFind, // an ordinary theme word
  Check as IconWordOk, // a valid word that isn't part of the puzzle
  X as IconWordNo, // rejected — too short, unknown, or already counted
  // remove THIS ITEM from a list, in place (letterboxed's × on the chain's
  // last word). Same lucide glyph as IconWordNo, aliased separately because
  // the purpose is different — one marks a verdict, the other is an action.
  // As an SVG it is centered by its own box; the × TEXT glyph is not.
  X as IconRemove,

  // ── The shell: page chrome, and the club page's own controls ───────────────

  // DISMISS this floating panel — the titlebar ✕. The third alias of the same
  // lucide glyph as the two marks just above, for the same reason those two are
  // separate: one marks a verdict, one removes an item, this one closes a
  // surface.
  //
  // Deliberately not a TEXT `×`: a close mark that isn't in this registry
  // drifts (there is more than one × character, and they don't look alike).
  // The note above applies here too: as an SVG it is centered by its own box,
  // where the text character is not.
  X as IconClose,
  // (Go up one level — IconBack — belongs in this spot, between the ✕ and the
  //  menu chevron. It is defined below the block, with its argument, because it
  //  is the one glyph here that is not a bare re-export.)

  // The little "this opens a menu" chevron beside a page-header logo. It is an
  // AFFORDANCE MARK rather than an icon in the button sense — nothing labels it
  // and nothing acts on it alone — but it belongs here anyway: a glyph kept
  // out of the registry, inlined as raw <svg> in a layout component, is a glyph
  // that drifts. Same family as IconBack: a chevron points, and this one points
  // at the list that is about to appear.
  ChevronDown as IconMenuChevron,
  // "This row opens a submenu", at a menu row's right edge. DOUBLE chevrons
  // rather than one: a single one is small enough to read as the SHORTCUT,
  // which sits in that same right-edge slot on every other row — and the back
  // actions put a literal `<` there. Two marks of the same shape say "more,
  // this way" in a way no single character does.
  ChevronsRight as IconSubmenu,
  // open the rules/help — the "?" on the setup dialog and on every Help row.
  // The circled question mark is the near-universal "help / what is this?" idiom.
  CircleQuestionMark as IconHelp,
  // Club chat. The menu's legend and the header have to show the SAME bubble —
  // a legend that teaches a different glyph than the header draws is worse than
  // no legend — which is why the bubble comes from here.
  MessageCircle as IconChat,
  // The shared notes panel. `FilePenLine` (a page, a ruled line, a pen) over
  // `NotepadText` (a spiral pad): the pen is the part that says "you WRITE
  // here", which is what separates a scratchpad from any other document.
  FilePenLine as IconScratchpad,
  // Print to PDF. The one ACTION here with no button — print is menu-only — but
  // the menu's legend earns it anyway: a printer is instantly scannable in a
  // list of words, and if a print button ever appears it has already been
  // taught. (docs/ui.md → Button iconography.)
  Printer as IconPrint,
  // DESTROY a thing, as opposed to dismissing one. `Trash2` is the lidded can
  // with the lines; `Trash` is the plain one. Deliberately NOT a ✕ — an ✕ means
  // "close this", which would make an irreversible act look like a dismiss.
  Trash2 as IconTrash,
  // The mobile page switch (InfoSwitchButton, in the GamePage header). The two
  // faces of ONE button: the info sheet slides in from the right, and Lucide's
  // right-hand pane opening / closing draws exactly that, which is what a bare
  // chevron couldn't say — which surface, and which way.
  PanelRightOpen as IconInfoSheetOpen, // show the info sheet
  PanelRightClose as IconInfoSheetClose, // back to the board
  // NB: pause is NOT here — lucide's Pause is two outlined rounded rects, not
  // the familiar solid two-bars mark, so PauseButton draws its own glyph.

  // ── The one glyph that means nothing ──────────────────────────────────────

  // The placeholder for a button that has no glyph of its own — a Cancel, whose
  // rule is "never a glyph". It exists so EVERY button has an icon and `show`
  // can be honest: a call site asking for `show="both"` gets two things rather
  // than silently getting one. A button that means to draw nothing passes
  // `show="label"` and never reaches this. If you find yourself wanting it
  // drawn, the button wants a real glyph and this file is where to choose one.
  Square as IconGeneric,
} from 'lucide-react'

/**
 * Go UP ONE LEVEL — game → club today, and the same idea wherever it lands
 * next. Named for the direction rather than a destination, unlike every other
 * glyph here, and that's deliberate on two counts.
 *
 * Made thicker so it's easier to read.
 */
export const IconBack = (props: LucideProps) =>
  createElement(ChevronLeft, { strokeWidth: 2.75, ...props })
