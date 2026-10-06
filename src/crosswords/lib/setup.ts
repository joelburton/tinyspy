// cs-unmet

import type { GSetup } from '../types'

/**
 * Default setup: no timer, and NO SOURCE — a club that has never played names
 * none, so the form's button row draws none of the four as chosen and its
 * `validate` blocks Start until a picker answers.
 *
 * A club that HAS played arrives with its saved default over this, which
 * carries the source it used. `create_game` strips `puzzle_id` and `date` from
 * what it saves (an instance, not a preference), so a club that last played
 * from the library comes back naming `library` with no puzzle in hand: the
 * source button is chosen, the caption still says "choose one", and Start is
 * still blocked.
 */
export const CROSSWORDS_DEFAULTS: GSetup = {
  timer: { kind: 'none' },
  // Monday — the easiest NYT day, and the natural place for a club that has
  // never picked to start. Seeds the NYT picker if they go there; overwritten
  // by the club's saved default the moment they have one.
  weekday: 1,
}

/** The Guardian series the setup form offers, slug → display label + a one-line
 *  hint at its character (shown under the picker). This is the FE's PICKER list;
 *  the edge function's own `SERIES` allowlist is the authority on what may be
 *  imported. **Prize and Weekend are deliberately omitted here** — they withhold
 *  their answers until a reveal date, so a same-day start would fail
 *  ("answers aren't published yet") — but the edge function still accepts them,
 *  so they're a one-line re-add when we want them.
 *
 *  Two families: **Quick and Speedy** are plain-definition puzzles (no
 *  wordplay); everything else is a **cryptic** (each clue is wordplay + a
 *  definition), ordered here roughly gentlest-cryptic-first. */
export const GUARDIAN_SERIES: { slug: string; label: string; hint: string }[] = [
  { slug: 'quick', label: 'Quick', hint: 'Straight definitions, no wordplay.' },
  { slug: 'speedy', label: 'Speedy', hint: 'A bigger definitions-only puzzle (Sunday quick).' },
  {
    slug: 'quick-cryptic',
    label: 'Quick cryptic',
    hint: 'An easier cryptic in everyday vocabulary.',
  },
  { slug: 'quiptic', label: 'Quiptic', hint: 'A gentle cryptic “for beginners or those in a hurry”.' },
  { slug: 'everyman', label: 'Everyman', hint: 'A fair, accessible cryptic (the Observer’s).' },
  { slug: 'cryptic', label: 'Cryptic', hint: 'The full daily cryptic: wordplay + definition. Hardest.' },
]
