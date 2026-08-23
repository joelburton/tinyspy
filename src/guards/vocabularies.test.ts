// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a converted surface writes VOCABULARY values, not literals.
 *
 * The sprint applies its vocabularies area by area, not in one sweep
 * (plans/css-system-2.md §13 → "How a value gets converted"): a raw value
 * equal to a vocabulary value is changed silently, one that isn't gets
 * looked at once, in context. Which means a guard that fails on every
 * unconverted file would be red for weeks, and a guard that only warns is
 * one nobody reads.
 *
 * So this is a **SHRINKING ALLOWLIST**, the mechanism §10 specifies:
 *
 *   - a file NOT YET CONVERTED sits in the vocabulary's `pending` list and
 *     is silent;
 *   - a CONVERTED file that regresses FAILS;
 *   - a NEW file fails immediately, because it isn't on the list — which is
 *     the property that makes this worth having on day one, before a single
 *     surface converts.
 *
 * Delete a path from `pending` when its area is converted. When a list
 * empties, delete the list — and the day every list is empty, this file has
 * done its job.
 *
 * ⚠️ TUNED SURFACES ARE EXEMPT, and that is the DEFAULT scope, not the rule.
 * A game's board fits its own game; that is what tuned means (docs/naming.md
 * → tuned / justified / locked), so a vocabulary checks `src/common/` unless
 * it says otherwise.
 *
 * `z-index` says otherwise, and is the shape of the exception: a board's
 * radius is a game's decision, but a board's rank against the chat panel is a
 * whole-app decision that merely happens to be WRITTEN in a game's file. Being
 * tuned buys a game freedom over its own surface — never over where that
 * surface sits in the page's stacking order.
 */

const SRC = join(process.cwd(), 'src')
const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

function walk(dir: string, exts: string[] = ['.css']): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** `//` to end of line, but not the one inside `https://`. TS only — CSS has
 *  no line comments, and a stray `//` there would eat a real declaration. */
const stripLineComments = (s: string) => s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/**
 * One vocabulary's rule.
 *
 * `allowed` is what a converted file may still write literally — values that
 * are not a scale at all. A radius of `0` is a square corner and `50%` is a
 * circle; neither is "a small amount of rounding" and neither wants a token.
 */
type Vocabulary = {
  name: string
  /**
   * The properties this governs — a LIST, because a vocabulary is named for
   * what it measures and not for the property that consumes it. Spacer feeds
   * `gap` and `margin` both, and splitting it into two entries would mean two
   * copies of one `fix` string, drifting apart the first time either is
   * edited. It is also where a property REJOINS later: padding is parked
   * rather than excluded, and rejoining is then one word, not a new entry.
   *
   * Longhands are named individually. `margin-bottom` is as much a margin as
   * `margin` is, and a guard that only knew the shorthand would be a guard
   * with a hole exactly where a converted file is most likely to write one.
   */
  properties: string[]
  /**
   * Pull the governed values OUT of a value that carries more than one
   * decision — `border: 1px solid var(--x)` and `transition: opacity 120ms
   * ease` are the two that matter, and both are how the app actually writes
   * a width and a duration. Without this, an entry keyed on the longhand
   * would match almost nothing and read as coverage while catching nothing,
   * which is worse than having no entry at all.
   *
   * Every match is judged against `allowed`; a value with no match is clean,
   * which is what makes `border: 0` and `transition: none` come out right
   * without naming them.
   */
  extract?: RegExp
  /** Literal values that stay literal. */
  allowed: RegExp
  /** Where to look, under `src/`. Defaults to `common` — tuned surfaces are
   *  exempt. Widen it only for a value a game does not get to decide. */
  root?: string
  /** Files not yet converted. Delete a line when its area is done. */
  pending: string[]
  /** What to tell someone who trips it. */
  fix: string
}

