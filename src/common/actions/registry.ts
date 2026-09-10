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

/** Concede's question. Written here rather than beside its three siblings in
 *  `useConfirmation.tsx` because concede still asks through `window.confirm`,
 *  which takes a sentence and not an options object; it joins them when the
 *  games convert. */
const CONCEDE_CONFIRM: ConfirmOptions = {
  title: 'Concede the game?',
  message: 'You drop out and the others keep playing.',
  confirmLabel: 'Concede',
  cancelLabel: 'Keep playing',
}
import {
  IconAI,
  IconBack,
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
  IconWordCheck,
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
  // Every key that fires it, FIRST ONE SHOWN. Two entries are two genuinely
  // different keys (Enter and Space both peel); one entry marked
  // `shiftAgnostic` covers a key whose character depends on the layout.
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

/** ⌥ plus a physical key. Every Option chord matches on `code`, because Option
 *  changes the character: ⌥Z is `Ω`, ⌥= is `≠`, ⌥` is a dead key. */
const alt = (code: string, label: string): KeySpec => ({ code, alt: true, shiftAgnostic: true, label })

/** A chord written as the character it produces. Shift-agnostic, always: which
 *  physical keys make a `+` is a keyboard-layout fact. */
const char = (key: string, label = key): KeySpec => ({ key, shiftAgnostic: true, label })

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
    keys: [alt('Backquote', '⌥~')],
    inField: 'game-inputs',
  },
  'act-help': { label: 'Help', icon: IconHelp },

  // ─── Leaving where you are ─────────────────────────────────────────────
  'act-back-to-home': { label: 'Back to home', icon: IconBack, keys: [char('<', '⇧<')] },
  'act-back-to-club': { label: 'Back to club', icon: IconBack, keys: [char('<', '⇧<')] },

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
    keys: [alt('Equal', '⌥+')],
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
    keys: [{ key: 'Enter', label: '↵' }, { key: ' ', label: 'Space' }],
  },
  'act-submit': { label: 'Submit', icon: IconSubmit, keys: [{ key: 'Enter', label: '↵' }] },
  'act-reveal': { label: 'Reveal', icon: IconRevealSolution },
  'act-hint': { label: 'Hint', icon: IconHint },
  'act-exchange': { label: 'Exchange', icon: IconExchange },
  'act-pass': { label: 'Pass', icon: IconEndTurn },
  'act-end-turn': { label: 'End turn', icon: IconEndTurn },
  'act-spoiler': { label: 'Spoiler', icon: IconSpoiler },
  'act-share-preview': { label: 'Share preview', icon: IconShare },
  'act-suggest-move': { label: 'Suggest a move', icon: IconAI },
  'act-print-board': { label: 'Print board (PDF)', icon: IconPrint },

  // ─── Crosswords' commands ──────────────────────────────────────────────
  'act-pencil': { label: 'Pencil', keys: [alt('KeyP', '⌥P')] },
  'act-check-letter': { label: 'Letter', icon: IconWordCheck, keys: [{ code: 'KeyC', alt: true, label: '⌥C' }] },
  'act-check-word': { label: 'Word', icon: IconWordCheck, keys: [{ code: 'KeyC', alt: true, shift: true, label: '⌥⇧C' }] },
  'act-check-puzzle': { label: 'Puzzle', icon: IconWordCheck },
  'act-reveal-letter': { label: 'Letter', icon: IconRevealSolution, keys: [{ code: 'KeyR', alt: true, label: '⌥R' }] },
  'act-reveal-word': { label: 'Word', icon: IconRevealSolution, keys: [{ code: 'KeyR', alt: true, shift: true, label: '⌥⇧R' }] },
  'act-reveal-puzzle': { label: 'Puzzle', icon: IconRevealSolution },
  'act-show-note': { label: 'Show note', keys: [alt('KeyN', '⌥N')] },
  'act-explain-clue': { label: 'Explain cryptic clue', icon: IconAI, keys: [alt('KeyX', '⌥X')] },
  'act-open-scratchpad': { label: 'Scratchpad', icon: IconScratchpad, keys: [alt('KeyS', '⌥S')] },
  'act-rebus': { label: 'Enter rebus', keys: [{ key: 'Enter', shift: true, label: '⇧↵' }] },
  'act-collapse-rebuses': { label: 'Collapse rebuses' },
  'act-download-ipuz': { label: 'Download as .ipuz' },
  'act-print-solution': { label: 'Print answer key (PDF)', icon: IconPrint },

  // ─── Typing into an entry ──────────────────────────────────────────────
  'act-type-letter': { label: 'Type a letter', keys: [{ pattern: 'letter', label: 'A–Z' }], repeat: true },
  'act-delete-last': { label: 'Delete the last letter', keys: [{ key: 'Backspace', label: '⌫' }], repeat: true },
  'act-submit-entry': { label: 'Submit', keys: [{ key: 'Enter', label: '↵' }] },
  'act-recall-last': { label: 'Recall your last entry', keys: [{ key: 'ArrowUp', label: '↑' }] },
  'act-clear-entry': { label: 'Clear the entry', keys: [{ key: 'ArrowDown', label: '↓' }] },

  // ─── Working a board directly ──────────────────────────────────────────
  'act-move-cursor': { label: 'Move the cursor', keys: [{ pattern: 'arrow', label: '↑ ↓ ← →' }], repeat: true },
  'act-place-tile': { label: 'Place a tile', keys: [{ pattern: 'letter', label: 'A–Z' }], repeat: true },
  'act-remove-tile': { label: 'Take the tile back', keys: [{ key: 'Backspace', label: '⌫' }], repeat: true },
  'act-pick-tile': { label: 'Play that tile', keys: [{ pattern: 'letter', label: 'A–Z' }] },
  'act-extend-trace': { label: 'Extend the trace', keys: [{ pattern: 'letter', label: 'A–Z' }] },
  'act-toggle-card': { label: 'Choose that card', keys: [{ pattern: 'letter', label: 'A–U' }] },
  'act-drop-last-cell': { label: 'Drop the last tile', keys: [{ key: 'Backspace', label: '⌫' }] },
  'act-clear-selection': { label: 'Clear the selection', keys: [{ key: 'Backspace', label: '⌫' }] },

  // ─── Crosswords' grid ──────────────────────────────────────────────────
  'act-fill-cell': { label: 'Fill the cell', keys: [{ pattern: 'letter', label: 'A–Z' }], repeat: true },
  'act-clear-cell': { label: 'Clear the cell', keys: [{ key: 'Backspace', label: '⌫' }], repeat: true },
  'act-clear-word': { label: 'Clear the word', keys: [{ key: 'Backspace', shift: true, label: '⇧⌫' }] },
  'act-advance-cell': { label: 'Move on one cell', keys: [{ key: ' ', label: 'Space' }], repeat: true },
  'act-peek-cell': { label: 'Peek at the cell', keys: [{ key: ' ', shift: true, label: '⇧Space' }] },
  'act-jump-word-edge': { label: 'Jump to the word edge', keys: [{ pattern: 'arrow', label: '⇧ + arrow' }] },
  'act-next-clue': { label: 'Next clue', keys: [{ key: 'Tab', label: '⇥' }], inField: 'always' },
  'act-previous-clue': { label: 'Previous clue', keys: [{ key: 'Tab', shift: true, label: '⇧⇥' }], inField: 'always' },
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
