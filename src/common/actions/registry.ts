// cs-unmet

import type { AppIcon } from '../icons/icons'
import type { ButtonTone } from '../buttons/StandardButton'
import type { ConfirmOptions } from '../floating-panels/useConfirmation'
import type { KeySpec } from './chord'
import {
  END_GAME_CONFIRM,
  NEW_GAME_CONFIRM,
  RESTART_CONFIRM,
} from '../floating-panels/useConfirmation'

import {
  IconAI,
  IconBack,
  IconDelete,
  IconChat,
  IconConcede,
  IconEndGame,
  IconEndTurn,
  IconExchange,
  IconHelp,
  IconHint,
  IconNewGame,
  IconPeel,
  IconPrint,
  IconRestart,
  IconRevealSolution,
  IconScratchpad,
  IconShare,
  IconShuffle,
  IconSpoiler,
  IconSubmit,
  IconClear,
  IconWordCheck,
  IconZoomFit,
} from '../icons/icons'

/**
 * EVERY COMMAND IN THE APP, and the half of it that never varies: what it is
 * called, its glyph, its keys, its tone, whether it asks before it acts.
 *
 * This is the table to read when you want to know what a command IS. What it
 * DOES is the other half, supplied by whichever page or component offers it —
 * see `useBoundAction`, which joins the two. Nothing here is a function and
 * nothing here knows about a game: New game means the same thing, wears the
 * same glyph and answers to the same key in all sixteen of them.
 *
 * **Adding an action is adding a row here.** The id is `act-<what-it-does>`,
 * and the binding that gives it a body is named `actWhatItDoes`, so both are
 * greppable and a guard holds the two spellings together
 * (`src/guards/actionIds.test.ts`). One meaning per row: if a game wants
 * "Check letter" where another says "Check", those are two rows, not one row
 * with an override.
 */
export type ActionSpec = {
  // What the action is CALLED. A binding may say something else for a moment
  // ("Submit · 24") through its `describe`; this is what it is called the rest
  // of the time, and what the key list shows.
  label: string
  // The glyph, from `common/icons/icons.ts` — never lucide-react directly, so
  // one registry keeps a glyph meaning one thing.
  icon?: AppIcon
  // The button tone. Destructive for the two acts that cannot be undone;
  // everything else takes StandardButton's `normal`.
  tone?: ButtonTone
  // Every key that fires it, FIRST ONE SHOWN. Two keys that should both fire it
  // are two entries — Enter and Space both peel, and `⌥+` and `⌥=` would be two
  // if we ever wanted both.
  keys?: KeySpec[]
  // The question asked before the action runs, by the shared run rather than by
  // the game — so a game cannot forget to ask. Skipped at terminal, where
  // there is nothing left to interrupt. A bespoke question that only one game
  // asks stays inside that game's callback instead.
  confirm?: ConfirmOptions
  // May a HELD key fire it over and over? False for every command — holding
  // `+` would otherwise start games at the OS repeat rate — and true for the
  // entry keys, where repeating is the point.
  repeat?: boolean
  // May it fire while a text field has focus?
  //   'never'       — the default. A focused field owns its keys.
  //   'game-inputs' — from a game's own input (a clue field, marked
  //                   `data-game-input`) but not from chat or a form. The
  //                   shell's `/ ? ~` work this way, so you can reach chat
  //                   mid-clue.
  //   'always'      — even in a field. Crosswords' Tab, and nothing else.
  inField?: 'never' | 'game-inputs' | 'always'
  // Does firing it STOP the keystroke? True for everything real. False is for
  // a behavior that watches keys go past without claiming them — dismissing
  // feedback, which must not also swallow the letter that dismissed it.
  consumes?: boolean
}

/** Concede's question. Written here rather than beside its three siblings in
 *  `useConfirmation.tsx`, which is where the shape came from — it asked through
 *  `window.confirm` until the last game that hand-rolled a concede converted. */
const CONCEDE_CONFIRM: ConfirmOptions = {
  title: 'Concede the game?',
  message: 'You drop out and the others keep playing.',
  confirmLabel: 'Concede',
  cancelLabel: 'Keep playing',
}