const VOCABULARIES: Vocabulary[] = [
  {
    name: 'border-radius',
    properties: ['border-radius'],
    // `0` a square corner · `50%` a circle · `999px` a pill — shapes, not steps.
    // (The pill gets a name when badges are settled in the homepage area; until then it
    // is spelled out here rather than pretended into the scale.)
    // `inherit` and friends aren't values at all — they defer to somewhere else,
    // which is the opposite of writing a literal.
    allowed: /^(0|50%|999px|inherit|initial|unset|revert)$/,
    pending: [
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/game/FilterSelect.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/lists/TurnLog.module.css',
      'src/common/components/panels/GameScratchpad.module.css',
    ],
    fix:
      'Use `--radius-sm` / `-md` / `-lg`, chosen by what the thing IS — a card ' +
      'takes lg, a panel md, a chip sm (docs/deferred.md). A value that is not ' +
      'one of them is a question for Joel, not a rounding.',
  },
  {
    /**
     * The vocabulary we did not have to invent, and the only entry here with
     * no tokens behind it: CSS already ships one, `100` … `900`. Those are the
     * numbers the property takes, so a token would do nothing but rename them.
     *
     * What the sprint gets is the RULE — a font-weight is a multiple of 100 —
     * and a weight that isn't is a bug. `650` renders as `700` in most
     * families anyway, so what it really records is a moment of tuning
     * against one typeface at one size.
     *
     * `root: '.'` because this is not a per-game decision. A game's board is
     * tuned to that game; how many distinct weights of text the app owns is a
     * question about the app, and being tuned buys no freedom over it.
     */
    name: 'font-weight',
    properties: ['font-weight'],
    // The keywords defer to somewhere else rather than choosing a value,
    // which is the opposite of writing a literal.
    allowed: /^([1-9]00|normal|bold|lighter|bolder|inherit|initial|unset|revert)$/,
    root: '.',
    pending: [
      // letterboxed's two `650`s — the whole cost of the rule, and they are
      // fixed by the `letterboxed` area's audit, not swept now.
      'src/letterboxed/components/Board.module.css',
      'src/letterboxed/components/PlayArea.module.css',
    ],
    fix:
      'A font-weight is a multiple of 100 — that is the scale CSS itself ' +
      'defines, and we add nothing to it. A value between two steps is tuned ' +
      'to one typeface at one size and usually renders as its neighbor anyway.',
  },
  {
    name: 'spacer',
    // Gap and margin, in every spelling each has. PADDING IS DELIBERATELY
    // ABSENT — plans/css-system-2.md §6.6: whether the room inside a box
    // belongs on the same ramp as the space between boxes is undecided, and
    // today's paddings are often a tuple fitted to one box (`.item-row`'s
    // says so in list.css). Parked, not excluded; it rejoins this list.
    properties: [
      'gap',
      'row-gap',
      'column-gap',
      'margin',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'margin-block',
      'margin-inline',
    ],
    // `0` is no space at all and `auto` is the centering trick — neither is a
    // small-or-large question, so neither wants a step. The negative margins
    // that pull a child out past its parent's padding are NOT here: that is a
    // real distance and it takes a token with a minus in front of it.
    allowed: /^(0|auto|inherit|initial|unset|revert)$/,
    pending: [
      // Every file in `common/` that still writes a literal gap or margin.
      // This is the sprint's own to-do list seen from the guard's side: an
      // area converts its files and deletes its lines, and the day the list
      // empties the vocabulary is fully in force.
      'src/common/base.css',
      'src/common/components/account/ColorChoiceList.module.css',
      'src/common/components/account/EditProfileDialog.module.css',
      'src/common/components/auth/ClaimHandleScreen.module.css',
      'src/common/components/branding/PuzpuzpuzWordmark.module.css',
      'src/common/components/buttons/SubmitWithScore.module.css',
      'src/common/components/chat/ChatBody.module.css',
      'src/common/components/chrome/PageHeader.module.css',
      'src/common/components/club/ClubGameCard.module.css',
      'src/common/components/club/ClubPage.module.css',
      'src/common/components/club/CreateClubPage.module.css',
      'src/common/components/club/EditClubDialog.module.css',
      'src/common/components/club/StartGameButtons.module.css',
      'src/common/components/definitions/AnagramDialog.module.css',
      'src/common/components/definitions/DefinitionView.module.css',
      'src/common/components/definitions/WordEditDialog.module.css',
      'src/common/components/definitions/WordLookupDialog.module.css',
      'src/common/components/feedback/FaultDialog.module.css',
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/fields/CoopStyleField.module.css',
      'src/common/components/fields/NextPuzzleField.module.css',
      'src/common/components/fields/SelectField.module.css',
      'src/common/components/fields/setupForm.module.css',
      'src/common/components/fields/TimerField.module.css',
      'src/common/components/game/CelebrationDialog.module.css',
      'src/common/components/game/DeviceBlockNotice.module.css',
      'src/common/components/game/entry/EntryBox.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/entry/MoveRow.module.css',
      'src/common/components/game/FilterSelect.module.css',
      'src/common/components/game/foundWordsPlayArea.module.css',
      'src/common/components/game/GamePage.module.css',
      'src/common/components/game/HelpPanel.module.css',
      'src/common/components/game/infoPanel.module.css',
      'src/common/components/game/lists/ActorMention.module.css',
      'src/common/components/game/lists/historyViewer.module.css',
      'src/common/components/game/lists/TurnLog.module.css',
      'src/common/components/game/lists/WordList.module.css',
      'src/common/components/game/OpponentStrip.module.css',
      'src/common/components/game/PauseOverlay.module.css',
      'src/common/components/game/PlayArea.module.css',
      'src/common/components/game/PlayersStrip.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/game/Stats.module.css',
      'src/common/components/game/StrikeMarks.module.css',
      'src/common/components/home/HomePage.module.css', // its gap converted; the 0.45em is F7, still open
      'src/common/components/palette/PalettePage.module.css',
      'src/common/components/panels/FloatingPanel.module.css',
      'src/common/components/panels/GameScratchpad.module.css',
      'src/common/components/panels/Menu.module.css',
      'src/common/components/panels/modalActions.module.css',
      'src/common/components/panels/TriggerWithChevron.module.css',
      'src/common/components/setup/SetupGameDialog.module.css',
      'src/common/components/text/RichMessage.module.css',
      'src/common/components/toasts/Toast.module.css',
      'src/common/components/toasts/ToastHost.module.css',
      'src/common/patterns/button.css',
      'src/common/patterns/heading.css',
      'src/common/patterns/list.css',
      'src/common/utilities.css',
    ],
    fix:
      'Use `--spacer-1` … `-5` (1.5 · 1 · 0.75 · 0.5 · 0.25rem), remembering ' +
      'that -1 is the BIGGEST. A value that is not on the ramp is a decision, ' +
      'not a rounding: add a level, fit it to one, or keep it bespoke with the ' +
      'reason written in the file — never silently because it was already there.',
  },
  {
    name: 'font-size',
    properties: ['font-size'],
    // A percentage or an `em` is a size RELATIVE to something — it tracks a
    // parent deliberately, which a rem token cannot express and should not
    // replace. The ramp is for absolute sizes.
    allowed: /^(\d*\.?\d+(em|%)|inherit|initial|unset|revert)$/,
    pending: [
      'src/common/base.css',
      'src/common/components/account/EditProfileDialog.module.css',
      'src/common/components/auth/ClaimHandleScreen.module.css',
      'src/common/components/buttons/ShuffleButton.module.css',
      'src/common/components/chat/ChatBody.module.css',
      'src/common/components/chat/ChatBubble.module.css',
      'src/common/components/club/clubFilters.module.css',
      'src/common/components/club/ClubGameCard.module.css',
      'src/common/components/club/CreateClubPage.module.css',
      'src/common/components/club/EditClubDialog.module.css',
      'src/common/components/club/StartGameButtons.module.css',
      'src/common/components/definitions/AnagramDialog.module.css',
      'src/common/components/definitions/DefinitionView.module.css',
      'src/common/components/definitions/WordEditDialog.module.css',
      'src/common/components/definitions/WordLookupDialog.module.css',
      'src/common/components/feedback/FaultDialog.module.css',
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/fields/SelectField.module.css',
      'src/common/components/game/CelebrationDialog.module.css',
      'src/common/components/game/DeviceBlockNotice.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/FilterSelect.module.css',
      'src/common/components/game/infoPanel.module.css',
      'src/common/components/game/InfoSwitchButton.module.css',
      'src/common/components/game/lists/historyViewer.module.css',
      'src/common/components/game/lists/TurnLog.module.css',
      'src/common/components/game/lists/WordList.module.css',
      'src/common/components/game/MobileStatusBar.module.css',
      'src/common/components/game/OpponentStrip.module.css',
      'src/common/components/game/PauseOverlay.module.css',
      'src/common/components/game/PlayArea.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/game/Stats.module.css',
      'src/common/components/palette/PalettePage.module.css',
      'src/common/components/panels/FloatingPanel.module.css',
      'src/common/components/panels/GameScratchpad.module.css',
      'src/common/components/panels/Menu.module.css',
      'src/common/components/setup/SetupGameDialog.module.css',
      'src/common/components/toasts/Toast.module.css',
      'src/common/components/tooltips/TooltipHost.module.css',
      'src/common/patterns/badge.css',
      'src/common/patterns/button.css',
      'src/common/patterns/segmented.css',
      'src/common/utilities.css',
    ],
    fix:
      'Use `--font-size-1` … `-3` (1 · 0.85 · 0.75rem), -1 being the biggest. ' +
      'Headings are not on this ramp — their sizes are decided by h1–h4 in ' +
      'base.css, which is where a heading size belongs.',
  },
  {
    name: 'line-height',
    properties: ['line-height'],
    allowed: /^(normal|inherit|initial|unset|revert)$/,
    pending: [
      'src/common/components/buttons/ShuffleButton.module.css',
      'src/common/components/chat/ChatBody.module.css',
      'src/common/components/chat/ChatBubble.module.css',
      'src/common/components/club/ClubGameCard.module.css',
      'src/common/components/club/CreateClubPage.module.css',
      'src/common/components/club/EditClubDialog.module.css',
      'src/common/components/club/StartGameButtons.module.css',
      'src/common/components/definitions/DefinitionView.module.css',
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/fields/NextPuzzleField.module.css',
      'src/common/components/game/CelebrationDialog.module.css',
      'src/common/components/game/DeviceBlockNotice.module.css',
      'src/common/components/game/InfoSwitchButton.module.css',
      'src/common/components/game/lists/historyViewer.module.css',
      'src/common/components/game/PlayArea.module.css',
      'src/common/components/game/Stats.module.css',
      'src/common/components/palette/PalettePage.module.css',
      'src/common/components/panels/FloatingPanel.module.css',
      'src/common/components/panels/GameScratchpad.module.css',
      'src/common/components/panels/Menu.module.css',
      'src/common/components/toasts/Toast.module.css',
      'src/common/components/tooltips/TooltipHost.module.css',
      'src/common/patterns/badge.css',
    ],
    fix:
      'Use `--line-height-1` … `-3` (1.5 · 1.25 · 1): prose, a tighter block, ' +
      'and a single line that should occupy exactly its own height.',
  },
  {
    name: 'opacity',
    properties: ['opacity'],
    // 0 and 1 are not steps on a ramp — they are "gone" and "here", which is
    // a different question from how faint something should be.
    allowed: /^(0|1|inherit|initial|unset|revert)$/,
    pending: [
      'src/common/components/buttons/ShuffleButton.module.css',
      'src/common/components/club/StartGameButtons.module.css',
      'src/common/components/definitions/AnagramDialog.module.css',
      'src/common/components/definitions/WordEditDialog.module.css',
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/fields/SelectField.module.css',
      'src/common/components/fields/TimerField.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/FilterSelect.module.css',
      'src/common/components/game/OpponentStrip.module.css',
      'src/common/components/panels/Menu.module.css',
    ],
    fix:
      'Use `--opacity-1` / `-2` — or say why this one is a ROLE rather than a ' +
      'step, the way `--chrome-disabled-opacity` is. Those two numbers are a ' +
      'holding position and expected to become role names, so a value that ' +
      'does not fit is evidence, not a nuisance.',
  },
  {
    name: 'letter-spacing',
    properties: ['letter-spacing'],
    allowed: /^(normal|inherit|initial|unset|revert)$/,
    pending: [
      'src/common/components/club/EditClubDialog.module.css',
      'src/common/components/definitions/DefinitionView.module.css',
      'src/common/components/game/entry/EntryBox.module.css',
      'src/common/components/game/lists/WordList.module.css',
      'src/common/components/game/OpponentStrip.module.css',
      'src/common/components/game/PlayArea.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/game/Stats.module.css',
      'src/common/components/palette/PalettePage.module.css',
      'src/common/components/setup/SetupGameDialog.module.css',
    ],
    fix:
      'Use `--letter-spacing-label` (a small uppercase label) or `-wide` ' +
      '(letters presented as objects rather than as a word). Prose takes ' +
      'neither — it takes `normal`.',
  },
  {
    /**
     * Written as the `transition:` shorthand almost everywhere, so this
     * entry EXTRACTS the time from it. An entry that only knew
     * `transition-duration` would have matched nothing in this repo.
     *
     * Animations are deliberately out of scope: `--mark-attention-flash-
     * duration` and the game-surface flashes and shakes are tuned, and they
     * keep their own names.
     */
    name: 'transition-duration',
    properties: ['transition', 'transition-duration'],
    extract: /\d*\.?\d+m?s\b/g,
    allowed: /^0m?s$/,
    pending: [
      'src/common/components/buttons/ShuffleButton.module.css',
      'src/common/components/chat/ChatBubble.module.css',
      'src/common/components/club/ClubGameCard.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/InfoSheet.module.css',
      'src/common/components/game/InfoSwitchButton.module.css',
      'src/common/components/game/PlayArea.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/panels/Menu.module.css',
      'src/common/components/panels/ScratchpadBubble.module.css',
      'src/common/patterns/list.css',
      'src/common/patterns/segmented.css',
    ],
    fix:
      'Use `--transition-duration-paint` (a color settling), `-nudge` (a piece ' +
      'answering the pointer by moving a little) or `-travel` (something ' +
      'arriving, leaving or growing). Pick by what KIND of change it is; the ' +
      'number is downstream of that.',
  },
  {
    /**
     * Same shape, and the same reason: a width is nearly always written
     * inside `border: 1px solid …`. `border-radius` is not swept up by the
     * `border` alternative — the regex requires a `:` immediately after the
     * property name, so `border-radius:` simply does not match.
     */
    name: 'border-width',
    properties: [
      'border',
      'border-top',
      'border-right',
      'border-bottom',
      'border-left',
      'border-width',
      'border-top-width',
      'border-right-width',
      'border-bottom-width',
      'border-left-width',
      'border-block',
      'border-inline',
    ],
    extract: /\d*\.?\d+(?:px|rem|em)\b/g,
    allowed: /^0(px|rem|em)?$/,
    pending: [
      'src/common/base.css',
      'src/common/components/account/ColorChoiceList.module.css',
      'src/common/components/buttons/ShuffleButton.module.css',
      'src/common/components/chat/ChatBody.module.css',
      'src/common/components/chrome/PageHeader.module.css',
      'src/common/components/club/clubFilters.module.css',
      'src/common/components/club/ClubGameCard.module.css',
      'src/common/components/club/EditClubDialog.module.css',
      'src/common/components/definitions/AnagramDialog.module.css',
      'src/common/components/definitions/DefinitionPopover.module.css',
      'src/common/components/definitions/WordEditDialog.module.css',
      'src/common/components/definitions/WordLookupDialog.module.css',
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/fields/SelectField.module.css',
      'src/common/components/fields/setupForm.module.css',
      'src/common/components/game/DeviceBlockNotice.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/FilterSelect.module.css',
      'src/common/components/game/gridCursor.module.css',
      'src/common/components/game/infoPanel.module.css',
      'src/common/components/game/InfoSwitchButton.module.css',
      'src/common/components/game/lists/historyViewer.module.css',
      'src/common/components/game/lists/TurnLog.module.css',
      'src/common/components/game/PauseOverlay.module.css',
      'src/common/components/game/PlayArea.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/game/Stats.module.css',
      'src/common/components/palette/PalettePage.module.css',
      'src/common/components/panels/FloatingPanel.module.css',
      'src/common/components/panels/GameScratchpad.module.css',
      'src/common/components/panels/Menu.module.css',
      'src/common/components/setup/SetupGameDialog.module.css',
      'src/common/components/setup/SetupSection.module.css',
      'src/common/components/text/Dot.module.css',
      'src/common/components/toasts/Toast.module.css',
      'src/common/patterns/badge.css',
      'src/common/patterns/button.css',
      'src/common/patterns/list.css',
      'src/common/patterns/segmented.css',
      'src/common/utilities.css',
    ],
    fix:
      'Use `--border-width-line` (a divider or a field edge), `-line-thick` ' +
      '("this box is a thing") or `-frame` ("something is happening to what ' +
      'is inside"). A game piece\'s own edge is not on this ramp — it has ' +
      '`--tile-edge-width` and `--tile-selected-edge-width`, which are a ' +
      'channel rather than a weight of line.',
  },
  {
    name: 'z-index',
    properties: ['z-index'],
    // 0–10 is LOCAL layering inside a component's own stacking context — a
    // ring over a tile, a shuffle floating on its board, the keyboard cursor.
    // Those compete only with their siblings, so they are not on the ladder
    // and do not want a name. The cut is 10 because the app has a clean gap
    // there: everything local today is ≤ 10 and everything page-level is
    // ≥ 40, which is what makes a number the honest test. If something ever
    // needs 11 locally, that is the conversation, not a quiet edit here.
    allowed: /^([0-9]|10|auto|inherit|initial|unset|revert)$/,
    root: '.',
    pending: [
      // All three are recorded decisions, not oversights — plans/css-system-2.md
      // §7 → Carried forward names the area that owns each.
      'src/bananagrams/components/PlayerBoard.module.css', // drag ghost, 1000 → shared-game-chrome
      'src/scrabble/components/BoardCol.module.css', //       drag ghost, 100  → shared-game-chrome
      'src/scrabble/components/BlankPicker.module.css', //     overlay, 50     → the scrabble area
    ],
    fix:
      'Page-level layers read a token from base.css → THE Z- LAYERS, which is ' +
      'the ladder being migrated to (`--z-workspace`, `--z-modal-normal`, …); ' +
      'the `--z-index-*` block above it is the one being retired, a rung at a ' +
      'time, as each component\'s area is audited. A tier on neither is a ' +
      'question for Joel: inventing a number between two named ones is how a ' +
      'menu ends up behind a backdrop.',
  },
]

