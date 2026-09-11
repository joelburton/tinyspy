// cs-audited-actions

/**
 * The keys an action can be pressed with, and the one function that decides
 * whether a keystroke is one of them.
 *
 * Reach for this when you are giving an action a key: write the key as a
 * `Chord` (one discrete keystroke) or a `KeyPattern` (a whole class of keys,
 * "any letter"), put it in the action's registry entry, and the dispatcher does
 * the rest. Nothing else in the app should be comparing `e.key` by hand.
 *
 * A key is a small object rather than a string because a string cannot say the
 * two things that actually matter here: which half of the event to compare
 * against (`e.key`, the character produced, or `e.code`, the physical key), and
 * what each modifier must be doing. Both bite in practice — on macOS Option
 * changes the character, so `⌥=` arrives as `≠` and `⌥\`` as `Dead` — and a
 * chord that names the physical key instead says so in one field.
 */

/** One discrete keystroke: a key, plus what the modifiers must be doing. */
export type Chord = {
  // Match the CHARACTER produced (`e.key`) — '+', '<', 'Enter', 'Backspace',
  // ' '. The everyday case. Exactly one of `key` / `code` is given.
  key?: string
  // Match the PHYSICAL key (`e.code`) — 'KeyZ', 'Equal', 'Backquote'. For every
  // chord that holds Option, because Option changes the character the key
  // produces and the physical key is the only stable thing left.
  code?: string
  // ⌥ must be HELD. Absent means it must be UP: an unmodified binding never
  // fires with Option down, so ⌥⌫ cannot also trip a bare Backspace.
  alt?: boolean
  // ⌃ must be held; absent means up. Nothing binds one today — Ctrl is the
  // browser's on Windows and Linux, so a Ctrl chord would work here and fail
  // for a friend on a PC. The field exists so the machine can express one, not
  // as an invitation.
  ctrl?: boolean
  // ⇧ must be held, or — when false — must be up. REQUIRED on a chord that
  // names a `code` or a named key (Enter, Space, ⌫, Tab, an arrow), because
  // there ⇧ is a modifier that makes a different chord: `⌥+` is Shift-Equal and
  // `⌥=` is not, and `⇧⌫` is a different command from `⌫`. Two chords that
  // should both fire an action are two entries in its `keys`, never one entry
  // that shrugs.
  //
  // Left out on a chord written as a CHARACTER, where ⇧ is already spent
  // producing the character and asking about it again says nothing.
  shift?: boolean
  // What a tooltip, a menu row and the help list SHOW — '⌥Z', '<', '+'.
  // Written here rather than derived, so the app spells a key one way.
  //
  // A chord written as a CHARACTER is labeled with that character and no `⇧`,
  // because shift is how the character is made: `+`, `<`, `~`, `#`. `⇧` is
  // written only where it does not change what the key produces — `⇧⌫`, `⇧↵`,
  // `⇧Space`, `⇧` + an arrow — which is exactly where the chord checks it.
  label: string
}

/** A whole class of keys, for the actions that answer to many: typing a letter
 *  into an entry, walking a board cursor, the any-key behaviors. The pressed
 *  key is handed to the action's `run`, so it knows which one it got. */
export type KeyPattern = {
  // `letter` = one ASCII letter, either case. `digit` = 0–9. `arrow` = the four
  // arrow keys. `any` = anything at all, for the two behaviors that answer to
  // every key (dismissing feedback, leaving the history viewer).
  pattern: 'letter' | 'digit' | 'arrow' | 'any'
  // ⇧ must be held, or must be up — same rule as a chord's, and the arrows are
  // why it is here: crosswords walks the cursor with an arrow and jumps to the
  // word edge with ⇧ and the same arrow. Left out for a letter, where ⇧ is what
  // makes the capital.
  shift?: boolean
  // What the help list shows — 'A–Z', '↑ ↓ ← →', 'any key'.
  label: string
}

export type KeySpec = Chord | KeyPattern

/** Narrow a spec to the pattern arm. A function rather than an inline
 *  `'pattern' in spec` so the discriminant is named in one place. */
export function isPattern(spec: KeySpec): spec is KeyPattern {
  return (spec as KeyPattern).pattern !== undefined
}

/** Does this key answer to ANYTHING? The two behaviors that do are the ones
 *  that aren't about a particular key at all — dismissing the last message, and
 *  leaving the history viewer — and the dispatcher sorts them by it. */
export function isWildcard(spec: KeySpec): boolean {
  return isPattern(spec) && spec.pattern === 'any'
}

/** The four arrow keys, as `e.key` spells them. */
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

/**
 * Does this keystroke press this key?
 *
 * **Cmd is never ours** — reload, new tab, the address bar — so a keystroke
 * holding it matches nothing, chord and pattern alike. A pattern additionally
 * matches only an unmodified key: Option-L is not a letter someone is typing.
 *
 * **⇧ is matched when the key says so and ignored when it doesn't**, which is
 * the whole of the rule: a chord on a physical key or a named key states it,
 * because there ⇧ makes a different chord; a chord written as a character
 * leaves it out, because ⇧ was already spent producing the character.
 */
export function matches(spec: KeySpec, e: KeyboardEvent): boolean {
  if (e.metaKey) return false
  if (spec.shift !== undefined && e.shiftKey !== spec.shift) return false

  if (isPattern(spec)) {
    if (e.altKey || e.ctrlKey) return false
    switch (spec.pattern) {
      case 'letter':
        return e.key.length === 1 && /^[a-z]$/i.test(e.key)
      case 'digit':
        return e.key.length === 1 && /^[0-9]$/.test(e.key)
      case 'arrow':
        return ARROWS.includes(e.key)
      case 'any':
        return true
    }
  }

  if (e.altKey !== (spec.alt ?? false)) return false
  if (e.ctrlKey !== (spec.ctrl ?? false)) return false
  return spec.code !== undefined ? e.code === spec.code : e.key === spec.key
}