/** ⌥ plus a physical key, ⇧ UP. Every Option chord matches on `code`, because
 *  Option changes the character: ⌥Z is `Ω`, ⌥= is `≠`, ⌥` is a dead key. */
const alt = (code: string, label: string): KeySpec => ({ code, alt: true, shift: false, label })

/** ⌥⇧ plus a physical key — a different chord from the same key without ⇧, and
 *  named for the character ⇧ makes: `⌥+` is Option-Shift-Equal. */
const altShift = (code: string, label: string): KeySpec => ({ code, alt: true, shift: true, label })

/** A chord written as the character it produces, which is all it takes: ⇧ was
 *  already spent making the character, so nothing here asks about it. */
const char = (key: string, label = key): KeySpec => ({ key, label })

/** A named key — Enter, Space, ⌫, Tab, an arrow. ⇧ is stated because it makes a
 *  different chord here: `⇧⌫` clears the word where `⌫` clears the cell. */
const named = (key: string, label: string, shift = false): KeySpec => ({ key, shift, label })

export const ACTIONS = {
  // ─── The shell, on every page ──────────────────────────────────────────
  'act-open-chat': {
    label: 'Open chat',
    icon: IconChat,
    keys: [char('/')],
    inField: 'game-inputs',
  },
  'act-open-menu': {
    label: 'Menu',
    keys: [char('?')],
    inField: 'game-inputs',
  },
  'act-lookup-word': {
    label: 'Look up a word',
    keys: [char('~')],
    inField: 'game-inputs',
  },
  'act-anagram-finder': {
    label: 'Anagram finder',
    // Option-SHIFT-Backquote: the chord is `⌥~`, and `⌥\`` is a different one
    // that nothing binds.
    keys: [altShift('Backquote', '⌥~')],
    inField: 'game-inputs',
  },
  'act-help': { label: 'Help', icon: IconHelp },
  // Two marks in the game header. Neither has a key today; both are commands a
  // player invokes, so they are actions — which is what makes giving one a key
  // later a one-line change in this table rather than a new listener.
  'act-pause': { label: 'Pause game' },
  'act-toggle-info-sheet': { label: 'Game info' },

  // ─── Leaving where you are ─────────────────────────────────────────────
  // Shown as `<`, not `⇧<`: a chord written as a character names the character,
  // and shift is how you make one. `⇧` is written only where it does NOT change
  // what the key produces — `⇧⌫` beside `⌫`.
  'act-back-to-home': { label: 'Back to home', icon: IconBack, keys: [char('<')] },
  'act-back-to-club': { label: 'Back to club', icon: IconBack, keys: [char('<')] },

  // ─── The club and account rows ─────────────────────────────────────────
  'act-edit-club': { label: 'Edit club' },
  'act-rename-club': { label: 'Rename club' },
  'act-edit-profile': { label: 'Profile' },
  'act-add-word': { label: 'Add word' },
  'act-log-out': { label: 'Log out' },

  // ─── Starting, restarting and stopping a game ──────────────────────────
  'act-new-game': {
    label: 'New game',
    icon: IconNewGame,
    keys: [char('+')],
    confirm: NEW_GAME_CONFIRM,
  },
  'act-new-game-from-setup': {
    label: 'New game from setup',
    icon: IconNewGame,
    // Option-SHIFT-Equal: the chord is `⌥+`, the shifted twin of the plain `+`
    // that starts a game with this one's setup. `⌥=` is a different chord.
    keys: [altShift('Equal', '⌥+')],
    confirm: NEW_GAME_CONFIRM,
  },
  'act-restart': {
    label: 'Restart',
    icon: IconRestart,
    confirm: RESTART_CONFIRM,
  },
  'act-end-game': {
    label: 'End game',
    icon: IconEndGame,
    tone: 'destructive',
    keys: [alt('Backspace', '⌥⌫')],
    confirm: END_GAME_CONFIRM,
  },
  'act-concede': {
    label: 'Concede game',
    icon: IconConcede,
    tone: 'destructive',
    keys: [alt('Backspace', '⌥⌫')],
    confirm: CONCEDE_CONFIRM,
  },

  // ─── What a game offers over its board ─────────────────────────────────
  'act-shuffle': { label: 'Shuffle', icon: IconShuffle, keys: [alt('KeyZ', '⌥Z')] },
  'act-rotate': { label: 'Rotate', icon: IconShuffle, keys: [alt('KeyZ', '⌥Z')] },
  'act-peel': {
    label: 'Peel',
    icon: IconPeel,
    // Two genuinely different keys, so two entries.
    keys: [named('Enter', '↵'), named(' ', 'Space')],
  },
  'act-submit': { label: 'Submit', icon: IconSubmit, keys: [named('Enter', '↵')] },
  // Red, like the boxed eye it wears: this uncovers MORE THAN ONE WORD — a
  // whole grid, a partner's key, three secrets. Its quieter sibling is the
  // spoiler: amber, bare eye, one item, mid-game.
  'act-reveal': { label: 'Reveal', icon: IconRevealSolution, tone: 'destructive' },
  'act-hint': { label: 'Hint', icon: IconHint, tone: 'caution' },
  'act-exchange': { label: 'Exchange', icon: IconExchange },
  'act-pass': { label: 'Pass', icon: IconEndTurn, tone: 'caution' },
  'act-end-turn': { label: 'End turn', icon: IconEndTurn },
  'act-spoiler': { label: 'Spoiler', icon: IconSpoiler, tone: 'caution' },
  'act-share-preview': { label: 'Share preview', icon: IconShare },
  // scrabble's Recall: take every STAGED tile back to the rack at once. Distinct
  // from `act-remove-tile`, which takes back the last one — hence its own id
  // rather than a second meaning for ⌫, which the board cursor already owns
  // here. Keyless: it has always been a button.
  'act-recall-tiles': { label: 'Recall', icon: IconClear },
  'act-suggest-move': { label: 'Suggest a move', icon: IconAI, tone: 'caution' },
  // codenamesduet's clue-giver asks Claude for a clue. Its own id rather than
  // `act-suggest-move`'s: what it hands back is a WORD and a number for the
  // partner to read, not a play to stage, and the two games' buttons sit in
  // different rows saying different things.
  'act-suggest-clue': { label: 'Suggest a clue', icon: IconAI, tone: 'caution' },
  'act-print-board': { label: 'Print board (PDF)', icon: IconPrint },

  // ─── Crosswords' commands ──────────────────────────────────────────────
  'act-pencil': { label: 'Pencil', keys: [alt('KeyP', '⌥P')] },
  'act-check-letter': { label: 'Letter', icon: IconWordCheck, keys: [alt('KeyC', '⌥C')] },
  'act-check-word': { label: 'Word', icon: IconWordCheck, keys: [altShift('KeyC', '⌥⇧C')] },
  'act-check-puzzle': { label: 'Puzzle', icon: IconWordCheck },
  'act-reveal-letter': { label: 'Letter', icon: IconRevealSolution, tone: 'destructive', keys: [alt('KeyR', '⌥R')] },
  'act-reveal-word': { label: 'Word', icon: IconRevealSolution, tone: 'destructive', keys: [altShift('KeyR', '⌥⇧R')] },
  'act-reveal-puzzle': { label: 'Puzzle', icon: IconRevealSolution, tone: 'destructive' },
  'act-show-note': { label: 'Show note', keys: [alt('KeyN', '⌥N')] },
  'act-explain-clue': { label: 'Explain cryptic clue', icon: IconAI, tone: 'caution', keys: [alt('KeyX', '⌥X')] },
  'act-open-scratchpad': { label: 'Scratchpad', icon: IconScratchpad, keys: [alt('KeyS', '⌥S')] },
  // ⇧Enter, deliberately: a bare Enter is a no-op in crosswords, because
  // solvers hit it reflexively at a word's end.
  'act-rebus': { label: 'Enter rebus', keys: [named('Enter', '⇧↵', true)] },
  'act-collapse-rebuses': { label: 'Collapse rebuses' },
  'act-download-ipuz': { label: 'Download as .ipuz' },
  'act-print-solution': { label: 'Print answer key (PDF)', icon: IconPrint },

  // ─── Typing into an entry ──────────────────────────────────────────────
  'act-type-letter': { label: 'Type a letter', keys: [{ pattern: 'letter', label: 'A–Z' }], repeat: true },
  'act-delete-last': { label: 'Delete the last letter', icon: IconDelete, keys: [named('Backspace', '⌫')], repeat: true },
  'act-submit-entry': { label: 'Submit', icon: IconSubmit, keys: [named('Enter', '↵')] },
  'act-recall-last': { label: 'Recall your last entry', keys: [named('ArrowUp', '↑')] },
  'act-clear-entry': { label: 'Clear the entry', keys: [named('ArrowDown', '↓')] },

  // ─── Working a board directly ──────────────────────────────────────────
  'act-move-cursor': { label: 'Move the cursor', keys: [{ pattern: 'arrow', shift: false, label: '↑ ↓ ← →' }], repeat: true },
  'act-place-tile': { label: 'Place a tile', keys: [{ pattern: 'letter', label: 'A–Z' }], repeat: true },
  'act-remove-tile': { label: 'Take the tile back', icon: IconDelete, keys: [named('Backspace', '⌫')], repeat: true },
  'act-pick-tile': { label: 'Play that tile', keys: [{ pattern: 'letter', label: 'A–Z' }] },
  'act-extend-trace': { label: 'Extend the trace', keys: [{ pattern: 'letter', label: 'A–Z' }] },
  'act-toggle-card': { label: 'Choose that card', keys: [{ pattern: 'letter', label: 'A–U' }] },
  'act-drop-last-cell': { label: 'Drop the last tile', icon: IconDelete, keys: [named('Backspace', '⌫')] },
  'act-clear-selection': { label: 'Clear the selection', icon: IconDelete, keys: [named('Backspace', '⌫')] },
  // bananagrams asks the server whether the board reads as words RIGHT NOW —
  // always offered, whatever the game's word-check setting says, because that
  // setting governs when the server ENFORCES words rather than whether you may
  // ask about your own board.
  'act-check-board': { label: 'Check words', icon: IconWordCheck },
  // A view control rather than a move: re-center the board and fit it to the
  // viewport. No key yet.
  'act-zoom-fit': { label: 'Fit the board', icon: IconZoomFit },

  // ─── Crosswords' grid ──────────────────────────────────────────────────
  'act-fill-cell': { label: 'Fill the cell', keys: [{ pattern: 'letter', label: 'A–Z' }], repeat: true },
  'act-clear-cell': { label: 'Clear the cell', keys: [named('Backspace', '⌫')], repeat: true },
  'act-clear-word': { label: 'Clear the word', keys: [named('Backspace', '⇧⌫', true)] },
  'act-advance-cell': { label: 'Move on one cell', keys: [named(' ', 'Space')], repeat: true },
  'act-peek-cell': { label: 'Peek at the cell', keys: [named(' ', '⇧Space', true)] },
  'act-jump-word-edge': { label: 'Jump to the word edge', keys: [{ pattern: 'arrow', shift: true, label: '⇧ + arrow' }] },
  'act-next-clue': { label: 'Next clue', keys: [named('Tab', '⇥')], inField: 'always' },
  'act-previous-clue': { label: 'Previous clue', keys: [named('Tab', '⇧⇥', true)], inField: 'always' },
  'act-jump-to-number': { label: 'Jump to a clue number', keys: [char('#')] },
  'act-mark-right-edge': { label: 'Mark the right edge', keys: [char('|')] },
  'act-mark-bottom-edge': { label: 'Mark the bottom edge', keys: [char('_')] },

  // ─── The two behaviors that answer to any key ──────────────────────────
  'act-dismiss-feedback': {
    label: 'Dismiss the message',
    keys: [{ pattern: 'any', label: 'any key' }],
    repeat: true,
    consumes: false,
  },
  'act-exit-viewer': {
    label: 'Back to the live board',
    keys: [{ pattern: 'any', label: 'any key' }],
  },
} as const satisfies Record<`act-${string}`, ActionSpec>

/** Every action's id, as a union — so binding a typo is a compile error rather
 *  than a key that silently never fires. */
export type ActionId = keyof typeof ACTIONS