describe('a converted surface writes vocabulary values, not literals', () => {
  for (const v of VOCABULARIES) {
    it(`${v.name}: every converted file uses the vocabulary`, () => {
      const pending = new Set(v.pending)
      const offenders: string[] = []
      const cleanPending = new Set(v.pending)

      for (const f of walk(join(SRC, v.root ?? 'common'))) {
        const css = stripComments(readFileSync(f, 'utf8'))
        const literals: string[] = []
        // Boundary is `{`, `;` or a line start — NOT `^` alone. Anchoring on
        // the line start misses `.x { border-radius: 4px }` written on one
        // line, which this codebase does write (crosswords' ClueLists), and a
        // guard with a hole in it is worse than knowing you have none. Found
        // by planting, which is the only reason it isn't still there.
        const decl = new RegExp(
          `(?:^|[{;])\\s*(?:${v.properties.join('|')})\\s*:\\s*([^;}]+)`,
          'gm',
        )
        for (const m of css.matchAll(decl)) {
          const value = m[1].trim()
          let parts: string[]
          if (v.extract) {
            // An extracting vocabulary judges only the parts it can name, so
            // the `var()` skip below would be wrong here: the whole point is
            // that `border: 1px solid var(--edge-color)` has a literal width
            // sitting next to a perfectly good token.
            parts = value.match(v.extract) ?? []
            if (!parts.length) continue
          } else {
            // CONTAINS, not starts-with: `calc(var(--z-index-popover) + 1)` is a
            // derivation off the ladder, which is the point of naming the tier.
            if (value.includes('var(')) continue
            // A calc() has spaces INSIDE it, so it is judged whole; everything
            // else is judged part by part, because a shorthand is several
            // decisions written on one line and `margin: 0 auto` is two values
            // that each carry no decision at all.
            parts = value.includes('calc(') ? [value] : value.split(/\s+/)
          }
          if (parts.every((p) => v.allowed.test(p))) continue
          literals.push(value)
        }
        if (!literals.length) continue
        if (pending.has(rel(f))) {
          cleanPending.delete(rel(f))
          continue
        }
        offenders.push(`${rel(f)}  →  ${literals.join(', ')}`)
      }

      expect(
        offenders,
        `${v.name}: a literal value on a CONVERTED surface (or in a new file, ` +
          `which is the same thing — it isn't on the pending list).\n${v.fix}\n\n` +
          offenders.join('\n'),
      ).toEqual([])

      // The list SHRINKS. A path that no longer offends must leave it, or the
      // allowlist quietly stops meaning anything.
      expect(
        [...cleanPending],
        `${v.name}: these paths are on the pending list but no longer write a ` +
          `literal — delete them from it:\n${[...cleanPending].join('\n')}`,
      ).toEqual([])
    })
  }
})

/**
 * The z-index ladder's other half.
 *
 * `<FloatingPanel>` takes its tier as a prop, so the order could be restated
 * in TypeScript — and a second copy of a stacking order is exactly the copy
 * that drifts, because nothing makes the two disagree loudly. The prop is
 * typed `string` so a call site passes `var(--z-index-chatPanel)`; this is
 * what stops someone typing the number back in.
 *
 * A COMPUTED z-index stays legal — stackdown stacks its tile pile with
 * `zIndex: t.z`, which is per-tile data inside a board's own context and has
 * no business being a token.
 */
describe('the z-index ladder has one home', () => {
  it('no numeric z-index is written in TypeScript', () => {
    const offenders: string[] = []
    for (const f of walk(join(SRC, '.'), ['.ts', '.tsx'])) {
      if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue
      const src = stripLineComments(stripComments(readFileSync(f, 'utf8')))
      // `zIndex: 500` (a style object) and `zIndex={500}` (a JSX prop).
      for (const m of src.matchAll(/zIndex\s*(?::\s*|=\{)(\d+)/g)) {
        offenders.push(`${rel(f)}  →  zIndex ${m[1]}`)
      }
    }
    expect(
      offenders,
      'A z-index literal in TypeScript. The ladder lives in base.css; pass ' +
        'the token instead — zIndex="var(--z-index-chatPanel)".\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
